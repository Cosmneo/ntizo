import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { Booking } from "../domain/aggregates/booking.aggregate";
import { BookingCancelled, BookingCompleted } from "../domain/events";
import { DisputeBookingCommand } from "../app/use-cases/dispute-booking.command";
import { ResolveBookingDisputeCommand } from "../app/use-cases/resolve-booking-dispute.command";
import type {
  BookingChangeRecord,
  BookingRepositoryPort,
} from "../app/ports/outbound/booking.repository.port";
import type { AdminUserReaderPort } from "../app/ports/outbound/admin-user-reader.port";
import type {
  OpenDisputeThreadInput,
  OpenDisputeThreadPort,
} from "../app/ports/outbound/open-dispute-thread.port";
import type { OutboxPort } from "../../../shared/app/ports/outbox.port";
import { BookingStatus } from "../../../shared/infrastructure/database/booking/enums";
import { FakeRaiser, TrackingUnitOfWork, withId } from "./support/fakes";

/** A day, in milliseconds. Fixtures only — nothing here derives an expectation from it. */
const DAY_MS = 86_400_000;

/**
 * **The clock is frozen for this whole file**, for the reason
 * `close-booking.command.test.ts` writes out at length: both commands here
 * stamp an instant onto the booking (`disputed_at`, then `cancelled_at` or
 * `completed_at`), and an assertion bracketed by `Date.now()` either side can
 * only prove the stamp is *near* the right instant. Frozen, it can be the
 * instant itself, written as a literal.
 *
 * Restored in `afterEach` — `setSystemTime` is process-wide.
 */
const NOW = new Date("2026-05-04T09:00:00.000Z");

/** A slot that started 25 hours ago: over, so `markDone` accepts it. */
const ENDED_YESTERDAY = new Date(NOW.getTime() - 25 * 3_600_000);

const BOOKING_ID = "bk-1";
/** The same booking, on a service whose name is far past the subject's limit. */
const LONG_NAME_ID = "bk-long";
const CUSTOMER_ID = "cust-1";
const PROVIDER_ID = "prov-1";
const MEMBER_ID = "member-1";
const ADMIN_ID = "admin-1";

/**
 * The name the dispute's thread is filed under. Not a constant of the
 * implementation — it is the booking's own `serviceName`, which this file's
 * fixture sets — and asserted literally so a command that filed a dispute
 * under something else (an empty string, the option's name, a hardcoded
 * word) is caught rather than waved through by `expect.any(String)`.
 */
const SERVICE_NAME = "Avaria eléctrica urgente";

/**
 * What `support_request.subject` will hold: `varchar(120)`, which
 * `SupportRequest.normaliseSubject` enforces by *throwing* above it rather
 * than truncating.
 *
 * Written out here rather than imported from the command under test — an
 * assertion that reads its expectation from the same constant the code slices
 * with proves only that `slice` was called with something. This is the number
 * the other bounded context actually refuses at, which is the fact the trim
 * exists to respect. Its counterpart there is `SUPPORT_SUBJECT_MAX`.
 */
const SUBJECT_MAX = 120;

/**
 * A service name of 200 characters — comfortably past `SUBJECT_MAX`, and not
 * an unreasonable one: `service.name` is an unbounded `text` column with no
 * length rule in the catalog aggregate either, so nothing between a provider's
 * keyboard and this booking's snapshot shortens it.
 */
const LONG_SERVICE_NAME = "Reparação".padEnd(200, " e manutenção de instalações eléctricas");

/**
 * A `CONFIRMED` booking, built the way a real one gets there rather than
 * restored with the status typed in — the same argument
 * `close-booking.command.test.ts` makes for its own copy: `markDone`'s guard
 * reads `endsAt`, which only `create` derives.
 */
function confirmedBooking(serviceName: string = SERVICE_NAME): Booking {
  const startsAt = ENDED_YESTERDAY;
  const draft = Booking.create({
    customerId: CUSTOMER_ID,
    providerId: PROVIDER_ID,
    serviceId: "svc-1",
    serviceOptionId: "opt-1",
    providerMemberId: MEMBER_ID,
    startsAt,
    durationMinutes: 90,
    priceMinor: 150000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName,
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
 * A stored booking at whichever of the three statuses these two commands
 * read from. The `markDone` that builds the `MARKED_DONE` fixture is handed a
 * deliberately arbitrary two-day window rather than `FEEDBACK_WINDOW_DAYS`,
 * so a wrong constant cannot produce a fixture that agrees with it — nothing
 * in this file reads that deadline except the assertion that `dispute` erases
 * it, which needs it non-null and nothing more.
 *
 * Throws on any other status: a test asking for a fixture this file cannot
 * build should hear so rather than be handed the wrong booking and a green
 * assertion about it.
 */
function bookingAt(status: BookingStatus, id = BOOKING_ID): Booking {
  const confirmed = confirmedBooking(id === LONG_NAME_ID ? LONG_SERVICE_NAME : SERVICE_NAME);
  if (status === BookingStatus.Confirmed) {
    return withId(confirmed, id);
  }
  const markedDone = confirmed.markDone(NOW, new Date(NOW.getTime() + 2 * DAY_MS));
  if (status === BookingStatus.MarkedDone) {
    return withId(markedDone, id);
  }
  if (status === BookingStatus.Disputed) {
    return withId(markedDone.dispute(NOW), id);
  }
  throw new Error(`dispute-booking.command.test.ts has no fixture for ${status}`);
}

/**
 * The same transactional repository fake `close-booking.command.test.ts`
 * uses, and for the same reasons — one booking read by id, written back under
 * a compare-and-swap, plus the change rows.
 *
 * `status` is both what `findById` hands out and what the compare-and-swap
 * compares against; `saveReturns = false` is the other, different lever, and
 * the one this file needs most: it lets the transition happen and makes only
 * the *write* lose, which is the race that leaves a dispute's thread standing
 * over a booking that never moved.
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
    if (id === LONG_NAME_ID) {
      // Always at the status a dispute reads from: the only thing this
      // fixture varies is the length of the name the subject is cut from.
      return bookingAt(BookingStatus.MarkedDone, LONG_NAME_ID);
    }
    return id === BOOKING_ID ? bookingAt(this.status) : null;
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

  // Neither command calls these; the port still requires them.
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
 * The communication context's side of a dispute, recorded rather than
 * performed.
 *
 * `insideTransactionAtCall` is the field this fake exists for: the thread is
 * another bounded context's write, and the whole reason the brief puts it
 * *before* the transaction is that it must not sit inside one this context
 * opened. Nothing observable afterwards can tell a thread opened inside the
 * transaction from one opened before it — the same argument `FakeRaiser`
 * makes for its own copy of this field — so it has to be recorded here, at
 * the moment of the call.
 *
 * **It refuses an over-long subject, and that refusal is not decoration.**
 * The real implementation of this port is the communication context's
 * `OpenSupportRequestCommand`, whose very first act is
 * `SupportRequest.normaliseSubject` — which *throws* above 120 characters
 * rather than truncating. A fake that quietly accepted any string would let
 * this file's assertions pass against a command that hands the other context
 * a subject it will not take, which is a dispute that fails outright while
 * the customer's three-day clock keeps running. Modelling the refusal here is
 * what makes the trim in `DisputeBookingCommand` load-bearing in this suite
 * rather than only in production.
 */
class FakeDisputeThreads implements OpenDisputeThreadPort {
  public readonly opened: OpenDisputeThreadInput[] = [];
  public readonly insideTransactionAtCall: boolean[] = [];

  constructor(
    private readonly unitOfWork: TrackingUnitOfWork,
    private readonly failWith: Error | null = null,
  ) {}

  async execute(input: OpenDisputeThreadInput): Promise<{ threadId: string }> {
    this.insideTransactionAtCall.push(this.unitOfWork.insideTransaction);
    if (this.failWith) throw this.failWith;
    if (input.subject.trim().length === 0 || input.subject.length > SUBJECT_MAX) {
      throw new Error(`subject must be 1..${SUBJECT_MAX} characters — got ${input.subject.length}`);
    }
    this.opened.push(input);
    return { threadId: `th-${this.opened.length}` };
  }
}

/**
 * Who administers the platform. Two of them, not one: the dispute fans a
 * notification out per administrator, and a fixture holding a single id
 * cannot tell a loop from a single `raise` — nor can it prove the second
 * administrator still hears when the first one's raise throws.
 */
class FakeAdminUsers implements AdminUserReaderPort {
  public ids = [ADMIN_ID, "admin-2"];
  public failWith: Error | null = null;
  public calls = 0;

  async findAdminUserIds(): Promise<string[]> {
    this.calls += 1;
    if (this.failWith) throw this.failWith;
    return this.ids;
  }
}

/** Records what a command hands the outbox, and where in the transaction it did so. */
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
 * Takes the errors rather than ready-made fakes, because both the raiser and
 * the thread port have to be built *after* the unit of work they watch —
 * each records whether it was called from inside the transaction, and can
 * only do that holding the same `TrackingUnitOfWork` the command was given.
 */
function setupDispute(options: { raiseFails?: Error; threadFails?: Error } = {}) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeRepo(BookingStatus.MarkedDone, unitOfWork);
  const threads = new FakeDisputeThreads(unitOfWork, options.threadFails ?? null);
  const admins = new FakeAdminUsers();
  const raiser = new FakeRaiser(options.raiseFails ?? null, unitOfWork);
  return {
    unitOfWork,
    // Built but not handed to the command: `DisputeBookingCommand` takes no
    // outbox at all (see its own doc comment), and this is what lets a test
    // say so rather than assert an empty array that could never fill.
    outbox,
    repo,
    threads,
    admins,
    raiser,
    cmd: new DisputeBookingCommand(repo, threads, admins, unitOfWork, raiser),
  };
}

function setupResolve(
  status: BookingStatus = BookingStatus.Disputed,
  failWith: Error | null = null,
) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeRepo(status, unitOfWork);
  const raiser = new FakeRaiser(failWith, unitOfWork);
  return {
    unitOfWork,
    outbox,
    repo,
    raiser,
    cmd: new ResolveBookingDisputeCommand(repo, unitOfWork, outbox, raiser),
  };
}

beforeEach(() => {
  setSystemTime(NOW);
});

afterEach(() => {
  setSystemTime();
});

describe("DisputeBookingCommand", () => {
  it("refuses anybody but the booking's own customer", async () => {
    const { cmd, repo, threads, raiser } = setupDispute();

    await expect(
      cmd.execute({
        bookingId: BOOKING_ID,
        requesterUserId: "someone-else",
        message: "m",
        attachments: [],
      }),
    ).rejects.toMatchObject({ code: "NOT_BOOKING_CUSTOMER" });

    // Refused before anything happened anywhere — including in the other
    // bounded context, which is the half a `repo.saved` assertion cannot see.
    expect(threads.opened).toEqual([]);
    expect(repo.saved).toBeNull();
    expect(repo.changes).toEqual([]);
    expect(raiser.raised).toEqual([]);
  });

  it("refuses a booking that names no row at all", async () => {
    const { cmd, threads } = setupDispute();

    await expect(
      cmd.execute({
        bookingId: "bk-missing",
        requesterUserId: CUSTOMER_ID,
        message: "m",
        attachments: [],
      }),
    ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" });

    expect(threads.opened).toEqual([]);
  });

  it("refuses a booking that is not waiting out its window", async () => {
    const { cmd, repo, threads } = setupDispute();
    repo.status = BookingStatus.Confirmed;

    await expect(
      cmd.execute({
        bookingId: BOOKING_ID,
        requesterUserId: CUSTOMER_ID,
        message: "m",
        attachments: [],
      }),
    ).rejects.toMatchObject({ code: "BOOKING_INVALID_TRANSITION" });

    // The point of checking the transition *before* the port call: a booking
    // that cannot be disputed must not leave a support thread behind it.
    expect(threads.opened).toEqual([]);
    expect(repo.saved).toBeNull();
  });

  it("opens the thread, moves the booking, and stops the clock", async () => {
    const { cmd, repo, threads } = setupDispute();

    const out = await cmd.execute({
      bookingId: BOOKING_ID,
      requesterUserId: CUSTOMER_ID,
      message: "não ficou bem",
      attachments: [{ storageKey: "attachment/cust-1/a.jpg", fileName: "a.jpg", contentType: "image/jpeg", sizeBytes: 12 }],
    });

    expect(out.threadId).toBe("th-1");
    expect(repo.saved?.status).toBe("DISPUTED");
    // The clock stops here and nowhere else — `dispute` is the one transition
    // that nulls `expires_at`, and it is what makes the sweep stop selecting
    // this booking at all.
    expect(repo.saved?.expiresAt).toBeNull();
    expect(repo.saved?.disputedAt).toEqual(NOW);
    expect(threads.opened.at(-1)).toEqual({
      bookingId: BOOKING_ID,
      requesterUserId: CUSTOMER_ID,
      // The booking's own service name, filed as the subject — the whole
      // input, not `objectContaining`, so a field wired to the wrong value
      // cannot hide behind the fields that are right.
      subject: SERVICE_NAME,
      message: "não ficou bem",
      attachments: [
        { storageKey: "attachment/cust-1/a.jpg", fileName: "a.jpg", contentType: "image/jpeg", sizeBytes: 12 },
      ],
    });
    expect(repo.changes.at(-1)).toMatchObject({
      reason: "disputed_by_customer",
      changedByUserId: CUSTOMER_ID,
    });
  });

  /**
   * The trim, which is the difference between a dispute and no dispute at all
   * for any service whose name runs long.
   *
   * `service.name` is an unbounded `text` column and the catalog aggregate
   * puts no length rule on it either, so a 200-character name is a thing a
   * provider can simply have. `support_request.subject` is `varchar(120)` and
   * `SupportRequest.normaliseSubject` *throws* above it rather than
   * truncating — so an untrimmed subject does not produce a long row, it
   * produces a dispute that fails at the port call, with an error from a
   * bounded context the customer never asked about, while the three-day
   * window keeps running and the sweep completes the very booking they were
   * trying to contest.
   *
   * Asserted on the resulting length and content, not merely on "it did not
   * throw": a command that trimmed to the wrong number, or trimmed the wrong
   * end, would satisfy "no throw" and still file the dispute under a subject
   * that names the wrong job.
   */
  it("cuts a long service name down to what the thread's subject will hold", async () => {
    const { cmd, repo, threads } = setupDispute();

    // The fixture has to be past the limit for any of this to mean anything.
    expect(LONG_SERVICE_NAME.length).toBeGreaterThan(SUBJECT_MAX);

    const out = await cmd.execute({
      bookingId: LONG_NAME_ID,
      requesterUserId: CUSTOMER_ID,
      message: "não ficou bem",
      attachments: [],
    });

    expect(out.threadId).toBe("th-1");
    expect(threads.opened.at(-1)?.subject).toHaveLength(SUBJECT_MAX);
    // The first 120 characters, not the last — the start of a service's name
    // is what identifies it.
    expect(threads.opened.at(-1)?.subject).toBe(LONG_SERVICE_NAME.slice(0, SUBJECT_MAX));
    // And the dispute itself landed: the trim is not buying a passing port
    // call at the cost of the hop it exists to enable.
    expect(repo.saved?.status).toBe("DISPUTED");
  });

  // A name that already fits is filed unchanged — the other half of the trim,
  // and what stops `slice` being "cut everything to some length that happens
  // to pass".
  it("leaves a service name that already fits exactly as it is", async () => {
    const { cmd, threads } = setupDispute();

    await cmd.execute({
      bookingId: BOOKING_ID,
      requesterUserId: CUSTOMER_ID,
      message: "m",
      attachments: [],
    });

    expect(threads.opened.at(-1)?.subject).toBe(SERVICE_NAME);
    expect(SERVICE_NAME.length).toBeLessThan(SUBJECT_MAX);
  });

  // The thread is another bounded context's write. Inside this context's
  // transaction it would be rolled back by a failure that has nothing to do
  // with it — or, against a real database, would not be rolled back at all
  // and would leave the two contexts disagreeing about whether it exists.
  it("opens the thread before the transaction, not inside it", async () => {
    const { cmd, threads } = setupDispute();

    await cmd.execute({
      bookingId: BOOKING_ID,
      requesterUserId: CUSTOMER_ID,
      message: "m",
      attachments: [],
    });

    expect(threads.insideTransactionAtCall).toEqual([false]);
  });

  it("tells the provider and every administrator", async () => {
    const { cmd, raiser, admins } = setupDispute();

    await cmd.execute({
      bookingId: BOOKING_ID,
      requesterUserId: CUSTOMER_ID,
      message: "m",
      attachments: [],
    });

    expect(raiser.raised.filter((r) => r.type === "BOOKING_DISPUTED")).toHaveLength(
      1 + admins.ids.length,
    );
    // And each to the right party, with the thread id they need to read it —
    // a count alone would pass just as happily against three notifications
    // sent to the same person.
    expect(raiser.raised).toEqual([
      expect.objectContaining({
        type: "BOOKING_DISPUTED",
        audience: "provider",
        providerId: PROVIDER_ID,
        payload: expect.objectContaining({ bookingId: BOOKING_ID, threadId: "th-1" }),
      }),
      expect.objectContaining({
        type: "BOOKING_DISPUTED",
        audience: "user",
        userId: ADMIN_ID,
        payload: expect.objectContaining({ providerId: PROVIDER_ID, threadId: "th-1" }),
      }),
      expect.objectContaining({
        type: "BOOKING_DISPUTED",
        audience: "user",
        userId: "admin-2",
      }),
    ]);
  });

  // BR-P6: nothing is announced that a rollback could still take back.
  it("announces only once the transaction has resolved", async () => {
    const { cmd, raiser } = setupDispute();

    await cmd.execute({
      bookingId: BOOKING_ID,
      requesterUserId: CUSTOMER_ID,
      message: "m",
      attachments: [],
    });

    expect(raiser.insideTransactionAtCall).toEqual([false, false, false]);
  });

  it("does not fail the dispute when a raise throws, and still tells the rest", async () => {
    const { cmd, repo, raiser } = setupDispute({ raiseFails: new Error("smtp down") });

    const out = await cmd.execute({
      bookingId: BOOKING_ID,
      requesterUserId: CUSTOMER_ID,
      message: "m",
      attachments: [],
    });

    expect(out.threadId).toBe("th-1");
    expect(repo.saved?.status).toBe("DISPUTED");
    // Every one of the three was attempted even though every one threw —
    // `raised` is empty, so only `attempts` can say so.
    expect(raiser.attempts).toBe(3);
  });

  it("keeps telling the other administrators when one raise throws", async () => {
    const unitOfWork = new TrackingUnitOfWork();
    const repo = new FakeRepo(BookingStatus.MarkedDone, unitOfWork);
    const threads = new FakeDisputeThreads(unitOfWork);
    const admins = new FakeAdminUsers();
    // Only the first administrator's raise fails. A raiser that can fail all
    // or none cannot tell one `try` around the whole loop from one per
    // recipient — the difference is whether `admin-2` hears anything.
    const raiser = new FakeRaiser(
      new Error("smtp down"),
      unitOfWork,
      (input) => input.audience === "user" && input.userId === ADMIN_ID,
    );
    const cmd = new DisputeBookingCommand(repo, threads, admins, unitOfWork, raiser);

    await cmd.execute({
      bookingId: BOOKING_ID,
      requesterUserId: CUSTOMER_ID,
      message: "m",
      attachments: [],
    });

    expect(raiser.attempts).toBe(3);
    expect(raiser.raised.map((r) => (r.audience === "user" ? r.userId : r.providerId))).toEqual([
      PROVIDER_ID,
      "admin-2",
    ]);
  });

  // The list is read after the booking has already committed, so the only
  // thing an exception can cost is the announcement.
  it("still disputes when the administrator list cannot be read", async () => {
    const { cmd, repo, raiser, admins } = setupDispute();
    admins.failWith = new Error("db down");

    const out = await cmd.execute({
      bookingId: BOOKING_ID,
      requesterUserId: CUSTOMER_ID,
      message: "m",
      attachments: [],
    });

    expect(out.threadId).toBe("th-1");
    expect(repo.saved?.status).toBe("DISPUTED");
    // The provider is not an administrator and still hears.
    expect(raiser.raised).toHaveLength(1);
    expect(raiser.raised[0]).toMatchObject({ audience: "provider" });
  });

  // The thread is opened first, so a failure there is a dispute that never
  // happened — nothing has been written on this side to undo.
  it("writes nothing when the thread cannot be opened", async () => {
    const { cmd, repo, raiser } = setupDispute({ threadFails: new Error("storage down") });

    await expect(
      cmd.execute({
        bookingId: BOOKING_ID,
        requesterUserId: CUSTOMER_ID,
        message: "m",
        attachments: [],
      }),
    ).rejects.toThrow("storage down");

    expect(repo.saved).toBeNull();
    expect(repo.changes).toEqual([]);
    expect(raiser.raised).toEqual([]);
  });

  // Documentation of the design decision rather than coverage of it: the
  // command holds no outbox at all, so `published` is necessarily empty and
  // no change to the command could turn this red — handing it a sixth
  // constructor argument would be a compile error in `setupDispute`, not a
  // failing test. Kept because the decision is easy to reverse by accident
  // and hard to notice; counted as coverage of nothing. The same shape
  // `close-booking.command.test.ts` uses for `KeepBookingOpenCommand`'s
  // missing notification port.
  it("publishes nothing — there is no booking.disputed event to publish", async () => {
    const { cmd, outbox } = setupDispute();

    await cmd.execute({
      bookingId: BOOKING_ID,
      requesterUserId: CUSTOMER_ID,
      message: "m",
      attachments: [],
    });

    expect(outbox.published).toEqual([]);
  });

  it("writes and announces nothing when the compare-and-swap loses", async () => {
    const { cmd, repo, threads, raiser } = setupDispute();
    repo.saveReturns = false;

    const out = await cmd.execute({
      bookingId: BOOKING_ID,
      requesterUserId: CUSTOMER_ID,
      message: "m",
      attachments: [],
    });

    // The whole world untouched on this side — a change row would give the
    // booking a hop it never made, and a notification would tell a provider
    // about a dispute the row does not hold.
    expect(repo.saved).toBeNull();
    expect(repo.changes).toEqual([]);
    expect(raiser.raised).toEqual([]);
    expect(raiser.attempts).toBe(0);
    // The thread is the exception, and deliberately: it was opened before
    // the transaction and belongs to another context, so it stands as an
    // ordinary support request about the booking. The caller is told its id
    // rather than left believing nothing happened.
    expect(threads.opened).toHaveLength(1);
    expect(out.threadId).toBe("th-1");
  });
});

describe("ResolveBookingDisputeCommand", () => {
  it("keeps the completion when the dispute is rejected", async () => {
    const { cmd, repo } = setupResolve();

    await cmd.execute({ bookingId: BOOKING_ID, adminUserId: ADMIN_ID, upheld: false, note: null });

    expect(repo.saved?.status).toBe("COMPLETED");
    expect(repo.saved?.completedAt).toEqual(NOW);
    expect(repo.changes.at(-1)).toMatchObject({
      reason: "dispute_rejected",
      changedByUserId: ADMIN_ID,
    });
  });

  it("cancels with the dispute's own reason when it is upheld", async () => {
    const { cmd, repo } = setupResolve();

    await cmd.execute({ bookingId: BOOKING_ID, adminUserId: ADMIN_ID, upheld: true, note: null });

    expect(repo.saved?.status).toBe("CANCELLED");
    expect(repo.saved?.cancelledAt).toEqual(NOW);
    expect(repo.changes.at(-1)).toMatchObject({
      reason: "dispute_upheld",
      changedByUserId: ADMIN_ID,
    });
  });

  it("tells both sides the same thing", async () => {
    const { cmd, raiser } = setupResolve();

    await cmd.execute({ bookingId: BOOKING_ID, adminUserId: ADMIN_ID, upheld: true, note: null });

    const types = raiser.raised.map((r) => `${r.type}:${r.audience}`);
    expect(types).toContain("BOOKING_DISPUTE_RESOLVED:user");
    expect(types).toContain("BOOKING_DISPUTE_RESOLVED:provider");
  });

  // Which way it went, and the administrator's own words for why, reach both
  // parties — the row has nowhere to keep a note, so the announcement is the
  // only place it can honestly go.
  it("carries the outcome and the note to both sides", async () => {
    const { cmd, raiser } = setupResolve();

    await cmd.execute({
      bookingId: BOOKING_ID,
      adminUserId: ADMIN_ID,
      upheld: false,
      note: "As fotografias mostram o trabalho concluído.",
    });

    expect(raiser.raised).toEqual([
      expect.objectContaining({
        audience: "user",
        userId: CUSTOMER_ID,
        payload: expect.objectContaining({
          upheld: false,
          note: "As fotografias mostram o trabalho concluído.",
        }),
      }),
      expect.objectContaining({
        audience: "provider",
        providerId: PROVIDER_ID,
        payload: expect.objectContaining({
          upheld: false,
          note: "As fotografias mostram o trabalho concluído.",
        }),
      }),
    ]);
  });

  // The upheld outcome is `dispute_upheld`'s only producer: `BookingCancelled`
  // carries that reason so the wallet work knows what not to pay out, which
  // is what `CANCELLABLE_FROM`'s entry for it exists for.
  it("publishes BookingCancelled with dispute_upheld, inside the transaction after the write", async () => {
    const { cmd, outbox } = setupResolve();

    await cmd.execute({ bookingId: BOOKING_ID, adminUserId: ADMIN_ID, upheld: true, note: null });

    expect(outbox.published).toHaveLength(1);
    expect(outbox.published[0]?.aggregateType).toBe("booking");
    expect(outbox.published[0]?.insideTransaction).toBe(true);
    expect(outbox.published[0]?.afterSave).toBe(true);
    const event = outbox.published[0]?.events[0];
    expect(event).toBeInstanceOf(BookingCancelled);
    expect(event?.payload).toEqual({
      bookingId: BOOKING_ID,
      customerId: CUSTOMER_ID,
      providerId: PROVIDER_ID,
      providerMemberId: MEMBER_ID,
      startsAt: ENDED_YESTERDAY,
      reason: "dispute_upheld",
    });
  });

  // The other outcome is a completion like any other: the work stands and the
  // payout is owed, which is exactly what `booking.completed` reports.
  it("publishes BookingCompleted when the dispute is rejected", async () => {
    const { cmd, outbox } = setupResolve();

    await cmd.execute({ bookingId: BOOKING_ID, adminUserId: ADMIN_ID, upheld: false, note: null });

    expect(outbox.published).toHaveLength(1);
    const event = outbox.published[0]?.events[0];
    expect(event).toBeInstanceOf(BookingCompleted);
    expect(event?.payload).toEqual({
      bookingId: BOOKING_ID,
      customerId: CUSTOMER_ID,
      providerId: PROVIDER_ID,
      priceMinor: 150000,
      commissionMinor: 15000,
      currency: "MZN",
    });
  });

  /**
   * The transition this command must refuse and `cancel` would not.
   *
   * `Booking.cancel(at, "dispute_upheld")` is a legal call — `CANCELLABLE_FROM`
   * names `DISPUTED` for that reason — and from any *other* status it hands
   * the instance back in silence rather than refusing, because its caller is
   * a sweep reading a deadline. An administrator pressing "dar razão ao
   * cliente" on a stale screen is not a sweep: they must be told their
   * decision was not recorded. This test is what separates the two doors, and
   * it goes red the moment this command starts delegating to `cancel`.
   */
  it("refuses a booking that is not disputed, rather than shrugging at it", async () => {
    const { cmd, repo, raiser, outbox } = setupResolve(BookingStatus.MarkedDone);

    await expect(
      cmd.execute({ bookingId: BOOKING_ID, adminUserId: ADMIN_ID, upheld: true, note: null }),
    ).rejects.toMatchObject({ code: "BOOKING_INVALID_TRANSITION" });

    expect(repo.saved).toBeNull();
    expect(repo.changes).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(raiser.raised).toEqual([]);
  });

  it("refuses a booking that names no row at all", async () => {
    const { cmd } = setupResolve();

    await expect(
      cmd.execute({ bookingId: "bk-missing", adminUserId: ADMIN_ID, upheld: true, note: null }),
    ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" });
  });

  it("announces only once the transaction has resolved", async () => {
    const { cmd, raiser } = setupResolve();

    await cmd.execute({ bookingId: BOOKING_ID, adminUserId: ADMIN_ID, upheld: true, note: null });

    expect(raiser.insideTransactionAtCall).toEqual([false, false]);
  });

  it("does not fail the decision when the raiser throws", async () => {
    const { cmd, repo } = setupResolve(BookingStatus.Disputed, new Error("smtp down"));

    const moved = await cmd.execute({
      bookingId: BOOKING_ID,
      adminUserId: ADMIN_ID,
      upheld: true,
      note: null,
    });

    expect(moved?.status).toBe("CANCELLED");
    expect(repo.saved?.status).toBe("CANCELLED");
  });

  it("writes and announces nothing when the compare-and-swap loses", async () => {
    const { cmd, repo, raiser, outbox } = setupResolve();
    repo.saveReturns = false;

    await expect(
      cmd.execute({ bookingId: BOOKING_ID, adminUserId: ADMIN_ID, upheld: true, note: null }),
    ).resolves.toBeNull();

    expect(repo.saved).toBeNull();
    expect(repo.changes).toEqual([]);
    expect(outbox.published).toEqual([]);
    expect(raiser.raised).toEqual([]);
    expect(raiser.attempts).toBe(0);
  });
});
