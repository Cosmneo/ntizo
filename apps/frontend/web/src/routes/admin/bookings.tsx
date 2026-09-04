import { createFileRoute } from "@tanstack/react-router";
import { parseAdminQueueSearch } from "@/features/admin/bookings/domain/queue-search";
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
 * The tab and the page both live in the URL: an administrator who refreshes on
 * the second page of "Reclamações" stays there, and a link to it is a link.
 *
 * `validateSearch` **is** `parseAdminQueueSearch`, imported rather than
 * written out. It used to be written out here with a copy in the page's test,
 * and the copy is what the test exercised: deleting this rule outright left
 * every test passing. One implementation, reachable from a route and from a
 * test, is what makes the rule testable at all.
 */
export const Route = createFileRoute("/admin/bookings")({
  validateSearch: parseAdminQueueSearch,
  component: AdminBookingsPage,
});
