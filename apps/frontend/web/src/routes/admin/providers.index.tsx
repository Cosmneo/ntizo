import { createFileRoute } from "@tanstack/react-router";
import { AdminProvidersPage } from "@/features/admin/providers/ui/providers-page";

export const Route = createFileRoute("/admin/providers/")({
  component: AdminProvidersPage,
});
