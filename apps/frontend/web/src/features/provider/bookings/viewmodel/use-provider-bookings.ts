import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BookingDeclineReason } from "@ntizo/shared/read-models";
import { RECENT_BOOKINGS_LIMIT } from "../domain/status";
import {
  acceptBooking,
  declineBooking,
  keepBookingOpen,
  markBookingDone,
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

/**
 * The two ways a provider ends the platform's question about a finished job:
 * the work is done, or it is still going.
 *
 * Both invalidate the whole workspace prefix, exactly as accepting and
 * declining do — the row changes tab, the detail's status and timeline move,
 * and `["provider", id, "booking-stats"]` sits under the same prefix, so the
 * dashboard's "concluídas" and its revenue follow without a second key being
 * named here.
 *
 * **Neither writes an answer into the cache, and that is the point.** An
 * optimistic `MARKED_DONE` would be the one thing this pair cannot honestly
 * promise: the mutation replies `{ bookingId }` whether it moved the row or
 * lost the compare-and-swap to the platform's sweep (see
 * `MarkBookingDoneCommand`, whose own `execute` answers `null` for exactly
 * that case and whose GraphQL handler cannot pass the distinction on). The
 * refetch is the only witness of who won, so it is what the page waits for
 * rather than a cheerful guess it might have to take back.
 */
export function useCloseBooking(providerId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["provider", providerId] });
  const markDone = useMutation({
    mutationFn: (bookingId: string) => markBookingDone(bookingId),
    onSuccess: invalidate,
  });
  const stillOngoing = useMutation({
    mutationFn: (bookingId: string) => keepBookingOpen(bookingId),
    onSuccess: invalidate,
  });
  return { markDone, stillOngoing };
}
