import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";
import { Button, cn } from "@ntizo/frontend-ui";
import { PROVIDER_QUOTE_TABS, type ProviderQuoteTab } from "@ntizo/shared";
import { CollectionCard } from "@/shared/components/collection-card";
import { usePageHeader } from "@/shared/lib/page-header";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useProviderDetail } from "@/features/provider/viewmodel/use-providers";
import { QUOTES_PAGE_SIZE, coarseDuration } from "@/features/quotes/domain/status";
import {
  useProviderQuotes,
  type ProviderQuoteDTO,
  type ProviderQuotePageDTO,
} from "../viewmodel/use-provider-quotes";
import { quoteColumns, quoteRow } from "./quote-row";

/**
 * The workspace's quote queue, one tab at a time — the page the sidebar's
 * amber badge points at.
 *
 * Follows `provider/bookings/ui/bookings-page.tsx` step for step: the tab
 * from `useSearch`, the render-time reset keyed on `` `${providerId}|${tab}` ``,
 * the accumulating `loaded`/`page` pair, one `now`. Three things differ:
 *
 * 1. **The pager is `hasMore`, not `nextOffset`**, and the header count comes
 *    from `counts[tab]` rather than a wire `total` — the same two
 *    differences the customer's own `quotes-page.tsx` carries against the
 *    same booking-page original, for the same reason: `quoteForProvider`
 *    never returns a cursor or a total, only whether another page exists.
 * 2. **Three visible tabs, not a filter sheet.** The queue is three tabs and
 *    at most a page or two — nothing here to search or filter, so the tabs
 *    are drawn directly, the way the customer's `quotes-page.tsx` draws its
 *    own two.
 * 3. **The header carries a blurb**, `t("provider.blurb", { count, oldest })`
 *    — how many are owed an answer and how long the oldest of them has
 *    waited. It reads off the "toAnswer" tab's own first page regardless of
 *    which tab is on screen, the same page `useQuoteToAnswerCount` and this
 *    page's own default view share — so the blurb never lags behind a tab
 *    switch to "waiting" or "history".
 */
export function ProviderQuotesPage() {
  const { t, i18n } = useTranslation("quotes");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { activeProvider } = useActiveProvider();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: ProviderQuoteTab };
  const tab: ProviderQuoteTab = search.tab ?? PROVIDER_QUOTE_TABS[0];

  const providerId = activeProvider?.id ?? "";

  // The price cell's "recebe" line needs the workspace's own commission
  // rate, which lives on the provider *detail*, not on `ProviderQuoteDTO` —
  // see `quote-row.tsx`. `ConsoleShell`'s own strip already runs this exact
  // query on every console screen, so this call costs nothing extra: it is
  // the same cache entry, not a second request.
  const { data: providerDetail } = useProviderDetail(activeProvider?.id);
  const commissionBps = providerDetail?.commissionBps;

  const [offset, setOffset] = useState(0);
  /**
   * The rows on screen, and the last answer beside them — exactly as
   * `bookings-page.tsx` keeps them, for the reasons spelled out there.
   */
  const [loaded, setLoaded] = useState<ProviderQuoteDTO[]>([]);
  const [page, setPage] = useState<ProviderQuotePageDTO | null>(null);

  /**
   * Switching tab or workspace is a new list, emptied **during the render
   * that switches it** rather than in an effect — see `bookings-page.tsx`'s
   * identical note for why a passive effect would draw the previous tab's
   * rows under the new tab's heading for a frame first.
   */
  const filterKey = `${providerId}|${tab}`;
  const [appliedKey, setAppliedKey] = useState(filterKey);
  if (appliedKey !== filterKey) {
    setAppliedKey(filterKey);
    setOffset(0);
    setLoaded([]);
    setPage(null);
  }

  const query = useProviderQuotes({ providerId, tab, offset });
  useEffect(() => {
    const answer = query.data;
    if (!answer) return;
    setPage(answer);
    setLoaded((current) => {
      if (offset === 0) return answer.items;
      const seen = new Set(current.map((quote) => quote.id));
      return [...current, ...answer.items.filter((quote) => !seen.has(quote.id))];
    });
  }, [query.data, offset]);

  // The answer the count and the pager read off — the one in hand, falling
  // back to the previous page while the next is in flight, so neither blinks
  // out for the length of a request meant to extend the list.
  const answered = query.data ?? page;
  const total = answered?.counts[tab] ?? 0;
  const canLoadMore = answered?.hasMore === true;

  // Measured from the moment the page was answered, not from whenever React
  // last re-rendered — see `bookings-page.tsx`'s identical `now`.
  const now = useMemo(
    () => new Date(query.dataUpdatedAt || Date.now()),
    [query.dataUpdatedAt],
  );

  // At offset zero the answer *is* the list, read straight through rather
  // than waited for — see `bookings-page.tsx`'s identical note. From the
  // second page on, `loaded` is the only thing that remembers the rows above
  // the one the server has just sent.
  const items = offset === 0 ? (query.data?.items ?? []) : loaded;

  /**
   * The blurb's own numbers, read off the "toAnswer" tab regardless of which
   * tab is on screen. Sharing `useProviderQuotes`'s query key with the main
   * list when `tab === "toAnswer"` means this is the very same cache entry —
   * not a second request — and on any other tab it is one small, cached page
   * rather than the whole queue.
   */
  const toAnswerPeek = useProviderQuotes({ providerId, tab: "toAnswer", offset: 0 });
  const toAnswerAnswer = tab === "toAnswer" ? answered : toAnswerPeek.data;
  const toAnswerCount = toAnswerAnswer?.counts.toAnswer ?? 0;
  const oldestRequestedAt = (tab === "toAnswer" ? items : (toAnswerPeek.data?.items ?? [])).reduce<
    string | null
  >((oldest, quote) => (oldest === null || quote.requestedAt < oldest ? quote.requestedAt : oldest), null);
  const oldestSpan = oldestRequestedAt
    ? coarseDuration(now.getTime() - new Date(oldestRequestedAt).getTime())
    : null;
  const subtitle =
    toAnswerCount === 0
      ? t("provider.blurbNone")
      : oldestSpan
        ? t("provider.blurb", {
            count: toAnswerCount,
            oldest: t(`unit.${oldestSpan.unit}`, { count: oldestSpan.count }),
          })
        : undefined;
  usePageHeader(t("provider.title"), subtitle);

  if (!activeProvider) return null;
  const slug = activeProvider.slug;

  const setTab = (next: ProviderQuoteTab) =>
    void navigate({ to: "/provider/$slug/quotes", params: { slug }, search: { tab: next } });

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      {query.isError && (
        <p role="alert" className="type-body text-[var(--color-destructive)]">
          {t("provider.loadError")}
        </p>
      )}

      <div
        role="tablist"
        aria-label={t("provider.title")}
        className="inline-flex rounded-full bg-[var(--color-muted)] p-1"
      >
        {PROVIDER_QUOTE_TABS.map((key) => (
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
            {t(`provider.tab.${key}`)}
            {answered && (
              <span
                className={cn(
                  "ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-xs font-semibold",
                  tab === key
                    ? "bg-white/25"
                    : "bg-[var(--color-background)] text-[var(--color-muted-foreground)]",
                )}
              >
                {answered.counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <CollectionCard
        title={t(`provider.tab.${tab}`)}
        shown={items.length}
        total={total}
        loading={query.isLoading && offset === 0}
        columns={quoteColumns(t)}
        emptyTitle={t("provider.emptyTitle")}
        emptyText={t("provider.emptyText")}
        emptyBadge={FileQuestion}
        noMatchesTitle={t("provider.noMatchesTitle")}
        noMatchesText={t("provider.noMatchesText")}
        // Unreachable: no search box and no filter button, so nothing could
        // ever hide a row — see `quotes-page.tsx`'s (the customer's)
        // identical note.
        filtered={false}
        rows={items.map((quote) => quoteRow(quote, { slug, locale, now, t, commissionBps }))}
      />

      {answered && canLoadMore && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={query.isFetching}
            onClick={() => setOffset(offset + QUOTES_PAGE_SIZE)}
          >
            {t("provider.more")}
          </Button>
        </div>
      )}
    </div>
  );
}
