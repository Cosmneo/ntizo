import { useMemo, useState } from "react";
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
import { waitedWording, waitingSince } from "../domain/waiting";
import { useAdminBookingActions, useAdminBookings } from "../viewmodel/use-admin-bookings";

/**
 * The bookings an administrator has to look at, in the three tabs the queue
 * has: ones nobody closed, ones inside the customer's window, and complaints
 * waiting on a decision.
 *
 * `AdminContactPage`'s anatomy — `usePageHeader`, a count of what is waiting,
 * `CollectionCard` and per-row actions — with the provider list's tab row,
 * because these three are tabs rather than filters: `bookingNeedsAttentionForAdmin`
 * answers a different result set per tab, not the same one narrowed, and the
 * tab lives in the URL so a refresh keeps it and a link to "the disputes" is a
 * link. No search box: the field has no search argument to offer, and
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
  const search = useSearch({ strict: false }) as { tab?: AdminBookingTab };
  const tab: AdminBookingTab = search.tab ?? "unclosed";

  usePageHeader(t("bookingsTitle"), t("bookingsSubtitle"));

  const [offset, setOffset] = useState(0);
  // A new tab is a new list, and it starts at its own first page. Adjusted
  // during the render that changes tab rather than in an effect: a passive
  // effect runs after the paint, so page three of "Por fechar" would be asked
  // for under "Reclamações" for one frame — and with the app's 30s staleness
  // that frame can be a cached answer rather than a spinner.
  const [appliedTab, setAppliedTab] = useState(tab);
  if (appliedTab !== tab) {
    setAppliedTab(tab);
    setOffset(0);
  }

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
   * The row whose button was last pressed, and the answer that was on screen
   * when it was pressed.
   *
   * A press cannot be repeated until the queue has been read again. Not
   * cosmetic: the write lands before the refetch replaces the list, so a second
   * press in that gap sends a transition the booking has already made, and the
   * platform refuses it — which would put "could not be completed" on screen
   * about a booking that was completed. Every button on the queue is disabled
   * while a write is in flight; this one row stays disabled until the read
   * that follows says what actually happened.
   */
  const [actedOn, setActedOn] = useState<string | null>(null);
  const [answeredAt, setAnsweredAt] = useState(query.dataUpdatedAt);
  if (answeredAt !== query.dataUpdatedAt) {
    setAnsweredAt(query.dataUpdatedAt);
    setActedOn(null);
  }

  const setTab = (next: AdminBookingTab) =>
    void navigate({ to: "/admin/bookings", search: { tab: next } });

  function act(bookingId: string, run: () => void) {
    setActedOn(bookingId);
    run();
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
      {actions.failed && (
        <p role="alert" className="type-body text-[var(--color-destructive)]">
          {t("bookingsActionFailed")}
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
              onClick={() => setTab(key)}
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
        rows={rows.map((b) => queueRow(b, { locale, now, t, actions, act, actedOn }))}
      />

      {total > ADMIN_BOOKINGS_PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - ADMIN_BOOKINGS_PAGE_SIZE))}
          >
            {t("bookingsPrevious")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={nextOffset === null}
            onClick={() => nextOffset !== null && setOffset(nextOffset)}
          >
            {t("bookingsNext")}
          </Button>
        </div>
      )}
    </div>
  );
}

type Actions = ReturnType<typeof useAdminBookingActions>;

interface RowContext {
  locale: string;
  now: Date;
  t: ReturnType<typeof useTranslation<"admin">>["t"];
  actions: Actions;
  act: (bookingId: string, run: () => void) => void;
  actedOn: string | null;
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
  const waited = waitedWording(waitingSince(b), now);
  return {
    key: b.id,
    primary: (
      <Link
        to="/admin/providers/$providerId"
        params={{ providerId: b.providerId }}
        // `pr-4` on the link rather than on the cell: `CollectionCard` gives
        // the primary column `pl-5` and no right padding at all, which is
        // invisible for the avatar-and-name blocks the other lists put there
        // and not for a workspace's full name, which wraps at `md` and
        // otherwise ends flush against the customer's.
        className="type-body-medium block pr-4 font-semibold hover:underline"
      >
        {b.providerName}
      </Link>
    ),
    cells: {
      customer: b.customerFirstName,
      service: <span className="block max-w-[24ch] truncate">{b.serviceName}</span>,
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
        <span className="inline-grid justify-items-end gap-1 md:justify-items-start">
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
  const { t, actions, act, actedOn } = ctx;
  // Every button on the queue while a write is in flight, and this row's until
  // the read that follows has said what the write actually did.
  const disabled = actions.pending || actedOn === booking.id;

  if (booking.status === "DISPUTED") {
    return (
      /* Two long labels, and four widths to keep them honest at. Stacked on a
         phone, where `CollectionCard` gives the actions whatever the card's
         primary block does not need and side by side would leave the
         workspace's name thirty pixels; side by side once the card is wide
         (`sm`); stacked again from `md`, which is where the card becomes a
         table *and* the admin sidebar takes its 16rem — the narrowest the
         table is ever asked to fit — and side by side again from `lg`, where
         it has the room. */
      <span className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end md:flex-col md:items-stretch lg:flex-row lg:items-center lg:justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => act(booking.id, () => actions.resolve.mutate({ bookingId: booking.id, upheld: true }))}
        >
          {t("bookingsDisputeAction.upheld")}
        </Button>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => act(booking.id, () => actions.resolve.mutate({ bookingId: booking.id, upheld: false }))}
        >
          {t("bookingsDisputeAction.rejected")}
        </Button>
      </span>
    );
  }

  if (booking.status === "MARKED_DONE") {
    return (
      <span className="flex justify-end">
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => act(booking.id, () => actions.complete.mutate(booking.id))}
        >
          {t("bookingsAction.completeNow")}
        </Button>
      </span>
    );
  }

  return (
    <span className="flex justify-end">
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => act(booking.id, () => actions.markDone.mutate(booking.id))}
      >
        {t("bookingsAction.markDone")}
      </Button>
    </span>
  );
}
