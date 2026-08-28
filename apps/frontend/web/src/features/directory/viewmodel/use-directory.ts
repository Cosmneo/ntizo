import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { ProviderPageDTO, ProviderReviewsPublicDTO, ProviderPublicDetailDTO } from "@ntizo/shared/read-models";
import {
  directoryQueries,
  type CityFacet,
} from "@/features/directory/data/directory.repository";
import type { DirectorySearch } from "@/features/directory/domain/directory-search";

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
 * Returns `total` alongside `items` because the two answer different questions:
 * `items.length` is how many fit on this page, `total` is how many matched. The
 * results line wants the second, and said the first until `providerList` began
 * reporting both.
 */
export function useDirectory(search: DirectorySearch, locale: string): ProviderPageDTO {
  const { data } = useSuspenseQuery(directoryQueries.list(search, locale));
  return data;
}

/**
 * The cities the filter offers.
 *
 * `useQuery`, not `useSuspenseQuery`: this one is a control, not content. A
 * crawler does not need the filter's options in the HTML, and suspending the
 * whole page on them would hold the listings — the thing the page exists to
 * show — behind a second round trip.
 */
export function useProviderCities(): CityFacet[] {
  const { data } = useQuery(directoryQueries.cities());
  return data ?? [];
}

/**
 * Primes the cache before render so `useDirectory` resolves during SSR and the
 * listings land in the HTML a crawler receives. Called from the route loader,
 * which cannot use hooks.
 */
export function prefetchDirectory(
  queryClient: QueryClient,
  search: DirectorySearch,
  locale: string,
): Promise<unknown> {
  return queryClient.ensureQueryData(directoryQueries.list(search, locale));
}

/**
 * A business's reviews.
 *
 * `useQuery`, not `useSuspenseQuery`: the provider's name, description and
 * services are what a crawler indexes and what a reader came for, and holding
 * all of it behind a second round trip to fetch verdicts would make the page
 * slower for everyone to render the part nobody scrolled to yet.
 *
 * `limit` is optional and forwarded as-is. `directoryQueries.reviews` already
 * keys its cache on it, so raising it — the only thing `ProviderReviews`'s
 * "see all" button does — asks for a second, larger cache entry rather than
 * mutating the first; no pagination state belongs here.
 */
export function useProviderReviews(
  providerId: string,
  limit?: number,
): ProviderReviewsPublicDTO | undefined {
  const { data } = useQuery(directoryQueries.reviews(providerId, limit));
  return data;
}

export function useProviderDetail(slug: string, locale: string): ProviderPublicDetailDTO | null {
  const { data } = useSuspenseQuery(directoryQueries.bySlug(slug, locale));
  return data;
}

export function prefetchProviderDetail(
  queryClient: QueryClient,
  slug: string,
  locale: string,
): Promise<ProviderPublicDetailDTO | null> {
  return queryClient.ensureQueryData(directoryQueries.bySlug(slug, locale));
}
