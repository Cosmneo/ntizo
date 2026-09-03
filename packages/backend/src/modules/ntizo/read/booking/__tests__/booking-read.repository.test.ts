/**
 * `DrizzleBookingReadRepository`'s customer-side tabs — `listForCustomer`,
 * `countForCustomer` and `countsForCustomer` — against the real dev
 * database, for the same reason and by the same mechanism as
 * `provider-bookings.repository.test.ts` beside it: the WHERE clause that
 * sorts a booking into a tab, and the CASE expression the three counts
 * share, are joins and predicates a fake repository could not prove.
 *
 * `getDb()` resolves through the app's request-scoped AsyncLocalStorage
 * context and a test has no request, so every body runs inside
 * `__runWithTransactionContextForTests` with this file's own `DEV_DB_URL`
 * client bound into it, exactly as the neighbouring files do.
 *
 * Each test seeds its own bookings through `seedBooking`, which walks a
 * fresh `Booking` through exactly the transitions its status requires —
 * `submit`, `accept`, `markPaid`, `decline` — never a row written straight
 * to the target status. A row that skipped those hops would never have
 * passed `Booking`'s own guards on the way there, and would prove nothing
 * about a row `Booking` could actually produce.
 *
 * An `afterEach` deletes every booking belonging to ALICE or BOB once each
 * test body finishes. `countsForCustomer` sums a customer's entire history,
 * not one test's fixture, so without this a count asserted in one test
 * would be inflated by a booking an earlier test left behind — the same
 * failure mode a shared customer id across tests would otherwise invite.
 *
 * Fixtures follow `provider-bookings.repository.test.ts`'s pattern: one
 * provider and one provider member, created fresh under a random `suffix`
 * in `beforeAll`, so this run's `providerMemberId` cannot collide with
 * another worktree's or another session's concurrent run on
 * `booking_member_slot_no_overlap`. Every seeded booking gets its own
 * distinct, non-overlapping slot for the same reason.
 */
import { afterAll, afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { category, service, serviceOption } from "../../../shared/infrastructure/database/catalog/schemas";
import { provider, providerMember } from "../../../shared/infrastructure/database/provider/schemas";
import { user } from "../../../shared/infrastructure/database/user/schemas";
import { booking } from "../../../shared/infrastructure/database/booking/schemas";
import { BookingStatus } from "../../../shared/infrastructure/database/booking/enums";
import { Booking } from "../../../bounded-contexts/booking/domain/aggregates/booking.aggregate";
import { DrizzleBookingRepository } from "../../../bounded-contexts/booking/infrastructure/repositories/drizzle/booking.repository";
import { DrizzleBookingReadRepository } from "../infra/repositories/drizzle/booking-read.repository";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "../../../shared/infrastructure/database/__tests__/dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql, { schema: authSchema });

const writeRepo = new DrizzleBookingRepository();
const repo = new DrizzleBookingReadRepository();
const suffix = crypto.randomUUID();

/** The instant every test injects as `now` — never `new Date()` inside the query under test. */
const NOW = new Date("2026-09-03T12:00:00.000Z");

let ALICE: string;
let BOB: string;
let ownerUserId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let serviceOptionId: string;

beforeAll(async () => {
  ALICE = crypto.randomUUID();
  BOB = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    {
      id: ALICE,
      email: `customer-bookings-alice-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: BOB,
      email: `customer-bookings-bob-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerUserId,
      email: `customer-bookings-owner-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Customer Bookings Test Provider",
      slug: `customer-bookings-test-${suffix}`,
      status: "active",
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
    .values({ code: `customer-bookings-test-${suffix}` })
    .returning({ id: category.id });
  categoryId = categoryRow!.id;

  const [serviceRow] = await db
    .insert(service)
    .values({
      providerId,
      categoryId,
      sourceLocale: "pt-MZ",
      locationType: "at_customer",
      status: "published",
    })
    .returning({ id: service.id });
  serviceId = serviceRow!.id;

  const [optionRow] = await db
    .insert(serviceOption)
    .values({ serviceId, pricingMode: "fixed", amountMinor: 100_000, durationMinutes: 60 })
    .returning({ id: serviceOption.id });
  serviceOptionId = optionRow!.id;
});

afterAll(async () => {
  await bestEffortCleanup([
    // `booking_change` cascades on the booking it logs — see its schema.
    () => db.delete(booking).where(inArray(booking.customerId, [ALICE, BOB])),
    () => db.delete(serviceOption).where(eq(serviceOption.id, serviceOptionId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(user).where(eq(user.id, ALICE)),
    () => db.delete(user).where(eq(user.id, BOB)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

/**
 * Nothing else here resets between test bodies but the rows themselves.
 * `countsForCustomer` sums a customer's whole history, so a booking an
 * earlier test left behind would inflate a count this file asserts an exact
 * value for.
 */
afterEach(async () => {
  await db.delete(booking).where(inArray(booking.customerId, [ALICE, BOB]));
});

/** A distinct, non-overlapping slot per call — see this file's own doc comment for why. */
let slotCounter = 0;
function nextSlot(): Date {
  slotCounter += 1;
  return new Date(Date.UTC(2026, 0, 1, 9, 0, 0) + slotCounter * 3 * 60 * 60 * 1000);
}

/** The address `submit` requires before a booking may leave `DRAFT`. */
function address() {
  return {
    label: "Casa",
    line: "Av. Julius Nyerere 123",
    city: "Maputo",
    district: "Sommerschield",
    directions: "Portão azul, tocar a campainha",
    lat: -25.9655,
    lng: 32.5832,
  };
}

async function commit(entity: Booking, expected: Booking["status"]): Promise<void> {
  const written = await writeRepo.save(entity, expected);
  if (!written) {
    throw new Error(`fixture: save of ${entity.id} expecting ${expected} matched no row`);
  }
}

/**
 * Walks a fresh booking through exactly the transitions its target status
 * requires — `create` always lands on `DRAFT`; `submit` reaches
 * `AWAITING_PROVIDER`; `accept` reaches `PENDING_PAYMENT`; `markPaid`
 * reaches `CONFIRMED`; `decline` reaches `DECLINED` from
 * `AWAITING_PROVIDER`. See `Booking`'s own transition methods for why this
 * is the only legal way from one status to the next.
 */
async function seedBooking(input: {
  customerId: string;
  status: "DRAFT" | "AWAITING_PROVIDER" | "PENDING_PAYMENT" | "CONFIRMED" | "DECLINED";
  startsAt?: Date;
}): Promise<string> {
  const startsAt = input.startsAt ?? nextSlot();
  const expiresAt = new Date(startsAt.getTime() - 30 * 60 * 1000);

  const draft = await writeRepo.insert(
    Booking.create({
      customerId: input.customerId,
      providerId,
      serviceId,
      serviceOptionId,
      providerMemberId: memberId,
      startsAt,
      durationMinutes: 60,
      priceMinor: 100_000,
      commissionBps: 1000,
      currency: "MZN",
      serviceName: "Corte de Cabelo",
      providerName: "Customer Bookings Test Provider",
      providerSlug: `customer-bookings-test-${suffix}`,
      optionName: "Standard",
      description: null,
      expiresAt,
    }),
    1,
  );
  const id = draft.id as string;
  if (input.status === "DRAFT") return id;

  const respondBy = new Date(startsAt.getTime() - 15 * 60 * 1000);
  const submitted = draft.submit(NOW, respondBy, address(), null);
  await commit(submitted, BookingStatus.Draft);
  if (input.status === "AWAITING_PROVIDER") return id;

  if (input.status === "DECLINED") {
    const declined = submitted.decline(NOW);
    await commit(declined, BookingStatus.AwaitingProvider);
    return id;
  }

  const payBy = new Date(startsAt.getTime() - 5 * 60 * 1000);
  const accepted = submitted.accept(NOW, payBy);
  await commit(accepted, BookingStatus.AwaitingProvider);
  if (input.status === "PENDING_PAYMENT") return id;

  const paid = accepted.markPaid(`mpesa-${id}`, NOW);
  await commit(paid, BookingStatus.PendingPayment);
  return id;
}

describe("the customer's tabs", () => {
  // A booking the customer never finished paying for is not a request they
  // made. It is in no tab, and the counts do not see it either.
  test("never returns a draft, in any tab", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      await seedBooking({ customerId: ALICE, status: "DRAFT" });
      for (const tab of ["waiting", "upcoming", "history"] as const) {
        const rows = await repo.listForCustomer(ALICE, { tab, now: NOW }, 20, 0);
        expect(rows).toEqual([]);
      }
      expect(await repo.countsForCustomer(ALICE, NOW)).toEqual({ waiting: 0, upcoming: 0, history: 0 });
    });
  });

  test("puts both waits in the first tab", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      await seedBooking({ customerId: ALICE, status: "AWAITING_PROVIDER" });
      await seedBooking({ customerId: ALICE, status: "PENDING_PAYMENT" });
      const rows = await repo.listForCustomer(ALICE, { tab: "waiting", now: NOW }, 20, 0);
      expect(rows).toHaveLength(2);
    });
  });

  // The only rule that is not a status lookup: a confirmed booking leaves
  // Próximas for Histórico by the clock, because nothing in the platform can
  // declare the work done.
  test("moves a confirmed booking from upcoming to history when its start passes", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      await seedBooking({
        customerId: ALICE,
        status: "CONFIRMED",
        startsAt: new Date("2026-09-10T09:00:00Z"),
      });
      const before = new Date("2026-09-09T00:00:00Z");
      const after = new Date("2026-09-11T00:00:00Z");
      expect(await repo.listForCustomer(ALICE, { tab: "upcoming", now: before }, 20, 0)).toHaveLength(1);
      expect(await repo.listForCustomer(ALICE, { tab: "upcoming", now: after }, 20, 0)).toHaveLength(0);
      expect(await repo.listForCustomer(ALICE, { tab: "history", now: after }, 20, 0)).toHaveLength(1);
    });
  });

  test("counts all three tabs in one read", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      await seedBooking({ customerId: ALICE, status: "AWAITING_PROVIDER" });
      await seedBooking({ customerId: ALICE, status: "DECLINED" });
      expect(await repo.countsForCustomer(ALICE, NOW)).toEqual({ waiting: 1, upcoming: 0, history: 1 });
    });
  });

  test("never crosses customers", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      await seedBooking({ customerId: BOB, status: "AWAITING_PROVIDER" });
      expect(await repo.listForCustomer(ALICE, { tab: "waiting", now: NOW }, 20, 0)).toEqual([]);
    });
  });

  // `countForCustomer` shares `customerWhere` with `listForCustomer`, so the
  // two have to agree — a total the list cannot fill is the same defect
  // `provider-bookings.repository.test.ts` checks for on the provider side.
  // The paging arguments are asserted here too, since nothing above ever
  // passes anything but `20, 0`.
  test("countForCustomer agrees with the tab it counts, and paging slices the same rows", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      await seedBooking({ customerId: ALICE, status: "DECLINED" });
      await seedBooking({ customerId: ALICE, status: "DECLINED" });
      await seedBooking({ customerId: ALICE, status: "DECLINED" });

      expect(await repo.countForCustomer(ALICE, { tab: "history", now: NOW })).toBe(3);

      const firstPage = await repo.listForCustomer(ALICE, { tab: "history", now: NOW }, 2, 0);
      const secondPage = await repo.listForCustomer(ALICE, { tab: "history", now: NOW }, 2, 2);
      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(1);
      // The two pages are disjoint halves of the same three rows, not the
      // same row twice or a row paging dropped.
      const ids = new Set([...firstPage, ...secondPage].map((row) => row.id));
      expect(ids.size).toBe(3);
    });
  });
});
