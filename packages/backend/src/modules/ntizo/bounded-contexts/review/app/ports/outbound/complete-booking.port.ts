/**
 * Closing the job a review was written about.
 *
 * A booking the provider marked done opens a three-day window in which the
 * customer may dispute the work, and the sweep closes it when they do not.
 * Leaving a review is the customer saying the work happened, so it closes the
 * window there and then rather than making them press a second button for
 * something they have already answered.
 *
 * **Declared here rather than imported from the booking context**, the same
 * rule `raise-notification.port.ts` and `open-dispute-thread.port.ts` already
 * follow on the other side of the platform: no bounded context's `app/` tree
 * imports another's. The booking context's `CompleteBookingCommand` is what
 * fills it, mapped at the composition root (see
 * `apps/backend/api/src/booking-completion.adapter.ts`).
 *
 * **Not structurally identical to that command's own input, and deliberately
 * so.** It takes a `reason` — which of the three doors into `COMPLETED` a
 * booking came through — and a `changedByUserId`. Neither is this side's to
 * decide: every booking closed from here came through the review door, and
 * the person who opened it is always the reviewer. Naming them here would let
 * a future caller in this context pass `completed_by_timer`, which would be a
 * lie written into `booking_change.reason`. The mapping lives at the
 * composition root, the one place allowed to know both contexts exist.
 *
 * **`requesterUserId` is carried even though the command behind it runs no
 * membership check of its own**, and that is not an accident on either side.
 * `CompleteBookingCommand` deliberately takes no such check because each of
 * its three callers is authorised at its own edge; this context is one of
 * those edges, and it authorises before it calls — `SubmitReviewCommand` only
 * ever passes a booking id that `ReviewEligibilityPort` returned for this
 * very `requesterUserId`, so the id can only be a booking of the caller's
 * own. The field is what the change row records as the human who closed it.
 *
 * **`Promise<void>` because this side has nothing to do with the answer.**
 * `CompleteBookingCommand` answers with the booking it moved, or `null` when
 * it lost the compare-and-swap to somebody else's write; a review does not
 * change either way, so the adapter drops it rather than making every reader
 * here wonder what a `null` would have meant.
 */
export interface CompleteBookingPort {
  execute(input: { bookingId: string; requesterUserId: string }): Promise<void>;
}
