import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import i18n from "@/shared/lib/i18n";
import type { BrowseSort, ServicePageDTO } from "@/features/directory/services/domain/types";
import {
  browseServicesQueries,
  type ServiceCityFacet,
} from "@/features/directory/services/data/service.repository";

/**
 * Every published service, for the platform-wide browse.
 *
 * `useSuspenseQuery`, like the provider directory and for the same reason:
 * this page is server-rendered so a crawler finds the listings in the HTML. A
 * plain `useQuery` renders its loading state on the server and ships a page
 * with nothing in it — the one outcome a page built to rank must not have.
 */
export interface BrowseNarrowing {
  category?: string | undefined;
  locationType?: string | undefined;
  /** `fixed`, `hourly` or `quote` — see `SERVICE_PAYMENT_MODES`. */
  paymentMode?: string | undefined;
  /** `individual` or `organization`. */
  providerType?: string | undefined;
  /** A locale the listing is written in — not a language anybody speaks. */
  language?: string | undefined;
  /** The provider's city. A `remote` service matches every city — it has none. */
  city?: string | undefined;
  /**
   * Inclusive bounds on the cheapest option, in *whole* units of currency.
   *
   * Whole units because that is what the URL carries and what the reader
   * typed. `toMinor` below is the single place they become the minor units the
   * API speaks — doing it at both call sites is how the server-rendered first
   * page and the client's refetch end up asking two different questions.
   */
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  /** Free text, already trimmed by the route's `validateSearch`. */
  q?: string | undefined;
  sort?: BrowseSort | undefined;
  offset: number;
}

/**
 * Whole units of currency to minor units, preserving "not set".
 *
 * `undefined` in, `undefined` out — a bound nobody set must not become 0,
 * which is a bound meaning "free and up" and would quietly exclude nothing
 * while still counting as a narrowing.
 */
function toMinor(amount: number | undefined): number | undefined {
  return amount === undefined ? undefined : Math.round(amount * 100);
}

export function useBrowseServices(narrowing: BrowseNarrowing): ServicePageDTO {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { data } = useSuspenseQuery(
    browseServicesQueries.page({
      locale,
      categoryCode: narrowing.category,
      locationType: narrowing.locationType,
      paymentMode: narrowing.paymentMode,
      providerType: narrowing.providerType,
      language: narrowing.language,
      city: narrowing.city,
      minPriceMinor: toMinor(narrowing.minPrice),
      maxPriceMinor: toMinor(narrowing.maxPrice),
      q: narrowing.q,
      sort: narrowing.sort,
      offset: narrowing.offset,
    }),
  );
  return data;
}

/**
 * The cities the services filter may offer, with how many services each holds.
 *
 * `useQuery`, not `useSuspenseQuery` — the same split `useProviderCities`
 * documents: this is a control, not the content a crawler came for, and
 * suspending the whole page on it would hold the listings behind a second
 * round trip. An empty array while it is in flight renders no city group at
 * all, which is the same thing a platform with one city renders.
 *
 * It exists so `ui/` can reach `browseServicesQueries.cities` at all: the
 * boundaries lint forbids a `ui` file from importing `data`, and this hook is
 * the one legal route — the same reason `useBrowseServices` sits here.
 */
export function useServiceCities(): ServiceCityFacet[] {
  const { data } = useQuery(browseServicesQueries.cities());
  return data ?? [];
}

/**
 * Primes the cache before render so the suspense query resolves on the server.
 *
 * The locale comes from the i18next singleton rather than the router context,
 * which carries only a `queryClient`. That is the same source the hook reads
 * through `useTranslation`, so the two agree and the key matches — and the
 * pattern `useProviderServices` and the category browse already follow. If
 * they ever disagreed the client would simply fetch once more, which is a
 * wasted request rather than wrong text.
 */
export function prefetchBrowseServices(
  queryClient: QueryClient,
  narrowing: BrowseNarrowing,
): Promise<void> {
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return queryClient.ensureQueryData(
    browseServicesQueries.page({
      locale,
      categoryCode: narrowing.category,
      locationType: narrowing.locationType,
      paymentMode: narrowing.paymentMode,
      providerType: narrowing.providerType,
      language: narrowing.language,
      city: narrowing.city,
      minPriceMinor: toMinor(narrowing.minPrice),
      maxPriceMinor: toMinor(narrowing.maxPrice),
      q: narrowing.q,
      sort: narrowing.sort,
      offset: narrowing.offset,
    }),
  ) as unknown as Promise<void>;
}
