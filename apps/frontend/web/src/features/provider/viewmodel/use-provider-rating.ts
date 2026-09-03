import { useQuery } from "@tanstack/react-query";
import { directoryQueries } from "@/features/directory/data/directory.repository";

/**
 * The workspace's public rating, read through the public query the provider's
 * own page uses. One review is fetched rather than ten: the dashboard shows
 * the summary, and the summary comes back whatever the limit.
 *
 * A hook rather than the page calling `directoryQueries` itself, because a
 * `ui/` file may not import a `data/` one — the same rule
 * `useProviderThreads` exists for.
 *
 * `enabled` is set here rather than in the query definition: the directory's
 * own pages always have a provider by the time they ask, so
 * `directoryQueries.reviews` carries no guard, and without one here the
 * dashboard would fire a request for the empty id while the workspace is
 * still resolving.
 */
export function useProviderRating(providerId: string) {
  return useQuery({
    ...directoryQueries.reviews(providerId, 1),
    enabled: providerId !== "",
    select: (data) => data.summary,
  });
}
