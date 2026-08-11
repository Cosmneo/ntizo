import { createFileRoute } from "@tanstack/react-router";
import { AdminCategoriesPage } from "@/features/admin/categories/ui/categories-page";

export const Route = createFileRoute("/admin/categories")({
  component: AdminCategoriesPage,
});
