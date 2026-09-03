/**
 * `SweepDueBookingsInternalCommand` — the sweep behind `scheduled.ts` —
 * against the real dev database, same reason and same mechanism as
 * `booking-repository.test.ts`: every real adapter this sweep is built from
 * (`DrizzleBookingRepository`, `DrizzleUnitOfWork`, `OutboxAdapter`) reaches
 * the database through `getDb()`, which resolves through AsyncLocalStorage —
 * and a test has no request. `__runWithTransactionContextForTests` binds this
 * file's own real, `DEV_DB_URL`-backed Drizzle client into that same context
 * for the duration of one test body. `DrizzleUnitOfWork.atomicExecute` sees
 * that context already bound and joins it (`ensureTransaction`'s reentrant
 * branch) instead of opening a second, real Postgres transaction — the same
 * thing every non-rollback test in `booking-repository.test.ts` relies on.
 *
 * **What only this file can prove:** that one sweep, over one query, gives
 * each of the design's three clocks the ending the design says it gets —
 * `DRAFT` and `AWAITING_PROVIDER` expire, `PENDING_PAYMENT` is *cancelled
 * with a reason* — and that the event each one publishes carries enough for
 * Notification to know who to tell. The predicate itself (the widened status
 * filter, ordering, limit) is proven against the database in
 * `booking-repository.test.ts`; the aggregate's own refusals are proven in
 * `booking.aggregate.test.ts`. This file is about the wiring between them,
 * plus the two properties a loop has and a query does not: one row's failure
 * does not stop the wave, and the limit is respected.
 *
 * **Every booking is deleted in a `finally`, never after the last
 * assertion** — see `withBookings`. That is not tidiness: this file's sweeps
 * run against an unscoped query, so a row one test leaks is a row every
 * later test's sweep will claim.
 *
 * Fixtures follow `booking-repository.test.ts`'s pattern: one provider and
 * one provider member, created fresh under a random `suffix` in
 * `beforeAll`, so this run's `providerMemberId` cannot collide with another
 * worktree's or another session's concurrent run on the slot-overlap
 * constraint. Tests that share that one member use distinct `startsAt`
 * values to avoid colliding with each other, and distinct `now` values so
 * one test's fixtures are never due at another's clock.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { asc, eq, inArray } from "drizzle-orm";
import { NotificationType } from "@ntizo/shared";
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
import { SweepBookingCommand } from "../../../../bounded-contexts/booking/app/use-cases/sweep-booking.command";
import { SweepDueBookingsInternalCommand } from "../../../../bounded-contexts/booking/app/use-cases/sweep-due-bookings.internal.command";
import { FakeRaiser } from "../../../../bounded-contexts/booking/__tests__/support/fakes";
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
 * own cleanup — `afterAll` runs after every test body has already deleted
 * its own booking rows, so a cleanup query that looked up ids via a fresh
 * `SELECT ... FROM booking WHERE providerId = ...` at that point would find
 * nothing and silently delete zero outbox rows.
 */
const createdBookingIds: string[] = [];

beforeAll(async () => {
  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    {
      id: customerId,
      email: `booking-sweep-customer-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerUserId,
      email: `booking-sweep-owner-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Booking Sweep Test Provider",
      slug: `booking-sweep-test-${suffix}`,
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
    .values({ code: `booking-sweep-test-${suffix}` })
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
    providerName: "Booking Sweep Test Provider",
    providerSlug: `booking-sweep-test-${suffix}`,
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
 * A booking standing on the checkout hold — the first clock. `Booking.create`
 * produces exactly this, so the fixture is the constructor.
 */
function draftBooking(input: Parameters<typeof Booking.create>[0]): Booking {
  return Booking.create(input);
}

/**
 * A booking standing on the provider's response window — the second clock.
 *
 * `input.expiresAt` is reused as `submit`'s `respondBy` so the deadline that
 * actually lands on the row is the one each fixture below already configures,
 * rather than a second date nothing here reads back.
 */
function awaitingBooking(input: Parameters<typeof Booking.create>[0]): Booking {
  const draft = draftBooking(input);
  // `submit` now takes the address explicitly; every fixture here sets a
  // concrete one via `bookingInput`, so pulling it back off the draft is safe.
  return draft.submit(
    new Date(),
    input.expiresAt,
    {
      label: draft.addressLabel as string,
      line: draft.addressLine as string,
      city: draft.addressCity as string,
    },
    // No description: nothing in this file reads one back, and `submit`
    // requires the argument so that omitting it can never mean "leave
    // whatever was there".
    null,
  );
}

/**
 * A booking standing on the payment window — the third clock, and the only
 * one whose ending is a cancellation.
 *
 * Threads through `submit` and `accept` the way a real booking does, since
 * `Booking.create` no longer reaches `PENDING_PAYMENT`. Neither transition's
 * own deadline argument is what this file's assertions read; `input.expiresAt`
 * is reused for both, for the same reason as `awaitingBooking` above.
 */
function pendingBooking(input: Parameters<typeof Booking.create>[0]): Booking {
  return awaitingBooking(input).accept(new Date(), input.expiresAt);
}

/**
 * A fresh sweep, wired exactly the way `bootstrapBooking()` wires it in
 * production — the same `SweepBookingCommand` instance backs both
 * `useCases.sweepBooking` and `useCases.internal.sweepDue` there, and this
 * mirrors that rather than constructing two independent commands that could
 * drift apart.
 */
function buildSweep(
  bookingRepo: BookingRepositoryPort,
  now: () => Date = () => new Date(),
  // A fake rather than the real `RaiseNotificationInternalCommand`: what this
  // file proves about notifications is *which* ending announces and which
  // stays quiet, and routing that through the notification context's own
  // tables would put a second bounded context's writes inside every
  // assertion here. The one test that reads it back passes its own.
  raiser: FakeRaiser = new FakeRaiser(),
) {
  const slotHold = new BookingRowSlotHold();
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());
  const sweepBooking = new SweepBookingCommand(
    bookingRepo,
    slotHold,
    unitOfWork,
    outboxPort,
    raiser,
  );
  return new SweepDueBookingsInternalCommand(bookingRepo, sweepBooking, now);
}

/**
 * Runs one test body inside this file's transaction context and deletes
 * every booking it inserted afterwards — **in a `finally`, so an assertion
 * that throws mid-test still cleans up.**
 *
 * That is the structural point, not a convenience. Before this, each test
 * ended with its own `db.delete(...)` calls after its last assertion: an
 * assertion that threw early skipped them, and the leaked row stayed
 * `PENDING_PAYMENT` in a shared database. The sweep's query is not scoped to
 * this file's provider — it cannot be, that is the query production runs —
 * so every later test in this file then swept that orphan too, and three
 * unrelated-looking failures came out of one skipped cleanup. `afterAll`
 * does not help: it is a cross-*run* net, not a cross-*test* one.
 *
 * The widened status filter makes this worse rather than better — a leaked
 * `DRAFT` or `AWAITING_PROVIDER` row is now claimed by the same query too,
 * where before only a `PENDING_PAYMENT` one was.
 *
 * `track` both registers a booking for this `finally` and appends it to
 * `createdBookingIds`, which `afterAll` uses to delete the outbox rows the
 * sweep wrote for it — those outlive the booking row and are not caught by
 * deleting bookings alone.
 */
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

/**
 * What the sweep actually announced about one booking, oldest row first.
 *
 * Read from `outbox_event` rather than from a fake outbox because that is
 * where the announcement really lands, and because the payload is the whole
 * question here: `BookingExpired` and `BookingCancelled` differ in who they
 * are addressed to, and the difference is only visible in what they carry.
 * `repo.insert` publishes nothing (that is `CreateBookingCommand`'s job, not
 * the repository's), so every row this returns was written by the sweep.
 */
async function announcementsFor(
  bookingId: string,
): Promise<{ eventType: string; payload: Record<string, unknown> }[]> {
  const rows = await db
    .select({ eventType: outboxEvent.eventType, payload: outboxEvent.payload })
    .from(outboxEvent)
    .where(eq(outboxEvent.aggregateId, bookingId))
    .orderBy(asc(outboxEvent.createdAt));
  return rows.map((row) => ({
    eventType: row.eventType,
    payload: row.payload as Record<string, unknown>,
  }));
}

/**
 * The durable history the sweep left behind for one booking.
 *
 * The event above is a message; this is the record. If Notification drops
 * `BookingCancelled`, or is written later, or a provider simply asks
 * afterwards why their Saturday emptied, `booking_change` is the only thing
 * that still answers — which is the whole reason the sweep writes a row at
 * all, and the reason `changed_by_user_id` had to become nullable to let it.
 */
async function historyFor(
  bookingId: string,
): Promise<{ reason: string; changedByUserId: string | null }[]> {
  const rows = await db
    .select({
      reason: bookingChange.reason,
      changedByUserId: bookingChange.changedByUserId,
    })
    .from(bookingChange)
    .where(eq(bookingChange.bookingId, bookingId))
    .orderBy(asc(bookingChange.changedAt));
  return rows;
}

describe("SweepDueBookingsInternalCommand", () => {
  test("expires a DRAFT past its checkout hold, and leaves one still inside it alone", async () => {
    await withBookings(async (track) => {
      const now = new Date("2026-11-05T12:00:00.000Z");

      const due = track(
        await repo.insert(
          draftBooking(
            bookingInput({
              startsAt: new Date("2026-11-05T09:00:00.000Z"),
              expiresAt: new Date("2026-11-05T09:30:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const notYetDue = track(
        await repo.insert(
          draftBooking(
            bookingInput({
              startsAt: new Date("2026-11-05T10:00:00.000Z"),
              expiresAt: new Date("2026-11-05T23:00:00.000Z"),
            }),
          ),
          1,
        ),
      );
      expect(due.status).toBe("DRAFT");

      const result = await buildSweep(repo, () => now).execute({ limit: 10 });
      expect(result).toEqual({ swept: 1, failed: 0 });

      const dueReread = await repo.findById(due.id as string);
      expect(dueReread?.status).toBe("EXPIRED");
      expect(dueReread?.expiredAt).not.toBeNull();
      // The deadline survives the transition rather than being nulled — it
      // is the fact a customer disputing "you gave my slot away" would need.
      expect(dueReread?.expiresAt?.toISOString()).toBe("2026-11-05T09:30:00.000Z");

      // A customer still inside their thirty minutes keeps the slot they are
      // filling in a form for. Nothing about widening the sweep to DRAFT is
      // allowed to cost them that.
      expect((await repo.findById(notYetDue.id as string))?.status).toBe("DRAFT");

      const [announced, ...extra] = await announcementsFor(due.id as string);
      expect(extra).toEqual([]);
      expect(announced?.eventType).toBe("booking.expired");
      // `checkout_hold` is what tells Notification to stay silent: the only
      // person it could write to is the one who walked away.
      expect(announced?.payload).toMatchObject({
        bookingId: due.id,
        customerId,
        providerMemberId: memberId,
        cause: "checkout_hold",
      });

      // And the durable half: nobody made this change, so the actor is null
      // rather than a sentinel that would read as a person.
      expect(await historyFor(due.id as string)).toEqual([
        { reason: "checkout_hold_expired", changedByUserId: null },
      ]);
    });
  });

  test("expires an AWAITING_PROVIDER past the provider's window, under that window's own name", async () => {
    await withBookings(async (track) => {
      const now = new Date("2026-11-06T12:00:00.000Z");

      const due = track(
        await repo.insert(
          awaitingBooking(
            bookingInput({
              startsAt: new Date("2026-11-06T09:00:00.000Z"),
              expiresAt: new Date("2026-11-06T09:30:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const notYetDue = track(
        await repo.insert(
          awaitingBooking(
            bookingInput({
              startsAt: new Date("2026-11-06T10:00:00.000Z"),
              expiresAt: new Date("2026-11-06T23:00:00.000Z"),
            }),
          ),
          1,
        ),
      );
      expect(due.status).toBe("AWAITING_PROVIDER");

      const result = await buildSweep(repo, () => now).execute({ limit: 10 });
      expect(result).toEqual({ swept: 1, failed: 0 });

      expect((await repo.findById(due.id as string))?.status).toBe("EXPIRED");
      // A provider still inside their two hours has not run out of time.
      expect((await repo.findById(notYetDue.id as string))?.status).toBe("AWAITING_PROVIDER");

      const [announced] = await announcementsFor(due.id as string);
      expect(announced?.eventType).toBe("booking.expired");
      // Same status and same event class as the DRAFT above, and a different
      // audience: this customer did everything asked of them and is owed the
      // news. `cause` is the only thing that separates the two.
      expect(announced?.payload).toMatchObject({
        bookingId: due.id,
        customerId,
        cause: "provider_response",
      });
      expect(announced?.payload.cause).not.toBe("checkout_hold");

      expect(await historyFor(due.id as string)).toEqual([
        { reason: "provider_did_not_respond", changedByUserId: null },
      ]);
    });
  });

  /**
   * The row the whole design was written for, and the cheapest test here to
   * write so that it cannot fail — which is exactly why it is the most
   * important one that it can.
   *
   * A provider accepted, blocked their calendar, and the customer never
   * paid. That is not an expiry. It is a cancellation, the provider is the
   * one who has to be told, and the reason is what they are owed: the
   * platform's own choice of ordering is what cost them the slot.
   *
   * Written so that it goes red if somebody ever makes all three rows
   * `EXPIRED`: it pins the status *and* asserts against `EXPIRED`, pins the
   * event name *and* asserts against `booking.expired`, and pins the reason.
   */
  test("cancels a PENDING_PAYMENT booking past its payment window — CANCELLED with a reason, never EXPIRED", async () => {
    await withBookings(async (track) => {
      const now = new Date("2026-11-07T12:00:00.000Z");

      const due = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2026-11-07T09:00:00.000Z"),
              expiresAt: new Date("2026-11-07T09:30:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const notYetDue = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2026-11-07T10:00:00.000Z"),
              expiresAt: new Date("2026-11-07T23:00:00.000Z"),
            }),
          ),
          1,
        ),
      );
      expect(due.status).toBe("PENDING_PAYMENT");

      const raiser = new FakeRaiser();
      const result = await buildSweep(repo, () => now, raiser).execute({ limit: 10 });
      expect(result).toEqual({ swept: 1, failed: 0 });

      const dueReread = await repo.findById(due.id as string);
      expect(dueReread?.status).toBe("CANCELLED");
      expect(dueReread?.status).not.toBe("EXPIRED");
      expect(dueReread?.cancelledAt).not.toBeNull();
      // Nothing expired, so nothing stamped an expiry.
      expect(dueReread?.expiredAt).toBeNull();
      // And nothing was ever charged: the whole point of the reversal is
      // that the money comes after the provider's yes, and it never came.
      expect(dueReread?.paidAt).toBeNull();
      expect(dueReread?.paymentRef).toBeNull();

      // A customer still inside their payment window has not lost anything.
      expect((await repo.findById(notYetDue.id as string))?.status).toBe("PENDING_PAYMENT");

      const [announced, ...extra] = await announcementsFor(due.id as string);
      expect(extra).toEqual([]);
      expect(announced?.eventType).toBe("booking.cancelled");
      expect(announced?.eventType).not.toBe("booking.expired");
      expect(announced?.payload).toMatchObject({
        bookingId: due.id,
        customerId,
        // The provider is the audience here, unlike either expiry, and this
        // is the id and the member Notification needs to reach them.
        providerId,
        providerMemberId: memberId,
        reason: "customer_did_not_pay",
      });

      // The reason the provider is owed does not live only on an event.
      // `BookingCancelled` is a message a consumer can drop, arrive too
      // late for, or not exist yet to receive; this row is the record that
      // still answers "why did my Saturday empty?" afterwards. Null actor
      // because nobody did it — a deadline passed.
      expect(await historyFor(due.id as string)).toEqual([
        { reason: "customer_did_not_pay", changedByUserId: null },
      ]);

      // BR-P6, over the real sweep: this is the one of the three endings that
      // costs somebody something, and the provider whose Saturday just
      // emptied is told directly rather than only through an event a consumer
      // may or may not exist to receive. The two expiries in this file raise
      // nothing — asserted where they run.
      expect(raiser.raised).toEqual([
        {
          type: NotificationType.ProviderBookingCancelledByCustomer,
          audience: "provider",
          providerId,
          payload: {
            bookingId: due.id,
            serviceName: dueReread?.serviceName,
            startsAt: dueReread?.startsAt.toISOString(),
            reason: "customer_did_not_pay",
          },
        },
      ]);
    });
  });

  /**
   * A booking already paid, whose old deadline has long since passed, must
   * come out of the sweep exactly as it went in — a booking past a clock in
   * a status no clock governs.
   *
   * `markPaid` does not clear `expiresAt` on its way out of
   * `PENDING_PAYMENT` — the deadline stays on the row, still in the past,
   * still non-null (see `booking-repository.test.ts`). So the status filter
   * is the only thing standing between this booking and the sweep, and the
   * widened filter made that filter carry more weight, not less: three
   * statuses now pass it, and `CONFIRMED` still must not.
   */
  test("a confirmed booking past its stale deadline is counted by the sweep but left otherwise untouched", async () => {
    await withBookings(async (track) => {
      const now = new Date("2026-11-02T12:00:00.000Z");

      const inserted = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2026-11-02T09:00:00.000Z"),
              expiresAt: new Date("2026-11-02T09:00:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const paid = inserted.markPaid("mpesa-sweep-test", new Date("2026-11-02T08:45:00.000Z"));
      expect(paid.status).toBe("CONFIRMED");
      expect(paid.expiresAt).toEqual(inserted.expiresAt);
      const applied = await repo.save(paid, "PENDING_PAYMENT");
      expect(applied).toBe(true);

      const result = await buildSweep(repo, () => now).execute({ limit: 10 });

      // Nothing else in this file's fixtures was due at this `now`, so if
      // this comes back swept it can only be this booking's own stale
      // `expires_at` — proof the widened predicate, not a query bug, is
      // what picked it up: CONFIRMED joined DEADLINE_BEARING_STATUSES in
      // the booking-completion plan's schema task.
      //
      // The sweep selects these now and does nothing with them; the arms
      // that give them an ending are the next task's (Task 5).
      expect(result).toEqual({ swept: 1, failed: 0 });

      // "Does nothing with them" proven, not assumed: the row, the payment
      // fields, and the announcement stream are exactly what they were
      // before the sweep ran — `SweepBookingCommand`'s switch has no arm
      // for CONFIRMED yet, so it falls to `default` and returns without
      // saving, appending, releasing, or publishing anything.
      const reread = await repo.findById(inserted.id as string);
      expect(reread?.status).toBe("CONFIRMED");
      expect(reread?.paidAt?.toISOString()).toBe(paid.paidAt?.toISOString());
      expect(reread?.paymentRef).toBe("mpesa-sweep-test");
      expect(await announcementsFor(inserted.id as string)).toEqual([]);
    });
  });

  test("limit caps the batch and drains the oldest deadlines first, across all three clocks", async () => {
    await withBookings(async (track) => {
      const now = new Date("2026-11-03T12:00:00.000Z");

      // One booking per clock, deliberately: the sweep asks one question of
      // all three, so the ordering it drains in has to be by deadline and
      // not by status.
      const oldest = track(
        await repo.insert(
          draftBooking(
            bookingInput({
              startsAt: new Date("2026-11-03T09:00:00.000Z"),
              expiresAt: new Date("2026-11-03T09:00:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const middle = track(
        await repo.insert(
          awaitingBooking(
            bookingInput({
              startsAt: new Date("2026-11-03T10:00:00.000Z"),
              expiresAt: new Date("2026-11-03T09:15:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const newest = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2026-11-03T11:00:00.000Z"),
              expiresAt: new Date("2026-11-03T09:30:00.000Z"),
            }),
          ),
          1,
        ),
      );

      const result = await buildSweep(repo, () => now).execute({ limit: 2 });

      expect(result).toEqual({ swept: 2, failed: 0 });

      expect((await repo.findById(oldest.id as string))?.status).toBe("EXPIRED");
      expect((await repo.findById(middle.id as string))?.status).toBe("EXPIRED");
      // Left for the next sweep run — proves the limit was actually
      // forwarded to `findDueForSweep`, not silently dropped or hardcoded.
      // Still `PENDING_PAYMENT`, so its own ending is still ahead of it.
      expect((await repo.findById(newest.id as string))?.status).toBe("PENDING_PAYMENT");
      expect(await announcementsFor(newest.id as string)).toEqual([]);
    });
  });

  /**
   * One booking that can no longer be settled — here, a row that vanished
   * between `findDueForSweep`'s select and `SweepBookingCommand` reaching
   * it, the same race the command's own doc comment names — must not take
   * the rest of the wave down with it. `findById` is intercepted for
   * exactly one booking id rather than faked outright: `findDueForSweep`
   * still runs the real query against the real database, and only the one
   * lookup this test needs to fail is redirected.
   *
   * **The failing booking is deliberately the OLDEST deadline, so the sweep
   * reaches it first.** An earlier version of this test had it second, and
   * that version could not fail: `findDueForSweep` returns oldest-first,
   * so the throw landed on the last row of the batch and there was nothing
   * left for a `break` to skip. Replacing the `console.error` with
   * `console.error; break` — the exact bug this test exists to catch — left
   * the file green. With the deadlines this way round, that mutation strands
   * `good` at `PENDING_PAYMENT` and reddens both the count and the status
   * assertion below.
   */
  test("one booking failing does not stop the rest of the wave", async () => {
    await withBookings(async (track) => {
      const now = new Date("2026-11-04T12:00:00.000Z");

      // Oldest deadline: the sweep reaches this one first, and it throws.
      const vanished = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2026-11-04T10:00:00.000Z"),
              expiresAt: new Date("2026-11-04T09:00:00.000Z"),
            }),
          ),
          1,
        ),
      );
      // Newer deadline: everything about this test is whether the sweep
      // still gets here.
      const good = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2026-11-04T09:00:00.000Z"),
              expiresAt: new Date("2026-11-04T09:15:00.000Z"),
            }),
          ),
          1,
        ),
      );

      const vanishedId = vanished.id as string;
      const flaky: BookingRepositoryPort = {
        insert: (b) => repo.insert(b, 1),
        save: (b, expectedStatus) => repo.save(b, expectedStatus),
        appendChange: (c: BookingChangeRecord) => repo.appendChange(c),
        findDueForSweep: (n, limit) => repo.findDueForSweep(n, limit),
        // The charge sweep's half of the port, forwarded rather than stubbed
        // for the same reason every other method here is: this object stands
        // in for the real repository with exactly one method made flaky, and
        // a stub would be a second way for it to differ from the real one.
        // Nothing in this file calls either.
        findOpenDraftForCustomer: (customerId) => repo.findOpenDraftForCustomer(customerId),
        findAwaitingCharge: (criteria) => repo.findAwaitingCharge(criteria),
        recordChargeAttempt: (claim) => repo.recordChargeAttempt(claim),
        abandonCharge: (abandonment) => repo.abandonCharge(abandonment),
        findById: (id) => {
          if (id === vanishedId) {
            throw new Error("simulated: row vanished between select and expire");
          }
          return repo.findById(id);
        },
      };

      const result = await buildSweep(flaky, () => now).execute({ limit: 10 });

      expect(result).toEqual({ swept: 1, failed: 1 });

      // The assertion the ordering above exists for: the wave carried on
      // past the failure and settled the booking that came after it.
      expect((await repo.findById(good.id as string))?.status).toBe("CANCELLED");

      // Untouched: SweepBookingCommand threw before it ever reached
      // `repo.save` for this one, so the row is exactly as
      // `findDueForSweep` found it — ready for the next sweep to retry.
      expect((await repo.findById(vanishedId))?.status).toBe("PENDING_PAYMENT");
    });
  });
});
