import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { Booking } from "../domain/aggregates/booking.aggregate";
import { BookingCompleted, BookingKeptOpen, BookingMarkedDone } from "../domain/events";
import {
  ASK_AGAIN_AFTER_DAYS,
  FEEDBACK_WINDOW_DAYS,
  MarkBookingDoneCommand,
} from "../app/use-cases/mark-booking-done.command";
import { KeepBookingOpenCommand } from "../app/use-cases/keep-booking-open.command";
import { CompleteBookingCommand } from "../app/use-cases/complete-booking.command";
import type {
  BookingChangeRecord,
  BookingRepositoryPort,
} from "../app/ports/outbound/booking.repository.port";
import type { ProviderMemberReaderPort } from "../app/ports/outbound/provider-member-reader.port";
import type { OutboxPort } from "../../../shared/app/ports/outbox.port";
import { BookingStatus } from "../../../shared/infrastructure/database/booking/enums";
import { FakeRaiser, TrackingUnitOfWork, withId } from "./support/fakes";

/**
 * A day, in milliseconds. Used only to build fixtures — never to compute an
 * expected deadline, which is the whole point of `FEEDBACK_BY` and
 * `ASK_AGAIN_AT` below.
 */
const DAY_MS = 86_400_000;

/**
 * **The clock is frozen for this whole file, and that is load-bearing.**
 *
 * Every command here stamps a deadline computed from `new Date()` — three
 * days for the customer's window, seven for the platform's next question —
 * and the promise each makes is an exact number of days, not "about" that
 * many. Bracketing the call with `Date.now()` either side, the way
 * `submit-accept-decline-booking.command.test.ts` does, proves the deadline
 * lands *within* a millisecond or two of the right one; it cannot prove the
 * constant is 3 rather than 2.9999. Freezing the clock lets these assert the
 * window exactly, which is what the design actually promises the customer.
 *
 * It is also what makes "the appointment has not ended" a fixed fact rather
 * than one relative to whenever the suite happens to run: `ENDED_YESTERDAY`
 * and `ENDS_TOMORROW` below are both defined against this instant, so the
 * `markDone` guard is tested against a slot that really is on the other side
 * of it.
 *
 * Restored in `afterEach` — `setSystemTime` is process-wide, and a file that
 * left the clock frozen would hand the next file a world where nothing moves.
 */
const NOW = new Date("2026-05-04T09:00:00.000Z");

/**
 * The two deadlines this file exists to pin: `NOW` plus three days, and `NOW`
 * plus seven, written out as literal instants rather than computed.
 *
 * **They are typed out on purpose, and must stay typed out.** An assertion
 * spelled `FEEDBACK_WINDOW_DAYS * 24 * 3_600_000` re-derives the expected
 * value from the very constant the implementation multiplies, so it proves
 * the arithmetic and nothing else — set `FEEDBACK_WINDOW_DAYS` to 4 and it
 * stays green, which is exactly what an earlier version of this file did.
 * The number of days is the promise the customer's notification makes and the
 * value the brief names; only a literal can fail for it. Changing either
 * constant now turns a test red and the failure names both instants, so the
 * reader is told which number moved rather than left to work it out.
 *
 * Do not replace these with a helper, a second constant, or arithmetic over
 * `NOW` — every one of those re-opens the hole.
 */
const FEEDBACK_BY = new Date("2026-05-07T09:00:00.000Z");
const ASK_AGAIN_AT = new Date("2026-05-11T09:00:00.000Z");

/** A slot that started 25 hours ago: over, and over by more than its own duration. */
const ENDED_YESTERDAY = new Date(NOW.getTime() - 25 * 3_600_000);

/** A slot that has not happened yet — what `Booking.markDone` refuses. */
const ENDS_TOMORROW = new Date(NOW.getTime() + 24 * 3_600_000);

const BOOKING_ID = "bk-1";
const FUTURE_ID = "bk-2";
const CUSTOMER_ID = "cust-1";
const PROVIDER_ID = "prov-1";

/** A member of `prov-1` — the booking's own provider, so authorised to close it. */
const OWNER_ID = "user-right-1";

/**
 * A `CONFIRMED` booking, built the way a real one gets there: created,
 * submitted, accepted, paid. Not `Booking.restore` with the status typed in,
 * because a fixture that skips the transitions is a fixture no command could
 * have produced — `confirmedAt`, `paidAt` and `paymentRef` would all be
 * whatever the test felt like, and `markDone`'s own guard reads `endsAt`,
 * which `create` derives.
 */
function confirmedBooking(startsAt: Date): Booking {
  const draft = Booking.create({
    customerId: CUSTOMER_ID,
    providerId: PROVIDER_ID,
    serviceId: "svc-1",
    serviceOptionId: "opt-1",
    providerMemberId: "member-1",
    startsAt,
    durationMinutes: 90,
    priceMinor: 150000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName: "Avaria eléctrica urgente",
    providerName: "Hélder Cossa",
    providerSlug: "helder-cossa-electricidade",
    optionName: "Diagnóstico e reparação",
    description: null,
    expiresAt: new Date(startsAt.getTime() - 3 * 3_600_000),
  });
  const submitted = draft.submit(
    new Date(startsAt.getTime() - 3 * 3_600_000),
    new Date(startsAt.getTime() - 2 * 3_600_000),
    { label: "Casa", line: "Av. Julius Nyerere 812", city: "Maputo" },
    null,
  );
  const accepted = submitted.accept(
    new Date(startsAt.getTime() - 2 * 3_600_000),
    new Date(startsAt.getTime() - 3_600_000),
  );
  return accepted.markPaid("mpesa-abc", new Date(startsAt.getTime() - 90 * 60_000));
}

/**
 * A stored booking with an id, at whichever of the two statuses these three
 * commands read from.
 *
 * The `markDone` that produces the `MARKED_DONE` fixture is handed a
 * deliberately arbitrary `feedbackBy` — two days, not three. Reusing
 * `FEEDBACK_WINDOW_DAYS` here would let a wrong constant produce a fixture
 * that agrees with it, and `CompleteBookingCommand`'s tests read nothing off
 * that field anyway.
 *
 * Throws rather than defaulting on any other status: a test asking for a
 * fixture this file has no way to build should hear so, not be handed a
 * `CONFIRMED` booking and a green assertion about the wrong thing.
 */
function bookingAt(status: BookingStatus, id: string, startsAt: Date): Booking {
  const confirmed = confirmedBooking(startsAt);
  if (status === BookingStatus.Confirmed) {
    return withId(confirmed, id);
  }
  if (status === BookingStatus.MarkedDone) {
    return withId(confirmed.markDone(NOW, new Date(NOW.getTime() + 2 * DAY_MS)), id);
  }
  throw new Error(`close-booking.command.test.ts has no fixture for ${status}`);
}

/**
 * A transactional fake in the shape these three commands actually use: one
 * booking, read by id, written back under a compare-and-swap, plus the change
 * rows the hops append.
 *
 * `status` is what `findById` hands out *and* what the compare-and-swap
 * compares against — one field rather than the two
 * `submit-accept-decline-booking.command.test.ts` needs, because none of
 * these commands re-reads the row after losing. Setting it is how a test says
 * "the booking is not where this command expects it".
 *
 * `saveReturns` is the other half, and it is not the same thing. `status`
 * makes the *aggregate* refuse; `saveReturns = false` lets the transition
 * happen and makes only the *write* lose — the race where another writer
 * committed between this command's read and its own `UPDATE`. That is the
 * one this file needs to prove nothing gets announced on, and no status
 * change can simulate it.
 */
class FakeRepo implements BookingRepositoryPort {
  public saved: Booking | null = null;
  public changes: BookingChangeRecord[] = [];
  public saveReturns = true;
  public status: BookingStatus;

  constructor(
    status: BookingStatus,
    private readonly unitOfWork?: TrackingUnitOfWork,
  ) {
    this.status = status;
  }

  async findById(id: string): Promise<Booking | null> {
    if (id === FUTURE_ID) {
      return bookingAt(BookingStatus.Confirmed, FUTURE_ID, ENDS_TOMORROW);
    }
    return id === BOOKING_ID ? bookingAt(this.status, BOOKING_ID, ENDED_YESTERDAY) : null;
  }

  async save(booking: Booking, expectedStatus: Booking["status"]): Promise<boolean> {
    this.unitOfWork?.order.push("save");
    if (!this.saveReturns || expectedStatus !== this.status) {
      return false;
    }
    const commit = () => {
      this.saved = booking;
      this.status = booking.status;
    };
    if (this.unitOfWork) {
      this.unitOfWork.stage(commit);
    } else {
      commit();
    }
    return true;
  }

  async appendChange(change: BookingChangeRecord): Promise<void> {
    this.unitOfWork?.order.push("appendChange");
    this.changes.push(change);
  }

  // None of these three commands call these — `BookingRepositoryPort` still
  // requires them, the same way every other command test's fake answers the
  // whole interface without exercising it.
  async insert(booking: Booking): Promise<Booking> {
    return booking;
  }
  async findOpenDraftForCustomer(): Promise<Booking | null> {
    return null;
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
 * The same two-provider fake `submit-accept-decline-booking.command.test.ts`
 * uses, and for the same reason: `user-wrong` is a real member of a real
 * provider that is not this booking's, so a fixture holding only the right
 * person cannot pass an authorisation check that was dropped.
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

/**
 * Records what each command hands the outbox, and whether that call landed
 * inside the transaction after the save had already run — the same shape
 * `submit-accept-decline-booking.command.test.ts`'s own capturing outbox uses.
 */
class CapturingOutbox implements OutboxPort {
  public published: {
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
 * Takes the error the raiser should throw rather than a ready-made raiser,
 * because the raiser now has to be built *after* the unit of work it watches:
 * `FakeRaiser.insideTransactionAtCall` is what proves a raise happened after
 * the transaction resolved, and it can only record that if it holds the same
 * `TrackingUnitOfWork` the command was given.
 */
function setup(status: BookingStatus, failWith: Error | null = null) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeRepo(status, unitOfWork);
  const members = new FakeProviderMemberReader();
  const raiser = new FakeRaiser(failWith, unitOfWork);
  return { unitOfWork, outbox, repo, members, raiser };
}

function setupMarkDone(failWith?: Error) {
  const parts = setup(BookingStatus.Confirmed, failWith ?? null);
  return {
    ...parts,
    cmd: new MarkBookingDoneCommand(
      parts.repo,
      parts.members,
      parts.unitOfWork,
      parts.outbox,
      parts.raiser,
    ),
  };
}

function setupKeepOpen() {
  const parts = setup(BookingStatus.Confirmed);
  return {
    ...parts,
    // Four arguments, not five: this command announces nothing, so it takes
    // no notification port at all — see its own doc comment. `parts.raiser`
    // is still here so a test can prove it was never handed one to use.
    keepOpen: new KeepBookingOpenCommand(
      parts.repo,
      parts.members,
      parts.unitOfWork,
      parts.outbox,
    ),
  };
}

function setupComplete(failWith?: Error) {
  const parts = setup(BookingStatus.MarkedDone, failWith ?? null);
  return {
    ...parts,
    complete: new CompleteBookingCommand(
      parts.repo,
      parts.unitOfWork,
      parts.outbox,
      parts.raiser,
    ),
  };
}

beforeEach(() => {
  setSystemTime(NOW);
});

afterEach(() => {
  setSystemTime();
});

// The two numbers themselves, pinned separately from the behaviour they
// produce. The deadline assertions below already fail if either moves, but
// they fail on an instant; these say which constant that instant came from,
// and they are what Task 5's sweep and anything else importing these values
// are entitled to rely on.
describe("the two windows", () => {
  it("gives the customer three days and the provider seven", () => {
    expect(FEEDBACK_WINDOW_DAYS).toBe(3);
    expect(ASK_AGAIN_AFTER_DAYS).toBe(7);
  });
});

describe("MarkBookingDoneCommand", () => {
  it("refuses somebody who is not in the workspace", async () => {
    const { cmd, repo, raiser } = setupMarkDone();

    await expect(
      cmd.execute({ bookingId: BOOKING_ID, requesterUserId: "stranger" }),
    ).rejects.toMatchObject({
      code: "NOT_PROVIDER_MEMBER",
    });

    // Refused before anything was written, which is the point of the check.
    expect(repo.saved).toBeNull();
    expect(repo.changes).toEqual([]);
    expect(raiser.raised).toEqual([]);
  });

  it("refuses a member of some other provider, not only a stranger to every one", async () => {
    const { cmd } = setupMarkDone();

    await expect(
      cmd.execute({ bookingId: BOOKING_ID, requesterUserId: "user-wrong" }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });
  });

  it("moves the booking, records the hop, and tells the customer their window is open", async () => {
    const { cmd, repo, raiser, members } = setupMarkDone();

    await cmd.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });

    expect(members.queries).toEqual([{ providerId: PROVIDER_ID, userId: OWNER_ID }]);
    expect(repo.saved?.status).toBe("MARKED_DONE");
    expect(repo.changes.at(-1)).toMatchObject({
      reason: "marked_done_by_provider",
      changedByUserId: OWNER_ID,
    });
    expect(raiser.raised.at(-1)).toMatchObject({
      type: "BOOKING_MARKED_DONE",
      audience: "user",
      userId: CUSTOMER_ID,
      payload: expect.objectContaining({ feedbackBy: expect.any(String) }),
    });
  });

  it("gives the customer three days", async () => {
    const { cmd, repo } = setupMarkDone();

    await cmd.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });

    // The literal instant, not `FEEDBACK_WINDOW_DAYS * 24 * 3_600_000` — see
    // `FEEDBACK_BY`'s own comment for why re-deriving it proves nothing.
    expect(repo.saved!.expiresAt).toEqual(FEEDBACK_BY);
    // And the arithmetic behind it, so a wrong multiplier is named separately
    // from a wrong number of days.
    expect(repo.saved!.expiresAt!.getTime() - NOW.getTime()).toBe(3 * 24 * 3_600_000);
  });

  it("announces the very deadline it wrote, not a second reading of the clock", async () => {
    const { cmd, repo, raiser } = setupMarkDone();

    await cmd.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });

    expect(raiser.raised[0]?.payload.feedbackBy).toBe(repo.saved!.expiresAt!.toISOString());
  });

  it("refuses a booking whose appointment has not ended", async () => {
    const { cmd, repo, raiser } = setupMarkDone();

    await expect(
      cmd.execute({ bookingId: FUTURE_ID, requesterUserId: OWNER_ID }),
    ).rejects.toMatchObject({
      code: "BOOKING_NOT_ENDED",
    });

    expect(repo.saved).toBeNull();
    expect(raiser.raised).toEqual([]);
  });

  it("publishes BookingMarkedDone inside the transaction, after the write it describes", async () => {
    const { cmd, outbox } = setupMarkDone();

    await cmd.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });

    expect(outbox.published).toHaveLength(1);
    expect(outbox.published[0]?.aggregateType).toBe("booking");
    expect(outbox.published[0]?.insideTransaction).toBe(true);
    expect(outbox.published[0]?.afterSave).toBe(true);
    const event = outbox.published[0]?.events[0];
    expect(event).toBeInstanceOf(BookingMarkedDone);
    // The whole payload, not only the class. `toBeInstanceOf` cannot see a
    // field wired to the wrong value, and the deadline this event carries is
    // the one a consumer would tell the customer about.
    expect(event?.payload).toEqual({
      bookingId: BOOKING_ID,
      customerId: CUSTOMER_ID,
      providerId: PROVIDER_ID,
      feedbackBy: FEEDBACK_BY,
    });
  });

  // BR-P6's other half, and the half no assertion on `raised` can see: the
  // transaction has to have resolved before anything is announced, or a
  // rollback takes back a fact the customer has already been told. Both arms
  // asserted at once — the platform's is the only path that raises twice.
  it("announces only once the transaction has resolved, on both arms", async () => {
    const provider = setupMarkDone();
    await provider.cmd.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });

    // A second, untouched fixture: the first call has already moved its own
    // repository to `MARKED_DONE`, and `markDone` refuses from there.
    const platform = setupMarkDone();
    await platform.cmd.execute({
      bookingId: BOOKING_ID,
      requesterUserId: null,
      reason: "marked_done_by_platform",
    });

    expect(provider.raiser.insideTransactionAtCall).toEqual([false]);
    expect(platform.raiser.insideTransactionAtCall).toEqual([false, false]);
  });

  it("raises nothing when the compare-and-swap loses", async () => {
    const { cmd, repo, raiser, outbox } = setupMarkDone();
    repo.saveReturns = false;

    await cmd.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });

    expect(raiser.raised).toEqual([]);
    // The whole of "nothing happened", not only the quiet part. A lost race
    // that still appended a change row would give this booking's history a
    // hop it never made, and one that still published would hand a consumer
    // an event describing a status the row does not hold — both silent, and
    // both invisible to an assertion that only reads the notifications.
    expect(repo.saved).toBeNull();
    expect(repo.changes).toEqual([]);
    expect(outbox.published).toEqual([]);
  });

  it("does not fail the write when the raiser throws", async () => {
    const { cmd, repo } = setupMarkDone(new Error("smtp down"));

    // The moved booking comes back, not `undefined`: a lost announcement is
    // not a lost hop, and the sweep reads this answer to decide whether it
    // may tell the administrators the platform closed a booking alone.
    const moved = await cmd.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });

    expect(moved?.status).toBe("MARKED_DONE");
    expect(repo.saved?.status).toBe("MARKED_DONE");
  });

  // The other half of that answer, and the half the sweep actually acts on.
  it("answers with nothing when the compare-and-swap loses", async () => {
    const { cmd, repo } = setupMarkDone();
    repo.saveReturns = false;

    await expect(
      cmd.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID }),
    ).resolves.toBeNull();
  });

  // The sweep's arm. It asked nobody, so there is nobody to check and nobody
  // to attribute the row to — and the provider, who never answered, is owed
  // the news that the platform closed their booking for them.
  it("the platform's own arm checks no membership and tells both sides", async () => {
    const { cmd, repo, raiser, members } = setupMarkDone();

    await cmd.execute({
      bookingId: BOOKING_ID,
      requesterUserId: null,
      reason: "marked_done_by_platform",
    });

    expect(members.queries).toEqual([]);
    expect(repo.saved?.status).toBe("MARKED_DONE");
    expect(repo.changes.at(-1)).toMatchObject({
      reason: "marked_done_by_platform",
      changedByUserId: null,
    });
    expect(raiser.raised).toEqual([
      expect.objectContaining({
        type: "BOOKING_MARKED_DONE",
        audience: "user",
        userId: CUSTOMER_ID,
        payload: expect.objectContaining({ markedBy: "marked_done_by_platform" }),
      }),
      expect.objectContaining({
        type: "PROVIDER_BOOKING_AUTO_CLOSED",
        audience: "provider",
        providerId: PROVIDER_ID,
      }),
    ]);
  });

  // A caller with no user and no reason is the platform, and the row says so.
  // The alternative — defaulting every reasonless call to the provider's
  // token — would write "the provider said the work was done" with nobody
  // having said it, and would skip the notification that arm owes them.
  it("a call with no requester and no reason is the platform's, not an unattributed provider's", async () => {
    const { cmd, repo, raiser } = setupMarkDone();

    await cmd.execute({ bookingId: BOOKING_ID, requesterUserId: null });

    expect(repo.changes.at(-1)).toMatchObject({
      reason: "marked_done_by_platform",
      changedByUserId: null,
    });
    expect(raiser.raised.at(-1)).toMatchObject({ type: "PROVIDER_BOOKING_AUTO_CLOSED" });
  });

  // An administrator is a real person with a user id, and they are not a
  // member of the provider they are closing for. The membership check is the
  // provider's own hop, not this one — the admin edge already authorised it.
  it("an administrator closes it without belonging to the provider, and tells only the customer", async () => {
    const { cmd, repo, raiser, members } = setupMarkDone();

    await cmd.execute({
      bookingId: BOOKING_ID,
      requesterUserId: "admin-1",
      reason: "marked_done_by_admin",
    });

    expect(members.queries).toEqual([]);
    expect(repo.changes.at(-1)).toMatchObject({
      reason: "marked_done_by_admin",
      changedByUserId: "admin-1",
    });
    expect(raiser.raised).toHaveLength(1);
    expect(raiser.raised[0]).toMatchObject({ type: "BOOKING_MARKED_DONE" });
  });
});

describe("KeepBookingOpenCommand", () => {
  it("pushes the question out seven days and records why", async () => {
    const { keepOpen, repo } = setupKeepOpen();

    await keepOpen.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });

    expect(repo.saved?.status).toBe("CONFIRMED");
    // The literal instant, for the reason `ASK_AGAIN_AT`'s own comment gives.
    expect(repo.saved!.expiresAt).toEqual(ASK_AGAIN_AT);
    expect(repo.saved!.expiresAt!.getTime() - NOW.getTime()).toBe(7 * 24 * 3_600_000);
    expect(repo.changes.at(-1)).toMatchObject({
      reason: "still_ongoing",
      changedByUserId: OWNER_ID,
    });
  });

  // Documentation of the design decision rather than coverage of it: this
  // command holds no raiser at all, so `raised` is necessarily empty and no
  // change to the command could turn this red — handing it a fifth
  // constructor argument would be a compile error in `setupKeepOpen`, not a
  // failing test. Kept because the decision is easy to reverse by accident
  // and hard to notice; counted as coverage of nothing.
  it("tells nobody — this is an answer to the platform, not news for the customer", async () => {
    const { keepOpen, raiser } = setupKeepOpen();

    await keepOpen.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });

    expect(raiser.raised).toEqual([]);
  });

  // The one event in this context that reports no status change: a job
  // running past the slot it was sold for is a fact, and it is invisible to
  // anybody who only ever sees `CONFIRMED`.
  it("publishes BookingKeptOpen inside the transaction, after the write it describes", async () => {
    const { keepOpen, outbox } = setupKeepOpen();

    await keepOpen.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });

    expect(outbox.published).toHaveLength(1);
    expect(outbox.published[0]?.aggregateType).toBe("booking");
    expect(outbox.published[0]?.insideTransaction).toBe(true);
    expect(outbox.published[0]?.afterSave).toBe(true);
    const event = outbox.published[0]?.events[0];
    expect(event).toBeInstanceOf(BookingKeptOpen);
    expect(event?.payload).toEqual({
      bookingId: BOOKING_ID,
      customerId: CUSTOMER_ID,
      providerId: PROVIDER_ID,
      askAgainAt: ASK_AGAIN_AT,
    });
  });

  it("refuses somebody who is not in the workspace", async () => {
    const { keepOpen, repo } = setupKeepOpen();

    await expect(
      keepOpen.execute({ bookingId: BOOKING_ID, requesterUserId: "user-wrong" }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });

    expect(repo.saved).toBeNull();
    expect(repo.changes).toEqual([]);
  });

  // The same refusal `MarkBookingDoneCommand` gives, and the reason it has to
  // be here too is the sweep rather than the wording. `markPaid` parks
  // `expires_at` on `endsAt`, so the sweep never meets a confirmed booking
  // before its appointment; this is the only other hop that writes that column
  // while `CONFIRMED`, so it is the only one that could move the clock in
  // *front* of `endsAt`. Seven days from `NOW` is well short of
  // `ENDS_TOMORROW` plus its 90 minutes, which is exactly the shape that
  // poisons the sweep: it would ask early, and a week later hand over to
  // `markDone`, which refuses — writing nothing, leaving the row due, and
  // being re-tried every minute until the appointment finally passes. The
  // page never offers the button that early; the mutation takes a booking id
  // and nothing else.
  it("refuses a booking whose appointment has not ended", async () => {
    const { keepOpen, repo, outbox } = setupKeepOpen();

    await expect(
      keepOpen.execute({ bookingId: FUTURE_ID, requesterUserId: OWNER_ID }),
    ).rejects.toMatchObject({ code: "BOOKING_NOT_ENDED" });

    expect(repo.saved).toBeNull();
    expect(repo.changes).toEqual([]);
    expect(outbox.published).toEqual([]);
  });

  // The hop where losing the race does the most damage, which is why this
  // guard needs a test of its own rather than being taken on the strength of
  // its two neighbours': the writer this call loses to is the sweep's own
  // seven-day arm, so a `keepOpen` that wrote anyway would put a
  // `MARKED_DONE` booking back to `CONFIRMED` and hand it a fresh week —
  // resurrecting a booking the platform had just closed.
  it("writes and publishes nothing when the compare-and-swap loses", async () => {
    const { keepOpen, repo, outbox } = setupKeepOpen();
    repo.saveReturns = false;

    await keepOpen.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });

    expect(repo.saved).toBeNull();
    expect(repo.changes).toEqual([]);
    expect(outbox.published).toEqual([]);
  });
});

describe("CompleteBookingCommand", () => {
  it("completes a marked-done booking and tells both sides", async () => {
    const { complete, repo, raiser } = setupComplete();

    await complete.execute({
      bookingId: BOOKING_ID,
      reason: "completed_by_timer",
      changedByUserId: null,
    });

    expect(repo.saved?.status).toBe("COMPLETED");
    expect(raiser.raised).toEqual([
      expect.objectContaining({
        type: "BOOKING_COMPLETED",
        audience: "user",
        userId: CUSTOMER_ID,
      }),
      expect.objectContaining({
        type: "BOOKING_COMPLETED",
        audience: "provider",
        providerId: PROVIDER_ID,
      }),
    ]);
  });

  it("records the hop with the reason its caller gave, and nobody to attribute it to", async () => {
    const { complete, repo } = setupComplete();

    await complete.execute({
      bookingId: BOOKING_ID,
      reason: "completed_by_review",
      changedByUserId: null,
    });

    expect(repo.changes).toEqual([
      {
        bookingId: BOOKING_ID,
        changedByUserId: null,
        reason: "completed_by_review",
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      },
    ]);
  });

  it("attributes an administrator's completion to them", async () => {
    const { complete, repo } = setupComplete();

    await complete.execute({
      bookingId: BOOKING_ID,
      reason: "completed_by_admin",
      changedByUserId: "admin-1",
    });

    expect(repo.changes.at(-1)).toMatchObject({
      reason: "completed_by_admin",
      changedByUserId: "admin-1",
    });
  });

  it("publishes BookingCompleted inside the transaction, after the write it describes", async () => {
    const { complete, outbox } = setupComplete();

    await complete.execute({
      bookingId: BOOKING_ID,
      reason: "completed_by_timer",
      changedByUserId: null,
    });

    expect(outbox.published).toHaveLength(1);
    expect(outbox.published[0]?.aggregateType).toBe("booking");
    expect(outbox.published[0]?.insideTransaction).toBe(true);
    expect(outbox.published[0]?.afterSave).toBe(true);
    const event = outbox.published[0]?.events[0];
    expect(event).toBeInstanceOf(BookingCompleted);
    // The money especially. This is the event a payout will be computed from,
    // and a zeroed price or a wrong currency here pays the wrong amount with
    // nothing downstream able to tell — `toBeInstanceOf` sees none of it.
    // The numbers are the fixture's own: 150000 minor at 1000 bps.
    expect(event?.payload).toEqual({
      bookingId: BOOKING_ID,
      customerId: CUSTOMER_ID,
      providerId: PROVIDER_ID,
      priceMinor: 150000,
      commissionMinor: 15000,
      currency: "MZN",
    });
  });

  it("refuses a booking that is not waiting out its window", async () => {
    const { complete, repo } = setupComplete();
    repo.status = "CONFIRMED";

    await expect(
      complete.execute({
        bookingId: BOOKING_ID,
        reason: "completed_by_timer",
        changedByUserId: null,
      }),
    ).rejects.toMatchObject({
      code: "BOOKING_INVALID_TRANSITION",
    });
  });

  // Both raises, after the transaction resolved — see the same assertion on
  // `MarkBookingDoneCommand` above for why `raised` alone cannot see this.
  it("announces both sides only once the transaction has resolved", async () => {
    const { complete, raiser } = setupComplete();

    await complete.execute({
      bookingId: BOOKING_ID,
      reason: "completed_by_timer",
      changedByUserId: null,
    });

    expect(raiser.insideTransactionAtCall).toEqual([false, false]);
  });

  it("writes, publishes and tells nothing when the compare-and-swap loses", async () => {
    const { complete, repo, raiser, outbox } = setupComplete();
    repo.saveReturns = false;

    const moved = await complete.execute({
      bookingId: BOOKING_ID,
      reason: "completed_by_timer",
      changedByUserId: null,
    });

    // The answer the sweep reads: nothing moved, so it reports no outcome.
    expect(moved).toBeNull();
    expect(repo.saved).toBeNull();
    expect(repo.changes).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(raiser.raised).toEqual([]);
  });

  it("does not fail the write when the raiser throws", async () => {
    const { complete, repo } = setupComplete(new Error("smtp down"));

    // As with `MarkBookingDoneCommand`: the moved booking comes back even
    // though nobody could be told, because a lost announcement is not a lost
    // hop and the sweep reads this answer.
    const moved = await complete.execute({
      bookingId: BOOKING_ID,
      reason: "completed_by_timer",
      changedByUserId: null,
    });

    expect(moved?.status).toBe("COMPLETED");
    expect(repo.saved?.status).toBe("COMPLETED");
  });
});
