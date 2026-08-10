import { createFileRoute } from "@tanstack/react-router";
import { AddressesPage } from "@/features/account/ui/section-pages";

export const Route = createFileRoute("/_customer/account/addresses")({
  component: AddressesPage,
});
