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
  public lastApplied: boolean | null = null;
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

  /**
   * Mirrors the real repository's compare-and-swap (Task 5 of the
   * booking-seams repair plan): the write only "sticks" — and `true` comes
   * back — when `expectedStatus` still matches what `current` holds at the
   * moment of the write, the same as a real `UPDATE … WHERE status = $2`.
   * Every test in this file that drives a single command against its own
   * `FakeRepo` never lets anything else touch `current` between that
   * command's read and its own write, so `applied` is always `true` here;
   * `RacingFakeRepo` below is what stops that from being true, on purpose.
   */
  async save(booking: Booking, expectedStatus: Booking["status"]): Promise<boolean> {
    this.saveCalls += 1;
    this.savedArg = booking;
    this.unitOfWork?.order.push("save");
    const applied = this.current?.status === expectedStatus;
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
 * Stands in for two workers racing the same row from the same stale read —
 * exactly the scenario `BookingRepositoryPort.save`'s `expectedStatus` guard
 * exists for: a payment webhook and the expiry sweep both `findById` the
 * same `PENDING_PAYMENT` booking before either has written anything back.
 *
 * `findById` always hands back `staleRead` — the one snapshot both racers
 * actually read, frozen before either wrote — never `row.current`. `save`'s
 * guard checks `expectedStatus` against `row.current`, the single mutable
 * "table" every `RacingFakeRepo` sharing one `row` points at. Run the two
 * commands sequentially (this file never interleaves their promises), and
 * whichever executes first finds `row.current` still stale and applies;
 * whichever executes second finds the row the first one just committed and
 * does not — the same outcome a real `UPDATE … WHERE id = $1 AND status =
 * $2` produces once the first writer's transaction has committed and the
 * second's re-evaluates its `WHERE` clause against it.
 *
 * Not `FakeRepo` reused with a shared `current`: `FakeRepo.findById` reads
 * its own `current`, which a second racer sharing the same field would see
 * updated the instant the first one's `atomicExecute` resolves — before the
 * second racer ever got to read anything, which is not a race, it is a
 * booking that already knows the answer.
 */
class RacingFakeRepo implements BookingRepositoryPort {
  public saveCalls = 0;
  public lastApplied: boolean | null = null;

  constructor(
    private readonly staleRead: Booking,
    private readonly row: { current: Booking | null },
    private readonly unitOfWork: TrackingUnitOfWork,
  ) {}

  async findById(id: string): Promise<Booking | null> {
    return this.staleRead.id === id ? this.staleRead : null;
  }

  async save(booking: Booking, expectedStatus: Booking["status"]): Promise<boolean> {
    this.saveCalls += 1;
    this.unitOfWork.order.push("save");
    const applied = this.row.current?.status === expectedStatus;
    this.lastApplied = applied;
    if (applied) {
      this.unitOfWork.stage(() => {
        this.row.current = booking;
      });
    }
    return applied;
  }

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

/**
 * The lost-update race Task 5 of the booking-seams repair plan closes: the
 * payment window closes at T, the expiry sweep selects the booking as
 * `PENDING_PAYMENT` at T+0.4s, and the M-Pesa webhook selects the same row,
 * also `PENDING_PAYMENT`, at T+0.5s. Both commands compute a real
 * transition from that identical stale read. Before the `expectedStatus`
 * guard, both writes applied and both outbox rows drained — the row ended
 * up saying whichever wrote last, while the loser's own event had already
 * told a different bounded context the opposite fact.
 *
 * `Booking`'s own identity-based idempotency (`moved === booking`) cannot
 * catch this: it only ever reasons about the value each command's own
 * `findById` returned, and by construction here that value is identical for
 * both commands and genuinely transitions on both sides. The guard has to
 * live at the write, which is what these tests exercise directly rather
 * than through the aggregate.
 */
describe("MarkBookingPaidCommand and ExpireBookingCommand racing the same stale read", () => {
  it("the sweep writes first: expiry wins, the payment finds the row already moved and publishes nothing", async () => {
    const staleRead = pendingBooking();
    const row: { current: Booking | null } = { current: staleRead };

    const uowExpire = new TrackingUnitOfWork();
    const outboxExpire = new CapturingOutbox(uowExpire);
    const repoExpire = new RacingFakeRepo(staleRead, row, uowExpire);
    const slotHold = new FakeSlotHold(uowExpire);
    const expireCmd = new ExpireBookingCommand(repoExpire, slotHold, uowExpire, outboxExpire);

    const uowPay = new TrackingUnitOfWork();
    const outboxPay = new CapturingOutbox(uowPay);
    const repoPay = new RacingFakeRepo(staleRead, row, uowPay);
    const markPaid = new MarkBookingPaidCommand(repoPay, uowPay, outboxPay);

    // The sweep reaches the row first and commits its expiry.
    await expireCmd.execute({ bookingId: "bk-1" });
    // The webhook arrives against the very same PENDING_PAYMENT snapshot
    // the sweep started from — its own `findById` never saw the sweep's
    // write, because in the real race it ran before that write existed.
    await markPaid.execute({ bookingId: "bk-1", paymentRef: "mpesa-123" });

    expect(repoExpire.lastApplied).toBe(true);
    expect(outboxExpire.published).toHaveLength(1);
    expect(outboxExpire.published[0]?.events[0]?.eventName).toBe("booking.expired");

    // The webhook's write found the row already moved: no second
    // transition, no second outbox row. The customer is never told they
    // paid for a slot the row already gave away.
    expect(repoPay.saveCalls).toBe(1);
    expect(repoPay.lastApplied).toBe(false);
    expect(outboxPay.published).toEqual([]);

    // Exactly one status survives, and it is the winner's — not a status
    // that reflects whichever command happened to run last.
    expect(row.current?.status).toBe("EXPIRED");
  });

  it("the webhook writes first: the payment wins, the sweep finds the row already moved and releases nothing", async () => {
    const staleRead = pendingBooking();
    const row: { current: Booking | null } = { current: staleRead };

    const uowPay = new TrackingUnitOfWork();
    const outboxPay = new CapturingOutbox(uowPay);
    const repoPay = new RacingFakeRepo(staleRead, row, uowPay);
    const markPaid = new MarkBookingPaidCommand(repoPay, uowPay, outboxPay);

    const uowExpire = new TrackingUnitOfWork();
    const outboxExpire = new CapturingOutbox(uowExpire);
    const repoExpire = new RacingFakeRepo(staleRead, row, uowExpire);
    const slotHold = new FakeSlotHold(uowExpire);
    const expireCmd = new ExpireBookingCommand(repoExpire, slotHold, uowExpire, outboxExpire);

    await markPaid.execute({ bookingId: "bk-1", paymentRef: "mpesa-123" });
    await expireCmd.execute({ bookingId: "bk-1" });

    expect(repoPay.lastApplied).toBe(true);
    expect(outboxPay.published).toHaveLength(1);
    expect(outboxPay.published[0]?.events[0]?.eventName).toBe("booking.paid");

    // The sweep's write found the row already moved: no release (the slot
    // is not abandoned — the customer who paid is still holding it) and no
    // `BookingExpired` telling Scheduling and Notification the opposite of
    // what the row now says.
    expect(repoExpire.saveCalls).toBe(1);
    expect(repoExpire.lastApplied).toBe(false);
    expect(slotHold.released).toEqual([]);
    expect(outboxExpire.published).toEqual([]);

    expect(row.current?.status).toBe("AWAITING_PROVIDER");
  });
});
