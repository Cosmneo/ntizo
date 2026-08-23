import { createFileRoute } from "@tanstack/react-router";
import { PROVIDER_TYPES } from "@ntizo/shared";
import i18n from "@/shared/lib/i18n";
import { DirectoryPage } from "@/features/directory/ui/directory-page";
import { prefetchDirectory } from "@/features/directory/viewmodel/use-directory";
import {
  DIRECTORY_SORTS,
  RATING_THRESHOLDS,
  type DirectorySearch,
  type DirectorySort,
  type RatingThreshold,
} from "@/features/directory/domain/directory-search";

/** The 100 the GraphQL `search` field accepts. Longer would fail validation and blank the page. */
const MAX_SEARCH_LENGTH = 100;

/** A string parameter, trimmed, or undefined when it says nothing. */
function text(raw: unknown, max = 120): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, max) : undefined;
}

/** A whole-number parameter at or above zero, or undefined. */
function whole(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

/**
 * The public provider directory, at /providers.
 *
 * Named `providers.index.tsx`, not `providers.tsx`. With a sibling
 * `providers.$slug.tsx`, the un-suffixed name makes this a LAYOUT for the
 * detail route — and since it renders the listing rather than an <Outlet/>,
 * every /providers/<slug> URL silently rendered the directory instead of the
 * provider. Verified: a nonexistent slug returned the list, hydration payload
 * and all.
 *
 * `ssr: true` and deliberately NOT in vite.config's `pages` list. Prerendering
 * would freeze the listing at build time, and nothing rebuilds the site when a
 * provider registers — a directory that only updates on deploy is worse than
 * one that costs a query per request. `/` stays prerendered because it is a
 * static marketing shell; this is not.
 *
 * `loader` primes the query cache before render so `useSuspenseQuery` resolves
 * on the server and the listings land in the HTML a crawler receives.
 */
export const Route = createFileRoute("/providers/")({
  ssr: true,
  /**
   * Every filter lives in the URL rather than in component state: a results
   * page you cannot link to or reload is not a results page. It is also what
   * carries them into the loader, so a filtered page two is server-rendered
   * like an unfiltered page one.
   *
   * Each closed set is checked against the shared list rather than passed
   * through. An unknown value would reach the server as a filter matching
   * nothing, and the page would go blank with no way to tell why.
   */
  validateSearch: (search: Record<string, unknown>): DirectorySearch => {
    const providerType = PROVIDER_TYPES.find((v) => v === search["providerType"]);
    const sort = DIRECTORY_SORTS.find((v) => v === search["sort"]) as DirectorySort | undefined;
    const minRating = RATING_THRESHOLDS.find((v) => v === Number(search["minRating"])) as
      | RatingThreshold
      | undefined;

    return {
      ...(text(search["q"], MAX_SEARCH_LENGTH) ? { q: text(search["q"], MAX_SEARCH_LENGTH)! } : {}),
      ...(text(search["category"], 60) ? { category: text(search["category"], 60)! } : {}),
      ...(text(search["city"]) ? { city: text(search["city"])! } : {}),
      ...(providerType ? { providerType } : {}),
      ...(minRating ? { minRating } : {}),
      // Only `true` survives. `verified=false` and no `verified` at all are the
      // same page, and keeping the false one would make two URLs for it.
      ...(search["verified"] === true || search["verified"] === "true" ? { verified: true } : {}),
      ...(whole(search["minPrice"]) != null ? { minPrice: whole(search["minPrice"])! } : {}),
      ...(whole(search["maxPrice"]) != null ? { maxPrice: whole(search["maxPrice"])! } : {}),
      // `relevance` is the default order, so it is written as an absent
      // parameter — the same reason the sort links omit it.
      ...(sort && sort !== "relevance" ? { sort } : {}),
      ...(whole(search["offset"]) ? { offset: whole(search["offset"])! } : {}),
    };
  },
  /**
   * The whole search, not just the term.
   *
   * `loaderDeps` decides when the loader re-runs, so a filter missing from it
   * is a filter whose page is served from the previous filter's cache entry.
   */
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ context, deps }) =>
    /*
     * Read off the i18n instance rather than the router context, which carries
     * only the query client.
     *
     * Known limitation, stated rather than papered over: on the server this
     * resolves to the fallback language and in the browser to the reader's, so
     * the two query keys differ and the client refetches once on hydration. The
     * server-rendered HTML is still complete — which is what a crawler needs —
     * but it is rendered in the fallback language. That split is not this
     * route's: the root layout already hydrates `Main navigation` over
     * `Navegação principal`, so language negotiation during SSR is a
     * platform-wide gap, and fixing it here would only hide one symptom of it.
     */
    prefetchDirectory(context.queryClient, deps.search, i18n.resolvedLanguage ?? i18n.language),
  component: DirectoryPage,
});
