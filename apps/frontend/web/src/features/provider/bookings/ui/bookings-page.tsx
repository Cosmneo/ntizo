import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarCheck } from "lucide-react";
import { Button, cn } from "@ntizo/frontend-ui";
import type {
  ProviderBookingDTO,
  ProviderBookingPageDTO,
} from "@ntizo/shared/read-models";
import { CollectionCard } from "@/shared/components/collection-card";
import { usePageHeader } from "@/shared/lib/page-header";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import {
  PROVIDER_BOOKINGS_PAGE_SIZE,
  PROVIDER_TABS,
  type ProviderTab,
} from "../domain/status";
import { useProviderBookings } from "../viewmodel/use-provider-bookings";
import { bookingColumns, bookingRow } from "./booking-row";

/**
 * The workspace's bookings, one tab at a time. Three tabs by what the
 * provider has to do — answer, prepare, look back — rather than a filter
 * over ten statuses that are the system's vocabulary, not theirs.
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
        {answered && answered.members.length > 1 && (
          <select
            aria-label={t("bookings.memberFilterAll")}
            value={memberId ?? ""}
            onChange={(e) => setMember(e.target.value || null)}
            className="type-body h-10 rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3"
          >
            <option value="">{t("bookings.memberFilterAll")}</option>
            {answered.members.map((m) => (
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
        shown={visible.length}
        total={answered?.total ?? 0}
        // Only the first page draws skeletons. A second page's request must
        // not replace what the reader is already looking at with placeholders
        // — the whole point of "Mais" is that the list grows underneath them.
        loading={query.isLoading && offset === 0}
        search={typed}
        onSearchChange={setTyped}
        searchPlaceholder={t("bookings.searchPlaceholder")}
        columns={bookingColumns(t)}
        emptyTitle={t(`bookings.empty.${tab}.title`)}
        emptyText={t(`bookings.empty.${tab}.body`)}
        emptyBadge={CalendarCheck}
        noMatchesTitle={t("bookings.noMatchesTitle")}
        noMatchesText={t("bookings.noMatches")}
        filtered={q.trim() !== "" || memberId !== null}
        rows={visible.map((b) => bookingRow(b, { slug, locale, now, t }))}
      />

      {answered && (
        <div className="flex items-center justify-between">
          <span className="type-caption text-[var(--color-muted-foreground)]">
            {t("bookings.shownOf", { shown: visible.length, total: answered.total })}
          </span>
          {answered.nextOffset !== null && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setOffset(answered.nextOffset ?? offset + PROVIDER_BOOKINGS_PAGE_SIZE)
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
