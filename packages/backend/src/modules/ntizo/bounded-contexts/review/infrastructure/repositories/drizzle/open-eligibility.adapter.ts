import type {
  ReviewEligibility,
  ReviewEligibilityPort,
} from "../../../app/ports/outbound/review-eligibility.port";

/**
 * The eligibility adapter for a platform that has no bookings yet.
 *
 * It says yes to everybody, and it is named for that so nobody reads a call to
 * `eligibility.check(...)` in `SubmitReviewCommand` and assumes the booking
 * rule is running. The mirror of `NoBookingsBusyAdapter` in the scheduling
 * context, which subtracts no busy time for the same reason.
 *
 * **Replace this before opening reviews to the public.** `ntizo_booking.booking`
 * currently holds an id, a customer and a status and nothing that says which
 * provider the booking was for, so no adapter written today could answer the
 * question honestly. When the Booking context lands, the replacement is a class
 * beside this one that joins booking → provider on a completed status, bound in
 * `bootstrapReview` — nothing in the use case changes.
 *
 * What still holds without it: you must be signed in, you cannot review a
 * business you work for, and one review per person per business.
 */
export class OpenReviewEligibilityAdapter implements ReviewEligibilityPort {
  async check(): Promise<ReviewEligibility> {
    return { allowed: true, bookingId: null };
  }
}
