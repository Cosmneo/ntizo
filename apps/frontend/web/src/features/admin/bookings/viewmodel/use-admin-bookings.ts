import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminBookingQueries,
  adminCompleteBooking,
  adminMarkBookingDone,
  resolveBookingDispute,
  type AdminBookingsPageInput,
} from "../data/admin-booking.repository";

export function useAdminBookings(input: AdminBookingsPageInput) {
  return useQuery(adminBookingQueries.page(input));
}

/**
 * The three things an administrator can do to a row, and the one thing all
 * three do afterwards.
 *
 * **Nothing is written optimistically, and that is the point.** Each of these
 * mutations replies `{ bookingId }` — an echo of the request — whether it
 * moved the booking or lost the compare-and-swap to the platform's own sweep,
 * which is working through the very same queue from the other side. An
 * optimistic `MARKED_DONE`, or a sentence saying the booking was closed, would
 * be the one claim this surface cannot honestly make. The refetch is the only
 * witness of who won, so it is what the page waits for.
 *
 * The invalidated key is the prefix rather than the tab: closing a booking
 * moves it *out of* the tab it was in and, in one case, into another, so
 * dropping only the page it was read from would leave the destination tab
 * stale. `["admin", "bookings"]` is every tab and every offset.
 */
export function useAdminBookingActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "bookings"] });

  const markDone = useMutation({
    mutationFn: (bookingId: string) => adminMarkBookingDone(bookingId),
    onSuccess: invalidate,
  });
  const complete = useMutation({
    mutationFn: (bookingId: string) => adminCompleteBooking(bookingId),
    onSuccess: invalidate,
  });
  const resolve = useMutation({
    mutationFn: (v: { bookingId: string; upheld: boolean }) =>
      resolveBookingDispute(v.bookingId, v.upheld),
    onSuccess: invalidate,
  });

  return {
    markDone,
    complete,
    resolve,
    /** Any write in flight. Every button on the queue is disabled while one is. */
    pending: markDone.isPending || complete.isPending || resolve.isPending,
    /** Whether the last write was refused — one sentence for the three, because they fail the same way. */
    failed: Boolean(markDone.error ?? complete.error ?? resolve.error),
  };
}
