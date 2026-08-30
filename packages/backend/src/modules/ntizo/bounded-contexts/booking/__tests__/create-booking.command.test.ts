import { describe, expect, it } from "bun:test";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { Booking } from "../domain/aggregates/booking.aggregate";
import {
  ProviderNotFoundError,
  ServiceNotBookableError,
  ServiceOptionNotFoundError,
  SlotAlreadyTakenError,
  type ServiceNotBookableReason,
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
import type { PlatformSettingsReaderPort } from "../app/ports/outbound/platform-settings.reader.port";
import type {
  ServiceOptionPricing,
  ServicePricingReaderPort,
} from "../app/ports/outbound/service-pricing.reader.port";
import type { SlotHoldPort, SlotWindow } from "../app/ports/outbound/slot-hold.port";
import type { DelayedJobsPort } from "../app/ports/outbound/delayed-jobs.port";
import type { OutboxPort } from "../../../shared/app/ports/outbox.port";
import { TrackingUnitOfWork, withId } from "./support/fakes";

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

// `withId` and `TrackingUnitOfWork` live in `./support/fakes` — Task 9's
// `booking-lifecycle.command.test.ts` needs the exact same fakes, and a
// second copy would only be a second place for the two to drift.

class FakeRepo implements BookingRepositoryPort {
  public insertedArg: Booking | null = null;
  public insertCalls = 0;
  public nextId = "bk-1";
  /**
   * What has actually committed — what a real `findById` would be able to
   * see. Separate from `insertedArg`, which records that `insert` was
   * *called*, the same way a real `INSERT` statement runs and is assigned
   * an id even inside a transaction that later rolls back.
   */
  public committed: Booking[] = [];

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
    const persisted = withId(booking, this.nextId);
    const commit = () => this.committed.push(persisted);
    if (this.unitOfWork) {
      this.unitOfWork.stage(commit);
    } else {
      commit();
    }
    return persisted;
  }

  async findById(id: string): Promise<Booking | null> {
    return this.committed.find((b) => b.id === id) ?? null;
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

/**
 * Returns a fixed value rather than reading a settings row, matching every
 * other fake in this file. The value handed to `setup()` below is
 * deliberately neither the schema's new default (15) nor the constant this
 * command used to carry (30) — a command that ignored this reader and fell
 * back to either number would still pass every other test in this file, so
 * this is the fake the "reads the payment window" test depends on to fail.
 */
class FakePlatformSettingsReader implements PlatformSettingsReaderPort {
  public calls = 0;

  constructor(private readonly minutes: number) {}

  async findPaymentWindowMinutes(): Promise<number> {
    this.calls += 1;
    return this.minutes;
  }
}

class FakeSlotHold implements SlotHoldPort {
  public held: { bookingId: string; slot: SlotWindow }[] = [];
  public released: string[] = [];
  public transferred: { bookingId: string; to: SlotWindow }[] = [];

  constructor(private readonly opts: { holdError?: Error } = {}) {}

  async hold(bookingId: string, slot: SlotWindow): Promise<void> {
    if (this.opts.holdError) {
      throw this.opts.holdError;
    }
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
    const record = {
      events,
      aggregateType,
      insideTransaction: this.unitOfWork.insideTransaction,
      afterInsert: this.unitOfWork.order.includes("insert"),
    };
    this.unitOfWork.stage(() => this.published.push(record));
  }
}

/**
 * Neither the schema's default (15) nor the constant this command used to
 * hardcode (30) — see `FakePlatformSettingsReader`'s own comment.
 */
const FAKE_PAYMENT_WINDOW_MINUTES = 42;

function setup(
  opts: {
    pricing?: ServiceOptionPricing | null;
    provider?: ProviderSnapshot | null;
    insertError?: Error;
    holdError?: Error;
    paymentWindowMinutes?: number;
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
  const platformSettingsReader = new FakePlatformSettingsReader(
    opts.paymentWindowMinutes ?? FAKE_PAYMENT_WINDOW_MINUTES,
  );
  const slotHold = new FakeSlotHold({ holdError: opts.holdError });
  const delayedJobs = new FakeDelayedJobs();
  const command = new CreateBookingCommand(
    repo,
    pricingReader,
    providerReader,
    platformSettingsReader,
    slotHold,
    delayedJobs,
    unitOfWork,
    outbox,
  );
  return {
    command,
    repo,
    pricingReader,
    providerReader,
    platformSettingsReader,
    slotHold,
    delayedJobs,
    unitOfWork,
    outbox,
  };
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

  it("reads the payment window from PlatformSettingsReaderPort, not a hard-coded constant", async () => {
    const { command, platformSettingsReader } = setup({
      paymentWindowMinutes: FAKE_PAYMENT_WINDOW_MINUTES,
    });

    const before = Date.now();
    const result = await command.execute(INPUT);
    const after = Date.now();

    // Bounded by wall-clock reads taken immediately before and after the
    // call, rather than pinned to one instant, because `expiresAt` is
    // computed from `Date.now()` inside `execute` and this test cannot see
    // that exact moment. Both bounds move by the configured window (42
    // minutes) — neither the schema's new default (15) nor the constant this
    // command used to carry (30) — so a command that ignored the reader and
    // kept either number would land outside this range and fail here.
    const expiresAtMs = new Date(result.expiresAt).getTime();
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + FAKE_PAYMENT_WINDOW_MINUTES * 60_000);
    expect(expiresAtMs).toBeLessThanOrEqual(after + FAKE_PAYMENT_WINDOW_MINUTES * 60_000);
    expect(platformSettingsReader.calls).toBe(1);
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
    const { command, repo, outbox, slotHold, delayedJobs } = setup({ insertError: conflict });

    await expect(command.execute(INPUT)).rejects.toBe(conflict);

    // The insert itself throws here, before it ever reaches
    // `unitOfWork.stage` — so this case is true regardless of whether a
    // transaction wraps it. The test below, where the insert succeeds and
    // the *hold* fails afterward, is the one that actually depends on the
    // transaction existing.
    expect(repo.committed).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(slotHold.held).toEqual([]);
    expect(delayedJobs.scheduled).toEqual([]);
  });

  it("rolls back a successful insert when the hold fails afterward, inside the same transaction", async () => {
    // The case a passthrough fake cannot fail on: `repo.insert` succeeds —
    // it returns a booking with an id, same as the happy path — and only
    // the *next* step, `slotHold.hold`, throws. A fake that just appends to
    // an array on every insert call has no notion of "ran, but its
    // transaction never committed"; it would report the booking as present
    // regardless of what happened after. `TrackingUnitOfWork.stage` gives
    // `FakeRepo` that notion, so this is the test that actually depends on
    // `atomicExecute` wrapping insert-then-hold-then-publish, rather than
    // merely being consistent with it.
    const holdError = new Error("scheduling adapter unreachable");
    const { command, repo, outbox, slotHold, delayedJobs } = setup({ holdError });

    await expect(command.execute(INPUT)).rejects.toBe(holdError);

    // The attempt happened...
    expect(repo.insertCalls).toBe(1);
    // ...but the booking is not in the repository: the transaction that
    // would have committed it never returned.
    expect(await repo.findById("bk-1")).toBeNull();
    expect(repo.committed).toEqual([]);
    // `hold` throws before it ever records anything: a real hold attempt
    // that fails never becomes a held slot.
    expect(slotHold.held).toEqual([]);
    expect(outbox.published).toEqual([]);
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

  describe("ServiceNotBookableError's code", () => {
    // `mapErrorToGraphQLError` copies `message` and `error.code` onto the
    // GraphQL error and nothing else — `reason` never crosses the wire. A
    // shared "SERVICE_NOT_BOOKABLE" code for all four reasons would still
    // pass every test above (they all assert on `.reason`, read in this
    // process); this is the test that fails if the codes are ever
    // collapsed back into one, because it is the only one reading the field
    // that actually reaches the client.
    const reasons: ServiceNotBookableReason[] = [
      "quote",
      "not_published",
      "option_retired",
      "hourly",
    ];

    it("gives every reason its own code — the one field that survives the trip to the client", () => {
      const codes = reasons.map((reason) => new ServiceNotBookableError(reason).code);

      expect(codes).toEqual([
        "SERVICE_NOT_BOOKABLE_QUOTE",
        "SERVICE_NOT_BOOKABLE_NOT_PUBLISHED",
        "SERVICE_NOT_BOOKABLE_OPTION_RETIRED",
        "SERVICE_NOT_BOOKABLE_HOURLY",
      ]);
      expect(new Set(codes).size).toBe(reasons.length);
    });
  });
});
