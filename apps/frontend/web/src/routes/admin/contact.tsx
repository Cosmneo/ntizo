import { createFileRoute } from "@tanstack/react-router";
import { AdminContactPage } from "@/features/admin/contact/ui/contact-page";

export const Route = createFileRoute("/admin/contact")({
  component: AdminContactPage,
});
