import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "@/features/account/pages/account";

export const Route = createFileRoute("/provider/account")({
  component: AccountPage,
});
