import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "@/shared/lib/api/auth-client";
import { CustomerShell } from "@/features/account/ui/customer-shell";

/**
 * Pathless layout for the signed-in customer pages, so they keep top-level
 * URLs (`/bookings`, not `/account/bookings`) while sharing one guard and one
 * chrome.
 *
 * `next` carries the intended destination so signing in returns the user
 * where they were headed instead of dropping them on the landing page.
 */
export const Route = createFileRoute("/_customer")({
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    if (!session) {
      throw redirect({ to: "/sign-in", search: { next: location.pathname } });
    }
    return { session };
  },
  component: () => (
    <CustomerShell>
      <Outlet />
    </CustomerShell>
  ),
});
