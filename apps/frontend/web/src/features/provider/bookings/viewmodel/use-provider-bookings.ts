import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BookingDeclineReason } from "@ntizo/shared/read-models";
import {
  acceptBooking,
  declineBooking,
  providerBookingQueries,
  type ProviderBookingsPageInput,
} from "../data/booking.repository";

export function useProviderBookings(input: ProviderBookingsPageInput) {
  return useQuery(providerBookingQueries.page(input));
}

export function useProviderBooking(providerId: string, bookingId: string) {
  return useQuery(providerBookingQueries.detail(providerId, bookingId));
}

/**
 * Accept or decline, then drop every cached read of this workspace's
 * bookings: the row moves tabs, the detail's status and timeline change, and
 * the sidebar's count of what needs an answer goes down by one.
 */
export function useAnswerBooking(providerId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["provider", providerId] });
  const accept = useMutation({
    mutationFn: (bookingId: string) => acceptBooking(bookingId),
    onSuccess: invalidate,
  });
  const decline = useMutation({
    mutationFn: (v: { bookingId: string; reason?: BookingDeclineReason }) => declineBooking(v.bookingId, v.reason),
    onSuccess: invalidate,
  });
  return { accept, decline };
}
