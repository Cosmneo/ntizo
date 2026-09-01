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
 * `findDueForExpiry` is declared here, on this port, but not implemented here:
 * a class must satisfy every member of the interface it implements, so once
 * Task 7's repository exists it has to implement whatever this port declares,
 * whether or not the task that will call it has been written yet. Task 12
 * (the expiry sweep) is the caller, not the implementer — Task 7 already
 * implemented it, against the specification Task 12 used to carry.
 */
export interface BookingChangeRecord {
  bookingId: string;
  /**
   * Null when no human made this change — the cron sweep ending a booking
   * whose clock ran out is the only such hop today. See the column's own doc
   * comment in `booking-change.schema.ts` for why null rather than a
   * sentinel "system user".
   */
  changedByUserId: string | null;
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
   *
   * **`capacity` is how many seats this call is allowed to fill on
   * `booking.providerMemberId`'s calendar for this window — the same number
   * `SlotValidityReaderPort` resolved off the availability rule that decided
   * the start was offered at all (null already coerced to one upstream; see
   * that port's own `SlotValidityResult` doc comment). Assigning the seat is
   * this method's job, not the caller's, for the reason `booking.schema.ts`
   * gives on the `seat` column: it needs the lock, the occupancy read, and
   * the insert all inside one transaction, and a command computing a seat
   * itself would reopen the exact race the lock exists to close. Refuses
   * with `SlotAlreadyTakenError` when the lowest free seat exceeds
   * `capacity` — see `DrizzleBookingRepository.insert` for the full
   * mechanism, and its own test, `booking-seat-assignment.test.ts`, for why
   * lowest-free is what makes a capacity reduction self-correcting.
   */
  insert(booking: Booking, capacity: number): Promise<Booking>;

  findById(id: string): Promise<Booking | null>;

  /**
   * Update an existing booking, but only if the row is still at
   * `expectedStatus` — the status the caller's own read returned before it
   * computed `booking`'s transition. Returns whether the write actually
   * applied.
   *
   * **This is a compare-and-swap, not a plain `UPDATE`.** `MarkBookingPaidCommand`
   * and `SweepBookingCommand` both read a booking, transition it, and write
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
   * Find bookings standing past a deadline — any of the design's three
   * clocks — oldest deadline first, up to a limit.
   *
   * **One question, not three.** Each hop stamps `expires_at` with its own
   * clock's deadline as it enters the status (`create` the checkout hold,
   * `submit` the provider's response window, `accept` the payment window),
   * so by the time this query runs the right deadline is already in the
   * column and the status is what says which clock put it there. That makes
   * the whole predicate `expires_at <= now AND status IN
   * (DEADLINE_BEARING_STATUSES)` — no per-status branch, and nothing here
   * reads `platform_settings` to ask how long any window was. An
   * implementation that joined that table to recompute a deadline would be
   * answering with today's setting a question the booking already answered
   * when it was created.
   *
   * The status filter is load-bearing on its own: `expires_at` is not
   * cleared when a booking leaves a deadline-bearing status (see
   * `BookingProps.expiresAt`), so a paid, confirmed booking still carries a
   * deadline long in the past and is kept out of this result by its status
   * alone.
   *
   * The caller decides what each returned booking's status *becomes* — the
   * three do not share an ending (see `SweepBookingCommand`). This method
   * only answers which rows are past their own clock.
   *
   * Oldest first, with a limit, so a sweep that can only drain part of a
   * backlog drains it in the order it accumulated rather than starving
   * whichever booking has been waiting longest.
   */
  findDueForExpiry(now: Date, limit: number): Promise<Booking[]>;
}
