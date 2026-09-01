/**
 * The charge sweep — `ChargeAcceptedBookingsInternalCommand` over
 * `DrizzleBookingRepository.findAwaitingCharge` — against the real dev
 * database, for the same reason and by the same mechanism as
 * `booking-sweep.test.ts`: every adapter under test reaches Postgres through
 * `getDb()`, which resolves through AsyncLocalStorage, and a test has no
 * request. `__runWithTransactionContextForTests` binds this file's own
 * `DEV_DB_URL`-backed client into that context for one test body.
 *
 * **What only this file can prove.** The selection predicate is four
 * conditions that all have to be right at once, and every one of them fails
 * silently if it is not: a booking already `CONFIRMED` must not be charged
 * again, one past its retry bound must be left to its payment window, one
 * charged a moment ago must not be prompted a second time while the first
 * prompt is still live, and one whose window has already closed belongs to
 * the deadline sweep rather than to this one. A fake repository can only ever
 * return whatever list the test handed it, so none of that is testable
 * anywhere but here.
 *
 * It also proves the two writes that follow a charge, because those are what
 * a fake gets wrong most convincingly: a failure increments `charge_attempts`
 * and leaves the booking `PENDING_PAYMENT`, and a success moves it to
 * `CONFIRMED` carrying the processor's own reference.
 *
 * **No M-Pesa call is made and no credential is used.** `PaymentChargePort`
 * is faked here on purpose — what is under test is the sweep's selection and
 * bookkeeping, not the gateway. The gateway is `mpesa.client.test.ts`
 * (against a stub) and the report's Step 5 (against the live sandbox).
 *
 * **Every booking is deleted in a `finally`, never after the last
 * assertion** — see `withBookings`. The sweep's query is not scoped to this
 * file's provider (it cannot be; that is the query production runs), so a row
 * one test leaks is a row every later test's sweep will claim.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { DrizzleUnitOfWork } from "../../../../../../shared/infrastructure/unit-of-work";
import { OutboxAdapter } from "../../../../../../shared/infrastructure/outbox/outbox.adapter";
import { DrizzleOutboxEventRepository } from "../../../../../../shared/infrastructure/outbox/drizzle/outbox-event.repository";
import { category } from "../catalog/schemas/category.schema";
import { service, serviceOption } from "../catalog/schemas/service.schema";
import { provider } from "../provider/schemas/provider.schema";
import { providerMember } from "../provider/schemas/provider-member.schema";
import { user } from "../user/schemas/user.schema";
import { profile } from "../user/schemas/profile.schema";
import { booking } from "../booking/schemas/booking.schema";
import { outboxEvent } from "../outbox/schemas/outbox-event.schema";
import { Booking } from "../../../../bounded-contexts/booking/domain/aggregates/booking.aggregate";
import { DrizzleBookingRepository } from "../../../../bounded-contexts/booking/infrastructure/repositories/drizzle/booking.repository";
import { DrizzleCustomerPhoneReader } from "../../../../bounded-contexts/booking/infrastructure/repositories/drizzle/customer-phone.reader";
import { MarkBookingPaidCommand } from "../../../../bounded-contexts/booking/app/use-cases/mark-booking-paid.command";
import { ChargeBookingCommand } from "../../../../bounded-contexts/booking/app/use-cases/charge-booking.command";
import {
  BOOKING_CHARGE_ATTEMPT_LIMIT,
  BOOKING_CHARGE_RETRY_MINUTES,
  ChargeAcceptedBookingsInternalCommand,
} from "../../../../bounded-contexts/booking/app/use-cases/charge-accepted-bookings.internal.command";
import { BOOKING_CHARGE_MIN_WINDOW_MS } from "../../../../bounded-contexts/booking/app/use-cases/charge-booking.command";
import type {
  PaymentChargePort,
  PaymentChargeReadiness,
  PaymentChargeRequest,
  PaymentChargeResult,
} from "../../../../bounded-contexts/booking/app/ports/outbound/payment-charge.port";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql, { schema: authSchema });

const repo = new DrizzleBookingRepository();
const suffix = crypto.randomUUID();

let customerId: string;
let ownerUserId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let serviceOptionId: string;

/** Every booking id this file inserts, for the outbox rows that outlive the booking rows. */
const createdBookingIds: string[] = [];

beforeAll(async () => {
  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    {
      id: customerId,
      email: `booking-charge-customer-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerUserId,
      email: `booking-charge-owner-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);

  // A real profile row with a real Vodacom number, because
  // `DrizzleCustomerPhoneReader` is one of the adapters under test — the
  // charge path reads a handset out of this table, and a fake reader would
  // hide a wrong column or a wrong join.
  await db.insert(profile).values({ userId: customerId, phoneNumber: "+258841234567" });

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Booking Charge Test Provider",
      slug: `booking-charge-test-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerId = providerRow!.id;

  const [memberRow] = await db
    .insert(providerMember)
    .values({ providerId, userId: ownerUserId, role: "owner" })
    .returning({ id: providerMember.id });
  memberId = memberRow!.id;

  const [categoryRow] = await db
    .insert(category)
    .values({ code: `booking-charge-test-${suffix}` })
    .returning({ id: category.id });
  categoryId = categoryRow!.id;

  const [serviceRow] = await db
    .insert(service)
    .values({
      providerId,
      categoryId,
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      status: "published",
    })
    .returning({ id: service.id });
  serviceId = serviceRow!.id;

  const [optionRow] = await db
    .insert(serviceOption)
    .values({
      serviceId,
      pricingMode: "fixed",
      amountMinor: 100_000,
      durationMinutes: 60,
    })
    .returning({ id: serviceOption.id });
  serviceOptionId = optionRow!.id;
});

afterAll(async () => {
  await bestEffortCleanup([
    () =>
      createdBookingIds.length > 0
        ? db.delete(outboxEvent).where(inArray(outboxEvent.aggregateId, createdBookingIds))
        : Promise.resolve(),
    () => db.delete(booking).where(eq(booking.providerId, providerId)),
    () => db.delete(serviceOption).where(eq(serviceOption.id, serviceOptionId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(profile).where(eq(profile.userId, customerId)),
    () => db.delete(user).where(eq(user.id, customerId)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

/**
 * Every date in this file sits in mid-2027, and that is isolation rather than
 * whimsy.
 *
 * This sweep's predicate is `expires_at > now`, which points *forward* — so
 * unlike the deadline sweep, a stray `PENDING_PAYMENT` row belonging to
 * somebody else (another test file whose cleanup gave up partway, another
 * worktree running this suite against the same shared dev database) is
 * selected by it rather than ignored, and would be charged: an attempt
 * counted against a fixture that is not ours, and a wave count this file
 * cannot predict. Putting every `now` here a year past anything the product
 * or the other test files produce means those rows fall *behind* the window
 * and are excluded by the same inequality. Fixtures within this file still
 * use a distinct day each, the same discipline `booking-sweep.test.ts`
 * applies, so one test's rows are never inside another's window either.
 */
function bookingInput(
  overrides: Partial<Parameters<typeof Booking.create>[0]> = {},
): Parameters<typeof Booking.create>[0] {
  return {
    customerId,
    providerId,
    serviceId,
    serviceOptionId,
    providerMemberId: memberId,
    startsAt: new Date("2027-06-01T09:00:00.000Z"),
    durationMinutes: 60,
    priceMinor: 100_000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName: "Corte de Cabelo",
    providerName: "Booking Charge Test Provider",
    providerSlug: `booking-charge-test-${suffix}`,
    optionName: "Standard",
    addressLabel: "Salão",
    addressLine: "Av. Julius Nyerere 123",
    addressCity: "Maputo",
    addressDistrict: "Sommerschield",
    addressDirections: null,
    addressLat: null,
    addressLng: null,
    description: null,
    expiresAt: new Date("2027-06-01T09:30:00.000Z"),
    ...overrides,
  };
}

/**
 * A booking the provider has accepted and nobody has paid for — the only
 * status this sweep selects.
 *
 * Threaded through `submit` and `accept` the way a real booking is, since
 * `Booking.create` produces `DRAFT`. `input.expiresAt` is reused as both
 * deadlines so each test configures the payment window it actually asserts
 * on, in one place.
 */
function pendingBooking(input: Parameters<typeof Booking.create>[0]): Booking {
  const draft = Booking.create(input);
  // `submit` now takes the address explicitly; every fixture here sets a
  // concrete one via `bookingInput`, so pulling it back off the draft is safe.
  return draft
    .submit(new Date(), input.expiresAt, {
      label: draft.addressLabel as string,
      line: draft.addressLine as string,
      city: draft.addressCity as string,
    })
    .accept(new Date(), input.expiresAt);
}

/** Answers every charge the same way, and records what it was asked. */
class FixedCharge implements PaymentChargePort {
  public requests: PaymentChargeRequest[] = [];
  constructor(private readonly result: PaymentChargeResult) {}
  readiness(): PaymentChargeReadiness {
    return { ready: true };
  }
  async charge(request: PaymentChargeRequest): Promise<PaymentChargeResult> {
    this.requests.push(request);
    return this.result;
  }
}

/**
 * The charge sweep wired the way `bootstrapBooking()` wires it, with the
 * processor swapped for a fake — the one substitution this file makes, and
 * the only one it can make without moving money.
 */
/**
 * `now` reaches the per-booking command as well as the wave, and it has to:
 * the command stamps `last_charge_attempt_at` from its own clock (see its
 * constructor), so a test driving a fictional 2027 wave against a command
 * still reading the real 2026 wall clock would write a stamp a year in the
 * past — and every cooldown assertion in this file would pass for the wrong
 * reason. That is exactly how the stale-wave test below first failed.
 */
function buildChargeBooking(paymentCharge: PaymentChargePort, now: () => Date) {
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());
  return new ChargeBookingCommand(
    repo,
    new DrizzleCustomerPhoneReader(),
    paymentCharge,
    new MarkBookingPaidCommand(repo, unitOfWork, outboxPort),
    now,
  );
}

function buildSweep(paymentCharge: PaymentChargePort, now: () => Date) {
  return new ChargeAcceptedBookingsInternalCommand(
    repo,
    buildChargeBooking(paymentCharge, now),
    now,
  );
}

/** The criteria a wave running at `now` would compute — selection and claim alike. */
function criteriaAt(now: Date) {
  return {
    deadlineAfter: new Date(now.getTime() + BOOKING_CHARGE_MIN_WINDOW_MS),
    limit: 10,
    maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
    notAttemptedSince: new Date(now.getTime() - BOOKING_CHARGE_RETRY_MINUTES * 60_000),
  };
}

/** See `booking-sweep.test.ts`'s own `withBookings` for why the cleanup is a `finally`. */
async function withBookings(
  body: (track: (created: Booking) => Booking) => Promise<void>,
): Promise<void> {
  const ids: string[] = [];
  await __runWithTransactionContextForTests(db, async () => {
    try {
      await body((created) => {
        const id = created.id as string;
        ids.push(id);
        createdBookingIds.push(id);
        return created;
      });
    } finally {
      for (const id of ids) {
        await db.delete(booking).where(eq(booking.id, id));
      }
    }
  });
}

/** The two charge-bookkeeping columns, read straight off the row. */
async function chargeStateOf(bookingId: string) {
  const [row] = await db
    .select({
      status: booking.status,
      paymentRef: booking.paymentRef,
      chargeAttempts: booking.chargeAttempts,
      lastChargeAttemptAt: booking.lastChargeAttemptAt,
    })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);
  return row;
}

/**
 * Moves a booking's charge bookkeeping directly, so a test can set up "this
 * one has already been tried N times, M minutes ago" without running N
 * charges. Writing the columns rather than looping is the point: the loop
 * would also be exercising `recordChargeAttempt`, and then a bug in it would
 * make the selection tests pass for the wrong reason.
 */
async function setChargeState(
  bookingId: string,
  state: { chargeAttempts: number; lastChargeAttemptAt: Date | null },
): Promise<void> {
  await db.update(booking).set(state).where(eq(booking.id, bookingId));
}

describe("findAwaitingCharge, through the sweep", () => {
  test("charges an accepted booking that has never been charged", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-05T12:00:00.000Z");
      const due = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-05T14:00:00.000Z"),
              // Inside its payment window: the deadline is still ahead of
              // `now`, which is what makes this the charge sweep's row and
              // not the deadline sweep's.
              expiresAt: new Date("2027-06-05T12:15:00.000Z"),
            }),
          ),
          1,
        ),
      );
      expect(due.status).toBe("PENDING_PAYMENT");

      const charge = new FixedCharge({
        outcome: "refused",
        code: "INS-9",
        description: "Request timeout",
      });
      const result = await buildSweep(charge, () => now).execute({ limit: 10 });

      expect(result).toEqual({ attempted: 1, failed: 0 });
      // The booking's own money and the customer's own handset, read back
      // out of the database through the real adapters.
      expect(charge.requests).toHaveLength(1);
      expect(charge.requests[0]).toMatchObject({
        bookingId: due.id as string,
        phone: "+258841234567",
        amountMinor: 100_000,
        currency: "MZN",
      });
    });
  });

  /**
   * A failed charge is not a cancellation. The booking keeps its slot and
   * stays payable until its payment window closes; only then does the
   * deadline sweep end it, with a reason, for the provider. What changes is
   * the bookkeeping — which is the only thing that eventually stops the
   * retrying.
   */
  test("a failure increments the attempt count and leaves the booking payable", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-06T12:00:00.000Z");
      const due = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-06T14:00:00.000Z"),
              expiresAt: new Date("2027-06-06T12:15:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const id = due.id as string;
      expect((await chargeStateOf(id))?.chargeAttempts).toBe(0);

      await buildSweep(
        new FixedCharge({ outcome: "refused", code: "INS-9", description: "Request timeout" }),
        () => now,
      ).execute({ limit: 10 });

      const after = await chargeStateOf(id);
      expect(after?.status).toBe("PENDING_PAYMENT");
      expect(after?.paymentRef).toBeNull();
      expect(after?.chargeAttempts).toBe(1);
      // Stamped, because the cooldown is what stops the next wave — sixty
      // seconds from now — pushing a second prompt on top of this one.
      expect(after?.lastChargeAttemptAt).not.toBeNull();
    });
  });

  test("a successful charge confirms the booking with the processor's own reference", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-07T12:00:00.000Z");
      const due = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-07T14:00:00.000Z"),
              expiresAt: new Date("2027-06-07T12:15:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const id = due.id as string;

      await buildSweep(
        new FixedCharge({ outcome: "paid", paymentRef: "7SHV1234567" }),
        () => now,
      ).execute({ limit: 10 });

      const after = await chargeStateOf(id);
      expect(after?.status).toBe("CONFIRMED");
      // M-Pesa's transaction id, not our attempt reference. This is what
      // `markPaid` deduplicates on and what a refund would have to name.
      expect(after?.paymentRef).toBe("7SHV1234567");
      // The attempt still counted. It is charged, so it will never be
      // selected again — the count is a record of what happened, not a
      // budget that has to be handed back.
      expect(after?.chargeAttempts).toBe(1);
    });
  });

  /**
   * `PENDING_PAYMENT` is both the status filter and the "not yet charged"
   * test: a charge that lands moves the booking to `CONFIRMED`, so there is
   * no separate flag to go stale. Which means this test is really asking
   * whether the status filter is there at all — without it, every confirmed
   * booking on the platform would be charged a second time, every minute.
   */
  test("does not charge a booking that is already CONFIRMED", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-08T12:00:00.000Z");
      const confirmed = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-08T14:00:00.000Z"),
              expiresAt: new Date("2027-06-08T12:15:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const id = confirmed.id as string;
      // Paid by something else — a retry from the customer's own screen, a
      // wave that ran a minute ago. Written through the aggregate and the
      // real `save`, so the row is exactly what a real payment leaves.
      const paid = confirmed.markPaid("ALREADY-PAID", now);
      expect(await repo.save(paid, "PENDING_PAYMENT")).toBe(true);

      const charge = new FixedCharge({ outcome: "paid", paymentRef: "SECOND-CHARGE" });
      const result = await buildSweep(charge, () => now).execute({ limit: 10 });

      expect(result).toEqual({ attempted: 0, failed: 0 });
      expect(charge.requests).toEqual([]);
      expect((await chargeStateOf(id))?.paymentRef).toBe("ALREADY-PAID");
    });
  });

  /**
   * The bound is what makes a permanent failure visible rather than
   * infinite. Past it the sweep stops attempting and the booking is left to
   * its payment window, which cancels it and tells the provider — Task 4's
   * path, reached with **no special case**: this sweep simply stops selecting
   * the row.
   */
  test("does not charge a booking that has spent its retry bound", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-09T12:00:00.000Z");
      const spent = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-09T14:00:00.000Z"),
              expiresAt: new Date("2027-06-09T12:15:00.000Z"),
            }),
          ),
          1,
        ),
      );
      await setChargeState(spent.id as string, {
        chargeAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
        // Long enough ago that the cooldown is not what is keeping it out —
        // otherwise this test would pass with no bound implemented at all.
        lastChargeAttemptAt: new Date(now.getTime() - 60 * 60_000),
      });

      const charge = new FixedCharge({ outcome: "paid", paymentRef: "NEVER" });
      const result = await buildSweep(charge, () => now).execute({ limit: 10 });

      expect(result).toEqual({ attempted: 0, failed: 0 });
      expect(charge.requests).toEqual([]);
    });
  });

  test("charges a booking one attempt short of the bound", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-10T12:00:00.000Z");
      const nearlySpent = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-10T14:00:00.000Z"),
              expiresAt: new Date("2027-06-10T12:15:00.000Z"),
            }),
          ),
          1,
        ),
      );
      await setChargeState(nearlySpent.id as string, {
        chargeAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT - 1,
        lastChargeAttemptAt: new Date(now.getTime() - 60 * 60_000),
      });

      const charge = new FixedCharge({
        outcome: "refused",
        code: "INS-9",
        description: "Request timeout",
      });
      const result = await buildSweep(charge, () => now).execute({ limit: 10 });

      // The boundary in both directions: this row and the one above differ by
      // exactly one attempt, and only one of them is charged. A `<=` where
      // the query has `<` would charge both.
      expect(result).toEqual({ attempted: 1, failed: 0 });
      expect((await chargeStateOf(nearlySpent.id as string))?.chargeAttempts).toBe(
        BOOKING_CHARGE_ATTEMPT_LIMIT,
      );
    });
  });

  /**
   * The cooldown, which exists because the cron interval is shorter than the
   * call: a C2B blocks for about sixty seconds and the sweep wakes every
   * sixty. Without this, wave two starts while wave one's prompt is still
   * live on the customer's handset — a second prompt over a pending one, and
   * two debits if they accept both.
   */
  test("does not charge a booking prompted a moment ago", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-11T12:00:00.000Z");
      const justTried = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-11T14:00:00.000Z"),
              expiresAt: new Date("2027-06-11T12:15:00.000Z"),
            }),
          ),
          1,
        ),
      );
      await setChargeState(justTried.id as string, {
        chargeAttempts: 1,
        // One minute ago: the very next cron tick, and the case this whole
        // column exists for.
        lastChargeAttemptAt: new Date(now.getTime() - 60_000),
      });

      const charge = new FixedCharge({ outcome: "paid", paymentRef: "NEVER" });
      const result = await buildSweep(charge, () => now).execute({ limit: 10 });

      expect(result).toEqual({ attempted: 0, failed: 0 });
      expect(charge.requests).toEqual([]);
    });
  });

  test("charges again once the cooldown has passed", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-12T12:00:00.000Z");
      const cooled = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-12T14:00:00.000Z"),
              expiresAt: new Date("2027-06-12T12:30:00.000Z"),
            }),
          ),
          1,
        ),
      );
      await setChargeState(cooled.id as string, {
        chargeAttempts: 1,
        lastChargeAttemptAt: new Date(
          now.getTime() - (BOOKING_CHARGE_RETRY_MINUTES + 1) * 60_000,
        ),
      });

      const charge = new FixedCharge({
        outcome: "refused",
        code: "INS-9",
        description: "Request timeout",
      });
      const result = await buildSweep(charge, () => now).execute({ limit: 10 });

      expect(result).toEqual({ attempted: 1, failed: 0 });
      expect((await chargeStateOf(cooled.id as string))?.chargeAttempts).toBe(2);
    });
  });

  /**
   * The two sweeps read the same column from opposite ends —
   * `findDueForSweep` takes `expires_at <= now`, this one takes
   * `expires_at > now` — so their results are disjoint by construction. This
   * is the test of that: a booking whose payment window has already closed is
   * the deadline sweep's to cancel, and asking its customer for money on the
   * way past would be the platform debiting somebody for a booking it is
   * about to call off.
   */
  test("does not charge a booking whose payment window has already closed", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-13T12:00:00.000Z");
      const lapsed = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-13T14:00:00.000Z"),
              // Ten minutes in the past: due for the deadline sweep, which
              // will cancel it and tell the provider.
              expiresAt: new Date("2027-06-13T11:50:00.000Z"),
            }),
          ),
          1,
        ),
      );
      expect(lapsed.status).toBe("PENDING_PAYMENT");

      const charge = new FixedCharge({ outcome: "paid", paymentRef: "NEVER" });
      const result = await buildSweep(charge, () => now).execute({ limit: 10 });

      expect(result).toEqual({ attempted: 0, failed: 0 });
      expect(charge.requests).toEqual([]);
    });
  });

  /**
   * A booking whose payment window closes mid-call must not be charged: the
   * call blocks for up to 110 seconds, and the next invocation's *deadline*
   * sweep runs first — it would cancel the booking and tell the provider the
   * customer did not pay, and then the charge would return `INS-0`. A debited
   * customer, a cancelled booking, and a provider told the opposite of what
   * happened.
   *
   * Two bookings a minute apart, either side of `BOOKING_CHARGE_MIN_WINDOW_MS`,
   * so the boundary is proven in both directions rather than the safe one
   * only.
   */
  test("does not charge a booking that cannot survive the call", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-15T12:00:00.000Z");

      const tooLate = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-15T14:00:00.000Z"),
              // Inside the window, so `expires_at > now` — and still too
              // close to survive a call that can take nearly two minutes.
              expiresAt: new Date(now.getTime() + BOOKING_CHARGE_MIN_WINDOW_MS - 60_000),
            }),
          ),
          1,
        ),
      );
      const roomy = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-15T16:00:00.000Z"),
              expiresAt: new Date(now.getTime() + BOOKING_CHARGE_MIN_WINDOW_MS + 60_000),
            }),
          ),
          1,
        ),
      );

      const charge = new FixedCharge({
        outcome: "refused",
        code: "INS-9",
        description: "Request timeout",
      });
      const result = await buildSweep(charge, () => now).execute({ limit: 10 });

      expect(result).toEqual({ attempted: 1, failed: 0 });
      expect(charge.requests.map((r) => r.bookingId)).toEqual([roomy.id as string]);
      // Untouched — not even an attempt counted against it. It will run out
      // and be cancelled, which is where it was heading anyway.
      expect((await chargeStateOf(tooLate.id as string))?.chargeAttempts).toBe(0);
    });
  });

  /**
   * **The two-wave race, and the reason `recordChargeAttempt` carries the
   * selection predicate rather than being a counter.**
   *
   * Waves overlap by construction: a wave charges up to five bookings one at
   * a time, an unanswered C2B blocks for about sixty seconds, and the cron
   * fires every sixty. So wave 2 starts while wave 1 is still blocked on its
   * first booking, and wave 2's candidate list is read *before* wave 1
   * reaches the bookings further down its own list.
   *
   * That stale list is exactly what this test reconstructs: wave 2 selects,
   * wave 1 then runs to completion, and only afterwards does wave 2 act on
   * what it selected. With the predicate only in the `SELECT`, wave 2 pushes
   * a second prompt at a handset already showing one — one second apart —
   * and a customer who accepts both is debited twice. With it in the
   * `UPDATE`, wave 2's claim matches zero rows and it charges nobody.
   */
  test("a second wave acting on a stale candidate list charges nobody", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-16T12:00:00.000Z");
      const contested = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-16T14:00:00.000Z"),
              expiresAt: new Date("2027-06-16T12:30:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const id = contested.id as string;
      const criteria = criteriaAt(now);

      // Wave 2 reads its candidates first — before wave 1 has touched
      // anything. This is the whole setup: a list that is about to go stale.
      const waveTwoCandidates = await repo.findAwaitingCharge(criteria);
      expect(waveTwoCandidates.map((b) => b.id)).toContain(id);

      // Wave 1 runs to completion and prompts the customer.
      const charge = new FixedCharge({
        outcome: "refused",
        code: "INS-9",
        description: "Request timeout",
      });
      await buildSweep(charge, () => now).execute({ limit: 10 });
      expect(charge.requests).toHaveLength(1);

      // Wave 2 now acts on the list it read a minute ago.
      await buildChargeBooking(charge, () => now).execute({
        bookingId: id,
        maxAttempts: criteria.maxAttempts,
        notAttemptedSince: criteria.notAttemptedSince,
      });

      // Still one. The second prompt never happened.
      expect(charge.requests).toHaveLength(1);
      expect((await chargeStateOf(id))?.chargeAttempts).toBe(1);
    });
  });

  /**
   * The bound, re-asserted at the write rather than only at the select. A
   * wave holding a stale list of a booking that has since exhausted its
   * attempts must not be the fourth charge against a limit of three.
   */
  test("the claim refuses a booking that spent its bound after the select", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-17T12:00:00.000Z");
      const booking1 = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-17T14:00:00.000Z"),
              expiresAt: new Date("2027-06-17T12:30:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const id = booking1.id as string;
      const criteria = criteriaAt(now);

      // Selected while it still had attempts left...
      expect((await repo.findAwaitingCharge(criteria)).map((b) => b.id)).toContain(id);

      // ...and spent them before the claim ran.
      await setChargeState(id, {
        chargeAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
        lastChargeAttemptAt: new Date(now.getTime() - 60 * 60_000),
      });

      const claimed = await repo.recordChargeAttempt({
        bookingId: id,
        at: now,
        maxAttempts: criteria.maxAttempts,
        notAttemptedSince: criteria.notAttemptedSince,
        deadlineAfter: criteria.deadlineAfter,
      });

      expect(claimed).toBeNull();
      // And the losing claim wrote nothing — not even the attempt it was
      // refused for.
      expect((await chargeStateOf(id))?.chargeAttempts).toBe(BOOKING_CHARGE_ATTEMPT_LIMIT);
    });
  });

  test("the claim returns this attempt's own number, so two waves cannot share a reference", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-18T12:00:00.000Z");
      const booking1 = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-18T14:00:00.000Z"),
              expiresAt: new Date("2027-06-18T12:30:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const id = booking1.id as string;

      // Two claims far enough apart that the cooldown lets the second
      // through: the numbers must differ, because a repeated payment
      // reference is refused by the processor as a duplicate.
      const first = await repo.recordChargeAttempt({
        bookingId: id,
        at: now,
        maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
        notAttemptedSince: new Date(now.getTime() - BOOKING_CHARGE_RETRY_MINUTES * 60_000),
        deadlineAfter: new Date(now.getTime() + BOOKING_CHARGE_MIN_WINDOW_MS),
      });
      const later = new Date(now.getTime() + (BOOKING_CHARGE_RETRY_MINUTES + 1) * 60_000);
      const second = await repo.recordChargeAttempt({
        bookingId: id,
        at: later,
        maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
        notAttemptedSince: new Date(later.getTime() - BOOKING_CHARGE_RETRY_MINUTES * 60_000),
        deadlineAfter: new Date(later.getTime() + BOOKING_CHARGE_MIN_WINDOW_MS),
      });

      expect(first).toBe(1);
      expect(second).toBe(2);
    });
  });

  test("the claim refuses a booking prompted a moment ago, even from a stale select", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-19T12:00:00.000Z");
      const booking1 = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-19T14:00:00.000Z"),
              expiresAt: new Date("2027-06-19T12:30:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const id = booking1.id as string;

      const first = await repo.recordChargeAttempt({
        bookingId: id,
        at: now,
        maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
        notAttemptedSince: new Date(now.getTime() - BOOKING_CHARGE_RETRY_MINUTES * 60_000),
        deadlineAfter: new Date(now.getTime() + BOOKING_CHARGE_MIN_WINDOW_MS),
      });
      expect(first).toBe(1);

      // A second wave one minute later — the very next cron tick, still well
      // inside the cooldown, and the exact case the column exists for.
      const nextTick = new Date(now.getTime() + 60_000);
      const second = await repo.recordChargeAttempt({
        bookingId: id,
        at: nextTick,
        maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
        notAttemptedSince: new Date(nextTick.getTime() - BOOKING_CHARGE_RETRY_MINUTES * 60_000),
        deadlineAfter: new Date(nextTick.getTime() + BOOKING_CHARGE_MIN_WINDOW_MS),
      });

      expect(second).toBeNull();
      expect((await chargeStateOf(id))?.chargeAttempts).toBe(1);
    });
  });

  /**
   * **The criterion the claim was missing, and the only one whose absence
   * could lose a customer's money outright.**
   *
   * A wave of five bookings at ~62 s each runs past five minutes. It selects
   * against a floor computed at 12:00:00, reaches its last booking at
   * 12:04:08, and — with only the status, the bound and the cooldown in the
   * claim — charges a booking whose window closes at 12:04:30. At 12:05:00
   * the deadline sweep cancels it and tells the provider the customer did not
   * pay; at 12:05:05 the customer types their PIN. `INS-0`, and the money
   * exists nowhere in the database.
   *
   * The selection cannot catch this: its floor was true when it ran and is
   * stale by the time the booking is reached. Only the claim can, which is
   * why the claim computes its floor from its own instant.
   *
   * This is also what protects the property that makes "refunds are out of
   * scope" survivable — that a `CANCELLED` booking has never been charged.
   */
  test("the claim refuses a booking whose window closed after the select", async () => {
    await withBookings(async (track) => {
      const selectedAt = new Date("2027-06-20T12:00:00.000Z");
      // Comfortably clear of the floor when the wave selected it...
      const expiresAt = new Date(selectedAt.getTime() + BOOKING_CHARGE_MIN_WINDOW_MS + 90_000);
      const contested = track(
        await repo.insert(
          pendingBooking(
            bookingInput({ startsAt: new Date("2027-06-20T14:00:00.000Z"), expiresAt }),
          ),
          1,
        ),
      );
      const id = contested.id as string;
      const criteria = criteriaAt(selectedAt);

      expect((await repo.findAwaitingCharge(criteria)).map((b) => b.id)).toContain(id);

      // ...and no longer clear by the time the wave, four minutes into its
      // own blocking calls, actually reaches it.
      const claimedAt = new Date(selectedAt.getTime() + 4 * 60_000);
      const claimed = await repo.recordChargeAttempt({
        bookingId: id,
        at: claimedAt,
        maxAttempts: criteria.maxAttempts,
        notAttemptedSince: criteria.notAttemptedSince,
        deadlineAfter: new Date(claimedAt.getTime() + BOOKING_CHARGE_MIN_WINDOW_MS),
      });

      expect(claimed).toBeNull();
      // Nothing written: the booking is left exactly as the deadline sweep
      // will find it.
      expect((await chargeStateOf(id))?.chargeAttempts).toBe(0);
    });
  });

  /**
   * An outcome we could not read takes the booking out of the sweep's reach
   * for good, whatever its attempt count — see `ChargeBookingCommand`'s
   * `ambiguous` branch for why a retry is the one thing that must not happen.
   * It leaves by the ordinary door: the bound is spent and the payment window
   * cancels it.
   */
  test("an abandoned booking is never selected again", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-21T12:00:00.000Z");
      const abandoned = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2027-06-21T14:00:00.000Z"),
              expiresAt: new Date("2027-06-21T12:30:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const id = abandoned.id as string;

      await repo.abandonCharge({
        bookingId: id,
        at: now,
        maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
      });

      expect((await chargeStateOf(id))?.chargeAttempts).toBe(BOOKING_CHARGE_ATTEMPT_LIMIT);
      expect((await repo.findAwaitingCharge(criteriaAt(now))).map((b) => b.id)).not.toContain(id);
      // And it cannot be revived by a bound lowered in a later deploy —
      // `GREATEST`, not an assignment.
      await repo.abandonCharge({ bookingId: id, at: now, maxAttempts: 1 });
      expect((await chargeStateOf(id))?.chargeAttempts).toBe(BOOKING_CHARGE_ATTEMPT_LIMIT);
    });
  });

  test("honours the caller's limit", async () => {
    await withBookings(async (track) => {
      const now = new Date("2027-06-14T12:00:00.000Z");
      for (const hour of [14, 16, 18]) {
        track(
          await repo.insert(
            pendingBooking(
              bookingInput({
                startsAt: new Date(`2027-06-14T${hour}:00:00.000Z`),
                expiresAt: new Date("2027-06-14T12:15:00.000Z"),
              }),
            ),
            1,
          ),
        );
      }

      const charge = new FixedCharge({
        outcome: "refused",
        code: "INS-9",
        description: "Request timeout",
      });
      const result = await buildSweep(charge, () => now).execute({ limit: 2 });

      // Two, not three: the limit reaches the query rather than being
      // dropped on the way. The third is not lost — the next wave takes it.
      expect(result).toEqual({ attempted: 2, failed: 0 });
      expect(charge.requests).toHaveLength(2);
    });
  });
});
