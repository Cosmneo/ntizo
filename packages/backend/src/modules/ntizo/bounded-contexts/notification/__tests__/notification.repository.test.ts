import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { NotificationType } from "@ntizo/shared";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { notification } from "../../../shared/infrastructure/database/notification/schemas";
import { user } from "../../../shared/infrastructure/database/user/schemas";
import { Notification } from "../domain/aggregates/notification.aggregate";
import { DrizzleNotificationRepository } from "../infrastructure/repositories/drizzle/notification.repository";

const url = process.env["DEV_DB_URL"];
if (!url) throw new Error("DEV_DB_URL is not set — see packages/backend/.env");

const sql = postgres(url, { max: 1 });
// `{ schema: authSchema }` — not a bare `drizzle(sql)` — because `DrizzleDb`
// (what `__runWithTransactionContextForTests` binds into AsyncLocalStorage)
// is typed against this schema shape; see `catalog-unpublish-sweep.test.ts`
// for the same requirement and reasoning.
const db = drizzle(sql, { schema: authSchema });
const repo = new DrizzleNotificationRepository();

const suffix = crypto.randomUUID();
let aliceId: string;
let bobId: string;

beforeAll(async () => {
  aliceId = crypto.randomUUID();
  bobId = crypto.randomUUID();
  await db.insert(user).values([
    { id: aliceId, email: `alice-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: bobId, email: `bob-${suffix}@ntizo.test`, role: "customer", status: "active" },
  ]);
});

afterAll(async () => {
  // `__runWithTransactionContextForTests` only binds AsyncLocalStorage — it
  // does not open a transaction, so every `repo.*` call above already
  // committed. This cleanup is doing real work, not undoing an uncommitted
  // one, and children (the notifications alice's tests wrote) go first
  // since they FK-reference the users deleted below.
  await db.delete(notification).where(eq(notification.userId, aliceId));
  await db.delete(notification).where(eq(notification.userId, bobId));
  await db.delete(user).where(eq(user.id, aliceId));
  await db.delete(user).where(eq(user.id, bobId));
  await sql.end();
});

/**
 * `DrizzleNotificationRepository` reaches the database through `getDb()`,
 * which resolves via the app's request-scoped context that `configMiddleware`
 * binds — and a test has no request. `__runWithTransactionContextForTests`
 * binds this test's own real, `DEV_DB_URL`-backed Drizzle client into the same
 * AsyncLocalStorage `getDb()` reads from, for the duration of one test body.
 * Same mechanism, same reason, as `catalog-unpublish-sweep.test.ts` — that
 * file's `DrizzleServiceRepository` is `getDb()`-based too. Without this a
 * repository call throws "[infra-store] not initialized" before it ever
 * reaches Postgres. Do not remove it to "simplify" the test.
 */
describe("a personal inbox", () => {
  test("returns what was saved, newest first, unread", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      await repo.save(
        Notification.forUser({ type: NotificationType.Welcome, userId: aliceId, payload: { n: 1 } }),
      );
      await repo.save(
        Notification.forUser({ type: NotificationType.Welcome, userId: aliceId, payload: { n: 2 } }),
      );

      const page = await repo.listForUser(aliceId, 10, 0);
      expect(page.total).toBe(2);
      expect(page.items).toHaveLength(2);
      expect(page.items.every((i) => i.read === false)).toBe(true);
      // Newest first: the second one saved leads.
      expect((page.items[0]!.payload as { n: number }).n).toBe(2);
    });
  });

  test("total is how many matched, not how many fit on the page", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const page = await repo.listForUser(aliceId, 1, 0);
      expect(page.items).toHaveLength(1);
      expect(page.total).toBe(2);
    });
  });

  test("does not leak another person's inbox", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const page = await repo.listForUser(bobId, 10, 0);
      expect(page.total).toBe(0);
    });
  });

  test("marking one read moves it out of the unread count", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const before = await repo.countUnreadForUser(aliceId);
      const page = await repo.listForUser(aliceId, 10, 0);
      const ok = await repo.markRead(page.items[0]!.id, aliceId);
      expect(ok).toBe(true);
      expect(await repo.countUnreadForUser(aliceId)).toBe(before - 1);
    });
  });

  test("marking twice is idempotent, not an error", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const page = await repo.listForUser(aliceId, 10, 0);
      const id = page.items[0]!.id;
      await repo.markRead(id, aliceId);
      expect(await repo.markRead(id, aliceId)).toBe(true);
    });
  });

  test("refuses to mark somebody else's item and says so", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const page = await repo.listForUser(aliceId, 10, 0);
      expect(await repo.markRead(page.items[0]!.id, bobId)).toBe(false);
    });
  });

  test("a missing id reports nothing rather than confirming", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      expect(await repo.markRead(crypto.randomUUID(), aliceId)).toBe(false);
    });
  });
});
