import { directorySearch, type DirectorySearch } from "@/features/directory/domain/directory-search";

export interface FilterChip {
  /** Stable across renders; also the React key. */
  key: string;
  /** A key in the `directory` namespace, plus its values. */
  label: { key: string; values?: Record<string, string | number> };
  /** The search object that removes exactly this chip and keeps every other. */
  next: DirectorySearch;
}

/**
 * Everything currently narrowing the directory, each with the URL that removes
 * it. Same reasoning as `browseFilterChips` in the services domain: the
 * removal link is built by `directorySearch`, never by hand, `offset` is
 * always cleared, and neither the category nor the sort gets a chip — see
 * `features/directory/services/domain/browse-chips.ts` for the full argument.
 *
 * Two rules that are this page's own: `verified` is a chip only when it is
 * `true` — `verified=false` and no `verified` at all are the same page, so a
 * chip for "off" would offer to remove a filter that is not on. And the
 * rating threshold is labelled with the score the reader picked, not the word
 * "rating" — "4.5+ stars" says what the chip does, "Rating" does not.
 */
export function directoryFilterChips(current: DirectorySearch): FilterChip[] {
  const chips: FilterChip[] = [];
  const drop = (change: DirectorySearch) =>
    directorySearch(current, { ...change, offset: undefined });

  if (current.q) {
    chips.push({
      key: "q",
      label: { key: "chipSearch", values: { term: current.q } },
      next: drop({ q: undefined }),
    });
  }
  if (current.city) {
    chips.push({
      key: "city",
      label: { key: "chipCity", values: { city: current.city } },
      next: drop({ city: undefined }),
    });
  }
  if (current.providerType) {
    chips.push({
      key: "providerType",
      label: { key: `filterProviderKindOption.${current.providerType}` },
      next: drop({ providerType: undefined }),
    });
  }
  if (current.minRating) {
    chips.push({
      key: "minRating",
      label: { key: "chipRating", values: { score: current.minRating } },
      next: drop({ minRating: undefined }),
    });
  }
  if (current.verified) {
    chips.push({
      key: "verified",
      label: { key: "chipVerified" },
      next: drop({ verified: undefined }),
    });
  }
  // `!= null`, not truthy: a minimum of 0 is "free and up", which is a bound
  // somebody set, and `if (min)` steps straight over it.
  if (current.minPrice != null || current.maxPrice != null) {
    // One chip however many bounds are set. Two chips for one range invites
    // the reader to remove half of it, which leaves a range nobody chose.
    //
    // Annotated explicitly: without a declared type here, TypeScript infers
    // the three branches' `values` shapes as a union and back-fills each with
    // the other branches' keys as `?: undefined` for comparison purposes —
    // which then fails the assignment to `Record<string, string | number>`,
    // a value type that does not include `undefined`. The annotation gives
    // each branch a single contextual type instead of letting them infer one.
    const label: { key: string; values: Record<string, number> } =
      current.minPrice != null && current.maxPrice != null
        ? { key: "chipPriceRange", values: { min: current.minPrice, max: current.maxPrice } }
        : current.minPrice != null
          ? { key: "chipPriceMin", values: { min: current.minPrice } }
          : { key: "chipPriceMax", values: { max: current.maxPrice! } };
    chips.push({
      key: "price",
      label,
      next: drop({ minPrice: undefined, maxPrice: undefined }),
    });
  }
  return chips;
}
