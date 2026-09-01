/**
 * The slot is held from the moment a booking is created — before payment, while
 * the booking is `PENDING_PAYMENT`. `PENDING_PAYMENT` is itself one of the
 * `SLOT_HOLDING_STATUSES`: the hold belongs to the booking from creation through
 * payment, expiry, or any later terminal state. This plan releases the slot in one
 * place: Task 9's `SweepBookingCommand` when a booking expires unpaid.
 *
 * Plan 2's reschedule command is the exception that needs `transfer`: it must move
 * a booking to a new slot without ever releasing the old one. If a reschedule
 * released first and then held, another customer's request could win the new slot
 * in the race between the two operations, and the reschedule would lose it. `transfer`
 * exists as one atomic operation so releasing and holding happen together, making
 * that race impossible to write by accident.
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
   * Used at booking creation: the command holds the slot before the customer
   * is even asked for payment, and the hold remains through payment, confirmation,
   * and service delivery.
   */
  hold(bookingId: string, slot: SlotWindow): Promise<void>;

  /**
   * Release a held slot back to the calendar, making it available again.
   *
   * Called by Task 9's `SweepBookingCommand` when a booking expires without payment.
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
