import { describe, expect, it } from "bun:test";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { Booking } from "../domain/aggregates/booking.aggregate";
import {
  BookingNotFoundError,
  BookingTransitionError,
  CustomerPhoneMissingError,
  NotBookingCustomerError,
  NotProviderMemberError,
} from "../domain/exceptions";
import {
  SubmitBookingCommand,
  type SubmitBookingInput,
} from "../app/use-cases/submit-booking.command";
import {
  AcceptBookingCommand,
  type AcceptBookingInput,
} from "../app/use-cases/accept-booking.command";
import {
  DeclineBookingCommand,
  type DeclineBookingInput,
} from "../app/use-cases/decline-booking.command";
import type {
  BookingChangeRecord,
  BookingRepositoryPort,
} from "../app/ports/outbound/booking.repository.port";
import type { CustomerPhoneReaderPort } from "../app/ports/outbound/customer-phone.reader.port";
import type { DelayedJobsPort } from "../app/ports/outbound/delayed-jobs.port";
import type { PlatformSettingsReaderPort } from "../app/ports/outbound/platform-settings.reader.port";
import type { ProviderMemberReaderPort } from "../app/ports/outbound/provider-member-reader.port";
import type { SlotHoldPort, SlotWindow } from "../app/ports/outbound/slot-hold.port";
import type { OutboxPort } from "../../../shared/app/ports/outbox.port";
import type { BookingStatus } from "../../../shared/infrastructure/database/booking/enums";
import { FakeRaiser, TrackingUnitOfWork, withId } from "./support/fakes";

/**
 * The slot every fixture in this file books, far enough out that
 * `cappedToSlotStart` never bites on it.
 *
 * Relative to `now`, not a pinned calendar date, and that is load-bearing
 * since the cap landed: `submit` and `accept` now hold their deadlines to
 * `startsAt`, so a fixed date would silently start capping every deadline
 * assertion in this file on the day it went past — a green suite that turns
 * red on a calendar boundary rather than on a change. The cap's own tests
 * below pin their starts deliberately, close in.
 */
const WHEN = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

/**
 * A freshly-created, never-persisted booking's `Booking.create` input.
 *
 * **No address and no description**, which is what a real `DRAFT` now looks
 * like: `booking.create` sheds both, because checkout's step 1 has picked a
 * time and nothing else. That absence is load-bearing rather than tidiness —
 * a fixture arriving at `submit` with an address already on it could not fail
 * if the command stopped passing `input.address` through, since the assertion
 * would read back the fixture's own value.
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
    // A checkout hold, so relative to `now` rather than to the slot — and,
    // like `WHEN`, not a pinned date.
    expiresAt: new Date(Date.now() + 30 * 60_000),
    ...over,
  };
}

/** A stored, `DRAFT` booking with an id, as `findById` would return it. */
function draftBooking(id = "bk-1", over: Partial<Parameters<typeof Booking.create>[0]> = {}): Booking {
  return withId(Booking.create(bookingInput(over)), id);
}

/**
 * A stored, `AWAITING_PROVIDER` booking with an id. The `respondBy` handed
 * to `submit` here is a placeholder — none of this file's accept/decline
 * tests read it back — not the value `SubmitBookingCommand` would actually
 * compute from `provider_response_minutes`.
 */
function awaitingBooking(
  id = "bk-1",
  over: Partial<Parameters<typeof Booking.create>[0]> = {},
): Booking {
  const draft = Booking.create(bookingInput(over));
  // Held to the slot's start the way `SubmitBookingCommand` would hold it, so
  // a fixture built with a start minutes away is not one no command could
  // ever have produced.
  const respondBy = Math.min(Date.now() + 120 * 60_000, draft.startsAt.getTime());
  // `submit` takes the address explicitly, and the draft has none of its own
  // to borrow — that is the point of the flow. A literal here, so an
  // AWAITING_PROVIDER fixture carries a complete address the way every real
  // one does.
  const submitted = draft.submit(
    new Date(),
    new Date(respondBy),
    {
      label: "Casa",
      line: "Av. Julius Nyerere 812",
      city: "Maputo",
    },
    // No description: this file's accept/decline tests never read one back,
    // and `submit` requires the argument so that omitting it can never mean
    // "leave whatever was there".
    null,
  );
  return withId(submitted, id);
}

/**
 * A transactional fake tracking every `save` call — the same shape
 * `booking-lifecycle.command.test.ts`'s `FakeRepo` uses, plus
 * `currentStatusOverride` and `appendChangeCalls`, which that file's version
 * does not need.
 *
 * `currentStatusOverride`, when set, is what `save`'s compare-and-swap
 * checks `expectedStatus` against, in place of `current.status` — a
 * one-field stand-in for a second racer's already-committed write,
 * simpler than `booking-lifecycle.command.test.ts`'s `RacingFakeRepo`
 * because none of this file's tests need two full commands racing each
 * other, only one command discovering the row already moved.
 *
 * **`raceWinner` is the same idea carried one step further, and it exists
 * because `currentStatusOverride` is not enough for a command that reads the
 * row back.** The override moves only the status the CAS compares; every
 * later `findById` still hands out the pre-race booking. A command whose
 * losing branch re-reads the row would therefore be handed the draft it
 * started from, and an assertion on what it reported could not tell "read
 * back what the winner committed" from "reported its own stale value".
 * Setting `raceWinner` makes the concurrent writer's commit land for real:
 * the CAS compares against *its* status, and once the save has lost, the
 * repository hands out *its* row.
 */
class FakeRepo implements BookingRepositoryPort {
  public saveCalls = 0;
  public savedArg: Booking | null = null;
  public lastApplied: boolean | null = null;
  public appendChangeCalls: BookingChangeRecord[] = [];
  public currentStatusOverride: BookingStatus | null = null;
  public raceWinner: Booking | null = null;
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

  async save(booking: Booking, expectedStatus: Booking["status"]): Promise<boolean> {
    this.saveCalls += 1;
    this.savedArg = booking;
    this.unitOfWork?.order.push("save");
    const actualStatus = this.raceWinner?.status ?? this.currentStatusOverride ?? this.current?.status;
    const applied = actualStatus === expectedStatus;
    this.lastApplied = applied;
    if (!applied) {
      // The concurrent writer's commit really did land, so everything reading
      // this repository from here on sees its row rather than the one the
      // command under test started from — including that command's own
      // re-read. Applied outside `unitOfWork.stage`, because this write is
      // not the command's to roll back.
      if (this.raceWinner) {
        this.current = this.raceWinner;
      }
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
  // requires them, the same way `booking-lifecycle.command.test.ts`'s
  // `FakeRepo` implements `insert` and `findDueForSweep` without
  // exercising either.
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
 * Fixed values rather than a settings row, matching every other fake in
 * this codebase's booking tests. Every method is tracked separately —
 * `SubmitBookingCommand` reads only `findProviderResponseMinutes`,
 * `AcceptBookingCommand` reads only `findPaymentWindowMinutes` — so a test
 * asserting one call count can tell "read once, as expected" apart from "an
 * unrelated window was read instead".
 */
class FakePlatformSettingsReader implements PlatformSettingsReaderPort {
  public checkoutHoldCalls = 0;
  public providerResponseCalls = 0;
  public paymentWindowCalls = 0;

  constructor(
    private readonly minutes: {
      checkoutHold?: number;
      providerResponse?: number;
      paymentWindow?: number;
    } = {},
  ) {}

  async findCheckoutHoldMinutes(): Promise<number> {
    this.checkoutHoldCalls += 1;
    return this.minutes.checkoutHold ?? 30;
  }

  async findProviderResponseMinutes(): Promise<number> {
    this.providerResponseCalls += 1;
    return this.minutes.providerResponse ?? 120;
  }

  async findPaymentWindowMinutes(): Promise<number> {
    this.paymentWindowCalls += 1;
    return this.minutes.paymentWindow ?? 15;
  }
}

/**
 * "prov-1" has two members, `user-right-1` and `user-right-2` — this
 * booking's own provider. "prov-2" has one member of its own,
 * `user-wrong`, which exists solely so a test can pass a `requesterUserId`
 * that is a real member of a real provider, just not this booking's — the
 * shape the brief calls out: a fixture holding only the right person
 * cannot fail if the authorisation check is dropped, because there is
 * nobody wrong to let through.
 */
class FakeProviderMemberReader implements ProviderMemberReaderPort {
  public queries: { providerId: string; userId: string }[] = [];
  private readonly members = new Map<string, Set<string>>([
    ["prov-1", new Set(["user-right-1", "user-right-2"])],
    ["prov-2", new Set(["user-wrong"])],
  ]);

  async isMember(providerId: string, userId: string): Promise<boolean> {
    this.queries.push({ providerId, userId });
    return this.members.get(providerId)?.has(userId) ?? false;
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

/** Records every `scheduleBookingDeadline` call, matching `create-booking.command.test.ts`'s own fake. */
class FakeDelayedJobs implements DelayedJobsPort {
  public scheduled: { bookingId: string; at: Date }[] = [];

  async scheduleBookingDeadline(bookingId: string, at: Date): Promise<void> {
    this.scheduled.push({ bookingId, at });
  }
}

/**
 * Records what each command actually hands the outbox, plus whether that
 * call landed inside `unitOfWork.atomicExecute`, after the save had already
 * run — the same shape `booking-lifecycle.command.test.ts`'s
 * `CapturingOutbox` uses.
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

/**
 * `profile.phone_number` for whichever customer is asked about, keyed by
 * user id so a test can hold a number for one customer and none for
 * another. Undefined and null both mean "no number on file" — the shape
 * `DrizzleCustomerPhoneReader` returns for a profile that has none.
 *
 * **`insideTransactionAtCall` is recorded here, at the moment of the call,
 * because nothing observable afterwards can answer the question.**
 * `TrackingUnitOfWork.atomicExecute` clears `insideTransaction` in its
 * `finally` and resets `order` on entry, so after a refusal both read exactly
 * as they would if the block had never run — asserting on either from the
 * test body passes just as happily against a command that opened a
 * transaction and threw inside it. Only a witness standing where the read
 * happens can tell the two apart.
 */
class FakePhoneReader implements CustomerPhoneReaderPort {
  public queries: string[] = [];
  public insideTransactionAtCall: boolean[] = [];

  constructor(
    private readonly unitOfWork: TrackingUnitOfWork,
    private readonly numbers: Record<string, string | null> = {},
  ) {}

  async findPhoneNumber(userId: string): Promise<string | null> {
    this.queries.push(userId);
    this.insideTransactionAtCall.push(this.unitOfWork.insideTransaction);
    return this.numbers[userId] ?? null;
  }
}

function setupSubmit(
  initial: Booking | null,
  opts: {
    providerResponseMinutes?: number;
    phones?: Record<string, string | null>;
    raiser?: FakeRaiser;
  } = {},
) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeRepo(initial, unitOfWork);
  const platformSettingsReader = new FakePlatformSettingsReader({
    providerResponse: opts.providerResponseMinutes,
  });
  // Every customer this file submits for has a number unless a test says
  // otherwise, so the happy paths are not silently testing the refusal.
  const phones = new FakePhoneReader(
    unitOfWork,
    opts.phones ?? { "cust-1": "258841234567", "cust-2": "258851234567" },
  );
  const delayedJobs = new FakeDelayedJobs();
  const raiser = opts.raiser ?? new FakeRaiser();
  const command = new SubmitBookingCommand(
    repo,
    phones,
    platformSettingsReader,
    delayedJobs,
    unitOfWork,
    outbox,
    raiser,
  );
  return { command, repo, phones, platformSettingsReader, delayedJobs, unitOfWork, outbox, raiser };
}

function setupAccept(
  initial: Booking | null,
  opts: { paymentWindowMinutes?: number; raiser?: FakeRaiser } = {},
) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeRepo(initial, unitOfWork);
  const providerMemberReader = new FakeProviderMemberReader();
  const platformSettingsReader = new FakePlatformSettingsReader({
    paymentWindow: opts.paymentWindowMinutes,
  });
  const delayedJobs = new FakeDelayedJobs();
  const raiser = opts.raiser ?? new FakeRaiser();
  const command = new AcceptBookingCommand(
    repo,
    providerMemberReader,
    platformSettingsReader,
    delayedJobs,
    unitOfWork,
    outbox,
    raiser,
  );
  return {
    command,
    repo,
    providerMemberReader,
    platformSettingsReader,
    delayedJobs,
    unitOfWork,
    outbox,
    raiser,
  };
}

function setupDecline(initial: Booking | null, opts: { raiser?: FakeRaiser } = {}) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeRepo(initial, unitOfWork);
  const providerMemberReader = new FakeProviderMemberReader();
  const slotHold = new FakeSlotHold(unitOfWork);
  const raiser = opts.raiser ?? new FakeRaiser();
  const command = new DeclineBookingCommand(
    repo,
    providerMemberReader,
    slotHold,
    unitOfWork,
    outbox,
    raiser,
  );
  return { command, repo, providerMemberReader, slotHold, unitOfWork, outbox, raiser };
}

describe("SubmitBookingCommand", () => {
  // What the customer gave on checkout's step 2. The draft this command
  // loads carries no address of its own, so a booking that comes back
  // carrying these values can only have got them from here.
  const ADDRESS = { label: "Casa", line: "Av. Julius Nyerere 812", city: "Maputo" };

  it("submits a draft booking for its own customer, computing respondBy from provider_response_minutes, and publishes BookingSubmitted exactly once", async () => {
    // 45, not 90: `bookingInput()`'s own `durationMinutes` is 90, and using
    // the same number for `providerResponseMinutes` would make `endsAt`
    // (derived from the duration) and `respondBy` (derived from this
    // window) land on the same instant by coincidence — indistinguishable
    // from a bug that derived one from the other.
    const { command, repo, outbox, delayedJobs, platformSettingsReader, unitOfWork } = setupSubmit(
      draftBooking(),
      { providerResponseMinutes: 45 },
    );
    const input: SubmitBookingInput = {
      bookingId: "bk-1",
      customerId: "cust-1",
      address: ADDRESS,
      description: "Sem energia na cozinha",
    };

    const before = Date.now();
    const result = await command.execute(input);
    const after = Date.now();

    expect(repo.saveCalls).toBe(1);
    expect(repo.savedArg?.status).toBe("AWAITING_PROVIDER");

    // The address and the description reach the booking on this hop, and
    // only on this hop: `draftBooking()` carries neither, so these values
    // can only have come off `input`.
    expect(repo.savedArg?.addressLabel).toBe("Casa");
    expect(repo.savedArg?.addressLine).toBe("Av. Julius Nyerere 812");
    expect(repo.savedArg?.addressCity).toBe("Maputo");
    expect(repo.savedArg?.description).toBe("Sem energia na cozinha");

    // What the mutation answers with. `respondBy` is the deadline this call
    // actually stamped, not a second reading of the clock.
    expect(result).toEqual({
      bookingId: "bk-1",
      respondBy: (repo.savedArg?.expiresAt as Date).toISOString(),
    });
    // The exact-pair proof for Ruling N's check: the customer who submitted
    // is exactly the customer this booking already belonged to, not merely
    // "some customer succeeded." Mirrors AcceptBookingCommand's and
    // DeclineBookingCommand's own `providerMemberReader.queries` assertion
    // on their happy paths.
    expect(repo.savedArg?.customerId).toBe(input.customerId);

    // `expiresAt` is what `submit` actually wrote — the checkout hold is
    // gone, replaced by a deadline 45 minutes out, not the payment window's
    // default (15), the checkout hold's (30), or the duration (90).
    const respondBy = repo.savedArg?.expiresAt as Date;
    expect(respondBy.getTime()).toBeGreaterThanOrEqual(before + 45 * 60_000);
    expect(respondBy.getTime()).toBeLessThanOrEqual(after + 45 * 60_000);
    expect(platformSettingsReader.providerResponseCalls).toBe(1);

    // Scheduled after the transaction resolves, against the deadline this
    // command just stamped — see DelayedJobsPort's own doc comment for why
    // a command that stamps a deadline and stays silent about it is a bug
    // waiting for a real job queue to expose.
    expect(delayedJobs.scheduled).toEqual([{ bookingId: "bk-1", at: respondBy }]);

    // The hop's own history row. `booking` has no column saying who sent this
    // request or when, and `BookingSubmitted` is a message rather than a
    // record — a consumer that never runs leaves this table as the only
    // answer. Exhaustive rather than a partial match, matching
    // `DeclineBookingCommand`'s own assertion.
    expect(repo.appendChangeCalls).toEqual([
      {
        bookingId: "bk-1",
        changedByUserId: "cust-1",
        reason: "submitted_by_customer",
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      },
    ]);
    // Save, then append, then publish — `DeclineBookingCommand`'s ordering,
    // minus the release it has and this hop does not: `AWAITING_PROVIDER`
    // still holds the slot.
    expect(unitOfWork.order).toEqual(["save", "appendChange"]);

    expect(outbox.published).toHaveLength(1);
    const batch = outbox.published[0]!;
    expect(batch.aggregateType).toBe("booking");
    expect(batch.insideTransaction).toBe(true);
    expect(batch.afterSave).toBe(true);
    expect(batch.events).toHaveLength(1);
    const event = batch.events[0]!;
    expect(event.eventName).toBe("booking.submitted");
    // Exhaustive, not `toMatchObject`: `BookingAccepted`'s and
    // `BookingDeclined`'s own happy-path assertions pin every field, and a
    // partial match here would not notice a field silently dropped.
    expect(event.payload).toEqual({
      bookingId: "bk-1",
      customerId: "cust-1",
      providerId: "prov-1",
      providerMemberId: "member-1",
      serviceId: "svc-1",
      startsAt: WHEN,
      endsAt: new Date(WHEN.getTime() + 90 * 60_000),
      priceMinor: 150000,
      currency: "MZN",
      respondBy,
    });
  });

  it("refuses a caller who is not this booking's customer, and writes nothing", async () => {
    const { command, repo, outbox, delayedJobs } = setupSubmit(draftBooking());
    // "cust-2" is a genuine, different customer id — not this booking's own
    // ("cust-1", from `bookingInput()`). A fixture where every input used
    // "cust-1" could not fail here if the check were dropped, because
    // there would be nobody foreign to refuse.
    const input: SubmitBookingInput = { bookingId: "bk-1", customerId: "cust-2", address: ADDRESS, description: null };

    await expect(command.execute(input)).rejects.toThrow(NotBookingCustomerError);

    // The assertion this test exists for: a command that wrote and then
    // threw would still pass a weaker "no booking came back" check.
    expect(repo.saveCalls).toBe(0);
    expect(repo.appendChangeCalls).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(delayedJobs.scheduled).toEqual([]);
  });

  it("reports the winning submit's own respondBy, and publishes, appends and schedules nothing", async () => {
    const stored = draftBooking();
    const { command, repo, outbox, delayedJobs } = setupSubmit(stored);

    // A twin submit — a double-tap, or a retry of a request whose response
    // never arrived — got there first and committed a real
    // `AWAITING_PROVIDER` row. Its deadline is deliberately not the draft's
    // own checkout hold (`bookingInput` puts that 30 minutes out): the two
    // have to be distinguishable, or "reports the winner's deadline" and
    // "reports the stale value on the row it read" are the same assertion.
    const winnersRespondBy = new Date(Date.now() + 120 * 60_000);
    repo.raceWinner = withId(stored.submit(new Date(), winnersRespondBy, ADDRESS, null), "bk-1");
    const input: SubmitBookingInput = { bookingId: "bk-1", customerId: "cust-1", address: ADDRESS, description: null };

    const result = await command.execute(input);

    expect(repo.saveCalls).toBe(1);
    expect(repo.lastApplied).toBe(false);
    // A history row for a transition that never landed would claim a hop
    // that did not happen.
    expect(repo.appendChangeCalls).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(delayedJobs.scheduled).toEqual([]);

    // The loser still has to answer with a deadline, and the honest one is
    // the winner's: that is what the provider is actually being held to.
    expect(result).toEqual({
      bookingId: "bk-1",
      respondBy: winnersRespondBy.toISOString(),
    });
    expect(result.respondBy).not.toBe((stored.expiresAt as Date).toISOString());
  });

  it("refuses when the draft was expired out from under it, rather than reporting a dead countdown", async () => {
    const stored = draftBooking();
    const { command, repo, outbox, delayedJobs } = setupSubmit(stored);

    // **The reachable race, and the reason the losing branch checks a status
    // rather than trusting a date.** The customer has step 3 open in one tab
    // and goes back to step 1 in another: `CreateBookingCommand`'s one-draft
    // rule expires this draft and releases its slot in the gap between this
    // command's `findById` and its own `UPDATE`. `SweepBookingCommand`
    // produces the identical row when the checkout hold runs out.
    //
    // `Booking.expire` moves the status and stamps `expiredAt` — it never
    // touches `expiresAt`. So the row still carries the checkout hold, now in
    // the past, and a re-read that trusted the date would answer this
    // customer with a success and a dead countdown, for a slot already
    // released and a provider who was never asked. The spec's failure table
    // wants the opposite: back to step 1 with the service kept.
    repo.raceWinner = withId(stored.expire(new Date()), "bk-1");
    const input: SubmitBookingInput = { bookingId: "bk-1", customerId: "cust-1", address: ADDRESS, description: null };

    await expect(command.execute(input)).rejects.toThrow(BookingTransitionError);

    // The same refusal the non-race path already gives when `findById` reads
    // a booking that is no longer a DRAFT — one outcome for one event,
    // whichever side of the settings round trip the concurrent write lands.
    expect(repo.saveCalls).toBe(1);
    expect(repo.lastApplied).toBe(false);
    expect(repo.appendChangeCalls).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(delayedJobs.scheduled).toEqual([]);
  });

  it("caps the provider's response window at the slot's own start when the slot begins before the window would close", async () => {
    // Thirty minutes out against a 120-minute window: the cap bites. Without
    // it, a provider could be given until 15:45 to answer for a service due
    // at 14:00 — see `cappedToSlotStart`.
    const startsAt = new Date(Date.now() + 30 * 60_000);
    const { command, repo, delayedJobs } = setupSubmit(draftBooking("bk-1", { startsAt }), {
      providerResponseMinutes: 120,
    });

    await command.execute({ bookingId: "bk-1", customerId: "cust-1", address: ADDRESS, description: null });

    // Equal to `startsAt` exactly, not merely "shorter than 120 minutes": an
    // implementation shortening the window by some other rule would still
    // pass the weaker assertion.
    expect(repo.savedArg?.expiresAt).toEqual(startsAt);
    // The scheduled deadline follows the capped value, not the uncapped one.
    expect(delayedJobs.scheduled).toEqual([{ bookingId: "bk-1", at: startsAt }]);
  });

  it("leaves the provider's response window alone when the slot starts after the window would close", async () => {
    // Four hours out against the same 120-minute window: the cap must not
    // bite. Without this pair, a cap that clamped every submission to its
    // own `startsAt` would look exactly as correct as one that clamps only
    // when it has to.
    const startsAt = new Date(Date.now() + 240 * 60_000);
    const { command, repo } = setupSubmit(draftBooking("bk-1", { startsAt }), {
      providerResponseMinutes: 120,
    });

    const before = Date.now();
    await command.execute({ bookingId: "bk-1", customerId: "cust-1", address: ADDRESS, description: null });
    const after = Date.now();

    const respondBy = repo.savedArg?.expiresAt as Date;
    expect(respondBy.getTime()).toBeGreaterThanOrEqual(before + 120 * 60_000);
    expect(respondBy.getTime()).toBeLessThanOrEqual(after + 120 * 60_000);
    expect(respondBy.getTime()).toBeLessThan(startsAt.getTime());
  });

  it("throws BookingNotFoundError when the booking does not exist, and publishes nothing", async () => {
    const { command, repo, outbox, delayedJobs } = setupSubmit(null);
    const input: SubmitBookingInput = { bookingId: "missing", customerId: "cust-1", address: ADDRESS, description: null };

    await expect(command.execute(input)).rejects.toThrow(BookingNotFoundError);

    expect(repo.saveCalls).toBe(0);
    expect(repo.appendChangeCalls).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(delayedJobs.scheduled).toEqual([]);
  });

  it("refuses a customer who has no phone number on file", async () => {
    // The mockup promises "Recebe um pedido de pagamento no 84 ••• 4021", and
    // a customer with no number is charged into the void, spends all three
    // attempts, and has the booking cancelled telling the provider they did
    // not pay. This refusal is what makes the step-3 field a rule rather than
    // a UI convention — anything calling the mutation directly meets it too.
    const { command, repo, outbox, delayedJobs } = setupSubmit(draftBooking(), {
      phones: { "cust-1": null },
    });
    const input: SubmitBookingInput = {
      bookingId: "bk-1",
      customerId: "cust-1",
      address: ADDRESS,
      description: null,
    };

    await expect(command.execute(input)).rejects.toThrow(CustomerPhoneMissingError);

    // A refusal writes nothing. Not merely "no booking came back" — a command
    // that writes and then throws passes that weaker assertion.
    expect(repo.saveCalls).toBe(0);
    expect(repo.appendChangeCalls).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(delayedJobs.scheduled).toEqual([]);
  });

  it("refuses a phone number that is present but blank", async () => {
    // `profile.phone_number` is `text`: a column that permits `""` is one
    // that will eventually hold one, and whitespace reaches M-Pesa exactly
    // as usefully as null does. Without this pair, a bare `== null` check
    // would look as correct as the one that is actually there.
    const { command, repo, outbox } = setupSubmit(draftBooking(), { phones: { "cust-1": "   " } });

    await expect(
      command.execute({
        bookingId: "bk-1",
        customerId: "cust-1",
        address: ADDRESS,
        description: null,
      }),
    ).rejects.toThrow(CustomerPhoneMissingError);

    expect(repo.saveCalls).toBe(0);
    expect(outbox.published).toEqual([]);
  });

  it("reads the phone before opening a transaction, and asks about the requesting customer", async () => {
    // The refusal needs no transaction, and taking one out only to throw it
    // away again is work nobody asked for.
    //
    // The witness is inside the fake, not in this body, and that is the whole
    // point of this test: `atomicExecute` clears `insideTransaction` in its
    // `finally` and resets `order` on entry, so asserting either from out
    // here passes just as readily against a command that opened a
    // transaction and threw inside it. `insideTransactionAtCall` is recorded
    // where the read actually happens — see `FakePhoneReader`.
    const { command, phones } = setupSubmit(draftBooking(), {
      phones: { "cust-1": null },
    });

    await expect(
      command.execute({
        bookingId: "bk-1",
        customerId: "cust-1",
        address: ADDRESS,
        description: null,
      }),
    ).rejects.toThrow(CustomerPhoneMissingError);

    // Asked about the caller, not about the booking's provider or anybody
    // else: a reader keyed on the wrong id would still refuse, and would
    // still pass every assertion above.
    expect(phones.queries).toEqual(["cust-1"]);
    expect(phones.insideTransactionAtCall).toEqual([false]);
  });

  it("submits when the customer has one", async () => {
    const { command, repo, phones } = setupSubmit(draftBooking(), {
      phones: { "cust-1": "258841234567" },
    });

    await command.execute({
      bookingId: "bk-1",
      customerId: "cust-1",
      address: ADDRESS,
      description: null,
    });

    expect(phones.queries).toEqual(["cust-1"]);
    // Read outside the transaction on the path that succeeds too, not only on
    // the one that refuses — the ordering is a property of the command, not
    // of the refusal.
    expect(phones.insideTransactionAtCall).toEqual([false]);
    expect(repo.savedArg?.status).toBe("AWAITING_PROVIDER");
    expect(repo.savedArg?.addressCity).toBe("Maputo");
  });
});

describe("AcceptBookingCommand", () => {
  it("accepts an awaiting-provider booking for a caller who belongs to its provider, computing payBy from payment_window_minutes, and publishes BookingAccepted exactly once", async () => {
    const {
      command,
      repo,
      outbox,
      delayedJobs,
      providerMemberReader,
      platformSettingsReader,
      unitOfWork,
    } = setupAccept(awaitingBooking(), { paymentWindowMinutes: 20 });
    const input: AcceptBookingInput = { bookingId: "bk-1", requesterUserId: "user-right-1" };

    const before = Date.now();
    await command.execute(input);
    const after = Date.now();

    expect(providerMemberReader.queries).toEqual([{ providerId: "prov-1", userId: "user-right-1" }]);

    expect(repo.saveCalls).toBe(1);
    expect(repo.savedArg?.status).toBe("PENDING_PAYMENT");
    // The reversal, proven: accepting must not touch paidAt or paymentRef.
    expect(repo.savedArg?.paidAt).toBeNull();
    expect(repo.savedArg?.paymentRef).toBeNull();

    const payBy = repo.savedArg?.expiresAt as Date;
    expect(payBy.getTime()).toBeGreaterThanOrEqual(before + 20 * 60_000);
    expect(payBy.getTime()).toBeLessThanOrEqual(after + 20 * 60_000);
    expect(platformSettingsReader.paymentWindowCalls).toBe(1);

    // Scheduled after the transaction resolves, against the deadline this
    // command just stamped.
    expect(delayedJobs.scheduled).toEqual([{ bookingId: "bk-1", at: payBy }]);

    // Which member committed the calendar. `booking.confirmedAt` says a
    // provider said yes and when; for an Organization with several members
    // this row is the only place that could ever say which of them — and the
    // decline this mirrors has been attributable since it was written.
    expect(repo.appendChangeCalls).toEqual([
      {
        bookingId: "bk-1",
        changedByUserId: "user-right-1",
        reason: "accepted_by_provider",
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      },
    ]);
    // Save, then append, then publish — `DeclineBookingCommand`'s ordering,
    // minus the release it has and this hop does not: `PENDING_PAYMENT`
    // still holds the slot.
    expect(unitOfWork.order).toEqual(["save", "appendChange"]);

    expect(outbox.published).toHaveLength(1);
    const batch = outbox.published[0]!;
    expect(batch.aggregateType).toBe("booking");
    expect(batch.insideTransaction).toBe(true);
    expect(batch.afterSave).toBe(true);
    expect(batch.events).toHaveLength(1);
    const event = batch.events[0]!;
    expect(event.eventName).toBe("booking.accepted");
    // The seat is never exposed: no providerMemberId, no startsAt/endsAt on
    // this event — see BookingAccepted's own doc comment.
    expect(event.payload).toEqual({
      bookingId: "bk-1",
      customerId: "cust-1",
      providerId: "prov-1",
      priceMinor: 150000,
      currency: "MZN",
    });
  });

  it("refuses a caller who belongs to a different provider, and writes nothing", async () => {
    const { command, repo, outbox, delayedJobs, providerMemberReader } = setupAccept(awaitingBooking());
    // `user-wrong` is a genuine member of prov-2 — a real person, just not
    // a member of this booking's provider (prov-1). A fixture holding only
    // `user-right-1`/`user-right-2` could not fail here if the membership
    // check were dropped, because there would be nobody wrong to let
    // through.
    const input: AcceptBookingInput = { bookingId: "bk-1", requesterUserId: "user-wrong" };

    await expect(command.execute(input)).rejects.toThrow(NotProviderMemberError);

    expect(providerMemberReader.queries).toEqual([{ providerId: "prov-1", userId: "user-wrong" }]);

    // The assertion this test exists for: a command that wrote and then
    // threw would still pass a weaker "no booking came back" check.
    expect(repo.saveCalls).toBe(0);
    expect(repo.appendChangeCalls).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(delayedJobs.scheduled).toEqual([]);
  });

  it("a losing compare-and-swap publishes nothing, appends nothing, schedules nothing, and throws nothing", async () => {
    const { command, repo, outbox, delayedJobs } = setupAccept(awaitingBooking());
    // Two members of the same provider hitting "Aceitar" at once: this
    // command's own write finds the row already moved by the other one.
    repo.currentStatusOverride = "PENDING_PAYMENT";
    const input: AcceptBookingInput = { bookingId: "bk-1", requesterUserId: "user-right-1" };

    await command.execute(input);

    expect(repo.saveCalls).toBe(1);
    expect(repo.lastApplied).toBe(false);
    // A history row naming a member who did not, in the end, commit this
    // calendar would be worse than no row at all.
    expect(repo.appendChangeCalls).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(delayedJobs.scheduled).toEqual([]);
  });

  it("caps the payment window at the slot's own start when the slot begins before the window would close", async () => {
    // Five minutes out against a 20-minute window: the cap bites. Without it
    // the charge sweep would push an M-Pesa prompt for work whose time had
    // already passed — see `cappedToSlotStart`.
    const startsAt = new Date(Date.now() + 5 * 60_000);
    const { command, repo, delayedJobs } = setupAccept(awaitingBooking("bk-1", { startsAt }), {
      paymentWindowMinutes: 20,
    });

    await command.execute({ bookingId: "bk-1", requesterUserId: "user-right-1" });

    // Equal to `startsAt` exactly, not merely "shorter than 20 minutes".
    expect(repo.savedArg?.expiresAt).toEqual(startsAt);
    expect(delayedJobs.scheduled).toEqual([{ bookingId: "bk-1", at: startsAt }]);
  });

  it("leaves the payment window alone when the slot starts after the window would close", async () => {
    // Ninety minutes out against the same 20-minute window: the cap must not
    // bite. Without this pair, a cap that clamped every acceptance to its own
    // `startsAt` would look exactly as correct as one that clamps only when
    // it has to.
    const startsAt = new Date(Date.now() + 90 * 60_000);
    const { command, repo } = setupAccept(awaitingBooking("bk-1", { startsAt }), {
      paymentWindowMinutes: 20,
    });

    const before = Date.now();
    await command.execute({ bookingId: "bk-1", requesterUserId: "user-right-1" });
    const after = Date.now();

    const payBy = repo.savedArg?.expiresAt as Date;
    expect(payBy.getTime()).toBeGreaterThanOrEqual(before + 20 * 60_000);
    expect(payBy.getTime()).toBeLessThanOrEqual(after + 20 * 60_000);
    expect(payBy.getTime()).toBeLessThan(startsAt.getTime());
  });

  it("throws BookingNotFoundError when the booking does not exist, and publishes nothing", async () => {
    const { command, repo, outbox, delayedJobs } = setupAccept(null);
    const input: AcceptBookingInput = { bookingId: "missing", requesterUserId: "user-right-1" };

    await expect(command.execute(input)).rejects.toThrow(BookingNotFoundError);

    expect(repo.saveCalls).toBe(0);
    expect(repo.appendChangeCalls).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(delayedJobs.scheduled).toEqual([]);
  });
});

describe("DeclineBookingCommand", () => {
  it("declines an awaiting-provider booking for a caller who belongs to its provider, releases the slot, appends the reason to booking_change, and publishes BookingDeclined exactly once — save, then appendChange, then release, then publish", async () => {
    const { command, repo, outbox, slotHold, providerMemberReader, unitOfWork } = setupDecline(
      awaitingBooking(),
    );
    const input: DeclineBookingInput = {
      bookingId: "bk-1",
      requesterUserId: "user-right-2",
      reason: "Fora da minha zona de cobertura",
    };

    await command.execute(input);

    expect(providerMemberReader.queries).toEqual([{ providerId: "prov-1", userId: "user-right-2" }]);

    expect(repo.saveCalls).toBe(1);
    expect(repo.savedArg?.status).toBe("DECLINED");

    // No column on `booking` for this — `booking_change` is where it lives.
    expect(repo.appendChangeCalls).toHaveLength(1);
    expect(repo.appendChangeCalls[0]).toEqual({
      bookingId: "bk-1",
      changedByUserId: "user-right-2",
      reason: "Fora da minha zona de cobertura",
      previousStartsAt: null,
      previousEndsAt: null,
      previousProviderMemberId: null,
      previousPriceMinor: null,
    });

    // DECLINED is not one of SLOT_HOLDING_STATUSES — the slot releases.
    expect(slotHold.released).toEqual(["bk-1"]);

    expect(unitOfWork.order).toEqual(["save", "appendChange", "release"]);

    expect(outbox.published).toHaveLength(1);
    const batch = outbox.published[0]!;
    expect(batch.aggregateType).toBe("booking");
    expect(batch.insideTransaction).toBe(true);
    expect(batch.afterSave).toBe(true);
    expect(batch.events).toHaveLength(1);
    const event = batch.events[0]!;
    expect(event.eventName).toBe("booking.declined");
    expect(event.payload).toEqual({
      bookingId: "bk-1",
      customerId: "cust-1",
      providerMemberId: "member-1",
      startsAt: WHEN,
      reason: "Fora da minha zona de cobertura",
    });
  });

  it("still appends a change with a machine token and publishes a null reason when the provider gives none, rather than leaving the NOT NULL booking_change.reason blank or writing prose into it", async () => {
    const { command, repo, outbox } = setupDecline(awaitingBooking());
    const input: DeclineBookingInput = { bookingId: "bk-1", requesterUserId: "user-right-1" };

    await command.execute(input);

    expect(repo.appendChangeCalls).toHaveLength(1);
    // A token a renderer can switch on and translate, not a sentence in
    // English — see DECLINED_WITHOUT_REASON's own doc comment.
    expect(repo.appendChangeCalls[0]?.reason).toBe("declined_without_reason");

    const event = outbox.published[0]!.events[0]!;
    expect((event.payload as { reason: string | null }).reason).toBeNull();
  });

  it("refuses a caller who belongs to a different provider, and writes nothing", async () => {
    const { command, repo, outbox, slotHold, providerMemberReader } = setupDecline(awaitingBooking());
    // Same shape as AcceptBookingCommand's equivalent test: `user-wrong` is
    // a real member of prov-2, not this booking's provider (prov-1).
    const input: DeclineBookingInput = {
      bookingId: "bk-1",
      requesterUserId: "user-wrong",
      reason: "Não interessa",
    };

    await expect(command.execute(input)).rejects.toThrow(NotProviderMemberError);

    expect(providerMemberReader.queries).toEqual([{ providerId: "prov-1", userId: "user-wrong" }]);

    expect(repo.saveCalls).toBe(0);
    expect(repo.appendChangeCalls).toEqual([]);
    expect(slotHold.released).toEqual([]);
    expect(outbox.published).toEqual([]);
  });

  it("a losing compare-and-swap publishes nothing, appends nothing, releases nothing, and throws nothing", async () => {
    const { command, repo, outbox, slotHold } = setupDecline(awaitingBooking());
    // The provider accepted a moment before this member's decline reached
    // the row.
    repo.currentStatusOverride = "PENDING_PAYMENT";
    const input: DeclineBookingInput = { bookingId: "bk-1", requesterUserId: "user-right-1" };

    await command.execute(input);

    expect(repo.saveCalls).toBe(1);
    expect(repo.lastApplied).toBe(false);
    expect(repo.appendChangeCalls).toEqual([]);
    expect(slotHold.released).toEqual([]);
    expect(outbox.published).toEqual([]);
  });

  it("throws BookingNotFoundError when the booking does not exist, and writes nothing", async () => {
    const { command, repo, outbox, slotHold } = setupDecline(null);
    const input: DeclineBookingInput = { bookingId: "missing", requesterUserId: "user-right-1" };

    await expect(command.execute(input)).rejects.toThrow(BookingNotFoundError);

    expect(repo.saveCalls).toBe(0);
    expect(slotHold.released).toEqual([]);
    expect(outbox.published).toEqual([]);
  });
});

/**
 * BR-P6, from the provider-bookings spec: a booking that changes hands has to
 * *tell* somebody, and telling them must never be able to fail the write that
 * already committed.
 *
 * Asserted here rather than folded into the happy paths above, for the same
 * reason `booking_change` got its own assertions: what each hop announces, to
 * whom, is a separate obligation from what it saves, and a test that read
 * both out of one arrangement would go red on either for the same reason.
 */
describe("notifications", () => {
  const ADDRESS = { label: "Casa", line: "Av. Julius Nyerere 812", city: "Maputo" };

  it("submit tells the provider's workspace a request arrived, naming the customer", async () => {
    const { command, raiser } = setupSubmit(draftBooking());

    await command.execute({
      bookingId: "bk-1",
      customerId: "cust-1",
      customerFirstName: "Ana",
      address: ADDRESS,
      description: null,
    });

    expect(raiser.raised).toEqual([
      expect.objectContaining({
        type: "PROVIDER_BOOKING_RECEIVED",
        audience: "provider",
        providerId: "prov-1",
        payload: expect.objectContaining({
          bookingId: "bk-1",
          serviceName: "Avaria eléctrica urgente",
          customerFirstName: "Ana",
        }),
      }),
    ]);
  });

  // The GraphQL session is where the name comes from, and a profile that has
  // none is ordinary — `NtizoGraphqlContext.firstName` is `string | null`.
  // The template renders "um cliente" for that; what matters here is that the
  // key is present and explicitly null rather than quietly absent.
  it("submit raises with a null first name when the session has none", async () => {
    const { command, raiser } = setupSubmit(draftBooking());

    await command.execute({
      bookingId: "bk-1",
      customerId: "cust-1",
      address: ADDRESS,
      description: null,
    });

    expect(raiser.raised[0]?.payload.customerFirstName).toBeNull();
  });

  it("a losing submit announces nothing — the request this call sent never landed", async () => {
    const { command, repo, raiser } = setupSubmit(draftBooking());
    // Somebody else moved the row between this call's read and its write.
    repo.raceWinner = awaitingBooking();

    await command.execute({
      bookingId: "bk-1",
      customerId: "cust-1",
      address: ADDRESS,
      description: null,
    });

    expect(repo.lastApplied).toBe(false);
    expect(raiser.raised).toEqual([]);
  });

  it("accept tells the customer the provider said yes, with the deadline they now have to pay by", async () => {
    const { command, repo, raiser } = setupAccept(awaitingBooking());

    await command.execute({ bookingId: "bk-1", requesterUserId: "user-right-1" });

    expect(raiser.raised).toHaveLength(1);
    expect(raiser.raised[0]).toMatchObject({
      type: "BOOKING_ACCEPTED",
      audience: "user",
      userId: "cust-1",
    });
    // The very deadline the write stamped, not a second reading of the clock.
    expect(raiser.raised[0]?.payload.payBy).toBe((repo.savedArg?.expiresAt as Date).toISOString());
  });

  it("decline tells the customer no, and carries the reason token", async () => {
    const { command, raiser } = setupDecline(awaitingBooking());

    await command.execute({
      bookingId: "bk-1",
      requesterUserId: "user-right-2",
      reason: "outside_area",
    });

    expect(raiser.raised).toHaveLength(1);
    expect(raiser.raised[0]).toMatchObject({
      type: "BOOKING_DECLINED",
      audience: "user",
      userId: "cust-1",
      payload: expect.objectContaining({ reason: "outside_area" }),
    });
  });

  it("a losing decline announces nothing", async () => {
    const { command, repo, raiser } = setupDecline(awaitingBooking());
    repo.currentStatusOverride = "PENDING_PAYMENT";

    await command.execute({ bookingId: "bk-1", requesterUserId: "user-right-2" });

    expect(repo.lastApplied).toBe(false);
    expect(raiser.raised).toEqual([]);
  });

  // The whole of BR-P6. The accept already committed by the time the raise
  // runs; a throw from the notification side must not travel back out of
  // `execute` and tell the provider their acceptance failed.
  it("a raiser that throws does not fail the accept", async () => {
    const broken = new FakeRaiser(new Error("smtp down"));
    const { command, repo } = setupAccept(awaitingBooking(), { raiser: broken });

    await expect(
      command.execute({ bookingId: "bk-1", requesterUserId: "user-right-1" }),
    ).resolves.toBeUndefined();

    // And the write it could not announce is still there.
    expect(repo.savedArg?.status).toBe("PENDING_PAYMENT");
  });
});
