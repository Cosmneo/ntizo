import { useQuery } from "@tanstack/react-query";
import { cityQueries } from "@/features/account/data/cities.repository";

/**
 * The only path from `ui/` to the city data layer — the boundaries lint
 * rejects a direct import, and that rule is the reason this file exists.
 *
 * `useQuery`, not `useSuspenseQuery`: this fires while someone is typing into
 * a field, and suspending would unmount the input mid-keystroke and take the
 * focus and the caret with it. The picker shows what it last had until the
 * next answer arrives.
 */
export function useCities(country: string, query: string): {
  cities: string[];
  loading: boolean;
} {
  const { data, isFetching } = useQuery(cityQueries.search(country, query));
  return {
    // Names only. The picker writes a name into the form, and the id and the
    // admin code exist to disambiguate, which is a job for the day the list
    // shows two rows spelled the same.
    cities: data?.map((c) => c.name) ?? [],
    loading: isFetching,
  };
}
