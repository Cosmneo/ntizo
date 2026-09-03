import { createFileRoute } from "@tanstack/react-router";
import { AdminSupportPage } from "@/features/admin/support/ui/support-page";

export const Route = createFileRoute("/admin/support")({
  component: AdminSupportPage,
});
