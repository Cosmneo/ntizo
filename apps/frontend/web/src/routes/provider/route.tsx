import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "@/shared/lib/api/auth-client";
import { resolveProviderGuard } from "./provider-guard";
import { ConsoleShell } from "@/shared/components/console/console-shell";

export const Route = createFileRoute("/provider")({
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    const decision = resolveProviderGuard(session, location.pathname);
    if (decision) throw redirect({ to: decision.redirectTo, search: decision.search });
    return { session };
  },
  component: () => (
    <ConsoleShell zone="workspace">
      <Outlet />
    </ConsoleShell>
  ),
});
