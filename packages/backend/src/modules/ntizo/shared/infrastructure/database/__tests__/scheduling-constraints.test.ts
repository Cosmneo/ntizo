/**
 * These assert against the real dev database rather than mocking Drizzle,
 * because a `CHECK` nobody exercises is a `CHECK` that might not be there —
 * the schema file can say whatever it likes while the live table quietly
 * lacks the constraint (a wrong migration, a constraint dropped by hand, a
 * generator that silently skipped it). Only inserting the row Postgres must
 * refuse actually proves the constraint is on the table.
 *
 * Connects the same way the seed scripts under `packages/backend/scripts`
 * do: `postgres` + `drizzle-orm/postgres-js` against `DEV_DB_URL`, which Bun
 * loads automatically from `packages/backend/.env`.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { category } from "../catalog/schemas/category.schema";
import { service } from "../catalog/schemas/service.schema";
import { provider } from "../provider/schemas/provider.schema";
import { providerMember } from "../provider/schemas/provider-member.schema";
import { user } from "../user/schemas/user.schema";
import { dateException } from "../scheduling/schemas/date-exception.schema";
import { houseClosure } from "../scheduling/schemas/house-closure.schema";
import { memberAvailability } from "../scheduling/schemas/member-availability.schema";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql);

const suffix = crypto.randomUUID();
let userId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;

beforeAll(async () => {
  userId = crypto.randomUUID();
  await db.insert(user).values({ id: userId, email: `scheduling-${suffix}@example.com` });

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId: userId,
      type: "individual",
      name: "Scheduling Constraint Test Provider",
      slug: `scheduling-constraint-test-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerId = providerRow!.id;

  const [memberRow] = await db
    .insert(providerMember)
    .values({ providerId, userId, role: "owner" })
    .returning({ id: providerMember.id });
  memberId = memberRow!.id;

  const [categoryRow] = await db
    .insert(category)
    .values({ code: `scheduling-constraint-test-${suffix}` })
    .returning({ id: category.id });
  categoryId = categoryRow!.id;

  const [serviceRow] = await db
    .insert(service)
    .values({
      providerId,
      categoryId,
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
    })
    .returning({ id: service.id });
  serviceId = serviceRow!.id;
});

afterAll(async () => {
  // Children first: FKs cascade on delete, but being explicit keeps this
  // readable as an ordered teardown rather than relying on cascade silently.
  await bestEffortCleanup([
    () => db.delete(memberAvailability).where(eq(memberAvailability.providerId, providerId)),
    () => db.delete(dateException).where(eq(dateException.providerId, providerId)),
    () => db.delete(houseClosure).where(eq(houseClosure.providerId, providerId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(user).where(eq(user.id, userId)),
    () => sql.end({ timeout: 5 }),
  ]);
});

async function insertWeekly(overrides: {
  weekday: number;
  startMinute: number;
  endMinute: number;
}) {
  const rows = await db
    .insert(memberAvailability)
    .values({ providerId, memberId, ...overrides })
    .returning({ id: memberAvailability.id });
  return rows[0];
}

// Drizzle's query builders are lazy thenables, not native `Promise`s — they
// only run once `.then`/`await` touches them. `expect(...).rejects` needs a
// real `Promise`, which wrapping in an `async` function guarantees: awaiting
// a thenable inside one always produces a genuine `Promise` on the outside.
async function insertException(overrides: {
  kind: string;
  startMinute: number | null;
  endMinute: number | null;
}) {
  return await db
    .insert(dateException)
    .values({ providerId, memberId, onDate: "2026-12-25", ...overrides })
    .returning({ id: dateException.id });
}

async function insertClosure(overrides: { fromDate: string; toDate: string }) {
  return await db.insert(houseClosure).values({ providerId, ...overrides }).returning({
    id: houseClosure.id,
  });
}

describe("scheduling CHECK constraints", () => {
  // Each case inserts a row the CHECK must refuse. The assertion is that the
  // insert throws — if the constraint is missing, the insert succeeds and the
  // test fails, which is exactly the failure worth catching.
  test("refuses a weekly rule ending before it starts", async () => {
    await expect(
      insertWeekly({ weekday: 1, startMinute: 600, endMinute: 540 }),
    ).rejects.toThrow();
  });

  test("refuses a weekly rule past midnight", async () => {
    await expect(
      insertWeekly({ weekday: 1, startMinute: 600, endMinute: 1500 }),
    ).rejects.toThrow();
  });

  test("refuses weekday 7", async () => {
    await expect(
      insertWeekly({ weekday: 7, startMinute: 600, endMinute: 660 }),
    ).rejects.toThrow();
  });

  test("refuses a closed exception carrying hours", async () => {
    await expect(
      insertException({ kind: "closed", startMinute: 540, endMinute: 600 }),
    ).rejects.toThrow();
  });

  test("refuses a custom exception without hours", async () => {
    await expect(
      insertException({ kind: "custom", startMinute: null, endMinute: null }),
    ).rejects.toThrow();
  });

  test("refuses a closure ending before it starts", async () => {
    await expect(
      insertClosure({ fromDate: "2026-12-26", toDate: "2026-12-24" }),
    ).rejects.toThrow();
  });

  test("accepts a rule ending exactly at midnight", async () => {
    await expect(
      insertWeekly({ weekday: 5, startMinute: 1200, endMinute: 1440 }),
    ).resolves.toBeDefined();
  });
});
