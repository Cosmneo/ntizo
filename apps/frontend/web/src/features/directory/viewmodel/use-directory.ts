import { useSuspenseQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { ProviderPublicDTO } from "@ntizo/shared";
import type { ProviderPageDTO } from "@ntizo/shared/read-models";
import { directoryQueries } from "@/features/directory/data/directory.repository";

/**
 * The only path from `ui/` and `routes/` to the directory's `data/` layer.
 *
 * Both of those classify as elements that may not reach `data` directly — the
 * boundaries lint rejects it, and it caught this exact import when the page was
 * first written. The indirection is not decoration: it is the one legal route.
 */
/**
 * The page of providers, not only its rows.
 *
 * Returns `total` alongside `items` because the two answer different
 * questions: `items.length` is how many fit on this page, `total` is how many
 * matched. The results line wants the second, and said the first until
 * `providerList` began reporting both.
 */
export function useDirectory(search = ""): ProviderPageDTO {
  const { data } = useSuspenseQuery(directoryQueries.list(0, search));
  return data;
}

/**
 * Primes the cache before render so `useDirectory` resolves during SSR and the
 * listings land in the HTML a crawler receives. Called from the route loader,
 * which cannot use hooks.
 */
export function prefetchDirectory(
  queryClient: QueryClient,
  search = "",
): Promise<unknown> {
  return queryClient.ensureQueryData(directoryQueries.list(0, search));
}

export function useProviderDetail(slug: string): ProviderPublicDTO | null {
  const { data } = useSuspenseQuery(directoryQueries.bySlug(slug));
  return data;
}

export function prefetchProviderDetail(
  queryClient: QueryClient,
  slug: string,
): Promise<ProviderPublicDTO | null> {
  return queryClient.ensureQueryData(directoryQueries.bySlug(slug));
}
