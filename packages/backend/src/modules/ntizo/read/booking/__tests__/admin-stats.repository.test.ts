/**
 * `DrizzleBookingReadRepository.statsForAdmin` against the real dev database,
 * by the mechanism `provider-bookings.repository.test.ts` beside it uses.
 *
 * **This read is deliberately unscoped**, and a sum cannot be filtered down
 * to this file's rows the way `admin-bookings.repository.test.ts` filters its
 * lists. So every assertion here is a *delta*: the numbers before this file
 * seeds anything, then after, and the difference is what the fixtures are
 * worth. Two worktrees share one `DEV_DB_URL`; a sibling committing a
 * `COMPLETED` booking in the seconds between the two reads would move a
 * delta, and that is the one way this file can fail without being wrong.
 *
 * The fixture is one workspace with two bookings: one that actually happened
 * (80 000 at 1 000 bps — a commission of 8 000, three distinct numbers so a
 * query summing the wrong column is recognisable), completed two days ago,
 * and one that was paid and then disputed, priced 55 000 so a gross that
 * counted a disputed booking would be off by a number nothing else is.
 * Both are submitted through the aggregate and carry the
 * `submitted_by_customer` change row, so both are requests in the chart.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { category, service, serviceOption } from "../../../shared/infrastructure/database/catalog/schemas";
import { provider, providerMember } from "../../../shared/infrastructure/database/provider/schemas";
import { profile, user } from "../../../shared/infrastructure/database/user/schemas";
import { booking } from "../../../shared/infrastructure/database/booking/schemas";
import { BookingStatus } from "../../../shared/infrastructure/database/booking/enums";
import { Booking } from "../../../bounded-contexts/booking/domain/aggregates/booking.aggregate";
import { DrizzleBookingRepository } from "../../../bounded-contexts/booking/infrastructure/repositories/drizzle/booking.repository";
import { DrizzleBookingReadRepository } from "../infra/repositories/drizzle/booking-read.repository";
import type { AdminStats } from "../app/ports/outbound/booking-read.repository.port";
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

let customerId: string;
let ownerUserId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let serviceOptionId: string;
let before: AdminStats;

beforeAll(async () => {
  before = await __runWithTransactionContextForTests(db, () => readRepo.statsForAdmin(now));

  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    { id: customerId, email: `admin-stats-customer-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: ownerUserId, email: `admin-stats-owner-${suffix}@ntizo.test`, role: "customer", status: "active" },
  ]);
  await db.insert(profile).values([
    { userId: customerId, firstName: "Ana", lastName: "Machava", phoneNumber: "+258840000002" },
    { userId: ownerUserId, firstName: "Beatriz", lastName: "Cossa" },
  ]);

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Admin Stats Test Provider",
      slug: `admin-stats-test-${suffix}`,
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
    .values({ code: `admin-stats-test-${suffix}` })
    .returning({ id: category.id });
  categoryId = categoryRow!.id;

  const [serviceRow] = await db
    .insert(service)
    .values({ providerId, categoryId, sourceLocale: "pt-MZ", locationType: "at_customer", status: "published" })
    .returning({ id: service.id });
  serviceId = serviceRow!.id;

  const [optionRow] = await db
    .insert(serviceOption)
    .values({ serviceId, pricingMode: "fixed", amountMinor: 80_000, durationMinutes: 60 })
    .returning({ id: serviceOption.id });
  serviceOptionId = optionRow!.id;

  await __runWithTransactionContextForTests(db, async () => {
    // Happened: booked four days ago, worked three, completed two.
    const submittedDone = (
      await writeRepo.insert(
        Booking.create(bookingInput({ priceMinor: 80_000, startsAt: daysAgo(3), expiresAt: daysAgo(4) })),
        1,
      )
    ).submit(daysAgo(4), daysAgo(3.9), address(), null);
    await commit(submittedDone, BookingStatus.Draft);
    await recordSubmission(submittedDone.id as string);
    const acceptedDone = submittedDone.accept(daysAgo(4), daysAgo(3.8));
    await commit(acceptedDone, BookingStatus.AwaitingProvider);
    const paidDone = acceptedDone.markPaid(`mpesa-done-${suffix}`, daysAgo(4));
    await commit(paidDone, BookingStatus.PendingPayment);
    // Written, not transitioned — the same single hop the provider file writes.
    await db
      .update(booking)
      .set({ status: BookingStatus.Completed, completedAt: daysAgo(2) })
      .where(eq(booking.id, paidDone.id as string));

    // Paid yesterday, disputed today. Counts as confirmed in the window and
    // as a dispute; must not count as gross.
    const submittedDisputed = (
      await writeRepo.insert(
        Booking.create(bookingInput({ priceMinor: 55_000, startsAt: daysAgo(1), expiresAt: daysAgo(1.5) })),
        1,
      )
    ).submit(daysAgo(1.5), daysAgo(1.4), address(), null);
    await commit(submittedDisputed, BookingStatus.Draft);
    await recordSubmission(submittedDisputed.id as string);
    const acceptedDisputed = submittedDisputed.accept(daysAgo(1.5), daysAgo(1.3));
    await commit(acceptedDisputed, BookingStatus.AwaitingProvider);
    const paidDisputed = acceptedDisputed.markPaid(`mpesa-disputed-${suffix}`, daysAgo(1));
    await commit(paidDisputed, BookingStatus.PendingPayment);
    await db
      .update(booking)
      .set({ status: BookingStatus.Disputed, disputedAt: now })
      .where(eq(booking.id, paidDisputed.id as string));
  });
});

afterAll(async () => {
  await bestEffortCleanup([
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
    priceMinor: 80_000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName: "Depilação",
    providerName: "Admin Stats Test Provider",
    providerSlug: `admin-stats-test-${suffix}`,
    optionName: "Standard",
    description: null,
    expiresAt: new Date("2027-02-28T09:30:00.000Z"),
    ...overrides,
  };
}

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

function address() {
  return {
    label: "Casa",
    line: "Av. Julius Nyerere 123",
    city: "Maputo",
    district: "Sommerschield",
    directions: "Portão azul",
    lat: -25.9655,
    lng: 32.5832,
  };
}

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
  if (!written) throw new Error(`fixture: save of ${entity.id} expecting ${expected} matched no row`);
}

describe("DrizzleBookingReadRepository.statsForAdmin", () => {
  test("counts the platform, and its money is the stored gross and the stored commission", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const after = await readRepo.statsForAdmin(now);
      expect(after.totals.disputed - before.totals.disputed).toBe(1);
      expect(after.totals.confirmedLast30 - before.totals.confirmedLast30).toBe(2);
      expect(after.totals.completedLast30 - before.totals.completedLast30).toBe(1);
      expect(after.totals.grossLast30Minor - before.totals.grossLast30Minor).toBe(80_000);
      expect(after.totals.commissionLast30Minor - before.totals.commissionLast30Minor).toBe(8_000);
      expect(after.totals.newProvidersLast30 - before.totals.newProvidersLast30).toBe(1);
      expect(after.totals.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(after.totals.currency).toBe("MZN");
    });
  });

  test("the chart's confirmed series and the confirmed count are one number", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const after = await readRepo.statsForAdmin(now);
      const confirmed = after.perDay.reduce((n, d) => n + d.confirmed, 0);
      const requests = after.perDay.reduce((n, d) => n + d.requests, 0);
      const requestsBefore = before.perDay.reduce((n, d) => n + d.requests, 0);
      expect(confirmed).toBe(after.totals.confirmedLast30);
      expect(requests - requestsBefore).toBe(2);
      // Sparse and sorted: the projection fills the gaps, the repository does not.
      expect(after.perDay.map((d) => d.date)).toEqual([...after.perDay.map((d) => d.date)].sort());
    });
  });
});
