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
import type {
  BookingChangeRecord,
  BookingRepositoryPort,
} from "../app/ports/outbound/booking.repository.port";
import type { CustomerPhoneReaderPort } from "../app/ports/outbound/customer-phone.reader.port";
import type {
  PaymentChargePort,
  PaymentChargeRequest,
  PaymentChargeResult,
} from "../app/ports/outbound/payment-charge.port";
import type { OutboxPort } from "../../../shared/app/ports/outbox.port";
import { TrackingUnitOfWork, withId } from "./support/fakes";

const WHEN = new Date("2026-09-04T12:30:00.000Z");
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

/** A stored `PENDING_PAYMENT` booking — the provider has said yes and nobody has paid. */
function pendingBooking(id = "bk-1", over = {}): Booking {
  const draft = Booking.create(bookingInput(over));
  return withId(draft.submit(new Date(), DEADLINE).accept(new Date(), DEADLINE), id);
}

/** A stored `AWAITING_PROVIDER` booking — nothing here should ever charge one. */
function awaitingBooking(id = "bk-1"): Booking {
  const draft = Booking.create(bookingInput());
  return withId(draft.submit(new Date(), DEADLINE), id);
}

/**
 * Tracks the order of every call the charge path makes, because the order is
 * the design: `recordChargeAttempt` before the processor, `save` only after a
 * payment comes back.
 */
class FakeRepo implements BookingRepositoryPort {
  public attemptCalls: { bookingId: string; at: Date }[] = [];
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

  async recordChargeAttempt(bookingId: string, at: Date): Promise<number> {
    this.order.push("recordChargeAttempt");
    this.attemptCalls.push({ bookingId, at });
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
  constructor(
    private readonly result: PaymentChargeResult | (() => PaymentChargeResult),
    private readonly order: string[] = [],
  ) {}
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
      { outcome: "failed", code: "INS-9", description: "Request timeout" },
      order,
    );

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader("+258841234567"),
      charge,
      markPaid(repo, uow, new CapturingOutbox()),
    ).execute({ bookingId: "bk-1" });

    // The whole point: a Worker evicted during the minute the charge blocks
    // must still have consumed an attempt, or a booking that always dies
    // that way is retried for ever.
    expect(order).toEqual(["recordChargeAttempt", "charge"]);
  });

  it("hands the processor the booking's own money and the attempt's reference", async () => {
    const repo = new FakeRepo(pendingBooking("bk-1"));
    const uow = new TrackingUnitOfWork();
    const charge = new PaymentChargeSpy({
      outcome: "failed",
      code: "INS-9",
      description: "Request timeout",
    });

    await new ChargeBookingCommand(
      repo,
      new FakePhoneReader("+258841234567"),
      charge,
      markPaid(repo, uow, new CapturingOutbox()),
    ).execute({ bookingId: "bk-1" });

    expect(charge.requests).toEqual([
      {
        bookingId: "bk-1",
        phone: "+258841234567",
        // Minor units, unconverted: turning them into whatever the processor
        // wants is the adapter's job, and this is where that boundary is.
        amountMinor: 150000,
        currency: "MZN",
        reference: chargeReference("bk-1", 1),
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
    ).execute({ bookingId: "bk-1" });

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
      new PaymentChargeSpy({ outcome: "failed", code: "INS-9", description: "Request timeout" }),
      markPaid(repo, uow, outbox),
    ).execute({ bookingId: "bk-1" });

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
    ).execute({ bookingId: "bk-1" });

    expect(charge.requests).toEqual([]);
    expect(repo.savedArg).toBeNull();
    // Consumed, not skipped. Skipping it is what would make this booking
    // retry every sixty seconds until its window closed.
    expect(repo.attemptCalls).toHaveLength(1);
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
    ).execute({ bookingId: "bk-1" });

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
    ).execute({ bookingId: "gone" });

    expect(charge.requests).toEqual([]);
    expect(repo.attemptCalls).toEqual([]);
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
      now,
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
    const charged: string[] = [];
    const chargeBooking = {
      execute: async ({ bookingId }: { bookingId: string }) => {
        charged.push(bookingId);
      },
    } as ChargeBookingCommand;

    const result = await new ChargeAcceptedBookingsInternalCommand(repo, chargeBooking).execute({
      limit: 5,
    });

    expect(charged).toEqual(["bk-1", "bk-2", "bk-3"]);
    expect(result).toEqual({ attempted: 3, failed: 0 });
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
      execute: async ({ bookingId }: { bookingId: string }) => {
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
