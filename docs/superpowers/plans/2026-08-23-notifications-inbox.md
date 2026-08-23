# Notifications — the in-app inbox (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Ntizo a working notification inbox — a personal one and a workspace one — filled by the domain events the platform already emits, with the header bell finally showing a count.

**Architecture:** A new `notification` bounded context across the three tiers the repo already mandates (`bounded-contexts/`, `read/`, `write/`). Producing use cases keep publishing to the outbox exactly as they do now; after their transaction commits, `runAfterCommit` hands the same events to an in-process router which calls `RaiseNotificationCommand`. Two tables: `notification` for the item, `notification_read` for per-reader state.

**Tech Stack:** Bun, Drizzle + Neon Postgres (named schemas), `@cosmneo/onion-lasagna` 1.0.0-beta.3 (GraphQL field kit), Hono on Cloudflare Workers, React 19 + TanStack Router/Query, Tailwind v4, i18next.

**Spec:** `docs/superpowers/specs/2026-08-23-notifications-inbox-design.md`

**Phase 2 (email delivery — `notification_delivery`, `email_suppression`, per-locale templates, the Resend bounce webhook) is a separate plan, written after this one lands.** The spec covers both; this plan implements only the inbox half. Everything Phase 2 needs hangs off `RaiseNotificationCommand`, which Task 5 builds.

## Global Constraints

- **`@cosmneo/onion-lasagna*` is pinned EXACTLY at `1.0.0-beta.3`.** Never `latest` (0.4.1 is a different API line). Do not touch the `overrides` block.
- **`packages/backend` must not import a web framework.** No `hono`, no `graphql-yoga`, no `@cosmneo/onion-lasagna-hono`, no `@cosmneo/onion-lasagna-yoga`. Four fitness tests fail CI otherwise.
- **No presentation code inside `bounded-contexts/`.** No directory named `rest`, `http` or `graphql`, and no `createXRouter` export. Presentation lives in `read/`, `write/` or `public/`.
- **A user id is `text`, not `uuid`.** better-auth issues string ids; `ntizo_user.user.id` is a `text` column. Provider ids *are* `uuid`.
- **Tables live in named Postgres schemas**, never `public`.
- **Every user-visible string exists in all eight locales** — `en-US`, `pt-MZ`, `pt-PT`, `es-ES`, `fr-FR`, `it-IT`, `de-DE`, `nl-NL` — in the same commit that introduces it.
- **Every count-bearing i18n key needs its `_other` form.** The convention here is base-key-singular plus `_other` (see `servicesFound` / `servicesFound_other`). i18next falls back to the base key for the "one" category.
- **Frontend layering is lint-enforced** by `eslint-plugin-boundaries` with `no-unknown-files: "error"`: `domain/` → nothing, `data/` → domain, `viewmodel/` → domain+data, `ui/` → viewmodel+domain. `ui/` may never import `data/`.
- **`data/*.repository.ts` exports TanStack Query `queryOptions`, never hooks.**
- **The API needs Node ≥ 22 for wrangler:** `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`.
- **Comments explain *why*, especially where a choice looks wrong.** This is the strongest convention in the codebase. Match it.
- **Commit subjects are lowercase sentences describing intent**, scoped (`feat(notification):`), with a prose body.

---

## File Structure

**Database (Task 1)**
- `packages/backend/src/modules/ntizo/shared/infrastructure/database/notification/schemas/notification.schema.ts` — the inbox item table
- `.../notification/schemas/notification-read.schema.ts` — per-reader read state
- `.../notification/schemas/index.ts`, `.../notification/index.ts` — barrels
- `.../database/schemas.ts` — add the export
- `packages/backend/src/modules/ntizo/drizzle.config.ts` — add `ntizo_notification` to `schemaFilter`

**Domain + application (Tasks 2–5)**
- `.../bounded-contexts/notification/domain/aggregates/notification.aggregate.ts`
- `.../domain/exceptions.ts`
- `.../app/ports/outbound/notification.repository.port.ts`
- `.../app/ports/outbound/provider-member-reader.port.ts`
- `.../app/use-cases/raise-notification.internal.command.ts`
- `.../app/use-cases/mark-read.command.ts`
- `.../infrastructure/repositories/drizzle/notification.repository.ts`
- `.../infrastructure/outbound-adapters/cross-bc/provider-member-reader.adapter.ts`
- `.../bootstrap/index.ts`, `.../index.ts`

**Read models (Task 6)**
- `packages/shared/src/read-models/system/notification/notification.schema.ts`
- `packages/shared/src/read-models/system/notification/index.ts`
- `packages/shared/src/read-models/system/index.ts` — add the export

**Read + write tiers (Tasks 7–8)**
- `.../read/notification/app/use-cases/list-notifications.projection.ts`
- `.../read/notification/graphql/schema/queries.ts`, `.../graphql/handlers/queries.handlers.ts`
- `.../read/notification/bootstrap/index.ts`, `.../index.ts`
- `.../read/schema.ts` — merge in
- `.../write/notification/graphql/schema/mutations.ts`, `.../handlers/mutations.handlers.ts`
- `.../write/notification/index.ts`
- `.../write/schema.ts` — merge in

**Dispatch (Tasks 9–11)**
- `packages/backend/src/shared/infrastructure/events/event-router.ts` — the in-process router
- `.../write/notification/events/handlers/provider.event-handlers.ts`
- `.../write/notification/events/index.ts`
- `.../bounded-contexts/user/domain/events/index.ts` — `UserRegistered`
- `.../bounded-contexts/user/domain/aggregates/user.aggregate.ts` — event machinery
- `.../bounded-contexts/user/app/use-cases/create-user-on-sign-up.internal.command.ts` — publish
- `apps/backend/api/src/bootstrap.ts` — wire the registry

**Frontend (Tasks 12–14)**
- `apps/frontend/web/src/features/notifications/domain/{inbox-groups,notification-presentation}.ts`
- `.../features/notifications/data/notifications.repository.ts`
- `.../features/notifications/viewmodel/{use-inbox,use-unread-count,use-mark-read}.ts`
- `.../features/notifications/ui/{notification-cell,inbox-list,notifications-page,notification-bell}.tsx`
- `.../shared/locales/*/notifications.json` — eight files
- `.../routes/_customer/account/notifications.tsx` — stop redirecting
- `.../routes/provider/$slug/notifications.tsx` — new
- `.../shared/components/header-actions.tsx` — the bell
- `.../features/account/ui/section-pages.tsx` — drop the SMS column

---

## Task 1: The tables and the migration

**Files:**
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/notification/schemas/notification.schema.ts`
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/notification/schemas/notification-read.schema.ts`
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/notification/schemas/index.ts`
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/notification/index.ts`
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/schemas.ts`
- Modify: `packages/backend/src/modules/ntizo/drizzle.config.ts`
- Test: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/notification-constraints.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `notification`, `notificationRead` Drizzle tables; types `NotificationRecord`, `NewNotificationRecord`, `NotificationReadRecord`.

- [ ] **Step 1: Write the two schema files**

`notification.schema.ts`:

```ts
import { check, index, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../../user/schemas/user.schema";
import { provider } from "../../provider/schemas";

export const notificationSchema = pgSchema("ntizo_notification");

/**
 * One item in somebody's inbox.
 *
 * **Addressed to exactly one party, and the database enforces which.** A row
 * where `audience` and the two id columns disagree is a notification addressed
 * to nobody or to two people at once; `num_nonnulls` makes that
 * unrepresentable rather than merely discouraged by a command.
 *
 * `userId` is `text` because better-auth issues string ids and
 * `ntizo_user.user.id` is a text column — `review.author_user_id` already
 * references it the same way. `providerId` is a real `uuid`. The two are not
 * interchangeable and a uuid column pointing at a better-auth id fails on the
 * first insert.
 *
 * **`payload` is a snapshot, not a set of foreign keys.** "Salão X has been
 * verified" must still say X after X is renamed, deactivated or deleted.
 * Resolving names at read time makes an inbox that rewrites its own history and
 * ties every row to the lifetime of everything it mentions.
 *
 * Deleting the addressee takes their inbox with it — for a person because
 * "delete my data" has to mean that, for a business because a workspace inbox
 * without a workspace is about nothing.
 */
export const notification = notificationSchema.table(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** A `NotificationType` value from `@ntizo/shared`. */
    type: text("type").notNull(),
    /** "user" | "provider" — which of the two id columns is the addressee. */
    audience: text("audience").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(() => provider.id, { onDelete: "cascade" }),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Both inboxes are read as "this addressee's rows, newest first", which is
    // this pair of indexes. Partial, because half the rows have a null in each.
    index("notification_user_idx").on(t.userId, t.createdAt.desc()),
    index("notification_provider_idx").on(t.providerId, t.createdAt.desc()),
    check("notification_audience_known", sql`${t.audience} IN ('user', 'provider')`),
    check(
      "notification_one_addressee",
      sql`num_nonnulls(${t.userId}, ${t.providerId}) = 1`,
    ),
    // The audience column and the populated id must agree. Without this the
    // CHECK above still passes for a row claiming audience='user' while
    // carrying only a provider_id, and every reader would then have to guess
    // which of the two to believe.
    check(
      "notification_audience_matches_addressee",
      sql`(${t.audience} = 'user' AND ${t.userId} IS NOT NULL)
          OR (${t.audience} = 'provider' AND ${t.providerId} IS NOT NULL)`,
    ),
  ],
);

export type NotificationRecord = typeof notification.$inferSelect;
export type NewNotificationRecord = typeof notification.$inferInsert;
```

`notification-read.schema.ts`:

```ts
import { pgSchema, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { notification } from "./notification.schema";
import { user } from "../../user/schemas/user.schema";

const notificationSchema = pgSchema("ntizo_notification");

/**
 * Who has read what.
 *
 * **A table rather than a `read_at` column on `notification`.** A workspace
 * notification is read by each member independently; a column would report that
 * the whole business had read something the moment one member opened it. For a
 * personal notification only one row can ever exist, which is a small cost for
 * having one model instead of two.
 *
 * The composite primary key is also the idempotency rule: marking something
 * read twice is the same fact stated twice, and `ON CONFLICT DO NOTHING`
 * resolves on this key rather than on a read-then-write that two clicks can
 * both pass.
 */
export const notificationRead = notificationSchema.table(
  "notification_read",
  {
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notification.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.notificationId, t.userId] })],
);

export type NotificationReadRecord = typeof notificationRead.$inferSelect;
```

Both barrels:

```ts
// schemas/index.ts
export * from "./notification.schema";
export * from "./notification-read.schema";
```

```ts
// notification/index.ts
export * from "./schemas";
```

- [ ] **Step 2: Register the schema in the two places that must agree**

In `database/schemas.ts`, add after the `review` line:

```ts
export * from "./notification";
```

In `src/modules/ntizo/drizzle.config.ts`, add `"ntizo_notification"` to `schemaFilter`, after `"ntizo_review"`. **Without this the generated migration is empty** — drizzle-kit only diffs schemas named in the filter, and it fails silently rather than warning.

- [ ] **Step 3: Write the failing constraint test**

Create `database/__tests__/notification-constraints.test.ts`. It asserts against the real dev database, the same way `scheduling-constraints.test.ts` does and for the same reason stated in that file's header — a CHECK nobody exercises is a CHECK that might not be on the table.

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { notification } from "../notification/schemas/notification.schema";
import { notificationRead } from "../notification/schemas/notification-read.schema";
import { user } from "../user/schemas/user.schema";

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

beforeAll(async () => {
  userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId,
    email: `notif-${suffix}@ntizo.test`,
    role: "customer",
    status: "active",
  });
});

afterAll(async () => {
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("notification addressing", () => {
  test("accepts a row addressed to a user", async () => {
    const [row] = await db
      .insert(notification)
      .values({ type: "WELCOME", audience: "user", userId, payload: {} })
      .returning();
    expect(row?.id).toBeString();
    await db.delete(notification).where(eq(notification.id, row!.id));
  });

  test("refuses a row addressed to nobody", async () => {
    await expect(
      db.insert(notification).values({ type: "WELCOME", audience: "user", payload: {} }),
    ).rejects.toThrow(/notification_one_addressee/);
  });

  test("refuses an audience that disagrees with the id it carries", async () => {
    await expect(
      db
        .insert(notification)
        .values({ type: "WELCOME", audience: "provider", userId, payload: {} }),
    ).rejects.toThrow(/notification_audience_matches_addressee/);
  });

  test("refuses an unknown audience", async () => {
    await expect(
      db.insert(notification).values({ type: "WELCOME", audience: "team", userId, payload: {} }),
    ).rejects.toThrow(/notification_audience_known/);
  });
});

describe("read state", () => {
  test("the same reader marking twice collapses to one row", async () => {
    const [row] = await db
      .insert(notification)
      .values({ type: "WELCOME", audience: "user", userId, payload: {} })
      .returning();

    await db.insert(notificationRead).values({ notificationId: row!.id, userId });
    await db
      .insert(notificationRead)
      .values({ notificationId: row!.id, userId })
      .onConflictDoNothing();

    const rows = await db
      .select()
      .from(notificationRead)
      .where(eq(notificationRead.notificationId, row!.id));
    expect(rows).toHaveLength(1);

    await db.delete(notification).where(eq(notification.id, row!.id));
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/notification-constraints.test.ts
```

Expected: FAIL — `relation "ntizo_notification.notification" does not exist`. The tables are declared in TypeScript but no migration has created them.

- [ ] **Step 5: Generate and apply the migration**

```bash
cd packages/backend
bun run db:ntizo:generate
```

Read the generated SQL under `src/modules/ntizo/shared/infrastructure/migrations/` before applying it. It must contain `CREATE SCHEMA "ntizo_notification"`, both `CREATE TABLE`s, all three CHECK constraints and both indexes. If it is empty, `schemaFilter` was not updated in Step 2.

```bash
bun run db:ntizo:dev:migrate
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/notification-constraints.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/shared/infrastructure/database/notification \
        packages/backend/src/modules/ntizo/shared/infrastructure/database/schemas.ts \
        packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/notification-constraints.test.ts \
        packages/backend/src/modules/ntizo/shared/infrastructure/migrations \
        packages/backend/src/modules/ntizo/drizzle.config.ts
git commit -m "feat(notification): the two tables an inbox needs

An item and who has read it, in a new \`ntizo_notification\` schema.

Read state is its own table rather than a \`read_at\` column, because a
workspace notification is read by each member independently and a column
would report the whole business had read something the moment one member
opened it. Its composite key is also the idempotency rule.

Three CHECKs, not one. \`num_nonnulls\` refuses a row addressed to nobody
or to two parties; a second constraint refuses an \`audience\` that
disagrees with the id it carries, which the first one happily allows and
which would leave every reader guessing which column to believe.

\`user_id\` is \`text\`: better-auth issues string ids and
\`ntizo_user.user.id\` is a text column. \`provider_id\` is a real uuid.

The tests insert against the real dev database rather than mocking
Drizzle — a CHECK nobody exercises is a CHECK that might not be there."
```

---

## Task 2: The Notification aggregate

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/notification/domain/aggregates/notification.aggregate.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/notification/domain/exceptions.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/notification/__tests__/notification.aggregate.test.ts`

**Interfaces:**
- Consumes: `NotificationType` from `@ntizo/shared`.
- Produces:
  - `Notification.forUser({ type, userId, payload }): Notification`
  - `Notification.forProvider({ type, providerId, payload }): Notification`
  - getters `id`, `type`, `audience`, `userId`, `providerId`, `payload`
  - `type NotificationAudience = "user" | "provider"`
  - `UnknownNotificationTypeError`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { Notification } from "../domain/aggregates/notification.aggregate";
import { UnknownNotificationTypeError } from "../domain/exceptions";

describe("Notification.forUser", () => {
  it("addresses a person and nobody else", () => {
    const n = Notification.forUser({
      type: NotificationType.Welcome,
      userId: "u1",
      payload: { firstName: "Ana" },
    });
    expect(n.audience).toBe("user");
    expect(n.userId).toBe("u1");
    expect(n.providerId).toBeNull();
  });

  it("has no id until something stores it", () => {
    const n = Notification.forUser({ type: NotificationType.Welcome, userId: "u1", payload: {} });
    expect(n.id).toBeNull();
  });
});

describe("Notification.forProvider", () => {
  it("addresses a business and nobody else", () => {
    const n = Notification.forProvider({
      type: NotificationType.ProviderVerified,
      providerId: "p1",
      payload: { providerName: "Salão X" },
    });
    expect(n.audience).toBe("provider");
    expect(n.providerId).toBe("p1");
    expect(n.userId).toBeNull();
  });
});

describe("the type must be one the platform knows", () => {
  it("refuses a string that is not a NotificationType", () => {
    expect(() =>
      Notification.forUser({
        type: "SOMETHING_INVENTED" as NotificationType,
        userId: "u1",
        payload: {},
      }),
    ).toThrow(UnknownNotificationTypeError);
  });
});

describe("the payload is a snapshot", () => {
  it("keeps what it was given, so a later rename cannot rewrite it", () => {
    const payload = { providerName: "Salão X" };
    const n = Notification.forProvider({
      type: NotificationType.ProviderVerified,
      providerId: "p1",
      payload,
    });
    payload.providerName = "Renamed";
    expect((n.payload as { providerName: string }).providerName).toBe("Salão X");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/notification
```

Expected: FAIL — cannot resolve `../domain/aggregates/notification.aggregate`.

- [ ] **Step 3: Write the exceptions**

```ts
// domain/exceptions.ts

/**
 * A notification type the platform does not define.
 *
 * Worth its own error rather than a generic validation failure: this can only
 * happen when a handler was written against a type that was renamed or never
 * existed, and the message should say which string arrived so the handler is
 * findable.
 */
export class UnknownNotificationTypeError extends Error {
  readonly code = "UNKNOWN_NOTIFICATION_TYPE";
  constructor(readonly type: string) {
    super(`"${type}" is not a notification type this platform defines`);
    this.name = "UnknownNotificationTypeError";
  }
}
```

- [ ] **Step 4: Write the aggregate**

```ts
// domain/aggregates/notification.aggregate.ts
import { NotificationType } from "@ntizo/shared";
import { UnknownNotificationTypeError } from "../exceptions";

/** Which of the two id columns carries the addressee. Mirrors the CHECK on the table. */
export type NotificationAudience = "user" | "provider";

/** Whatever a template or a cell needs to render this item, captured when it was raised. */
export type NotificationPayload = Record<string, unknown>;

export interface NotificationProps {
  readonly id: string | null;
  readonly type: NotificationType;
  readonly audience: NotificationAudience;
  readonly userId: string | null;
  readonly providerId: string | null;
  readonly payload: NotificationPayload;
}

const KNOWN_TYPES = new Set<string>(Object.values(NotificationType));

/**
 * One item in somebody's inbox.
 *
 * Two named constructors rather than one taking an audience, because the two
 * cases take different arguments and a single `create` would have to accept
 * both ids as nullable and then check that exactly one arrived — which is the
 * bug the table's CHECK exists to catch, reimplemented in TypeScript. Naming
 * them makes the wrong call unwritable instead of merely refused.
 *
 * **The payload is copied, not referenced.** It is a snapshot of what was true
 * when the notification was raised, and a caller holding the object it passed
 * in could otherwise mutate an inbox item after the fact. Shallow is enough:
 * every payload in this system is flat strings and numbers, and a deep clone
 * would buy nothing but a dependency on structuredClone in a Worker.
 *
 * There is no `markRead` here. Read state belongs to a reader, not to the
 * notification — a workspace item is read by each member independently, so it
 * lives in its own table and its own command.
 */
export class Notification {
  private constructor(private readonly props: NotificationProps) {}

  static forUser(input: {
    id?: string | null;
    type: NotificationType;
    userId: string;
    payload: NotificationPayload;
  }): Notification {
    assertKnownType(input.type);
    return new Notification({
      id: input.id ?? null,
      type: input.type,
      audience: "user",
      userId: input.userId,
      providerId: null,
      payload: { ...input.payload },
    });
  }

  static forProvider(input: {
    id?: string | null;
    type: NotificationType;
    providerId: string;
    payload: NotificationPayload;
  }): Notification {
    assertKnownType(input.type);
    return new Notification({
      id: input.id ?? null,
      type: input.type,
      audience: "provider",
      userId: null,
      providerId: input.providerId,
      payload: { ...input.payload },
    });
  }

  get id(): string | null {
    return this.props.id;
  }
  get type(): NotificationType {
    return this.props.type;
  }
  get audience(): NotificationAudience {
    return this.props.audience;
  }
  get userId(): string | null {
    return this.props.userId;
  }
  get providerId(): string | null {
    return this.props.providerId;
  }
  get payload(): NotificationPayload {
    return this.props.payload;
  }
}

function assertKnownType(type: NotificationType): void {
  if (!KNOWN_TYPES.has(type)) throw new UnknownNotificationTypeError(String(type));
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/notification
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Break-check the type guard**

Comment out the `assertKnownType(input.type)` call in `forUser` and re-run. The "refuses a string that is not a NotificationType" test must fail. Restore it.

A test that passes with the guard removed is not testing the guard. Do this for real — do not assume.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/notification
git commit -m "feat(notification): the aggregate, addressed one way or the other

Two named constructors rather than one taking an audience. A single
\`create\` would have to accept both ids as nullable and then check that
exactly one arrived — which is the table's own CHECK reimplemented in
TypeScript. Naming them makes the wrong call unwritable rather than
merely refused.

The payload is copied on the way in. It is a snapshot of what was true
when the notification was raised, and a caller holding the object it
passed could otherwise edit an inbox item after the fact.

No \`markRead\` on the aggregate: read state belongs to a reader, not to
the notification, because a workspace item is read by each member
independently."
```

---

## Task 3: The outbound ports

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/notification/app/ports/outbound/notification.repository.port.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/notification/app/ports/outbound/provider-member-reader.port.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/notification/app/ports/outbound/index.ts`

**Interfaces:**
- Consumes: `Notification` from Task 2.
- Produces: `NotificationRepositoryPort`, `ProviderMemberReaderPort`, `InboxRow`, `InboxPage`.

This task is types only — there is nothing to test until Task 4 uses them, so it has no test cycle of its own and is committed with Task 4. It is listed separately because the interfaces below are what Tasks 4, 5, 7 and 8 are all written against.

- [ ] **Step 1: Write the repository port**

```ts
// app/ports/outbound/notification.repository.port.ts
import type { Notification } from "../../../domain/aggregates/notification.aggregate";

/** One row as a projection returns it — already flattened, never an aggregate. */
export interface InboxRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  read: boolean;
}

export interface InboxPage {
  items: InboxRow[];
  total: number;
}

export interface NotificationRepositoryPort {
  /** Stores a new item and returns its assigned id. */
  save(entity: Notification): Promise<string>;

  /**
   * One page of a person's own inbox, newest first, with each row's read state
   * resolved for that same person.
   */
  listForUser(userId: string, limit: number, offset: number): Promise<InboxPage>;

  /**
   * One page of a workspace's inbox, newest first, with read state resolved for
   * `readerUserId` — the member asking, not the workspace.
   */
  listForProvider(
    providerId: string,
    readerUserId: string,
    limit: number,
    offset: number,
  ): Promise<InboxPage>;

  countUnreadForUser(userId: string): Promise<number>;
  countUnreadForProvider(providerId: string, readerUserId: string): Promise<number>;

  /**
   * Marks one item read by one reader. Returns false when the item does not
   * exist or is not addressed to this reader — the caller reports that rather
   * than confirming a no-op.
   */
  markRead(notificationId: string, readerUserId: string): Promise<boolean>;

  /** Marks every currently-unread item in this inbox read, for this reader only. */
  markAllReadForUser(userId: string): Promise<number>;
  markAllReadForProvider(providerId: string, readerUserId: string): Promise<number>;
}
```

- [ ] **Step 2: Write the membership reader port**

```ts
// app/ports/outbound/provider-member-reader.port.ts

/**
 * Who belongs to a workspace, as the Notification context needs to know it.
 *
 * An outbound port rather than an import of the Provider context: notifications
 * must not reach into another bounded context's tables, and the adapter that
 * implements this is the one place the coupling is written down. It answers two
 * questions and no more — everything else about a member is the Provider
 * context's business.
 */
export interface ProviderMemberReaderPort {
  /** Whether this person may read this workspace's inbox at all. */
  isMember(providerId: string, userId: string): Promise<boolean>;
}
```

```ts
// app/ports/outbound/index.ts
export type { InboxPage, InboxRow, NotificationRepositoryPort } from "./notification.repository.port";
export type { ProviderMemberReaderPort } from "./provider-member-reader.port";
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/backend && bun run typecheck
```

Expected: clean. No commit — this task lands with Task 4.

---

## Task 4: The Drizzle repository

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/notification/infrastructure/repositories/drizzle/notification.repository.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/notification/infrastructure/outbound-adapters/cross-bc/provider-member-reader.adapter.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/notification/__tests__/notification.repository.test.ts`

**Interfaces:**
- Consumes: `NotificationRepositoryPort`, `ProviderMemberReaderPort` (Task 3); `Notification` (Task 2); the tables (Task 1).
- Produces: `DrizzleNotificationRepository`, `DrizzleProviderMemberReader`.

- [ ] **Step 1: Write the failing test**

Against the real dev database, like Task 1 and for the same reason: the read-state join is SQL, and a `LEFT JOIN` that silently drops unread rows is invisible to any mock.

**This test needs a step Task 1's did not.** The repository resolves its handle
through `getDb()` → `getActiveDb()` → AsyncLocalStorage, which `configMiddleware`
binds per request — and a test has no request, so every call throws
`[infra-store] not initialized`. Seeding through your own raw client is not
enough; the client has to be bound into the context the code under test reads
from. Wrap each test body in `__runWithTransactionContextForTests(db, ...)` from
`shared/infrastructure/database/tx-context`, and build `db` as
`drizzle(sql, { schema: authSchema })` — the bare `drizzle(sql)` does not satisfy
the `DrizzleDb` type the helper expects.

The precedent is `catalog-unpublish-sweep.test.ts`, which solves exactly this and
explains it in its header. `scheduling-constraints.test.ts` never hits it, because
it inserts through its own handle and never calls a `getDb()`-based repository —
which is why modelling this test's shape on that file was not enough.

The helper binds the context but opens **no transaction**, so writes commit for
real: `afterAll` must delete children before parents. Leave a comment above the
wrapper saying why it is there, or somebody removes it later as ceremony.

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { NotificationType } from "@ntizo/shared";
import { notification } from "../../../shared/infrastructure/database/notification/schemas";
import { user } from "../../../shared/infrastructure/database/user/schemas";
import { Notification } from "../domain/aggregates/notification.aggregate";
import { DrizzleNotificationRepository } from "../infrastructure/repositories/drizzle/notification.repository";

const url = process.env["DEV_DB_URL"];
if (!url) throw new Error("DEV_DB_URL is not set — see packages/backend/.env");

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);
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
  await db.delete(user).where(eq(user.id, aliceId));
  await db.delete(user).where(eq(user.id, bobId));
  await sql.end();
});

describe("a personal inbox", () => {
  test("returns what was saved, newest first, unread", async () => {
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

  test("total is how many matched, not how many fit on the page", async () => {
    const page = await repo.listForUser(aliceId, 1, 0);
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
  });

  test("does not leak another person's inbox", async () => {
    const page = await repo.listForUser(bobId, 10, 0);
    expect(page.total).toBe(0);
  });

  test("marking one read moves it out of the unread count", async () => {
    const before = await repo.countUnreadForUser(aliceId);
    const page = await repo.listForUser(aliceId, 10, 0);
    const ok = await repo.markRead(page.items[0]!.id, aliceId);
    expect(ok).toBe(true);
    expect(await repo.countUnreadForUser(aliceId)).toBe(before - 1);
  });

  test("marking twice is idempotent, not an error", async () => {
    const page = await repo.listForUser(aliceId, 10, 0);
    const id = page.items[0]!.id;
    await repo.markRead(id, aliceId);
    expect(await repo.markRead(id, aliceId)).toBe(true);
  });

  test("refuses to mark somebody else's item and says so", async () => {
    const page = await repo.listForUser(aliceId, 10, 0);
    expect(await repo.markRead(page.items[0]!.id, bobId)).toBe(false);
  });

  test("a missing id reports nothing rather than confirming", async () => {
    expect(await repo.markRead(crypto.randomUUID(), aliceId)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/notification/__tests__/notification.repository.test.ts
```

Expected: FAIL — cannot resolve the repository module.

- [ ] **Step 3: Write the repository**

```ts
import { and, count, desc, eq, isNull, sql as raw } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  notification,
  notificationRead,
} from "../../../../../shared/infrastructure/database/notification/schemas";
import type { NotificationType } from "@ntizo/shared";
import { Notification } from "../../../domain/aggregates/notification.aggregate";
import type {
  InboxPage,
  InboxRow,
  NotificationRepositoryPort,
} from "../../../app/ports/outbound/notification.repository.port";

/**
 * Every read here resolves read state with a LEFT JOIN against
 * `notification_read` for ONE reader.
 *
 * The join is left, not inner, and this is the whole subtlety of the file: an
 * unread notification has no row on the right-hand side, so an inner join would
 * return exactly the items the reader has already seen — an inbox that empties
 * as you use it, and empty is the state nobody investigates.
 */
export class DrizzleNotificationRepository implements NotificationRepositoryPort {
  async save(entity: Notification): Promise<string> {
    const [row] = await getDb()
      .insert(notification)
      .values({
        type: entity.type,
        audience: entity.audience,
        userId: entity.userId,
        providerId: entity.providerId,
        payload: entity.payload,
      })
      .returning({ id: notification.id });
    return row!.id;
  }

  async listForUser(userId: string, limit: number, offset: number): Promise<InboxPage> {
    return this.list(eq(notification.userId, userId), userId, limit, offset);
  }

  async listForProvider(
    providerId: string,
    readerUserId: string,
    limit: number,
    offset: number,
  ): Promise<InboxPage> {
    return this.list(eq(notification.providerId, providerId), readerUserId, limit, offset);
  }

  private async list(
    scope: ReturnType<typeof eq>,
    readerUserId: string,
    limit: number,
    offset: number,
  ): Promise<InboxPage> {
    const db = getDb();

    const rows = await db
      .select({
        id: notification.id,
        type: notification.type,
        payload: notification.payload,
        createdAt: notification.createdAt,
        readAt: notificationRead.readAt,
      })
      .from(notification)
      .leftJoin(
        notificationRead,
        and(
          eq(notificationRead.notificationId, notification.id),
          eq(notificationRead.userId, readerUserId),
        ),
      )
      .where(scope)
      .orderBy(desc(notification.createdAt))
      .limit(limit)
      .offset(offset);

    // Counted separately rather than taken from `rows.length`: that is how many
    // fit on this page, and the results line means to state how many there are.
    const [{ value: total } = { value: 0 }] = await db
      .select({ value: count() })
      .from(notification)
      .where(scope);

    return {
      total,
      items: rows.map(
        (r): InboxRow => ({
          id: r.id,
          type: r.type,
          payload: r.payload as Record<string, unknown>,
          createdAt: r.createdAt.toISOString(),
          read: r.readAt !== null,
        }),
      ),
    };
  }

  async countUnreadForUser(userId: string): Promise<number> {
    return this.countUnread(eq(notification.userId, userId), userId);
  }

  async countUnreadForProvider(providerId: string, readerUserId: string): Promise<number> {
    return this.countUnread(eq(notification.providerId, providerId), readerUserId);
  }

  private async countUnread(
    scope: ReturnType<typeof eq>,
    readerUserId: string,
  ): Promise<number> {
    const [{ value } = { value: 0 }] = await getDb()
      .select({ value: count() })
      .from(notification)
      .leftJoin(
        notificationRead,
        and(
          eq(notificationRead.notificationId, notification.id),
          eq(notificationRead.userId, readerUserId),
        ),
      )
      .where(and(scope, isNull(notificationRead.notificationId)));
    return value;
  }

  /**
   * Marks read only if the item is actually addressed to this reader — either
   * personally, or through a workspace they belong to.
   *
   * The membership half is a subquery rather than a prior check in the command,
   * because a check followed by a write is a window in which membership can be
   * revoked. Returns false rather than throwing when nothing matched: whether
   * the id was wrong or the reader was not entitled is not a difference this
   * repository should let a caller measure.
   */
  async markRead(notificationId: string, readerUserId: string): Promise<boolean> {
    const result = await getDb().execute(raw`
      INSERT INTO ntizo_notification.notification_read (notification_id, user_id)
      SELECT n.id, ${readerUserId}
      FROM ntizo_notification.notification n
      WHERE n.id = ${notificationId}
        AND (
          n.user_id = ${readerUserId}
          OR EXISTS (
            SELECT 1 FROM ntizo_provider.provider_member pm
            WHERE pm.provider_id = n.provider_id AND pm.user_id = ${readerUserId}
          )
        )
      ON CONFLICT (notification_id, user_id) DO NOTHING
    `);

    if ((result.count ?? 0) > 0) return true;

    // Zero rows inserted means either "not entitled" or "already read". Only
    // the second is a success, so ask.
    const [existing] = await getDb()
      .select({ id: notificationRead.notificationId })
      .from(notificationRead)
      .where(
        and(
          eq(notificationRead.notificationId, notificationId),
          eq(notificationRead.userId, readerUserId),
        ),
      )
      .limit(1);
    return existing !== undefined;
  }

  async markAllReadForUser(userId: string): Promise<number> {
    const result = await getDb().execute(raw`
      INSERT INTO ntizo_notification.notification_read (notification_id, user_id)
      SELECT n.id, ${userId}
      FROM ntizo_notification.notification n
      WHERE n.user_id = ${userId}
      ON CONFLICT (notification_id, user_id) DO NOTHING
    `);
    return result.count ?? 0;
  }

  /**
   * Per-reader, always. One member catching up must not blank a colleague's
   * badge — which is exactly what a `read_at` column on `notification` would
   * have done, and the reason it is a separate table.
   */
  async markAllReadForProvider(providerId: string, readerUserId: string): Promise<number> {
    const result = await getDb().execute(raw`
      INSERT INTO ntizo_notification.notification_read (notification_id, user_id)
      SELECT n.id, ${readerUserId}
      FROM ntizo_notification.notification n
      WHERE n.provider_id = ${providerId}
        AND EXISTS (
          SELECT 1 FROM ntizo_provider.provider_member pm
          WHERE pm.provider_id = ${providerId} AND pm.user_id = ${readerUserId}
        )
      ON CONFLICT (notification_id, user_id) DO NOTHING
    `);
    return result.count ?? 0;
  }
}
```

- [ ] **Step 4: Write the membership adapter**

```ts
// infrastructure/outbound-adapters/cross-bc/provider-member-reader.adapter.ts
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { ProviderMemberReaderPort } from "../../../app/ports/outbound/provider-member-reader.port";

/**
 * The single place the Notification context touches Provider's tables.
 *
 * A cross-BC adapter rather than an import of Provider's repository: this
 * context needs one boolean, and depending on the other context's bootstrap to
 * get it would couple two lifecycles for a single-row lookup.
 */
export class DrizzleProviderMemberReader implements ProviderMemberReaderPort {
  async isMember(providerId: string, userId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: providerMember.id })
      .from(providerMember)
      .where(and(eq(providerMember.providerId, providerId), eq(providerMember.userId, userId)))
      .limit(1);
    return row !== undefined;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/notification
```

Expected: PASS — 5 aggregate tests plus 7 repository tests.

- [ ] **Step 6: Break-check the LEFT JOIN**

Change `leftJoin` to `innerJoin` in `list` and re-run. "returns what was saved, newest first, unread" must fail. Restore it.

This is the one mutation in the file that a mocked test would never catch, which is why these tests hit a real database.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/notification
git commit -m "feat(notification): the repository, and its one subtle join

Read state resolves through a LEFT JOIN for one reader. Left, not inner,
and that is the whole subtlety: an unread item has no row on the right,
so an inner join returns exactly what the reader has already seen — an
inbox that empties as you use it, and empty is the state nobody
investigates. Break-checked by swapping the join and watching the test
go red.

\`markRead\` resolves entitlement inside the statement rather than in a
prior check, because a check followed by a write is a window in which
membership can be revoked. It answers false for both a wrong id and an
unentitled reader: that is not a difference a caller should be able to
measure.

\`markAllReadForProvider\` is per-reader. One member catching up must not
blank a colleague's badge, which is the reason read state is a table.

Tests run against the real dev database. The join is SQL, and a join that
drops rows is invisible to a mock."
```

---

## Task 5: RaiseNotification and the mark-read commands

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/notification/app/use-cases/raise-notification.internal.command.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/notification/app/use-cases/mark-read.command.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/notification/bootstrap/index.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/notification/index.ts`
- Modify: `packages/backend/package.json` (exports map)
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/notification/__tests__/notification-commands.test.ts`

**Interfaces:**
- Consumes: the ports from Task 3.
- Produces:
  - `RaiseNotificationInternalCommand.execute({ type, audience: "user", userId, payload } | { type, audience: "provider", providerId, payload }): Promise<{ notificationId: string }>`
  - `MarkNotificationReadCommand.execute({ requesterUserId, notificationId }): Promise<{ ok: true }>`
  - `MarkAllNotificationsReadCommand.execute({ requesterUserId, providerId?: string }): Promise<{ marked: number }>`
  - `bootstrapNotification(): NotificationBootstrap`
  - `NotificationNotFoundError`, `NotProviderMemberError`

- [ ] **Step 1: Write the failing test with an in-memory repository**

```ts
import { beforeEach, describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { Notification } from "../domain/aggregates/notification.aggregate";
import type {
  InboxPage,
  NotificationRepositoryPort,
} from "../app/ports/outbound/notification.repository.port";
import type { ProviderMemberReaderPort } from "../app/ports/outbound/provider-member-reader.port";
import { RaiseNotificationInternalCommand } from "../app/use-cases/raise-notification.internal.command";
import {
  MarkAllNotificationsReadCommand,
  MarkNotificationReadCommand,
} from "../app/use-cases/mark-read.command";
import { NotificationNotFoundError, NotProviderMemberError } from "../domain/exceptions";

class InMemoryRepo implements NotificationRepositoryPort {
  saved: Notification[] = [];
  markable = true;
  markedAll = 0;

  async save(entity: Notification): Promise<string> {
    this.saved.push(entity);
    return `n${this.saved.length}`;
  }
  async listForUser(): Promise<InboxPage> {
    return { items: [], total: 0 };
  }
  async listForProvider(): Promise<InboxPage> {
    return { items: [], total: 0 };
  }
  async countUnreadForUser(): Promise<number> {
    return 0;
  }
  async countUnreadForProvider(): Promise<number> {
    return 0;
  }
  async markRead(): Promise<boolean> {
    return this.markable;
  }
  async markAllReadForUser(): Promise<number> {
    return this.markedAll;
  }
  async markAllReadForProvider(): Promise<number> {
    return this.markedAll;
  }
}

class Members implements ProviderMemberReaderPort {
  constructor(private readonly answer: boolean) {}
  async isMember(): Promise<boolean> {
    return this.answer;
  }
}

let repo: InMemoryRepo;
beforeEach(() => {
  repo = new InMemoryRepo();
});

describe("RaiseNotificationInternalCommand", () => {
  it("stores a personal notification addressed to the person", async () => {
    const cmd = new RaiseNotificationInternalCommand(repo);
    const { notificationId } = await cmd.execute({
      type: NotificationType.Welcome,
      audience: "user",
      userId: "u1",
      payload: { firstName: "Ana" },
    });
    expect(notificationId).toBe("n1");
    expect(repo.saved[0]!.audience).toBe("user");
    expect(repo.saved[0]!.userId).toBe("u1");
  });

  it("stores a workspace notification addressed to the business", async () => {
    const cmd = new RaiseNotificationInternalCommand(repo);
    await cmd.execute({
      type: NotificationType.ProviderVerified,
      audience: "provider",
      providerId: "p1",
      payload: {},
    });
    expect(repo.saved[0]!.providerId).toBe("p1");
    expect(repo.saved[0]!.userId).toBeNull();
  });
});

describe("MarkNotificationReadCommand", () => {
  it("confirms when the item was marked", async () => {
    const cmd = new MarkNotificationReadCommand(repo);
    expect(await cmd.execute({ requesterUserId: "u1", notificationId: "n1" })).toEqual({ ok: true });
  });

  it("reports nothing marked rather than confirming a no-op", async () => {
    repo.markable = false;
    const cmd = new MarkNotificationReadCommand(repo);
    await expect(cmd.execute({ requesterUserId: "u1", notificationId: "nope" })).rejects.toThrow(
      NotificationNotFoundError,
    );
  });
});

describe("MarkAllNotificationsReadCommand", () => {
  it("marks a personal inbox without asking about membership", async () => {
    repo.markedAll = 3;
    const cmd = new MarkAllNotificationsReadCommand(repo, new Members(false));
    expect(await cmd.execute({ requesterUserId: "u1" })).toEqual({ marked: 3 });
  });

  it("refuses a workspace the caller does not belong to", async () => {
    const cmd = new MarkAllNotificationsReadCommand(repo, new Members(false));
    await expect(cmd.execute({ requesterUserId: "u1", providerId: "p1" })).rejects.toThrow(
      NotProviderMemberError,
    );
  });

  it("marks a workspace the caller does belong to", async () => {
    repo.markedAll = 2;
    const cmd = new MarkAllNotificationsReadCommand(repo, new Members(true));
    expect(await cmd.execute({ requesterUserId: "u1", providerId: "p1" })).toEqual({ marked: 2 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/notification/__tests__/notification-commands.test.ts
```

Expected: FAIL — the use-case modules do not exist.

- [ ] **Step 3: Add the two new exceptions**

Append to `domain/exceptions.ts`:

```ts
/**
 * Nothing was marked.
 *
 * Raised for both a missing id and an item the caller is not entitled to,
 * deliberately identically: telling the two apart lets somebody probing ids
 * learn which notifications exist. The same rule the review commands follow.
 */
export class NotificationNotFoundError extends Error {
  readonly code = "NOTIFICATION_NOT_FOUND";
  constructor() {
    super("No such notification, or it is not yours to mark");
    this.name = "NotificationNotFoundError";
  }
}

export class NotProviderMemberError extends Error {
  readonly code = "NOT_PROVIDER_MEMBER";
  constructor(readonly providerId: string) {
    super("You do not belong to this workspace");
    this.name = "NotProviderMemberError";
  }
}
```

- [ ] **Step 4: Write the raise command**

```ts
// app/use-cases/raise-notification.internal.command.ts
import type { NotificationType } from "@ntizo/shared";
import { Notification } from "../../domain/aggregates/notification.aggregate";
import type { NotificationRepositoryPort } from "../ports/outbound/notification.repository.port";

export type RaiseNotificationInput =
  | { type: NotificationType; audience: "user"; userId: string; payload: Record<string, unknown> }
  | {
      type: NotificationType;
      audience: "provider";
      providerId: string;
      payload: Record<string, unknown>;
    };

/**
 * The one way a notification comes into existence.
 *
 * Internal: there is no GraphQL mutation behind it and there must not be. A
 * notification is a consequence of something the platform did, never something
 * a client asks for — an endpoint that raised one would let anybody write into
 * anybody's inbox.
 *
 * **This is also where Phase 2 hangs.** Email delivery is a step appended here,
 * after the row is written, which is why the input carries the whole payload
 * rather than ids for a later reader to resolve.
 *
 * The discriminated union rather than nullable ids: the aggregate has two
 * constructors for the same reason, and a caller cannot express "both" or
 * "neither" without the compiler stopping them.
 */
export class RaiseNotificationInternalCommand {
  constructor(private readonly repo: NotificationRepositoryPort) {}

  async execute(input: RaiseNotificationInput): Promise<{ notificationId: string }> {
    const entity =
      input.audience === "user"
        ? Notification.forUser({ type: input.type, userId: input.userId, payload: input.payload })
        : Notification.forProvider({
            type: input.type,
            providerId: input.providerId,
            payload: input.payload,
          });

    return { notificationId: await this.repo.save(entity) };
  }
}
```

- [ ] **Step 5: Write the mark-read commands**

```ts
// app/use-cases/mark-read.command.ts
import { NotificationNotFoundError, NotProviderMemberError } from "../../domain/exceptions";
import type { NotificationRepositoryPort } from "../ports/outbound/notification.repository.port";
import type { ProviderMemberReaderPort } from "../ports/outbound/provider-member-reader.port";

/**
 * Marking one item read.
 *
 * The entitlement check lives in the repository's statement, not here — a check
 * in this command followed by a write is a window in which membership can be
 * revoked. This class's job is to turn "nothing was marked" into a refusal
 * rather than a silent success, which is the rule `RemoveReviewCommand` and
 * `ManageClosures` both follow: a click that changes nothing must not read as
 * "worked".
 */
export class MarkNotificationReadCommand {
  constructor(private readonly repo: NotificationRepositoryPort) {}

  async execute(input: { requesterUserId: string; notificationId: string }): Promise<{ ok: true }> {
    const marked = await this.repo.markRead(input.notificationId, input.requesterUserId);
    if (!marked) throw new NotificationNotFoundError();
    return { ok: true };
  }
}

/**
 * Marking a whole inbox read, for the caller and only the caller.
 *
 * One command for both inboxes, discriminated by whether `providerId` arrives.
 * The membership check IS here rather than in the statement, unlike
 * `markRead`: this one refuses an entire workspace, and a caller who is not a
 * member should be told so instead of receiving `{ marked: 0 }`, which reads as
 * "your inbox was already clear".
 */
export class MarkAllNotificationsReadCommand {
  constructor(
    private readonly repo: NotificationRepositoryPort,
    private readonly members: ProviderMemberReaderPort,
  ) {}

  async execute(input: {
    requesterUserId: string;
    providerId?: string | undefined;
  }): Promise<{ marked: number }> {
    if (input.providerId === undefined) {
      return { marked: await this.repo.markAllReadForUser(input.requesterUserId) };
    }

    if (!(await this.members.isMember(input.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError(input.providerId);
    }
    return {
      marked: await this.repo.markAllReadForProvider(input.providerId, input.requesterUserId),
    };
  }
}
```

- [ ] **Step 6: Write the bootstrap and the barrel**

```ts
// bootstrap/index.ts
import { DrizzleNotificationRepository } from "../infrastructure/repositories/drizzle/notification.repository";
import { DrizzleProviderMemberReader } from "../infrastructure/outbound-adapters/cross-bc/provider-member-reader.adapter";
import { RaiseNotificationInternalCommand } from "../app/use-cases/raise-notification.internal.command";
import {
  MarkAllNotificationsReadCommand,
  MarkNotificationReadCommand,
} from "../app/use-cases/mark-read.command";

export function bootstrapNotification() {
  const notificationRepository = new DrizzleNotificationRepository();
  const memberReader = new DrizzleProviderMemberReader();

  return {
    adapters: { notificationRepository, memberReader },
    useCases: {
      markNotificationRead: new MarkNotificationReadCommand(notificationRepository),
      markAllNotificationsRead: new MarkAllNotificationsReadCommand(
        notificationRepository,
        memberReader,
      ),
      internal: {
        raiseNotification: new RaiseNotificationInternalCommand(notificationRepository),
      },
    },
  };
}

export type NotificationBootstrap = ReturnType<typeof bootstrapNotification>;
```

```ts
// index.ts
export { bootstrapNotification, type NotificationBootstrap } from "./bootstrap";
export type { NotificationAudience } from "./domain/aggregates/notification.aggregate";
```

Add to `packages/backend/package.json` `exports`, beside the other bounded contexts:

```json
"./modules/ntizo/bounded-contexts/notification": "./src/modules/ntizo/bounded-contexts/notification/index.ts",
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/notification
```

Expected: PASS — 5 aggregate + 7 repository + 7 command tests.

- [ ] **Step 8: Break-check the membership guard**

Delete the `if (!(await this.members.isMember(...)))` block and re-run. "refuses a workspace the caller does not belong to" must fail. Restore it.

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/notification packages/backend/package.json
git commit -m "feat(notification): raising one, and marking them read

\`RaiseNotificationInternalCommand\` is the only way a notification comes
into existence, and it is internal on purpose: a notification is a
consequence of something the platform did, never something a client asks
for. An endpoint behind it would let anybody write into anybody's inbox.
It is also where Phase 2's email delivery hangs, which is why the input
carries the whole payload rather than ids for a later reader to resolve.

Its input is a discriminated union rather than two nullable ids, so
'both' and 'neither' are unwritable — the same reason the aggregate has
two named constructors.

The two mark-read commands differ in where the guard sits, deliberately.
\`markRead\` resolves entitlement inside the SQL, because a check followed
by a write is a window in which membership can be revoked. \`markAll\`
checks membership here, because it refuses a whole workspace and
{ marked: 0 } would read as 'your inbox was already clear' to somebody
who is simply not a member."
```

---

## Task 6: The read models in `@ntizo/shared`

**Files:**
- Create: `packages/shared/src/read-models/system/notification/notification.schema.ts`
- Create: `packages/shared/src/read-models/system/notification/index.ts`
- Modify: `packages/shared/src/read-models/system/index.ts`
- Test: `packages/shared/src/read-models/__tests__/read-models.test.ts` (add cases)

**Interfaces:**
- Produces: `notificationReadModel`, `inboxPageReadModel`, `unreadCountReadModel`; types `NotificationDTO`, `InboxPageDTO`, `UnreadCountDTO`.

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/read-models/__tests__/read-models.test.ts`:

```ts
import { inboxPageReadModel, notificationReadModel } from "../system/notification";

describe("notificationReadModel", () => {
  it("accepts a row as the projection returns it", () => {
    const parsed = notificationReadModel.parse({
      id: "n1",
      type: "PROVIDER_VERIFIED",
      payload: { providerName: "Salão X" },
      createdAt: "2026-08-23T10:00:00.000Z",
      read: false,
    });
    expect(parsed.read).toBe(false);
  });

  it("keeps an arbitrary payload rather than pinning one shape", () => {
    const parsed = notificationReadModel.parse({
      id: "n1",
      type: "WELCOME",
      payload: { anything: 1, nested: { ok: true } },
      createdAt: "2026-08-23T10:00:00.000Z",
      read: true,
    });
    expect(parsed.payload["nested"]).toEqual({ ok: true });
  });
});

describe("inboxPageReadModel", () => {
  it("carries total alongside items", () => {
    const parsed = inboxPageReadModel.parse({ items: [], total: 12 });
    expect(parsed.total).toBe(12);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/shared && bun test
```

Expected: FAIL — cannot resolve `../system/notification`.

- [ ] **Step 3: Write the read models**

```ts
// packages/shared/src/read-models/system/notification/notification.schema.ts
import { z } from "zod";

/**
 * One item as an inbox draws it.
 *
 * **`payload` is deliberately unconstrained.** Every notification type carries
 * different facts — a provider name here, a role and an inviter there — and
 * pinning a union of thirty shapes into the read model would mean editing this
 * file for every new type, in a package both the backend and the frontend
 * depend on. The cell that renders a type is what knows that type's fields, and
 * it is where a wrong assumption should fail.
 *
 * `read` is resolved per reader by the projection, so the same workspace item
 * is `true` for the member who opened it and `false` for their colleague.
 *
 * `createdAt` is an ISO string rather than a Date: this crosses GraphQL, and a
 * Date would be serialised to a string anyway — with the type quietly lying
 * about it on the way.
 */
export const notificationReadModel = z.object({
  id: z.string().min(1),
  /** A `NotificationType` value. Not the enum: an unknown type must render as unknown, not 500. */
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  read: z.boolean(),
});

/**
 * A page of an inbox, and how many there are in total.
 *
 * `total` is not `items.length` — that is how many fit on this page. The same
 * distinction `providerList` settled on, for the same reason.
 */
export const inboxPageReadModel = z.object({
  items: z.array(notificationReadModel),
  total: z.number().int(),
});

/** Just the badge's number. Its own query so the bell never fetches a page it will not draw. */
export const unreadCountReadModel = z.object({
  count: z.number().int(),
});

export type NotificationDTO = z.infer<typeof notificationReadModel>;
export type InboxPageDTO = z.infer<typeof inboxPageReadModel>;
export type UnreadCountDTO = z.infer<typeof unreadCountReadModel>;
```

```ts
// packages/shared/src/read-models/system/notification/index.ts
export * from "./notification.schema";
```

Add to `packages/shared/src/read-models/system/index.ts`:

```ts
export * from "./notification";
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd packages/shared && bun test
```

Expected: PASS — 151 existing plus 3 new.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/read-models
git commit -m "feat(notification): the read models an inbox is drawn from

\`payload\` is an open record on purpose. Every type carries different
facts, and pinning a union of thirty shapes here would mean editing a
package both sides depend on for every new notification. The cell that
renders a type is what knows that type's fields, and is where a wrong
assumption should fail.

\`read\` is per reader, so the same workspace item is true for the member
who opened it and false for their colleague. \`total\` is not items.length
— that is how many fit on the page."
```

---

## Task 7: The read tier

**Files:**
- Create: `packages/backend/src/modules/ntizo/read/notification/app/use-cases/list-notifications.projection.ts`
- Create: `packages/backend/src/modules/ntizo/read/notification/graphql/schema/queries.ts`
- Create: `packages/backend/src/modules/ntizo/read/notification/graphql/handlers/queries.handlers.ts`
- Create: `packages/backend/src/modules/ntizo/read/notification/bootstrap/index.ts`
- Create: `packages/backend/src/modules/ntizo/read/notification/index.ts`
- Modify: `packages/backend/src/modules/ntizo/read/schema.ts`
- Modify: `packages/backend/package.json` (exports map)
- Test: `packages/backend/src/modules/ntizo/read/notification/__tests__/queries.handlers.test.ts`

**Interfaces:**
- Consumes: `NotificationRepositoryPort`, `ProviderMemberReaderPort` (Task 3); `InboxPageDTO`, `UnreadCountDTO` (Task 6).
- Produces:
  - GraphQL fields `notification.mine`, `notification.mineUnreadCount`, `notification.forProvider`, `notification.providerUnreadCount`
  - `bootstrapNotificationRead()`, `createNotificationReadHandlers(mod)`
  - `ListMyNotificationsProjection`, `ListProviderNotificationsProjection`, `CountUnreadProjection`

- [ ] **Step 1: Write the projections**

```ts
// read/notification/app/use-cases/list-notifications.projection.ts
import type { InboxPageDTO, UnreadCountDTO } from "@ntizo/shared/read-models";
import type { NotificationRepositoryPort } from "../../../../bounded-contexts/notification/app/ports/outbound/notification.repository.port";
import type { ProviderMemberReaderPort } from "../../../../bounded-contexts/notification/app/ports/outbound/provider-member-reader.port";
import { NotProviderMemberError } from "../../../../bounded-contexts/notification/domain/exceptions";

/**
 * The default page, and the ceiling.
 *
 * Both live here rather than as zod `.default()` on the field: a zod default
 * does not survive into the GraphQL schema — the argument still emits as
 * `Int!` and every caller has to send it. The clamp is here for the same
 * reason it is here on every other paged query in this codebase: `limit` is
 * caller-controlled and an unbounded one is a way to ask for the whole table.
 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function page(limit: number | undefined, offset: number | undefined) {
  return {
    limit: Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT),
    offset: Math.max(offset ?? 0, 0),
  };
}

export class ListMyNotificationsProjection {
  constructor(private readonly repo: NotificationRepositoryPort) {}

  async execute(input: {
    requesterUserId: string;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<InboxPageDTO> {
    const { limit, offset } = page(input.limit, input.offset);
    return this.repo.listForUser(input.requesterUserId, limit, offset);
  }
}

/**
 * A workspace's inbox, for one of its members.
 *
 * The membership check is here rather than in the repository's statement,
 * unlike `markRead`: this refuses a whole inbox, and returning an empty page to
 * a non-member would tell them the workspace exists and has nothing in it —
 * which is a different lie from "that is not yours to read".
 */
export class ListProviderNotificationsProjection {
  constructor(
    private readonly repo: NotificationRepositoryPort,
    private readonly members: ProviderMemberReaderPort,
  ) {}

  async execute(input: {
    requesterUserId: string;
    providerId: string;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<InboxPageDTO> {
    if (!(await this.members.isMember(input.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError(input.providerId);
    }
    const { limit, offset } = page(input.limit, input.offset);
    return this.repo.listForProvider(input.providerId, input.requesterUserId, limit, offset);
  }
}

/**
 * The badge's number, for whichever inbox is asked about.
 *
 * Its own projection rather than `list().total`: the bell polls this on an
 * interval and has no use for the rows, and fetching twenty of them every
 * thirty seconds to display one integer is the kind of thing that only shows up
 * on somebody else's bill.
 */
export class CountUnreadProjection {
  constructor(
    private readonly repo: NotificationRepositoryPort,
    private readonly members: ProviderMemberReaderPort,
  ) {}

  async forUser(requesterUserId: string): Promise<UnreadCountDTO> {
    return { count: await this.repo.countUnreadForUser(requesterUserId) };
  }

  async forProvider(requesterUserId: string, providerId: string): Promise<UnreadCountDTO> {
    if (!(await this.members.isMember(providerId, requesterUserId))) {
      throw new NotProviderMemberError(providerId);
    }
    return { count: await this.repo.countUnreadForProvider(providerId, requesterUserId) };
  }
}
```

- [ ] **Step 2: Write the GraphQL schema**

```ts
// read/notification/graphql/schema/queries.ts
import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { inboxPageReadModel, unreadCountReadModel } from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * Paging arguments, `optional()` rather than `.default()`.
 *
 * A zod default does not reach the GraphQL schema — the field still emits as
 * `Int!` and every caller has to send it. The real default and the clamp live
 * in the projection. This is follow-up #20's lesson, applied rather than
 * rediscovered.
 */
const paging = {
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
};

/**
 * The caller's own inbox. Takes no user id — it resolves from the session, so
 * there is nothing to tamper with.
 */
export const listMyNotifications = defineQuery({
  input: zodSchema(z.object(paging)),
  output: zodSchema(inboxPageReadModel),
  docs: { summary: "Your own notifications", tags: ["Notification"] },
});

export const countMyUnreadNotifications = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(unreadCountReadModel),
  docs: { summary: "How many of your notifications are unread", tags: ["Notification"] },
});

export const listProviderNotifications = defineQuery({
  input: zodSchema(z.object({ providerId: z.string().min(1), ...paging })),
  output: zodSchema(inboxPageReadModel),
  docs: { summary: "A workspace's notifications", tags: ["Notification"] },
});

export const countProviderUnreadNotifications = defineQuery({
  input: zodSchema(z.object({ providerId: z.string().min(1) })),
  output: zodSchema(unreadCountReadModel),
  docs: { summary: "How many of a workspace's notifications you have not read", tags: ["Notification"] },
});

export const notificationReadSchema = defineGraphQLSchema(
  {
    notification: {
      mine: listMyNotifications,
      mineUnreadCount: countMyUnreadNotifications,
      forProvider: listProviderNotifications,
      providerUnreadCount: countProviderUnreadNotifications,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
```

- [ ] **Step 3: Write the handlers**

```ts
// read/notification/graphql/handlers/queries.handlers.ts
import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { NotificationReadBootstrap } from "../../bootstrap";
import { notificationReadSchema } from "../schema/queries";

export interface NotificationReadModule {
  readonly notificationRead: NotificationReadBootstrap;
}

/**
 * Both inboxes are somebody's, so every field here refuses an anonymous caller
 * before anything else runs. Copied rather than imported from the scheduling
 * read tier — tiers do not import each other here, and six lines is not worth a
 * shared helper.
 */
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({
      message: "Sign in to see your notifications",
      code: "UNAUTHENTICATED",
    });
  }
  return requesterUserId;
}

export function createNotificationReadHandlers(mod: NotificationReadModule) {
  const uc = mod.notificationRead.useCases;

  return graphqlRoutes(notificationReadSchema)
    .handle("notification.mine", async (args, ctx) =>
      uc.listMine.execute({
        requesterUserId: requireUser(ctx),
        limit: args.input.limit,
        offset: args.input.offset,
      }),
    )
    .handle("notification.mineUnreadCount", async (_args, ctx) =>
      uc.countUnread.forUser(requireUser(ctx)),
    )
    .handle("notification.forProvider", async (args, ctx) =>
      uc.listForProvider.execute({
        requesterUserId: requireUser(ctx),
        providerId: args.input.providerId,
        limit: args.input.limit,
        offset: args.input.offset,
      }),
    )
    .handle("notification.providerUnreadCount", async (args, ctx) =>
      uc.countUnread.forProvider(requireUser(ctx), args.input.providerId),
    )
    .build();
}
```

- [ ] **Step 4: Write the bootstrap and barrel**

```ts
// read/notification/bootstrap/index.ts
import { DrizzleNotificationRepository } from "../../../bounded-contexts/notification/infrastructure/repositories/drizzle/notification.repository";
import { DrizzleProviderMemberReader } from "../../../bounded-contexts/notification/infrastructure/outbound-adapters/cross-bc/provider-member-reader.adapter";
import {
  CountUnreadProjection,
  ListMyNotificationsProjection,
  ListProviderNotificationsProjection,
} from "../app/use-cases/list-notifications.projection";

/**
 * The read tier bootstraps its own repository rather than sharing the write
 * tier's. That is the rule this architecture is built on: the read side is
 * fully independent, with its own adapters, so the two can diverge without
 * either noticing. They happen to be the same class today; that is a
 * coincidence, not a contract.
 */
export function bootstrapNotificationRead() {
  const repo = new DrizzleNotificationRepository();
  const members = new DrizzleProviderMemberReader();

  return {
    adapters: { repo, members },
    useCases: {
      listMine: new ListMyNotificationsProjection(repo),
      listForProvider: new ListProviderNotificationsProjection(repo, members),
      countUnread: new CountUnreadProjection(repo, members),
    },
  };
}

export type NotificationReadBootstrap = ReturnType<typeof bootstrapNotificationRead>;
```

```ts
// read/notification/index.ts
export { bootstrapNotificationRead, type NotificationReadBootstrap } from "./bootstrap";
export { createNotificationReadHandlers } from "./graphql/handlers/queries.handlers";
```

Add to `read/schema.ts`:

```ts
import { notificationReadSchema } from "./notification/graphql/schema/queries";
// ...and inside mergeGraphQLSchemas(...): notificationReadSchema,
```

Add to `packages/backend/package.json` `exports`:

```json
"./modules/ntizo/read/notification": "./src/modules/ntizo/read/notification/index.ts",
```

- [ ] **Step 5: Write the handler test**

```ts
// read/notification/__tests__/queries.handlers.test.ts
import { describe, expect, it } from "bun:test";
import { notificationReadSchema } from "../graphql/schema/queries";

describe("the notification read schema", () => {
  it("exposes exactly the four fields the frontend needs, and no more", () => {
    const fields = Object.keys(
      (notificationReadSchema as unknown as { fields: { notification: object } }).fields
        .notification,
    ).sort();
    expect(fields).toEqual([
      "forProvider",
      "mine",
      "mineUnreadCount",
      "providerUnreadCount",
    ]);
  });

  it("takes no user id on the personal fields — the session is the answer", () => {
    // A `userId` argument here would be the whole authorization model, undone.
    const src = Bun.file(
      new URL("../graphql/schema/queries.ts", import.meta.url).pathname,
    );
    return src.text().then((text) => {
      const mineBlock = text.slice(
        text.indexOf("export const listMyNotifications"),
        text.indexOf("export const countMyUnreadNotifications"),
      );
      expect(mineBlock).not.toContain("userId");
    });
  });
});
```

- [ ] **Step 6: Run and typecheck**

```bash
cd packages/backend && bun test src/modules/ntizo/read/notification && bun run typecheck
```

Expected: PASS, 2 tests; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/read/notification \
        packages/backend/src/modules/ntizo/read/schema.ts \
        packages/backend/package.json
git commit -m "feat(notification): the read tier, four queries

Two inboxes, each with a page and a count. The count is its own query
rather than list().total: the bell polls it on an interval and has no use
for the rows, and fetching twenty of them every thirty seconds to draw
one integer is the kind of thing that shows up on somebody else's bill.

The personal fields take no user id. It resolves from the session, so
there is nothing to tamper with — which is a stronger guarantee than
checking an argument against the session and refusing a mismatch.

Paging arguments are optional() rather than zod .default(), because a
zod default does not reach the GraphQL schema; the field still emits as
Int! and every caller has to send it. The default and the clamp live in
the projection. Follow-up #20's lesson, applied rather than rediscovered.

The read tier bootstraps its own repository rather than sharing the write
tier's. Same class today, and that is a coincidence rather than a
contract."
```

---

## Task 8: The write tier

**Files:**
- Create: `packages/backend/src/modules/ntizo/write/notification/graphql/schema/mutations.ts`
- Create: `packages/backend/src/modules/ntizo/write/notification/graphql/handlers/mutations.handlers.ts`
- Create: `packages/backend/src/modules/ntizo/write/notification/index.ts`
- Modify: `packages/backend/src/modules/ntizo/write/schema.ts`
- Modify: `packages/backend/package.json` (exports map)
- Test: `packages/backend/src/modules/ntizo/write/notification/__tests__/mutations.test.ts`

**Interfaces:**
- Consumes: `NotificationBootstrap` (Task 5).
- Produces: mutations `notification.markRead`, `notification.markAllRead`, `notification.markProviderRead`, `notification.markAllProviderRead`; `createNotificationWriteHandlers(mod)`.

- [ ] **Step 1: Write the mutations schema**

```ts
// write/notification/graphql/schema/mutations.ts
import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * Four mutations, not one with nullable arguments.
 *
 * Marking one item read and marking an inbox read are different intentions,
 * and a single `markRead(id?, providerId?, all?)` makes every audit of who
 * dismissed what unreadable — you cannot tell from the field name what
 * happened. The same four doazores exposes.
 */
export const markNotificationRead = defineMutation({
  input: zodSchema(z.object({ notificationId: z.string().min(1) })),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Mark one of your notifications read", tags: ["Notification"] },
});

export const markAllNotificationsRead = defineMutation({
  input: zodSchema(z.object({})),
  output: zodSchema(z.object({ marked: z.number().int() })),
  docs: { summary: "Mark your whole inbox read", tags: ["Notification"] },
});

export const markProviderNotificationRead = defineMutation({
  input: zodSchema(z.object({ notificationId: z.string().min(1) })),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Mark one workspace notification read", tags: ["Notification"] },
});

/**
 * `providerId` is required here and absent from `markAllNotificationsRead`.
 * That is what distinguishes the two inboxes; there is no "all of everything".
 */
export const markAllProviderNotificationsRead = defineMutation({
  input: zodSchema(z.object({ providerId: z.string().min(1) })),
  output: zodSchema(z.object({ marked: z.number().int() })),
  docs: { summary: "Mark a workspace's inbox read, for you", tags: ["Notification"] },
});

export const notificationWriteSchema = defineGraphQLSchema(
  {
    notification: {
      markRead: markNotificationRead,
      markAllRead: markAllNotificationsRead,
      markProviderRead: markProviderNotificationRead,
      markAllProviderRead: markAllProviderNotificationsRead,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
```

- [ ] **Step 2: Write the handlers**

```ts
// write/notification/graphql/handlers/mutations.handlers.ts
import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { NotificationBootstrap } from "../../../../bounded-contexts/notification/bootstrap";
import { notificationWriteSchema } from "../schema/mutations";

export interface NotificationWriteModule {
  readonly notification: NotificationBootstrap;
}

function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({ message: "Sign in first", code: "UNAUTHENTICATED" });
  }
  return requesterUserId;
}

/**
 * `markRead` and `markProviderRead` call the same command.
 *
 * Not an oversight: entitlement for a single item is resolved inside the
 * repository's statement, which accepts both a personally-addressed item and
 * one belonging to a workspace the caller is a member of. The two fields exist
 * because the *client* knows which inbox it is in and the audit should say so,
 * not because the server needs to be told.
 */
export function createNotificationWriteHandlers(mod: NotificationWriteModule) {
  const uc = mod.notification.useCases;

  return graphqlRoutes(notificationWriteSchema)
    .handle("notification.markRead", async (args, ctx) =>
      uc.markNotificationRead.execute({
        requesterUserId: requireUser(ctx),
        notificationId: args.input.notificationId,
      }),
    )
    .handle("notification.markAllRead", async (_args, ctx) =>
      uc.markAllNotificationsRead.execute({ requesterUserId: requireUser(ctx) }),
    )
    .handle("notification.markProviderRead", async (args, ctx) =>
      uc.markNotificationRead.execute({
        requesterUserId: requireUser(ctx),
        notificationId: args.input.notificationId,
      }),
    )
    .handle("notification.markAllProviderRead", async (args, ctx) =>
      uc.markAllNotificationsRead.execute({
        requesterUserId: requireUser(ctx),
        providerId: args.input.providerId,
      }),
    )
    .build();
}
```

```ts
// write/notification/index.ts
export { createNotificationWriteHandlers } from "./graphql/handlers/mutations.handlers";
```

Add `notificationWriteSchema` to `write/schema.ts`'s import list and `mergeGraphQLSchemas(...)` call, and add to `packages/backend/package.json` `exports`:

```json
"./modules/ntizo/write/notification": "./src/modules/ntizo/write/notification/index.ts",
```

- [ ] **Step 3: Write the schema test**

```ts
// write/notification/__tests__/mutations.test.ts
import { describe, expect, it } from "bun:test";
import { notificationWriteSchema } from "../graphql/schema/mutations";

describe("the notification write schema", () => {
  it("exposes four separately-named intentions", () => {
    const fields = Object.keys(
      (notificationWriteSchema as unknown as { fields: { notification: object } }).fields
        .notification,
    ).sort();
    expect(fields).toEqual(["markAllProviderRead", "markAllRead", "markProviderRead", "markRead"]);
  });
});
```

- [ ] **Step 4: Run, and verify the read/write segregation gate still passes**

```bash
cd packages/backend && bun test src/modules/ntizo && bun run typecheck
```

Expected: PASS. The `fitness-tier-segregation` test asserts `read/` holds queries only and `write/` mutations only — if it fails, a field was defined in the wrong tier.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/write/notification \
        packages/backend/src/modules/ntizo/write/schema.ts \
        packages/backend/package.json
git commit -m "feat(notification): the write tier, four intentions

Four mutations rather than one with nullable arguments. Marking one item
read and marking an inbox read are different things, and a single
markRead(id?, providerId?, all?) makes any audit of who dismissed what
unreadable — the field name stops saying what happened.

markRead and markProviderRead deliberately call the same command:
entitlement for a single item is resolved inside the repository's
statement, which already accepts both a personally-addressed item and one
belonging to a workspace the caller is a member of. The two fields exist
because the client knows which inbox it is in and the audit should say
so, not because the server needs telling."
```

---

## Task 9: The in-process event router

**Files:**
- Create: `packages/backend/src/shared/infrastructure/events/event-router.ts`
- Create: `packages/backend/src/shared/infrastructure/events/index.ts`
- Modify: `packages/backend/package.json` (exports map)
- Test: `packages/backend/src/shared/infrastructure/events/__tests__/event-router.test.ts`

**Interfaces:**
- Consumes: `BaseDomainEvent` from `@cosmneo/onion-lasagna`.
- Produces:
  - `type DomainEventHandler = (event: BaseDomainEvent) => Promise<void>`
  - `class EventRouter { on(eventName: string, handler: DomainEventHandler): void; dispatch(events: BaseDomainEvent[]): Promise<void> }`
  - `getEventRouter(): EventRouter` — the process-wide instance
  - `dispatchAfterCommit(events: BaseDomainEvent[]): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { EventRouter } from "../event-router";

function evt(name: string): { eventName: string; occurredOn: Date } {
  return { eventName: name, occurredOn: new Date() };
}

let router: EventRouter;
beforeEach(() => {
  router = new EventRouter();
});

describe("EventRouter", () => {
  it("calls the handler registered for an event", async () => {
    const seen: string[] = [];
    router.on("provider.created", async () => void seen.push("hit"));
    await router.dispatch([evt("provider.created") as never]);
    expect(seen).toEqual(["hit"]);
  });

  it("ignores an event nobody listens for", async () => {
    await router.dispatch([evt("provider.updated") as never]);
    // No throw is the assertion: most events have no notification, and an
    // unhandled one must not be an error.
    expect(true).toBe(true);
  });

  it("runs every handler registered for the same event", async () => {
    const seen: string[] = [];
    router.on("provider.created", async () => void seen.push("a"));
    router.on("provider.created", async () => void seen.push("b"));
    await router.dispatch([evt("provider.created") as never]);
    expect(seen.sort()).toEqual(["a", "b"]);
  });

  it("a handler that throws does not stop its siblings", async () => {
    const seen: string[] = [];
    router.on("provider.created", async () => {
      throw new Error("boom");
    });
    router.on("provider.created", async () => void seen.push("survived"));
    await router.dispatch([evt("provider.created") as never]);
    expect(seen).toEqual(["survived"]);
  });

  it("a handler that throws does not reject the dispatch", async () => {
    router.on("provider.created", async () => {
      throw new Error("boom");
    });
    // The write has already committed. Turning a successful approval into a
    // failure because a notification could not be written is the worse outcome.
    await expect(router.dispatch([evt("provider.created") as never])).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/backend && bun test src/shared/infrastructure/events
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the router**

```ts
// shared/infrastructure/events/event-router.ts
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { getLogger } from "../logger";

export type DomainEventHandler = (event: BaseDomainEvent) => Promise<void>;

/**
 * In-process fan-out from a domain event to whatever reacts to it.
 *
 * **This is not the outbox relay, and does not pretend to be.** The outbox row
 * is still written inside the producing transaction and is still nobody's
 * input; this router runs after that transaction commits and calls handlers
 * directly. The consequence, stated once: if the isolate dies between the
 * commit and the dispatch, the handler never runs. The outbox row survives, so
 * a real relay can replay it later — which is what makes this choice
 * reversible rather than merely cheap. See follow-up #8.
 *
 * doazores does this with Cloudflare Queues and a cron sweep. Ntizo's
 * `wrangler.jsonc` declares neither, and a deployed Worker cannot reach
 * Postgres at all yet, so a queue-backed relay is infrastructure that could not
 * run if it were written.
 *
 * **A handler never fails its caller.** By the time this runs the write has
 * committed and the response may already have been sent; throwing would turn a
 * successful provider approval into a 500 over an inbox row. Handlers are
 * isolated from each other for the same reason — one bad template must not
 * silence the other three notifications an event produces.
 */
export class EventRouter {
  private readonly handlers = new Map<string, DomainEventHandler[]>();

  on(eventName: string, handler: DomainEventHandler): void {
    const existing = this.handlers.get(eventName);
    if (existing) existing.push(handler);
    else this.handlers.set(eventName, [handler]);
  }

  async dispatch(events: BaseDomainEvent[]): Promise<void> {
    for (const event of events) {
      const handlers = this.handlers.get(event.eventName);
      // Most events have no notification. An unhandled one is the normal case,
      // not a misconfiguration, so it is silent rather than logged.
      if (!handlers) continue;

      await Promise.all(
        handlers.map(async (handle) => {
          try {
            await handle(event);
          } catch (error) {
            getLogger().error("[events] handler failed", {
              eventName: event.eventName,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }),
      );
    }
  }
}

/**
 * One router for the isolate.
 *
 * Module scope rather than request scope: handlers are wired once at bootstrap
 * and are stateless, and rebuilding the registry per request would mean every
 * producer needing a handle on it. Registration is idempotent in practice
 * because `bootstrap.ts` runs once per isolate.
 */
let router: EventRouter | undefined;

export function getEventRouter(): EventRouter {
  if (!router) router = new EventRouter();
  return router;
}

/** Testing seam. Never call this from application code. */
export function __resetEventRouterForTests(): void {
  router = undefined;
}
```

```ts
// shared/infrastructure/events/index.ts
export {
  EventRouter,
  getEventRouter,
  __resetEventRouterForTests,
  type DomainEventHandler,
} from "./event-router";
```

Add to `packages/backend/package.json` `exports`:

```json
"./shared/infra/events": "./src/shared/infrastructure/events/index.ts",
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd packages/backend && bun test src/shared/infrastructure/events
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Break-check the isolation**

Remove the `try`/`catch` inside `dispatch` and re-run. Both "does not stop its siblings" and "does not reject the dispatch" must fail. Restore it.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/shared/infrastructure/events packages/backend/package.json
git commit -m "feat(events): an in-process router for what happens after a commit

Not the outbox relay, and it does not pretend to be. The outbox row is
still written inside the producing transaction and is still nobody's
input; this runs after that transaction commits and calls handlers
directly. If the isolate dies in between, the handler never runs — the
row survives, so a real relay can replay it later, which is what makes
this reversible rather than merely cheap. Follow-up #8 keeps its trigger.

doazores does this with Cloudflare Queues and a cron sweep. Ntizo's
wrangler config declares neither and a deployed Worker cannot reach
Postgres yet, so a queue-backed relay is infrastructure that could not
run if it were written today.

A handler never fails its caller. By the time this runs the write has
committed and the response may already be gone; throwing would turn a
successful provider approval into a 500 over an inbox row. Handlers are
isolated from each other too — one bad handler must not silence the
others the same event feeds. Break-checked by removing the catch."
```

---

## Task 10: The provider event handlers

**Files:**
- Create: `packages/backend/src/modules/ntizo/write/notification/events/handlers/provider.event-handlers.ts`
- Create: `packages/backend/src/modules/ntizo/write/notification/events/index.ts`
- Modify: `packages/backend/src/modules/ntizo/write/notification/index.ts`
- Test: `packages/backend/src/modules/ntizo/write/notification/__tests__/provider.event-handlers.test.ts`

**Interfaces:**
- Consumes: `EventRouter` (Task 9); `RaiseNotificationInternalCommand` (Task 5).
- Produces: `registerProviderNotificationHandlers(router, deps)` where `deps = { raiseNotification: RaiseNotificationInternalCommand }`.

**Background — the exact event payload shapes.** Read these three classes before writing the handler; the field names below are what the events actually carry, not a guess:
`bounded-contexts/provider/domain/events/index.ts` — `ProviderCreated`, `ProviderStatusDecided`, `ProviderInviteSent`.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { EventRouter } from "../../../../../shared/infrastructure/events/event-router";
import type { RaiseNotificationInput } from "../../../bounded-contexts/notification/app/use-cases/raise-notification.internal.command";
import { registerProviderNotificationHandlers } from "../events/handlers/provider.event-handlers";

class SpyRaise {
  calls: RaiseNotificationInput[] = [];
  async execute(input: RaiseNotificationInput) {
    this.calls.push(input);
    return { notificationId: `n${this.calls.length}` };
  }
}

let router: EventRouter;
let raise: SpyRaise;

beforeEach(() => {
  router = new EventRouter();
  raise = new SpyRaise();
  registerProviderNotificationHandlers(router, { raiseNotification: raise as never });
});

describe("provider.created", () => {
  it("welcomes the workspace, not the person who made it", async () => {
    await router.dispatch([
      {
        eventName: "provider.created",
        occurredOn: new Date(),
        providerId: "p1",
        name: "Salão X",
      } as never,
    ]);

    expect(raise.calls).toHaveLength(1);
    expect(raise.calls[0]).toMatchObject({
      type: NotificationType.ProviderWorkspaceWelcome,
      audience: "provider",
      providerId: "p1",
    });
  });

  it("snapshots the name, so a later rename cannot rewrite the inbox", async () => {
    await router.dispatch([
      { eventName: "provider.created", occurredOn: new Date(), providerId: "p1", name: "Salão X" } as never,
    ]);
    expect(raise.calls[0]!.payload).toEqual({ providerName: "Salão X" });
  });
});

describe("provider.status.decided", () => {
  it("raises ProviderVerified when the decision is active", async () => {
    await router.dispatch([
      {
        eventName: "provider.status.decided",
        occurredOn: new Date(),
        providerId: "p1",
        from: "pending",
        to: "active",
      } as never,
    ]);
    expect(raise.calls[0]).toMatchObject({
      type: NotificationType.ProviderVerified,
      audience: "provider",
      providerId: "p1",
    });
  });

  it("raises ProviderDocumentsRequired when the decision is rejected", async () => {
    await router.dispatch([
      {
        eventName: "provider.status.decided",
        occurredOn: new Date(),
        providerId: "p1",
        from: "pending",
        to: "rejected",
      } as never,
    ]);
    expect(raise.calls[0]!.type).toBe(NotificationType.ProviderDocumentsRequired);
  });

  it("says nothing about a decision that is neither", async () => {
    // A provider moved back to `pending` has not been told anything worth an
    // inbox row, and inventing one would be the platform narrating its own
    // bookkeeping at somebody who is waiting.
    await router.dispatch([
      {
        eventName: "provider.status.decided",
        occurredOn: new Date(),
        providerId: "p1",
        from: "active",
        to: "pending",
      } as never,
    ]);
    expect(raise.calls).toHaveLength(0);
  });
});

describe("provider.invite.sent", () => {
  it("addresses the invitee personally when they already have an account", async () => {
    await router.dispatch([
      {
        eventName: "provider.invite.sent",
        occurredOn: new Date(),
        providerId: "p1",
        email: "colega@ntizo.test",
        role: "staff",
        invitedUserId: "u9",
      } as never,
    ]);
    expect(raise.calls[0]).toMatchObject({
      type: NotificationType.TeamInvitation,
      audience: "user",
      userId: "u9",
    });
  });

  it("raises nothing when the invitee has no account", async () => {
    // There is no inbox to address. They get an email, which is Phase 2's job,
    // and an inbox row keyed to nobody is not a substitute for one.
    await router.dispatch([
      {
        eventName: "provider.invite.sent",
        occurredOn: new Date(),
        providerId: "p1",
        email: "stranger@ntizo.test",
        role: "staff",
        invitedUserId: null,
      } as never,
    ]);
    expect(raise.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/backend && bun test src/modules/ntizo/write/notification
```

Expected: FAIL — the handlers module does not exist.

- [ ] **Step 3: Write the handlers**

```ts
// write/notification/events/handlers/provider.event-handlers.ts
import { NotificationType } from "@ntizo/shared";
import type { EventRouter } from "../../../../../shared/infrastructure/events/event-router";
import type { RaiseNotificationInternalCommand } from "../../../../bounded-contexts/notification/app/use-cases/raise-notification.internal.command";

export interface ProviderNotificationDeps {
  readonly raiseNotification: RaiseNotificationInternalCommand;
}

/**
 * What the Provider context's events mean to somebody's inbox.
 *
 * One function per event, registered rather than imported by the producer: the
 * Provider context publishes and does not know who listens, which is the whole
 * reason this is a router and not a call.
 *
 * **Every payload is a snapshot.** The name goes into the row now, so "Salão X
 * has been verified" still says X after X is renamed. Reading it back at render
 * time would tie every inbox row to the lifetime of the business it mentions.
 *
 * Three of Provider's ten events produce a notification. The other seven —
 * `updated`, `deactivated`, `member.added`, `member.removed`,
 * `invite.accepted`, `invite.declined`, `invite.revoked` — are silent on
 * purpose: they are bookkeeping, and an inbox that narrates every state change
 * is one people learn to ignore. Add one when somebody asks for it, not
 * because the event exists.
 */
export function registerProviderNotificationHandlers(
  router: EventRouter,
  deps: ProviderNotificationDeps,
): void {
  router.on("provider.created", async (event) => {
    const e = event as unknown as { providerId: string; name: string };
    await deps.raiseNotification.execute({
      type: NotificationType.ProviderWorkspaceWelcome,
      audience: "provider",
      providerId: e.providerId,
      payload: { providerName: e.name },
    });
  });

  router.on("provider.status.decided", async (event) => {
    const e = event as unknown as { providerId: string; from: string; to: string };

    // Only the two decisions a provider is waiting on. A move back to `pending`
    // is the platform narrating its own bookkeeping at somebody who is already
    // waiting, and `deactivated` has its own event.
    const type =
      e.to === "active"
        ? NotificationType.ProviderVerified
        : e.to === "rejected"
          ? NotificationType.ProviderDocumentsRequired
          : null;
    if (type === null) return;

    await deps.raiseNotification.execute({
      type,
      audience: "provider",
      providerId: e.providerId,
      payload: { from: e.from, to: e.to },
    });
  });

  router.on("provider.invite.sent", async (event) => {
    const e = event as unknown as {
      providerId: string;
      email: string;
      role: string;
      invitedUserId: string | null;
    };

    // An invitee who has no account has no inbox to address. They get an email
    // — Phase 2's job — and a row keyed to nobody is not a substitute for one.
    // This is the case that made `notification_delivery.notification_id`
    // nullable in the spec: a delivery can exist without an inbox item.
    if (!e.invitedUserId) return;

    await deps.raiseNotification.execute({
      type: NotificationType.TeamInvitation,
      audience: "user",
      userId: e.invitedUserId,
      payload: { providerId: e.providerId, role: e.role },
    });
  });
}
```

```ts
// write/notification/events/index.ts
export {
  registerProviderNotificationHandlers,
  type ProviderNotificationDeps,
} from "./handlers/provider.event-handlers";
```

Re-export from `write/notification/index.ts`:

```ts
export { registerProviderNotificationHandlers } from "./events";
```

- [ ] **Step 4: Verify the event field names against the real classes**

```bash
cd packages/backend && cat src/modules/ntizo/bounded-contexts/provider/domain/events/index.ts
```

The handler's `as unknown as { ... }` casts must match the actual constructor properties. **If `provider.invite.sent` does not carry `invitedUserId`, stop and add it** — the invite command knows whether the email matches an existing user because it has to decide what link to send, so the field is available at the point the event is built. Adjust the test's fixtures to match reality rather than adjusting reality to match the test.

- [ ] **Step 5: Run to verify it passes**

```bash
cd packages/backend && bun test src/modules/ntizo/write/notification
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Break-check the two guards**

Remove `if (type === null) return;` and re-run — "says nothing about a decision that is neither" must fail. Remove `if (!e.invitedUserId) return;` and re-run — "raises nothing when the invitee has no account" must fail. Restore both.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/write/notification
git commit -m "feat(notification): what the provider's events mean to an inbox

Three of Provider's ten events produce a notification: created, status
decided, invite sent. The other seven are silent on purpose — they are
bookkeeping, and an inbox that narrates every state change is one people
learn to ignore. Add one when somebody asks, not because the event exists.

status.decided only speaks for 'active' and 'rejected'. A move back to
pending is the platform narrating its own process at somebody who is
already waiting.

invite.sent raises nothing when the invitee has no account: there is no
inbox to address. They get an email, which is Phase 2, and a row keyed to
nobody is not a substitute. This is the case that made a delivery
separable from a notification in the spec.

Every payload is a snapshot. The name goes in now, so the row still says
'Salão X' after Salão X is renamed."
```

---

## Task 11: User BC events, and wiring the router

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/user/domain/events/index.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/user/domain/aggregates/user.aggregate.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/user/app/use-cases/create-user-on-sign-up.internal.command.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/user/bootstrap/` (inject the outbox port)
- Create: `packages/backend/src/modules/ntizo/write/notification/events/handlers/user.event-handlers.ts`
- Modify: `apps/backend/api/src/api.ts` and `apps/backend/api/src/graphql/private.ts` (register handlers, dispatch after commit)
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/user/app/use-cases/__tests__/create-user-on-sign-up.internal.command.test.ts` (extend)

**Interfaces:**
- Consumes: `OutboxPort`; `EventRouter` (Task 9); `RaiseNotificationInternalCommand` (Task 5).
- Produces: `UserRegistered` event (`eventName: "user.registered"`, fields `userId`, `email`, `firstName`); `User.recordEvent()`, `User.pullEvents()`; `registerUserNotificationHandlers(router, deps)`.

- [ ] **Step 1: Write the failing test**

Extend the existing command test:

```ts
it("publishes user.registered so somebody can welcome them", async () => {
  const published: Array<{ eventName: string }> = [];
  const outbox = {
    publish: async (events: Array<{ eventName: string }>) => void published.push(...events),
  };

  const cmd = new CreateUserOnSignUpInternalCommand(userRepo, profileRepo, unitOfWork, outbox as never);
  await cmd.execute({ userId: "u1", email: "ana@ntizo.test", firstName: "Ana", lastName: "S" });

  expect(published.map((e) => e.eventName)).toEqual(["user.registered"]);
});

it("publishes nothing on a retry, because the command already returned early", async () => {
  const published: Array<{ eventName: string }> = [];
  const outbox = {
    publish: async (events: Array<{ eventName: string }>) => void published.push(...events),
  };
  userRepo.seed({ id: "u1" }); // the user already exists

  const cmd = new CreateUserOnSignUpInternalCommand(userRepo, profileRepo, unitOfWork, outbox as never);
  await cmd.execute({ userId: "u1", email: "ana@ntizo.test", firstName: "Ana", lastName: "S" });

  // Idempotency has to cover the event too. A second welcome for one
  // registration is the failure mode a retry is supposed to prevent.
  expect(published).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/user
```

Expected: FAIL — the command takes three constructor arguments, not four.

- [ ] **Step 3: Write the event**

```ts
// bounded-contexts/user/domain/events/index.ts
import { BaseDomainEvent } from "@cosmneo/onion-lasagna";

/**
 * Somebody finished signing up.
 *
 * The User context's first domain event — it had no event-recording machinery
 * at all, which is follow-up #10 and why `Welcome` had no producer. Carries the
 * first name because the notification that reacts to it greets somebody by it,
 * and a handler that had to go and look it up would couple an inbox row to a
 * profile that can be edited a minute later.
 *
 * `ProfileUpgradedToProvider`, #10's other half, is deliberately not here.
 * Nothing listens for it, and an event with no listener is how dead surface
 * starts.
 */
export class UserRegistered extends BaseDomainEvent {
  static readonly eventName = "user.registered";

  constructor(
    readonly props: { userId: string; email: string; firstName: string | null },
  ) {
    super();
  }

  get eventName(): string {
    return UserRegistered.eventName;
  }
}
```

**Before writing this, read `bounded-contexts/provider/domain/events/index.ts`** and copy its exact base-class shape — whether it extends `BaseDomainEvent`, how `eventName` is exposed, and how the aggregate id is carried. The snippet above is the intent; that file is the contract.

- [ ] **Step 4: Add the event machinery to the aggregate**

In `user.aggregate.ts`, mirroring `provider.aggregate.ts` exactly:

```ts
// add to the class body, after the getters
private readonly _events: BaseDomainEvent[] = [];

recordEvent(event: BaseDomainEvent): void {
  this._events.push(event);
}

pullEvents(): BaseDomainEvent[] {
  const events = [...this._events];
  this._events.length = 0;
  return events;
}
```

And in `User.create`, record the event before returning:

```ts
const user = new User({ /* ...as today... */ });
user.recordEvent(
  new UserRegistered({ id: params.id, email: params.email, firstName: params.firstName ?? null }),
);
return user;
```

`User.create` will need `firstName` passed through — it is already available at the call site in `CreateUserOnSignUpInternalCommand`.

**`rehydrate` must not record anything.** Loading a user from the database is not a registration, and an event recorded there would welcome somebody every time their row was read.

- [ ] **Step 5: Publish from the command**

In `create-user-on-sign-up.internal.command.ts`, add `private readonly outboxPort: OutboxPort` as a fourth constructor argument and publish inside the existing `atomicExecute`, after `userRepo.save(user)`:

```ts
await this.outboxPort.publish(user.pullEvents(), "user");
```

Inside the transaction, exactly as every Provider command does — the outbox insert and the user row commit or roll back together. The early return for an existing user is above `atomicExecute`, so a retry publishes nothing without any extra guard.

Update `bounded-contexts/user/bootstrap/` to construct the outbox adapter and pass it, copying how `provider/bootstrap/adapters.bootstrap.ts` does it.

- [ ] **Step 6: Write the user handler**

```ts
// write/notification/events/handlers/user.event-handlers.ts
import { NotificationType } from "@ntizo/shared";
import type { EventRouter } from "../../../../../shared/infrastructure/events/event-router";
import type { RaiseNotificationInternalCommand } from "../../../../bounded-contexts/notification/app/use-cases/raise-notification.internal.command";

export function registerUserNotificationHandlers(
  router: EventRouter,
  deps: { raiseNotification: RaiseNotificationInternalCommand },
): void {
  router.on("user.registered", async (event) => {
    const e = event as unknown as { userId: string; firstName: string | null };
    await deps.raiseNotification.execute({
      type: NotificationType.Welcome,
      audience: "user",
      userId: e.userId,
      payload: { firstName: e.firstName },
    });
  });
}
```

- [ ] **Step 7: Wire the router at the app layer**

In `apps/backend/api/src/api.ts`, after `const userBootstrap = bootstrapUser();`:

```ts
// The registry is wired here, at the app layer, for the same reason every
// adapter choice is: this is the only place allowed to know that the Provider
// and User contexts produce events the Notification context reacts to. Neither
// producing context imports the consumer.
const notification = bootstrapNotification();
const eventRouter = getEventRouter();
registerProviderNotificationHandlers(eventRouter, {
  raiseNotification: notification.useCases.internal.raiseNotification,
});
registerUserNotificationHandlers(eventRouter, {
  raiseNotification: notification.useCases.internal.raiseNotification,
});
```

Then make the outbox adapter dispatch after commit. In `packages/backend/src/shared/infrastructure/outbox/outbox.adapter.ts`'s `publish`, after the repository write:

```ts
// The events reach their handlers only once this transaction commits. Inside
// it, a handler would act on a write that can still roll back — and an inbox
// row about something that did not happen cannot be recalled.
await runAfterCommit(async () => {
  await getEventRouter().dispatch(events);
});
```

`runAfterCommit` already falls back to running the callback immediately when there is no active transaction, so a publish outside one still dispatches.

- [ ] **Step 8: Run everything**

```bash
cd packages/backend && bun test src && bun run typecheck
```

Expected: PASS across the whole package; typecheck clean. Then from the repo root:

```bash
bun run test && bun run lint && bun run check-types
```

- [ ] **Step 9: Verify end to end against the running API**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd apps/backend/api && bun run dev
```

In another shell, sign a user up and confirm a row appears:

```bash
curl -s -X POST http://localhost:8788/api/auth/sign-up/email \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -d '{"email":"welcome-test@ntizo.test","password":"Password123!","name":"Ana"}'
```

```bash
cd packages/backend && bun -e '
import postgres from "postgres";
const url = process.env["DEV_DB_URL"]!;
const sql = postgres(url, { max: 1 });
const rows = await sql`SELECT type, audience, payload FROM ntizo_notification.notification ORDER BY created_at DESC LIMIT 5`;
console.log(rows);
await sql.end();
'
```

Expected: a `WELCOME` row addressed to the new user. If the table is empty, the dispatch is not firing — check that `runAfterCommit` is reached and that `bootstrap.ts`'s registration runs before the first request.

- [ ] **Step 10: Commit**

```bash
git add packages/backend apps/backend/api/src
git commit -m "feat(notification): the User BC's first event, and the wiring

User had no event-recording machinery at all — follow-up #10, and the
reason Welcome had no producer. It gets \`_events\`, recordEvent and
pullEvents copied from the Provider aggregate, a UserRegistered event,
and a publish inside the atomicExecute the sign-up command already opens.
Idempotency covers the event for free: the early return for an existing
user sits above the transaction, so a retry publishes nothing.

rehydrate records nothing. Loading a user from the database is not a
registration, and an event there would welcome somebody every time their
row was read.

ProfileUpgradedToProvider, #10's other half, stays out: nothing listens
for it.

The router is wired at the app layer, where every other adapter choice is
made. Neither producing context imports the consumer — they publish and
do not know who is listening, which is the whole reason this is a router
and not a call. runAfterCommit is finally the caller follow-up #9 was
waiting for."
```

---

## Task 12: Frontend — domain, data, viewmodel

**Files:**
- Create: `apps/frontend/web/src/features/notifications/domain/inbox-groups.ts`
- Create: `apps/frontend/web/src/features/notifications/domain/notification-presentation.ts`
- Create: `apps/frontend/web/src/features/notifications/data/notifications.repository.ts`
- Create: `apps/frontend/web/src/features/notifications/viewmodel/use-inbox.ts`
- Create: `apps/frontend/web/src/features/notifications/viewmodel/use-unread-count.ts`
- Create: `apps/frontend/web/src/features/notifications/viewmodel/use-mark-read.ts`
- Test: `apps/frontend/web/src/features/notifications/domain/__tests__/inbox-groups.test.ts`

**Interfaces:**
- Consumes: `NotificationDTO`, `InboxPageDTO` (Task 6); the four GraphQL fields (Tasks 7–8).
- Produces:
  - `groupByDay(items, todayIso): InboxGroup[]` where `InboxGroup = { key: "today" | "yesterday" | "earlier"; items: NotificationDTO[] }`
  - `notificationQueries.mine(offset)`, `.mineUnreadCount()`, `.forProvider(providerId, offset)`, `.providerUnreadCount(providerId)`
  - `useInbox(scope)`, `useUnreadCount(scope)`, `useMarkRead(scope)` where `scope = { kind: "mine" } | { kind: "provider"; providerId: string }`
  - `INBOX_PAGE_SIZE = 20`

- [ ] **Step 1: Write the failing domain test**

```ts
import { describe, expect, it } from "vitest";
import type { NotificationDTO } from "@ntizo/shared/read-models";
import { groupByDay } from "@/features/notifications/domain/inbox-groups";

function at(iso: string): NotificationDTO {
  return { id: iso, type: "WELCOME", payload: {}, createdAt: iso, read: false };
}

const TODAY = "2026-08-23T12:00:00.000Z";

describe("groupByDay", () => {
  it("puts this calendar day under today", () => {
    const groups = groupByDay([at("2026-08-23T08:00:00.000Z")], TODAY);
    expect(groups.map((g) => g.key)).toEqual(["today"]);
  });

  it("puts the previous calendar day under yesterday", () => {
    const groups = groupByDay([at("2026-08-22T23:59:00.000Z")], TODAY);
    expect(groups.map((g) => g.key)).toEqual(["yesterday"]);
  });

  it("puts anything older under earlier", () => {
    const groups = groupByDay([at("2026-08-01T10:00:00.000Z")], TODAY);
    expect(groups.map((g) => g.key)).toEqual(["earlier"]);
  });

  it("keeps the order it was given inside a group", () => {
    const groups = groupByDay([at("2026-08-23T10:00:00.000Z"), at("2026-08-23T08:00:00.000Z")], TODAY);
    expect(groups[0]!.items.map((i) => i.id)).toEqual([
      "2026-08-23T10:00:00.000Z",
      "2026-08-23T08:00:00.000Z",
    ]);
  });

  it("emits no empty groups", () => {
    // A heading with nothing under it reads as a section that failed to load.
    const groups = groupByDay([at("2026-08-01T10:00:00.000Z")], TODAY);
    expect(groups).toHaveLength(1);
  });

  it("returns nothing for an empty inbox", () => {
    expect(groupByDay([], TODAY)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/frontend/web && bun run test -- inbox-groups
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the domain**

```ts
// features/notifications/domain/inbox-groups.ts
import type { NotificationDTO } from "@ntizo/shared/read-models";

export type InboxGroupKey = "today" | "yesterday" | "earlier";

export interface InboxGroup {
  key: InboxGroupKey;
  items: NotificationDTO[];
}

/**
 * An inbox split into the three headings people actually scan for.
 *
 * Calendar days, not elapsed hours: something from 23:50 last night is
 * "yesterday" at 00:10 this morning, and calling it "2 hours ago" is technically
 * true and useless for finding it again.
 *
 * Three buckets rather than one per date. A heading per day turns a quiet week
 * into seven headings over seven single rows, which is more chrome than content.
 *
 * **Empty groups are never emitted.** A heading with nothing under it reads as a
 * section that failed to load rather than as a day when nothing happened.
 *
 * The order within a group is whatever the caller passed — the query already
 * returns newest first, and re-sorting here would be a second opinion about an
 * ordering the database already settled.
 */
export function groupByDay(items: NotificationDTO[], todayIso: string): InboxGroup[] {
  const today = dayNumber(todayIso);

  const buckets: Record<InboxGroupKey, NotificationDTO[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };

  for (const item of items) {
    const delta = today - dayNumber(item.createdAt);
    // Negative deltas — a row stamped in the future by a clock skew — land in
    // `today` rather than in a fourth bucket nobody designed a heading for.
    if (delta <= 0) buckets.today.push(item);
    else if (delta === 1) buckets.yesterday.push(item);
    else buckets.earlier.push(item);
  }

  return (["today", "yesterday", "earlier"] as const)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, items: buckets[key] }));
}

/** Whole days since the epoch, in UTC — the unit the comparison above is in. */
function dayNumber(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 86_400_000);
}
```

```ts
// features/notifications/domain/notification-presentation.ts
import type { LucideIcon } from "lucide-react";
import { BadgeCheck, FileWarning, Mail, Store, UserPlus } from "lucide-react";

/**
 * The icon a type draws with, and the i18n key its sentence lives under.
 *
 * A lookup with an explicit fallback rather than a `switch` over the enum: the
 * backend can raise a type this build has never heard of — a deploy skew, or a
 * type added after this bundle shipped — and a cell that throws on it would take
 * the whole inbox down over one unrecognised row. An unknown type renders as a
 * generic envelope with a generic sentence, which is the honest answer.
 */
const PRESENTATION: Record<string, { icon: LucideIcon; key: string }> = {
  WELCOME: { icon: Mail, key: "welcome" },
  PROVIDER_WORKSPACE_WELCOME: { icon: Store, key: "providerWorkspaceWelcome" },
  PROVIDER_VERIFIED: { icon: BadgeCheck, key: "providerVerified" },
  PROVIDER_DOCUMENTS_REQUIRED: { icon: FileWarning, key: "providerDocumentsRequired" },
  TEAM_INVITATION: { icon: UserPlus, key: "teamInvitation" },
};

const FALLBACK = { icon: Mail, key: "unknown" } as const;

export function presentationFor(type: string): { icon: LucideIcon; key: string } {
  return PRESENTATION[type] ?? FALLBACK;
}
```

- [ ] **Step 4: Write the data layer**

```ts
// features/notifications/data/notifications.repository.ts
import { queryOptions } from "@tanstack/react-query";
import type { InboxPageDTO, UnreadCountDTO } from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

export const INBOX_PAGE_SIZE = 20;

const FIELDS = `items { id type payload createdAt read } total`;

const MINE = `
  query MyNotifications($input: NotificationMineInput!) {
    notification { mine(input: $input) { ${FIELDS} } }
  }`;

const MINE_COUNT = `
  query MyUnreadCount {
    notification { mineUnreadCount(input: {}) { count } }
  }`;

const FOR_PROVIDER = `
  query ProviderNotifications($input: NotificationForProviderInput!) {
    notification { forProvider(input: $input) { ${FIELDS} } }
  }`;

const PROVIDER_COUNT = `
  query ProviderUnreadCount($input: NotificationProviderUnreadCountInput!) {
    notification { providerUnreadCount(input: $input) { count } }
  }`;

/**
 * How often the badge asks again.
 *
 * Thirty seconds is a compromise with an argument behind it: a notification is
 * not urgent enough to justify a socket on a platform that has no Durable
 * Objects and no queue bindings, and a badge that is half a minute stale is a
 * badge that is right. `refetchIntervalInBackground` is deliberately left off —
 * a tab nobody is looking at should not poll.
 */
const BADGE_POLL_MS = 30_000;

export const notificationQueries = {
  mine: (offset = 0) =>
    queryOptions({
      queryKey: ["notifications", "mine", offset] as const,
      queryFn: () =>
        sessionGraphql<{ notification: { mine: InboxPageDTO } }>(MINE, {
          input: { limit: INBOX_PAGE_SIZE, offset },
        }).then((d) => d.notification.mine),
    }),

  mineUnreadCount: () =>
    queryOptions({
      queryKey: ["notifications", "mine", "unread"] as const,
      queryFn: () =>
        sessionGraphql<{ notification: { mineUnreadCount: UnreadCountDTO } }>(
          MINE_COUNT,
          {},
        ).then((d) => d.notification.mineUnreadCount.count),
      refetchInterval: BADGE_POLL_MS,
    }),

  forProvider: (providerId: string, offset = 0) =>
    queryOptions({
      queryKey: ["notifications", "provider", providerId, offset] as const,
      queryFn: () =>
        sessionGraphql<{ notification: { forProvider: InboxPageDTO } }>(FOR_PROVIDER, {
          input: { providerId, limit: INBOX_PAGE_SIZE, offset },
        }).then((d) => d.notification.forProvider),
      // Without this the provider shell fires a query with an empty id while the
      // workspace is still resolving — the same guard `walletQueries` needs.
      enabled: providerId.length > 0,
    }),

  providerUnreadCount: (providerId: string) =>
    queryOptions({
      queryKey: ["notifications", "provider", providerId, "unread"] as const,
      queryFn: () =>
        sessionGraphql<{ notification: { providerUnreadCount: UnreadCountDTO } }>(
          PROVIDER_COUNT,
          { input: { providerId } },
        ).then((d) => d.notification.providerUnreadCount.count),
      refetchInterval: BADGE_POLL_MS,
      enabled: providerId.length > 0,
    }),
};
```

**Verify the generated GraphQL input type names** (`NotificationMineInput` and friends) against the running server before assuming them — the kit derives them from the field path, and a wrong name is a query that fails at parse time. Open `http://localhost:8788/graphql` and read the schema.

- [ ] **Step 5: Write the viewmodels**

```ts
// features/notifications/viewmodel/use-inbox.ts
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { InboxPageDTO } from "@ntizo/shared/read-models";
import { notificationQueries } from "@/features/notifications/data/notifications.repository";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

/** Which inbox a component is looking at. The only thing that differs between them. */
export type InboxScope = { kind: "mine" } | { kind: "provider"; providerId: string };

/**
 * The only path from `ui/` to this feature's `data/` layer.
 *
 * `ui` importing `data` directly is what the boundaries lint forbids, and this
 * indirection is the one legal route rather than decoration.
 */
export function useInbox(scope: InboxScope, offset = 0) {
  const query = useQuery(
    scope.kind === "mine"
      ? notificationQueries.mine(offset)
      : notificationQueries.forProvider(scope.providerId, offset),
  );

  const page: InboxPageDTO = query.data ?? { items: [], total: 0 };
  return { page, isPending: query.isPending, isError: query.isError };
}
```

```ts
// features/notifications/viewmodel/use-unread-count.ts
import { useQuery } from "@tanstack/react-query";
import { notificationQueries } from "@/features/notifications/data/notifications.repository";
import type { InboxScope } from "@/features/notifications/viewmodel/use-inbox";

/**
 * The badge's number.
 *
 * Returns 0 rather than undefined while loading: a bell that flashes a number
 * on every navigation is worse than one that is briefly, quietly wrong.
 */
export function useUnreadCount(scope: InboxScope): number {
  const query = useQuery(
    scope.kind === "mine"
      ? notificationQueries.mineUnreadCount()
      : notificationQueries.providerUnreadCount(scope.providerId),
  );
  return query.data ?? 0;
}
```

```ts
// features/notifications/viewmodel/use-mark-read.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type { InboxScope } from "@/features/notifications/viewmodel/use-inbox";

const MARK_ONE = `
  mutation MarkRead($input: NotificationMarkReadInput!) {
    notification { markRead(input: $input) { ok } }
  }`;

const MARK_ONE_PROVIDER = `
  mutation MarkProviderRead($input: NotificationMarkProviderReadInput!) {
    notification { markProviderRead(input: $input) { ok } }
  }`;

const MARK_ALL = `
  mutation MarkAllRead {
    notification { markAllRead(input: {}) { marked } }
  }`;

const MARK_ALL_PROVIDER = `
  mutation MarkAllProviderRead($input: NotificationMarkAllProviderReadInput!) {
    notification { markAllProviderRead(input: $input) { marked } }
  }`;

/**
 * Marking read, and refreshing what that changed.
 *
 * Invalidates the whole `["notifications"]` prefix rather than one page: the
 * badge and every loaded page of both inboxes are all downstream of this, and
 * enumerating them here would mean this file knowing every query key the
 * feature will ever have.
 *
 * No optimistic update. The row's only visible change is losing an unread dot,
 * a request that fails leaves the reader looking at a lie, and the round trip
 * is one query against a primary key.
 */
export function useMarkRead(scope: InboxScope) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications"] });

  const one = useMutation({
    mutationFn: (notificationId: string) =>
      scope.kind === "mine"
        ? sessionGraphql(MARK_ONE, { input: { notificationId } })
        : sessionGraphql(MARK_ONE_PROVIDER, { input: { notificationId } }),
    onSuccess: invalidate,
  });

  const all = useMutation({
    mutationFn: () =>
      scope.kind === "mine"
        ? sessionGraphql(MARK_ALL, {})
        : sessionGraphql(MARK_ALL_PROVIDER, { input: { providerId: scope.providerId } }),
    onSuccess: invalidate,
  });

  return { markOne: one.mutate, markAll: all.mutate, isMarkingAll: all.isPending };
}
```

- [ ] **Step 6: Run and lint**

```bash
cd apps/frontend/web && bun run test && bun run lint && bun run typecheck
```

Expected: PASS, 6 new tests; lint clean — **especially the boundaries rule.** If it complains that a file is unknown, the feature's directories do not match the `boundaries/elements` patterns in `eslint.config.js` and the config needs the same treatment `directory/services` got.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/web/src/features/notifications
git commit -m "feat(notifications): the inbox's domain, data and viewmodel

groupByDay splits on calendar days, not elapsed hours: something from
23:50 last night is 'yesterday' at 00:10 this morning, and '2 hours ago'
is technically true and useless for finding it again. Three headings
rather than one per date, because a heading per day turns a quiet week
into seven headings over seven single rows. Empty groups are never
emitted — a heading with nothing under it reads as a section that failed
to load.

presentationFor is a lookup with a fallback rather than a switch over the
enum. The backend can raise a type this bundle has never heard of, and a
cell that threw on it would take the whole inbox down over one row.

The badge polls at 30s and not in a background tab. A notification is not
urgent enough to justify a socket on a platform with no Durable Objects
and no queue bindings, and a badge half a minute stale is a badge that is
right.

No optimistic update on mark-read: the visible change is one dot, and a
failed request would leave the reader looking at a lie."
```

---

## Task 13: Frontend — the cell, the pages, the bell, the locales

**Files:**
- Create: `apps/frontend/web/src/features/notifications/ui/notification-cell.tsx`
- Create: `apps/frontend/web/src/features/notifications/ui/inbox-list.tsx`
- Create: `apps/frontend/web/src/features/notifications/ui/notifications-page.tsx`
- Create: `apps/frontend/web/src/features/notifications/ui/notification-bell.tsx`
- Create: `apps/frontend/web/src/shared/locales/{en-US,pt-MZ,pt-PT,es-ES,fr-FR,it-IT,de-DE,nl-NL}/notifications.json`
- Modify: `apps/frontend/web/src/routes/_customer/account/notifications.tsx`
- Create: `apps/frontend/web/src/routes/provider/$slug/notifications.tsx`
- Modify: `apps/frontend/web/src/shared/components/header-actions.tsx`
- Modify: `apps/frontend/web/src/shared/components/provider-shell.tsx` (nav entry)
- Test: `apps/frontend/web/src/features/notifications/ui/__tests__/notifications-page.test.tsx`

**Interfaces:**
- Consumes: `useInbox`, `useUnreadCount`, `useMarkRead`, `InboxScope` (Task 12); `groupByDay`, `presentationFor` (Task 12).
- Produces: `<NotificationsPage scope={...} />`, `<NotificationBell scope={...} />`.

- [ ] **Step 1: Write the eight locale catalogues**

`en-US/notifications.json` — every other locale is this file translated, with the same keys:

```json
{
  "title": "Notifications",
  "providerTitle": "Workspace notifications",
  "markAllRead": "Mark all as read",
  "groupToday": "Today",
  "groupYesterday": "Yesterday",
  "groupEarlier": "Earlier",
  "emptyTitle": "Nothing yet",
  "emptyBody": "When something happens on your account, it will appear here.",
  "unreadBadge": "{{count}} unread notification",
  "unreadBadge_other": "{{count}} unread notifications",
  "loadError": "Could not load your notifications.",
  "type": {
    "welcome": "Welcome to Ntizo",
    "providerWorkspaceWelcome": "{{providerName}} is set up",
    "providerVerified": "Your business has been verified",
    "providerDocumentsRequired": "Your documents need attention",
    "teamInvitation": "You have been invited to a team",
    "unknown": "You have a new notification"
  }
}
```

**`unreadBadge` carries a plural noun after `{{count}}`, so it needs its `_other` form** — the base key is the singular and `_other` is the plural, the convention already in `directory.json`. Every locale gets both. This is the one thing this repo has already had to go back and repair once; do not repeat it.

Portuguese (`pt-MZ` and `pt-PT` are identical here):

```json
{
  "title": "Notificações",
  "providerTitle": "Notificações do negócio",
  "markAllRead": "Marcar todas como lidas",
  "groupToday": "Hoje",
  "groupYesterday": "Ontem",
  "groupEarlier": "Anteriores",
  "emptyTitle": "Ainda nada",
  "emptyBody": "Quando algo acontecer na sua conta, aparece aqui.",
  "unreadBadge": "{{count}} notificação por ler",
  "unreadBadge_other": "{{count}} notificações por ler",
  "loadError": "Não foi possível carregar as suas notificações.",
  "type": {
    "welcome": "Bem-vindo à Ntizo",
    "providerWorkspaceWelcome": "{{providerName}} está pronto",
    "providerVerified": "O seu negócio foi verificado",
    "providerDocumentsRequired": "Os seus documentos precisam de atenção",
    "teamInvitation": "Foi convidado para uma equipa",
    "unknown": "Tem uma notificação nova"
  }
}
```

Translate the same keys for `es-ES`, `fr-FR`, `it-IT`, `de-DE`, `nl-NL`. Then verify parity — every catalogue must have the same leaf-key count:

```bash
cd apps/frontend/web
for l in en-US pt-MZ pt-PT es-ES fr-FR it-IT de-DE nl-NL; do
  printf "%s  " "$l"
  bun -e "const o=require('./src/shared/locales/$l/notifications.json');const f=(x,p='')=>Object.entries(x).flatMap(([k,v])=>typeof v==='object'&&v?f(v,p+k+'.'):[p+k]);console.log(f(o).length)"
done
```

Expected: the same number eight times.

- [ ] **Step 2: Write the failing page test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotificationsPage } from "@/features/notifications/ui/notifications-page";

vi.mock("@/features/notifications/viewmodel/use-inbox", () => ({
  useInbox: () => ({
    page: {
      total: 1,
      items: [
        {
          id: "n1",
          type: "PROVIDER_VERIFIED",
          payload: {},
          createdAt: new Date().toISOString(),
          read: false,
        },
      ],
    },
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@/features/notifications/viewmodel/use-mark-read", () => ({
  useMarkRead: () => ({ markOne: vi.fn(), markAll: vi.fn(), isMarkingAll: false }),
}));

describe("NotificationsPage", () => {
  it("draws the sentence for a known type", () => {
    render(<NotificationsPage scope={{ kind: "mine" }} />);
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
  });

  it("groups under a day heading", () => {
    render(<NotificationsPage scope={{ kind: "mine" }} />);
    expect(screen.getByRole("heading", { name: /today/i })).toBeInTheDocument();
  });
});
```

A second test file covers the empty state with a separate `vi.mock` returning `{ items: [], total: 0 }`, asserting `emptyTitle` renders and no "mark all" button does — an action over an empty list is an action that cannot do anything.

- [ ] **Step 3: Write the cell**

```tsx
// features/notifications/ui/notification-cell.tsx
import { useTranslation } from "react-i18next";
import { cn } from "@ntizo/frontend-ui";
import type { NotificationDTO } from "@ntizo/shared/read-models";
import { presentationFor } from "@/features/notifications/domain/notification-presentation";

/**
 * One row.
 *
 * The unread state is a left border and a weight change, not a coloured
 * background: a list where half the rows are tinted reads as an error state,
 * and the dot is what people actually scan for.
 *
 * The whole row is a button because marking read is the only thing it does. If
 * a type ever needs to navigate somewhere, that belongs in a `target` map beside
 * `presentationFor`, not in a second control inside the row.
 */
export function NotificationCell({
  notification,
  onMarkRead,
}: {
  notification: NotificationDTO;
  onMarkRead: (id: string) => void;
}) {
  const { t, i18n } = useTranslation("notifications");
  const { icon: Icon, key } = presentationFor(notification.type);
  const locale = i18n.resolvedLanguage ?? i18n.language;

  return (
    <li>
      <button
        type="button"
        onClick={() => !notification.read && onMarkRead(notification.id)}
        className={cn(
          "flex w-full items-start gap-3 border-l-2 px-4 py-3.5 text-left transition-colors",
          notification.read
            ? "border-transparent hover:bg-[var(--color-muted)]"
            : "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-primary)_7%,transparent)]",
        )}
      >
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
        >
          <Icon className="h-4 w-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn("type-body-medium block", !notification.read && "font-semibold")}
          >
            {/* The payload is passed as interpolation values: a type whose
                sentence needs a name finds it there, and one that does not
                simply ignores the extras. */}
            {t(`type.${key}`, notification.payload as Record<string, string>)}
          </span>
          <time
            dateTime={notification.createdAt}
            className="type-caption mt-0.5 block text-[var(--color-muted-foreground)]"
          >
            {new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
              new Date(notification.createdAt),
            )}
          </time>
        </span>
      </button>
    </li>
  );
}
```

- [ ] **Step 4: Write the list, the page and the bell**

`inbox-list.tsx` maps `groupByDay(...)` to a `<section>` per group with an `<h2>` from `t("groupToday" | "groupYesterday" | "groupEarlier")` and a `<ul>` of `NotificationCell`.

`notifications-page.tsx` composes: heading, a "mark all as read" button rendered **only when `page.items.some((i) => !i.read)`**, the list, and `EmptyCard` when `total === 0`. It takes `scope` as a prop so one component serves both routes — the two inboxes differ only in which query feeds them.

`notification-bell.tsx` renders the existing `Bell` icon with a badge when `useUnreadCount(scope) > 0`, capped at `99+`, labelled with `t("unreadBadge", { count })` so a screen reader hears the number as a sentence rather than a bare digit.

- [ ] **Step 5: Wire the routes**

`routes/_customer/account/notifications.tsx` — **replace the redirect entirely**:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPage } from "@/features/notifications/ui/notifications-page";

/**
 * The redirect this replaces existed because the page did not. It does now.
 *
 * Client-rendered like every other session-dependent route: an inbox is the
 * most personal thing on the site and has no business in a prerendered
 * document.
 */
export const Route = createFileRoute("/_customer/account/notifications")({
  component: () => <NotificationsPage scope={{ kind: "mine" }} />,
});
```

`routes/provider/$slug/notifications.tsx` — new, resolving `providerId` from the provider context the way the sibling routes under `$slug` already do. Read `routes/provider/$slug/wallet.tsx` and copy how it obtains the id; do not invent a second mechanism.

Add a Notifications entry to the provider shell's navigation beside Wallet.

- [ ] **Step 6: Turn the bell on**

In `shared/components/header-actions.tsx`, replace the inert button (and delete the "Inert until notifications exist" comment — it is no longer true) with `<NotificationBell scope={{ kind: "mine" }} />` wrapped in a link to `/account/notifications`.

- [ ] **Step 7: Run everything**

```bash
cd apps/frontend/web && bun run test && bun run lint && bun run typecheck
```

- [ ] **Step 8: Look at it in a browser**

```bash
cd apps/frontend/web && bun run dev
```

Sign in, visit `/account/notifications`, and confirm: the welcome row is there, the bell shows 1, clicking the row clears the dot, and the badge drops to 0 within thirty seconds or on navigation. **Ask for the Claude-in-Chrome site permission at the start of this task, not here** — without it the browser can read `localhost:3000` but cannot click, and the failure reads like a broken selector.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(notifications): the inbox, the bell, and eight locales

One page component serving both inboxes through a scope prop — they
differ only in which query feeds them, and two nearly-identical pages is
how they drift.

/account/notifications stops redirecting. The redirect existed because
the page did not; it does now. The bell loses its 'Inert until
notifications exist' comment, which has been true since it was drawn.

The unread state is a left border and a weight change rather than a
tinted background: a list where half the rows are coloured reads as an
error state.

'Mark all as read' renders only when something is unread. An action over
a list it cannot change is a button that lies.

unreadBadge ships with its _other form in all eight locales. It carries a
plural noun after {{count}}, and this is the mistake this repo has
already had to go back and repair once."
```

---

## Task 14: Drop the SMS column, and prove it end to end

**Files:**
- Modify: `apps/frontend/web/src/features/account/ui/section-pages.tsx`
- Modify: `packages/shared/src/enums/notification-enums/notification-channel.enum.ts`
- Modify: `apps/frontend/web/src/shared/locales/*/account.json` (a key for the unavailable note)
- Create: `apps/e2e/tests/notifications.spec.ts`
- Test: `packages/shared/src/enums/__tests__/notifications.test.ts` (extend)

**Interfaces:**
- Consumes: everything above.
- Produces: `OPTIONAL_NOTIFICATION_CHANNELS` narrowed to `[Email, Push]`.

- [ ] **Step 1: Write the failing enum test**

```ts
it("offers only the channels the platform can actually deliver on", () => {
  // SMS was removed when delivery was decided to be email-only: there is no SMS
  // adapter in the repository at all, and a switch for a channel that cannot
  // send is a promise the settings page has no way to keep. The enum keeps
  // `Sms` — phone verification still needs the concept, and the metered rule is
  // right whenever it returns.
  expect(OPTIONAL_NOTIFICATION_CHANNELS).toEqual([
    NotificationChannel.Email,
    NotificationChannel.Push,
  ]);
});

it("still knows SMS is metered, for whenever it comes back", () => {
  expect(isMeteredChannel(NotificationChannel.Sms)).toBe(true);
});
```

- [ ] **Step 2: Narrow the constant**

Remove `NotificationChannel.Sms` from `OPTIONAL_NOTIFICATION_CHANNELS` and rewrite its doc comment to say why — the existing comment explains why `InApp` is absent, and the new absence needs the same treatment.

- [ ] **Step 3: Mark Push unavailable on the preferences page**

In `section-pages.tsx`'s `NotificationSettings`, the SMS column disappears on its own (it maps `OPTIONAL_NOTIFICATION_CHANNELS`). Add a note under the Push heading that it is not available yet, using the same `t("channelCosts")` slot the metered note used. `Push` has no adapter either, and a column with no note reads as a channel that works.

The switches stay `disabled` and the banner stays. All five live types are transactional by `bucketForNotificationType`, so no switch here governs anything this slice sends — which is a better reason than the one the banner currently gives.

- [ ] **Step 4: Write the e2e spec**

```ts
// apps/e2e/tests/notifications.spec.ts
import { test, expect } from "@playwright/test";
import { signUpAndVerify } from "../fixtures/auth";

/**
 * The one seam no unit test observes: a real sign-up, a real transaction, a
 * real commit, and a notification that only exists if `runAfterCommit` fired
 * and the router had a handler registered. Everything either side of that seam
 * is covered in isolation; this is the proof they are joined.
 */
test("registering produces a welcome in the new user's inbox", async ({ page }) => {
  const email = `inbox-${crypto.randomUUID()}@ntizo.test`;
  await signUpAndVerify(page, { email, password: "Password123!", name: "Ana" });

  await page.goto("/account/notifications");

  await expect(page.getByRole("heading", { name: /notifications/i })).toBeVisible();
  await expect(page.getByText(/welcome to ntizo/i)).toBeVisible();
});

test("marking it read clears the badge", async ({ page }) => {
  const email = `badge-${crypto.randomUUID()}@ntizo.test`;
  await signUpAndVerify(page, { email, password: "Password123!", name: "Ana" });

  await page.goto("/account/notifications");
  await page.getByText(/welcome to ntizo/i).click();

  // The dot is gone from the row, which is the assertion that survives a
  // refactor of the badge's polling interval.
  await expect(page.getByRole("listitem").first()).not.toHaveClass(/border-\[var\(--color-primary\)\]/);
});
```

Read `apps/e2e/fixtures/auth.ts` first and use its actual exported helper name and signature — `signUpAndVerify` above is the intent, not a guarantee.

- [ ] **Step 5: Run the whole suite**

```bash
docker run --rm -d --name ntizo-e2e-db -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ntizo_e2e -p 55432:5432 postgres:16-alpine
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
bun run e2e
```

Do **not** call `resetDb()` from the spec — `globalSetup` resets once, and a second reset drops schemas out from under specs running in parallel.

- [ ] **Step 6: Run every gate from the repo root**

```bash
bun run check-types && bun run lint && bun run test
```

All three must be clean. Lint especially: the boundaries rule with `no-unknown-files: "error"` fails on any file in `features/notifications/` that does not match an element pattern.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(notifications): stop offering SMS, and prove the seam end to end

The preferences page has been drawing an SMS column with a 'costs money'
note for a channel that has no adapter in this repository at all. With
delivery decided to be email-only it is a promise the page has no way to
keep, so the column goes. Push gets a note saying it is unavailable —
it has no adapter either, and a column with no note reads as a channel
that works.

The enum keeps Sms and isMeteredChannel. Phone verification still needs
the concept — payment here is M-Pesa and e-Mola, which are the phone —
and the metered rule is right whenever SMS returns.

The switches stay disabled, now with a better reason than 'nothing
sends': all five types with a live producer are transactional by
bucketForNotificationType, so no switch here would govern any of them.

The e2e spec covers the one seam no unit test sees — a real sign-up, a
real commit, and a notification that exists only if runAfterCommit fired
and the router had a handler registered."
```

---

## Self-Review

**Spec coverage.** Walked every section of the spec against a task:

| Spec requirement | Task |
|---|---|
| `notification` + `notification_read` tables, CHECKs, cross-schema FKs | 1 |
| Snapshot payload | 2, 10 |
| Per-reader read state | 1, 4 |
| Ports, raise + mark-read commands | 3, 5 |
| Read tier: four projections, four queries, paging as `optional()` | 6, 7 |
| Write tier: four separately-named mutations | 8 |
| `runAfterCommit` dispatch, handler isolation, failure policy | 9, 11 |
| Handlers for the three provider events | 10 |
| User BC event machinery, `UserRegistered`, `Welcome` | 11 |
| Frontend layers, polling not sockets, empty state | 12, 13 |
| Eight locales with `_other` forms | 13 |
| `/account/notifications` stops redirecting; bell turns on | 13 |
| SMS column removed, Push marked unavailable | 14 |
| Preferences stay disabled | 14 |

**Gaps found and closed while reviewing:**

- The spec says the workspace inbox lives at `/provider/$slug/notifications` but never said the provider shell needs a nav entry. Added to Task 13.
- The spec's `ctx.waitUntil` requirement belongs to Phase 2 — nothing in Phase 1 does network I/O after commit, since writing an inbox row is a database call already inside the request. **Deliberately not in this plan**; it moves to Phase 2 with the email send.
- `notification_delivery` and `email_suppression` are in the spec's data model and in **no task here**. That is the Phase-1/Phase-2 split, stated at the top of this plan rather than left to be discovered.

**Type consistency.** `InboxRow`/`InboxPage` (Task 3) are what `DrizzleNotificationRepository` returns (Task 4), what the projections pass through (Task 7), and what `inboxPageReadModel` parses (Task 6) — the field names `id`, `type`, `payload`, `createdAt`, `read` are identical in all four. `InboxScope` is defined once in Task 12's `use-inbox.ts` and imported by the other two viewmodels rather than redeclared. `RaiseNotificationInput` is the same discriminated union in Task 5, Task 10's spy and Task 11's handler.

**Two things this plan asks the implementer to verify rather than assume**, because they are facts about code this plan did not read line by line, and guessing them would be exactly the placeholder this document must not contain:

1. The exact property names on `ProviderCreated`, `ProviderStatusDecided` and `ProviderInviteSent` (Task 10, Step 4) — including whether `provider.invite.sent` carries `invitedUserId` at all. If it does not, adding it is part of that task.
2. The GraphQL input type names the kit derives from field paths (Task 12, Step 4), and the real name and signature of the e2e sign-up fixture (Task 14, Step 4).
