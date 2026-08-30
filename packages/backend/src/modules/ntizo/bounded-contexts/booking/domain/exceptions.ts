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
