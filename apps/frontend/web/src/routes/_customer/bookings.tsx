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
 */
export const Route = createFileRoute("/_customer/bookings")({
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
