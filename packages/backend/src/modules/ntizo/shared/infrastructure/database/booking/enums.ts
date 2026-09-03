/**
 * Every status a booking can hold. **The members are a set, not a sequence —
 * do not read an order into this list, and do not maintain one.**
 *
 * It did claim one. This was written "in the order it happens" under
 * pay-first, and the reversal falsified that sentence without moving a line:
 * `PENDING_PAYMENT` still sits above `AWAITING_PROVIDER` here while a booking
 * now meets them the other way round. Deleting the claim is the fix, not
 * reordering to chase it — every consumer is set membership (`inArray`,
 * `in (…)` through `statusList`, `includes`, `for…of`, `it.each`), nothing
 * reads this positionally, and Postgres does not care what order a CHECK
 * constraint lists its values in. A reorder would be churn no test could
 * catch if it went wrong, in exchange for a promise this comment should not
 * have been making.
 *
 * Where the flow actually lives: `Booking`'s own transition methods, which
 * are the only things that can move a booking from one of these to another;
 * `DEADLINE_BEARING_STATUSES` below, whose five members *are* in the order a
 * booking meets them and say so; and the design spec's state-machine diagram.
 * Change those when the flow changes.
 *
 * A const object rather than a TypeScript `enum`, matching this codebase's
 * other status sets: the values are what Postgres stores and what GraphQL
 * publishes, so they have to be readable in a database client without a
 * lookup table.
 *
 * `MARKED_DONE` is deliberately not called `AWAITING_DISPUTE`. It is not
 * waiting for a dispute; it is waiting for the absence of one, and a name
 * that promises the opposite is a name the next reader has to unlearn.
 *
 * @see SLOT_HOLDING_STATUSES — the five statuses that still occupy a member's
 * time. The partial unique index `booking_member_slot_active_uq` was built
 * from this list in Task 2; that index has since been replaced by the
 * `booking_member_slot_no_overlap` exclusion constraint (`booking.schema.ts`),
 * whose predicate is the *same* statuses but is hand-typed into the
 * migration rather than read from this constant — Drizzle has no builder for
 * `EXCLUDE`. Adding a slot-holding status here now requires a second, manual
 * edit to that migration's `WHERE` clause, or double-booking goes back to
 * being silently possible for the new status.
 */
export const BookingStatus = {
  /**
   * The slot is held from here — the moment the customer picks it — not
   * from the moment checkout finishes. The mockup's countdown
   * ("Hora reservada 29:40") runs across all three checkout steps, so
   * without this status two customers can both reach the end of checkout
   * for the same slot and only one of them find out.
   */
  Draft: "DRAFT",
  /**
   * The provider accepted. Slot held, waiting for the customer to pay —
   * this is the reversal this plan is named for: `create` no longer
   * produces this status, and it is now reached *after* the provider's
   * yes (`accept`), not before it.
   */
  PendingPayment: "PENDING_PAYMENT",
  /**
   * Sent to the provider. Slot held, waiting for their answer — accept or
   * decline. Nothing has been charged yet.
   */
  AwaitingProvider: "AWAITING_PROVIDER",
  /** Paid — the charge `accept`'s promise depended on has landed. */
  Confirmed: "CONFIRMED",
  /** The provider says the work is done; the customer's dispute window is open. */
  MarkedDone: "MARKED_DONE",
  /** The window closed without a dispute. Money moves to the provider's wallet. */
  Completed: "COMPLETED",
  /** The customer disputed inside the window. An administrator decides. */
  Disputed: "DISPUTED",
  /** The provider refused, or never answered in time. */
  Declined: "DECLINED",
  /**
   * Called off for a named reason, after somebody had already committed
   * something to it. Today that is one case, and it is not a confirmed
   * booking: a `PENDING_PAYMENT` booking whose payment window closed with
   * the money never arriving — the provider had blocked their calendar on
   * the platform's own promise, so they are owed a cancellation carrying a
   * reason rather than an expiry that explains nothing. See
   * `BookingCancelledReason` and `Booking.cancel`. A cancellation policy,
   * when one exists, will add its own reasons and its own source statuses.
   */
  Cancelled: "CANCELLED",
  /**
   * A clock ran out before anybody had committed money to it: a `DRAFT`
   * whose checkout hold passed, or an `AWAITING_PROVIDER` whose response
   * window did. **Not** the payment window — that one ends in `CANCELLED`,
   * above. See `Booking.expire` and `DEADLINE_BEARING_STATUSES` below.
   */
  Expired: "EXPIRED",
} as const;

export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const BOOKING_STATUSES = Object.values(BookingStatus);

/**
 * The statuses in which a booking still occupies its member's time.
 *
 * These are the states that hold a slot — `draft`, `pending_payment`,
 * `awaiting_provider`, `confirmed`, and `marked_done`. A new status added
 * here without thought will start blocking slots; a new status added
 * without changing this will silently stop blocking them.
 *
 * `DRAFT` joined this list, not just `BOOKING_STATUSES`, because the
 * checkout hold it represents is a hold on the same calendar as every other
 * status here — a customer still filling in step 2 has the slot exactly as
 * occupied as one waiting on the provider. Whoever adds a status here next
 * still owes the same edit `DRAFT` needed: the exclusion constraint's
 * `WHERE` clause, by hand, in a migration — see this constant's callers,
 * and the paragraph below.
 *
 * Task 2 of the booking core plan built the (now-removed)
 * `booking_member_slot_active_uq` index predicate from this constant through
 * `booking.schema.ts`'s `statusList` helper, so that index and this list
 * could not drift apart. Its replacement, the `booking_member_slot_no_overlap`
 * exclusion constraint, cannot get the same guarantee — Drizzle cannot express
 * `EXCLUDE`, so that constraint's `WHERE` clause is typed by hand directly
 * into a migration file rather than generated from this constant. See
 * `booking.schema.ts`'s comment where the old index used to be.
 */
export const SLOT_HOLDING_STATUSES = [
  BookingStatus.Draft,
  BookingStatus.PendingPayment,
  BookingStatus.AwaitingProvider,
  BookingStatus.Confirmed,
  BookingStatus.MarkedDone,
] as const;

/**
 * The statuses in which `expires_at` is a deadline somebody is still waiting on
 * — five clocks now, in the order a booking meets them, which is what the
 * `BookingStatus` docblock above means when it says this list says so.
 *
 * `CONFIRMED` and `MARKED_DONE` joined when bookings gained an ending. On a
 * confirmed booking the clock is the platform's question to the provider —
 * first "the appointment ended, tell us how it went", then, seven days later
 * and only if nobody answered, the platform closing it alone. On a marked-done
 * booking it is the customer's window.
 *
 * `booking_sweep_idx`'s predicate is generated from this list, so widening it
 * widens the index; `booking-constraints.test.ts` reads the live predicate back
 * and fails until the migration has run.
 *
 * Membership here is only the question, same as it was for the original
 * three — `SweepBookingCommand` still has to answer it. As of this commit it
 * does not: `CONFIRMED` and `MARKED_DONE` have no arm in that switch, so a
 * booking selected on either clock is counted as swept and left completely
 * untouched (see `booking-sweep.test.ts`). Task 5 ("the sweep asks, then
 * acts") is what gives them one.
 */
export const DEADLINE_BEARING_STATUSES = [
  BookingStatus.Draft,
  BookingStatus.AwaitingProvider,
  BookingStatus.PendingPayment,
  BookingStatus.Confirmed,
  BookingStatus.MarkedDone,
] as const;
