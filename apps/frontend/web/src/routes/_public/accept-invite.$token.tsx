import { createFileRoute } from "@tanstack/react-router";
import { AcceptInvite } from "@/features/auth/components/accept-invite";

export const Route = createFileRoute("/_public/accept-invite/$token")({
  component: AcceptInvite,
});
