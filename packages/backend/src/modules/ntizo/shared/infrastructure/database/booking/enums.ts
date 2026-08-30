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
 * @see booking_member_slot_active_uq — a partial unique index whose SQL
 * predicate lists the four statuses that still hold a slot: `PENDING_PAYMENT`,
 * `AWAITING_PROVIDER`, `CONFIRMED`, and `MARKED_DONE`. Adding a status that
 * holds a slot means changing that index's predicate too; SQL cannot read
 * TypeScript, so the two lists can drift silently if not guarded.
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
