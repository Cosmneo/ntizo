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
 * each of the design's five clocks the ending the design says it gets —
 * `DRAFT` and `AWAITING_PROVIDER` expire, `PENDING_PAYMENT` is *cancelled
 * with a reason*, `CONFIRMED` is *asked* and only closed on a second firing,
 * `MARKED_DONE` is completed — and that the event each one publishes carries
 * enough for Notification to know who to tell. The predicate itself (the widened status
 * filter, ordering, limit) is proven against the database in
 * `booking-repository.test.ts`; the aggregate's own refusals are proven in
 * `booking.aggregate.test.ts`. This file is about the wiring between them,
 * plus the two properties a loop has and a query does not: one row's failure
 * does not stop the wave, and the limit is respected.
 *
 * **Every booking is deleted in a `finally`, never after the last
 * assertion** — see `withBookings`. That is not tidiness: a leaked row stays
 * in `createdBookingIds` for the rest of the run, so every later test's sweep
 * claims it.
 *
 * **What each sweep can reach is narrowed to this file's own bookings** — see
 * `scopedToFixtures`. The query production runs is unscoped, and against a
 * dev database two worktrees share that is not something a test may start:
 * since `CONFIRMED` and `MARKED_DONE` joined the deadline filter, a sweep
 * reaching a foreign row does not merely count it, it writes to it.
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
import { DrizzleProviderMemberReader } from "../../../../bounded-contexts/booking/infrastructure/repositories/drizzle/provider-member.reader";
import { DrizzleAdminUserReader } from "../../../../bounded-contexts/booking/infrastructure/repositories/drizzle/admin-user.reader";
import { BookingRowSlotHold } from "../../../../bounded-contexts/booking/infrastructure/adapters/booking-row-slot-hold.adapter";
import { MarkBookingDoneCommand } from "../../../../bounded-contexts/booking/app/use-cases/mark-booking-done.command";
import { CompleteBookingCommand } from "../../../../bounded-contexts/booking/app/use-cases/complete-booking.command";
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
/**
 * One administrator who must hear about a booking the platform closed alone,
 * and one who must not.
 *
 * `DrizzleAdminUserReader` filters on `role = 'admin' AND status = 'active'`,
 * and the second half of that is the load-bearing one: a suspended
 * administrator's inbox is not somewhere a booking's affairs should keep
 * arriving. Only a pair can prove it — a fixture with the active one alone
 * passes just as happily against a reader that never looked at `status`.
 *
 * The assertions read these two by id and say nothing about the length of the
 * list, because the query is unscoped: every real administrator in the shared
 * dev database is in this fan-out too.
 */
let activeAdminUserId: string;
let suspendedAdminUserId: string;
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
  activeAdminUserId = crypto.randomUUID();
  suspendedAdminUserId = crypto.randomUUID();
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
    {
      id: activeAdminUserId,
      email: `booking-sweep-admin-${suffix}@ntizo.test`,
      role: "admin",
      status: "active",
    },
    {
      id: suspendedAdminUserId,
      email: `booking-sweep-ex-admin-${suffix}@ntizo.test`,
      role: "admin",
      status: "suspended",
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
    // Both administrators go too. A leaked `role = 'admin'` row in the shared
    // dev database is not inert: every later run's fan-out would address it.
    () => db.delete(user).where(eq(user.id, activeAdminUserId)),
    () => db.delete(user).where(eq(user.id, suspendedAdminUserId)),
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
 * How many due rows to ask the real query for before scoping.
 *
 * Generous rather than equal to the caller's `limit`: a foreign row occupying
 * a slot in the batch would otherwise push one of this file's own fixtures
 * out of it and turn an exact-count assertion red for a reason that has
 * nothing to do with the sweep.
 */
const FIXTURE_BATCH = 200;

/**
 * The repository, with `findDueForSweep` narrowed to the bookings this file
 * created.
 *
 * **The production query is deliberately unscoped** — it selects every due row
 * in the database, which is what production has to do — and this file runs it
 * against a *shared* dev database. Two worktrees point at one `DEV_DB_URL`,
 * and a sibling's in-flight fixtures are due rows like any other.
 *
 * That used to cost only an inflated `swept` count. It costs more now: since
 * `CONFIRMED` and `MARKED_DONE` joined the deadline filter, a foreign row is
 * no longer merely *counted* by a sweep this file starts — it is asked about,
 * or closed, published to the outbox and announced to every real
 * administrator, and a foreign `MARKED_DONE` row is completed with
 * `booking.completed` published, which is the event a payout hangs off. A test
 * file has no business doing any of that to somebody else's row.
 *
 * `limit` is applied *after* the filter, so the exact-count assertions below
 * mean what they say: a foreign due row can neither inflate a count nor
 * displace one of this file's fixtures out of the batch. That
 * `findDueForSweep` itself applies its `LIMIT` in SQL is proven separately, in
 * `booking-repository.test.ts`'s own `findDueForSweep` tests — so asking for a
 * wider batch here gives that proof up nowhere.
 */
function scopedToFixtures(inner: BookingRepositoryPort): BookingRepositoryPort {
  return {
    insert: (b, capacity) => inner.insert(b, capacity),
    findById: (id) => inner.findById(id),
    findOpenDraftForCustomer: (customerId) => inner.findOpenDraftForCustomer(customerId),
    save: (b, expectedStatus) => inner.save(b, expectedStatus),
    appendChange: (c) => inner.appendChange(c),
    findAwaitingCharge: (criteria) => inner.findAwaitingCharge(criteria),
    recordChargeAttempt: (claim) => inner.recordChargeAttempt(claim),
    abandonCharge: (abandonment) => inner.abandonCharge(abandonment),
    async findDueForSweep(now, limit) {
      const due = await inner.findDueForSweep(now, FIXTURE_BATCH);
      return due.filter((b) => createdBookingIds.includes(b.id as string)).slice(0, limit);
    },
  };
}

/**
 * A fresh sweep, wired exactly the way `bootstrapBooking()` wires it in
 * production — the same `SweepBookingCommand` instance backs both
 * `useCases.sweepBooking` and `useCases.internal.sweepDue` there, and this
 * mirrors that rather than constructing two independent commands that could
 * drift apart.
 *
 * The one thing it does *not* mirror is the reach of `findDueForSweep`: the
 * repository is wrapped once here, so every sweep this file starts sees only
 * this file's own bookings. Wrapping at this single boundary rather than at
 * each call site is what makes that true of all of them — including the
 * `flaky` repository the last test passes in, whose own `findById`
 * interception still works because `scopedToFixtures` delegates to it.
 */
function buildSweep(
  rawRepo: BookingRepositoryPort,
  now: () => Date = () => new Date(),
  // A fake rather than the real `RaiseNotificationInternalCommand`: what this
  // file proves about notifications is *which* ending announces and which
  // stays quiet, and routing that through the notification context's own
  // tables would put a second bounded context's writes inside every
  // assertion here. The one test that reads it back passes its own.
  raiser: FakeRaiser = new FakeRaiser(),
) {
  const bookingRepo = scopedToFixtures(rawRepo);
  const slotHold = new BookingRowSlotHold();
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());
  // The two commands the sweep's last two arms hand over to, and the real
  // reader behind its administrator fan-out — the same instances
  // `bootstrapBooking()` gives it. `DrizzleAdminUserReader` rather than a fake
  // because this file is where the real query gets to run: the fixtures below
  // create one active administrator and one suspended one, and only the first
  // is supposed to hear anything.
  const markBookingDone = new MarkBookingDoneCommand(
    bookingRepo,
    new DrizzleProviderMemberReader(),
    unitOfWork,
    outboxPort,
    raiser,
  );
  const completeBooking = new CompleteBookingCommand(bookingRepo, unitOfWork, outboxPort, raiser);
  const sweepBooking = new SweepBookingCommand(
    bookingRepo,
    slotHold,
    unitOfWork,
    outboxPort,
    raiser,
    markBookingDone,
    completeBooking,
    new DrizzleAdminUserReader(),
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
  /**
   * The harness, not the sweep — and it earns its place because every other
   * test in this file now depends on it silently.
   *
   * `scopedToFixtures` is the only thing standing between a sweep started here
   * and a row belonging to somebody else's worktree, and nothing else would
   * notice if it stopped filtering: the dev database usually holds no foreign
   * due row, so an unfiltered `findDueForSweep` passes every assertion below
   * right up until the day it does not, and on that day it does not merely
   * miscount — it stamps, closes, publishes and announces a stranger's
   * booking.
   *
   * So this test manufactures exactly that row. It inserts a due `DRAFT` and
   * **deliberately does not `track` it**, which is what makes it foreign as
   * far as `createdBookingIds` is concerned, and deletes it by hand in a
   * `finally` — the one place in this file that cannot use `withBookings`'
   * cleanup, because being outside that list is the whole point.
   *
   * **`limit: 1`, with the foreign row holding the older deadline, is what
   * makes this test say two things rather than one.** `findDueForSweep`
   * returns oldest first, so a wrapper that passed the caller's `limit` down
   * to SQL would come back holding only the foreign row, filter it away and
   * sweep nothing — leaving this file's own fixture unswept for a reason that
   * has nothing to do with it. That is what `FIXTURE_BATCH` prevents, and why
   * the slice happens after the filter rather than in the query.
   */
  test("a sweep started here cannot reach a booking this file did not create", async () => {
    await withBookings(async (track) => {
      const now = new Date("2026-11-12T14:00:00.000Z");

      // The older deadline, so the real query returns this one first.
      const foreign = await repo.insert(
        draftBooking(
          bookingInput({
            startsAt: new Date("2026-11-12T09:00:00.000Z"),
            expiresAt: new Date("2026-11-12T08:00:00.000Z"),
          }),
        ),
        1,
      );
      const foreignId = foreign.id as string;

      try {
        const mine = track(
          await repo.insert(
            draftBooking(
              bookingInput({
                startsAt: new Date("2026-11-12T11:00:00.000Z"),
                expiresAt: new Date("2026-11-12T09:30:00.000Z"),
              }),
            ),
            1,
          ),
        );
        // Both due by every measure the real query applies — past their
        // checkout hold, in a deadline-bearing status. Only one of them is
        // this file's.
        expect(foreign.status).toBe("DRAFT");
        expect(mine.status).toBe("DRAFT");

        const result = await buildSweep(repo, () => now).execute({ limit: 1 });

        // The one slot the caller allowed went to this file's booking, not to
        // the older foreign one.
        expect(result).toEqual({ swept: 1, failed: 0 });
        expect((await repo.findById(mine.id as string))?.status).toBe("EXPIRED");

        // And the foreign row came through untouched: not expired, no history
        // row, nothing announced about it.
        const reread = await repo.findById(foreignId);
        expect(reread?.status).toBe("DRAFT");
        expect(reread?.expiredAt).toBeNull();
        expect(await announcementsFor(foreignId)).toEqual([]);
        expect(await historyFor(foreignId)).toEqual([]);
      } finally {
        await db.delete(booking).where(eq(booking.id, foreignId));
      }
    });
  });

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

      // BR-P6, over the real sweep: of the three endings that can befall a
      // booking before any work happens, this is the one that costs somebody
      // something, and the provider whose Saturday just emptied is told
      // directly rather than only through an event a consumer may or may not
      // exist to receive. The two expiries in this file raise nothing —
      // asserted where they run.
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
   * A booking already paid, whose appointment has since ended, is selected by
   * the sweep — five statuses pass the filter, and `CONFIRMED` is one of them
   * since bookings gained an ending — and is **asked about, not closed**. The
   * status stays exactly where it was; what moves is `reminded_at` and the
   * clock.
   *
   * What makes it due is its own appointment being over, not a leftover
   * payment clock: `markPaid` hands `expiresAt` on to `endsAt` on the way out
   * of `PENDING_PAYMENT` (see `booking-repository.test.ts`) rather than
   * leaving the payment deadline standing or clearing the column. It has to.
   * Nothing past `PENDING_PAYMENT` carried a clock at all until `CONFIRMED`
   * gained one, so a payment deadline left behind there was inert; now it
   * would be live, and every freshly paid booking would arrive here due.
   */
  test("asks the provider to close a confirmed booking whose appointment has ended", async () => {
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
      // The clock it stands on is its own appointment's end — 10:00, two
      // hours before `now`, so the sweep will select it — and not the 09:00
      // payment deadline it was paid against. The second assertion is what
      // keeps the first from passing on a fixture where the two dates happen
      // to coincide, which would prove nothing about the hand-on.
      expect(paid.expiresAt).toEqual(inserted.endsAt);
      expect(paid.expiresAt).not.toEqual(inserted.expiresAt);
      const applied = await repo.save(paid, "PENDING_PAYMENT");
      expect(applied).toBe(true);

      const raiser = new FakeRaiser();
      const result = await buildSweep(repo, () => now, raiser).execute({ limit: 10 });

      // An exact count, like every other in this file, and it is `buildSweep`'s
      // scoping that makes it one: the sweep can only see the two bookings
      // this test created, of which exactly one is due. Without that, a
      // CONFIRMED or MARKED_DONE row belonging to a sibling worktree would
      // count here — those two are states a row sits in indefinitely, unlike
      // the three transient ones — and the number would say nothing.
      expect(result).toEqual({ swept: 1, failed: 0 });

      const reread = await repo.findById(inserted.id as string);
      // Asked, not closed — the point of the whole arm. The payment fields
      // are untouched too: this hop has nothing to do with money.
      expect(reread?.status).toBe("CONFIRMED");
      expect(reread?.markedDoneAt).toBeNull();
      expect(reread?.paidAt?.toISOString()).toBe(paid.paidAt?.toISOString());
      expect(reread?.paymentRef).toBe("mpesa-sweep-test");

      // Both columns really persisted, and the clock really moved off the
      // appointment's end. The instant itself is pinned against a frozen
      // clock in `booking-lifecycle.command.test.ts`; what only this file can
      // say is that `reminded_at` and the pushed-out `expires_at` survived a
      // round trip through Postgres and are seven days apart on the row.
      expect(reread?.remindedAt).not.toBeNull();
      expect(reread?.expiresAt).not.toEqual(inserted.endsAt);
      expect(
        (reread?.expiresAt as Date).getTime() - (reread?.remindedAt as Date).getTime(),
      ).toBe(7 * 24 * 3_600_000);

      // Asking is not an ending, so there is no event for it — the fact lives
      // on the row above and in the history row below.
      expect(await announcementsFor(inserted.id as string)).toEqual([]);
      expect(await historyFor(inserted.id as string)).toEqual([
        { reason: "close_reminder", changedByUserId: null },
      ]);

      // The provider is the one being asked, and the only one told.
      expect(raiser.raised).toEqual([
        {
          type: NotificationType.ProviderBookingCloseReminder,
          audience: "provider",
          providerId,
          payload: {
            bookingId: inserted.id,
            serviceName: reread?.serviceName,
            startsAt: reread?.startsAt.toISOString(),
            closeBy: (reread?.expiresAt as Date).toISOString(),
          },
        },
      ]);
    });
  });

  /**
   * The second firing, seven days after the first, over a row that already
   * carries `reminded_at`.
   *
   * The asking is done here by writing the row the first firing would have
   * written, rather than by sweeping twice: `SweepBookingCommand` stamps its
   * deadlines from the real clock while this file asks its query at a
   * fictional instant, so a two-run version of this test would be reasoning
   * about the distance between those two rather than about the arm.
   *
   * **This fixture's slot is in the real past, unlike every other one in this
   * file, and it has to be.** `MarkBookingDoneCommand` reads `new Date()` and
   * `Booking.markDone` refuses to close a booking whose appointment has not
   * ended yet — a fictional November slot would be refused by that guard
   * however the query's `now` was set, because only the *selection* is
   * fictional here and the *transition* is not. August 2026 is safely behind
   * whenever this suite runs and only gets more so.
   */
  test("closes a confirmed booking it already asked about, and tells the active administrator alone", async () => {
    await withBookings(async (track) => {
      const now = new Date("2026-08-28T12:00:00.000Z");

      const inserted = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2026-08-20T09:00:00.000Z"),
              expiresAt: new Date("2026-08-20T08:30:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const paid = inserted.markPaid("mpesa-sweep-asked", new Date("2026-08-20T08:45:00.000Z"));
      expect(await repo.save(paid, "PENDING_PAYMENT")).toBe(true);

      // Asked the day the job finished, and the seven days it bought are up.
      const asked = paid.reminded(
        new Date("2026-08-20T11:00:00.000Z"),
        new Date("2026-08-27T11:00:00.000Z"),
      );
      expect(await repo.save(asked, "CONFIRMED")).toBe(true);

      const raiser = new FakeRaiser();
      const result = await buildSweep(repo, () => now, raiser).execute({ limit: 10 });
      expect(result).toEqual({ swept: 1, failed: 0 });

      const reread = await repo.findById(inserted.id as string);
      expect(reread?.status).toBe("MARKED_DONE");
      expect(reread?.markedDoneAt).not.toBeNull();
      // The asking is not erased by the closing: the row still says when the
      // conversation started.
      expect(reread?.remindedAt?.toISOString()).toBe("2026-08-20T11:00:00.000Z");
      // And the customer's window really opened, three days wide.
      expect(
        (reread?.expiresAt as Date).getTime() - (reread?.markedDoneAt as Date).getTime(),
      ).toBe(3 * 24 * 3_600_000);

      // Two history rows would mean the sweep wrote one of its own on top of
      // the command's; there is exactly one, and it names the platform.
      expect(await historyFor(inserted.id as string)).toEqual([
        { reason: "marked_done_by_platform", changedByUserId: null },
      ]);

      // One `booking.marked_done`, published by the command that owns the
      // hop — not a second copy from the sweep.
      const announced = await announcementsFor(inserted.id as string);
      expect(announced.map((a) => a.eventType)).toEqual(["booking.marked_done"]);

      // The customer hears once, the provider hears once, and the
      // administrators hear because a provider who stopped answering is
      // something the platform may need to act on. Read by id rather than by
      // count: this fan-out runs the real `DrizzleAdminUserReader`, so every
      // genuine administrator of the dev database is in it too.
      const types = raiser.raised.map((r) => r.type);
      expect(types.filter((t) => t === NotificationType.BookingMarkedDone)).toHaveLength(1);
      expect(types.filter((t) => t === NotificationType.ProviderBookingAutoClosed)).toHaveLength(1);

      const toldIds = raiser.raised
        .filter((r) => r.type === NotificationType.AdminBookingAutoClosed)
        .map((r) => (r.audience === "user" ? r.userId : null));
      expect(toldIds).toContain(activeAdminUserId);
      // The half of the reader's predicate that is easy to drop.
      expect(toldIds).not.toContain(suspendedAdminUserId);
    });
  });

  /**
   * The ending the whole flow aims at. A booking somebody said was finished,
   * whose customer said nothing for three days, is completed — and it is
   * `CompleteBookingCommand` that writes it, so `booking.completed` (which
   * the payout will hang off) really is published.
   */
  test("completes a marked-done booking whose window has closed", async () => {
    await withBookings(async (track) => {
      const now = new Date("2026-11-09T12:00:00.000Z");

      const inserted = track(
        await repo.insert(
          pendingBooking(
            bookingInput({
              startsAt: new Date("2026-11-09T09:00:00.000Z"),
              expiresAt: new Date("2026-11-09T09:00:00.000Z"),
            }),
          ),
          1,
        ),
      );
      const paid = inserted.markPaid("mpesa-sweep-done", new Date("2026-11-09T08:45:00.000Z"));
      expect(await repo.save(paid, "PENDING_PAYMENT")).toBe(true);

      // Marked done at 10:30, with a window that closed at 11:00 — half an
      // hour before this sweep's `now`.
      const done = paid.markDone(
        new Date("2026-11-09T10:30:00.000Z"),
        new Date("2026-11-09T11:00:00.000Z"),
      );
      expect(await repo.save(done, "CONFIRMED")).toBe(true);

      const raiser = new FakeRaiser();
      const result = await buildSweep(repo, () => now, raiser).execute({ limit: 10 });
      expect(result).toEqual({ swept: 1, failed: 0 });

      const reread = await repo.findById(inserted.id as string);
      expect(reread?.status).toBe("COMPLETED");
      expect(reread?.completedAt).not.toBeNull();
      // Nothing was disputed and nothing was cancelled: this is the clean
      // ending, and the two stamps that would say otherwise stay empty.
      expect(reread?.disputedAt).toBeNull();
      expect(reread?.cancelledAt).toBeNull();

      // The outcome the sweep reports is `feedback_window_closed`; the row it
      // leaves behind says `completed_by_timer`. Two vocabularies, on purpose
      // — see `SweepBookingCommand`.
      expect(await historyFor(inserted.id as string)).toEqual([
        { reason: "completed_by_timer", changedByUserId: null },
      ]);

      const announced = await announcementsFor(inserted.id as string);
      expect(announced.map((a) => a.eventType)).toEqual(["booking.completed"]);
      // The money the payout will be computed from travels on the event, so a
      // consumer never has to read the booking back for it.
      expect(announced[0]?.payload).toMatchObject({
        bookingId: inserted.id,
        customerId,
        providerId,
        priceMinor: 100_000,
        commissionMinor: 10_000,
        currency: "MZN",
      });

      // Both sides, once each, and nothing added by the sweep — no
      // administrator hears about a booking that ended the way it should.
      expect(raiser.raised.map((r) => r.type)).toEqual([
        NotificationType.BookingCompleted,
        NotificationType.BookingCompleted,
      ]);
      expect(raiser.raised.map((r) => r.audience)).toEqual(["user", "provider"]);
    });
  });

  test("limit caps the batch and drains the oldest deadlines first, across three different clocks", async () => {
    await withBookings(async (track) => {
      const now = new Date("2026-11-03T12:00:00.000Z");

      // One booking on three different clocks, deliberately: the sweep asks
      // one question of every clock at once, so the ordering it drains in has
      // to be by deadline and not by status. Three of the five is enough to
      // show that — the point is that the order ignores status, not that
      // every status is present.
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
