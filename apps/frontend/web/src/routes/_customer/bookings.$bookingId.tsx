import { createFileRoute } from "@tanstack/react-router";
import { BookingPage } from "@/features/bookings/ui/booking-page";

/**
 * One of the customer's own bookings, on its own page — the destination
 * every row of `/bookings` links to, and the page checkout's own outcome
 * panel now offers once a request is sent or paid.
 */
export const Route = createFileRoute("/_customer/bookings/$bookingId")({
  component: BookingPage,
});
