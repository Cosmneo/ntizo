/**
 * `ChargeBookingCommand` and `ChargeAcceptedBookingsInternalCommand`, against
 * fakes.
 *
 * What this file proves is the *ordering and the branching* — the attempt is
 * counted before the processor is called, a failure leaves the booking
 * payable, a success goes through `MarkBookingPaidCommand` rather than around
 * it, and one bad booking does not take the wave down. The `MarkBookingPaidCommand`
 * here is the real one, not a stub, so "a paid charge confirms the booking"
 * is proven rather than asserted about a spy.
 *
 * What it deliberately does not prove: that `findAwaitingCharge` selects the
 * right rows. A fake cannot answer that — it is a predicate against Postgres
 * — and it is `booking-charge-sweep.test.ts`'s whole job.
 */
import { describe, expect, it } from "bun:test";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { Booking } from "../domain/aggregates/booking.aggregate";
import { MarkBookingPaidCommand } from "../app/use-cases/mark-booking-paid.command";
import { ChargeBookingCommand, chargeReference } from "../app/use-cases/charge-booking.command";
import {
  BOOKING_CHARGE_ATTEMPT_LIMIT,
  BOOKING_CHARGE_RETRY_MINUTES,
  ChargeAcceptedBookingsInternalCommand,
} from "../app/use-cases/charge-accepted-bookings.internal.command";
import { BOOKING_CHARGE_MIN_WINDOW_MS } from "../app/use-cases/charge-booking.command";
import { C2B_TIMEOUT_MS } from "../../../shared/infrastructure/payments/mpesa";
import type {
  BookingChangeRecord,
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
import { TrackingUnitOfWork, withId } from "./support/fakes";

const WHEN = new Date("2026-09-04T12:30:00.000Z");
/** The cooldown boundary a wave would have computed; only its identity matters here. */
const NOT_ATTEMPTED_SINCE = new Date("2026-09-04T11:55:00.000Z");
const DEADLINE = new Date("2026-09-04T13:00:00.000Z");

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
    expiresAt: DEADLINE,
    ...over,
  };
}

/**
 * `submit` now takes the address explicitly rather than reading it off the
 * draft it already carries. Every fixture in this file goes through
 * `bookingInput`, which always sets a concrete address, so pulling it back
 * off the draft this way is safe — this file has nothing to say about a
 * booking with no address, only about the charge path.
 */
function requiredAddress(b: Booking) {
  return { label: b.addressLabel as string, line: b.addressLine as string, city: b.addressCity as string };
}

/** A stored `PENDING_PAYMENT` booking — the provider has said yes and nobody has paid. */
function pendingBooking(id = "bk-1", over = {}): Booking {
  const draft = Booking.create(bookingInput(over));
  return withId(
    draft.submit(new Date(), DEADLINE, requiredAddress(draft)).accept(new Date(), DEADLINE),
    id,
  );
}

/** A stored `AWAITING_PROVIDER` booking — nothing here should ever charge one. */
function awaitingBooking(id = "bk-1"): Booking {
  const draft = Booking.create(bookingInput());
  return withId(draft.submit(new Date(), DEADLINE, requiredAddress(draft)), id);
}

/**
 * Tracks the order of every call the charge path makes, because the order is
 * the design: `recordChargeAttempt` before the processor, `save` only after a
 * payment comes back.
 */
class FakeRepo implements BookingRepositoryPort {
  public attemptCalls: { bookingId: string; at: Date }[] = [];
  public claims: {
    bookingId: string;
    at: Date;
    maxAttempts: number;
    notAttemptedSince: Date;
    deadlineAfter: Date;
  }[] = [];
  public abandoned: { bookingId: string; at: Date; maxAttempts: number }[] = [];
  /** Makes every claim lose, the way a concurrent wave's would. */
  public claimLoses = false;
  public awaiting: Booking[] = [];
  public lastCriteria: Parameters<BookingRepositoryPort["findAwaitingCharge"]>[0] | null = null;
  public savedArg: Booking | null = null;
  private current: Booking | null;

  constructor(
    initial: Booking | null,
    /** Shared with `PaymentChargeSpy` so one array records both sides of the ordering. */
    public readonly order: string[] = [],
    private readonly unitOfWork?: TrackingUnitOfWork,
    /** What `recordChargeAttempt` returns — the attempt number this call is. */
    private nextAttempt = 1,
  ) {
    this.current = initial;
  }

  async findById(id: string): Promise<Booking | null> {
    return this.current?.id === id ? this.current : null;
  }

  async save(booking: Booking, expectedStatus: Booking["status"]): Promise<boolean> {
    this.order.push("save");
    this.savedArg = booking;
    if (this.current?.status !== expectedStatus) return false;
    const commit = () => {
      this.current = booking;
    };
    if (this.unitOfWork) this.unitOfWork.stage(commit);
    else commit();
    return true;
  }

  async recordChargeAttempt(claim: {
    bookingId: string;
    at: Date;
    maxAttempts: number;
    notAttemptedSince: Date;
    deadlineAfter: Date;
  }): Promise<number | null> {
    this.order.push("recordChargeAttempt");
    this.claims.push(claim);
    this.attemptCalls.push({ bookingId: claim.bookingId, at: claim.at });
    // `null` is what a real losing claim returns — the row already moved on,
    // or another wave got there first. Modelled as a switch rather than by
    // simulating a second wave, because what is under test here is the
    // command's reaction to losing, not the SQL that decides it (that is
    // `booking-charge-sweep.test.ts`, against real Postgres).
    if (this.claimLoses) return null;
    return this.nextAttempt++;
  }

  async findAwaitingCharge(
    criteria: Parameters<BookingRepositoryPort["findAwaitingCharge"]>[0],
  ): Promise<Booking[]> {
    this.lastCriteria = criteria;
    return this.awaiting;
  }

  // Nothing in this file drives these; the port still requires them, the same
  // way every other fake repository in this directory carries the methods its
  // own commands never reach.
  async insert(booking: Booking): Promise<Booking> {
    return booking;
  }
  async appendChange(_change: BookingChangeRecord): Promise<void> {}
  async abandonCharge(abandonment: {
    bookingId: string;
    at: Date;
    maxAttempts: number;
  }): Promise<void> {
    this.order.push("abandonCharge");
    this.abandoned.push(abandonment);
  }
  async findDueForSweep(): Promise<Booking[]> {
    return [];
  }
}

class FakePhoneReader implements CustomerPhoneReaderPort {
  public asked: string[] = [];
  constructor(private readonly phone: string | null) {}
  async findPhoneNumber(userId: string): Promise<string | null> {
    this.asked.push(userId);
    return this.phone;
  }
}

class PaymentChargeSpy implements PaymentChargePort {
  public requests: PaymentChargeRequest[] = [];
  /** Flipped by the readiness tests; every other test runs against a configured stage. */
  public notReady: { code: string; description: string } | null = null;
  constructor(
    private readonly result: PaymentChargeResult | (() => PaymentChargeResult),
    private readonly order: string[] = [],
  ) {}
  readiness(): PaymentChargeReadiness {
    this.order.push("readiness");
    return this.notReady ? { ready: false, ...this.notReady } : { ready: true };
  }
  async charge(request: PaymentChargeRequest): Promise<PaymentChargeResult> {
    this.order.push("charge");
    this.requests.push(request);
    return typeof this.result === "function" ? this.result() : this.result;
  }
}

class CapturingOutbox implements OutboxPort {
  public published: BaseDomainEvent[] = [];
  async publish(events: BaseDomainEvent[]): Promise<void> {
    this.published.push(...events);
  }
}

/**
 * What a wave hands one booking: its id plus the exact bound and cooldown
 * boundary the wave selected it under, so the claim re-asserts the same
 * predicate. See `BookingRepositoryPort.recordChargeAttempt`.
 */
function chargeInput(bookingId: string) {
  return {
    bookingId,
    maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
    notAttemptedSince: NOT_ATTEMPTED_SINCE,
  };
}

/** The real `MarkBookingPaidCommand`, over the same fake repository. */
function markPaid(repo: BookingRepositoryPort, uow: TrackingUnitOfWork, outbox: OutboxPort) {
  return new MarkBookingPaidCommand(repo, uow, outbox);
}

describe("chargeReference", () => {
  it("fits M-Pesa's twenty alphanumeric characters", () => {
    const reference = chargeReference("0f7c1a2b-3d4e-4f50-9a1b-2c3d4e5f6071", 1);
    expect(reference).toBe("0F7C1A2B3D4E4F5001");
    expect(reference.length).toBeLessThanOrEqual(20);
    expect(reference).toMatch(/^[0-9A-Z]+$/);
  });

  /**
   * Two properties, and both are load-bearing. A repeated reference is
   * refused by the processor as a duplicate, which would break the retry the
   * whole design leans on. And a reference that cannot be rebuilt from the
   * row leaves no way to ever ask what became of an attempt whose answer
   * never arrived — see the command's own doc comment.
   */
  it("differs per attempt on one booking, and is the same for the same attempt", () => {
    const id = "0f7c1a2b-3d4e-4f50-9a1b-2c3d4e5f6071";
    const references = [1, 2, 3].map((n) => chargeReference(id, n));
    expect(new Set(references).size).toBe(3);
    expect(chargeReference(id, 2)).toBe(references[1]!);
  });

  it("differs between bookings on the same attempt", () => {
    expect(chargeReference("0f7c1a2b-3d4e-4f50-9a1b-2c3d4e5f6071", 1)).not.toBe(
      chargeReference("11111111-2222-4333-8444-555555555555", 1),
    );
  });
});

describe("ChargeBookingCommand", () => {
  it("counts the attempt before it calls the processor, never after", async () => {
    const order: string[] = [];
    const repo = new FakeRepo(pendingBooking(), order);
    const uow = new TrackingUnitOfWork();
    const charge = new PaymentChargeSpy(
      { outcome: "refused", code: "INS-9", description: "Request timeout" },
      order,
    );

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader("+258841234567"),
      charge,
      markPaid(repo, uow, new CapturingOutbox()),
    ).execute(chargeInput("bk-1"));

    // The whole point: a Worker evicted during the minute the charge blocks
    // must still have consumed an attempt, or a booking that always dies
    // that way is retried for ever.
    expect(order).toEqual(["readiness", "recordChargeAttempt", "charge"]);
  });

  it("hands the processor the booking's own money and the attempt's reference", async () => {
    const repo = new FakeRepo(pendingBooking("bk-1"));
    const uow = new TrackingUnitOfWork();
    const charge = new PaymentChargeSpy({
      outcome: "refused",
      code: "INS-9",
      description: "Request timeout",
    });

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader("+258841234567"),
      charge,
      markPaid(repo, uow, new CapturingOutbox()),
    ).execute(chargeInput("bk-1"));

    expect(charge.requests).toEqual([
      {
        bookingId: "bk-1",
        phone: "+258841234567",
        // Minor units, unconverted: turning them into whatever the processor
        // wants is the adapter's job, and this is where that boundary is.
        amountMinor: 150000,
        currency: "MZN",
        // The literal, not `chargeReference("bk-1", 1)`: an assertion written
        // in terms of the function under test passes whatever that function
        // does. `chargeReference`'s own suite pins the format; this pins that
        // the command actually sends it.
        reference: "BK101",
      },
    ]);
  });

  it("confirms the booking through MarkBookingPaidCommand when the money lands", async () => {
    const uow = new TrackingUnitOfWork();
    const repo = new FakeRepo(pendingBooking("bk-1"), [], uow);
    const outbox = new CapturingOutbox();

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader("+258841234567"),
      new PaymentChargeSpy({ outcome: "paid", paymentRef: "7SHV1234567" }),
      markPaid(repo, uow, outbox),
    ).execute(chargeInput("bk-1"));

    // The real command did the transition, so this is the whole contract:
    // `CONFIRMED`, carrying the processor's own reference — not ours.
    expect(repo.savedArg?.status).toBe("CONFIRMED");
    expect(repo.savedArg?.paymentRef).toBe("7SHV1234567");
    expect(outbox.published.map((e) => e.eventName)).toEqual(["booking.paid"]);
  });

  it("leaves the booking payable when the charge does not land", async () => {
    const uow = new TrackingUnitOfWork();
    const repo = new FakeRepo(pendingBooking("bk-1"), [], uow);
    const outbox = new CapturingOutbox();

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader("+258841234567"),
      new PaymentChargeSpy({ outcome: "refused", code: "INS-9", description: "Request timeout" }),
      markPaid(repo, uow, outbox),
    ).execute(chargeInput("bk-1"));

    // No write and no announcement. A mistyped PIN is not a cancellation:
    // the booking keeps its slot until its payment window closes, and only
    // then does the deadline sweep end it — with a reason, for the provider.
    expect(repo.savedArg).toBeNull();
    expect(outbox.published).toEqual([]);
    // The attempt still counted, which is what eventually gets the booking
    // out of this loop.
    expect(repo.attemptCalls).toHaveLength(1);
  });

  /**
   * The ruling, in a test: a customer with no phone number is an **ordinary
   * charge failure**. No new status, no new reason, no early give-up — the
   * attempt is consumed like any other, and once the bound is spent the
   * booking falls to the payment-window cancellation that tells the provider,
   * reached with no special case anywhere.
   *
   * The real fix is requiring a number before the customer can submit, which
   * belongs to a checkout screen that does not exist yet.
   */
  it("treats a customer with no phone number as an ordinary failure, attempt and all", async () => {
    const uow = new TrackingUnitOfWork();
    const repo = new FakeRepo(pendingBooking("bk-1"), [], uow);
    const charge = new PaymentChargeSpy({ outcome: "paid", paymentRef: "never" });

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader(null),
      charge,
      markPaid(repo, uow, new CapturingOutbox()),
    ).execute(chargeInput("bk-1"));

    expect(charge.requests).toEqual([]);
    expect(repo.savedArg).toBeNull();
    // Consumed, not skipped. Skipping it is what would make this booking
    // retry every sixty seconds until its window closed.
    expect(repo.attemptCalls).toHaveLength(1);
  });

  /**
   * **Two waves of this sweep overlap by construction**, so losing the claim
   * is the ordinary case rather than an exotic one: five bookings at up to
   * two minutes each, against a cron that fires every sixty seconds. Wave 1
   * blocks on B1 while wave 2 charges B2; wave 1 then reaches B2 with a
   * candidate list minutes out of date. `recordChargeAttempt` is where that
   * is settled, and `null` is how it says so.
   *
   * The reaction has to be *silent*: nothing charged, nothing written,
   * nothing thrown, no log line — exactly what a losing `save` produces
   * elsewhere in this context, because nothing went wrong.
   */
  it("charges nobody when another wave has already claimed the booking", async () => {
    const uow = new TrackingUnitOfWork();
    const repo = new FakeRepo(pendingBooking("bk-1"), [], uow);
    repo.claimLoses = true;
    const charge = new PaymentChargeSpy({ outcome: "paid", paymentRef: "NEVER" });

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader("+258841234567"),
      charge,
      markPaid(repo, uow, new CapturingOutbox()),
    ).execute(chargeInput("bk-1"));

    expect(charge.requests).toEqual([]);
    expect(repo.savedArg).toBeNull();
  });

  /**
   * The claim must re-assert the *same* predicate the wave selected on, not a
   * freshly-computed approximation — otherwise the two disagree by however
   * long the wave has been running, which for a five-booking wave is minutes.
   */
  it("claims under the very bound and cooldown the wave selected on", async () => {
    const repo = new FakeRepo(pendingBooking("bk-1"));
    const uow = new TrackingUnitOfWork();

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader("+258841234567"),
      new PaymentChargeSpy({ outcome: "refused", code: "INS-9", description: "Request timeout" }),
      markPaid(repo, uow, new CapturingOutbox()),
    ).execute(chargeInput("bk-1"));

    expect(repo.claims).toHaveLength(1);
    expect(repo.claims[0]).toMatchObject({
      bookingId: "bk-1",
      maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
      notAttemptedSince: NOT_ATTEMPTED_SINCE,
    });
  });

  /**
   * **A configuration fault must not spend a customer's retry budget.**
   *
   * With a three-attempt bound and a five-minute cooldown, twelve minutes of
   * a stage deployed with the wrong shortcode used to permanently kill every
   * booking accepted in that window — and then tell each provider the
   * customer did not pay. Fixing the configuration at minute twenty rescued
   * none of them, because the attempts were already spent.
   *
   * So readiness is asked first, and a stage that cannot charge anybody
   * claims nothing.
   */
  it("spends no attempt when the processor is not configured", async () => {
    const uow = new TrackingUnitOfWork();
    const repo = new FakeRepo(pendingBooking("bk-1"), [], uow);
    const charge = new PaymentChargeSpy({ outcome: "paid", paymentRef: "NEVER" });
    charge.notReady = {
      code: "NTIZO-MPESA-NOT-CONFIGURED",
      description: "MPESA_API_KEY or MPESA_PUBLIC_KEY is not set on this stage",
    };

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader("+258841234567"),
      charge,
      markPaid(repo, uow, new CapturingOutbox()),
    ).execute(chargeInput("bk-1"));

    // Nothing claimed, nothing charged. The booking is untouched and will be
    // picked up again the moment the stage is fixed.
    expect(repo.attemptCalls).toEqual([]);
    expect(charge.requests).toEqual([]);
  });

  it("asks readiness before it claims, not after", async () => {
    const order: string[] = [];
    const repo = new FakeRepo(pendingBooking(), order);
    const uow = new TrackingUnitOfWork();
    const charge = new PaymentChargeSpy({ outcome: "paid", paymentRef: "X" }, order);

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader("+258841234567"),
      charge,
      markPaid(repo, uow, new CapturingOutbox()),
    ).execute(chargeInput("bk-1"));

    expect(order.indexOf("readiness")).toBeLessThan(order.indexOf("recordChargeAttempt"));
  });

  /**
   * **An outcome we cannot read is never retried**, and the trigger is
   * measured rather than hypothetical: the WAF in front of the sandbox
   * answers an HTML 504 at ~31 s while Vodacom is still waiting for the
   * customer's PIN. Every attempt carries a fresh reference so the processor
   * will not refuse a retry as a duplicate, which means a second prompt over
   * a live first one is a customer who can accept both — and there is no
   * refund path.
   *
   * So the booking is abandoned: its bound is spent, the sweep stops
   * selecting it, and its payment window cancels it and tells the provider.
   * No new status, no special case.
   */
  it.each([
    ["NTIZO-UNREADABLE-RESPONSE", "HTTP 504 with a body this client could not read as JSON"],
    ["NTIZO-TRANSPORT", "The operation timed out."],
    ["NTIZO-MISSING-TRANSACTION-ID", "INS-0 with nothing readable as a transaction id"],
  ])("abandons the booking rather than retrying after %s", async (code, description) => {
    const uow = new TrackingUnitOfWork();
    const repo = new FakeRepo(pendingBooking("bk-1"), [], uow);

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader("+258841234567"),
      new PaymentChargeSpy({ outcome: "ambiguous", code, description }),
      markPaid(repo, uow, new CapturingOutbox()),
    ).execute(chargeInput("bk-1"));

    expect(repo.abandoned).toEqual([
      { bookingId: "bk-1", at: expect.any(Date), maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT },
    ]);
    // Not confirmed, and not announced: we do not know that any money moved.
    expect(repo.savedArg).toBeNull();
  });

  it("does NOT abandon a booking the processor merely refused", async () => {
    const uow = new TrackingUnitOfWork();
    const repo = new FakeRepo(pendingBooking("bk-1"), [], uow);

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader("+258841234567"),
      new PaymentChargeSpy({ outcome: "refused", code: "INS-9", description: "Request timeout" }),
      markPaid(repo, uow, new CapturingOutbox()),
    ).execute(chargeInput("bk-1"));

    // Vodacom answered: no prompt is standing and nothing was debited, so the
    // ordinary bound-and-cooldown retry applies. Abandoning here would throw
    // away two perfectly good attempts on the commonest failure there is.
    expect(repo.abandoned).toEqual([]);
    expect(repo.attemptCalls).toHaveLength(1);
  });

  /**
   * The claim's deadline floor comes from the **claim** instant, not the
   * wave's — the wave's is minutes stale by the time a later booking is
   * reached, and that staleness is precisely what this criterion exists to
   * catch.
   */
  it("claims against a deadline floor measured from the claim instant", async () => {
    const at = new Date("2026-09-04T12:00:00.000Z");
    const repo = new FakeRepo(pendingBooking("bk-1"));
    const uow = new TrackingUnitOfWork();

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader("+258841234567"),
      new PaymentChargeSpy({ outcome: "refused", code: "INS-9", description: "Request timeout" }),
      markPaid(repo, uow, new CapturingOutbox()),
      () => at,
    ).execute(chargeInput("bk-1"));

    expect(repo.claims[0]?.deadlineAfter).toEqual(
      new Date(at.getTime() + BOOKING_CHARGE_MIN_WINDOW_MS),
    );
  });

  it("does not charge a booking that is not PENDING_PAYMENT", async () => {
    const uow = new TrackingUnitOfWork();
    const repo = new FakeRepo(awaitingBooking("bk-1"), [], uow);
    const charge = new PaymentChargeSpy({ outcome: "paid", paymentRef: "never" });

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader("+258841234567"),
      charge,
      markPaid(repo, uow, new CapturingOutbox()),
    ).execute(chargeInput("bk-1"));

    // The ordinary race — the sweep selected a row that moved on before this
    // call reached it. Nothing charged, and nothing counted against a booking
    // that was never eligible.
    expect(charge.requests).toEqual([]);
    expect(repo.attemptCalls).toEqual([]);
  });

  it("does not charge a booking that no longer exists", async () => {
    const uow = new TrackingUnitOfWork();
    const repo = new FakeRepo(null, [], uow);
    const charge = new PaymentChargeSpy({ outcome: "paid", paymentRef: "never" });

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader("+258841234567"),
      charge,
      markPaid(repo, uow, new CapturingOutbox()),
    ).execute(chargeInput("gone"));

    expect(charge.requests).toEqual([]);
    expect(repo.attemptCalls).toEqual([]);
  });
});

describe("BOOKING_CHARGE_MIN_WINDOW_MS", () => {
  /**
   * These two numbers live in different layers — the window is the sweep's
   * policy, the timeout is the M-Pesa client's — and nothing but this test
   * would notice them drifting apart.
   *
   * If the window ever shrinks below the timeout, the sweep starts selecting
   * bookings whose payment deadline passes while the C2B is still blocking:
   * the next invocation's deadline sweep cancels the booking and tells the
   * provider the customer did not pay, and then the charge returns `INS-0`.
   * A debited customer, a cancelled booking, and a provider told the
   * opposite of what happened.
   */
  it("leaves room for a whole C2B call, plus the write that follows it", () => {
    expect(BOOKING_CHARGE_MIN_WINDOW_MS).toBeGreaterThan(C2B_TIMEOUT_MS);
  });
});

describe("ChargeAcceptedBookingsInternalCommand", () => {
  it("asks for the bound and the cooldown it owns, not for whatever the repository fancies", async () => {
    const repo = new FakeRepo(null);
    const now = new Date("2026-09-04T12:00:00.000Z");

    await new ChargeAcceptedBookingsInternalCommand(
      repo,
      {} as ChargeBookingCommand,
      () => now,
    ).execute({ limit: 5 });

    expect(repo.lastCriteria).toEqual({
      // Not `now`. A booking whose window closes mid-call would be cancelled
      // by the deadline sweep while its customer was being asked to pay for
      // it — see `BOOKING_CHARGE_MIN_WINDOW_MS`.
      deadlineAfter: new Date(now.getTime() + BOOKING_CHARGE_MIN_WINDOW_MS),
      limit: 5,
      maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
      // The cooldown, computed backwards from now. It exists because the cron
      // wakes every sixty seconds and a C2B blocks for about that long — see
      // the constant's own doc comment.
      notAttemptedSince: new Date(now.getTime() - BOOKING_CHARGE_RETRY_MINUTES * 60_000),
    });
  });

  it("charges every booking in the wave and counts them", async () => {
    const repo = new FakeRepo(null);
    repo.awaiting = [pendingBooking("bk-1"), pendingBooking("bk-2"), pendingBooking("bk-3")];
    const handed: { bookingId: string; maxAttempts: number; notAttemptedSince: Date }[] = [];
    const chargeBooking = {
      execute: async (input: {
        bookingId: string;
        maxAttempts: number;
        notAttemptedSince: Date;
      }) => {
        handed.push(input);
      },
    } as ChargeBookingCommand;
    const now = new Date("2026-09-04T12:00:00.000Z");

    const result = await new ChargeAcceptedBookingsInternalCommand(
      repo,
      chargeBooking,
      () => now,
    ).execute({ limit: 5 });

    expect(handed.map((h) => h.bookingId)).toEqual(["bk-1", "bk-2", "bk-3"]);
    expect(result).toEqual({ attempted: 3, failed: 0 });

    // Every booking is handed the criteria the query used, computed once —
    // the same object identity for `notAttemptedSince` across the wave, so
    // the claim cannot drift from the selection as the wave takes minutes to
    // run.
    const expectedCooldown = new Date(now.getTime() - BOOKING_CHARGE_RETRY_MINUTES * 60_000);
    for (const h of handed) {
      expect(h.maxAttempts).toBe(BOOKING_CHARGE_ATTEMPT_LIMIT);
      expect(h.notAttemptedSince).toEqual(expectedCooldown);
      expect(h.notAttemptedSince).toEqual(repo.lastCriteria!.notAttemptedSince);
    }
  });

  /**
   * One booking must not stop the wave, the same property
   * `SweepDueBookingsInternalCommand` has and for the same reason: the
   * bookings behind it in the queue are each one provider's blocked
   * afternoon, and they are worth more than giving up on the one that threw.
   */
  it("keeps charging after one booking throws, and counts it as failed", async () => {
    const repo = new FakeRepo(null);
    repo.awaiting = [pendingBooking("bk-1"), pendingBooking("bk-2"), pendingBooking("bk-3")];
    const charged: string[] = [];
    const chargeBooking = {
      execute: async ({
        bookingId,
      }: {
        bookingId: string;
        maxAttempts: number;
        notAttemptedSince: Date;
      }) => {
        if (bookingId === "bk-2") throw new Error("simulated: the gateway is misconfigured");
        charged.push(bookingId);
      },
    } as ChargeBookingCommand;

    const result = await new ChargeAcceptedBookingsInternalCommand(repo, chargeBooking).execute({
      limit: 5,
    });

    expect(charged).toEqual(["bk-1", "bk-3"]);
    expect(result).toEqual({ attempted: 2, failed: 1 });
  });

  it("forwards the caller's limit rather than deciding one", async () => {
    const repo = new FakeRepo(null);

    await new ChargeAcceptedBookingsInternalCommand(repo, {} as ChargeBookingCommand).execute({
      limit: 2,
    });

    expect(repo.lastCriteria?.limit).toBe(2);
  });
});
