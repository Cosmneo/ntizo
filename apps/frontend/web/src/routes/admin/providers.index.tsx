import { createFileRoute } from "@tanstack/react-router";
import { parseProvidersSearch } from "@/features/admin/providers/domain/providers-search";
import { AdminProvidersPage } from "@/features/admin/providers/ui/providers-page";

export const Route = createFileRoute("/admin/providers/")({
  validateSearch: parseProvidersSearch,
  component: AdminProvidersPage,
});
