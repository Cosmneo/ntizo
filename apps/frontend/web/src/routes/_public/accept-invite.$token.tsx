import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "@/shared/lib/api/auth-client";
import { AcceptInvite } from "@/features/auth/components/accept-invite";
import { resolveAcceptInviteGuard } from "./accept-invite-guard";

export const Route = createFileRoute("/_public/accept-invite/$token")({
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    const decision = resolveAcceptInviteGuard(session, location.pathname);
    if (decision) throw redirect({ to: decision.redirectTo, search: decision.search });
  },
  component: AcceptInvite,
});
