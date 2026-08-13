import { createFileRoute } from "@tanstack/react-router";
import { ServiceWizardPage } from "@/features/provider/services/ui/service-wizard-page";

/** `$serviceId` is a service UUID or the literal `new` — the two cannot collide, since service ids are UUIDs. */
export const Route = createFileRoute("/provider/$slug/services/$serviceId")({
  component: ServiceWizardPage,
});
