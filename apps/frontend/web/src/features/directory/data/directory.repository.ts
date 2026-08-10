import { queryOptions } from "@tanstack/react-query";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";
import { DIRECTORY_PAGE_SIZE } from "@/features/directory/domain/provider-listing";

const BY_SLUG = `
  query ProviderBySlug($input: ProviderBySlugInput!) {
    providerBySlug(input: $input) {
      id name slug type description city district country
    }
  }`;

const LIST = `
  query ProviderList($input: ProviderListInput!) {
    providerList(input: $input) {
      id name slug type description city district country
    }
  }`;

/**
 * Query definitions. Components consume these via useQuery(...).
 *
 * No `credentials` anywhere in this path — see `publicGraphql`. The query key
 * is deliberately NOT scoped to a user: this data is identical for everyone,
 * so scoping it per session would fragment the cache and defeat the point of a
 * page that is meant to be cacheable.
 */
export const directoryQueries = {
  list: (offset = 0) =>
    queryOptions({
      queryKey: ["public", "providers", offset] as const,
      queryFn: async (): Promise<ProviderPublicDTO[]> => {
        const d = await publicGraphql<{ providerList: ProviderPublicDTO[] }>(LIST, {
          input: { limit: DIRECTORY_PAGE_SIZE, offset },
        });
        return d.providerList;
      },
    }),

  bySlug: (slug: string) =>
    queryOptions({
      queryKey: ["public", "provider", slug] as const,
      queryFn: async (): Promise<ProviderPublicDTO | null> => {
        const d = await publicGraphql<{ providerBySlug: ProviderPublicDTO | null }>(
          BY_SLUG,
          { input: { slug } },
        );
        // null is a legitimate answer, not an error: the backend returns it for
        // both a missing slug and a deactivated provider, deliberately
        // indistinguishable so an anonymous caller cannot enumerate hidden
        // businesses.
        return d.providerBySlug;
      },
    }),
};
