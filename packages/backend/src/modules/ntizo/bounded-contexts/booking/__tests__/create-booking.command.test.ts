import { describe, expect, it } from "bun:test";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { Booking } from "../domain/aggregates/booking.aggregate";
import {
  ProviderNotFoundError,
  ServiceNotBookableError,
  ServiceOptionNotFoundError,
  SlotAlreadyTakenError,
} from "../domain/exceptions";
import {
  CreateBookingCommand,
  type CreateBookingInput,
} from "../app/use-cases/create-booking.command";
import type {
  BookingChangeRecord,
  BookingRepositoryPort,
} from "../app/ports/outbound/booking.repository.port";
import type {
  ProviderSnapshot,
  ProviderSnapshotReaderPort,
} from "../app/ports/outbound/provider-snapshot.reader.port";
import type {
  ServiceOptionPricing,
  ServicePricingReaderPort,
} from "../app/ports/outbound/service-pricing.reader.port";
import type { SlotHoldPort, SlotWindow } from "../app/ports/outbound/slot-hold.port";
import type { DelayedJobsPort } from "../app/ports/outbound/delayed-jobs.port";
import type { OutboxPort } from "../../../shared/app/ports/outbox.port";

const INPUT: CreateBookingInput = {
  customerId: "cust-1",
  serviceOptionId: "opt-1",
  providerMemberId: "member-1",
  startsAt: new Date("2026-09-04T12:30:00.000Z"),
  locale: "pt-MZ",
  address: {
    label: "Casa",
    line: "Av. Julius Nyerere 812",
    city: "Maputo",
    district: "Sommerschield",
    directions: null,
    lat: null,
    lng: null,
  },
  description: "Sem energia na cozinha",
};

function validPricing(over: Partial<ServiceOptionPricing> = {}): ServiceOptionPricing {
  return {
    serviceId: "svc-1",
    providerId: "prov-1",
    serviceName: "Avaria eléctrica urgente",
    optionName: "Diagnóstico e reparação",
    bookingMode: "priced",
    serviceStatus: "published",
    optionIsActive: true,
    pricingMode: "fixed",
    amountMinor: 150000,
    currency: "MZN",
    durationMinutes: 90,
    ...over,
  };
}

function validProvider(over: Partial<ProviderSnapshot> = {}): ProviderSnapshot {
  return {
    commissionBps: 750,
    name: "Hélder Cossa",
    slug: "helder-cossa-electricidade",
    ...over,
  };
}

/**
 * Stands in for what a real `BookingRepositoryPort.insert` does: hand back
 * the same booking with a database-assigned id. Built through
 * `Booking.restore`, the same reconstitution seam Task 7's repository uses,
 * rather than reaching into `Booking`'s private state.
 */
function withId(booking: Booking, id: string): Booking {
  return Booking.restore({
    id,
    customerId: booking.customerId,
    providerId: booking.providerId,
    serviceId: booking.serviceId,
    serviceOptionId: booking.serviceOptionId,
    providerMemberId: booking.providerMemberId,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    durationMinutes: booking.durationMinutes,
    status: booking.status,
    expiresAt: booking.expiresAt,
    paidAt: booking.paidAt,
    paymentRef: booking.paymentRef,
    confirmedAt: booking.confirmedAt,
    declinedAt: booking.declinedAt,
    cancelledAt: booking.cancelledAt,
    markedDoneAt: booking.markedDoneAt,
    completedAt: booking.completedAt,
    disputedAt: booking.disputedAt,
    expiredAt: booking.expiredAt,
    priceMinor: booking.priceMinor,
    commissionBps: booking.commissionBps,
    commissionMinor: booking.commissionMinor,
    currency: booking.currency,
    serviceName: booking.serviceName,
    providerName: booking.providerName,
    providerSlug: booking.providerSlug,
    optionName: booking.optionName,
    addressLabel: booking.addressLabel,
    addressLine: booking.addressLine,
    addressCity: booking.addressCity,
    addressDistrict: booking.addressDistrict,
    addressDirections: booking.addressDirections,
    addressLat: booking.addressLat,
    addressLng: booking.addressLng,
    description: booking.description,
  });
}

/**
 * Flips `insideTransaction` around `work()`, and resets an `order` log at the
 * start of every call, so `FakeRepo.insert` and `CapturingOutbox.publish` can
 * each stamp themselves onto it — the same shape `review-commands.test.ts`
 * uses, for the same reason: a fake that just runs `work()` inline cannot
 * tell "published inside the transaction, after the insert" apart from
 * "published outside it, or before the write".
 */
class TrackingUnitOfWork implements UnitOfWorkPort {
  insideTransaction = false;
  order: string[] = [];

  async atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    this.insideTransaction = true;
    this.order = [];
    try {
      return await work();
    } finally {
      this.insideTransaction = false;
    }
  }
}

class FakeRepo implements BookingRepositoryPort {
  public insertedArg: Booking | null = null;
  public insertCalls = 0;
  public nextId = "bk-1";

  constructor(
    private readonly opts: { insertError?: Error } = {},
    private readonly unitOfWork?: TrackingUnitOfWork,
  ) {}

  async insert(booking: Booking): Promise<Booking> {
    this.insertCalls += 1;
    this.insertedArg = booking;
    if (this.opts.insertError) {
      throw this.opts.insertError;
    }
    this.unitOfWork?.order.push("insert");
    return withId(booking, this.nextId);
  }

  async findById(): Promise<Booking | null> {
    return null;
  }

  async save(): Promise<void> {}

  async appendChange(_change: BookingChangeRecord): Promise<void> {}

  async findDueForExpiry(): Promise<Booking[]> {
    return [];
  }
}

class FakePricingReader implements ServicePricingReaderPort {
  public queries: { serviceOptionId: string; locale: string }[] = [];

  constructor(private readonly result: ServiceOptionPricing | null) {}

  async findOption(serviceOptionId: string, locale: string): Promise<ServiceOptionPricing | null> {
    this.queries.push({ serviceOptionId, locale });
    return this.result;
  }
}

class FakeProviderReader implements ProviderSnapshotReaderPort {
  public queries: string[] = [];

  constructor(private readonly result: ProviderSnapshot | null) {}

  async findForBooking(providerId: string): Promise<ProviderSnapshot | null> {
    this.queries.push(providerId);
    return this.result;
  }
}

class FakeSlotHold implements SlotHoldPort {
  public held: { bookingId: string; slot: SlotWindow }[] = [];
  public released: string[] = [];
  public transferred: { bookingId: string; to: SlotWindow }[] = [];

  async hold(bookingId: string, slot: SlotWindow): Promise<void> {
    this.held.push({ bookingId, slot });
  }

  async release(bookingId: string): Promise<void> {
    this.released.push(bookingId);
  }

  async transfer(bookingId: string, to: SlotWindow): Promise<void> {
    this.transferred.push({ bookingId, to });
  }
}

class FakeDelayedJobs implements DelayedJobsPort {
  public scheduled: { bookingId: string; at: Date }[] = [];

  async scheduleBookingExpiry(bookingId: string, at: Date): Promise<void> {
    this.scheduled.push({ bookingId, at });
  }
}

/**
 * Records what `CreateBookingCommand` actually hands the outbox, plus —
 * per batch — whether that call landed inside `unitOfWork.atomicExecute` and
 * after `repo.insert` had already run within that same cycle. Mirrors
 * `review-commands.test.ts`'s `CapturingOutbox`: a fake asserting only "was
 * publish called" cannot catch a publish moved outside the transaction, or
 * ahead of the write but still inside it — both look identical to it.
 */
class CapturingOutbox implements OutboxPort {
  published: {
    events: BaseDomainEvent[];
    aggregateType: string;
    insideTransaction: boolean;
    afterInsert: boolean;
  }[] = [];

  constructor(private readonly unitOfWork: TrackingUnitOfWork) {}

  async publish(events: BaseDomainEvent[], aggregateType: string): Promise<void> {
    this.published.push({
      events,
      aggregateType,
      insideTransaction: this.unitOfWork.insideTransaction,
      afterInsert: this.unitOfWork.order.includes("insert"),
    });
  }
}

function setup(
  opts: {
    pricing?: ServiceOptionPricing | null;
    provider?: ProviderSnapshot | null;
    insertError?: Error;
  } = {},
) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeRepo({ insertError: opts.insertError }, unitOfWork);
  const pricingReader = new FakePricingReader(
    opts.pricing === undefined ? validPricing() : opts.pricing,
  );
  const providerReader = new FakeProviderReader(
    opts.provider === undefined ? validProvider() : opts.provider,
  );
  const slotHold = new FakeSlotHold();
  const delayedJobs = new FakeDelayedJobs();
  const command = new CreateBookingCommand(
    repo,
    pricingReader,
    providerReader,
    slotHold,
    delayedJobs,
    unitOfWork,
    outbox,
  );
  return { command, repo, pricingReader, providerReader, slotHold, delayedJobs, unitOfWork, outbox };
}

describe("CreateBookingCommand", () => {
  it("creates a booking with the commission read from the provider, not a constant", async () => {
    const { command, repo, providerReader } = setup({
      provider: validProvider({ commissionBps: 1234 }),
    });

    const result = await command.execute(INPUT);

    expect(result.bookingId).toBe("bk-1");
    expect(repo.insertedArg?.commissionBps).toBe(1234);
    expect(providerReader.queries).toEqual(["prov-1"]);
  });

  it("holds the slot for the member and window that was actually booked", async () => {
    const { command, slotHold } = setup();

    const result = await command.execute(INPUT);

    expect(slotHold.held).toHaveLength(1);
    const held = slotHold.held[0]!;
    expect(held.bookingId).toBe(result.bookingId);
    expect(held.slot.providerMemberId).toBe(INPUT.providerMemberId);
    expect(held.slot.startsAt).toEqual(INPUT.startsAt);
    expect(held.slot.endsAt).toEqual(new Date(INPUT.startsAt.getTime() + 90 * 60_000));
  });

  it("schedules the expiry job after the transaction, for the booking that was created", async () => {
    const { command, delayedJobs } = setup();

    const result = await command.execute(INPUT);

    expect(delayedJobs.scheduled).toHaveLength(1);
    expect(delayedJobs.scheduled[0]?.bookingId).toBe(result.bookingId);
    expect(delayedJobs.scheduled[0]?.at.toISOString()).toBe(result.expiresAt);
  });

  it("copies the address the customer chose onto the booking, immune to later mutation", async () => {
    const { command, repo } = setup();
    const address = { ...INPUT.address };
    const input: CreateBookingInput = { ...INPUT, address };

    await command.execute(input);

    // Mutated only after `execute` has returned. Passing the same object
    // through and reading it back would prove nothing about whether the
    // command copied it — this proves the booking no longer shares it.
    address.label = "Mutated after the fact";
    address.line = "Somewhere else entirely";
    address.city = "Changed";
    address.district = "Also changed";
    address.lat = 999;

    expect(repo.insertedArg?.addressLabel).toBe("Casa");
    expect(repo.insertedArg?.addressLine).toBe("Av. Julius Nyerere 812");
    expect(repo.insertedArg?.addressCity).toBe("Maputo");
    expect(repo.insertedArg?.addressDistrict).toBe("Sommerschield");
    expect(repo.insertedArg?.addressLat).toBeNull();
  });

  it("refuses a quote service, before ever reading the provider or touching the slot", async () => {
    const { command, repo, providerReader, slotHold, outbox } = setup({
      pricing: validPricing({ bookingMode: "quote" }),
    });

    const err = (await command.execute(INPUT).catch((e: unknown) => e)) as ServiceNotBookableError;

    expect(err).toBeInstanceOf(ServiceNotBookableError);
    expect(err.reason).toBe("quote");

    // The refusal happens before the provider is even read.
    expect(providerReader.queries).toEqual([]);
    expect(repo.insertCalls).toBe(0);
    // The assertion this test exists for: a command that held the slot and
    // then threw would still pass a weaker "the booking is absent" check.
    expect(slotHold.held).toEqual([]);
    expect(outbox.published).toEqual([]);
  });

  it("publishes BookingCreated exactly once, inside the transaction, after the insert", async () => {
    const { command, outbox } = setup();

    const result = await command.execute(INPUT);

    expect(outbox.published).toHaveLength(1);
    const batch = outbox.published[0]!;
    expect(batch.aggregateType).toBe("booking");
    expect(batch.insideTransaction).toBe(true);
    expect(batch.afterInsert).toBe(true);

    expect(batch.events).toHaveLength(1);
    const event = batch.events[0]!;
    expect(event.eventName).toBe("booking.created");
    expect(event.payload).toMatchObject({
      bookingId: result.bookingId,
      customerId: INPUT.customerId,
      providerId: "prov-1",
      serviceId: "svc-1",
      providerMemberId: INPUT.providerMemberId,
      priceMinor: 150000,
      currency: "MZN",
    });
  });

  it("lets SlotAlreadyTakenError surface unchanged, and publishes nothing", async () => {
    const conflict = new SlotAlreadyTakenError(INPUT.providerMemberId, INPUT.startsAt);
    const { command, outbox, slotHold, delayedJobs } = setup({ insertError: conflict });

    await expect(command.execute(INPUT)).rejects.toBe(conflict);

    // This is what proves the publish happens inside the atomic block rather
    // than beside it: without the transaction wrapping insert-then-hold-
    // then-publish, an insert failure would say nothing about whether the
    // event had already been handed to the outbox.
    expect(outbox.published).toEqual([]);
    expect(slotHold.held).toEqual([]);
    expect(delayedJobs.scheduled).toEqual([]);
  });

  describe("the order of refusals", () => {
    it("refuses when the option does not exist, without querying the provider", async () => {
      const { command, providerReader, repo } = setup({ pricing: null });

      await expect(command.execute(INPUT)).rejects.toThrow(ServiceOptionNotFoundError);
      expect(providerReader.queries).toEqual([]);
      expect(repo.insertCalls).toBe(0);
    });

    it("refuses an unpublished service", async () => {
      const { command } = setup({ pricing: validPricing({ serviceStatus: "draft" }) });

      const err = (await command.execute(INPUT).catch((e: unknown) => e)) as ServiceNotBookableError;
      expect(err).toBeInstanceOf(ServiceNotBookableError);
      expect(err.reason).toBe("not_published");
    });

    it("refuses a retired option", async () => {
      const { command } = setup({ pricing: validPricing({ optionIsActive: false }) });

      const err = (await command.execute(INPUT).catch((e: unknown) => e)) as ServiceNotBookableError;
      expect(err).toBeInstanceOf(ServiceNotBookableError);
      expect(err.reason).toBe("option_retired");
    });

    it("refuses an hourly option as a scope boundary, not a fault", async () => {
      const { command } = setup({
        pricing: validPricing({ pricingMode: "hourly", durationMinutes: null }),
      });

      const err = (await command.execute(INPUT).catch((e: unknown) => e)) as ServiceNotBookableError;
      expect(err).toBeInstanceOf(ServiceNotBookableError);
      expect(err.reason).toBe("hourly");
    });

    it("refuses fixed pricing with a null duration exactly like hourly, even though the CHECK constraint should never allow it", async () => {
      const { command } = setup({
        pricing: validPricing({ pricingMode: "fixed", durationMinutes: null }),
      });

      const err = (await command.execute(INPUT).catch((e: unknown) => e)) as ServiceNotBookableError;
      expect(err).toBeInstanceOf(ServiceNotBookableError);
      expect(err.reason).toBe("hourly");
    });

    it("refuses when the provider cannot be found, after every check on the option has passed", async () => {
      const { command, repo } = setup({ provider: null });

      await expect(command.execute(INPUT)).rejects.toThrow(ProviderNotFoundError);
      expect(repo.insertCalls).toBe(0);
    });
  });
});
