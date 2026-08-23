import { useTranslation } from "react-i18next";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { usePageHeader } from "@/shared/lib/page-header";
import { NotificationsPage } from "@/features/notifications/ui/notifications-page";

/**
 * The workspace's inbox, in the provider's own zone.
 *
 * Every sibling under `/provider/$slug` resolves its workspace the same way
 * — `useActiveProvider()`, guard on it being resolved yet, feed its id
 * downward — and this does not invent a second mechanism (see
 * `ProviderWalletPage`, `ProviderActivityPage`). The width constraint and the
 * `usePageHeader` call live here rather than in `NotificationsPage` itself,
 * because the customer route renders that component with neither: this
 * wrapper is the zone-specific half, `NotificationsPage` is the shared one.
 */
export function ProviderNotificationsPage() {
  const { t } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();

  usePageHeader(t("nav.notifications"), activeProvider?.name);

  if (!activeProvider) return null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <NotificationsPage scope={{ kind: "provider", providerId: activeProvider.id }} />
    </div>
  );
}
