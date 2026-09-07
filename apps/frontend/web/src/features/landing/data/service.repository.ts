import { queryOptions } from "@tanstack/react-query";
import type { ServicePageDTO } from "@ntizo/shared/read-models";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";
import { SERVICE_FIELDS } from "@/features/directory/services/data/service.repository";

/**
 * The services the home page puts under "popular".
 *
 * `SERVICE_FIELDS` is imported rather than restated: the home page draws the
 * browse's own `ServiceTile`, so a field the browse adds and this string
 * forgets is a field the tile silently renders as nothing.
 */
const POPULAR = `
  query LandingPopularServices($input: ServiceAllInput!) {
    serviceAll(input: $input) {
      items {${SERVICE_FIELDS}
      }
      nextOffset
      total
    }
  }`;

export const landingServiceQueries = {
  /**
   * Its own query rather than the browse's first page, for the reason
   * `landingProviderQueries.popular` and `categoryQueries.preview` both give:
   * the two want different sizes, and sharing a cache entry would make the
   * home page render whatever the browse had last filtered down to.
   *
   * No `sort`, which is the provider's own arrangement — what `/services`
   * calls "Sugeridos". `newest` and `price` each discard that arrangement,
   * and neither answers what a home page means by "popular".
   *
   * The locale is in the key because the tile prints the category name the
   * server resolved.
   */
  popular: (locale: string, limit: number) =>
    queryOptions({
      queryKey: ["public", "services", "popular", locale, limit] as const,
      queryFn: async (): Promise<ServicePageDTO> => {
        const d = await publicGraphql<{ serviceAll: ServicePageDTO }>(POPULAR, {
          input: { locale, limit, offset: 0 },
        });
        return d.serviceAll;
      },
    }),
};
