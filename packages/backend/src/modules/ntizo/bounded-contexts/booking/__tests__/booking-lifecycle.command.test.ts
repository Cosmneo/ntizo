import { describe, expect, it } from "bun:test";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { NotificationType } from "@ntizo/shared";
import { Booking } from "../domain/aggregates/booking.aggregate";
import { BookingNotFoundError, BookingTransitionError } from "../domain/exceptions";
import {
  MarkBookingPaidCommand,
  type MarkBookingPaidInput,
} from "../app/use-cases/mark-booking-paid.command";
import { SweepBookingCommand, type SweepBookingInput } from "../app/use-cases/sweep-booking.command";
import type {
  BookingChangeRecord,
  BookingRepositoryPort,
} from "../app/ports/outbound/booking.repository.port";
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
 * standing on the checkout hold. The first of the design's three clocks, and
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

  /**
   * Records the history rows `SweepBookingCommand` and
   * `MarkBookingPaidCommand` write, and pushes `"append"` onto
   * `unitOfWork.order` at the moment it writes them — the same treatment
   * `save` gets, so a test can prove the append landed after the save (and,
   * for the sweep, before the release) rather than merely that it happened.
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
  async chargeStateOf(): Promise<{ attempts: number; lastAttemptAt: Date | null }> {
    return { attempts: 0, lastAttemptAt: null };
  }
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
  async chargeStateOf(): Promise<{ attempts: number; lastAttemptAt: Date | null }> {
    return { attempts: 0, lastAttemptAt: null };
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

function setupMarkPaid(initial: Booking | null, opts: { raiser?: FakeRaiser } = {}) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeRepo(initial, unitOfWork);
  const raiser = opts.raiser ?? new FakeRaiser();
  const command = new MarkBookingPaidCommand(repo, unitOfWork, outbox, raiser);
  return { command, repo, unitOfWork, outbox, raiser };
}

function setupSweep(initial: Booking | null, opts: { raiser?: FakeRaiser } = {}) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeRepo(initial, unitOfWork);
  const slotHold = new FakeSlotHold(unitOfWork);
  const raiser = opts.raiser ?? new FakeRaiser();
  const command = new SweepBookingCommand(repo, slotHold, unitOfWork, outbox, raiser);
  return { command, repo, slotHold, unitOfWork, outbox, raiser };
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

  /**
   * I2. Without this row the timeline stopped at "Prestador aceitou" while
   * the money card directly above it said "Pago a …" — two blocks on one
   * screen disagreeing about the same booking. The spec says the timeline
   * ends at "pagamento confirmado"; this is the hop that lets it.
   */
  it("writes the payment_confirmed hop, after the save, with no actor", async () => {
    const { command, repo, unitOfWork } = setupMarkPaid(pendingBooking());
    const input: MarkBookingPaidInput = { bookingId: "bk-1", paymentRef: "mpesa-123" };

    await command.execute(input);

    expect(repo.appendedChanges).toHaveLength(1);
    expect(repo.appendedChanges[0]).toEqual({
      bookingId: "bk-1",
      // Null because nobody made this change: a payment webhook is being
      // recorded, not a person acting.
      changedByUserId: null,
      reason: "payment_confirmed",
      previousStartsAt: null,
      previousEndsAt: null,
      previousProviderMemberId: null,
      previousPriceMinor: null,
    });
    // A history claiming a hop the row never made is worse than no history:
    // the append only runs once the compare-and-swap has applied.
    expect(unitOfWork.order.indexOf("append")).toBeGreaterThan(unitOfWork.order.indexOf("save"));
  });

  it("paying twice writes one payment_confirmed hop, not two", async () => {
    const { command, repo } = setupMarkPaid(pendingBooking());
    const input: MarkBookingPaidInput = { bookingId: "bk-1", paymentRef: "mpesa-123" };

    await command.execute(input);
    await command.execute(input);

    expect(repo.appendedChanges).toHaveLength(1);
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
   * Written so that it cannot pass if somebody flattens the three clocks
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

  it("expiring an already-paid booking publishes nothing and releases nothing", async () => {
    const paid = pendingBooking().markPaid("mpesa-123", WHEN);
    const { command, repo, slotHold, outbox } = setupSweep(paid);
    const input: SweepBookingInput = { bookingId: "bk-1" };

    await command.execute(input);

    // `CONFIRMED` is not one of the three statuses standing on a clock, so
    // neither `expire` nor `cancel` governs it — see `SweepBookingCommand`'s
    // doc comment. The command's whole job here is to do nothing further: no
    // save, no release, no event. Releasing this booking's hold would hand
    // away a slot its customer already paid for.
    expect(repo.saveCalls).toBe(0);
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
    const sweepCmd = new SweepBookingCommand(
      repoSweep,
      slotHold,
      uowSweep,
      outboxSweep,
      new FakeRaiser(),
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
    const sweepCmd = new SweepBookingCommand(
      repoSweep,
      slotHold,
      uowSweep,
      outboxSweep,
      new FakeRaiser(),
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

  // The design's three-row table: the two expiries are not cancellations and
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
    const paid = pendingBooking().markPaid("mpesa-123", WHEN);
    const { command, raiser } = setupSweep(withId(paid, "bk-1"));

    await command.execute({ bookingId: "bk-1" });

    expect(raiser.raised).toEqual([]);
  });
});
