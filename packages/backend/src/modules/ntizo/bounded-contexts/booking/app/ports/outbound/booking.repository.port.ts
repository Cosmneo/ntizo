import type { Booking } from "../../../domain/aggregates/booking.aggregate";

/**
 * Why `insert` returns the aggregate and `save` does not: the database assigns the
 * booking id, so the argument arrives with `id: null` and what comes back has one.
 * After insertion, the caller holds the aggregate with its real id. By the time `save`
 * is called, the row exists and the id is known — there is nothing new to return to
 * the caller, only confirmation that the write succeeded. The asymmetry is honest
 * about what each operation does.
 *
 * `BookingChangeRecord` mirrors the columns of `booking_change` as defined in Task 2.
 * Every `previous*` field is nullable because a change records only what actually moved;
 * a status transition without a time change leaves `previousStartsAt` and `previousEndsAt`
 * as null. This prevents a change from claiming facts that are not true.
 *
 * `findDueForExpiry` belongs to Task 12 (the expiry sweep) and is listed here so the
 * port is written once rather than reopened later. Task 12 implements it; Task 6 only
 * declares it.
 */
export interface BookingChangeRecord {
  bookingId: string;
  changedByUserId: string;
  reason: string;
  previousStartsAt: Date | null;
  previousEndsAt: Date | null;
  previousProviderMemberId: string | null;
  previousPriceMinor: number | null;
}

export interface BookingRepositoryPort {
  /**
   * Store a new booking and return it with its id assigned by the database.
   *
   * The argument has `id: null`; the return value has the database-assigned id.
   */
  insert(booking: Booking): Promise<Booking>;

  findById(id: string): Promise<Booking | null>;

  /**
   * Update an existing booking, but only if the row is still at
   * `expectedStatus` — the status the caller's own read returned before it
   * computed `booking`'s transition. Returns whether the write actually
   * applied.
   *
   * **This is a compare-and-swap, not a plain `UPDATE`.** `MarkBookingPaidCommand`
   * and `ExpireBookingCommand` both read a booking, transition it, and write
   * it back inside their own `atomicExecute` — and both are driven by
   * something that can legitimately fire within moments of the other: a
   * payment webhook and the expiry sweep are watching the *same* deadline
   * from opposite sides. Without a status predicate in the `WHERE` clause, a
   * webhook landing as the sweep is mid-flight (M-Pesa's C2B is synchronous
   * against a fifteen-minute window, so approvals routinely land near the
   * deadline — this is not a theoretical race) reads the same
   * `PENDING_PAYMENT` row the sweep just read, computes its own real
   * transition, and overwrites the sweep's write once the row lock frees up
   * — two outbox rows drain from one booking, one of them describing a fact
   * that is no longer true.
   *
   * `expectedStatus` closes that: the caller always passes the status its
   * own `findById` returned, before the transition. Under READ COMMITTED, an
   * `UPDATE` whose `WHERE` includes that predicate blocks on the row lock if
   * a concurrent writer got there first, then re-evaluates the predicate
   * against the row that writer actually committed — so the loser's
   * `WHERE` no longer matches, it updates zero rows, and `false` comes back
   * instead of a second, silently-wrong write. The caller treats `false`
   * exactly like the aggregate's own no-op (`moved === booking`): return
   * without saving anything further and without publishing. The two are
   * deliberately handled the same way, but they are not the same
   * mechanism — the aggregate's identity check can only ever reason about
   * the value it was handed at read time; it has no way to see a conflict
   * that lands on the row afterward. That is exactly what this predicate is
   * for.
   */
  save(booking: Booking, expectedStatus: Booking["status"]): Promise<boolean>;

  /**
   * Append an audit change to the booking_change table.
   *
   * Changes are stored separately from the booking because a booking can move
   * through many states and each change must survive the next one. A change
   * record is append-only; the history it builds is the immutable record of
   * how a booking became what it is.
   */
  appendChange(change: BookingChangeRecord): Promise<void>;

  /**
   * Find bookings that are due for expiry (whose `expires_at` is in the past)
   * up to a limit.
   *
   * Used by Task 12's sweep job to find and expire bookings whose payment
   * deadline has passed. The order (oldest first) and limit let the sweep
   * process in batches and resume from where it left off.
   */
  findDueForExpiry(now: Date, limit: number): Promise<Booking[]>;
}
