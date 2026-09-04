import type { BookingBootstrap } from "@ntizo/backend/modules/ntizo/bounded-contexts/booking";
import type { CompleteBookingPort } from "@ntizo/backend/modules/ntizo/bounded-contexts/review";

/**
 * The one place that knows a review is a customer signing off on a job.
 *
 * The review context declares `CompleteBookingPort` and the booking context
 * has `CompleteBookingCommand`; neither imports the other, because no bounded
 * context's `app/` tree imports another's. This function is the seam between
 * them, and it lives here — at the composition root — for the same reason
 * `disputeThreadOver` next door does.
 *
 * Two of the values it supplies are decisions the review context should not
 * be making on its own:
 *
 * - `reason: "completed_by_review"` — which of the three doors into
 *   `COMPLETED` this booking came through, recorded on `booking_change`. The
 *   review context has exactly one door and no business naming any of the
 *   others; letting it pass a reason would let some future caller there write
 *   `completed_by_timer` into a row no timer touched.
 * - `changedByUserId` from `requesterUserId` — the same person under the name
 *   each side uses. It is the reviewer, and the reviewer is the booking's own
 *   customer: `SubmitReviewCommand` only ever passes a booking id that its
 *   eligibility adapter returned for that very user, and that query is keyed
 *   on `customerId`. That is what authorises this call, and it is why
 *   `CompleteBookingCommand` needs no membership check of its own (see its
 *   doc comment, which names this caller as one of the three edges that
 *   authorise before calling).
 *
 * The command's answer is dropped rather than returned: it replies with the
 * booking it moved, or `null` when it lost the compare-and-swap to somebody
 * else's write — most likely the sweep's own window arm closing this booking
 * a second earlier. A review does not change either way, and `null` there is
 * the same non-event to this caller as a thrown `BookingTransitionError`;
 * `SubmitReviewCommand` swallows both by the same reasoning, written out at
 * the tail of its `execute`.
 */
export function bookingCompletionOver(
  completeBooking: BookingBootstrap["useCases"]["completeBooking"],
): CompleteBookingPort {
  return {
    async execute(input) {
      await completeBooking.execute({
        bookingId: input.bookingId,
        reason: "completed_by_review",
        changedByUserId: input.requesterUserId,
      });
    },
  };
}
