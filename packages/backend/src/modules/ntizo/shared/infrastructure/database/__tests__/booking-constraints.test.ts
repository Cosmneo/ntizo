/**
 * These assert against the real dev database rather than mocking Drizzle,
 * for the same reason as scheduling-constraints.test.ts and
 * notification-constraints.test.ts: a CHECK or an index nobody exercises
 * might not actually be on the live table — the schema file can say whatever
 * it likes while a wrong migration, a hand-dropped constraint, or a generator
 * that silently skipped it leaves the real table unprotected. Only inserting
 * the row Postgres must refuse, and reading the index definition back from
 * `pg_indexes`, proves the constraint is really there.
 *
 * Connects the same way: `postgres` + `drizzle-orm/postgres-js` against
 * `DEV_DB_URL`, which Bun loads automatically from `packages/backend/.env`.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, sql as sqlExpr } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { category } from "../catalog/schemas/category.schema";
import { service, serviceOption } from "../catalog/schemas/service.schema";
import { provider } from "../provider/schemas/provider.schema";
import { providerMember } from "../provider/schemas/provider-member.schema";
import { user } from "../user/schemas/user.schema";
import { booking } from "../booking/schemas/booking.schema";
import type { NewBookingRow } from "../booking/schemas/booking.schema";
import { bookingChange } from "../booking/schemas/booking-change.schema";
import { platformSettings } from "../platform/schemas/platform-settings.schema";
import { BookingStatus, SLOT_HOLDING_STATUSES } from "../booking/enums";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql);

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
      email: `booking-customer-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerUserId,
      email: `booking-owner-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Booking Constraint Test Provider",
      slug: `booking-constraint-test-${suffix}`,
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
    .values({ code: `booking-constraint-test-${suffix}` })
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
  // Children first, same ordering discipline as scheduling-constraints.test.ts
  // and communication-constraints.test.ts. `booking_change` and `booking` are
  // deleted by a subquery on `providerId` rather than by a tracked id list, so
  // cleanup is thorough even if an assertion above threw partway through a
  // test — a booking row this file inserted but never got to track still
  // falls under "every booking belonging to this run's provider".
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
});

/** A row that satisfies every NOT NULL and CHECK unless a test overrides one. */
function bookingValues(overrides: Partial<NewBookingRow> = {}): NewBookingRow {
  return {
    customerId,
    providerId,
    serviceId,
    serviceOptionId,
    providerMemberId: memberId,
    startsAt: new Date("2026-09-01T09:00:00Z"),
    endsAt: new Date("2026-09-01T10:00:00Z"),
    status: BookingStatus.PendingPayment,
    priceMinor: 100_000,
    commissionBps: 1000,
    commissionMinor: 10_000,
    currency: "MZN",
    serviceName: "Corte de Cabelo",
    providerName: "Booking Constraint Test Provider",
    providerSlug: `booking-constraint-test-${suffix}`,
    optionName: "Standard",
    durationMinutes: 60,
    addressLabel: "Salão",
    addressLine: "Av. Julius Nyerere 123",
    addressCity: "Maputo",
    ...overrides,
  };
}

// Drizzle's query builders are lazy thenables, not native Promises —
// `expect(...).rejects` needs a real Promise, which wrapping in an async
// function guarantees: awaiting a thenable inside one always produces a
// genuine Promise on the outside. Same technique as
// scheduling-constraints.test.ts's `insertWeekly` etc.
async function insertBooking(overrides: Partial<NewBookingRow> = {}) {
  return await db.insert(booking).values(bookingValues(overrides)).returning({ id: booking.id });
}

describe("booking money and status CHECK constraints", () => {
  test("refuses a status outside BOOKING_STATUSES", async () => {
    await expect(
      insertBooking({ status: "NOT_A_REAL_STATUS" }),
    ).rejects.toThrow(/booking_status_known/);
  });

  test("refuses a negative price_minor", async () => {
    await expect(insertBooking({ priceMinor: -1 })).rejects.toThrow(
      /booking_price_minor_non_negative/,
    );
  });

  test("refuses a commission_bps above 10000", async () => {
    await expect(insertBooking({ commissionBps: 10_001 })).rejects.toThrow(
      /booking_commission_bps_range/,
    );
  });

  test("refuses a negative commission_minor", async () => {
    await expect(insertBooking({ commissionMinor: -1 })).rejects.toThrow(
      /booking_commission_minor_non_negative/,
    );
  });

  test("accepts commission_bps at each bound", async () => {
    const [low] = await insertBooking({
      commissionBps: 0,
      startsAt: new Date("2026-09-01T11:00:00Z"),
      endsAt: new Date("2026-09-01T12:00:00Z"),
    });
    expect(low?.id).toBeString();

    const [high] = await insertBooking({
      commissionBps: 10_000,
      startsAt: new Date("2026-09-01T13:00:00Z"),
      endsAt: new Date("2026-09-01T14:00:00Z"),
    });
    expect(high?.id).toBeString();
  });
});

/**
 * `platform_settings`, not `booking` — this file's own top comment is about
 * `booking`, but `payment_window_minutes` exists only because it governs a
 * booking's `expiresAt` (Task 13), and this is where the plan's other
 * booking-adjacent CHECK constraints already live rather than a new file for
 * one column.
 *
 * Inserted with a random `id` rather than `"global"`: the real singleton row
 * is shared with every other test and adapter hitting this dev database, and
 * a CHECK failure aborts the statement without creating a row anyway — there
 * is nothing here for `afterAll` to clean up.
 */
async function insertPlatformSettingsRow(
  overrides: Partial<typeof platformSettings.$inferInsert> = {},
) {
  return await db
    .insert(platformSettings)
    .values({ id: crypto.randomUUID(), ...overrides })
    .returning({ id: platformSettings.id });
}

describe("platform_settings_payment_window_minutes_positive", () => {
  test("refuses a zero-minute window", async () => {
    await expect(insertPlatformSettingsRow({ paymentWindowMinutes: 0 })).rejects.toThrow(
      /platform_settings_payment_window_minutes_positive/,
    );
  });

  test("refuses a negative window", async () => {
    await expect(insertPlatformSettingsRow({ paymentWindowMinutes: -1 })).rejects.toThrow(
      /platform_settings_payment_window_minutes_positive/,
    );
  });
});

describe("booking_member_slot_active_uq", () => {
  test("two active bookings cannot hold the same member and slot", async () => {
    const slotStart = new Date("2026-09-02T09:00:00Z");
    const slotEnd = new Date("2026-09-02T10:00:00Z");

    const [first] = await insertBooking({ startsAt: slotStart, endsAt: slotEnd });
    expect(first?.id).toBeString();

    await expect(insertBooking({ startsAt: slotStart, endsAt: slotEnd })).rejects.toThrow(
      /booking_member_slot_active_uq/,
    );
  });

  test("any two slot-holding statuses collide, not only two identical ones", async () => {
    const slotStart = new Date("2026-09-03T09:00:00Z");
    const slotEnd = new Date("2026-09-03T10:00:00Z");

    await insertBooking({ status: BookingStatus.Confirmed, startsAt: slotStart, endsAt: slotEnd });

    await expect(
      insertBooking({ status: BookingStatus.MarkedDone, startsAt: slotStart, endsAt: slotEnd }),
    ).rejects.toThrow(/booking_member_slot_active_uq/);
  });

  test("a released slot can be rebooked — the index is partial, not total", async () => {
    const slotStart = new Date("2026-09-04T09:00:00Z");
    const slotEnd = new Date("2026-09-04T10:00:00Z");

    const [declined] = await insertBooking({
      status: BookingStatus.Declined,
      startsAt: slotStart,
      endsAt: slotEnd,
    });
    expect(declined?.id).toBeString();

    // Declined does not hold the slot, so a second booking at the exact same
    // (member, start) must be allowed — proving the constraint reads
    // SLOT_HOLDING_STATUSES rather than blocking every status uniformly.
    const [second] = await insertBooking({
      status: BookingStatus.Declined,
      startsAt: slotStart,
      endsAt: slotEnd,
    });
    expect(second?.id).toBeString();
  });

  test("the index exists, is partial, and is built from every slot-holding status", async () => {
    const rows = await sql`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'ntizo_booking' AND indexname = 'booking_member_slot_active_uq'`;
    const indexdef = rows[0]?.["indexdef"] as string | undefined;
    expect(indexdef).toBeDefined();
    expect(indexdef).toContain("WHERE");
    for (const status of SLOT_HOLDING_STATUSES) {
      expect(indexdef).toContain(status);
    }
  });
});

describe("booking_change", () => {
  test("cannot exist without its booking", async () => {
    // Wrapped in an async helper rather than handed to `expect` directly. A
    // Drizzle query builder is a thenable, not a Promise, and bun's `.rejects`
    // will not run one — it reports the builder itself as the received value
    // and fails whether or not the database would have refused the row. Every
    // other rejection test in this file goes through `insertBooking`, which is
    // async, which is why this was the only one that could not pass.
    const insertOrphanChange = async () =>
      await db.insert(bookingChange).values({
        bookingId: crypto.randomUUID(),
        changedByUserId: ownerUserId,
        reason: "orphan change — no booking to attach to",
      });

    // Named, like every other rejection assertion here: a bare `toThrow()`
    // passes for any reason the insert fails, including a typo in the row.
    await expect(insertOrphanChange()).rejects.toThrow(
      /booking_change_booking_id_booking_id_fk/,
    );
  });

  test("deleting the booking cascades to its change log", async () => {
    const [bookingRow] = await insertBooking({
      startsAt: new Date("2026-09-05T09:00:00Z"),
      endsAt: new Date("2026-09-05T10:00:00Z"),
    });
    const bookingId = bookingRow!.id;

    const [changeRow] = await db
      .insert(bookingChange)
      .values({
        bookingId,
        changedByUserId: ownerUserId,
        reason: "customer asked to move an hour earlier",
        previousStartsAt: new Date("2026-09-05T08:00:00Z"),
        previousEndsAt: new Date("2026-09-05T09:00:00Z"),
      })
      .returning({ id: bookingChange.id });
    expect(changeRow?.id).toBeString();

    await db.delete(booking).where(eq(booking.id, bookingId));

    const remaining = await db
      .select()
      .from(bookingChange)
      .where(eq(bookingChange.id, changeRow!.id));
    expect(remaining).toHaveLength(0);
  });
});
