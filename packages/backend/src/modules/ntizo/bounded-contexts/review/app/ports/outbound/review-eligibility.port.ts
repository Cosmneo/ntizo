/**
 * Whether this person has earned the right to score this business.
 *
 * A port rather than a query inside the command, because the answer belongs to
 * the Booking context and this one must not read its tables. The rule the
 * platform wants is "only somebody whose booking here was completed" — and the
 * point of the seam is that turning that rule on is binding a different adapter
 * at bootstrap, not editing `SubmitReviewCommand`.
 *
 * **It is not enforced in this build, and that is a real gap, not an oversight
 * being hidden.** `ntizo_booking.booking` is a placeholder carrying an id, a
 * customer and a status; it has no column saying which provider a booking was
 * for, so there is no query that could answer this correctly. The adapter that
 * ships (`OpenReviewEligibilityAdapter`) says yes to everyone and says so in
 * its own name. Until Booking exists, the guards that *do* hold are: you must
 * be signed in, you cannot review a business you work for, and you get one
 * review per business.
 */
export interface ReviewEligibility {
  allowed: boolean;
  /**
   * The booking that earned it, when there is one to point at.
   *
   * Stored on the review so a later reader can tell a verdict backed by a real
   * job from one written before the rule existed.
   */
  bookingId: string | null;
}

export interface ReviewEligibilityPort {
  check(providerId: string, userId: string): Promise<ReviewEligibility>;
}
