import { createFileRoute } from "@tanstack/react-router";
import { ADMIN_BOOKING_TABS, type AdminBookingTab } from "@ntizo/shared/read-models";
import { AdminBookingsPage } from "@/features/admin/bookings/ui/admin-bookings-page";

/**
 * The administrator's booking queue, at `/admin/bookings`.
 *
 * Administrators only, and that is decided one level up rather than here:
 * `routes/admin/route.tsx` resolves the session, refuses anybody
 * `canAccessAdmin` says no to, and mounts every screen in this zone under that
 * guard. The backend refuses independently — `bookingNeedsAttentionForAdmin`
 * and all three mutations call `requireAdmin` before they read or write
 * anything — so the route guard is what keeps an unauthorised reader from
 * seeing an empty screen, not what keeps them from seeing the data.
 *
 * The tab lives in the URL: an administrator who refreshes on "Reclamações"
 * stays there, and a link to the disputes is a link. Validated against
 * `ADMIN_BOOKING_TABS` rather than against the generated GraphQL type, which
 * renders `tab` as a plain `String!` — the enum is enforced at runtime by the
 * field's own zod input, so this is the client's half of the same contract.
 * A rejected value comes back as `undefined` and the page falls to its first
 * tab, the way `book.$serviceId.tsx` explains.
 */
export const Route = createFileRoute("/admin/bookings")({
  validateSearch: (search: Record<string, unknown>): { tab?: AdminBookingTab } => {
    const tab = search["tab"];
    return {
      tab:
        typeof tab === "string" && (ADMIN_BOOKING_TABS as readonly string[]).includes(tab)
          ? (tab as AdminBookingTab)
          : undefined,
    };
  },
  component: AdminBookingsPage,
});
