import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPage } from "@/features/account/ui/section-pages";

export const Route = createFileRoute("/_customer/account/notifications")({
  component: NotificationsPage,
});
