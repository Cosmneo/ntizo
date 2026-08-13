import { useSuspenseQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import i18n from "@/shared/lib/i18n";
import type { ServicePageDTO } from "@/features/directory/services/domain/types";
import { browseServicesQueries } from "@/features/directory/services/data/service.repository";

/**
 * Every published service, for the platform-wide browse.
 *
 * `useSuspenseQuery`, like the provider directory and for the same reason:
 * this page is server-rendered so a crawler finds the listings in the HTML. A
 * plain `useQuery` renders its loading state on the server and ships a page
 * with nothing in it — the one outcome a page built to rank must not have.
 */
export function useBrowseServices(
  categoryCode: string | undefined,
  offset: number,
): ServicePageDTO {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { data } = useSuspenseQuery(browseServicesQueries.page(locale, categoryCode, offset));
  return data;
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
  categoryCode: string | undefined,
  offset: number,
): Promise<void> {
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return queryClient.ensureQueryData(
    browseServicesQueries.page(locale, categoryCode, offset),
  ) as unknown as Promise<void>;
}
