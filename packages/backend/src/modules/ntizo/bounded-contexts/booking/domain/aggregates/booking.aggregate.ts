import { BookingStatus } from "../../../../shared/infrastructure/database/booking/enums";
import {
  BookingDateInvalidError,
  BookingDurationInvalidError,
  BookingFieldBlankError,
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
   * The payment deadline — set once at creation, and left alone by every
   * transition after that. `markPaid` and `expire` used to null it out on
   * the way past `PENDING_PAYMENT`, on the theory that a stale deadline
   * invited some later query to act on it. That theory was wrong in
   * practice: `findDueForExpiry` (see `booking.repository.ts`) already
   * filters on `status = 'PENDING_PAYMENT'` before it ever looks at this
   * column, so the null bought no protection a status check wasn't already
   * giving for free. What it did cost is real — the one fact a customer
   * disputing "you gave my slot away" needs is the deadline they were
   * actually given, and `PlatformSettingsReaderPort.findPaymentWindowMinutes`
   * is deliberately LIVE on the promise that "a booking already created
   * keeps the `expiresAt` it was given regardless of what this returns
   * afterward" (see that port's own comment) — a promise nulling this out
   * quietly broke the moment the booking moved on.
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
  readonly cancelledAt: Date | null;
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
  readonly addressLabel: string;
  readonly addressLine: string;
  readonly addressCity: string;
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
 * `Booking` — every transition (`markPaid`, `expire`, `submit`, `accept`,
 * `decline`) returns a new instance, matching how `Review.revise` never
 * touches the `Review` it was called on.
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
    addressLabel: string;
    addressLine: string;
    addressCity: string;
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
    Booking.requireNonBlank(input.addressLabel, "addressLabel");
    Booking.requireNonBlank(input.addressLine, "addressLine");
    Booking.requireNonBlank(input.addressCity, "addressCity");

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
      addressLabel: input.addressLabel,
      addressLine: input.addressLine,
      addressCity: input.addressCity,
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
   * and `findDueForExpiry` both need to turn a row into an aggregate, and
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
    Booking.requireNonBlank(props.addressLabel, "addressLabel");
    Booking.requireNonBlank(props.addressLine, "addressLine");
    Booking.requireNonBlank(props.addressCity, "addressCity");

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
  get addressLabel(): string {
    return this.props.addressLabel;
  }
  get addressLine(): string {
    return this.props.addressLine;
  }
  get addressCity(): string {
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
   */
  submit(at: Date, respondBy: Date): Booking {
    if (this.props.status !== BookingStatus.Draft) {
      throw new BookingTransitionError(this.props.status, BookingStatus.AwaitingProvider);
    }

    Booking.requireValidDate(at, "at");
    Booking.requireValidDate(respondBy, "respondBy");

    return new Booking({
      ...this.props,
      status: BookingStatus.AwaitingProvider,
      expiresAt: respondBy,
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
   * The payment window closes without a payment arriving.
   *
   * A no-op everywhere except `PENDING_PAYMENT`. The job that calls this
   * fires on a timer set at creation, with no way to know whether the
   * booking already moved on — paid, or moved on some other way — by the
   * time it does. That is an ordinary race, not a bug: the timer is
   * watching a clock, not the booking, so it firing late says nothing
   * about whether the payment arrived first. Throwing here would turn that
   * ordinary race into an error somebody has to read and dismiss, for
   * every booking that simply got paid before its deadline — the opposite
   * of `markPaid`'s refusal, and deliberately so: a stray payment is a fact
   * someone must see, a stray timer is not.
   */
  expire(at: Date): Booking {
    if (this.props.status !== BookingStatus.PendingPayment) {
      return this;
    }

    return new Booking({
      ...this.props,
      status: BookingStatus.Expired,
      expiredAt: at,
    });
  }
}
