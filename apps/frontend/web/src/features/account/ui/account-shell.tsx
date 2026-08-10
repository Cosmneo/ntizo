import type { ReactNode } from "react";
import { AccountNav } from "@/features/account/ui/account-nav";

/**
 * Layout for `/account/*` — the settings, and only those.
 *
 * Nested inside `CustomerShell` rather than replacing it, so the header is
 * rendered once and the sidebar appears only where it belongs. Bookings,
 * messages and favourites are destinations, not settings; giving them this
 * sidebar would say they are.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  return (
    // Side by side from `lg`, stacked below it. Eight short entries sit fine
    // above the content on a phone — a drawer would hide the map of the area
    // the user just navigated into.
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
      <AccountNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
