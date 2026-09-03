import { createFileRoute } from "@tanstack/react-router";
import { AdminSupportRequestPage } from "@/features/admin/support/ui/support-request-page";

export const Route = createFileRoute("/admin/support/$threadId")({
  component: AdminSupportRequestPage,
});
