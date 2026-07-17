import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/features/admin/dashboard/pages/dashboard";

export const Route = createFileRoute("/admin/dashboard")({
  component: DashboardPage,
});
