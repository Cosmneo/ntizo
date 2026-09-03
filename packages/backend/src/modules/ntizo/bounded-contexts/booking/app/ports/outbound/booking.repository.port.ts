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
 * `findDueForSweep` is declared here, on this port, but not implemented here:
 * a class must satisfy every member of the interface it implements, so once
 * Task 7's repository exists it has to implement whatever this port declares,
 * whether or not the task that will call it has been written yet. Task 12
 * (the sweep) is the caller, not the implementer — Task 7 already
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
   * The one draft this customer is allowed to be holding, if any.
   *
   * A customer who abandons step 2 three times would otherwise hold three
   * slots for thirty minutes each — follow-up #108's calendar-hold problem
   * arriving by accident rather than by attack. `CreateBookingCommand` reads
   * this and expires what it finds before holding another slot.
   *
   * Not a rate limit and not pretending to be one: a scripted caller can
   * still create, abandon and re-create in a loop. #108 stays open.
   *
   * **This read takes a lock, and the lock is the rule.** Called inside a
   * transaction, it serialises every other caller asking about the *same
   * customer* until that transaction ends. Without it the rule is optimistic
   * and its own name is false: two concurrent creates — a double-click, or a
   * retry racing the original — both read "no open draft", both insert, and
   * the customer holds two slots. The lock makes the loser see the winner's
   * draft and supersede it, so **both calls still succeed** and the race
   * becomes the intended behaviour rather than an error.
   *
   * A lock rather than a partial unique index on `(customer_id) WHERE status
   * = 'DRAFT'`, which was considered and rejected on what it does to the
   * loser: a constraint violation this command would have to catch and the
   * customer would have to retry, for doing nothing wrong. Serialising costs
   * one waiting transaction and produces the right answer on its own.
   *
   * **It does not make the caller's compare-and-swap redundant.** The lock is
   * keyed on the customer; a `submit` or a sweep touching that same draft
   * holds no such lock and can still land between this read and the write
   * that follows it. That is what `save`'s `expectedStatus` is for, and it
   * stays.
   */
  findOpenDraftForCustomer(customerId: string): Promise<Booking | null>;

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
   * payment webhook and the sweep are watching the *same* deadline
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
   * **Not `findDueForExpiry`, which is what this was called.** Two of the
   * three statuses it returns are destined to expire and the third to be
   * cancelled, so a name promising expiry describes a third of its own
   * result wrongly — the same defect that renamed `SweepBookingCommand`,
   * and a port method carries it further than a command does, because every
   * implementer and every fake repeats the name.
   *
   * Oldest first, with a limit, so a sweep that can only drain part of a
   * backlog drains it in the order it accumulated rather than starving
   * whichever booking has been waiting longest.
   */
  findDueForSweep(now: Date, limit: number): Promise<Booking[]>;

  /**
   * Find accepted bookings that still owe a charge — the charge sweep's
   * question, and a different one from `findDueForSweep`'s.
   *
   * That method asks *what has run out of time*; this one asks *what has
   * been promised and not yet paid for*. They read the same column from
   * opposite ends: a booking is due for the deadline sweep once
   * `expires_at <= now`, and eligible for a charge only while
   * `expires_at > now`. The two results are therefore disjoint by
   * construction, which is what keeps one sweep from pushing a payment
   * prompt at a booking the other is about to cancel.
   *
   * `PENDING_PAYMENT` is the whole status filter, and it is also the whole
   * "not yet charged" test: a charge that lands moves the booking to
   * `CONFIRMED` (`Booking.markPaid`), so a booking still at this status is
   * one no charge has succeeded against. There is no separate "charged"
   * flag to go stale.
   *
   * `maxAttempts` and `notAttemptedSince` are the caller's policy, passed in
   * rather than known here, for the same reason `findDueForSweep` takes
   * `now`: a repository that decided how many retries a charge gets, or how
   * long to wait between them, would be a repository making a product
   * decision. See `ChargeAcceptedBookingsInternalCommand`, which owns both
   * numbers and explains why the second one exists at all.
   *
   * Oldest deadline first, so a wave too small to drain a backlog spends
   * itself on the bookings closest to losing their slot rather than on
   * whichever rows the planner happened to reach.
   *
   * **Every criterion here is re-asserted by `recordChargeAttempt`**, which
   * is what actually claims a booking — the status, the bound, the cooldown
   * and the deadline floor alike. This query is a candidate list read from a
   * snapshot; by the time a wave reaches its fifth booking, minutes have
   * passed, another wave may have charged it, and its payment window may have
   * closed underneath it. See that method.
   */
  findAwaitingCharge(criteria: {
    /**
     * A booking's `expires_at` must be strictly after this instant — **not
     * simply after "now"**.
     *
     * The caller pushes this into the future by however long a charge can
     * take, because a booking whose payment window closes mid-call is one
     * the deadline sweep will cancel while the customer is being asked to
     * pay for it. See `BOOKING_CHARGE_MIN_WINDOW_MS`.
     */
    deadlineAfter: Date;
    limit: number;
    /** A booking that has already been attempted this many times is left to its payment window. */
    maxAttempts: number;
    /** Only bookings whose last attempt started at or before this instant — or that have none. */
    notAttemptedSince: Date;
  }): Promise<Booking[]>;

  /**
   * **Claim** one booking for a charge: count the attempt and return its new
   * number, or `null` if this caller may not charge it after all.
   *
   * **This is a compare-and-swap, not a counter**, and the difference is the
   * whole reason it takes criteria. It carries the same predicate
   * `findAwaitingCharge` selected on — status, the attempt bound, the
   * cooldown — into the `UPDATE`'s own `WHERE`, exactly as `save` carries
   * `expectedStatus`. Whichever wave writes first wins; the loser matches
   * zero rows, gets `null`, and charges nobody.
   *
   * **Without that, the bound and the cooldown are advisory**, because two
   * waves overlap here *by construction*. A wave charges up to
   * `BOOKING_CHARGE_LIMIT` bookings one at a time and an unanswered C2B
   * blocks for about sixty seconds — against a cron that fires every sixty.
   * With two due bookings: wave 1 selects `[B1, B2]` and blocks on B1; at
   * T+60 wave 2 correctly skips B1 (its attempt is recorded) but selects B2,
   * whose `last_charge_attempt_at` is still null, and prompts it; at T+62
   * wave 1 finishes B1, reaches B2, and prompts it **a second time, one
   * second later**. That is precisely the stacked prompt
   * `last_charge_attempt_at` exists to prevent, and a customer who accepts
   * both is debited twice. With three or more due bookings the bound itself
   * is exceeded — four charges against a limit of three. A predicate that
   * only ever runs in the `SELECT` cannot see any of this; one in the
   * `UPDATE` settles it.
   *
   * **Called before the charge, not after it.** A C2B blocks for up to a
   * minute; if the attempt were recorded on the way back, a Worker evicted
   * mid-call would leave the count untouched and the next wave would push a
   * second prompt at a handset already showing one — and would keep doing it
   * for ever, since the bound would never be reached. Recording first makes
   * the crash cost a retry instead of costing the bound.
   *
   * The returned number is what `ChargeBookingCommand` builds this attempt's
   * payment references from, so they are reconstructible from the row
   * afterwards — the thing any later reconciliation needs in order to ask the
   * processor what became of an attempt whose answer we never heard. It is
   * the *claimed* number rather than a read-back one for the same reason the
   * write is a CAS: two waves reading the same value and writing the same
   * value back would give two attempts the same reference, and a processor
   * refuses a repeated reference as a duplicate.
   *
   * Deliberately not routed through the aggregate. `charge_attempts` is not
   * part of the sale (see its column comment), and an atomic
   * `SET charge_attempts = charge_attempts + 1` cannot lose an increment the
   * way a read-transition-write through `Booking` could.
   */
  recordChargeAttempt(claim: {
    bookingId: string;
    /** Stamped onto `last_charge_attempt_at`, and what starts this booking's cooldown. */
    at: Date;
    /** The same bound `findAwaitingCharge` selected on, re-asserted at the write. */
    maxAttempts: number;
    /** The same cooldown boundary `findAwaitingCharge` selected on, re-asserted at the write. */
    notAttemptedSince: Date;
    /**
     * The booking's `expires_at` must still be strictly after this instant.
     *
     * **Computed from the claim instant, not from the wave's** — unlike the
     * two criteria above it, and the asymmetry is the point. Those two exist
     * so the claim tests the identical boundary the select tested; this one
     * exists because the select's boundary has *gone stale*, and re-testing
     * it would be re-asking a question whose answer expired.
     *
     * Without it, this is the sequence that loses a customer's money
     * outright. A wave of five bookings at ~62s each runs past five minutes.
     * It selects B1…B5 at 12:00:00 against a 12:03:00 floor; B5's deadline is
     * 12:04:30, comfortably clear. The wave reaches B5 at 12:04:08, the claim
     * passes, and a prompt goes out. At 12:05:00 the deadline sweep cancels
     * B5, releases the slot and tells the provider *the customer did not
     * pay*. At 12:05:05 the customer types their PIN — `INS-0`. The money is
     * gone and exists nowhere in the database: `paid_at` null, `payment_ref`
     * null, one line in a log.
     *
     * It also protects the property that makes "refunds are out of scope"
     * survivable at all — that a `CANCELLED` booking has never been charged.
     * This is the only hole in it.
     */
    deadlineAfter: Date;
  }): Promise<number | null>;

  /**
   * Stop charging this booking, whatever its attempt count — the answer to an
   * outcome we cannot interpret.
   *
   * Used for exactly one thing: a charge whose result was `ambiguous`. The
   * prompt may still be live on the customer's handset, or the money may
   * already have moved, and every attempt carries a fresh reference so the
   * processor will not refuse a second one as a duplicate. There is no safe
   * retry, so the booking is taken out of the sweep's reach and left to its
   * payment window — which cancels it and tells the provider, the same ending
   * a customer who never answers gets.
   *
   * Raises the count to `maxAttempts` rather than nulling anything, so the
   * booking leaves by the ordinary door: `findAwaitingCharge` simply stops
   * selecting it, with no new status and no special case anywhere. `GREATEST`
   * rather than an assignment so a bound lowered between deploys cannot
   * accidentally *revive* a booking this was called for.
   */
  abandonCharge(abandonment: {
    bookingId: string;
    at: Date;
    maxAttempts: number;
  }): Promise<void>;

  /**
   * This booking's charge ledger — `charge_attempts` and
   * `last_charge_attempt_at` — read alone, no aggregate loaded.
   *
   * Neither column is part of `BookingProps` (see their own comments in
   * `booking.schema.ts`): they are bookkeeping the sweep's compare-and-swap
   * claims, not facts the domain reasons about, and `Booking.restore` has no
   * field to put numbers in that change underneath every claim without any
   * status ever moving. `RequestBookingChargeCommand` needs them anyway,
   * cheaply, ahead of anything that writes — to refuse a spent booking before
   * touching it, and to tell a customer pressing "Pagar" a second time that
   * the prompt from a moment ago is still on its way rather than pushing a
   * second one over it. Its own `findById` a moment earlier already answered
   * every other question it asks, so a second aggregate load here would spend
   * a full row fetch on two columns already sitting in it.
   *
   * **Both columns, one read, because they are one fact.** The bound and the
   * cooldown are always asked together and are always compared against the
   * same instant; two single-column reads would be two round trips answering
   * about a row that can move between them.
   *
   * Same shape as `CustomerPhoneReaderPort.findPhoneNumber`: by id, nothing
   * else touched. Returns `{ attempts: 0, lastAttemptAt: null }` — the
   * columns' own defaults — for an id that names no row, which no caller
   * today can actually trigger: the one caller reads this immediately after
   * its own `findById` confirmed the row exists.
   */
  chargeStateOf(bookingId: string): Promise<BookingChargeState>;
}

/** What the charge ledger says about one booking. See `chargeStateOf`. */
export interface BookingChargeState {
  attempts: number;
  /** `null` until the first attempt is claimed against this booking. */
  lastAttemptAt: Date | null;
}
