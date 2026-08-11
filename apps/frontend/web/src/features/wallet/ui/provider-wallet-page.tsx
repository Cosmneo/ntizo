import { useTranslation } from "react-i18next";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { usePageHeader } from "@/shared/lib/page-header";
import { WalletPanel } from "./wallet-panel";

/**
 * The workspace's money, in the provider's own zone.
 *
 * The same panel the administrator sees, because it is the same wallet. What
 * differs is only which workspace it is asked about, and that comes from the
 * zone the person is standing in.
 */
export function ProviderWalletPage() {
  const { t } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();

  usePageHeader(t("nav.wallet"), activeProvider?.name);

  if (!activeProvider) return null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <WalletPanel providerId={activeProvider.id} />
    </div>
  );
}
