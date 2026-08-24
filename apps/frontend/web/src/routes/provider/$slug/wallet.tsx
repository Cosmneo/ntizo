import { createFileRoute } from "@tanstack/react-router";
import { ProviderWalletPage } from "@/features/wallet/ui/provider-wallet-page";

export const Route = createFileRoute("/provider/$slug/wallet")({
  component: ProviderWalletPage,
});
