import { ConflictError, UnprocessableError } from "@cosmneo/onion-lasagna";

/**
 * The booking context's refusals.
 *
 * Each extends a kit error type so `getGraphQLErrorCode` recognises it and the
 * GraphQL layer stops masking it to INTERNAL_ERROR — the same reason every
 * other bounded context's exceptions do, and the same trap: subclassing plain
 * `Error` with a `code` property compiles, reads correctly, and reaches the
 * browser as "An unexpected error occurred".
 *
 * The `code` strings are a PUBLIC CONTRACT: the frontend branches on them to
 * decide what to say and where. Renaming one breaks that.
 */

export class BookingPriceInvalidError extends UnprocessableError {
  constructor(public readonly priceMinor: number) {
    super({
      message: `A booking's price must be a non-negative whole number of minor units — got ${priceMinor}`,
      code: "BOOKING_PRICE_INVALID",
    });
    this.name = "BookingPriceInvalidError";
  }
}

export class CommissionOutOfRangeError extends UnprocessableError {
  constructor(public readonly commissionBps: number) {
    super({
      message: `A commission rate must be a whole number of basis points from 0 to 10000 — got ${commissionBps}`,
      code: "COMMISSION_OUT_OF_RANGE",
    });
    this.name = "CommissionOutOfRangeError";
  }
}

export class BookingDurationInvalidError extends UnprocessableError {
  constructor(public readonly durationMinutes: number) {
    super({
      message: `A booking's duration must be a positive whole number of minutes — got ${durationMinutes}`,
      code: "BOOKING_DURATION_INVALID",
    });
    this.name = "BookingDurationInvalidError";
  }
}

/**
 * Refused because a required string was empty, or nothing but whitespace.
 *
 * A blank value slides past every other guard this class has: Postgres
 * `NOT NULL` on a `text` column permits `""`, Task 2's CHECK constraints
 * cover price, commission and status but not the snapshot strings, and the
 * shared read model types a field like `serviceName` as a bare `z.string()`,
 * which accepts `""` as readily as it accepts a real name. Nothing between
 * this constructor and a customer's receipt would ever catch it.
 *
 * Trimmed before the check, so `"   "` is refused as readily as `""` — but
 * only for the check. The value that reaches `BookingProps` is exactly what
 * the caller passed in; rewriting a snapshot field to a trimmed copy of
 * itself is not this method's job, and it is not what a snapshot is for.
 *
 * One class for all thirteen required strings, parameterised by `field`,
 * rather than thirteen near-identical classes — the shape of the refusal is
 * identical every time; only which field failed changes.
 */
export class BookingFieldBlankError extends UnprocessableError {
  constructor(public readonly field: string) {
    super({
      message: `A booking's "${field}" cannot be blank`,
      code: "BOOKING_FIELD_BLANK",
    });
    this.name = "BookingFieldBlankError";
  }
}

/**
 * Refused because a date input does not name a real instant.
 *
 * `new Date("garbage")` is a real `Date` — it satisfies the type checker and
 * carries every method a valid one does — but its internal timestamp is
 * `NaN`. Nothing about `startsAt` or `expiresAt` being *typed* as `Date`
 * stops that value from reaching this constructor. Left unguarded, it
 * survives all the way to `endsAt`, which computes to `Invalid Date`, and the
 * failure only surfaces later as a bare `RangeError: Invalid time value` from
 * whatever first calls `.toISOString()` on it — no named error, no field,
 * quite possibly in a different process than the one that accepted the bad
 * input. This is the same class of defect the three numeric guards above
 * already catch (`Number.isInteger` rejects `NaN` on its own); the two
 * `Date` inputs were simply the ones left unchecked.
 */
export class BookingDateInvalidError extends UnprocessableError {
  constructor(public readonly field: string) {
    super({
      message: `A booking's "${field}" must be a valid date`,
      code: "BOOKING_DATE_INVALID",
    });
    this.name = "BookingDateInvalidError";
  }
}

/**
 * Refused because the move it was asked to make is not a legal one from the
 * status the booking is actually in — confirming a booking that was never
 * paid, marking done a booking nobody confirmed, and so on.
 *
 * Defined here in Task 3, alongside the aggregate whose invariant this is,
 * even though nothing in this task throws it yet: Task 5 adds the
 * transitions (`pay`, `confirm`, `decline`, `cancel`, `markDone`, `complete`,
 * `dispute`, `expire`) that do. Declaring it now means that work extends this
 * file instead of reopening it.
 */
export class BookingTransitionError extends UnprocessableError {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super({
      message: `A booking cannot go from ${from} to ${to}`,
      code: "BOOKING_INVALID_TRANSITION",
    });
    this.name = "BookingTransitionError";
  }
}

/**
 * Refused because a row being reconstituted disagrees with itself: a stored
 * `endsAt` that isn't `startsAt` plus `durationMinutes`, or a stored
 * `commissionMinor` that isn't the rounded product of `priceMinor` and
 * `commissionBps`.
 *
 * `create` can never produce this — it derives both fields itself, every
 * time, from the facts they depend on. `restore` is the only path that can
 * reach it, because a stored row is a fact somebody else wrote: an earlier
 * version of this code, a manual edit, a bad migration. Those two derived
 * fields are exactly what a customer's receipt and a provider's payout are
 * computed from, so a mismatch surfacing here — at read time — is cheap
 * compared to the same mismatch surfacing later, as a booking whose payout
 * doesn't reconcile with its price.
 */
export class BookingSnapshotInconsistentError extends UnprocessableError {
  constructor(
    public readonly field: string,
    public readonly stored: unknown,
    public readonly expected: unknown,
  ) {
    super({
      message: `A booking's stored "${field}" is ${String(stored)}, but its other fields say it should be ${String(expected)}`,
      code: "BOOKING_SNAPSHOT_INCONSISTENT",
    });
    this.name = "BookingSnapshotInconsistentError";
  }
}

/**
 * Refused because another booking already holds this member's calendar at
 * this instant.
 *
 * The check happens twice, on purpose. `booking_member_slot_active_uq` — the
 * partial unique index in `booking.schema.ts` — is the one that actually
 * prevents a double-booking: two requests can both read "free" before either
 * writes, and the database is the only party present for both writes at once.
 * The command that inserts a booking checks availability first too, but that
 * check is for the honest path (a good error message before anyone touches
 * the database), not the race — losing the race is not a bug, being told
 * about it silently would be.
 *
 * Raised by Task 7's repository when Postgres rejects the insert with that
 * index's unique-violation code, and caught by Task 8's booking command —
 * which needs to catch it without importing anything from `infrastructure/`.
 * It is declared here, in the domain, rather than in the repository that
 * detects it, because "this slot is already taken" is a fact about bookings,
 * not a fact about Postgres.
 */
export class SlotAlreadyTakenError extends ConflictError {
  constructor(
    public readonly providerMemberId: string,
    public readonly startsAt: Date,
  ) {
    super({
      message: `Member "${providerMemberId}" already has a booking that starts at ${startsAt.toISOString()}`,
      code: "SLOT_ALREADY_TAKEN",
    });
    this.name = "SlotAlreadyTakenError";
  }
}
