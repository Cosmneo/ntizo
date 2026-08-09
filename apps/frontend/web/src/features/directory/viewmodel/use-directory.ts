import { useSuspenseQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { directoryQueries } from "@/features/directory/data/directory.repository";

/**
 * The only path from `ui/` and `routes/` to the directory's `data/` layer.
 *
 * Both of those classify as elements that may not reach `data` directly — the
 * boundaries lint rejects it, and it caught this exact import when the page was
 * first written. The indirection is not decoration: it is the one legal route.
 */
export function useDirectory(): ProviderPublicDTO[] {
  const { data } = useSuspenseQuery(directoryQueries.list());
  return data;
}

/**
 * Primes the cache before render so `useDirectory` resolves during SSR and the
 * listings land in the HTML a crawler receives. Called from the route loader,
 * which cannot use hooks.
 */
export function prefetchDirectory(queryClient: QueryClient): Promise<unknown> {
  return queryClient.ensureQueryData(directoryQueries.list());
}
