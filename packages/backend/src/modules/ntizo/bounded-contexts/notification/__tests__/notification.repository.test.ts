import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { NotificationType } from "@ntizo/shared";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { notification } from "../../../shared/infrastructure/database/notification/schemas";
import { user } from "../../../shared/infrastructure/database/user/schemas";
import { provider, providerMember } from "../../../shared/infrastructure/database/provider/schemas";
import { Notification } from "../domain/aggregates/notification.aggregate";
import { DrizzleNotificationRepository } from "../infrastructure/repositories/drizzle/notification.repository";
import { DrizzleProviderMemberReader } from "../infrastructure/outbound-adapters/cross-bc/provider-member-reader.adapter";

const url = process.env["DEV_DB_URL"];
if (!url) throw new Error("DEV_DB_URL is not set — see packages/backend/.env");

// `DEV_DB_URL` is a live, serverless (Neon) Postgres instance, not a local
// one — its network latency is real and varies test to test, not just at the
// first connection: a full suite run has been observed to comfortably clear
// most tests in well under a second each while an individual `markAllRead*`
// call occasionally clears 5000ms, bun's default. This raises the default
// for every test in this file rather than chasing whichever one happens to
// spike on a given run; the file's `beforeAll`/`afterAll` set their own
// timeout explicitly for the same reason.
setDefaultTimeout(20_000);

const sql = postgres(url, { max: 1 });
// `{ schema: authSchema }` — not a bare `drizzle(sql)` — because `DrizzleDb`
// (what `__runWithTransactionContextForTests` binds into AsyncLocalStorage)
// is typed against this schema shape; see `catalog-unpublish-sweep.test.ts`
// for the same requirement and reasoning.
const db = drizzle(sql, { schema: authSchema });
const repo = new DrizzleNotificationRepository();
const memberReader = new DrizzleProviderMemberReader();

const suffix = crypto.randomUUID();
let aliceId: string;
let bobId: string;
let carolId: string;
let daveId: string;
// A two-member workspace, built the same way notification-constraints.test.ts
// and scheduling-constraints.test.ts build theirs: carol owns it, dave is a
// second member. Bob is deliberately left off it — he is this suite's
// non-member for every workspace-inbox assertion below, reusing the same bob
// created for the personal-inbox tests rather than a fifth throwaway user.
let providerId: string;

// bun:test's default hook timeout is 5000ms. A cold `DEV_DB_URL` connection
// (Neon suspends its compute when idle) can take several seconds just to
// answer the first query — measured directly at ~8.4s for the very first
// insert below on a cold start, independent of how many rows that insert
// carries. Both hooks talk to a real database for a reason (see the class
// docstring on `DrizzleNotificationRepository` and every other real-DB test
// in this codebase), so the fix is a longer timeout, not fewer round trips.
beforeAll(async () => {
  aliceId = crypto.randomUUID();
  bobId = crypto.randomUUID();
  carolId = crypto.randomUUID();
  daveId = crypto.randomUUID();
  await db.insert(user).values([
    { id: aliceId, email: `alice-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: bobId, email: `bob-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: carolId, email: `carol-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: daveId, email: `dave-${suffix}@ntizo.test`, role: "customer", status: "active" },
  ]);

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId: carolId,
      type: "organization",
      name: "Notification Repository Test Workspace",
      slug: `notification-repo-test-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  providerId = providerRow!.id;

  await db.insert(providerMember).values([
    { providerId, userId: carolId, role: "owner" },
    { providerId, userId: daveId, role: "staff" },
  ]);
}, 20_000);

afterAll(async () => {
  // `__runWithTransactionContextForTests` only binds AsyncLocalStorage — it
  // does not open a transaction, so every `repo.*` call above already
  // committed. This cleanup is doing real work, not undoing an uncommitted
  // one. Children first, same ordering discipline as
  // scheduling-constraints.test.ts and notification-constraints.test.ts: some
  // of these FKs cascade and some don't (`provider_member.user_id` and
  // `provider.owner_user_id` have no `onDelete`, so deleting a user first
  // would fail on the constraint), and being explicit keeps teardown correct
  // regardless of which is which.
  await db.delete(notification).where(eq(notification.userId, aliceId));
  await db.delete(notification).where(eq(notification.userId, bobId));
  await db.delete(notification).where(eq(notification.providerId, providerId));
  await db.delete(providerMember).where(eq(providerMember.providerId, providerId));
  await db.delete(provider).where(eq(provider.id, providerId));
  await db.delete(user).where(eq(user.id, aliceId));
  await db.delete(user).where(eq(user.id, bobId));
  await db.delete(user).where(eq(user.id, carolId));
  await db.delete(user).where(eq(user.id, daveId));
  await sql.end();
}, 20_000);

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

  test("markAllReadForUser marks every currently-unread item for that user", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      // By this point alice has one read and one unread item left over from
      // the tests above; captured rather than assumed, so this does not
      // silently start asserting the wrong thing if an earlier test changes.
      const before = await repo.countUnreadForUser(aliceId);
      const inserted = await repo.markAllReadForUser(aliceId);
      expect(inserted).toBe(before);
      expect(await repo.countUnreadForUser(aliceId)).toBe(0);
    });
  });
});

/**
 * A workspace inbox is read through membership, not personal ownership — the
 * one place this file's security actually lives, since `save`/`list`/`count`
 * carry no access check of their own (see `provider-member-reader.port.ts`:
 * "everything else about a member is the Provider context's business" — the
 * gate on *who may call `listForProvider` at all* is a future use case's job,
 * built on `DrizzleProviderMemberReader`, not this repository's). What this
 * repository itself must get right is narrower and is what these tests cover:
 * read state resolves per member, not per workspace, and `markRead` /
 * `markAllReadForProvider` refuse to write on behalf of somebody who isn't a
 * member — the `EXISTS ... provider_member` branch in both.
 */
describe("a workspace inbox", () => {
  test("a member sees the workspace inbox, newest first, unread", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      await repo.save(
        Notification.forProvider({
          type: NotificationType.ProviderVerified,
          providerId,
          payload: { n: 1 },
        }),
      );
      await repo.save(
        Notification.forProvider({
          type: NotificationType.ProviderVerified,
          providerId,
          payload: { n: 2 },
        }),
      );

      const page = await repo.listForProvider(providerId, carolId, 10, 0);
      expect(page.total).toBe(2);
      expect(page.items).toHaveLength(2);
      expect(page.items.every((i) => i.read === false)).toBe(true);
      // Newest first: the second one saved leads.
      expect((page.items[0]!.payload as { n: number }).n).toBe(2);
    });
  });

  test("countUnreadForProvider counts for the reader asking", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      expect(await repo.countUnreadForProvider(providerId, carolId)).toBe(2);
      // Dave has read nothing yet either — same workspace, same count, before
      // the next test makes his view diverge from carol's.
      expect(await repo.countUnreadForProvider(providerId, daveId)).toBe(2);
    });
  });

  test("a member marks a workspace item read through membership, not personal ownership — the EXISTS branch, positive case", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const page = await repo.listForProvider(providerId, daveId, 10, 0);
      const ok = await repo.markRead(page.items[0]!.id, daveId);
      expect(ok).toBe(true);

      // Per-reader: dave's own count drops, carol's does not — read state is
      // not a shared column on the notification, it is dave's alone.
      expect(await repo.countUnreadForProvider(providerId, daveId)).toBe(1);
      expect(await repo.countUnreadForProvider(providerId, carolId)).toBe(2);
    });
  });

  test("a non-member cannot mark a workspace item read — the EXISTS branch, negative case", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const page = await repo.listForProvider(providerId, carolId, 10, 0);
      const stillUnread = page.items.find((i) => !i.read)!;
      const ok = await repo.markRead(stillUnread.id, bobId);
      expect(ok).toBe(false);
      // Refused, not silently accepted: nobody's count moved.
      expect(await repo.countUnreadForProvider(providerId, carolId)).toBe(2);
      expect(await repo.countUnreadForProvider(providerId, daveId)).toBe(1);
    });
  });

  test("markAllReadForProvider marks only the caller — a second member's unread count is unchanged", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const daveUnreadBefore = await repo.countUnreadForProvider(providerId, daveId);
      const carolUnreadBefore = await repo.countUnreadForProvider(providerId, carolId);

      const inserted = await repo.markAllReadForProvider(providerId, carolId);
      expect(inserted).toBe(carolUnreadBefore);
      expect(await repo.countUnreadForProvider(providerId, carolId)).toBe(0);

      // One member catching up must not blank a colleague's badge.
      expect(await repo.countUnreadForProvider(providerId, daveId)).toBe(daveUnreadBefore);
    });
  });

  test("a non-member's markAllReadForProvider inserts nothing", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const inserted = await repo.markAllReadForProvider(providerId, bobId);
      expect(inserted).toBe(0);
    });
  });

  test("DrizzleProviderMemberReader reports membership correctly", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      expect(await memberReader.isMember(providerId, carolId)).toBe(true);
      expect(await memberReader.isMember(providerId, daveId)).toBe(true);
      expect(await memberReader.isMember(providerId, bobId)).toBe(false);
    });
  });
});
