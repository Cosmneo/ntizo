import { createFileRoute } from "@tanstack/react-router";
import { AddressesPage } from "@/features/account/ui/addresses-page";

export const Route = createFileRoute("/_customer/account/addresses")({
  component: AddressesPage,
});
