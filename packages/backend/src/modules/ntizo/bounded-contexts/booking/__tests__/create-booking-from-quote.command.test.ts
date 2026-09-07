import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { Booking } from "../domain/aggregates/booking.aggregate";
import { ProviderNotFoundError, SlotAlreadyTakenError, SlotInPastError } from "../domain/exceptions";
import {
  CreateBookingFromQuoteCommand,
  type CreateBookingFromQuoteInput,
} from "../app/use-cases/create-booking-from-quote.command";
import type {
  BookingChangeRecord,
  BookingRepositoryPort,
} from "../app/ports/outbound/booking.repository.port";
import type {
  ProviderSnapshot,
  ProviderSnapshotReaderPort,
} from "../app/ports/outbound/provider-snapshot.reader.port";
import type { PlatformSettingsReaderPort } from "../app/ports/outbound/platform-settings.reader.port";
import type { OutboxPort } from "../../../shared/app/ports/outbox.port";
import { TrackingUnitOfWork, withId } from "./support/fakes";

/**
 * **The clock is frozen for this whole file, and that is load-bearing** —
 * same reasoning as `close-booking.command.test.ts`'s own `NOW`. This
 * command stamps `payBy` from `payment_window_minutes`, a number this file's
 * own fake chooses; bracketing the call with `Date.now()` either side (the
 * way `submit-accept-decline-booking.command.test.ts` does for the same
 * computation) can only prove the value landed within a millisecond or two
 * of the right one. Freezing the clock lets the uncapped case assert the
 * exact instant instead — the carried-forward requirement this file exists
 * to satisfy: a loose bound proves nothing an exact value doesn't prove
 * better.
 *
 * Restored in `afterEach` — `setSystemTime` is process-wide.
 */
const NOW = new Date("2026-05-04T09:00:00.000Z");

/** Neither the schema's default for `payment_window_minutes` (15) nor a round number — a command that ignored the reader would still pass on that default. */
const PAYMENT_WINDOW_MINUTES = 22;

/**
 * The exact deadline the uncapped case must produce: `NOW` plus the fake's
 * own window, typed out as arithmetic on `NOW` rather than re-derived from
 * anything the command itself computes — the same discipline
 * `close-booking.command.test.ts`'s `FEEDBACK_BY`/`ASK_AGAIN_AT` use, for
 * the same reason: an assertion built from the same expression the
 * implementation evaluates proves the two agree with each other, not that
 * either is right.
 */
const UNCAPPED_PAY_BY = new Date(NOW.getTime() + PAYMENT_WINDOW_MINUTES * 60_000);

/** A week out — far enough that the payment window never reaches it. */
const FAR_STARTS_AT = new Date(NOW.getTime() + 7 * 24 * 3_600_000);

const INPUT: CreateBookingFromQuoteInput = {
  quoteId: "q-1",
  customerId: "cust-1",
  providerId: "prov-1",
  serviceId: "svc-1",
  providerMemberId: "mem-1",
  startsAt: FAR_STARTS_AT,
  durationMinutes: 240,
  priceMinor: 9_800,
  currency: "MZN",
  serviceName: "Instalação de ar condicionado",
  description: "Dois aparelhos",
  address: {
    label: "Casa",
    line: "Av. X 1",
    city: "Maputo",
    district: "Central",
    directions: null,
    lat: null,
    lng: null,
  },
  acceptedByUserId: "cust-1",
};

/**
 * Stands in for `DrizzleBookingRepository`, with the same buffer-and-discard
 * discipline `create-booking.command.test.ts`'s own `FakeRepo` uses:
 * `insert` and `appendChange` register their write with
 * `unitOfWork.stage`, so what lands in `committed` / `appendedChanges` is
 * only what a database would actually have kept had the surrounding
 * transaction rolled back. A fake that pushed straight into those arrays
 * on every call could not tell "happened, and committed" apart from
 * "happened, but the transaction it ran in later threw" — exactly the gap
 * this task's first carried-forward requirement exists to close.
 *
 * `insideTransactionAtCall` / `*InsideTransaction` are witnesses recorded at
 * the moment of the call, for the same reason `FakeRaiser`'s own
 * `insideTransactionAtCall` is: `TrackingUnitOfWork.atomicExecute` clears
 * `insideTransaction` in its `finally`, so nothing observable after the
 * command returns can answer "was this call made from inside the block".
 */
class FakeRepo implements BookingRepositoryPort {
  public insertCalls = 0;
  public insertedCapacity: number | null = null;
  public insertedInsideTransaction = false;
  public committed: Booking[] = [];
  public appendCalls = 0;
  public appendedChanges: BookingChangeRecord[] = [];
  public appendedInsideTransaction = false;
  public nextId = "bk-1";

  constructor(
    private readonly opts: { insertError?: Error } = {},
    private readonly unitOfWork?: TrackingUnitOfWork,
  ) {}

  async insert(booking: Booking, capacity: number): Promise<Booking> {
    this.insertCalls += 1;
    this.insertedCapacity = capacity;
    this.insertedInsideTransaction = this.unitOfWork?.insideTransaction ?? false;
    if (this.opts.insertError) {
      // Thrown straight out, before it ever reaches `unitOfWork.stage` —
      // the same as a real `INSERT` whose exclusion constraint refuses:
      // nothing here is staged for the calendar-refusal case, so proving
      // "nothing committed" for it is true regardless of whether a
      // transaction wraps it. See the transactional test below for the one
      // that actually depends on `atomicExecute` wrapping insert-then-append.
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

  async findOpenDraftForCustomer(): Promise<Booking | null> {
    return null;
  }

  async save(): Promise<boolean> {
    return true;
  }

  async appendChange(change: BookingChangeRecord): Promise<void> {
    this.appendCalls += 1;
    this.appendedInsideTransaction = this.unitOfWork?.insideTransaction ?? false;
    this.unitOfWork?.order.push("append");
    const commit = () => this.appendedChanges.push(change);
    if (this.unitOfWork) {
      this.unitOfWork.stage(commit);
    } else {
      commit();
    }
  }

  async findDueForSweep(): Promise<Booking[]> {
    return [];
  }
  async findAwaitingCharge(): Promise<Booking[]> {
    return [];
  }
  async recordChargeAttempt(): Promise<number | null> {
    return 1;
  }
  async abandonCharge(): Promise<void> {}
  async chargeStateOf(): Promise<{ attempts: number; lastAttemptAt: Date | null }> {
    return { attempts: 0, lastAttemptAt: null };
  }
}

/**
 * Records what the command actually hands the outbox, plus — mirroring
 * `create-booking.command.test.ts`'s own `CapturingOutbox` — whether that
 * call landed inside `unitOfWork.atomicExecute` and after `repo.insert` and
 * `repo.appendChange` had already run within that same cycle. A fake
 * asserting only "was publish called" cannot catch a publish moved outside
 * the transaction, or ahead of the writes it is supposed to describe.
 */
class CapturingOutbox implements OutboxPort {
  published: {
    events: BaseDomainEvent[];
    aggregateType: string;
    insideTransaction: boolean;
    afterInsert: boolean;
    afterAppend: boolean;
  }[] = [];

  constructor(private readonly unitOfWork: TrackingUnitOfWork) {}

  async publish(events: BaseDomainEvent[], aggregateType: string): Promise<void> {
    const record = {
      events,
      aggregateType,
      insideTransaction: this.unitOfWork.insideTransaction,
      afterInsert: this.unitOfWork.order.includes("insert"),
      afterAppend: this.unitOfWork.order.includes("append"),
    };
    this.unitOfWork.stage(() => this.published.push(record));
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

/** Only `findPaymentWindowMinutes` is tracked: this command never reads the other two windows. */
class FakePlatformSettingsReader implements PlatformSettingsReaderPort {
  public paymentWindowCalls = 0;

  constructor(private readonly minutes: number) {}

  async findCheckoutHoldMinutes(): Promise<number> {
    return this.minutes;
  }
  async findProviderResponseMinutes(): Promise<number> {
    return this.minutes;
  }
  async findPaymentWindowMinutes(): Promise<number> {
    this.paymentWindowCalls += 1;
    return this.minutes;
  }
}

function setup(
  opts: {
    provider?: ProviderSnapshot | null;
    insertError?: Error;
    paymentWindowMinutes?: number;
  } = {},
) {
  const unitOfWork = new TrackingUnitOfWork();
  const repo = new FakeRepo({ insertError: opts.insertError }, unitOfWork);
  const providerReader = new FakeProviderReader(
    "provider" in opts ? (opts.provider ?? null) : { commissionBps: 1000, name: "Frio & Clima", slug: "frio-clima" },
  );
  const platformSettingsReader = new FakePlatformSettingsReader(
    opts.paymentWindowMinutes ?? PAYMENT_WINDOW_MINUTES,
  );
  const outbox = new CapturingOutbox(unitOfWork);
  const command = new CreateBookingFromQuoteCommand(repo, providerReader, platformSettingsReader, unitOfWork, outbox);
  return { command, repo, providerReader, platformSettingsReader, unitOfWork, outbox };
}

beforeEach(() => {
  setSystemTime(NOW);
});

afterEach(() => {
  setSystemTime();
});

describe("CreateBookingFromQuoteCommand", () => {
  it("creates a PENDING_PAYMENT booking carrying the quote, the proposal's price and the live commission — inside one transaction", async () => {
    const { command, repo, outbox, providerReader, platformSettingsReader, unitOfWork } = setup();

    const result = await command.execute(INPUT);

    expect(result.bookingId).toBe("bk-1");
    expect(result.payBy).toEqual(UNCAPPED_PAY_BY);
    expect(platformSettingsReader.paymentWindowCalls).toBe(1);
    expect(providerReader.queries).toEqual(["prov-1"]);

    const booking = repo.committed[0]!;
    expect(booking.status).toBe("PENDING_PAYMENT");
    expect(booking.quoteId).toBe("q-1");
    expect(booking.serviceOptionId).toBeNull();
    expect(booking.optionName).toBeNull();
    expect(booking.priceMinor).toBe(9_800);
    expect(booking.commissionBps).toBe(1000);
    expect(booking.commissionMinor).toBe(980);
    expect(booking.expiresAt).toEqual(UNCAPPED_PAY_BY);
    expect(booking.addressLabel).toBe("Casa");
    expect(booking.addressCity).toBe("Maputo");

    // Capacity is 1 — a quoted job is one person's time at an address for as
    // long as the proposal says, not a slot behind an availability rule.
    expect(repo.insertedCapacity).toBe(1);

    // Requirement 1: prove the insert and the change row happened *inside*
    // `atomicExecute`, not merely that they happened.
    expect(repo.insertedInsideTransaction).toBe(true);
    expect(repo.appendedInsideTransaction).toBe(true);
    expect(repo.appendedChanges[0]).toMatchObject({
      bookingId: "bk-1",
      changedByUserId: "cust-1",
      reason: "created_from_quote",
      previousStartsAt: null,
      previousEndsAt: null,
      previousProviderMemberId: null,
      previousPriceMinor: null,
    });
    expect(unitOfWork.order).toEqual(["insert", "append"]);

    expect(outbox.published).toHaveLength(1);
    const batch = outbox.published[0]!;
    expect(batch.aggregateType).toBe("booking");
    expect(batch.insideTransaction).toBe(true);
    expect(batch.afterInsert).toBe(true);
    expect(batch.afterAppend).toBe(true);
    expect(batch.events[0]?.eventName).toBe("booking.created");
    expect(batch.events[0]?.payload).toMatchObject({
      bookingId: "bk-1",
      customerId: "cust-1",
      providerId: "prov-1",
      serviceId: "svc-1",
      providerMemberId: "mem-1",
      priceMinor: 9_800,
      currency: "MZN",
      expiresAt: UNCAPPED_PAY_BY,
    });
  });

  it("caps the payment window at the proposed start when the window would otherwise run past it", async () => {
    const { command, repo } = setup();
    // Five minutes out against a 22-minute window: the cap bites — this is
    // the fixture requirement 3 asks for, where the cap actually binds,
    // rather than one so far out the cap could never have fired.
    const soon = new Date(NOW.getTime() + 5 * 60_000);

    const result = await command.execute({ ...INPUT, startsAt: soon, durationMinutes: 60 });

    expect(result.payBy).toEqual(soon);
    expect(repo.committed[0]!.expiresAt).toEqual(soon);
  });

  it("refuses a start already past, before ever reading the provider or writing anything", async () => {
    const { command, repo, providerReader, outbox } = setup();
    const pastStart = new Date(NOW.getTime() - 1_000);

    await expect(command.execute({ ...INPUT, startsAt: pastStart })).rejects.toThrow(SlotInPastError);

    expect(providerReader.queries).toEqual([]);
    expect(repo.insertCalls).toBe(0);
    expect(repo.appendCalls).toBe(0);
    expect(repo.committed).toEqual([]);
    expect(repo.appendedChanges).toEqual([]);
    expect(outbox.published).toEqual([]);
  });

  it("refuses when the provider snapshot is missing, before writing anything", async () => {
    const { command, repo, outbox } = setup({ provider: null });

    await expect(command.execute(INPUT)).rejects.toThrow(ProviderNotFoundError);

    expect(repo.insertCalls).toBe(0);
    expect(repo.committed).toEqual([]);
    expect(repo.appendedChanges).toEqual([]);
    expect(outbox.published).toEqual([]);
  });

  it("lets a calendar refusal through untouched, and writes nothing", async () => {
    const conflict = new SlotAlreadyTakenError("mem-1", FAR_STARTS_AT);
    const { command, repo, outbox } = setup({ insertError: conflict });

    await expect(command.execute(INPUT)).rejects.toBe(conflict);

    // Requirement 2: a refusal proves nothing was written — no insert, no
    // change row — not merely that the same error surfaced.
    expect(repo.appendCalls).toBe(0);
    expect(repo.committed).toEqual([]);
    expect(repo.appendedChanges).toEqual([]);
    expect(outbox.published).toEqual([]);
  });
});
