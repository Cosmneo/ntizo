import { BookingStatus } from "../../../../shared/infrastructure/database/booking/enums";
import {
  BookingDurationInvalidError,
  BookingPriceInvalidError,
  CommissionOutOfRangeError,
} from "../exceptions";

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
  readonly expiresAt: Date;
  readonly paidAt: Date | null;
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
 * `Booking` — later transitions (`pay`, `confirm`, …) return a new instance,
 * matching how `Review.revise` never touches the `Review` it was called on.
 */
export class Booking {
  private constructor(private readonly props: BookingProps) {}

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
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get paidAt(): Date | null {
    return this.props.paidAt;
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
}
