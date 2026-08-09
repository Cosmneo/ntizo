import { queryOptions } from "@tanstack/react-query";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";
import { DIRECTORY_PAGE_SIZE } from "@/features/directory/domain/provider-listing";

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
};
