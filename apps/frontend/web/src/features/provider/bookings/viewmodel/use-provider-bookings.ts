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

/**
 * How many requests are waiting — the sidebar's badge.
 *
 * The *same* query the list's "Pedidos" tab runs, deliberately: an identical
 * key means a provider who opens that tab pays for one request rather than
 * two, and answering a booking drops the badge and the row together on the
 * one invalidation `useAnswerBooking` already fires. `select` narrows it to
 * the single number the badge draws, so a refetch that comes back with the
 * same total re-renders nothing.
 */
export function useAwaitingCount(providerId: string | undefined) {
  const query = useQuery({
    ...providerBookingQueries.page({
      providerId: providerId ?? "",
      tab: "requests",
      q: "",
      memberId: null,
      offset: 0,
    }),
    select: (page) => page.total,
    staleTime: 30_000,
  });
  return query.data ?? 0;
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
