import { createFileRoute } from "@tanstack/react-router";
import { AvailabilityPage } from "@/features/provider/availability/ui/availability-page";

export const Route = createFileRoute("/provider/$slug/availability")({
  component: AvailabilityPage,
});
