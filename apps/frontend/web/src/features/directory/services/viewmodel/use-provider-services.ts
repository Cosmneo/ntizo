import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { providerServicesQueries } from "@/features/directory/services/data/service.repository";

/**
 * The only path from `ui/` to this feature's `data/` layer.
 *
 * The published services of one provider, already in the reader's own
 * language. A plain `useQuery`, not suspense: this section renders inside a
 * page whose own headline content (name, description) is what SSR exists to
 * serve a crawler — see `provider-detail-page.tsx`. This list follows the
 * same lighter pattern the platform's own category browse already uses for
 * a page-level `ssr: true` route (`useCategoryPreview`, `categories.index.tsx`):
 * fetched client-side, locale resolved from i18next rather than threaded
 * through the route loader. A skeleton here costs nothing SSR is for.
 */
export function useProviderServices(providerId: string) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return useQuery(providerServicesQueries.byProvider(providerId, locale));
}
