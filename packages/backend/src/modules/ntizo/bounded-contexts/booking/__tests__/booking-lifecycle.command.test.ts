import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { NotificationType } from "@ntizo/shared";
import { Booking } from "../domain/aggregates/booking.aggregate";
import { BookingNotFoundError, BookingTransitionError } from "../domain/exceptions";
import {
  MarkBookingPaidCommand,
  type MarkBookingPaidInput,
} from "../app/use-cases/mark-booking-paid.command";
import { MarkBookingDoneCommand } from "../app/use-cases/mark-booking-done.command";
import { CompleteBookingCommand } from "../app/use-cases/complete-booking.command";
import { SweepBookingCommand, type SweepBookingInput } from "../app/use-cases/sweep-booking.command";
import type { AdminUserReaderPort } from "../app/ports/outbound/admin-user-reader.port";
import type {
  BookingChangeRecord,
  BookingRepositoryPort,
} from "../app/ports/outbound/booking.repository.port";
import type { ProviderMemberReaderPort } from "../app/ports/outbound/provider-member-reader.port";
import type { SlotHoldPort, SlotWindow } from "../app/ports/outbound/slot-hold.port";
import type { OutboxPort } from "../../../shared/app/ports/outbox.port";
import { FakeRaiser, TrackingUnitOfWork, withId } from "./support/fakes";

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

/**
 * A stored, `PENDING_PAYMENT` booking with an id, as `findById` would
 * return it.
 *
 * `Booking.create` alone no longer reaches `PENDING_PAYMENT` — it produces
 * `DRAFT` now (the reversal Task 3 built) — so this fixture threads through
 * `submit` and `accept` the same way a real booking does. Neither
 * transition's deadline argument carries meaning for the tests in this
 * file (none of them assert on `expiresAt`); `bookingInput().expiresAt` is
 * reused for both purely so this helper needs no second date to invent.
 */
/**
 * `submit` now takes the address explicitly rather than reading it off the
 * draft it already carries. Every fixture in this file goes through
 * `bookingInput`, which always sets a concrete address, so pulling it back
 * off the draft this way is safe — this file has nothing to say about a
 * booking with no address.
 */
function requiredAddress(b: Booking) {
  return { label: b.addressLabel as string, line: b.addressLine as string, city: b.addressCity as string };
}

function pendingBooking(id = "bk-1"): Booking {
  const draft = Booking.create(bookingInput());
  const deadline = draft.expiresAt as Date;
  const submitted = draft.submit(new Date(), deadline, requiredAddress(draft), null);
  const accepted = submitted.accept(new Date(), deadline);
  return withId(accepted, id);
}

/**
 * A stored `DRAFT` booking — a checkout the customer is still filling in,
 * standing on the checkout hold. The first of the design's five clocks, and
 * the one whose expiry tells nobody.
 */
function draftBooking(id = "bk-1"): Booking {
  return withId(Booking.create(bookingInput()), id);
}

/**
 * A stored `AWAITING_PROVIDER` booking — a request sent, standing on the
 * provider's response window. The second clock: its expiry tells the
 * customer, which is why it and `draftBooking` above cannot share an event
 * payload without `clock` to separate them.
 */
function awaitingBooking(id = "bk-1"): Booking {
  const draft = Booking.create(bookingInput());
  return withId(draft.submit(new Date(), draft.expiresAt as Date, requiredAddress(draft), null), id);
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
  public appendedChanges: BookingChangeRecord[] = [];
  public lastApplied: boolean | null = null;
  /**
   * Makes every write lose its compare-and-swap, whatever the row says.
   *
   * Not the same thing as moving `current` to another status: that makes the
   * *aggregate* refuse, before a write is ever attempted. This makes the
   * transition happen and only the `UPDATE` lose — the race where another
   * writer committed between this command's read and its own write — and no
   * arrangement of `current` can simulate it, because `findById` and the
   * compare-and-swap read the same field. The same field
   * `close-booking.command.test.ts`'s own fake carries, for the same reason.
   */
  public saveReturns = true;
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
   * Nothing in this file's commands reads it — only `CreateBookingCommand`
   * does — but the interface declares it, so the fake has to answer.
   */
  async findOpenDraftForCustomer(): Promise<Booking | null> {
    return null;
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
    const applied = this.saveReturns && this.current?.status === expectedStatus;
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

  /**
   * Records the history rows `SweepBookingCommand` writes, and pushes
   * `"append"` onto `unitOfWork.order` at the moment it writes them — the
   * same treatment `save` gets, so a test can prove the append landed
   * between the save and the release rather than merely that it happened.
   * `MarkBookingPaidCommand` never calls this and asserts nothing about it.
   */
  async appendChange(change: BookingChangeRecord): Promise<void> {
    this.appendedChanges.push(change);
    this.unitOfWork?.order.push("append");
  }

  // Neither command under test calls this — `BookingRepositoryPort` still
  // requires it, the same way `FakeRepo` in `create-booking.command.test.ts`
  // implements `findDueForSweep` without exercising it.
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
}

/**
 * Stands in for two workers racing the same row from the same stale read —
 * exactly the scenario `BookingRepositoryPort.save`'s `expectedStatus` guard
 * exists for: a payment webhook and the sweep both `findById` the
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

  /**
   * Nothing in this file's commands reads it — only `CreateBookingCommand`
   * does — but the interface declares it, so the fake has to answer.
   */
  async findOpenDraftForCustomer(): Promise<Booking | null> {
    return null;
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

function setupMarkPaid(initial: Booking | null, opts: { raiser?: FakeRaiser } = {}) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeRepo(initial, unitOfWork);
  const raiser = opts.raiser ?? new FakeRaiser();
  const command = new MarkBookingPaidCommand(repo, unitOfWork, outbox, raiser);
  return { command, repo, unitOfWork, outbox, raiser };
}

/**
 * Nobody the sweep is entitled to claim to be.
 *
 * Both hops the sweep hands over run with `requesterUserId: null`, which is
 * the one input `MarkBookingDoneCommand` skips its membership check for — so
 * this reader must never be asked anything at all, and `queries` is what says
 * so. It answers `false` rather than `true` for the same reason: if the sweep
 * ever did start claiming to be somebody, the answer that fails loudly is the
 * one that refuses.
 */
class FakeProviderMemberReader implements ProviderMemberReaderPort {
  public queries: { providerId: string; userId: string }[] = [];

  async isMember(providerId: string, userId: string): Promise<boolean> {
    this.queries.push({ providerId, userId });
    return false;
  }
}

/**
 * The platform's administrators, as the sweep's fan-out sees them.
 *
 * **Two of them, not one**, and that is the whole point of the fixture: an
 * assertion that the fan-out reached "the administrators" passes against a
 * single hardcoded raise when there is only ever one to reach.
 */
class FakeAdminUserReader implements AdminUserReaderPort {
  public calls = 0;

  constructor(
    public readonly ids: string[] = ["admin-1", "admin-2"],
    private readonly failWith: Error | null = null,
  ) {}

  async findAdminUserIds(): Promise<string[]> {
    this.calls += 1;
    if (this.failWith) throw this.failWith;
    return this.ids;
  }
}

/**
 * The sweep, wired the way `bootstrapBooking()` wires it — including the two
 * commands it hands its last two arms to rather than writing them itself.
 *
 * **Those two get their own unit of work and their own outbox**, which is not
 * a shortcut around `TrackingUnitOfWork`'s lack of nesting: it is what
 * production actually does. The sweep hands over only *after* its own
 * transaction has resolved (BR-P6 — see `SweepBookingCommand`), so the
 * commands it drives really do open a transaction of their own, and giving
 * them a separate `TrackingUnitOfWork` is what keeps `afterSave` and
 * `insideTransactionAtCall` answering about the right one.
 *
 * The raiser is shared, because the whole question this file asks about the
 * hand-over is who ends up being told and how many times — and that can only
 * be read off one list.
 */
function setupSweep(
  initial: Booking | null,
  opts: { raiser?: FakeRaiser; admins?: FakeAdminUserReader } = {},
) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeRepo(initial, unitOfWork);
  const slotHold = new FakeSlotHold(unitOfWork);
  const raiser = opts.raiser ?? new FakeRaiser(null, unitOfWork);
  const members = new FakeProviderMemberReader();
  const admins = opts.admins ?? new FakeAdminUserReader();

  const markDoneUnitOfWork = new TrackingUnitOfWork();
  const markDoneOutbox = new CapturingOutbox(markDoneUnitOfWork);
  const markBookingDone = new MarkBookingDoneCommand(
    repo,
    members,
    markDoneUnitOfWork,
    markDoneOutbox,
    raiser,
  );

  const completeUnitOfWork = new TrackingUnitOfWork();
  const completeOutbox = new CapturingOutbox(completeUnitOfWork);
  const completeBooking = new CompleteBookingCommand(
    repo,
    completeUnitOfWork,
    completeOutbox,
    raiser,
  );

  const command = new SweepBookingCommand(
    repo,
    slotHold,
    unitOfWork,
    outbox,
    raiser,
    markBookingDone,
    completeBooking,
    admins,
  );
  return {
    command,
    repo,
    slotHold,
    unitOfWork,
    outbox,
    raiser,
    members,
    admins,
    markDoneOutbox,
    completeOutbox,
  };
}

/**
 * The three arguments the sweep's two hand-over arms need, for the two tests
 * below that build the command by hand rather than through `setupSweep`.
 *
 * Both of those race over a `PENDING_PAYMENT` booking, whose arm the sweep
 * writes itself, so neither hand-over is reachable and none of these three is
 * ever called. They exist because the constructor requires them — and they are
 * real instances over the same racing repository rather than empty objects, so
 * that if a future change did route that status through a hand-over, the
 * second write would land on `row.current` and redden the assertions those
 * tests already make about it.
 *
 * The administrator reader answers with nobody: an empty list is what a
 * platform with no administrators looks like, and it is the one answer that
 * cannot add a notification to a test asserting there are none.
 */
function racingHandOver(
  repo: BookingRepositoryPort,
  unitOfWork: TrackingUnitOfWork,
  outbox: OutboxPort,
): [MarkBookingDoneCommand, CompleteBookingCommand, AdminUserReaderPort] {
  const raiser = new FakeRaiser();
  return [
    new MarkBookingDoneCommand(repo, new FakeProviderMemberReader(), unitOfWork, outbox, raiser),
    new CompleteBookingCommand(repo, unitOfWork, outbox, raiser),
    { findAdminUserIds: async () => [] },
  ];
}

describe("MarkBookingPaidCommand", () => {
  it("moves a pending booking to paid and publishes BookingPaid, inside the transaction, after the save", async () => {
    const { command, repo, outbox } = setupMarkPaid(pendingBooking());
    const input: MarkBookingPaidInput = { bookingId: "bk-1", paymentRef: "mpesa-123" };

    await command.execute(input);

    expect(repo.saveCalls).toBe(1);
    expect(repo.savedArg?.status).toBe("CONFIRMED");
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
    // Expired from AWAITING_PROVIDER: `expire` no longer moves
    // PENDING_PAYMENT at all — that clock ends in CANCELLED (see
    // `SweepBookingCommand` below).
    const expired = awaitingBooking().expire(WHEN);
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

describe("SweepBookingCommand", () => {
  it("expires an abandoned DRAFT, releases the hold, and tells nobody but Scheduling — save before release before publish", async () => {
    const { command, repo, slotHold, unitOfWork, outbox } = setupSweep(draftBooking());
    const input: SweepBookingInput = { bookingId: "bk-1" };

    await command.execute(input);

    expect(repo.saveCalls).toBe(1);
    expect(repo.savedArg?.status).toBe("EXPIRED");

    expect(slotHold.released).toEqual(["bk-1"]);

    // The order decided in `task-9-decisions.md`, plus the history row:
    // save first (so the release that follows is never releasing a slot a
    // still-slot-holding row claims), then append the change, then release,
    // then publish.
    expect(unitOfWork.order).toEqual(["save", "append", "release"]);

    // Nobody made this change — a deadline passed — so the actor is null
    // rather than a sentinel user. The reason names what happened, not
    // which clock it was: a window is not a reason.
    expect(repo.appendedChanges).toEqual([
      {
        bookingId: "bk-1",
        changedByUserId: null,
        reason: "checkout_hold_expired",
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      },
    ]);

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
      // The checkout hold, not the provider's window: the customer walked
      // away from their own form, and this is the field that lets
      // Notification stay silent about it.
      cause: "checkout_hold",
    });
  });

  it("expires an AWAITING_PROVIDER request under the provider's own clock", async () => {
    const { command, repo, slotHold, outbox } = setupSweep(awaitingBooking());

    await command.execute({ bookingId: "bk-1" });

    expect(repo.savedArg?.status).toBe("EXPIRED");
    expect(slotHold.released).toEqual(["bk-1"]);

    const event = outbox.published[0]!.events[0]!;
    expect(event.eventName).toBe("booking.expired");
    // Same status, same event class, same transition as the DRAFT above —
    // and a different obligation. Nothing but `cause` separates them, which
    // is why the two tests exist rather than one.
    expect(event.payload).toMatchObject({
      bookingId: "bk-1",
      customerId: "cust-1",
      cause: "provider_response",
    });

    // The history row names what happened, and it is not the same token the
    // DRAFT above wrote — the two expiries are only interchangeable if you
    // stop looking at why either one happened.
    expect(repo.appendedChanges[0]).toMatchObject({
      changedByUserId: null,
      reason: "provider_did_not_respond",
    });
  });

  /**
   * The row the design's failure section was written for, and the one this
   * whole task exists to get right: a provider accepted, blocked their
   * calendar, and the customer never paid. That is **not** an expiry. It is
   * a cancellation, and the provider is owed the reason.
   *
   * Written so that it cannot pass if somebody flattens the first three clocks
   * into one ending: it pins the status, the event name, and the reason,
   * and asserts against `EXPIRED`/`booking.expired` directly.
   */
  it("cancels a PENDING_PAYMENT booking whose window closed — CANCELLED with a reason, not EXPIRED", async () => {
    const { command, repo, slotHold, unitOfWork, outbox } = setupSweep(pendingBooking());

    await command.execute({ bookingId: "bk-1" });

    expect(repo.saveCalls).toBe(1);
    expect(repo.savedArg?.status).toBe("CANCELLED");
    expect(repo.savedArg?.status).not.toBe("EXPIRED");
    expect(repo.savedArg?.cancelledAt).not.toBeNull();
    expect(repo.savedArg?.expiredAt).toBeNull();

    // The slot goes back regardless of which ending applied — the provider
    // gets their afternoon back, which is the one thing this failure can
    // still give them.
    expect(slotHold.released).toEqual(["bk-1"]);
    expect(unitOfWork.order).toEqual(["save", "append", "release"]);

    // The durable half of the explanation the provider is owed. The event
    // below carries the same reason to Notification, but an event is a
    // message: drop it, or add its consumer later, and this row is all that
    // is left to answer why the booking died.
    expect(repo.appendedChanges).toHaveLength(1);
    expect(repo.appendedChanges[0]).toMatchObject({
      bookingId: "bk-1",
      changedByUserId: null,
      reason: "customer_did_not_pay",
    });

    expect(outbox.published).toHaveLength(1);
    const batch = outbox.published[0]!;
    expect(batch.afterSave).toBe(true);
    expect(batch.afterRelease).toBe(true);
    const event = batch.events[0]!;
    expect(event.eventName).toBe("booking.cancelled");
    expect(event.eventName).not.toBe("booking.expired");
    expect(event.payload).toMatchObject({
      bookingId: "bk-1",
      customerId: "cust-1",
      // The provider is the audience here, unlike either expiry, so the
      // event has to name them and the member whose calendar was blocked.
      providerId: "prov-1",
      providerMemberId: "member-1",
      startsAt: WHEN,
      reason: "customer_did_not_pay",
    });
  });

  it("never expires or cancels an already-paid booking, and never releases its slot", async () => {
    const paid = pendingBooking().markPaid("mpesa-123", WHEN);
    const { command, repo, slotHold, outbox } = setupSweep(paid);
    const input: SweepBookingInput = { bookingId: "bk-1" };

    await command.execute(input);

    // `CONFIRMED` **is** a status standing on a clock now — its own
    // appointment's end — so the sweep does reach this booking and does write
    // to it. What it must never do is end it: neither `expire` nor `cancel`
    // governs `CONFIRMED`, and releasing the hold would hand away a slot its
    // customer already paid for. The asking arm is asserted in full further
    // down; this test is the guard that survived the widening.
    expect(repo.savedArg?.status).toBe("CONFIRMED");
    expect(repo.savedArg?.expiredAt).toBeNull();
    expect(repo.savedArg?.cancelledAt).toBeNull();
    expect(slotHold.released).toEqual([]);
    expect(outbox.published).toEqual([]);
  });

  it("throws BookingNotFoundError when the booking does not exist, and releases nothing", async () => {
    const { command, repo, slotHold, outbox } = setupSweep(null);
    const input: SweepBookingInput = { bookingId: "missing" };

    await expect(command.execute(input)).rejects.toThrow(BookingNotFoundError);

    expect(repo.saveCalls).toBe(0);
    expect(slotHold.released).toEqual([]);
    expect(outbox.published).toEqual([]);
  });
});

/**
 * The lost-update race Task 5 of the booking-seams repair plan closes: the
 * payment window closes at T, the sweep selects the booking as
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
describe("MarkBookingPaidCommand and SweepBookingCommand racing the same stale read", () => {
  it("the sweep writes first: the sweep wins, the payment finds the row already moved and publishes nothing", async () => {
    const staleRead = pendingBooking();
    const row: { current: Booking | null } = { current: staleRead };

    const uowSweep = new TrackingUnitOfWork();
    const outboxSweep = new CapturingOutbox(uowSweep);
    const repoSweep = new RacingFakeRepo(staleRead, row, uowSweep);
    const slotHold = new FakeSlotHold(uowSweep);
    // The three arguments the two hand-over arms need. This race is fought
    // over a `PENDING_PAYMENT` booking, whose arm the sweep writes itself, so
    // none of them is ever reached — they are here because the constructor
    // requires them, and `racingHandOver` builds ones that say so if they ever
    // are.
    const sweepCmd = new SweepBookingCommand(
      repoSweep,
      slotHold,
      uowSweep,
      outboxSweep,
      new FakeRaiser(),
      ...racingHandOver(repoSweep, uowSweep, outboxSweep),
    );

    const uowPay = new TrackingUnitOfWork();
    const outboxPay = new CapturingOutbox(uowPay);
    const repoPay = new RacingFakeRepo(staleRead, row, uowPay);
    const markPaid = new MarkBookingPaidCommand(repoPay, uowPay, outboxPay, new FakeRaiser());

    // The sweep reaches the row first and commits its cancellation.
    await sweepCmd.execute({ bookingId: "bk-1" });
    // The webhook arrives against the very same PENDING_PAYMENT snapshot
    // the sweep started from — its own `findById` never saw the sweep's
    // write, because in the real race it ran before that write existed.
    await markPaid.execute({ bookingId: "bk-1", paymentRef: "mpesa-123" });

    expect(repoSweep.lastApplied).toBe(true);
    expect(outboxSweep.published).toHaveLength(1);
    // `booking.cancelled`, not `booking.expired`: the racing status here is
    // PENDING_PAYMENT, whose clock ends in a cancellation with a reason.
    expect(outboxSweep.published[0]?.events[0]?.eventName).toBe("booking.cancelled");

    // The webhook's write found the row already moved: no second
    // transition, no second outbox row. The customer is never told they
    // paid for a slot the row already gave away.
    expect(repoPay.saveCalls).toBe(1);
    expect(repoPay.lastApplied).toBe(false);
    expect(outboxPay.published).toEqual([]);

    // Exactly one status survives, and it is the winner's — not a status
    // that reflects whichever command happened to run last.
    expect(row.current?.status).toBe("CANCELLED");
  });

  it("the webhook writes first: the payment wins, the sweep finds the row already moved and releases nothing", async () => {
    const staleRead = pendingBooking();
    const row: { current: Booking | null } = { current: staleRead };

    const uowPay = new TrackingUnitOfWork();
    const outboxPay = new CapturingOutbox(uowPay);
    const repoPay = new RacingFakeRepo(staleRead, row, uowPay);
    const markPaid = new MarkBookingPaidCommand(repoPay, uowPay, outboxPay, new FakeRaiser());

    const uowSweep = new TrackingUnitOfWork();
    const outboxSweep = new CapturingOutbox(uowSweep);
    const repoSweep = new RacingFakeRepo(staleRead, row, uowSweep);
    const slotHold = new FakeSlotHold(uowSweep);
    // The three arguments the two hand-over arms need. This race is fought
    // over a `PENDING_PAYMENT` booking, whose arm the sweep writes itself, so
    // none of them is ever reached — they are here because the constructor
    // requires them, and `racingHandOver` builds ones that say so if they ever
    // are.
    const sweepCmd = new SweepBookingCommand(
      repoSweep,
      slotHold,
      uowSweep,
      outboxSweep,
      new FakeRaiser(),
      ...racingHandOver(repoSweep, uowSweep, outboxSweep),
    );

    await markPaid.execute({ bookingId: "bk-1", paymentRef: "mpesa-123" });
    await sweepCmd.execute({ bookingId: "bk-1" });

    expect(repoPay.lastApplied).toBe(true);
    expect(outboxPay.published).toHaveLength(1);
    expect(outboxPay.published[0]?.events[0]?.eventName).toBe("booking.paid");

    // The sweep's write found the row already moved: no release (the slot
    // is not abandoned — the customer who paid is still holding it) and no
    // `BookingCancelled` telling Scheduling and Notification the opposite
    // of what the row now says, reason and all.
    expect(repoSweep.saveCalls).toBe(1);
    expect(repoSweep.lastApplied).toBe(false);
    expect(slotHold.released).toEqual([]);
    expect(outboxSweep.published).toEqual([]);

    expect(row.current?.status).toBe("CONFIRMED");
  });
});

/**
 * BR-P6 for the two commands nobody asks for — a payment webhook and a cron
 * sweep. Both run with no caller waiting on an answer, which is exactly why
 * what they announce has to be asserted somewhere: a raise that silently
 * stopped happening here would surface as a customer who was never told they
 * paid, and nothing else in this suite would go red.
 */
describe("notifications", () => {
  it("a confirmed payment tells the customer and the provider, as two different notifications", async () => {
    const { command, raiser } = setupMarkPaid(pendingBooking());

    await command.execute({ bookingId: "bk-1", paymentRef: "mpesa-123" });

    // Two, not one with a branch in its template — see
    // `NotificationType`'s own doc comment for the rule this follows.
    expect(raiser.raised).toHaveLength(2);
    expect(raiser.raised[0]).toMatchObject({
      type: "BOOKING_CONFIRMED",
      audience: "user",
      userId: "cust-1",
      payload: expect.objectContaining({
        bookingId: "bk-1",
        serviceName: "Avaria eléctrica urgente",
        providerName: "Hélder Cossa",
      }),
    });
    expect(raiser.raised[1]).toMatchObject({
      type: "PROVIDER_BOOKING_CONFIRMED",
      audience: "provider",
      providerId: "prov-1",
      // No customer name on the booking row and no session here — this
      // command is driven by a webhook. The key is present and null.
      payload: expect.objectContaining({ customerFirstName: null }),
    });
  });

  // Two notifications for one confirmation, not four for two deliveries: the
  // second copy of the same webhook finds the booking already paid, and the
  // aggregate's own no-op is what stops it announcing again.
  it("paying twice confirms once — neither party is told twice", async () => {
    const { command, raiser } = setupMarkPaid(pendingBooking());

    await command.execute({ bookingId: "bk-1", paymentRef: "mpesa-123" });
    await command.execute({ bookingId: "bk-1", paymentRef: "mpesa-123" });

    expect(raiser.raised.map((r) => r.type)).toEqual([
      NotificationType.BookingConfirmed,
      NotificationType.ProviderBookingConfirmed,
    ]);
  });

  it("a raiser that throws does not fail the payment", async () => {
    const broken = new FakeRaiser(new Error("smtp down"));
    const { command, repo } = setupMarkPaid(pendingBooking(), { raiser: broken });

    await expect(
      command.execute({ bookingId: "bk-1", paymentRef: "mpesa-123" }),
    ).resolves.toBeUndefined();

    // The money cleared and the row moved; only the announcement was lost.
    expect(repo.savedArg?.status).toBe("CONFIRMED");
  });

  it("the cancellation tells the provider whose calendar just emptied, with the reason", async () => {
    const { command, raiser } = setupSweep(pendingBooking());

    await command.execute({ bookingId: "bk-1" });

    expect(raiser.raised).toEqual([
      expect.objectContaining({
        type: "PROVIDER_BOOKING_CANCELLED_BY_CUSTOMER",
        audience: "provider",
        providerId: "prov-1",
        payload: expect.objectContaining({
          bookingId: "bk-1",
          serviceName: "Avaria eléctrica urgente",
          reason: "customer_did_not_pay",
        }),
      }),
    ]);
  });

  // The design's three-row table for the pre-work clocks: the two expiries are not cancellations and
  // are not announced in this phase. A `DRAFT` past its checkout hold has
  // nobody to tell but the customer who walked away from their own checkout;
  // the provider's own window running out gets no type until a later phase
  // adds one. Asserted, so adding one is a deliberate change here rather
  // than a silent side effect somewhere else.
  it("neither expiry announces anything", async () => {
    const draft = setupSweep(draftBooking());
    await draft.command.execute({ bookingId: "bk-1" });
    expect(draft.repo.savedArg?.status).toBe("EXPIRED");
    expect(draft.raiser.raised).toEqual([]);

    const awaiting = setupSweep(awaitingBooking());
    await awaiting.command.execute({ bookingId: "bk-1" });
    expect(awaiting.repo.savedArg?.status).toBe("EXPIRED");
    expect(awaiting.raiser.raised).toEqual([]);
  });

  it("a sweep that finds the booking already moved announces nothing", async () => {
    // A booking that reached the end of the line. `COMPLETED` stands on no
    // clock at all — unlike `CONFIRMED`, which this fixture used to be and
    // which the sweep now has an arm for.
    const paid = pendingBooking().markPaid("mpesa-123", WHEN);
    const afterTheSlot = new Date(WHEN.getTime() + 3 * 3_600_000);
    const finished = paid
      .markDone(afterTheSlot, new Date(afterTheSlot.getTime() + 86_400_000))
      .complete(afterTheSlot);
    const { command, repo, raiser } = setupSweep(finished);

    await command.execute({ bookingId: "bk-1" });

    expect(repo.saveCalls).toBe(0);
    expect(raiser.raised).toEqual([]);
  });
});

/**
 * **The clock is frozen for every test below, and that is load-bearing.**
 *
 * Both new arms stamp a deadline computed from `new Date()` — seven days for
 * the platform's next question, three for the customer's window — and the
 * promise each makes is an exact number of days, not "about" that many.
 * Bracketing the call with `Date.now()` either side would prove the deadline
 * lands within a millisecond or two of the right one; it cannot prove the
 * constant is 7 rather than 6.9999. Freezing lets these assert the instant
 * exactly, which is what the provider's notification actually promises.
 *
 * It is also what makes "the appointment has ended" a fixed fact rather than
 * one relative to whenever the suite happens to run: the fixtures below are
 * built against a slot on the day before this instant, so
 * `Booking.markDone`'s own end-of-appointment guard is genuinely satisfied
 * rather than accidentally.
 *
 * Frozen and restored per test, inside these describes only — `setSystemTime`
 * is process-wide, and every test above this point deliberately runs on the
 * real clock.
 */
const SWEEP_NOW = new Date("2026-09-04T12:00:00.000Z");

/**
 * The two deadlines these tests exist to pin: `SWEEP_NOW` plus seven days,
 * and `SWEEP_NOW` plus three.
 *
 * **They are typed out on purpose, and must stay typed out.** An assertion
 * spelled `ASK_AGAIN_AFTER_DAYS * DAY_MS` re-derives the expected value from
 * the very constants the implementation multiplies, so it proves the
 * arithmetic and nothing else — change either number and it stays green.
 * `close-booking.command.test.ts` pins the same two windows the same way and
 * says so at more length; these are the sweep's copy, because the sweep is a
 * second caller of those constants and a second caller is a second place to
 * get them wrong.
 */
const ASK_AGAIN_AT = new Date("2026-09-11T12:00:00.000Z");
const FEEDBACK_BY = new Date("2026-09-07T12:00:00.000Z");

/** A slot that ran the day before `SWEEP_NOW`: 09:00 to 10:30, over and paid for. */
const ENDED_STARTS_AT = new Date("2026-09-03T09:00:00.000Z");

/** When the platform asked, on the fixture it has already asked — eight days back. */
const ASKED_AT = new Date("2026-08-27T12:00:00.000Z");

/**
 * A stored `CONFIRMED` booking whose appointment is over — the status the
 * design's fourth clock governs, built the way a real one gets there rather
 * than restored with the status typed in.
 *
 * `markPaid` is what puts it on that clock: it hands `expires_at` on to
 * `ends_at`, so a booking nobody closed is due the moment its own appointment
 * ends. Every deadline threaded through `submit` and `accept` on the way is
 * arbitrary — nothing here reads them back — but they are real instants
 * before the slot rather than after it, so the fixture describes a booking
 * that could actually have existed.
 */
function confirmedEndedBooking(id = "bk-1"): Booking {
  const draft = Booking.create(
    bookingInput({
      startsAt: ENDED_STARTS_AT,
      expiresAt: new Date("2026-09-03T08:30:00.000Z"),
    }),
  );
  const deadline = draft.expiresAt as Date;
  const submitted = draft.submit(
    new Date("2026-09-03T08:00:00.000Z"),
    deadline,
    requiredAddress(draft),
    null,
  );
  const accepted = submitted.accept(new Date("2026-09-03T08:10:00.000Z"), deadline);
  return withId(accepted.markPaid("mpesa-ended", new Date("2026-09-03T08:20:00.000Z")), id);
}

/**
 * The same booking after the platform has already asked once and been
 * ignored: `reminded_at` eight days back, and the seven-day deadline that
 * asking wrote now a day in the past.
 */
function alreadyAskedBooking(id = "bk-1"): Booking {
  return confirmedEndedBooking(id).reminded(ASKED_AT, new Date("2026-09-03T12:00:00.000Z"));
}

/**
 * A stored `MARKED_DONE` booking whose window has closed.
 *
 * The `feedbackBy` it is built with is deliberately arbitrary — one day, not
 * three. Reusing `FEEDBACK_WINDOW_DAYS` here would let a wrong constant
 * produce a fixture that agrees with it, and nothing about this arm reads
 * that field back anyway: `Booking.complete` takes no deadline, and the sweep
 * is handed this booking by a query that already decided it was due.
 */
function markedDoneBooking(id = "bk-1"): Booking {
  return confirmedEndedBooking(id).markDone(
    new Date("2026-09-03T11:00:00.000Z"),
    new Date("2026-09-04T11:00:00.000Z"),
  );
}

/** The same booking after its customer disputed it — every clock stopped. */
function disputedBooking(id = "bk-1"): Booking {
  return markedDoneBooking(id).dispute(new Date("2026-09-04T11:30:00.000Z"));
}

describe("the sweep, on a confirmed booking whose appointment has ended", () => {
  beforeEach(() => {
    setSystemTime(SWEEP_NOW);
  });

  afterEach(() => {
    setSystemTime();
  });

  it("asks the provider once, and does not move the booking", async () => {
    const { command, repo, slotHold, outbox, raiser } = setupSweep(confirmedEndedBooking());

    const outcome = await command.execute({ bookingId: "bk-1" });

    expect(outcome?.reason).toBe("close_reminder");

    // Asked, not closed. The whole argument for this arm is that a platform
    // which assumes a job is finished is not the same as one that asks — so
    // the status has to be exactly where it was, and the stamp that says the
    // booking was closed has to be absent.
    expect(repo.savedArg?.status).toBe("CONFIRMED");
    expect(repo.savedArg?.markedDoneAt).toBeNull();

    // The two facts this hop does write, as literal instants — see
    // `ASK_AGAIN_AT`'s own comment for why they are typed out.
    expect(repo.savedArg?.remindedAt).toEqual(SWEEP_NOW);
    expect(repo.savedArg?.expiresAt).toEqual(ASK_AGAIN_AT);
    // And the arithmetic behind the second, so a wrong multiplier is named
    // separately from a wrong number of days.
    expect(repo.savedArg!.expiresAt!.getTime() - SWEEP_NOW.getTime()).toBe(7 * 24 * 3_600_000);

    // The durable half of the asking. `reminded_at` on the row remembers only
    // the first question; this row is what makes the whole conversation
    // visible in the provider's timeline afterwards. Null actor because
    // nobody did it — a deadline passed.
    expect(repo.appendedChanges).toEqual([
      {
        bookingId: "bk-1",
        changedByUserId: null,
        reason: "close_reminder",
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      },
    ]);

    // Nothing ended here, so nothing is released and nothing is published.
    // The booking still holds its own (long past) slot legitimately, and no
    // consumer outside this context acts on the platform having asked a
    // question — that fact lives on the row and in the history above.
    expect(slotHold.released).toEqual([]);
    expect(outbox.published).toEqual([]);

    // The one announcement this arm owes, and the only one: the provider is
    // the person being asked.
    expect(raiser.raised).toEqual([
      {
        type: NotificationType.ProviderBookingCloseReminder,
        audience: "provider",
        providerId: "prov-1",
        payload: {
          bookingId: "bk-1",
          serviceName: "Avaria eléctrica urgente",
          startsAt: ENDED_STARTS_AT.toISOString(),
          closeBy: ASK_AGAIN_AT.toISOString(),
        },
      },
    ]);

    // BR-P6: announced after the transaction resolved, never inside it.
    expect(raiser.insideTransactionAtCall).toEqual([false]);
  });

  it("asks by the very deadline it wrote, not by a second reading of the clock", async () => {
    const { command, repo, raiser } = setupSweep(confirmedEndedBooking());

    await command.execute({ bookingId: "bk-1" });

    expect(raiser.raised[0]?.payload.closeBy).toBe(repo.savedArg!.expiresAt!.toISOString());
  });

  it("marks it done itself once it has asked and been ignored", async () => {
    const { command, repo, members, slotHold } = setupSweep(alreadyAskedBooking());

    const outcome = await command.execute({ bookingId: "bk-1" });

    expect(outcome?.reason).toBe("marked_done_by_platform");
    expect(repo.savedArg?.status).toBe("MARKED_DONE");

    // Nothing is released here either — the appointment ended days ago, so
    // there is no calendar to free, and handing the slot back would say this
    // booking had stopped occupying a window it still legitimately owns. The
    // asking arm and the completing arm are both pinned the same way; this is
    // the third of three.
    expect(slotHold.released).toEqual([]);
    expect(repo.savedArg?.markedDoneAt).toEqual(SWEEP_NOW);

    // Three days for the customer, as a literal instant — the window
    // `MarkBookingDoneCommand` opens, reached through the sweep rather than
    // recomputed by it.
    expect(repo.savedArg?.expiresAt).toEqual(FEEDBACK_BY);
    expect(repo.savedArg!.expiresAt!.getTime() - SWEEP_NOW.getTime()).toBe(3 * 24 * 3_600_000);

    // `reminded_at` is left where it stands: the row still says when the
    // conversation started, not when it ended.
    expect(repo.savedArg?.remindedAt).toEqual(ASKED_AT);

    expect(repo.appendedChanges).toEqual([
      {
        bookingId: "bk-1",
        changedByUserId: null,
        reason: "marked_done_by_platform",
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      },
    ]);

    // The sweep asked nobody and claims to be nobody, so nobody's membership
    // is ever looked up. A sweep that started passing a user id here would be
    // a sweep acting as a person.
    expect(members.queries).toEqual([]);
  });

  it("tells every administrator when it had to close one alone", async () => {
    const { command, raiser, admins } = setupSweep(alreadyAskedBooking());

    await command.execute({ bookingId: "bk-1" });

    const toAdmins = raiser.raised.filter((r) => r.type === "ADMIN_BOOKING_AUTO_CLOSED");
    expect(toAdmins).toHaveLength(admins.ids.length);
    // Every administrator, each addressed individually — not one raise with a
    // list inside it, and not the first of them only.
    expect(toAdmins.map((r) => (r.audience === "user" ? r.userId : null))).toEqual(admins.ids);
    expect(toAdmins[0]).toEqual({
      type: NotificationType.AdminBookingAutoClosed,
      audience: "user",
      userId: "admin-1",
      payload: {
        bookingId: "bk-1",
        serviceName: "Avaria eléctrica urgente",
        providerId: "prov-1",
        providerName: "Hélder Cossa",
      },
    });
    // Asked once for the whole fan-out, not once per raise.
    expect(admins.calls).toBe(1);
  });

  /**
   * The defect this arm is one careless line away from:
   * `MarkBookingDoneCommand`'s platform arm already tells the customer their
   * window is open and tells the provider the platform closed it for them. A
   * sweep that raised either of those again would send the provider two
   * notifications for one closing — which is exactly what a first reading of
   * this task's plan called for.
   */
  it("adds only the administrators — the command it hands over to told the other two", async () => {
    const { command, raiser } = setupSweep(alreadyAskedBooking());

    await command.execute({ bookingId: "bk-1" });

    expect(raiser.raised.map((r) => r.type)).toEqual([
      NotificationType.BookingMarkedDone,
      NotificationType.ProviderBookingAutoClosed,
      NotificationType.AdminBookingAutoClosed,
      NotificationType.AdminBookingAutoClosed,
    ]);
    // BR-P6 across the hand-over too: the sweep's own transaction had already
    // resolved before any of the four went out.
    expect(raiser.insideTransactionAtCall).toEqual([false, false, false, false]);
  });

  it("publishes the hop once, through the command that owns it", async () => {
    const { command, outbox, markDoneOutbox } = setupSweep(alreadyAskedBooking());

    await command.execute({ bookingId: "bk-1" });

    // The sweep publishes nothing of its own on this arm: a second
    // `booking.marked_done` would be two producers of one fact.
    expect(outbox.published).toEqual([]);
    expect(markDoneOutbox.published).toHaveLength(1);
    expect(markDoneOutbox.published[0]?.events[0]?.eventName).toBe("booking.marked_done");
    // Inside the hand-over's own transaction, which is the only ordering fact
    // this file can read: `afterSave` is derived from `unitOfWork.order`, and
    // `FakeRepo` pushes to the *sweep's* unit of work whichever command drove
    // the write. That `MarkBookingDoneCommand` publishes after its own save is
    // proven where it belongs, in `close-booking.command.test.ts`.
    expect(markDoneOutbox.published[0]?.insideTransaction).toBe(true);
  });

  /**
   * The two firings, in one test, over one row.
   *
   * The seven days between them are enforced by `findDueForSweep`, not here —
   * this command acts on whatever it is handed, the same way it always has.
   * What this pins is that the *second* firing is a different hop from the
   * first, and that it is the `reminded_at` the first one wrote that decides
   * so.
   */
  it("asks on the first firing and closes on the second", async () => {
    const { command, repo } = setupSweep(confirmedEndedBooking());

    const first = await command.execute({ bookingId: "bk-1" });
    const second = await command.execute({ bookingId: "bk-1" });

    expect(first?.reason).toBe("close_reminder");
    expect(second?.reason).toBe("marked_done_by_platform");
    expect(repo.savedArg?.status).toBe("MARKED_DONE");
    expect(repo.appendedChanges.map((c) => c.reason)).toEqual([
      "close_reminder",
      "marked_done_by_platform",
    ]);
  });

  it("a lost race on the asking leaves the whole world untouched", async () => {
    const { command, repo, slotHold, outbox, raiser } = setupSweep(confirmedEndedBooking());
    repo.saveReturns = false;

    expect(await command.execute({ bookingId: "bk-1" })).toBeNull();

    // Not only "nobody was told". A lost race that still appended would give
    // this booking's history a hop it never made, and one that still
    // published would hand a consumer an event describing a row that does not
    // say what it claims — both silent, and both invisible to an assertion
    // that reads the notifications alone.
    expect(repo.appendedChanges).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(raiser.raised).toEqual([]);
    expect(slotHold.released).toEqual([]);
  });

  it("a lost race on the closing tells no administrator the platform closed it", async () => {
    const { command, repo, outbox, markDoneOutbox, raiser, admins } =
      setupSweep(alreadyAskedBooking());
    repo.saveReturns = false;

    expect(await command.execute({ bookingId: "bk-1" })).toBeNull();

    expect(repo.appendedChanges).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(markDoneOutbox.published).toEqual([]);
    expect(raiser.raised).toEqual([]);
    // The fan-out never even asked who the administrators are — the news it
    // would have carried is a provider's own closing, not the platform's.
    expect(admins.calls).toBe(0);
  });

  it("an administrator list that cannot be read does not undo the close", async () => {
    const admins = new FakeAdminUserReader(["admin-1"], new Error("user table unreachable"));
    const { command, repo, raiser } = setupSweep(alreadyAskedBooking(), { admins });

    await expect(command.execute({ bookingId: "bk-1" })).resolves.not.toBeNull();

    // The booking really closed; only the announcement was lost (BR-P6).
    expect(repo.savedArg?.status).toBe("MARKED_DONE");
    expect(raiser.raised.filter((r) => r.type === "ADMIN_BOOKING_AUTO_CLOSED")).toEqual([]);
    // And the two the hand-over owed still went out.
    expect(raiser.raised.map((r) => r.type)).toEqual([
      NotificationType.BookingMarkedDone,
      NotificationType.ProviderBookingAutoClosed,
    ]);
  });

  /**
   * BR-P6 over the fan-out itself, which is a different failure from the one
   * above: there, listing the administrators failed and nobody was reached;
   * here every list read succeeds and the *notification adapter* throws.
   *
   * Without `raiseQuietly` around each raise, that exception leaves
   * `SweepBookingCommand.execute`, `SweepDueBookingsInternalCommand` catches
   * it, and a booking that really did close — and really did publish
   * `booking.marked_done` — is counted `failed` in the wave's tally and logged
   * as unsettled. The write has already committed by then; there is nothing
   * for the throw to undo and everything for it to misreport.
   */
  it("a raiser that throws does not fail the close", async () => {
    const raiser = new FakeRaiser(new Error("smtp down"));
    const { command, repo } = setupSweep(alreadyAskedBooking(), { raiser });

    const outcome = await command.execute({ bookingId: "bk-1" });

    expect(outcome?.reason).toBe("marked_done_by_platform");
    expect(repo.savedArg?.status).toBe("MARKED_DONE");
    // Every one of the four was attempted and every one was swallowed.
    expect(raiser.attempts).toBe(4);
    expect(raiser.raised).toEqual([]);
  });

  /**
   * The `raiseQuietly` is *inside* the loop, not around it.
   *
   * One `try` wrapped around the whole fan-out would pass the test above just
   * as happily, and would silently drop every administrator after the first
   * one whose adapter hiccupped. This is the only assertion that separates
   * them: administrator 1's raise throws, and administrator 2 still hears.
   */
  it("one administrator's notification failing still reaches the next", async () => {
    const raiser = new FakeRaiser(
      new Error("smtp down"),
      undefined,
      (input) => input.audience === "user" && input.userId === "admin-1",
    );
    const { command, repo, admins } = setupSweep(alreadyAskedBooking(), { raiser });

    await command.execute({ bookingId: "bk-1" });

    expect(repo.savedArg?.status).toBe("MARKED_DONE");
    expect(raiser.attempts).toBe(admins.ids.length + 2);
    const toAdmins = raiser.raised.filter((r) => r.type === NotificationType.AdminBookingAutoClosed);
    expect(toAdmins.map((r) => (r.audience === "user" ? r.userId : null))).toEqual(["admin-2"]);
  });

  /**
   * The promise `AdminUserReaderPort` makes in its own doc comment: an empty
   * list is not an error. A platform with no administrators closes the booking
   * and tells nobody, and the two the hand-over owes still go out.
   */
  it("closes it even when there is no administrator to tell", async () => {
    const { command, repo, raiser } = setupSweep(alreadyAskedBooking(), {
      admins: new FakeAdminUserReader([]),
    });

    const outcome = await command.execute({ bookingId: "bk-1" });

    expect(outcome?.reason).toBe("marked_done_by_platform");
    expect(repo.savedArg?.status).toBe("MARKED_DONE");
    expect(raiser.raised.map((r) => r.type)).toEqual([
      NotificationType.BookingMarkedDone,
      NotificationType.ProviderBookingAutoClosed,
    ]);
  });
});

describe("the sweep, on a booking waiting out its window", () => {
  beforeEach(() => {
    setSystemTime(SWEEP_NOW);
  });

  afterEach(() => {
    setSystemTime();
  });

  it("completes it when the window closes", async () => {
    const { command, repo, slotHold } = setupSweep(markedDoneBooking());

    const outcome = await command.execute({ bookingId: "bk-1" });

    expect(outcome?.reason).toBe("feedback_window_closed");
    expect(repo.savedArg?.status).toBe("COMPLETED");
    expect(repo.savedArg?.completedAt).toEqual(SWEEP_NOW);

    // The outcome names the window that closed; the history row names how the
    // booking ended. Two vocabularies on purpose — one is what this sweep
    // decided, the other is what happened to the booking.
    expect(repo.appendedChanges).toEqual([
      {
        bookingId: "bk-1",
        changedByUserId: null,
        reason: "completed_by_timer",
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      },
    ]);

    // `MARKED_DONE` is only reachable once the appointment is over, so the
    // slot this booking held is days in the past and nobody is waiting on it.
    expect(slotHold.released).toEqual([]);
  });

  it("tells both sides once, and adds nothing of its own", async () => {
    const { command, raiser, outbox, completeOutbox } = setupSweep(markedDoneBooking());

    await command.execute({ bookingId: "bk-1" });

    // `CompleteBookingCommand` already tells the customer and the provider.
    // The sweep adds nothing here for the same reason it adds only the
    // administrators to the arm above: a second raise is a second message
    // about one fact.
    expect(raiser.raised.map((r) => r.type)).toEqual([
      NotificationType.BookingCompleted,
      NotificationType.BookingCompleted,
    ]);
    expect(raiser.raised.map((r) => r.audience)).toEqual(["user", "provider"]);
    expect(raiser.insideTransactionAtCall).toEqual([false, false]);

    expect(outbox.published).toEqual([]);
    expect(completeOutbox.published).toHaveLength(1);
    expect(completeOutbox.published[0]?.events[0]?.eventName).toBe("booking.completed");
  });

  it("a lost race on the completion leaves the whole world untouched", async () => {
    const { command, repo, outbox, completeOutbox, raiser } = setupSweep(markedDoneBooking());
    repo.saveReturns = false;

    expect(await command.execute({ bookingId: "bk-1" })).toBeNull();

    expect(repo.appendedChanges).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(completeOutbox.published).toEqual([]);
    expect(raiser.raised).toEqual([]);
  });
});

/**
 * A dispute stops every clock: `Booking.dispute` nulls `expires_at`, so
 * `findDueForSweep` stops selecting the booking at all and this command is
 * never handed one. The `default` arm is the belt to that braces — and the
 * reason this sweep has no dispute arm of any kind.
 *
 * **`cancel(at, "dispute_upheld")` is a legal transition from `DISPUTED`, and
 * this sweep must never be its caller.** A dispute leaves through
 * `resolveDispute`, which writes both of its outcomes itself; a sweep that
 * quietly upheld disputes on a timer would decide, against a provider, a case
 * no administrator ever read. This test is what says the sweep does nothing
 * at all from that status.
 */
describe("the sweep, on a disputed booking", () => {
  beforeEach(() => {
    setSystemTime(SWEEP_NOW);
  });

  afterEach(() => {
    setSystemTime();
  });

  it("does nothing at all — a person owns it now", async () => {
    const { command, repo, slotHold, outbox, raiser } = setupSweep(disputedBooking());

    expect(await command.execute({ bookingId: "bk-1" })).toBeNull();

    expect(repo.saveCalls).toBe(0);
    expect(repo.appendedChanges).toEqual([]);
    expect(slotHold.released).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(raiser.raised).toEqual([]);
  });
});
