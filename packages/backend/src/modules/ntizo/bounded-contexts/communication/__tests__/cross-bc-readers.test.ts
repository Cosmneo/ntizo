/**
 * `DrizzleBookingReader` and `DrizzleAdminUserReader` against the real dev
 * database — the same reason and mechanism as `support-request.repository.test.ts`:
 * both adapters reach the database through `getDb()`, which resolves through
 * the app's request-scoped AsyncLocalStorage context, and a test has no
 * request. `__runWithTransactionContextForTests` binds this file's own real,
 * `DEV_DB_URL`-backed Drizzle client into that context for the duration of
 * one call.
 *
 * The booking fixture (category, service, service option, provider member,
 * then the booking itself) mirrors `list-my-bookings.projection.test.ts`'s
 * `beforeAll` — that file is the reference for the exact columns a booking
 * insert needs today.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { user } from "../../../shared/infrastructure/database/user/schemas";
import { provider, providerMember } from "../../../shared/infrastructure/database/provider/schemas";
import { category, service, serviceOption } from "../../../shared/infrastructure/database/catalog/schemas";
import { booking } from "../../../shared/infrastructure/database/booking/schemas";
import { Booking } from "../../booking/domain/aggregates/booking.aggregate";
import { DrizzleBookingRepository } from "../../booking/infrastructure/repositories/drizzle/booking.repository";
import { DrizzleBookingReader } from "../infrastructure/outbound-adapters/cross-bc/booking-reader.adapter";
import { DrizzleAdminUserReader } from "../infrastructure/outbound-adapters/cross-bc/admin-user-reader.adapter";

const url = process.env["DEV_DB_URL"];
if (!url) throw new Error("DEV_DB_URL is not set — see packages/backend/.env");

// A live, serverless (Neon) instance, not a local one — see
// repositories.test.ts for why the default 5000ms is raised here.
setDefaultTimeout(20_000);

const sql = postgres(url, { max: 1 });
// `{ schema: authSchema }`, not a bare `drizzle(sql)`: `DrizzleDb` (what
// `__runWithTransactionContextForTests` binds into AsyncLocalStorage) is
// typed against this schema shape. Same requirement as `repositories.test.ts`.
const db = drizzle(sql, { schema: authSchema });

const run = <T>(fn: () => Promise<T>) => __runWithTransactionContextForTests(db, fn);

const bookingWriteRepo = new DrizzleBookingRepository();
const bookings = new DrizzleBookingReader();
const admins = new DrizzleAdminUserReader();

const suffix = crypto.randomUUID();
const userIds: string[] = [];

function newUser(): string {
  const id = crypto.randomUUID();
  userIds.push(id);
  return id;
}

async function makeProvider(ownerUserId: string, label: string): Promise<string> {
  const [row] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: `Cross BC Readers Test ${label}`,
      slug: `cross-bc-readers-test-${label}-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  return row!.id;
}

let customerId: string;
let memberId: string;
// Never inserted as a user row on purpose: `isOwnedBy` compares plain
// strings against `booking.customerId`, and a caller who was never a real
// user still cannot own a booking. Proves the negative case needs no
// fixture beyond the id itself.
const strangerId = crypto.randomUUID();
let adminId: string;
let suspendedAdminId: string;
let providerId: string;
let otherProviderId: string;
let categoryId: string;
let serviceId: string;
let serviceOptionId: string;
let bookingId: string;

beforeAll(async () => {
  customerId = newUser();
  memberId = newUser();
  adminId = newUser();
  suspendedAdminId = newUser();
  await db.insert(user).values([
    { id: customerId, email: `cbr-c-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: memberId, email: `cbr-m-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: adminId, email: `cbr-a-${suffix}@ntizo.test`, role: "admin", status: "active" },
    { id: suspendedAdminId, email: `cbr-sa-${suffix}@ntizo.test`, role: "admin", status: "suspended" },
  ]);

  providerId = await makeProvider(memberId, "provider");
  await db.insert(providerMember).values({ providerId, userId: memberId, role: "owner" });
  otherProviderId = await makeProvider(memberId, "other");

  const [categoryRow] = await db
    .insert(category)
    .values({ code: `cross-bc-readers-test-${suffix}` })
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

  const [memberRow] = await db
    .select({ id: providerMember.id })
    .from(providerMember)
    .where(eq(providerMember.providerId, providerId));
  const providerMemberId = memberRow!.id;

  bookingId = await run(async () => {
    const created = await bookingWriteRepo.insert(
      Booking.create({
        customerId,
        providerId,
        serviceId,
        serviceOptionId,
        providerMemberId,
        startsAt: new Date("2026-12-05T09:00:00.000Z"),
        durationMinutes: 60,
        priceMinor: 100_000,
        commissionBps: 1000,
        currency: "MZN",
        serviceName: "Corte de Cabelo",
        providerName: "Cross BC Readers Test provider",
        providerSlug: `cross-bc-readers-test-provider-${suffix}`,
        optionName: "Standard",
        expiresAt: new Date("2026-12-05T09:30:00.000Z"),
      }),
      1,
    );
    return created.id as string;
  });
}, 20_000);

afterAll(async () => {
  // Children before parents: booking → member → provider → users.
  await db.delete(booking).where(eq(booking.id, bookingId));
  await db.delete(serviceOption).where(eq(serviceOption.id, serviceOptionId));
  await db.delete(service).where(eq(service.id, serviceId));
  await db.delete(category).where(eq(category.id, categoryId));
  await db.delete(providerMember).where(eq(providerMember.providerId, providerId));
  await db.delete(provider).where(inArray(provider.id, [providerId, otherProviderId]));
  await db.delete(user).where(inArray(user.id, userIds));
  await sql.end();
}, 20_000);

describe("BookingReader.isOwnedBy", () => {
  test("the booking's customer owns it personally; its provider owns it as a provider; nobody else", async () => {
    expect(await run(() => bookings.isOwnedBy(bookingId, { userId: customerId, providerId: null }))).toBe(true);
    expect(await run(() => bookings.isOwnedBy(bookingId, { userId: memberId, providerId }))).toBe(true);
    expect(await run(() => bookings.isOwnedBy(bookingId, { userId: strangerId, providerId: null }))).toBe(false);
    expect(await run(() => bookings.isOwnedBy(bookingId, { userId: memberId, providerId: otherProviderId }))).toBe(false);
    expect(await run(() => bookings.isOwnedBy(crypto.randomUUID(), { userId: customerId, providerId: null }))).toBe(false);
  });
});

describe("AdminUserReader.findAdminUserIds", () => {
  test("returns active admins and nobody else", async () => {
    const ids = await run(() => admins.findAdminUserIds());
    expect(ids).toContain(adminId);
    expect(ids).not.toContain(customerId);
    expect(ids).not.toContain(suspendedAdminId);
  });
});
