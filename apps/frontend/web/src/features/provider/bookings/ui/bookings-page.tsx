import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarCheck } from "lucide-react";
import { Button, cn } from "@ntizo/frontend-ui";
import type {
  ProviderBookingDTO,
  ProviderBookingPageDTO,
} from "@ntizo/shared/read-models";
import { CollectionCard } from "@/shared/components/collection-card";
import { usePageHeader } from "@/shared/lib/page-header";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { compactSlotWording } from "@/features/checkout/domain/slot-wording";
import { formatMoney } from "@/features/wallet/domain/money";
import {
  PROVIDER_BOOKINGS_PAGE_SIZE,
  PROVIDER_TABS,
  timeLeftWording,
  type ProviderTab,
} from "../domain/status";
import { useProviderBookings } from "../viewmodel/use-provider-bookings";
import { BookingStatusBadge } from "./booking-status-badge";

/**
 * The workspace's bookings, one tab at a time. Three tabs by what the
 * provider has to do — answer, prepare, look back — rather than a filter
 * over ten statuses that are the system's vocabulary, not theirs.
 *
 * The rows are `CollectionCard`'s: a table from `md`, stacked cards below,
 * the same shape the services and members pages draw. Search goes to the
 * server (`q`), debounced, because the list is paged and a client-side
 * filter over one page would say "no matches" about rows on the next.
 */
export function BookingsPage() {
  const { t, i18n } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { activeProvider } = useActiveProvider();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: ProviderTab; member?: string };
  const tab: ProviderTab = search.tab ?? "requests";
  const memberId = search.member ?? null;

  usePageHeader(t("bookings.title"), t("bookings.subtitle"));

  // What the provider has typed, and what the server has been asked for. Two
  // values rather than one, because the box must answer every keystroke while
  // the network hears one request per pause.
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const handle = window.setTimeout(() => setQ(typed), 300);
    return () => window.clearTimeout(handle);
  }, [typed]);
  const [offset, setOffset] = useState(0);
  /**
   * The rows on screen, which are not the rows the last request returned:
   * "Mais" *adds* the next page under the ones already there, so what the
   * reader sees accumulates across offsets for as long as the filter holds
   * still. A pager that replaced the page instead would put two counts on one
   * screen that disagree — the card's own header saying twenty and the footer
   * saying forty — and would make "Mais" mean "lose what you were reading".
   *
   * `page` is the request's own answer kept beside them: the total, the next
   * offset and the workspace's roster. `useQuery` has no data for an offset it
   * has not fetched yet, so reading those straight off it would make the
   * count, the "Mais" button and the member filter vanish for exactly the
   * length of the request that is meant to extend the list.
   */
  const [loaded, setLoaded] = useState<ProviderBookingDTO[]>([]);
  const [page, setPage] = useState<ProviderBookingPageDTO | null>(null);
  // Narrowing the list is a new list: staying on page three of the previous
  // one is how a provider lands on an empty page that has rows above it, and
  // what is on screen goes with it, so a tab change cannot leave the previous
  // tab's rows or its count standing under the new tab's heading.
  useEffect(() => {
    setOffset(0);
    setLoaded([]);
    setPage(null);
  }, [tab, q, memberId]);

  const providerId = activeProvider?.id ?? "";
  const query = useProviderBookings({ providerId, tab, q, memberId, offset });
  // Offset zero is a fresh list and replaces; anything else extends. Ids
  // already on screen are skipped rather than trusted to be disjoint: a
  // booking answered between the two requests shifts every row after it by
  // one, and the same id arriving twice would otherwise render twice.
  useEffect(() => {
    const answer = query.data;
    if (!answer) return;
    setPage(answer);
    setLoaded((current) => {
      if (offset === 0) return answer.items;
      const seen = new Set(current.map((b) => b.id));
      return [...current, ...answer.items.filter((b) => !seen.has(b.id))];
    });
  }, [query.data, offset]);
  // The countdown is measured from the moment the page was answered, not from
  // whenever React last re-rendered: every row on screen then counts down from
  // one instant, and a re-render for an unrelated reason cannot move the clock
  // a minute while nothing about the data changed.
  const now = useMemo(
    () => new Date(query.dataUpdatedAt || Date.now()),
    [query.dataUpdatedAt],
  );

  if (!activeProvider) return null;
  const slug = activeProvider.slug;

  const setTab = (next: ProviderTab) =>
    void navigate({
      to: "/provider/$slug/bookings",
      params: { slug },
      search: { tab: next, member: memberId ?? undefined },
    });
  const setMember = (next: string | null) =>
    void navigate({
      to: "/provider/$slug/bookings",
      params: { slug },
      search: { tab, member: next ?? undefined },
    });

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={t("bookings.title")}
          className="inline-flex rounded-full bg-[var(--color-muted)] p-1"
        >
          {PROVIDER_TABS.map((key) => (
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
              {t(`bookings.tab.${key}`)}
            </button>
          ))}
        </div>

        {/* Only when the workspace has more than one person: an individual
            provider has nobody to narrow to. Native `select`, styled as the
            kit's field — a kit `Select` with one option is not worth its
            keyboard model here. */}
        {page && page.members.length > 1 && (
          <select
            aria-label={t("bookings.memberFilterAll")}
            value={memberId ?? ""}
            onChange={(e) => setMember(e.target.value || null)}
            className="type-body h-10 rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3"
          >
            <option value="">{t("bookings.memberFilterAll")}</option>
            {page.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.firstName}
              </option>
            ))}
          </select>
        )}
      </div>

      {query.isError && (
        <p role="alert" className="type-body text-[var(--color-destructive)]">
          {t("bookings.loadError")}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void query.refetch()}
          >
            {t("bookings.retry")}
          </button>
        </p>
      )}

      <CollectionCard
        title={t(`bookings.tab.${tab}`)}
        shown={loaded.length}
        total={page?.total ?? 0}
        // Only the first page draws skeletons. A second page's request must
        // not replace what the reader is already looking at with placeholders
        // — the whole point of "Mais" is that the list grows underneath them.
        loading={query.isLoading && offset === 0}
        search={typed}
        onSearchChange={setTyped}
        searchPlaceholder={t("bookings.searchPlaceholder")}
        columns={[
          { key: "customer", label: t("bookings.col.customer"), className: "pl-5" },
          { key: "service", label: t("bookings.col.service"), skeletonWidth: "w-40" },
          { key: "when", label: t("bookings.col.when"), skeletonWidth: "w-28" },
          {
            key: "price",
            label: t("bookings.col.price"),
            align: "right",
            skeletonWidth: "w-20",
          },
          {
            key: "status",
            label: t("bookings.col.status"),
            skeletonWidth: "w-24",
            skeletonShape: "badge",
            className: "pr-5",
          },
        ]}
        emptyTitle={t(`bookings.empty.${tab}.title`)}
        emptyText={t(`bookings.empty.${tab}.body`)}
        emptyBadge={CalendarCheck}
        noMatchesTitle={t("bookings.noMatchesTitle")}
        noMatchesText={t("bookings.noMatches")}
        filtered={q.trim() !== "" || memberId !== null}
        rows={loaded.map((b) => {
          const slot = compactSlotWording(b.startsAt, b.endsAt, locale, b.timezone);
          const left = b.respondBy ? timeLeftWording(b.respondBy, now) : null;
          return {
            key: b.id,
            // The customer's name *is* the way into the booking: the row has
            // no other link, and a whole-row click handler is not one — it
            // cannot be tabbed to, opened in a new tab, or read out as a
            // destination.
            primary: (
              <Link
                to="/provider/$slug/bookings/$bookingId"
                params={{ slug, bookingId: b.id }}
                className="type-body-medium block font-semibold hover:underline"
              >
                {b.customerFirstName}
              </Link>
            ),
            cells: {
              service: `${b.serviceName} · ${b.memberFirstName ?? t("bookings.memberAnyone")}`,
              when: (
                <span className="tabular-nums">
                  {slot.date} · {slot.start}
                </span>
              ),
              price: (
                <span className="tabular-nums">
                  {formatMoney(b.priceMinor, b.currency, locale)}
                </span>
              ),
              status: (
                <span className="inline-flex items-center gap-2">
                  <BookingStatusBadge status={b.status} />
                  {left && (
                    <span className="type-caption text-[var(--color-muted-foreground)]">
                      {left}
                    </span>
                  )}
                </span>
              ),
            },
          };
        })}
      />

      {page && (
        <div className="flex items-center justify-between">
          <span className="type-caption text-[var(--color-muted-foreground)]">
            {t("bookings.shownOf", { shown: loaded.length, total: page.total })}
          </span>
          {page.nextOffset !== null && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setOffset(page.nextOffset ?? offset + PROVIDER_BOOKINGS_PAGE_SIZE)
              }
            >
              {t("bookings.loadMore")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
