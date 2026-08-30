/**
 * When a booking moves from pending to confirmed, the command path in this plan
 * holds the slot and never releases it. Plan 2's reschedule command is the exception:
 * it must move a booking to a new slot, and releasing before holding creates a race
 * where the old slot returns to the calendar before the new one is locked down —
 * another customer's request can win the new slot in between, and the reschedule
 * loses it. `transfer` exists as one atomic operation so that releasing and holding
 * happen together, making the wrong thing impossible to write by accident.
 *
 * `release` and `transfer` take the booking id rather than a hold handle: the booking
 * is what owns the hold. A separate handle would be a second identity for the same
 * thing, and the usual consequence is the two drifting apart (an id and a handle both
 * claim to be the source of truth, but one is stale).
 */
export interface SlotWindow {
  providerMemberId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface SlotHoldPort {
  /**
   * Lock a time window on a provider member's calendar for this booking.
   *
   * Used when the booking is confirmed: the command holds the slot and the
   * customer cannot rescind their offer.
   */
  hold(bookingId: string, slot: SlotWindow): Promise<void>;

  /**
   * Release a held slot back to the calendar, making it available again.
   *
   * Used when a booking expires without payment or is cancelled.
   */
  release(bookingId: string): Promise<void>;

  /**
   * Move a held slot to a new time window in one operation.
   *
   * Plan 2's reschedule command calls this: the booking keeps its id, but the
   * held slot moves to a new time. A reschedule that released before holding
   * would risk losing the new slot to another request in between; this operation
   * makes that race impossible by doing both atomically.
   *
   * Nothing in this plan calls it; it is declared here so that Plan 2 does not
   * have to open the port again.
   */
  transfer(bookingId: string, to: SlotWindow): Promise<void>;
}
