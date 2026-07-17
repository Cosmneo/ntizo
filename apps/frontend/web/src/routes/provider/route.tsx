import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "@/shared/lib/api/auth-client";
import { resolveProviderGuard } from "./provider-guard";
import { ProviderShell } from "@/shared/components/provider-shell";

export const Route = createFileRoute("/provider")({
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    const decision = resolveProviderGuard(session, location.pathname);
    if (decision) throw redirect({ to: decision.redirectTo, search: decision.search });
    return { session };
  },
  component: () => (
    <ProviderShell>
      <Outlet />
    </ProviderShell>
  ),
});
