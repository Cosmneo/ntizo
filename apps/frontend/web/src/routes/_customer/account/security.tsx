import { createFileRoute } from "@tanstack/react-router";
import { SecurityPage } from "@/features/account/ui/section-pages";

export const Route = createFileRoute("/_customer/account/security")({
  component: SecurityPage,
});
