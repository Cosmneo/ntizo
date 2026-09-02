import { createFileRoute } from "@tanstack/react-router";
import { AdminReviewsPage } from "@/features/admin/reviews/ui/reviews-page";

export const Route = createFileRoute("/admin/reviews")({
  component: AdminReviewsPage,
});
