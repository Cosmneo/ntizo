/**
 * These assert against the real dev database rather than mocking Drizzle,
 * for the same reason as scheduling-constraints.test.ts and
 * notification-constraints.test.ts: a CHECK or an index nobody exercises
 * might not actually be on the live table — the schema file can say whatever
 * it likes while a wrong migration, a hand-dropped constraint, or a generator
 * that silently skipped it leaves the real table unprotected. Only inserting
 * the row Postgres must refuse, and reading the constraint's own definition
 * back from Postgres's catalogs (`pg_indexes` for a plain or partial index,
 * `pg_constraint` for `booking_member_slot_no_overlap`'s `EXCLUDE`, which is
 * not an index even though it is backed by one), proves the constraint is
 * really there.
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
import {
  BOOKING_STATUSES,
  BookingStatus,
  DEADLINE_BEARING_STATUSES,
  SLOT_HOLDING_STATUSES,
} from "../booking/enums";
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
let otherMemberUserId: string;
let providerId: string;
let memberId: string;
/** A second member of the same provider — for proving an overlap only refuses the same calendar, not the whole provider. */
let otherMemberId: string;
let categoryId: string;
let serviceId: string;
let serviceOptionId: string;

beforeAll(async () => {
  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  otherMemberUserId = crypto.randomUUID();
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
    {
      id: otherMemberUserId,
      email: `booking-other-member-${suffix}@ntizo.test`,
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

  const [otherMemberRow] = await db
    .insert(providerMember)
    .values({ providerId, userId: otherMemberUserId, role: "staff" })
    .returning({ id: providerMember.id });
  otherMemberId = otherMemberRow!.id;

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
    () => db.delete(providerMember).where(eq(providerMember.id, otherMemberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(user).where(eq(user.id, customerId)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => db.delete(user).where(eq(user.id, otherMemberUserId)),
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

describe("platform_settings_checkout_hold_minutes_positive", () => {
  // Same reasoning as payment_window_minutes above: a zero-minute hold is a
  // DRAFT with no time to fill in the checkout form, i.e. already expired.
  test("refuses a zero-minute hold", async () => {
    await expect(insertPlatformSettingsRow({ checkoutHoldMinutes: 0 })).rejects.toThrow(
      /platform_settings_checkout_hold_minutes_positive/,
    );
  });

  test("refuses a negative hold", async () => {
    await expect(insertPlatformSettingsRow({ checkoutHoldMinutes: -1 })).rejects.toThrow(
      /platform_settings_checkout_hold_minutes_positive/,
    );
  });
});

describe("platform_settings_provider_response_minutes_positive", () => {
  // Same reasoning again: a zero-minute window gives a provider no time to
  // answer at all, which is not "must answer immediately" but "already
  // expired before the request could be read."
  test("refuses a zero-minute window", async () => {
    await expect(insertPlatformSettingsRow({ providerResponseMinutes: 0 })).rejects.toThrow(
      /platform_settings_provider_response_minutes_positive/,
    );
  });

  test("refuses a negative window", async () => {
    await expect(insertPlatformSettingsRow({ providerResponseMinutes: -1 })).rejects.toThrow(
      /platform_settings_provider_response_minutes_positive/,
    );
  });
});

describe("booking_member_slot_no_overlap", () => {
  // These four hold what `booking_member_slot_active_uq` used to catch: two
  // active bookings sharing the exact same start instant. An identical start
  // is a degenerate overlap (both ranges begin at the same point), so the
  // exclusion constraint that replaced the index refuses it too — these
  // prove that subsumption rather than assume it.
  test("two active bookings cannot hold the same member and slot", async () => {
    const slotStart = new Date("2026-09-02T09:00:00Z");
    const slotEnd = new Date("2026-09-02T10:00:00Z");

    const [first] = await insertBooking({ startsAt: slotStart, endsAt: slotEnd });
    expect(first?.id).toBeString();

    await expect(insertBooking({ startsAt: slotStart, endsAt: slotEnd })).rejects.toThrow(
      /booking_member_slot_no_overlap/,
    );
  });

  test("any two slot-holding statuses collide, not only two identical ones", async () => {
    const slotStart = new Date("2026-09-03T09:00:00Z");
    const slotEnd = new Date("2026-09-03T10:00:00Z");

    await insertBooking({ status: BookingStatus.Confirmed, startsAt: slotStart, endsAt: slotEnd });

    await expect(
      insertBooking({ status: BookingStatus.MarkedDone, startsAt: slotStart, endsAt: slotEnd }),
    ).rejects.toThrow(/booking_member_slot_no_overlap/);
  });

  // DRAFT is new: the checkout hold has to occupy the same calendar as
  // every other slot-holding status, or two customers filling in the form
  // at once for the same slot would not collide until one of them paid.
  test("two overlapping DRAFT bookings on one member at the same seat are refused", async () => {
    const slotStart = new Date("2026-09-11T09:00:00Z");
    const slotEnd = new Date("2026-09-11T10:00:00Z");

    await insertBooking({ status: BookingStatus.Draft, startsAt: slotStart, endsAt: slotEnd });

    await expect(
      insertBooking({ status: BookingStatus.Draft, startsAt: slotStart, endsAt: slotEnd }),
    ).rejects.toThrow(/booking_member_slot_no_overlap/);
  });

  // A held slot is a held slot whichever end of the flow it is at: a
  // checkout still being filled in must collide with a booking that already
  // made it all the way to CONFIRMED, not just with another DRAFT.
  test("a DRAFT and a CONFIRMED booking overlapping at the same seat are refused", async () => {
    const slotStart = new Date("2026-09-12T09:00:00Z");
    const slotEnd = new Date("2026-09-12T10:00:00Z");

    await insertBooking({ status: BookingStatus.Confirmed, startsAt: slotStart, endsAt: slotEnd });

    await expect(
      insertBooking({ status: BookingStatus.Draft, startsAt: slotStart, endsAt: slotEnd }),
    ).rejects.toThrow(/booking_member_slot_no_overlap/);
  });

  test("a released slot can be rebooked — the constraint is partial, not total", async () => {
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

  test("the constraint exists, is partial, and is built from exactly the slot-holding statuses", async () => {
    // `pg_constraint`, not `pg_indexes`: an `EXCLUDE` constraint is backed by
    // an index but is not itself one, and `pg_get_constraintdef` is the
    // catalog's own account of what the constraint says — an independent
    // check that the migration this test predates (until it's applied)
    // actually did what `booking.schema.ts`'s comment says it does.
    const rows = await sql`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'booking_member_slot_no_overlap'
        AND connamespace = 'ntizo_booking'::regnamespace`;
    const definition = rows[0]?.["definition"] as string | undefined;
    expect(definition).toBeDefined();
    expect(definition).toContain("EXCLUDE");
    expect(definition).toContain("gist");
    expect(definition).toContain("WHERE");
    // Both directions, the same discipline the loop below applies to the
    // statuses: `seat` must be present (proving the new key column actually
    // landed in the migration rather than only in this file's fixtures) and
    // `provider_member_id` must still be present alongside it (proving seat
    // was added to the key, not swapped in for the column that scopes the
    // constraint to one member's calendar).
    expect(definition).toContain("seat");
    expect(definition).toContain("provider_member_id");

    // Both directions matter, and only because this predicate is hand-typed
    // into a migration file rather than generated from `SLOT_HOLDING_STATUSES`
    // the way `booking_status_known` and the old index's predicate were
    // (`booking.schema.ts`'s `statusList` helper needs a live TypeScript
    // import a `.sql` file cannot have). A status added to the constant and
    // forgotten here would silently stop preventing a double-booking for it;
    // a status added here that is not in the constant — DISPUTED, say —
    // would silently stop a slot from ever being released, so a provider
    // could never be rebooked into it. Neither typo trips the compiler, so
    // this test is the only thing that would catch either one. Plain
    // `toContain` is safe both ways: no `BOOKING_STATUSES` member's name is
    // a substring of another's.
    for (const status of SLOT_HOLDING_STATUSES) {
      expect(definition).toContain(status);
    }
    for (const status of BOOKING_STATUSES) {
      if (!(SLOT_HOLDING_STATUSES as readonly string[]).includes(status)) {
        expect(definition).not.toContain(status);
      }
    }
  });

  test("the sweep index is partial on exactly the deadline-bearing statuses", async () => {
    // `pg_indexes`, not `pg_constraint`: this one really is a plain partial
    // index, and `indexdef` is the catalogue's own account of what is on the
    // live table.
    //
    // **Why this test exists even though the predicate is generated.**
    // Unlike the exclusion constraint above, `booking_sweep_idx`'s
    // `WHERE` is built from `DEADLINE_BEARING_STATUSES` through
    // `booking.schema.ts`'s `statusList`, so the schema file and the constant
    // cannot drift. That guarantees nothing about the *database*, and the
    // failure mode here is the quiet kind: a partial index whose predicate no
    // longer implies the query's is not an error, it is simply never used.
    // Postgres plans a sequential scan plus a sort of the whole `booking`
    // table, every sixty seconds, for ever, and every test stays green. An
    // unapplied migration is invisible without something that reads the live
    // definition back — this.
    const rows = await sql`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'ntizo_booking'
        AND tablename = 'booking'
        AND indexname = 'booking_sweep_idx'`;
    const definition = rows[0]?.["indexdef"] as string | undefined;
    expect(definition).toBeDefined();
    // Partial, and on the column the sweep both filters and orders by — an
    // index that lost either is an index that cannot serve the query even
    // with the right statuses.
    expect(definition).toContain("expires_at");
    expect(definition).toContain("WHERE");

    // Both directions, the same discipline as the exclusion constraint
    // above. A status in the constant but missing from the predicate means
    // the sweep selects rows this index cannot serve — the sequential scan,
    // silently. A status in the predicate but not in the constant means
    // somebody widened the *index* instead of the query, which is the more
    // dangerous mistake of the two: the index would then be inviting a
    // future sweep to claim rows nothing has decided an ending for. Plain
    // `toContain` is safe both ways: no `BOOKING_STATUSES` member's name is
    // a substring of another's, and the statuses are upper-case where every
    // identifier in an `indexdef` is not (so `EXPIRED` cannot match
    // `expires_at`).
    for (const status of DEADLINE_BEARING_STATUSES) {
      expect(definition).toContain(status);
    }
    for (const status of BOOKING_STATUSES) {
      if (!(DEADLINE_BEARING_STATUSES as readonly string[]).includes(status)) {
        expect(definition).not.toContain(status);
      }
    }
  });

  // The gap `booking_member_slot_active_uq` left: its key was
  // `(provider_member_id, starts_at)`, so a 90-minute booking at 14:00 and a
  // 30-minute one at 14:30 both inserted even though the member cannot be in
  // two places at once — and 14:30 is a legal grid start the availability
  // modal offers, because `slot_interval_minutes` is 30. Every test above
  // collides on an identical `starts_at`; this is the first one that does
  // not.
  test("refuses a booking whose window overlaps another without sharing its start", async () => {
    const slotStart = new Date("2026-09-06T14:00:00Z");
    const slotEnd = new Date("2026-09-06T15:30:00Z");

    const [first] = await insertBooking({ startsAt: slotStart, endsAt: slotEnd });
    expect(first?.id).toBeString();

    // 14:30–15:00: starts after 14:00, ends before 15:30, and shares no
    // instant with either endpoint — a pure containment overlap, the
    // shape `starts_at` alone could never catch.
    await expect(
      insertBooking({
        startsAt: new Date("2026-09-06T14:30:00Z"),
        endsAt: new Date("2026-09-06T15:00:00Z"),
      }),
    ).rejects.toThrow(/booking_member_slot_no_overlap/);
  });

  test("the same overlap is fine on a different member", async () => {
    const slotStart = new Date("2026-09-07T14:00:00Z");
    const slotEnd = new Date("2026-09-07T15:30:00Z");

    const [first] = await insertBooking({ startsAt: slotStart, endsAt: slotEnd });
    expect(first?.id).toBeString();

    // Same overlapping window, but `otherMemberId` — the constraint's first
    // key column is `provider_member_id`, so two different calendars never
    // collide no matter how their times relate.
    const [second] = await insertBooking({
      providerMemberId: otherMemberId,
      startsAt: new Date("2026-09-07T14:30:00Z"),
      endsAt: new Date("2026-09-07T15:00:00Z"),
    });
    expect(second?.id).toBeString();
  });

  test("the same overlap is fine once the first booking is EXPIRED", async () => {
    const slotStart = new Date("2026-09-08T14:00:00Z");
    const slotEnd = new Date("2026-09-08T15:30:00Z");

    const [first] = await insertBooking({ startsAt: slotStart, endsAt: slotEnd });
    expect(first?.id).toBeString();

    // EXPIRED is not in SLOT_HOLDING_STATUSES, so the constraint's partial
    // WHERE no longer matches this row once it transitions — releasing the
    // time the same way it releases the exact-start case above.
    await db
      .update(booking)
      .set({ status: BookingStatus.Expired, expiredAt: new Date() })
      .where(eq(booking.id, first!.id));

    const [second] = await insertBooking({
      startsAt: new Date("2026-09-08T14:30:00Z"),
      endsAt: new Date("2026-09-08T15:00:00Z"),
    });
    expect(second?.id).toBeString();
  });

  // `member_availability.capacity` lets one member hold several bookings at
  // once — a room, a class, a team behind one name — and every other test in
  // this block uses the implicit default of seat 1, which is also every
  // capacity-1 member this branch's fixtures ever create. These two are the
  // ones that actually move the seat.
  test("two overlapping bookings on one member succeed when they hold different seats", async () => {
    const slotStart = new Date("2026-09-09T09:00:00Z");
    const slotEnd = new Date("2026-09-09T10:00:00Z");

    const [first] = await insertBooking({ seat: 1, startsAt: slotStart, endsAt: slotEnd });
    expect(first?.id).toBeString();

    const [second] = await insertBooking({ seat: 2, startsAt: slotStart, endsAt: slotEnd });
    expect(second?.id).toBeString();
  });

  test("two overlapping bookings on one member are still refused when they share a seat", async () => {
    const slotStart = new Date("2026-09-10T09:00:00Z");
    const slotEnd = new Date("2026-09-10T10:00:00Z");

    const [first] = await insertBooking({ seat: 2, startsAt: slotStart, endsAt: slotEnd });
    expect(first?.id).toBeString();

    // Same seat, overlapping window — `seat` narrows the exclusion key, it
    // does not remove `provider_member_id` or the time range from it.
    await expect(
      insertBooking({
        seat: 2,
        startsAt: new Date("2026-09-10T09:30:00Z"),
        endsAt: new Date("2026-09-10T10:30:00Z"),
      }),
    ).rejects.toThrow(/booking_member_slot_no_overlap/);
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
