import { createFileRoute } from "@tanstack/react-router";
import { BookingPage } from "@/features/provider/bookings/ui/booking-page";

/**
 * One booking, on its own page — the destination every row of the list links
 * to, and the only place a request is accepted or refused.
 */
export const Route = createFileRoute("/provider/$slug/bookings/$bookingId")({
  component: BookingPage,
});
