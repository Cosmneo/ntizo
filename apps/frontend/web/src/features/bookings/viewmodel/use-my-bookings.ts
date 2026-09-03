import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelBooking,
  myBookingQueries,
  type MyBookingsPageInput,
} from "../data/booking.repository";

export function useMyBookings(input: MyBookingsPageInput) {
  return useQuery(myBookingQueries.page(input));
}

export function useMyBooking(bookingId: string) {
  return useQuery(myBookingQueries.detail(bookingId));
}

/**
 * Cancel, then drop every cached read of this customer's bookings: the row
 * changes tab, the three counts change with it, and the detail's status and
 * timeline both move.
 *
 * **`onSettled`, not `onSuccess`.** A refusal is still news about this
 * booking's true state — `BOOKING_TRANSITION` means the provider already
 * answered or the payment already landed while the dialog sat open — and
 * the cache holding the pre-refusal answer is exactly what leaves a dead
 * Cancelar button live after `CancelDialog` closes. Every settlement drops
 * it; a plain network hiccup just re-fetches the same true answer, which
 * costs a request and nothing else.
 */
export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => cancelBooking(bookingId),
    onSettled: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
}
