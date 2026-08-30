import {
  BookingStatus,
  SLOT_HOLDING_STATUSES,
} from "../../../../shared/infrastructure/database/booking/enums";
import {
  BookingDateInvalidError,
  BookingDurationInvalidError,
  BookingFieldBlankError,
  BookingPriceInvalidError,
  BookingSnapshotInconsistentError,
  BookingTransitionError,
  CommissionOutOfRangeError,
} from "../exceptions";

/**
 * `SLOT_HOLDING_STATUSES` is a tuple of literal strings, narrower than the
 * full `BookingStatus` union its members belong to — so `.includes` needs
 * the widened type to accept an arbitrary `BookingStatus` as its argument
 * rather than only the four literals the tuple was built from.
 */
const SLOT_HOLDING_STATUS_SET: readonly BookingStatus[] = SLOT_HOLDING_STATUSES;

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
   * The payment deadline — real while the booking is still `PENDING_PAYMENT`,
   * `null` once it isn't. `markPaid` and `expire` both clear it: a deadline
   * on a booking that is already paid or already expired no longer means
   * anything, and leaving a stale date in place is an invitation for some
   * later query to act on it as if it still did.
   */
  readonly expiresAt: Date | null;
  readonly paidAt: Date | null;
  /** The payment processor's reference for this booking — e.g. an M-Pesa transaction id. Null until `markPaid`. */
  readonly paymentRef: string | null;
  readonly confirmedAt: Date | null;
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
 * `Booking` — every transition (`markPaid`, `expire`, and later `confirm`,
 * …) returns a new instance, matching how `Review.revise` never touches the
 * `Review` it was called on.
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
      status: BookingStatus.PendingPayment,
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
   * `PENDING_PAYMENT` is the only status this actually moves. Every other
   * status splits along one question, the same one `SLOT_HOLDING_STATUSES`
   * exists to answer: does the booking still hold its slot?
   *
   * A booking that still holds it — `AWAITING_PROVIDER`, `CONFIRMED`,
   * `MARKED_DONE` — can only have reached that status by having already
   * been paid once, so a second call here is never a new event. Carrying
   * the *same* reference, it's the same payment webhook delivered twice —
   * absorbed silently, same as before. Carrying a *different* reference,
   * it's a second, genuinely distinct transaction against a booking that
   * was already paid for — not a race to shrug off, but a fact somebody has
   * to see (most likely a refund owed on one of the two), so it throws with
   * both references named.
   *
   * A booking that no longer holds its slot has released it — `EXPIRED`
   * because nobody paid before the deadline, `DECLINED` or `CANCELLED`
   * because it was called off after being paid, `COMPLETED` or `DISPUTED`
   * because the work is behind it. Money arriving there is refused outright,
   * regardless of the reference: a card charged for a slot nobody is
   * holding anymore is a fact somebody has to see, and no comparison of
   * references makes it any less one.
   */
  markPaid(paymentRef: string, at: Date): Booking {
    if (this.props.status === BookingStatus.PendingPayment) {
      return new Booking({
        ...this.props,
        status: BookingStatus.AwaitingProvider,
        paidAt: at,
        paymentRef,
        expiresAt: null,
      });
    }

    if (SLOT_HOLDING_STATUS_SET.includes(this.props.status)) {
      if (this.props.paymentRef === paymentRef) {
        return this;
      }
      // `this.props.paymentRef` is never actually null here — every
      // slot-holding status past PENDING_PAYMENT is only reachable by
      // having been paid — but the props type can't say that, so the
      // fallback exists for the type checker, not for a real booking.
      throw new BookingTransitionError(this.props.paymentRef ?? "(no reference on file)", paymentRef);
    }

    throw new BookingTransitionError(this.props.status, BookingStatus.AwaitingProvider);
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
      expiresAt: null,
    });
  }
}
