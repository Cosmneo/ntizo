import {
  browseSearch,
  type BrowseSearch,
} from "@/features/directory/services/domain/browse-search";

export interface FilterChip {
  /** Stable across renders; also the React key. */
  key: string;
  /** A key in the `directory` namespace, plus its values. */
  label: { key: string; values?: Record<string, string | number> };
  /** The search object that removes exactly this chip and keeps every other. */
  next: BrowseSearch;
}

/**
 * Everything currently narrowing the browse, each with the URL that removes it.
 *
 * The removal link is built by `browseSearch`, never by hand: an object
 * assembled at the call site only ever remembers the parameters that call site
 * knows about, which is the exact bug `browseSearch` was written to end.
 *
 * `offset: undefined` on every one of them. Page 4 of a wider result set is not
 * page 4 of the narrower one — usually it is past its end — so a reader who
 * removed a filter would land on an empty page having asked for a fuller one.
 *
 * **The category is not here.** The rail sits above the results at every width,
 * so a chip for it is a second control for something already visible and
 * already clearable. **Nor is the sort:** an order is not a narrowing, and a
 * chip whose removal changes nothing about what is shown is a lie about what
 * chips mean.
 */
export function browseFilterChips(current: BrowseSearch): FilterChip[] {
  const chips: FilterChip[] = [];
  const drop = (change: BrowseSearch) => browseSearch(current, { ...change, offset: undefined });

  if (current.locationType) {
    chips.push({
      key: "locationType",
      label: { key: `filterWhereOption.${current.locationType}` },
      next: drop({ locationType: undefined }),
    });
  }
  if (current.paymentMode) {
    chips.push({
      key: "paymentMode",
      label: { key: `filterPaymentOption.${current.paymentMode}` },
      next: drop({ paymentMode: undefined }),
    });
  }
  if (current.providerType) {
    chips.push({
      key: "providerType",
      label: { key: `filterProviderKindOption.${current.providerType}` },
      next: drop({ providerType: undefined }),
    });
  }
  if (current.city) {
    chips.push({
      key: "city",
      label: { key: "chipCity", values: { city: current.city } },
      next: drop({ city: undefined }),
    });
  }
  if (current.language) {
    chips.push({
      key: "language",
      label: { key: `filterLanguageOption.${current.language}` },
      next: drop({ language: undefined }),
    });
  }
  if (current.q) {
    chips.push({
      key: "q",
      label: { key: "chipSearch", values: { term: current.q } },
      next: drop({ q: undefined }),
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
