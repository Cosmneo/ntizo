/**
 * Whether the time a provider is about to propose would double-book its
 * member.
 *
 * `ProposeQuoteCommand` calls this before it ever writes a proposal, so a
 * provider cannot offer a time their member has already sold through an
 * ordinary booking — refusing with `QuoteSlotOverlapError` up front is
 * cheaper for everyone than letting the customer accept a proposal that was
 * never going to hold.
 *
 * This is advisory, not the arbiter: the proposal does not hold the slot the
 * way a booking's exclusion constraint does, so a member's calendar can
 * still fill in between a proposal and its acceptance. The real arbiter is
 * that constraint, at the moment `BookingOpenerPort.openFromQuote` inserts
 * the booking; a refusal there surfaces as `QuoteSlotTakenError` and the
 * quote goes back to the provider instead.
 */
export interface SlotOverlapReaderPort {
  /** True when a slot-holding booking of this member overlaps [startsAt, endsAt). */
  overlaps(input: { providerMemberId: string; startsAt: Date; endsAt: Date }): Promise<boolean>;
}
