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
 * The statuses in which `expires_at` is a deadline somebody is still
 * standing on — the design's three clocks, in the order a booking meets
 * them.
 *
 * Each is stamped by the hop that enters the status, from its own
 * `platform_settings` column: `Booking.create` writes the checkout hold,
 * `submit` overwrites it with the provider's response window, `accept`
 * overwrites that with the payment window. By the time the expiry sweep
 * reads the row, whichever clock applies is already *in* the column — which
 * is why `findDueForExpiry` is one predicate (`expires_at <= now AND status
 * IN (…)`) and not three queries, and why nothing in the repository has to
 * join `platform_settings` to ask how long a window was.
 *
 * A subset of `SLOT_HOLDING_STATUSES`, and not by coincidence: a live
 * deadline is the platform holding somebody's calendar while it waits for
 * an answer. But not the same list, and the two must not be merged.
 * `CONFIRMED` and `MARKED_DONE` also hold the slot and also still carry the
 * `expires_at` they were given — `markPaid` deliberately stopped nulling it
 * (see `BookingProps.expiresAt`) — so the only thing keeping a paid booking
 * out of the sweep is its absence from *this* list. Add a status to
 * `SLOT_HOLDING_STATUSES` and forget this one and the new status simply
 * never expires; add it here without meaning to and the sweep starts
 * cancelling sales that already happened.
 *
 * **Membership here is not the whole answer — it is only the question.**
 * What each of the three becomes when its clock runs out is different:
 * `DRAFT` and `AWAITING_PROVIDER` expire (`Booking.expire`), while
 * `PENDING_PAYMENT` is *cancelled* with a reason (`Booking.cancel`),
 * because by then a provider has committed their calendar and is owed an
 * explanation rather than a status change nobody narrates. Adding a fourth
 * member here without answering that question for it leaves
 * `SweepBookingCommand` with nothing to do for the rows it now selects.
 */
export const DEADLINE_BEARING_STATUSES = [
  BookingStatus.Draft,
  BookingStatus.AwaitingProvider,
  BookingStatus.PendingPayment,
] as const;
