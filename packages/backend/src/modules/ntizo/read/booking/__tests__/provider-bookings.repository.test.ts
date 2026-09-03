/**
 * `DrizzleBookingReadRepository`'s provider-side queries — `listForProvider`,
 * `countForProvider`, `findForProvider`, `timelineFor` and `membersOf` —
 * against the real dev database, for the same reason and by the same
 * mechanism as `list-my-bookings.projection.test.ts` beside it: these queries
 * are joins, a `translate()` the accent search leans on, and a WHERE clause
 * that decides which tab a booking belongs to. None of that is a mapping a
 * fake repository could prove.
 *
 * `getDb()` resolves through the app's request-scoped AsyncLocalStorage
 * context and a test has no request, so every body runs inside
 * `__runWithTransactionContextForTests` with this file's own `DEV_DB_URL`
 * client bound into it.
 *
 * The fixture seeds one workspace with three bookings in three different
 * states — a `DRAFT`, an `AWAITING_PROVIDER` and a `CONFIRMED` whose slot is
 * already behind us — because the thing under test is which of them each tab
 * shows. A fixture with one booking cannot fail if the tab filter were
 * dropped. The `DRAFT` is load-bearing twice over: it is the customer's own
 * unfinished checkout, and no query here may ever show it to the provider.
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
 * Accented on purpose. The search lowers *and* strips accents on both sides,
 * and a service named without one could not tell a working `translate()` from
 * a plain `ilike` — the customer typing "depilacao" is the everyday case.
 */
const SERVICE_NAME = "Depilação a Laser";

let customerId: string;
let ownerUserId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let serviceOptionId: string;
let draftId: string;
let awaitingId: string;
let confirmedPastId: string;

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
    await writeRepo.appendChange({
      bookingId: awaitingId,
      changedByUserId: customerId,
      reason: "submitted_by_customer",
      previousStartsAt: null,
      previousEndsAt: null,
      previousProviderMemberId: null,
      previousPriceMinor: null,
    });

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
    const accepted = submittedPast.accept(
      new Date("2020-05-31T08:30:00.000Z"),
      new Date("2020-05-31T09:00:00.000Z"),
    );
    await commit(accepted, BookingStatus.AwaitingProvider);
    const paid = accepted.markPaid(`mpesa-${suffix}`, new Date("2020-05-31T08:45:00.000Z"));
    await commit(paid, BookingStatus.PendingPayment);
    confirmedPastId = paid.id as string;
  });
});

afterAll(async () => {
  await bestEffortCleanup([
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
      // none and the stored service name carries two, so only a query that
      // strips them on the column side can match.
      const unaccentedNeedle = await readRepo.countForProvider(providerId, {
        tab: "requests",
        q: "depilacao",
        memberId: null,
        now,
      });
      expect(unaccentedNeedle).toBe(1);
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
