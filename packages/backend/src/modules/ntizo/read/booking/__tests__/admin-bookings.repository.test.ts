/**
 * `DrizzleBookingReadRepository`'s administrator-side queries —
 * `listForAdmin` and `countForAdmin` — against the real dev database, for the
 * same reason and by the same mechanism as
 * `provider-bookings.repository.test.ts` beside it: what is under test is a
 * WHERE that decides which of three queues a booking belongs to, an ordering
 * that decides which end of one it appears at, and a correlated subselect
 * that finds a dispute's conversation. None of that is a mapping a fake
 * repository could prove.
 *
 * `getDb()` resolves through the app's request-scoped AsyncLocalStorage
 * context and a test has no request, so every body runs inside
 * `__runWithTransactionContextForTests` with this file's own `DEV_DB_URL`
 * client bound into it.
 *
 * **These queries are deliberately unscoped.** An administrator's queue asks
 * "what needs a hand anywhere on the platform", so unlike every provider-side
 * query there is no owner id in the WHERE to keep this file's rows apart from
 * anybody else's. Two worktrees share one `DEV_DB_URL` and a sibling's
 * in-flight fixtures are unclosed bookings like any other, so every list
 * assertion below filters the answer down to the ids this file created before
 * looking at it — the same discipline `booking-sweep.test.ts`'s
 * `scopedToFixtures` keeps, applied at the assertion rather than at the
 * repository because nothing here writes.
 *
 * Filtering preserves relative order, so the ordering claims survive it
 * intact: two of this file's own rows in the wrong order stay in the wrong
 * order after every foreign row is dropped.
 *
 * The fixture seeds seven bookings: **two per tab**, plus one `CONFIRMED`
 * whose appointment is still ahead of `NOW` and therefore belongs to no tab
 * at all.
 *
 * Two per tab rather than one, because each tab makes a claim about *order*
 * as well as about membership, and a queue of one row is in the right order
 * whatever the `ORDER BY` says. The seventh is what makes `unclosed` mean
 * *ended* rather than merely confirmed: without it, dropping the `endsAt <
 * now` half of that predicate would change nothing.
 *
 * Three support requests, not one. The dispute's; an ordinary `support`
 * request about the marked-done booking, which is the only thing that can
 * fail a lookup that forgot `kind = 'dispute'` and took whichever request
 * mentioned the booking; and a *second* dispute request on the disputed
 * booking, which is the only thing that can fail a lookup that forgot to
 * deduplicate. That second one is not hypothetical — see
 * `DisputeBookingCommand`'s own doc comment for the compare-and-swap that
 * leaves it behind.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { category, service, serviceOption } from "../../../shared/infrastructure/database/catalog/schemas";
import { supportRequest, thread } from "../../../shared/infrastructure/database/communication/schemas";
import { provider, providerMember } from "../../../shared/infrastructure/database/provider/schemas";
import { profile, user } from "../../../shared/infrastructure/database/user/schemas";
import { booking } from "../../../shared/infrastructure/database/booking/schemas";
import { BookingStatus } from "../../../shared/infrastructure/database/booking/enums";
import { Booking } from "../../../bounded-contexts/booking/domain/aggregates/booking.aggregate";
import { DrizzleBookingRepository } from "../../../bounded-contexts/booking/infrastructure/repositories/drizzle/booking.repository";
import { DrizzleBookingReadRepository } from "../infra/repositories/drizzle/booking-read.repository";
import type { AdminBookingFilter, AdminBookingRow } from "../app/ports/outbound/booking-read.repository.port";
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
const suffix = crypto.randomUUID();

/**
 * The instant every tab below is asked about, frozen and written out.
 *
 * `AdminBookingFilter.now` is injected precisely so a test can say what
 * "already ended" means, and every fixture's slot is a literal on one side of
 * this or the other. Nothing here is relative to the wall clock, so the file
 * says the same thing in a year as it does today.
 */
const NOW = new Date("2026-09-04T10:00:00.000Z");

/**
 * How many rows to ask the unscoped queries for before filtering to this
 * file's own.
 *
 * Generous rather than equal to what any assertion expects, for the reason
 * `booking-sweep.test.ts`'s `FIXTURE_BATCH` gives: a foreign row occupying a
 * slot in the page would otherwise push one of this file's fixtures out of it
 * and turn an assertion red for a reason that has nothing to do with the
 * query. That the `LIMIT` is applied in SQL at all is proven by the
 * projection's own paging tests, so asking for a wide page here gives no
 * proof up.
 */
const FIXTURE_BATCH = 1000;

const PROVIDER_NAME = "Admin Queue Test Provider";

let customerId: string;
let ownerUserId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let serviceOptionId: string;

/** `CONFIRMED`, ended at 10:00 on the 1st — the older of the two unclosed, and never reminded. */
let unclosedEarlyId: string;
/** `CONFIRMED`, ended at 10:00 on the 2nd, and asked about once — the row that proves `remindedAt` travels. */
let unclosedLateId: string;
/** `MARKED_DONE` on the 3rd with two days of window left at `NOW` — the window closing first. */
let inWindowId: string;
/** `MARKED_DONE` too, with a day more window than the one above. Its only job is to pin the order. */
let inWindowLaterId: string;
/** `DISPUTED` on the 3rd at 14:00, with the conversation the customer opened. */
let disputedId: string;
/** `DISPUTED` six hours later, and **with no conversation at all** — the left join must still return it. */
let disputedLaterId: string;
/** `CONFIRMED` and still six months away — visible status, no queue. */
let futureId: string;

/** The dispute's conversation, opened last. The row's `threadId` must be exactly this. */
let disputeThreadId: string;
/**
 * A **second** `dispute` request on the same booking, opened five minutes
 * earlier — the orphan `DisputeBookingCommand`'s own doc comment describes: a
 * thread opened before a compare-and-swap that then lost, with the customer's
 * retry opening the one above. Joined naively this booking comes back twice.
 */
let orphanThreadId: string;
/** An ordinary question about `inWindowId`. Nothing may ever read this as a dispute. */
let supportThreadId: string;

beforeAll(async () => {
  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    {
      id: customerId,
      email: `admin-bookings-customer-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerUserId,
      email: `admin-bookings-owner-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);
  await db.insert(profile).values([
    { userId: customerId, firstName: "Ana", lastName: "Machava", phoneNumber: "+258840000009" },
    { userId: ownerUserId, firstName: "Beatriz", lastName: "Cossa" },
  ]);

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: PROVIDER_NAME,
      slug: `admin-bookings-test-${suffix}`,
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
    .values({ code: `admin-bookings-test-${suffix}` })
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

  await __runWithTransactionContextForTests(db, async () => {
    // Every slot below is its own hour: `booking_member_slot_no_overlap` is an
    // exclusion constraint on the member's time, and this workspace's member
    // holds all five.
    unclosedEarlyId = await confirmed(new Date("2026-09-01T09:00:00.000Z"));

    unclosedLateId = await confirmed(new Date("2026-09-02T09:00:00.000Z"));
    // Asked once, and still not answered. `reminded` is the only thing that
    // writes `remindedAt`; the earlier row keeps its null so the column is
    // proven in both directions rather than just being present.
    const reminded = (await load(unclosedLateId)).reminded(
      new Date("2026-09-02T12:00:00.000Z"),
      new Date("2026-09-04T12:00:00.000Z"),
    );
    await commit(reminded, BookingStatus.Confirmed);

    inWindowId = await confirmed(new Date("2026-09-03T09:00:00.000Z"));
    // `markDone` refuses an instant before the appointment ended, so the hop
    // is stamped half an hour after it. Three days of window, closing on the
    // 6th — two days past `NOW`.
    const markedDone = (await load(inWindowId)).markDone(
      new Date("2026-09-03T10:30:00.000Z"),
      new Date("2026-09-06T10:30:00.000Z"),
    );
    await commit(markedDone, BookingStatus.Confirmed);

    // A day more window than the one above, so `in_window`'s order has two
    // rows to be wrong about.
    inWindowLaterId = await confirmed(new Date("2026-09-03T15:00:00.000Z"));
    const markedDoneLater = (await load(inWindowLaterId)).markDone(
      new Date("2026-09-03T16:30:00.000Z"),
      new Date("2026-09-07T16:30:00.000Z"),
    );
    await commit(markedDoneLater, BookingStatus.Confirmed);

    disputedId = await confirmed(new Date("2026-09-03T12:00:00.000Z"));
    const done = (await load(disputedId)).markDone(
      new Date("2026-09-03T13:30:00.000Z"),
      new Date("2026-09-06T13:30:00.000Z"),
    );
    await commit(done, BookingStatus.Confirmed);
    // `dispute` nulls `expiresAt` — nobody is on a clock while an
    // administrator reads the case — which is why this tab orders by
    // `disputedAt` and not by the deadline the other two use.
    const disputed = done.dispute(new Date("2026-09-03T14:00:00.000Z"));
    await commit(disputed, BookingStatus.MarkedDone);

    // Disputed six hours after the one above, and deliberately left without a
    // conversation. Two things at once: `disputed`'s order has two rows, and
    // the thread lookup is proven to be a *left* join — a booking whose
    // thread is missing must still reach the administrator who has to decide
    // it, rather than disappearing out of the only tab that would show it.
    disputedLaterId = await confirmed(new Date("2026-09-03T18:00:00.000Z"));
    const doneLater = (await load(disputedLaterId)).markDone(
      new Date("2026-09-03T19:30:00.000Z"),
      new Date("2026-09-06T19:30:00.000Z"),
    );
    await commit(doneLater, BookingStatus.Confirmed);
    const disputedLater = doneLater.dispute(new Date("2026-09-03T20:00:00.000Z"));
    await commit(disputedLater, BookingStatus.MarkedDone);

    futureId = await confirmed(new Date("2027-03-01T09:00:00.000Z"));
  });

  orphanThreadId = await openThread(disputedId, "dispute", new Date("2026-09-03T14:00:00.000Z"));
  disputeThreadId = await openThread(disputedId, "dispute", new Date("2026-09-03T14:05:00.000Z"));
  supportThreadId = await openThread(inWindowId, "support", new Date("2026-09-03T11:00:00.000Z"));
});

afterAll(async () => {
  await bestEffortCleanup([
    // Threads first: `support_request.thread_id` cascades from `thread`, and
    // `support_request.booking_id` does *not* cascade from `booking` — so a
    // booking with a request still pointing at it refuses to be deleted.
    () => db.delete(thread).where(eq(thread.id, disputeThreadId)),
    () => db.delete(thread).where(eq(thread.id, orphanThreadId)),
    () => db.delete(thread).where(eq(thread.id, supportThreadId)),
    // `booking_change` cascades on the booking it logs — see its schema.
    () => db.delete(booking).where(eq(booking.providerId, providerId)),
    () => db.delete(serviceOption).where(eq(serviceOption.id, serviceOptionId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(profile).where(eq(profile.userId, customerId)),
    () => db.delete(profile).where(eq(profile.userId, ownerUserId)),
    () => db.delete(user).where(eq(user.id, customerId)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

/** Every `Booking.create` input this file needs, with the caller's slot. */
function bookingInput(startsAt: Date): Parameters<typeof Booking.create>[0] {
  return {
    customerId,
    providerId,
    serviceId,
    serviceOptionId,
    providerMemberId: memberId,
    startsAt,
    durationMinutes: 60,
    priceMinor: 100_000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName: "Limpeza profunda",
    providerName: PROVIDER_NAME,
    providerSlug: `admin-bookings-test-${suffix}`,
    optionName: "Standard",
    description: null,
    expiresAt: new Date(startsAt.getTime() - 86_400_000),
  };
}

/**
 * A booking walked all the way to `CONFIRMED` through the real transitions —
 * `submit`, `accept`, `markPaid` — rather than written at that status.
 *
 * Every deadline handed to a hop is derived from the slot so the walk is
 * plausible for a slot in 2026 and for one in 2027 alike; none of them is
 * what the assertions read.
 */
async function confirmed(startsAt: Date): Promise<string> {
  const created = await writeRepo.insert(Booking.create(bookingInput(startsAt)), 1);
  const submitted = created.submit(
    new Date(startsAt.getTime() - 172_800_000),
    new Date(startsAt.getTime() - 86_400_000),
    address(),
    null,
  );
  await commit(submitted, BookingStatus.Draft);
  // The change row `SubmitBookingCommand` appends in the same transaction as
  // the hop. Nothing the administrator's queue reads depends on it — see
  // `adminWhere` for why `askedOfProvider()` is not part of it — but a
  // booking that reached `CONFIRMED` in production always has one, and a
  // fixture that skipped it would be a shape the database never actually
  // holds.
  await writeRepo.appendChange({
    bookingId: submitted.id as string,
    changedByUserId: customerId,
    reason: "submitted_by_customer",
    previousStartsAt: null,
    previousEndsAt: null,
    previousProviderMemberId: null,
    previousPriceMinor: null,
  });
  const accepted = submitted.accept(
    new Date(startsAt.getTime() - 172_800_000),
    new Date(startsAt.getTime() - 43_200_000),
  );
  await commit(accepted, BookingStatus.AwaitingProvider);
  const paid = accepted.markPaid(
    `mpesa-${suffix}-${startsAt.toISOString()}`,
    new Date(startsAt.getTime() - 86_400_000),
  );
  await commit(paid, BookingStatus.PendingPayment);
  return paid.id as string;
}

/** The booking as it now stands, so a second hop is applied to the saved row rather than to a stale instance. */
async function load(bookingId: string): Promise<Booking> {
  const found = await writeRepo.findById(bookingId);
  if (!found) throw new Error(`fixture: ${bookingId} vanished between hops`);
  return found;
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

/**
 * A support conversation about one booking, of one kind.
 *
 * Written directly rather than through `OpenSupportRequestCommand`: what this
 * file needs is the pair of rows the reader joins against, and routing it
 * through another bounded context's command would put that context's own
 * rules inside this fixture.
 */
async function openThread(
  bookingId: string,
  kind: "dispute" | "support",
  createdAt: Date,
): Promise<string> {
  const [row] = await db
    .insert(thread)
    .values({ type: "support", customerUserId: customerId, lastMessageAt: createdAt })
    .returning({ id: thread.id });
  const threadId = row!.id;
  // `createdAt` written rather than defaulted: which of two dispute requests
  // on one booking is the current one is decided by this column, and two rows
  // inserted milliseconds apart would leave that up to the clock.
  await db.insert(supportRequest).values({
    threadId,
    audience: "customer",
    subject: kind === "dispute" ? "Limpeza profunda" : "Uma pergunta",
    bookingId,
    kind,
    status: "open",
    createdAt,
  });
  return threadId;
}

/**
 * `save` is a compare-and-swap and answers `false` rather than throwing when
 * its `expectedStatus` no longer matches. A fixture that ignored that would
 * leave the booking a status behind and fail a *tab* assertion instead of the
 * line that actually went wrong.
 */
async function commit(entity: Booking, expected: Booking["status"]): Promise<void> {
  const written = await writeRepo.save(entity, expected);
  if (!written) {
    throw new Error(`fixture: save of ${entity.id} expecting ${expected} matched no row`);
  }
}

/** One tab, asked at `NOW`. */
function filter(tab: AdminBookingFilter["tab"]): AdminBookingFilter {
  return { tab, now: NOW };
}

/** Every id this file created, so a foreign row can be told from one of ours. */
function ours(): ReadonlySet<string> {
  return new Set([
    unclosedEarlyId,
    unclosedLateId,
    inWindowId,
    inWindowLaterId,
    disputedId,
    disputedLaterId,
    futureId,
  ]);
}

/**
 * One tab's answer, narrowed to this file's own bookings — see the file's own
 * doc comment for why an unscoped query read against a shared database has to
 * be narrowed before it is asserted about.
 */
async function queue(tab: AdminBookingFilter["tab"]): Promise<AdminBookingRow[]> {
  const rows = await readRepo.listForAdmin(filter(tab), FIXTURE_BATCH, 0);
  const mine = ours();
  return rows.filter((r) => mine.has(r.id));
}

describe("DrizzleBookingReadRepository, administrator side", () => {
  test("unclosed lists the confirmed bookings whose appointment has ended, longest-stuck first", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await queue("unclosed");
      // Both, in `endsAt` order — the older appointment at the top, which is
      // the only thing a queue's order is for.
      expect(rows.map((r) => r.id)).toEqual([unclosedEarlyId, unclosedLateId]);
      expect(rows.map((r) => r.status)).toEqual(["CONFIRMED", "CONFIRMED"]);
      // The confirmed booking still six months away is confirmed and not
      // stuck: without the `endsAt < now` half it would sit here too.
      expect(rows.map((r) => r.id)).not.toContain(futureId);
    });
  });

  test("unclosed carries the workspace's name, and whether the platform has asked yet", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await queue("unclosed");
      expect(rows.map((r) => r.providerName)).toEqual([PROVIDER_NAME, PROVIDER_NAME]);
      // Both directions of the same column: one asked, one not.
      expect(rows[0]!.remindedAt).toBeNull();
      expect(rows[1]!.remindedAt?.toISOString()).toBe("2026-09-02T12:00:00.000Z");
      // Nothing here is a dispute, so nothing here has a conversation.
      expect(rows.map((r) => r.threadId)).toEqual([null, null]);
    });
  });

  test("in_window lists the marked-done bookings, the window closing soonest first", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await queue("in_window");
      expect(rows.map((r) => r.id)).toEqual([inWindowId, inWindowLaterId]);
      expect(rows.map((r) => r.status)).toEqual(["MARKED_DONE", "MARKED_DONE"]);
      expect(rows[0]!.markedDoneAt?.toISOString()).toBe("2026-09-03T10:30:00.000Z");
      // The window's own deadline, which is what this tab orders by — and the
      // second row's is a day later, which is the whole of the order's claim.
      expect(rows[0]!.expiresAt?.toISOString()).toBe("2026-09-06T10:30:00.000Z");
      expect(rows[1]!.expiresAt?.toISOString()).toBe("2026-09-07T16:30:00.000Z");
    });
  });

  test("in_window never reads an ordinary support request as a dispute", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await queue("in_window");
      // There *is* a support request pointing at this booking — of kind
      // `support`. A subselect that matched on `booking_id` alone would hand
      // this row a thread id and put a "ver disputa" link on a booking nobody
      // has disputed.
      expect(rows[0]!.threadId).toBeNull();
    });
  });

  test("disputed lists the disputed bookings oldest complaint first, carrying their conversations", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await queue("disputed");
      // Ordered by when the customer complained — `disputedAt` — which is the
      // only clock a disputed booking has: `dispute` nulls `expiresAt`.
      expect(rows.map((r) => r.id)).toEqual([disputedId, disputedLaterId]);
      expect(rows.map((r) => r.status)).toEqual(["DISPUTED", "DISPUTED"]);
      expect(rows[0]!.threadId).toBe(disputeThreadId);
      // The second has no conversation, and is here anyway: a left join, so a
      // missing thread costs a link rather than the whole row.
      expect(rows[1]!.threadId).toBeNull();
      expect(rows.map((r) => r.expiresAt)).toEqual([null, null]);
    });
  });

  test("a booking with two dispute threads is listed once, linked to the later one", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await queue("disputed");
      // Exactly two rows for two bookings, though one of them carries two
      // `kind = 'dispute'` requests. A join that did not deduplicate would
      // return three — the same booking twice — against a `total` counted off
      // `booking` alone, and paging the queue would then show one complaint
      // twice and push another off the end.
      expect(rows.filter((r) => r.id === disputedId)).toHaveLength(1);
      expect(rows).toHaveLength(2);
      // And the link goes to the retry that actually moved the booking, not
      // to the thread whose compare-and-swap lost.
      expect(rows[0]!.threadId).toBe(disputeThreadId);
      expect(rows[0]!.threadId).not.toBe(orphanThreadId);
    });
  });

  test("each tab keeps the other two tabs' bookings out", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const [unclosed, inWindow, disputed] = await Promise.all([
        queue("unclosed"),
        queue("in_window"),
        queue("disputed"),
      ]);
      const ids = (rows: AdminBookingRow[]) => rows.map((r) => r.id);
      expect(ids(unclosed)).toEqual([unclosedEarlyId, unclosedLateId]);
      expect(ids(inWindow)).toEqual([inWindowId, inWindowLaterId]);
      expect(ids(disputed)).toEqual([disputedId, disputedLaterId]);
      // And nothing shows the booking whose appointment has not happened.
      for (const rows of [unclosed, inWindow, disputed]) {
        expect(ids(rows)).not.toContain(futureId);
      }
    });
  });

  test("counting a tab agrees with listing it", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      for (const tab of ["unclosed", "in_window", "disputed"] as const) {
        // Both sides read the whole platform, so this is asserted against the
        // *unfiltered* answer: the claim is that the count and the list share
        // one WHERE, not that this file is the only thing in the database.
        const rows = await readRepo.listForAdmin(filter(tab), FIXTURE_BATCH, 0);
        expect(await readRepo.countForAdmin(filter(tab))).toBe(rows.length);
      }
    });
  });

  test("the count sees this file's own bookings", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      // A count that shared the list's WHERE but answered zero would pass the
      // test above only if the list were empty too, which the tabs above
      // already refute — so this pins the floor rather than the agreement.
      expect(await readRepo.countForAdmin(filter("unclosed"))).toBeGreaterThanOrEqual(2);
      expect(await readRepo.countForAdmin(filter("in_window"))).toBeGreaterThanOrEqual(2);
      expect(await readRepo.countForAdmin(filter("disputed"))).toBeGreaterThanOrEqual(2);
    });
  });

  test("an offset walks past a row rather than repeating it", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      // Paging is proven on the *whole* platform's answer, not on this file's
      // slice of it: `LIMIT`/`OFFSET` are applied in SQL before anything can
      // be filtered, so a page taken from the filtered rows would prove
      // nothing about the query. What has to hold is that the two pages are
      // disjoint and consecutive, which is a property of the ordering being
      // total.
      const [first, second] = await Promise.all([
        readRepo.listForAdmin(filter("unclosed"), 1, 0),
        readRepo.listForAdmin(filter("unclosed"), 1, 1),
      ]);
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(first[0]!.id).not.toBe(second[0]!.id);

      const both = await readRepo.listForAdmin(filter("unclosed"), 2, 0);
      expect(both.map((r) => r.id)).toEqual([first[0]!.id, second[0]!.id]);
    });
  });
});
