import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarCheck } from "lucide-react";
import { Button } from "@ntizo/frontend-ui";
import type {
  ProviderBookingDTO,
  ProviderBookingPageDTO,
} from "@ntizo/shared/read-models";
import { CollectionCard } from "@/shared/components/collection-card";
import { usePageHeader } from "@/shared/lib/page-header";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { PROVIDER_BOOKINGS_PAGE_SIZE, type ProviderTab } from "../domain/status";
import { useProviderBookings } from "../viewmodel/use-provider-bookings";
import { bookingColumns, bookingRow } from "./booking-row";
import { BookingsFilterSheet, DEFAULT_PROVIDER_TAB, bookingFilterCount } from "./bookings-filters";

/**
 * The workspace's bookings, one tab at a time. Three tabs by what the
 * provider has to do — answer, prepare, look back — rather than a filter
 * over ten statuses that are the system's vocabulary, not theirs. The tab
 * and the professional are picked in the same filter panel every other list
 * opens from its card's Filter button, and both stay in the URL.
 *
 * The rows are `CollectionCard`'s: a table from `md`, stacked cards below,
 * the same shape the services and members pages draw. Each one is built by
 * `bookingRow`, which the dashboard's "Reservas recentes" shares — the two
 * screens differ in which columns they ask for, never in what a row says.
 * Search goes to the server (`q`), debounced, because the list is paged and
 * a client-side filter over one page would say "no matches" about rows on
 * the next.
 */
export function BookingsPage() {
  const { t, i18n } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { activeProvider } = useActiveProvider();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: ProviderTab; member?: string };
  const tab: ProviderTab = search.tab ?? DEFAULT_PROVIDER_TAB;
  const memberId = search.member ?? null;
  const [filtersOpen, setFiltersOpen] = useState(false);

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
   * `page` is the last answer kept beside them — the total, the next offset
   * and the workspace's roster. `useQuery` has no data for an offset it has
   * not fetched yet, so reading those straight off it would make the count,
   * the "Mais" button and the member filter vanish for exactly the length of
   * the request that is meant to extend the list.
   *
   * Both are read through `visible` and `answered` below rather than directly:
   * they are the memory of what came *before* the request in flight, and at
   * offset zero there is nothing before it.
   */
  const [loaded, setLoaded] = useState<ProviderBookingDTO[]>([]);
  const [page, setPage] = useState<ProviderBookingPageDTO | null>(null);

  const providerId = activeProvider?.id ?? "";
  /**
   * Narrowing the list is a new list, and it is emptied **during the render
   * that narrows it** rather than in an effect.
   *
   * Passive effects run after the browser paints, so a reset that lived in one
   * would draw the previous filter's rows under the new filter's heading for a
   * frame first — and that frame is reachable, not theoretical: the app's
   * query client holds data fresh for 30s (`src/lib/query-client.ts`), so
   * returning to a tab visited seconds ago has `isLoading` false and `data`
   * present on the very render the tab changes in. Adjusting state during
   * render is React's own answer to this: it re-runs the component
   * immediately, before anything is committed, so no such frame exists.
   *
   * `providerId` is in the key because switching workspace is the same event
   * as switching tab, and one workspace's bookings under another's name is the
   * worst version of this bug rather than a lesser one.
   *
   * **`q` is trimmed, because the query key is** (see `booking.repository.ts`).
   * A key built from the raw string would part company with the request it is
   * meant to describe on the first stray space: typing one after a search that
   * had already paged changes this key and empties `loaded`, while the query
   * key is unchanged so React Query answers instantly from cache with the same
   * `query.data` — which does not re-run the accumulator effect, because
   * nothing it depends on changed. The list is left holding page one under a
   * pager that has moved on, and the next "Mais" brings back page two alone.
   */
  const filterKey = `${providerId}|${tab}|${q.trim()}|${memberId ?? ""}`;
  const [appliedKey, setAppliedKey] = useState(filterKey);
  if (appliedKey !== filterKey) {
    setAppliedKey(filterKey);
    setOffset(0);
    setLoaded([]);
    setPage(null);
  }

  const query = useProviderBookings({ providerId, tab, q, memberId, offset });
  // Offset zero is a fresh list and replaces; anything else extends. Ids
  // already on screen are skipped rather than trusted to be disjoint: a
  // booking answered between the two requests shifts every row after it by
  // one, and the same id arriving twice would otherwise render twice.
  //
  // It cannot append a previous filter's rows: the query key carries the whole
  // filter, so `query.data` is either this filter's answer or nothing at all.
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
  /**
   * What is on screen, and the answer it is counted against.
   *
   * At offset zero the answer *is* the list, and it is read straight through
   * rather than waited for — the accumulator above only catches up after the
   * paint, so a cached tab would otherwise draw an empty card for one frame.
   * From the second page on, `loaded` is the list: it is the only thing that
   * remembers the rows above the one the server has just sent. `answered`
   * likewise falls back to the previous page while the next one is in flight,
   * so the count, the pager and the roster do not blink out mid-request.
   */
  const visible = offset === 0 ? (query.data?.items ?? []) : loaded;
  const answered = query.data ?? page;
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

  const filters = { tab, memberId };
  const setFilters = (next: { tab: ProviderTab; memberId: string | null }) =>
    void navigate({
      to: "/provider/$slug/bookings",
      params: { slug },
      search: { tab: next.tab, member: next.memberId ?? undefined },
    });

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
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
        shown={visible.length}
        total={answered?.total ?? 0}
        // Only the first page draws skeletons. A second page's request must
        // not replace what the reader is already looking at with placeholders
        // — the whole point of "Mais" is that the list grows underneath them.
        loading={query.isLoading && offset === 0}
        search={typed}
        onSearchChange={setTyped}
        searchPlaceholder={t("bookings.searchPlaceholder")}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={bookingFilterCount(filters)}
        columns={bookingColumns(t)}
        emptyTitle={t(`bookings.empty.${tab}.title`)}
        emptyText={t(`bookings.empty.${tab}.body`)}
        emptyBadge={CalendarCheck}
        noMatchesTitle={t("bookings.noMatchesTitle")}
        noMatchesText={t("bookings.noMatches")}
        filtered={q.trim() !== "" || memberId !== null}
        rows={visible.map((b) => bookingRow(b, { slug, locale, now, t }))}
      />

      <BookingsFilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        // The roster from the last page answered — the panel offers the
        // professional only once the workspace is known to have more than one.
        members={answered?.members ?? []}
        onChange={setFilters}
      />

      {/* The count lives in the card's own header now; only the way to the
          next page is left under it. */}
      {answered && answered.nextOffset !== null && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-center"
          onClick={() => setOffset(answered.nextOffset ?? offset + PROVIDER_BOOKINGS_PAGE_SIZE)}
        >
          {t("bookings.loadMore")}
        </Button>
      )}
    </div>
  );
}
