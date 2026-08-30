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
   * Update an existing booking. The aggregate already has an id.
   *
   * Returns nothing: the caller already holds the aggregate, and there is nothing
   * new to return from a write to an existing row.
   */
  save(booking: Booking): Promise<void>;

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
