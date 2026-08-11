import { createFileRoute } from "@tanstack/react-router";
import { AdminProviderDetailPage } from "@/features/admin/providers/ui/provider-detail-page";

export const Route = createFileRoute("/admin/providers/$providerId")({
  component: AdminProviderDetailPage,
});
