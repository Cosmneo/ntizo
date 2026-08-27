import { queryOptions } from "@tanstack/react-query";
import type { ServicePageDTO } from "@ntizo/shared/read-models";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";
import { BROWSE_PAGE_SIZE, type BrowseSort } from "@/features/directory/services/domain/types";

/**
 * The fields both service listings ask for.
 *
 * Its own exported constant so a test can assert the selection set contains
 * what the cards read. Nothing else can: every card test builds a complete
 * fixture, and every repository test replaces the transport with a double
 * that answers whatever it is asked, so a field left out of this string is
 * invisible to the whole suite. The server does not object either — an
 * unrequested field is absent, not an error, and `undefined` renders as
 * nothing.
 *
 * `providerSlug` was missing here for exactly one release. Every card in the
 * browse linked to `/providers/undefined` while the suite stayed green.
 */
export const SERVICE_FIELDS = `
  id providerId providerSlug providerName providerType providerRatingAverage providerReviewCount
  categoryCode categoryName name description
  locationType bookingMode imageUrls isFallback fromAmountMinor optionCount
  defaultOption { amountMinor currency durationMinutes minMinutes stepMinutes pricingMode }`;

const ALL = `
  query ServiceAll($input: ServiceAllInput!) {
    serviceAll(input: $input) {
      items {${SERVICE_FIELDS}
      }
      nextOffset
      total
    }
  }`;

const CITIES = `
  query ServiceCities {
    serviceCities(input: {}) { city count }
  }`;

export interface ServiceCityFacet {
  city: string;
  count: number;
}

/**
 * How many of a provider's own services the public page asks for at once.
 *
 * There is no "load more" on this section yet — a business with more
 * services than this fits on one screen is not the launch case this page is
 * built for, and paging it is a separate piece of work, not a silent gap in
 * this one.
 */
export const PROVIDER_SERVICES_PAGE_SIZE = 24;

/**
 * Query definitions for a provider's public services.
 *
 * `providerId` filters `service.all` to one business rather than fetching
 * every published service on the platform and filtering in the browser —
 * that would page through the whole catalogue to show one business's
 * handful. See `packages/backend/.../public/catalog/graphql/schema/queries.ts`
 * for the argument this repository relies on.
 *
 * No `credentials` here, same as `directoryQueries`: this is the anonymous
 * `/public/graphql` endpoint, and the query key is not scoped to a session —
 * a provider's published services are identical for every visitor.
 */
/**
 * Every published service, for the platform-wide browse.
 *
 * The same `service.all` the provider page uses, without `providerId`. The
 * category is part of the query key rather than only its variables: two
 * categories are two different result sets and sharing a key would serve the
 * first one's items under the second one's heading.
 */
export const browseServicesQueries = {
  page: (input: {
    locale: string;
    categoryCode?: string | undefined;
    locationType?: string | undefined;
    paymentMode?: string | undefined;
    providerType?: string | undefined;
    language?: string | undefined;
    city?: string | undefined;
    minPriceMinor?: number | undefined;
    maxPriceMinor?: number | undefined;
    q?: string | undefined;
    sort?: BrowseSort | undefined;
    offset: number;
  }) =>
    queryOptions({
      // Every narrowing is part of the key. Two filters are two result sets,
      // and sharing a key would serve the first one's items under the
      // second one's heading.
      queryKey: [
        "public",
        "browse-services",
        input.locale,
        input.categoryCode ?? null,
        input.locationType ?? null,
        input.paymentMode ?? null,
        input.providerType ?? null,
        input.language ?? null,
        input.city ?? null,
        input.minPriceMinor ?? null,
        input.maxPriceMinor ?? null,
        input.q ?? null,
        input.sort ?? null,
        input.offset,
      ] as const,
      queryFn: async (): Promise<ServicePageDTO> => {
        const d = await publicGraphql<{ serviceAll: ServicePageDTO }>(ALL, {
          input: {
            locale: input.locale,
            ...(input.categoryCode ? { categoryCode: input.categoryCode } : {}),
            ...(input.locationType ? { locationType: input.locationType } : {}),
            ...(input.paymentMode ? { paymentMode: input.paymentMode } : {}),
            ...(input.providerType ? { providerType: input.providerType } : {}),
            ...(input.language ? { language: input.language } : {}),
            ...(input.city ? { city: input.city } : {}),
            // `!== undefined`, not truthiness: a lower bound of 0 is a bound
            // somebody set, and `if (min)` would silently drop "from free".
            ...(input.minPriceMinor !== undefined ? { minPriceMinor: input.minPriceMinor } : {}),
            ...(input.maxPriceMinor !== undefined ? { maxPriceMinor: input.maxPriceMinor } : {}),
            ...(input.q ? { q: input.q } : {}),
            ...(input.sort ? { sort: input.sort } : {}),
            limit: BROWSE_PAGE_SIZE,
            offset: input.offset,
          },
        });
        return d.serviceAll;
      },
    }),

  /**
   * The cities the filter may offer.
   *
   * Its own query, and deliberately not keyed on the current filters — the
   * same reason `directoryQueries.cities` isn't: a city list that shrank as
   * you filtered would strand somebody who picked Matola with no way back to
   * Maputo.
   */
  cities: () =>
    queryOptions({
      queryKey: ["public", "service-cities"] as const,
      queryFn: async (): Promise<ServiceCityFacet[]> => {
        const d = await publicGraphql<{ serviceCities: ServiceCityFacet[] }>(CITIES, {});
        return d.serviceCities;
      },
    }),
};

export const providerServicesQueries = {
  byProvider: (providerId: string, locale: string) =>
    queryOptions({
      queryKey: ["public", "provider-services", providerId, locale] as const,
      queryFn: async (): Promise<ServicePageDTO> => {
        const d = await publicGraphql<{ serviceAll: ServicePageDTO }>(ALL, {
          input: {
            providerId,
            locale,
            limit: PROVIDER_SERVICES_PAGE_SIZE,
            offset: 0,
          },
        });
        return d.serviceAll;
      },
    }),
};
