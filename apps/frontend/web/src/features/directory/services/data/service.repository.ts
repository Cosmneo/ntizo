import { queryOptions } from "@tanstack/react-query";
import type { ServicePageDTO } from "@ntizo/shared/read-models";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";
import { BROWSE_PAGE_SIZE, type BrowseSort } from "@/features/directory/services/domain/types";

const ALL = `
  query ServiceAll($input: ServiceAllInput!) {
    serviceAll(input: $input) {
      items {
        id providerId providerName categoryCode name description
        locationType bookingMode imageUrls isFallback
        defaultOption { amountMinor currency durationMinutes minMinutes stepMinutes pricingMode }
      }
      nextOffset
    }
  }`;

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
        input.sort ?? null,
        input.offset,
      ] as const,
      queryFn: async (): Promise<ServicePageDTO> => {
        const d = await publicGraphql<{ serviceAll: ServicePageDTO }>(ALL, {
          input: {
            locale: input.locale,
            ...(input.categoryCode ? { categoryCode: input.categoryCode } : {}),
            ...(input.locationType ? { locationType: input.locationType } : {}),
            ...(input.sort ? { sort: input.sort } : {}),
            limit: BROWSE_PAGE_SIZE,
            offset: input.offset,
          },
        });
        return d.serviceAll;
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
