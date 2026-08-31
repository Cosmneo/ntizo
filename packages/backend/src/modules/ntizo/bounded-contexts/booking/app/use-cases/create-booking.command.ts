import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { Booking } from "../../domain/aggregates/booking.aggregate";
import { BookingCreated } from "../../domain/events";
import {
  ProviderNotFoundError,
  ServiceMemberCannotPerformError,
  ServiceNotBookableError,
  ServiceOptionNotFoundError,
  SlotInPastError,
  SlotNotOfferedError,
} from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { DelayedJobsPort } from "../ports/outbound/delayed-jobs.port";
import type { PlatformSettingsReaderPort } from "../ports/outbound/platform-settings.reader.port";
import type { ProviderSnapshotReaderPort } from "../ports/outbound/provider-snapshot.reader.port";
import type { ServicePricingReaderPort } from "../ports/outbound/service-pricing.reader.port";
import type { SlotHoldPort } from "../ports/outbound/slot-hold.port";
import type {
  SlotValidityReaderPort,
  SlotValidityReason,
} from "../ports/outbound/slot-validity.reader.port";

export interface CreateBookingInput {
  /** From `requireUser` at the GraphQL layer, never from the client. */
  customerId: string;
  serviceOptionId: string;
  providerMemberId: string;
  startsAt: Date;
  /** The locale the customer was reading the page in. */
  locale: string;
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
}

/**
 * Turns each of `SlotValidityReaderPort.check`'s four refusal reasons into
 * its own named error, and throws it.
 *
 * A `Record<SlotValidityReason, ...>` rather than a `switch`, and for the
 * same reason `SERVICE_NOT_BOOKABLE_CODES` is one: a `switch` with no
 * `default` lets a fifth reason compile silently with nothing thrown at all,
 * while a `Record` missing a key is a compile error the moment that reason
 * is added to the union. Each entry returns `never` — it always throws.
 *
 * The call site below still wraps the call in an explicit `throw`, even
 * though every entry here throws its own error before ever returning to
 * that `throw`. That is for the type checker, not the runtime: a `never`
 * return reached through a `Record` index does not, by itself, prove to
 * TypeScript that the branch calling it always exits — narrowing
 * `validity` to `{ ok: true, capacity: number }` afterward needs a real
 * `throw` (or `return`) statement at the call site, confirmed against a
 * minimal repro before relying on it. Only the code after the `if` reads
 * `validity.capacity`, which is why nothing caught this until Task 3 of
 * the booking-seats plan needed to.
 */
const RESULT_TO_REFUSAL: Record<
  SlotValidityReason,
  (serviceId: string, providerMemberId: string, startsAt: Date) => never
> = {
  provider_not_active: () => {
    throw new ServiceNotBookableError("provider_not_active");
  },
  member_cannot_perform_service: (serviceId, providerMemberId) => {
    throw new ServiceMemberCannotPerformError(serviceId, providerMemberId);
  },
  starts_at_in_past: (_serviceId, _providerMemberId, startsAt) => {
    throw new SlotInPastError(startsAt);
  },
  slot_not_offered: (_serviceId, providerMemberId, startsAt) => {
    throw new SlotNotOfferedError(providerMemberId, startsAt);
  },
};

/**
 * Turning a customer's checkout into a held slot and a debt they have not yet
 * paid.
 *
 * This is the first place Task 1 through Task 7's pieces all come together:
 * the aggregate's invariants (`Booking.create`), the domain events (Task 4),
 * and all five outbound ports (Task 6) meet here for the first time — plus
 * `PlatformSettingsReaderPort`, added by Task 13 in place of the hardcoded
 * payment window Task 8 started with. Nothing in this command re-derives
 * what `Booking.create` already computes — `endsAt` from `durationMinutes`,
 * `commissionMinor` from `priceMinor` and the provider's rate — because a
 * second implementation of either formula is a second place for them to
 * disagree.
 *
 * **The refusals run in a fixed order, and every one of them happens before
 * anything is written.** Read the option, then refuse a quote service, an
 * unpublished one, a retired option, or an hourly one; only once the option
 * has cleared every check is the provider read. No slot is held and no row
 * is inserted for a booking this command is about to refuse — see
 * `ServiceNotBookableError` for why `"hourly"` belongs in that list: an
 * hourly option has no `durationMinutes` by construction, and computing one
 * from a customer-chosen length is a second pricing rule with its own
 * rounding that no task in this plan contains.
 *
 * Once the provider exists, `SlotValidityReaderPort` runs one more check
 * before `Booking.create` is ever called: is `providerMemberId` someone who
 * performs this service, is the provider actually trading, is `startsAt` in
 * the future, and is it a start Scheduling's own grid actually offers that
 * member. That port calls Scheduling's rules rather than re-deriving them —
 * see its own doc comment for why a second implementation of "is this slot
 * free" would be the exact defect this task exists to close, one layer up.
 *
 * **The insert, the hold, and the publish share one transaction.** The insert
 * runs first because the hold and the event both need the database-assigned
 * booking id, which does not exist until the row does. If the insert throws
 * `SlotAlreadyTakenError` — another booking already won this member's
 * calendar at this instant — neither the hold nor the publish ever runs, and
 * the transaction leaves nothing behind: a booking without its hold would be
 * a double-booking waiting to happen, and a hold without its booking would
 * block a slot nobody could ever use.
 *
 * The expiry job is scheduled *after* the transaction returns, not inside it
 * — a job queued inside a block that then rolls back would be a job for a
 * booking that does not exist.
 */
export class CreateBookingCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly pricingReader: ServicePricingReaderPort,
    private readonly providerReader: ProviderSnapshotReaderPort,
    private readonly platformSettingsReader: PlatformSettingsReaderPort,
    private readonly slotValidityReader: SlotValidityReaderPort,
    private readonly slotHold: SlotHoldPort,
    private readonly delayedJobs: DelayedJobsPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(input: CreateBookingInput): Promise<{ bookingId: string; expiresAt: string }> {
    const pricing = await this.pricingReader.findOption(input.serviceOptionId, input.locale);
    if (!pricing) {
      throw new ServiceOptionNotFoundError(input.serviceOptionId);
    }

    // `bookingMode` belongs to the service, not the option: a quote service
    // carries no prices at all, so there is nothing here to snapshot.
    if (pricing.bookingMode !== "priced") {
      throw new ServiceNotBookableError("quote");
    }
    if (pricing.serviceStatus !== "published") {
      throw new ServiceNotBookableError("not_published");
    }
    if (!pricing.optionIsActive) {
      throw new ServiceNotBookableError("option_retired");
    }
    // Both halves of this check are read even though the CHECK constraint
    // guarantees they agree on a real row: the constraint is a fact about
    // rows in a table, and `pricing` is a value some adapter built. If the
    // two ever disagree, refusing here beats a null reaching
    // `Booking.create` and failing with a worse error further away.
    if (pricing.pricingMode !== "fixed" || pricing.durationMinutes === null) {
      throw new ServiceNotBookableError("hourly");
    }

    const provider = await this.providerReader.findForBooking(pricing.providerId);
    if (!provider) {
      throw new ProviderNotFoundError(pricing.providerId);
    }

    // The one check this command does not define — it asks
    // `SlotValidityReaderPort`, which asks Scheduling's own rules, whether
    // `providerMemberId` and `startsAt` actually name a real, bookable slot.
    // See `RESULT_TO_REFUSAL` below for why the four reasons become four
    // distinct errors rather than one generic "invalid slot".
    const validity = await this.slotValidityReader.check({
      serviceId: pricing.serviceId,
      providerMemberId: input.providerMemberId,
      startsAt: input.startsAt,
      durationMinutes: pricing.durationMinutes,
    });
    if (!validity.ok) {
      throw RESULT_TO_REFUSAL[validity.reason](
        pricing.serviceId,
        input.providerMemberId,
        input.startsAt,
      );
    }
    // `validity` narrows to `{ ok: true, capacity: number }` here — see
    // `RESULT_TO_REFUSAL`'s own doc comment for why the `throw` above is
    // needed for that, not just for the (already-guaranteed) runtime
    // behaviour. `capacity` is the same rule's own column
    // `SlotValidityReaderPort` already read to decide this start was offered
    // at all (null already coerced to one — see that port's
    // `SlotValidityResult` doc comment); carried to `repo.insert` below
    // rather than re-read, the same reasoning that port's own comment gives
    // for not re-resolving the rule a second time.
    const capacity = validity.capacity;

    // LIVE, not carried on the booking until it is: read fresh on every call,
    // so an administrator's change reaches the very next booking. See
    // `PlatformSettingsReaderPort` and `platform_settings`'s own header
    // comment for why that is not the same thing as a seed.
    const paymentWindowMinutes = await this.platformSettingsReader.findPaymentWindowMinutes();
    const expiresAt = new Date(Date.now() + paymentWindowMinutes * 60_000);

    // The address arrives as a value, not a reference: `input.address`'s
    // fields are copied onto individually-typed `Booking.create` parameters
    // below, not held as a shared object, so a caller mutating the object it
    // passed in after this returns can never reach back into the booking.
    const booking = Booking.create({
      customerId: input.customerId,
      providerId: pricing.providerId,
      serviceId: pricing.serviceId,
      serviceOptionId: input.serviceOptionId,
      providerMemberId: input.providerMemberId,
      startsAt: input.startsAt,
      durationMinutes: pricing.durationMinutes,
      priceMinor: pricing.amountMinor,
      // Read from the provider, not assumed: a hardcoded rate would show the
      // wrong fee for any provider an administrator has since changed.
      commissionBps: provider.commissionBps,
      currency: pricing.currency,
      serviceName: pricing.serviceName,
      providerName: provider.name,
      providerSlug: provider.slug,
      optionName: pricing.optionName,
      addressLabel: input.address.label,
      addressLine: input.address.line,
      addressCity: input.address.city,
      addressDistrict: input.address.district,
      addressDirections: input.address.directions,
      addressLat: input.address.lat,
      addressLng: input.address.lng,
      description: input.description,
      expiresAt,
    });

    const created = await this.unitOfWork.atomicExecute(async () => {
      const inserted = await this.repo.insert(booking, capacity);

      // `inserted.id` is never null here: `insert`'s contract (see
      // `BookingRepositoryPort`) is that the argument carries `id: null` and
      // the return value carries the database-assigned one.
      const bookingId = inserted.id as string;

      await this.slotHold.hold(bookingId, {
        providerMemberId: inserted.providerMemberId,
        startsAt: inserted.startsAt,
        endsAt: inserted.endsAt,
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
            // Real while PENDING_PAYMENT — which `inserted` always is here,
            // this command never creates anything else.
            expiresAt: inserted.expiresAt as Date,
          }),
        ],
        "booking",
      );

      return inserted;
    });

    const bookingId = created.id as string;
    const createdExpiresAt = created.expiresAt as Date;

    // Scheduled after the transaction resolves, not inside it: a job queued
    // for a booking that then rolled back would be a job for nothing.
    await this.delayedJobs.scheduleBookingExpiry(bookingId, createdExpiresAt);

    return { bookingId, expiresAt: createdExpiresAt.toISOString() };
  }
}
