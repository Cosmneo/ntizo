# Help Center, Plan A — Support Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a signed-in person (or a provider's member, on the provider's behalf) can open a support request with a subject, the admins are told, an admin can read the queue, reply, and resolve it, and everyone finds the conversation again — all as messaging phase 2 on the tables phase 1 left room for.

**Architecture:** One migration in `ntizo_communication`: `thread.provider_id` goes nullable, `message` gains `sender_side` (`customer | provider | platform`, backfilled), and a new `support_request` table sits 1:1 with a `thread` of `type = 'support'`. A `SupportRequest` aggregate owns the lifecycle (`open` → `resolved`, reopened by a requester's reply); `Thread`, `Message`, attachments, the unread count, the 2-minute sweep and `visibleToViewer` are reused. Admin reads and writes live in new `read/support` / `write/support` slices whose repository methods are all scoped to `type = 'support'`, so no admin path reaches an inquiry.

**Tech Stack:** Bun, Turborepo, Hono on Cloudflare Workers, Drizzle + Neon Postgres in named schemas, onion-lasagna CQRS, GraphQL field kit, `bun test` (backend), vitest (`packages/shared`).

**Spec:** `docs/superpowers/specs/2026-09-02-help-center-design.md` — sections *Data model*, *Domain and use cases*, *Sides, visibility and authorization*, *Notifications*, *GraphQL surface*, *Attachments*, *Errors*, *Testing*. Plan B (frontend) follows this one.

## Global Constraints

- `packages/backend` must NOT import `hono`, `graphql-yoga`, `@cosmneo/onion-lasagna-hono`, or `@cosmneo/onion-lasagna-yoga`. The GraphQL **field kit** IS allowed. Four fitness tests in `packages/backend/src/modules/ntizo/__tests__/` enforce this — run them.
- The GraphQL field kit **flattens nested schema keys**: `{ support: { requests } }` emits on the wire as `supportRequests`. Verify emitted names by introspecting a running server, never by reading source.
- There are **two** schema barrels and both must be edited: `packages/backend/src/modules/ntizo/read/schema.ts` and `packages/backend/src/modules/ntizo/write/schema.ts`. A handler must also be spread into `buildPrivateGraphQLFields` in `apps/backend/api/src/graphql/private.ts`; `apps/backend/api/src/graphql/__tests__/schema-mount.test.ts` fails when a declared field has no handler.
- `ntizo_communication` is **already** in `schemaFilter` (`packages/backend/src/modules/ntizo/drizzle.config.ts`). Do not add it again. The ntizo migration chain is at `0034_wakeful_prowler`; this plan adds exactly one migration, `0035_*`.
- Message body: non-empty after trimming (or at least one attachment), at most **4000** characters — `Message.compose` owns that rule, unchanged. Support subject: non-empty after trimming, at most **120** characters — `SupportRequest` owns it.
- The notify window is **2 minutes** (`NOTIFY_AFTER_MS`), unchanged. The cron interval in `wrangler.jsonc` is unchanged.
- At most **10** open support requests per requester (`MAX_OPEN_SUPPORT_REQUESTS`).
- Contact detection (`hasContact`) runs on inquiry bodies exactly as before and must **not** run on support bodies.
- `sender_side` is written by the command that inserts the message, never inferred from a role: participant commands write the requester's side, admin commands write `platform`.
- Every new error is its own class extending a kit error (`UnprocessableError` / `NotFoundError` from `@cosmneo/onion-lasagna`) with its own `code` — never a bare `Error`, which the GraphQL layer masks to `INTERNAL_ERROR`.
- `packages/backend` and `apps/backend/api` run **`bun test`**; `packages/shared` runs **vitest**. A test importing the wrong runner fails to *load* and reports "(0 test)".
- The dev database is **shared with the user's running application**. Every DB-backed test creates its own rows under a `crypto.randomUUID()` suffix, cleans them up in an `afterAll` that still runs when an assertion fails partway, and never asserts on global counts.
- Gates per touched package: `bun run typecheck` and that package's tests. For lint use `bun run lint --force` at the **repo root** only, or plain `bun run lint` inside a package — never `--force` inside a package.
- Stage by explicit path, never `git add -A`. Do not run `prettier`. Commit messages end with the session's `Co-Authored-By` / `Claude-Session` trailers.
- Known failure that is NOT yours: `catalog-service-search.test.ts` in `packages/backend` is data-dependent against the shared dev database (follow-up #62).

---

## File Structure

**Database** (`packages/backend/src/modules/ntizo/shared/infrastructure/database/communication/`)
- `enums.ts` — `THREAD_TYPES` gains `"support"`; new `SENDER_SIDES`, `SUPPORT_AUDIENCES`, `SUPPORT_STATUSES`
- `schemas/thread.schema.ts` — `provider_id` nullable, `thread_inquiry_has_provider` CHECK
- `schemas/message.schema.ts` — `sender_side` column + CHECK
- `schemas/support-request.schema.ts` — new table
- `schemas/index.ts` — barrel
- `../migrations/0035_*.sql` — generated, then hand-edited for the `sender_side` backfill
- Test: `../__tests__/communication-constraints.test.ts` (exists; extended)

**Bounded context** (`packages/backend/src/modules/ntizo/bounded-contexts/communication/`)
- `domain/aggregates/thread.aggregate.ts` — nullable `providerId`, `Thread.openSupport`
- `domain/aggregates/message.aggregate.ts` — `senderSide`
- `domain/aggregates/support-request.aggregate.ts` — new
- `domain/exceptions.ts` — seven new errors
- `app/ports/outbound/thread.repository.port.ts` — `openSupport`, `findSupportThread`, `type` filter on both lists
- `app/ports/outbound/message.repository.port.ts` — `DueMessage` reshaped, `markReadForPlatform`, `countUnreadForPlatform`
- `app/ports/outbound/attachment.repository.port.ts` — `findOnSupportThread`
- `app/ports/outbound/support-request.repository.port.ts` — new
- `app/ports/outbound/booking-reader.port.ts` — new
- `app/ports/outbound/admin-user-reader.port.ts` — new
- `app/ports/outbound/index.ts` — barrel
- `app/use-cases/resolve-attachments.ts` — extracted from `SendMessageCommand` so three commands share it
- `app/use-cases/open-support-request.command.ts` — new
- `app/use-cases/send-message.command.ts` — side, contact-check skip, reopen
- `app/use-cases/reply-to-support-request.command.ts` — new (admin)
- `app/use-cases/resolve-support-request.command.ts` — new (admin)
- `app/use-cases/mark-support-request-read.command.ts` — new (admin)
- `app/use-cases/notify-unread.internal.command.ts` — recipients by side, admins fan-out
- `infrastructure/repositories/drizzle/thread.repository.ts`, `message.repository.ts`, `attachment.repository.ts` — extended
- `infrastructure/repositories/drizzle/support-request.repository.ts` — new
- `infrastructure/outbound-adapters/cross-bc/booking-reader.adapter.ts`, `admin-user-reader.adapter.ts` — new
- `bootstrap/index.ts`, `index.ts` — wiring and exports
- Tests: `__tests__/aggregates.test.ts`, `__tests__/commands.test.ts`, `__tests__/notify-unread.test.ts`, `__tests__/repositories.test.ts` (extended); `__tests__/support-request.aggregate.test.ts`, `__tests__/support-commands.test.ts`, `__tests__/support-request.repository.test.ts`, `__tests__/cross-bc-readers.test.ts` (new)

**Shared read models and enums** (`packages/shared/src/`)
- `read-models/system/communication/thread.schema.ts`, `message.schema.ts` — new fields
- `read-models/system/support/support-request.schema.ts`, `index.ts` — new; `read-models/system/index.ts` — barrel
- `enums/notification-enums/notification-type.enum.ts` — four types + bucket switch

**Notification templates** (`packages/backend/src/modules/ntizo/bounded-contexts/notification/infrastructure/templates/`)
- `support-request-opened.template.ts`, `support-request-message.template.ts`, `support-reply.template.ts`, `support-request-resolved.template.ts` — new; `registry.ts` — four entries
- Test: `../../__tests__/templates.test.ts` (extended)

**Read tier**
- `read/communication/app/use-cases/conversations.projection.ts`, `graphql/schema/queries.ts`, `graphql/handlers/queries.handlers.ts`, `bootstrap/index.ts` — `type` filter, new row fields
- `read/support/{app/use-cases/support-requests.projection.ts, graphql/schema/queries.ts, graphql/handlers/queries.handlers.ts, bootstrap/index.ts, index.ts}` — new slice
- Tests: `read/communication/__tests__/projections.test.ts` (extended); `read/support/__tests__/{projections.test.ts, queries.handlers.test.ts}` (new)

**Write tier**
- `write/communication/graphql/schema/mutations.ts`, `graphql/handlers/mutations.handlers.ts` — `openSupportRequest`
- `write/support/{graphql/schema/mutations.ts, graphql/handlers/mutations.handlers.ts, index.ts}` — new slice
- Tests: `write/communication/__tests__/mutations.handlers.test.ts` (extended); `write/support/__tests__/mutations.handlers.test.ts` (new)

**Registration and HTTP**
- `read/schema.ts`, `write/schema.ts`, `apps/backend/api/src/graphql/private.ts`
- `apps/backend/api/src/attachments.ts` — admin branch on download
- `docs/superpowers/follow-ups.md` — entries closed and opened

---

## Task 1: The schema and the migration

**Files:**
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/communication/enums.ts`
- Modify: `.../communication/schemas/thread.schema.ts`
- Modify: `.../communication/schemas/message.schema.ts`
- Create: `.../communication/schemas/support-request.schema.ts`
- Modify: `.../communication/schemas/index.ts`
- Create (generated): `packages/backend/src/modules/ntizo/shared/infrastructure/migrations/0035_<name>.sql`
- Test: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/communication-constraints.test.ts`

**Interfaces:**
- Produces: `THREAD_TYPES = ["inquiry", "support"]`, `SENDER_SIDES`, `SUPPORT_AUDIENCES`, `SUPPORT_STATUSES` and their types `ThreadType`, `SenderSide`, `SupportAudience`, `SupportStatus`; drizzle tables `thread` (with `providerId: string | null`), `message` (with `senderSide`), `supportRequest`; row types `SupportRequestRow`, `NewSupportRequestRow`.

- [ ] **Step 1: Widen the enums**

Replace `enums.ts` with:

```ts
/**
 * Phase 1 shipped `inquiry`; phase 2 (this plan) adds `support`. Oversight
 * (phase 3) adds nothing here — an admin reading a private conversation is a
 * question of access, not a new kind of thread.
 */
export const THREAD_TYPES = ["inquiry", "support"] as const;
export type ThreadType = (typeof THREAD_TYPES)[number];

/**
 * Which side of a conversation a message came from, written at send time by
 * the command that inserted it. `customer` and `provider` are the two sides
 * of an inquiry and the requester's side of a support request (by audience);
 * `platform` is an admin answering a support request. Never inferred from
 * the sender's role: a person's role can change, a message's side cannot.
 */
export const SENDER_SIDES = ["customer", "provider", "platform"] as const;
export type SenderSide = (typeof SENDER_SIDES)[number];

/** Who a support request was opened on behalf of: the person, or a provider they belong to. */
export const SUPPORT_AUDIENCES = ["customer", "provider"] as const;
export type SupportAudience = (typeof SUPPORT_AUDIENCES)[number];

/** Two states, on purpose — see the spec's "Domain and use cases". */
export const SUPPORT_STATUSES = ["open", "resolved"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
```

- [ ] **Step 2: Make `provider_id` nullable and add the CHECK**

In `thread.schema.ts`, add `check` to the `drizzle-orm/pg-core` import, change `providerId` and the table's extras:

```ts
import { check, index, pgSchema, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
```

```ts
    // Nullable since phase 2: a personal support request has no provider to
    // point at. An inquiry still always has one — `thread_inquiry_has_provider`
    // below is what lets phase-1 code keep trusting that. A nullable column
    // rather than a sentinel "platform" provider row: DoAzores used an
    // all-zeros workspace id for exactly this and paid for it with
    // short-circuits in two places, one of them a bug found later.
    providerId: uuid("provider_id").references(() => provider.id),
```

```ts
  (t) => [
    uniqueIndex("thread_customer_provider_uq")
      .on(t.customerUserId, t.providerId)
      .where(sql`${t.type} = 'inquiry'`),
    index("idx_thread_customer_recent").on(t.customerUserId, t.lastMessageAt.desc(), t.id.desc()),
    index("idx_thread_provider_recent").on(t.providerId, t.lastMessageAt.desc(), t.id.desc()),
    check("thread_type_known", sql`${t.type} in ('inquiry', 'support')`),
    check("thread_inquiry_has_provider", sql`${t.type} <> 'inquiry' OR ${t.providerId} IS NOT NULL`),
  ],
```

Update the table's doc comment first line to: `One conversation — a customer with a provider (inquiry), or somebody with the platform (support).`

- [ ] **Step 3: Add `sender_side` to `message`**

In `message.schema.ts`, add `check` and `varchar` to the import, add the column after `senderUserId`, and the CHECK to the extras:

```ts
import { check, index, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
```

```ts
    /**
     * Which side this message came from — see `SENDER_SIDES`. Backfilled by
     * migration 0035 for every phase-1 row (`customer` where the sender is the
     * thread's customer, else `provider`), so it can be NOT NULL from day one.
     * What makes "unread for X" one predicate for every thread type: the
     * phase-1 rule resolved "the other side" against `customer_user_id`
     * alone, which cannot describe a provider request (a member must not
     * count a teammate's message as unread) or a platform reply.
     */
    senderSide: varchar("sender_side", { length: 16 }).notNull(),
```

```ts
    check("message_sender_side_known", sql`${t.senderSide} in ('customer', 'provider', 'platform')`),
```

- [ ] **Step 4: Write the `support_request` table**

`support-request.schema.ts`:

```ts
import { check, index, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { communicationSchema, thread } from "./thread.schema";
import { user } from "../../user/schemas/user.schema";
import { booking } from "../../booking/schemas/booking.schema";

/**
 * The lifecycle of a support request — 1:1 with a `thread` of
 * `type = 'support'`, which holds the conversation itself.
 *
 * A second table rather than four nullable columns on `thread`: the thread
 * keeps what every conversation has; subject, status and resolution are
 * support's alone and live under support's name. Inquiries do not grow null
 * columns, and phase-1 code changes only where `provider_id` and
 * `sender_side` force it.
 *
 * `audience` is redundant with `thread.provider_id IS NULL` and kept anyway:
 * a query filtering the admin queue by audience should not have to know that
 * rule.
 */
export const supportRequest = communicationSchema.table(
  "support_request",
  {
    threadId: uuid("thread_id")
      .primaryKey()
      .references(() => thread.id, { onDelete: "cascade" }),
    audience: varchar("audience", { length: 16 }).notNull(),
    subject: varchar("subject", { length: 120 }).notNull(),
    bookingId: uuid("booking_id").references(() => booking.id),
    status: varchar("status", { length: 16 }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: text("resolved_by_user_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("support_request_audience_known", sql`${t.audience} in ('customer', 'provider')`),
    check("support_request_status_known", sql`${t.status} in ('open', 'resolved')`),
    // `open` ⇔ not resolved. A row that says one and carries the other is a
    // bug, and the database is the one place that can refuse it every time.
    check("support_request_resolved_consistent", sql`(${t.status} = 'open') = (${t.resolvedAt} IS NULL)`),
    // The admin queue's "open, oldest first" scan.
    index("idx_support_request_status_created").on(t.status, t.createdAt.desc(), t.threadId.desc()),
  ],
);

export type SupportRequestRow = typeof supportRequest.$inferSelect;
export type NewSupportRequestRow = typeof supportRequest.$inferInsert;
```

- [ ] **Step 5: Export from the barrel**

`schemas/index.ts`:

```ts
export * from "./thread.schema";
export * from "./message.schema";
export * from "./attachment.schema";
export * from "./support-request.schema";
```

(Keep whatever the file already exports; only `support-request.schema` is new.)

- [ ] **Step 6: Generate the migration, then hand-edit the backfill**

Run: `cd packages/backend && bun run db:ntizo:generate`
Expected: a new `0035_<name>.sql` and a new snapshot under `migrations/meta/`. Read the SQL. It must contain, in some order: `ALTER TABLE "ntizo_communication"."thread" ALTER COLUMN "provider_id" DROP NOT NULL`, `ALTER TABLE "ntizo_communication"."message" ADD COLUMN "sender_side" varchar(16) NOT NULL`, `CREATE TABLE "ntizo_communication"."support_request"`, the FK constraints, the index, and five `ADD CONSTRAINT ... CHECK` statements.

The generated `ADD COLUMN "sender_side" varchar(16) NOT NULL` would fail on every existing row. Replace that single statement with these three, keeping the `--> statement-breakpoint` separators:

```sql
ALTER TABLE "ntizo_communication"."message" ADD COLUMN "sender_side" varchar(16);--> statement-breakpoint
UPDATE "ntizo_communication"."message" m SET "sender_side" = CASE WHEN m."sender_user_id" = t."customer_user_id" THEN 'customer' ELSE 'provider' END FROM "ntizo_communication"."thread" t WHERE t."id" = m."thread_id";--> statement-breakpoint
ALTER TABLE "ntizo_communication"."message" ALTER COLUMN "sender_side" SET NOT NULL;--> statement-breakpoint
```

The `UPDATE` must come before both `SET NOT NULL` and the `message_sender_side_known` CHECK. The snapshot is untouched — it describes the end state, which is the same.

- [ ] **Step 7: Apply to the dev database**

Run: `cd packages/backend && bun run db:ntizo:dev:migrate`
Expected: exit 0, one migration applied. Confirm with a query through any client: `SELECT count(*) FROM ntizo_communication.message WHERE sender_side IS NULL` must be 0.

- [ ] **Step 8: Extend the constraints test**

In `communication-constraints.test.ts`, add `supportRequest` to the schema imports and append three tests inside the existing `describe`. Reuse the file's `userId`, `providerId`, `suffix`, `db`, `sql` and its cleanup lists — follow how the existing tests insert a thread and register it for cleanup.

```ts
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
```

If the file tracks threads for cleanup under a different name than `createdThreadIds`, use that name. Threads cascade to `support_request` and `message`, so deleting the thread rows in `afterAll` is enough.

- [ ] **Step 9: Run and commit**

Run: `cd packages/backend && bun run typecheck`
Expected: **failures** in `thread.repository.ts` (rehydrating `providerId: string | null` into `ThreadProps.providerId: string`), `message.repository.ts` (`insert` missing `senderSide`; `claimDueForNotice` returning a nullable `providerId`), `conversations.projection.ts`, and the tests that call `Message.compose`. That is expected — Tasks 2 and 3 fix them. Do not "fix" them here by widening types with casts.

Run: `bun test src/modules/ntizo/shared/infrastructure/database/__tests__/communication-constraints.test.ts`
Expected: PASS (bun runs the file even while `tsc` is red elsewhere).

```bash
git add packages/backend/src/modules/ntizo/shared/infrastructure/database/communication packages/backend/src/modules/ntizo/shared/infrastructure/migrations packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/communication-constraints.test.ts
git commit -m "feat(communication): a support request beside a thread, and which side a message came from"
```

---

## Task 2: The aggregates and the errors

**Files:**
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/communication/domain/aggregates/thread.aggregate.ts`
- Modify: `.../communication/domain/aggregates/message.aggregate.ts`
- Create: `.../communication/domain/aggregates/support-request.aggregate.ts`
- Modify: `.../communication/domain/exceptions.ts`
- Test: `.../communication/__tests__/aggregates.test.ts` (extend), `.../communication/__tests__/support-request.aggregate.test.ts` (new)

**Interfaces:**
- Consumes: Task 1's `ThreadType`, `SenderSide`, `SupportAudience`, `SupportStatus`.
- Produces: `ThreadProps.providerId: string | null`; `Thread.openSupport({ customerUserId, providerId, now })`; `MessageProps.senderSide: SenderSide` and `Message.compose({ threadId, senderUserId, senderSide, body, attachmentCount?, now })`; `SupportRequest` with `open`, `rehydrate`, `resolve(byUserId, now)`, `reopen()`, `normaliseSubject(subject)`, `SUPPORT_SUBJECT_MAX = 120`, `MAX_OPEN_SUPPORT_REQUESTS = 10`; errors `SupportSubjectInvalidError` (`SUPPORT_SUBJECT_INVALID`), `SupportNotAMemberError` (`SUPPORT_NOT_A_MEMBER`), `SupportBookingNotYoursError` (`SUPPORT_BOOKING_NOT_YOURS`), `SupportRequestNotFoundError` (`SUPPORT_REQUEST_NOT_FOUND`), `SupportAlreadyResolvedError` (`SUPPORT_ALREADY_RESOLVED`), `SupportRequestNotResolvedError` (`SUPPORT_NOT_RESOLVED`), `SupportTooManyOpenError` (`SUPPORT_TOO_MANY_OPEN`).

- [ ] **Step 1: Write the failing aggregate tests**

Append to `aggregates.test.ts` (it already imports `Thread` and `Message`):

```ts
describe("Thread.openSupport", () => {
  it("opens a personal request with no provider", () => {
    const t = Thread.openSupport({ customerUserId: "u1", providerId: null, now: NOW });
    expect(t.type).toBe("support");
    expect(t.providerId).toBeNull();
    expect(t.customerUserId).toBe("u1");
    expect(t.lastMessageAt).toEqual(NOW);
    expect(t.createdAt).toEqual(NOW);
  });

  it("opens a provider request carrying the provider", () => {
    const t = Thread.openSupport({ customerUserId: "member-1", providerId: "p1", now: NOW });
    expect(t.type).toBe("support");
    expect(t.providerId).toBe("p1");
  });
});

describe("Message.compose carries a side", () => {
  it("stores the side it was given", () => {
    const m = Message.compose({ threadId: "t", senderUserId: "u", senderSide: "platform", body: "hi", now: NOW });
    expect(m.senderSide).toBe("platform");
  });
});
```

If the file has no `NOW` constant, add `const NOW = new Date("2026-09-02T10:00:00.000Z");` at the top.

Create `support-request.aggregate.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  SupportRequest,
  SUPPORT_SUBJECT_MAX,
} from "../domain/aggregates/support-request.aggregate";
import {
  SupportAlreadyResolvedError,
  SupportRequestNotResolvedError,
  SupportSubjectInvalidError,
} from "../domain/exceptions";

const NOW = new Date("2026-09-02T10:00:00.000Z");
const LATER = new Date("2026-09-02T11:00:00.000Z");

function open(subject = "O prestador não apareceu") {
  return SupportRequest.open({ threadId: "t1", audience: "customer", subject, bookingId: null, now: NOW });
}

describe("opening", () => {
  it("trims the subject and starts open", () => {
    const r = open("  Reembolso  ");
    expect(r.subject).toBe("Reembolso");
    expect(r.status).toBe("open");
    expect(r.resolvedAt).toBeNull();
    expect(r.resolvedByUserId).toBeNull();
    expect(r.createdAt).toEqual(NOW);
  });

  it("refuses an empty subject", () => {
    expect(() => open("   ")).toThrow(SupportSubjectInvalidError);
  });

  it("refuses a subject over the limit, measured after trimming", () => {
    expect(() => open(" " + "x".repeat(SUPPORT_SUBJECT_MAX) + " ")).not.toThrow();
    expect(() => open("x".repeat(SUPPORT_SUBJECT_MAX + 1))).toThrow(SupportSubjectInvalidError);
  });

  it("normaliseSubject is the same rule, callable before a thread exists", () => {
    expect(SupportRequest.normaliseSubject("  a ")).toBe("a");
    expect(() => SupportRequest.normaliseSubject("")).toThrow(SupportSubjectInvalidError);
  });
});

describe("resolving and reopening", () => {
  it("resolve records who and when", () => {
    const r = open().resolve("admin-1", LATER);
    expect(r.status).toBe("resolved");
    expect(r.resolvedAt).toEqual(LATER);
    expect(r.resolvedByUserId).toBe("admin-1");
  });

  it("resolve twice is refused", () => {
    const r = open().resolve("admin-1", LATER);
    expect(() => r.resolve("admin-2", LATER)).toThrow(SupportAlreadyResolvedError);
  });

  it("reopen clears the resolution", () => {
    const r = open().resolve("admin-1", LATER).reopen();
    expect(r.status).toBe("open");
    expect(r.resolvedAt).toBeNull();
    expect(r.resolvedByUserId).toBeNull();
  });

  it("reopen on an open request is refused", () => {
    expect(() => open().reopen()).toThrow(SupportRequestNotResolvedError);
  });

  it("rehydrate trusts the row", () => {
    const r = SupportRequest.rehydrate({
      threadId: "t1",
      audience: "provider",
      subject: "",
      bookingId: "b1",
      status: "resolved",
      resolvedAt: LATER,
      resolvedByUserId: "admin-1",
      createdAt: NOW,
    });
    expect(r.subject).toBe("");
    expect(r.audience).toBe("provider");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication/__tests__/support-request.aggregate.test.ts src/modules/ntizo/bounded-contexts/communication/__tests__/aggregates.test.ts`
Expected: FAIL — `support-request.aggregate` module not found; `openSupport` is not a function.

- [ ] **Step 3: Add the errors**

Append to `exceptions.ts` (add `NotFoundError` to the `@cosmneo/onion-lasagna` import):

```ts
/** Refused because the subject is empty after trimming, or longer than `SUPPORT_SUBJECT_MAX`. */
export class SupportSubjectInvalidError extends UnprocessableError {
  constructor(
    public readonly length: number,
    public readonly max: number,
  ) {
    super({
      message:
        length === 0
          ? "A support request needs a subject."
          : `A subject may be at most ${max} characters; this one is ${length}.`,
      code: "SUPPORT_SUBJECT_INVALID",
    });
    this.name = "SupportSubjectInvalidError";
  }
}

/** Refused because the caller asked to speak for a provider they are not a member of — or named no provider at all. */
export class SupportNotAMemberError extends UnprocessableError {
  constructor() {
    super({
      message: "You can only open a request on behalf of a provider you belong to.",
      code: "SUPPORT_NOT_A_MEMBER",
    });
    this.name = "SupportNotAMemberError";
  }
}

/** Refused because the booking named is not the requester's — same answer as "no such booking", on purpose. */
export class SupportBookingNotYoursError extends UnprocessableError {
  constructor() {
    super({
      message: "That booking is not yours to ask about.",
      code: "SUPPORT_BOOKING_NOT_YOURS",
    });
    this.name = "SupportBookingNotYoursError";
  }
}

/**
 * The admin side's refusal: the id names no support request. Deliberately
 * also the answer for an id that names an *inquiry* thread — the admin
 * slices are scoped to `type = 'support'`, and an admin must not learn from
 * the difference that a private conversation exists at that id.
 */
export class SupportRequestNotFoundError extends NotFoundError {
  constructor() {
    super({
      message: "No such support request.",
      code: "SUPPORT_REQUEST_NOT_FOUND",
    });
    this.name = "SupportRequestNotFoundError";
  }
}

export class SupportAlreadyResolvedError extends UnprocessableError {
  constructor() {
    super({
      message: "This request is already resolved.",
      code: "SUPPORT_ALREADY_RESOLVED",
    });
    this.name = "SupportAlreadyResolvedError";
  }
}

/** A domain guard: `reopen` only makes sense on a resolved request. Never reaches the wire — `SendMessageCommand` checks the status first. */
export class SupportRequestNotResolvedError extends UnprocessableError {
  constructor() {
    super({
      message: "This request is not resolved, so it cannot be reopened.",
      code: "SUPPORT_NOT_RESOLVED",
    });
    this.name = "SupportRequestNotResolvedError";
  }
}

export class SupportTooManyOpenError extends UnprocessableError {
  constructor(public readonly max: number) {
    super({
      message: `You already have ${max} open requests. Wait for an answer, or reply on one of them.`,
      code: "SUPPORT_TOO_MANY_OPEN",
    });
    this.name = "SupportTooManyOpenError";
  }
}
```

- [ ] **Step 4: Write the `SupportRequest` aggregate**

`support-request.aggregate.ts`:

```ts
import type {
  SupportAudience,
  SupportStatus,
} from "../../../../shared/infrastructure/database/communication/enums";
import {
  SupportAlreadyResolvedError,
  SupportRequestNotResolvedError,
  SupportSubjectInvalidError,
} from "../exceptions";

/** Matches the `varchar(120)` on `support_request.subject`. */
export const SUPPORT_SUBJECT_MAX = 120;

/**
 * How many requests one requester may have open at once — a cheap abuse
 * guard, not a product rule. A person with ten unanswered requests has a
 * problem this limit does not solve, and one who reaches it is told to reply
 * on one of them instead.
 */
export const MAX_OPEN_SUPPORT_REQUESTS = 10;

export interface SupportRequestProps {
  readonly threadId: string;
  readonly audience: SupportAudience;
  readonly subject: string;
  readonly bookingId: string | null;
  readonly status: SupportStatus;
  readonly resolvedAt: Date | null;
  readonly resolvedByUserId: string | null;
  readonly createdAt: Date;
}

/**
 * The lifecycle of a support request. The conversation itself is the
 * `Thread` this points at; this holds only what an inquiry does not have —
 * a subject and whether the platform considers it done.
 *
 * Two states. `resolve` is the admin's act; `reopen` is what a requester's
 * reply does to a resolved request, in `SendMessageCommand`. There is no
 * separate "reopen" mutation and no third state: two are enough for a
 * queue, and a third is a product decision to take when the queue asks for
 * it.
 *
 * Same `open` / `rehydrate` split as `Thread` and `Message`, for the same
 * reason: the write path validates today's rule, the read path trusts what
 * was valid when it was written.
 *
 * Transitions return a new instance rather than mutating — `props` is
 * readonly all the way down, and a repository `save` takes the instance it
 * is handed, so there is no shared object to get half-updated.
 */
export class SupportRequest {
  private constructor(readonly props: SupportRequestProps) {}

  /**
   * The subject rule, callable on its own so a command can refuse a bad
   * subject *before* it opens a transaction and inserts a thread — the same
   * cheap-check-first ordering `SendMessageCommand` uses for the body.
   */
  static normaliseSubject(subject: string): string {
    const trimmed = subject.trim();
    if (trimmed.length === 0 || trimmed.length > SUPPORT_SUBJECT_MAX) {
      throw new SupportSubjectInvalidError(trimmed.length, SUPPORT_SUBJECT_MAX);
    }
    return trimmed;
  }

  static open(params: {
    threadId: string;
    audience: SupportAudience;
    subject: string;
    bookingId: string | null;
    now: Date;
  }): SupportRequest {
    return new SupportRequest({
      threadId: params.threadId,
      audience: params.audience,
      subject: SupportRequest.normaliseSubject(params.subject),
      bookingId: params.bookingId,
      status: "open",
      resolvedAt: null,
      resolvedByUserId: null,
      createdAt: params.now,
    });
  }

  static rehydrate(props: SupportRequestProps): SupportRequest {
    return new SupportRequest(props);
  }

  resolve(byUserId: string, now: Date): SupportRequest {
    if (this.props.status === "resolved") throw new SupportAlreadyResolvedError();
    return new SupportRequest({
      ...this.props,
      status: "resolved",
      resolvedAt: now,
      resolvedByUserId: byUserId,
    });
  }

  reopen(): SupportRequest {
    if (this.props.status !== "resolved") throw new SupportRequestNotResolvedError();
    return new SupportRequest({
      ...this.props,
      status: "open",
      resolvedAt: null,
      resolvedByUserId: null,
    });
  }

  get threadId(): string {
    return this.props.threadId;
  }
  get audience(): SupportAudience {
    return this.props.audience;
  }
  get subject(): string {
    return this.props.subject;
  }
  get bookingId(): string | null {
    return this.props.bookingId;
  }
  get status(): SupportStatus {
    return this.props.status;
  }
  get resolvedAt(): Date | null {
    return this.props.resolvedAt;
  }
  get resolvedByUserId(): string | null {
    return this.props.resolvedByUserId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
```

- [ ] **Step 5: Widen `Thread`**

In `thread.aggregate.ts`: change `ThreadProps.providerId` to `readonly providerId: string | null;`, the getter to `get providerId(): string | null`, keep `open` exactly as it is (its `providerId: string` parameter stays — an inquiry always has one), and add after `open`:

```ts
  /**
   * A support request's conversation. `providerId` is the provider the
   * request is opened on behalf of, or `null` for a personal one — the
   * caller (`OpenSupportRequestCommand`) has already checked membership
   * when it is not null. No `ThreadTypeInvalidError` path: the type is fixed
   * here, not passed in.
   */
  static openSupport(params: {
    customerUserId: string;
    providerId: string | null;
    now: Date;
  }): Thread {
    return new Thread({
      id: null,
      type: "support",
      customerUserId: params.customerUserId,
      providerId: params.providerId,
      lastMessageAt: params.now,
      createdAt: params.now,
    });
  }
```

Update the class doc comment's first line to `One conversation — customer with provider, or somebody with the platform.`

- [ ] **Step 6: Give `Message` a side**

In `message.aggregate.ts`: import `SenderSide` (`import type { SenderSide } from "../../../../shared/infrastructure/database/communication/enums";`), add `readonly senderSide: SenderSide;` to `MessageProps` after `senderUserId`, add `senderSide: SenderSide;` to `compose`'s params (required, no default — every call site must say which side, and `tsc` is what finds the ones that don't), carry it into the constructed props, and add the getter:

```ts
  get senderSide(): SenderSide {
    return this.props.senderSide;
  }
```

- [ ] **Step 7: Fix the existing call sites of `Message.compose` and `Message.rehydrate`**

`tsc` now lists them. In `send-message.command.ts` pass `senderSide: "customer"` **for now** (Task 5 replaces this with the real resolution); in `__tests__/commands.test.ts`, `__tests__/repositories.test.ts`, `__tests__/aggregates.test.ts` and `read/communication/__tests__/projections.test.ts` (its `message()` helper rehydrates — add `senderSide: "customer"` to its defaults) add a `senderSide` to each `compose`/`rehydrate` call: `"customer"` where the sender is the customer fixture, `"provider"` where it is a member. Leave `message.repository.ts` alone — Task 3 rewrites it.

- [ ] **Step 8: Run and commit**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication/__tests__/support-request.aggregate.test.ts src/modules/ntizo/bounded-contexts/communication/__tests__/aggregates.test.ts`
Expected: PASS. `bun run typecheck` still fails in the repositories and projection (Task 3) — nowhere else.

Stage the six files under `bounded-contexts/communication/domain/`, the three test files above, `send-message.command.ts`, and `read/communication/__tests__/projections.test.ts`, then commit:

`feat(communication): the support request aggregate, and a side on every message`

---

## Task 3: The ports and the repositories

**Files:**
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/communication/app/ports/outbound/thread.repository.port.ts`
- Modify: `.../app/ports/outbound/message.repository.port.ts`
- Modify: `.../app/ports/outbound/attachment.repository.port.ts`
- Create: `.../app/ports/outbound/support-request.repository.port.ts`
- Modify: `.../app/ports/outbound/index.ts`
- Modify: `.../infrastructure/repositories/drizzle/thread.repository.ts`
- Modify: `.../infrastructure/repositories/drizzle/message.repository.ts`
- Modify: `.../infrastructure/repositories/drizzle/attachment.repository.ts`
- Create: `.../infrastructure/repositories/drizzle/support-request.repository.ts`
- Test: `.../__tests__/repositories.test.ts` (extend), `.../__tests__/support-request.repository.test.ts` (new)

**Interfaces:**
- Consumes: Task 1 tables and enums; Task 2 aggregates.
- Produces:
  - `ThreadRepositoryPort.openSupport(customerUserId: string, providerId: string | null, now: Date): Promise<string>`; `findSupportThread(threadId: string): Promise<ThreadRow | null>`; `listForCustomer(customerUserId, limit, cursor, type?: ThreadType)`; `listForProvider(providerId, limit, cursor, type?: ThreadType)`.
  - `DueMessage = { id, threadId, threadType: ThreadType, senderSide: SenderSide, customerUserId, providerId: string | null, subject: string | null }`; `MessageRepositoryPort.markReadForPlatform(threadId, at): Promise<number>`; `countUnreadForPlatform(threadIds): Promise<Map<string, number>>`.
  - `AttachmentRepositoryPort.findOnSupportThread(attachmentId): Promise<AttachmentRow | null>`.
  - `SupportRequestRepositoryPort` (below) and `DrizzleSupportRequestRepository`.

- [ ] **Step 1: Write the support-request repository port**

`support-request.repository.port.ts`:

```ts
import type {
  SupportAudience,
  SupportStatus,
} from "../../../../../shared/infrastructure/database/communication/enums";
import type { SupportRequest } from "../../../domain/aggregates/support-request.aggregate";

/**
 * One row of the admin queue — the request joined to its thread, because
 * the queue orders by the thread's `last_message_at` and the request table
 * does not carry it. Names are resolved by the read tier, not here.
 */
export interface SupportRequestListItem {
  threadId: string;
  audience: SupportAudience;
  subject: string;
  status: SupportStatus;
  bookingId: string | null;
  /** The user who opened it — `thread.customer_user_id`. */
  requesterUserId: string;
  /** `thread.provider_id`: set for a provider request, null for a personal one. */
  providerId: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface SupportRequestPage {
  items: SupportRequestListItem[];
  nextCursor: string | null;
}

export interface SupportRequestFilter {
  status?: SupportStatus | undefined;
  audience?: SupportAudience | undefined;
}

export interface SupportRequestRepositoryPort {
  /** Called inside `OpenSupportRequestCommand`'s transaction, after the thread row exists. */
  insert(request: SupportRequest): Promise<void>;

  /** Null when no support request has this thread id — including when the id names an inquiry. */
  findByThreadId(threadId: string): Promise<SupportRequest | null>;

  /** Batched for a page of threads; a thread absent from the map is not a support request. */
  findByThreadIds(threadIds: string[]): Promise<Map<string, SupportRequest>>;

  /** Writes `status`, `resolved_at`, `resolved_by_user_id` from the aggregate handed in. */
  save(request: SupportRequest): Promise<void>;

  /**
   * How many open requests this requester has: for a personal request the
   * user's own (`provider_id IS NULL`); for a provider request the
   * provider's, whichever member opened them — the cap is shared, because
   * the requests are.
   */
  countOpenForRequester(customerUserId: string, providerId: string | null): Promise<number>;

  /** The admin queue, newest last-message first, cursor `<ISO>|<threadId>`. */
  listForAdmin(filter: SupportRequestFilter, limit: number, cursor: string | null): Promise<SupportRequestPage>;

  /** One queue row, or null when the id is not a support request. */
  findListItem(threadId: string): Promise<SupportRequestListItem | null>;

  /** Open requests across the platform — the admin nav badge. */
  countOpen(): Promise<number>;
}
```

- [ ] **Step 2: Extend the thread and message ports**

In `thread.repository.port.ts`, import `ThreadType` from the enums module and add to the interface:

```ts
  /**
   * Opens a support thread. No upsert and no uniqueness: a person may have
   * several open requests, so this is a plain insert. Returns the new id.
   * Called inside `OpenSupportRequestCommand`'s transaction.
   */
  openSupport(customerUserId: string, providerId: string | null, now: Date): Promise<string>;

  /**
   * The thread, only if it is a support thread — no viewer check, because
   * the callers are the admin commands, whose handler has already proven
   * the role. Null for an inquiry id as much as for a missing one: an admin
   * must not learn from the difference that a private conversation exists.
   */
  findSupportThread(threadId: string): Promise<ThreadRow | null>;
```

and change the two list signatures to take an optional type:

```ts
  /**
   * The customer's inbox. Personal only: inquiries, and support requests
   * with no provider. A provider request the same person opened on the
   * provider's behalf is the provider's, and lists in `listForProvider`.
   * `type` narrows to one kind when given.
   */
  listForCustomer(customerUserId: string, limit: number, cursor: string | null, type?: ThreadType): Promise<ThreadPage>;

  /** One provider's inbox: inquiries to it and support requests opened on its behalf. `type` narrows to one kind. */
  listForProvider(providerId: string, limit: number, cursor: string | null, type?: ThreadType): Promise<ThreadPage>;
```

In `message.repository.port.ts`, import `SenderSide` and `ThreadType`, replace `DueMessage`:

```ts
/**
 * A message the sweep must tell somebody about: due, still unread, not yet
 * notified. Carries what `NotifyUnreadInternalCommand` needs to pick the
 * recipient side and the notification type — never the body.
 */
export interface DueMessage {
  id: string;
  threadId: string;
  threadType: ThreadType;
  senderSide: SenderSide;
  customerUserId: string;
  /** Null on a personal support request. */
  providerId: string | null;
  /** The support request's subject; null on an inquiry. Rides into the notification payload. */
  subject: string | null;
}
```

update `markReadForViewer`'s doc comment to say "Side" is resolved from `sender_side` against the side `viewerUserId` is on — the customer of an inquiry or personal request is `customer`, anybody else who can see it is `provider` — and add two methods:

```ts
  /** The platform side reading a support request: marks every unread message not sent by `platform`. */
  markReadForPlatform(threadId: string, at: Date): Promise<number>;

  /** Unread-for-the-platform counts per thread — the admin queue's badge. Absent means zero. */
  countUnreadForPlatform(threadIds: string[]): Promise<Map<string, number>>;
```

In `attachment.repository.port.ts` add:

```ts
  /**
   * The attachment, if its message sits on a support thread — no viewer
   * check. For the admin branch of the download route only, after the
   * caller's role has been proven; the participant path stays `findVisible`.
   */
  findOnSupportThread(attachmentId: string): Promise<AttachmentRow | null>;
```

In `ports/outbound/index.ts` add:

```ts
export type {
  SupportRequestFilter,
  SupportRequestListItem,
  SupportRequestPage,
  SupportRequestRepositoryPort,
} from "./support-request.repository.port";
```

- [ ] **Step 3: Write the failing repository tests**

Create `support-request.repository.test.ts`. It follows `repositories.test.ts`'s fixture discipline exactly (a `suffix`, users and providers created in `beforeAll`, cleanup in `afterAll` by id, `__runWithTransactionContextForTests` around every repository call because `getDb()` reads the request-scoped connection). Copy that file's imports and its `makeProvider` / `newUser` helpers, then:

```ts
import { SupportRequest } from "../domain/aggregates/support-request.aggregate";
import { Message } from "../domain/aggregates/message.aggregate";
import { DrizzleThreadRepository } from "../infrastructure/repositories/drizzle/thread.repository";
import { DrizzleMessageRepository } from "../infrastructure/repositories/drizzle/message.repository";
import { DrizzleSupportRequestRepository } from "../infrastructure/repositories/drizzle/support-request.repository";
import { supportRequest } from "../../../shared/infrastructure/database/communication/schemas";

const threads = new DrizzleThreadRepository();
const messages = new DrizzleMessageRepository();
const requests = new DrizzleSupportRequestRepository();
const NOW = new Date("2026-09-02T10:00:00.000Z");

const run = <T>(fn: () => Promise<T>) => __runWithTransactionContextForTests(db, fn);

let customerId: string;
let memberId: string;
let adminId: string;
let providerId: string;
const threadIds: string[] = [];

async function openPersonal(subject: string, at = NOW): Promise<string> {
  return run(async () => {
    const id = await threads.openSupport(customerId, null, at);
    threadIds.push(id);
    await requests.insert(SupportRequest.open({ threadId: id, audience: "customer", subject, bookingId: null, now: at }));
    await messages.insert(Message.compose({ threadId: id, senderUserId: customerId, senderSide: "customer", body: subject, now: at }));
    return id;
  });
}

async function openForProvider(subject: string, at = NOW): Promise<string> {
  return run(async () => {
    const id = await threads.openSupport(memberId, providerId, at);
    threadIds.push(id);
    await requests.insert(SupportRequest.open({ threadId: id, audience: "provider", subject, bookingId: null, now: at }));
    await messages.insert(Message.compose({ threadId: id, senderUserId: memberId, senderSide: "provider", body: subject, now: at }));
    return id;
  });
}

beforeAll(async () => {
  customerId = newUser();
  memberId = newUser();
  adminId = newUser();
  await db.insert(user).values([
    { id: customerId, email: `sr-c-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: memberId, email: `sr-m-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: adminId, email: `sr-a-${suffix}@ntizo.test`, role: "admin", status: "active" },
  ]);
  providerId = await makeProvider(memberId, "sr");
  await db.insert(providerMember).values({ providerId, userId: memberId, role: "owner" });
});

afterAll(async () => {
  // Threads cascade to support_request and message.
  if (threadIds.length > 0) await db.delete(thread).where(inArray(thread.id, threadIds));
  await db.delete(providerMember).where(eq(providerMember.providerId, providerId));
  await db.delete(provider).where(eq(provider.id, providerId));
  await db.delete(user).where(inArray(user.id, userIds));
  await sql.end();
});

describe("open and find", () => {
  test("a personal request round-trips, and an inquiry id is not a support request", async () => {
    const id = await openPersonal("Reembolso");
    const found = await run(() => requests.findByThreadId(id));
    expect(found?.subject).toBe("Reembolso");
    expect(found?.status).toBe("open");
    expect(found?.audience).toBe("customer");

    const t = await run(() => threads.findSupportThread(id));
    expect(t?.type).toBe("support");
    expect(t?.providerId).toBeNull();

    // An inquiry thread must be invisible to every support-scoped read.
    const inquiryId = await run(async () => (await threads.openOrFind(customerId, providerId, NOW)).id);
    threadIds.push(inquiryId);
    expect(await run(() => threads.findSupportThread(inquiryId))).toBeNull();
    expect(await run(() => requests.findByThreadId(inquiryId))).toBeNull();
    expect(await run(() => requests.findListItem(inquiryId))).toBeNull();
  });

  test("save persists a resolution, and findByThreadIds batches", async () => {
    const a = await openPersonal("A");
    const b = await openPersonal("B");
    const resolved = (await run(() => requests.findByThreadId(a)))!.resolve(adminId, NOW);
    await run(() => requests.save(resolved));

    const byId = await run(() => requests.findByThreadIds([a, b, crypto.randomUUID()]));
    expect(byId.get(a)?.status).toBe("resolved");
    expect(byId.get(a)?.resolvedByUserId).toBe(adminId);
    expect(byId.get(b)?.status).toBe("open");
    expect(byId.size).toBe(2);
  });
});

describe("the open-request cap", () => {
  test("counts a person's own personal requests, and a provider's requests whoever opened them", async () => {
    const personalBefore = await run(() => requests.countOpenForRequester(customerId, null));
    const providerBefore = await run(() => requests.countOpenForRequester(memberId, providerId));
    await openPersonal("cap-1");
    await openForProvider("cap-2");
    expect(await run(() => requests.countOpenForRequester(customerId, null))).toBe(personalBefore + 1);
    expect(await run(() => requests.countOpenForRequester(memberId, providerId))).toBe(providerBefore + 1);
    // The member's PERSONAL count is unaffected by the provider request they opened.
    expect(await run(() => requests.countOpenForRequester(memberId, null))).toBe(0);
  });
});

describe("inboxes by side", () => {
  test("listForCustomer hides a provider request from the member who opened it; listForProvider shows it", async () => {
    const id = await openForProvider("Comissão");
    const personal = await run(() => threads.listForCustomer(memberId, 50, null));
    expect(personal.items.map((t) => t.id)).not.toContain(id);
    const providers = await run(() => threads.listForProvider(providerId, 50, null, "support"));
    expect(providers.items.map((t) => t.id)).toContain(id);
    const inquiriesOnly = await run(() => threads.listForProvider(providerId, 50, null, "inquiry"));
    expect(inquiriesOnly.items.map((t) => t.id)).not.toContain(id);
  });

  test("listForCustomer(type: 'support') returns only support", async () => {
    const id = await openPersonal("Só suporte");
    const page = await run(() => threads.listForCustomer(customerId, 50, null, "support"));
    expect(page.items.map((t) => t.id)).toContain(id);
    expect(page.items.every((t) => t.type === "support")).toBe(true);
  });
});

describe("unread, by side", () => {
  test("a teammate's message is not unread for another member; a platform reply is", async () => {
    const id = await openForProvider("Equipa");
    const teammateId = newUser();
    await db.insert(user).values({ id: teammateId, email: `sr-t-${suffix}@ntizo.test`, role: "customer", status: "active" });
    await db.insert(providerMember).values({ providerId, userId: teammateId, role: "staff" });

    // The opener's first message: not unread for the teammate (same side).
    expect((await run(() => messages.countUnreadForViewer([id], teammateId))).get(id)).toBeUndefined();
    // …but unread for the platform.
    expect((await run(() => messages.countUnreadForPlatform([id]))).get(id)).toBe(1);

    await run(() => messages.insert(Message.compose({ threadId: id, senderUserId: adminId, senderSide: "platform", body: "Olá", now: NOW })));
    expect((await run(() => messages.countUnreadForViewer([id], teammateId))).get(id)).toBe(1);
    expect((await run(() => messages.countUnreadForViewer([id], memberId))).get(id)).toBe(1);

    // The platform reading marks only the requester side's messages.
    expect(await run(() => messages.markReadForPlatform(id, NOW))).toBe(1);
    expect((await run(() => messages.countUnreadForPlatform([id]))).get(id)).toBeUndefined();
    // A member reading marks the platform reply.
    expect(await run(() => messages.markReadForViewer(id, teammateId, NOW))).toBe(1);
    expect((await run(() => messages.countUnreadForViewer([id], memberId))).get(id)).toBeUndefined();
  });

  test("on a personal request the customer sees a platform reply as unread and nothing else", async () => {
    const id = await openPersonal("Pessoal");
    expect((await run(() => messages.countUnreadForViewer([id], customerId))).get(id)).toBeUndefined();
    await run(() => messages.insert(Message.compose({ threadId: id, senderUserId: adminId, senderSide: "platform", body: "Resposta", now: NOW })));
    expect((await run(() => messages.countUnreadForViewer([id], customerId))).get(id)).toBe(1);
  });
});

describe("the sweep's claim", () => {
  test("carries the thread type, the side, and the subject", async () => {
    const id = await openPersonal("Claim");
    const due = await run(() => messages.claimDueForNotice(500, new Date(NOW.getTime() + 10 * 60_000)));
    const mine = due.find((m) => m.threadId === id);
    expect(mine).toMatchObject({ threadType: "support", senderSide: "customer", customerUserId: customerId, providerId: null, subject: "Claim" });
  });
});

describe("the admin queue", () => {
  test("filters by status and audience, orders by last message, and pages", async () => {
    const older = await openForProvider("Old", new Date("2026-09-01T09:00:00.000Z"));
    const newer = await openPersonal("New", new Date("2026-09-01T10:00:00.000Z"));
    const resolvedId = await openPersonal("Done", new Date("2026-09-01T11:00:00.000Z"));
    await run(async () => requests.save((await requests.findByThreadId(resolvedId))!.resolve(adminId, NOW)));

    const open = await run(() => requests.listForAdmin({ status: "open" }, 500, null));
    const ids = open.items.map((i) => i.threadId);
    expect(ids).toContain(older);
    expect(ids).toContain(newer);
    expect(ids).not.toContain(resolvedId);
    expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));

    const providerOnly = await run(() => requests.listForAdmin({ status: "open", audience: "provider" }, 500, null));
    expect(providerOnly.items.every((i) => i.audience === "provider")).toBe(true);
    expect(providerOnly.items.map((i) => i.threadId)).toContain(older);

    const resolved = await run(() => requests.listForAdmin({ status: "resolved" }, 500, null));
    expect(resolved.items.map((i) => i.threadId)).toContain(resolvedId);
    expect(resolved.items.find((i) => i.threadId === resolvedId)?.resolvedAt).not.toBeNull();

    // Paging: one at a time through everything this test can see, no repeats, no gaps.
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof requests.listForAdmin>> = await run(() => requests.listForAdmin({}, 1, cursor));
      seen.push(...page.items.map((i) => i.threadId));
      cursor = page.nextCursor;
    } while (cursor && seen.length < 200);
    expect(new Set(seen).size).toBe(seen.length);
    for (const id of [older, newer, resolvedId]) expect(seen).toContain(id);
  });

  test("countOpen moves with the queue", async () => {
    const before = await run(() => requests.countOpen());
    const id = await openPersonal("Count");
    expect(await run(() => requests.countOpen())).toBe(before + 1);
    await run(async () => requests.save((await requests.findByThreadId(id))!.resolve(adminId, NOW)));
    expect(await run(() => requests.countOpen())).toBe(before);
  });

  test("a malformed cursor is refused, not treated as page one", async () => {
    await expect(run(() => requests.listForAdmin({}, 10, "nonsense"))).rejects.toBeInstanceOf(CursorInvalidError);
  });
});
```

Add one test to the existing `repositories.test.ts`, inside its `findVisible` describe, proving phase 1's rule still holds when `providerId` is null:

```ts
  test("a personal support thread is visible to its opener and to nobody else", async () => {
    const id = await __runWithTransactionContextForTests(db, () => threads.openSupport(customerId, null, new Date()));
    // Track for cleanup the way this file tracks threads.
    expect(await __runWithTransactionContextForTests(db, () => threads.findVisible(id, customerId))).not.toBeNull();
    expect(await __runWithTransactionContextForTests(db, () => threads.findVisible(id, strangerId))).toBeNull();
    expect(await __runWithTransactionContextForTests(db, () => threads.findVisible(id, staffId))).toBeNull();
  });
```

(`repositories.test.ts` cleans threads up by provider; this thread has none — push its id onto a small `supportThreadIds` list and delete those rows in `afterAll` before the users.)

- [ ] **Step 4: Run them to see them fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication/__tests__/support-request.repository.test.ts`
Expected: FAIL — module `support-request.repository` not found.

- [ ] **Step 5: Extend the thread repository**

In `thread.repository.ts`:

Import `isNull` from `drizzle-orm` and `type SQL`; import `ThreadType` from the enums module.

Add after `openOrFind`:

```ts
  /** A plain insert — see the port. `lastMessageAt = now`: the first message lands in the same transaction. */
  async openSupport(customerUserId: string, providerId: string | null, now: Date): Promise<string> {
    const [row] = await getDb()
      .insert(thread)
      .values({ type: "support", customerUserId, providerId, lastMessageAt: now })
      .returning({ id: thread.id });
    return row!.id;
  }

  /** `type = 'support'` is the whole scope — no viewer, see the port. */
  async findSupportThread(threadId: string): Promise<ThreadRow | null> {
    const [row] = await getDb()
      .select()
      .from(thread)
      .where(and(eq(thread.id, threadId), eq(thread.type, "support")))
      .limit(1);
    return row ?? null;
  }
```

Replace the two list methods and the `list` signature:

```ts
  /**
   * Personal only: `type = 'inquiry'`, or a support thread with no
   * provider. A provider request the same person opened on the provider's
   * behalf has `customer_user_id = this person` too — that row is the
   * provider's, not theirs, and listing it here would put the provider's
   * business in a personal inbox.
   */
  async listForCustomer(customerUserId: string, limit: number, cursor: string | null, type?: ThreadType): Promise<ThreadPage> {
    return this.list(
      and(
        eq(thread.customerUserId, customerUserId),
        or(eq(thread.type, "inquiry"), isNull(thread.providerId)),
        type ? eq(thread.type, type) : undefined,
      ),
      limit,
      cursor,
    );
  }

  async listForProvider(providerId: string, limit: number, cursor: string | null, type?: ThreadType): Promise<ThreadPage> {
    return this.list(and(eq(thread.providerId, providerId), type ? eq(thread.type, type) : undefined), limit, cursor);
  }

  private async list(scope: SQL | undefined, limit: number, cursor: string | null): Promise<ThreadPage> {
```

(`and(...)` drops an `undefined` operand, so the optional type filter costs nothing when absent.) The `Thread.rehydrate` mapping already passes `providerId: r.providerId` — it now typechecks because both sides are `string | null`.

- [ ] **Step 6: Rewrite the sides in the message repository**

In `message.repository.ts`:

Import `supportRequest` beside `message, thread` from the schemas barrel, and `sql` from `drizzle-orm`. Replace `fromTheOtherSide` and its doc comment with:

```ts
/**
 * The side `viewerUserId` is on, as SQL over the joined `thread` row.
 *
 * The customer of an inquiry, or the opener of a *personal* support
 * request, is `customer`. Everybody else who can see the thread — a member
 * of the provider on an inquiry, any member (the opener included) on a
 * provider request — is `provider`. The platform never calls this: it has
 * `markReadForPlatform` / `countUnreadForPlatform`, whose side is fixed.
 *
 * Callers must have proven visibility already (`findVisible`): this
 * expression puts an unknown viewer on the `provider` side, which is the
 * right answer for a member and a meaningless one for a stranger.
 */
function viewerSide(viewerUserId: string) {
  return sql<string>`CASE WHEN ${thread.customerUserId} = ${viewerUserId} AND NOT (${thread.type} = 'support' AND ${thread.providerId} IS NOT NULL) THEN 'customer' ELSE 'provider' END`;
}

/** "From the side the viewer is not on" — one predicate for every thread type now that the side is on the row. */
function fromTheOtherSide(viewerUserId: string) {
  return ne(message.senderSide, viewerSide(viewerUserId));
}
```

Drop the now-unused `or` import if nothing else uses it (the paging `or` in `listForThread` still does — keep it). In `insert`, add `senderSide: entity.senderSide,` to the values. In `listForThread`'s `Message.rehydrate` literal, add `senderSide: r.senderSide as Message["senderSide"],`.

Replace `claimDueForNotice`:

```ts
  /** Due, unread, un-notified — the `idx_message_notify_due` partial index's exact predicate. */
  async claimDueForNotice(limit: number, now: Date): Promise<DueMessage[]> {
    const rows = await getDb()
      .select({
        id: message.id,
        threadId: message.threadId,
        threadType: thread.type,
        senderSide: message.senderSide,
        customerUserId: thread.customerUserId,
        providerId: thread.providerId,
        subject: supportRequest.subject,
      })
      .from(message)
      .innerJoin(thread, eq(thread.id, message.threadId))
      // Left: an inquiry has no request row, and its `subject` is null.
      .leftJoin(supportRequest, eq(supportRequest.threadId, thread.id))
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

    return rows.map((r) => ({
      id: r.id,
      threadId: r.threadId,
      threadType: r.threadType as DueMessage["threadType"],
      senderSide: r.senderSide as DueMessage["senderSide"],
      customerUserId: r.customerUserId,
      providerId: r.providerId,
      subject: r.subject ?? null,
    }));
  }
```

Add the two platform methods after `countUnreadForViewer`:

```ts
  async markReadForPlatform(threadId: string, at: Date): Promise<number> {
    const rows = await getDb()
      .update(message)
      .set({ readAt: at })
      .where(and(eq(message.threadId, threadId), isNull(message.readAt), ne(message.senderSide, "platform")))
      .returning({ id: message.id });
    return rows.length;
  }

  async countUnreadForPlatform(threadIds: string[]): Promise<Map<string, number>> {
    if (threadIds.length === 0) return new Map();
    const rows = await getDb()
      .select({ threadId: message.threadId, value: count() })
      .from(message)
      .where(and(inArray(message.threadId, threadIds), isNull(message.readAt), ne(message.senderSide, "platform")))
      .groupBy(message.threadId);
    return new Map(rows.map((r) => [r.threadId, r.value]));
  }
```

- [ ] **Step 7: Add the admin read to the attachment repository**

In `attachment.repository.ts`, after `findVisible`:

```ts
  /** Same join as `findVisible`; the scope is the thread's type, not a viewer. See the port. */
  async findOnSupportThread(attachmentId: string): Promise<AttachmentRow | null> {
    const [row] = await getDb()
      .select({
        id: attachment.id,
        messageId: attachment.messageId,
        storageKey: attachment.storageKey,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        createdAt: attachment.createdAt,
      })
      .from(attachment)
      .innerJoin(message, eq(message.id, attachment.messageId))
      .innerJoin(thread, eq(thread.id, message.threadId))
      .where(and(eq(attachment.id, attachmentId), eq(thread.type, "support")))
      .limit(1);
    return row ?? null;
  }
```

- [ ] **Step 8: Write the support-request repository**

`support-request.repository.ts`:

```ts
import { and, count, desc, eq, inArray, isNull, lt, or, type SQL } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { supportRequest, thread } from "../../../../../shared/infrastructure/database/communication/schemas";
import { SupportRequest } from "../../../domain/aggregates/support-request.aggregate";
import { CursorInvalidError } from "../../../domain/exceptions";
import type {
  SupportRequestFilter,
  SupportRequestListItem,
  SupportRequestPage,
  SupportRequestRepositoryPort,
} from "../../../app/ports/outbound/support-request.repository.port";

/** `<lastMessageAt ISO>|<threadId>` — the same shape and the same tie-break argument as `thread.repository.ts`. */
function encodeCursor(lastMessageAt: Date, threadId: string): string {
  return `${lastMessageAt.toISOString()}|${threadId}`;
}

function decodeCursor(cursor: string): { lastMessageAt: Date; threadId: string } | null {
  const [when, threadId] = cursor.split("|");
  if (!when || !threadId) return null;
  const lastMessageAt = new Date(when);
  return Number.isNaN(lastMessageAt.getTime()) ? null : { lastMessageAt, threadId };
}

const listColumns = {
  threadId: supportRequest.threadId,
  audience: supportRequest.audience,
  subject: supportRequest.subject,
  status: supportRequest.status,
  bookingId: supportRequest.bookingId,
  requesterUserId: thread.customerUserId,
  providerId: thread.providerId,
  lastMessageAt: thread.lastMessageAt,
  createdAt: supportRequest.createdAt,
  resolvedAt: supportRequest.resolvedAt,
};

type ListRow = {
  [K in keyof typeof listColumns]: (typeof listColumns)[K]["_"]["data"] | null;
};

function toListItem(r: ListRow): SupportRequestListItem {
  return {
    threadId: r.threadId!,
    audience: r.audience as SupportRequestListItem["audience"],
    subject: r.subject!,
    status: r.status as SupportRequestListItem["status"],
    bookingId: r.bookingId,
    requesterUserId: r.requesterUserId!,
    providerId: r.providerId,
    lastMessageAt: r.lastMessageAt!,
    createdAt: r.createdAt!,
    resolvedAt: r.resolvedAt,
  };
}

/**
 * Every read here joins `thread` and is therefore scoped to support
 * threads by construction: an inquiry has no `support_request` row, so the
 * inner join drops it. That, not a `WHERE type = 'support'`, is what keeps
 * the admin slices away from private conversations.
 */
export class DrizzleSupportRequestRepository implements SupportRequestRepositoryPort {
  async insert(request: SupportRequest): Promise<void> {
    await getDb().insert(supportRequest).values({
      threadId: request.threadId,
      audience: request.audience,
      subject: request.subject,
      bookingId: request.bookingId,
      status: request.status,
      resolvedAt: request.resolvedAt,
      resolvedByUserId: request.resolvedByUserId,
      createdAt: request.createdAt,
    });
  }

  async findByThreadId(threadId: string): Promise<SupportRequest | null> {
    const byId = await this.findByThreadIds([threadId]);
    return byId.get(threadId) ?? null;
  }

  async findByThreadIds(threadIds: string[]): Promise<Map<string, SupportRequest>> {
    if (threadIds.length === 0) return new Map();
    const rows = await getDb().select().from(supportRequest).where(inArray(supportRequest.threadId, threadIds));
    return new Map(
      rows.map((r) => [
        r.threadId,
        // `rehydrate`, never `open`: a stored subject was valid under the rule in force when it was written.
        SupportRequest.rehydrate({
          threadId: r.threadId,
          audience: r.audience as SupportRequest["audience"],
          subject: r.subject,
          bookingId: r.bookingId,
          status: r.status as SupportRequest["status"],
          resolvedAt: r.resolvedAt,
          resolvedByUserId: r.resolvedByUserId,
          createdAt: r.createdAt,
        }),
      ]),
    );
  }

  async save(request: SupportRequest): Promise<void> {
    await getDb()
      .update(supportRequest)
      .set({
        status: request.status,
        resolvedAt: request.resolvedAt,
        resolvedByUserId: request.resolvedByUserId,
      })
      .where(eq(supportRequest.threadId, request.threadId));
  }

  async countOpenForRequester(customerUserId: string, providerId: string | null): Promise<number> {
    const scope =
      providerId === null
        ? and(eq(thread.customerUserId, customerUserId), isNull(thread.providerId))
        : eq(thread.providerId, providerId);
    const [row] = await getDb()
      .select({ value: count() })
      .from(supportRequest)
      .innerJoin(thread, eq(thread.id, supportRequest.threadId))
      .where(and(eq(supportRequest.status, "open"), scope));
    return row?.value ?? 0;
  }

  async listForAdmin(filter: SupportRequestFilter, limit: number, cursor: string | null): Promise<SupportRequestPage> {
    let after: { lastMessageAt: Date; threadId: string } | null = null;
    if (cursor) {
      after = decodeCursor(cursor);
      if (!after) throw new CursorInvalidError(cursor);
    }

    const conditions: (SQL | undefined)[] = [
      filter.status ? eq(supportRequest.status, filter.status) : undefined,
      filter.audience ? eq(supportRequest.audience, filter.audience) : undefined,
      after
        ? or(
            lt(thread.lastMessageAt, after.lastMessageAt),
            and(eq(thread.lastMessageAt, after.lastMessageAt), lt(thread.id, after.threadId)),
          )
        : undefined,
    ];

    // One more than asked for — its existence is what says another page exists.
    const rows = await getDb()
      .select(listColumns)
      .from(supportRequest)
      .innerJoin(thread, eq(thread.id, supportRequest.threadId))
      .where(and(...conditions))
      .orderBy(desc(thread.lastMessageAt), desc(thread.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map(toListItem),
      nextCursor: hasMore && last ? encodeCursor(last.lastMessageAt, last.threadId) : null,
    };
  }

  async findListItem(threadId: string): Promise<SupportRequestListItem | null> {
    const [row] = await getDb()
      .select(listColumns)
      .from(supportRequest)
      .innerJoin(thread, eq(thread.id, supportRequest.threadId))
      .where(eq(supportRequest.threadId, threadId))
      .limit(1);
    return row ? toListItem(row) : null;
  }

  async countOpen(): Promise<number> {
    const [row] = await getDb()
      .select({ value: count() })
      .from(supportRequest)
      .where(eq(supportRequest.status, "open"));
    return row?.value ?? 0;
  }
}
```

If `ListRow`'s mapped type fights the drizzle column types under `tsc`, replace it with `type ListRow = Awaited<ReturnType<DrizzleSupportRequestRepository["findListRows"]>>[number]` where `findListRows` is a private method wrapping the select — the point is that `toListItem` takes exactly the row shape the select returns, without `any`.

- [ ] **Step 9: Run and commit**

Run: `cd packages/backend && bun run typecheck`
Expected: clean in `bounded-contexts/communication`; the only remaining errors are in `read/communication/app/use-cases/conversations.projection.ts` (`providerIds` now contains `null`) — Task 8 fixes that projection properly; for now change that one line to `const providerIds = [...new Set(threads.map((t) => t.providerId).filter((id): id is string => id !== null))];` so the package typechecks.

Run: `bun test src/modules/ntizo/bounded-contexts/communication/__tests__/`
Expected: PASS across all six files (`support-request.repository.test.ts` takes ~20s against Neon).

Stage `bounded-contexts/communication/app/ports/outbound`, `bounded-contexts/communication/infrastructure/repositories/drizzle`, the two test files, and `read/communication/app/use-cases/conversations.projection.ts`; commit:

`feat(communication): support-request repository, sides in the message reads, nullable provider on the thread reads`

---

## Task 4: What this context reads from Booking and User

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/communication/app/ports/outbound/booking-reader.port.ts`
- Create: `.../app/ports/outbound/admin-user-reader.port.ts`
- Modify: `.../app/ports/outbound/index.ts`
- Create: `.../infrastructure/outbound-adapters/cross-bc/booking-reader.adapter.ts`
- Create: `.../infrastructure/outbound-adapters/cross-bc/admin-user-reader.adapter.ts`
- Test: `.../__tests__/cross-bc-readers.test.ts` (new)

**Interfaces:**
- Produces: `BookingReaderPort.isOwnedBy(bookingId: string, requester: { userId: string; providerId: string | null }): Promise<boolean>`; `AdminUserReaderPort.findAdminUserIds(): Promise<string[]>`; `DrizzleBookingReader`, `DrizzleAdminUserReader`.

- [ ] **Step 1: Write the ports**

`booking-reader.port.ts`:

```ts
/**
 * The one thing Communication needs to know about a booking: whether the
 * person (or provider) attaching it to a support request may. A cross-BC
 * port, like `ProviderReaderPort` — one boolean off one row, no dependency
 * on Booking's bootstrap.
 */
export interface BookingReaderPort {
  /**
   * For a personal request (`providerId` null): the booking's customer is
   * `userId`. For a provider request: the booking's provider is
   * `providerId` — any member may ask about any of the provider's bookings.
   * A booking that does not exist answers `false`, indistinguishable from
   * one that is somebody else's.
   */
  isOwnedBy(bookingId: string, requester: { userId: string; providerId: string | null }): Promise<boolean>;
}
```

`admin-user-reader.port.ts`:

```ts
/**
 * Who administers the platform, as the people a new support request is
 * addressed to. Read from `ntizo_user.user.role` at the moment of asking,
 * never cached: a role granted an hour ago must receive the next request.
 */
export interface AdminUserReaderPort {
  /** Every active user with role `admin`. Empty when there is none — the caller decides what that means. */
  findAdminUserIds(): Promise<string[]>;
}
```

Add both to `ports/outbound/index.ts`:

```ts
export type { BookingReaderPort } from "./booking-reader.port";
export type { AdminUserReaderPort } from "./admin-user-reader.port";
```

- [ ] **Step 2: Write the failing DB test**

`cross-bc-readers.test.ts` — same connection and fixture shape as `support-request.repository.test.ts` (Task 3). It needs a real booking row; copy the booking fixture from `read/booking/__tests__/list-my-bookings.projection.test.ts` (category, service, service option, provider member, then the booking) — that file's `beforeAll` is the reference for the exact columns a booking insert needs today.

```ts
import { DrizzleBookingReader } from "../infrastructure/outbound-adapters/cross-bc/booking-reader.adapter";
import { DrizzleAdminUserReader } from "../infrastructure/outbound-adapters/cross-bc/admin-user-reader.adapter";

const bookings = new DrizzleBookingReader();
const admins = new DrizzleAdminUserReader();

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
```

Fixture: `adminId` (role `admin`, status `active`), `suspendedAdminId` (role `admin`, status `suspended` — check `UserStatus` in `@ntizo/shared` for the exact non-active value), `customerId`, `memberId` (owner of `providerId`), `otherProviderId` (a second provider), `strangerId` (never inserted), and one booking for `customerId` on `providerId`. Clean up bookings before members before providers before users.

- [ ] **Step 3: Run it to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication/__tests__/cross-bc-readers.test.ts`
Expected: FAIL — adapter modules not found.

- [ ] **Step 4: Write the adapters**

`booking-reader.adapter.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { booking } from "../../../../../shared/infrastructure/database/booking/schemas";
import type { BookingReaderPort } from "../../../app/ports/outbound/booking-reader.port";

/** The single place Communication touches Booking's table — see the port. */
export class DrizzleBookingReader implements BookingReaderPort {
  async isOwnedBy(bookingId: string, requester: { userId: string; providerId: string | null }): Promise<boolean> {
    const owner =
      requester.providerId === null
        ? eq(booking.customerId, requester.userId)
        : eq(booking.providerId, requester.providerId);
    const [row] = await getDb()
      .select({ id: booking.id })
      .from(booking)
      .where(and(eq(booking.id, bookingId), owner))
      .limit(1);
    return row !== undefined;
  }
}
```

`admin-user-reader.adapter.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { user } from "../../../../../shared/infrastructure/database/user/schemas";
import type { AdminUserReaderPort } from "../../../app/ports/outbound/admin-user-reader.port";

/** `role = 'admin' AND status = 'active'` — the same two columns `admin-access.ts` and the GraphQL context read. */
export class DrizzleAdminUserReader implements AdminUserReaderPort {
  async findAdminUserIds(): Promise<string[]> {
    const rows = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.role, "admin"), eq(user.status, "active")));
    return rows.map((r) => r.id);
  }
}
```

- [ ] **Step 5: Run and commit**

Run: `cd packages/backend && bun run typecheck && bun test src/modules/ntizo/bounded-contexts/communication/__tests__/cross-bc-readers.test.ts`
Expected: PASS.

Stage the two ports, the barrel, the two adapters and the test; commit:

`feat(communication): read who owns a booking and who administers the platform`

---

## Task 5: The commands

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/communication/app/use-cases/resolve-attachments.ts`
- Modify: `.../app/use-cases/send-message.command.ts`
- Create: `.../app/use-cases/open-support-request.command.ts`
- Create: `.../app/use-cases/reply-to-support-request.command.ts`
- Create: `.../app/use-cases/resolve-support-request.command.ts`
- Create: `.../app/use-cases/mark-support-request-read.command.ts`
- Test: `.../__tests__/commands.test.ts` (extend), `.../__tests__/support-commands.test.ts` (new)

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `resolveAttachments(storage: AttachmentStoragePort, senderUserId: string, descriptors: AttachmentDescriptor[]): Promise<NewAttachment[]>` (moved out of `SendMessageCommand`, behaviour unchanged).
  - `SendMessageCommand` constructor gains `supportRequests: SupportRequestRepositoryPort` as its **fourth** argument: `(threads, messages, attachments, supportRequests, attachmentStorage, unitOfWork, now?)`.
  - `OpenSupportRequestCommand.execute({ requesterUserId, audience, providerId?, subject, body, bookingId?, attachments? }): Promise<{ threadId: string }>`.
  - `ReplyToSupportRequestCommand.execute({ threadId, adminUserId, body, attachments? }): Promise<{ id: string }>`.
  - `ResolveSupportRequestCommand.execute({ threadId, adminUserId }): Promise<{ threadId: string; status: "resolved" }>`.
  - `MarkSupportRequestReadCommand.execute({ threadId }): Promise<{ marked: number }>`.
  - Notification types used here — `NotificationType.SupportRequestOpened` and `NotificationType.SupportRequestResolved` — are added to `@ntizo/shared` in **Task 6**. Do Task 6's Step 1 (the enum) first if you are executing tasks out of order; otherwise `tsc` fails on those two names.

- [ ] **Step 1: Extract `resolveAttachments`**

Create `resolve-attachments.ts` with the body of `SendMessageCommand.resolveAttachments` and its doc comment, as a plain exported function:

```ts
import { ACCEPTED_ATTACHMENT_TYPES, type AcceptedAttachmentType } from "@ntizo/shared/attachments";
import { MAX_ATTACHMENTS } from "../../domain/aggregates/message.aggregate";
import { AttachmentNotAvailableError, TooManyAttachmentsError } from "../../domain/exceptions";
import type { NewAttachment } from "../ports/outbound/attachment.repository.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";

function isAcceptedAttachmentType(contentType: string): contentType is AcceptedAttachmentType {
  return (ACCEPTED_ATTACHMENT_TYPES as readonly string[]).includes(contentType);
}

/** What an untrusted caller may say about one file it wants to attach: only the key it was uploaded under. */
export interface AttachmentDescriptor {
  storageKey: string;
}

/**
 * Turns what the caller claimed into what `AttachmentRepositoryPort.insertMany`
 * is allowed to trust. Lifted out of `SendMessageCommand` unchanged so that
 * `OpenSupportRequestCommand` and `ReplyToSupportRequestCommand` run the
 * identical four checks — see `SendMessageCommand`'s history for the
 * reasoning behind each, which applies to all three callers.
 */
export async function resolveAttachments(
  storage: AttachmentStoragePort,
  senderUserId: string,
  descriptors: AttachmentDescriptor[],
): Promise<NewAttachment[]> {
  if (descriptors.length > MAX_ATTACHMENTS) {
    throw new TooManyAttachmentsError(descriptors.length, MAX_ATTACHMENTS);
  }
  const ownPrefix = `attachment/${senderUserId}/`;
  return await Promise.all(
    descriptors.map(async (descriptor): Promise<NewAttachment> => {
      if (!descriptor.storageKey.startsWith(ownPrefix)) throw new AttachmentNotAvailableError();
      const stored = await storage.head(descriptor.storageKey);
      if (!stored || stored.uploadedByUserId !== senderUserId) throw new AttachmentNotAvailableError();
      if (!isAcceptedAttachmentType(stored.contentType)) throw new AttachmentNotAvailableError();
      if (stored.originalName === null) throw new AttachmentNotAvailableError();
      return {
        storageKey: descriptor.storageKey,
        fileName: stored.originalName,
        contentType: stored.contentType,
        sizeBytes: stored.sizeBytes,
      };
    }),
  );
}
```

Move the long doc comment that explains the four checks from the method onto this function. In `send-message.command.ts`, delete the private method and `isAcceptedAttachmentType`, import `{ resolveAttachments, type AttachmentDescriptor }` from `./resolve-attachments`, keep re-exporting `AttachmentDescriptor` from `send-message.command.ts` (`export type { AttachmentDescriptor } from "./resolve-attachments";`) so `index.ts` and the write handlers keep importing it from where they do today.

- [ ] **Step 2: Write the failing tests for `SendMessageCommand`'s three changes**

In `commands.test.ts`, the fakes need two things: `FakeThreadRepository.findVisible` must return a row whose `type` and `providerId` the test controls, and a `FakeSupportRequestRepository`. Add:

```ts
import type {
  SupportRequestFilter,
  SupportRequestListItem,
  SupportRequestPage,
  SupportRequestRepositoryPort,
} from "../app/ports/outbound/support-request.repository.port";
import { SupportRequest } from "../domain/aggregates/support-request.aggregate";

class FakeSupportRequestRepository implements SupportRequestRepositoryPort {
  readonly saved: SupportRequest[] = [];
  readonly inserted: SupportRequest[] = [];
  constructor(
    private readonly byThread: Map<string, SupportRequest> = new Map(),
    public openCount = 0,
    private readonly uow?: TrackingUnitOfWork,
  ) {}
  async insert(request: SupportRequest): Promise<void> {
    this.uow?.record("request");
    this.inserted.push(request);
    this.byThread.set(request.threadId, request);
  }
  async findByThreadId(threadId: string): Promise<SupportRequest | null> {
    return this.byThread.get(threadId) ?? null;
  }
  async findByThreadIds(ids: string[]): Promise<Map<string, SupportRequest>> {
    return new Map(ids.flatMap((id) => (this.byThread.has(id) ? [[id, this.byThread.get(id)!]] : [])));
  }
  async save(request: SupportRequest): Promise<void> {
    this.uow?.record("request");
    this.saved.push(request);
    this.byThread.set(request.threadId, request);
  }
  async countOpenForRequester(): Promise<number> {
    return this.openCount;
  }
  async listForAdmin(_f: SupportRequestFilter, _l: number, _c: string | null): Promise<SupportRequestPage> {
    return { items: [], nextCursor: null };
  }
  async findListItem(): Promise<SupportRequestListItem | null> {
    return null;
  }
  async countOpen(): Promise<number> {
    return this.openCount;
  }
}
```

Widen `TrackedOp` to `"insert" | "touch" | "attachment" | "request" | "thread"`. Give the existing `FakeThreadRepository` a way to describe the visible thread — a constructor option `visibleRow: Partial<ThreadRow>` merged over the default `{ type: "inquiry", customerUserId: customerId, providerId }` — and implement the two new port methods (`openSupport` records `"thread"` on the unit of work and returns a fixed id; `findSupportThread` returns the row when `type === "support"`, else null). Update every `new SendMessageCommand(...)` in the file to pass a `FakeSupportRequestRepository` as the fourth argument. Then add:

```ts
describe("sending into a support request", () => {
  const supportRow = { type: "support", customerUserId: customerId, providerId: null } as const;

  it("does not run the contact check on a support thread, and writes the requester's side", async () => {
    const threads = new FakeThreadRepository({ visibleRow: supportRow });
    const messages = new FakeMessageRepository(uow);
    const requests = new FakeSupportRequestRepository();
    const send = new SendMessageCommand(threads, messages, attachments, requests, storage, uow, () => NOW);

    await send.execute({ threadId: "t1", senderUserId: customerId, body: "liga-me para o 84 123 4567" });

    expect(messages.inserted[0]?.senderSide).toBe("customer");
  });

  it("still refuses contact details on an inquiry", async () => {
    const threads = new FakeThreadRepository({ visibleRow: { type: "inquiry", customerUserId: customerId, providerId } });
    const send = new SendMessageCommand(threads, new FakeMessageRepository(uow), attachments, new FakeSupportRequestRepository(), storage, uow, () => NOW);
    await expect(send.execute({ threadId: "t1", senderUserId: customerId, body: "84 123 4567" })).rejects.toBeInstanceOf(MessageContainsContactError);
  });

  it("a member replying on a provider request writes the provider side", async () => {
    const threads = new FakeThreadRepository({ visibleRow: { type: "support", customerUserId: "opener", providerId } });
    const messages = new FakeMessageRepository(uow);
    const send = new SendMessageCommand(threads, messages, attachments, new FakeSupportRequestRepository(), storage, uow, () => NOW);
    await send.execute({ threadId: "t1", senderUserId: staffId, body: "ok" });
    expect(messages.inserted[0]?.senderSide).toBe("provider");
  });

  it("reopens a resolved request in the same transaction as the message", async () => {
    const resolved = SupportRequest.open({ threadId: "t1", audience: "customer", subject: "x", bookingId: null, now: NOW }).resolve("admin", NOW);
    const requests = new FakeSupportRequestRepository(new Map([["t1", resolved]]), 0, uow);
    const threads = new FakeThreadRepository({ visibleRow: supportRow });
    const send = new SendMessageCommand(threads, new FakeMessageRepository(uow), attachments, requests, storage, uow, () => NOW);

    await send.execute({ threadId: "t1", senderUserId: customerId, body: "ainda não" });

    expect(requests.saved[0]?.status).toBe("open");
    const insertTx = uow.writes.find((w) => w.op === "insert")?.transactionId;
    const requestTx = uow.writes.find((w) => w.op === "request")?.transactionId;
    expect(insertTx).not.toBeNull();
    expect(requestTx).toBe(insertTx);
  });

  it("leaves an open request alone", async () => {
    const open = SupportRequest.open({ threadId: "t1", audience: "customer", subject: "x", bookingId: null, now: NOW });
    const requests = new FakeSupportRequestRepository(new Map([["t1", open]]));
    const threads = new FakeThreadRepository({ visibleRow: supportRow });
    const send = new SendMessageCommand(threads, new FakeMessageRepository(uow), attachments, requests, storage, uow, () => NOW);
    await send.execute({ threadId: "t1", senderUserId: customerId, body: "mais uma" });
    expect(requests.saved).toHaveLength(0);
  });
});
```

Use whatever names the file already has for its shared `uow`, `attachments`, `storage`, `staffId` fixtures; `FakeMessageRepository.inserted` must expose the `Message` instances it was given (add the list if the fake only records the op).

- [ ] **Step 3: Write the failing tests for the four new commands**

`support-commands.test.ts`. Reuse the fakes from `commands.test.ts` by moving them into a shared `__tests__/fakes.ts` if that is cleaner than copying; either is acceptable, but a copy must be complete. Then:

```ts
import { NotificationType } from "@ntizo/shared";
import { OpenSupportRequestCommand } from "../app/use-cases/open-support-request.command";
import { ReplyToSupportRequestCommand } from "../app/use-cases/reply-to-support-request.command";
import { ResolveSupportRequestCommand } from "../app/use-cases/resolve-support-request.command";
import { MarkSupportRequestReadCommand } from "../app/use-cases/mark-support-request-read.command";
import {
  SupportAlreadyResolvedError,
  SupportBookingNotYoursError,
  SupportNotAMemberError,
  SupportRequestNotFoundError,
  SupportSubjectInvalidError,
  SupportTooManyOpenError,
} from "../domain/exceptions";

class FakeBookingReader implements BookingReaderPort {
  constructor(private readonly owned: Set<string>) {}
  async isOwnedBy(bookingId: string, requester: { userId: string; providerId: string | null }): Promise<boolean> {
    return this.owned.has(`${bookingId}:${requester.providerId ?? requester.userId}`);
  }
}
class FakeAdminUserReader implements AdminUserReaderPort {
  constructor(private readonly ids: string[]) {}
  async findAdminUserIds(): Promise<string[]> {
    return this.ids;
  }
}
class FakeProviderReader implements ProviderReaderPort {
  constructor(private readonly members: Set<string>) {}
  async isContactable(): Promise<boolean> {
    return true;
  }
  async isMember(providerId: string, userId: string): Promise<boolean> {
    return this.members.has(`${providerId}:${userId}`);
  }
}

function openCommand(overrides: Partial<{
  requests: FakeSupportRequestRepository;
  providers: FakeProviderReader;
  bookings: FakeBookingReader;
  admins: FakeAdminUserReader;
  raised: FakeRaiseNotification;
  threads: FakeThreadRepository;
  messages: FakeMessageRepository;
}> = {}) {
  const deps = {
    threads: overrides.threads ?? new FakeThreadRepository({ uow }),
    requests: overrides.requests ?? new FakeSupportRequestRepository(new Map(), 0, uow),
    messages: overrides.messages ?? new FakeMessageRepository(uow),
    providers: overrides.providers ?? new FakeProviderReader(new Set([`${providerId}:${staffId}`])),
    bookings: overrides.bookings ?? new FakeBookingReader(new Set([`b1:${customerId}`, `b2:${providerId}`])),
    admins: overrides.admins ?? new FakeAdminUserReader(["admin-1", "admin-2"]),
    raised: overrides.raised ?? new FakeRaiseNotification(),
  };
  const command = new OpenSupportRequestCommand(
    deps.threads, deps.requests, deps.messages, attachments, storage,
    deps.providers, deps.bookings, deps.admins, deps.raised, uow, () => NOW,
  );
  return { command, ...deps };
}

describe("opening a personal request", () => {
  it("writes thread, request and first message in one transaction, and tells every admin", async () => {
    const { command, requests, messages, raised } = openCommand();
    const result = await command.execute({ requesterUserId: customerId, audience: "customer", subject: " Reembolso ", body: "Paguei duas vezes" });

    expect(result.threadId).toBe("support-thread-1");
    expect(requests.inserted[0]).toMatchObject({ subject: "Reembolso", audience: "customer", bookingId: null, status: "open" });
    expect(messages.inserted[0]).toMatchObject({ threadId: "support-thread-1", senderSide: "customer", body: "Paguei duas vezes" });

    const txs = new Set(uow.writes.filter((w) => ["thread", "request", "insert"].includes(w.op)).map((w) => w.transactionId));
    expect(txs.size).toBe(1);
    expect([...txs][0]).not.toBeNull();

    expect(raised.calls).toEqual([
      { type: NotificationType.SupportRequestOpened, audience: "user", userId: "admin-1", payload: { threadId: "support-thread-1", subject: "Reembolso", requestAudience: "customer" } },
      { type: NotificationType.SupportRequestOpened, audience: "user", userId: "admin-2", payload: { threadId: "support-thread-1", subject: "Reembolso", requestAudience: "customer" } },
    ]);
  });

  it("refuses a bad subject before writing anything", async () => {
    const { command, requests } = openCommand();
    await expect(command.execute({ requesterUserId: customerId, audience: "customer", subject: "  ", body: "x" })).rejects.toBeInstanceOf(SupportSubjectInvalidError);
    expect(requests.inserted).toHaveLength(0);
    expect(uow.writes).toHaveLength(0);
  });

  it("does not run the contact check", async () => {
    const { command, messages } = openCommand();
    await command.execute({ requesterUserId: customerId, audience: "customer", subject: "Contacto", body: "o meu número é 84 123 4567" });
    expect(messages.inserted).toHaveLength(1);
  });

  it("attaches a booking the requester owns and refuses one they do not", async () => {
    const { command, requests } = openCommand();
    await command.execute({ requesterUserId: customerId, audience: "customer", subject: "Reserva", body: "x", bookingId: "b1" });
    expect(requests.inserted[0]?.bookingId).toBe("b1");
    await expect(command.execute({ requesterUserId: customerId, audience: "customer", subject: "Reserva", body: "x", bookingId: "b2" })).rejects.toBeInstanceOf(SupportBookingNotYoursError);
  });

  it("refuses the eleventh open request", async () => {
    const { command } = openCommand({ requests: new FakeSupportRequestRepository(new Map(), 10, uow) });
    await expect(command.execute({ requesterUserId: customerId, audience: "customer", subject: "x", body: "x" })).rejects.toBeInstanceOf(SupportTooManyOpenError);
  });

  it("a failing admin notification does not undo the request", async () => {
    const raised = new FakeRaiseNotification();
    raised.failOn(() => true);
    const { command, requests } = openCommand({ raised });
    const result = await command.execute({ requesterUserId: customerId, audience: "customer", subject: "x", body: "x" });
    expect(result.threadId).toBe("support-thread-1");
    expect(requests.inserted).toHaveLength(1);
  });
});

describe("opening a provider request", () => {
  it("requires membership, records the provider, and writes the provider side", async () => {
    const { command, requests, messages, threads } = openCommand();
    await command.execute({ requesterUserId: staffId, audience: "provider", providerId, subject: "Comissão", body: "x" });
    expect(threads.openedSupport[0]).toEqual({ customerUserId: staffId, providerId });
    expect(requests.inserted[0]?.audience).toBe("provider");
    expect(messages.inserted[0]?.senderSide).toBe("provider");
  });

  it("refuses a non-member, and a provider audience with no provider", async () => {
    const { command } = openCommand();
    await expect(command.execute({ requesterUserId: customerId, audience: "provider", providerId, subject: "x", body: "x" })).rejects.toBeInstanceOf(SupportNotAMemberError);
    await expect(command.execute({ requesterUserId: staffId, audience: "provider", subject: "x", body: "x" })).rejects.toBeInstanceOf(SupportNotAMemberError);
  });

  it("checks a booking against the provider, not the member", async () => {
    const { command, requests } = openCommand();
    await command.execute({ requesterUserId: staffId, audience: "provider", providerId, subject: "x", body: "x", bookingId: "b2" });
    expect(requests.inserted[0]?.bookingId).toBe("b2");
  });
});

describe("the admin commands", () => {
  const supportRow = { id: "t1", type: "support", customerUserId: customerId, providerId: null } as const;

  it("reply writes a platform message on a support thread and touches it", async () => {
    const threads = new FakeThreadRepository({ visibleRow: supportRow, uow });
    const messages = new FakeMessageRepository(uow);
    const reply = new ReplyToSupportRequestCommand(threads, messages, attachments, storage, uow, () => NOW);
    await reply.execute({ threadId: "t1", adminUserId: "admin-1", body: "Já tratámos." });
    expect(messages.inserted[0]?.senderSide).toBe("platform");
    expect(uow.touchedAfterInsert).toBe(true);
  });

  it("reply refuses an inquiry id the same way as a missing one", async () => {
    const threads = new FakeThreadRepository({ visibleRow: { ...supportRow, type: "inquiry", providerId } });
    const reply = new ReplyToSupportRequestCommand(threads, new FakeMessageRepository(uow), attachments, storage, uow, () => NOW);
    await expect(reply.execute({ threadId: "t1", adminUserId: "admin-1", body: "x" })).rejects.toBeInstanceOf(SupportRequestNotFoundError);
  });

  it("resolve saves the resolution and tells the requester side", async () => {
    const open = SupportRequest.open({ threadId: "t1", audience: "customer", subject: "Reembolso", bookingId: null, now: NOW });
    const requests = new FakeSupportRequestRepository(new Map([["t1", open]]));
    const threads = new FakeThreadRepository({ visibleRow: supportRow });
    const raised = new FakeRaiseNotification();
    const resolve = new ResolveSupportRequestCommand(threads, requests, raised, () => NOW);

    const out = await resolve.execute({ threadId: "t1", adminUserId: "admin-1" });

    expect(out).toEqual({ threadId: "t1", status: "resolved" });
    expect(requests.saved[0]).toMatchObject({ status: "resolved", resolvedByUserId: "admin-1" });
    expect(raised.calls).toEqual([
      { type: NotificationType.SupportRequestResolved, audience: "user", userId: customerId, payload: { threadId: "t1", subject: "Reembolso", requestAudience: "customer" } },
    ]);
  });

  it("resolve on a provider request tells the provider", async () => {
    const open = SupportRequest.open({ threadId: "t1", audience: "provider", subject: "Comissão", bookingId: null, now: NOW });
    const requests = new FakeSupportRequestRepository(new Map([["t1", open]]));
    const threads = new FakeThreadRepository({ visibleRow: { ...supportRow, customerUserId: staffId, providerId } });
    const raised = new FakeRaiseNotification();
    await new ResolveSupportRequestCommand(threads, requests, raised, () => NOW).execute({ threadId: "t1", adminUserId: "admin-1" });
    expect(raised.calls[0]).toMatchObject({ audience: "provider", providerId, payload: { requestAudience: "provider", providerId } });
  });

  it("resolve twice is refused; resolve on a missing request is not found", async () => {
    const resolved = SupportRequest.open({ threadId: "t1", audience: "customer", subject: "x", bookingId: null, now: NOW }).resolve("a", NOW);
    const requests = new FakeSupportRequestRepository(new Map([["t1", resolved]]));
    const threads = new FakeThreadRepository({ visibleRow: supportRow });
    const resolve = new ResolveSupportRequestCommand(threads, requests, new FakeRaiseNotification(), () => NOW);
    await expect(resolve.execute({ threadId: "t1", adminUserId: "a" })).rejects.toBeInstanceOf(SupportAlreadyResolvedError);
    await expect(resolve.execute({ threadId: "nope", adminUserId: "a" })).rejects.toBeInstanceOf(SupportRequestNotFoundError);
  });

  it("markRead reads for the platform side only on a support thread", async () => {
    const messages = new FakeMessageRepository(uow);
    const threads = new FakeThreadRepository({ visibleRow: supportRow });
    const mark = new MarkSupportRequestReadCommand(threads, messages, () => NOW);
    await mark.execute({ threadId: "t1" });
    expect(messages.platformReads).toEqual(["t1"]);
    const inquiry = new FakeThreadRepository({ visibleRow: { ...supportRow, type: "inquiry", providerId } });
    await expect(new MarkSupportRequestReadCommand(inquiry, messages, () => NOW).execute({ threadId: "t1" })).rejects.toBeInstanceOf(SupportRequestNotFoundError);
  });
});
```

The fakes this needs beyond Task 5 Step 2's: `FakeThreadRepository.openedSupport` (records `{ customerUserId, providerId }` and returns `"support-thread-1"`), `FakeMessageRepository.platformReads` (records `markReadForPlatform` thread ids), and `FakeRaiseNotification` copied from `notify-unread.test.ts`.

- [ ] **Step 4: Run them to see them fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication/__tests__/commands.test.ts src/modules/ntizo/bounded-contexts/communication/__tests__/support-commands.test.ts`
Expected: FAIL — new modules not found; `SendMessageCommand` still runs `hasContact` on the support body.

- [ ] **Step 5: Change `SendMessageCommand`**

Constructor and `execute` become:

```ts
export class SendMessageCommand {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly attachments: AttachmentRepositoryPort,
    private readonly supportRequests: SupportRequestRepositoryPort,
    private readonly attachmentStorage: AttachmentStoragePort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: SendMessageInput): Promise<{ id: string }> {
    const visible = await this.threads.findVisible(input.threadId, input.senderUserId);
    if (!visible) throw new ThreadNotVisibleError();

    const isSupport = visible.type === "support";

    // The contact gate is an anti-disintermediation rule between a customer
    // and a provider. Between a person and the platform's own support it
    // would refuse exactly what support needs — a phone number to call back.
    const trimmedBody = input.body.trim();
    if (!isSupport && hasContact(trimmedBody)) throw new MessageContainsContactError();

    // The side is a fact about the thread and who is writing, decided here
    // and written on the row — never inferred later from a role. On a
    // support request the requester's side is the audience; on an inquiry
    // it is customer-or-not, and `findVisible` already proved a non-customer
    // is a member.
    const senderSide: SenderSide = isSupport
      ? visible.providerId === null
        ? "customer"
        : "provider"
      : visible.customerUserId === input.senderUserId
        ? "customer"
        : "provider";

    const descriptors = input.attachments ?? [];
    const attachments = await resolveAttachments(this.attachmentStorage, input.senderUserId, descriptors);

    const message = Message.compose({
      threadId: input.threadId,
      senderUserId: input.senderUserId,
      senderSide,
      body: trimmedBody,
      attachmentCount: attachments.length,
      now: this.now(),
    });

    return await this.unitOfWork.atomicExecute(async () => {
      const id = await this.messages.insert(message);
      if (attachments.length > 0) {
        await this.attachments.insertMany(id, attachments);
      }
      await this.threads.touch(input.threadId, message.createdAt);
      // A requester writing on a resolved request is the requester saying
      // "not solved" — the only reopen there is, in the same transaction as
      // the message that means it.
      if (isSupport) {
        const request = await this.supportRequests.findByThreadId(input.threadId);
        if (request && request.status === "resolved") {
          await this.supportRequests.save(request.reopen());
        }
      }
      return { id };
    });
  }
}
```

Import `SenderSide` from the enums module and `SupportRequestRepositoryPort` from its port. Keep the class doc comment; add one sentence to it about the two support-specific behaviours.

- [ ] **Step 6: Write `OpenSupportRequestCommand`**

`open-support-request.command.ts`:

```ts
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import type { SupportAudience } from "../../../../shared/infrastructure/database/communication/enums";
import { Message } from "../../domain/aggregates/message.aggregate";
import { MAX_OPEN_SUPPORT_REQUESTS, SupportRequest } from "../../domain/aggregates/support-request.aggregate";
import {
  SupportBookingNotYoursError,
  SupportNotAMemberError,
  SupportTooManyOpenError,
} from "../../domain/exceptions";
import type { ThreadRepositoryPort } from "../ports/outbound/thread.repository.port";
import type { SupportRequestRepositoryPort } from "../ports/outbound/support-request.repository.port";
import type { MessageRepositoryPort } from "../ports/outbound/message.repository.port";
import type { AttachmentRepositoryPort } from "../ports/outbound/attachment.repository.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";
import type { ProviderReaderPort } from "../ports/outbound/provider-reader.port";
import type { BookingReaderPort } from "../ports/outbound/booking-reader.port";
import type { AdminUserReaderPort } from "../ports/outbound/admin-user-reader.port";
import type { RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";
import { resolveAttachments, type AttachmentDescriptor } from "./resolve-attachments";

export interface OpenSupportRequestInput {
  requesterUserId: string;
  audience: SupportAudience;
  /** Required when `audience` is `provider`; ignored otherwise. */
  providerId?: string | null | undefined;
  subject: string;
  body: string;
  bookingId?: string | null | undefined;
  attachments?: AttachmentDescriptor[] | undefined;
}

/**
 * Opening a support request: a thread, its request row, and the first
 * message, in one transaction — then every admin is told.
 *
 * Checks run cheapest-first and all before the transaction opens: the
 * subject (pure), membership (one row), the booking (one row), the cap (one
 * count), then attachments (storage I/O). Nothing is written until all of
 * them pass, so a refusal never leaves a thread with no request behind it.
 *
 * **Telling the admins cannot undo the request.** The notification fan-out
 * runs after the transaction committed, one raise per admin, each in its
 * own try — the request exists whether or not anybody could be told, and
 * the admin queue shows it regardless. Same posture as
 * `NotifyUnreadInternalCommand`: a failed raise is logged and counted,
 * never rethrown.
 */
export class OpenSupportRequestCommand {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly supportRequests: SupportRequestRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly attachments: AttachmentRepositoryPort,
    private readonly attachmentStorage: AttachmentStoragePort,
    private readonly providers: ProviderReaderPort,
    private readonly bookings: BookingReaderPort,
    private readonly admins: AdminUserReaderPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: OpenSupportRequestInput): Promise<{ threadId: string }> {
    const subject = SupportRequest.normaliseSubject(input.subject);

    let providerId: string | null = null;
    if (input.audience === "provider") {
      if (!input.providerId) throw new SupportNotAMemberError();
      if (!(await this.providers.isMember(input.providerId, input.requesterUserId))) {
        throw new SupportNotAMemberError();
      }
      providerId = input.providerId;
    }

    const bookingId = input.bookingId ?? null;
    if (bookingId !== null) {
      const owned = await this.bookings.isOwnedBy(bookingId, { userId: input.requesterUserId, providerId });
      if (!owned) throw new SupportBookingNotYoursError();
    }

    const open = await this.supportRequests.countOpenForRequester(input.requesterUserId, providerId);
    if (open >= MAX_OPEN_SUPPORT_REQUESTS) throw new SupportTooManyOpenError(MAX_OPEN_SUPPORT_REQUESTS);

    const attachments = await resolveAttachments(this.attachmentStorage, input.requesterUserId, input.attachments ?? []);
    const now = this.now();

    const threadId = await this.unitOfWork.atomicExecute(async () => {
      const id = await this.threads.openSupport(input.requesterUserId, providerId, now);
      await this.supportRequests.insert(
        SupportRequest.open({ threadId: id, audience: input.audience, subject, bookingId, now }),
      );
      const message = Message.compose({
        threadId: id,
        senderUserId: input.requesterUserId,
        senderSide: input.audience,
        body: input.body,
        attachmentCount: attachments.length,
        now,
      });
      const messageId = await this.messages.insert(message);
      if (attachments.length > 0) await this.attachments.insertMany(messageId, attachments);
      // No `touch`: `openSupport` set `last_message_at = now`, the same instant as this message.
      return id;
    });

    await this.tellAdmins(threadId, subject, input.audience, providerId);
    return { threadId };
  }

  private async tellAdmins(threadId: string, subject: string, audience: SupportAudience, providerId: string | null) {
    let adminIds: string[] = [];
    try {
      adminIds = await this.admins.findAdminUserIds();
    } catch (error) {
      console.error("[communication] could not list admins for a new support request", { threadId, error: String(error) });
      return;
    }
    for (const userId of adminIds) {
      try {
        await this.raiseNotification.execute({
          type: NotificationType.SupportRequestOpened,
          audience: "user",
          userId,
          payload: { threadId, subject, requestAudience: audience, ...(providerId ? { providerId } : {}) },
        });
      } catch (error) {
        // console.error, not the logger — same reason notify-unread gives.
        console.error("[communication] could not tell an admin about a new support request", {
          threadId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
```

Note the payload key is `requestAudience`, not `audience`: `DeliverNotificationInternalCommand.templatePayload` merges the *notification's* `audience` (`user` / `provider`) over the payload, and a key named `audience` would be overwritten before the template reads it. `providerId` is only present when there is one, so `{ threadId, subject, requestAudience }` is the exact shape the test asserts for a personal request.

- [ ] **Step 7: Write the three admin commands**

`reply-to-support-request.command.ts`:

```ts
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { Message } from "../../domain/aggregates/message.aggregate";
import { SupportRequestNotFoundError } from "../../domain/exceptions";
import type { ThreadRepositoryPort } from "../ports/outbound/thread.repository.port";
import type { MessageRepositoryPort } from "../ports/outbound/message.repository.port";
import type { AttachmentRepositoryPort } from "../ports/outbound/attachment.repository.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";
import { resolveAttachments, type AttachmentDescriptor } from "./resolve-attachments";

export interface ReplyToSupportRequestInput {
  threadId: string;
  adminUserId: string;
  body: string;
  attachments?: AttachmentDescriptor[] | undefined;
}

/**
 * The platform answering. No `visibleToViewer`: the handler proved the role,
 * and `findSupportThread` scopes the read to support threads so an admin
 * cannot write into a private conversation by id. No contact check — the
 * platform may give out its own number. Same insert / attachments / touch
 * transaction as `SendMessageCommand`.
 */
export class ReplyToSupportRequestCommand {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly attachments: AttachmentRepositoryPort,
    private readonly attachmentStorage: AttachmentStoragePort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ReplyToSupportRequestInput): Promise<{ id: string }> {
    const thread = await this.threads.findSupportThread(input.threadId);
    if (!thread) throw new SupportRequestNotFoundError();

    const attachments = await resolveAttachments(this.attachmentStorage, input.adminUserId, input.attachments ?? []);
    const message = Message.compose({
      threadId: input.threadId,
      senderUserId: input.adminUserId,
      senderSide: "platform",
      body: input.body,
      attachmentCount: attachments.length,
      now: this.now(),
    });

    return await this.unitOfWork.atomicExecute(async () => {
      const id = await this.messages.insert(message);
      if (attachments.length > 0) await this.attachments.insertMany(id, attachments);
      await this.threads.touch(input.threadId, message.createdAt);
      return { id };
    });
  }
}
```

`resolve-support-request.command.ts`:

```ts
import { NotificationType } from "@ntizo/shared";
import { SupportRequestNotFoundError } from "../../domain/exceptions";
import type { ThreadRepositoryPort } from "../ports/outbound/thread.repository.port";
import type { SupportRequestRepositoryPort } from "../ports/outbound/support-request.repository.port";
import type { RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";

export interface ResolveSupportRequestInput {
  threadId: string;
  adminUserId: string;
}

/**
 * The admin closing a request. Raised immediately, not through the sweep —
 * a resolution is a state change, not a message somebody might read in
 * time. Best-effort, like every raise in this context: the resolution is
 * saved whether or not the telling worked.
 */
export class ResolveSupportRequestCommand {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly supportRequests: SupportRequestRepositoryPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ResolveSupportRequestInput): Promise<{ threadId: string; status: "resolved" }> {
    const thread = await this.threads.findSupportThread(input.threadId);
    const request = thread ? await this.supportRequests.findByThreadId(input.threadId) : null;
    if (!thread || !request) throw new SupportRequestNotFoundError();

    const resolved = request.resolve(input.adminUserId, this.now());
    await this.supportRequests.save(resolved);

    const payload = {
      threadId: input.threadId,
      subject: resolved.subject,
      requestAudience: resolved.audience,
      ...(thread.providerId ? { providerId: thread.providerId } : {}),
    };
    try {
      await this.raiseNotification.execute(
        thread.providerId
          ? { type: NotificationType.SupportRequestResolved, audience: "provider", providerId: thread.providerId, payload }
          : { type: NotificationType.SupportRequestResolved, audience: "user", userId: thread.customerUserId, payload },
      );
    } catch (error) {
      console.error("[communication] could not tell the requester their request was resolved", {
        threadId: input.threadId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { threadId: input.threadId, status: "resolved" };
  }
}
```

`mark-support-request-read.command.ts`:

```ts
import { SupportRequestNotFoundError } from "../../domain/exceptions";
import type { ThreadRepositoryPort } from "../ports/outbound/thread.repository.port";
import type { MessageRepositoryPort } from "../ports/outbound/message.repository.port";

/** The platform side reading a request: everything the requester side sent becomes read. */
export class MarkSupportRequestReadCommand {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: { threadId: string }): Promise<{ marked: number }> {
    const thread = await this.threads.findSupportThread(input.threadId);
    if (!thread) throw new SupportRequestNotFoundError();
    const marked = await this.messages.markReadForPlatform(input.threadId, this.now());
    return { marked };
  }
}
```

- [ ] **Step 8: Run and commit**

Run: `cd packages/backend && bun run typecheck && bun test src/modules/ntizo/bounded-contexts/communication/__tests__/`
Expected: typecheck fails only on `NotificationType.SupportRequestOpened` / `SupportRequestResolved` if Task 6 Step 1 has not been done yet — do it now (it is one enum edit plus four `case` lines) and re-run. Then PASS.

Stage `bounded-contexts/communication/app/use-cases`, the two test files (and `__tests__/fakes.ts` if created), and — if you did Task 6 Step 1 here — `packages/shared/src/enums/notification-enums/notification-type.enum.ts`; commit:

`feat(communication): open, reply to, resolve and read a support request`

---

## Task 6: Four notifications, and the sweep learning a third side

**Files:**
- Modify: `packages/shared/src/enums/notification-enums/notification-type.enum.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/notification/infrastructure/templates/support-request-opened.template.ts`
- Create: `.../templates/support-request-message.template.ts`
- Create: `.../templates/support-reply.template.ts`
- Create: `.../templates/support-request-resolved.template.ts`
- Modify: `.../templates/registry.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/communication/app/use-cases/notify-unread.internal.command.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/notification/__tests__/templates.test.ts` (extend), `packages/backend/src/modules/ntizo/bounded-contexts/communication/__tests__/notify-unread.test.ts` (extend)

**Interfaces:**
- Produces: `NotificationType.SupportRequestOpened = "SUPPORT_REQUEST_OPENED"`, `SupportRequestMessage = "SUPPORT_REQUEST_MESSAGE"`, `SupportReply = "SUPPORT_REPLY"`, `SupportRequestResolved = "SUPPORT_REQUEST_RESOLVED"` — all transactional (bucket `null`). Payload contract for all four: `{ threadId: string; subject: string; requestAudience: "customer" | "provider"; providerId?: string }`. `NotifyUnreadInternalCommand` constructor gains `admins: AdminUserReaderPort` as its **third** argument: `(messages, raiseNotification, admins, now?)`.

- [ ] **Step 1: The enum**

In `notification-type.enum.ts`, add a group after `// --- messages ---`:

```ts
  // --- support -----------------------------------------------------------
  /** To every admin: somebody opened a request. */
  SupportRequestOpened = "SUPPORT_REQUEST_OPENED",
  /** To every admin: the requester wrote again and nobody read it in time. */
  SupportRequestMessage = "SUPPORT_REQUEST_MESSAGE",
  /** To the requester side: the platform answered and it sat unread. */
  SupportReply = "SUPPORT_REPLY",
  /** To the requester side: an admin marked the request resolved. */
  SupportRequestResolved = "SUPPORT_REQUEST_RESOLVED",
```

and four `case` lines in `bucketForNotificationType`'s `return null` group (after `NewMessage`):

```ts
    case NotificationType.SupportRequestOpened:
    case NotificationType.SupportRequestMessage:
    case NotificationType.SupportReply:
    case NotificationType.SupportRequestResolved:
```

Run: `cd packages/shared && bun run typecheck && bun run test`
Expected: PASS — `notifications.test.ts` walks every type through the switch and checks fewer than half are switchable.

- [ ] **Step 2: Extend the template test**

In `templates.test.ts`, add the four payloads to `PAYLOADS` so the table-driven "renders in every locale" test picks the new registry entries up:

```ts
  [NotificationType.SupportRequestOpened]: { threadId: "t1", subject: "Reembolso", requestAudience: "customer" },
  [NotificationType.SupportRequestMessage]: { threadId: "t1", subject: "Reembolso", requestAudience: "provider", providerId: "p1" },
  [NotificationType.SupportReply]: { threadId: "t1", subject: "Reembolso", requestAudience: "customer" },
  [NotificationType.SupportRequestResolved]: { threadId: "t1", subject: "Reembolso", requestAudience: "provider", providerId: "p1" },
```

and one describe proving the links go where each reader lives:

```ts
describe("support templates link to the reader's own screen", () => {
  it("admin templates link to the admin queue entry", async () => {
    for (const type of [NotificationType.SupportRequestOpened, NotificationType.SupportRequestMessage]) {
      const out = (await withInfra(() => renderer.render(type, "pt-MZ", PAYLOADS[type]!)))!;
      expect(out.text).toContain("https://ntizo.test/admin/support/t1");
      expect(out.text).toContain("Reembolso");
    }
  });

  it("requester templates link to the personal inbox, or the provider's", async () => {
    const personal = (await withInfra(() => renderer.render(NotificationType.SupportReply, "pt-MZ", { threadId: "t1", subject: "S", requestAudience: "customer" })))!;
    expect(personal.text).toContain("https://ntizo.test/messages?thread=t1");
    const provider = (await withInfra(() => renderer.render(NotificationType.SupportRequestResolved, "pt-MZ", { threadId: "t1", subject: "S", requestAudience: "provider", providerId: "p1" })))!;
    expect(provider.text).toContain("https://ntizo.test/provider/p1/messages?thread=t1");
  });

  it("escapes a subject that carries markup", async () => {
    const out = (await withInfra(() => renderer.render(NotificationType.SupportRequestOpened, "en-US", { threadId: "t1", subject: "<b>x</b>", requestAudience: "customer" })))!;
    expect(out.html).not.toContain("<b>x</b>");
    expect(out.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
```

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/notification/__tests__/templates.test.ts`
Expected: FAIL — the four types are not in the registry, so `PAYLOADS` has keys the loop never reaches and the link tests get `null`.

- [ ] **Step 3: Write a shared link helper and the four templates**

Each template follows `new-message.template.ts`: a `Copy` interface, eight locale constants (pt-MZ and pt-PT share `PT`), an exported `BY_LOCALE`, and a `TemplateModule`. Put the two URL rules in one small module so four templates cannot drift:

`support-links.ts` (same folder):

```ts
import { appBaseUrl } from "./copy";

/** Where the requester finds their request: their inbox, or the provider's. */
export function requesterThreadUrl(payload: Record<string, unknown>): string {
  const threadId = String(payload["threadId"] ?? "");
  if (payload["requestAudience"] === "provider" && typeof payload["providerId"] === "string") {
    return `${appBaseUrl()}/provider/${payload["providerId"]}/messages?thread=${threadId}`;
  }
  return `${appBaseUrl()}/messages?thread=${threadId}`;
}

/** Where an admin finds it: the queue entry. */
export function adminRequestUrl(payload: Record<string, unknown>): string {
  return `${appBaseUrl()}/admin/support/${String(payload["threadId"] ?? "")}`;
}

/** The subject as a template may print it — never raw. */
export function subjectOf(payload: Record<string, unknown>): string {
  return typeof payload["subject"] === "string" ? payload["subject"] : "";
}
```

`support-request-opened.template.ts`:

```ts
import { emailLayout, buttonHtml } from "../../../../../../shared/infrastructure/email/templates/layout";
import { escapeHtml, pickCopy, type TemplateModule } from "./copy";
import { adminRequestUrl, subjectOf } from "./support-links";

interface Copy {
  subject: (s: string) => string;
  heading: string;
  body: (s: string) => string;
  cta: string;
  disclaimer: string;
}

const EN: Copy = {
  subject: (s) => `New support request: ${s}`,
  heading: "New support request",
  body: (s) => `Somebody opened a support request: "${s}". It is waiting in the queue.`,
  cta: "Open the request",
  disclaimer: "You are receiving this because you administer Ntizo.",
};

const PT: Copy = {
  subject: (s) => `Novo pedido de suporte: ${s}`,
  heading: "Novo pedido de suporte",
  body: (s) => `Alguém abriu um pedido de suporte: «${s}». Está à espera na fila.`,
  cta: "Abrir o pedido",
  disclaimer: "Recebe esta mensagem porque administra a Ntizo.",
};

const ES: Copy = {
  subject: (s) => `Nueva solicitud de soporte: ${s}`,
  heading: "Nueva solicitud de soporte",
  body: (s) => `Alguien abrió una solicitud de soporte: «${s}». Está esperando en la cola.`,
  cta: "Abrir la solicitud",
  disclaimer: "Recibes este mensaje porque administras Ntizo.",
};

const FR: Copy = {
  subject: (s) => `Nouvelle demande d'assistance : ${s}`,
  heading: "Nouvelle demande d'assistance",
  body: (s) => `Quelqu'un a ouvert une demande d'assistance : « ${s} ». Elle attend dans la file.`,
  cta: "Ouvrir la demande",
  disclaimer: "Vous recevez ce message car vous administrez Ntizo.",
};

const IT: Copy = {
  subject: (s) => `Nuova richiesta di assistenza: ${s}`,
  heading: "Nuova richiesta di assistenza",
  body: (s) => `Qualcuno ha aperto una richiesta di assistenza: «${s}». È in attesa nella coda.`,
  cta: "Apri la richiesta",
  disclaimer: "Ricevi questo messaggio perché amministri Ntizo.",
};

const DE: Copy = {
  subject: (s) => `Neue Supportanfrage: ${s}`,
  heading: "Neue Supportanfrage",
  body: (s) => `Jemand hat eine Supportanfrage geöffnet: „${s}“. Sie wartet in der Warteschlange.`,
  cta: "Anfrage öffnen",
  disclaimer: "Sie erhalten diese Nachricht, weil Sie Ntizo administrieren.",
};

const NL: Copy = {
  subject: (s) => `Nieuw supportverzoek: ${s}`,
  heading: "Nieuw supportverzoek",
  body: (s) => `Iemand heeft een supportverzoek geopend: "${s}". Het wacht in de wachtrij.`,
  cta: "Verzoek openen",
  disclaimer: "Je ontvangt dit bericht omdat je Ntizo beheert.",
};

export const BY_LOCALE: Record<string, Copy> = {
  "en-US": EN, "pt-MZ": PT, "pt-PT": PT, "es-ES": ES, "fr-FR": FR, "it-IT": IT, "de-DE": DE, "nl-NL": NL,
};

/** Raised by `OpenSupportRequestCommand`, once per admin, the moment a request is opened. */
export const supportRequestOpenedTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const subject = subjectOf(payload);
    const url = adminRequestUrl(payload);
    return {
      subject: c.subject(subject),
      html: emailLayout({
        heading: c.heading,
        bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">${escapeHtml(c.body(subject))}</p>${buttonHtml(url, c.cta)}`,
        disclaimer: c.disclaimer,
      }),
      text: `${c.heading}\n\n${c.body(subject)}\n\n${url}`,
    };
  },
};
```

`support-request-message.template.ts` — identical structure, `adminRequestUrl`, copy: EN subject `New message on a support request: ${s}`, heading "New message on a support request", body `The requester wrote again on "${s}" and nobody has read it yet.`, cta "Open the request"; PT subject `Nova mensagem num pedido de suporte: ${s}`, heading "Nova mensagem num pedido de suporte", body `O requerente escreveu de novo em «${s}» e ainda ninguém leu.`, cta "Abrir o pedido"; same disclaimer as above; ES/FR/IT/DE/NL translated in the same register. Export `supportRequestMessageTemplate`.

`support-reply.template.ts` — `requesterThreadUrl`, copy: EN subject `Ntizo Support replied: ${s}`, heading "Support replied", body `Ntizo Support answered your request "${s}". Open it to read the reply.`, cta "Read the reply", disclaimer "You are receiving this because you have an open support request on Ntizo."; PT subject `O Suporte Ntizo respondeu: ${s}`, heading "O suporte respondeu", body `O Suporte Ntizo respondeu ao seu pedido «${s}». Abra-o para ler a resposta.`, cta "Ler a resposta", disclaimer "Recebe esta mensagem porque tem um pedido de suporte aberto na Ntizo."; the rest translated. Export `supportReplyTemplate`.

`support-request-resolved.template.ts` — `requesterThreadUrl`, copy: EN subject `Your request was resolved: ${s}`, heading "Request resolved", body `Ntizo Support marked your request "${s}" as resolved. If it is not, reply on it and it reopens.`, cta "See the request", same disclaimer as reply; PT subject `O seu pedido foi resolvido: ${s}`, heading "Pedido resolvido", body `O Suporte Ntizo marcou o seu pedido «${s}» como resolvido. Se não estiver, responda no pedido e ele reabre.`, cta "Ver o pedido"; the rest translated. Export `supportRequestResolvedTemplate`.

- [ ] **Step 4: Register them**

In `registry.ts`, import the four and add:

```ts
  [NotificationType.SupportRequestOpened]: supportRequestOpenedTemplate,
  [NotificationType.SupportRequestMessage]: supportRequestMessageTemplate,
  [NotificationType.SupportReply]: supportReplyTemplate,
  [NotificationType.SupportRequestResolved]: supportRequestResolvedTemplate,
```

Update the registry's doc comment count ("six have producers" → "ten").

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/notification/__tests__/templates.test.ts`
Expected: PASS, 32 new "renders in" cases plus the three link tests.

- [ ] **Step 5: Write the failing sweep tests**

In `notify-unread.test.ts`, `dueMessage` must produce the Task 3 shape — change its defaults to `{ threadType: "inquiry", senderSide: "customer", customerUserId: customerId, providerId, subject: null }` and drop `senderUserId`. The existing "who gets told" tests then pass `senderSide: "provider"` where they passed `senderUserId: staffId`. Add a `FakeAdminUserReader` (as in Task 5) and pass it as the third constructor argument everywhere. Then add:

```ts
describe("support requests", () => {
  const admins = new FakeAdminUserReader(["admin-1", "admin-2"]);

  it("a requester's unread message tells every admin, once each", async () => {
    const messages = new FakeMessageRepository([
      dueMessage("m1", { threadType: "support", senderSide: "customer", providerId: null, subject: "Reembolso" }),
    ]);
    const notify = new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW);

    const result = await notify.execute({ limit: 10 });

    expect(result).toEqual({ notified: 1, failed: 0 });
    expect(raised.calls).toEqual([
      { type: NotificationType.SupportRequestMessage, audience: "user", userId: "admin-1", payload: { threadId: "m1-thread", subject: "Reembolso", requestAudience: "customer" } },
      { type: NotificationType.SupportRequestMessage, audience: "user", userId: "admin-2", payload: { threadId: "m1-thread", subject: "Reembolso", requestAudience: "customer" } },
    ]);
    expect(messages.notifiedAt.has("m1")).toBe(true);
  });

  it("a platform reply tells the customer on a personal request, and the provider on a provider request", async () => {
    const messages = new FakeMessageRepository([
      dueMessage("personal", { threadType: "support", senderSide: "platform", providerId: null, subject: "A" }),
      dueMessage("prov", { threadType: "support", senderSide: "platform", customerUserId: staffId, providerId, subject: "B" }),
    ]);
    await new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW).execute({ limit: 10 });

    expect(raised.calls).toEqual([
      { type: NotificationType.SupportReply, audience: "user", userId: customerId, payload: { threadId: "personal-thread", subject: "A", requestAudience: "customer" } },
      { type: NotificationType.SupportReply, audience: "provider", providerId, payload: { threadId: "prov-thread", subject: "B", requestAudience: "provider", providerId } },
    ]);
  });

  it("a member's message on a provider request still goes to the admins, with the provider named", async () => {
    const messages = new FakeMessageRepository([
      dueMessage("m", { threadType: "support", senderSide: "provider", customerUserId: staffId, providerId, subject: "C" }),
    ]);
    await new NotifyUnreadInternalCommand(messages, raised, new FakeAdminUserReader(["admin-1"]), () => NOW).execute({ limit: 10 });
    expect(raised.calls).toEqual([
      { type: NotificationType.SupportRequestMessage, audience: "user", userId: "admin-1", payload: { threadId: "m-thread", subject: "C", requestAudience: "provider", providerId } },
    ]);
  });

  it("an inquiry is untouched by all of this", async () => {
    const messages = new FakeMessageRepository([dueMessage("i", { senderSide: "provider" })]);
    await new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW).execute({ limit: 10 });
    expect(raised.calls).toEqual([{ type: NotificationType.NewMessage, audience: "user", userId: customerId, payload: { threadId: "i-thread" } }]);
  });

  it("with no admins at all, the message is marked notified rather than retried forever", async () => {
    const messages = new FakeMessageRepository([dueMessage("m", { threadType: "support", senderSide: "customer", providerId: null, subject: "x" })]);
    const result = await new NotifyUnreadInternalCommand(messages, raised, new FakeAdminUserReader([]), () => NOW).execute({ limit: 10 });
    expect(result).toEqual({ notified: 1, failed: 0 });
    expect(raised.calls).toHaveLength(0);
    expect(messages.notifiedAt.has("m")).toBe(true);
  });

  it("one admin failing does not lose the notice for the others, and the message is still marked", async () => {
    raised.failOn((input) => input.audience === "user" && input.userId === "admin-1");
    const messages = new FakeMessageRepository([dueMessage("m", { threadType: "support", senderSide: "customer", providerId: null, subject: "x" })]);
    const result = await new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW).execute({ limit: 10 });
    expect(result).toEqual({ notified: 1, failed: 0 });
    expect(raised.calls).toHaveLength(2);
    expect(messages.notifiedAt.has("m")).toBe(true);
  });

  it("every admin failing counts the message as failed and leaves it for the next sweep", async () => {
    raised.failOn(() => true);
    const messages = new FakeMessageRepository([dueMessage("m", { threadType: "support", senderSide: "customer", providerId: null, subject: "x" })]);
    const result = await new NotifyUnreadInternalCommand(messages, raised, admins, () => NOW).execute({ limit: 10 });
    expect(result).toEqual({ notified: 0, failed: 1 });
    expect(messages.notifiedAt.has("m")).toBe(false);
  });
});
```

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/communication/__tests__/notify-unread.test.ts`
Expected: FAIL — constructor arity, and inquiries decided by `senderUserId` which no longer exists on `DueMessage`.

- [ ] **Step 6: Rewrite the sweep's recipient logic**

In `notify-unread.internal.command.ts`, add the import and the constructor argument, and replace the body of the `for` loop's `try`:

```ts
import type { AdminUserReaderPort } from "../ports/outbound/admin-user-reader.port";
import type { DueMessage } from "../ports/outbound/message.repository.port";
import type { RaiseNotificationInput } from "../ports/outbound/raise-notification.port";
```

```ts
  constructor(
    private readonly messages: MessageRepositoryPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
    private readonly admins: AdminUserReaderPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: NotifyUnreadInternalInput): Promise<{ notified: number; failed: number }> {
    const due = await this.messages.claimDueForNotice(input.limit, this.now());

    let notified = 0;
    let failed = 0;

    for (const message of due) {
      try {
        const delivered = await this.tell(message);
        if (!delivered) throw new Error("nobody could be told");
        await this.messages.markNotified(message.id, this.now());
        notified++;
      } catch (error) {
        failed++;
        console.error("[communication] could not notify an unread message", {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { notified, failed };
  }

  /**
   * Who is told, and with what. Returns `false` only when there were people
   * to tell and every raise failed — that is the case worth retrying. An
   * empty admin list is not a failure: retrying would never produce an
   * admin, and the queue shows the request regardless.
   *
   * **The inquiry branch is phase 1's rule, now read off `senderSide`**
   * rather than compared against `customerUserId` — same recipients as
   * before, one field instead of an equality on ids.
   *
   * **The support branches:** a platform reply goes to the requester side
   * — the person, or the provider's members through `audience: "provider"`,
   * which is how the notification context already fans out to a team. A
   * requester-side message goes to every admin, one raise each, each in
   * its own try; one admin's failure must not cost the others their
   * notice, and a raise that succeeded is not repeated on the next sweep
   * because the message is marked once any admin was told.
   */
  private async tell(message: DueMessage): Promise<boolean> {
    if (message.threadType === "inquiry") {
      const recipient =
        message.senderSide === "customer"
          ? ({ audience: "provider", providerId: message.providerId! } as const)
          : ({ audience: "user", userId: message.customerUserId } as const);
      await this.raiseNotification.execute({
        type: NotificationType.NewMessage,
        ...recipient,
        payload: { threadId: message.threadId },
      });
      return true;
    }

    const payload: Record<string, unknown> = {
      threadId: message.threadId,
      subject: message.subject ?? "",
      requestAudience: message.providerId ? "provider" : "customer",
      ...(message.providerId ? { providerId: message.providerId } : {}),
    };

    if (message.senderSide === "platform") {
      const raise: RaiseNotificationInput = message.providerId
        ? { type: NotificationType.SupportReply, audience: "provider", providerId: message.providerId, payload }
        : { type: NotificationType.SupportReply, audience: "user", userId: message.customerUserId, payload };
      await this.raiseNotification.execute(raise);
      return true;
    }

    const adminIds = await this.admins.findAdminUserIds();
    if (adminIds.length === 0) return true;
    let told = 0;
    for (const userId of adminIds) {
      try {
        await this.raiseNotification.execute({
          type: NotificationType.SupportRequestMessage,
          audience: "user",
          userId,
          payload,
        });
        told++;
      } catch (error) {
        console.error("[communication] could not tell an admin about a support message", {
          messageId: message.id,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return told > 0;
  }
```

`message.providerId!` on the inquiry branch is safe by construction — `thread_inquiry_has_provider` (Task 1) is the database's guarantee, and this is the one place the code leans on it; say so in a comment.

- [ ] **Step 7: Run and commit**

Run: `cd packages/backend && bun run typecheck && bun test src/modules/ntizo/bounded-contexts/communication/__tests__/notify-unread.test.ts src/modules/ntizo/bounded-contexts/notification/__tests__/templates.test.ts`
Expected: typecheck fails only in `bootstrap/index.ts` (constructor arity — Task 7); both test files PASS.

Stage the enum, the five template files, `registry.ts`, the sweep, and both tests; commit:

`feat(notification): four support notifications, and the sweep telling the platform's side`

---

## Task 7: Wiring the context

**Files:**
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/communication/bootstrap/index.ts`
- Modify: `.../communication/index.ts`
- Modify: `apps/backend/api/src/scheduled.ts` (no code change needed — verify), `apps/backend/api/src/graphql/private.ts` (no change yet — Task 11)

**Interfaces:**
- Produces: `bootstrapCommunication(deps).useCases` gains `openSupportRequest`, `replyToSupportRequest`, `resolveSupportRequest`, `markSupportRequestRead`; `adapters` gains `supportRequestRepository`, `bookingReader`, `adminUserReader`. `CommunicationBootstrapDeps` is unchanged.

- [ ] **Step 1: Wire the bootstrap**

Replace the body of `bootstrapCommunication`:

```ts
export function bootstrapCommunication(deps: CommunicationBootstrapDeps) {
  const threadRepository = new DrizzleThreadRepository();
  const messageRepository = new DrizzleMessageRepository();
  const attachmentRepository = new DrizzleAttachmentRepository();
  const supportRequestRepository = new DrizzleSupportRequestRepository();
  const providerReader = new DrizzleProviderReader();
  const bookingReader = new DrizzleBookingReader();
  const adminUserReader = new DrizzleAdminUserReader();
  const unitOfWork = new DrizzleUnitOfWork();

  return {
    adapters: {
      threadRepository,
      messageRepository,
      attachmentRepository,
      supportRequestRepository,
      providerReader,
      bookingReader,
      adminUserReader,
      unitOfWork,
    },
    useCases: {
      startThread: new StartThreadCommand(threadRepository, providerReader),
      sendMessage: new SendMessageCommand(
        threadRepository,
        messageRepository,
        attachmentRepository,
        supportRequestRepository,
        deps.attachmentStorage,
        unitOfWork,
      ),
      markThreadRead: new MarkThreadReadCommand(threadRepository, messageRepository),
      // Phase 2 — the requester's side.
      openSupportRequest: new OpenSupportRequestCommand(
        threadRepository,
        supportRequestRepository,
        messageRepository,
        attachmentRepository,
        deps.attachmentStorage,
        providerReader,
        bookingReader,
        adminUserReader,
        deps.raiseNotification,
        unitOfWork,
      ),
      // Phase 2 — the platform's side. Mounted only by `write/support`,
      // behind `requireAdmin`; nothing on the participant slices reaches them.
      replyToSupportRequest: new ReplyToSupportRequestCommand(
        threadRepository,
        messageRepository,
        attachmentRepository,
        deps.attachmentStorage,
        unitOfWork,
      ),
      resolveSupportRequest: new ResolveSupportRequestCommand(
        threadRepository,
        supportRequestRepository,
        deps.raiseNotification,
      ),
      markSupportRequestRead: new MarkSupportRequestReadCommand(threadRepository, messageRepository),
      internal: {
        notifyUnread: new NotifyUnreadInternalCommand(messageRepository, deps.raiseNotification, adminUserReader),
      },
    },
  };
}
```

with the matching imports at the top (the four new commands, `DrizzleSupportRequestRepository`, `DrizzleBookingReader`, `DrizzleAdminUserReader`).

- [ ] **Step 2: Export from the context's index**

Append to `index.ts`:

```ts
export {
  SupportRequest,
  SUPPORT_SUBJECT_MAX,
  MAX_OPEN_SUPPORT_REQUESTS,
} from "./domain/aggregates/support-request.aggregate";
export {
  SupportSubjectInvalidError,
  SupportNotAMemberError,
  SupportBookingNotYoursError,
  SupportRequestNotFoundError,
  SupportAlreadyResolvedError,
  SupportRequestNotResolvedError,
  SupportTooManyOpenError,
} from "./domain/exceptions";
export {
  OpenSupportRequestCommand,
  type OpenSupportRequestInput,
} from "./app/use-cases/open-support-request.command";
export {
  ReplyToSupportRequestCommand,
  type ReplyToSupportRequestInput,
} from "./app/use-cases/reply-to-support-request.command";
export {
  ResolveSupportRequestCommand,
  type ResolveSupportRequestInput,
} from "./app/use-cases/resolve-support-request.command";
export { MarkSupportRequestReadCommand } from "./app/use-cases/mark-support-request-read.command";
export type {
  SupportRequestFilter,
  SupportRequestListItem,
  SupportRequestPage,
  SupportRequestRepositoryPort,
} from "./app/ports/outbound/support-request.repository.port";
export type { BookingReaderPort } from "./app/ports/outbound/booking-reader.port";
export type { AdminUserReaderPort } from "./app/ports/outbound/admin-user-reader.port";
```

- [ ] **Step 3: Confirm the existing callers still compile**

`scheduled.ts` and `private.ts` call `bootstrapCommunication({ raiseNotification, attachmentStorage })` — unchanged deps, so nothing to edit. The write-handler test's `makeModule` (`write/communication/__tests__/mutations.handlers.test.ts`) builds a `CommunicationBootstrap` by cast, so it compiles; Task 10 extends it.

Run: `cd packages/backend && bun run typecheck && bun test src/modules/ntizo/bounded-contexts/communication && cd ../../apps/backend/api && bun run typecheck`
Expected: PASS everywhere. `bun test` in `packages/backend` as a whole: the `read/communication` projection tests still pass (their fakes were widened in Task 2; the `providerIds` filter from Task 3 keeps the projection compiling).

Stage `bootstrap/index.ts` and `index.ts`; commit:

`feat(communication): wire the support commands and readers`

---

## Task 8: The read models, and the inboxes learning about support

**Files:**
- Modify: `packages/shared/src/read-models/system/communication/thread.schema.ts`
- Modify: `packages/shared/src/read-models/system/communication/message.schema.ts`
- Create: `packages/shared/src/read-models/system/support/support-request.schema.ts`, `.../support/index.ts`
- Modify: `packages/shared/src/read-models/system/index.ts`
- Modify: `packages/backend/src/modules/ntizo/read/communication/app/use-cases/conversations.projection.ts`
- Modify: `.../read/communication/graphql/schema/queries.ts`
- Modify: `.../read/communication/graphql/handlers/queries.handlers.ts`
- Modify: `.../read/communication/bootstrap/index.ts`
- Test: `packages/shared/src/read-models/__tests__/read-models.test.ts` (extend), `.../read/communication/__tests__/projections.test.ts` (extend), `.../read/communication/__tests__/queries.handlers.test.ts` (extend)

**Interfaces:**
- Produces (shared): `threadSummaryReadModel` gains `type: "inquiry" | "support"`, `providerId: string | null`, `support: { subject, status, audience, bookingId } | null`; `messageReadModel` gains `senderSide`; new `supportRequestSummaryReadModel`, `supportRequestPageReadModel`, DTOs `SupportRequestSummaryDTO`, `SupportRequestPageDTO`.
- Produces (backend): `ListMyThreadsProjection.execute({ requesterUserId, limit?, cursor?, type? })` and `ListProviderThreadsProjection.execute({ ..., type? })`; both constructors gain `supportRequests: SupportRequestRepositoryPort` as their **last** argument; GraphQL args `communicationMyThreads(limit, cursor, type)` / `communicationProviderThreads(providerId, limit, cursor, type)`.

- [ ] **Step 1: The shared read models**

`thread.schema.ts` — replace `threadSummaryReadModel`:

```ts
/** What a support row adds to an inbox line. Null on an inquiry. */
export const threadSupportReadModel = z.object({
  subject: z.string(),
  status: z.enum(["open", "resolved"]),
  audience: z.enum(["customer", "provider"]),
  bookingId: z.string().nullable(),
});

export const threadSummaryReadModel = z.object({
  id: z.string(),
  type: z.enum(["inquiry", "support"]),
  /** Null on a personal support request — there is no provider on it. */
  providerId: z.string().nullable(),
  providerName: z.string().catch(""),
  customerName: z.string().catch(""),
  lastMessageAt: z.string(),
  lastMessagePreview: z.string().catch(""),
  lastMessageHasAttachment: z.boolean().catch(false),
  unreadCount: z.number().int().min(0),
  support: threadSupportReadModel.nullable(),
});
```

and export `ThreadSupportDTO`. `message.schema.ts` — add to `messageReadModel` after `senderUserId`:

```ts
  /** Which side wrote it. The frontend aligns by this, and labels `platform` "Suporte Ntizo". */
  senderSide: z.enum(["customer", "provider", "platform"]),
```

`support/support-request.schema.ts`:

```ts
import { z } from "zod";

/**
 * One row of the admin queue. Names carry `.catch("")` like the inbox
 * row's: a requester whose profile was never filled in, or a provider since
 * deleted, degrades to an empty name rather than a refused page.
 */
export const supportRequestSummaryReadModel = z.object({
  threadId: z.string(),
  audience: z.enum(["customer", "provider"]),
  subject: z.string(),
  status: z.enum(["open", "resolved"]),
  requesterUserId: z.string(),
  requesterName: z.string().catch(""),
  providerId: z.string().nullable(),
  providerName: z.string().catch(""),
  bookingId: z.string().nullable(),
  lastMessageAt: z.string(),
  lastMessagePreview: z.string().catch(""),
  unreadForAdmin: z.number().int().min(0),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export const supportRequestPageReadModel = z.object({
  items: z.array(supportRequestSummaryReadModel),
  nextCursor: z.string().nullable(),
});

export type SupportRequestSummaryDTO = z.infer<typeof supportRequestSummaryReadModel>;
export type SupportRequestPageDTO = z.infer<typeof supportRequestPageReadModel>;
```

`support/index.ts`: `export * from "./support-request.schema";`. Add `export * from "./support";` to `system/index.ts`.

In `read-models.test.ts`, add a case in the style of the file's existing ones: a `threadSummaryReadModel` parse with `support: null` and `providerId: null` passes; `senderSide: "someone"` on a message is refused; `supportRequestSummaryReadModel` with `requesterName: undefined` parses to `""`.

Run: `cd packages/shared && bun run typecheck && bun run test`
Expected: PASS.

- [ ] **Step 2: Write the failing projection tests**

In `read/communication/__tests__/projections.test.ts`, the `thread()` helper's default `providerId` stays required in its argument; add `FakeSupportRequestRepository` (copy Task 5's, without the unit-of-work argument) and pass it as the last constructor argument to `ListMyThreadsProjection` and `ListProviderThreadsProjection` everywhere. Then:

```ts
describe("support rows in an inbox", () => {
  it("carries type, a null provider, and the request's subject and status", async () => {
    const t = Thread.rehydrate({ id: "s1", type: "support", customerUserId: "u-customer", providerId: null, lastMessageAt: NOW, createdAt: NOW });
    const request = SupportRequest.open({ threadId: "s1", audience: "customer", subject: "Reembolso", bookingId: "b1", now: NOW });
    const threads = new FakeThreadRepository({ items: [t], nextCursor: null });
    const requests = new FakeSupportRequestRepository(new Map([["s1", request]]));
    const projection = new ListMyThreadsProjection(threads, new FakeMessageRepository(), providerNames, customerNames, previews, requests);

    const page = await projection.execute({ requesterUserId: "u-customer" });

    expect(page.items[0]).toMatchObject({
      id: "s1",
      type: "support",
      providerId: null,
      providerName: "",
      support: { subject: "Reembolso", status: "open", audience: "customer", bookingId: "b1" },
    });
  });

  it("an inquiry row has support: null and the same fields as before", async () => {
    const threads = new FakeThreadRepository({ items: [thread({ id: "i1", providerId: "p1" })], nextCursor: null });
    const projection = new ListMyThreadsProjection(threads, new FakeMessageRepository(), providerNames, customerNames, previews, new FakeSupportRequestRepository());
    const page = await projection.execute({ requesterUserId: "u-customer" });
    expect(page.items[0]).toMatchObject({ id: "i1", type: "inquiry", providerId: "p1", support: null });
  });

  it("passes the type filter through to the repository", async () => {
    const threads = new FakeThreadRepository();
    const projection = new ListMyThreadsProjection(threads, new FakeMessageRepository(), providerNames, customerNames, previews, new FakeSupportRequestRepository());
    await projection.execute({ requesterUserId: "u-customer", type: "support" });
    expect(threads.calls).toContain("listForCustomer:u-customer:20:none:support");
  });

  it("resolves provider names only for rows that have a provider", async () => {
    const t = Thread.rehydrate({ id: "s1", type: "support", customerUserId: "u-customer", providerId: null, lastMessageAt: NOW, createdAt: NOW });
    const threads = new FakeThreadRepository({ items: [t, thread({ id: "i1", providerId: "p1" })], nextCursor: null });
    const names = new FakeProviderNameReader(new Map([["p1", "Salão X"]]));
    const projection = new ListMyThreadsProjection(threads, new FakeMessageRepository(), names, customerNames, previews, new FakeSupportRequestRepository());
    await projection.execute({ requesterUserId: "u-customer" });
    expect(names.askedFor).toEqual(["p1"]);
  });
});

describe("messages carry their side", () => {
  it("maps senderSide onto the wire", async () => {
    const messages = new FakeMessageRepository({ items: [message({ id: "m1", threadId: "t1", senderSide: "platform" })], nextCursor: null });
    const projection = new ListThreadMessagesProjection(new FakeThreadRepository(emptyThreadPage, { "t1:u-customer": true }), messages, new FakeAttachmentRepository());
    const page = await projection.execute({ requesterUserId: "u-customer", threadId: "t1" });
    expect(page.items[0]?.senderSide).toBe("platform");
  });
});
```

Extend `FakeThreadRepository.listForCustomer` / `listForProvider` in that file to record the type (`:${type ?? "any"}` appended — adjust the expected string above accordingly) and add the two new port methods; give `FakeProviderNameReader` an `askedFor` list if it has none.

In `queries.handlers.test.ts`, extend the "input schema keys" test so `myThreads` expects `["cursor", "limit", "type"]` and `providerThreads` expects `["cursor", "limit", "providerId", "type"]`, and add a test that `communication.myThreads` with `{ type: "support" }` reaches the use case with `type: "support"`.

Run: `cd packages/backend && bun test src/modules/ntizo/read/communication`
Expected: FAIL.

- [ ] **Step 3: Change the projection**

In `conversations.projection.ts`:

Import `SupportRequestRepositoryPort` from the BC's ports, `ThreadType` from the enums module. `toThreadSummaries` takes `supportRequests` in its `deps` and resolves the request rows in the same `Promise.all`:

```ts
  const threadIds = threads.map((t) => t.id!);
  // A personal support request has no provider; asking the name reader for `null` is a wasted round trip and a type error.
  const providerIds = [...new Set(threads.flatMap((t) => (t.providerId ? [t.providerId] : [])))];
  const customerUserIds = [...new Set(threads.map((t) => t.customerUserId))];

  const [unread, providerNamesById, customerNamesById, previewByThread, requestsByThread] = await Promise.all([
    deps.messages.countUnreadForViewer(threadIds, viewerUserId),
    deps.providerNames.findNamesByIds(providerIds),
    deps.customerNames.findNamesByIds(customerUserIds),
    deps.previews.findLastMessageBodies(threadIds),
    deps.supportRequests.findByThreadIds(threadIds),
  ]);

  return threads.map((t) => {
    const request = requestsByThread.get(t.id!) ?? null;
    return {
      id: t.id!,
      type: t.type,
      providerId: t.providerId,
      providerName: t.providerId ? (providerNamesById.get(t.providerId) ?? "") : "",
      customerName: customerNamesById.get(t.customerUserId) ?? "",
      lastMessageAt: t.lastMessageAt.toISOString(),
      lastMessagePreview: previewByThread.get(t.id!)?.body ?? "",
      lastMessageHasAttachment: previewByThread.get(t.id!)?.hasAttachment ?? false,
      unreadCount: unread.get(t.id!) ?? 0,
      support: request
        ? { subject: request.subject, status: request.status, audience: request.audience, bookingId: request.bookingId }
        : null,
    };
  });
```

Both list projections take `private readonly supportRequests: SupportRequestRepositoryPort` as their last constructor parameter, accept `type?: ThreadType | undefined` in `execute`'s input, pass it as the fourth argument of `listForCustomer` / `listForProvider`, and hand `supportRequests` into `toThreadSummaries`. `ListThreadMessagesProjection` adds `senderSide: m.senderSide,` to each item.

- [ ] **Step 4: The schema, the handler, the bootstrap**

`queries.ts`: add `const threadType = z.enum(["inquiry", "support"]).optional();` and put `type: threadType` on both `listMyThreads` and `listProviderThreads` inputs, with a doc line: *`type` narrows an inbox to one kind — the Help Center's "my requests" is `type: "support"`; absent means both.*

`queries.handlers.ts`: pass `type: args.input.type` through in both handlers.

`bootstrap/index.ts`: construct `new DrizzleSupportRequestRepository()` (import from the BC's `infrastructure/repositories/drizzle/support-request.repository`), expose it under `adapters`, and pass it as the last argument to both list projections.

- [ ] **Step 5: Run and commit**

Run: `cd packages/backend && bun run typecheck && bun test src/modules/ntizo/read/communication`
Expected: PASS.

Stage the four shared files and their test, the four backend files and their two tests; commit:

`feat(communication): inbox rows say what kind of conversation they are`

---

## Task 9: The admin read slice

**Files:**
- Create: `packages/backend/src/modules/ntizo/read/support/app/use-cases/support-requests.projection.ts`
- Create: `.../read/support/graphql/schema/queries.ts`
- Create: `.../read/support/graphql/handlers/queries.handlers.ts`
- Create: `.../read/support/bootstrap/index.ts`
- Create: `.../read/support/index.ts`
- Test: `.../read/support/__tests__/projections.test.ts`, `.../read/support/__tests__/queries.handlers.test.ts`

**Interfaces:**
- Consumes: Task 3's `SupportRequestRepositoryPort`, `ThreadRepositoryPort.findSupportThread`, `MessageRepositoryPort.countUnreadForPlatform` / `listForThread`, `AttachmentRepositoryPort.listForMessages`; `read/communication`'s `ProviderNameReaderPort`, `CustomerNameReaderPort`, `ThreadPreviewReaderPort` and their Drizzle adapters (imported, not copied — the same "same rows, same SQL, one place to fix" ruling `read/communication`'s bootstrap gives for importing the write tier's repositories).
- Produces: `ListSupportRequestsProjection`, `GetSupportRequestProjection`, `ListSupportRequestMessagesProjection`, `CountOpenSupportRequestsProjection`; schema `supportReadSchema` = `{ support: { requests, request, requestMessages, openCount } }` → wire names `supportRequests`, `supportRequest`, `supportRequestMessages`, `supportOpenCount`; `bootstrapSupportRead()`, `createSupportReadHandlers({ supportRead })`, `SupportReadModule`.

- [ ] **Step 1: Write the failing projection tests**

`read/support/__tests__/projections.test.ts` — fakes in the style of `read/communication/__tests__/projections.test.ts` (copy `FakeMessageRepository`, `FakeAttachmentRepository`, `FakeThreadRepository`, the name and preview reader fakes; add `FakeSupportRequestRepository` whose `listForAdmin` records its arguments and returns a configured page and whose `findListItem` returns a configured item):

```ts
const item = (over: Partial<SupportRequestListItem> = {}): SupportRequestListItem => ({
  threadId: "t1", audience: "customer", subject: "Reembolso", status: "open", bookingId: null,
  requesterUserId: "u1", providerId: null, lastMessageAt: NOW, createdAt: NOW, resolvedAt: null, ...over,
});

describe("ListSupportRequestsProjection", () => {
  it("passes filters, clamps the limit, and enriches every row with one batched call each", async () => {
    const requests = new FakeSupportRequestRepository({ items: [item(), item({ threadId: "t2", audience: "provider", providerId: "p1", requesterUserId: "u2" })], nextCursor: "c" });
    const messages = new FakeMessageRepository(emptyMessagePage, new Map([["t1", 3]]));
    const providerNames = new FakeProviderNameReader(new Map([["p1", "Salão X"]]));
    const customerNames = new FakeCustomerNameReader(new Map([["u1", "Ana"], ["u2", "Bruno"]]));
    const previews = new FakeThreadPreviewReader(new Map([["t1", { body: "Paguei duas vezes", hasAttachment: false }]]));
    const projection = new ListSupportRequestsProjection(requests, messages, providerNames, customerNames, previews);

    const page = await projection.execute({ status: "open", audience: undefined, limit: 500, cursor: null });

    expect(requests.listCalls).toEqual([{ filter: { status: "open", audience: undefined }, limit: 50, cursor: null }]);
    expect(messages.calls).toEqual(["countUnreadForPlatform:[t1,t2]"]);
    expect(page.nextCursor).toBe("c");
    expect(page.items[0]).toMatchObject({ threadId: "t1", requesterName: "Ana", providerName: "", unreadForAdmin: 3, lastMessagePreview: "Paguei duas vezes", lastMessageAt: NOW.toISOString(), resolvedAt: null });
    expect(page.items[1]).toMatchObject({ threadId: "t2", requesterName: "Bruno", providerId: "p1", providerName: "Salão X", unreadForAdmin: 0, lastMessagePreview: "" });
    expect(providerNames.askedFor).toEqual(["p1"]);
  });
});

describe("GetSupportRequestProjection", () => {
  it("returns one enriched row, or refuses as not found", async () => {
    const requests = new FakeSupportRequestRepository({ items: [], nextCursor: null }, new Map([["t1", item()]]));
    const projection = new GetSupportRequestProjection(requests, new FakeMessageRepository(), providerNames, customerNames, previews);
    expect((await projection.execute({ threadId: "t1" })).threadId).toBe("t1");
    await expect(projection.execute({ threadId: "nope" })).rejects.toBeInstanceOf(SupportRequestNotFoundError);
  });
});

describe("ListSupportRequestMessagesProjection", () => {
  it("reads through findSupportThread, never findVisible, and refuses an inquiry", async () => {
    const threads = new FakeThreadRepository({ supportThreads: new Set(["t1"]) });
    const messages = new FakeMessageRepository({ items: [message({ id: "m1", threadId: "t1", senderSide: "customer" })], nextCursor: null });
    const projection = new ListSupportRequestMessagesProjection(threads, messages, new FakeAttachmentRepository());

    const page = await projection.execute({ threadId: "t1" });
    expect(page.items[0]).toMatchObject({ id: "m1", senderSide: "customer", attachments: [] });
    expect(threads.calls).toEqual(["findSupportThread:t1"]);
    await expect(projection.execute({ threadId: "inquiry-1" })).rejects.toBeInstanceOf(SupportRequestNotFoundError);
  });
});

describe("CountOpenSupportRequestsProjection", () => {
  it("is the repository's count", async () => {
    const requests = new FakeSupportRequestRepository({ items: [], nextCursor: null }, new Map(), 7);
    expect(await new CountOpenSupportRequestsProjection(requests).execute()).toEqual({ count: 7 });
  });
});
```

`read/support/__tests__/queries.handlers.test.ts` — same shape as `read/communication/__tests__/queries.handlers.test.ts`: the schema exposes exactly `["openCount", "request", "requestMessages", "requests"]`; every field refuses `role: "customer"` with a `ForbiddenError` whose code is `ADMIN_ONLY` and refuses an anonymous caller the same way; an `admin` caller reaches the use case with the input passed through.

Run: `cd packages/backend && bun test src/modules/ntizo/read/support`
Expected: FAIL — modules not found.

- [ ] **Step 2: Write the projections**

`support-requests.projection.ts`:

```ts
import type { MessagePageDTO, SupportRequestPageDTO, SupportRequestSummaryDTO } from "@ntizo/shared/read-models";
import type {
  SupportAudience,
  SupportStatus,
} from "../../../../shared/infrastructure/database/communication/enums";
import type {
  SupportRequestListItem,
  SupportRequestRepositoryPort,
} from "../../../../bounded-contexts/communication/app/ports/outbound/support-request.repository.port";
import type { ThreadRepositoryPort } from "../../../../bounded-contexts/communication/app/ports/outbound/thread.repository.port";
import type { MessageRepositoryPort } from "../../../../bounded-contexts/communication/app/ports/outbound/message.repository.port";
import type { AttachmentRepositoryPort } from "../../../../bounded-contexts/communication";
import { SupportRequestNotFoundError } from "../../../../bounded-contexts/communication/domain/exceptions";
import type { ProviderNameReaderPort } from "../../../communication/app/ports/outbound/provider-name-reader.port";
import type { CustomerNameReaderPort } from "../../../communication/app/ports/outbound/customer-name-reader.port";
import type { ThreadPreviewReaderPort } from "../../../communication/app/ports/outbound/thread-preview-reader.port";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

interface Enrichers {
  messages: MessageRepositoryPort;
  providerNames: ProviderNameReaderPort;
  customerNames: CustomerNameReaderPort;
  previews: ThreadPreviewReaderPort;
}

/** Four batched lookups for the whole page — never one per row. Same discipline as `toThreadSummaries`. */
async function toSummaries(items: SupportRequestListItem[], deps: Enrichers): Promise<SupportRequestSummaryDTO[]> {
  if (items.length === 0) return [];
  const threadIds = items.map((i) => i.threadId);
  const providerIds = [...new Set(items.flatMap((i) => (i.providerId ? [i.providerId] : [])))];
  const requesterIds = [...new Set(items.map((i) => i.requesterUserId))];

  const [unread, providerNames, requesterNames, previews] = await Promise.all([
    deps.messages.countUnreadForPlatform(threadIds),
    deps.providerNames.findNamesByIds(providerIds),
    deps.customerNames.findNamesByIds(requesterIds),
    deps.previews.findLastMessageBodies(threadIds),
  ]);

  return items.map((i) => ({
    threadId: i.threadId,
    audience: i.audience,
    subject: i.subject,
    status: i.status,
    requesterUserId: i.requesterUserId,
    requesterName: requesterNames.get(i.requesterUserId) ?? "",
    providerId: i.providerId,
    providerName: i.providerId ? (providerNames.get(i.providerId) ?? "") : "",
    bookingId: i.bookingId,
    lastMessageAt: i.lastMessageAt.toISOString(),
    lastMessagePreview: previews.get(i.threadId)?.body ?? "",
    unreadForAdmin: unread.get(i.threadId) ?? 0,
    createdAt: i.createdAt.toISOString(),
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
  }));
}

/** The admin queue. The handler proves the role; this class assumes it. */
export class ListSupportRequestsProjection {
  constructor(
    private readonly requests: SupportRequestRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly providerNames: ProviderNameReaderPort,
    private readonly customerNames: CustomerNameReaderPort,
    private readonly previews: ThreadPreviewReaderPort,
  ) {}

  async execute(input: {
    status?: SupportStatus | undefined;
    audience?: SupportAudience | undefined;
    limit?: number | undefined;
    cursor?: string | null | undefined;
  }): Promise<SupportRequestPageDTO> {
    const page = await this.requests.listForAdmin(
      { status: input.status, audience: input.audience },
      clampLimit(input.limit),
      input.cursor ?? null,
    );
    const items = await toSummaries(page.items, {
      messages: this.messages,
      providerNames: this.providerNames,
      customerNames: this.customerNames,
      previews: this.previews,
    });
    return { items, nextCursor: page.nextCursor };
  }
}

export class GetSupportRequestProjection {
  constructor(
    private readonly requests: SupportRequestRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly providerNames: ProviderNameReaderPort,
    private readonly customerNames: CustomerNameReaderPort,
    private readonly previews: ThreadPreviewReaderPort,
  ) {}

  async execute(input: { threadId: string }): Promise<SupportRequestSummaryDTO> {
    const item = await this.requests.findListItem(input.threadId);
    if (!item) throw new SupportRequestNotFoundError();
    const [summary] = await toSummaries([item], {
      messages: this.messages,
      providerNames: this.providerNames,
      customerNames: this.customerNames,
      previews: this.previews,
    });
    return summary!;
  }
}

/**
 * The admin reading a conversation. `findSupportThread`, never
 * `findVisible`: the admin is not a participant and must not be admitted
 * as one — and the scope to `type = 'support'` is what keeps an inquiry
 * out of reach, answered as "not found" like a missing id.
 */
export class ListSupportRequestMessagesProjection {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly attachments: AttachmentRepositoryPort,
  ) {}

  async execute(input: {
    threadId: string;
    limit?: number | undefined;
    cursor?: string | null | undefined;
  }): Promise<MessagePageDTO> {
    const thread = await this.threads.findSupportThread(input.threadId);
    if (!thread) throw new SupportRequestNotFoundError();

    const page = await this.messages.listForThread(input.threadId, clampLimit(input.limit), input.cursor ?? null);
    const attachmentsByMessage = await this.attachments.listForMessages(page.items.map((m) => m.id!));

    return {
      items: page.items.map((m) => ({
        id: m.id!,
        threadId: m.threadId,
        senderUserId: m.senderUserId,
        senderSide: m.senderSide,
        body: m.body,
        readAt: m.readAt ? m.readAt.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
        attachments: (attachmentsByMessage.get(m.id!) ?? []).map((a) => ({
          id: a.id,
          fileName: a.fileName,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
        })),
      })),
      nextCursor: page.nextCursor,
    };
  }
}

export class CountOpenSupportRequestsProjection {
  constructor(private readonly requests: SupportRequestRepositoryPort) {}

  async execute(): Promise<{ count: number }> {
    return { count: await this.requests.countOpen() };
  }
}
```

- [ ] **Step 3: The schema, the handlers, the bootstrap, the index**

`graphql/schema/queries.ts`:

```ts
import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import {
  messagePageReadModel,
  supportRequestPageReadModel,
  supportRequestSummaryReadModel,
} from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

const paging = {
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().optional(),
};

/** The queue. Guarded by the handler: administrators only. */
export const listSupportRequests = defineQuery({
  input: zodSchema(
    z.object({
      status: z.enum(["open", "resolved"]).optional(),
      audience: z.enum(["customer", "provider"]).optional(),
      ...paging,
    }),
  ),
  output: zodSchema(supportRequestPageReadModel),
  docs: { summary: "Support requests, for administration", tags: ["Admin", "Support"] },
});

export const getSupportRequest = defineQuery({
  input: zodSchema(z.object({ threadId: z.string().min(1) })),
  output: zodSchema(supportRequestSummaryReadModel),
  docs: { summary: "One support request's header", tags: ["Admin", "Support"] },
});

/**
 * Its own field rather than `communicationThreadMessages`: that one gates on
 * `findVisible`, which refuses an administrator — correctly, since they are
 * not a participant. This one gates on the thread being a support thread.
 */
export const listSupportRequestMessages = defineQuery({
  input: zodSchema(z.object({ threadId: z.string().min(1), ...paging })),
  output: zodSchema(messagePageReadModel),
  docs: { summary: "One support request's conversation", tags: ["Admin", "Support"] },
});

export const countOpenSupportRequests = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(z.object({ count: z.number().int().min(0) })),
  docs: { summary: "How many support requests are open", tags: ["Admin", "Support"] },
});

/** Flattens to `supportRequests` / `supportRequest` / `supportRequestMessages` / `supportOpenCount` on the wire. */
export const supportReadSchema = defineGraphQLSchema(
  {
    support: {
      requests: listSupportRequests,
      request: getSupportRequest,
      requestMessages: listSupportRequestMessages,
      openCount: countOpenSupportRequests,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
```

`graphql/handlers/queries.handlers.ts`:

```ts
import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { SupportReadBootstrap } from "../../bootstrap";
import { supportReadSchema } from "../schema/queries";

export interface SupportReadModule {
  readonly supportRead: SupportReadBootstrap;
}

/**
 * Both the id and the role: the context defaults a caller with no session
 * to `customer`, so a role check alone would read a value chosen for the
 * absence of a user rather than asserted about one. Copied, not shared —
 * the same six lines `read/review` and `write/review` carry.
 */
function requireAdmin(ctx: GraphQLHandlerContext): void {
  const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId || role !== "admin") {
    throw new ForbiddenError({
      message: "Only administrators may read support requests",
      code: "ADMIN_ONLY",
    });
  }
}

export function createSupportReadHandlers(mod: SupportReadModule) {
  const uc = mod.supportRead.useCases;

  return graphqlRoutes(supportReadSchema)
    .handle("support.requests", async (args, ctx) => {
      requireAdmin(ctx);
      return uc.listSupportRequests.execute(args.input);
    })
    .handle("support.request", async (args, ctx) => {
      requireAdmin(ctx);
      return uc.getSupportRequest.execute(args.input);
    })
    .handle("support.requestMessages", async (args, ctx) => {
      requireAdmin(ctx);
      return uc.listSupportRequestMessages.execute(args.input);
    })
    .handle("support.openCount", async (_args, ctx) => {
      requireAdmin(ctx);
      return uc.countOpenSupportRequests.execute();
    })
    .build();
}
```

`bootstrap/index.ts`:

```ts
import { DrizzleThreadRepository } from "../../../bounded-contexts/communication/infrastructure/repositories/drizzle/thread.repository";
import { DrizzleMessageRepository } from "../../../bounded-contexts/communication/infrastructure/repositories/drizzle/message.repository";
import { DrizzleAttachmentRepository } from "../../../bounded-contexts/communication/infrastructure/repositories/drizzle/attachment.repository";
import { DrizzleSupportRequestRepository } from "../../../bounded-contexts/communication/infrastructure/repositories/drizzle/support-request.repository";
import { DrizzleProviderNameReader } from "../../communication/infra/repositories/drizzle/provider-name-reader.adapter";
import { DrizzleCustomerNameReader } from "../../communication/infra/repositories/drizzle/customer-name-reader.adapter";
import { DrizzleThreadPreviewReader } from "../../communication/infra/repositories/drizzle/thread-preview-reader.adapter";
import {
  CountOpenSupportRequestsProjection,
  GetSupportRequestProjection,
  ListSupportRequestMessagesProjection,
  ListSupportRequestsProjection,
} from "../app/use-cases/support-requests.projection";

/**
 * The three enrichment readers are `read/communication`'s, imported rather
 * than copied: an admin queue row and an inbox row want the same names and
 * the same preview from the same tables, and a second adapter running
 * identical SQL is two places to fix one bug — the ruling that tier's own
 * bootstrap gives for importing the write tier's repositories.
 */
export function bootstrapSupportRead() {
  const threadRepository = new DrizzleThreadRepository();
  const messageRepository = new DrizzleMessageRepository();
  const attachmentRepository = new DrizzleAttachmentRepository();
  const supportRequestRepository = new DrizzleSupportRequestRepository();
  const providerNameReader = new DrizzleProviderNameReader();
  const customerNameReader = new DrizzleCustomerNameReader();
  const threadPreviewReader = new DrizzleThreadPreviewReader();

  return {
    adapters: { threadRepository, messageRepository, attachmentRepository, supportRequestRepository },
    useCases: {
      listSupportRequests: new ListSupportRequestsProjection(
        supportRequestRepository, messageRepository, providerNameReader, customerNameReader, threadPreviewReader,
      ),
      getSupportRequest: new GetSupportRequestProjection(
        supportRequestRepository, messageRepository, providerNameReader, customerNameReader, threadPreviewReader,
      ),
      listSupportRequestMessages: new ListSupportRequestMessagesProjection(
        threadRepository, messageRepository, attachmentRepository,
      ),
      countOpenSupportRequests: new CountOpenSupportRequestsProjection(supportRequestRepository),
    },
  };
}

export type SupportReadBootstrap = ReturnType<typeof bootstrapSupportRead>;
```

`index.ts`:

```ts
export { bootstrapSupportRead, type SupportReadBootstrap } from "./bootstrap";
export { supportReadSchema } from "./graphql/schema/queries";
export { createSupportReadHandlers, type SupportReadModule } from "./graphql/handlers/queries.handlers";
```

- [ ] **Step 4: Run and commit**

Run: `cd packages/backend && bun run typecheck && bun test src/modules/ntizo/read/support src/modules/ntizo/__tests__`
Expected: PASS — including the four fitness tests (the new slice exposes queries only and imports no framework).

Stage `read/support`; commit:

`feat(support): the admin queue, one request, its conversation, and the open count`

---

## Task 10: The write side — the requester's mutation and the admin's three

**Files:**
- Modify: `packages/backend/src/modules/ntizo/write/communication/graphql/schema/mutations.ts`
- Modify: `.../write/communication/graphql/handlers/mutations.handlers.ts`
- Create: `.../write/support/graphql/schema/mutations.ts`
- Create: `.../write/support/graphql/handlers/mutations.handlers.ts`
- Create: `.../write/support/index.ts`
- Test: `.../write/communication/__tests__/mutations.handlers.test.ts` (extend), `.../write/support/__tests__/mutations.handlers.test.ts` (new)

**Interfaces:**
- Produces: `communicationOpenSupportRequest({ audience, providerId?, subject, body, bookingId?, attachments? }) → { threadId }`; `supportWriteSchema` = `{ support: { reply, resolve, markRead } }` → wire names `supportReply`, `supportResolve`, `supportMarkRead`; `createSupportWriteHandlers({ communication })`, `SupportWriteModule`.

- [ ] **Step 1: Write the failing handler tests**

In `write/communication/__tests__/mutations.handlers.test.ts`: the "exposes exactly three mutations" test becomes four (`["markRead", "openSupportRequest", "send", "startThread"]`); the key-set test adds `expect(shapeKeys(openSupportRequest)).toEqual(["attachments", "audience", "body", "bookingId", "providerId", "subject"])`; `makeModule` gains `openSupportRequest`, `replyToSupportRequest`, `resolveSupportRequest`, `markSupportRequestRead` spies. Add:

```ts
describe("communication.openSupportRequest", () => {
  it("stamps the requester from the session and passes the rest through", async () => {
    const openSupportRequest = spyUseCase({ threadId: "t1" });
    const handlers = createCommunicationWriteHandlers(makeModule({ openSupportRequest }));
    const handler = handlers.find((h) => h.key === "communication.openSupportRequest")!;
    const out = await handler.resolve(
      { input: { audience: "provider", providerId: "p1", subject: "Comissão", body: "x", bookingId: "b1" } },
      ctx({ requesterUserId: "u-session" }),
    );
    expect(out).toEqual({ threadId: "t1" });
    expect(openSupportRequest.calls[0]).toEqual({
      requesterUserId: "u-session", audience: "provider", providerId: "p1", subject: "Comissão", body: "x", bookingId: "b1", attachments: undefined,
    });
  });

  it("refuses an anonymous caller", async () => {
    const handlers = createCommunicationWriteHandlers(makeModule({}));
    const handler = handlers.find((h) => h.key === "communication.openSupportRequest")!;
    await expect(handler.resolve({ input: { audience: "customer", subject: "x", body: "x" } }, ctx({ requesterUserId: null }))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
```

(Use whatever the file already uses to invoke a built handler — copy the shape of its existing `communication.send` test rather than the `handler.resolve` guess above if it differs.)

`write/support/__tests__/mutations.handlers.test.ts`: same helpers; the schema exposes exactly `["markRead", "reply", "resolve"]`; `reply`'s input keys are `["attachments", "body", "threadId"]`, `resolve`'s and `markRead`'s are `["threadId"]`; each of the three refuses `role: "customer"` and an anonymous caller with `ADMIN_ONLY`; as `admin`, `reply` reaches `replyToSupportRequest` with `{ threadId, adminUserId: "u-admin", body, attachments }`, `resolve` reaches `resolveSupportRequest` with `{ threadId, adminUserId: "u-admin" }`, `markRead` reaches `markSupportRequestRead` with `{ threadId }`.

Run: `cd packages/backend && bun test src/modules/ntizo/write/communication src/modules/ntizo/write/support`
Expected: FAIL.

- [ ] **Step 2: The requester's mutation**

In `write/communication/graphql/schema/mutations.ts`, add before the schema export:

```ts
/**
 * Opening a support request. `subject` is bounded here as the edge's cheap
 * refusal; `SupportRequest.normaliseSubject` (`SUPPORT_SUBJECT_MAX = 120`) is
 * where the rule is defined — the same split `send` makes for `body`.
 * `providerId` is required by the command when `audience` is `provider`,
 * not by this schema: a union input is awkward on the wire, and the
 * command's `SUPPORT_NOT_A_MEMBER` is the right answer for both "no
 * provider" and "not yours".
 */
export const openSupportRequest = defineMutation({
  input: zodSchema(
    z.object({
      audience: z.enum(["customer", "provider"]),
      providerId: z.string().min(1).optional(),
      subject: z.string().trim().min(1).max(120),
      body: z.string().trim().max(4000),
      bookingId: z.string().min(1).optional(),
      attachments: z.array(z.object({ storageKey: z.string().min(1) })).max(5).optional(),
    }),
  ),
  output: zodSchema(z.object({ threadId: z.string().min(1) })),
  docs: { summary: "Open a support request with the platform", tags: ["Communication", "Support"] },
});
```

and `openSupportRequest` to the `communication: { ... }` object. In the handlers:

```ts
    .handle("communication.openSupportRequest", async (args, ctx) =>
      uc.openSupportRequest.execute({
        requesterUserId: requireUser(ctx),
        audience: args.input.audience,
        providerId: args.input.providerId,
        subject: args.input.subject,
        body: args.input.body,
        bookingId: args.input.bookingId,
        attachments: args.input.attachments,
      }),
    )
```

- [ ] **Step 3: The admin slice**

`write/support/graphql/schema/mutations.ts`:

```ts
import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/** The platform answering. Same body and attachment bounds as `communication.send`. */
export const reply = defineMutation({
  input: zodSchema(
    z.object({
      threadId: z.string().min(1),
      body: z.string().trim().max(4000),
      attachments: z.array(z.object({ storageKey: z.string().min(1) })).max(5).optional(),
    }),
  ),
  output: zodSchema(z.object({ id: z.string().min(1) })),
  docs: { summary: "Reply to a support request as the platform", tags: ["Admin", "Support"] },
});

export const resolve = defineMutation({
  input: zodSchema(z.object({ threadId: z.string().min(1) })),
  output: zodSchema(z.object({ threadId: z.string().min(1), status: z.literal("resolved") })),
  docs: { summary: "Mark a support request resolved", tags: ["Admin", "Support"] },
});

export const markRead = defineMutation({
  input: zodSchema(z.object({ threadId: z.string().min(1) })),
  output: zodSchema(z.object({ marked: z.number().int() })),
  docs: { summary: "Mark a support request's messages read for the platform", tags: ["Admin", "Support"] },
});

/** Flattens to `supportReply` / `supportResolve` / `supportMarkRead` on the wire. */
export const supportWriteSchema = defineGraphQLSchema(
  { support: { reply, resolve, markRead } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
```

`write/support/graphql/handlers/mutations.handlers.ts`:

```ts
import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { CommunicationBootstrap } from "../../../../bounded-contexts/communication/bootstrap";
import { supportWriteSchema } from "../schema/mutations";

/** The same bootstrap the participant mutations use — only its admin commands are reached from here. */
export interface SupportWriteModule {
  readonly communication: CommunicationBootstrap;
}

/** Both the id and the role — see `read/support`'s twin for why the role alone is not enough. Returns the admin's id: it is the message's sender. */
function requireAdmin(ctx: GraphQLHandlerContext): string {
  const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId || role !== "admin") {
    throw new ForbiddenError({
      message: "Only administrators may act on support requests",
      code: "ADMIN_ONLY",
    });
  }
  return requesterUserId;
}

export function createSupportWriteHandlers(mod: SupportWriteModule) {
  const uc = mod.communication.useCases;

  return graphqlRoutes(supportWriteSchema)
    .handle("support.reply", async (args, ctx) =>
      uc.replyToSupportRequest.execute({
        threadId: args.input.threadId,
        adminUserId: requireAdmin(ctx),
        body: args.input.body,
        attachments: args.input.attachments,
      }),
    )
    .handle("support.resolve", async (args, ctx) =>
      uc.resolveSupportRequest.execute({ threadId: args.input.threadId, adminUserId: requireAdmin(ctx) }),
    )
    .handle("support.markRead", async (args, ctx) => {
      requireAdmin(ctx);
      return uc.markSupportRequestRead.execute({ threadId: args.input.threadId });
    })
    .build();
}
```

`write/support/index.ts`:

```ts
export { supportWriteSchema } from "./graphql/schema/mutations";
export { createSupportWriteHandlers, type SupportWriteModule } from "./graphql/handlers/mutations.handlers";
```

- [ ] **Step 4: Run and commit**

Run: `cd packages/backend && bun run typecheck && bun test src/modules/ntizo/write/communication src/modules/ntizo/write/support src/modules/ntizo/__tests__`
Expected: PASS.

Stage `write/communication` (schema, handlers, test) and `write/support`; commit:

`feat(support): open a request, and the platform's reply, resolve and read`

---

## Task 11: Mounting it, the attachment route, and the wire names

**Files:**
- Modify: `packages/backend/src/modules/ntizo/read/schema.ts`
- Modify: `packages/backend/src/modules/ntizo/write/schema.ts`
- Modify: `apps/backend/api/src/graphql/private.ts`
- Modify: `apps/backend/api/src/attachments.ts`
- Test: `apps/backend/api/src/graphql/__tests__/schema-mount.test.ts` (unchanged — it is the gate), `apps/backend/api/src/__tests__/attachments.test.ts` (extend)

**Interfaces:**
- Produces: the eight new fields reachable on `/graphql`: `communicationOpenSupportRequest`, `supportRequests`, `supportRequest`, `supportRequestMessages`, `supportOpenCount`, `supportReply`, `supportResolve`, `supportMarkRead`; `communicationMyThreads` / `communicationProviderThreads` accept `type`. `GET /api/communication/attachments/:id` serves an admin any attachment on a support thread.

- [ ] **Step 1: Both barrels**

`read/schema.ts`: import `supportReadSchema` from `./support/graphql/schema/queries` and add it to `mergeGraphQLSchemas(...)`. `write/schema.ts`: import `supportWriteSchema` from `./support/graphql/schema/mutations` and add it.

Run: `cd apps/backend/api && bun test src/graphql/__tests__/schema-mount.test.ts`
Expected: FAIL — eight declared fields have no mounted handler. This is the test doing its job; the next step is what turns it green.

- [ ] **Step 2: Mount the handlers**

In `private.ts`: import `bootstrapSupportRead, createSupportReadHandlers` from `@ntizo/backend/modules/ntizo/read/support` and `createSupportWriteHandlers` from `@ntizo/backend/modules/ntizo/write/support`; inside `buildPrivateGraphQLFields`, after `communicationRead`, `const supportRead = bootstrapSupportRead();`; in the `fields` array add `...createSupportReadHandlers({ supportRead }),` after the communication read handlers and `...createSupportWriteHandlers({ communication }),` after the communication write handlers.

Run: `cd apps/backend/api && bun run typecheck && bun test src/graphql/__tests__/schema-mount.test.ts`
Expected: PASS.

- [ ] **Step 3: The admin branch of the download**

In `attachments.ts`, import `isPlatformAdmin` from `./admin-access` and replace the visibility lookup in the `GET` handler:

```ts
    // A participant first — the closed pair `findVisible` admits. Then, and
    // only for an administrator, a file on a support thread: the admin is
    // not a participant and must not be admitted as one, but the requester
    // sent that file *to* the platform, and the platform must be able to
    // open it. Never an admin bypass on `findVisible` itself: that would
    // let an admin download any file in any private conversation by id,
    // which is phase 3's question, not this one's.
    let row = await deps.attachmentRepository.findVisible(id, session.user.id);
    if (!row && (await isPlatformAdmin(session.user.id))) {
      row = await deps.attachmentRepository.findOnSupportThread(id);
    }
    if (!row) return c.json({ error: "FORBIDDEN" }, 403);
```

In `apps/backend/api/src/__tests__/attachments.test.ts`, follow how the file already fakes `attachmentRepository` and the session; add: an admin session downloading an attachment `findVisible` refuses but `findOnSupportThread` returns is served; the same admin on an attachment both refuse gets 403; a customer session for whom `findVisible` refuses gets 403 **without** `findOnSupportThread` being called (spy on it — this is the assertion that keeps the admin branch admin-only). `isPlatformAdmin` reads the database — mock the module the way the documents route test does, or stub `bootstrapUserRead` the same way; pick whichever that file already does.

Run: `cd apps/backend/api && bun test src/__tests__/attachments.test.ts`
Expected: PASS.

- [ ] **Step 4: Verify the wire names against a running server**

Start the API locally (the dev-environment memory has the ports and the `Origin` header the server requires; `apps/backend/api` runs under Node 22 for wrangler) and introspect:

```bash
curl -s http://localhost:8787/graphql -H 'content-type: application/json' -H 'origin: http://localhost:3000' \
  -d '{"query":"{ __schema { queryType { fields { name } } mutationType { fields { name } } } }"}' \
  | jq -r '.data.__schema | (.queryType.fields + .mutationType.fields)[].name' | grep -i support
```

Expected, exactly these eight lines in any order: `supportRequests`, `supportRequest`, `supportRequestMessages`, `supportOpenCount`, `communicationOpenSupportRequest`, `supportReply`, `supportResolve`, `supportMarkRead`. Then:

```bash
curl -s http://localhost:8787/graphql -H 'content-type: application/json' -H 'origin: http://localhost:3000' \
  -d '{"query":"{ __type(name: \"CommunicationMyThreadsInput\") { inputFields { name } } }"}'
```

Expected: `cursor`, `limit`, `type`. Record the eight names and this input's fields in the commit message body — plan B's data layer types against them.

- [ ] **Step 5: A real round trip, as the admin**

With the server running and an admin session cookie (sign in as an admin user in the browser and copy the `better-auth` cookie, or use the e2e harness's `createVerifiedUser` with role `admin` and its sign-in helper), run against `/graphql`:

1. As a customer: `mutation { communicationOpenSupportRequest(input: { audience: customer, subject: "Teste", body: "Olá" }) { threadId } }` → a `threadId`.
2. As the admin: `{ supportOpenCount { count } }` → at least 1; `{ supportRequests(input: { status: open }) { items { threadId subject requesterName unreadForAdmin } } }` → the request, `unreadForAdmin: 1`.
3. As the admin: `mutation { supportReply(input: { threadId: "<id>", body: "Recebido." }) { id } }` then `mutation { supportResolve(input: { threadId: "<id>" }) { status } }` → `resolved`.
4. As the customer: `{ communicationMyThreads(input: { type: support }) { items { id type support { subject status } unreadCount } } }` → the row, `status: resolved`, `unreadCount: 1`; `{ communicationThreadMessages(input: { threadId: "<id>" }) { items { senderSide body } } }` → two messages, sides `customer` and `platform`.
5. As the customer: `mutation { communicationSend(input: { threadId: "<id>", body: "Ainda não" }) { id } }`, then as the admin `{ supportRequest(input: { threadId: "<id>" }) { status } }` → `open` again.
6. Check the customer's bell (`/notifications` route in the browser, or the notification read field) shows the resolved notice, and — after the next cron minute, or by calling the sweep — the admin's shows the "new message" one.

Delete the test rows afterwards: the thread (cascades to request and messages) and any notification rows raised for it, by id.

- [ ] **Step 6: Commit**

Stage `read/schema.ts`, `write/schema.ts`, `private.ts`, `attachments.ts`, `attachments.test.ts`; commit:

`feat(api): mount the support fields, and let an admin open a request's attachments`

with the eight verified wire names in the body.

---

## Task 12: Follow-ups, gates, and what plan B needs to know

**Files:**
- Modify: `docs/superpowers/follow-ups.md`

- [ ] **Step 1: Close and open follow-ups**

In `follow-ups.md`, in the style the file uses for resolved entries (strike the heading, add a "RESOLVED <date>" line pointing at the commit, keep the original text below under "(original)"):

- **#71** — mark the phase-2 half resolved: support threads exist (`type = 'support'`, `support_request`), the admin read path exists and is scoped to support threads by construction (`DrizzleSupportRequestRepository`'s inner join; `findSupportThread`). Leave the phase-3 sentence — logging and consent for an admin reading a customer ↔ provider conversation — **open** as its own remaining entry, with the same trigger.

Add new entries, each with a trigger:

- **`fromTheOtherSide` is gone; two repositories still carry private cursor helpers.** `thread.repository.ts`, `message.repository.ts` and `support-request.repository.ts` each define `encodeCursor` / `decodeCursor` with the same shape. Trigger: the fourth copy.
- **`SUPPORT_REQUEST_OPENED` is raised per admin, synchronously after commit.** With three admins that is three raises inside the request; with thirty it is thirty. Trigger: the admin count passing ten, or the open mutation's p95 crossing what the checkout tolerates.
- **An admin who is also a provider member** replying on their own provider's request through `communicationSend` writes `provider`, through `supportReply` writes `platform`. Both are correct for the path taken; nothing prevents the confusion. Trigger: the first admin account that also holds a `provider_member` row.
- **Frontend copy for the four notification types** renders the `unknown` fallback ("Tem uma notificação nova") until plan B adds keys under `notifications.type`. Trigger: plan B — this is on its list.
- **The download route's admin check is a second database read** (`isPlatformAdmin` → `findPlatformRole`) on every refused participant lookup, admin or not. Trigger: attachment download latency being noticed.

- [ ] **Step 2: The full gates**

Run, in this order, and paste the summaries into the commit body:

```bash
cd packages/shared && bun run typecheck && bun run test
cd ../backend && bun run typecheck && bun test src scripts
cd ../../apps/backend/api && bun run typecheck && bun test
cd ../../.. && bun run lint --force
```

Expected: shared and api fully green; backend green except `catalog-service-search.test.ts` if the shared dev data has drifted (follow-up #62 — say so explicitly rather than silently passing over it); lint green.

- [ ] **Step 3: Commit and hand over**

Stage `docs/superpowers/follow-ups.md`; commit:

`docs: what messaging phase 2 closed, and what it left open`

Then write, in the final report to the user, the exact list plan B types against — the eight wire names, the `type` argument, the three new fields on an inbox row (`type`, nullable `providerId`, `support`), `senderSide` on a message, the four `NotificationType` values and their payload shape (`threadId`, `subject`, `requestAudience`, optional `providerId`) — so plan B's data layer is written against what was verified in Task 11 Step 4, not against this document.

---

## Self-review against the spec

- **Data model** — Task 1 (all three tables, both CHECKs on `thread`, the `sender_side` backfill, the `support_request` CHECKs and index). The spec's `index (status, created_at desc, thread_id desc)` is `idx_support_request_status_created`.
- **Domain and use cases** — Tasks 2 and 5 (every row of the spec's command table; `MAX_OPEN_SUPPORT_REQUESTS`; reopen-on-reply inside the send transaction; `normaliseSubject` before the transaction).
- **Sides, visibility and authorization** — Task 3 (`viewerSide`, `visibleToViewer` untouched, `findSupportThread` scoping), Task 9/10 (`requireAdmin` on every support field), Task 11 (attachment route).
- **Notifications** — Task 6 (four types, per-admin fan-out, sweep by `sender_side`, `requestAudience` payload key, links), Task 5 (opened/resolved raised directly).
- **GraphQL surface** — Tasks 8–11 (every field the spec names, the `type` argument, `senderSide` on messages, `listForCustomer` excluding provider requests).
- **Attachments** — Tasks 3 and 11.
- **Errors** — Task 2 (seven classes, seven codes; the spec's six plus the `reopen` guard).
- **Testing** — each task's tests cover the spec's list: second-user refusals (Task 3's `findVisible` on a support thread, Task 5's non-member, Task 9/10's non-admin), unread by side in all three cases (Task 3), sweep fan-out and failure modes (Task 6), migration backfill (Task 1), transaction atomicity (Task 5). The browser end-to-end is plan B's, because it needs the panel.
- **Rollout** — one migration (Task 1), `wrangler.jsonc` untouched (Task 7 verifies), backend deployable on its own: nothing the existing frontend calls changed shape except two inbox fields it does not read yet.
