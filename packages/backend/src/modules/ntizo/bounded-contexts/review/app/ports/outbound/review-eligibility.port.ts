/**
 * Whether this person has earned the right to score this business.
 *
 * A port rather than a query inside the command, because the answer belongs to
 * the Booking context and this one must not read its tables. The rule the
 * platform wants is "only somebody whose booking here was completed", and it
 * is enforced: `BookingReviewEligibilityAdapter` reads `ntizo_booking.booking`
 * for a `COMPLETED` booking matching this customer and this provider. Turning
 * the rule on was binding that adapter at bootstrap, not editing
 * `SubmitReviewCommand` — the seam this port exists for.
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
