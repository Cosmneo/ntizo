/**
 * `DrizzleBookingRepository` against the real dev database, same reason and
 * same mechanism as `activity.repository.test.ts` and
 * `booking-constraints.test.ts`: the repository reaches the database through
 * `getDb()`, which resolves through the app's request-scoped
 * AsyncLocalStorage context — and a test has no request.
 * `__runWithTransactionContextForTests` binds this file's own real,
 * `DEV_DB_URL`-backed Drizzle client into that same context for the duration
 * of one test body, for every test except the rollback test below, which
 * needs a *real* transaction rather than a bound connection — see its own
 * comment for why it is wired differently.
 *
 * Fixtures follow `booking-constraints.test.ts`'s pattern exactly: one
 * provider and one provider member, created fresh under a random `suffix` in
 * `beforeAll`, so this run's `providerMemberId` cannot collide with another
 * worktree's or another session's concurrent run on
 * `booking_member_slot_active_uq`. Within this file, tests that share that
 * one member use distinct `startsAt` values to avoid colliding with each
 * other.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, sql as sqlExpr } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { Db } from "../../../../../../shared/infrastructure/database/connection";
import { infraStore } from "../../../../../../shared/infrastructure/stores/infra-store";
import { DrizzleUnitOfWork } from "../../../../../../shared/infrastructure/unit-of-work";
import { category } from "../catalog/schemas/category.schema";
import { service, serviceOption } from "../catalog/schemas/service.schema";
import { provider } from "../provider/schemas/provider.schema";
import { providerMember } from "../provider/schemas/provider-member.schema";
import { user } from "../user/schemas/user.schema";
import { booking } from "../booking/schemas/booking.schema";
import { bookingChange } from "../booking/schemas/booking-change.schema";
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
// `{ schema: authSchema }`, not a bare `drizzle(sql)`: `DrizzleDb` (what
// `__runWithTransactionContextForTests` binds into AsyncLocalStorage) is
// typed against this schema shape — same requirement as
// `activity.repository.test.ts`, even though nothing queried here belongs to
// that schema.
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
      email: `booking-repo-customer-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerUserId,
      email: `booking-repo-owner-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Booking Repository Test Provider",
      slug: `booking-repo-test-${suffix}`,
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
    .values({ code: `booking-repo-test-${suffix}` })
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
  // Same ordering discipline as `booking-constraints.test.ts`: children
  // first, and scoped to `providerId` rather than a tracked id list, so a
  // booking this file inserted but never got to track (an assertion that
  // threw partway through a test) is still cleaned up.
  await bestEffortCleanup([
    () =>
      db.delete(bookingChange).where(
        sqlExpr`${bookingChange.bookingId} IN (SELECT ${booking.id} FROM ${booking} WHERE ${booking.providerId} = ${providerId})`,
      ),
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
    startsAt: new Date("2026-10-01T09:00:00.000Z"),
    durationMinutes: 60,
    priceMinor: 100_000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName: "Corte de Cabelo",
    providerName: "Booking Repository Test Provider",
    providerSlug: `booking-repo-test-${suffix}`,
    optionName: "Standard",
    addressLabel: "Salão",
    addressLine: "Av. Julius Nyerere 123",
    addressCity: "Maputo",
    addressDistrict: "Sommerschield",
    addressDirections: "Portão azul, tocar a campainha",
    addressLat: -25.9655,
    addressLng: 32.5832,
    description: "Corte simples, sem barba",
    expiresAt: new Date("2026-10-01T09:30:00.000Z"),
    ...overrides,
  };
}

/** Every field `Booking.restore` did not derive — i.e. every field a round trip could lose. */
function expectSameSnapshot(actual: Booking, expected: Booking): void {
  expect(actual.customerId).toBe(expected.customerId);
  expect(actual.providerId).toBe(expected.providerId);
  expect(actual.serviceId).toBe(expected.serviceId);
  expect(actual.serviceOptionId).toBe(expected.serviceOptionId);
  expect(actual.providerMemberId).toBe(expected.providerMemberId);
  expect(actual.startsAt.toISOString()).toBe(expected.startsAt.toISOString());
  expect(actual.endsAt.toISOString()).toBe(expected.endsAt.toISOString());
  expect(actual.durationMinutes).toBe(expected.durationMinutes);
  expect(actual.status).toBe(expected.status);
  expect(actual.expiresAt?.toISOString() ?? null).toBe(expected.expiresAt?.toISOString() ?? null);
  expect(actual.paidAt).toBe(expected.paidAt);
  expect(actual.paymentRef).toBe(expected.paymentRef);
  expect(actual.priceMinor).toBe(expected.priceMinor);
  expect(actual.commissionBps).toBe(expected.commissionBps);
  expect(actual.commissionMinor).toBe(expected.commissionMinor);
  expect(actual.providerPayoutMinor).toBe(expected.providerPayoutMinor);
  expect(actual.currency).toBe(expected.currency);
  expect(actual.serviceName).toBe(expected.serviceName);
  expect(actual.providerName).toBe(expected.providerName);
  expect(actual.providerSlug).toBe(expected.providerSlug);
  expect(actual.optionName).toBe(expected.optionName);
  expect(actual.addressLabel).toBe(expected.addressLabel);
  expect(actual.addressLine).toBe(expected.addressLine);
  expect(actual.addressCity).toBe(expected.addressCity);
  expect(actual.addressDistrict).toBe(expected.addressDistrict);
  expect(actual.addressDirections).toBe(expected.addressDirections);
  expect(actual.addressLat).toBe(expected.addressLat);
  expect(actual.addressLng).toBe(expected.addressLng);
  expect(actual.description).toBe(expected.description);
}

describe("insert, then findById", () => {
  test("round-trips through Booking.restore with every snapshot field intact", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const created = Booking.create(bookingInput());
      const inserted = await repo.insert(created);

      expect(inserted.id).toBeString();
      expectSameSnapshot(inserted, created);

      const found = await repo.findById(inserted.id as string);
      expect(found).not.toBeNull();
      expectSameSnapshot(found as Booking, created);
      // Includes the id: this is the one field `create` never has and a
      // round trip through the database is the only thing that assigns.
      expect(found?.id).toBe(inserted.id);

      await db.delete(booking).where(eq(booking.id, inserted.id as string));
    });
  });

  test("returns null for an id nothing was ever stored under", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const found = await repo.findById(crypto.randomUUID());
      expect(found).toBeNull();
    });
  });
});

describe("booking_member_slot_active_uq, from behind the repository", () => {
  test("a second insert on the same (member, startsAt) is refused as SlotAlreadyTakenError while the first is PENDING_PAYMENT", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const slotStart = new Date("2026-10-02T09:00:00.000Z");
      const slotExpires = new Date("2026-10-02T09:30:00.000Z");

      const first = await repo.insert(
        Booking.create(bookingInput({ startsAt: slotStart, expiresAt: slotExpires })),
      );
      expect(first.status).toBe("PENDING_PAYMENT");

      const second = Booking.create(bookingInput({ startsAt: slotStart, expiresAt: slotExpires }));
      const error = await repo.insert(second).catch((e: unknown) => e);

      // Not a substring match on a message — the class itself, the same
      // check `create-booking.command.test.ts` makes on the fake, and the
      // one Task 8's real command relies on to catch this without importing
      // anything from `infrastructure/`.
      expect(error).toBeInstanceOf(SlotAlreadyTakenError);
      expect((error as SlotAlreadyTakenError).providerMemberId).toBe(memberId);
      expect((error as SlotAlreadyTakenError).startsAt).toEqual(slotStart);

      await db.delete(booking).where(eq(booking.id, first.id as string));
    });
  });

  test("the same slot can be rebooked once the first booking is EXPIRED — the partial index earning its keep", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const slotStart = new Date("2026-10-03T09:00:00.000Z");
      const slotExpires = new Date("2026-10-03T09:30:00.000Z");

      const first = await repo.insert(
        Booking.create(bookingInput({ startsAt: slotStart, expiresAt: slotExpires })),
      );

      // `save`, exercised here rather than by a test of its own: this is
      // the only scenario in this file that needs an UPDATE at all, and it
      // is also the one the brief asks for — a released slot must accept a
      // second booking, which is only true once `expire` moved the first
      // one out of `PENDING_PAYMENT` and `save` persisted that.
      const expired = first.expire(new Date("2026-10-03T09:31:00.000Z"));
      expect(expired.status).toBe("EXPIRED");
      await repo.save(expired);

      const reread = await repo.findById(first.id as string);
      expect(reread?.status).toBe("EXPIRED");

      const second = await repo.insert(
        Booking.create(bookingInput({ startsAt: slotStart, expiresAt: slotExpires })),
      );
      expect(second.id).toBeString();
      expect(second.status).toBe("PENDING_PAYMENT");

      await db.delete(booking).where(eq(booking.id, first.id as string));
      await db.delete(booking).where(eq(booking.id, second.id as string));
    });
  });
});

describe("findDueForExpiry", () => {
  test("selects only PENDING_PAYMENT bookings whose expiry has passed, oldest first, up to the limit", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const now = new Date("2026-10-04T12:00:00.000Z");

      // Due: two PENDING_PAYMENT bookings whose expiresAt is already past
      // `now`, at different slots so they don't collide with each other.
      const dueLater = await repo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2026-10-04T09:00:00.000Z"),
            expiresAt: new Date("2026-10-04T09:30:00.000Z"),
          }),
        ),
      );
      const dueEarlier = await repo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2026-10-04T10:00:00.000Z"),
            expiresAt: new Date("2026-10-04T09:15:00.000Z"),
          }),
        ),
      );

      // Not due: still PENDING_PAYMENT, but the deadline is in the future.
      const notYetDue = await repo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2026-10-04T11:00:00.000Z"),
            expiresAt: new Date("2026-10-04T23:00:00.000Z"),
          }),
        ),
      );

      // Not due: expiresAt has passed, but the booking already left
      // PENDING_PAYMENT — the status filter, not the null check, is what
      // must exclude it. `markPaid` clears `expiresAt` to null on the way
      // out, so this also happens to be the row `expires_at IS NOT NULL`
      // would have caught on its own; the point of this row is that the
      // status filter alone is already sufficient.
      const paidStale = await repo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2026-10-04T12:30:00.000Z"),
            expiresAt: new Date("2026-10-04T09:00:00.000Z"),
          }),
        ),
      );
      const paid = paidStale.markPaid("mpesa-repo-test", new Date("2026-10-04T08:00:00.000Z"));
      expect(paid.expiresAt).toBeNull();
      await repo.save(paid);

      const due = await repo.findDueForExpiry(now, 10);
      const dueIds = due.map((b) => b.id);

      expect(dueIds).not.toContain(notYetDue.id);
      expect(dueIds).not.toContain(paidStale.id);

      const dueLaterIndex = dueIds.indexOf(dueLater.id);
      const dueEarlierIndex = dueIds.indexOf(dueEarlier.id);
      expect(dueLaterIndex).toBeGreaterThanOrEqual(0);
      expect(dueEarlierIndex).toBeGreaterThanOrEqual(0);
      // Oldest deadline first.
      expect(dueEarlierIndex).toBeLessThan(dueLaterIndex);

      const limited = await repo.findDueForExpiry(now, 1);
      expect(limited).toHaveLength(1);
      expect(limited[0]?.id).toBe(dueEarlier.id);

      await db
        .delete(booking)
        .where(eq(booking.id, dueLater.id as string));
      await db.delete(booking).where(eq(booking.id, dueEarlier.id as string));
      await db.delete(booking).where(eq(booking.id, notYetDue.id as string));
      await db.delete(booking).where(eq(booking.id, paidStale.id as string));
    });
  });
});

describe("appendChange", () => {
  test("writes an audit row a plain read can see", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const created = await repo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2026-10-05T09:00:00.000Z"),
            expiresAt: new Date("2026-10-05T09:30:00.000Z"),
          }),
        ),
      );

      await repo.appendChange({
        bookingId: created.id as string,
        changedByUserId: ownerUserId,
        reason: "customer asked to move an hour earlier",
        previousStartsAt: new Date("2026-10-05T08:00:00.000Z"),
        previousEndsAt: new Date("2026-10-05T09:00:00.000Z"),
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      const [row] = await db
        .select()
        .from(bookingChange)
        .where(eq(bookingChange.bookingId, created.id as string));

      expect(row?.reason).toBe("customer asked to move an hour earlier");
      expect(row?.changedByUserId).toBe(ownerUserId);
      expect(row?.previousStartsAt?.toISOString()).toBe("2026-10-05T08:00:00.000Z");
      expect(row?.previousProviderMemberId).toBeNull();

      await db.delete(booking).where(eq(booking.id, created.id as string));
    });
  });
});

describe("a real atomicExecute rolling back", () => {
  /**
   * The load-bearing test in this file. Everything above binds a real
   * connection into AsyncLocalStorage with `__runWithTransactionContextForTests`
   * — which, per its own doc comment, "does not open a transaction and does
   * not roll anything back". It proves the repository's mapping is correct;
   * it proves nothing about atomicity.
   *
   * This test goes through the real path instead:
   * `infraStore.runAsync` stands in for a request (the scope
   * `Db.getDbConnection()` needs to open a real connection),
   * `DrizzleUnitOfWork.atomicExecute` is the same class every bootstrap
   * wires up, and `runInTransaction` underneath it opens a real
   * `db.transaction(...)` against `DEV_DB_URL`. The insert runs — for real,
   * inside that transaction — and only then does the block throw, so the
   * row is proven to have existed before the assertion that it doesn't.
   *
   * Until this test existed, nothing in this repository demonstrated
   * Postgres actually rolling anything back: `drizzle-unit-of-work.test.ts`
   * uses a fake AsyncLocalStorage context with no live connection, and
   * `create-booking.command.test.ts`'s `TrackingUnitOfWork` proves only that
   * a command's calls are ordered compatibly with rollback, by its own
   * documented admission. BR2's atomicity rested on those two fakes
   * agreeing with each other until this test ran against the real database.
   */
  test("a booking inserted inside atomicExecute is gone once the block throws", async () => {
    const testEnv = {
      STAGE: "local" as const,
      LOG_LEVEL: "info",
      DATABASE_URL: process.env["DEV_DB_URL"] as string,
      BETTER_AUTH_SECRET: "s",
      RESEND_API_KEY: "",
      EMAIL_FROM: "a@b.c",
      APP_URL: "https://ntizo.test",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    };

    const unitOfWork = new DrizzleUnitOfWork();
    const boom = new Error("thrown after the insert executed, to force a rollback");
    let insertedId: string | null = null;

    await infraStore.runAsync(testEnv, async () => {
      try {
        await expect(
          unitOfWork.atomicExecute(async () => {
            const inserted = await repo.insert(
              Booking.create(
                bookingInput({
                  startsAt: new Date("2026-10-06T09:00:00.000Z"),
                  expiresAt: new Date("2026-10-06T09:30:00.000Z"),
                }),
              ),
            );
            // The insert has definitely executed by this line — its result
            // carries a database-assigned id, which only a row that really
            // exists (for now) can have.
            insertedId = inserted.id;
            throw boom;
          }),
        ).rejects.toBe(boom);
      } finally {
        // This scope opened its own connection (`Db.getDbConnection()`,
        // lazily, on the first query inside `atomicExecute`) — distinct from
        // this file's own `sql`/`db` above, which never touches
        // `infraStore`. Closing it here, inside the same `runAsync` scope
        // that opened it, is what `Db.closeDbConnection` requires: it reads
        // the connection back off `infraStore`, which only resolves inside
        // this callback.
        await Db.closeDbConnection();
      }
    });

    expect(insertedId).toBeString();
    const rows = await sql`SELECT id FROM ntizo_booking.booking WHERE id = ${insertedId}`;
    expect(rows).toHaveLength(0);
  });
});
