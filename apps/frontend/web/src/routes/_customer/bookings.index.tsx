import { createFileRoute } from "@tanstack/react-router";
import { CUSTOMER_BOOKING_TABS, type CustomerBookingTab } from "@ntizo/shared";
import { BookingsPage } from "@/features/bookings/ui/bookings-page";

/**
 * The customer's own bookings. It was a placeholder from the day the route
 * existed; checkout deliberately refused to link here until it read real rows.
 *
 * **`tab` alone. `offset` was here and is not any more.** The argument for
 * putting it in the URL was a bookmarkable "page 2", and what it actually
 * bought was a pager that replaced the page instead of extending it, a count
 * in the card's header that misreported on every page after the first, and no
 * control that went back. `BookingsPage` now keeps the offset in component
 * state and accumulates, exactly as the provider's list does; see its own doc
 * comment. A stale `?offset=20` in somebody's history is simply ignored.
 *
 * **`bookings.index.tsx`, not `bookings.tsx`.** This segment also owns a
 * `$bookingId` child (`bookings.$bookingId.tsx`) — TanStack Router's flat
 * file convention makes a bare `bookings.tsx` the *layout* for every
 * `bookings.*` sibling the moment one exists, and a layout only shows a
 * child through its own `<Outlet />`, which this page has no reason to
 * render (a booking's detail replaces the list, it does not nest inside
 * it). Left as `bookings.tsx`, the URL still changed on a click into a row
 * — the child route matched and its `beforeLoad` ran clean — but nothing
 * mounted it, so the list stayed on screen under the new address with no
 * console error to notice by. `provider/$slug/bookings.index.tsx` already
 * uses this exact shape (`.index.tsx` beside `.{$param}.tsx`, both direct
 * children of `/provider/$slug`) for the identical list/detail pair on the
 * provider side; this file now matches it. Confirmed end to end in
 * `apps/e2e/tests/customer-bookings.spec.ts` — before this rename, a real
 * browser session could get from `/bookings` to a row's own page by
 * `page.reload()` at the detail URL directly, but never by clicking the row.
 */
export const Route = createFileRoute("/_customer/bookings/")({
  validateSearch: (s: Record<string, unknown>): { tab?: CustomerBookingTab } =>
    CUSTOMER_BOOKING_TABS.includes(s["tab"] as CustomerBookingTab)
      ? { tab: s["tab"] as CustomerBookingTab }
      : {},
  component: BookingsPage,
});
