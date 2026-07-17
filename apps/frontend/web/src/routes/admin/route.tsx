import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "@/shared/lib/api/auth-client";
import { fetchCurrentUser } from "@/shared/lib/api/me";
import { resolveAdminGuard } from "./admin-guard";
import { AdminShell } from "@/shared/components/admin-shell";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    const me = session ? await fetchCurrentUser() : null;
    const decision = resolveAdminGuard(session, me, location.pathname);
    if (decision) throw redirect(decision as never);
    return { session, me };
  },
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
});
