import type { BrowseSort } from "@/features/directory/services/domain/types";

/** Everything the browse's URL can say. */
export interface BrowseSearch {
  category?: string | undefined;
  locationType?: string | undefined;
  paymentMode?: string | undefined;
  providerType?: string | undefined;
  language?: string | undefined;
  city?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  q?: string | undefined;
  sort?: BrowseSort | undefined;
  offset?: number | undefined;
}

/**
 * The URL for changing one thing about the browse, keeping the rest.
 *
 * Every control on this page — the category band, the sidebar's filters, the
 * sort, the search box, the paging links — is a link to the same route with a
 * different search object. Built by hand, each of those objects only ever
 * remembered the parameters its own component knew about: the band dropped
 * the sidebar's filter, the sidebar dropped the sort, and adding a search box
 * would have meant every one of them dropping the typed term. One function
 * decides it for all of them, and it is tested rather than trusted.
 *
 * The page resets on every change but its own. Page 4 of one category is not
 * page 4 of another — it is usually past the end of it, so a reader who
 * changed a filter would land on an empty page having asked for a full one.
 * Passing `offset` in `change` is how the paging links say the page is
 * precisely what they are changing.
 *
 * Empty values are omitted rather than written out: `/services` and
 * `/services?offset=0&q=` are one page, and two URLs for one page are two
 * cache entries and two things for a crawler to index.
 */
export function browseSearch(current: BrowseSearch, change: BrowseSearch): BrowseSearch {
  const next = { ...current, ...change };
  const offset = "offset" in change ? next.offset : undefined;
  return {
    ...(next.category ? { category: next.category } : {}),
    ...(next.locationType ? { locationType: next.locationType } : {}),
    ...(next.paymentMode ? { paymentMode: next.paymentMode } : {}),
    ...(next.providerType ? { providerType: next.providerType } : {}),
    ...(next.language ? { language: next.language } : {}),
    ...(next.city ? { city: next.city } : {}),
    // `!= null` rather than truthy: a minimum of 0 is a bound the reader set,
    // and dropping it would quietly widen their search back out.
    ...(next.minPrice != null ? { minPrice: next.minPrice } : {}),
    ...(next.maxPrice != null ? { maxPrice: next.maxPrice } : {}),
    ...(next.q ? { q: next.q } : {}),
    ...(next.sort ? { sort: next.sort } : {}),
    ...(offset ? { offset } : {}),
  };
}

/**
 * How many narrowings are on, for the badge on the phone's filter button.
 *
 * The category is excluded: on a phone the rail is still on screen above the
 * results, so counting it would show a number for something the reader can
 * already see and clear without opening anything. A price range counts once
 * however many of its two boxes are filled — counting the bounds separately
 * shows "2" for a single range. The same rules `activeDirectoryFilterCount`
 * follows on the directory.
 *
 * Every filter counted here has to be reachable inside the sheet the badge
 * opens. It moved out of `browse-filters.tsx` and down here beside its twin
 * when the count grew a `city` the sheet had no group for: a badge reading 2
 * over a sheet offering one control the reader can act on is a badge that
 * lies about what is on.
 */
export function activeFilterCount(current: BrowseSearch): number {
  return [
    current.locationType,
    current.paymentMode,
    current.providerType,
    current.language,
    current.city,
    current.q,
    current.minPrice != null || current.maxPrice != null ? "price" : undefined,
  ].filter((v) => v != null).length;
}
