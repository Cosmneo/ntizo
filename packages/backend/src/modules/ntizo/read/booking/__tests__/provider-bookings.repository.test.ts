/**
 * `DrizzleBookingReadRepository`'s provider-side queries — `listForProvider`,
 * `countForProvider`, `findForProvider`, `timelineFor`, `membersOf` and
 * `statsForProvider` — against the real dev database, for the same reason and
 * by the same mechanism as `list-my-bookings.projection.test.ts` beside it:
 * these queries are joins, a `translate()` the accent search leans on, a
 * WHERE clause that decides which tab a booking belongs to, and a set of
 * windows Postgres cuts in the workspace's own timezone. None of that is a
 * mapping a fake repository could prove.
 *
 * `getDb()` resolves through the app's request-scoped AsyncLocalStorage
 * context and a test has no request, so every body runs inside
 * `__runWithTransactionContextForTests` with this file's own `DEV_DB_URL`
 * client bound into it.
 *
 * The fixture seeds one workspace with five bookings in five different states
 * — a `DRAFT`, a second draft moved to `EXPIRED`, an `AWAITING_PROVIDER`, a
 * `CONFIRMED` whose slot is already behind us and a `CONFIRMED` still ahead of
 * us — because the thing under test is which of them each tab shows. A fixture
 * with one booking cannot fail if the tab filter were dropped, and one with a
 * single `CONFIRMED` cannot tell `upcoming` from `history`.
 *
 * The `DRAFT` is load-bearing twice over: it is the customer's own unfinished
 * checkout, and no query here may ever show it to the provider. The **expired**
 * draft is the same claim one step on, and the one a status filter alone gets
 * wrong: `EXPIRED` is one of the history tab's statuses, so an abandoned
 * step-1 checkout is hidden only by `askedOfProvider()` — the `EXISTS` on the
 * `submitted_by_customer` change row. That is why every submitted fixture below
 * writes that row exactly as `SubmitBookingCommand` does; a fixture that
 * skipped it would be indistinguishable from an abandoned draft, which is the
 * point.
 *
 * A **second workspace** holds two more: the only `COMPLETED` booking, and one
 * accepted and never paid. See `otherProviderId` for why they are kept apart
 * from the five rather than added to them, and for what having a real
 * neighbour buys the stats tests.
 *
 * Fixtures follow the neighbouring file's pattern: a fresh provider and
 * provider member under a random `suffix`, so this run's `providerMemberId`
 * cannot collide with another worktree's concurrent run on
 * `booking_member_slot_no_overlap`, and every booking gets its own distinct,
 * non-overlapping slot for the same reason.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { category } from "../../../shared/infrastructure/database/catalog/schemas";
import { service, serviceOption } from "../../../shared/infrastructure/database/catalog/schemas";
import { provider, providerMember } from "../../../shared/infrastructure/database/provider/schemas";
import { profile, user } from "../../../shared/infrastructure/database/user/schemas";
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
const readRepo = new DrizzleBookingReadRepository();
const now = new Date();
const suffix = crypto.randomUUID();

/**
 * Accented on purpose, and on two different characters on purpose.
 *
 * `ç`/`ã` cover the everyday case — the provider typing "depilacao" on a phone
 * keyboard that will not produce a cedilla. `ñ` covers the case the two folds
 * once disagreed about: it is a combining mark under `normalize("NFD")` but was
 * missing from the SQL side's alphabet, so a name carrying it was unfindable by
 * *either* spelling. See `ACCENTED` in the repository. A service named with no
 * accent at all could not tell a working `translate()` from a plain `ilike`.
 */
const SERVICE_NAME = "Depilação e Uñas";

let customerId: string;
let ownerUserId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let serviceOptionId: string;
let draftId: string;
let expiredDraftId: string;
let awaitingId: string;
let confirmedPastId: string;
let confirmedFutureId: string;

/**
 * A **second workspace**, holding the two bookings the dashboard's numbers
 * need — one `COMPLETED`, one accepted and never paid — apart from the
 * workspace above on purpose.
 *
 * Neither could join the five. `COMPLETED` is one of
 * `PROVIDER_TAB_STATUSES.history`, so a completed booking added beside them
 * would legitimately appear in the history tab; `PENDING_PAYMENT` is one of
 * `PROVIDER_TAB_STATUSES.upcoming`, so an unpaid one would appear in the
 * upcoming tab with a future slot and in history with a past one. Either way
 * three of the list tests above would be asserting something else. Those
 * assertions are the phase's proof that an expired draft stays hidden and
 * that `startsAt` splits `upcoming` from `history`; weakening them to make
 * room for a stats fixture would trade a guarantee for a number.
 *
 * Keeping the completed booking in its own workspace buys a second thing for
 * free: every stats assertion below can be made against a *real* neighbouring
 * workspace with bookings of its own, rather than only against an id nothing
 * has ever written. The revenue of one must not appear in the other, and here
 * that claim has something on both sides of it.
 */
let otherProviderId: string;
let otherMemberId: string;
let otherServiceId: string;
let otherServiceOptionId: string;
let completedId: string;
let acceptedUnpaidId: string;

beforeAll(async () => {
  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    {
      id: customerId,
      email: `provider-bookings-customer-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerUserId,
      email: `provider-bookings-owner-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);
  await db.insert(profile).values([
    { userId: customerId, firstName: "Ana", lastName: "Machava", phoneNumber: "+258840000001" },
    { userId: ownerUserId, firstName: "Beatriz", lastName: "Cossa" },
  ]);

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Provider Bookings Test Provider",
      slug: `provider-bookings-test-${suffix}`,
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
    .values({ code: `provider-bookings-test-${suffix}` })
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

  // The second workspace — see `otherProviderId` for why the completed
  // booking lives here rather than beside the five above. Its own member,
  // service and option, so that nothing it holds is a row belonging to the
  // first workspace wearing a second workspace's provider id.
  const [otherProviderRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Provider Bookings Test Neighbour",
      slug: `provider-bookings-neighbour-${suffix}`,
      status: "active",
      timezone: "Africa/Maputo",
    })
    .returning({ id: provider.id });
  otherProviderId = otherProviderRow!.id;

  const [otherMemberRow] = await db
    .insert(providerMember)
    .values({ providerId: otherProviderId, userId: ownerUserId, role: "owner" })
    .returning({ id: providerMember.id });
  otherMemberId = otherMemberRow!.id;

  const [otherServiceRow] = await db
    .insert(service)
    .values({
      providerId: otherProviderId,
      categoryId,
      sourceLocale: "pt-MZ",
      locationType: "at_customer",
      status: "published",
    })
    .returning({ id: service.id });
  otherServiceId = otherServiceRow!.id;

  const [otherOptionRow] = await db
    .insert(serviceOption)
    .values({
      serviceId: otherServiceId,
      pricingMode: "fixed",
      amountMinor: 80_000,
      durationMinutes: 60,
    })
    .returning({ id: serviceOption.id });
  otherServiceOptionId = otherOptionRow!.id;

  await __runWithTransactionContextForTests(db, async () => {
    // Left where `Booking.create` puts it. Nothing on the provider's side may
    // ever see this row — see this file's own doc comment.
    const draft = await writeRepo.insert(
      Booking.create(
        bookingInput({
          startsAt: new Date("2027-03-01T09:00:00.000Z"),
          expiresAt: new Date("2027-02-28T09:30:00.000Z"),
        }),
      ),
      1,
    );
    draftId = draft.id as string;

    // The same abandoned checkout one deadline later. `Booking.expire` moves a
    // draft past its hold — or one superseded by a second checkout — straight
    // to `EXPIRED`, a status the history tab lists, and no `submitted_by_customer`
    // row is ever written for it because nobody submitted anything.
    const expiredDraft = (
      await writeRepo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2027-03-01T13:00:00.000Z"),
            expiresAt: new Date("2027-02-28T13:30:00.000Z"),
          }),
        ),
        1,
      )
    ).expire(now);
    await commit(expiredDraft, BookingStatus.Draft);
    expiredDraftId = expiredDraft.id as string;

    const awaiting = (
      await writeRepo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2027-03-01T11:00:00.000Z"),
            expiresAt: new Date("2027-02-28T11:30:00.000Z"),
          }),
        ),
        1,
      )
    ).submit(now, new Date("2027-02-28T13:00:00.000Z"), address(), "Depilação completa");
    await commit(awaiting, BookingStatus.Draft);
    awaitingId = awaiting.id as string;
    await recordSubmission(awaitingId);

    // A slot that has already happened, created as such: nothing on the
    // aggregate or in the database refuses a past `startsAt`, so the history
    // tab's `startsAt < now` half can be proven with a real past booking
    // rather than by moving the `now` the filter is asked about.
    const submittedPast = (
      await writeRepo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2020-06-01T09:00:00.000Z"),
            expiresAt: new Date("2020-05-31T09:30:00.000Z"),
          }),
        ),
        1,
      )
    ).submit(
      new Date("2020-05-31T08:00:00.000Z"),
      new Date("2020-05-31T10:00:00.000Z"),
      address(),
      null,
    );
    await commit(submittedPast, BookingStatus.Draft);
    await recordSubmission(submittedPast.id as string);
    const accepted = submittedPast.accept(
      new Date("2020-05-31T08:30:00.000Z"),
      new Date("2020-05-31T09:00:00.000Z"),
    );
    await commit(accepted, BookingStatus.AwaitingProvider);
    const paid = accepted.markPaid(`mpesa-${suffix}`, new Date("2020-05-31T08:45:00.000Z"));
    await commit(paid, BookingStatus.PendingPayment);
    confirmedPastId = paid.id as string;

    // The same walk with a slot still ahead of `now`, which is the only thing
    // that separates the two: `upcoming` and `history` share the two live
    // statuses and split them on `startsAt` against the filter's `now`. Without
    // this booking that split is never exercised in either direction.
    const submittedFuture = (
      await writeRepo.insert(
        Booking.create(
          bookingInput({
            startsAt: new Date("2027-03-01T15:00:00.000Z"),
            expiresAt: new Date("2027-02-28T15:30:00.000Z"),
          }),
        ),
        1,
      )
    ).submit(now, new Date("2027-02-28T17:00:00.000Z"), address(), null);
    await commit(submittedFuture, BookingStatus.Draft);
    await recordSubmission(submittedFuture.id as string);
    const acceptedFuture = submittedFuture.accept(now, new Date("2027-02-28T18:00:00.000Z"));
    await commit(acceptedFuture, BookingStatus.AwaitingProvider);
    const paidFuture = acceptedFuture.markPaid(`mpesa-future-${suffix}`, now);
    await commit(paidFuture, BookingStatus.PendingPayment);
    confirmedFutureId = paidFuture.id as string;

    // A job in the second workspace that actually happened: booked four days
    // ago, worked three days ago, completed two — priced 80 000 at the same
    // 1 000 bps, so its commission is 8 000 and the provider's share of it is
    // exactly 72 000. Three distinct numbers, because a query that returned
    // the listed price instead of the share would pass against a fixture
    // where the two are equal.
    const submittedDone = (
      await writeRepo.insert(
        Booking.create(
          bookingInput({
            providerId: otherProviderId,
            serviceId: otherServiceId,
            serviceOptionId: otherServiceOptionId,
            providerMemberId: otherMemberId,
            priceMinor: 80_000,
            startsAt: daysAgo(3),
            expiresAt: daysAgo(4),
          }),
        ),
        1,
      )
    ).submit(daysAgo(4), daysAgo(3.9), address(), null);
    await commit(submittedDone, BookingStatus.Draft);
    await recordSubmission(submittedDone.id as string);
    const acceptedDone = submittedDone.accept(daysAgo(4), daysAgo(3.8));
    await commit(acceptedDone, BookingStatus.AwaitingProvider);
    const paidDone = acceptedDone.markPaid(`mpesa-done-${suffix}`, daysAgo(4));
    await commit(paidDone, BookingStatus.PendingPayment);
    completedId = paidDone.id as string;

    // **Written, not transitioned.** `Booking` has no `complete()` in phase 1
    // — it is one of the transitions the phase recorded as a follow-up — so
    // the only way to have a `COMPLETED` row to count is to move it here, the
    // way this file already writes states the commands cannot reach. The
    // booking above is a real one up to `CONFIRMED`; this is the single hop
    // the aggregate cannot yet make.
    await db
      .update(booking)
      .set({ status: BookingStatus.Completed, completedAt: daysAgo(2) })
      .where(eq(booking.id, completedId));

    // **Accepted today and never paid**, and the fixture the chart's second
    // series turns on. `accept` stamps `confirmed_at` and stops at
    // `PENDING_PAYMENT`; only `markPaid` stamps `paid_at` and reaches
    // `CONFIRMED`. So this booking carries a `confirmed_at` of today with no
    // payment behind it, and a per-day series bucketed on that column would
    // draw it as a confirmation the provider never got. It belongs in
    // `awaitingPayment` and nowhere else.
    //
    // Priced differently from everything around it (55 000, so a share of
    // 49 500) for the same reason the completed one is: a number that leaked
    // into revenue or pipeline would be recognisable rather than plausible.
    const submittedUnpaid = (
      await writeRepo.insert(
        Booking.create(
          bookingInput({
            providerId: otherProviderId,
            serviceId: otherServiceId,
            serviceOptionId: otherServiceOptionId,
            providerMemberId: otherMemberId,
            priceMinor: 55_000,
            startsAt: new Date("2027-04-01T09:00:00.000Z"),
            expiresAt: new Date("2027-03-31T09:30:00.000Z"),
          }),
        ),
        1,
      )
    ).submit(now, new Date("2027-03-31T13:00:00.000Z"), address(), null);
    await commit(submittedUnpaid, BookingStatus.Draft);
    await recordSubmission(submittedUnpaid.id as string);
    const acceptedUnpaid = submittedUnpaid.accept(now, new Date("2027-03-31T15:00:00.000Z"));
    await commit(acceptedUnpaid, BookingStatus.AwaitingProvider);
    acceptedUnpaidId = acceptedUnpaid.id as string;
  });
});

afterAll(async () => {
  await bestEffortCleanup([
    // `booking_change` cascades on the booking it logs — see its schema.
    () => db.delete(booking).where(eq(booking.providerId, providerId)),
    () => db.delete(booking).where(eq(booking.providerId, otherProviderId)),
    () => db.delete(serviceOption).where(eq(serviceOption.id, serviceOptionId)),
    () => db.delete(serviceOption).where(eq(serviceOption.id, otherServiceOptionId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(service).where(eq(service.id, otherServiceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(providerMember).where(eq(providerMember.id, otherMemberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(provider).where(eq(provider.id, otherProviderId)),
    () => db.delete(profile).where(eq(profile.userId, customerId)),
    () => db.delete(profile).where(eq(profile.userId, ownerUserId)),
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
    startsAt: new Date("2027-03-01T09:00:00.000Z"),
    durationMinutes: 60,
    priceMinor: 100_000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName: SERVICE_NAME,
    providerName: "Provider Bookings Test Provider",
    providerSlug: `provider-bookings-test-${suffix}`,
    optionName: "Standard",
    description: null,
    expiresAt: new Date("2027-02-28T09:30:00.000Z"),
    ...overrides,
  };
}

/**
 * An instant that many days before this run's `now`, for the fixtures whose
 * point is *where they fall in a window* rather than which calendar day they
 * name. A literal date would drift out of the dashboard's thirty days the
 * moment this file stopped being new.
 */
function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
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
 * `save` is a compare-and-swap and answers `false` rather than throwing when
 * its `expectedStatus` no longer matches. A fixture that ignored that would
 * leave the booking in the status before the transition and fail the *tab*
 * assertions instead, several tests away from the line that actually went
 * wrong.
 */
/**
 * The `submitted_by_customer` change row `SubmitBookingCommand` appends in the
 * same transaction as the `DRAFT` → `AWAITING_PROVIDER` hop.
 *
 * Not a detail of the timeline test: the reader's `askedOfProvider()` treats
 * this row as the definition of "the provider was asked about this booking",
 * so a fixture that walked `submit` without writing it would be invisible to
 * every provider-side query here — and would look exactly like the abandoned
 * draft two tests are about.
 */
async function recordSubmission(bookingId: string): Promise<void> {
  await writeRepo.appendChange({
    bookingId,
    changedByUserId: customerId,
    reason: "submitted_by_customer",
    previousStartsAt: null,
    previousEndsAt: null,
    previousProviderMemberId: null,
    previousPriceMinor: null,
  });
}

async function commit(entity: Booking, expected: Booking["status"]): Promise<void> {
  const written = await writeRepo.save(entity, expected);
  if (!written) {
    throw new Error(`fixture: save of ${entity.id} expecting ${expected} matched no row`);
  }
}

describe("DrizzleBookingReadRepository, provider side", () => {
  test("requests lists the awaiting booking and never the draft", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await readRepo.listForProvider(
        providerId,
        { tab: "requests", q: null, memberId: null, now },
        20,
        0,
      );
      expect(rows.map((r) => r.id)).toEqual([awaitingId]);
      expect(rows[0]!.customerFirstName).toBe("Ana");
      expect(rows[0]!.customerPhone).toBe("+258840000001"); // the row carries it; the DTO mapper hides it
      expect(rows[0]!.timezone).toBe("Africa/Maputo");
    });
  });

  test("history lists the confirmed booking whose start has passed", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await readRepo.listForProvider(
        providerId,
        { tab: "history", q: null, memberId: null, now },
        20,
        0,
      );
      expect(rows.map((r) => r.id)).toEqual([confirmedPastId]);
    });
  });

  test("history never shows a draft that merely expired", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      // `EXPIRED` is one of the history tab's statuses, so the `<> 'DRAFT'`
      // guard alone lets an abandoned step-1 checkout through — carrying the
      // customer's first name and the service into a list of things the
      // provider is supposed to have answered. Nobody asked them anything.
      const rows = await readRepo.listForProvider(
        providerId,
        { tab: "history", q: null, memberId: null, now },
        20,
        0,
      );
      expect(rows.map((r) => r.id)).toEqual([confirmedPastId]);

      // The count shares `providerWhere`, so it has to agree — a total the
      // list cannot fill is the same defect one line further on.
      expect(
        await readRepo.countForProvider(providerId, {
          tab: "history",
          q: null,
          memberId: null,
          now,
        }),
      ).toBe(1);

      // And the row is not reachable by id either: a link is as much a leak
      // as a list.
      expect(await readRepo.findForProvider(expiredDraftId, providerId)).toBeNull();
    });
  });

  test("upcoming lists the confirmed booking whose slot is still ahead, history does not", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const upcoming = await readRepo.listForProvider(
        providerId,
        { tab: "upcoming", q: null, memberId: null, now },
        20,
        0,
      );
      expect(upcoming.map((r) => r.id)).toEqual([confirmedFutureId]);
      expect(
        await readRepo.countForProvider(providerId, {
          tab: "upcoming",
          q: null,
          memberId: null,
          now,
        }),
      ).toBe(1);

      // The other half of the same split: the two tabs share `CONFIRMED` and
      // are told apart only by `startsAt` against `now`, so each has to be
      // asserted to exclude the other's booking.
      const history = await readRepo.listForProvider(
        providerId,
        { tab: "history", q: null, memberId: null, now },
        20,
        0,
      );
      expect(history.map((r) => r.id)).not.toContain(confirmedFutureId);
      expect(upcoming.map((r) => r.id)).not.toContain(confirmedPastId);
    });
  });

  test("the all tab returns every booking the provider was asked about, newest first", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await readRepo.listForProvider(
        providerId,
        { tab: "all", q: null, memberId: null, now },
        20,
        0,
      );
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(awaitingId);
      expect(ids).toContain(confirmedPastId);
      expect(ids).toContain(confirmedFutureId);
      // Never the drafts, submitted or not — the same rule the three tabs keep.
      expect(ids).not.toContain(draftId);
      expect(ids).not.toContain(expiredDraftId);
      // Newest first, by creation.
      const created = rows.map((r) => r.createdAt.getTime());
      expect([...created].sort((a, b) => b - a)).toEqual(created);
    });
  });

  test("counting the all tab agrees with listing it", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const filter = { tab: "all", q: null, memberId: null, now } as const;
      const [rows, total] = await Promise.all([
        readRepo.listForProvider(providerId, filter, 50, 0),
        readRepo.countForProvider(providerId, filter),
      ]);
      expect(total).toBe(rows.length);
    });
  });

  test("the member filter counts only that member's bookings", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      // Every booking in this fixture is assigned to the workspace's one
      // member, so the filter has to be proven in both directions: naming that
      // member changes nothing, and naming any other empties the tab.
      expect(
        await readRepo.countForProvider(providerId, {
          tab: "requests",
          q: null,
          memberId,
          now,
        }),
      ).toBe(1);
      expect(
        await readRepo.countForProvider(providerId, {
          tab: "requests",
          q: null,
          memberId: crypto.randomUUID(),
          now,
        }),
      ).toBe(0);
    });
  });

  test("search matches the customer's first name, accent-insensitively", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const hit = await readRepo.countForProvider(providerId, {
        tab: "requests",
        q: "ana",
        memberId: null,
        now,
      });
      const miss = await readRepo.countForProvider(providerId, {
        tab: "requests",
        q: "zzz",
        memberId: null,
        now,
      });
      expect(hit).toBe(1);
      expect(miss).toBe(0);
      // The accent half of the claim in this test's name: the needle carries
      // none and the stored service name carries three, so only a query that
      // folds them on the column side can match.
      const unaccentedNeedle = await readRepo.countForProvider(providerId, {
        tab: "requests",
        q: "depilacao",
        memberId: null,
        now,
      });
      expect(unaccentedNeedle).toBe(1);

      // `ñ`, both ways round, because the two folds once disagreed about
      // exactly this character and the disagreement was silent: the JS side
      // stripped it and the SQL side did not, so "Uñas" folded to "unas" while
      // the column stayed "uñas" and *neither* spelling found the row. The
      // exact one is the assertion that matters most — a provider who types a
      // name the way it is actually spelled must not be the one who gets
      // nothing back.
      const exactSpelling = await readRepo.countForProvider(providerId, {
        tab: "requests",
        q: "Uñas",
        memberId: null,
        now,
      });
      const foldedSpelling = await readRepo.countForProvider(providerId, {
        tab: "requests",
        q: "unas",
        memberId: null,
        now,
      });
      expect(exactSpelling).toBe(1);
      expect(foldedSpelling).toBe(1);
    });
  });

  test("findForProvider answers null for another workspace's booking and for a draft", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      expect(await readRepo.findForProvider(awaitingId, crypto.randomUUID())).toBeNull();
      expect(await readRepo.findForProvider(draftId, providerId)).toBeNull();
      expect((await readRepo.findForProvider(awaitingId, providerId))?.id).toBe(awaitingId);
    });
  });

  test("timelineFor returns the change rows oldest first", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const rows = await readRepo.timelineFor(awaitingId);
      expect(rows.map((r) => r.reason)).toEqual(["submitted_by_customer"]);
      expect(rows[0]!.changedByUserId).toBe(customerId);
    });
  });

  test("membersOf names the owner by first name", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const members = await readRepo.membersOf(providerId);
      expect(members.map((m) => m.id)).toContain(memberId);
      expect(members.find((m) => m.id === memberId)?.firstName).toBe("Beatriz");
    });
  });
});

describe("statsForProvider", () => {
  test("counts what is waiting, what is coming, and what has been done", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const { totals } = await readRepo.statsForProvider(providerId, now);
      expect(totals.awaitingResponse).toBe(1); // awaitingId
      expect(totals.awaitingPayment).toBe(0); // every accepted fixture went on to be paid
      // Both confirmed slots are outside this week: one is in 2020 and one in
      // 2027, so the seven-day bound is exercised in both directions.
      expect(totals.upcomingWeek).toBe(0);
      expect(totals.upcomingToday).toBe(0);
      expect(totals.declinedLast30).toBe(0);
      // The completed booking belongs to the neighbouring workspace — see
      // `otherProviderId` — so it is that workspace's one, and not this one's.
      expect(totals.completedLast30).toBe(0);
      expect(totals.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(totals.currency).toBe("MZN");

      const neighbour = await readRepo.statsForProvider(otherProviderId, now);
      expect(neighbour.totals.completedLast30).toBe(1); // completedId
      expect(neighbour.totals.awaitingResponse).toBe(0);
    });
  });

  test("revenue and pipeline are the provider's share, not the listed price", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const neighbour = (await readRepo.statsForProvider(otherProviderId, now)).totals;
      // 80 000 listed, 8 000 of commission, 72 000 received. Three different
      // numbers on purpose: a query returning the price would read 80 000.
      expect(neighbour.revenueLast30Minor).toBe(72_000);
      // Nothing confirmed and still ahead in that workspace — its one booking
      // is already finished.
      expect(neighbour.pipelineMinor).toBe(0);

      const mine = (await readRepo.statsForProvider(providerId, now)).totals;
      // The 2027 booking, 100 000 less 10 000 of commission. The 2020 one is
      // `CONFIRMED` too and is not pipeline: its slot is behind us.
      expect(mine.pipelineMinor).toBe(90_000);
      // And this workspace has completed nothing, so the neighbour's 72 000
      // is not somehow in its revenue.
      expect(mine.revenueLast30Minor).toBe(0);
    });
  });

  test("a confirmation in the chart is a payment, not an acceptance", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const { totals, perDay } = await readRepo.statsForProvider(otherProviderId, now);
      // `acceptedUnpaidId` — the provider said yes in this test run, so the
      // row carries a `confirmed_at` of today, and the customer has not paid.
      expect(totals.awaitingPayment).toBe(1);

      const today = perDay.find((d) => d.date === totals.today);
      expect(today?.requests).toBe(2); // both of this workspace's bookings were submitted today
      // The claim this fixture exists for: a series bucketed on `confirmed_at`
      // would draw `acceptedUnpaidId` here as a confirmation the provider
      // never actually got. The chart counts money arriving, so today is zero.
      expect(today?.confirmed).toBe(0);

      // The one confirmed bucket is the day `completedId` was paid, four days
      // back — so the series is not empty for the wrong reason.
      const paidDay = perDay.find((d) => d.confirmed > 0);
      expect(paidDay?.confirmed).toBe(1);
      expect(paidDay?.date).not.toBe(totals.today);

      // And the unpaid booking is in neither money column: revenue is
      // `COMPLETED` and pipeline is `CONFIRMED`, and it is neither. Its 49 500
      // share would be visible in either if it were.
      expect(totals.revenueLast30Minor).toBe(72_000);
      expect(totals.pipelineMinor).toBe(0);
    });
  });

  test("a booking completed before the window is not in the thirty days", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      // `now` shifted a year forward puts `completedId` outside the window.
      const later = new Date(now.getTime() + 365 * 24 * 3_600_000);
      const { totals } = await readRepo.statsForProvider(otherProviderId, later);
      expect(totals.completedLast30).toBe(0);
      expect(totals.revenueLast30Minor).toBe(0);
    });
  });

  test("today and the week are the workspace's own days, not UTC's", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      // 23:00 UTC on the 28th is already 01:00 on the 1st in Maputo (UTC+2),
      // and `confirmedFutureId` starts at 15:00 UTC that same local day. A
      // window truncated to UTC midnight would name the day "2027-02-28" and
      // put the booking in tomorrow instead of today; the workspace's own
      // calendar puts both on the 1st.
      const justAfterLocalMidnight = new Date("2027-02-28T23:00:00.000Z");
      const { totals } = await readRepo.statsForProvider(providerId, justAfterLocalMidnight);
      expect(totals.today).toBe("2027-03-01");
      expect(totals.upcomingToday).toBe(1); // confirmedFutureId
      expect(totals.upcomingWeek).toBe(1); // today is a subset of the week, never disjoint from it
      expect(totals.pipelineMinor).toBe(90_000);
    });
  });

  test("the day series buckets a request on the day it was submitted, in the workspace's timezone", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const { totals, perDay } = await readRepo.statsForProvider(providerId, now);
      const today = perDay.find((d) => d.date === totals.today);
      // Three fixtures were submitted in this test run; the two drafts were
      // never submitted and are in no bucket.
      expect(today?.requests).toBe(3);
      // Only `confirmedFutureId` was *paid* in this run — the 2020 walk was
      // paid in 2020, which is outside the window the series covers.
      expect(today?.confirmed).toBe(1);
      expect(perDay.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);
      // Days with nothing in them are absent rather than zero: everything this
      // fixture did happened today, so today is the only bucket there is. The
      // projection is what fills the chart back out to thirty.
      expect(perDay.map((d) => d.date)).toEqual([totals.today]);
      expect(perDay.length).toBeLessThanOrEqual(30);
    });
  });

  test("another workspace's numbers are not this one's", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const { totals, perDay } = await readRepo.statsForProvider(crypto.randomUUID(), now);
      expect(totals.awaitingResponse).toBe(0);
      expect(totals.revenueLast30Minor).toBe(0);
      expect(totals.pipelineMinor).toBe(0);
      expect(totals.currency).toBeNull();
      expect(perDay).toEqual([]);
      // A workspace with no bookings — and no `provider` row at all — still
      // has to know what today is, or the dashboard has no chart to draw.
      expect(totals.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
