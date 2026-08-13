import { useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ServiceDetailDTO } from "@ntizo/shared/read-models";
import i18n from "@/shared/lib/i18n";
import { serviceDetailQueries } from "@/features/directory/services/data/service-detail.repository";

/**
 * `useSuspenseQuery`, like the browse and for the same reason: this page is
 * server-rendered so a crawler finds the service in the HTML. A plain
 * `useQuery` renders its loading state on the server and ships a page with
 * nothing in it — the one outcome a page built to rank must not have.
 */
export function useServiceDetail(id: string): ServiceDetailDTO | null {
  const { i18n: instance } = useTranslation();
  const locale = instance.resolvedLanguage ?? instance.language;
  const { data } = useSuspenseQuery(serviceDetailQueries.byId({ id, locale }));
  return data;
}

export function prefetchServiceDetail(
  queryClient: QueryClient,
  id: string,
): Promise<ServiceDetailDTO | null> {
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return queryClient.ensureQueryData(serviceDetailQueries.byId({ id, locale }));
}
