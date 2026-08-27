/**
 * These assert against the real dev database rather than mocking Drizzle,
 * because a partial index nobody exercises is an index that might not be
 * there — the schema file can say whatever it likes while the live table
 * quietly lacks it (a wrong migration, an index dropped by hand, a generator
 * that silently skipped it). Only inserting the row Postgres must refuse, and
 * reading the index definition back from `pg_indexes`, actually proves the
 * constraint is on the table.
 *
 * Connects the same way notification-constraints.test.ts and
 * scheduling-constraints.test.ts do: `postgres` + `drizzle-orm/postgres-js`
 * against `DEV_DB_URL`, which Bun loads automatically from
 * `packages/backend/.env`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql as sqlExpr } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { thread } from "../communication/schemas/thread.schema";
import type { NewThreadRow } from "../communication/schemas/thread.schema";
import { message } from "../communication/schemas/message.schema";
import { user } from "../user/schemas/user.schema";
import { provider } from "../provider/schemas/provider.schema";

const url = process.env["DEV_DB_URL"];
if (!url) {
  throw new Error(
    "DEV_DB_URL is not set. These tests assert against the real dev database " +
      "— set it (see packages/backend/.env) and try again.",
  );
}

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

const suffix = crypto.randomUUID();
let userId: string;
let providerId: string;

beforeAll(async () => {
  userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId,
    email: `comm-${suffix}@ntizo.test`,
    role: "customer",
    status: "active",
  });

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId: userId,
      type: "individual",
      name: "Communication Constraint Test Provider",
      slug: `communication-constraint-test-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerId = providerRow!.id;
});

afterAll(async () => {
  // Children first, same ordering discipline as scheduling-constraints.test.ts
  // and notification-constraints.test.ts: messages before threads before the
  // provider before the user. Deletes by FK (a subquery on `providerId`)
  // rather than by a tracked id list, so this still cleans up fully even if
  // an assertion above threw partway through a test, leaving a row this file
  // inserted but never got to track.
  await db.delete(message).where(
    sqlExpr`${message.threadId} IN (SELECT ${thread.id} FROM ${thread} WHERE ${thread.providerId} = ${providerId})`,
  );
  await db.delete(thread).where(eq(thread.providerId, providerId));
  await db.delete(provider).where(eq(provider.id, providerId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end({ timeout: 5 });
});

// postgres.js's tagged-template result is a lazy thenable, not a native
// Promise — `expect(...).rejects` needs a real Promise, which wrapping in an
// async function guarantees: awaiting a thenable inside one always produces a
// genuine Promise on the outside. Same technique as
// notification-constraints.test.ts and scheduling-constraints.test.ts.
async function insertThread(overrides: Partial<NewThreadRow> = {}) {
  return await db
    .insert(thread)
    .values({
      type: "inquiry",
      customerUserId: userId,
      providerId,
      lastMessageAt: new Date(),
      ...overrides,
    })
    .returning({ id: thread.id });
}

describe("ntizo_communication constraints", () => {
  test("one inquiry thread per customer and provider", async () => {
    const [row] = await insertThread();
    expect(row?.id).toBeString();

    // Insert the same (customer, provider) again — expect a unique
    // violation on the partial index, not just any error.
    await expect(insertThread()).rejects.toThrow(/thread_customer_provider_uq/);

    await db.delete(thread).where(eq(thread.id, row!.id));
  });

  test("the notify index exists and is partial", async () => {
    const rows = await sql`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'ntizo_communication' AND indexname = 'idx_message_notify_due'`;
    expect(rows[0]?.["indexdef"]).toContain("WHERE");
  });

  test("a message cascades away with its thread", async () => {
    const [threadRow] = await insertThread();
    const [messageRow] = await db
      .insert(message)
      .values({ threadId: threadRow!.id, senderUserId: userId, body: "hello" })
      .returning({ id: message.id });
    expect(messageRow?.id).toBeString();

    await db.delete(thread).where(eq(thread.id, threadRow!.id));

    const remaining = await db.select().from(message).where(eq(message.id, messageRow!.id));
    expect(remaining).toHaveLength(0);
  });
});
