import { createFileRoute } from "@tanstack/react-router";
import { ProviderActivityPage } from "@/features/activity/ui/provider-activity-page";

export const Route = createFileRoute("/provider/$slug/activity")({
  component: ProviderActivityPage,
});
