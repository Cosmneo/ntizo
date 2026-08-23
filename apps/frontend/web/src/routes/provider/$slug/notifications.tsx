import { createFileRoute } from "@tanstack/react-router";
import { ProviderNotificationsPage } from "@/features/notifications/ui/provider-notifications-page";

export const Route = createFileRoute("/provider/$slug/notifications")({
  component: ProviderNotificationsPage,
});
