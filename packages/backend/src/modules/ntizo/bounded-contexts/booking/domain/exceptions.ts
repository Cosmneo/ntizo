import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from "@cosmneo/onion-lasagna";

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
 * status the booking is actually in — accepting a booking nobody submitted,
 * marking done a booking that was never confirmed, and so on.
 *
 * Thrown by `Booking.submit`, `Booking.accept`, `Booking.decline` and
 * `Booking.markPaid` today. `expire` deliberately does not: a timer racing
 * the booking's own writes is an ordinary event, not a broken one, and
 * throwing here would turn every ordinary race into an error somebody has
 * to read (see `Booking.expire`'s own doc comment).
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
 * Refused because a second payment landed on a booking that was already paid,
 * carrying a different reference.
 *
 * The distinction this class exists to make: a webhook that arrives twice
 * carries the *same* reference, and `markPaid` absorbs it silently because
 * absorbing it is correct — the payment succeeded once and is being announced
 * twice. A *different* reference is a different transaction. The customer was
 * debited twice for one slot and is owed money back, and there is no reading
 * of that fact under which the right response is to shrug.
 *
 * Separate from `BookingTransitionError` rather than reusing it, though the
 * first version of this guard did reuse it. That produced the message "A
 * booking cannot go from mpesa-123 to mpesa-456", which is not a sentence
 * about anything, and left `.from` and `.to` — fields every other thrower
 * fills with a `BookingStatus` — holding payment references instead. A
 * consumer branching on those fields would have had no way to tell which kind
 * of value it was looking at.
 */
export class PaymentReferenceMismatchError extends ConflictError {
  constructor(
    public readonly existingPaymentRef: string | null,
    public readonly incomingPaymentRef: string,
  ) {
    super({
      message: `This booking was already paid under reference "${existingPaymentRef ?? "(none on file)"}"; a second payment arrived under "${incomingPaymentRef}"`,
      code: "PAYMENT_REFERENCE_MISMATCH",
    });
    this.name = "PaymentReferenceMismatchError";
  }
}

/**
 * Refused because another booking already holds this member's calendar at
 * an overlapping time.
 *
 * The check happens twice, on purpose. `booking_member_slot_no_overlap` —
 * the `EXCLUDE USING gist` constraint in `booking.schema.ts` — is the one
 * that actually prevents a double-booking: two requests can both read
 * "free" before either writes, and the database is the only party present
 * for both writes at once. It refuses any two active bookings on the same
 * member whose time ranges overlap at all, not only two that share an
 * identical start — its predecessor, the partial unique index
 * `booking_member_slot_active_uq`, only ever compared `starts_at`, so a
 * 90-minute booking and a later 30-minute one starting inside it could both
 * be inserted (see the constraint's own comment in `booking.schema.ts` for
 * that history). The command that inserts a booking checks availability
 * first too, but that check is for the honest path (a good error message
 * before anyone touches the database), not the race — losing the race is
 * not a bug, being told about it silently would be.
 *
 * Raised by the repository when Postgres rejects the insert with either
 * constraint's own violation code — the exclusion constraint's or, until
 * every stage's database has actually been migrated onto it, the old
 * index's (see `booking.repository.ts`'s `isSlotCollision` for why both are
 * still checked) — and caught by the booking command, which needs to catch
 * it without importing anything from `infrastructure/`. It is declared
 * here, in the domain, rather than in the repository that detects it,
 * because "this slot is already taken" is a fact about bookings, not a fact
 * about Postgres.
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

/**
 * Refused because the service option a customer tried to book does not
 * exist.
 *
 * Task 8's `CreateBookingCommand` checks this first, ahead of every other
 * refusal it can raise: there is no provider to read, no price to snapshot,
 * and no pricing rule to check anything else against until an option is
 * found. A stale link — a page bookmarked before the option was deleted —
 * is exactly what reaches this path.
 */
export class ServiceOptionNotFoundError extends NotFoundError {
  constructor(public readonly serviceOptionId: string) {
    super({
      message: `No service option was found with id "${serviceOptionId}"`,
      code: "SERVICE_OPTION_NOT_FOUND",
    });
    this.name = "ServiceOptionNotFoundError";
  }
}

/**
 * Refused because a service option that does exist has no name to snapshot —
 * not in the locale the customer was reading, and not in the service's own
 * source locale either.
 *
 * A booking records the name of the thing that was bought, and `""` is not a
 * name. `Booking.create` already refuses it (`BookingFieldBlankError`), and
 * that guard stays, but it is four calls too late to say anything useful: by
 * then the fact has been flattened into "a booking field was blank", with no
 * option id in it and nothing pointing at the catalogue row that is actually
 * wrong. This is the same refusal made where the missing thing is still
 * visible.
 *
 * **Raised by `ServicePricingReaderPort.findOption`, not by the command.** The
 * reader's job is to describe an option; an option with no name anywhere is
 * one it cannot describe, and returning `""` was that port answering a
 * question it should have refused. Declared here rather than beside the
 * adapter that throws it for the same reason `SlotAlreadyTakenError` is —
 * "this option has no name" is a fact about what can be booked, not a fact
 * about Postgres.
 *
 * Both locales are named in the message because the reader falls back from
 * one to the other (see `DrizzleServicePricingReader`), and the two failures
 * want different fixes: a name missing only from the customer's locale is a
 * translation gap the fallback silently absorbs, while one missing from the
 * source locale too is a service nobody ever named. Only the second reaches
 * here.
 *
 * How dev got twenty of these: nothing requires an option to be named.
 * `canPublish` checks the category, the source *service* name, the member
 * count and the option count, and says nothing about option names — so a
 * provider can publish a service whose options no customer can ever book.
 * That gap is follow-up #122; this error is what makes it legible when it
 * bites.
 */
export class ServiceOptionUnnamedError extends UnprocessableError {
  constructor(
    public readonly serviceOptionId: string,
    public readonly requestedLocale: string,
    public readonly sourceLocale: string,
  ) {
    super({
      message: `Service option "${serviceOptionId}" has no name in "${requestedLocale}" or in its service's source locale "${sourceLocale}"`,
      code: "SERVICE_OPTION_UNNAMED",
    });
    this.name = "ServiceOptionUnnamedError";
  }
}

/**
 * Refused because a command was given a booking id that does not name any
 * booking.
 *
 * Both of Task 9's commands throw this rather than returning silently, even
 * though neither is ever called by a person waiting on a response.
 * `MarkBookingPaidCommand` is driven by Payment's event and
 * `SweepBookingCommand` by a sweep job — but a payment event naming a
 * booking that does not exist means the money and the booking have come
 * apart, and a sweep naming one means the job outlived its row.
 * Neither is routine, and a command that shrugs at both leaves nothing
 * behind for anyone to find them by.
 */
export class BookingNotFoundError extends NotFoundError {
  constructor(public readonly bookingId: string) {
    super({
      message: `No booking was found with id "${bookingId}"`,
      code: "BOOKING_NOT_FOUND",
    });
    this.name = "BookingNotFoundError";
  }
}

/**
 * Refused because the caller trying to accept or decline a booking does not
 * belong to the provider it is for.
 *
 * Same `code` as scheduling's and catalog's own `NotProviderMemberError` —
 * all three name the one thing "the caller has no `provider_member` row
 * here" means — but declared separately here rather than imported across
 * bounded contexts, the same shape this codebase already uses for
 * `ServiceMemberCannotPerformError` above (see scheduling's own
 * `domain/exceptions.ts`). Do not "fix" this back into an import.
 *
 * Deliberately not `NotFoundError`: whether `providerId` names a real
 * provider is a fact `AcceptBookingCommand` and `DeclineBookingCommand`
 * never even have to ask — they already have the booking's own
 * `providerId`, read off a row that exists. What is missing is a
 * relationship between the caller and that provider, and refusing to
 * disclose which of the two is absent is the same reasoning
 * `NotProviderMemberError` uses everywhere else it appears: telling an
 * unrelated caller "no such provider" would leak whether a given id is
 * real.
 */
export class NotProviderMemberError extends ForbiddenError {
  constructor() {
    super({
      message: "This workspace is not one you belong to",
      code: "NOT_PROVIDER_MEMBER",
    });
    this.name = "NotProviderMemberError";
  }
}

/**
 * Refused because the caller trying to submit a booking is not the
 * customer it belongs to.
 *
 * Ruling N: the original brief scoped authorisation to
 * `AcceptBookingCommand` and `DeclineBookingCommand` and said nothing about
 * `SubmitBookingCommand` — an omission, not a decision. Submitting somebody
 * else's `DRAFT` starts the provider's response window and puts a request
 * in their queue the customer never sent; the booking's own `customerId`,
 * already on the row `SubmitBookingCommand` reads, is what this checks
 * against.
 *
 * Deliberately not `NotFoundError`, for the same reason
 * `NotProviderMemberError` is not: `SubmitBookingCommand` already has the
 * booking, read off a row that exists. What is missing is a relationship
 * between the caller and it, and a message admitting as much is more
 * honest than a fabricated "not found" — this booking exists; it simply
 * isn't the caller's.
 */
export class NotBookingCustomerError extends ForbiddenError {
  constructor() {
    super({
      message: "This booking does not belong to you",
      code: "NOT_BOOKING_CUSTOMER",
    });
    this.name = "NotBookingCustomerError";
  }
}

/**
 * Refused because the customer submitting a booking has no phone number on
 * file.
 *
 * Checkout's step 3 promises the customer "Recebe um pedido de pagamento no
 * 84 ••• 4021" — M-Pesa pushes its prompt to a handset, not to an account.
 * `profile.phone_number` is nullable and nothing in the platform requires it,
 * and the cost of that gap is already recorded: a customer with no number is
 * charged into the void, spends all three of `ChargeBookingCommand`'s
 * attempts, and the payment window then cancels the booking *telling the
 * provider the customer did not pay*. Refusing at `submit` closes it by
 * construction, before a provider's calendar is ever committed to a request
 * that cannot be paid for.
 *
 * The refusal, not the step-3 form field, is what makes the number a rule: a
 * UI convention can be skipped by anything that calls `booking.submit`
 * directly.
 *
 * `UnprocessableError`, not `ForbiddenError`: the caller is exactly who they
 * claim to be and is entitled to submit this booking — what is missing is a
 * fact about their profile, and the remedy is to supply it, which is a
 * different sentence to say on the page than "this is not yours".
 */
export class CustomerPhoneMissingError extends UnprocessableError {
  constructor(public readonly customerId: string) {
    super({
      message: "Add a phone number to your profile before sending this request",
      code: "CUSTOMER_PHONE_MISSING",
    });
    this.name = "CustomerPhoneMissingError";
  }
}

/**
 * Refused because a customer asking to be charged right now has no phone
 * number on file — checked by `RequestBookingChargeCommand` before it lets
 * anything claim an attempt against this booking.
 *
 * Not `CustomerPhoneMissingError` reused, though the two say almost the same
 * thing. That class closes the gap at `submit`, for the honest path: a
 * booking created after that guard shipped cannot reach `PENDING_PAYMENT`
 * without a number on file. This one exists for the command that still has
 * to ask anyway — a booking that predates the guard, or reached this status
 * some other way — and it exists for a sharper reason than completeness:
 * `ChargeBookingCommand` treats a missing number as an ordinary charge
 * failure and spends an attempt on it, which is the right call for a sweep
 * that has nobody to ask, but the wrong one for a customer who just pressed
 * "Pagar" and could simply be told. Refusing here, before this booking's
 * attempt count is touched, is what stops that customer's three attempts
 * being burned in silence while their provider is told, falsely, that they
 * never paid — see `ChargeBookingCommand`'s own doc comment for the fix this
 * was always waiting on.
 *
 * `UnprocessableError`, matching `CustomerPhoneMissingError`: the caller is
 * exactly who they claim to be, and what is missing is a fact about their
 * profile, not a permission.
 */
export class BookingNoCustomerPhoneError extends UnprocessableError {
  constructor(public readonly bookingId: string) {
    super({
      message: "Add a phone number to your profile before requesting a charge",
      code: "BOOKING_NO_CUSTOMER_PHONE",
    });
    this.name = "BookingNoCustomerPhoneError";
  }
}

/**
 * Refused because this booking has already spent every charge attempt the
 * platform allows it — `BOOKING_CHARGE_ATTEMPT_LIMIT` of them, whichever
 * claimed the last one, the per-minute sweep or a customer's own press of
 * "Pagar".
 *
 * A request past this point is not a new fact for the platform to act on:
 * the row's fate is already settled the ordinary way, by its payment window
 * running out. `RequestBookingChargeCommand` refuses here rather than
 * starting an attempt the bound was never meant to allow — the bound is the
 * real protection (`ChargeBookingCommand`'s cooldown only spaces unattended
 * retries out; it is not what caps them), and a request the customer typed
 * in themselves does not get to bypass it.
 *
 * `UnprocessableError`, not `ForbiddenError`, for the same reason
 * `BookingTransitionError` already is one: the caller is entitled to ask,
 * and what refuses them is the booking's own state, not who they are.
 */
export class BookingChargeAttemptsSpentError extends UnprocessableError {
  constructor(public readonly bookingId: string) {
    super({
      message: "This booking has already used every payment attempt it is allowed",
      code: "BOOKING_CHARGE_ATTEMPTS_SPENT",
    });
    this.name = "BookingChargeAttemptsSpentError";
  }
}

/**
 * Refused because too little of the payment window is left for a gateway
 * call to safely land inside it.
 *
 * The same guard `ChargeBookingCommand`'s own claim re-asserts at the write —
 * see `BOOKING_CHARGE_MIN_WINDOW_MS`'s own comment for the failure this
 * closes: a call still blocking when the deadline sweep passes gets the
 * booking cancelled and its provider told the customer did not pay, and then
 * returns with the customer's money already moved. `RequestBookingChargeCommand`
 * checks it too, ahead of the phone read and the schedule, so a request this
 * close to the deadline is refused with a reason instead of being let in to
 * race the sweep to the same ending.
 *
 * `UnprocessableError`, matching `BookingChargeAttemptsSpentError` beside
 * it: the caller is entitled to ask, and this booking simply is not in a
 * state that can be acted on right now.
 */
export class BookingPaymentWindowClosedError extends UnprocessableError {
  constructor(public readonly bookingId: string) {
    super({
      message: "This booking's payment window is too close to closing to start a new charge",
      code: "BOOKING_PAYMENT_WINDOW_CLOSED",
    });
    this.name = "BookingPaymentWindowClosedError";
  }
}

/**
 * Refused because the payment processor cannot charge anybody right now.
 *
 * `PaymentChargePort.readiness()` said no: no credentials on this stage, or a
 * live gateway still carrying a sandbox shortcode. That is categorically not
 * this customer's doing, and `ChargeBookingCommand` already refuses to spend
 * an attempt on it — its own comment records what happened when the discovery
 * was made *inside* the charge instead: "twelve minutes of misconfiguration
 * permanently killed every booking accepted in that window, and then told
 * their providers the customer did not pay".
 *
 * `RequestBookingChargeCommand` asks the same question in its synchronous
 * half, because that is the half a customer is watching. Without it, a stage
 * with no credentials answers every press of "Pagar" with "a prompt is on its
 * way to your handset" and nothing is ever sent. This error is what the page
 * turns into "try again in a moment" — the one ending where that sentence is
 * true, since the fix is somebody else's and the booking is otherwise fine.
 *
 * `UnprocessableError`, matching the two beside it: the caller is entitled to
 * ask, and what refuses them is the platform's own state rather than who they
 * are. The processor's own code and description are logged, never returned —
 * a customer has no use for a gateway's error code, and it is not theirs to
 * read.
 */
export class BookingChargeUnavailableError extends UnprocessableError {
  constructor(public readonly bookingId: string) {
    super({
      message: "Payments cannot be taken right now",
      code: "BOOKING_CHARGE_UNAVAILABLE",
    });
    this.name = "BookingChargeUnavailableError";
  }
}

/**
 * Refused because the provider a service option belongs to does not exist.
 *
 * Checked last among Task 8's refusals, once every fact the option itself
 * carries has already checked out. `ProviderSnapshotReaderPort.findForBooking`
 * returns null only for this case — a provider row missing beneath a service
 * option that still references it — distinct from a real provider with a
 * zero commission rate, which is a normal, allowed snapshot.
 */
export class ProviderNotFoundError extends NotFoundError {
  constructor(public readonly providerId: string) {
    super({
      message: `No provider was found with id "${providerId}"`,
      code: "PROVIDER_NOT_FOUND",
    });
    this.name = "ProviderNotFoundError";
  }
}

/**
 * Refused because the thing a customer is looking at cannot be bought the way
 * they are trying to buy it — for one of four reasons, each needing different
 * words on the page that sent them here:
 *
 * - `"quote"` — the service is quote-based (`booking_mode = "quote"`); there
 *   is no price to snapshot until a provider has seen the job.
 * - `"not_published"` — the service exists but is not currently published.
 * - `"option_retired"` — the service is fine, but this particular option has
 *   since been deactivated by its provider.
 * - `"hourly"` — the option prices by the hour. `Booking.create` needs a
 *   `durationMinutes`, and an hourly option has none by construction: the
 *   customer picks a length within a minimum and a step, and the price
 *   follows from that choice — a second pricing rule, with its own rounding,
 *   that no task in this plan implements. This is a boundary of what has
 *   been built, not a judgement on the provider or the option, and the
 *   message says so rather than implying a fault.
 *
 * One class, not four, because the call sites read well as one fact — "you
 * cannot buy this" — with four different reasons to display. But the `code`,
 * not the class and not the `reason` property, is what survives the trip to
 * the client: `mapErrorToGraphQLError` copies `message` and `error.code`
 * onto the GraphQL error and nothing else, so a single shared
 * `"SERVICE_NOT_BOOKABLE"` code would have made all four reasons
 * indistinguishable on the other side of that boundary — the frontend would
 * have had a `reason` field to read in this process and no way to ask for it
 * in the one that actually renders the refusal. The discriminator therefore
 * has to live in the code, the same shape this codebase already uses for
 * `OptionDurationError`'s two reasons.
 *
 * The code is derived from `reason` through `SERVICE_NOT_BOOKABLE_CODES`, a
 * `Record` keyed by the full `ServiceNotBookableReason` union rather than a
 * `switch` with a default. A `Record` missing a key is a compile error the
 * moment a fifth reason is added to the union; a `switch`'s default case
 * would accept the same fifth reason silently and hand it whatever code the
 * default falls back to.
 */
/**
 * - `"provider_not_active"` — the option is fine and the service is
 *   published, but the workspace selling it is not currently trading.
 *   `provider.status` defaults to `pending`, so a workspace nobody has
 *   reviewed yet already holds live option ids it can hand out directly, and
 *   a workspace suspended after trading distributed its ids while it was
 *   still active — the exact hole `SlotValidityReaderPort` closes. Checked
 *   there, alongside the member and the slot, rather than by widening
 *   `ProviderSnapshotReaderPort` to filter on status: that port's contract is
 *   deliberately "gone" versus "exists, with a real snapshot" (see its own
 *   doc comment), and folding a third meaning into it would leave the
 *   booking's provider-name/commission snapshot with nothing to read for a
 *   suspended provider's already-placed booking history.
 */
export type ServiceNotBookableReason =
  | "quote"
  | "not_published"
  | "option_retired"
  | "hourly"
  | "provider_not_active";

const SERVICE_NOT_BOOKABLE_MESSAGES: Record<ServiceNotBookableReason, string> = {
  quote: "This service needs a quote before it can be booked — there is no fixed price yet",
  not_published: "This service is not currently available to book",
  option_retired: "This option is no longer offered",
  hourly: "Booking by the hour is not supported yet",
  provider_not_active: "This provider is not currently accepting bookings",
};

const SERVICE_NOT_BOOKABLE_CODES: Record<ServiceNotBookableReason, string> = {
  quote: "SERVICE_NOT_BOOKABLE_QUOTE",
  not_published: "SERVICE_NOT_BOOKABLE_NOT_PUBLISHED",
  option_retired: "SERVICE_NOT_BOOKABLE_OPTION_RETIRED",
  hourly: "SERVICE_NOT_BOOKABLE_HOURLY",
  provider_not_active: "SERVICE_NOT_BOOKABLE_PROVIDER_NOT_ACTIVE",
};

export class ServiceNotBookableError extends UnprocessableError {
  constructor(public readonly reason: ServiceNotBookableReason) {
    super({
      message: SERVICE_NOT_BOOKABLE_MESSAGES[reason],
      code: SERVICE_NOT_BOOKABLE_CODES[reason],
    });
    this.name = "ServiceNotBookableError";
  }
}

/**
 * Refused because `providerMemberId` does not name someone who performs this
 * service.
 *
 * Same `code` as Scheduling's own `ServiceMemberCannotPerformError` — both
 * name the one thing "this member cannot do this service" means — but
 * declared separately here rather than imported across bounded contexts, the
 * same shape this codebase already uses for `NotProviderMemberError` and
 * `NotProviderOwnerOrAdminError` (see scheduling's `domain/exceptions.ts`).
 * Do not "fix" this back into an import.
 *
 * One error for two distinct client mistakes, on purpose: a member who
 * belongs to this service's own provider but was never assigned to this
 * service, and a member who belongs to an entirely different provider.
 * `SlotValidityReaderPort`'s single `service_member` join cannot tell these
 * apart — `SetServiceMembersCommand` never lets a `service_member` row exist
 * for a member outside the service's own provider in the first place, so a
 * cross-provider id fails the exact same join a same-provider-wrong-service
 * id fails. Distinguishing them would need a second query whose only purpose
 * is deciding which of two identical refusals to word differently.
 */
export class ServiceMemberCannotPerformError extends UnprocessableError {
  constructor(
    public readonly serviceId: string,
    public readonly memberId: string,
  ) {
    super({
      message: `Member "${memberId}" cannot perform service "${serviceId}"`,
      code: "SERVICE_MEMBER_CANNOT_PERFORM",
    });
    this.name = "ServiceMemberCannotPerformError";
  }
}

/**
 * Refused because `startsAt` already happened.
 *
 * Not a Scheduling rule reused from `list-service-availability.projection.ts`
 * — that projection has no notion of "now" built into it, and answers
 * whatever `from`/`to` window it is asked about, past window included. This
 * is a booking-specific refusal `SlotValidityReaderPort` owns outright.
 */
export class SlotInPastError extends UnprocessableError {
  constructor(public readonly startsAt: Date) {
    super({
      message: `"${startsAt.toISOString()}" is in the past`,
      code: "SLOT_IN_PAST",
    });
    this.name = "SlotInPastError";
  }
}

/**
 * Refused because nobody offered this member at this instant.
 *
 * Distinct from `SlotAlreadyTakenError`: that class is the database's own
 * refusal, raised when the partial unique index rejects a concurrent insert
 * — the race Task 4's constraint exists to make impossible. This one is the
 * honest path's refusal, raised by `SlotValidityReaderPort` before anything
 * is written, and it fires just as readily for a start nobody's calendar
 * ever offered (off-grid, outside a rule's window, a day the member is
 * closed) as for one that is currently held by another booking — `busy` is
 * one more input `startsForDay` already weighs alongside the rules and the
 * exceptions, not a separate check this reader runs twice.
 */
export class SlotNotOfferedError extends UnprocessableError {
  constructor(
    public readonly providerMemberId: string,
    public readonly startsAt: Date,
  ) {
    super({
      message: `Member "${providerMemberId}" does not offer a slot starting at ${startsAt.toISOString()}`,
      code: "SLOT_NOT_OFFERED",
    });
    this.name = "SlotNotOfferedError";
  }
}
