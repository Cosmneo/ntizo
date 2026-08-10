import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "@/features/account/ui/account-page";

export const Route = createFileRoute("/_customer/account/")({
  component: AccountPage,
});
