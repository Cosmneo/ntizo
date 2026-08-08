import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "@/shared/lib/api/auth-client";
import { fetchCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { resolveAdminGuard } from "./admin-guard";
import { AdminShell } from "@/shared/components/admin-shell";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    const me = session ? await fetchCurrentUser() : null;
    const decision = resolveAdminGuard(session, me, location.pathname);
    if (decision) {
      // resolveAdminGuard returns { redirectTo, search? }, but redirect() reads
      // `to` — passing `decision` (or a `redirectTo`-keyed object) as-is leaves
      // `to` undefined, so the router treats the throw as "stay put, merge
      // search", re-running this beforeLoad and looping. Remap the field.
      const { redirectTo, ...rest } = decision;
      throw redirect({ to: redirectTo, ...rest } as never);
    }
    return { session, me };
  },
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
});
