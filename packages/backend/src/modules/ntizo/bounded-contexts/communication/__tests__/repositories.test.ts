import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { getGraphQLErrorCode } from "@cosmneo/onion-lasagna";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { attachment, message, thread } from "../../../shared/infrastructure/database/communication/schemas";
import { user } from "../../../shared/infrastructure/database/user/schemas";
import { provider, providerMember } from "../../../shared/infrastructure/database/provider/schemas";
import { CursorInvalidError } from "../domain/exceptions";
import { Message } from "../domain/aggregates/message.aggregate";
import { DrizzleThreadRepository } from "../infrastructure/repositories/drizzle/thread.repository";
import { DrizzleMessageRepository } from "../infrastructure/repositories/drizzle/message.repository";
import { DrizzleAttachmentRepository } from "../infrastructure/repositories/drizzle/attachment.repository";

const url = process.env["DEV_DB_URL"];
if (!url) throw new Error("DEV_DB_URL is not set — see packages/backend/.env");

// A live, serverless (Neon) instance, not a local one — see
// notification.repository.test.ts for why the default 5000ms is raised here.
setDefaultTimeout(20_000);

// `max: 2`, not the usual `max: 1` — the openOrFind race test below needs two
// genuinely concurrent physical connections; a single connection pool
// serializes every query through it, which would let a SELECT-then-INSERT
// implementation pass the race test by accident (see that test's comment).
const sql = postgres(url, { max: 2 });
// `{ schema: authSchema }`, not a bare `drizzle(sql)`: `DrizzleDb` (what
// `__runWithTransactionContextForTests` binds into AsyncLocalStorage) is
// typed against this schema shape. Same requirement as every other real-DB
// repository test in this codebase.
const db = drizzle(sql, { schema: authSchema });
const threads = new DrizzleThreadRepository();
const messages = new DrizzleMessageRepository();
const attachments = new DrizzleAttachmentRepository();

const suffix = crypto.randomUUID();

// Everything this file writes, tracked by id so `afterAll` can clean up
// exactly what it created — never a global DELETE, and this still cleans up
// fully even if an assertion above threw partway through a test.
//
// Threads and messages are deliberately NOT tracked by their own ids: every
// thread this file creates is opened under a provider from `makeProvider`,
// which pushes to `providerIds` up front, before any thread or message
// exists under it. Cleanup below matches on that instead. Tracking thread
// ids individually looked reasonable until the openOrFind race test (see
// "two concurrent opens...") proved it wrong — a genuine Postgres
// unique-violation there means one racer's insert can succeed while the
// `const [a, b] = await Promise.all(...)` destructuring that would have
// recorded its id never runs, leaving a row an id-list can't find.
// `providerIds`, captured before the race even starts, has no such gap.
const userIds: string[] = [];
const providerIds: string[] = [];

function newUser(): string {
  const id = crypto.randomUUID();
  userIds.push(id);
  return id;
}

let customerId: string;
let customer2Id: string;
let ownerId: string;
let staffId: string;
let staffId2: string;
// A customer used only by the `listForCustomer` describe below. The port's
// `claimDueForNotice` deliberately has no thread scope (it is a whole-table
// sweep — see the port doc comment), and several other describes in this file
// open threads for `customerId`, so a shared customer would let another
// test's thread leak into "newest two" here. A dedicated customer makes this
// describe's fixture the only thing `listForCustomer(listCustomerId, ...)`
// can possibly see.
let listCustomerId: string;
// A customer used only by the tie-break test below, isolated from
// `listCustomerId`'s fixture for the same reason `listCustomerId` is
// isolated from `customerId`: that test seeds two threads at an IDENTICAL
// `last_message_at`, and sharing a customer with an ordering test that
// asserts a specific top-two would make the two fixtures interfere.
let tieCustomerId: string;
// Never inserted as a user row on purpose: `findVisible` compares plain
// strings, and a caller who guessed a thread id was never necessarily
// registered either. Proves the negative case needs no fixture beyond the id
// itself.
const strangerId = crypto.randomUUID();

async function makeProvider(ownerUserId: string, label: string): Promise<string> {
  const [row] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "organization",
      name: `Communication Repo Test ${label}`,
      slug: `communication-repo-test-${label}-${suffix}`,
      status: "active",
    })
    .returning({ id: provider.id });
  const id = row!.id;
  providerIds.push(id);
  return id;
}

beforeAll(async () => {
  customerId = newUser();
  customer2Id = newUser();
  ownerId = newUser();
  staffId = newUser();
  staffId2 = newUser();
  listCustomerId = newUser();
  tieCustomerId = newUser();

  await db.insert(user).values(
    userIds.map((id) => ({
      id,
      email: `${id}@ntizo.test`,
      role: "customer" as const,
      status: "active" as const,
    })),
  );
}, 20_000);

afterAll(async () => {
  // Children first: messages before threads before provider_member before the
  // provider before the users. Scoped to `providerIds`, tracked from the
  // moment `makeProvider` creates each row, which is before any thread or
  // message exists under it — so this still finds and removes everything
  // even when a test above threw partway through (the openOrFind race test
  // below deliberately forces a genuine Postgres unique-violation, and this
  // must still clean up the row the winning racer inserted).
  await db
    .delete(message)
    .where(
      inArray(
        message.threadId,
        db.select({ id: thread.id }).from(thread).where(inArray(thread.providerId, providerIds)),
      ),
    );
  await db.delete(thread).where(inArray(thread.providerId, providerIds));
  await db.delete(providerMember).where(inArray(providerMember.providerId, providerIds));
  await db.delete(provider).where(inArray(provider.id, providerIds));
  await db.delete(user).where(inArray(user.id, userIds));
  await sql.end();
}, 20_000);

async function readAtOf(messageId: string): Promise<Date | null> {
  const [row] = await db.select({ readAt: message.readAt }).from(message).where(eq(message.id, messageId));
  return row?.readAt ?? null;
}

async function notifiedAtOf(messageId: string): Promise<Date | null> {
  const [row] = await db
    .select({ notifiedAt: message.notifiedAt })
    .from(message)
    .where(eq(message.id, messageId));
  return row?.notifiedAt ?? null;
}

/**
 * `DrizzleThreadRepository` and `DrizzleMessageRepository` reach the database
 * through `getDb()`, which resolves via the app's request-scoped context that
 * `configMiddleware` binds — and a test has no request.
 * `__runWithTransactionContextForTests` binds this test's own real,
 * `DEV_DB_URL`-backed Drizzle client into the same AsyncLocalStorage `getDb()`
 * reads from, for the duration of one test body. Same mechanism as
 * `notification.repository.test.ts` and `activity.repository.test.ts`.
 */
describe("openOrFind", () => {
  test("returns the same thread the second time, and says it did not create it", async () => {
    const providerId = await makeProvider(ownerId, "open-or-find");
    const now = new Date("2026-08-20T10:00:00.000Z");

    await __runWithTransactionContextForTests(db, async () => {
      const first = await threads.openOrFind(customerId, providerId, now);
      const second = await threads.openOrFind(customerId, providerId, now);

      expect(second.id).toBe(first.id);
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
    });
  });

  test("does not move last_message_at on a second call — reopening a conversation is not a message", async () => {
    // Pinned the opposite behaviour until this fix: `StartThreadCommand` is
    // the only caller of `openOrFind`, and a customer reaches it just by
    // opening (or re-opening) a conversation — `provider-hero.tsx`'s
    // "message this provider" button calls `start()` on every click, with
    // no message required. If the conflict branch bumped `last_message_at`,
    // clicking that button five times with nothing typed would carry the
    // thread to the top of both inboxes, above a real conversation, with an
    // empty preview and no unread count. `last_message_at` only moves when a
    // message is actually sent — see `touch()`, called from
    // `SendMessageCommand`.
    const providerId = await makeProvider(ownerId, "open-or-find-touch");
    const first = new Date("2026-08-20T10:00:00.000Z");
    const second = new Date("2026-08-20T10:05:00.000Z");

    await __runWithTransactionContextForTests(db, async () => {
      const opened = await threads.openOrFind(customerId, providerId, first);
      const second_ = await threads.openOrFind(customerId, providerId, second);

      expect(second_.id).toBe(opened.id);
      expect(second_.created).toBe(false);

      const row = await threads.findVisible(opened.id, customerId);
      expect(row?.lastMessageAt.toISOString()).toBe(first.toISOString());
    });
  });

  test("two concurrent opens for the same pair resolve to one thread, not two — the reason this must be an upsert, not a read then a branch", async () => {
    // A purely sequential test (like the one above) cannot tell an upsert
    // apart from SELECT-then-INSERT: run one after the other, both read the
    // row the first call already wrote and behave identically. This is why
    // the pool above is `max: 2` — two real connections let both calls' first
    // statement land before either's second one, which is exactly the window
    // a read-then-branch loses: both SELECTs see nothing, both attempt an
    // INSERT, and the second violates `thread_customer_provider_uq` instead
    // of resolving to the row the first one just created.
    const providerId = await makeProvider(ownerId, "open-or-find-race");
    const now = new Date("2026-08-20T12:00:00.000Z");

    // Warms both pool connections up front. Establishing a *new* physical
    // connection to a serverless (Neon) Postgres costs far more than a query
    // round trip on an already-open one — without this, the second call below
    // can spend so long opening its connection that the first call's SELECT
    // *and* INSERT both finish first, and the race this test exists to force
    // never actually overlaps.
    await Promise.all([sql`select 1`, sql`select 1`]);

    const [a, b] = await __runWithTransactionContextForTests(db, () =>
      Promise.all([
        threads.openOrFind(customerId, providerId, now),
        threads.openOrFind(customerId, providerId, now),
      ]),
    );

    expect(a.id).toBe(b.id);
    // Exactly one of the two racing callers is the one that actually inserted.
    expect([a.created, b.created].sort()).toEqual([false, true]);

    const rows = await db
      .select({ id: thread.id })
      .from(thread)
      .where(and(eq(thread.customerUserId, customerId), eq(thread.providerId, providerId)));
    expect(rows).toHaveLength(1);
  });
});

describe("touch", () => {
  test("sets last_message_at to the given instant", async () => {
    const providerId = await makeProvider(ownerId, "touch");
    const opened = await __runWithTransactionContextForTests(db, () =>
      threads.openOrFind(customerId, providerId, new Date("2026-08-01T00:00:00.000Z")),
    );

    const at = new Date("2026-08-02T12:34:56.000Z");
    await __runWithTransactionContextForTests(db, async () => {
      await threads.touch(opened.id, at);
      const row = await threads.findVisible(opened.id, customerId);
      expect(row?.lastMessageAt.toISOString()).toBe(at.toISOString());
    });
  });
});

describe("findVisible", () => {
  let providerId: string;
  let threadId: string;

  beforeAll(async () => {
    providerId = await makeProvider(ownerId, "visibility");
    // A member row for staff and a second staff, but deliberately none for
    // `ownerId` — proving visibility rides on `provider_member` existing, not
    // on `provider.owner_user_id`, which is what `DrizzleProviderMemberReader`
    // in the notification context also relies on.
    await db.insert(providerMember).values([
      { providerId, userId: staffId, role: "staff" },
      { providerId, userId: staffId2, role: "staff" },
    ]);
    const opened = await __runWithTransactionContextForTests(db, () =>
      threads.openOrFind(customerId, providerId, new Date("2026-08-03T00:00:00.000Z")),
    );
    threadId = opened.id;
  }, 20_000);

  test("the customer on the thread sees it", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const row = await threads.findVisible(threadId, customerId);
      expect(row?.id).toBe(threadId);
    });
  });

  test("a member of the provider sees it — resolved through provider_member, not ownership", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const row = await threads.findVisible(threadId, staffId2);
      expect(row?.id).toBe(threadId);
    });
  });

  test("a stranger sees nothing — the same answer as a thread that does not exist", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      expect(await threads.findVisible(threadId, strangerId)).toBeNull();
      expect(await threads.findVisible(crypto.randomUUID(), customerId)).toBeNull();
    });
  });
});

describe("listForCustomer", () => {
  let newest: { id: string };
  let middle: { id: string };
  let oldest: { id: string };

  beforeAll(async () => {
    const providerNewest = await makeProvider(ownerId, "list-newest");
    const providerMiddle = await makeProvider(ownerId, "list-middle");
    const providerOldest = await makeProvider(ownerId, "list-oldest");

    await __runWithTransactionContextForTests(db, async () => {
      oldest = await threads.openOrFind(listCustomerId, providerOldest, new Date("2026-08-01T00:00:00.000Z"));
      middle = await threads.openOrFind(listCustomerId, providerMiddle, new Date("2026-08-02T00:00:00.000Z"));
      newest = await threads.openOrFind(listCustomerId, providerNewest, new Date("2026-08-03T00:00:00.000Z"));
    });
  }, 20_000);

  test("orders by last message, newest first, and pages past the boundary", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const page = await threads.listForCustomer(listCustomerId, 2, null);
      expect(page.items.map((t) => t.id)).toEqual([newest.id, middle.id]);
      expect(page.nextCursor).not.toBeNull();

      const rest = await threads.listForCustomer(listCustomerId, 2, page.nextCursor);
      expect(rest.items.map((t) => t.id)).toEqual([oldest.id]);
      expect(rest.nextCursor).toBeNull();
    });
  });

  test("a malformed cursor is rejected, not treated as page one", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      await expect(threads.listForCustomer(listCustomerId, 2, "not-a-real-cursor")).rejects.toThrow(
        CursorInvalidError,
      );
    });
  });

  test("CursorInvalidError maps to UNPROCESSABLE, not masked to INTERNAL_ERROR", () => {
    // The `rejects.toThrow(CursorInvalidError)` check above is
    // `instanceof`-based and would stay green even if the class stopped
    // extending `UnprocessableError` — it only proves the right class was
    // thrown, not that the GraphQL kit still recognises it. This is the
    // assertion that actually catches that regression, the same split
    // activity's `cursor-invalid.graphql-code.test.ts` makes for its own
    // `CursorInvalidError`.
    const error = new CursorInvalidError("not-a-real-cursor");
    expect(getGraphQLErrorCode(error)).toBe("UNPROCESSABLE");
  });

  test("does not leak another customer's threads", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const page = await threads.listForCustomer(customer2Id, 10, null);
      expect(page.items.map((t) => t.id)).not.toContain(newest.id);
    });
  });
});

describe("listForCustomer — a shared last_message_at", () => {
  test("two threads at the identical instant are neither skipped nor repeated across the page boundary", async () => {
    // The `|<id>` half of the cursor exists for exactly this: two rows can
    // share a `last_message_at` (two conversations touched by the same
    // event, or simply the same millisecond), and a cursor keyed on time
    // alone would let a page boundary drop one of them or return it twice.
    // The ordering test above never creates this case — its three threads
    // all have distinct timestamps, which is the easy case the id tie-break
    // is not needed for.
    const providerA = await makeProvider(ownerId, "tie-a");
    const providerB = await makeProvider(ownerId, "tie-b");
    const tiedAt = new Date("2026-08-15T00:00:00.000Z");

    const [a, b] = await __runWithTransactionContextForTests(db, async () => [
      await threads.openOrFind(tieCustomerId, providerA, tiedAt),
      await threads.openOrFind(tieCustomerId, providerB, tiedAt),
    ]);

    await __runWithTransactionContextForTests(db, async () => {
      const page1 = await threads.listForCustomer(tieCustomerId, 1, null);
      expect(page1.items).toHaveLength(1);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await threads.listForCustomer(tieCustomerId, 1, page1.nextCursor);
      expect(page2.items).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();

      // The defect a timestamp-only cursor would produce: the second page
      // either repeats the first row or comes back empty. Neither happens
      // here — both ids appear, each exactly once.
      const seen = [page1.items[0]!.id, page2.items[0]!.id];
      expect(seen[0]).not.toBe(seen[1]);
      expect(new Set(seen)).toEqual(new Set([a.id, b.id]));
    });
  });
});

describe("listForProvider", () => {
  test("lists threads on that provider regardless of which customer opened them", async () => {
    const providerId = await makeProvider(ownerId, "list-for-provider");

    await __runWithTransactionContextForTests(db, async () => {
      const a = await threads.openOrFind(customerId, providerId, new Date("2026-08-05T00:00:00.000Z"));
      const b = await threads.openOrFind(customer2Id, providerId, new Date("2026-08-06T00:00:00.000Z"));

      const page = await threads.listForProvider(providerId, 10, null);
      expect(page.items.map((t) => t.id).sort()).toEqual([a.id, b.id].sort());
    });
  });
});

describe("insert and listForThread", () => {
  test("round-trips messages, newest first, and pages past the boundary", async () => {
    const providerId = await makeProvider(ownerId, "list-for-thread");

    const opened = await __runWithTransactionContextForTests(db, () =>
      threads.openOrFind(customerId, providerId, new Date("2026-08-07T00:00:00.000Z")),
    );

    const bodies = ["first", "second", "third"];
    const inserted: string[] = [];
    for (const [i, body] of bodies.entries()) {
      const now = new Date(Date.parse("2026-08-07T00:00:00.000Z") + (i + 1) * 1000);
      await __runWithTransactionContextForTests(db, async () => {
        const id = await messages.insert(
          Message.compose({ threadId: opened.id, senderUserId: customerId, body, now }),
        );
        inserted.push(id);
      });
    }

    await __runWithTransactionContextForTests(db, async () => {
      const page = await messages.listForThread(opened.id, 2, null);
      expect(page.items).toHaveLength(2);
      expect(page.items[0]!.body).toBe("third");
      expect(page.items[1]!.body).toBe("second");
      expect(page.nextCursor).not.toBeNull();

      const rest = await messages.listForThread(opened.id, 2, page.nextCursor);
      expect(rest.items).toHaveLength(1);
      expect(rest.items[0]!.body).toBe("first");
      expect(rest.nextCursor).toBeNull();
    });
  });
});

describe("listForThread — a shared created_at", () => {
  test("two messages at the identical instant are neither skipped nor repeated across the page boundary", async () => {
    // The tie is forced through `Message.compose` + `insert`, the same path
    // production sends through, with one explicit `now` handed to both —
    // NOT a raw multi-row INSERT relying on the column's `defaultNow()`.
    // That was tried first and looked equivalent, but it is not: Postgres's
    // `now()` carries microsecond precision, a JS `Date` cannot represent
    // more than milliseconds, and a cursor built from a `SELECT`-truncated
    // Date no longer compares equal to the full-precision value still sitting
    // in the column — so `eq(message.createdAt, after.createdAt)` on the
    // second page's WHERE clause silently fails and the tied row vanishes
    // instead of appearing. That failure mode cannot happen in production
    // because `insert()` always writes an app-generated `Date` explicitly
    // (see `message.repository.ts`'s `insert`) and a JS `Date` is
    // millisecond-precision on both sides of the round trip by construction
    // — so this test reproduces the *real* tie (two composed messages
    // sharing a millisecond), not an artifact of how the fixture was built.
    const providerId = await makeProvider(ownerId, "tie-thread");
    const opened = await __runWithTransactionContextForTests(db, () =>
      threads.openOrFind(customerId, providerId, new Date("2026-08-16T00:00:00.000Z")),
    );

    const tiedAt = new Date("2026-08-16T00:05:00.000Z");
    const [tiedA, tiedB] = await __runWithTransactionContextForTests(db, async () => [
      await messages.insert(
        Message.compose({ threadId: opened.id, senderUserId: customerId, body: "tied a", now: tiedAt }),
      ),
      await messages.insert(
        Message.compose({ threadId: opened.id, senderUserId: customerId, body: "tied b", now: tiedAt }),
      ),
    ]);

    await __runWithTransactionContextForTests(db, async () => {
      const page1 = await messages.listForThread(opened.id, 1, null);
      expect(page1.items).toHaveLength(1);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await messages.listForThread(opened.id, 1, page1.nextCursor);
      expect(page2.items).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();

      const seen = [page1.items[0]!.id, page2.items[0]!.id];
      expect(seen[0]).not.toBe(seen[1]);
      expect(new Set(seen)).toEqual(new Set([tiedA, tiedB]));
    });
  });
});

describe("markReadForViewer", () => {
  test("marks only the other side's messages", async () => {
    const providerId = await makeProvider(ownerId, "mark-read");
    await db.insert(providerMember).values({ providerId, userId: staffId, role: "staff" });

    const opened = await __runWithTransactionContextForTests(db, () =>
      threads.openOrFind(customerId, providerId, new Date("2026-08-08T00:00:00.000Z")),
    );

    const [customerMessage] = await db
      .insert(message)
      .values({ threadId: opened.id, senderUserId: customerId, body: "hello" })
      .returning({ id: message.id });
    const [providerMessage] = await db
      .insert(message)
      .values({ threadId: opened.id, senderUserId: staffId, body: "hi back" })
      .returning({ id: message.id });

    await __runWithTransactionContextForTests(db, async () => {
      const marked = await messages.markReadForViewer(opened.id, customerId, new Date());
      expect(marked).toBe(1);
    });

    expect(await readAtOf(providerMessage!.id)).not.toBeNull();
    expect(await readAtOf(customerMessage!.id)).toBeNull();
  });

  test("one member reading does not mark a teammate's own sent message as read — proves 'other side' is resolved against the thread, not against the viewer", async () => {
    const providerId = await makeProvider(ownerId, "mark-read-teammates");
    await db.insert(providerMember).values([
      { providerId, userId: staffId, role: "staff" },
      { providerId, userId: staffId2, role: "staff" },
    ]);

    const opened = await __runWithTransactionContextForTests(db, () =>
      threads.openOrFind(customerId, providerId, new Date("2026-08-09T00:00:00.000Z")),
    );

    const [fromStaff1] = await db
      .insert(message)
      .values({ threadId: opened.id, senderUserId: staffId, body: "from staff 1" })
      .returning({ id: message.id });
    const [fromCustomer] = await db
      .insert(message)
      .values({ threadId: opened.id, senderUserId: customerId, body: "from customer" })
      .returning({ id: message.id });

    // staffId2 reads. A wrong implementation comparing `senderUserId !==
    // viewerUserId` would mark BOTH messages read here, because staffId2 did
    // not send either — this fixture exists specifically so that wrong
    // implementation is distinguishable from the right one.
    await __runWithTransactionContextForTests(db, async () => {
      const marked = await messages.markReadForViewer(opened.id, staffId2, new Date());
      expect(marked).toBe(1);
    });

    expect(await readAtOf(fromCustomer!.id)).not.toBeNull();
    expect(await readAtOf(fromStaff1!.id)).toBeNull();
  });
});

describe("claimDueForNotice / markNotified", () => {
  test("takes due, unread, un-notified messages and leaves the rest", async () => {
    const providerId = await makeProvider(ownerId, "claim-due");
    const opened = await __runWithTransactionContextForTests(db, () =>
      threads.openOrFind(customerId, providerId, new Date("2026-08-10T00:00:00.000Z")),
    );

    // Far in the future, not "now" in the fixture's own 2026-08-10 story —
    // `notifyDueAt: past` below lands in the *database*, which the deployed
    // dev worker's real `* * * * *` cron sweeps every minute with its own
    // real wall-clock `now()`. A `past` computed from an actually-past `now`
    // would be due for that real sweep too: unread, un-notified, exactly the
    // shape `claimDueForNotice` claims, which would raise a real
    // notification and attempt a real Resend send to a synthetic
    // `@ntizo.test` address. Year 2999 is far enough out that the real sweep
    // can never reach it while this test's own explicit `now` argument
    // (also 2999) still claims it correctly.
    const now = new Date("2999-08-10T00:10:00.000Z");
    const past = new Date(now.getTime() - 60_000);
    const future = new Date(now.getTime() + 60_000);

    const [dueUnread] = await db
      .insert(message)
      .values({ threadId: opened.id, senderUserId: customerId, body: "due, unread", notifyDueAt: past })
      .returning({ id: message.id });
    await db.insert(message).values({
      threadId: opened.id,
      senderUserId: customerId,
      body: "due, but already read",
      notifyDueAt: past,
      readAt: now,
    });
    await db.insert(message).values({
      threadId: opened.id,
      senderUserId: customerId,
      body: "due, but already notified",
      notifyDueAt: past,
      notifiedAt: now,
    });
    await db.insert(message).values({
      threadId: opened.id,
      senderUserId: customerId,
      body: "not yet due",
      notifyDueAt: future,
    });

    await __runWithTransactionContextForTests(db, async () => {
      // `claimDueForNotice` is a whole-table sweep with no thread scope — see
      // the port doc comment — so on this shared dev database other rows can
      // legitimately also be "due" (this file's own other describes, or
      // whatever the running app has written). A generous limit plus
      // filtering down to this test's own thread is what makes the assertion
      // about *this* fixture rather than an assumption that the table starts
      // empty.
      const due = await messages.claimDueForNotice(5000, now);
      const forThisThread = due.filter((m) => m.threadId === opened.id);
      expect(forThisThread.map((m) => m.id)).toEqual([dueUnread!.id]);
      expect(forThisThread[0]).toMatchObject({
        threadId: opened.id,
        senderUserId: customerId,
        customerUserId: customerId,
        providerId,
      });
    });
  });

  test("stops returning a message once it is marked notified", async () => {
    const providerId = await makeProvider(ownerId, "claim-due-notified");
    const opened = await __runWithTransactionContextForTests(db, () =>
      threads.openOrFind(customerId, providerId, new Date("2026-08-11T00:00:00.000Z")),
    );

    // See the identical comment in the test above: far enough into the
    // future that the real, deployed cron's own wall-clock sweep can never
    // claim this row, while this test's own explicit `now` argument still
    // does.
    const now = new Date("2999-08-11T00:10:00.000Z");
    const past = new Date(now.getTime() - 60_000);
    const [inserted] = await db
      .insert(message)
      .values({ threadId: opened.id, senderUserId: customerId, body: "due, unread", notifyDueAt: past })
      .returning({ id: message.id });

    await __runWithTransactionContextForTests(db, async () => {
      // Same reasoning as the test above: this is a whole-table sweep, so the
      // assertion is "our message is in there, then it isn't" rather than
      // "the result is empty" — the table is not this test's alone on a
      // shared dev database.
      const before = await messages.claimDueForNotice(5000, now);
      expect(before.some((m) => m.id === inserted!.id)).toBe(true);

      await messages.markNotified(inserted!.id, now);

      const after = await messages.claimDueForNotice(5000, now);
      expect(after.some((m) => m.id === inserted!.id)).toBe(false);
    });

    expect(await notifiedAtOf(inserted!.id)).not.toBeNull();
  });
});

describe("countUnreadForViewer", () => {
  test("counts only the other side's unread, per thread, in one call", async () => {
    const providerA = await makeProvider(ownerId, "unread-a");
    const providerB = await makeProvider(ownerId, "unread-b");
    await db.insert(providerMember).values({ providerId: providerA, userId: staffId, role: "staff" });

    const threadA = await __runWithTransactionContextForTests(db, () =>
      threads.openOrFind(customerId, providerA, new Date("2026-08-12T00:00:00.000Z")),
    );
    const threadB = await __runWithTransactionContextForTests(db, () =>
      threads.openOrFind(customerId, providerB, new Date("2026-08-12T00:00:00.000Z")),
    );

    // Thread A: two unread from the provider, one read, one the customer sent.
    await db.insert(message).values({ threadId: threadA.id, senderUserId: staffId, body: "unread 1" });
    await db.insert(message).values({ threadId: threadA.id, senderUserId: staffId, body: "unread 2" });
    await db
      .insert(message)
      .values({ threadId: threadA.id, senderUserId: staffId, body: "already read", readAt: new Date() });
    await db
      .insert(message)
      .values({ threadId: threadA.id, senderUserId: customerId, body: "the customer's own message" });
    // Thread B: nothing unread.

    await __runWithTransactionContextForTests(db, async () => {
      const counts = await messages.countUnreadForViewer([threadA.id, threadB.id], customerId);
      expect(counts.get(threadA.id)).toBe(2);
      expect(counts.get(threadB.id) ?? 0).toBe(0);
    });
  });
});

describe("attachment", () => {
  let providerId: string;
  let threadId: string;
  let m1: string;
  let m2: string;
  let attachmentId: string;

  // No explicit cleanup of `attachment` rows in `afterAll` above: every one
  // inserted here hangs off a message under `providerIds`, and `attachment`
  // references `message.id` with `ON DELETE CASCADE` — deleting `message`
  // there already removes these.
  beforeAll(async () => {
    providerId = await makeProvider(ownerId, "attachment");
    // A member row for staff, deliberately none for `ownerId` — same reason
    // the `findVisible` describe above gives: visibility rides on
    // `provider_member`, not on `provider.owner_user_id`.
    await db.insert(providerMember).values({ providerId, userId: staffId, role: "staff" });

    const opened = await __runWithTransactionContextForTests(db, () =>
      threads.openOrFind(customerId, providerId, new Date("2026-08-17T00:00:00.000Z")),
    );
    threadId = opened.id;

    await __runWithTransactionContextForTests(db, async () => {
      m1 = await messages.insert(
        Message.compose({
          threadId,
          senderUserId: customerId,
          body: "",
          attachmentCount: 2,
          now: new Date("2026-08-17T00:01:00.000Z"),
        }),
      );
      m2 = await messages.insert(
        Message.compose({
          threadId,
          senderUserId: customerId,
          body: "no files here",
          now: new Date("2026-08-17T00:02:00.000Z"),
        }),
      );

      await attachments.insertMany(m1, [
        { storageKey: "communication/attachment-test/a.png", fileName: "a.png", contentType: "image/png", sizeBytes: 111 },
        { storageKey: "communication/attachment-test/b.pdf", fileName: "b.pdf", contentType: "application/pdf", sizeBytes: 222 },
      ]);
    });

    const [row] = await db.select({ id: attachment.id }).from(attachment).where(eq(attachment.messageId, m1));
    attachmentId = row!.id;
  }, 20_000);

  describe("insertMany", () => {
    test("writes every attachment, retrievable by its message", async () => {
      const rows = await db.select().from(attachment).where(eq(attachment.messageId, m1));
      expect(rows.map((r) => r.fileName).sort()).toEqual(["a.png", "b.pdf"]);
    });

    test("does nothing, and does not error, on an empty list", async () => {
      await __runWithTransactionContextForTests(db, async () => {
        await attachments.insertMany(m2, []);
      });
      const rows = await db.select().from(attachment).where(eq(attachment.messageId, m2));
      expect(rows).toHaveLength(0);
    });
  });

  describe("findVisible", () => {
    test("the customer on the thread reads the attachment", async () => {
      await __runWithTransactionContextForTests(db, async () => {
        const row = await attachments.findVisible(attachmentId, customerId);
        expect(row?.id).toBe(attachmentId);
        expect(row?.storageKey).toBe("communication/attachment-test/a.png");
      });
    });

    test("a member of the provider reads it too — resolved through provider_member, not ownership", async () => {
      await __runWithTransactionContextForTests(db, async () => {
        const row = await attachments.findVisible(attachmentId, staffId);
        expect(row?.id).toBe(attachmentId);
      });
    });

    // `customer2Id` — a second REAL, registered user (inserted in the
    // top-level `beforeAll`), never a made-up id: a fixture whose only
    // "stranger" is a fabricated, never-inserted id cannot tell a working
    // visibility check apart from one that was silently dropped, if the
    // query happens to filter on the row's mere existence in `user` for any
    // other reason. `customer2Id` is real, exists, and is still refused —
    // the check itself is what refuses it, nothing incidental about the id.
    //
    // The missing-attachment case returns the exact same answer as the
    // stranger case: a stranger guessing attachment ids learns nothing from
    // the difference, the same guarantee `ThreadRepositoryPort.findVisible`
    // makes for thread ids.
    test("a stranger sees nothing — the same answer as an attachment that does not exist", async () => {
      await __runWithTransactionContextForTests(db, async () => {
        expect(await attachments.findVisible(attachmentId, customer2Id)).toBeNull();
        expect(await attachments.findVisible(crypto.randomUUID(), customerId)).toBeNull();
      });
    });
  });

  describe("listForMessages", () => {
    test("groups attachments by message, a message with none absent rather than empty", async () => {
      await __runWithTransactionContextForTests(db, async () => {
        const byMessage = await attachments.listForMessages([m1, m2]);
        expect(byMessage.get(m1)).toHaveLength(2);
        expect(byMessage.get(m2) ?? []).toHaveLength(0);
      });
    });

    test("one query for the whole page, not one per message", async () => {
      let queryCount = 0;
      const countingSql = postgres(url, {
        max: 1,
        debug: () => {
          queryCount++;
        },
      });
      const countingDb = drizzle(countingSql, { schema: authSchema });
      try {
        // A fresh postgres.js connection's first-ever query always fires one
        // extra, internal type-array introspection query ahead of it — this
        // warms that away so it is not mistaken for `listForMessages`'s own
        // query.
        await countingSql`select 1`;
        queryCount = 0;

        const byMessage = await __runWithTransactionContextForTests(countingDb, () =>
          attachments.listForMessages([m1, m2]),
        );
        expect(byMessage.get(m1)).toHaveLength(2);
        expect(byMessage.get(m2) ?? []).toHaveLength(0);
        expect(queryCount).toBe(1);
      } finally {
        await countingSql.end();
      }
    }, 20_000);

    test("an empty list of message ids is a no-op, not a query with an empty IN()", async () => {
      const byMessage = await attachments.listForMessages([]);
      expect(byMessage.size).toBe(0);
    });
  });
});
