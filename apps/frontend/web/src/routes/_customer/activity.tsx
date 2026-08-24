import { createFileRoute } from "@tanstack/react-router";
import { CustomerActivityPage } from "@/features/activity/ui/customer-activity-page";

export const Route = createFileRoute("/_customer/activity")({
  component: CustomerActivityPage,
});
