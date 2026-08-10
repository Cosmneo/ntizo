import { createFileRoute } from "@tanstack/react-router";
import { PreferencesPage } from "@/features/account/ui/section-pages";

export const Route = createFileRoute("/_customer/account/preferences")({
  component: PreferencesPage,
});
