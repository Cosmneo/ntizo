/**
 * `DrizzleSlotValidityReader` against the real dev database, same reason and
 * same mechanism as `booking-busy.adapter.test.ts`: the reader reaches the
 * database through `getDb()`, which resolves through the request-scoped
 * AsyncLocalStorage context — a test has no request, so
 * `__runWithTransactionContextForTests` binds this file's own real,
 * `DEV_DB_URL`-backed Drizzle client into that context for the duration of
 * one call.
 *
 * Everything is created fresh under a random `suffix` in `beforeAll`, so this
 * run cannot collide with another worktree's or another session's concurrent
 * run — and no date below is "today". The two directions are built
 * differently, on purpose:
 *
 * - **"In the past" is a fixed date** (`2020-01-01`). A date that was in the
 *   past stays in the past forever, so pinning it is safe and readable.
 * - **"In the future" is computed from today** (`TARGET_DATE`, a year out).
 *   A *fixed* future date is precisely the one that stops being true.
 *   `DrizzleSlotValidityReader` refuses `startsAt <= Date.now()` against the
 *   real clock, with nothing to inject, so a pinned `TARGET_DATE` would turn
 *   every "this slot is real" test in this file red on the day it went past —
 *   red on a calendar boundary rather than on a change, and pointing at the
 *   reader rather than at the fixture that actually rotted. This file used to
 *   claim that a fixed far-future date meant "'in the future' never flips
 *   false". It flips; that is the whole reason this one is derived.
 *
 * `TARGET_DATE`'s weekday is read with `weekdayOf` rather than picked by eye
 * — the `member_availability` fixture's `weekday` column is derived from it,
 * so this file never has to be right about which day of the week a particular
 * date fell on. That was tidiness while the date was fixed and is
 * **load-bearing now that it moves**: the weekday genuinely differs from run
 * to run, and any fixture that assumed one would fail on six days in seven.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { addDays, localDateAt, localDateTimeToInstant, weekdayOf } from "@ntizo/shared/datetime";
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { category } from "../catalog/schemas/category.schema";
import { service, serviceOption } from "../catalog/schemas/service.schema";
import { serviceMember } from "../catalog/schemas/service-member.schema";
import { provider } from "../provider/schemas/provider.schema";
import { providerMember } from "../provider/schemas/provider-member.schema";
import { user } from "../user/schemas/user.schema";
import { memberAvailability } from "../scheduling/schemas/member-availability.schema";
import { booking } from "../booking/schemas/booking.schema";
import type { NewBookingRow } from "../booking/schemas/booking.schema";
import { BookingStatus } from "../booking/enums";
import { DrizzleSlotValidityReader } from "../../../../bounded-contexts/booking/infrastructure/repositories/drizzle/slot-validity.reader";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql, { schema: authSchema });

const reader = new DrizzleSlotValidityReader();
const suffix = crypto.randomUUID();

const TIMEZONE = "Africa/Maputo"; // UTC+2 year-round — no DST to complicate the arithmetic below.
/**
 * A year out from whenever this runs, in `TIMEZONE` — derived, not pinned.
 * See this file's header for why the future direction cannot be a literal:
 * the reader compares `startsAt` to the real `Date.now()`, so a fixed date is
 * a countdown to a red suite. A year is far past any window this file
 * exercises and keeps the fixture visibly "far future" to a reader.
 */
const TARGET_DATE = addDays(localDateAt(TIMEZONE, new Date()), 365);
const TARGET_WEEKDAY = weekdayOf(TARGET_DATE);
// A different civil date only so its weekday necessarily differs from
// `TARGET_DATE`'s — read with `weekdayOf` for the same reason `TARGET_DATE`
// is, not picked by eye.
const SECOND_DATE = addDays(TARGET_DATE, 1);
const SECOND_WEEKDAY = weekdayOf(SECOND_DATE);
const DURATION_MINUTES = 60;

let categoryId: string;

// The provider under test: active, one service, one fixed-price option, and
// two members — one assigned to the service, one not.
let providerId: string;
let serviceId: string;
let serviceOptionId: string;
let performerMemberId: string;
let nonPerformerMemberId: string;

// Three more members of the same provider, assigned to the same service,
// existing only to prove `capacity` on the result travels off the rule the
// reader already resolves, rather than defaulting to the 1 every other
// fixture below happens to use — see `SlotValidityResult`'s own doc comment.
let capacityThreeMemberId: string;
let capacityNullMemberId: string;
let perWindowMemberId: string;

// A second, separate provider — also active, also with a member — used only
// to prove a member from a *different* provider fails the same join a
// same-provider wrong-service member fails.
let otherProviderId: string;
let otherServiceId: string;
let otherServiceOptionId: string;
let otherProviderMemberId: string;

// A third provider, `pending` rather than `active` — the column's own
// default, per `ProviderStatus` — with a member who genuinely does perform
// its one service. The membership join must pass here; only the status
// check may refuse it.
let pendingProviderId: string;
let pendingServiceId: string;
let pendingServiceOptionId: string;
let pendingMemberId: string;

let ownerUserId: string;
let otherOwnerUserId: string;
let pendingOwnerUserId: string;
let customerId: string;

/**
 * `provider_member` carries a unique index on `(providerId, userId)` — one
 * real staff member cannot hold two membership rows at the same provider —
 * so every `providerMember` row below needs its own distinct `userId`.
 */
const staffUserIds = Object.fromEntries(
  (
    [
      "performer",
      "nonPerformer",
      "other",
      "pending",
      "capacityThree",
      "capacityNull",
      "perWindow",
    ] as const
  ).map((key) => [key, crypto.randomUUID()]),
) as Record<
  | "performer"
  | "nonPerformer"
  | "other"
  | "pending"
  | "capacityThree"
  | "capacityNull"
  | "perWindow",
  string
>;

beforeAll(async () => {
  ownerUserId = crypto.randomUUID();
  otherOwnerUserId = crypto.randomUUID();
  pendingOwnerUserId = crypto.randomUUID();
  customerId = crypto.randomUUID();

  await db.insert(user).values([
    { id: ownerUserId, email: `slot-validity-owner-${suffix}@ntizo.test`, role: "customer", status: "active" },
    {
      id: otherOwnerUserId,
      email: `slot-validity-other-owner-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: pendingOwnerUserId,
      email: `slot-validity-pending-owner-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    { id: customerId, email: `slot-validity-customer-${suffix}@ntizo.test`, role: "customer", status: "active" },
    ...Object.entries(staffUserIds).map(([key, id]) => ({
      id,
      email: `slot-validity-staff-${key}-${suffix}@ntizo.test`,
      role: "customer" as const,
      status: "active" as const,
    })),
  ]);

  const [categoryRow] = await db
    .insert(category)
    .values({ code: `slot-validity-test-${suffix}` })
    .returning({ id: category.id });
  categoryId = categoryRow!.id;

  async function makeProvider(ownerUserIdArg: string, status: string, label: string) {
    const [providerRow] = await db
      .insert(provider)
      .values({
        ownerUserId: ownerUserIdArg,
        type: "individual",
        name: `Slot Validity Test Provider ${label}`,
        slug: `slot-validity-test-${label.toLowerCase()}-${suffix}`,
        status,
        timezone: TIMEZONE,
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
      .values({
        serviceId: sid,
        pricingMode: "fixed",
        amountMinor: 100_000,
        durationMinutes: DURATION_MINUTES,
      })
      .returning({ id: serviceOption.id });

    return { providerId: pid, serviceId: sid, serviceOptionId: optionRow!.id };
  }

  const main = await makeProvider(ownerUserId, "active", "Main");
  providerId = main.providerId;
  serviceId = main.serviceId;
  serviceOptionId = main.serviceOptionId;

  const other = await makeProvider(otherOwnerUserId, "active", "Other");
  otherProviderId = other.providerId;
  otherServiceId = other.serviceId;
  otherServiceOptionId = other.serviceOptionId;

  const pending = await makeProvider(pendingOwnerUserId, "pending", "Pending");
  pendingProviderId = pending.providerId;
  pendingServiceId = pending.serviceId;
  pendingServiceOptionId = pending.serviceOptionId;

  async function makeMember(pid: string, userIdArg: string) {
    const [row] = await db
      .insert(providerMember)
      .values({ providerId: pid, userId: userIdArg, role: "owner" })
      .returning({ id: providerMember.id });
    return row!.id;
  }

  performerMemberId = await makeMember(providerId, staffUserIds.performer);
  nonPerformerMemberId = await makeMember(providerId, staffUserIds.nonPerformer);
  otherProviderMemberId = await makeMember(otherProviderId, staffUserIds.other);
  pendingMemberId = await makeMember(pendingProviderId, staffUserIds.pending);
  capacityThreeMemberId = await makeMember(providerId, staffUserIds.capacityThree);
  capacityNullMemberId = await makeMember(providerId, staffUserIds.capacityNull);
  perWindowMemberId = await makeMember(providerId, staffUserIds.perWindow);

  // Only `performerMemberId` and `pendingMemberId` are assigned to a
  // service — `nonPerformerMemberId` deliberately never gets a
  // `service_member` row, and `otherProviderMemberId` never gets one for
  // `serviceId` (only for its own provider's service, which nothing here
  // queries). The three capacity members below are assigned to `serviceId`
  // too — they exist only to reach the same capacity read, not to test the
  // membership join again.
  await db.insert(serviceMember).values([
    { serviceId, memberId: performerMemberId },
    { serviceId: pendingServiceId, memberId: pendingMemberId },
    { serviceId, memberId: capacityThreeMemberId },
    { serviceId, memberId: capacityNullMemberId },
    { serviceId, memberId: perWindowMemberId },
  ]);

  // 08:00–17:00 local, a 30-minute grid, no buffer.
  //
  // `performerMemberId` is capacity 1, the value every other fixture in this
  // file uses. The other three exist only to prove `capacity` on the
  // reader's result is read off the rule, not hardcoded: `capacityThree`
  // above 1, `capacityNull` at the column's actual default (`capacity`
  // omitted — null means one, not zero), and `perWindow` with two rows on
  // two different weekdays so the same member answers differently depending
  // on which rule the requested date falls under.
  await db.insert(memberAvailability).values([
    {
      providerId,
      memberId: performerMemberId,
      weekday: TARGET_WEEKDAY,
      startMinute: 480,
      endMinute: 1020,
      bufferMinutes: 0,
      slotIntervalMinutes: 30,
      capacity: 1,
    },
    {
      providerId,
      memberId: capacityThreeMemberId,
      weekday: TARGET_WEEKDAY,
      startMinute: 480,
      endMinute: 1020,
      bufferMinutes: 0,
      slotIntervalMinutes: 30,
      capacity: 3,
    },
    {
      providerId,
      memberId: capacityNullMemberId,
      weekday: TARGET_WEEKDAY,
      startMinute: 480,
      endMinute: 1020,
      bufferMinutes: 0,
      slotIntervalMinutes: 30,
      // `capacity` deliberately omitted — this row is the null case itself.
    },
    {
      providerId,
      memberId: perWindowMemberId,
      weekday: TARGET_WEEKDAY,
      startMinute: 480,
      endMinute: 1020,
      bufferMinutes: 0,
      slotIntervalMinutes: 30,
      capacity: 2,
    },
    {
      providerId,
      memberId: perWindowMemberId,
      weekday: SECOND_WEEKDAY,
      startMinute: 480,
      endMinute: 1020,
      bufferMinutes: 0,
      slotIntervalMinutes: 30,
      capacity: 4,
    },
  ]);
});

afterAll(async () => {
  await bestEffortCleanup([
    () =>
      db
        .delete(booking)
        .where(inArray(booking.providerId, [providerId, otherProviderId, pendingProviderId])),
    () =>
      db
        .delete(memberAvailability)
        .where(eq(memberAvailability.providerId, providerId)),
    () =>
      db
        .delete(serviceMember)
        .where(inArray(serviceMember.serviceId, [serviceId, pendingServiceId])),
    () =>
      db
        .delete(providerMember)
        .where(
          inArray(providerMember.id, [
            performerMemberId,
            nonPerformerMemberId,
            otherProviderMemberId,
            pendingMemberId,
            capacityThreeMemberId,
            capacityNullMemberId,
            perWindowMemberId,
          ]),
        ),
    () =>
      db
        .delete(serviceOption)
        .where(inArray(serviceOption.id, [serviceOptionId, pendingServiceOptionId, otherServiceOptionId])),
    () => db.delete(service).where(inArray(service.id, [serviceId, pendingServiceId, otherServiceId])),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(provider).where(inArray(provider.id, [providerId, otherProviderId, pendingProviderId])),
    () =>
      db
        .delete(user)
        .where(
          inArray(user.id, [
            ownerUserId,
            otherOwnerUserId,
            pendingOwnerUserId,
            customerId,
            ...Object.values(staffUserIds),
          ]),
        ),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

function check(input: {
  serviceId: string;
  providerMemberId: string;
  startsAt: Date;
  durationMinutes: number;
}) {
  return __runWithTransactionContextForTests(db, () => reader.check(input));
}

/** 09:00 local on `TARGET_DATE` — well inside the 08:00–17:00 rule, on the 30-minute grid. */
const ON_GRID_STARTS_AT = localDateTimeToInstant(TIMEZONE, TARGET_DATE, 540);

/** The same 09:00 local instant, on `SECOND_DATE` — `perWindowMemberId`'s other rule. */
const SECOND_DATE_ON_GRID_STARTS_AT = localDateTimeToInstant(TIMEZONE, SECOND_DATE, 540);

function bookingValues(overrides: Partial<NewBookingRow> = {}): NewBookingRow {
  return {
    customerId,
    providerId,
    serviceId,
    serviceOptionId,
    providerMemberId: performerMemberId,
    startsAt: ON_GRID_STARTS_AT,
    endsAt: new Date(ON_GRID_STARTS_AT.getTime() + DURATION_MINUTES * 60_000),
    status: BookingStatus.PendingPayment,
    priceMinor: 100_000,
    commissionBps: 1000,
    commissionMinor: 10_000,
    currency: "MZN",
    serviceName: "Corte de Cabelo",
    providerName: "Slot Validity Test Provider Main",
    providerSlug: `slot-validity-test-main-${suffix}`,
    optionName: "Standard",
    durationMinutes: DURATION_MINUTES,
    addressLabel: "Salão",
    addressLine: "Av. Julius Nyerere 123",
    addressCity: "Maputo",
    ...overrides,
  };
}

describe("the member/service join", () => {
  test("refuses a member of the right provider who was never assigned to this service", async () => {
    const result = await check({
      serviceId,
      providerMemberId: nonPerformerMemberId,
      startsAt: ON_GRID_STARTS_AT,
      durationMinutes: DURATION_MINUTES,
    });

    expect(result).toEqual({ ok: false, reason: "member_cannot_perform_service" });
  });

  test("refuses a member belonging to an entirely different provider", async () => {
    const result = await check({
      serviceId,
      providerMemberId: otherProviderMemberId,
      startsAt: ON_GRID_STARTS_AT,
      durationMinutes: DURATION_MINUTES,
    });

    expect(result).toEqual({ ok: false, reason: "member_cannot_perform_service" });
  });
});

describe("the provider-status filter", () => {
  test("refuses a member who genuinely performs the service, when its provider is only `pending`", async () => {
    // The membership join alone would pass here — `pendingMemberId` really
    // is assigned to `pendingServiceId` via a real `service_member` row.
    // Only the status read distinguishes this from the happy path.
    const result = await check({
      serviceId: pendingServiceId,
      providerMemberId: pendingMemberId,
      startsAt: ON_GRID_STARTS_AT,
      durationMinutes: DURATION_MINUTES,
    });

    expect(result).toEqual({ ok: false, reason: "provider_not_active" });
  });
});

describe("startsAt in the past", () => {
  test("refuses before any query runs, regardless of whether the slot would otherwise be real", async () => {
    const result = await check({
      serviceId,
      providerMemberId: performerMemberId,
      startsAt: new Date("2020-01-01T09:00:00.000Z"),
      durationMinutes: DURATION_MINUTES,
    });

    expect(result).toEqual({ ok: false, reason: "starts_at_in_past" });
  });
});

describe("the grid", () => {
  test("refuses an off-grid instant — 03:00, outside the 08:00–17:00 rule", async () => {
    const result = await check({
      serviceId,
      providerMemberId: performerMemberId,
      startsAt: localDateTimeToInstant(TIMEZONE, TARGET_DATE, 180),
      durationMinutes: DURATION_MINUTES,
    });

    expect(result).toEqual({ ok: false, reason: "slot_not_offered" });
  });

  test("accepts a real, free, on-grid instant for a member who performs the service at an active provider", async () => {
    const result = await check({
      serviceId,
      providerMemberId: performerMemberId,
      startsAt: ON_GRID_STARTS_AT,
      durationMinutes: DURATION_MINUTES,
    });

    expect(result).toEqual({ ok: true, capacity: 1 });
  });
});

describe("busy time feeds the same grid, not a second one", () => {
  test("refuses an instant another slot-holding booking already occupies (capacity 1)", async () => {
    await db.insert(booking).values(bookingValues());

    const result = await check({
      serviceId,
      providerMemberId: performerMemberId,
      startsAt: ON_GRID_STARTS_AT,
      durationMinutes: DURATION_MINUTES,
    });

    expect(result).toEqual({ ok: false, reason: "slot_not_offered" });

    await db.delete(booking).where(eq(booking.providerMemberId, performerMemberId));
  });

  test("a DECLINED booking at the same instant does not count as busy — SLOT_HOLDING_STATUSES decides, not mere existence", async () => {
    await db.insert(booking).values(bookingValues({ status: BookingStatus.Declined }));

    const result = await check({
      serviceId,
      providerMemberId: performerMemberId,
      startsAt: ON_GRID_STARTS_AT,
      durationMinutes: DURATION_MINUTES,
    });

    expect(result).toEqual({ ok: true, capacity: 1 });

    await db.delete(booking).where(eq(booking.providerMemberId, performerMemberId));
  });

  test("a busy booking on a different civil date does not block this one — busy is scoped per date, not per member", async () => {
    // One week after `TARGET_DATE`, so same weekday and no rule needed for
    // the assertion below. Derived from it rather than written out, or it
    // would drift the moment `TARGET_DATE` moved with the calendar.
    const otherDate = addDays(TARGET_DATE, 7);
    const otherStartsAt = localDateTimeToInstant(TIMEZONE, otherDate, 540);
    await db.insert(booking).values(
      bookingValues({
        startsAt: otherStartsAt,
        endsAt: new Date(otherStartsAt.getTime() + DURATION_MINUTES * 60_000),
      }),
    );

    const result = await check({
      serviceId,
      providerMemberId: performerMemberId,
      startsAt: ON_GRID_STARTS_AT,
      durationMinutes: DURATION_MINUTES,
    });

    expect(result).toEqual({ ok: true, capacity: 1 });

    await db.delete(booking).where(eq(booking.providerMemberId, performerMemberId));
  });
});

describe("capacity travels with the rule, not a default", () => {
  // The blind spot this file used to have: every fixture above uses
  // capacity 1, and one test even says so in its own name. `capacity` on
  // the result is read straight off `member_availability` via the same
  // `startsForDay` resolution that already decided `ok`, per
  // `SlotValidityResult`'s own doc comment — these three prove it is a real
  // read, not the 1 every other case in this file happens to also produce.

  test("a rule with capacity 3 answers with capacity 3", async () => {
    const result = await check({
      serviceId,
      providerMemberId: capacityThreeMemberId,
      startsAt: ON_GRID_STARTS_AT,
      durationMinutes: DURATION_MINUTES,
    });

    expect(result).toEqual({ ok: true, capacity: 3 });
  });

  test("a rule with capacity left null answers with capacity 1 — null means one, not zero", async () => {
    const result = await check({
      serviceId,
      providerMemberId: capacityNullMemberId,
      startsAt: ON_GRID_STARTS_AT,
      durationMinutes: DURATION_MINUTES,
    });

    expect(result).toEqual({ ok: true, capacity: 1 });
  });

  test("one member with two rules on different weekdays answers with each day's own capacity", async () => {
    const onTargetDate = await check({
      serviceId,
      providerMemberId: perWindowMemberId,
      startsAt: ON_GRID_STARTS_AT,
      durationMinutes: DURATION_MINUTES,
    });
    const onSecondDate = await check({
      serviceId,
      providerMemberId: perWindowMemberId,
      startsAt: SECOND_DATE_ON_GRID_STARTS_AT,
      durationMinutes: DURATION_MINUTES,
    });

    // Same member, same query shape, two different answers — proof the
    // resolution reads the window's own rule rather than something cached
    // or looked up per member.
    expect(onTargetDate).toEqual({ ok: true, capacity: 2 });
    expect(onSecondDate).toEqual({ ok: true, capacity: 4 });
  });
});
