import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "@/shared/lib/api/auth-client";
import { fetchCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { resolveAdminGuard } from "./admin-guard";
import { ConsoleShell } from "@/shared/components/console/console-shell";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    // Deliberately NOT wrapped in try/catch: `fetchCurrentUser()` now
    // rejects on a genuine backend failure (see its doc comment) rather
    // than degrading to `null`. Letting that rejection propagate out of
    // `beforeLoad` surfaces it as a visible route error — the router's
    // error boundary — instead of `resolveAdminGuard` reading a null user
    // as "not an admin" and silently redirecting an authenticated admin to
    // `/` with no indication anything went wrong. A route guard that fails
    // loudly is the correct outcome for an authorization check; a guard
    // that fails open (or silently elsewhere) is not.
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
    <ConsoleShell zone="platform">
      <Outlet />
    </ConsoleShell>
  ),
});
