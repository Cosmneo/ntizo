import { createFileRoute } from "@tanstack/react-router";
import { OverviewPage } from "@/features/provider/ui/overview";

export const Route = createFileRoute("/provider/overview")({
  component: OverviewPage,
});
