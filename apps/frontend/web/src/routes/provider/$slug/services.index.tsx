import { createFileRoute } from "@tanstack/react-router";
import { ServicesPage } from "@/features/provider/services/ui/services-page";

export const Route = createFileRoute("/provider/$slug/services/")({
  component: ServicesPage,
});
