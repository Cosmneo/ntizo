import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BookingDeclineReason } from "@ntizo/shared/read-models";
import { RECENT_BOOKINGS_LIMIT } from "../domain/status";
import {
  acceptBooking,
  declineBooking,
  providerBookingQueries,
  type ProviderBookingsPageInput,
} from "../data/booking.repository";

export function useProviderBookings(input: ProviderBookingsPageInput) {
  return useQuery(providerBookingQueries.page(input));
}

/** Every number the dashboard draws. */
export function useProviderStats(providerId: string) {
  return useQuery(providerBookingQueries.stats(providerId));
}

/**
 * How many requests are waiting — the sidebar's badge and the dashboard's
 * first card, from one cache entry. It used to read `total` off a page of the
 * list, which fetched twenty rows, a count and the member roster to show one
 * number on every screen in the zone.
 */
export function useAwaitingCount(providerId: string | undefined) {
  const query = useQuery({
    ...providerBookingQueries.stats(providerId ?? ""),
    select: (stats) => stats.awaitingResponse,
  });
  return query.data ?? 0;
}

/** The dashboard's "Reservas recentes": the newest eight, whatever state they are in. */
export function useRecentBookings(providerId: string) {
  return useProviderBookings({
    providerId,
    tab: "all",
    q: "",
    memberId: null,
    offset: 0,
    limit: RECENT_BOOKINGS_LIMIT,
  });
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
