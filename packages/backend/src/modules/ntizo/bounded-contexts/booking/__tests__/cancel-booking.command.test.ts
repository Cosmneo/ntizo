import { describe, expect, it } from "bun:test";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { Booking } from "../domain/aggregates/booking.aggregate";
import { BookingNotFoundError, NotBookingCustomerError } from "../domain/exceptions";
import { CancelBookingCommand, type CancelBookingInput } from "../app/use-cases/cancel-booking.command";
import type {
  BookingChangeRecord,
  BookingRepositoryPort,
} from "../app/ports/outbound/booking.repository.port";
import type { SlotHoldPort, SlotWindow } from "../app/ports/outbound/slot-hold.port";
import type { OutboxPort } from "../../../shared/app/ports/outbox.port";
import type { BookingStatus } from "../../../shared/infrastructure/database/booking/enums";
import { FakeRaiser, TrackingUnitOfWork, withId } from "./support/fakes";

/**
 * The slot every fixture in this file books, far enough out that nothing
 * here ever collides with a real calendar boundary — the same reasoning
 * `submit-accept-decline-booking.command.test.ts`'s own `WHEN` gives for
 * being relative to `now` rather than a pinned date.
 */
const WHEN = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

/**
 * A freshly-created, never-persisted booking's `Booking.create` input.
 * Mirrors `submit-accept-decline-booking.command.test.ts`'s own
 * `bookingInput` — this file needs its own copy rather than an import,
 * since nothing in that file's module is exported for reuse.
 */
function bookingInput(over: Partial<Parameters<typeof Booking.create>[0]> = {}) {
  return {
    customerId: "cust-1",
    providerId: "prov-1",
    serviceId: "svc-1",
    serviceOptionId: "opt-1",
    providerMemberId: "member-1",
    startsAt: WHEN,
    durationMinutes: 90,
    priceMinor: 150000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName: "Avaria eléctrica urgente",
    providerName: "Hélder Cossa",
    providerSlug: "helder-cossa-electricidade",
    optionName: "Diagnóstico e reparação",
    description: null,
    expiresAt: new Date(Date.now() + 30 * 60_000),
    ...over,
  };
}

const ADDRESS = { label: "Casa", line: "Av. Julius Nyerere 812", city: "Maputo" };

/** A stored, `AWAITING_PROVIDER` booking with an id — one of the two statuses `cancelByCustomer` governs. */
function awaitingProviderBooking(
  id = "bk-1",
  over: Partial<Parameters<typeof Booking.create>[0]> = {},
): Booking {
  const draft = Booking.create(bookingInput(over));
  const respondBy = Math.min(Date.now() + 120 * 60_000, draft.startsAt.getTime());
  const submitted = draft.submit(new Date(), new Date(respondBy), ADDRESS, null);
  return withId(submitted, id);
}

/** A stored, `PENDING_PAYMENT` booking with an id — the other status `cancelByCustomer` governs. */
function pendingPaymentBooking(
  id = "bk-1",
  over: Partial<Parameters<typeof Booking.create>[0]> = {},
): Booking {
  const draft = Booking.create(bookingInput(over));
  const respondBy = Math.min(Date.now() + 120 * 60_000, draft.startsAt.getTime());
  const submitted = draft.submit(new Date(), new Date(respondBy), ADDRESS, null);
  const payBy = new Date(Date.now() + 15 * 60_000);
  const accepted = submitted.accept(new Date(), payBy);
  return withId(accepted, id);
}

/**
 * A transactional fake tracking every `save` call, copied from
 * `submit-accept-decline-booking.command.test.ts`'s own `FakeRepo` — same
 * shape, minus `raceWinner`, which nothing in this file needs: none of
 * these tests exercise a command re-reading the row after losing the CAS.
 */
class FakeRepo implements BookingRepositoryPort {
  public saveCalls = 0;
  public savedArg: Booking | null = null;
  public lastApplied: boolean | null = null;
  public appendChangeCalls: BookingChangeRecord[] = [];
  public currentStatusOverride: BookingStatus | null = null;
  private current: Booking | null;

  constructor(
    initial: Booking | null,
    private readonly unitOfWork?: TrackingUnitOfWork,
  ) {
    this.current = initial;
  }

  async findById(id: string): Promise<Booking | null> {
    return this.current?.id === id ? this.current : null;
  }

  async findOpenDraftForCustomer(): Promise<Booking | null> {
    return null;
  }

  async save(booking: Booking, expectedStatus: Booking["status"]): Promise<boolean> {
    this.saveCalls += 1;
    this.savedArg = booking;
    this.unitOfWork?.order.push("save");
    const actualStatus = this.currentStatusOverride ?? this.current?.status;
    const applied = actualStatus === expectedStatus;
    this.lastApplied = applied;
    if (!applied) {
      return false;
    }
    const commit = () => {
      this.current = booking;
    };
    if (this.unitOfWork) {
      this.unitOfWork.stage(commit);
    } else {
      commit();
    }
    return true;
  }

  async appendChange(change: BookingChangeRecord): Promise<void> {
    this.appendChangeCalls.push(change);
    this.unitOfWork?.order.push("appendChange");
  }

  // None of this file's commands call these — `BookingRepositoryPort` still
  // requires them, the same way every other fake in this suite implements
  // them without exercising any.
  async insert(booking: Booking): Promise<Booking> {
    return booking;
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
  async chargeAttemptsOf(): Promise<number> {
    return 0;
  }
}

/** Records every `release` call, ordered against `unitOfWork` like every other fake here. */
class FakeSlotHold implements SlotHoldPort {
  public released: string[] = [];

  constructor(private readonly unitOfWork?: TrackingUnitOfWork) {}

  async hold(_bookingId: string, _slot: SlotWindow): Promise<void> {}

  async release(bookingId: string): Promise<void> {
    this.released.push(bookingId);
    this.unitOfWork?.order.push("release");
  }

  async transfer(_bookingId: string, _to: SlotWindow): Promise<void> {}
}

/**
 * Records what the command actually hands the outbox, plus whether that
 * call landed inside `unitOfWork.atomicExecute`, after the save had already
 * run — the same shape `submit-accept-decline-booking.command.test.ts`'s
 * own `CapturingOutbox` uses.
 */
class CapturingOutbox implements OutboxPort {
  published: {
    events: BaseDomainEvent[];
    aggregateType: string;
    insideTransaction: boolean;
    afterSave: boolean;
  }[] = [];

  constructor(private readonly unitOfWork: TrackingUnitOfWork) {}

  async publish(events: BaseDomainEvent[], aggregateType: string): Promise<void> {
    const record = {
      events,
      aggregateType,
      insideTransaction: this.unitOfWork.insideTransaction,
      afterSave: this.unitOfWork.order.includes("save"),
    };
    this.unitOfWork.stage(() => this.published.push(record));
  }
}

function setupCancel(initial: Booking | null, opts: { raiser?: FakeRaiser } = {}) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeRepo(initial, unitOfWork);
  const slotHold = new FakeSlotHold(unitOfWork);
  const raiser = opts.raiser ?? new FakeRaiser();
  const command = new CancelBookingCommand(repo, slotHold, unitOfWork, outbox, raiser);
  return { command, repo, slotHold, unitOfWork, outbox, raiser };
}

describe("CancelBookingCommand", () => {
  it("cancels an awaiting-provider booking for its own customer, releases the slot, appends the reason to booking_change, and publishes BookingCancelled exactly once — save, then appendChange, then release, then publish", async () => {
    const { command, repo, outbox, slotHold, unitOfWork } = setupCancel(awaitingProviderBooking());
    const input: CancelBookingInput = { bookingId: "bk-1", requesterUserId: "cust-1" };

    await command.execute(input);

    expect(repo.saveCalls).toBe(1);
    expect(repo.savedArg?.status).toBe("CANCELLED");

    expect(repo.appendChangeCalls).toHaveLength(1);
    expect(repo.appendChangeCalls[0]).toEqual({
      bookingId: "bk-1",
      changedByUserId: "cust-1",
      reason: "cancelled_by_customer",
      previousStartsAt: null,
      previousEndsAt: null,
      previousProviderMemberId: null,
      previousPriceMinor: null,
    });

    // CANCELLED is not one of SLOT_HOLDING_STATUSES — the slot releases.
    expect(slotHold.released).toEqual(["bk-1"]);

    expect(unitOfWork.order).toEqual(["save", "appendChange", "release"]);

    expect(outbox.published).toHaveLength(1);
    const batch = outbox.published[0]!;
    expect(batch.aggregateType).toBe("booking");
    expect(batch.insideTransaction).toBe(true);
    expect(batch.afterSave).toBe(true);
    expect(batch.events).toHaveLength(1);
    const event = batch.events[0]!;
    expect(event.eventName).toBe("booking.cancelled");
    expect(event.payload).toEqual({
      bookingId: "bk-1",
      customerId: "cust-1",
      providerId: "prov-1",
      providerMemberId: "member-1",
      startsAt: WHEN,
      reason: "cancelled_by_customer",
    });
  });

  it("also cancels from PENDING_PAYMENT — the other status cancelByCustomer governs", async () => {
    const { command, repo, slotHold } = setupCancel(pendingPaymentBooking());

    await command.execute({ bookingId: "bk-1", requesterUserId: "cust-1" });

    expect(repo.savedArg?.status).toBe("CANCELLED");
    expect(slotHold.released).toEqual(["bk-1"]);
  });

  it("refuses a caller who is not the booking's customer, and writes nothing", async () => {
    const { command, repo, outbox, slotHold } = setupCancel(awaitingProviderBooking());
    const input: CancelBookingInput = { bookingId: "bk-1", requesterUserId: "cust-2" };

    await expect(command.execute(input)).rejects.toThrow(NotBookingCustomerError);

    expect(repo.saveCalls).toBe(0);
    expect(repo.appendChangeCalls).toEqual([]);
    expect(slotHold.released).toEqual([]);
    expect(outbox.published).toEqual([]);
  });

  it("does nothing further when the row moved first — a losing compare-and-swap publishes nothing, appends nothing, releases nothing, and throws nothing", async () => {
    const { command, repo, outbox, slotHold } = setupCancel(pendingPaymentBooking());
    // Somebody else moved the booking (e.g. it was swept for non-payment)
    // between this call's read and its write.
    repo.currentStatusOverride = "CANCELLED";
    const input: CancelBookingInput = { bookingId: "bk-1", requesterUserId: "cust-1" };

    await command.execute(input);

    expect(repo.saveCalls).toBe(1);
    expect(repo.lastApplied).toBe(false);
    expect(repo.appendChangeCalls).toEqual([]);
    expect(slotHold.released).toEqual([]);
    expect(outbox.published).toEqual([]);
  });

  it("throws BookingNotFoundError when the booking does not exist, and writes nothing", async () => {
    const { command, repo, outbox, slotHold } = setupCancel(null);
    const input: CancelBookingInput = { bookingId: "missing", requesterUserId: "cust-1" };

    await expect(command.execute(input)).rejects.toThrow(BookingNotFoundError);

    expect(repo.saveCalls).toBe(0);
    expect(slotHold.released).toEqual([]);
    expect(outbox.published).toEqual([]);
  });
});

/**
 * BR-P6: a booking that changes hands has to *tell* somebody, and telling
 * them must never be able to fail the write that already committed. Split
 * out from the happy paths above for the same reason
 * `submit-accept-decline-booking.command.test.ts` splits its own
 * notification assertions out — what a hop announces, and to whom, is a
 * separate obligation from what it saves.
 */
describe("notifications", () => {
  it("cancel tells the provider the customer called it off", async () => {
    const { command, raiser } = setupCancel(awaitingProviderBooking());

    await command.execute({ bookingId: "bk-1", requesterUserId: "cust-1" });

    expect(raiser.raised).toHaveLength(1);
    expect(raiser.raised[0]).toMatchObject({
      type: "PROVIDER_BOOKING_CANCELLED_BY_CUSTOMER",
      audience: "provider",
      providerId: "prov-1",
      payload: expect.objectContaining({
        bookingId: "bk-1",
        serviceName: "Avaria eléctrica urgente",
        reason: "cancelled_by_customer",
      }),
    });
  });

  it("a losing cancel announces nothing", async () => {
    const { command, repo, raiser } = setupCancel(awaitingProviderBooking());
    repo.currentStatusOverride = "PENDING_PAYMENT";

    await command.execute({ bookingId: "bk-1", requesterUserId: "cust-1" });

    expect(repo.lastApplied).toBe(false);
    expect(raiser.raised).toEqual([]);
  });

  // The whole of BR-P6. The cancellation already committed by the time the
  // raise runs; a throw from the notification side must not travel back out
  // of `execute` and tell the customer their cancellation failed.
  it("a raiser that throws does not fail the cancel", async () => {
    const broken = new FakeRaiser(new Error("smtp down"));
    const { command, repo } = setupCancel(awaitingProviderBooking(), { raiser: broken });

    await expect(
      command.execute({ bookingId: "bk-1", requesterUserId: "cust-1" }),
    ).resolves.toBeUndefined();

    // And the write it could not announce is still there.
    expect(repo.savedArg?.status).toBe("CANCELLED");
  });
});
