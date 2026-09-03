import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BookingDTO } from "@ntizo/shared/read-models";
import {
  cancelBooking,
  myBookingQueries,
  payBooking,
  type MyBookingsPageInput,
} from "../data/booking.repository";
import { deadlineOf } from "../domain/status";

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
 * booking's true state — `BOOKING_INVALID_TRANSITION` means the provider
 * already answered or the payment already landed while the dialog sat open — and
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

/**
 * Ask the server to push the M-Pesa prompt now.
 *
 * No `onSettled` invalidation the way `useCancelBooking` has one: a bare
 * "the prompt is on its way" tells the cache nothing new about this
 * booking's own row — the status is still `PENDING_PAYMENT` the instant this
 * resolves, same as before it was called. `usePayBookingPoll` below is what
 * learns the actual outcome and drops the cache once it does.
 */
export function usePayBooking() {
  return useMutation({
    mutationFn: (bookingId: string) => payBooking(bookingId),
  });
}

/** How often `PayDialog` re-reads the booking while it waits on M-Pesa. */
export const PAY_POLL_MS = 3_000;

/**
 * The live read `PayDialog` polls while it waits for the customer to
 * confirm on their handset.
 *
 * **`refetchInterval` is a function, not a fixed number, because the poll
 * has to know when to stop asking.** Once the status has left
 * `PENDING_PAYMENT` — paid, or the window ran out from under it — there is
 * nothing left this read could learn by asking again, and continuing past
 * `deadlineOf` would just be polling a closed window forever. The callback
 * reads `query.state.data`, falling back to the `booking` the dialog opened
 * with for the render before the first poll has landed, rather than a timer
 * this hook keeps itself — the same "no clock of our own" rule
 * `bookings-page.tsx`'s own `now` follows, applied to a poll instead of a
 * countdown. A dialog closing (this hook un-mounting) is the only thing
 * that ever stops it early.
 *
 * **Invalidates `["bookings"]` once, the moment `CONFIRMED` is read.** Not
 * `onSuccess` on the query — TanStack Query v5 dropped it — so this watches
 * the resolved status in an effect instead. Doing it here, in the hook that
 * already owns the poll, rather than in `PayDialog` itself, keeps the
 * "drop the cache" decision beside the read that discovers the fact worth
 * dropping it for — the same split `useCancelBooking`'s `onSettled` draws
 * for a mutation's own settlement.
 */
export function usePayBookingPoll(
  booking: Pick<BookingDTO, "id" | "status" | "expiresAt">,
) {
  const qc = useQueryClient();
  const query = useQuery({
    ...myBookingQueries.detail(booking.id),
    refetchInterval: (q) => {
      const data = q.state.data;
      const status = data?.status ?? booking.status;
      const deadline = data ? deadlineOf(data) : deadlineOf(booking);
      if (status !== "PENDING_PAYMENT") return false;
      if (deadline && new Date(deadline).getTime() <= Date.now()) return false;
      return PAY_POLL_MS;
    },
  });

  const confirmedStatus = query.data?.status === "CONFIRMED" ? "CONFIRMED" : null;
  useEffect(() => {
    if (confirmedStatus) void qc.invalidateQueries({ queryKey: ["bookings"] });
  }, [confirmedStatus, qc]);

  return query;
}
