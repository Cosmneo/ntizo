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
 * The fixture seeds ten bookings, and each one exists to make a different
 * mistake fail.
 *
 * **Membership** — two `CONFIRMED` bookings whose appointment has ended
 * (`unclosed`), two `MARKED_DONE` (`in_window`), three `DISPUTED`
 * (`disputed`), one `CONFIRMED` six months away and one `CONFIRMED` **in
 * progress at `NOW`**. The last two belong to no tab, and they are not the
 * same claim: the future one is what makes `unclosed` mean more than
 * "confirmed", and the in-progress one — started at 09:30, ending at 10:30,
 * asked at 10:00 — is the only fixture that can tell `endsAt < now` from
 * `startsAt < now`.
 *
 * **Order** — every tab has at least two rows, because a queue of one row is
 * in the right order whatever the `ORDER BY` says. `in_window`'s two are
 * marked done in one order and given windows closing in the *other*, so
 * ordering by the wrong clock is a different answer rather than the same one.
 * `unclosed` has a third: a booking ending at the **same instant** as another,
 * on a second member's calendar so the slot constraint permits it, because a
 * tiebreak that is never tied is a line no test can be wrong about.
 *
 * **The dispute's conversation** — five support requests. One `support`
 * request about a marked-done booking, which is the only thing that can fail
 * a lookup that forgot `kind = 'dispute'`. Two dispute requests on one
 * disputed booking, five minutes apart, which is the only thing that can fail
 * a lookup that forgot to deduplicate — and not hypothetical: see
 * `DisputeBookingCommand`'s own doc comment for the compare-and-swap that
 * leaves an orphan behind. Two more on another disputed booking at the **same
 * instant**, so `created_at` cannot separate them and only the thread-id
 * tiebreak can. And one dispute request on a booking that is still
 * `MARKED_DONE` — the orphan itself, which an id-only join would render as a
 * dispute link on a booking nobody has disputed.
 *
 * The workspace is **renamed after every booking is written**, so the name on
 * the row and the name on the workspace differ and a query reading the live
 * column instead of the snapshot can be told apart.
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

/** Bumped once per `confirmed()` so no two fixtures share a payment reference. */
let paymentRefs = 0;

/**
 * The workspace's name **as it stands today**, and deliberately not the name
 * any of these bookings was sold under.
 *
 * `PROVIDER_NAME` above is what `booking.provider_name` snapshotted at sale
 * time; the workspace is renamed to this the moment the fixtures are written.
 * The queue has to answer with the snapshot — see `adminColumns` for the
 * argument — and with one string in both columns a query reading either would
 * pass.
 */
const PROVIDER_RENAMED_TO = "Admin Queue Test Provider (renomeado)";

let customerId: string;
let ownerUserId: string;
/** The second member's person — see `twinMemberId`. */
let staffUserId: string;
let providerId: string;
let memberId: string;
/** A second member, so two bookings can hold the *same slot* without tripping `booking_member_slot_no_overlap`. */
let twinMemberId: string;
let categoryId: string;
let serviceId: string;
let serviceOptionId: string;

/** `CONFIRMED`, ended at 10:00 on the 1st — the oldest unclosed, and never reminded. */
let unclosedEarlyId: string;
/**
 * `CONFIRMED`, ending at **exactly** `unclosedEarly`'s instant, on the second
 * member's calendar. Its only job is to tie: with one clock value shared by
 * two rows, `endsAt` alone cannot order them and `asc(booking.id)` is the only
 * thing that can.
 */
let unclosedTwinId: string;
/** `CONFIRMED`, ended at 10:00 on the 2nd, and asked about once — the row that proves `remindedAt` travels. */
let unclosedLateId: string;
/** `CONFIRMED` and **in progress at `NOW`**: started at 09:30, ends at 10:30. Started is not ended. */
let inProgressId: string;
/** `MARKED_DONE` first, and the window that closes **last** — so `markedDoneAt` and `expiresAt` disagree about the order. */
let windowClosesLastId: string;
/** `MARKED_DONE` last, and the window that closes **first**. This is the row the `in_window` tab must show at the top. */
let windowClosesFirstId: string;
/** `DISPUTED` on the 3rd at 14:00, carrying two dispute requests written five minutes apart. */
let disputedId: string;
/** `DISPUTED` at 17:00, carrying two dispute requests written at the **same instant**. */
let disputedTiedId: string;
/** `DISPUTED` at 20:00, and **with no conversation at all** — the left join must still return it. */
let disputedLaterId: string;
/** `CONFIRMED` and still six months away — visible status, no queue. */
let futureId: string;

/** The dispute's conversation, opened last of the two on `disputedId`. The row's `threadId` must be exactly this. */
let disputeThreadId: string;
/**
 * A **second** `dispute` request on `disputedId`, opened five minutes earlier
 * — the orphan `DisputeBookingCommand`'s own doc comment describes: a thread
 * opened before a compare-and-swap that then lost, with the customer's retry
 * opening the one above. Joined naively this booking comes back twice.
 */
let orphanThreadId: string;
/**
 * `disputedTiedId`'s two conversations, written at one instant so only
 * `desc(threadId)` can separate them — **as `[lower, higher]`**, which is also
 * the order their requests were written in. See `openTiedThreads`.
 */
let tiedThreadIds: [string, string];
/**
 * An orphan on a booking that is **still `MARKED_DONE`** — a dispute whose
 * compare-and-swap lost and was never retried. `kind = 'dispute'` and a
 * booking in the `in_window` tab: the exact row that gives an id-only join a
 * dispute link on a booking nobody has disputed.
 */
let inWindowOrphanThreadId: string;
/** An ordinary question about `windowClosesLastId`. Nothing may ever read this as a dispute. */
let supportThreadId: string;

beforeAll(async () => {
  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  staffUserId = crypto.randomUUID();
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
    {
      id: staffUserId,
      email: `admin-bookings-staff-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);
  await db.insert(profile).values([
    { userId: customerId, firstName: "Ana", lastName: "Machava", phoneNumber: "+258840000009" },
    { userId: ownerUserId, firstName: "Beatriz", lastName: "Cossa" },
    { userId: staffUserId, firstName: "Carla", lastName: "Nhaca" },
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

  // `booking_member_slot_no_overlap` keys on the member, so two bookings can
  // share an instant only if they are on two calendars. That is the whole
  // reason this second member exists — see `unclosedTwinId`.
  // Its own user, because `provider_member_provider_user_uniq` allows one
  // membership per person per workspace.
  const [twinMemberRow] = await db
    .insert(providerMember)
    .values({ providerId, userId: staffUserId, role: "staff" })
    .returning({ id: providerMember.id });
  twinMemberId = twinMemberRow!.id;

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
    // Every slot below is its own hour on the owner's calendar:
    // `booking_member_slot_no_overlap` is an exclusion constraint on the
    // member's time. The one exception is `unclosedTwin`, which shares an
    // instant deliberately and is therefore on the second member's.
    unclosedEarlyId = await confirmed(new Date("2026-09-01T09:00:00.000Z"));
    unclosedTwinId = await confirmed(new Date("2026-09-01T09:00:00.000Z"), twinMemberId);

    unclosedLateId = await confirmed(new Date("2026-09-02T09:00:00.000Z"));
    // Asked once, and still not answered. `reminded` is the only thing that
    // writes `remindedAt`; the earlier rows keep their null so the column is
    // proven in both directions rather than just being present.
    const reminded = (await load(unclosedLateId)).reminded(
      new Date("2026-09-02T12:00:00.000Z"),
      new Date("2026-09-04T12:00:00.000Z"),
    );
    await commit(reminded, BookingStatus.Confirmed);

    // **Straddling `NOW`**: started at 09:30, ends at 10:30, and `NOW` is
    // 10:00. Confirmed, in progress, and not stuck — a job running late is
    // the ordinary case for the trades this platform serves. This is the only
    // fixture that can tell `endsAt < now` from `startsAt < now`, which four
    // doc comments insist are different questions.
    inProgressId = await confirmed(new Date("2026-09-04T09:30:00.000Z"));

    windowClosesLastId = await confirmed(new Date("2026-09-03T09:00:00.000Z"));
    // `markDone` refuses an instant before the appointment ended, so the hop
    // is stamped half an hour after it. Marked done **first**, and given the
    // window that closes **last**.
    const markedDoneFirst = (await load(windowClosesLastId)).markDone(
      new Date("2026-09-03T10:30:00.000Z"),
      new Date("2026-09-06T10:30:00.000Z"),
    );
    await commit(markedDoneFirst, BookingStatus.Confirmed);

    // Marked done six hours **later** and given a window that closes a day
    // **earlier**, so `markedDoneAt` and `expiresAt` rank these two rows the
    // opposite way round. The tab's claim is "the window closing soonest
    // first"; without this disagreement, ordering by either column would look
    // identical.
    windowClosesFirstId = await confirmed(new Date("2026-09-03T15:00:00.000Z"));
    const markedDoneLast = (await load(windowClosesFirstId)).markDone(
      new Date("2026-09-03T16:30:00.000Z"),
      new Date("2026-09-05T16:30:00.000Z"),
    );
    await commit(markedDoneLast, BookingStatus.Confirmed);

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

    // Two dispute requests written at **one instant**, so `created_at` cannot
    // separate them and only `desc(thread_id)` can — the tie the dedup's own
    // comment names ("`created_at` defaults to `now()` and two rows written in
    // one transaction share it") and which the pair above deliberately avoids.
    disputedTiedId = await confirmed(new Date("2026-09-03T15:00:00.000Z"), twinMemberId);
    const doneTied = (await load(disputedTiedId)).markDone(
      new Date("2026-09-03T16:30:00.000Z"),
      new Date("2026-09-06T16:30:00.000Z"),
    );
    await commit(doneTied, BookingStatus.Confirmed);
    const disputedTied = doneTied.dispute(new Date("2026-09-03T17:00:00.000Z"));
    await commit(disputedTied, BookingStatus.MarkedDone);

    // Disputed last, and deliberately left without a conversation. The thread
    // lookup is proven to be a *left* join — a booking whose thread is missing
    // must still reach the administrator who has to decide it, rather than
    // disappearing out of the only tab that would show it.
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
  tiedThreadIds = await openTiedThreads(disputedTiedId, new Date("2026-09-03T17:00:00.000Z"));
  inWindowOrphanThreadId = await openThread(
    windowClosesFirstId,
    "dispute",
    new Date("2026-09-03T17:30:00.000Z"),
  );
  supportThreadId = await openThread(
    windowClosesLastId,
    "support",
    new Date("2026-09-03T11:00:00.000Z"),
  );

  // **Renamed after every booking was written**, so `provider.name` and the
  // `provider_name` snapshotted onto each row now hold different strings. A
  // query reading the live column instead of the snapshot is otherwise
  // indistinguishable from one reading the right one.
  await db.update(provider).set({ name: PROVIDER_RENAMED_TO }).where(eq(provider.id, providerId));
});

afterAll(async () => {
  await bestEffortCleanup([
    // Threads first: `support_request.thread_id` cascades from `thread`, and
    // `support_request.booking_id` does *not* cascade from `booking` — so a
    // booking with a request still pointing at it refuses to be deleted.
    () => db.delete(thread).where(eq(thread.id, disputeThreadId)),
    () => db.delete(thread).where(eq(thread.id, orphanThreadId)),
    () => db.delete(thread).where(eq(thread.id, tiedThreadIds[0])),
    () => db.delete(thread).where(eq(thread.id, tiedThreadIds[1])),
    () => db.delete(thread).where(eq(thread.id, inWindowOrphanThreadId)),
    () => db.delete(thread).where(eq(thread.id, supportThreadId)),
    // `booking_change` cascades on the booking it logs — see its schema.
    () => db.delete(booking).where(eq(booking.providerId, providerId)),
    () => db.delete(serviceOption).where(eq(serviceOption.id, serviceOptionId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(providerMember).where(eq(providerMember.id, twinMemberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(profile).where(eq(profile.userId, customerId)),
    () => db.delete(profile).where(eq(profile.userId, ownerUserId)),
    () => db.delete(profile).where(eq(profile.userId, staffUserId)),
    () => db.delete(user).where(eq(user.id, customerId)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => db.delete(user).where(eq(user.id, staffUserId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

/** Every `Booking.create` input this file needs, with the caller's slot and calendar. */
function bookingInput(startsAt: Date, providerMemberId: string): Parameters<typeof Booking.create>[0] {
  return {
    customerId,
    providerId,
    serviceId,
    serviceOptionId,
    providerMemberId,
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
 *
 * `providerMemberId` defaults to the owner. The one caller that passes the
 * second member is doing so to put two bookings on the same instant — see
 * `twinMemberId`.
 */
async function confirmed(startsAt: Date, providerMemberId: string = memberId): Promise<string> {
  const created = await writeRepo.insert(
    Booking.create(bookingInput(startsAt, providerMemberId)),
    1,
  );
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
  // Numbered rather than keyed on the slot: two fixtures now share an instant
  // on two calendars, and two payments for one reference is a shape M-Pesa
  // never produces.
  paymentRefs += 1;
  const paid = accepted.markPaid(
    `mpesa-${suffix}-${paymentRefs}`,
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
  const threadId = await newSupportThread(createdAt);
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
 * Two dispute conversations about one booking, written at **one instant**.
 *
 * The two threads are created first and their requests inserted **lower id
 * first**, deliberately. `created_at` cannot separate these two rows, so the
 * only thing that can is `desc(thread_id)` — and without it Postgres is free
 * to hand `DISTINCT ON` whichever row it reaches first, which for a small
 * table means the one written first. Inserting the loser first is therefore
 * what makes the missing tiebreak *visible*: with the winner written first,
 * the incidental order and the intended order agree and dropping the tiebreak
 * changes nothing.
 */
async function openTiedThreads(bookingId: string, createdAt: Date): Promise<[string, string]> {
  const ids = await Promise.all([newSupportThread(createdAt), newSupportThread(createdAt)]);
  const [lower, higher] = [...ids].sort() as [string, string];
  for (const threadId of [lower, higher]) {
    await db.insert(supportRequest).values({
      threadId,
      audience: "customer",
      subject: "Limpeza profunda",
      bookingId,
      kind: "dispute",
      status: "open",
      createdAt,
    });
  }
  return [lower, higher];
}

/** A bare support thread, with no request attached yet. */
async function newSupportThread(lastMessageAt: Date): Promise<string> {
  const [row] = await db
    .insert(thread)
    .values({ type: "support", customerUserId: customerId, lastMessageAt })
    .returning({ id: thread.id });
  return row!.id;
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
    unclosedTwinId,
    unclosedLateId,
    inProgressId,
    windowClosesLastId,
    windowClosesFirstId,
    disputedId,
    disputedTiedId,
    disputedLaterId,
    futureId,
  ]);
}

/**
 * The two bookings tied on `endsAt`, in the order `asc(booking.id)` puts them.
 *
 * Sorted here rather than written down, because both ids are random UUIDs and
 * no run can know which is smaller. That is not a weakened assertion: the
 * claim under test is "ties are broken by id", and this is that claim written
 * as an expectation rather than as a guess. Postgres compares `uuid` by its
 * sixteen bytes and the canonical lowercase rendering is those bytes in hex,
 * so a JavaScript string sort agrees with the database's.
 *
 * **What this can and cannot prove, stated so nobody believes more than is
 * true.** With the tiebreak in place these two rows come back in id order
 * every time, and that is the contract `adminOrder` promises. With it removed
 * the answer is *unspecified* rather than wrong: Postgres's sort is not
 * stable, so a tied pair comes back in an order it is free to choose, and
 * roughly half the time it chooses the one this assertion wanted. So dropping
 * `asc(booking.id)` reddens this file about one run in two, not every run.
 *
 * That was measured, not assumed — four runs of the mutant gave two red and
 * two green — and forcing it was tried and abandoned: rewriting the
 * smaller-id row to move it down the heap changes nothing, because the plan
 * sorts rather than scanning in physical order. A tie the query is asked to
 * resolve is the strongest thing a black-box test can set up here; making the
 * *absence* of a tiebreak fail deterministically would take reading the plan,
 * which is a different kind of test than this file is.
 */
function tiedByIdAsc(): [string, string] {
  return [unclosedEarlyId, unclosedTwinId].sort() as [string, string];
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

/** One row of a tab's answer, by id, so an assertion about a booking does not depend on how many rows precede it. */
function rowOf(rows: readonly AdminBookingRow[], bookingId: string): AdminBookingRow {
  const found = rows.find((r) => r.id === bookingId);
  if (!found) throw new Error(`expected ${bookingId} in this tab`);
  return found;
}

/**
 * The body, run inside a single `repeatable read` transaction bound into the
 * app's context.
 *
 * `__runWithTransactionContextForTests` alone binds a db handle and opens no
 * transaction, so two reads in one test take two independent `READ COMMITTED`
 * snapshots — and against a shared `DEV_DB_URL` a sibling worktree can commit
 * a matching booking between them. That is harmless for a test that reads
 * once, and not harmless for the two below that compare two unscoped reads to
 * each other: `countForAdmin` against `listForAdmin`, and one page against the
 * next. One snapshot for both reads removes the race without weakening either
 * assertion.
 */
async function inOneSnapshot<T>(work: () => Promise<T>): Promise<T> {
  return db.transaction(
    async (tx) =>
      // `tx` is a `PgTransaction`, structurally close to but not assignable to
      // `DrizzleDb` (it lacks `$client`), and it supports the whole query
      // surface a repository actually uses. The same cast `runInTransaction`
      // makes in production, for the same reason and with the same words.
      __runWithTransactionContextForTests(tx as unknown as Parameters<typeof __runWithTransactionContextForTests>[0], work),
    { isolationLevel: "repeatable read" },
  );
}

describe("DrizzleBookingReadRepository, administrator side", () => {
  test("unclosed lists the confirmed bookings whose appointment has ended, longest-stuck first", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await queue("unclosed");
      // All three, in `endsAt` order — the older appointment at the top,
      // which is the only thing a queue's order is for. The first two share
      // an `endsAt` to the millisecond, so `asc(booking.id)` is what puts
      // them in *some* order rather than an arbitrary one.
      expect(rows.map((r) => r.id)).toEqual([...tiedByIdAsc(), unclosedLateId]);
      expect(rows.map((r) => r.status)).toEqual(["CONFIRMED", "CONFIRMED", "CONFIRMED"]);
      // The confirmed booking still six months away is confirmed and not
      // stuck: without the `endsAt < now` half it would sit here too.
      expect(rows.map((r) => r.id)).not.toContain(futureId);
    });
  });

  test("unclosed means the appointment has ended, not that it has started", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await queue("unclosed");
      // Started at 09:30, ends at 10:30, and `NOW` is 10:00 — a job running
      // over its slot, which is ordinary for the trades this platform serves.
      // `startsAt < now` is true of it and `endsAt < now` is not; only the
      // second is the question the tab asks, and only this fixture can tell
      // the two predicates apart.
      expect(rows.map((r) => r.id)).not.toContain(inProgressId);
      // Still `CONFIRMED`, so it is not hiding in another tab either — it is
      // simply not anybody's problem yet.
      expect((await queue("in_window")).map((r) => r.id)).not.toContain(inProgressId);
      expect((await queue("disputed")).map((r) => r.id)).not.toContain(inProgressId);
    });
  });

  test("unclosed carries the workspace's name as it was sold, and whether the platform has asked yet", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await queue("unclosed");
      // The snapshot, not today's name: the workspace was renamed after these
      // bookings were written, and a row reading `provider.name` would say
      // `PROVIDER_RENAMED_TO` here.
      expect(rows.map((r) => r.providerName)).toEqual([PROVIDER_NAME, PROVIDER_NAME, PROVIDER_NAME]);
      expect(rows.map((r) => r.providerName)).not.toContain(PROVIDER_RENAMED_TO);
      expect(rows.map((r) => r.providerId)).toEqual([providerId, providerId, providerId]);
      // Both directions of the same column: one asked, two not.
      expect(rowOf(rows, unclosedEarlyId).remindedAt).toBeNull();
      expect(rowOf(rows, unclosedTwinId).remindedAt).toBeNull();
      expect(rowOf(rows, unclosedLateId).remindedAt?.toISOString()).toBe("2026-09-02T12:00:00.000Z");
      // Nothing here is a dispute, so nothing here has a conversation.
      expect(rows.map((r) => r.threadId)).toEqual([null, null, null]);
    });
  });

  test("in_window lists the marked-done bookings, the window closing soonest first", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await queue("in_window");
      // Ordered by `expiresAt`, and **not** by `markedDoneAt`: the two
      // fixtures were marked done in one order and given windows closing in
      // the other, so a query reading the wrong clock returns the wrong row
      // first rather than the same list.
      expect(rows.map((r) => r.id)).toEqual([windowClosesFirstId, windowClosesLastId]);
      expect(rows.map((r) => r.status)).toEqual(["MARKED_DONE", "MARKED_DONE"]);
      expect(rows.map((r) => r.expiresAt?.toISOString())).toEqual([
        "2026-09-05T16:30:00.000Z",
        "2026-09-06T10:30:00.000Z",
      ]);
      // Marked done the other way round, which is what makes the line above
      // an assertion about `expiresAt` rather than about either clock.
      expect(rows.map((r) => r.markedDoneAt?.toISOString())).toEqual([
        "2026-09-03T16:30:00.000Z",
        "2026-09-03T10:30:00.000Z",
      ]);
    });
  });

  test("in_window never reads a support request — or an orphaned dispute — as this booking's dispute", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await queue("in_window");
      // Two different ways a `support_request` can point at a booking in this
      // tab, and neither may become a "ver disputa" link:
      //
      //  - `windowClosesLast` has one of kind `support` — an ordinary
      //    question, which a lookup matching on `booking_id` alone would take.
      //  - `windowClosesFirst` has one of kind **`dispute`**: the orphan a
      //    lost compare-and-swap leaves behind, whose booking never reached
      //    `DISPUTED`. `kind = 'dispute'` does not exclude it — only the
      //    status half of the join condition does.
      expect(rowOf(rows, windowClosesLastId).threadId).toBeNull();
      expect(rowOf(rows, windowClosesFirstId).threadId).toBeNull();
    });
  });

  test("disputed lists the disputed bookings oldest complaint first, carrying their conversations", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await queue("disputed");
      // Ordered by when the customer complained — `disputedAt` — which is the
      // only clock a disputed booking has: `dispute` nulls `expiresAt`.
      expect(rows.map((r) => r.id)).toEqual([disputedId, disputedTiedId, disputedLaterId]);
      expect(rows.map((r) => r.status)).toEqual(["DISPUTED", "DISPUTED", "DISPUTED"]);
      expect(rowOf(rows, disputedId).threadId).toBe(disputeThreadId);
      // The last has no conversation, and is here anyway: a left join, so a
      // missing thread costs a link rather than the whole row.
      expect(rowOf(rows, disputedLaterId).threadId).toBeNull();
      expect(rows.map((r) => r.expiresAt)).toEqual([null, null, null]);
    });
  });

  test("a booking with two dispute threads is listed once, linked to the later one", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await queue("disputed");
      // Exactly one row per booking, though two of them carry two
      // `kind = 'dispute'` requests each. A join that did not deduplicate
      // would return five — two bookings twice — against a `total` counted
      // off `booking` alone, and paging the queue would then show one
      // complaint twice and push another off the end.
      expect(rows.filter((r) => r.id === disputedId)).toHaveLength(1);
      expect(rows.filter((r) => r.id === disputedTiedId)).toHaveLength(1);
      expect(rows).toHaveLength(3);
      // And the link goes to the retry that actually moved the booking, not
      // to the thread whose compare-and-swap lost.
      expect(rowOf(rows, disputedId).threadId).toBe(disputeThreadId);
      expect(rowOf(rows, disputedId).threadId).not.toBe(orphanThreadId);
    });
  });

  test("two dispute threads opened in one instant are separated by thread id", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await queue("disputed");
      // `created_at` cannot choose between these two — they carry the same
      // one, which is exactly what two rows written in one transaction get
      // from `now()`. Only `desc(thread_id)` can, and the loser was written
      // first on purpose (see `openTiedThreads`), so a query without that
      // tiebreak answers with the lower id rather than merely being lucky.
      const [lower, higher] = tiedThreadIds;
      expect(rowOf(rows, disputedTiedId).threadId).toBe(higher);
      expect(rowOf(rows, disputedTiedId).threadId).not.toBe(lower);
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
      expect(ids(unclosed)).toEqual([...tiedByIdAsc(), unclosedLateId]);
      expect(ids(inWindow)).toEqual([windowClosesFirstId, windowClosesLastId]);
      expect(ids(disputed)).toEqual([disputedId, disputedTiedId, disputedLaterId]);
      // And no tab shows either booking whose appointment has not finished.
      for (const rows of [unclosed, inWindow, disputed]) {
        expect(ids(rows)).not.toContain(futureId);
        expect(ids(rows)).not.toContain(inProgressId);
      }
    });
  });

  test("counting a tab agrees with listing it", async () => {
    // One snapshot for both reads — see `inOneSnapshot`. Without it a
    // sibling worktree committing a matching booking between the count and
    // the list would fail this test for a reason that is not in the query.
    await inOneSnapshot(async () => {
      for (const tab of ["unclosed", "in_window", "disputed"] as const) {
        // Both sides read the whole platform, so this is asserted against the
        // *unfiltered* answer: the claim is that the count and the list share
        // one WHERE, not that this file is the only thing in the database.
        const rows = await readRepo.listForAdmin(filter(tab), FIXTURE_BATCH, 0);
        // The list is capped and the count is not, so the two can only be
        // compared while the tab fits in one batch. Asserted rather than
        // assumed, so that outgrowing `FIXTURE_BATCH` says so instead of
        // reading like a query bug.
        expect(rows.length).toBeLessThan(FIXTURE_BATCH);
        expect(await readRepo.countForAdmin(filter(tab))).toBe(rows.length);
      }
    });
  });

  test("the count sees this file's own bookings", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      // A count that shared the list's WHERE but answered zero would pass the
      // test above only if the list were empty too, which the tabs above
      // already refute — so this pins the floor rather than the agreement.
      expect(await readRepo.countForAdmin(filter("unclosed"))).toBeGreaterThanOrEqual(3);
      expect(await readRepo.countForAdmin(filter("in_window"))).toBeGreaterThanOrEqual(2);
      expect(await readRepo.countForAdmin(filter("disputed"))).toBeGreaterThanOrEqual(3);
    });
  });

  test("an offset walks past a row rather than repeating it", async () => {
    // Three unscoped reads compared to each other, so they need one snapshot
    // for the reason `counting a tab agrees with listing it` does.
    await inOneSnapshot(async () => {
      // Paging is proven on the *whole* platform's answer, not on this file's
      // slice of it: `LIMIT`/`OFFSET` are applied in SQL before anything can
      // be filtered, so a page taken from the filtered rows would prove
      // nothing about the query. What has to hold is that the two pages are
      // disjoint and consecutive, which is a property of the ordering being
      // total.
      // Sequential, not `Promise.all`: these run on one reserved connection
      // inside a transaction, and issuing them in order is the honest way to
      // ask for that rather than leaving it to the driver's pipelining.
      const first = await readRepo.listForAdmin(filter("unclosed"), 1, 0);
      const second = await readRepo.listForAdmin(filter("unclosed"), 1, 1);
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(first[0]!.id).not.toBe(second[0]!.id);

      const both = await readRepo.listForAdmin(filter("unclosed"), 2, 0);
      expect(both.map((r) => r.id)).toEqual([first[0]!.id, second[0]!.id]);
    });
  });
});
