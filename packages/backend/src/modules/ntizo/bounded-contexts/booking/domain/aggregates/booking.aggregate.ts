import { BookingStatus } from "../../../../shared/infrastructure/database/booking/enums";
import type { BookingCancelledReason } from "../events";
import {
  BookingDateInvalidError,
  BookingDurationInvalidError,
  BookingFieldBlankError,
  BookingNotEndedError,
  BookingPriceInvalidError,
  BookingSnapshotInconsistentError,
  BookingTransitionError,
  CommissionOutOfRangeError,
  PaymentReferenceMismatchError,
} from "../exceptions";

/**
 * The statuses a charge could actually have landed at — `PENDING_PAYMENT`
 * itself, and everything reachable only by leaving it paid: `CONFIRMED` and
 * `MARKED_DONE`. `markPaid`'s mismatch branch (below) uses this to decide
 * whether a second, different payment reference means somebody is owed a
 * refund.
 *
 * Deliberately **not** `SLOT_HOLDING_STATUSES`
 * (`shared/infrastructure/database/booking/enums.ts`), even though every
 * member of this list is also a member of that one. The two lists used to
 * be the same list, before the reversal this plan is named for: when
 * payment came before the provider's answer, every slot-holding status
 * *was* a status a charge could have reached, because `PENDING_PAYMENT` was
 * the first stop after `create`. It no longer is. `DRAFT` and
 * `AWAITING_PROVIDER` now sit *before* `PENDING_PAYMENT` in the machine — a
 * booking cannot leave either one carrying a payment reference, because
 * nothing charges the customer until the provider accepts — but both are
 * still in `SLOT_HOLDING_STATUSES`, because they still occupy the member's
 * calendar. A single list cannot answer both "does this hold the slot" and
 * "could this have been charged" once those two questions stopped agreeing,
 * which is exactly what happened here: an earlier version of `markPaid`
 * read `SLOT_HOLDING_STATUSES` straight through the reversal and started
 * telling a `DRAFT` or `AWAITING_PROVIDER` booking hit with a mismatched
 * reference that a refund was probably owed on one of two payments — a
 * refund nobody is owed, because neither status has ever been charged once.
 * The honest refusal for both is `BookingTransitionError`: this transition
 * was never legal to begin with, the same as `EXPIRED`.
 */
const CHARGEABLE_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PendingPayment,
  BookingStatus.Confirmed,
  BookingStatus.MarkedDone,
];

/**
 * The statuses `expire` moves — the two of the design's three clocks whose
 * ending is an expiry.
 *
 * `PENDING_PAYMENT` is deliberately absent, and that absence is the whole
 * point of the spec this method was rewritten for: a payment window that
 * runs out ends in `CANCELLED` with a reason, not in `EXPIRED`. See
 * `expire` and `cancel` for the argument.
 */
const EXPIRABLE_STATUSES: readonly BookingStatus[] = [
  BookingStatus.Draft,
  BookingStatus.AwaitingProvider,
];

/**
 * Which statuses each cancellation reason is allowed to cancel from.
 *
 * Keyed by `BookingCancelledReason` rather than listing statuses on their
 * own, because "may this booking be cancelled?" has no answer without the
 * reason: `customer_did_not_pay` is only ever true of a booking sitting in
 * `PENDING_PAYMENT` past its window, and a reason invented later for a
 * cancellation *policy* — a customer calling off a `CONFIRMED` job the day
 * before — would be true of statuses this one never touches. A flat list of
 * cancellable statuses would have to be the union of every reason's, which
 * is how a policy reason ends up quietly authorising the sweep to cancel a
 * confirmed, paid booking.
 *
 * `Record`, not `Partial<Record>`: adding a member to
 * `BookingCancelledReason` is a type error here until somebody says which
 * statuses it may cancel from, which is exactly the moment that question is
 * cheapest to answer. That is the gate `BookingCancelledReason`'s own doc
 * comment promises when it says a future reason will "name its own reasons
 * against real rules it can actually enforce".
 */
const CANCELLABLE_FROM: Record<BookingCancelledReason, readonly BookingStatus[]> = {
  customer_did_not_pay: [BookingStatus.PendingPayment],
  dispute_upheld: [BookingStatus.Disputed],
};

/** A commission rate is basis points: 0 is free, 10000 is the whole price. */
const COMMISSION_BPS_MAX = 10_000;

export interface BookingProps {
  readonly id: string | null;

  // Identity and parties.
  readonly customerId: string;
  readonly providerId: string;
  readonly serviceId: string;
  readonly serviceOptionId: string;
  /** Which member's calendar this booking occupies. */
  readonly providerMemberId: string;

  // The slot.
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly durationMinutes: number;

  // State: which status is current, and when each transition happened.
  readonly status: BookingStatus;
  /**
   * The deadline currently running against this booking — **whichever of
   * the design's clocks its status is standing on.** `create` stamps the
   * checkout hold, `submit` overwrites it with the provider's response
   * window, `accept` overwrites that with the payment window, `markPaid`
   * with the appointment's own end, and `markDone` with the customer's
   * feedback window; `reminded` and `keepOpen` push that fourth one — the
   * platform's question to the provider — further out without moving the
   * status, which is why `CONFIRMED` can stand on its clock more than once.
   * Every hop but `markPaid` takes the deadline as an argument, because
   * `domain/` reaches for no configuration and those lengths are
   * `platform_settings` columns — `markPaid` is the exception because its
   * deadline is a fact the booking already holds (`endsAt`) rather than a
   * window somebody configured. One column, five meanings, and the status
   * is what says which — which is exactly what lets `findDueForSweep` ask
   * one question (`expires_at <= now AND status IN (…)`) instead of five.
   *
   * Left alone by every transition that is not one of those hops, and
   * nulled by exactly one: `dispute`. That is not the mistake recorded
   * below — there, a live deadline was being erased while a status check
   * was already doing the protecting. Here there is genuinely no clock
   * left to record: `DISPUTED` is not one of `DEADLINE_BEARING_STATUSES`,
   * so the sweep's filter excludes it anyway, and the null is this column
   * saying so in its own words rather than leaving a dead deadline behind
   * for the next reader to mistake for a live one.
   *
   * `markPaid` and `expire` also used to null it, on the way past
   * `PENDING_PAYMENT` and on the theory that a stale deadline invited some
   * later query to act on it. That theory was wrong in practice:
   * `findDueForSweep` (see `booking.repository.ts`) filters on status
   * before it ever looks at this column — `DEADLINE_BEARING_STATUSES`, the
   * ones that still have a clock running — so the null bought no
   * protection a status check wasn't already giving for free. What it did
   * cost is real: the one fact a customer disputing "you gave my slot away"
   * needs is the deadline they were actually given, and
   * `PlatformSettingsReaderPort`'s windows are deliberately LIVE on the
   * promise that "a booking already created keeps the `expiresAt` it was
   * given regardless of what this returns afterward" (see that port's own
   * comments) — a promise nulling this out quietly broke the moment the
   * booking moved on. Note the difference between that and what `markPaid`
   * does now: handing the column on to the next real deadline keeps it
   * meaning something at every status, where nulling it made the column
   * mean nothing at a status that was still standing on a clock.
   */
  readonly expiresAt: Date | null;
  readonly paidAt: Date | null;
  /** The payment processor's reference for this booking — e.g. an M-Pesa transaction id. Null until `markPaid`. */
  readonly paymentRef: string | null;
  /**
   * When the provider said yes — set by `accept`, which moves the booking to
   * `PENDING_PAYMENT`, not to `CONFIRMED`. The name predates the reversal:
   * this column has meant "the provider confirmed" since before `markPaid`
   * moved to after that answer, and renaming it would touch the schema for
   * no gain a reader doesn't already get from this comment. Do not read this
   * as "the instant the booking reached `CONFIRMED`" — that instant is
   * `paidAt`, stamped by `markPaid`, once money has actually moved.
   */
  readonly confirmedAt: Date | null;
  /** When the provider said no — set by `decline`, which moves the booking to `DECLINED`. */
  readonly declinedAt: Date | null;
  /**
   * When the booking was called off for a named reason — set by `cancel`.
   * The reason itself is not here: `booking_change` carries it, one row per
   * hop, the same as `decline`'s (see `cancel`'s own doc comment).
   */
  readonly cancelledAt: Date | null;
  /**
   * When the platform asked the provider to close this booking — set by
   * `reminded`, which moves no status at all.
   *
   * Null until it has asked, and that is the whole job: it is what tells
   * the sweep's second firing apart from its first. The alternative, an
   * inference from `endsAt` and the current time, reads correctly and means
   * something else — a booking whose appointment ended a week ago has
   * looked "overdue for a second ask" ever since, whether or not anybody
   * ever sent the first. Stored beside `markedDoneAt` because it is the
   * question that ordinarily precedes it.
   */
  readonly remindedAt: Date | null;
  readonly markedDoneAt: Date | null;
  readonly completedAt: Date | null;
  readonly disputedAt: Date | null;
  readonly expiredAt: Date | null;

  // The money snapshot.
  readonly priceMinor: number;
  readonly commissionBps: number;
  readonly commissionMinor: number;
  readonly currency: string;

  // The rest of the snapshot: what was bought, from whom, and where.
  readonly serviceName: string;
  readonly providerName: string;
  readonly providerSlug: string;
  readonly optionName: string;
  // Null on a DRAFT and only on a DRAFT: the customer holds the slot from
  // step 1 and gives the address on step 2, so a draft that has not reached
  // step 2 has no address yet. `submit` refuses to leave DRAFT without one —
  // see that method's own doc comment — so any status past DRAFT carries
  // all three.
  readonly addressLabel: string | null;
  readonly addressLine: string | null;
  readonly addressCity: string | null;
  readonly addressDistrict: string | null;
  readonly addressDirections: string | null;
  readonly addressLat: number | null;
  readonly addressLng: number | null;

  // Customer input.
  readonly description: string | null;
}

/**
 * A sale, from the moment a slot is held to whichever of its endings applies.
 *
 * **This is a snapshot, not a set of foreign keys to the catalog.** `serviceName`,
 * `providerName`, `providerSlug`, `optionName`, `durationMinutes`,
 * `commissionBps` and the whole address are copied in at creation and never
 * rewritten by anything a later catalog edit does — see `booking.schema.ts`
 * for the full reasoning. This class enforces none of that copying; it only
 * enforces that the numbers it was handed make sense together, which is the
 * part a database CHECK constraint cannot phrase as well as arithmetic can.
 *
 * **Money is integer minor units, never a float, never negative.**
 * `commissionMinor` is computed once, here, from `priceMinor` and the rate
 * the booking is given — not read live off the provider, so the sum stays
 * reproducible after an administrator changes that provider's rate. It is
 * *rounded*, not truncated: truncation quietly favours the platform on every
 * booking, by an amount too small for any one customer to notice and too
 * consistent for it to be an accident.
 *
 * **The snapshot is immutable after creation.** Nothing here mutates a
 * `Booking` — every transition (`submit`, `accept`, `decline`, `markPaid`,
 * `expire`, `cancel`, and the six that close it: `reminded`, `markDone`,
 * `keepOpen`, `complete`, `dispute`, `resolveDispute`) returns a new
 * instance, matching how `Review.revise` never touches the `Review` it was
 * called on.
 */
export class Booking {
  private constructor(private readonly props: BookingProps) {}

  /**
   * A required string is not allowed to be empty, or nothing but
   * whitespace. Trimmed only for the check — the value stored on the
   * snapshot is exactly what the caller passed in, untrimmed; silently
   * rewriting it is not this guard's job.
   */
  private static requireNonBlank(value: string, field: string): void {
    if (value.trim().length === 0) {
      throw new BookingFieldBlankError(field);
    }
  }

  /** A `Date` that type-checks is not the same thing as a `Date` that names a real instant. */
  private static requireValidDate(value: Date, field: string): void {
    if (Number.isNaN(value.getTime())) {
      throw new BookingDateInvalidError(field);
    }
  }

  /**
   * A booking as the checkout flow assembles it: a slot held, a price
   * agreed, and nothing yet paid.
   *
   * Starts life as `DRAFT`, not `PENDING_PAYMENT` — the reversal this whole
   * plan is named for. `expiresAt` here is the checkout hold
   * (`checkout_hold_minutes`), a customer still filling in the form's
   * protection against losing the slot mid-checkout; it is not the payment
   * window, which does not exist yet at this point in the flow. `submit`
   * replaces it with the provider's response window, and `accept` replaces
   * it again with the actual payment deadline — see both methods' own doc
   * comments.
   *
   * `id` is null for one that has never been stored — the repository assigns
   * it, the same way `Review.create` leaves a new review id-less until saved.
   * `endsAt` is derived from `startsAt` and `durationMinutes` rather than
   * accepted as an input, because a caller-supplied end that disagreed with
   * the duration would be a second version of the same fact with no way to
   * tell which one was true.
   *
   * Every required string is checked for being blank — `""` or whitespace —
   * because nothing downstream would: a `NOT NULL` column accepts `""` just
   * as happily as a real value, and the CHECK constraints Task 2 added cover
   * the money and the status, not the snapshot strings. `startsAt` and
   * `expiresAt` are checked for naming a real instant, because a `Date`
   * built from a bad string type-checks and reaches this method looking
   * exactly like a good one.
   */
  static create(input: {
    id?: string | null;
    customerId: string;
    providerId: string;
    serviceId: string;
    serviceOptionId: string;
    providerMemberId: string;
    startsAt: Date;
    durationMinutes: number;
    priceMinor: number;
    commissionBps: number;
    currency: string;
    serviceName: string;
    providerName: string;
    providerSlug: string;
    optionName: string;
    addressLabel?: string | null;
    addressLine?: string | null;
    addressCity?: string | null;
    addressDistrict?: string | null;
    addressDirections?: string | null;
    addressLat?: number | null;
    addressLng?: number | null;
    description?: string | null;
    expiresAt: Date;
  }): Booking {
    Booking.requireNonBlank(input.customerId, "customerId");
    Booking.requireNonBlank(input.providerId, "providerId");
    Booking.requireNonBlank(input.serviceId, "serviceId");
    Booking.requireNonBlank(input.serviceOptionId, "serviceOptionId");
    Booking.requireNonBlank(input.providerMemberId, "providerMemberId");
    Booking.requireNonBlank(input.currency, "currency");
    Booking.requireNonBlank(input.serviceName, "serviceName");
    Booking.requireNonBlank(input.providerName, "providerName");
    Booking.requireNonBlank(input.providerSlug, "providerSlug");
    Booking.requireNonBlank(input.optionName, "optionName");

    // Null is how a caller says "the customer has not reached step 2 yet".
    // A present-but-blank value says something different and wrong — that
    // there is an address, and it is nothing. The distinction is load-bearing:
    // collapse it and a blank address reaches a submitted booking.
    for (const field of ["addressLabel", "addressLine", "addressCity"] as const) {
      const value = input[field];
      if (value != null) {
        Booking.requireNonBlank(value, field);
      }
    }

    // Nullable, but not free to be present-and-blank: null is how a caller
    // says "there is no directions note" / "no district on file"; an empty
    // string says something different and wrong — that there is one, and
    // it's nothing. `description` is deliberately not checked here: a blank
    // description is normalised to null below rather than refused, because
    // "the customer typed nothing" is an expected, everyday shape for that
    // one field in a way it is not for an address component.
    if (input.addressDistrict != null) {
      Booking.requireNonBlank(input.addressDistrict, "addressDistrict");
    }
    if (input.addressDirections != null) {
      Booking.requireNonBlank(input.addressDirections, "addressDirections");
    }

    Booking.requireValidDate(input.startsAt, "startsAt");
    Booking.requireValidDate(input.expiresAt, "expiresAt");

    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
      throw new BookingDurationInvalidError(input.durationMinutes);
    }

    if (!Number.isInteger(input.priceMinor) || input.priceMinor < 0) {
      throw new BookingPriceInvalidError(input.priceMinor);
    }

    if (
      !Number.isInteger(input.commissionBps) ||
      input.commissionBps < 0 ||
      input.commissionBps > COMMISSION_BPS_MAX
    ) {
      throw new CommissionOutOfRangeError(input.commissionBps);
    }

    const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
    const commissionMinor = Math.round((input.priceMinor * input.commissionBps) / COMMISSION_BPS_MAX);

    const description = (input.description ?? "").trim();

    return new Booking({
      id: input.id ?? null,
      customerId: input.customerId,
      providerId: input.providerId,
      serviceId: input.serviceId,
      serviceOptionId: input.serviceOptionId,
      providerMemberId: input.providerMemberId,
      startsAt: input.startsAt,
      endsAt,
      durationMinutes: input.durationMinutes,
      status: BookingStatus.Draft,
      expiresAt: input.expiresAt,
      paidAt: null,
      paymentRef: null,
      confirmedAt: null,
      declinedAt: null,
      cancelledAt: null,
      remindedAt: null,
      markedDoneAt: null,
      completedAt: null,
      disputedAt: null,
      expiredAt: null,
      priceMinor: input.priceMinor,
      commissionBps: input.commissionBps,
      commissionMinor,
      currency: input.currency,
      serviceName: input.serviceName,
      providerName: input.providerName,
      providerSlug: input.providerSlug,
      optionName: input.optionName,
      addressLabel: input.addressLabel ?? null,
      addressLine: input.addressLine ?? null,
      addressCity: input.addressCity ?? null,
      addressDistrict: input.addressDistrict ?? null,
      addressDirections: input.addressDirections ?? null,
      addressLat: input.addressLat ?? null,
      addressLng: input.addressLng ?? null,
      description: description === "" ? null : description,
    });
  }

  /**
   * A booking as the repository reconstitutes it from a stored row.
   *
   * This is Task 7's reconstitution seam, not test scaffolding: `findById`
   * and `findDueForSweep` both need to turn a row into an aggregate, and
   * this is the only place that does it.
   *
   * It re-runs every guard `create` runs — the blank-string checks, the
   * valid-date checks, the numeric checks — rather than trusting the row.
   * The row may have been written by an earlier version of this code, or
   * edited by hand; a reconstitution that skips validation launders
   * whatever is wrong with it into an aggregate that looks fine.
   *
   * Unlike `create`, it does not *derive* `endsAt` or `commissionMinor` —
   * those arrive as whatever the row says they are, because recomputing
   * them here would silently rewrite a stored snapshot, which is the one
   * thing this aggregate exists to prevent. It does check that both still
   * agree with the facts they were derived from, and refuses the row if
   * they don't: a stored commission that disagrees with its own price and
   * rate is a corrupt row, and finding that out here beats finding it out
   * in an accounting reconciliation.
   */
  static restore(props: BookingProps): Booking {
    Booking.requireNonBlank(props.customerId, "customerId");
    Booking.requireNonBlank(props.providerId, "providerId");
    Booking.requireNonBlank(props.serviceId, "serviceId");
    Booking.requireNonBlank(props.serviceOptionId, "serviceOptionId");
    Booking.requireNonBlank(props.providerMemberId, "providerMemberId");
    Booking.requireNonBlank(props.currency, "currency");
    Booking.requireNonBlank(props.serviceName, "serviceName");
    Booking.requireNonBlank(props.providerName, "providerName");
    Booking.requireNonBlank(props.providerSlug, "providerSlug");
    Booking.requireNonBlank(props.optionName, "optionName");

    // Same rule `create` enforces, and for the same reason: a stored DRAFT
    // row is null here until `submit`, and a stored row past DRAFT is never
    // null — but a corrupt or hand-edited row could still be blank, and
    // this reconstitution guards against that the same way `create` does.
    for (const field of ["addressLabel", "addressLine", "addressCity"] as const) {
      const value = props[field];
      if (value != null) {
        Booking.requireNonBlank(value, field);
      }
    }

    if (props.addressDistrict != null) {
      Booking.requireNonBlank(props.addressDistrict, "addressDistrict");
    }
    if (props.addressDirections != null) {
      Booking.requireNonBlank(props.addressDirections, "addressDirections");
    }

    Booking.requireValidDate(props.startsAt, "startsAt");
    Booking.requireValidDate(props.endsAt, "endsAt");
    if (props.expiresAt != null) {
      Booking.requireValidDate(props.expiresAt, "expiresAt");
    }

    if (!Number.isInteger(props.durationMinutes) || props.durationMinutes <= 0) {
      throw new BookingDurationInvalidError(props.durationMinutes);
    }

    if (!Number.isInteger(props.priceMinor) || props.priceMinor < 0) {
      throw new BookingPriceInvalidError(props.priceMinor);
    }

    if (
      !Number.isInteger(props.commissionBps) ||
      props.commissionBps < 0 ||
      props.commissionBps > COMMISSION_BPS_MAX
    ) {
      throw new CommissionOutOfRangeError(props.commissionBps);
    }

    const expectedEndsAt = new Date(props.startsAt.getTime() + props.durationMinutes * 60_000);
    if (props.endsAt.getTime() !== expectedEndsAt.getTime()) {
      throw new BookingSnapshotInconsistentError(
        "endsAt",
        props.endsAt.toISOString(),
        expectedEndsAt.toISOString(),
      );
    }

    const expectedCommissionMinor = Math.round(
      (props.priceMinor * props.commissionBps) / COMMISSION_BPS_MAX,
    );
    if (props.commissionMinor !== expectedCommissionMinor) {
      throw new BookingSnapshotInconsistentError(
        "commissionMinor",
        props.commissionMinor,
        expectedCommissionMinor,
      );
    }

    return new Booking({ ...props });
  }

  get id(): string | null {
    return this.props.id;
  }
  get customerId(): string {
    return this.props.customerId;
  }
  get providerId(): string {
    return this.props.providerId;
  }
  get serviceId(): string {
    return this.props.serviceId;
  }
  get serviceOptionId(): string {
    return this.props.serviceOptionId;
  }
  get providerMemberId(): string {
    return this.props.providerMemberId;
  }
  get startsAt(): Date {
    return this.props.startsAt;
  }
  get endsAt(): Date {
    return this.props.endsAt;
  }
  get durationMinutes(): number {
    return this.props.durationMinutes;
  }
  get status(): BookingStatus {
    return this.props.status;
  }
  get expiresAt(): Date | null {
    return this.props.expiresAt;
  }
  get paidAt(): Date | null {
    return this.props.paidAt;
  }
  get paymentRef(): string | null {
    return this.props.paymentRef;
  }
  get confirmedAt(): Date | null {
    return this.props.confirmedAt;
  }
  get declinedAt(): Date | null {
    return this.props.declinedAt;
  }
  get cancelledAt(): Date | null {
    return this.props.cancelledAt;
  }
  get remindedAt(): Date | null {
    return this.props.remindedAt;
  }
  get markedDoneAt(): Date | null {
    return this.props.markedDoneAt;
  }
  get completedAt(): Date | null {
    return this.props.completedAt;
  }
  get disputedAt(): Date | null {
    return this.props.disputedAt;
  }
  get expiredAt(): Date | null {
    return this.props.expiredAt;
  }
  get priceMinor(): number {
    return this.props.priceMinor;
  }
  get commissionBps(): number {
    return this.props.commissionBps;
  }
  get commissionMinor(): number {
    return this.props.commissionMinor;
  }

  /**
   * What the provider is owed: the price, less the platform's cut.
   *
   * A getter, never a stored column. A stored payout that could disagree
   * with `priceMinor - commissionMinor` would be a reconciliation problem
   * waiting to happen — two numbers claiming to answer the same question,
   * with no rule forcing them to agree — and there is nothing a stored value
   * could express that this subtraction cannot.
   */
  get providerPayoutMinor(): number {
    return this.props.priceMinor - this.props.commissionMinor;
  }
  get currency(): string {
    return this.props.currency;
  }
  get serviceName(): string {
    return this.props.serviceName;
  }
  get providerName(): string {
    return this.props.providerName;
  }
  get providerSlug(): string {
    return this.props.providerSlug;
  }
  get optionName(): string {
    return this.props.optionName;
  }
  get addressLabel(): string | null {
    return this.props.addressLabel;
  }
  get addressLine(): string | null {
    return this.props.addressLine;
  }
  get addressCity(): string | null {
    return this.props.addressCity;
  }
  get addressDistrict(): string | null {
    return this.props.addressDistrict;
  }
  get addressDirections(): string | null {
    return this.props.addressDirections;
  }
  get addressLat(): number | null {
    return this.props.addressLat;
  }
  get addressLng(): number | null {
    return this.props.addressLng;
  }
  get description(): string | null {
    return this.props.description;
  }

  /**
   * A payment lands on the slot this booking is holding.
   *
   * `PENDING_PAYMENT` is the only status this actually moves — straight to
   * `CONFIRMED`, not `AWAITING_PROVIDER`. The provider already said yes
   * before a charge was ever attempted (see `accept`); this is the moment
   * the money that promise depended on actually arrives.
   *
   * **It hands the clock on, the same way `submit` and `accept` do**, and
   * it is the only hop that does not take the new deadline as an argument:
   * the deadline is `endsAt`, a fact this booking already carries, not a
   * window read from `platform_settings`. Leaving the payment deadline
   * standing was harmless right up until `CONFIRMED` joined
   * `DEADLINE_BEARING_STATUSES` — a paid booking was invisible to the sweep
   * whatever this column said. It is now visible, so a stale value here
   * would make every freshly paid booking due the instant it was paid.
   *
   * **The discriminator for everything else is the payment reference, not
   * the status.** The first version of this method asked "does the booking
   * still hold its slot?" before ever looking at the reference — which
   * absorbed a duplicate webhook silently at `AWAITING_PROVIDER`,
   * `CONFIRMED` or `MARKED_DONE`, but *threw* at `COMPLETED` or `DISPUTED`
   * for the exact same duplicate, carrying the exact same reference. That
   * was backwards: a retry landing after the work is already behind the
   * booking is the *most* likely late duplicate there is — webhooks retry
   * on a timer that has no idea the booking finished — and it was the one
   * case guaranteed to raise instead of absorb.
   *
   * So the reference is compared first, against every status but
   * `PENDING_PAYMENT`, before anything asks whether a charge could have
   * landed here at all: the *same* reference is always a duplicate of a
   * payment that already landed, whatever the booking has done since, and
   * is absorbed silently. A *different* reference is always a second,
   * genuinely distinct transaction — never a duplicate to shrug off,
   * whatever the status — but *how* that gets reported depends on whether
   * this status is one a charge could actually have reached
   * (`CHARGEABLE_STATUSES`: `CONFIRMED` or `MARKED_DONE`, alongside
   * `PENDING_PAYMENT` itself, which never reaches this branch): reaching
   * one of those two means somebody is probably owed a refund on one of the
   * two payments, which is what `PaymentReferenceMismatchError` names.
   * Every other status means this transition was never legal to begin
   * with — `DRAFT` and `AWAITING_PROVIDER` because nothing charges the
   * customer until the provider accepts (see `CHARGEABLE_STATUSES`'s own
   * comment for why this is not the same list as `SLOT_HOLDING_STATUSES`
   * any more), `EXPIRED`/`DECLINED`/`CANCELLED` because the slot already
   * released, `COMPLETED`/`DISPUTED` because the job already finished —
   * and `BookingTransitionError` is what names all five.
   */
  markPaid(paymentRef: string, at: Date): Booking {
    if (this.props.status === BookingStatus.PendingPayment) {
      return new Booking({
        ...this.props,
        status: BookingStatus.Confirmed,
        paidAt: at,
        paymentRef,
        // The next thing anyone waits on is the appointment's own end, when
        // the platform will ask the provider to close it.
        expiresAt: this.props.endsAt,
      });
    }

    if (this.props.paymentRef === paymentRef) {
      return this;
    }

    if (CHARGEABLE_STATUSES.includes(this.props.status)) {
      throw new PaymentReferenceMismatchError(this.props.paymentRef, paymentRef);
    }

    throw new BookingTransitionError(this.props.status, BookingStatus.Confirmed);
  }

  /**
   * The customer finishes the checkout form and sends the request on to the
   * provider — the provider's response window starts here, not at `create`.
   * Before this, the slot is held by a customer who might still abandon the
   * form; after it, the same hold is a request nobody has answered yet.
   *
   * **This is also where the address becomes required.** `create` holds the
   * slot with the address still optional — the customer picks a time on
   * step 1 of checkout and gives an address on step 2, so the draft has to
   * be able to exist before the address does. This method is step 2's hop:
   * it takes the address the customer just gave and refuses to move the
   * booking on without it. See the guard below for the full argument.
   *
   * `respondBy` replaces `expiresAt` outright — the same shape `accept`
   * already uses for `payBy`, and for the same reason: the aggregate has no
   * way to read `provider_response_minutes`, a `platform_settings` value,
   * and `domain/` reaches for no configuration. The command that already
   * knows the window (Task 3) computes the deadline and hands it in. Before
   * this call, `expiresAt` was the checkout hold `create` set — the 30
   * minutes that protected a customer still filling in the form, not the
   * 2 hours the provider now has to answer. Skipping the replacement would
   * leave that stale, too-short deadline on the row, with nothing here to
   * catch it, and the provider's window would never actually start.
   *
   * Unlike `markPaid` and `expire`, nothing races this transition: it is a
   * customer's single deliberate action, and the command that calls it uses
   * the same compare-and-swap every other command here does, so a stale
   * concurrent write is caught before this method ever runs a second time
   * against the same read. A status this method does not expect is
   * therefore not an ordinary race to shrug off — it is either a bug
   * upstream or a caller that skipped the CAS, and `BookingTransitionError`
   * says so rather than absorbing it the way `expire`'s no-op does.
   *
   * **`description` arrives here for the same reason the address does**, and
   * off the same page: it is step 2's optional "what needs doing", beside
   * the address, and `create` passes `null` for it because step 1 has no
   * such value to pass.
   *
   * **It is required, not optional, and the assignment below is
   * unconditional.** Those two facts hold each other up. An optional
   * parameter with an unconditional write is the shape that silently wipes
   * data: the day something *does* put a description on a `DRAFT` — a
   * resumed checkout, an imported booking, a step-2 autosave — every caller
   * that omitted the argument starts erasing it, with no compile error and
   * no red test to say so. Required means the compiler asks each of them
   * what they mean, and each of them then says it. The alternative, keeping
   * it optional and writing only when present, buys nothing: `null` has to
   * stay writable anyway, so `undefined` would be the one input that could
   * not express "no description".
   *
   * Blank is normalised to `null` rather than refused, matching `create`'s
   * own treatment: "the customer typed nothing" is an everyday shape for
   * this field in a way it is not for an address component. The stored value
   * is trimmed, again as `create` stores it.
   */
  submit(
    at: Date,
    respondBy: Date,
    address: {
      label: string;
      line: string;
      city: string;
      district?: string | null;
      directions?: string | null;
      lat?: number | null;
      lng?: number | null;
    },
    description: string | null,
  ): Booking {
    if (this.props.status !== BookingStatus.Draft) {
      throw new BookingTransitionError(this.props.status, BookingStatus.AwaitingProvider);
    }

    Booking.requireValidDate(at, "at");
    Booking.requireValidDate(respondBy, "respondBy");

    // The invariant this method carries: a DRAFT may have no address, and
    // nothing past DRAFT may be without one. This is the hop where a booking
    // stops being the customer's private draft and becomes a request somebody
    // has to answer, so it is the hop that has to be able to name the place.
    Booking.requireNonBlank(address.label, "addressLabel");
    Booking.requireNonBlank(address.line, "addressLine");
    Booking.requireNonBlank(address.city, "addressCity");
    if (address.district != null) {
      Booking.requireNonBlank(address.district, "addressDistrict");
    }
    if (address.directions != null) {
      Booking.requireNonBlank(address.directions, "addressDirections");
    }

    const trimmedDescription = (description ?? "").trim();

    return new Booking({
      ...this.props,
      status: BookingStatus.AwaitingProvider,
      expiresAt: respondBy,
      addressLabel: address.label,
      addressLine: address.line,
      addressCity: address.city,
      addressDistrict: address.district ?? null,
      addressDirections: address.directions ?? null,
      addressLat: address.lat ?? null,
      addressLng: address.lng ?? null,
      description: trimmedDescription === "" ? null : trimmedDescription,
    });
  }

  /**
   * The provider says yes. **This is the reversal this whole plan exists
   * for:** the booking moves to `PENDING_PAYMENT`, not `CONFIRMED` — the
   * provider has committed their calendar, and no money has moved yet.
   * `markPaid` is the only thing that can still take this booking to
   * `CONFIRMED`, once a charge actually clears.
   *
   * `payBy` replaces `expiresAt` outright — the same shape `create` already
   * uses for its own `expiresAt`, taken as an input rather than computed,
   * because the aggregate has no way to read `payment_window_minutes`: that
   * is a `platform_settings` value, and `domain/` reaches for no
   * configuration. The command that already knows the window (Task 3)
   * computes the deadline and hands it in. Before this call, `expiresAt`
   * was the provider's now-irrelevant response deadline; skipping the
   * replacement would leave that stale value on the row, silently, with
   * nothing here to catch it.
   *
   * Stamps `confirmedAt`, not a new field, because that column has named
   * "the provider said yes" since before this reversal — see its own doc
   * comment on `BookingProps`.
   */
  accept(at: Date, payBy: Date): Booking {
    if (this.props.status !== BookingStatus.AwaitingProvider) {
      throw new BookingTransitionError(this.props.status, BookingStatus.PendingPayment);
    }

    Booking.requireValidDate(at, "at");
    Booking.requireValidDate(payBy, "payBy");

    return new Booking({
      ...this.props,
      status: BookingStatus.PendingPayment,
      confirmedAt: at,
      expiresAt: payBy,
    });
  }

  /**
   * The provider says no. `reason` is optional and, deliberately, never
   * stored on `BookingProps` — do not add a `declineReason` column to
   * `booking` for it. `booking_change` already has a `reason` column built
   * for exactly this: the history of why a booking moved, one row per hop,
   * append-only. Persisting it there is the command's job, through
   * `appendChange` (Task 3); this method's job is only to validate it and
   * hand it to whichever event a command builds from this call —
   * `booking.declined` carries it so Notification can tell the customer
   * why, without either of them reading the booking back.
   *
   * It still passes through `requireNonBlank` when present: a caller that
   * bothers to supply a present-but-empty reason has the same bug
   * `addressDistrict` and `addressDirections` guard against elsewhere in
   * this class.
   */
  decline(at: Date, reason?: string): Booking {
    if (this.props.status !== BookingStatus.AwaitingProvider) {
      throw new BookingTransitionError(this.props.status, BookingStatus.Declined);
    }

    Booking.requireValidDate(at, "at");
    if (reason != null) {
      Booking.requireNonBlank(reason, "reason");
    }

    return new Booking({
      ...this.props,
      status: BookingStatus.Declined,
      declinedAt: at,
    });
  }

  /**
   * A booking ends before anybody committed money to it.
   *
   * Moves `DRAFT` and `AWAITING_PROVIDER` to `EXPIRED`, releasing the slot.
   * **Three routes reach it, and only two of them are clocks:**
   *
   * - `DRAFT` past its checkout hold — the customer opened the form and
   *   walked away. `SweepBookingCommand`'s.
   * - `AWAITING_PROVIDER` past the provider's response window — the customer
   *   did everything asked of them and nobody answered. Also the sweep's.
   * - `DRAFT` superseded — the customer started a second checkout, and
   *   `CreateBookingCommand` ends the first before holding another slot.
   *   **Nothing ran out here.** This route is not a deadline at all, which
   *   is why the union its callers carry is `BookingExpiredCause` and no
   *   longer the `BookingExpiredClock` it was named when the two clocks were
   *   the only way in.
   *
   * The row is identical down all three — same status, same `expiredAt`, same
   * released slot — so which route ran is not recoverable from it afterwards.
   * Each caller carries that on the event instead (`BookingExpiredCause`)
   * and writes its own `booking_change` row, because the three do not share
   * an audience: two tell nobody, and the middle one owes the customer a
   * message.
   *
   * **`PENDING_PAYMENT` is no longer one of them**, and that reversal is
   * this method's whole rewrite. An earlier version moved exactly that one
   * status and no other, back when it was the only status with a deadline
   * on it: the customer paid first, so nothing but a payment window could
   * ever lapse. Under the design's three clocks the two statuses *before*
   * payment carry deadlines too, and the one *at* payment stopped belonging
   * here — by then a provider has blocked their calendar on the strength of
   * a promise the platform's own ordering made, and `EXPIRED` is a status
   * that explains nothing to them. That case is `cancel`'s, which ends it
   * as `CANCELLED` carrying `customer_did_not_pay`.
   *
   * **A no-op from every other status, and the reasoning holds for both
   * callers.** Neither is looking at the booking when it decides to expire
   * one. The sweep selected the row on `expires_at`, and between that select
   * and this call it may have been submitted, accepted, paid or declined;
   * `CreateBookingCommand` read the customer's open draft a moment earlier
   * and is exposed to exactly the same gap — the advisory lock it takes
   * serialises two *creates* against each other, not a submit landing in
   * between. That is an ordinary race, not a fault on either side, so a
   * status this method does not govern is answered by handing the same
   * instance back rather than raising something a human then has to read and
   * dismiss. The opposite of `markPaid`'s refusal, and deliberately so: a
   * stray payment is a fact somebody must see, a stray expiry is not.
   */
  expire(at: Date): Booking {
    if (!EXPIRABLE_STATUSES.includes(this.props.status)) {
      return this;
    }

    Booking.requireValidDate(at, "at");

    return new Booking({
      ...this.props,
      status: BookingStatus.Expired,
      expiredAt: at,
    });
  }

  /**
   * A booking is called off for a named reason, after somebody had already
   * committed something to it.
   *
   * Today that is one case: the payment window closed on a
   * `PENDING_PAYMENT` booking and the money never arrived. It is the
   * failure the design exists to answer — the provider accepted, blocked
   * four hours of their Saturday, and the customer never typed the PIN —
   * and it must not be dressed up as an expiry. `EXPIRED` says a deadline
   * passed; `CANCELLED` with `customer_did_not_pay` says which deadline,
   * whose it was, and why the provider is looking at an empty afternoon.
   * The reason is what `BookingCancelled` carries so Notification can tell
   * them that without reading the booking back.
   *
   * **`reason` is never stored on `BookingProps`** — there is no
   * `cancelReason` column and there should not be one, the same argument
   * `decline` makes for its own reason. `booking_change` already has a
   * `reason` column built for exactly this, one row per hop, append-only;
   * persisting it there is the command's job. Here the reason is the thing
   * that decides whether the transition is legal at all — see
   * `CANCELLABLE_FROM` — so it does real work even though nothing keeps it.
   *
   * **A no-op from a status this reason does not govern**, matching
   * `expire` rather than `decline`, because it has `expire`'s caller: the
   * sweep, selecting on a deadline it read before any of this ran. A
   * booking that got paid in the seconds between the select and this call
   * is an ordinary race, and the honest answer to it is the instance back
   * unchanged. Note the asymmetry with `submit`, `accept` and `decline`,
   * which *do* throw: those are one person's single deliberate action, and
   * a wrong status there is a bug upstream rather than a clock that fired
   * late.
   */
  cancel(at: Date, reason: BookingCancelledReason): Booking {
    if (!CANCELLABLE_FROM[reason].includes(this.props.status)) {
      return this;
    }

    Booking.requireValidDate(at, "at");

    return new Booking({
      ...this.props,
      status: BookingStatus.Cancelled,
      cancelledAt: at,
    });
  }

  /**
   * The platform asked the provider to close this booking. Not a transition —
   * the status does not move — but a fact worth keeping: it is what tells the
   * sweep's second firing from its first, and it is the difference between a
   * platform that asks and one that assumes.
   *
   * Throws rather than shrugging, unlike `expire` and `cancel`, even though
   * the sweep is one of its callers. The sweep's protection against a
   * booking that moved between the select and this call is the
   * compare-and-swap on the save, not silence here: a `reminded` that
   * quietly no-opped would write `remindedAt` on nothing and leave the next
   * firing unable to tell it had already asked, which is the one fact this
   * method exists to record.
   */
  reminded(at: Date, askAgainAt: Date): Booking {
    if (this.props.status !== BookingStatus.Confirmed) {
      throw new BookingTransitionError(this.props.status, BookingStatus.Confirmed);
    }

    Booking.requireValidDate(at, "at");
    Booking.requireValidDate(askAgainAt, "askAgainAt");

    return new Booking({ ...this.props, remindedAt: at, expiresAt: askAgainAt });
  }

  /**
   * The provider says the work is done — or, after seven days of silence, the
   * platform says it on their behalf. Either way this opens the customer's
   * window, so it also sets the clock that closes it.
   *
   * The end-of-appointment guard is checked after the dates are, and after
   * the status is, on purpose: a caller holding a `Date` built from a bad
   * string should hear about that rather than about a comparison against
   * `NaN`, which would pass this guard silently.
   */
  markDone(at: Date, feedbackBy: Date): Booking {
    if (this.props.status !== BookingStatus.Confirmed) {
      throw new BookingTransitionError(this.props.status, BookingStatus.MarkedDone);
    }

    Booking.requireValidDate(at, "at");
    Booking.requireValidDate(feedbackBy, "feedbackBy");

    if (at.getTime() < this.props.endsAt.getTime()) {
      throw new BookingNotEndedError(this.props.endsAt, at);
    }

    return new Booking({
      ...this.props,
      status: BookingStatus.MarkedDone,
      markedDoneAt: at,
      expiresAt: feedbackBy,
    });
  }

  /**
   * "Still going." The job outran its slot, which is ordinary for the trades
   * this platform serves, so the provider pushes the question out rather than
   * being marked done in the middle of it. Repeatable by design: a wall is
   * finished when it is finished, and the platform cannot know better than
   * the person building it.
   *
   * Deliberately leaves `remindedAt` where it stands. It is not a second
   * asking — the platform asked once and is being answered — and rewriting
   * it would erase when the conversation actually started.
   */
  keepOpen(at: Date, askAgainAt: Date): Booking {
    if (this.props.status !== BookingStatus.Confirmed) {
      throw new BookingTransitionError(this.props.status, BookingStatus.Confirmed);
    }

    Booking.requireValidDate(at, "at");
    Booking.requireValidDate(askAgainAt, "askAgainAt");

    return new Booking({ ...this.props, expiresAt: askAgainAt });
  }

  /** The window closed without a dispute, or the customer's review closed it early. */
  complete(at: Date): Booking {
    if (this.props.status !== BookingStatus.MarkedDone) {
      throw new BookingTransitionError(this.props.status, BookingStatus.Completed);
    }

    Booking.requireValidDate(at, "at");

    return new Booking({ ...this.props, status: BookingStatus.Completed, completedAt: at });
  }

  /**
   * The customer says something is wrong. Every clock stops: `expires_at`
   * becomes null, so the sweep stops selecting this booking and only a person
   * moves it from here.
   *
   * This is the one place in the class that nulls `expiresAt`, and it is
   * the opposite of the mistake that column's own doc comment records.
   * `markPaid` and `expire` used to null it and were wrong to: the deadline
   * they erased was a real one somebody might need, and the sweep's status
   * filter was already keeping it from being acted on. Here there is no
   * deadline left to erase — nobody is waiting on a clock while an
   * administrator reads the case. `DISPUTED` is not one of
   * `DEADLINE_BEARING_STATUSES`, so the status filter excludes it in any
   * event; the null is the column saying the same thing itself, so that
   * nothing reading this row has to know the constant to know no clock is
   * running.
   */
  dispute(at: Date): Booking {
    if (this.props.status !== BookingStatus.MarkedDone) {
      throw new BookingTransitionError(this.props.status, BookingStatus.Disputed);
    }

    Booking.requireValidDate(at, "at");

    return new Booking({
      ...this.props,
      status: BookingStatus.Disputed,
      disputedAt: at,
      expiresAt: null,
    });
  }

  /**
   * An administrator decided. Keeping the completion and siding with the
   * customer are the only two outcomes, and neither moves money — the wallet
   * work reads `dispute_upheld` later to know what not to pay out.
   *
   * `upheld` reads as "the dispute was upheld", not "the completion was":
   * true sides with the customer and ends the booking `CANCELLED`, false
   * lets the completion stand.
   *
   * Both outcomes are written out here rather than delegated to `complete`
   * and `cancel`, because the two would not behave alike if they were.
   * `complete` guards on `MARKED_DONE`, which this booking is no longer,
   * so it could not be delegated to at all; `cancel` could — its
   * `CANCELLABLE_FROM` entry names `DISPUTED` — but `cancel` answers a
   * status it does not govern by handing the instance back in silence,
   * which is right for the sweep and wrong for an administrator who
   * pressed a button. Written out, both halves of one decision refuse the
   * same way. The `CANCELLABLE_FROM` entry stays regardless: it is what
   * makes `dispute_upheld` a reason with a rule behind it rather than a
   * string, and it is the gate `BookingCancelledReason`'s doc comment
   * promises the next reason will have to pass.
   */
  resolveDispute(at: Date, upheld: boolean): Booking {
    if (this.props.status !== BookingStatus.Disputed) {
      throw new BookingTransitionError(
        this.props.status,
        upheld ? BookingStatus.Cancelled : BookingStatus.Completed,
      );
    }

    Booking.requireValidDate(at, "at");

    return upheld
      ? new Booking({ ...this.props, status: BookingStatus.Cancelled, cancelledAt: at })
      : new Booking({ ...this.props, status: BookingStatus.Completed, completedAt: at });
  }
}
