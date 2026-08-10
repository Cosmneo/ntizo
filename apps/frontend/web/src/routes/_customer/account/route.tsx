import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AccountShell } from "@/features/account/ui/account-shell";

/**
 * The account settings area. Its own layout inside `_customer`, so the
 * sidebar wraps `/account/*` and nothing else — the guard and the header are
 * already handled one level up.
 */
export const Route = createFileRoute("/_customer/account")({
  component: () => (
    <AccountShell>
      <Outlet />
    </AccountShell>
  ),
});
