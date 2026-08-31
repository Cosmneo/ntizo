/**
 * The whole of a booking's life, in the order it happens.
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
 * @see SLOT_HOLDING_STATUSES — the four statuses that still occupy a member's
 * time. The partial unique index `booking_member_slot_active_uq` was built
 * from this list in Task 2; that index has since been replaced by the
 * `booking_member_slot_no_overlap` exclusion constraint (`booking.schema.ts`),
 * whose predicate is the *same* four statuses but is hand-typed into the
 * migration rather than read from this constant — Drizzle has no builder for
 * `EXCLUDE`. Adding a slot-holding status here now requires a second, manual
 * edit to that migration's `WHERE` clause, or double-booking goes back to
 * being silently possible for the new status.
 */
export const BookingStatus = {
  /** Created, slot held, waiting for the customer to pay. */
  PendingPayment: "PENDING_PAYMENT",
  /** Paid. The platform holds the money; the provider has not answered. */
  AwaitingProvider: "AWAITING_PROVIDER",
  /** The provider accepted. */
  Confirmed: "CONFIRMED",
  /** The provider says the work is done; the customer's dispute window is open. */
  MarkedDone: "MARKED_DONE",
  /** The window closed without a dispute. Money moves to the provider's wallet. */
  Completed: "COMPLETED",
  /** The customer disputed inside the window. An administrator decides. */
  Disputed: "DISPUTED",
  /** The provider refused, or never answered in time. */
  Declined: "DECLINED",
  /** Called off after it was confirmed. */
  Cancelled: "CANCELLED",
  /** Nobody paid before the payment window closed. */
  Expired: "EXPIRED",
} as const;

export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const BOOKING_STATUSES = Object.values(BookingStatus);

/**
 * The statuses in which a booking still occupies its member's time.
 *
 * These are the states that hold a slot — `pending_payment`, `awaiting_provider`,
 * `confirmed`, and `marked_done`. A new status added here without thought will
 * start blocking slots; a new status added without changing this will silently
 * stop blocking them.
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
  BookingStatus.PendingPayment,
  BookingStatus.AwaitingProvider,
  BookingStatus.Confirmed,
  BookingStatus.MarkedDone,
] as const;
