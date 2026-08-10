import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/features/account/ui/section-pages";

export const Route = createFileRoute("/_customer/account/legal")({
  component: LegalPage,
});
