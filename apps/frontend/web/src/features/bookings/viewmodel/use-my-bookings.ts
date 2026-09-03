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
 */
export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => cancelBooking(bookingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
}
