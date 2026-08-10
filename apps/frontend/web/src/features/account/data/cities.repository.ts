import { queryOptions } from "@tanstack/react-query";
import type { CityPublicDTO } from "@ntizo/shared";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";

const SEARCH = `
  query CitySearch($input: CitySearchInput!) {
    citySearch(input: $input) {
      id name country admin1
    }
  }`;

/**
 * Cities for the address form, from the GeoNames gazetteer the backend holds.
 *
 * Not scoped to a user, and cached for a long time on purpose: the answer is
 * the same for everyone and does not change between two runs of the app. The
 * cost of a stale entry is a city that was renamed still showing its old name;
 * the cost of refetching is a request on every keystroke of a form somebody is
 * already halfway through.
 */
export const cityQueries = {
  search: (country: string, query: string) =>
    queryOptions({
      // Both country and query are in the key. Sharing a key across queries
      // would serve "ma" results under "na", which in a picker reads as the
      // field ignoring what was typed.
      queryKey: ["public", "cities", country, query] as const,
      queryFn: async (): Promise<CityPublicDTO[]> => {
        const d = await publicGraphql<{ citySearch: CityPublicDTO[] }>(SEARCH, {
          // Omitted rather than sent empty: the backend reads an absent query
          // as "the country's largest", and sending "" would depend on it
          // trimming to the same conclusion.
          input: { country, ...(query ? { query } : {}) },
        });
        return d.citySearch;
      },
      // A gazetteer does not go stale in a session.
      staleTime: 60 * 60 * 1000,
      // Two letters of a country code is not enough to ask about; an empty one
      // would be a validation error from the backend on every fresh form.
      enabled: country.length === 2,
    }),
};
