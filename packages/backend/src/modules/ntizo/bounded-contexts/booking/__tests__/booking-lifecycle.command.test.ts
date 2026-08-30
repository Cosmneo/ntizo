import { describe, expect, it } from "bun:test";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { Booking } from "../domain/aggregates/booking.aggregate";
import { BookingNotFoundError, BookingTransitionError } from "../domain/exceptions";
import {
  MarkBookingPaidCommand,
  type MarkBookingPaidInput,
} from "../app/use-cases/mark-booking-paid.command";
import { ExpireBookingCommand, type ExpireBookingInput } from "../app/use-cases/expire-booking.command";
import type {
  BookingChangeRecord,
  BookingRepositoryPort,
} from "../app/ports/outbound/booking.repository.port";
import type { SlotHoldPort, SlotWindow } from "../app/ports/outbound/slot-hold.port";
import type { OutboxPort } from "../../../shared/app/ports/outbox.port";
import { TrackingUnitOfWork, withId } from "./support/fakes";

const WHEN = new Date("2026-09-04T12:30:00.000Z");

/** A freshly-created, never-persisted booking — always `PENDING_PAYMENT`. */
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
    addressLabel: "Casa",
    addressLine: "Av. Julius Nyerere 812",
    addressCity: "Maputo",
    addressDistrict: "Sommerschield",
    addressDirections: null,
    addressLat: null,
    addressLng: null,
    description: null,
    expiresAt: new Date("2026-09-04T13:00:00.000Z"),
    ...over,
  };
}

/** A stored, `PENDING_PAYMENT` booking with an id, as `findById` would return it. */
function pendingBooking(id = "bk-1"): Booking {
  return withId(Booking.create(bookingInput()), id);
}

/**
 * A transactional fake tracking every `save` call — mirrors
 * `create-booking.command.test.ts`'s `FakeRepo`, except it stands in for the
 * "load an existing row, then update it" half of `BookingRepositoryPort`
 * rather than the "insert a new one" half Task 8's command exercises.
 *
 * `save` pushes `"save"` onto `unitOfWork.order` immediately — the same
 * moment the caller's write actually happens — but only applies the write to
 * `current` (what a real `findById` would see next) once `stage`'s buffered
 * commit runs. That gap is what lets `CapturingOutbox` below tell "published
 * after the save committed" apart from "published before it, or without one
 * at all" — see `TrackingUnitOfWork`'s own doc comment for why that
 * distinction needs a transactional fake instead of a plain array.
 */
class FakeRepo implements BookingRepositoryPort {
  public saveCalls = 0;
  public savedArg: Booking | null = null;
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

  async save(booking: Booking): Promise<void> {
    this.saveCalls += 1;
    this.savedArg = booking;
    this.unitOfWork?.order.push("save");
    const commit = () => {
      this.current = booking;
    };
    if (this.unitOfWork) {
      this.unitOfWork.stage(commit);
    } else {
      commit();
    }
  }

  // Neither command under test calls these — `BookingRepositoryPort` still
  // requires them, the same way `FakeRepo` in `create-booking.command.test.ts`
  // implements `findDueForExpiry` without exercising it.
  async insert(booking: Booking): Promise<Booking> {
    return booking;
  }
  async appendChange(_change: BookingChangeRecord): Promise<void> {}
  async findDueForExpiry(): Promise<Booking[]> {
    return [];
  }
}

/**
 * Records every `release` call. Not staged through `unitOfWork` — a real
 * slot-hold adapter call is not itself part of the database transaction, the
 * same reason `create-booking.command.test.ts`'s `FakeSlotHold.hold` applies
 * its own effect immediately rather than buffering it. `unitOfWork.order`
 * still gets a `"release"` entry, at call time, so `CapturingOutbox` can tell
 * whether a publish happened after it.
 */
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
 * Records what each command actually hands the outbox, plus whether that
 * call landed inside `unitOfWork.atomicExecute`, after the save had already
 * run, and after the slot release had already run — the same three facts
 * `create-booking.command.test.ts`'s `CapturingOutbox` captures for
 * insert, just against `save`/`release` instead.
 */
class CapturingOutbox implements OutboxPort {
  published: {
    events: BaseDomainEvent[];
    aggregateType: string;
    insideTransaction: boolean;
    afterSave: boolean;
    afterRelease: boolean;
  }[] = [];

  constructor(private readonly unitOfWork: TrackingUnitOfWork) {}

  async publish(events: BaseDomainEvent[], aggregateType: string): Promise<void> {
    const record = {
      events,
      aggregateType,
      insideTransaction: this.unitOfWork.insideTransaction,
      afterSave: this.unitOfWork.order.includes("save"),
      afterRelease: this.unitOfWork.order.includes("release"),
    };
    this.unitOfWork.stage(() => this.published.push(record));
  }
}

function setupMarkPaid(initial: Booking | null) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeRepo(initial, unitOfWork);
  const command = new MarkBookingPaidCommand(repo, unitOfWork, outbox);
  return { command, repo, unitOfWork, outbox };
}

function setupExpire(initial: Booking | null) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeRepo(initial, unitOfWork);
  const slotHold = new FakeSlotHold(unitOfWork);
  const command = new ExpireBookingCommand(repo, slotHold, unitOfWork, outbox);
  return { command, repo, slotHold, unitOfWork, outbox };
}

describe("MarkBookingPaidCommand", () => {
  it("moves a pending booking to paid and publishes BookingPaid, inside the transaction, after the save", async () => {
    const { command, repo, outbox } = setupMarkPaid(pendingBooking());
    const input: MarkBookingPaidInput = { bookingId: "bk-1", paymentRef: "mpesa-123" };

    await command.execute(input);

    expect(repo.saveCalls).toBe(1);
    expect(repo.savedArg?.status).toBe("AWAITING_PROVIDER");
    expect(repo.savedArg?.paymentRef).toBe("mpesa-123");

    expect(outbox.published).toHaveLength(1);
    const batch = outbox.published[0]!;
    expect(batch.aggregateType).toBe("booking");
    expect(batch.insideTransaction).toBe(true);
    expect(batch.afterSave).toBe(true);
    expect(batch.events).toHaveLength(1);
    const event = batch.events[0]!;
    expect(event.eventName).toBe("booking.paid");
    expect(event.payload).toMatchObject({
      bookingId: "bk-1",
      customerId: "cust-1",
      providerId: "prov-1",
      priceMinor: 150000,
      commissionMinor: 15000,
      currency: "MZN",
      paymentRef: "mpesa-123",
    });
  });

  it("paying twice publishes once — the second call finds the booking already moved and returns quietly", async () => {
    const { command, repo, outbox } = setupMarkPaid(pendingBooking());
    const input: MarkBookingPaidInput = { bookingId: "bk-1", paymentRef: "mpesa-123" };

    await command.execute(input);
    // The same webhook, delivered again. Nothing about the second call is
    // different from the first except that the booking has already moved.
    await command.execute(input);

    // The assertion this test exists for: a second `BookingPaid` here would
    // tell Notification to send a second confirmation and Scheduling to hold
    // a slot it already holds.
    expect(outbox.published).toHaveLength(1);
    // The no-op path saves nothing — there is nothing new to persist for a
    // booking the aggregate says did not change.
    expect(repo.saveCalls).toBe(1);
  });

  it("throws paying a booking that already expired, and publishes nothing", async () => {
    const expired = pendingBooking().expire(WHEN);
    const { command, repo, outbox } = setupMarkPaid(expired);
    const input: MarkBookingPaidInput = { bookingId: "bk-1", paymentRef: "mpesa-123" };

    await expect(command.execute(input)).rejects.toThrow(BookingTransitionError);

    expect(repo.saveCalls).toBe(0);
    expect(outbox.published).toEqual([]);
  });

  it("throws BookingNotFoundError when the booking does not exist, and publishes nothing", async () => {
    const { command, repo, outbox } = setupMarkPaid(null);
    const input: MarkBookingPaidInput = { bookingId: "missing", paymentRef: "mpesa-123" };

    await expect(command.execute(input)).rejects.toThrow(BookingNotFoundError);

    expect(repo.saveCalls).toBe(0);
    expect(outbox.published).toEqual([]);
  });
});

describe("ExpireBookingCommand", () => {
  it("expires a pending booking, releases the hold, and publishes BookingExpired — save before release before publish", async () => {
    const { command, repo, slotHold, unitOfWork, outbox } = setupExpire(pendingBooking());
    const input: ExpireBookingInput = { bookingId: "bk-1" };

    await command.execute(input);

    expect(repo.saveCalls).toBe(1);
    expect(repo.savedArg?.status).toBe("EXPIRED");

    expect(slotHold.released).toEqual(["bk-1"]);

    // The order decided in `task-9-decisions.md`: save first (so the release
    // that follows is never releasing a slot a still-PENDING_PAYMENT row
    // claims), then release, then publish.
    expect(unitOfWork.order).toEqual(["save", "release"]);

    expect(outbox.published).toHaveLength(1);
    const batch = outbox.published[0]!;
    expect(batch.aggregateType).toBe("booking");
    expect(batch.insideTransaction).toBe(true);
    expect(batch.afterSave).toBe(true);
    expect(batch.afterRelease).toBe(true);
    expect(batch.events).toHaveLength(1);
    const event = batch.events[0]!;
    expect(event.eventName).toBe("booking.expired");
    expect(event.payload).toMatchObject({
      bookingId: "bk-1",
      providerMemberId: "member-1",
      startsAt: WHEN,
    });
  });

  it("expiring an already-paid booking publishes nothing and releases nothing", async () => {
    const paid = pendingBooking().markPaid("mpesa-123", WHEN);
    const { command, repo, slotHold, outbox } = setupExpire(paid);
    const input: ExpireBookingInput = { bookingId: "bk-1" };

    await command.execute(input);

    // `Booking.expire` is a no-op from every status but `PENDING_PAYMENT` —
    // see its doc comment. The command's whole job here is to trust that and
    // do nothing further: no save, no release, no event. Releasing this
    // booking's hold would hand away a slot its customer already paid for.
    expect(repo.saveCalls).toBe(0);
    expect(slotHold.released).toEqual([]);
    expect(outbox.published).toEqual([]);
  });

  it("throws BookingNotFoundError when the booking does not exist, and releases nothing", async () => {
    const { command, repo, slotHold, outbox } = setupExpire(null);
    const input: ExpireBookingInput = { bookingId: "missing" };

    await expect(command.execute(input)).rejects.toThrow(BookingNotFoundError);

    expect(repo.saveCalls).toBe(0);
    expect(slotHold.released).toEqual([]);
    expect(outbox.published).toEqual([]);
  });
});
