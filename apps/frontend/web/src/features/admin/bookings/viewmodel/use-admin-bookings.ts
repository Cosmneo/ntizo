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
 * One of the three things an administrator can do to a row, and which row.
 *
 * A tagged union rather than three call signatures, because it is also what a
 * failure has to be described by: "this action, on that booking, did not
 * happen" is one fact, and splitting it across three mutation objects is what
 * let a refusal on one row outlive itself on another.
 */
export type AdminBookingAction =
  | { kind: "markDone"; bookingId: string }
  | { kind: "complete"; bookingId: string }
  | { kind: "resolveDispute"; bookingId: string; upheld: boolean };

/**
 * The three doors, behind **one** `useMutation`.
 *
 * Three separate mutations was the first shape and it was wrong twice. Each
 * `useMutation` keeps its own `error` until *that same* mutation is fired
 * again, so a refused mark-done left its sentence on screen while a
 * completion on another row succeeded — a false statement about an action
 * that worked, which is exactly the class of claim this screen exists not to
 * make. And a page-level `failed` boolean could not say *which* row it was
 * about. One mutation has one `error` and one `variables`, so the failure is
 * a single fact naming its own booking and its own action, and firing
 * anything else clears it.
 *
 * **Nothing is written optimistically, and that is still the point.** Every
 * one of these replies `{ bookingId }` whether it moved the booking or lost
 * the compare-and-swap to the platform's own sweep, which is working through
 * this same queue from the other side. The refetch is the only witness of who
 * won, so it is what the page waits for.
 *
 * **`onSettled`, not `onSuccess`.** A refusal has to re-read the queue too.
 * Not for tidiness: the commonest refusal is `BOOKING_INVALID_TRANSITION`,
 * which means the row on screen is *already* out of date — and the page
 * disables a row it has acted on until the next read lands, so a failure that
 * never triggered a read left that row's buttons disabled for good, with the
 * error sentence sitting above a control nobody could press again.
 *
 * The invalidated key is the prefix rather than the tab: closing a booking
 * moves it *out of* the tab it was in and, in one case, into another, so
 * dropping only the page it was read from would leave the destination stale.
 * `["admin", "bookings"]` is every tab and every offset.
 */
export function useAdminBookingActions() {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (action: AdminBookingAction) => {
      switch (action.kind) {
        case "markDone":
          return adminMarkBookingDone(action.bookingId);
        case "complete":
          return adminCompleteBooking(action.bookingId);
        case "resolveDispute":
          return resolveBookingDispute(action.bookingId, action.upheld);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin", "bookings"] }),
  });

  return {
    run: (action: AdminBookingAction) => mutation.mutate(action),
    /** Any write in flight. Every button on the queue is disabled while one is. */
    pending: mutation.isPending,
    /**
     * The last action that was refused, or null.
     *
     * `variables` is the action that was passed to the mutation that failed,
     * so the sentence can be drawn on that row and name that action. React
     * Query resets both `error` and `variables` on the next `mutate`, which
     * is what makes a later success clear it without anything here saying so.
     */
    failure: mutation.isError ? (mutation.variables ?? null) : null,
  };
}
