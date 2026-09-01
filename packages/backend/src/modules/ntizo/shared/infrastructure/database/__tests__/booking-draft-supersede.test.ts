/**
 * One open draft per customer — `CreateBookingCommand` against the real dev
 * database, same reason and same mechanism as `booking-sweep.test.ts`: every
 * real adapter this rule runs through (`DrizzleBookingRepository`,
 * `DrizzleUnitOfWork`, `OutboxAdapter`) reaches the database through
 * `getDb()`, which resolves through AsyncLocalStorage — and a test has no
 * request. `__runWithTransactionContextForTests` binds this file's own real,
 * `DEV_DB_URL`-backed Drizzle client into that context for the duration of
 * one test body, and `DrizzleUnitOfWork.atomicExecute` joins it rather than
 * opening a second, real Postgres transaction.
 *
 * **What only this file can prove:** that starting a second draft does not
 * merely mark the first one `EXPIRED` but actually gives the provider their
 * calendar back. A command test against a fake repository can assert the
 * status and the release call; only the real exclusion constraint and the
 * real `SLOT_HOLDING_STATUSES` predicate can say whether the slot is
 * bookable again, and that — not the row's status column — is the thing the
 * rule exists for.
 *
 * The four readers are faked and everything that writes is real. Those four
 * answer questions this rule does not ask (what does the option cost, does
 * the grid offer this start, how long is the checkout hold); standing up a
 * whole availability rule so `DrizzleSlotValidityReader` could say yes would
 * add a second thing this file could fail on without adding anything it
 * could prove.
 *
 * Fixtures follow `booking-sweep.test.ts`'s pattern: one provider and one
 * provider member, created fresh under a random `suffix` in `beforeAll`, so
 * this run's `providerMemberId` cannot collide with another worktree's or
 * another session's concurrent run on the slot-overlap constraint. The two
 * slots are far in the future and an hour apart, so neither the deadline
 * sweep nor the exclusion constraint has anything to say about them.
 *
 * **Every booking is deleted in a `finally`, never after the last
 * assertion** — see `withBookings`. `withBookings` is written here rather
 * than imported from `booking-repository.test.ts`, which has one of its own:
 * that one closes over that file's tracking, and sharing it would tie two
 * suites' cleanup together. A row one of them leaked would then surface as a
 * failure in the other.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";
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
import { SLOT_HOLDING_STATUSES } from "../booking/enums";
import { DrizzleBookingRepository } from "../../../../bounded-contexts/booking/infrastructure/repositories/drizzle/booking.repository";
import { BookingRowSlotHold } from "../../../../bounded-contexts/booking/infrastructure/adapters/booking-row-slot-hold.adapter";
import { BookingRowDelayedJobs } from "../../../../bounded-contexts/booking/infrastructure/adapters/booking-row-delayed-jobs.adapter";
import { CreateBookingCommand } from "../../../../bounded-contexts/booking/app/use-cases/create-booking.command";
import type {
  ServiceOptionPricing,
  ServicePricingReaderPort,
} from "../../../../bounded-contexts/booking/app/ports/outbound/service-pricing.reader.port";
import type {
  ProviderSnapshot,
  ProviderSnapshotReaderPort,
} from "../../../../bounded-contexts/booking/app/ports/outbound/provider-snapshot.reader.port";
import type { PlatformSettingsReaderPort } from "../../../../bounded-contexts/booking/app/ports/outbound/platform-settings.reader.port";
import type {
  SlotValidityReaderPort,
  SlotValidityResult,
} from "../../../../bounded-contexts/booking/app/ports/outbound/slot-validity.reader.port";
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

const DURATION_MINUTES = 60;
const CHECKOUT_HOLD_MINUTES = 30;

/**
 * Two starts an hour apart, so the second draft never collides with the
 * first on `booking_member_slot_no_overlap` — the exclusion constraint would
 * otherwise refuse the second insert and this file would be proving the
 * constraint rather than the rule.
 *
 * Far enough in the future that the checkout hold is never capped to the
 * slot's own start (`cappedToSlotStart`) and no concurrently-running deadline
 * sweep — that query is not scoped to any provider — ever finds these rows
 * due.
 */
const NINE_AM = new Date("2027-03-01T09:00:00.000Z");
const TEN_AM = new Date("2027-03-01T10:00:00.000Z");

let customerId: string;
let otherCustomerId: string;
let ownerUserId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let serviceOptionId: string;

/**
 * Every booking id this file created, tracked independently of each test's
 * own cleanup — `afterAll` runs after every test body has already deleted its
 * own booking rows, so the outbox rows those bookings left behind could not
 * be found by re-reading `booking` at that point.
 */
const createdBookingIds: string[] = [];

beforeAll(async () => {
  customerId = crypto.randomUUID();
  otherCustomerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    {
      id: customerId,
      email: `booking-supersede-customer-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: otherCustomerId,
      email: `booking-supersede-other-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
    {
      id: ownerUserId,
      email: `booking-supersede-owner-${suffix}@ntizo.test`,
      role: "customer",
      status: "active",
    },
  ]);

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Booking Supersede Test Provider",
      slug: `booking-supersede-test-${suffix}`,
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
    .values({ code: `booking-supersede-test-${suffix}` })
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
      durationMinutes: DURATION_MINUTES,
    })
    .returning({ id: serviceOption.id });
  serviceOptionId = optionRow!.id;
});

afterAll(async () => {
  await bestEffortCleanup([
    // Guarded on length: drizzle's `inArray` against an empty list still
    // issues a valid (always-false) query, but skipping it avoids relying on
    // that for correctness.
    () =>
      createdBookingIds.length > 0
        ? db.delete(outboxEvent).where(inArray(outboxEvent.aggregateId, createdBookingIds))
        : Promise.resolve(),
    () =>
      createdBookingIds.length > 0
        ? db.delete(bookingChange).where(inArray(bookingChange.bookingId, createdBookingIds))
        : Promise.resolve(),
    // Scoped to this run's provider rather than to the tracked ids, so a
    // booking a test created but never got to track is still removed.
    () => db.delete(booking).where(eq(booking.providerId, providerId)),
    () => db.delete(serviceOption).where(eq(serviceOption.id, serviceOptionId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(user).where(eq(user.id, customerId)),
    () => db.delete(user).where(eq(user.id, otherCustomerId)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

/**
 * The four questions this rule does not ask, answered from the fixtures
 * `beforeAll` really created — the ids have to be real, because everything
 * downstream of them is.
 */
class FixedPricingReader implements ServicePricingReaderPort {
  async findOption(): Promise<ServiceOptionPricing | null> {
    return {
      serviceId,
      providerId,
      serviceName: "Corte de Cabelo",
      optionName: "Standard",
      bookingMode: "priced",
      serviceStatus: "published",
      optionIsActive: true,
      pricingMode: "fixed",
      amountMinor: 100_000,
      currency: "MZN",
      durationMinutes: DURATION_MINUTES,
    };
  }
}

class FixedProviderReader implements ProviderSnapshotReaderPort {
  async findForBooking(): Promise<ProviderSnapshot | null> {
    return {
      commissionBps: 1000,
      name: "Booking Supersede Test Provider",
      slug: `booking-supersede-test-${suffix}`,
    };
  }
}

class FixedPlatformSettingsReader implements PlatformSettingsReaderPort {
  async findCheckoutHoldMinutes(): Promise<number> {
    return CHECKOUT_HOLD_MINUTES;
  }
  async findProviderResponseMinutes(): Promise<number> {
    return CHECKOUT_HOLD_MINUTES;
  }
  async findPaymentWindowMinutes(): Promise<number> {
    return CHECKOUT_HOLD_MINUTES;
  }
}

/** Capacity one: one seat per member per window, the shape every fixture here assumes. */
class AlwaysValidSlotReader implements SlotValidityReaderPort {
  async check(): Promise<SlotValidityResult> {
    return { ok: true, capacity: 1 };
  }
}

/**
 * `CreateBookingCommand` wired exactly the way `bootstrapBooking()` wires it,
 * except for the four readers above.
 */
function buildCreate(): CreateBookingCommand {
  return new CreateBookingCommand(
    repo,
    new FixedPricingReader(),
    new FixedProviderReader(),
    new FixedPlatformSettingsReader(),
    new AlwaysValidSlotReader(),
    new BookingRowSlotHold(),
    new BookingRowDelayedJobs(),
    new DrizzleUnitOfWork(),
    new OutboxAdapter(new DrizzleOutboxEventRepository()),
  );
}

/**
 * One draft, through the real command — which is the only place the rule
 * under test lives.
 *
 * The address is still supplied because `CreateBookingInput` still requires
 * one; `Booking.create` no longer does, and the mutation that stops sending
 * it is the next task's. Nothing here reads it back.
 */
async function createDraft(input: { customerId: string; startsAt: Date }): Promise<{ id: string }> {
  const { bookingId } = await buildCreate().execute({
    customerId: input.customerId,
    serviceOptionId,
    providerMemberId: memberId,
    startsAt: input.startsAt,
    locale: "pt-MZ",
    address: {
      label: "Salão",
      line: "Av. Julius Nyerere 123",
      city: "Maputo",
      district: null,
      directions: null,
      lat: null,
      lng: null,
    },
    description: null,
  });
  return { id: bookingId };
}

/**
 * Whether a member's calendar is genuinely open across the window starting at
 * `startsAt` — the question `booking_member_slot_no_overlap` asks, not the
 * question "is there a row with this status".
 *
 * Overlap rather than an exact-start match on purpose: a released slot that
 * some other row still half-covers is not free, and a helper that only
 * compared starts would report it as if it were.
 */
async function slotIsFree(providerMemberId: string, startsAt: Date): Promise<boolean> {
  const endsAt = new Date(startsAt.getTime() + DURATION_MINUTES * 60_000);
  const rows = await db
    .select({ id: booking.id })
    .from(booking)
    .where(
      and(
        eq(booking.providerMemberId, providerMemberId),
        inArray(booking.status, [...SLOT_HOLDING_STATUSES]),
        lt(booking.startsAt, endsAt),
        gt(booking.endsAt, startsAt),
      ),
    );
  return rows.length === 0;
}

/**
 * Runs one test body inside this file's transaction context and deletes every
 * booking it tracked afterwards — **in a `finally`, so an assertion that
 * throws mid-test still cleans up.**
 *
 * That is the structural point, not a convenience. The dev database is
 * shared, and the rule under test reads `booking` by customer with no
 * provider scope at all: a `DRAFT` one test leaks is a `DRAFT` the next test
 * in this file supersedes instead of the one it created, which fails as a
 * defect in the rule rather than as the leak it is.
 *
 * `track` takes an id rather than an aggregate because that is what
 * `createDraft` returns — the command answers with a `bookingId`, not a
 * `Booking`. It also appends to `createdBookingIds`, which `afterAll` uses to
 * delete the outbox rows these bookings wrote; those outlive the booking row
 * and are not caught by deleting bookings alone.
 */
async function withBookings(body: (track: (id: string) => void) => Promise<void>): Promise<void> {
  const ids: string[] = [];
  await __runWithTransactionContextForTests(db, async () => {
    try {
      await body((id) => {
        ids.push(id);
        createdBookingIds.push(id);
      });
    } finally {
      for (const id of ids) {
        await db.delete(booking).where(eq(booking.id, id));
      }
    }
  });
}

/** What the command announced about one booking, oldest row first. */
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

describe("CreateBookingCommand, one open draft per customer", () => {
  test("expires the customer's previous draft, and releases its slot", async () => {
    // The fixture that makes this able to fail: the customer already holds a
    // draft on a DIFFERENT slot. A test whose customer holds nothing cannot
    // fail if the rule is dropped, and a test where both drafts are on the
    // same slot would pass on the exclusion constraint instead of on this
    // rule.
    await withBookings(async (track) => {
      const first = await createDraft({ customerId, startsAt: NINE_AM });
      track(first.id);

      const second = await createDraft({ customerId, startsAt: TEN_AM });
      track(second.id);

      const rows = await db
        .select({ id: booking.id, status: booking.status })
        .from(booking)
        .where(inArray(booking.id, [first.id, second.id]));

      expect(rows.find((r) => r.id === first.id)?.status).toBe("EXPIRED");
      expect(rows.find((r) => r.id === second.id)?.status).toBe("DRAFT");

      // The whole point of the rule is the calendar, not the row: assert the
      // released slot, not merely the changed status.
      expect(await slotIsFree(memberId, NINE_AM)).toBe(true);
    });
  });

  test("announces the superseded draft under its own cause, not the checkout hold", async () => {
    await withBookings(async (track) => {
      const first = await createDraft({ customerId, startsAt: NINE_AM });
      track(first.id);
      const second = await createDraft({ customerId, startsAt: TEN_AM });
      track(second.id);

      const announcements = await announcementsFor(first.id);
      expect(announcements.map((a) => a.eventType)).toEqual([
        "booking.created",
        "booking.expired",
      ]);
      // `superseded`, not `checkout_hold`: this draft did not run out of
      // anything, and a consumer deciding whether to write to the customer
      // reads exactly this field.
      expect(announcements[1]?.payload).toMatchObject({
        bookingId: first.id,
        customerId,
        providerMemberId: memberId,
        cause: "superseded",
      });
      // Same `aggregate_type` as every other booking event, so a consumer
      // filtering on it does not silently skip this one.
      const [row] = await db
        .select({ aggregateType: outboxEvent.aggregateType })
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, first.id))
        .orderBy(asc(outboxEvent.createdAt))
        .limit(1);
      expect(row?.aggregateType).toBe("booking");
    });
  });

  test("leaves another customer's draft alone", async () => {
    // Same shape as the authorisation fixtures elsewhere on this branch: the
    // row that must NOT move belongs to somebody else, and the assertion is
    // about that row.
    await withBookings(async (track) => {
      const theirs = await createDraft({ customerId: otherCustomerId, startsAt: NINE_AM });
      track(theirs.id);

      const mine = await createDraft({ customerId, startsAt: TEN_AM });
      track(mine.id);

      const [row] = await db
        .select({ status: booking.status })
        .from(booking)
        .where(eq(booking.id, theirs.id));
      expect(row?.status).toBe("DRAFT");
    });
  });
});
