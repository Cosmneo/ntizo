import { queryOptions } from "@tanstack/react-query";
import type { ProviderPublicDTO, ProviderPublicDetailDTO } from "@ntizo/shared";
import type { ProviderPageDTO, ProviderReviewsPublicDTO } from "@ntizo/shared/read-models";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";
import { DIRECTORY_PAGE_SIZE } from "@/features/directory/domain/provider-listing";
import type { DirectorySearch } from "@/features/directory/domain/directory-search";

export const PROVIDER_FIELDS = `
  id name slug type description city district country logoUrl photoUrls
  verified ratingAverage reviewCount serviceCount fromAmountMinor fromCurrency
  categories { code name }`;

/**
 * The slug lookup asks for more than the list does, and that split is the point.
 *
 * `weeklyHours` costs a join over every member's availability. Asking for it in
 * `PROVIDER_FIELDS` would make the directory pay that 24 times to render a grid
 * of cards that show none of it — see `providerPublicDetailReadModel`'s own doc
 * comment for the same reasoning on the server's side of the wire.
 */
export const PROVIDER_DETAIL_FIELDS = `${PROVIDER_FIELDS}
  memberSince
  serviceLocationTypes
  weeklyHours { weekday intervals { startMinute endMinute } }`;

export const BY_SLUG = `
  query ProviderBySlug($input: ProviderBySlugInput!) {
    providerBySlug(input: $input) { ${PROVIDER_DETAIL_FIELDS} }
  }`;

export const LIST = `
  query ProviderList($input: ProviderListInput!) {
    providerList(input: $input) {
      items { ${PROVIDER_FIELDS} }
      total
    }
  }`;

const REVIEWS = `
  query ProviderReviews($input: ReviewByProviderInput!) {
    reviewByProvider(input: $input) {
      summary {
        average
        count
        histogram { one two three four five }
      }
      reviews { id rating comment authorName createdAt }
    }
  }`;

const CITIES = `
  query ProviderCities {
    providerCities(input: {}) { city count }
  }`;

export interface CityFacet {
  city: string;
  count: number;
}

/**
 * The variables `providerList` wants, from what the URL says.
 *
 * Every empty value is omitted rather than sent as null or "": the backend
 * treats an absent field as "no filter", and sending a blank one would depend
 * on it trimming to the same conclusion. It is also what keeps the query key
 * below stable — `{}` and `{ city: undefined }` serialise differently.
 */
function listVariables(search: DirectorySearch, locale: string) {
  return {
    limit: DIRECTORY_PAGE_SIZE,
    offset: search.offset ?? 0,
    locale,
    ...(search.q ? { search: search.q } : {}),
    ...(search.city ? { city: search.city } : {}),
    ...(search.providerType ? { type: search.providerType } : {}),
    ...(search.category ? { categoryCode: search.category } : {}),
    ...(search.minRating ? { minRating: search.minRating } : {}),
    ...(search.verified ? { verifiedOnly: true } : {}),
    ...(search.minPrice != null ? { minPriceMinor: search.minPrice } : {}),
    ...(search.maxPrice != null ? { maxPriceMinor: search.maxPrice } : {}),
    ...(search.sort ? { sort: search.sort } : {}),
  };
}

/**
 * Query definitions. Components consume these via useQuery(...).
 *
 * No `credentials` anywhere in this path — see `publicGraphql`. The query key is
 * deliberately NOT scoped to a user: this data is identical for everyone, so
 * scoping it per session would fragment the cache and defeat the point of a
 * page that is meant to be cacheable.
 */
export const directoryQueries = {
  /**
   * The whole search is the key, not only the term.
   *
   * Two different filters are two different result sets, and sharing a key
   * would serve the first one's providers under the second one's query — the
   * bug the original `search`-only key already guarded against, now that there
   * are eight more things that can change the answer. The locale is in it too:
   * the category names on each card are resolved server-side, so the same
   * filters in two languages are two different payloads.
   */
  list: (search: DirectorySearch, locale: string) =>
    queryOptions({
      queryKey: ["public", "providers", locale, search] as const,
      // The whole page, not just its rows. `total` is how many providers match
      // before the page size cuts in, and the results line is meant to state
      // that number — counting the array instead makes 40 matches read as 20,
      // which is the page size talking rather than the search.
      queryFn: async (): Promise<ProviderPageDTO> => {
        const d = await publicGraphql<{ providerList: ProviderPageDTO }>(LIST, {
          input: listVariables(search, locale),
        });
        return d.providerList;
      },
    }),

  /**
   * The cities the filter may offer.
   *
   * Its own query, and deliberately not keyed on the current filters: a city
   * list that shrank as you filtered would strand somebody who picked Matola
   * with no way back to Maputo.
   */
  cities: () =>
    queryOptions({
      queryKey: ["public", "provider-cities"] as const,
      queryFn: async (): Promise<CityFacet[]> => {
        const d = await publicGraphql<{ providerCities: CityFacet[] }>(CITIES, {});
        return d.providerCities;
      },
    }),

  /**
   * A business's published reviews and what they add up to.
   *
   * Its own query rather than a field on the provider: the page shows a first
   * page of ten and the summary is over every one of them, and folding that
   * into `providerBySlug` would make the directory — which needs neither —
   * carry both on every card it draws.
   */
  reviews: (providerId: string, limit = 10) =>
    queryOptions({
      queryKey: ["public", "provider-reviews", providerId, limit] as const,
      queryFn: async (): Promise<ProviderReviewsPublicDTO> => {
        const d = await publicGraphql<{ reviewByProvider: ProviderReviewsPublicDTO }>(REVIEWS, {
          input: { providerId, limit },
        });
        return d.reviewByProvider;
      },
    }),

  bySlug: (slug: string, locale: string) =>
    queryOptions({
      queryKey: ["public", "provider", slug, locale] as const,
      queryFn: async (): Promise<ProviderPublicDetailDTO | null> => {
        const d = await publicGraphql<{ providerBySlug: ProviderPublicDetailDTO | null }>(BY_SLUG, {
          input: { slug, locale },
        });
        // null is a legitimate answer, not an error: the backend returns it for
        // both a missing slug and a deactivated provider, deliberately
        // indistinguishable so an anonymous caller cannot enumerate hidden
        // businesses.
        return d.providerBySlug;
      },
    }),
};
