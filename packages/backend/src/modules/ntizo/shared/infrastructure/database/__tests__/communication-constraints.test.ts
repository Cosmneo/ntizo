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
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, inArray, sql as sqlExpr } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { thread } from "../communication/schemas/thread.schema";
import type { NewThreadRow } from "../communication/schemas/thread.schema";
import { message } from "../communication/schemas/message.schema";
import { supportRequest } from "../communication/schemas/support-request.schema";
import { user } from "../user/schemas/user.schema";
import { provider } from "../provider/schemas/provider.schema";
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
// Support threads carry `providerId: null`, so they fall outside the
// provider-id subquery cleanup below — tracked here instead and deleted by
// id in `afterAll`, before that subquery runs.
const createdThreadIds: string[] = [];

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
  // inserted but never got to track. `bestEffortCleanup` covers the other
  // half of that: `providerId`/`userId` themselves unassigned because
  // `beforeAll` didn't get that far.
  await bestEffortCleanup([
    // Support threads (`providerId: null`), tracked by id since the
    // provider-id subquery below can't see them. Cascades to their
    // `message` and `support_request` rows.
    () =>
      createdThreadIds.length > 0
        ? db.delete(thread).where(inArray(thread.id, createdThreadIds))
        : Promise.resolve(),
    () =>
      db.delete(message).where(
        sqlExpr`${message.threadId} IN (SELECT ${thread.id} FROM ${thread} WHERE ${thread.providerId} = ${providerId})`,
      ),
    () => db.delete(thread).where(eq(thread.providerId, providerId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(user).where(eq(user.id, userId)),
    () => sql.end({ timeout: 5 }),
  ]);
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
      .values({ threadId: threadRow!.id, senderUserId: userId, senderSide: "customer", body: "hello" })
      .returning({ id: message.id });
    expect(messageRow?.id).toBeString();

    await db.delete(thread).where(eq(thread.id, threadRow!.id));

    const remaining = await db.select().from(message).where(eq(message.id, messageRow!.id));
    expect(remaining).toHaveLength(0);
  });

  test("an inquiry without a provider is refused; a support thread without one is not", async () => {
    await expect(async () => {
      await db.insert(thread).values({
        type: "inquiry",
        customerUserId: userId,
        providerId: null,
        lastMessageAt: new Date(),
      });
    }).toThrow();

    const [row] = await db
      .insert(thread)
      .values({ type: "support", customerUserId: userId, providerId: null, lastMessageAt: new Date() })
      .returning({ id: thread.id });
    createdThreadIds.push(row!.id);
    expect(row?.id).toBeDefined();
  });

  test("a message must say which side it came from, and only a known one", async () => {
    const [t] = await db
      .insert(thread)
      .values({ type: "support", customerUserId: userId, providerId: null, lastMessageAt: new Date() })
      .returning({ id: thread.id });
    createdThreadIds.push(t!.id);

    await expect(async () => {
      await db.insert(message).values({
        threadId: t!.id,
        senderUserId: userId,
        senderSide: "somebody",
        body: "x",
      });
    }).toThrow();
  });

  test("a support request cannot say open and carry a resolved_at", async () => {
    const [t] = await db
      .insert(thread)
      .values({ type: "support", customerUserId: userId, providerId: null, lastMessageAt: new Date() })
      .returning({ id: thread.id });
    createdThreadIds.push(t!.id);

    await expect(async () => {
      await db.insert(supportRequest).values({
        threadId: t!.id,
        audience: "customer",
        subject: "x",
        status: "open",
        resolvedAt: new Date(),
      });
    }).toThrow();
  });
});
