import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { Booking } from "../../domain/aggregates/booking.aggregate";
import { BookingCreated } from "../../domain/events";
import { ProviderNotFoundError, SlotInPastError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import { cappedToSlotStart } from "./capped-to-slot-start";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { PlatformSettingsReaderPort } from "../ports/outbound/platform-settings.reader.port";
import type { ProviderSnapshotReaderPort } from "../ports/outbound/provider-snapshot.reader.port";

export interface CreateBookingFromQuoteInput {
  quoteId: string;
  customerId: string;
  providerId: string;
  serviceId: string;
  providerMemberId: string;
  startsAt: Date;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  /** Snapshotted by the quote context in the locale the customer asked in. */
  serviceName: string;
  address: {
    label: string;
    line: string;
    city: string;
    district: string | null;
    directions: string | null;
    lat: number | null;
    lng: number | null;
  };
  description: string | null;
  /** The accepting customer; `booking_change.changed_by_user_id`. */
  acceptedByUserId: string;
}

/** What `booking_change.reason` records for a booking that began as a quote. */
const CREATED_FROM_QUOTE = "created_from_quote";

/**
 * The quote context's one entrance into this one.
 *
 * **It runs inside the caller's transaction.** `DrizzleUnitOfWork` joins an
 * open transaction rather than opening a second one, so the quote's closing
 * and this booking commit together or not at all — which is the whole point:
 * a quote marked `ACCEPTED` beside no booking, or a booking beside an open
 * quote, are both states nobody could explain.
 *
 * **The calendar is the arbiter, and its refusal is not caught here.**
 * `repo.insert` raises `SlotAlreadyTakenError` when
 * `booking_member_slot_no_overlap` refuses; letting it out is what rolls the
 * acceptance back. The adapter at the composition root turns it into the
 * quote context's own `QuoteSlotTakenError`, and `AcceptQuoteCommand` then
 * puts the quote back in front of the provider.
 *
 * **Capacity is 1.** A quoted job is one person's time at an address for as
 * long as the proposal says; there is no `member_availability` rule behind a
 * time the provider chose by hand, and seats exist for a rule that offers
 * several customers one slot. If quoted group work ever appears, this is the
 * line to revisit.
 */
export class CreateBookingFromQuoteCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly providerReader: ProviderSnapshotReaderPort,
    private readonly platformSettingsReader: PlatformSettingsReaderPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(input: CreateBookingFromQuoteInput): Promise<{ bookingId: string; payBy: Date }> {
    const at = new Date();
    if (input.startsAt.getTime() <= at.getTime()) throw new SlotInPastError(input.startsAt);

    const provider = await this.providerReader.findForBooking(input.providerId);
    if (!provider) throw new ProviderNotFoundError(input.providerId);

    // LIVE, and capped at the slot: a window running past `startsAt` would
    // have the charge sweep chasing a customer for work already due.
    const paymentWindowMinutes = await this.platformSettingsReader.findPaymentWindowMinutes();
    const payBy = cappedToSlotStart(new Date(at.getTime() + paymentWindowMinutes * 60_000), input.startsAt);

    const booking = Booking.createFromQuote({
      quoteId: input.quoteId,
      customerId: input.customerId,
      providerId: input.providerId,
      serviceId: input.serviceId,
      providerMemberId: input.providerMemberId,
      startsAt: input.startsAt,
      durationMinutes: input.durationMinutes,
      priceMinor: input.priceMinor,
      commissionBps: provider.commissionBps,
      currency: input.currency,
      serviceName: input.serviceName,
      providerName: provider.name,
      providerSlug: provider.slug,
      addressLabel: input.address.label,
      addressLine: input.address.line,
      addressCity: input.address.city,
      addressDistrict: input.address.district,
      addressDirections: input.address.directions,
      addressLat: input.address.lat,
      addressLng: input.address.lng,
      description: input.description,
      at,
      payBy,
    });

    return await this.unitOfWork.atomicExecute(async () => {
      const inserted = await this.repo.insert(booking, 1);
      const bookingId = inserted.id as string;

      await this.repo.appendChange({
        bookingId,
        changedByUserId: input.acceptedByUserId,
        reason: CREATED_FROM_QUOTE,
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      await this.outboxPort.publish(
        [
          new BookingCreated({
            bookingId,
            customerId: inserted.customerId,
            providerId: inserted.providerId,
            serviceId: inserted.serviceId,
            providerMemberId: inserted.providerMemberId,
            startsAt: inserted.startsAt,
            endsAt: inserted.endsAt,
            priceMinor: inserted.priceMinor,
            currency: inserted.currency,
            expiresAt: payBy,
          }),
        ],
        "booking",
      );

      return { bookingId, payBy };
    });
  }
}
