/** How the directory can be ordered. Mirrors the `sort` the public query accepts. */
export const DIRECTORY_SORTS = ["relevance", "rating", "reviews", "price", "name"] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

/** The star thresholds a reader can pick — not an arbitrary decimal. */
export const RATING_THRESHOLDS = [4.5, 4, 3] as const;
export type RatingThreshold = (typeof RATING_THRESHOLDS)[number];

/** A person, or an establishment with staff. The same pair the services browse offers. */
export const PROVIDER_KINDS = ["individual", "organization"] as const;

/** Everything the directory's URL can say. */
export interface DirectorySearch {
  q?: string | undefined;
  category?: string | undefined;
  city?: string | undefined;
  providerType?: string | undefined;
  minRating?: RatingThreshold | undefined;
  verified?: boolean | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  sort?: DirectorySort | undefined;
  offset?: number | undefined;
}

/**
 * The URL for changing one thing about the directory, keeping the rest.
 *
 * The same function the services browse has, for the same reason: every control
 * on this page — the category band, the sidebar's filters, the sort, the search
 * box, the paging link — is a link to this route with a different search
 * object, and building those by hand means each one silently drops the
 * parameters its own component does not know about. One function decides it for
 * all of them, and it is tested rather than trusted.
 *
 * The page resets on every change but its own. Page 3 of one category is not
 * page 3 of another — it is usually past the end of it, so a reader who changed
 * a filter would land on an empty page having asked for a full one. Passing
 * `offset` in `change` is how the paging link says the page is precisely what
 * it is changing.
 *
 * Empty values are omitted rather than written out: `/providers` and
 * `/providers?offset=0&q=` are one page, and two URLs for one page are two
 * cache entries and two things for a crawler to index.
 */
export function directorySearch(
  current: DirectorySearch,
  change: DirectorySearch,
): DirectorySearch {
  const next = { ...current, ...change };
  const offset = "offset" in change ? next.offset : undefined;
  return {
    ...(next.q ? { q: next.q } : {}),
    ...(next.category ? { category: next.category } : {}),
    ...(next.city ? { city: next.city } : {}),
    ...(next.providerType ? { providerType: next.providerType } : {}),
    ...(next.minRating ? { minRating: next.minRating } : {}),
    // Only when true. `verified=false` and no `verified` at all are the same
    // page, and writing the false one out is a second URL for it.
    ...(next.verified ? { verified: true } : {}),
    // `!= null` rather than truthy: a minimum of 0 is a bound the reader set,
    // and dropping it would quietly widen their search back out.
    ...(next.minPrice != null ? { minPrice: next.minPrice } : {}),
    ...(next.maxPrice != null ? { maxPrice: next.maxPrice } : {}),
    ...(next.sort ? { sort: next.sort } : {}),
    ...(offset ? { offset } : {}),
  };
}

/**
 * How many narrowings are on, for the badge on the phone's filter button.
 *
 * The category is excluded: on a phone the band is still on screen above the
 * results, so counting it would show a number for something the reader can
 * already see and clear without opening anything. A price range counts once
 * however many of its two boxes are filled — counting the bounds separately
 * shows "2" for a single range. The same rules `activeFilterCount` follows on
 * the services browse.
 */
export function activeDirectoryFilterCount(current: DirectorySearch): number {
  return [
    current.q,
    current.city,
    current.providerType,
    current.minRating,
    current.verified ? "verified" : undefined,
    current.minPrice != null || current.maxPrice != null ? "price" : undefined,
  ].filter((v) => v != null).length;
}
