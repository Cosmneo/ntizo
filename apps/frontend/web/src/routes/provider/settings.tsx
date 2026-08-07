import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/provider/ui/settings";

export const Route = createFileRoute("/provider/settings")({
  component: SettingsPage,
});
