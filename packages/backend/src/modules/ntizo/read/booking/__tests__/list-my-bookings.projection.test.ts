/**
 * Both of `read/booking`'s projections — `ListMyBookingsProjection` and
 * `GetMyBookingProjection` — wired to the real `DrizzleBookingReadRepository`,
 * against the real dev database. Same reason and same mechanism as
 * `booking-repository.test.ts`: the reader reaches the database through
 * `getDb()`, which resolves through the app's request-scoped
 * AsyncLocalStorage context, and a test has no request.
 * `__runWithTransactionContextForTests` binds this file's own real,
 * `DEV_DB_URL`-backed Drizzle client into that same context for the duration
 * of one test body.
 *
 * One file for both, and one fixture: they read the same columns off the
 * same table for the same customer, differing only in their `WHERE`. A
 * second file would be a second elaborate fixture and a second connection to
 * a shared dev database, for two queries that must not be allowed to
 * disagree.
 *
 * The fixture below seeds bookings for TWO customers on purpose. BR7 limits
 * reading a booking to its own customer, its provider, or an administrator —
 * these queries answer only for the signed-in customer — and a fixture
 * holding only the caller's own rows cannot fail if `listForCustomer`'s or
 * `findForCustomer`'s `WHERE` clause were ever dropped. The whole point of
 * this file is to prove those filters, not merely the mapping.
 *
 * Fixtures follow `booking-repository.test.ts`'s pattern: one provider and
 * one provider member, created fresh under a random `suffix` in `beforeAll`,
 * so this run's `providerMemberId` cannot collide with another worktree's or
 * another session's concurrent run on `booking_member_slot_active_uq`. Every
 * booking this file inserts uses its own distinct `startsAt` for the same
 * reason.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { bookingReadModel } from "@ntizo/shared/read-models";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { category } from "../../../shared/infrastructure/database/catalog/schemas";
import { service, serviceOption } from "../../../shared/infrastructure/database/catalog/schemas";
import { provider, providerMember } from "../../../shared/infrastructure/database/provider/schemas";
import { user } from "../../../shared/infrastructure/database/user/schemas";
import { booking } from "../../../shared/infrastructure/database/booking/schemas";
import { Booking } from "../../../bounded-contexts/booking/domain/aggregates/booking.aggregate";
import { DrizzleBookingRepository } from "../../../bounded-contexts/booking/infrastructure/repositories/drizzle/booking.repository";
import { DrizzleBookingReadRepository } from "../infra/repositories/drizzle/booking-read.repository";
import { GetMyBookingProjection } from "../app/use-cases/get-my-booking.projection";
import { ListMyBookingsProjection } from "../app/use-cases/list-my-bookings.projection";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "../../../shared/infrastructure/database/__tests__/dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql, { schema: authSchema });

const writeRepo = new DrizzleBookingRepository();
const readRepo = new DrizzleBookingReadRepository();
const projection = new ListMyBookingsProjection(readRepo);
const byId = new GetMyBookingProjection(readRepo);
const suffix = crypto.randomUUID();

let customerAId: string;
let customerBId: string;
let ownerUserId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let serviceOptionId: string;

beforeAll(async () => {
  customerAId = crypto.randomUUID();
  customerBId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    {
      id: customerAId,
      email: `list-my-bookings-customer-a-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: customerBId,
      email: `list-my-bookings-customer-b-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerUserId,
      email: `list-my-bookings-owner-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "List My Bookings Test Provider",
      slug: `list-my-bookings-test-${suffix}`,
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
    .values({ code: `list-my-bookings-test-${suffix}` })
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
    () => db.delete(user).where(eq(user.id, customerAId)),
    () => db.delete(user).where(eq(user.id, customerBId)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

/** Every `Booking.create` input this file needs, with a distinct slot per call. */
function bookingInput(
  overrides: Partial<Parameters<typeof Booking.create>[0]> = {},
): Parameters<typeof Booking.create>[0] {
  return {
    customerId: customerAId,
    providerId,
    serviceId,
    serviceOptionId,
    providerMemberId: memberId,
    startsAt: new Date("2026-12-01T09:00:00.000Z"),
    durationMinutes: 60,
    priceMinor: 100_000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName: "Corte de Cabelo",
    providerName: "List My Bookings Test Provider",
    providerSlug: `list-my-bookings-test-${suffix}`,
    optionName: "Standard",
    addressLabel: "Salão",
    addressLine: "Av. Julius Nyerere 123",
    addressCity: "Maputo",
    addressDistrict: "Sommerschield",
    addressDirections: "Portão azul, tocar a campainha",
    addressLat: -25.9655,
    addressLng: 32.5832,
    description: "Corte simples, sem barba",
    expiresAt: new Date("2026-12-01T09:30:00.000Z"),
    ...overrides,
  };
}

/**
 * Pins `createdAt` to an exact value so "newest first" can be asserted
 * without racing the wall clock: `DrizzleBookingRepository.insert` always
 * writes `createdAt` via the column's own `defaultNow()` (see its `toRow`),
 * with no way to pass one in — a real request never needs to backdate a
 * booking, so the port has no reason to accept one. Only this test, which
 * needs two rows with a guaranteed, non-flaky order, reaches past the
 * repository to set it directly.
 */
async function pinCreatedAt(id: string, createdAt: Date): Promise<void> {
  await db.update(booking).set({ createdAt }).where(eq(booking.id, id));
}

describe("ListMyBookingsProjection, backed by DrizzleBookingReadRepository", () => {
  test("returns only the signed-in customer's bookings, newest first", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const older = await writeRepo.insert(
        Booking.create(
          bookingInput({
            customerId: customerAId,
            startsAt: new Date("2026-12-02T09:00:00.000Z"),
            expiresAt: new Date("2026-12-02T09:30:00.000Z"),
          }),
        ),
        1,
      );
      const newer = await writeRepo.insert(
        Booking.create(
          bookingInput({
            customerId: customerAId,
            startsAt: new Date("2026-12-02T10:00:00.000Z"),
            expiresAt: new Date("2026-12-02T10:30:00.000Z"),
          }),
        ),
        1,
      );
      // A booking belonging to a DIFFERENT customer. Without this row, the
      // fixture could not fail even if `listForCustomer`'s WHERE clause were
      // deleted outright — see this file's own doc comment.
      const somebodyElses = await writeRepo.insert(
        Booking.create(
          bookingInput({
            customerId: customerBId,
            startsAt: new Date("2026-12-02T11:00:00.000Z"),
            expiresAt: new Date("2026-12-02T11:30:00.000Z"),
          }),
        ),
        1,
      );

      await pinCreatedAt(older.id as string, new Date("2026-12-01T08:00:00.000Z"));
      await pinCreatedAt(newer.id as string, new Date("2026-12-01T09:00:00.000Z"));

      const result = await projection.execute({ customerId: customerAId });

      expect(result.map((b) => b.id)).toEqual([newer.id as string, older.id as string]);
      expect(result.map((b) => b.id)).not.toContain(somebodyElses.id as string);

      await db.delete(booking).where(eq(booking.id, older.id as string));
      await db.delete(booking).where(eq(booking.id, newer.id as string));
      await db.delete(booking).where(eq(booking.id, somebodyElses.id as string));
    });
  });

  test("a customer with none gets an empty list, not an error", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const strangerId = crypto.randomUUID();
      const result = await projection.execute({ customerId: strangerId });
      expect(result).toEqual([]);
    });
  });

  test("every field of bookingReadModel parses, and dates cross the wire as ISO strings", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const created = await writeRepo.insert(
        Booking.create(
          bookingInput({
            customerId: customerAId,
            startsAt: new Date("2026-12-03T09:00:00.000Z"),
            expiresAt: new Date("2026-12-03T09:30:00.000Z"),
          }),
        ),
        1,
      );

      const result = await projection.execute({ customerId: customerAId });
      const item = result.find((b) => b.id === created.id);
      expect(item).toBeDefined();

      const parsed = bookingReadModel.safeParse(item);
      expect(parsed.success).toBe(true);

      expect(typeof item?.startsAt).toBe("string");
      expect(typeof item?.endsAt).toBe("string");
      expect(typeof item?.createdAt).toBe("string");
      // DRAFT — this fixture's status, since the reversal made that what
      // `Booking.create` produces — always carries a real expiresAt: the
      // checkout hold. So this also proves the non-null branch is a string,
      // not merely that a null one passes trivially.
      expect(item?.expiresAt).not.toBeNull();
      expect(typeof item?.expiresAt).toBe("string");
      expect(item?.startsAt).toBe("2026-12-03T09:00:00.000Z");
      expect(item?.endsAt).toBe("2026-12-03T10:00:00.000Z");

      await db.delete(booking).where(eq(booking.id, created.id as string));
    });
  });
});

describe("GetMyBookingProjection, backed by DrizzleBookingReadRepository", () => {
  test("returns the caller's own booking, and null for another customer's", async () => {
    const created: string[] = [];
    try {
      await __runWithTransactionContextForTests(db, async () => {
        const mine = await writeRepo.insert(
          Booking.create(
            bookingInput({
              customerId: customerAId,
              startsAt: new Date("2026-12-04T09:00:00.000Z"),
              expiresAt: new Date("2026-12-04T09:30:00.000Z"),
            }),
          ),
          1,
        );
        // A real booking belonging to a real, different customer — asked for
        // by its own id below. Without this row the test could not fail even
        // if `findForCustomer` dropped `customerId` from its `WHERE` clause
        // entirely, because there would be nothing to wrongly return. This
        // branch has shipped that exact shape twice.
        const theirs = await writeRepo.insert(
          Booking.create(
            bookingInput({
              customerId: customerBId,
              startsAt: new Date("2026-12-04T11:00:00.000Z"),
              expiresAt: new Date("2026-12-04T11:30:00.000Z"),
            }),
          ),
          1,
        );
        created.push(mine.id as string, theirs.id as string);

        const own = await byId.execute({
          bookingId: mine.id as string,
          customerId: customerAId,
        });
        expect(own?.id).toBe(mine.id as string);
        // The mapping is the list's mapping — `toBookingDTO`, shared — so
        // one field is enough to prove this went through it rather than
        // handing back a raw row.
        expect(own?.startsAt).toBe("2026-12-04T09:00:00.000Z");
        // Read off the row rather than snapshotted: checkout's steps 2 and 3
        // send a customer whose hold lapsed back to `/book/<this service>` on
        // this option, and before these were on the read model they had to
        // carry both in the URL, where a shared link could name a service
        // that disagreed with the booking.
        expect(own?.serviceId).toBe(serviceId);
        expect(own?.serviceOptionId).toBe(serviceOptionId);

        // The assertion this test exists for: customer A asking for customer
        // B's booking, by its real id, gets nothing.
        const stolen = await byId.execute({
          bookingId: theirs.id as string,
          customerId: customerAId,
        });
        expect(stolen).toBeNull();

        // And the same booking is genuinely readable by the customer it
        // belongs to, so the null above is the filter refusing rather than
        // the row being absent or unreadable for some other reason.
        const hers = await byId.execute({
          bookingId: theirs.id as string,
          customerId: customerBId,
        });
        expect(hers?.id).toBe(theirs.id as string);
      });
    } finally {
      await bestEffortCleanup(
        created.map((id) => () => db.delete(booking).where(eq(booking.id, id))),
      );
    }
  });

  test("an id that names no booking is null, not an error", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      // A well-formed id that simply is not one — the shape a stale link
      // produces. Undistinguished from "not yours" on purpose: telling the
      // two apart would confirm that a given id names a real booking.
      const result = await byId.execute({
        bookingId: crypto.randomUUID(),
        customerId: customerAId,
      });
      expect(result).toBeNull();
    });
  });
});
