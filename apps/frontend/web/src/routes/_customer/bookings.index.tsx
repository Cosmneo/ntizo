import { createFileRoute } from "@tanstack/react-router";
import { CUSTOMER_BOOKING_TABS, type CustomerBookingTab } from "@ntizo/shared";
import { BookingsPage } from "@/features/bookings/ui/bookings-page";

/**
 * The customer's own bookings. It was a placeholder from the day the route
 * existed; checkout deliberately refused to link here until it read real rows.
 *
 * `offset` lives in the URL alongside `tab`, unlike the provider list's own
 * pager (which keeps it in component state): a customer's history is short
 * enough that a bookmarked or refreshed "page 2" is worth more than an
 * infinite-scroll accumulator sized for a workspace's hundreds of rows.
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
  validateSearch: (
    s: Record<string, unknown>,
  ): { tab?: CustomerBookingTab; offset?: number } => ({
    ...(CUSTOMER_BOOKING_TABS.includes(s["tab"] as CustomerBookingTab)
      ? { tab: s["tab"] as CustomerBookingTab }
      : {}),
    ...(typeof s["offset"] === "number" && s["offset"] > 0
      ? { offset: s["offset"] }
      : {}),
  }),
  component: BookingsPage,
});
