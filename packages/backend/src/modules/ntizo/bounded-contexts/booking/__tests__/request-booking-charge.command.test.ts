/**
 * `RequestBookingChargeCommand` against fakes.
 *
 * What this file proves is the *order* of the refusals — ownership, status,
 * the attempt bound, the cooldown, the processor's readiness, the payment
 * window, then the phone number — that the phone number is checked before
 * anything claims an attempt, and that **two presses of "Pagar" in quick
 * succession produce exactly one prompt**. That order is the entire reason
 * this command exists rather than being a client-side shortcut into
 * `ChargeBookingCommand`; see the command's own doc comment. What it
 * deliberately does not prove: whether the deferred gateway call actually
 * survives the response — that is `deferred-booking-charge.test.ts`'s job,
 * against `infraStore` for real.
 *
 * Follows `cancel-booking.command.test.ts`'s fixture shape (the newest
 * neighbour in this suite) rather than the brief's own test snippet, which
 * called fixture helpers (`pendingPayment`, `awaitingProvider`, a `charge`
 * spy with `.execute` already a mock) that do not exist anywhere in this
 * codebase.
 */
import { describe, expect, it } from "bun:test";
import { Booking } from "../domain/aggregates/booking.aggregate";
import {
  BookingChargeAttemptsSpentError,
  BookingChargeUnavailableError,
  BookingNoCustomerPhoneError,
  BookingNotFoundError,
  BookingPaymentWindowClosedError,
  BookingTransitionError,
  NotBookingCustomerError,
} from "../domain/exceptions";
import {
  RequestBookingChargeCommand,
  type RequestBookingChargeInput,
} from "../app/use-cases/request-booking-charge.command";
import {
  BOOKING_CHARGE_ATTEMPT_LIMIT,
  BOOKING_CHARGE_RETRY_MINUTES,
} from "../app/use-cases/charge-accepted-bookings.internal.command";
import { ChargeBookingCommand, type ChargeBookingInput } from "../app/use-cases/charge-booking.command";
import { MarkBookingPaidCommand } from "../app/use-cases/mark-booking-paid.command";
import type {
  BookingChangeRecord,
  BookingChargeState,
  BookingRepositoryPort,
} from "../app/ports/outbound/booking.repository.port";
import type { CustomerPhoneReaderPort } from "../app/ports/outbound/customer-phone.reader.port";
import type {
  PaymentChargePort,
  PaymentChargeReadiness,
  PaymentChargeRequest,
  PaymentChargeResult,
} from "../app/ports/outbound/payment-charge.port";
import type { OutboxPort } from "../../../shared/app/ports/outbox.port";
import type { ChargeBookingInternalPort } from "../app/ports/inbound/charge-booking.internal.command.port";
import { FakeRaiser, TrackingUnitOfWork, withId } from "./support/fakes";

/** The instant every test's clock reads, injected through the command's own `now`. */
const NOW = new Date("2026-09-04T12:30:00.000Z");
const MS_PER_MINUTE = 60_000;
const ALICE = "cust-1";
const BOB = "cust-2";
const ADDRESS = { label: "Casa", line: "Av. Julius Nyerere 812", city: "Maputo" };

/**
 * A freshly-created, never-persisted booking's `Booking.create` input.
 * Mirrors `cancel-booking.command.test.ts`'s own `bookingInput` — this file
 * needs its own copy rather than an import, since nothing in that file's
 * module is exported for reuse.
 */
function bookingInput(over: Partial<Parameters<typeof Booking.create>[0]> = {}) {
  return {
    customerId: ALICE,
    providerId: "prov-1",
    serviceId: "svc-1",
    serviceOptionId: "opt-1",
    providerMemberId: "member-1",
    startsAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
    durationMinutes: 90,
    priceMinor: 150000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName: "Avaria eléctrica urgente",
    providerName: "Hélder Cossa",
    providerSlug: "helder-cossa-electricidade",
    optionName: "Diagnóstico e reparação",
    description: null,
    expiresAt: new Date(NOW.getTime() + 30 * 60_000),
    ...over,
  };
}

/**
 * A stored, `PENDING_PAYMENT` booking with an id — the only status
 * `RequestBookingChargeCommand` acts on. `payBy` defaults to comfortably past
 * `BOOKING_CHARGE_MIN_WINDOW_MS`, so a test only has to override it to reach
 * the window-closed branch.
 */
function pendingPaymentBooking(
  id = "bk-1",
  opts: { customerId?: string; payBy?: Date } = {},
): Booking {
  const draft = Booking.create(bookingInput({ customerId: opts.customerId ?? ALICE }));
  const respondBy = new Date(Math.min(NOW.getTime() + 120 * 60_000, draft.startsAt.getTime()));
  const submitted = draft.submit(NOW, respondBy, ADDRESS, null);
  const payBy = opts.payBy ?? new Date(NOW.getTime() + 15 * 60_000);
  const accepted = submitted.accept(NOW, payBy);
  return withId(accepted, id);
}

/** A stored, `AWAITING_PROVIDER` booking — a status this command refuses outright. */
function awaitingProviderBooking(id = "bk-1"): Booking {
  const draft = Booking.create(bookingInput());
  const respondBy = new Date(Math.min(NOW.getTime() + 120 * 60_000, draft.startsAt.getTime()));
  const submitted = draft.submit(NOW, respondBy, ADDRESS, null);
  return withId(submitted, id);
}

/**
 * A fake carrying a real charge ledger.
 *
 * `attempts` and `lastAttemptAt` stand in for the two row-only columns
 * `chargeStateOf` reads: they are never derived from the `Booking` fixtures
 * above, matching the aggregate's own refusal to carry them (see that port
 * method's doc comment).
 *
 * **`recordChargeAttempt` implements the real compare-and-swap**, not a
 * switch. The double-press test below is about exactly that predicate: two
 * presses that both slip past the command's own cooldown read must still
 * produce one prompt, and only a claim that can actually *lose* can prove it.
 * Everything the real `UPDATE`'s `WHERE` tests is tested here — the status,
 * the bound, the cooldown floor and the deadline — against the same fields.
 */
class FakeRepo implements BookingRepositoryPort {
  public attempts = 0;
  public lastAttemptAt: Date | null = null;
  public chargeStateOfCalls: string[] = [];
  public claims: { notAttemptedSince: Date }[] = [];

  constructor(private readonly current: Booking | null) {}

  async findById(id: string): Promise<Booking | null> {
    return this.current?.id === id ? this.current : null;
  }

  async chargeStateOf(bookingId: string): Promise<BookingChargeState> {
    this.chargeStateOfCalls.push(bookingId);
    return { attempts: this.attempts, lastAttemptAt: this.lastAttemptAt };
  }

  async recordChargeAttempt(claim: {
    bookingId: string;
    at: Date;
    maxAttempts: number;
    notAttemptedSince: Date;
    deadlineAfter: Date;
  }): Promise<number | null> {
    this.claims.push({ notAttemptedSince: claim.notAttemptedSince });
    if (this.current?.status !== "PENDING_PAYMENT") return null;
    if (this.attempts >= claim.maxAttempts) return null;
    if (this.lastAttemptAt !== null && this.lastAttemptAt > claim.notAttemptedSince) return null;
    if (!this.current.expiresAt || this.current.expiresAt <= claim.deadlineAfter) return null;
    this.attempts += 1;
    this.lastAttemptAt = claim.at;
    return this.attempts;
  }

  // None of this file's tests exercise these — `BookingRepositoryPort` still
  // requires them, the same way every other fake in this suite implements
  // them without exercising any.
  async findOpenDraftForCustomer(): Promise<Booking | null> {
    return null;
  }
  async insert(booking: Booking): Promise<Booking> {
    return booking;
  }
  async save(): Promise<boolean> {
    return true;
  }
  async appendChange(_change: BookingChangeRecord): Promise<void> {}
  async findDueForSweep(): Promise<Booking[]> {
    return [];
  }
  async findAwaitingCharge(): Promise<Booking[]> {
    return [];
  }
  async abandonCharge(): Promise<void> {}
}

class FakePhoneReader implements CustomerPhoneReaderPort {
  public asked: string[] = [];
  constructor(private readonly phone: string | null) {}
  async findPhoneNumber(userId: string): Promise<string | null> {
    this.asked.push(userId);
    return this.phone;
  }
}

/** A configured stage unless a test says otherwise. Counts what reached the gateway. */
class PaymentChargeSpy implements PaymentChargePort {
  public requests: PaymentChargeRequest[] = [];
  public notReady: { code: string; description: string } | null = null;
  constructor(private readonly result: PaymentChargeResult) {}
  readiness(): PaymentChargeReadiness {
    return this.notReady ? { ready: false, ...this.notReady } : { ready: true };
  }
  async charge(request: PaymentChargeRequest): Promise<PaymentChargeResult> {
    this.requests.push(request);
    return this.result;
  }
}

class CapturingOutbox implements OutboxPort {
  async publish(): Promise<void> {}
}

/**
 * Stands in for `DeferredBookingCharge`: records what it was asked to
 * schedule and nothing else. Proving the call is actually deferred past the
 * response is `deferred-booking-charge.test.ts`'s job, against `infraStore`
 * for real — this fake only proves `RequestBookingChargeCommand` hands it
 * the right input, and only once every refusal above has cleared.
 */
class FakeCharge implements ChargeBookingInternalPort {
  public calls: ChargeBookingInput[] = [];
  async execute(input: ChargeBookingInput): Promise<void> {
    this.calls.push(input);
  }
}

/** The cooldown boundary the command must compute — the sweep's constant, off this call's instant. */
const COOLDOWN_FLOOR = new Date(NOW.getTime() - BOOKING_CHARGE_RETRY_MINUTES * MS_PER_MINUTE);

function setup(opts: {
  booking: Booking | null;
  phone?: string | null;
  attempts?: number;
  lastAttemptAt?: Date | null;
  notReady?: { code: string; description: string };
}) {
  const repo = new FakeRepo(opts.booking);
  repo.attempts = opts.attempts ?? 0;
  repo.lastAttemptAt = opts.lastAttemptAt ?? null;
  const phoneReader = new FakePhoneReader(opts.phone === undefined ? "+258840000000" : opts.phone);
  const payments = new PaymentChargeSpy({ outcome: "paid", paymentRef: "MP-1" });
  if (opts.notReady) payments.notReady = opts.notReady;
  const charge = new FakeCharge();
  const command = new RequestBookingChargeCommand(repo, phoneReader, payments, charge, () => NOW);
  return { command, repo, phoneReader, payments, charge };
}

/**
 * The same command wired to the **real** `ChargeBookingCommand` over the same
 * fake repository, so a press runs the claim rather than recording an
 * intention to. Undeferred on purpose: `DeferredBookingCharge` only decides
 * *when* the inner command runs, and what the double-press test is about is
 * what happens when it does.
 */
function setupLive(booking: Booking) {
  const repo = new FakeRepo(booking);
  const phoneReader = new FakePhoneReader("+258840000000");
  const payments = new PaymentChargeSpy({
    outcome: "refused",
    code: "INS-9",
    description: "Request timeout",
  });
  const uow = new TrackingUnitOfWork();
  const chargeBooking = new ChargeBookingCommand(
    repo,
    phoneReader,
    payments,
    new MarkBookingPaidCommand(repo, uow, new CapturingOutbox(), new FakeRaiser()),
    () => NOW,
  );
  const command = new RequestBookingChargeCommand(
    repo,
    phoneReader,
    payments,
    chargeBooking,
    () => NOW,
  );
  return { command, repo, payments };
}

describe("RequestBookingChargeCommand", () => {
  it("throws BookingNotFoundError when the booking does not exist", async () => {
    const { command } = setup({ booking: null });
    const input: RequestBookingChargeInput = { bookingId: "missing", requesterUserId: ALICE };

    await expect(command.execute(input)).rejects.toThrow(BookingNotFoundError);
  });

  it("refuses a caller who is not the booking's customer, before the status, the attempts or the phone are ever read", async () => {
    const { command, repo, phoneReader, charge } = setup({ booking: pendingPaymentBooking() });
    const input: RequestBookingChargeInput = { bookingId: "bk-1", requesterUserId: BOB };

    await expect(command.execute(input)).rejects.toThrow(NotBookingCustomerError);

    expect(repo.chargeStateOfCalls).toEqual([]);
    expect(phoneReader.asked).toEqual([]);
    expect(charge.calls).toEqual([]);
  });

  it("refuses a booking that is not waiting to be paid", async () => {
    const { command, charge } = setup({ booking: awaitingProviderBooking() });
    const input: RequestBookingChargeInput = { bookingId: "bk-1", requesterUserId: ALICE };

    await expect(command.execute(input)).rejects.toThrow(BookingTransitionError);
    expect(charge.calls).toEqual([]);
  });

  it("refuses once the attempts are spent, before the payment window or the phone are read", async () => {
    const { command, phoneReader, charge } = setup({
      booking: pendingPaymentBooking(),
      attempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
    });
    const input: RequestBookingChargeInput = { bookingId: "bk-1", requesterUserId: ALICE };

    await expect(command.execute(input)).rejects.toThrow(BookingChargeAttemptsSpentError);

    expect(phoneReader.asked).toEqual([]);
    expect(charge.calls).toEqual([]);
  });

  // I5: a stage with no credentials cannot charge anybody, and that is not
  // this customer's doing. Discovering it inside the deferred charge meant
  // the page had already told them a prompt was on its way.
  it("refuses when the payment processor is not configured, before the phone is read", async () => {
    const { command, phoneReader, charge } = setup({
      booking: pendingPaymentBooking(),
      notReady: { code: "MPESA_NOT_CONFIGURED", description: "no api key on this stage" },
    });
    const input: RequestBookingChargeInput = { bookingId: "bk-1", requesterUserId: ALICE };

    await expect(command.execute(input)).rejects.toThrow(BookingChargeUnavailableError);

    expect(phoneReader.asked).toEqual([]);
    expect(charge.calls).toEqual([]);
  });

  it("refuses with too little of the payment window left to answer in, before the phone is read", async () => {
    const { command, phoneReader, charge } = setup({
      booking: pendingPaymentBooking("bk-1", { payBy: new Date(NOW.getTime() + 60_000) }),
    });
    const input: RequestBookingChargeInput = { bookingId: "bk-1", requesterUserId: ALICE };

    await expect(command.execute(input)).rejects.toThrow(BookingPaymentWindowClosedError);

    expect(phoneReader.asked).toEqual([]);
    expect(charge.calls).toEqual([]);
  });

  // The whole reason this command exists as more than a shortcut into
  // `ChargeBookingCommand` — see the command's own doc comment and
  // `BookingNoCustomerPhoneError`'s.
  it("asks for the number before spending an attempt", async () => {
    const { command, repo, charge } = setup({ booking: pendingPaymentBooking(), phone: null });
    const input: RequestBookingChargeInput = { bookingId: "bk-1", requesterUserId: ALICE };

    await expect(command.execute(input)).rejects.toThrow(BookingNoCustomerPhoneError);

    // The read happened — the refusal is real, not skipped — but nothing
    // downstream of it ran.
    expect(repo.chargeStateOfCalls).toEqual(["bk-1"]);
    expect(charge.calls).toEqual([]);
  });

  it("schedules the charge, with the sweep's own cooldown boundary as the floor, once every check clears", async () => {
    const { command, charge } = setup({ booking: pendingPaymentBooking() });
    const input: RequestBookingChargeInput = { bookingId: "bk-1", requesterUserId: ALICE };

    expect(await command.execute(input)).toBe("scheduled");

    expect(charge.calls).toHaveLength(1);
    expect(charge.calls[0]).toEqual({
      bookingId: "bk-1",
      maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
      notAttemptedSince: COOLDOWN_FLOOR,
    });
  });

  // C3. The cooldown the sweep is bound by binds a press too: a prompt from
  // moments ago may still be live on the handset, and a second one over it is
  // a customer who can accept both.
  it("pushes nothing over a prompt inside the cooldown, and says so", async () => {
    const { command, phoneReader, charge } = setup({
      booking: pendingPaymentBooking(),
      attempts: 1,
      lastAttemptAt: new Date(NOW.getTime() - 10_000),
    });
    const input: RequestBookingChargeInput = { bookingId: "bk-1", requesterUserId: ALICE };

    // Not a throw: the customer asked to be charged and a charge is in
    // flight. See `RequestBookingChargeOutcome`.
    expect(await command.execute(input)).toBe("already_sent");

    expect(charge.calls).toEqual([]);
    expect(phoneReader.asked).toEqual([]);
  });

  it("schedules again once the cooldown has elapsed, while attempts remain", async () => {
    const { command, charge } = setup({
      booking: pendingPaymentBooking(),
      attempts: 1,
      lastAttemptAt: new Date(COOLDOWN_FLOOR.getTime() - 1_000),
    });
    const input: RequestBookingChargeInput = { bookingId: "bk-1", requesterUserId: ALICE };

    expect(await command.execute(input)).toBe("scheduled");
    expect(charge.calls).toHaveLength(1);
  });

  /**
   * The bug C3 named, end to end over the real `ChargeBookingCommand`: press
   * "Pagar", close the dialog (its own copy says that is safe), press it
   * again ten seconds later. Before the fix the second press claimed attempt
   * two, built a fresh reference — deliberately, so the processor would not
   * refuse it as a duplicate — and pushed a second live prompt.
   */
  it("two presses in quick succession push exactly one prompt", async () => {
    const { command, repo, payments } = setupLive(pendingPaymentBooking());
    const input: RequestBookingChargeInput = { bookingId: "bk-1", requesterUserId: ALICE };

    expect(await command.execute(input)).toBe("scheduled");
    expect(await command.execute(input)).toBe("already_sent");

    expect(payments.requests).toHaveLength(1);
    expect(repo.attempts).toBe(1);
  });

  /**
   * The same double press with the command's own cooldown read blinded — a
   * genuine double-click, both requests reading the ledger before either
   * claim lands. The claim is the real gate; this is what it is for.
   */
  it("still pushes one prompt when both presses read the ledger before either claim lands", async () => {
    const { command, repo, payments } = setupLive(pendingPaymentBooking());
    const input: RequestBookingChargeInput = { bookingId: "bk-1", requesterUserId: ALICE };
    // Frozen at the pre-claim state, so neither press can see the other's.
    repo.chargeStateOf = async () => ({ attempts: 0, lastAttemptAt: null });

    await command.execute(input);
    await command.execute(input);

    expect(payments.requests).toHaveLength(1);
    expect(repo.attempts).toBe(1);
    // Both presses claimed against the same boundary; the loser took nothing.
    expect(repo.claims).toHaveLength(2);
    for (const claim of repo.claims) {
      expect(claim.notAttemptedSince).toEqual(COOLDOWN_FLOOR);
    }
  });
});
