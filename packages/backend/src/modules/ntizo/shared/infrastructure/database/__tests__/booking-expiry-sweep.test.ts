/**
 * `ExpireDueBookingsInternalCommand` — Task 12's caller for
 * `ExpireBookingCommand` — against the real dev database, same reason and
 * same mechanism as `booking-repository.test.ts`: every real adapter this
 * sweep is built from (`DrizzleBookingRepository`, `DrizzleUnitOfWork`,
 * `OutboxAdapter`) reaches the database through `getDb()`, which resolves
 * through AsyncLocalStorage — and a test has no request.
 * `__runWithTransactionContextForTests` binds this file's own real,
 * `DEV_DB_URL`-backed Drizzle client into that same context for the
 * duration of one test body. `DrizzleUnitOfWork.atomicExecute` sees that
 * context already bound and joins it (`ensureTransaction`'s reentrant
 * branch) instead of opening a second, real Postgres transaction — the same
 * thing every non-rollback test in `booking-repository.test.ts` relies on.
 *
 * `findDueForExpiry` itself is not re-tested here — Task 7 already proved
 * the query (status filter, ordering, limit) in `booking-repository.test.ts`.
 * What only this file can prove is that the *sweep* — the loop Task 12
 * wires into `scheduled.ts` — actually calls that query and actually calls
 * `ExpireBookingCommand` once per row it returns, isolates one row's
 * failure from the rest, and respects its own limit.
 *
 * Fixtures follow `booking-repository.test.ts`'s pattern: one provider and
 * one provider member, created fresh under a random `suffix` in
 * `beforeAll`, so this run's `providerMemberId` cannot collide with another
 * worktree's or another session's concurrent run on
 * `booking_member_slot_active_uq`. Tests that share that one member use
 * distinct `startsAt` values to avoid colliding with each other.
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
import { booking } from "../booking/schemas/booking.schema";
import { bookingChange } from "../booking/schemas/booking-change.schema";
import { outboxEvent } from "../outbox/schemas/outbox-event.schema";
import { Booking } from "../../../../bounded-contexts/booking/domain/aggregates/booking.aggregate";
import { DrizzleBookingRepository } from "../../../../bounded-contexts/booking/infrastructure/repositories/drizzle/booking.repository";
import { BookingRowSlotHold } from "../../../../bounded-contexts/booking/infrastructure/adapters/booking-row-slot-hold.adapter";
import { ExpireBookingCommand } from "../../../../bounded-contexts/booking/app/use-cases/expire-booking.command";
import { ExpireDueBookingsInternalCommand } from "../../../../bounded-contexts/booking/app/use-cases/expire-due-bookings.internal.command";
import type { BookingChangeRecord } from "../../../../bounded-contexts/booking/app/ports/outbound/booking.repository.port";
import type { BookingRepositoryPort } from "../../../../bounded-contexts/booking/app/ports/outbound/booking.repository.port";
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

/**
 * Every booking id this file inserts, tracked independently of each test's
 * own `db.delete(booking)...` cleanup — `afterAll` runs after every test
 * body has already deleted its own booking rows, so a cleanup query that
 * looked up ids via a fresh `SELECT ... FROM booking WHERE providerId = ...`
 * at that point would find nothing and silently delete zero outbox rows.
 */
const createdBookingIds: string[] = [];

beforeAll(async () => {
  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    {
      id: customerId,
      email: `booking-expiry-sweep-customer-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerUserId,
      email: `booking-expiry-sweep-owner-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Booking Expiry Sweep Test Provider",
      slug: `booking-expiry-sweep-test-${suffix}`,
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
    .values({ code: `booking-expiry-sweep-test-${suffix}` })
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
    // Guarded on length: drizzle's `inArray` against an empty list still
    // issues a valid (always-false) query, but skipping it entirely avoids
    // relying on that for correctness.
    () =>
      createdBookingIds.length > 0
        ? db.delete(outboxEvent).where(inArray(outboxEvent.aggregateId, createdBookingIds))
        : Promise.resolve(),
    () =>
      createdBookingIds.length > 0
        ? db.delete(bookingChange).where(inArray(bookingChange.bookingId, createdBookingIds))
        : Promise.resolve(),
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
    providerName: "Booking Expiry Sweep Test Provider",
    providerSlug: `booking-expiry-sweep-test-${suffix}`,
    optionName: "Standard",
    addressLabel: "Salão",
    addressLine: "Av. Julius Nyerere 123",
    addressCity: "Maputo",
    addressDistrict: "Sommerschield",
    addressDirections: null,
    addressLat: null,
    addressLng: null,
    description: null,
    expiresAt: new Date("2026-11-01T09:30:00.000Z"),
    ...overrides,
  };
}

/**
 * A fresh sweep, wired exactly the way `bootstrapBooking()` wires it in
 * production — the same `ExpireBookingCommand` instance backs both
 * `useCases.expireBooking` and `useCases.internal.expireDue` there, and this
 * mirrors that rather than constructing two independent commands that could
 * drift apart.
 */
function buildSweep(
  bookingRepo: BookingRepositoryPort,
  now: () => Date = () => new Date(),
) {
  const slotHold = new BookingRowSlotHold();
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());
  const expireBooking = new ExpireBookingCommand(bookingRepo, slotHold, unitOfWork, outboxPort);
  return new ExpireDueBookingsInternalCommand(bookingRepo, expireBooking, now);
}

describe("ExpireDueBookingsInternalCommand", () => {
  test("expires an overdue PENDING_PAYMENT booking and leaves one not yet due untouched", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const now = new Date("2026-11-01T12:00:00.000Z");

      const due = await repo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2026-11-01T09:00:00.000Z"),
            expiresAt: new Date("2026-11-01T09:30:00.000Z"),
          }),
        ),
        1,
      );
      const notYetDue = await repo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2026-11-01T10:00:00.000Z"),
            expiresAt: new Date("2026-11-01T23:00:00.000Z"),
          }),
        ),
        1,
      );
      createdBookingIds.push(due.id as string, notYetDue.id as string);

      const sweep = buildSweep(repo, () => now);
      const result = await sweep.execute({ limit: 10 });

      expect(result).toEqual({ expired: 1, failed: 0 });

      const dueReread = await repo.findById(due.id as string);
      expect(dueReread?.status).toBe("EXPIRED");
      expect(dueReread?.expiredAt).not.toBeNull();
      // The deadline survives the transition (Task 5 of the booking-seams
      // repair plan) rather than being nulled — it is the fact a customer
      // disputing "you gave my slot away" would need.
      expect(dueReread?.expiresAt?.toISOString()).toBe("2026-11-01T09:30:00.000Z");

      const notYetDueReread = await repo.findById(notYetDue.id as string);
      expect(notYetDueReread?.status).toBe("PENDING_PAYMENT");

      await db.delete(booking).where(eq(booking.id, due.id as string));
      await db.delete(booking).where(eq(booking.id, notYetDue.id as string));
    });
  });

  /**
   * The test that matters: a booking already paid, whose old deadline has
   * long since passed, must come out of the sweep exactly as it went in.
   * Since Task 5 of the booking-seams repair plan, `markPaid` no longer
   * clears `expiresAt` on its way out of `PENDING_PAYMENT` — the deadline
   * stays on the row, still in the past, still non-null (see
   * `booking-repository.test.ts`). That makes this test strictly harder
   * than it was: `findDueForExpiry`'s status filter is now the *only* thing
   * standing between this booking and the sweep, because the old
   * `expires_at IS NOT NULL` check this row also used to fail on has
   * nothing left to catch. A sweep that forgot the status filter and
   * matched on a stale `expiresAt` alone would wrongly expire this booking,
   * and this test is what would catch it.
   */
  test("a booking already paid survives the sweep untouched, even past its old deadline", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const now = new Date("2026-11-02T12:00:00.000Z");

      const inserted = await repo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2026-11-02T09:00:00.000Z"),
            expiresAt: new Date("2026-11-02T09:00:00.000Z"),
          }),
        ),
        1,
      );
      createdBookingIds.push(inserted.id as string);
      const paid = inserted.markPaid("mpesa-sweep-test", new Date("2026-11-02T08:45:00.000Z"));
      expect(paid.status).toBe("CONFIRMED");
      expect(paid.expiresAt).toEqual(inserted.expiresAt);
      const applied = await repo.save(paid, "PENDING_PAYMENT");
      expect(applied).toBe(true);

      const sweep = buildSweep(repo, () => now);
      const result = await sweep.execute({ limit: 10 });

      // Nothing in this file's fixtures was due at this `now` except this
      // booking's old (still on the row, still in the past) deadline, so a
      // sweep that mistakenly matched on `expiresAt` instead of trusting the
      // status filter would show up here as `expired: 1`.
      expect(result).toEqual({ expired: 0, failed: 0 });

      const reread = await repo.findById(inserted.id as string);
      expect(reread?.status).toBe("CONFIRMED");
      expect(reread?.paidAt?.toISOString()).toBe(paid.paidAt?.toISOString());
      expect(reread?.paymentRef).toBe("mpesa-sweep-test");

      await db.delete(booking).where(eq(booking.id, inserted.id as string));
    });
  });

  test("limit caps the batch and drains the oldest deadlines first", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const now = new Date("2026-11-03T12:00:00.000Z");

      const oldest = await repo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2026-11-03T09:00:00.000Z"),
            expiresAt: new Date("2026-11-03T09:00:00.000Z"),
          }),
        ),
        1,
      );
      const middle = await repo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2026-11-03T10:00:00.000Z"),
            expiresAt: new Date("2026-11-03T09:15:00.000Z"),
          }),
        ),
        1,
      );
      const newest = await repo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2026-11-03T11:00:00.000Z"),
            expiresAt: new Date("2026-11-03T09:30:00.000Z"),
          }),
        ),
        1,
      );
      createdBookingIds.push(oldest.id as string, middle.id as string, newest.id as string);

      const sweep = buildSweep(repo, () => now);
      const result = await sweep.execute({ limit: 2 });

      expect(result).toEqual({ expired: 2, failed: 0 });

      expect((await repo.findById(oldest.id as string))?.status).toBe("EXPIRED");
      expect((await repo.findById(middle.id as string))?.status).toBe("EXPIRED");
      // Left for the next sweep run — proves the limit was actually
      // forwarded to `findDueForExpiry`, not silently dropped or hardcoded.
      expect((await repo.findById(newest.id as string))?.status).toBe("PENDING_PAYMENT");

      await db.delete(booking).where(eq(booking.id, oldest.id as string));
      await db.delete(booking).where(eq(booking.id, middle.id as string));
      await db.delete(booking).where(eq(booking.id, newest.id as string));
    });
  });

  /**
   * One booking that can no longer be expired — here, a row that vanished
   * between `findDueForExpiry`'s select and `ExpireBookingCommand` reaching
   * it, the same race the command's own doc comment names — must not take
   * the rest of the wave down with it. `findById` is intercepted for
   * exactly one booking id rather than faked outright: `findDueForExpiry`
   * still runs the real query against the real database, and only the one
   * lookup this test needs to fail is redirected.
   */
  test("one booking failing to expire does not stop the rest of the wave", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const now = new Date("2026-11-04T12:00:00.000Z");

      const good = await repo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2026-11-04T09:00:00.000Z"),
            expiresAt: new Date("2026-11-04T09:00:00.000Z"),
          }),
        ),
        1,
      );
      const vanished = await repo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2026-11-04T10:00:00.000Z"),
            expiresAt: new Date("2026-11-04T09:15:00.000Z"),
          }),
        ),
        1,
      );

      const vanishedId = vanished.id as string;
      createdBookingIds.push(good.id as string, vanishedId);
      const flaky: BookingRepositoryPort = {
        insert: (b) => repo.insert(b, 1),
        save: (b, expectedStatus) => repo.save(b, expectedStatus),
        appendChange: (c: BookingChangeRecord) => repo.appendChange(c),
        findDueForExpiry: (n, limit) => repo.findDueForExpiry(n, limit),
        findById: (id) => {
          if (id === vanishedId) {
            throw new Error("simulated: row vanished between select and expire");
          }
          return repo.findById(id);
        },
      };

      const sweep = buildSweep(flaky, () => now);
      const result = await sweep.execute({ limit: 10 });

      expect(result).toEqual({ expired: 1, failed: 1 });

      const goodReread = await repo.findById(good.id as string);
      expect(goodReread?.status).toBe("EXPIRED");

      // Untouched: ExpireBookingCommand threw before it ever reached
      // `repo.save` for this one, so the row is exactly as
      // `findDueForExpiry` found it — ready for the next sweep to retry.
      const vanishedReread = await repo.findById(vanishedId);
      expect(vanishedReread?.status).toBe("PENDING_PAYMENT");

      await db.delete(booking).where(eq(booking.id, good.id as string));
      await db.delete(booking).where(eq(booking.id, vanishedId));
    });
  });
});
