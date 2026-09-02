/**
 * `DrizzleBookingRepository.insert(entity, capacity)` — Task 3 of the
 * booking-seats plan. Assigning a seat under a lock is the one thing in this
 * plan that has to be proven against real, concurrent Postgres connections:
 * a fake has no notion of two transactions racing the same row, and a
 * sequential test cannot show a lock blocking anything — the second call
 * would see its own transaction's write and pick the next seat whether or
 * not a lock exists. See `insert`'s own doc comment in `booking.repository.ts`
 * for the mechanism these tests exist to prove.
 *
 * Two connection styles, on purpose:
 * - Every test except the concurrency one binds this file's own `DEV_DB_URL`
 *   connection into `tx-context`'s AsyncLocalStorage via
 *   `__runWithTransactionContextForTests`, the same mechanism
 *   `booking-repository.test.ts` uses — no real `BEGIN`, so each statement
 *   autocommits on its own. That is fine here: these tests call `insert`
 *   sequentially, and sequential correctness never depends on a lock
 *   surviving across statements, only on each call's write committing
 *   before the next call's read runs — which autocommit already guarantees.
 * - The concurrency test needs the opposite: two independent connections,
 *   each wrapped in a REAL transaction (`DrizzleUnitOfWork.atomicExecute`,
 *   the same class `CreateBookingCommand` actually uses), so the advisory
 *   lock taken inside `insert` genuinely holds across the occupancy read and
 *   the write that follows it. An advisory lock taken outside a real
 *   transaction releases the instant its own statement finishes — see the
 *   proof-of-life test at the bottom of this file, which removes the lock
 *   call and records what breaks.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { Db } from "../../../../../../shared/infrastructure/database/connection";
import {
  infraStore,
  type InfraEnvBindings,
} from "../../../../../../shared/infrastructure/stores/infra-store";
import { DrizzleUnitOfWork } from "../../../../../../shared/infrastructure/unit-of-work";
import { category } from "../catalog/schemas/category.schema";
import { service, serviceOption } from "../catalog/schemas/service.schema";
import { provider } from "../provider/schemas/provider.schema";
import { providerMember } from "../provider/schemas/provider-member.schema";
import { user } from "../user/schemas/user.schema";
import { booking } from "../booking/schemas/booking.schema";
import { Booking } from "../../../../bounded-contexts/booking/domain/aggregates/booking.aggregate";
import { SlotAlreadyTakenError } from "../../../../bounded-contexts/booking/domain/exceptions";
import { DrizzleBookingRepository } from "../../../../bounded-contexts/booking/infrastructure/repositories/drizzle/booking.repository";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
// `{ schema: authSchema }` for the same reason `booking-repository.test.ts`
// needs it: `DrizzleDb` (what `__runWithTransactionContextForTests` binds
// into AsyncLocalStorage) is typed against this schema shape.
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

beforeAll(async () => {
  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    {
      id: customerId,
      email: `booking-seat-customer-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerUserId,
      email: `booking-seat-owner-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Booking Seat Test Provider",
      slug: `booking-seat-test-${suffix}`,
      status: "active",
      // Explicit, not relied on as the schema's default: this is the
      // timezone `insert` reads to derive the civil day the advisory lock is
      // keyed on, and a test that left it implicit would stop meaning
      // anything the day that default changed.
      timezone: "Africa/Maputo",
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
    .values({ code: `booking-seat-test-${suffix}` })
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
    () => db.delete(booking).where(eq(booking.providerId, providerId)),
    () => db.delete(serviceOption).where(eq(serviceOption.id, serviceOptionId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(user).where(eq(user.id, customerId)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

/** Every `Booking.create` input this file needs, with a distinct slot per call. */
function bookingInput(
  overrides: Partial<Parameters<typeof Booking.create>[0]> = {},
): Parameters<typeof Booking.create>[0] {
  return {
    customerId,
    providerId,
    serviceId,
    serviceOptionId,
    providerMemberId: memberId,
    startsAt: new Date("2026-11-01T09:00:00.000Z"),
    durationMinutes: 60,
    priceMinor: 100_000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName: "Corte de Cabelo",
    providerName: "Booking Seat Test Provider",
    providerSlug: `booking-seat-test-${suffix}`,
    optionName: "Standard",
    addressLabel: "Salão",
    addressLine: "Av. Julius Nyerere 123",
    addressCity: "Maputo",
    addressDistrict: "Sommerschield",
    description: null,
    expiresAt: new Date("2026-11-01T09:30:00.000Z"),
    ...overrides,
  };
}

/** Reads `seat` straight off the row — the aggregate never carries it. */
async function seatOf(bookingId: string): Promise<number> {
  const [row] = await sql`SELECT seat FROM ntizo_booking.booking WHERE id = ${bookingId}`;
  return Number(row?.["seat"]);
}

describe("insert(entity, capacity): sequential assignment", () => {
  test("capacity 2: two overlapping bookings on one member both succeed, holding different seats", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const slotStart = new Date("2026-11-02T09:00:00.000Z");

      const first = await repo.insert(
        Booking.create(bookingInput({ startsAt: slotStart, expiresAt: new Date("2026-11-02T09:30:00.000Z") })),
        2,
      );
      const second = await repo.insert(
        Booking.create(bookingInput({ startsAt: slotStart, expiresAt: new Date("2026-11-02T09:30:00.000Z") })),
        2,
      );

      expect(first.id).toBeString();
      expect(second.id).toBeString();
      const seats = [await seatOf(first.id as string), await seatOf(second.id as string)];
      seats.sort((a, b) => a - b);
      expect(seats).toEqual([1, 2]);

      await db.delete(booking).where(eq(booking.id, first.id as string));
      await db.delete(booking).where(eq(booking.id, second.id as string));
    });
  });

  test("capacity 2: a third overlapping booking is refused — the third specifically, with the named error", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const slotStart = new Date("2026-11-03T09:00:00.000Z");
      const expiresAt = new Date("2026-11-03T09:30:00.000Z");

      const first = await repo.insert(Booking.create(bookingInput({ startsAt: slotStart, expiresAt })), 2);
      const second = await repo.insert(Booking.create(bookingInput({ startsAt: slotStart, expiresAt })), 2);
      expect(first.id).toBeString();
      expect(second.id).toBeString();

      const third = Booking.create(bookingInput({ startsAt: slotStart, expiresAt }));
      const error = await repo.insert(third, 2).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(SlotAlreadyTakenError);
      expect((error as SlotAlreadyTakenError).providerMemberId).toBe(memberId);
      expect((error as SlotAlreadyTakenError).startsAt).toEqual(slotStart);

      // The third booking was refused, not merely "some booking" — both
      // seats 1 and 2 are still held by the first two.
      expect(await seatOf(first.id as string)).toBe(1);
      expect(await seatOf(second.id as string)).toBe(2);

      await db.delete(booking).where(eq(booking.id, first.id as string));
      await db.delete(booking).where(eq(booking.id, second.id as string));
    });
  });

  test("capacity 1: a second overlapping booking is refused, same as before seats existed — Task 1's guarantee is not lost while making room", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const slotStart = new Date("2026-11-04T09:00:00.000Z");
      const expiresAt = new Date("2026-11-04T09:30:00.000Z");

      const first = await repo.insert(Booking.create(bookingInput({ startsAt: slotStart, expiresAt })), 1);
      expect(first.id).toBeString();
      expect(await seatOf(first.id as string)).toBe(1);

      const second = Booking.create(bookingInput({ startsAt: slotStart, expiresAt }));
      const error = await repo.insert(second, 1).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(SlotAlreadyTakenError);

      await db.delete(booking).where(eq(booking.id, first.id as string));
    });
  });

  test("capacity reduced from 3 to 1 with seats 2 and 3 occupied: existing bookings survive a read, and a new one is refused", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const slotStart = new Date("2026-11-05T09:00:00.000Z");
      const expiresAt = new Date("2026-11-05T09:30:00.000Z");

      const first = await repo.insert(Booking.create(bookingInput({ startsAt: slotStart, expiresAt })), 3);
      const second = await repo.insert(Booking.create(bookingInput({ startsAt: slotStart, expiresAt })), 3);
      const third = await repo.insert(Booking.create(bookingInput({ startsAt: slotStart, expiresAt })), 3);
      expect([await seatOf(first.id as string), await seatOf(second.id as string), await seatOf(third.id as string)])
        .toEqual([1, 2, 3]);

      // The rule now says capacity 1 — the lowest free seat is 4, which
      // exceeds it, so the fourth booking is refused. Nothing about the
      // first three moves: they were never re-evaluated against the new
      // capacity, only the newcomer was.
      const fourth = Booking.create(bookingInput({ startsAt: slotStart, expiresAt }));
      const error = await repo.insert(fourth, 1).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SlotAlreadyTakenError);

      expect(await repo.findById(first.id as string)).not.toBeNull();
      expect(await repo.findById(second.id as string)).not.toBeNull();
      expect(await repo.findById(third.id as string)).not.toBeNull();

      await db.delete(booking).where(eq(booking.id, first.id as string));
      await db.delete(booking).where(eq(booking.id, second.id as string));
      await db.delete(booking).where(eq(booking.id, third.id as string));
    });
  });
});

/**
 * A synchronisation barrier of exactly `count` arrivals. Used below to start
 * two racers' critical sections (lock → read → insert) as close to
 * simultaneously as `Promise.all` scheduling allows, rather than trusting
 * that two independent `await`-chains happen to overlap on their own. The
 * network round trips to Neon inside each racer's transaction are what
 * actually create the race once both are released together.
 */
function makeBarrier(count: number): { gate: Promise<void>; arrive: () => void } {
  let arrived = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    gate,
    arrive: () => {
      arrived += 1;
      if (arrived >= count) release();
    },
  };
}

const TEST_ENV: InfraEnvBindings = {
  STAGE: "local",
  LOG_LEVEL: "info",
  DATABASE_URL: process.env["DEV_DB_URL"] as string,
  BETTER_AUTH_SECRET: "s",
  RESEND_API_KEY: "",
  EMAIL_FROM: "a@b.c",
  APP_URL: "https://ntizo.test",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
};

/**
 * Runs `work` inside its own request-scoped connection and its own real
 * transaction — `infraStore.runAsync` gives it a fresh AsyncLocalStorage
 * scope (so `Db.getDbConnection()` opens a brand-new socket, independent of
 * any other racer's), and `DrizzleUnitOfWork.atomicExecute` is the exact
 * class `CreateBookingCommand` wraps `repo.insert` in — not a stand-in for
 * it. Closes its own connection in `finally`, mirroring
 * `booking-repository.test.ts`'s "a real atomicExecute rolling back" test.
 */
async function insertInOwnTransaction(entity: Booking, capacity: number): Promise<Booking> {
  return infraStore.runAsync(TEST_ENV, async () => {
    try {
      return await new DrizzleUnitOfWork().atomicExecute(() => repo.insert(entity, capacity));
    } finally {
      await Db.closeDbConnection();
    }
  });
}

describe("insert(entity, capacity): the advisory lock, under real concurrency", () => {
  /**
   * The test that decides this task. Two genuinely separate connections,
   * each opening a real transaction, both racing to assign a seat for the
   * same member on the same civil day. A sequential test cannot show this —
   * the second call would see its own transaction's write and pick the next
   * seat whether or not a lock exists, since by the time it runs the first
   * call has already committed. Here, both calls are released from the
   * barrier together and each still has to complete its own network round
   * trip to Neon (lock, occupancy read, insert, commit) before the other's
   * transaction has necessarily finished — a real overlap, not a scheduling
   * accident.
   *
   * If the lock did not serialise them, both would read "no occupants"
   * before either wrote, both would compute seat 1, and one of the two
   * inserts would collide on `booking_member_slot_no_overlap` — see the
   * proof-of-life test below, which removes the lock and records exactly
   * that.
   */
  test("two real concurrent transactions assigning a seat for the same member and day both succeed, on different seats", async () => {
    const slotStart = new Date("2026-11-06T09:00:00.000Z");
    const expiresAt = new Date("2026-11-06T09:30:00.000Z");
    const capacity = 2;

    const bookingA = Booking.create(
      bookingInput({ customerId, startsAt: slotStart, expiresAt }),
    );
    const bookingB = Booking.create(
      bookingInput({ customerId, startsAt: slotStart, expiresAt }),
    );

    const barrier = makeBarrier(2);
    const racer = async (entity: Booking): Promise<Booking> => {
      barrier.arrive();
      await barrier.gate;
      return insertInOwnTransaction(entity, capacity);
    };

    const [resultA, resultB] = await Promise.all([racer(bookingA), racer(bookingB)]);

    expect(resultA.id).toBeString();
    expect(resultB.id).toBeString();
    expect(resultA.id).not.toBe(resultB.id);

    const seats = [await seatOf(resultA.id as string), await seatOf(resultB.id as string)];
    seats.sort((a, b) => a - b);
    // Both succeeded, and on different seats — not "some booking succeeded",
    // both of them, each with its own seat.
    expect(seats).toEqual([1, 2]);

    await db.delete(booking).where(eq(booking.id, resultA.id as string));
    await db.delete(booking).where(eq(booking.id, resultB.id as string));
  });
});
