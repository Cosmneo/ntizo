import { createFileRoute } from "@tanstack/react-router";
import { AdminActivityPage } from "@/features/activity/ui/admin-activity-page";

export const Route = createFileRoute("/admin/activity")({
  component: AdminActivityPage,
});
