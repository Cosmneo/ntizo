import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarCheck, MessageSquareWarning } from "lucide-react";
import { ADMIN_BOOKING_TABS, type AdminBookingTab } from "@ntizo/shared/read-models";
import { Button, cn } from "@ntizo/frontend-ui";
import { CollectionCard, type CollectionRow } from "@/shared/components/collection-card";
import { usePageHeader } from "@/shared/lib/page-header";
import { compactSlotWording } from "@/features/checkout/domain/slot-wording";
import { BookingStatusBadge } from "@/features/provider/bookings/ui/booking-status-badge";
import {
  ADMIN_BOOKINGS_PAGE_SIZE,
  type AdminBookingRowDTO,
} from "../data/admin-booking.repository";
import { lastPageOffset, waitedWording, waitingSince } from "../domain/waiting";
import {
  useAdminBookingActions,
  useAdminBookings,
  type AdminBookingAction,
} from "../viewmodel/use-admin-bookings";

/**
 * The bookings an administrator has to look at, in the three tabs the queue
 * has: ones nobody closed, ones inside the customer's window, and complaints
 * waiting on a decision.
 *
 * `AdminContactPage`'s anatomy — `usePageHeader`, a count of what is waiting,
 * `CollectionCard` and per-row actions — with the provider list's tab row,
 * because these three are tabs rather than filters: `bookingNeedsAttentionForAdmin`
 * answers a different result set per tab, not the same one narrowed.
 *
 * **The tab and the page are both in the URL**, so a refresh keeps your place
 * and a link to "the second page of the disputes" is a link. The page used to
 * be component state while the tab was not, which made a refresh keep half of
 * where you were; the asymmetry bought nothing. Changing tab simply omits the
 * offset, so a new list starts at its own first page with no reset to write.
 *
 * No search box: the field has no search argument to offer, and
 * `CollectionCard`'s search became optional, so none is drawn rather than one
 * that does nothing.
 *
 * **Nothing on this screen is written optimistically, and nothing here
 * announces that an action worked.** All three mutations answer `{ bookingId }`
 * whether they moved the booking or lost the compare-and-swap to the
 * platform's own sweep — which is working through this very queue from the
 * other side, row by row. The refetch is the only witness of who won, so the
 * page waits for it: a row that moved leaves its tab, and a row that lost
 * stays exactly as it was. A cheerful sentence in between would be a claim
 * the wire never made.
 */
export function AdminBookingsPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: AdminBookingTab; offset?: number };
  const tab: AdminBookingTab = search.tab ?? "unclosed";
  const offset = search.offset ?? 0;

  usePageHeader(t("bookingsTitle"), t("bookingsSubtitle"));

  const go = (next: { tab: AdminBookingTab; offset?: number }) =>
    void navigate({
      to: "/admin/bookings",
      // A zero offset is the absence of one: `/admin/bookings?tab=disputed`
      // rather than `…&offset=0`, so the first page of a tab has exactly one
      // address.
      search: { tab: next.tab, offset: next.offset ? next.offset : undefined },
    });

  const query = useAdminBookings({ tab, offset });
  const actions = useAdminBookingActions();

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const nextOffset = query.data?.nextOffset ?? null;

  /**
   * The instant every wait on screen is measured from: the moment the page was
   * answered, not whenever React last re-rendered. All the rows then count from
   * one clock, and a re-render for an unrelated reason cannot age the queue by
   * an hour while nothing about the data changed.
   */
  const now = useMemo(
    () => new Date(query.dataUpdatedAt || Date.now()),
    [query.dataUpdatedAt],
  );

  /**
   * The row whose button was last pressed, held until the queue has been read
   * again.
   *
   * Not cosmetic: the write lands before the refetch replaces the list, so a
   * second press in that gap sends a transition the booking has already made,
   * and the platform refuses it — which would put "não foi possível" on screen
   * about a booking that in fact moved. Every button on the queue is disabled
   * while a write is in flight; this one row stays disabled until the read
   * that follows says what actually happened.
   *
   * **Released by an answer of either kind.** `answeredAt` takes the later of
   * the query's success and failure stamps rather than `dataUpdatedAt` alone:
   * a refusal now invalidates too (`onSettled`, see `useAdminBookingActions`),
   * and if that refetch itself fails there is still an answer — the page draws
   * `bookingsError` with a retry — so the row must not stay locked behind it.
   * Tied to `dataUpdatedAt` only, a refused action left the one control that
   * could repeat it disabled until a reload.
   */
  const answeredAt = Math.max(query.dataUpdatedAt, query.errorUpdatedAt);
  const [actedOn, setActedOn] = useState<string | null>(null);
  const [seenAnswer, setSeenAnswer] = useState(answeredAt);
  if (seenAnswer !== answeredAt) {
    setSeenAnswer(answeredAt);
    setActedOn(null);
  }

  /**
   * A page that emptied under the reader goes back to one that has not.
   *
   * An administrator working this queue empties it, and emptying the page they
   * are standing on is how that normally ends: close the twenty-first booking
   * and page two has nothing on it, while the count above still says twenty
   * need attention. `lastPageOffset` answers with the last offset that can
   * hold a row, so the correction is one hop from anywhere — including a
   * nonsense offset typed into the address bar.
   *
   * In an effect rather than during render, because the correction is a
   * navigation and a render may not have side effects. The frame it replaces
   * is not a lie the page invented: it is exactly what the server answered for
   * that offset.
   */
  useEffect(() => {
    if (!query.data || query.data.items.length > 0 || offset === 0) return;
    const back = lastPageOffset(query.data.total, ADMIN_BOOKINGS_PAGE_SIZE);
    if (back !== offset) go({ tab, offset: back });
    // `go` and `tab` are stable for a given URL; re-running on the answer and
    // the offset is the whole of what this watches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, offset, tab]);

  function act(action: AdminBookingAction) {
    setActedOn(action.bookingId);
    actions.run(action);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {query.isError && (
        <p role="alert" className="type-body text-[var(--color-destructive)]">
          {t("bookingsError")}{" "}
          <button type="button" className="underline" onClick={() => void query.refetch()}>
            {t("bookingsRetry")}
          </button>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={t("bookingsTitle")}
          className="inline-flex rounded-full bg-[var(--color-muted)] p-1"
        >
          {ADMIN_BOOKING_TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => go({ tab: key })}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                tab === key
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
              )}
            >
              {t(`bookingsTab.${key}`)}
            </button>
          ))}
        </div>
        <p className="type-body m-0">{t("bookingsOpenCount", { count: total })}</p>
      </div>

      <CollectionCard
        title={t(`bookingsTab.${tab}`)}
        shown={rows.length}
        total={total}
        loading={query.isLoading}
        columns={[
          { key: "provider", label: t("bookingsCol.provider"), className: "pl-5" },
          { key: "customer", label: t("bookingsCol.customer"), skeletonWidth: "w-24" },
          { key: "service", label: t("bookingsCol.service"), skeletonWidth: "w-36" },
          { key: "when", label: t("bookingsCol.when"), skeletonWidth: "w-32" },
          {
            key: "status",
            label: t("bookingsCol.status"),
            skeletonWidth: "w-28",
            skeletonShape: "badge",
          },
          {
            key: "actions",
            label: t("bookingsCol.actions"),
            align: "right",
            className: "pr-5",
            skeletonWidth: "w-40",
          },
        ]}
        emptyTitle={t(`bookingsEmpty.${tab}.title`)}
        emptyText={t(`bookingsEmpty.${tab}.body`)}
        emptyBadge={CalendarCheck}
        // Never reachable, and passed because the card requires it: this list
        // has no search and no filter — a tab is a different question, not a
        // narrowing of one — so an empty tab is always genuinely empty.
        noMatchesTitle={t(`bookingsEmpty.${tab}.title`)}
        noMatchesText={t(`bookingsEmpty.${tab}.body`)}
        filtered={false}
        /**
         * Cards until a 1024px viewport, not the card's usual 768.
         *
         * Measured inside the real `AdminShell` rather than reasoned about,
         * which is the whole difference: the sidebar takes 16rem from `md`
         * up, so a 768px viewport leaves this card **462px** — and the table
         * this row needs is about 730. At that width every action button and
         * the `ACÇÕES` header sat off the right edge, reachable only by
         * finding a horizontal scrollbar inside the card. Six columns, the
         * last of them buttons, simply do not go into 462px; a stacked card
         * shows all of it. From `lg` the box is 718 and the table fits.
         */
        tableFrom="lg"
        rows={rows.map((b) =>
          queueRow(b, { locale, now, t, act, actedOn, pending: actions.pending, failure: actions.failure }),
        )}
      />

      {/* Shown whenever there is anywhere to go, which is not the same
          question as whether the queue is longer than a page. Tied to
          `total > PAGE_SIZE`, both buttons unmounted the moment the count fell
          to exactly one page while the reader was standing on the second —
          the pager disappearing at precisely the moment it was needed. */}
      {(offset > 0 || nextOffset !== null) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => go({ tab, offset: Math.max(0, offset - ADMIN_BOOKINGS_PAGE_SIZE) })}
          >
            {t("bookingsPrevious")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={nextOffset === null}
            onClick={() => nextOffset !== null && go({ tab, offset: nextOffset })}
          >
            {t("bookingsNext")}
          </Button>
        </div>
      )}
    </div>
  );
}

interface RowContext {
  locale: string;
  now: Date;
  t: ReturnType<typeof useTranslation<"admin">>["t"];
  act: (action: AdminBookingAction) => void;
  actedOn: string | null;
  pending: boolean;
  failure: AdminBookingAction | null;
}

/**
 * One row of the queue: whose workspace, whose booking, what was sold, when it
 * was and how long it has been waiting for somebody here.
 *
 * The workspace is the row's identity rather than the customer's name — an
 * administrator is looking across every workspace on the platform, and "Ana,
 * corte de cabelo" names no one of them — and it is a link to that workspace,
 * because "who is this" is the first question a queue row raises.
 */
function queueRow(b: AdminBookingRowDTO, ctx: RowContext): CollectionRow {
  const { locale, now, t } = ctx;
  const slot = compactSlotWording(b.startsAt, b.endsAt, locale, b.timezone);
  const waited = waitedWording(waitingSince(b), now, locale);
  return {
    key: b.id,
    primary: (
      <Link
        to="/admin/providers/$providerId"
        params={{ providerId: b.providerId }}
        // `pr-4` on the link rather than on the cell: `CollectionCard` gives
        // the primary column `pl-5` and no right padding at all, which is
        // invisible for the avatar-and-name blocks the other lists put there
        // and not for a workspace's full name, which wraps in the table and
        // otherwise ends flush against the customer's.
        className="type-body-medium block pr-4 font-semibold hover:underline"
      >
        {b.providerName}
      </Link>
    ),
    cells: {
      customer: b.customerFirstName,
      /**
       * Truncated hardest exactly where the table is tightest.
       *
       * A service name is the longest free text on the row, and in the one
       * band where the table has least room it was the widest column: 243px
       * of the 718 a 1024 viewport leaves once the admin sidebar has taken
       * its 16rem. Below `lg` the row is a card, where the value has a line
       * of its own and 24ch costs nothing; from `xl` the table's box is 974
       * and can afford it again. Only `lg`–`xl` is squeezed, so only that
       * band pays.
       */
      service: (
        <span className="block max-w-[24ch] truncate lg:max-w-[14ch] xl:max-w-[24ch]">
          {b.serviceName}
        </span>
      ),
      when: (
        <span className="grid gap-0.5">
          <span className="tabular-nums">
            {slot.date} · {slot.start}
          </span>
          {waited && (
            <span className="type-caption text-[var(--color-muted-foreground)]">
              {t("bookingsWaiting", { duration: waited })}
            </span>
          )}
        </span>
      ),
      /**
       * The badge, and under it the way into the complaint.
       *
       * Under the status rather than under the workspace's name, which is
       * where it started: on a phone `CollectionCard` gives the primary block
       * whatever the action buttons leave — about 130px once "Dar razão ao
       * cliente" has taken its width — and a two-line link wrapped under a
       * three-line workspace name was the worst reading on the screen. The
       * status cell is a full-width label/value row there, and the link is
       * about this row's status anyway.
       *
       * Only a disputed row carries a thread, and the read model makes that
       * structural rather than conventional: `threadId` is null on every other
       * status precisely so this link cannot point somewhere wrong.
       */
      status: (
        <span className="inline-grid justify-items-end gap-1 lg:justify-items-start">
          <BookingStatusBadge status={b.status} />
          {b.threadId && (
            <Link
              to="/admin/support/$threadId"
              params={{ threadId: b.threadId }}
              className="type-caption inline-flex items-center gap-1 font-semibold text-[var(--color-primary)] no-underline"
            >
              <MessageSquareWarning className="h-3.5 w-3.5" aria-hidden="true" />
              {t("bookingsOpenDispute")}
            </Link>
          )}
        </span>
      ),
    },
    actions: <RowActions booking={b} ctx={ctx} />,
  };
}

/**
 * What an administrator may do to this row, decided by its status rather than
 * by the tab it was found in.
 *
 * The status is the fact the backend will check: `booking.adminMarkDone`
 * reaches `Booking.markDone`, which only leaves `CONFIRMED`, and
 * `booking.adminComplete` reaches `Booking.complete`, whose only door is
 * `MARKED_DONE`. Offering a button the row's own status cannot honour would be
 * offering a refusal.
 */
function RowActions({ booking, ctx }: { booking: AdminBookingRowDTO; ctx: RowContext }) {
  const { t, act, actedOn, pending, failure } = ctx;
  // Every button on the queue while a write is in flight, and this row's until
  // the read that follows has said what the write actually did.
  const disabled = pending || actedOn === booking.id;

  /**
   * The refusal, on the row it happened to and naming what was refused.
   *
   * A page-level banner said neither. It could not name the row, and because
   * each of the three actions used to carry its own `useMutation`, a refused
   * mark-done went on saying so while a *successful* completion landed on
   * another row — the one kind of false sentence this screen is built to avoid.
   *
   * Two sentences, not one: `bookingsActionFailed` says the booking could not
   * be completed, which is what a refused mark-done or complete is. A refused
   * dispute decision is not that — when it succeeds it may *cancel* the
   * booking rather than complete it — so it says the dispute could not be
   * decided, which is true of either outcome.
   */
  const refused = failure?.bookingId === booking.id ? failure : null;
  const notice = refused && (
    <span role="alert" className="type-caption block max-w-[24ch] text-[var(--color-destructive)]">
      {t(refused.kind === "resolveDispute" ? "bookingsDisputeFailed" : "bookingsActionFailed")}
    </span>
  );

  if (booking.status === "DISPUTED") {
    return (
      <span className="grid justify-items-stretch gap-2 lg:justify-items-end">
        {/* Two long labels, and four widths to keep them honest at — every one
            of the four measured inside the real `AdminShell`, because
            Tailwind's breakpoints are viewport widths and this row's box is
            the viewport minus the sidebar's 16rem.

            Stacked on a phone, where `CollectionCard` gives the actions
            whatever the card's primary block does not need and side by side
            would leave the workspace's name thirty pixels. Side by side once
            the card is wide (`sm`, and still no sidebar). Stacked again from
            `md`, where the sidebar appears and the card's own width drops to
            430. Side by side only from `xl`: at `lg` the row is a table in a
            718px box, and these two stacked bring the table to 727 — abreast
            they added a button's width again and pushed the second one off the
            right edge, which is what a `lg:` switch was doing. */}
        <span className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end md:flex-col md:items-stretch xl:flex-row xl:items-center xl:justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => act({ kind: "resolveDispute", bookingId: booking.id, upheld: true })}
          >
            {t("bookingsDisputeAction.upheld")}
          </Button>
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => act({ kind: "resolveDispute", bookingId: booking.id, upheld: false })}
          >
            {t("bookingsDisputeAction.rejected")}
          </Button>
        </span>
        {notice}
      </span>
    );
  }

  const kind = booking.status === "MARKED_DONE" ? "complete" : "markDone";
  return (
    <span className="grid justify-items-stretch gap-2 lg:justify-items-end">
      <Button size="sm" disabled={disabled} onClick={() => act({ kind, bookingId: booking.id })}>
        {t(kind === "complete" ? "bookingsAction.completeNow" : "bookingsAction.markDone")}
      </Button>
      {notice}
    </span>
  );
}
