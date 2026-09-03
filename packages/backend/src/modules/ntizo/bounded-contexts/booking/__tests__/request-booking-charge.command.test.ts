/**
 * `RequestBookingChargeCommand` against fakes.
 *
 * What this file proves is the *order* of the five refusals — ownership,
 * status, the attempt bound, the payment window, then the phone number — and
 * that the phone number is checked before anything claims an attempt. That
 * order is the entire reason this command exists rather than being a
 * client-side shortcut into `ChargeBookingCommand`; see the command's own
 * doc comment. What it deliberately does not prove: whether the deferred
 * gateway call actually survives the response — that is
 * `deferred-booking-charge.test.ts`'s job, against `infraStore` for real.
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
import { BOOKING_CHARGE_ATTEMPT_LIMIT } from "../app/use-cases/charge-accepted-bookings.internal.command";
import type { ChargeBookingInput } from "../app/use-cases/charge-booking.command";
import type {
  BookingChangeRecord,
  BookingRepositoryPort,
} from "../app/ports/outbound/booking.repository.port";
import type { CustomerPhoneReaderPort } from "../app/ports/outbound/customer-phone.reader.port";
import type { ChargeBookingInternalPort } from "../app/ports/inbound/charge-booking.internal.command.port";
import { withId } from "./support/fakes";

/** The instant every test's clock reads, injected through the command's own `now`. */
const NOW = new Date("2026-09-04T12:30:00.000Z");
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
 * A read-only fake — this command never writes through `BookingRepositoryPort`
 * at all, unlike `CancelBookingCommand`'s. `chargeAttempts` stands in for the
 * row-only column `chargeAttemptsOf` reads: it is never derived from the
 * `Booking` fixtures above, matching the aggregate's own refusal to carry it
 * (see that port method's doc comment).
 */
class FakeRepo implements BookingRepositoryPort {
  public chargeAttempts = 0;
  public chargeAttemptsOfCalls: string[] = [];

  constructor(private readonly current: Booking | null) {}

  async findById(id: string): Promise<Booking | null> {
    return this.current?.id === id ? this.current : null;
  }

  async chargeAttemptsOf(bookingId: string): Promise<number> {
    this.chargeAttemptsOfCalls.push(bookingId);
    return this.chargeAttempts;
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
  async recordChargeAttempt(): Promise<number | null> {
    return null;
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

function setup(opts: { booking: Booking | null; phone?: string | null; chargeAttempts?: number }) {
  const repo = new FakeRepo(opts.booking);
  repo.chargeAttempts = opts.chargeAttempts ?? 0;
  const phoneReader = new FakePhoneReader(opts.phone === undefined ? "+258840000000" : opts.phone);
  const charge = new FakeCharge();
  const command = new RequestBookingChargeCommand(repo, phoneReader, charge, () => NOW);
  return { command, repo, phoneReader, charge };
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

    expect(repo.chargeAttemptsOfCalls).toEqual([]);
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
      chargeAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
    });
    const input: RequestBookingChargeInput = { bookingId: "bk-1", requesterUserId: ALICE };

    await expect(command.execute(input)).rejects.toThrow(BookingChargeAttemptsSpentError);

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
    expect(repo.chargeAttemptsOfCalls).toEqual(["bk-1"]);
    expect(charge.calls).toEqual([]);
  });

  it("schedules the charge, with this call's own instant as the cooldown floor, once every check clears", async () => {
    const { command, charge } = setup({ booking: pendingPaymentBooking() });
    const input: RequestBookingChargeInput = { bookingId: "bk-1", requesterUserId: ALICE };

    await command.execute(input);

    expect(charge.calls).toHaveLength(1);
    expect(charge.calls[0]).toEqual({
      bookingId: "bk-1",
      maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
      notAttemptedSince: NOW,
    });
  });
});
