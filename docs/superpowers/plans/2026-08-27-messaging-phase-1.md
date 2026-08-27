# Messaging Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a customer can write to a provider, the provider can answer, and both find the conversation again.

**Architecture:** Two tables in `ntizo_communication` — `thread` (one per customer↔provider pair) and `message` (`read_at` on the row, not a per-side cursor). Sending upserts the thread and inserts the message in one transaction. Nothing is notified at send time: each message carries `notify_due_at`, and a new scheduled worker raises a bell-plus-email notification only for messages still unread when that window elapses.

**Tech Stack:** Bun, Turborepo, Hono on Cloudflare Workers, Drizzle + Neon Postgres in named schemas, onion-lasagna CQRS, GraphQL field kit, TanStack Query + TanStack Router, vitest (frontend) and `bun test` (backend), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-08-27-messaging-phase-1-design.md`

## Global Constraints

- `packages/backend` must NOT import `hono`, `graphql-yoga`, `@cosmneo/onion-lasagna-hono`, or `@cosmneo/onion-lasagna-yoga`. The GraphQL **field kit** IS allowed. Two fitness tests enforce this — run them.
- The GraphQL field kit **flattens nested schema keys**: `{ communication: { myThreads } }` emits on the wire as `communicationMyThreads`. Verify emitted names by introspecting a running server, never by reading source.
- There are **two** schema barrels and both must be edited: `packages/backend/src/modules/ntizo/read/schema.ts` and `packages/backend/src/modules/ntizo/write/schema.ts`. A field missing from its barrel never reaches `privateGraphqlSchema` no matter what `private.ts` says.
- `ntizo_communication` is **already** in `schemaFilter` (`packages/backend/src/modules/ntizo/drizzle.config.ts:17`). Do not add it again.
- Eight locales, all must carry identical key sets: `en-US`, `pt-MZ`, `pt-PT`, `es-ES`, `fr-FR`, `it-IT`, `de-DE`, `nl-NL`. `DEFAULT_LOCALE` is `pt-MZ`; write that copy, do not translate it from English.
- Message body: non-empty after trimming, at most **4000** characters.
- The notify window is **2 minutes**, one named constant, separate from the cron interval.
- `eslint-plugin-boundaries` runs `no-unknown-files: "error"` in `apps/frontend/web`. Layers: `domain`, `data`, `viewmodel`, `ui`, `routes`, `shared`. A file in an undeclared layer fails lint.
- `apps/frontend/web` and `packages/shared` run **vitest**; `packages/backend` and `apps/backend/api` run `bun test`. A test importing the wrong runner fails to *load* and reports "(0 test)" — its assertions silently never run.
- Gates: `bun run typecheck` and the package's tests in each touched package. For lint use `bun run lint --force` at the **repo root** only (that flag is Turborepo's cache bypass), or plain `bun run lint` inside a package. Never `--force` inside a package: eslint rejects it and exits 2 without linting.
- Known failure that is NOT yours: `catalog-service-search.test.ts` in `packages/backend` is data-dependent against the shared dev database (follow-up #62).
- The dev database is **shared with the user's running application**. Any test touching it cleans up in an `afterAll` that still runs when an assertion fails partway, and never asserts on global counts.
- Stage by explicit path, never `git add -A`. Do not run `prettier`.

---

## File Structure

**Backend — database**
- `packages/backend/src/modules/ntizo/shared/infrastructure/database/communication/schemas/thread.schema.ts` — the `thread` table
- `.../communication/schemas/message.schema.ts` — the `message` table
- `.../communication/schemas/index.ts` — barrel (currently a stub)
- `.../communication/enums.ts` — `THREAD_TYPES` (currently a stub)

**Backend — bounded context** (`bounded-contexts/communication/`)
- `domain/aggregates/thread.aggregate.ts`, `domain/aggregates/message.aggregate.ts`
- `domain/exceptions.ts`
- `app/ports/outbound/{thread.repository.port.ts,message.repository.port.ts,provider-reader.port.ts,index.ts}`
- `app/ports/inbound/{notify-unread.internal.command.port.ts,index.ts}`
- `app/use-cases/{start-thread.command.ts,send-message.command.ts,mark-thread-read.command.ts,notify-unread.internal.command.ts}`
- `infrastructure/repositories/drizzle/{thread.repository.ts,message.repository.ts}`
- `infrastructure/outbound-adapters/cross-bc/provider-reader.adapter.ts`
- `bootstrap/index.ts`, `index.ts`

**Backend — read/write**
- `read/communication/{app/use-cases/*.projection.ts,graphql/schema/queries.ts,graphql/handlers/queries.handlers.ts,bootstrap/index.ts,index.ts}`
- `write/communication/{graphql/schema/mutations.ts,graphql/handlers/mutations.handlers.ts,index.ts}`

**Backend — shared read models**
- `packages/shared/src/read-models/system/communication/{thread.schema.ts,message.schema.ts,index.ts}`

**Backend — worker**
- `apps/backend/api/src/index.ts` — gains a `scheduled` export
- `apps/backend/api/src/scheduled.ts` — what `scheduled` runs
- `apps/backend/api/wrangler.jsonc` — `triggers.crons` per environment

**Frontend** (`apps/frontend/web/src/features/messaging/`)
- `domain/types.ts`, `data/messaging.repository.ts`
- `viewmodel/{use-threads.ts,use-thread.ts,use-send-message.ts}`
- `ui/{thread-list.tsx,thread-view.tsx,message-composer.tsx,customer-messages-page.tsx,provider-messages-page.tsx}`
- `routes/provider/$slug/messages.tsx`
- `routes/providers.$slug.tsx` — gains the entry-point button
- `shared/locales/*/messaging.json` — eight files

---

## Task 1: The two tables

**Files:**
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/communication/schemas/thread.schema.ts`
- Create: `.../communication/schemas/message.schema.ts`
- Modify: `.../communication/schemas/index.ts` (currently `export {};`)
- Modify: `.../communication/enums.ts` (currently a comment-only stub)
- Test: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/communication-constraints.test.ts`

**Interfaces:**
- Produces: `thread`, `message` drizzle tables; types `ThreadRow`, `NewThreadRow`, `MessageRow`, `NewMessageRow`; `THREAD_TYPES` and `ThreadType`.

- [ ] **Step 1: Write the enums**

`enums.ts`:

```ts
/**
 * Ships with one value in use. Phases 2 and 3 (support threads, oversight) are
 * agreed scope, so the column is known scope rather than speculation — adding
 * it later would mean a migration plus a backfill of every existing row.
 */
export const THREAD_TYPES = ["inquiry"] as const;
export type ThreadType = (typeof THREAD_TYPES)[number];
```

- [ ] **Step 2: Write the thread table**

`thread.schema.ts`:

```ts
import { index, pgSchema, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../../user/schemas/user.schema";
import { provider } from "../../provider/schemas/provider.schema";

export const communicationSchema = pgSchema("ntizo_communication");

/**
 * One conversation between a customer and a provider.
 *
 * `last_message_at` is denormalised so an inbox can order and page without
 * touching `message`. It is written in the same transaction as the message.
 */
export const thread = communicationSchema.table(
  "thread",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 32 }).notNull(),
    customerUserId: text("customer_user_id")
      .notNull()
      .references(() => user.id),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => provider.id),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Partial on purpose: a phase-2 support thread carries a different `type`,
    // and Postgres treats NULLs as distinct — a plain unique index would stop
    // constraining anything the moment a column here can be null.
    uniqueIndex("thread_customer_provider_uq")
      .on(t.customerUserId, t.providerId)
      .where(sql`${t.type} = 'inquiry'`),
    index("idx_thread_customer_recent").on(t.customerUserId, t.lastMessageAt.desc(), t.id.desc()),
    index("idx_thread_provider_recent").on(t.providerId, t.lastMessageAt.desc(), t.id.desc()),
  ],
);

export type ThreadRow = typeof thread.$inferSelect;
export type NewThreadRow = typeof thread.$inferInsert;
```

- [ ] **Step 3: Write the message table**

`message.schema.ts`:

```ts
import { index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { communicationSchema, thread } from "./thread.schema";
import { user } from "../../user/schemas/user.schema";

/**
 * `read_at` sits here rather than as a per-side cursor on the thread: each
 * message has exactly one recipient side, so "unread" is a direct count.
 *
 * `notify_due_at` / `notified_at` carry the delayed notice. Nothing is raised
 * when a message is sent; the sweep raises it only if the message is still
 * unread when the window elapses, so a fast exchange produces no email at all.
 */
export const message = communicationSchema.table(
  "message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => thread.id, { onDelete: "cascade" }),
    senderUserId: text("sender_user_id")
      .notNull()
      .references(() => user.id),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    notifyDueAt: timestamp("notify_due_at", { withTimezone: true }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_message_thread_recent").on(t.threadId, t.createdAt.desc(), t.id.desc()),
    // The only rows the sweep wants. Partial so the index stays small however
    // many messages exist.
    index("idx_message_notify_due")
      .on(t.notifyDueAt)
      .where(sql`${t.notifyDueAt} IS NOT NULL AND ${t.readAt} IS NULL AND ${t.notifiedAt} IS NULL`),
  ],
);

export type MessageRow = typeof message.$inferSelect;
export type NewMessageRow = typeof message.$inferInsert;
```

- [ ] **Step 4: Export from the barrel**

Replace the stub in `schemas/index.ts`:

```ts
export * from "./thread.schema";
export * from "./message.schema";
```

Then confirm the parent barrel already re-exports this folder:

Run: `grep -n "communication" packages/backend/src/modules/ntizo/shared/infrastructure/database/schemas.ts`
Expected: a line re-exporting `./communication/schemas`. If there is none, add one matching how `activity` is re-exported there.

- [ ] **Step 5: Generate the migration**

Run: `cd packages/backend && bun run db:ntizo:generate`
Expected: a new `0023_*.sql` containing `CREATE SCHEMA "ntizo_communication"`, both `CREATE TABLE` statements, and all four indexes.

Read the generated SQL and confirm the partial `WHERE` clauses survived on `thread_customer_provider_uq` and `idx_message_notify_due`. If a `WHERE` is missing, the index is not the one this design needs — fix the schema and regenerate rather than editing the SQL by hand.

- [ ] **Step 6: Write the constraint test**

`communication-constraints.test.ts`. This is DB-backed like its siblings (`notification-constraints`, `scheduling-constraints`) — asserting Drizzle object properties would pass with the migration never applied.

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
// Follow `notification-constraints.test.ts` for the connection helper and the
// DEV_DB_URL guard it uses — copy that shape rather than inventing one.

const suffix = crypto.randomUUID();

describe("ntizo_communication constraints", () => {
  test("one inquiry thread per customer and provider", async () => {
    // Insert a thread, then insert the same (customer, provider) again and
    // expect a unique violation. Wrap the second insert in an async function —
    // postgres.js's tagged template is a lazy thenable, and handing it straight
    // to `expect(...).rejects` hangs bun:test at 100% CPU instead of failing.
    await expect(async () => {
      await insertThread();
    }).toThrow();
  });

  test("the notify index exists and is partial", async () => {
    const [row] = await sql`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'ntizo_communication' AND indexname = 'idx_message_notify_due'`;
    expect(row?.indexdef).toContain("WHERE");
  });
});
```

Clean up every row you insert in an `afterAll`, keyed on `suffix`, deleting messages before threads before the user.

- [ ] **Step 7: Run and commit**

Run: `cd packages/backend && bun run typecheck && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/communication-constraints.test.ts`
Expected: PASS, and `SELECT count(*) FROM ntizo_communication.thread` returns to its starting value.

```bash
git add packages/backend/src/modules/ntizo/shared/infrastructure/database/communication packages/backend/src/modules/ntizo/shared/infrastructure/migrations
git commit -m "feat(communication): a conversation and the messages in it"
```

---

## Task 2: The aggregates

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/communication/domain/aggregates/thread.aggregate.ts`
- Create: `.../domain/aggregates/message.aggregate.ts`
- Create: `.../domain/exceptions.ts`
- Test: `.../communication/__tests__/aggregates.test.ts`

**Interfaces:**
- Consumes: `ThreadType` from Task 1.
- Produces: `Thread.open({ id, customerUserId, providerId, lastMessageAt })`, `Thread.rehydrate(props)`, `Message.compose({ threadId, senderUserId, body, now })`, `Message.rehydrate(props)`, `MESSAGE_BODY_MAX = 4000`, `NOTIFY_AFTER_MS`, and the exception classes.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "bun:test";
import { Message, MESSAGE_BODY_MAX } from "../domain/aggregates/message.aggregate";
import { MessageBodyEmptyError, MessageBodyTooLongError } from "../domain/exceptions";

const now = new Date("2026-08-27T10:00:00.000Z");
const base = { threadId: "11111111-1111-1111-1111-111111111111", senderUserId: "u1", now };

describe("Message.compose", () => {
  it("refuses a body that is only whitespace", () => {
    expect(() => Message.compose({ ...base, body: "   \n\t " })).toThrow(MessageBodyEmptyError);
  });

  it("refuses a body over the limit", () => {
    expect(() => Message.compose({ ...base, body: "x".repeat(MESSAGE_BODY_MAX + 1) })).toThrow(
      MessageBodyTooLongError,
    );
  });

  it("accepts a body exactly at the limit", () => {
    const m = Message.compose({ ...base, body: "x".repeat(MESSAGE_BODY_MAX) });
    expect(m.body.length).toBe(MESSAGE_BODY_MAX);
  });

  it("trims the stored body but measures the trimmed length", () => {
    const m = Message.compose({ ...base, body: "  olá  " });
    expect(m.body).toBe("olá");
  });

  it("sets notifyDueAt two minutes after now, and nothing else", () => {
    const m = Message.compose({ ...base, body: "olá" });
    expect(m.notifyDueAt.getTime()).toBe(now.getTime() + 120_000);
    expect(m.readAt).toBeNull();
    expect(m.notifiedAt).toBeNull();
  });
});

describe("Message.rehydrate", () => {
  it("trusts the database and does not re-validate", () => {
    // A row written before a rule existed must still be readable. This is the
    // read path; `compose` is the write path.
    const m = Message.rehydrate({
      id: "22222222-2222-2222-2222-222222222222",
      threadId: base.threadId,
      senderUserId: "u1",
      body: "",
      readAt: null,
      notifyDueAt: null,
      notifiedAt: null,
      createdAt: now,
    });
    expect(m.body).toBe("");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the exceptions**

`domain/exceptions.ts`. Extend the same base classes the other contexts use — read `bounded-contexts/activity/domain/exceptions.ts` and `bounded-contexts/review/domain/exceptions.ts` first and match. The base class is load-bearing: the GraphQL kit's `getGraphQLErrorCode` maps `UnprocessableError` to `"UNPROCESSABLE"`, while a bare `Error` masks as `INTERNAL_ERROR`.

```ts
export class MessageBodyEmptyError extends UnprocessableError {
  constructor() {
    super("A message needs something in it.", "MESSAGE_BODY_EMPTY");
  }
}

export class MessageBodyTooLongError extends UnprocessableError {
  constructor(length: number) {
    super(`A message may be at most ${MESSAGE_BODY_MAX} characters; this one is ${length}.`, "MESSAGE_BODY_TOO_LONG");
  }
}

export class ThreadNotVisibleError extends UnprocessableError {
  constructor() {
    // Deliberately the same answer as "no such thread": telling them apart
    // tells an attacker which thread ids are real.
    super("No such conversation.", "THREAD_NOT_VISIBLE");
  }
}

export class ProviderNotContactableError extends UnprocessableError {
  constructor() {
    super("This provider cannot be messaged.", "PROVIDER_NOT_CONTACTABLE");
  }
}
```

- [ ] **Step 4: Write the Message aggregate**

```ts
export const MESSAGE_BODY_MAX = 4000;

/**
 * How long a message waits before anybody is told about it. One constant, not a
 * literal in the command and again in the sweep — the window is what the
 * product means; the cron interval is how often we check.
 */
export const NOTIFY_AFTER_MS = 120_000;

export class Message {
  private constructor(readonly props: MessageProps) {}

  /** The write path: validates. */
  static compose(params: { threadId: string; senderUserId: string; body: string; now: Date }): Message {
    const body = params.body.trim();
    if (body.length === 0) throw new MessageBodyEmptyError();
    if (body.length > MESSAGE_BODY_MAX) throw new MessageBodyTooLongError(body.length);
    return new Message({
      id: null,
      threadId: params.threadId,
      senderUserId: params.senderUserId,
      body,
      readAt: null,
      notifyDueAt: new Date(params.now.getTime() + NOTIFY_AFTER_MS),
      notifiedAt: null,
      createdAt: params.now,
    });
  }

  /** The read path: trusts the database, checks nothing. */
  static rehydrate(props: MessageProps): Message {
    return new Message(props);
  }

  get body() { return this.props.body; }
  get readAt() { return this.props.readAt; }
  get notifyDueAt() { return this.props.notifyDueAt; }
  get notifiedAt() { return this.props.notifiedAt; }
}
```

Write `Thread` the same way: `open()` validates the type is in `THREAD_TYPES`, `rehydrate()` does not.

- [ ] **Step 5: Run and watch it pass**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication`
Expected: PASS, 6 tests.

- [ ] **Step 6: Prove `rehydrate` is not `compose` in disguise**

Swap the body of `rehydrate` to call `compose` and re-run. Expected: the "trusts the database" test goes RED. Restore it.

This is not ceremony. In the activity phase the same two-factory split was guarded only by a comment, and swapping them left all sixteen tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/communication
git commit -m "feat(communication): what a message must be before it is stored"
```

---

## Task 3: The repositories

**Files:**
- Create: `.../communication/app/ports/outbound/{thread.repository.port.ts,message.repository.port.ts,index.ts}`
- Create: `.../communication/infrastructure/repositories/drizzle/{thread.repository.ts,message.repository.ts}`
- Test: `.../communication/__tests__/repositories.test.ts` (DB-backed)

**Interfaces:**
- Produces:
  - `ThreadRepositoryPort.openOrFind(customerUserId, providerId, now): Promise<{ id: string; created: boolean }>`
  - `ThreadRepositoryPort.touch(threadId, at): Promise<void>`
  - `ThreadRepositoryPort.findVisible(threadId, viewerUserId): Promise<ThreadRow | null>`
  - `ThreadRepositoryPort.listForCustomer(customerUserId, limit, cursor)` and `listForProvider(providerId, limit, cursor)`, each returning `{ items, nextCursor }`
  - `MessageRepositoryPort.insert(message: Message): Promise<string>` — the message already carries its `threadId`, so it is not passed twice
  - `MessageRepositoryPort.listForThread(threadId, limit, cursor)`
  - `MessageRepositoryPort.markReadForViewer(threadId, viewerUserId, at): Promise<number>` — returns how many rows it marked
  - `MessageRepositoryPort.claimDueForNotice(limit, now): Promise<DueMessage[]>` where `DueMessage = { id, threadId, senderUserId, customerUserId, providerId }`
  - `MessageRepositoryPort.markNotified(messageId, at): Promise<void>` — Task 5 calls this after a successful notice, and only then; a message left unmarked is retried by the next sweep
  - `MessageRepositoryPort.countUnreadForViewer(threadIds, viewerUserId): Promise<Map<string, number>>` — Task 7's thread list needs this; one query for a page of threads, not one per thread

- [ ] **Step 1: Write the failing test**

```ts
describe("openOrFind", () => {
  it("returns the same thread the second time, and says it did not create it", async () => {
    const first = await repo.openOrFind(customerId, providerId, now);
    const second = await repo.openOrFind(customerId, providerId, now);
    expect(second.id).toBe(first.id);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });
});

describe("listForCustomer", () => {
  it("orders by last message, newest first, and pages past the boundary", async () => {
    // Three threads with distinct lastMessageAt. Ask for two.
    const page = await repo.listForCustomer(customerId, 2, null);
    expect(page.items.map((t) => t.id)).toEqual([newest.id, middle.id]);
    expect(page.nextCursor).not.toBeNull();

    const rest = await repo.listForCustomer(customerId, 2, page.nextCursor);
    expect(rest.items.map((t) => t.id)).toEqual([oldest.id]);
    expect(rest.nextCursor).toBeNull();
  });
});

describe("markReadForViewer", () => {
  it("marks only the other side's messages", async () => {
    // Thread has one message from the customer and one from the provider.
    const marked = await repo.markReadForViewer(threadId, customerId, now);
    expect(marked).toBe(1);
    expect(await readAtOf(providerMessageId)).not.toBeNull();
    expect(await readAtOf(customerMessageId)).toBeNull();
  });
});

describe("claimDueForNotice", () => {
  it("takes due, unread, un-notified messages and leaves the rest", async () => {
    // Four messages: due+unread+unnotified, due+read, due+already-notified,
    // not-yet-due. Only the first should come back.
    const due = await repo.claimDueForNotice(10, now);
    expect(due.map((m) => m.id)).toEqual([dueUnreadId]);
  });

  it("stops returning a message once it is marked notified", async () => {
    const [first] = await repo.claimDueForNotice(10, now);
    await repo.markNotified(first!.id, now);
    expect(await repo.claimDueForNotice(10, now)).toEqual([]);
  });
});

describe("countUnreadForViewer", () => {
  it("counts only the other side's unread, per thread, in one call", async () => {
    // Two threads. Thread A: two unread from the provider, one read, one the
    // customer sent. Thread B: nothing unread.
    const counts = await repo.countUnreadForViewer([threadA, threadB], customerId);
    expect(counts.get(threadA)).toBe(2);
    expect(counts.get(threadB) ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `openOrFind` as an upsert, not a read-then-branch**

```ts
async openOrFind(customerUserId: string, providerId: string, now: Date) {
  // ON CONFLICT rather than SELECT-then-INSERT: two messages sent at the same
  // moment must not produce two threads. `xmax = 0` is zero on a row this
  // statement inserted and non-zero on one DO UPDATE touched, so it reports
  // what this write did — unlike a read taken before the transaction, which
  // both racers can see as "nothing here".
  const [row] = await getDb()
    .insert(thread)
    .values({ type: "inquiry", customerUserId, providerId, lastMessageAt: now })
    .onConflictDoUpdate({
      target: [thread.customerUserId, thread.providerId],
      set: { lastMessageAt: now },
    })
    .returning({ id: thread.id, inserted: sql<boolean>`(xmax = 0)` });
  return { id: row!.id, created: row!.inserted };
}
```

- [ ] **Step 4: Write the cursor helpers**

Cursor is `<ISO timestamp>|<id>`, the same shape the activity repository uses. Read `bounded-contexts/activity/infrastructure/repositories/drizzle/activity.repository.ts` and mirror it: a `limit + 1` probe decides `nextCursor`, and a malformed cursor throws `CursorInvalidError extends UnprocessableError` rather than a bare `Error`.

- [ ] **Step 5: Write `claimDueForNotice`**

```ts
async claimDueForNotice(limit: number, now: Date): Promise<DueMessage[]> {
  return await getDb()
    .select({ /* id, threadId, senderUserId, body, thread.customerUserId, thread.providerId */ })
    .from(message)
    .innerJoin(thread, eq(thread.id, message.threadId))
    .where(
      and(
        isNotNull(message.notifyDueAt),
        lte(message.notifyDueAt, now),
        isNull(message.readAt),
        isNull(message.notifiedAt),
      ),
    )
    .orderBy(asc(message.notifyDueAt))
    .limit(limit);
}
```

- [ ] **Step 6: Run and watch it pass**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication`
Expected: PASS.

- [ ] **Step 7: Break each claim and confirm it reds**

Run each of these, confirm the named test fails, then restore from a byte-identical backup:

| Mutation | Must red |
|---|---|
| `.orderBy(desc(...))` → `asc` in `listForCustomer` | the ordering test |
| drop the `limit + 1` probe, use `limit` | the paging-boundary test |
| `markReadForViewer` marks all messages, not just the other side's | the mark-read test |
| drop `isNull(message.readAt)` from `claimDueForNotice` | the sweep test |
| `openOrFind` uses SELECT-then-INSERT | the "same thread twice" test |

A test you have not tried to break is a test you have not finished writing.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/communication
git commit -m "feat(communication): reading and writing conversations"
```

---

## Task 4: Sending, and who is allowed to

**Files:**
- Create: `.../communication/app/ports/outbound/provider-reader.port.ts`
- Create: `.../communication/infrastructure/outbound-adapters/cross-bc/provider-reader.adapter.ts`
- Create: `.../communication/app/use-cases/{start-thread.command.ts,send-message.command.ts,mark-thread-read.command.ts}`
- Create: `.../communication/bootstrap/index.ts`, `.../communication/index.ts`
- Test: `.../communication/__tests__/commands.test.ts`

**Interfaces:**
- Consumes: the ports from Task 3, `Message.compose` from Task 2.
- Produces: `StartThreadCommand.execute({ customerUserId, providerId })`, `SendMessageCommand.execute({ threadId, senderUserId, body })`, `MarkThreadReadCommand.execute({ threadId, viewerUserId })`, `ProviderReaderPort.isContactable(providerId)`, `ProviderReaderPort.isMember(providerId, userId)`.

**Cross-BC rule:** the communication context declares its own outbound port and implements it as an adapter reading one column off one row. Read `bounded-contexts/notification/infrastructure/outbound-adapters/cross-bc/provider-member-reader.adapter.ts` and mirror its shape — including that `getDb` is imported **six** levels up. Do not import another context's repository or bootstrap.

**Membership has no status column.** `ntizo_provider.provider_member` carries only `role` (`owner` | `admin` | `staff`); being a member *is* the row existing. `DrizzleProviderMemberReader` already resolves it as `and(eq(providerId), eq(userId))` with no further filter. Use the same predicate — do not invent a status concept.

**"Contactable" already has a definition in this codebase.** A provider is contactable when `provider.status = 'active'` — the same predicate the public directory uses to decide a provider is visible at all (`catalog/infrastructure/repositories/drizzle/service-read.repository.ts:175`). `ProviderStatus` is `pending | active | rejected | suspended | archived`. Do not invent a second rule: a provider nobody can find in the directory is a provider nobody should be able to message.

**There is no clock port in this codebase.** Take `now` as an injected function so tests can control it, defaulting to the real one:

```ts
constructor(
  private readonly threads: ThreadRepositoryPort,
  private readonly messages: MessageRepositoryPort,
  private readonly providers: ProviderReaderPort,
  private readonly unitOfWork: UnitOfWorkPort,
  private readonly now: () => Date = () => new Date(),
) {}
```

Every `this.clock.now()` in the steps below means `this.now()`.

- [ ] **Step 1: Write the failing test**

```ts
describe("authorization", () => {
  it("refuses a stranger the same way it refuses a missing thread", async () => {
    await expect(
      send.execute({ threadId: existingThread, senderUserId: "someone-else", body: "olá" }),
    ).rejects.toThrow(ThreadNotVisibleError);
  });

  it("lets the customer send", async () => {
    await expect(send.execute({ threadId: existingThread, senderUserId: customerId, body: "olá" }))
      .resolves.toBeDefined();
  });

  it("lets any member of the provider send", async () => {
    fakeProviders.members.set(providerId, ["staff-1"]);
    await expect(send.execute({ threadId: existingThread, senderUserId: "staff-1", body: "olá" }))
      .resolves.toBeDefined();
  });
});

describe("sending", () => {
  it("writes the message and moves the thread's last_message_at, in one transaction", async () => {
    await send.execute({ threadId: existingThread, senderUserId: customerId, body: "olá" });
    expect(uow.insideTransaction).toBe(true);
    expect(uow.touchedAfterInsert).toBe(true);
  });

  it("refuses to start a thread with a provider that cannot be messaged", async () => {
    fakeProviders.contactable.set(providerId, false);
    await expect(start.execute({ customerUserId: customerId, providerId }))
      .rejects.toThrow(ProviderNotContactableError);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication`
Expected: FAIL.

- [ ] **Step 3: Write the commands**

`SendMessageCommand` resolves visibility first, then does both writes inside `atomicExecute`, insert before touch. Follow `bounded-contexts/review/app/use-cases/submit-review.command.ts` for the unit-of-work shape.

```ts
async execute(input: SendMessageInput): Promise<{ id: string }> {
  const visible = await this.threads.findVisible(input.threadId, input.senderUserId);
  if (!visible) throw new ThreadNotVisibleError();
  const message = Message.compose({
    threadId: input.threadId,
    senderUserId: input.senderUserId,
    body: input.body,
    now: this.clock.now(),
  });
  return await this.unitOfWork.atomicExecute(async () => {
    const id = await this.messages.insert(message, input.threadId);
    await this.threads.touch(input.threadId, message.props.createdAt);
    return { id };
  });
}
```

`findVisible` must accept the viewer as the customer **or** as a member of the thread's provider. Put that decision in the repository query, not in the command, so it cannot be forgotten by a second caller.

- [ ] **Step 4: Run and watch it pass**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication`
Expected: PASS.

- [ ] **Step 5: Prove authorization is enforced, not arranged**

Mutate `findVisible` to ignore its `viewerUserId` argument and return the thread for anybody. Confirm the "refuses a stranger" test goes RED. Restore.

**This test must use a second user.** A fixture holding one person's data passes whether or not the check exists — the defect this codebase has produced four times.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/communication
git commit -m "feat(communication): sending, and who is allowed to"
```

---

## Task 5: The delayed notice

**Files:**
- Create: `.../communication/app/ports/inbound/notify-unread.internal.command.port.ts`
- Create: `.../communication/app/use-cases/notify-unread.internal.command.ts`
- Test: `.../communication/__tests__/notify-unread.test.ts`

**Interfaces:**
- Consumes: `MessageRepositoryPort.claimDueForNotice`, and `RaiseNotificationInternalPort` from the notification context.
- Produces: `NotifyUnreadInternalCommand.execute({ limit }): Promise<{ notified: number; failed: number }>`

**The seam this relies on:** `RaiseNotificationInternalCommand` takes its `deliverer` as an **optional** constructor argument — passing nothing raises a bell entry with no email. Here we pass it, so the sweep sends both. Read `bounded-contexts/notification/app/use-cases/raise-notification.internal.command.ts:38-46` before wiring it.

- [ ] **Step 1: Write the failing test**

```ts
it("notifies the recipient, not the sender", async () => {
  // A message sent by the customer must notify the provider's members.
  await notify.execute({ limit: 10 });
  expect(raised.calls[0]).toMatchObject({ audience: "provider", providerId });
});

it("marks what it notified so the next sweep skips it", async () => {
  await notify.execute({ limit: 10 });
  const second = await notify.execute({ limit: 10 });
  expect(second.notified).toBe(0);
});

it("keeps going when one message fails", async () => {
  raised.failOn(secondMessageId);
  const result = await notify.execute({ limit: 10 });
  expect(result.notified).toBe(2);
  expect(result.failed).toBe(1);
  // and the two that worked are marked, the one that failed is not
  expect(await notifiedAtOf(secondMessageId)).toBeNull();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication`
Expected: FAIL.

- [ ] **Step 3: Write the command**

```ts
async execute(input: { limit: number }): Promise<{ notified: number; failed: number }> {
  const due = await this.messages.claimDueForNotice(input.limit, this.clock.now());
  let notified = 0;
  let failed = 0;
  for (const m of due) {
    try {
      // The recipient is the side the sender is not on.
      const to = m.senderUserId === m.customerUserId
        ? { audience: "provider" as const, providerId: m.providerId }
        : { audience: "user" as const, userId: m.customerUserId };
      await this.raise.execute({ type: "message.received", ...to, payload: { threadId: m.threadId } });
      await this.messages.markNotified(m.id, this.clock.now());
      notified++;
    } catch (error) {
      // One bad row is not the rest of the queue's business. Left unmarked, so
      // the next sweep tries it again.
      failed++;
      console.error("[communication] could not notify a message", error);
    }
  }
  return { notified, failed };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication`
Expected: PASS.

- [ ] **Step 5: Prove the resilience claim**

Remove the `try`/`catch` and confirm the "keeps going" test goes RED. Restore.

A comment saying a loop survives a bad row is not evidence. In the notifications phase a documented "never throws" guarantee was false through three fix rounds while every test stayed green.

- [ ] **Step 6: Add the notification type and its copy**

`message.received` must exist in the shared `NotificationType` union and have a template. Read how an existing type is registered end to end — the union in `packages/shared`, the template in `bounded-contexts/notification/infrastructure/templates/` — and add this one the same way, in all eight locales.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/communication packages/shared/src
git commit -m "feat(communication): tell them only if they did not read it"
```

---

## Task 6: The scheduled worker

**Files:**
- Create: `apps/backend/api/src/scheduled.ts`
- Modify: `apps/backend/api/src/index.ts`
- Modify: `apps/backend/api/wrangler.jsonc`
- Test: `apps/backend/api/src/__tests__/scheduled.test.ts`

**Interfaces:**
- Consumes: `NotifyUnreadInternalCommand` from Task 5.

**This is the step that is easiest to skip and impossible to notice.** A sweep that is written, tested and never scheduled leaves every message un-notified for ever, and no test in the repository would say so. There is no cron and no `scheduled` export today — both are new.

- [ ] **Step 1: Write the failing test**

```ts
it("runs the sweep and closes the pool behind it", async () => {
  const ran: string[] = [];
  // Drive `scheduled` directly with a fake controller and env, the way
  // `wait-until.test.ts` drives `configMiddleware`.
  await scheduled(controller, ENV, ctx);
  expect(ran).toContain("notify-unread");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/backend/api && bun test src/__tests__/scheduled.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the handler**

`scheduled.ts` builds the same request-scoped store the fetch path builds, runs the sweep, and closes the connection **behind** any deferred work — read `apps/backend/api/src/middlewares/config.middleware.ts` and copy its closing shape exactly. That block chains `settleDeferredWork().then(() => closeDbConnection())` rather than scheduling both, because `waitUntil` tasks are not ordered against each other.

- [ ] **Step 4: Add the export**

`index.ts`:

```ts
import { app } from "./api";
import { scheduled } from "./scheduled";
import type { AppBindings } from "./types";

export default {
  fetch(request: Request, env: AppBindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  scheduled,
};
```

- [ ] **Step 5: Add the trigger**

In `wrangler.jsonc`, add to **each** of `env.dev`, `env.qa` and `env.prod`:

```jsonc
"triggers": { "crons": ["* * * * *"] }
```

Every minute is Cloudflare's finest granularity and is the right interval against a two-minute window: a message waits at most three minutes, and usually two.

- [ ] **Step 6: Prove the wiring, in both directions**

Delete `scheduled` from the default export and confirm your test reds. Restore.

Then confirm the trigger reached the deployed worker rather than only the file:

Run: `cd apps/backend/api && bunx wrangler deployments list --env dev | head`
Expected: the cron trigger appears. Reading `wrangler.jsonc` is not the check — a trigger in a file that was never deployed schedules nothing.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/api/src apps/backend/api/wrangler.jsonc
git commit -m "feat(api): a worker that wakes up to check for unread messages"
```

---

## Task 7: The read side

**Files:**
- Create: `packages/shared/src/read-models/system/communication/{thread.schema.ts,message.schema.ts,index.ts}`
- Modify: `packages/shared/src/read-models/system/index.ts`
- Create: `packages/backend/src/modules/ntizo/read/communication/**`
- Modify: `packages/backend/src/modules/ntizo/read/schema.ts`
- Modify: `apps/backend/api/src/graphql/private.ts`
- Test: `.../read/communication/__tests__/{projections.test.ts,queries.handlers.test.ts}`

**Interfaces:**
- Produces on the wire: `communicationMyThreads(input: { limit, cursor })`, `communicationProviderThreads(input: { providerId, limit, cursor })`, `communicationThreadMessages(input: { threadId, limit, cursor })`.

**Both barrels.** `read/schema.ts` is what `mergeGraphQLSchemas` assembles; a field missing from it never reaches `privateGraphqlSchema` regardless of `private.ts`. In the activity phase this file was omitted from the plan and only caught because the implementer introspected a live server.

- [ ] **Step 1: Write the failing handler test**

```ts
it("derives the actor from the session, never from arguments", async () => {
  const result = await handlers.communicationMyThreads(
    { input: { limit: 5 }, raw: { actorUserId: "victim" } },
    ctxFor("u-session"),
  );
  expect(fakeProjection.lastActor).toBe("u-session");
});

it("refuses an anonymous caller", async () => {
  await expect(handlers.communicationMyThreads({ input: {} }, anonymousCtx))
    .rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});

it("refuses a provider inbox to somebody who is not a member", async () => {
  await expect(
    handlers.communicationProviderThreads({ input: { providerId } }, ctxFor("stranger")),
  ).rejects.toThrow(ThreadNotVisibleError);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/read/communication`
Expected: FAIL.

- [ ] **Step 3: Write the read models**

Zod schemas in `packages/shared`. Note two things learned the hard way: a zod `.default()` does **not** reach the emitted GraphQL field, while `.min()`/`.max()` **do** — so a limit outside its range is a `VALIDATION_ERROR`, not a silently capped page. And give the payload-ish fields a `.catch()` where a single bad row would otherwise fail a whole page.

A thread in a list carries what an inbox row shows:

```ts
export const threadSummaryReadModel = z.object({
  id: z.string(),
  providerId: z.string(),
  providerName: z.string(),
  lastMessageAt: z.string(),
  lastMessagePreview: z.string(),
  unreadCount: z.number().int().min(0),
});
```

`unreadCount` comes from `countUnreadForViewer(threadIds, viewerUserId)` — **one** query for the whole page, joined onto the threads in the projection. Do not count per thread in a loop; a twenty-row inbox would issue twenty-one queries.

`providerName` is resolved once in the projection, the same way `read/activity` resolves names, and is the reason the customer's inbox does not need a second round trip.

- [ ] **Step 4: Write the projections, schema and handlers**

Follow `read/activity/` exactly for the file layout, `defineQuery` usage and `ntizoGraphqlContextSchema`.

- [ ] **Step 5: Wire both places**

Add `communicationReadSchema` to `read/schema.ts`'s `mergeGraphQLSchemas(...)`, and `...createCommunicationReadHandlers({ communicationRead })` to `private.ts`.

- [ ] **Step 6: Verify against a running server, not the source**

```bash
cd apps/backend/api && bunx wrangler dev --port 8790 &
curl -s -X POST http://localhost:8790/graphql -H 'Content-Type: application/json' \
  -d '{"query":"{ __schema { queryType { fields { name } } } }"}' | grep -o 'communication[A-Za-z]*'
```

Expected: `communicationMyThreads`, `communicationProviderThreads`, `communicationThreadMessages` — flattened, one word each. Stop the server afterwards. Use 8790, not 8788, which is the user's.

- [ ] **Step 7: Prove the mount gate covers this**

`apps/backend/api/src/graphql/__tests__/schema-mount.test.ts` walks the schema's declared leaf fields against the mounted handlers. Comment out your `createCommunicationReadHandlers` spread and confirm it reds. Restore.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src packages/backend/src/modules/ntizo/read apps/backend/api/src/graphql
git commit -m "feat(communication): a paged read of your conversations"
```

---

## Task 8: The write side

**Files:**
- Create: `packages/backend/src/modules/ntizo/write/communication/{graphql/schema/mutations.ts,graphql/handlers/mutations.handlers.ts,index.ts}`
- Modify: `packages/backend/src/modules/ntizo/write/schema.ts`
- Modify: `apps/backend/api/src/graphql/private.ts`
- Test: `.../write/communication/__tests__/mutations.handlers.test.ts`

**Interfaces:**
- Produces on the wire: `communicationStartThread(input: { providerId })`, `communicationSend(input: { threadId, body })`, `communicationMarkRead(input: { threadId })`.

**Two mutations, not one union.** `startThread` is idempotent — called twice it returns the same thread, because the unique index resolves it as an upsert. The customer's flow is *start, then send*; everybody replying already holds a `threadId`.

- [ ] **Step 1: Write the failing test**

```ts
it("startThread returns the same thread the second time", async () => {
  const a = await handlers.communicationStartThread({ input: { providerId } }, ctxFor(customerId));
  const b = await handlers.communicationStartThread({ input: { providerId } }, ctxFor(customerId));
  expect(b.id).toBe(a.id);
});

it("send takes the sender from the session, never from the input", async () => {
  await handlers.communicationSend(
    { input: { threadId, body: "olá" }, raw: { senderUserId: "victim" } },
    ctxFor(customerId),
  );
  expect(fakeSend.lastSender).toBe(customerId);
});
```

- [ ] **Step 2: Run, fail, implement, pass**

Same loop as Task 7. Follow `write/review/graphql/` for the shape.

- [ ] **Step 3: Wire both places**

`write/schema.ts` and `private.ts`. Then re-run the schema-mount test and confirm it still passes; comment out the write spread and confirm it reds.

- [ ] **Step 4: Verify on the wire**

Introspect `mutationType` the same way Task 7 introspected `queryType`. Expected: `communicationStartThread`, `communicationSend`, `communicationMarkRead`.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/write apps/backend/api/src/graphql
git commit -m "feat(communication): starting a conversation and answering one"
```

---

## Task 9: The frontend data layer

**Files:**
- Create: `apps/frontend/web/src/features/messaging/domain/types.ts`
- Create: `.../messaging/data/messaging.repository.ts`
- Create: `.../messaging/viewmodel/{use-threads.ts,use-thread.ts,use-send-message.ts}`
- Test: `.../messaging/data/__tests__/messaging.repository.test.ts`

**Interfaces:**
- Produces: `useThreads()` → `{ threads, loading, hasMore, loadMore }`; `useThread(threadId)` → `{ messages, loading, hasMore, loadMore }`; `useSendMessage()` → `{ send, sending }`.

**The polling decision lives here.** `useThread` refetches every 5 seconds while mounted and on window focus; `useThreads` refetches on focus only. Set `refetchInterval` on the thread query, not globally — a list that polls forever costs a request per idle tab.

**Page size must be inside 1..50.** The server rejects anything outside that with `VALIDATION_ERROR` rather than capping it, because zod's `.min`/`.max` reach the emitted schema.

- [ ] **Step 1: Write the failing test**

```ts
it("calls the flattened field, never a nested one", async () => {
  const spy = vi.spyOn(session, "sessionGraphql").mockResolvedValue({ communicationMyThreads: { items: [], nextCursor: null } });
  await fetchThreads({ limit: 20 });
  expect(spy.mock.calls[0][0]).toContain("communicationMyThreads");
  expect(spy.mock.calls[0][0]).not.toContain("communication {");
});
```

Assert against `spy.mock.calls[0][0]` — the real, unmocked query template from the production module. Mocking only the *return* value is what makes this test real.

- [ ] **Step 2: Run, fail, implement, pass**

Follow `features/activity/data/activity.repository.ts` and `features/notifications/data/` for the `infiniteQueryOptions` shape.

- [ ] **Step 3: Prove the fixtures discriminate**

Use at least **two** messages with distinct `createdAt` in every fixture. Then mutate the mapper to `slice(0, 1).reverse()` and confirm a test reds. A one-row fixture cannot tell a correct list from a truncated, reversed one — that exact defect passed a careful implementer and a careful reviewer in the activity phase.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/web/src/features/messaging
git commit -m "feat(messaging): fetching conversations and their messages"
```

---

## Task 10: The customer's inbox, and the way in

**Files:**
- Create: `.../messaging/ui/{thread-list.tsx,thread-view.tsx,message-composer.tsx,customer-messages-page.tsx}`
- Modify: `apps/frontend/web/src/features/account/ui/placeholder-pages.tsx` (drop `MessagesPage`)
- Modify: `apps/frontend/web/src/routes/_customer/messages.tsx`
- Modify: `apps/frontend/web/src/routes/providers.$slug.tsx` (the button)
- Create: `apps/frontend/web/src/shared/locales/*/messaging.json` (eight files)
- Test: `.../messaging/ui/__tests__/{thread-view.test.tsx,message-composer.test.tsx}`

**The way in matters as much as the inbox.** Without the button on `providers.$slug.tsx` the inbox exists and nobody can start a conversation — the same shape of failure as a handler that is written, tested and never mounted. The button calls `communicationStartThread` and navigates to the returned thread.

- [ ] **Step 1: Write the failing tests**

```ts
it("renders a message body as text, never as markup", () => {
  render(<ThreadView messages={[{ ...base, body: "<img src=x onerror=alert(1)>" }]} />);
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
});

it("refuses to send an empty body", async () => {
  render(<MessageComposer onSend={onSend} />);
  await user.click(screen.getByRole("button", { name: /enviar/i }));
  expect(onSend).not.toHaveBeenCalled();
});

it("shows the other side's messages and mine differently", () => {
  render(<ThreadView messages={[mine, theirs]} viewerUserId="u1" />);
  // two messages, distinct timestamps, and the order asserted
});
```

- [ ] **Step 2: Run, fail, implement, pass**

- [ ] **Step 3: Prove the escaping test is real**

Change `ThreadView` to render the body through `dangerouslySetInnerHTML` and confirm a real `<img>` materialises and the test reds. Restore.

`apps/frontend/web/src/shared/lib/i18n.ts:137` sets `interpolation: { escapeValue: false }` — correct for React, and it means safety rests on the value landing in an ordinary JSX text node.

- [ ] **Step 4: Write the copy in eight locales**

New namespace `messaging.json`. Compose each locale from its own verbs rather than translating English, and match each file's existing register — `es-ES` uses *tú*, `fr-FR` uses *vous*, `pt` uses the formal implied *você*, `de-DE`'s account file is split so match the nearer neighbours.

Then add the assertion that no two keys in a locale share a value, and that every `{{placeholder}}` resolves. The existing parity test only asks whether the locales agree *with each other* — it cannot see two English keys colliding, and it cannot see a placeholder that never resolves.

- [ ] **Step 5: Verify the alignment**

The customer pages fill `.page-shell` and must not re-introduce `mx-auto max-w-3xl` — commit `6480a31` removed exactly that because it started the content 276px right of the logo.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(messaging): the customer can write to a provider"
```

---

## Task 11: The provider's inbox

**Files:**
- Create: `.../messaging/ui/provider-messages-page.tsx`
- Create: `apps/frontend/web/src/routes/provider/$slug/messages.tsx`
- Modify: whichever file lists the provider zone's navigation (find it beside `overview`, `services`, `members`)
- Test: `.../messaging/ui/__tests__/provider-messages-page.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it("lists the provider's conversations, newest first", () => {
  // two threads, distinct lastMessageAt, order asserted
});

it("shows an unread count only for the other side's unread messages", () => {
  render(<ProviderMessagesPage threads={[{ ...t, unreadCount: 2 }]} />);
  expect(screen.getByText("2")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run, fail, implement, pass**

- [ ] **Step 3: Add the navigation entry and prove it exists**

A page nobody can navigate to is the same failure as an unmounted handler. Add the entry, then assert in a test that the provider navigation contains a link to `messages`.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(messaging): the provider can answer"
```

---

## Task 12: End to end, and what is left open

**Files:**
- Create: `apps/e2e/tests/messaging.spec.ts`
- Modify: `docs/superpowers/follow-ups.md`

**This is what proves the whole path.** Every layer below has unit tests; none of them can see a sweep that never runs, a field that was never mounted, or an authorization check that only ever met one user.

- [ ] **Step 1: Write the spec**

```ts
test("a customer writes to a provider and the provider sees it", async ({ page, browser }) => {
  const customer = await createVerifiedUser();
  const owner = await createVerifiedUser();
  const providerId = await createProviderFor(owner);

  // customer: sign in, open the provider page, send
  // owner: a second browser context, sign in, open the provider inbox, read it

  await expect(secondPage.getByText(body)).toBeVisible();
});

test("a stranger cannot read the conversation", async () => {
  const stranger = await createVerifiedUser();
  // call communicationThreadMessages with the stranger's session
  // expect a refusal, and the same refusal a missing thread gives
});
```

Clean up in a `finally`: messages, then threads, then the provider, then the users — scoped by id, never a global `DELETE`. The activity phase left an orphaned row precisely because the system wrote something the test did not know it had created.

- [ ] **Step 2: Prove it tests the path**

Comment out `...createCommunicationWriteHandlers` in `private.ts` and confirm the spec fails. Restore, confirm green, and confirm `git status --porcelain` is empty.

A green e2e that survives that mutation is not testing what its name says.

- [ ] **Step 3: Record what is left open**

Add follow-ups (the highest existing entry is **#64**), each with a **Trigger** line matching the file's format:

- Support threads, admin oversight and moderation are phases 2 and 3; phase 3 owes an explicit decision on whether an admin reading a private conversation is logged and disclosed.
- Read receipts are not shown to the sender; the column exists and drives the unread count.
- Attachments are not supported.
- The bell waits up to two minutes along with the email, because one rule covers both channels.
- Per-person unread counts for a multi-staff provider would need a participant table; today reading is a shared act.

- [ ] **Step 4: Commit**

```bash
git add apps/e2e/tests/messaging.spec.ts docs/superpowers/follow-ups.md
git commit -m "test(messaging): prove a message crosses"
```
