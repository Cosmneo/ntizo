/**
 * `DrizzleBookingBusyAdapter` against the real dev database, same reason and
 * same mechanism as `booking-repository.test.ts`: the adapter reaches the
 * database through `getDb()`, which resolves through the request-scoped
 * AsyncLocalStorage context — a test has no request, so
 * `__runWithTransactionContextForTests` binds this file's own real,
 * `DEV_DB_URL`-backed Drizzle client into that context for the duration of
 * one call.
 *
 * Fixtures are inserted directly with `db.insert(booking)`, not through
 * `Booking.create` — this is a `shared/infrastructure` test of one adapter's
 * read, not of the aggregate or the write path (`booking-constraints.test.ts`
 * does the same for the same reason: a status like `DECLINED` has no public
 * transition method to reach it through yet). Two providers, in two
 * timezones, are created fresh under a random `suffix` in `beforeAll`, so
 * this run cannot collide with another worktree's or another session's
 * concurrent run — and every booking below uses a distinct `startsAt` so
 * nothing inside this file collides with itself either.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { category } from "../catalog/schemas/category.schema";
import { service, serviceOption } from "../catalog/schemas/service.schema";
import { provider } from "../provider/schemas/provider.schema";
import { providerMember } from "../provider/schemas/provider-member.schema";
import { user } from "../user/schemas/user.schema";
import { booking } from "../booking/schemas/booking.schema";
import type { NewBookingRow } from "../booking/schemas/booking.schema";
import { BookingStatus } from "../booking/enums";
import { DrizzleBookingBusyAdapter } from "../../../../bounded-contexts/scheduling/infrastructure/repositories/drizzle/booking-busy.adapter";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
// `{ schema: authSchema }`, not a bare `drizzle(sql)` — required shape for
// `__runWithTransactionContextForTests`, same as `booking-repository.test.ts`.
const db = drizzle(sql, { schema: authSchema });

const adapter = new DrizzleBookingBusyAdapter();
const suffix = crypto.randomUUID();

let customerId: string;
let ownerAId: string;
let ownerBId: string;
let categoryId: string;

// Provider 1: Africa/Maputo, UTC+2 year-round — no DST to complicate the
// arithmetic below.
let providerId: string;
let serviceId: string;
let serviceOptionId: string;
let memberStatus: string; // one booking per BookingStatus, same day
let memberOwnKey: string; // "a different member" pair
let memberOtherKey: string;
let memberNoBookings: string;
let memberMidnight: string; // crosses local midnight
let memberUtcEdge: string; // local civil date != UTC civil date

// Provider 2: Asia/Kolkata, UTC+5:30 year-round — proves the timezone is read
// per provider rather than assumed to be Africa/Maputo.
let providerId2: string;
let serviceId2: string;
let serviceOptionId2: string;
let memberKolkata: string;

// `provider_member` carries a unique index on `(providerId, userId)`
// (`provider_member_provider_user_uniq`) — one real staff member cannot hold
// two membership rows at the same provider. So every `providerMember` row
// below needs its own distinct `userId`, not a shared owner reused six times.
const staffUserIds = Object.fromEntries(
  (["status", "ownKey", "otherKey", "noBookings", "midnight", "utcEdge", "kolkata"] as const).map(
    (key) => [key, crypto.randomUUID()],
  ),
) as Record<
  "status" | "ownKey" | "otherKey" | "noBookings" | "midnight" | "utcEdge" | "kolkata",
  string
>;

beforeAll(async () => {
  customerId = crypto.randomUUID();
  ownerAId = crypto.randomUUID();
  ownerBId = crypto.randomUUID();
  await db.insert(user).values([
    { id: customerId, email: `booking-busy-customer-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: ownerAId, email: `booking-busy-owner-a-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: ownerBId, email: `booking-busy-owner-b-${suffix}@ntizo.test`, role: "customer", status: "active" },
    ...Object.entries(staffUserIds).map(([key, id]) => ({
      id,
      email: `booking-busy-staff-${key}-${suffix}@ntizo.test`,
      role: "customer" as const,
      status: "active" as const,
    })),
  ]);

  const [categoryRow] = await db
    .insert(category)
    .values({ code: `booking-busy-test-${suffix}` })
    .returning({ id: category.id });
  categoryId = categoryRow!.id;

  async function makeProvider(ownerUserId: string, timezone: string, label: string) {
    const [providerRow] = await db
      .insert(provider)
      .values({
        ownerUserId,
        type: "individual",
        name: `Booking Busy Test Provider ${label}`,
        slug: `booking-busy-test-${label.toLowerCase()}-${suffix}`,
        status: "active",
        timezone,
      })
      .returning({ id: provider.id });
    const pid = providerRow!.id;

    const [serviceRow] = await db
      .insert(service)
      .values({
        providerId: pid,
        categoryId,
        sourceLocale: "pt-MZ",
        locationType: "at_provider",
        status: "published",
      })
      .returning({ id: service.id });
    const sid = serviceRow!.id;

    const [optionRow] = await db
      .insert(serviceOption)
      .values({ serviceId: sid, pricingMode: "fixed", amountMinor: 100_000, durationMinutes: 60 })
      .returning({ id: serviceOption.id });

    return { providerId: pid, serviceId: sid, serviceOptionId: optionRow!.id };
  }

  const p1 = await makeProvider(ownerAId, "Africa/Maputo", "Maputo");
  providerId = p1.providerId;
  serviceId = p1.serviceId;
  serviceOptionId = p1.serviceOptionId;

  const p2 = await makeProvider(ownerBId, "Asia/Kolkata", "Kolkata");
  providerId2 = p2.providerId;
  serviceId2 = p2.serviceId;
  serviceOptionId2 = p2.serviceOptionId;

  async function makeMember(pid: string, ownerUserId: string) {
    const [row] = await db
      .insert(providerMember)
      .values({ providerId: pid, userId: ownerUserId, role: "owner" })
      .returning({ id: providerMember.id });
    return row!.id;
  }

  memberStatus = await makeMember(providerId, staffUserIds.status);
  memberOwnKey = await makeMember(providerId, staffUserIds.ownKey);
  memberOtherKey = await makeMember(providerId, staffUserIds.otherKey);
  memberNoBookings = await makeMember(providerId, staffUserIds.noBookings);
  memberMidnight = await makeMember(providerId, staffUserIds.midnight);
  memberUtcEdge = await makeMember(providerId, staffUserIds.utcEdge);
  memberKolkata = await makeMember(providerId2, staffUserIds.kolkata);
});

afterAll(async () => {
  await bestEffortCleanup([
    () => db.delete(booking).where(inArray(booking.providerId, [providerId, providerId2])),
    () =>
      db
        .delete(providerMember)
        .where(
          inArray(providerMember.id, [
            memberStatus,
            memberOwnKey,
            memberOtherKey,
            memberNoBookings,
            memberMidnight,
            memberUtcEdge,
            memberKolkata,
          ]),
        ),
    () => db.delete(serviceOption).where(inArray(serviceOption.id, [serviceOptionId, serviceOptionId2])),
    () => db.delete(service).where(inArray(service.id, [serviceId, serviceId2])),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(provider).where(inArray(provider.id, [providerId, providerId2])),
    () =>
      db
        .delete(user)
        .where(inArray(user.id, [customerId, ownerAId, ownerBId, ...Object.values(staffUserIds)])),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

/**
 * A row that satisfies every NOT NULL column. `providerMemberId`, `startsAt`,
 * `endsAt` and `status` all carry a placeholder here purely so the return
 * type checks out — every call site below overrides all four, since they are
 * the columns each test actually varies.
 */
function bookingValues(overrides: Partial<NewBookingRow> = {}): NewBookingRow {
  return {
    customerId,
    providerId,
    serviceId,
    serviceOptionId,
    providerMemberId: memberStatus,
    startsAt: new Date("2027-01-01T00:00:00.000Z"),
    endsAt: new Date("2027-01-01T01:00:00.000Z"),
    status: BookingStatus.PendingPayment,
    priceMinor: 100_000,
    commissionBps: 1000,
    commissionMinor: 10_000,
    currency: "MZN",
    serviceName: "Corte de Cabelo",
    providerName: "Booking Busy Test Provider Maputo",
    providerSlug: `booking-busy-test-maputo-${suffix}`,
    optionName: "Standard",
    durationMinutes: 60,
    addressLabel: "Salão",
    addressLine: "Av. Julius Nyerere 123",
    addressCity: "Maputo",
    ...overrides,
  };
}

async function insertBooking(overrides: Partial<NewBookingRow>) {
  await db.insert(booking).values(bookingValues(overrides));
}

/** Runs `adapter.forMembers` bound to this file's own real connection. */
function forMembers(memberIds: readonly string[], fromDate: string, toDate: string) {
  return __runWithTransactionContextForTests(db, () => adapter.forMembers(memberIds, fromDate, toDate));
}

// Postgres makes no row-order promise the adapter relies on, so every
// assertion below sorts before comparing. By `(date, start)` rather than
// `start` alone: a split booking's two halves can share no `date`, but
// wide-window results across the midnight test span two different dates
// whose `start` values (0 and 1320) sort in the opposite order from the
// dates themselves.
const byDateThenStart = (a: { date: string; start: number }, b: { date: string; start: number }) =>
  a.date === b.date ? a.start - b.start : a.date.localeCompare(b.date);

describe("SLOT_HOLDING_STATUSES decides busy, not mere existence", () => {
  test("one booking per BookingStatus on the same day: only the four slot-holding ones come back busy", async () => {
    const day = "2027-03-02";
    // Hourly, non-overlapping local slots 09:00-18:00 Africa/Maputo (UTC+2),
    // one per status, in `BookingStatus`'s own declared order. The oracle
    // below (`expected`) is written independently of `SLOT_HOLDING_STATUSES`
    // — it names the four statuses directly — so this test cannot pass by
    // circularly re-deriving its expectation from the same constant the
    // adapter reads.
    const rows: [string, string, string][] = [
      [BookingStatus.PendingPayment, "2027-03-02T07:00:00.000Z", "2027-03-02T08:00:00.000Z"], // 09:00-10:00 local
      [BookingStatus.AwaitingProvider, "2027-03-02T08:00:00.000Z", "2027-03-02T09:00:00.000Z"], // 10:00-11:00
      [BookingStatus.Confirmed, "2027-03-02T09:00:00.000Z", "2027-03-02T10:00:00.000Z"], // 11:00-12:00
      [BookingStatus.MarkedDone, "2027-03-02T10:00:00.000Z", "2027-03-02T11:00:00.000Z"], // 12:00-13:00
      [BookingStatus.Completed, "2027-03-02T11:00:00.000Z", "2027-03-02T12:00:00.000Z"], // 13:00-14:00
      [BookingStatus.Disputed, "2027-03-02T12:00:00.000Z", "2027-03-02T13:00:00.000Z"], // 14:00-15:00
      [BookingStatus.Declined, "2027-03-02T13:00:00.000Z", "2027-03-02T14:00:00.000Z"], // 15:00-16:00
      [BookingStatus.Cancelled, "2027-03-02T14:00:00.000Z", "2027-03-02T15:00:00.000Z"], // 16:00-17:00
      [BookingStatus.Expired, "2027-03-02T15:00:00.000Z", "2027-03-02T16:00:00.000Z"], // 17:00-18:00
    ];

    for (const [status, startsAt, endsAt] of rows) {
      await insertBooking({
        providerMemberId: memberStatus,
        status,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
      });
    }

    const result = await forMembers([memberStatus], day, day);
    const busy = (result.get(memberStatus) ?? []).slice().sort(byDateThenStart);

    // PendingPayment, AwaitingProvider, Confirmed, MarkedDone — the four
    // `SLOT_HOLDING_STATUSES` — in local minutes-from-midnight (09:00 =
    // 540, one hour = 60 minutes each).
    expect(busy).toEqual([
      { date: day, start: 540, end: 600 },
      { date: day, start: 600, end: 660 },
      { date: day, start: 660, end: 720 },
      { date: day, start: 720, end: 780 },
    ]);
  });
});

describe("a busy interval belongs only to its own member", () => {
  test("two members holding the identical instant each see only their own row", async () => {
    const day = "2027-03-03";
    const startsAt = new Date("2027-03-03T07:00:00.000Z"); // 09:00 local
    const endsAt = new Date("2027-03-03T08:00:00.000Z"); // 10:00 local

    await insertBooking({
      providerMemberId: memberOwnKey,
      status: BookingStatus.PendingPayment,
      startsAt,
      endsAt,
    });
    await insertBooking({
      providerMemberId: memberOtherKey,
      status: BookingStatus.PendingPayment,
      startsAt,
      endsAt,
    });

    const onlyOwn = await forMembers([memberOwnKey], day, day);
    expect(onlyOwn.get(memberOwnKey)).toEqual([{ date: day, start: 540, end: 600 }]);
    expect(onlyOwn.has(memberOtherKey)).toBe(false);

    const both = await forMembers([memberOwnKey, memberOtherKey], day, day);
    expect(both.get(memberOwnKey)).toEqual([{ date: day, start: 540, end: 600 }]);
    expect(both.get(memberOtherKey)).toEqual([{ date: day, start: 540, end: 600 }]);

    // A member with zero bookings is absent from the map entirely, not
    // present with `[]`. `list-service-availability.projection.ts` reads
    // `busyByMember.get(memberId) ?? []` — the `?? []` is the consumer's own
    // default, so an adapter that also carried an empty array for symmetry
    // would just be dead weight nobody reads differently.
    expect(both.has(memberNoBookings)).toBe(false);

    const withEmptyMember = await forMembers([memberOwnKey, memberNoBookings], day, day);
    expect(withEmptyMember.has(memberNoBookings)).toBe(false);
    expect(withEmptyMember.has(memberOwnKey)).toBe(true);
  });

  test("an empty memberIds list short-circuits to an empty map without querying", async () => {
    const result = await forMembers([], "2027-03-03", "2027-03-03");
    expect(result.size).toBe(0);
  });
});

describe("a booking crossing local midnight splits into two civil-date intervals", () => {
  test("22:00-01:00 Africa/Maputo becomes 1320-1440 on the first day and 0-60 on the second", async () => {
    const day1 = "2027-03-05";
    const day2 = "2027-03-06";
    await insertBooking({
      providerMemberId: memberMidnight,
      status: BookingStatus.PendingPayment,
      startsAt: new Date("2027-03-05T20:00:00.000Z"), // 22:00 local, day1
      endsAt: new Date("2027-03-05T23:00:00.000Z"), // 01:00 local, day2
      durationMinutes: 180,
    });

    const wide = await forMembers([memberMidnight], day1, day2);
    const both = (wide.get(memberMidnight) ?? []).slice().sort(byDateThenStart);
    expect(both).toEqual([
      { date: day1, start: 1320, end: 1440 },
      { date: day2, start: 0, end: 60 },
    ]);

    // Trimmed, not just split: a caller asking only about `day1` must not
    // see the tail that belongs to `day2`, and vice versa. This is the
    // per-row filter after the SQL's own widened window, not the widening
    // itself — a bug in the trim would show up as one of these two coming
    // back with both halves, or with the other day's half instead of its
    // own.
    const onlyDay1 = await forMembers([memberMidnight], day1, day1);
    expect(onlyDay1.get(memberMidnight)).toEqual([{ date: day1, start: 1320, end: 1440 }]);

    const onlyDay2 = await forMembers([memberMidnight], day2, day2);
    expect(onlyDay2.get(memberMidnight)).toEqual([{ date: day2, start: 0, end: 60 }]);
  });
});

describe("the civil date is the provider's local date, not UTC's", () => {
  test("00:30 Africa/Maputo — 22:30 UTC the day before — lands on the local day, not the UTC one", async () => {
    const localDay = "2027-03-10";
    const utcDayBefore = "2027-03-09";
    await insertBooking({
      providerMemberId: memberUtcEdge,
      status: BookingStatus.PendingPayment,
      startsAt: new Date("2027-03-09T22:30:00.000Z"), // 00:30 local, 2027-03-10
      endsAt: new Date("2027-03-09T23:00:00.000Z"), // 01:00 local, 2027-03-10
      durationMinutes: 30,
    });

    // Asked only about the local day. Minutes-from-midnight computed in UTC
    // against this schedule would place this row on `utcDayBefore` instead —
    // either missing it here entirely, or (worse) shifting it two hours
    // later than it really is, which is exactly the defect this whole task
    // exists to close.
    const result = await forMembers([memberUtcEdge], localDay, localDay);
    expect(result.get(memberUtcEdge)).toEqual([{ date: localDay, start: 30, end: 60 }]);

    const wrongDay = await forMembers([memberUtcEdge], utcDayBefore, utcDayBefore);
    expect(wrongDay.has(memberUtcEdge)).toBe(false);
  });
});

describe("the timezone is read per booking's own provider, not assumed to be Africa/Maputo", () => {
  test("a provider on Asia/Kolkata (UTC+5:30) converts by its own offset", async () => {
    const day = "2027-03-15";
    await insertBooking({
      providerId: providerId2,
      serviceId: serviceId2,
      serviceOptionId: serviceOptionId2,
      providerMemberId: memberKolkata,
      status: BookingStatus.PendingPayment,
      startsAt: new Date("2027-03-15T14:30:00.000Z"), // 20:00 local Asia/Kolkata
      endsAt: new Date("2027-03-15T15:30:00.000Z"), // 21:00 local Asia/Kolkata
      providerName: "Booking Busy Test Provider Kolkata",
      providerSlug: `booking-busy-test-kolkata-${suffix}`,
    });

    const result = await forMembers([memberKolkata], day, day);
    // 20:00 local = 1200 minutes from midnight; a Maputo-shaped (UTC+2)
    // reading of the same instant would land on 990 instead, and a bare-UTC
    // reading would land on 870 — both wrong, and both the kind of wrong
    // that never throws.
    expect(result.get(memberKolkata)).toEqual([{ date: day, start: 1200, end: 1260 }]);
  });
});
