# Notifications — email delivery (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a raised notification also leave the building as an email — audited per attempt, written in the recipient's own language, and refused for an address that has already bounced.

**Architecture:** A delivery is a separate record from a notification, because a team invitation goes to somebody with no account and therefore no inbox row. `RaiseNotificationInternalCommand` gains a delivery step after the inbox write; sending happens inside `ctx.waitUntil` so a provider approval never waits on Resend. Templates follow this repo's existing per-locale `Copy` table rather than a rendering framework. A `svix`-verified webhook turns Resend's bounce and complaint events into suppression rows that every later send checks first.

**Tech Stack:** Bun, Drizzle + Neon Postgres (named schemas), `@cosmneo/onion-lasagna` 1.0.0-beta.3, Hono on Cloudflare Workers, Resend, `svix`.

**Spec:** `docs/superpowers/specs/2026-08-23-notifications-inbox-design.md` — the "Email delivery" section, plus the `notification_delivery` and `email_suppression` tables in "Data model".

**Phase 1 is merged** (PR #2, `74de27a`). Read it before starting: `bounded-contexts/notification/` holds the aggregate, ports, repositories, commands and bootstrap; `write/notification/events/handlers/` holds the producers; the in-process router lives at `shared/infrastructure/events/`.

## Global Constraints

- **`@cosmneo/onion-lasagna*` is pinned EXACTLY at `1.0.0-beta.3`.** Never `latest`. Do not touch the `overrides` block.
- **`packages/backend` must not import a web framework binding** — no `hono`, `graphql-yoga`, `@cosmneo/onion-lasagna-hono`, `@cosmneo/onion-lasagna-yoga`. The field kit is allowed. Four fitness tests fail CI otherwise.
- **No presentation code inside `bounded-contexts/`** — no directory named `rest`, `http` or `graphql`, no `createXRouter` export. `write/<bc>/http/` is where a webhook route belongs.
- **A user id is `text`, a provider id is `uuid`.** Never interchange them.
- **Tables live in named Postgres schemas**, never `public`. New tables join `ntizo_notification`.
- **Every user-visible string exists in all eight locales** — `en-US`, `pt-MZ`, `pt-PT`, `es-ES`, `fr-FR`, `it-IT`, `de-DE`, `nl-NL`.
- **No i18n framework on the backend.** Templates are a `Copy` interface plus one const per locale, the pattern in `shared/infrastructure/email/templates/provider-invite.template.ts`. Follow-up #15 states this explicitly.
- **Turbo filters the environment.** A variable a task does not declare in `turbo.json`'s `passThroughEnv` never reaches it, however visible it looks in the job. This cost a CI round on the previous branch.
- **Comments explain *why*, especially where a choice looks wrong.** The strongest convention in this codebase.
- **Commit subjects are lowercase sentences describing intent**, scoped, with a prose body and the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer.

---

## What Phase 1 already built, and what it deliberately left

**The hook point.** `RaiseNotificationInternalCommand.execute()` takes a discriminated union — `{ type, audience: "user", userId, payload }` or `{ type, audience: "provider", providerId, payload }` — and returns `{ notificationId }`. Its own doc comment names this as where Phase 2 hangs, and says why the input carries the whole payload rather than ids: so a later reader never has to resolve anything.

**Five live producers**, all transactional by `bucketForNotificationType`:

| Type | Audience | Payload |
|---|---|---|
| `Welcome` | user | `{ firstName }` |
| `ProviderWorkspaceWelcome` | provider | `{ type }` |
| `ProviderVerified` | provider | `{ from, to }` |
| `ProviderDocumentsRequired` | provider | `{ from, to }` |
| `TeamInvitation` | user | `{ providerId, providerName, role }` |

**Things you will need that already exist:**

- `shared/infrastructure/email/`: `EmailServicePort`, `ResendEmailServiceAdapter`, `ConsoleEmailServiceAdapter`, `resolveEmailService()`, and `emailLayout()` / `buttonHtml()` in `templates/layout.ts`.
- `templates/provider-invite.template.ts` — the per-locale `Copy` pattern, translated into all eight, with its reasoning written above it.
- `bounded-contexts/provider/app/ports/outbound/inviter-locale.port.ts` — `localeFor(userId): Promise<string | null>` — and its drizzle adapter. **The pattern to copy, not the port to import**: notifications must not depend on the Provider context.
- `bounded-contexts/notification/.../provider-member-reader.adapter.ts` and `user-by-email-reader.adapter.ts` — the two cross-BC adapters Phase 1 added; new readers follow their shape exactly.

**One gap this plan must close, found while writing it:** `EmailServicePort.sendEmail` returns `void`. It discards Resend's response, and with it the provider message id that `notification_delivery.provider_message_id` needs. Task 3 changes the signature; the three existing callers ignore the new return value and keep working.

---

## File Structure

**Database (Task 1)**
- `.../database/notification/schemas/notification-delivery.schema.ts`
- `.../database/notification/schemas/email-suppression.schema.ts`
- `.../database/notification/schemas/index.ts` — add both

**Domain and ports (Tasks 2–4)**
- `bounded-contexts/notification/domain/aggregates/notification-delivery.aggregate.ts`
- `bounded-contexts/notification/domain/aggregates/email-suppression.aggregate.ts`
- `.../app/ports/outbound/{notification-delivery,email-suppression}.repository.port.ts`
- `.../app/ports/outbound/{recipient-reader,template-renderer,email-sender}.port.ts`
- `.../infrastructure/repositories/drizzle/{notification-delivery,email-suppression}.repository.ts`
- `.../infrastructure/outbound-adapters/cross-bc/recipient-reader.adapter.ts`
- `shared/infrastructure/email/email-service.port.ts` — `sendEmail` returns a message id

**Templates (Task 5)**
- `bounded-contexts/notification/infrastructure/templates/<type>.template.ts` × 5
- `.../infrastructure/templates/registry.ts`
- `.../infrastructure/templates/index.ts`

**Sending (Tasks 6–7)**
- `.../app/use-cases/deliver-notification.internal.command.ts`
- `.../app/use-cases/raise-notification.internal.command.ts` — append the delivery step
- `.../bootstrap/index.ts` — wire it

**Webhook (Tasks 8–9)**
- `write/notification/http/resend-webhook.routes.ts`
- `write/notification/http/index.ts`
- `.../app/use-cases/handle-resend-webhook.internal.command.ts`
- `apps/backend/api/src/webhooks.ts` — the Hono binding
- `apps/backend/api/src/api.ts` — mount it
- `apps/backend/api/package.json` — add `svix`

**Waiting (Task 10)**
- `apps/backend/api/src/api.ts` / `middlewares/config.middleware.ts` — carry `ExecutionContext` into request scope
- `shared/infrastructure/stores/infra-store.ts` — expose `waitUntil`

---

## Task 1: The two tables

**Files:**
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/notification/schemas/notification-delivery.schema.ts`
- Create: `.../notification/schemas/email-suppression.schema.ts`
- Modify: `.../notification/schemas/index.ts`
- Test: `.../database/__tests__/notification-delivery-constraints.test.ts`

**Interfaces:**
- Consumes: `notification` table (Phase 1).
- Produces: `notificationDelivery`, `emailSuppression` tables; types `NotificationDeliveryRecord`, `EmailSuppressionRecord`.

- [ ] **Step 1: Write the delivery table**

```ts
import { index, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { notification } from "./notification.schema";

const notificationSchema = pgSchema("ntizo_notification");

/**
 * One outbound attempt.
 *
 * **A delivery is not a notification, and `notification_id` is nullable for a
 * reason that took a whole design round to surface.** A team invitation goes
 * to an email address that may belong to nobody yet — there is no inbox to
 * address, but there is certainly a message to send. So a delivery carries its
 * own `type` and `locale` and can be rendered without an inbox row behind it.
 *
 * **The row is written BEFORE the attempt, not after.** Writing it after would
 * mean an isolate dying mid-send leaves no trace of an email that may well have
 * gone out — which is the exact case an audit exists for. A row stuck at
 * `queued` is a queryable symptom; no row at all is not.
 *
 * `notification_id` does NOT cascade. A delivery is the record of something
 * that actually left the building, and it must outlive the inbox item it was
 * about — including when that item is deleted with its addressee.
 */
export const notificationDelivery = notificationSchema.table(
  "notification_delivery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id").references(() => notification.id, {
      onDelete: "set null",
    }),
    /** A `NotificationType` value — carried so a delivery renders without a notification. */
    type: text("type").notNull(),
    /** Only "EMAIL" today. Present so adding a channel is a value, not a migration. */
    channel: text("channel").notNull(),
    toEmail: text("to_email").notNull(),
    /** The recipient's own language, resolved when the delivery was created. */
    locale: text("locale").notNull(),
    status: text("status").notNull(),
    /** Resend's own id, for correlating a bounce webhook back to this row. */
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // "Did the invitation arrive?" is asked by address, and "what is stuck?" is
    // asked by status. Those are the only two questions this table answers.
    index("notification_delivery_email_idx").on(t.toEmail, t.createdAt.desc()),
    index("notification_delivery_status_idx").on(t.status),
    // Correlating a webhook back to its row is a lookup on this, and it is
    // sparse: only a successful send has one.
    index("notification_delivery_message_idx")
      .on(t.providerMessageId)
      .where(sql`${t.providerMessageId} IS NOT NULL`),
    check(
      "notification_delivery_status_known",
      sql`${t.status} IN ('queued', 'sent', 'failed', 'suppressed')`,
    ),
    check("notification_delivery_channel_known", sql`${t.channel} IN ('EMAIL')`),
  ],
);

export type NotificationDeliveryRecord = typeof notificationDelivery.$inferSelect;
export type NewNotificationDeliveryRecord = typeof notificationDelivery.$inferInsert;
```

- [ ] **Step 2: Write the suppression table**

```ts
import { jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const notificationSchema = pgSchema("ntizo_notification");

/**
 * Addresses this platform must stop writing to.
 *
 * **Keyed by the address itself, not a surrogate id.** There is exactly one
 * answer to "may we write here", the question is always asked by address, and
 * a unique index over a generated key is the same thing with an extra hop.
 *
 * There is no un-suppression path and that is deliberate: removing a row is a
 * manual database operation until somebody needs it more often than that.
 * Building a UI for it first would be building the rare case.
 *
 * `detail` keeps the provider's own event body. A bounce is the kind of thing
 * somebody investigates months later, and the reason Resend gave is the only
 * evidence that survives.
 */
export const emailSuppression = notificationSchema.table(
  "email_suppression",
  {
    email: text("email").primaryKey(),
    reason: text("reason").notNull(),
    suppressedAt: timestamp("suppressed_at", { withTimezone: true }).notNull().defaultNow(),
    detail: jsonb("detail"),
  },
  (t) => [
    check("email_suppression_reason_known", sql`${t.reason} IN ('bounce', 'complaint')`),
  ],
);

export type EmailSuppressionRecord = typeof emailSuppression.$inferSelect;
```

- [ ] **Step 3: Export both from the barrel**

In `.../notification/schemas/index.ts`, add:

```ts
export * from "./notification-delivery.schema";
export * from "./email-suppression.schema";
```

`ntizo_notification` is already in `drizzle.config.ts`'s `schemaFilter` from Phase 1 — verify it is there rather than assuming, because a missing entry makes `drizzle-kit generate` produce an **empty** migration and exit 0.

- [ ] **Step 4: Write the failing constraint test**

Against the real database, like Phase 1's, and for the same reason its header gives: a CHECK nobody exercises is a CHECK that might not be on the table.

**This test needs a bound context.** Phase 1 learned this the hard way: the repository resolves its handle through `getDb()` → AsyncLocalStorage, which `configMiddleware` binds per request, so a test has no request. Seeding through a raw client is not enough — see `catalog-unpublish-sweep.test.ts` and Phase 1's `notification.repository.test.ts`, which wrap each body in `__runWithTransactionContextForTests(db, ...)` with `drizzle(sql, { schema: authSchema })`. Direct inserts like the ones below do not need it; repository calls in later tasks do.

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  emailSuppression,
  notificationDelivery,
} from "../notification/schemas";

const url = process.env["DEV_DB_URL"];
if (!url) throw new Error("DEV_DB_URL is not set — see packages/backend/.env");

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);
const suffix = crypto.randomUUID();

afterAll(async () => {
  await db.delete(emailSuppression).where(eq(emailSuppression.email, `bounced-${suffix}@ntizo.test`));
  await sql.end();
});

/** Drizzle builders are lazy thenables, not Promises — `expect(builder).rejects` throws before the query runs. */
async function insertDelivery(values: Record<string, unknown>) {
  await db.insert(notificationDelivery).values(values as never);
}

describe("a delivery stands alone", () => {
  test("accepts a row with no notification behind it", async () => {
    const [row] = await db
      .insert(notificationDelivery)
      .values({
        type: "TEAM_INVITATION",
        channel: "EMAIL",
        toEmail: `stranger-${suffix}@ntizo.test`,
        locale: "pt-MZ",
        status: "queued",
      })
      .returning();
    expect(row?.notificationId).toBeNull();
    await db.delete(notificationDelivery).where(eq(notificationDelivery.id, row!.id));
  });

  test("refuses a status nobody defined", async () => {
    await expect(
      insertDelivery({
        type: "WELCOME",
        channel: "EMAIL",
        toEmail: `x-${suffix}@ntizo.test`,
        locale: "en-US",
        status: "pending",
      }),
    ).rejects.toThrow(/notification_delivery_status_known/);
  });

  test("refuses a channel nobody built", async () => {
    await expect(
      insertDelivery({
        type: "WELCOME",
        channel: "SMS",
        toEmail: `x-${suffix}@ntizo.test`,
        locale: "en-US",
        status: "queued",
      }),
    ).rejects.toThrow(/notification_delivery_channel_known/);
  });
});

describe("suppression", () => {
  test("one row per address, and a second write is not an error", async () => {
    const email = `bounced-${suffix}@ntizo.test`;
    await db.insert(emailSuppression).values({ email, reason: "bounce" });
    await db
      .insert(emailSuppression)
      .values({ email, reason: "complaint" })
      .onConflictDoNothing();

    const rows = await db.select().from(emailSuppression).where(eq(emailSuppression.email, email));
    expect(rows).toHaveLength(1);
    // The FIRST reason survives. A complaint arriving after a bounce does not
    // rewrite why we stopped writing to this address.
    expect(rows[0]!.reason).toBe("bounce");
  });

  test("refuses a reason nobody defined", async () => {
    await expect(
      (async () => {
        await db
          .insert(emailSuppression)
          .values({ email: `y-${suffix}@ntizo.test`, reason: "unsubscribed" });
      })(),
    ).rejects.toThrow(/email_suppression_reason_known/);
  });
});
```

- [ ] **Step 5: Run it and watch it fail**

```bash
cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/notification-delivery-constraints.test.ts
```

Expected: FAIL — `relation "ntizo_notification.notification_delivery" does not exist`.

- [ ] **Step 6: Generate and apply the migration**

```bash
cd packages/backend
bun run db:ntizo:generate
```

**Read the generated SQL before applying it.** It must contain both `CREATE TABLE`s, three CHECK constraints, and three indexes — one of them partial, with a `WHERE ... IS NOT NULL` predicate. An empty file means `schemaFilter` is wrong.

```bash
bun run db:ntizo:dev:migrate
```

Dev only. Never qa or prod.

- [ ] **Step 7: Run it and watch it pass**

Expected: PASS, 5 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/modules/ntizo/shared/infrastructure/database/notification \
        packages/backend/src/modules/ntizo/shared/infrastructure/migrations \
        packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/notification-delivery-constraints.test.ts
git commit -m "feat(notification): a delivery record, and a list of addresses to stop writing to

A delivery is not a notification. \`notification_id\` is nullable because a
team invitation goes to an address that may belong to nobody yet: there is
no inbox to address, but there is certainly a message to send. So the row
carries its own type and locale and renders without one.

It also does not cascade. A delivery records something that actually left
the building and must outlive the inbox item it was about, including when
that item goes with its addressee.

Suppression is keyed by the address itself. There is one answer to 'may we
write here', it is always asked by address, and a unique index over a
generated key is the same thing with an extra hop. A second write keeps the
first reason — a complaint after a bounce does not rewrite why we stopped."
```

---

## Task 2: The delivery aggregate

**Files:**
- Create: `bounded-contexts/notification/domain/aggregates/notification-delivery.aggregate.ts`
- Modify: `bounded-contexts/notification/domain/exceptions.ts`
- Test: `bounded-contexts/notification/__tests__/notification-delivery.aggregate.test.ts`

**Interfaces:**
- Consumes: `NotificationType` from `@ntizo/shared`.
- Produces:
  - `NotificationDelivery.queue({ notificationId?, type, toEmail, locale }): NotificationDelivery`
  - `NotificationDelivery.suppressed({ ... }): NotificationDelivery`
  - `.markSent(providerMessageId): NotificationDelivery`
  - `.markFailed(error): NotificationDelivery`
  - getters `id | notificationId | type | channel | toEmail | locale | status | providerMessageId | error`
  - `type DeliveryStatus = "queued" | "sent" | "failed" | "suppressed"`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { NotificationDelivery } from "../domain/aggregates/notification-delivery.aggregate";
import { UnknownNotificationTypeError } from "../domain/exceptions";

const base = {
  type: NotificationType.Welcome,
  toEmail: "ana@ntizo.test",
  locale: "pt-MZ",
};

describe("NotificationDelivery.queue", () => {
  it("starts queued, with nothing to report yet", () => {
    const d = NotificationDelivery.queue(base);
    expect(d.status).toBe("queued");
    expect(d.providerMessageId).toBeNull();
    expect(d.error).toBeNull();
  });

  it("stands alone when no notification is behind it", () => {
    expect(NotificationDelivery.queue(base).notificationId).toBeNull();
  });

  it("is EMAIL, because that is the only channel built", () => {
    expect(NotificationDelivery.queue(base).channel).toBe("EMAIL");
  });

  it("refuses a type the platform does not define", () => {
    expect(() =>
      NotificationDelivery.queue({ ...base, type: "INVENTED" as NotificationType }),
    ).toThrow(UnknownNotificationTypeError);
  });
});

describe("what a delivery becomes", () => {
  it("carries the provider's id once it is sent, so a bounce can find it", () => {
    const sent = NotificationDelivery.queue(base).markSent("resend_abc123");
    expect(sent.status).toBe("sent");
    expect(sent.providerMessageId).toBe("resend_abc123");
  });

  it("keeps the reason when it fails", () => {
    const failed = NotificationDelivery.queue(base).markFailed("rate limited");
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("rate limited");
  });

  it("records a suppressed address as never having been attempted", () => {
    // Not "failed": nothing was tried. A failure invites a retry; this is a
    // refusal, and the two must not read the same in the audit.
    const s = NotificationDelivery.suppressed(base);
    expect(s.status).toBe("suppressed");
    expect(s.providerMessageId).toBeNull();
    expect(s.error).toBeNull();
  });

  it("does not mutate the delivery it came from", () => {
    const queued = NotificationDelivery.queue(base);
    queued.markSent("resend_abc123");
    expect(queued.status).toBe("queued");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/notification/__tests__/notification-delivery.aggregate.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the aggregate**

```ts
import { NotificationType } from "@ntizo/shared";
import { UnknownNotificationTypeError } from "../exceptions";

/** What a delivery can be. `suppressed` is a refusal, not a failure — see below. */
export type DeliveryStatus = "queued" | "sent" | "failed" | "suppressed";

export interface NotificationDeliveryProps {
  readonly id: string | null;
  readonly notificationId: string | null;
  readonly type: NotificationType;
  readonly channel: "EMAIL";
  readonly toEmail: string;
  readonly locale: string;
  readonly status: DeliveryStatus;
  readonly providerMessageId: string | null;
  readonly error: string | null;
}

const KNOWN_TYPES = new Set<string>(Object.values(NotificationType));

/**
 * One outbound attempt, and what became of it.
 *
 * **Immutable transitions.** `markSent` and `markFailed` return a new delivery
 * rather than mutating this one, matching how `Review.revise` works in this
 * codebase. A caller holding the queued instance keeps holding a queued
 * instance, which is what makes "write the row, then attempt, then update it"
 * readable rather than a sequence of hidden mutations.
 *
 * **`suppressed` is not `failed`.** A failure is something that was attempted
 * and did not work, and it invites a retry. A suppression is a send that never
 * happened because the address is on a list. Collapsing them would make the
 * audit unable to answer "how many emails did we actually try to send", which
 * is the question a bounce investigation starts from.
 */
export class NotificationDelivery {
  private constructor(private readonly props: NotificationDeliveryProps) {}

  static queue(input: {
    id?: string | null;
    notificationId?: string | null;
    type: NotificationType;
    toEmail: string;
    locale: string;
  }): NotificationDelivery {
    assertKnownType(input.type);
    return new NotificationDelivery({
      id: input.id ?? null,
      notificationId: input.notificationId ?? null,
      type: input.type,
      channel: "EMAIL",
      toEmail: input.toEmail,
      locale: input.locale,
      status: "queued",
      providerMessageId: null,
      error: null,
    });
  }

  static suppressed(input: {
    notificationId?: string | null;
    type: NotificationType;
    toEmail: string;
    locale: string;
  }): NotificationDelivery {
    assertKnownType(input.type);
    return new NotificationDelivery({
      id: null,
      notificationId: input.notificationId ?? null,
      type: input.type,
      channel: "EMAIL",
      toEmail: input.toEmail,
      locale: input.locale,
      status: "suppressed",
      providerMessageId: null,
      error: null,
    });
  }

  static rehydrate(props: NotificationDeliveryProps): NotificationDelivery {
    return new NotificationDelivery(props);
  }

  markSent(providerMessageId: string): NotificationDelivery {
    return new NotificationDelivery({
      ...this.props,
      status: "sent",
      providerMessageId,
      error: null,
    });
  }

  markFailed(error: string): NotificationDelivery {
    return new NotificationDelivery({
      ...this.props,
      status: "failed",
      providerMessageId: null,
      error,
    });
  }

  get id() { return this.props.id; }
  get notificationId() { return this.props.notificationId; }
  get type() { return this.props.type; }
  get channel() { return this.props.channel; }
  get toEmail() { return this.props.toEmail; }
  get locale() { return this.props.locale; }
  get status() { return this.props.status; }
  get providerMessageId() { return this.props.providerMessageId; }
  get error() { return this.props.error; }
}

function assertKnownType(type: NotificationType): void {
  if (!KNOWN_TYPES.has(type)) throw new UnknownNotificationTypeError(String(type));
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 8 tests.

- [ ] **Step 5: Break-check the immutability**

Change `markSent` to assign onto `this.props` instead of returning a new instance — TypeScript will complain about `readonly`, so cast through `as` to force it. Re-run: "does not mutate the delivery it came from" must fail. Restore.

A test that passes with the behaviour removed is not testing it. Do this for real; report both runs' output.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/notification
git commit -m "feat(notification): the delivery aggregate, and why suppressed is not failed

markSent and markFailed return a new delivery rather than mutating this
one, matching Review.revise. A caller holding the queued instance keeps
holding a queued instance, which is what makes write-then-attempt-then-
update readable instead of a sequence of hidden mutations.

suppressed is its own status, not a kind of failure. A failure was
attempted and invites a retry; a suppression never happened because the
address is on a list. Collapsing them would leave the audit unable to
answer how many emails were actually attempted, which is where a bounce
investigation starts."
```

---

## Task 3: The ports, and the message id the sender was throwing away

**Files:**
- Create: `bounded-contexts/notification/app/ports/outbound/notification-delivery.repository.port.ts`
- Create: `.../app/ports/outbound/email-suppression.repository.port.ts`
- Create: `.../app/ports/outbound/recipient-reader.port.ts`
- Create: `.../app/ports/outbound/template-renderer.port.ts`
- Modify: `.../app/ports/outbound/index.ts`
- Modify: `packages/backend/src/shared/infrastructure/email/email-service.port.ts`
- Modify: `packages/backend/src/shared/infrastructure/email/resend-email-service.adapter.ts`
- Modify: `packages/backend/src/shared/infrastructure/email/console-email-service.adapter.ts`
- Modify: `packages/backend/src/shared/infrastructure/email/resolve-email-service.ts` (the lazy adapter)

**Interfaces:**
- Produces:
  - `NotificationDeliveryRepositoryPort` — `save`, `update`, `findByProviderMessageId`
  - `EmailSuppressionRepositoryPort` — `isSuppressed(email)`, `suppress({ email, reason, detail })`
  - `RecipientReaderPort` — `forUser(userId)`, `forProviderMembers(providerId)`
  - `TemplateRendererPort` — `render(type, locale, payload)`
  - `EmailServicePort.sendEmail(message): Promise<{ messageId: string | null }>`

This task is mostly types. It commits with Task 4, which is the first thing to implement them — except the `EmailServicePort` change, which touches existing callers and must be verified now.

- [ ] **Step 1: Write the repository ports**

```ts
// app/ports/outbound/notification-delivery.repository.port.ts
import type { NotificationDelivery } from "../../../domain/aggregates/notification-delivery.aggregate";

export interface NotificationDeliveryRepositoryPort {
  /** Stores a new attempt and returns its assigned id. */
  save(entity: NotificationDelivery): Promise<string>;

  /**
   * Writes a status transition onto an existing row.
   *
   * Separate from `save` rather than an upsert: the two happen at genuinely
   * different moments — one before the network call and one after — and an
   * upsert would let a caller skip the first, which is the whole point of
   * writing the row up front.
   */
  update(id: string, entity: NotificationDelivery): Promise<void>;

  /** For correlating a provider's bounce webhook back to what we sent. */
  findByProviderMessageId(providerMessageId: string): Promise<NotificationDelivery | null>;
}
```

```ts
// app/ports/outbound/email-suppression.repository.port.ts
export type SuppressionReason = "bounce" | "complaint";

export interface EmailSuppressionRepositoryPort {
  isSuppressed(email: string): Promise<boolean>;

  /**
   * Idempotent. A second bounce for an address already suppressed is not an
   * error and must not rewrite the first reason — the earliest one is why we
   * stopped.
   */
  suppress(input: {
    email: string;
    reason: SuppressionReason;
    detail?: unknown;
  }): Promise<void>;
}
```

- [ ] **Step 2: Write the recipient reader port**

```ts
// app/ports/outbound/recipient-reader.port.ts

/** Somebody an email can be addressed to, in the language they chose. */
export interface Recipient {
  /** Null for a delivery to an address with no account behind it. */
  userId: string | null;
  email: string;
  /** From `ntizo_user.profile.language`, or a caller-supplied fallback. */
  locale: string;
}

/**
 * Who to write to, and in what language.
 *
 * An outbound port on this context rather than a reach into User or Provider:
 * the same rule Phase 1's `ProviderMemberReaderPort` and `UserByEmailReaderPort`
 * follow. The adapter is the one place the coupling is written down.
 *
 * **`forProviderMembers` returns several.** One workspace notification becomes
 * one delivery per member, each in that member's own language — a Portuguese
 * owner and a French colleague get their own. That is the whole reason locale
 * lives on the delivery rather than on the notification.
 */
export interface RecipientReaderPort {
  forUser(userId: string): Promise<Recipient | null>;
  forProviderMembers(providerId: string): Promise<Recipient[]>;
}
```

- [ ] **Step 3: Write the template renderer port**

```ts
// app/ports/outbound/template-renderer.port.ts
import type { NotificationType } from "@ntizo/shared";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * A type plus a language plus the snapshot, rendered.
 *
 * `payload` is the notification's own snapshot, unconstrained by design — the
 * template for a type is what knows that type's fields, and is where a wrong
 * assumption should fail rather than in a shared schema nobody can change
 * without touching both sides.
 *
 * Returns `null` for a type with no template. Not a throw: a type can be
 * raised into an inbox before anybody has written its email, and that must
 * leave the inbox row standing rather than failing the whole raise.
 */
export interface TemplateRendererPort {
  render(
    type: NotificationType,
    locale: string,
    payload: Record<string, unknown>,
  ): RenderedEmail | null;
}
```

- [ ] **Step 4: Make the email port return the message id**

The current `EmailServicePort.sendEmail` returns `void`, and `ResendEmailServiceAdapter` destructures only `{ error }` from Resend's response — discarding the id that `notification_delivery.provider_message_id` needs and that the bounce webhook correlates on.

`email-service.port.ts`:

```ts
export interface EmailMessage {
  to: string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
}

export interface SendResult {
  /**
   * The provider's own id for this message, when it gives one.
   *
   * Null from the console adapter, which sends nothing — and a delivery
   * recorded against it is genuinely a delivery with no provider id, not a
   * missing value to paper over.
   */
  messageId: string | null;
}

export interface EmailServicePort {
  sendEmail(message: EmailMessage): Promise<SendResult>;
}
```

`resend-email-service.adapter.ts` — take `data` as well as `error`:

```ts
    const { data, error } = await client.emails.send({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.htmlBody,
      text: message.textBody,
    });

    if (error) {
      throw new Error(`Resend error: ${error.name} — ${error.message}`);
    }

    // The id is what a bounce webhook arrives carrying, and the only way back
    // from "this address bounced" to "this is what we sent it".
    return { messageId: data?.id ?? null };
```

`console-email-service.adapter.ts` returns `{ messageId: null }`, and the `LazyEmailServiceAdapter` in `resolve-email-service.ts` returns what it delegates to.

**Read each of the three existing call sites before changing the signature** — better-auth's verification and reset hooks, and `invite-provider-member`'s adapter. Returning a value where `void` was expected is backwards compatible, but confirm rather than assume; one of them may destructure.

- [ ] **Step 5: Typecheck, lint, and run the existing email tests**

```bash
cd packages/backend && bun run typecheck && bun run lint && bun test src/shared/infrastructure/email
```

Both gates matter: `lint` catches an unused import that `typecheck` will not, and this repo enforces `no-unused-vars` as an error through ESLint rather than tsconfig.

No commit — this lands with Task 4.

---

## Task 4: The repositories and the recipient reader

**Files:**
- Create: `.../infrastructure/repositories/drizzle/notification-delivery.repository.ts`
- Create: `.../infrastructure/repositories/drizzle/email-suppression.repository.ts`
- Create: `.../infrastructure/outbound-adapters/cross-bc/recipient-reader.adapter.ts`
- Test: `.../notification/__tests__/notification-delivery.repository.test.ts`

**Interfaces:**
- Consumes: the ports from Task 3, the tables from Task 1, the aggregate from Task 2.
- Produces: `DrizzleNotificationDeliveryRepository`, `DrizzleEmailSuppressionRepository`, `DrizzleRecipientReader`.

- [ ] **Step 1: Write the failing test**

Against the real database. **Wrap every repository call in `__runWithTransactionContextForTests`** — the repositories resolve their handle through `getDb()` → AsyncLocalStorage, which only a request binds. Copy the setup from Phase 1's `notification.repository.test.ts`, including `drizzle(sql, { schema: authSchema })`; a bare `drizzle(sql)` does not satisfy the `DrizzleDb` type the helper expects.

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { NotificationType } from "@ntizo/shared";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { emailSuppression } from "../../../shared/infrastructure/database/notification/schemas";
import { user } from "../../../shared/infrastructure/database/user/schemas";
import { profile } from "../../../shared/infrastructure/database/user/schemas";
import { NotificationDelivery } from "../domain/aggregates/notification-delivery.aggregate";
import { DrizzleNotificationDeliveryRepository } from "../infrastructure/repositories/drizzle/notification-delivery.repository";
import { DrizzleEmailSuppressionRepository } from "../infrastructure/repositories/drizzle/email-suppression.repository";
import { DrizzleRecipientReader } from "../infrastructure/outbound-adapters/cross-bc/recipient-reader.adapter";

const url = process.env["DEV_DB_URL"];
if (!url) throw new Error("DEV_DB_URL is not set — see packages/backend/.env");

const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema: authSchema });
const deliveries = new DrizzleNotificationDeliveryRepository();
const suppressions = new DrizzleEmailSuppressionRepository();
const recipients = new DrizzleRecipientReader();

const suffix = crypto.randomUUID();
let anaId: string;
const anaEmail = `ana-${suffix}@ntizo.test`;

beforeAll(async () => {
  anaId = crypto.randomUUID();
  await db.insert(user).values({ id: anaId, email: anaEmail, role: "customer", status: "active" });
  await db.insert(profile).values({ userId: anaId, firstName: "Ana", language: "pt-MZ" });
});

afterAll(async () => {
  await db.delete(emailSuppression).where(eq(emailSuppression.email, anaEmail));
  await db.delete(user).where(eq(user.id, anaId));
  await sql.end();
});

describe("the delivery record", () => {
  test("a queued row can be found again by the id its send returned", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const id = await deliveries.save(
        NotificationDelivery.queue({
          type: NotificationType.Welcome,
          toEmail: anaEmail,
          locale: "pt-MZ",
        }),
      );
      const sent = NotificationDelivery.queue({
        type: NotificationType.Welcome,
        toEmail: anaEmail,
        locale: "pt-MZ",
      }).markSent(`msg-${suffix}`);
      await deliveries.update(id, sent);

      const found = await deliveries.findByProviderMessageId(`msg-${suffix}`);
      expect(found?.status).toBe("sent");
      expect(found?.toEmail).toBe(anaEmail);
    });
  });

  test("an unknown provider id finds nothing rather than throwing", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      expect(await deliveries.findByProviderMessageId(`nope-${suffix}`)).toBeNull();
    });
  });
});

describe("suppression", () => {
  test("an address nobody complained about is not suppressed", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      expect(await suppressions.isSuppressed(anaEmail)).toBe(false);
    });
  });

  test("suppressing once, then again, keeps the first reason", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      await suppressions.suppress({ email: anaEmail, reason: "bounce" });
      await suppressions.suppress({ email: anaEmail, reason: "complaint" });
      expect(await suppressions.isSuppressed(anaEmail)).toBe(true);
    });
    const [row] = await db.select().from(emailSuppression).where(eq(emailSuppression.email, anaEmail));
    expect(row?.reason).toBe("bounce");
  });
});

describe("who to write to", () => {
  test("reads a person's own language, not a default", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const r = await recipients.forUser(anaId);
      expect(r?.email).toBe(anaEmail);
      expect(r?.locale).toBe("pt-MZ");
    });
  });

  test("a user with no profile still gets an address", async () => {
    // A profile row is created on sign-up, but this must not be the thing that
    // silently drops an email if one is ever missing.
    const orphanId = crypto.randomUUID();
    const orphanEmail = `orphan-${suffix}@ntizo.test`;
    await db.insert(user).values({ id: orphanId, email: orphanEmail, role: "customer", status: "active" });
    await __runWithTransactionContextForTests(db, async () => {
      const r = await recipients.forUser(orphanId);
      expect(r?.email).toBe(orphanEmail);
      expect(r?.locale).toBe("en-US");
    });
    await db.delete(user).where(eq(user.id, orphanId));
  });

  test("an unknown user is null, not an empty recipient", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      expect(await recipients.forUser(crypto.randomUUID())).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/notification/__tests__/notification-delivery.repository.test.ts
```

Expected: FAIL — the repository modules do not exist.

- [ ] **Step 3: Write the delivery repository**

```ts
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { notificationDelivery } from "../../../../../shared/infrastructure/database/notification/schemas";
import type { NotificationType } from "@ntizo/shared";
import { NotificationDelivery } from "../../../domain/aggregates/notification-delivery.aggregate";
import type { NotificationDeliveryRepositoryPort } from "../../../app/ports/outbound/notification-delivery.repository.port";

export class DrizzleNotificationDeliveryRepository
  implements NotificationDeliveryRepositoryPort
{
  async save(entity: NotificationDelivery): Promise<string> {
    const [row] = await getDb()
      .insert(notificationDelivery)
      .values({
        notificationId: entity.notificationId,
        type: entity.type,
        channel: entity.channel,
        toEmail: entity.toEmail,
        locale: entity.locale,
        status: entity.status,
        providerMessageId: entity.providerMessageId,
        error: entity.error,
      })
      .returning({ id: notificationDelivery.id });
    return row!.id;
  }

  /**
   * `updatedAt` is set explicitly because a column default only fires on
   * insert. Without this a delivery that failed would keep advertising the
   * moment it was queued, and "what is stuck and for how long" is the question
   * this table exists to answer.
   */
  async update(id: string, entity: NotificationDelivery): Promise<void> {
    await getDb()
      .update(notificationDelivery)
      .set({
        status: entity.status,
        providerMessageId: entity.providerMessageId,
        error: entity.error,
        updatedAt: new Date(),
      })
      .where(eq(notificationDelivery.id, id));
  }

  /**
   * Newest first, because a provider can reuse an id across a resend and the
   * most recent attempt is the one a webhook is about.
   */
  async findByProviderMessageId(
    providerMessageId: string,
  ): Promise<NotificationDelivery | null> {
    const [row] = await getDb()
      .select()
      .from(notificationDelivery)
      .where(eq(notificationDelivery.providerMessageId, providerMessageId))
      .orderBy(desc(notificationDelivery.createdAt), desc(notificationDelivery.id))
      .limit(1);

    if (!row) return null;
    return NotificationDelivery.rehydrate({
      id: row.id,
      notificationId: row.notificationId,
      type: row.type as NotificationType,
      channel: "EMAIL",
      toEmail: row.toEmail,
      locale: row.locale,
      status: row.status as NotificationDelivery["status"],
      providerMessageId: row.providerMessageId,
      error: row.error,
    });
  }
}
```

- [ ] **Step 4: Write the suppression repository**

```ts
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { emailSuppression } from "../../../../../shared/infrastructure/database/notification/schemas";
import type {
  EmailSuppressionRepositoryPort,
  SuppressionReason,
} from "../../../app/ports/outbound/email-suppression.repository.port";

export class DrizzleEmailSuppressionRepository implements EmailSuppressionRepositoryPort {
  async isSuppressed(email: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ email: emailSuppression.email })
      .from(emailSuppression)
      .where(eq(emailSuppression.email, email))
      .limit(1);
    return row !== undefined;
  }

  /**
   * `ON CONFLICT DO NOTHING`, so the FIRST reason survives.
   *
   * A complaint arriving after a bounce does not rewrite why this address was
   * stopped, and two webhooks racing for the same address both succeed rather
   * than one failing on the primary key. Read-then-insert would let both read
   * "nothing here" and the second collide.
   */
  async suppress(input: {
    email: string;
    reason: SuppressionReason;
    detail?: unknown;
  }): Promise<void> {
    await getDb()
      .insert(emailSuppression)
      .values({
        email: input.email,
        reason: input.reason,
        detail: input.detail ?? null,
      })
      .onConflictDoNothing();
  }
}
```

- [ ] **Step 5: Write the recipient reader**

```ts
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { profile, user } from "../../../../../shared/infrastructure/database/user/schemas";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { Recipient, RecipientReaderPort } from "../../../app/ports/outbound/recipient-reader.port";

/**
 * The language a recipient gets when they have no profile row.
 *
 * The column itself is `notNull().default("en-US")`, so this only applies when
 * the whole row is missing — which sign-up makes impossible today. Chosen
 * anyway rather than dropping the recipient: an email in the wrong language is
 * recoverable and an email nobody sent is not.
 */
const FALLBACK_LOCALE = "en-US";

export class DrizzleRecipientReader implements RecipientReaderPort {
  async forUser(userId: string): Promise<Recipient | null> {
    const [row] = await getDb()
      .select({ id: user.id, email: user.email, language: profile.language })
      .from(user)
      // LEFT, not inner: a user with no profile must still be reachable. An
      // inner join here would silently drop them, and a dropped email looks
      // exactly like an email that was never triggered.
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(eq(user.id, userId))
      .limit(1);

    if (!row) return null;
    return { userId: row.id, email: row.email, locale: row.language ?? FALLBACK_LOCALE };
  }

  /**
   * Every member of a workspace, each in their own language.
   *
   * One notification, several deliveries. This is the reason `locale` lives on
   * the delivery rather than on the notification: a Portuguese owner and a
   * French colleague read the same event in different words.
   */
  async forProviderMembers(providerId: string): Promise<Recipient[]> {
    const members = await getDb()
      .select({ userId: providerMember.userId })
      .from(providerMember)
      .where(eq(providerMember.providerId, providerId));

    if (members.length === 0) return [];
    const ids = members.map((m) => m.userId);

    const rows = await getDb()
      .select({ id: user.id, email: user.email, language: profile.language })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(inArray(user.id, ids));

    return rows.map((r) => ({
      userId: r.id,
      email: r.email,
      locale: r.language ?? FALLBACK_LOCALE,
    }));
  }
}
```

- [ ] **Step 6: Run it and watch it pass**

Expected: PASS, 7 tests plus everything Phase 1 left green.

- [ ] **Step 7: Break-check the LEFT JOIN**

Change `leftJoin` to `innerJoin` in `forUser` and re-run. "a user with no profile still gets an address" must fail. Restore, confirm green.

This is the same trap Phase 1's inbox query had, and the same reason: a join that drops rows is invisible to any mock, which is why these tests hit a real database.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/notification \
        packages/backend/src/shared/infrastructure/email
git commit -m "feat(notification): the delivery repositories, and a sender that keeps its receipt

EmailServicePort.sendEmail returned void and the Resend adapter
destructured only { error } — throwing away the provider's message id,
which is the only way back from 'this address bounced' to 'this is what
we sent it'. It now returns { messageId }, null from the console adapter
because that one genuinely sends nothing.

The recipient reader LEFT joins profile. A user with no profile row must
still be reachable: an inner join would drop them silently, and a dropped
email looks exactly like an email nobody triggered. Break-checked.

forProviderMembers returns one recipient per member, each with their own
language — the reason locale lives on the delivery and not on the
notification.

suppress() is ON CONFLICT DO NOTHING, so the first reason survives a
later complaint and two racing webhooks both succeed."
```

---

## Task 5: The templates, five types across eight locales

**Files:**
- Create: `bounded-contexts/notification/infrastructure/templates/copy.ts`
- Create: `.../templates/{welcome,provider-workspace-welcome,provider-verified,provider-documents-required,team-invitation}.template.ts`
- Create: `.../templates/registry.ts`
- Create: `.../infrastructure/outbound-adapters/template-renderer.adapter.ts`
- Test: `.../notification/__tests__/templates.test.ts`

**Interfaces:**
- Consumes: `TemplateRendererPort`, `RenderedEmail` (Task 3); `emailLayout`, `buttonHtml` from `shared/infrastructure/email/templates/layout.ts`.
- Produces: `TEMPLATE_REGISTRY: Partial<Record<NotificationType, TemplateModule>>`, `LocalTemplateRenderer implements TemplateRendererPort`.

**Read `shared/infrastructure/email/templates/provider-invite.template.ts` first.** It is the pattern: a `Copy` interface, one const per locale, a lookup with an English fallback. Its header explains the choice, and Task 5 does not relitigate it.

- [ ] **Step 1: Write the shared shape**

```ts
// templates/copy.ts

/**
 * The eight this platform ships. Kept here rather than imported from the
 * frontend's i18n config: the backend must not depend on a bundle it never
 * loads, and this list changing is a deliberate act in both places.
 */
export const TEMPLATE_LOCALES = [
  "en-US", "pt-MZ", "pt-PT", "es-ES", "fr-FR", "it-IT", "de-DE", "nl-NL",
] as const;

export type TemplateLocale = (typeof TEMPLATE_LOCALES)[number];

/**
 * Picks the copy for a locale, falling back to English.
 *
 * Two fallbacks, in order: an exact match, then the language without its
 * region — so a `pt-BR` we do not ship still reads Portuguese rather than
 * English. Only then English. A Mozambican reader getting Brazilian
 * Portuguese is a much smaller failure than getting a language they may not
 * read at all.
 */
export function pickCopy<T>(byLocale: Record<string, T>, locale: string): T {
  const exact = byLocale[locale];
  if (exact) return exact;

  const language = locale.split("-")[0];
  const sameLanguage = Object.entries(byLocale).find(([k]) => k.split("-")[0] === language);
  if (sameLanguage) return sameLanguage[1];

  return byLocale["en-US"]!;
}

/** Every template module exports exactly this. */
export interface TemplateModule {
  render(
    locale: string,
    payload: Record<string, unknown>,
  ): { subject: string; html: string; text: string };
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { TEMPLATE_LOCALES } from "../infrastructure/templates/copy";
import { TEMPLATE_REGISTRY } from "../infrastructure/templates/registry";
import { LocalTemplateRenderer } from "../infrastructure/outbound-adapters/template-renderer.adapter";

const renderer = new LocalTemplateRenderer();

/** One payload per type, matching what Phase 1's handlers actually raise. */
const PAYLOADS: Record<string, Record<string, unknown>> = {
  [NotificationType.Welcome]: { firstName: "Ana" },
  [NotificationType.ProviderWorkspaceWelcome]: { type: "organization" },
  [NotificationType.ProviderVerified]: { from: "pending", to: "active" },
  [NotificationType.ProviderDocumentsRequired]: { from: "pending", to: "rejected" },
  [NotificationType.TeamInvitation]: {
    providerId: "p1",
    providerName: "Salão X",
    role: "staff",
  },
};

describe("every template renders in every locale", () => {
  for (const [type, mod] of Object.entries(TEMPLATE_REGISTRY)) {
    for (const locale of TEMPLATE_LOCALES) {
      it(`${type} renders in ${locale}`, () => {
        const out = mod!.render(locale, PAYLOADS[type]!);
        expect(out.subject.trim().length).toBeGreaterThan(0);
        expect(out.html.trim().length).toBeGreaterThan(0);
        expect(out.text.trim().length).toBeGreaterThan(0);
        // An unreplaced placeholder is the failure this whole table-driven
        // test exists to catch: it renders, it looks fine in review, and it
        // ships "{{providerName}}" to a customer.
        expect(out.subject).not.toMatch(/\{\{|\}\}|undefined|\[object/);
        expect(out.html).not.toMatch(/\{\{|\}\}|undefined|\[object/);
        expect(out.text).not.toMatch(/\{\{|\}\}|undefined|\[object/);
      });
    }
  }
});

describe("the locale fallback", () => {
  it("gives a Brazilian reader Portuguese, not English", () => {
    const pt = renderer.render(NotificationType.Welcome, "pt-BR", { firstName: "Ana" })!;
    const en = renderer.render(NotificationType.Welcome, "en-US", { firstName: "Ana" })!;
    expect(pt.subject).not.toBe(en.subject);
  });

  it("falls all the way back to English for a language nobody wrote", () => {
    const ja = renderer.render(NotificationType.Welcome, "ja-JP", { firstName: "Ana" })!;
    const en = renderer.render(NotificationType.Welcome, "en-US", { firstName: "Ana" })!;
    expect(ja.subject).toBe(en.subject);
  });
});

describe("a type with no template", () => {
  it("returns null rather than throwing", () => {
    // A type can reach an inbox before anybody writes its email. That must
    // leave the inbox row standing, not fail the raise that created it.
    expect(renderer.render(NotificationType.BookingConfirmed, "en-US", {})).toBeNull();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd packages/backend && bun test src/modules/ntizo/bounded-contexts/notification/__tests__/templates.test.ts
```

Expected: FAIL — the registry does not exist.

- [ ] **Step 4: Write one template, in full, as the model**

`welcome.template.ts` — write all eight locales. The other four follow the same shape.

```ts
import { emailLayout, buttonHtml } from "../../../../../shared/infrastructure/email/templates/layout";
import { pickCopy, type TemplateModule } from "./copy";

interface Copy {
  subject: string;
  heading: (firstName: string | null) => string;
  body: string;
  cta: string;
  disclaimer: string;
}

const EN: Copy = {
  subject: "Welcome to Ntizo",
  // `firstName` is nullable all the way from the database: better-auth
  // defaults it to "" and the sign-up command normalises that to null, so a
  // greeting must read without it rather than say "Welcome, !".
  heading: (n) => (n ? `Welcome, ${n}` : "Welcome to Ntizo"),
  body: "Your account is ready. Find someone for the job, or start offering your own services.",
  cta: "Explore Ntizo",
  disclaimer: "You are receiving this because an account was created with this address.",
};

const PT: Copy = {
  subject: "Bem-vindo à Ntizo",
  heading: (n) => (n ? `Bem-vindo, ${n}` : "Bem-vindo à Ntizo"),
  body: "A sua conta está pronta. Encontre quem faça o trabalho, ou comece a oferecer os seus próprios serviços.",
  cta: "Explorar a Ntizo",
  disclaimer: "Recebeu esta mensagem porque foi criada uma conta com este endereço.",
};

const ES: Copy = {
  subject: "Bienvenido a Ntizo",
  heading: (n) => (n ? `Bienvenido, ${n}` : "Bienvenido a Ntizo"),
  body: "Tu cuenta está lista. Encuentra a alguien para el trabajo, o empieza a ofrecer tus propios servicios.",
  cta: "Explorar Ntizo",
  disclaimer: "Recibes este mensaje porque se creó una cuenta con esta dirección.",
};

const FR: Copy = {
  subject: "Bienvenue sur Ntizo",
  heading: (n) => (n ? `Bienvenue, ${n}` : "Bienvenue sur Ntizo"),
  body: "Votre compte est prêt. Trouvez quelqu'un pour le travail, ou commencez à proposer vos propres services.",
  cta: "Découvrir Ntizo",
  disclaimer: "Vous recevez ce message car un compte a été créé avec cette adresse.",
};

const IT: Copy = {
  subject: "Benvenuto su Ntizo",
  heading: (n) => (n ? `Benvenuto, ${n}` : "Benvenuto su Ntizo"),
  body: "Il tuo account è pronto. Trova qualcuno per il lavoro, o inizia a offrire i tuoi servizi.",
  cta: "Esplora Ntizo",
  disclaimer: "Ricevi questo messaggio perché è stato creato un account con questo indirizzo.",
};

const DE: Copy = {
  subject: "Willkommen bei Ntizo",
  heading: (n) => (n ? `Willkommen, ${n}` : "Willkommen bei Ntizo"),
  body: "Ihr Konto ist bereit. Finden Sie jemanden für die Arbeit, oder bieten Sie Ihre eigenen Leistungen an.",
  cta: "Ntizo entdecken",
  disclaimer: "Sie erhalten diese Nachricht, weil mit dieser Adresse ein Konto erstellt wurde.",
};

const NL: Copy = {
  subject: "Welkom bij Ntizo",
  heading: (n) => (n ? `Welkom, ${n}` : "Welkom bij Ntizo"),
  body: "Je account is klaar. Vind iemand voor de klus, of begin met het aanbieden van je eigen diensten.",
  cta: "Ntizo verkennen",
  disclaimer: "Je ontvangt dit bericht omdat er een account is aangemaakt met dit adres.",
};

const BY_LOCALE: Record<string, Copy> = {
  "en-US": EN,
  "pt-MZ": PT,
  "pt-PT": PT,
  "es-ES": ES,
  "fr-FR": FR,
  "it-IT": IT,
  "de-DE": DE,
  "nl-NL": NL,
};

/**
 * Somebody finished signing up.
 *
 * pt-MZ and pt-PT share one Copy deliberately: nothing in this message differs
 * between them, and two identical tables would be two places to fix one typo.
 * They are separate keys so a future divergence is a one-line change here
 * rather than a restructure.
 */
export const welcomeTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const firstName = typeof payload["firstName"] === "string" ? payload["firstName"] : null;
    const appUrl = appBaseUrl();

    return {
      subject: c.subject,
      html: emailLayout({
        heading: c.heading(firstName),
        bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">${escapeHtml(c.body)}</p>${buttonHtml(appUrl, c.cta)}`,
        disclaimer: c.disclaimer,
      }),
      text: `${c.heading(firstName)}\n\n${c.body}\n\n${appUrl}`,
    };
  },
};
```

You will need two helpers this file references. Put them in `copy.ts`:

```ts
/**
 * Escapes what goes into an HTML email body.
 *
 * A provider names their own business and a person types their own first
 * name; both reach a template through the notification's payload. An
 * apostrophe would merely look wrong, but a `<` would not, and an email body
 * is markup like any other.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Where a link in an email should point.
 *
 * `APP_URL` is a per-request Worker binding, so this must be called inside a
 * request — every send is. Falls back to the local dev origin so a console
 * send is still clickable.
 */
export function appBaseUrl(): string {
  const env = infraStore.getEnv();
  return env.APP_URL ?? "http://localhost:3000";
}
```

Import `infraStore` from `../../../../../shared/infrastructure/stores/infra-store`. **Verify that path resolves before trusting it** — this file sits four levels deeper than the ports do, and Phase 1 had an import that was wrong by exactly one level.

- [ ] **Step 5: Write the other four**

Same shape, all eight locales each. What each says:

- **`provider-workspace-welcome`** — the workspace is set up, here is the dashboard. **Does not name the business**: `ProviderCreated` carries no name, and the reader is inside that workspace already. Link to `/provider`.
- **`provider-verified`** — the documents were accepted, the business is now listed. Link to `/provider`.
- **`provider-documents-required`** — the documents need attention. Say what to do, not just what happened. Link to `/provider`.
- **`team-invitation`** — somebody invited you to a workspace, named, with the role. This one **does** name the business: it goes to a personal address, and a person can be invited to several. Payload carries `providerName`. Link to `/sign-in`.

`provider-verified` and `provider-documents-required` receive `{ from, to }` and use neither — the status is implied by which template ran. Say that in a comment so nobody threads the values into the copy.

- [ ] **Step 6: Write the registry and the adapter**

```ts
// templates/registry.ts
import { NotificationType } from "@ntizo/shared";
import type { TemplateModule } from "./copy";
import { welcomeTemplate } from "./welcome.template";
import { providerWorkspaceWelcomeTemplate } from "./provider-workspace-welcome.template";
import { providerVerifiedTemplate } from "./provider-verified.template";
import { providerDocumentsRequiredTemplate } from "./provider-documents-required.template";
import { teamInvitationTemplate } from "./team-invitation.template";

/**
 * Which types have an email, and which do not.
 *
 * Partial on purpose. Thirty-two types exist and five have producers; writing
 * a template for the other twenty-seven would be writing copy for events
 * nothing raises. A type absent here means "no email", not "an error" — see
 * the renderer.
 */
export const TEMPLATE_REGISTRY: Partial<Record<NotificationType, TemplateModule>> = {
  [NotificationType.Welcome]: welcomeTemplate,
  [NotificationType.ProviderWorkspaceWelcome]: providerWorkspaceWelcomeTemplate,
  [NotificationType.ProviderVerified]: providerVerifiedTemplate,
  [NotificationType.ProviderDocumentsRequired]: providerDocumentsRequiredTemplate,
  [NotificationType.TeamInvitation]: teamInvitationTemplate,
};
```

```ts
// infrastructure/outbound-adapters/template-renderer.adapter.ts
import type { NotificationType } from "@ntizo/shared";
import type { RenderedEmail, TemplateRendererPort } from "../../app/ports/outbound/template-renderer.port";
import { TEMPLATE_REGISTRY } from "../templates/registry";

/**
 * A lookup, not a switch.
 *
 * A missing template returns null and the caller records a delivery that never
 * happened rather than failing. The inbox row is already written by then, and
 * losing it because nobody wrote an email would be the tail wagging the dog.
 */
export class LocalTemplateRenderer implements TemplateRendererPort {
  render(
    type: NotificationType,
    locale: string,
    payload: Record<string, unknown>,
  ): RenderedEmail | null {
    const mod = TEMPLATE_REGISTRY[type];
    if (!mod) return null;
    return mod.render(locale, payload);
  }
}
```

- [ ] **Step 7: Run and watch it pass**

Expected: PASS — 40 table-driven cases (5 types × 8 locales) plus 3 fallback and registry tests.

- [ ] **Step 8: Break-check the placeholder guard**

In `team-invitation.template.ts`, change the interpolation to leave `{{providerName}}` literal in the subject. Re-run: the eight `TEAM_INVITATION` cases must fail. Restore.

The point of a table-driven test is that it catches the case nobody thought to write, and an unreplaced placeholder is exactly that — it renders, it reviews fine, and it ships.

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/notification
git commit -m "feat(notification): five emails, in eight languages each

The per-locale Copy table this repo already chose, not a rendering
framework — provider-invite.template.ts argued that case and follow-up
#15 states it: no i18n runtime belongs in a Worker to render one email.

The fallback goes exact, then language-without-region, then English. A
pt-BR reader gets Portuguese rather than English, which is a much smaller
failure than a language they may not read at all.

The registry is partial by design. Thirty-two types exist and five have
producers; a type absent from it means 'no email', not 'an error', and
the renderer returns null so a missing template leaves the inbox row
standing instead of failing the raise that wrote it.

Table-driven across 5 types x 8 locales, asserting no unreplaced
placeholder survives — the failure that renders, reviews fine, and ships
'{{providerName}}' to a customer. Break-checked by leaving one in."
```

---

## Task 6: The delivery command

**Files:**
- Create: `bounded-contexts/notification/app/use-cases/deliver-notification.internal.command.ts`
- Test: `.../notification/__tests__/deliver-notification.test.ts`

**Interfaces:**
- Consumes: all four ports from Task 3, the aggregate from Task 2.
- Produces: `DeliverNotificationInternalCommand.execute({ notificationId, type, audience, userId?, providerId?, payload }): Promise<{ deliveryIds: string[] }>`

- [ ] **Step 1: Write the failing test with fakes**

```ts
import { beforeEach, describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { DeliverNotificationInternalCommand } from "../app/use-cases/deliver-notification.internal.command";

class FakeDeliveries {
  saved: Array<{ status: string; toEmail: string; locale: string }> = [];
  updates: Array<{ id: string; status: string }> = [];
  async save(e: { status: string; toEmail: string; locale: string }) {
    this.saved.push({ status: e.status, toEmail: e.toEmail, locale: e.locale });
    return `d${this.saved.length}`;
  }
  async update(id: string, e: { status: string }) {
    this.updates.push({ id, status: e.status });
  }
  async findByProviderMessageId() {
    return null;
  }
}

class FakeSuppressions {
  suppressed = new Set<string>();
  async isSuppressed(email: string) {
    return this.suppressed.has(email);
  }
  async suppress() {}
}

class FakeRecipients {
  async forUser(userId: string) {
    return userId === "u1" ? { userId, email: "ana@ntizo.test", locale: "pt-MZ" } : null;
  }
  async forProviderMembers() {
    return [
      { userId: "u1", email: "ana@ntizo.test", locale: "pt-MZ" },
      { userId: "u2", email: "luc@ntizo.test", locale: "fr-FR" },
    ];
  }
}

class FakeRenderer {
  rendered: string[] = [];
  render(type: string, locale: string) {
    this.rendered.push(`${type}:${locale}`);
    return { subject: "s", html: "h", text: "t" };
  }
}

class FakeSender {
  sent: string[] = [];
  fail = false;
  async sendEmail(m: { to: string[] }) {
    if (this.fail) throw new Error("resend exploded");
    this.sent.push(m.to[0]!);
    return { messageId: `msg${this.sent.length}` };
  }
}

let deliveries: FakeDeliveries;
let suppressions: FakeSuppressions;
let renderer: FakeRenderer;
let sender: FakeSender;
let cmd: DeliverNotificationInternalCommand;

beforeEach(() => {
  deliveries = new FakeDeliveries();
  suppressions = new FakeSuppressions();
  renderer = new FakeRenderer();
  sender = new FakeSender();
  cmd = new DeliverNotificationInternalCommand(
    deliveries as never,
    suppressions as never,
    new FakeRecipients() as never,
    renderer as never,
    sender as never,
  );
});

const personal = {
  notificationId: "n1",
  type: NotificationType.Welcome,
  audience: "user" as const,
  userId: "u1",
  payload: { firstName: "Ana" },
};

describe("a personal notification", () => {
  it("writes the row before attempting, then updates it", async () => {
    await cmd.execute(personal);
    expect(deliveries.saved[0]!.status).toBe("queued");
    expect(deliveries.updates[0]).toEqual({ id: "d1", status: "sent" });
  });

  it("writes in the recipient's own language", async () => {
    await cmd.execute(personal);
    expect(renderer.rendered).toEqual(["WELCOME:pt-MZ"]);
  });

  it("records a failure without throwing at its caller", async () => {
    sender.fail = true;
    await expect(cmd.execute(personal)).resolves.toBeDefined();
    expect(deliveries.updates[0]!.status).toBe("failed");
  });
});

describe("a workspace notification", () => {
  it("becomes one delivery per member, each in their own language", async () => {
    await cmd.execute({
      notificationId: "n2",
      type: NotificationType.ProviderVerified,
      audience: "provider",
      providerId: "p1",
      payload: { from: "pending", to: "active" },
    });
    expect(renderer.rendered.sort()).toEqual([
      "PROVIDER_VERIFIED:fr-FR",
      "PROVIDER_VERIFIED:pt-MZ",
    ]);
    expect(sender.sent.sort()).toEqual(["ana@ntizo.test", "luc@ntizo.test"]);
  });

  it("one member's failure does not stop the others", async () => {
    // The whole reason these are separate deliveries. A French colleague
    // still hears about it when a Portuguese owner's address bounces.
    let calls = 0;
    sender.sendEmail = async (m: { to: string[] }) => {
      calls += 1;
      if (calls === 1) throw new Error("first one exploded");
      return { messageId: "msg2" };
    };
    await cmd.execute({
      notificationId: "n2",
      type: NotificationType.ProviderVerified,
      audience: "provider",
      providerId: "p1",
      payload: { from: "pending", to: "active" },
    });
    const statuses = deliveries.updates.map((u) => u.status).sort();
    expect(statuses).toEqual(["failed", "sent"]);
  });
});

describe("an address we must not write to", () => {
  it("records the refusal and never calls the sender", async () => {
    suppressions.suppressed.add("ana@ntizo.test");
    await cmd.execute(personal);
    expect(deliveries.saved[0]!.status).toBe("suppressed");
    expect(sender.sent).toEqual([]);
    // Not "failed": nothing was attempted, and the audit must be able to tell
    // the difference between what we tried and what we refused.
    expect(deliveries.updates).toEqual([]);
  });
});

describe("a type with no template", () => {
  it("sends nothing and records nothing, rather than failing", async () => {
    renderer.render = () => null;
    const out = await cmd.execute(personal);
    expect(out.deliveryIds).toEqual([]);
    expect(sender.sent).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — the command does not exist.

- [ ] **Step 3: Write the command**

```ts
import type { NotificationType } from "@ntizo/shared";
import { NotificationDelivery } from "../../domain/aggregates/notification-delivery.aggregate";
import type { NotificationDeliveryRepositoryPort } from "../ports/outbound/notification-delivery.repository.port";
import type { EmailSuppressionRepositoryPort } from "../ports/outbound/email-suppression.repository.port";
import type { Recipient, RecipientReaderPort } from "../ports/outbound/recipient-reader.port";
import type { TemplateRendererPort } from "../ports/outbound/template-renderer.port";
import type { EmailServicePort } from "../../../../../shared/infrastructure/email/email-service.port";

export type DeliverNotificationInput = {
  notificationId: string | null;
  type: NotificationType;
  payload: Record<string, unknown>;
} & (
  | { audience: "user"; userId: string }
  | { audience: "provider"; providerId: string }
);

/**
 * Turning a raised notification into email.
 *
 * **Never throws at its caller.** This runs after the inbox row is written and,
 * in production, after the response has gone. A provider approval must not
 * become a 500 because Resend was slow, and losing the inbox row because an
 * email failed would be the tail wagging the dog. Every failure is recorded on
 * its own delivery row and swallowed.
 *
 * **One notification can be several deliveries.** A workspace notification
 * becomes one per member, each rendered in that member's own language, each
 * with its own row — so a Portuguese owner's bounce does not silence a French
 * colleague.
 *
 * The order inside each delivery is deliberate: check suppression, then write
 * the row, then attempt. Writing after the attempt would leave an isolate that
 * died mid-send with no trace of an email that may well have gone out.
 */
export class DeliverNotificationInternalCommand {
  constructor(
    private readonly deliveries: NotificationDeliveryRepositoryPort,
    private readonly suppressions: EmailSuppressionRepositoryPort,
    private readonly recipients: RecipientReaderPort,
    private readonly renderer: TemplateRendererPort,
    private readonly sender: EmailServicePort,
  ) {}

  async execute(input: DeliverNotificationInput): Promise<{ deliveryIds: string[] }> {
    const to =
      input.audience === "user"
        ? await this.oneOrNone(input.userId)
        : await this.recipients.forProviderMembers(input.providerId);

    const ids: string[] = [];
    for (const recipient of to) {
      const id = await this.deliverOne(input, recipient);
      if (id) ids.push(id);
    }
    return { deliveryIds: ids };
  }

  private async oneOrNone(userId: string): Promise<Recipient[]> {
    const r = await this.recipients.forUser(userId);
    return r ? [r] : [];
  }

  private async deliverOne(
    input: DeliverNotificationInput,
    recipient: Recipient,
  ): Promise<string | null> {
    // Rendered first, because a type with no template should cost nothing —
    // no row, no suppression lookup, no network. A type can reach an inbox
    // before anybody writes its email.
    const rendered = this.renderer.render(input.type, recipient.locale, input.payload);
    if (!rendered) return null;

    if (await this.suppressions.isSuppressed(recipient.email)) {
      // Recorded, not skipped. "We refused to write here" is a fact somebody
      // investigating a missing email needs to find.
      return this.deliveries.save(
        NotificationDelivery.suppressed({
          notificationId: input.notificationId,
          type: input.type,
          toEmail: recipient.email,
          locale: recipient.locale,
        }),
      );
    }

    const queued = NotificationDelivery.queue({
      notificationId: input.notificationId,
      type: input.type,
      toEmail: recipient.email,
      locale: recipient.locale,
    });
    const id = await this.deliveries.save(queued);

    try {
      const { messageId } = await this.sender.sendEmail({
        to: [recipient.email],
        subject: rendered.subject,
        htmlBody: rendered.html,
        textBody: rendered.text,
      });
      await this.deliveries.update(id, queued.markSent(messageId ?? ""));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.deliveries.update(id, queued.markFailed(message));
    }

    return id;
  }
}
```

- [ ] **Step 4: Run and watch it pass**

Expected: PASS, 8 tests.

- [ ] **Step 5: Break-check the isolation**

Move the `try`/`catch` in `deliverOne` to wrap the whole `for` loop in `execute` instead. Re-run: "one member's failure does not stop the others" must fail. Restore.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/notification
git commit -m "feat(notification): turning a raised notification into email

Never throws at its caller. It runs after the inbox row is written and,
in production, after the response has gone — a provider approval must not
become a 500 because Resend was slow, and losing the inbox row because an
email failed would be the tail wagging the dog.

One notification is several deliveries. A workspace notification becomes
one per member, each in that member's own language, each with its own
row, each in its own try — so a Portuguese owner's bounce does not
silence a French colleague. Break-checked by hoisting the catch.

The order within a delivery is deliberate: render, then check
suppression, then write the row, then attempt. Rendering first means a
type with no template costs nothing. Writing before attempting means an
isolate that dies mid-send still leaves a row saying so."
```

---

## Task 7: Hanging delivery off the raise, and getting off the critical path

**Files:**
- Modify: `bounded-contexts/notification/app/use-cases/raise-notification.internal.command.ts`
- Modify: `bounded-contexts/notification/bootstrap/index.ts`
- Modify: `packages/backend/src/shared/infrastructure/stores/infra-store.ts`
- Modify: `apps/backend/api/src/middlewares/config.middleware.ts`
- Modify: `apps/backend/api/src/index.ts` (pass `ctx` through)
- Test: `.../notification/__tests__/raise-with-delivery.test.ts`, `apps/backend/api/src/__tests__/wait-until.test.ts`

**Interfaces:**
- Consumes: `DeliverNotificationInternalCommand` (Task 6).
- Produces: `RaiseNotificationInternalCommand` taking an optional deliverer; `infraStore.waitUntil(promise)`.

**Read `apps/backend/api/src/index.ts` and `middlewares/config.middleware.ts` first.** The Worker's `fetch(request, env, ctx)` already receives `ExecutionContext`; `configMiddleware` already binds env into `infraStore` per request. This task carries `ctx.waitUntil` along the same path.

- [ ] **Step 1: Write the failing test for the raise**

```ts
import { beforeEach, describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { RaiseNotificationInternalCommand } from "../app/use-cases/raise-notification.internal.command";

class FakeRepo {
  saved: unknown[] = [];
  async save(e: unknown) {
    this.saved.push(e);
    return `n${this.saved.length}`;
  }
  async listForUser() { return { items: [], total: 0 }; }
  async listForProvider() { return { items: [], total: 0 }; }
  async countUnreadForUser() { return 0; }
  async countUnreadForProvider() { return 0; }
  async markRead() { return true; }
  async markAllReadForUser() { return 0; }
  async markAllReadForProvider() { return 0; }
}

class SpyDeliverer {
  calls: Array<{ notificationId: string | null; type: string }> = [];
  fail = false;
  async execute(input: { notificationId: string | null; type: string }) {
    if (this.fail) throw new Error("delivery exploded");
    this.calls.push(input);
    return { deliveryIds: ["d1"] };
  }
}

let repo: FakeRepo;
let deliverer: SpyDeliverer;

beforeEach(() => {
  repo = new FakeRepo();
  deliverer = new SpyDeliverer();
});

const input = {
  type: NotificationType.Welcome,
  audience: "user" as const,
  userId: "u1",
  payload: { firstName: "Ana" },
};

describe("raising with a deliverer wired", () => {
  it("writes the inbox row first, then hands the same id to delivery", async () => {
    const cmd = new RaiseNotificationInternalCommand(repo as never, deliverer as never);
    const { notificationId } = await cmd.execute(input);
    expect(notificationId).toBe("n1");
    expect(deliverer.calls[0]!.notificationId).toBe("n1");
  });

  it("still returns the notification when delivery blows up", async () => {
    // The inbox row is the thing that must survive. An email that could not be
    // sent is a worse outcome than no email; a notification lost because of one
    // is worse than both.
    deliverer.fail = true;
    const cmd = new RaiseNotificationInternalCommand(repo as never, deliverer as never);
    await expect(cmd.execute(input)).resolves.toEqual({ notificationId: "n1" });
    expect(repo.saved).toHaveLength(1);
  });
});

describe("raising with no deliverer", () => {
  it("works exactly as it did in phase 1", async () => {
    // The argument is optional so every existing caller and test keeps
    // working, and so a context that wants inbox-only can have it.
    const cmd = new RaiseNotificationInternalCommand(repo as never);
    await expect(cmd.execute(input)).resolves.toEqual({ notificationId: "n1" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — the constructor takes one argument.

- [ ] **Step 3: Append the delivery step**

In `raise-notification.internal.command.ts`, add an optional second constructor argument and a step after the save. Keep the existing doc comment and update the paragraph that says "this is where Phase 2 hangs" to say that it now does.

```ts
  constructor(
    private readonly repo: NotificationRepositoryPort,
    /**
     * Optional so the inbox works without it — a context that wants a row and
     * no email passes nothing, and every phase-1 caller kept working
     * unchanged when this arrived.
     */
    private readonly deliverer?: DeliverNotificationInternalPort,
  ) {}

  async execute(input: RaiseNotificationInput): Promise<{ notificationId: string }> {
    const entity = /* ...as today... */;
    const notificationId = await this.repo.save(entity);

    // Delivery cannot fail the raise. By the time this runs the inbox row
    // exists and is the thing that matters; an email that could not be sent is
    // a worse outcome than no email, and a notification lost because of one is
    // worse than both. The deliverer records its own failures on its own rows.
    if (this.deliverer) {
      try {
        await this.deliverer.execute({ ...deliveryInputFrom(input), notificationId });
      } catch (error) {
        console.error("[notification] delivery failed", {
          notificationId,
          type: input.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { notificationId };
  }
```

`console.error`, not the logger — `getRequestScopedLogger()` throws when no scope is set and nothing in this repo ever sets one. `tx-context.ts:21` does the same thing for the same reason. Leave a comment saying so, or somebody "upgrades" it back into a bug.

Declare `DeliverNotificationInternalPort` as an inbound port beside the others rather than importing the concrete command — the use case must not depend on its own sibling's class.

- [ ] **Step 4: Add `waitUntil` to the infra store**

```ts
// shared/infrastructure/stores/infra-store.ts — alongside getEnv()

/**
 * Hands a promise to the platform to finish after the response is sent.
 *
 * Cloudflare gives every request an `ExecutionContext` whose `waitUntil` keeps
 * the isolate alive for work the client is not waiting on. Rendering and
 * posting an email is hundreds of milliseconds; a provider approval must not
 * pay for it.
 *
 * Falls back to awaiting inline when nothing registered one — a test, a
 * script, or any non-Worker caller. That is slower and correct, which is the
 * right way round for a fallback.
 */
export function waitUntil(promise: Promise<unknown>): void {
  const registered = /* read from the request-scoped store */;
  if (registered) registered(promise);
  else void promise.catch(() => {});
}
```

Follow how `getEnv()` is stored and read; do not invent a second mechanism. In `config.middleware.ts`, put `c.executionCtx.waitUntil.bind(c.executionCtx)` into the store alongside `env`. Hono exposes it as `c.executionCtx`; **check that it is present before binding** — it throws when there is no execution context, which is exactly the non-Worker case the fallback exists for.

- [ ] **Step 5: Wire the bootstrap**

In `bootstrapNotification()`, construct the delivery command and pass it in:

```ts
  const deliveries = new DrizzleNotificationDeliveryRepository();
  const suppressions = new DrizzleEmailSuppressionRepository();
  const recipients = new DrizzleRecipientReader();
  const renderer = new LocalTemplateRenderer();
  // The lazy adapter, not a concrete one: which sender to use depends on
  // RESEND_API_KEY and STAGE, and those are per-request bindings this
  // module-scope bootstrap cannot read yet.
  const sender = new LazyEmailServiceAdapter();

  const deliverNotification = new DeliverNotificationInternalCommand(
    deliveries, suppressions, recipients, renderer, sender,
  );
```

and add `deliverNotification` to `useCases.internal` alongside `raiseNotification`.

- [ ] **Step 6: Run every gate**

```bash
cd packages/backend && bun test src/modules/ntizo && bun run typecheck && bun run lint
cd ../../apps/backend/api && bun run typecheck
```

- [ ] **Step 7: Verify it end to end against a running API**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd apps/backend/api && bun run dev
```

Sign a user up and read both tables:

```bash
curl -s -X POST http://localhost:8788/api/auth/sign-up/email \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -d '{"email":"delivery-test@ntizo.test","password":"Password123!","name":"Ana"}'
```

```bash
cd packages/backend && bun -e '
import postgres from "postgres";
const sql = postgres(process.env["DEV_DB_URL"]!, { max: 1 });
console.log(await sql`SELECT type, audience FROM ntizo_notification.notification ORDER BY created_at DESC LIMIT 3`);
console.log(await sql`SELECT type, to_email, locale, status, error FROM ntizo_notification.notification_delivery ORDER BY created_at DESC LIMIT 3`);
await sql.end();'
```

Expected: a `WELCOME` notification **and** a delivery row. With no `RESEND_API_KEY` set locally the console adapter runs, so the status is `sent` with an empty `provider_message_id` and the body prints to the wrangler log. **Report the actual output.** No delivery row is the finding — do not paper over it.

- [ ] **Step 8: Commit**

```bash
git add packages/backend apps/backend/api/src
git commit -m "feat(notification): a raised notification now leaves the building

Phase 1's raise command said in its own comment that this is where phase
2 hangs. It now does: the inbox row is written, then delivery runs, and
delivery cannot fail the raise. An email that could not be sent is worse
than no email; a notification lost because of one is worse than both.

The deliverer is an optional constructor argument, so every phase-1
caller and test kept working unchanged and a context that wants a row
without an email can still have one.

infraStore gains waitUntil, carrying Cloudflare's ExecutionContext along
the path configMiddleware already uses for env. Rendering and posting an
email is hundreds of milliseconds and a provider approval must not pay
for it. It falls back to awaiting inline when nothing registered one —
slower and correct, which is the right way round.

console.error rather than the logger: getRequestScopedLogger throws when
no scope is set and nothing in this repo ever sets one. tx-context.ts:21
does the same for the same reason."
```

---

## Task 8: The webhook command

**Files:**
- Create: `bounded-contexts/notification/app/use-cases/handle-resend-webhook.internal.command.ts`
- Test: `.../notification/__tests__/handle-resend-webhook.test.ts`

**Interfaces:**
- Consumes: `EmailSuppressionRepositoryPort`, `NotificationDeliveryRepositoryPort`.
- Produces: `HandleResendWebhookInternalCommand.execute({ type, data }): Promise<{ suppressed: boolean }>`

The route and its signature check are Task 9. This task is the decision the route delegates to, testable without a request.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it } from "bun:test";
import { HandleResendWebhookInternalCommand } from "../app/use-cases/handle-resend-webhook.internal.command";

class FakeSuppressions {
  calls: Array<{ email: string; reason: string }> = [];
  async isSuppressed() { return false; }
  async suppress(i: { email: string; reason: string }) { this.calls.push(i); }
}

let suppressions: FakeSuppressions;
let cmd: HandleResendWebhookInternalCommand;

beforeEach(() => {
  suppressions = new FakeSuppressions();
  cmd = new HandleResendWebhookInternalCommand(suppressions as never);
});

describe("events that stop us writing to an address", () => {
  it("suppresses on a hard bounce", async () => {
    const out = await cmd.execute({
      type: "email.bounced",
      data: { to: ["ana@ntizo.test"], bounce: { type: "Permanent" } },
    });
    expect(out.suppressed).toBe(true);
    expect(suppressions.calls[0]).toMatchObject({ email: "ana@ntizo.test", reason: "bounce" });
  });

  it("suppresses on a complaint", async () => {
    await cmd.execute({ type: "email.complained", data: { to: ["ana@ntizo.test"] } });
    expect(suppressions.calls[0]!.reason).toBe("complaint");
  });

  it("suppresses every recipient the event names", async () => {
    await cmd.execute({
      type: "email.bounced",
      data: { to: ["ana@ntizo.test", "luc@ntizo.test"], bounce: { type: "Permanent" } },
    });
    expect(suppressions.calls.map((c) => c.email).sort()).toEqual([
      "ana@ntizo.test",
      "luc@ntizo.test",
    ]);
  });
});

describe("events that must not", () => {
  it("ignores a delivered event", async () => {
    const out = await cmd.execute({ type: "email.delivered", data: { to: ["ana@ntizo.test"] } });
    expect(out.suppressed).toBe(false);
    expect(suppressions.calls).toEqual([]);
  });

  it("ignores an opened event", async () => {
    await cmd.execute({ type: "email.opened", data: { to: ["ana@ntizo.test"] } });
    expect(suppressions.calls).toEqual([]);
  });

  it("does NOT suppress on a soft bounce", async () => {
    // A full mailbox is temporary. Suppressing permanently for it would lose a
    // real recipient forever over a week they were on holiday — and there is
    // no un-suppression path to rescue them.
    const out = await cmd.execute({
      type: "email.bounced",
      data: { to: ["ana@ntizo.test"], bounce: { type: "Transient" } },
    });
    expect(out.suppressed).toBe(false);
    expect(suppressions.calls).toEqual([]);
  });

  it("ignores an event type nobody anticipated", async () => {
    // A provider adds event types without asking. An unknown one must be a
    // no-op, not a crash that makes them retry it forever.
    const out = await cmd.execute({ type: "email.something.new", data: { to: ["a@b.test"] } });
    expect(out.suppressed).toBe(false);
  });

  it("ignores an event with no recipient", async () => {
    const out = await cmd.execute({ type: "email.bounced", data: { bounce: { type: "Permanent" } } });
    expect(out.suppressed).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — module not found.

- [ ] **Step 3: Write the command**

```ts
import type { EmailSuppressionRepositoryPort } from "../ports/outbound/email-suppression.repository.port";

export interface ResendWebhookEvent {
  type: string;
  data?: {
    to?: string[];
    bounce?: { type?: string };
    [k: string]: unknown;
  };
}

/**
 * What a bounce or a complaint means for an address.
 *
 * **Only permanent bounces suppress.** Resend distinguishes `Permanent` from
 * `Transient`, and a full mailbox is the second: suppressing for it would lose
 * a real recipient forever over a week they were away, and there is no
 * un-suppression path to rescue them. Getting this wrong is silent and
 * unrecoverable, which is why the check is explicit rather than "any bounce".
 *
 * **An unknown event type is a no-op, not an error.** Providers add events
 * without asking, and a route that throws on one gets retried until the
 * provider gives up or the log fills.
 */
export class HandleResendWebhookInternalCommand {
  constructor(private readonly suppressions: EmailSuppressionRepositoryPort) {}

  async execute(event: ResendWebhookEvent): Promise<{ suppressed: boolean }> {
    const reason = reasonFor(event);
    if (!reason) return { suppressed: false };

    const recipients = event.data?.to ?? [];
    if (recipients.length === 0) return { suppressed: false };

    for (const email of recipients) {
      await this.suppressions.suppress({ email, reason, detail: event.data });
    }
    return { suppressed: true };
  }
}

function reasonFor(event: ResendWebhookEvent): "bounce" | "complaint" | null {
  if (event.type === "email.complained") return "complaint";
  if (event.type !== "email.bounced") return null;
  // Absent `bounce.type` is treated as permanent: Resend has sent the shape
  // both ways across versions, and a missed suppression costs sender
  // reputation while a wrong one costs one recipient. Neither is free; this
  // is the cheaper mistake.
  const kind = event.data?.bounce?.type;
  return kind === undefined || kind === "Permanent" ? "bounce" : null;
}
```

**Verify Resend's actual payload shape before trusting the field names** — read their webhook documentation or an example event. If `bounce.type` is not what it is called, the `Transient` test will pass for the wrong reason, and that is the single most consequential branch in this file.

- [ ] **Step 4: Run and watch it pass**

Expected: PASS, 9 tests.

- [ ] **Step 5: Break-check the soft-bounce guard**

Change `reasonFor` to return `"bounce"` for any `email.bounced`. Re-run: "does NOT suppress on a soft bounce" must fail. Restore.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/notification
git commit -m "feat(notification): what a bounce means, and what it does not

Only permanent bounces suppress. Resend distinguishes Permanent from
Transient and a full mailbox is the second — suppressing for it would
lose a real recipient forever over a week they were away, and there is no
un-suppression path to rescue them. Silent and unrecoverable, so the
check is explicit rather than 'any bounce'. Break-checked.

An absent bounce.type is read as permanent. A missed suppression costs
sender reputation; a wrong one costs one recipient. Neither is free and
this is the cheaper mistake.

An unknown event type is a no-op. Providers add events without asking,
and a route that throws on one gets retried until they give up."
```

---

## Task 9: The webhook route, and refusing an unsigned body

**Files:**
- Create: `write/notification/http/resend-webhook.routes.ts`
- Create: `write/notification/http/index.ts`
- Modify: `write/notification/index.ts`
- Create: `apps/backend/api/src/webhooks.ts`
- Modify: `apps/backend/api/src/api.ts`
- Modify: `apps/backend/api/package.json` — add `svix`
- Modify: `apps/backend/api/.env.example`, `apps/backend/api/wrangler.jsonc`
- Test: `apps/backend/api/src/__tests__/resend-webhook.test.ts`

**Interfaces:**
- Consumes: `HandleResendWebhookInternalCommand` (Task 8).
- Produces: `POST /api/webhooks/resend`; `createResendWebhookHandler(deps)`.

**This is the repo's first webhook route of any kind**, and `write/<bc>/http/` has never had an occupant. There is no local pattern to copy, so the shape below is the pattern.

**The split matters.** `packages/backend` must not import a web framework binding, so the Hono route lives in `apps/backend/api/src/webhooks.ts` and the decision lives in `write/notification/http/`, which exports a framework-free handler taking a body and headers. Four fitness tests fail CI if this is done the other way round.

- [ ] **Step 1: Add the dependency**

```bash
cd apps/backend/api && bun add svix
```

It goes in `apps/backend/api`, **not** `packages/backend` — signature verification is transport, and transport lives at the app layer.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "bun:test";
import { Webhook } from "svix";
import { createResendWebhookHandler } from "@ntizo/backend/modules/ntizo/write/notification";

const SECRET = "whsec_" + Buffer.from("test-secret-at-least-24-bytes").toString("base64");

class SpyCommand {
  calls: unknown[] = [];
  async execute(e: unknown) {
    this.calls.push(e);
    return { suppressed: true };
  }
}

function sign(payload: string): Record<string, string> {
  const wh = new Webhook(SECRET);
  const id = "msg_test";
  const timestamp = new Date();
  const signature = wh.sign(id, timestamp, payload);
  return {
    "svix-id": id,
    "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "svix-signature": signature,
  };
}

describe("an unsigned or wrongly-signed body", () => {
  it("is refused before it is parsed", async () => {
    const cmd = new SpyCommand();
    const handler = createResendWebhookHandler({ handleWebhook: cmd as never, secret: SECRET });
    const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.test"] } });

    const res = await handler({ body, headers: {} });

    expect(res.status).toBe(401);
    // The command must never have run. A route that verifies after acting has
    // not verified anything.
    expect(cmd.calls).toEqual([]);
  });

  it("refuses a body that was tampered with after signing", async () => {
    const cmd = new SpyCommand();
    const handler = createResendWebhookHandler({ handleWebhook: cmd as never, secret: SECRET });
    const original = JSON.stringify({ type: "email.delivered", data: { to: ["a@b.test"] } });
    const headers = sign(original);
    const tampered = JSON.stringify({ type: "email.bounced", data: { to: ["victim@b.test"] } });

    const res = await handler({ body: tampered, headers });

    expect(res.status).toBe(401);
    expect(cmd.calls).toEqual([]);
  });
});

describe("a properly signed body", () => {
  it("reaches the command and is acknowledged", async () => {
    const cmd = new SpyCommand();
    const handler = createResendWebhookHandler({ handleWebhook: cmd as never, secret: SECRET });
    const body = JSON.stringify({
      type: "email.bounced",
      data: { to: ["a@b.test"], bounce: { type: "Permanent" } },
    });

    const res = await handler({ body, headers: sign(body) });

    expect(res.status).toBe(200);
    expect(cmd.calls).toHaveLength(1);
  });

  it("acknowledges even when the command finds nothing to do", async () => {
    // 200, not 204 or 202. A provider retries anything else, and an ignored
    // event is a successfully handled event.
    const cmd = new SpyCommand();
    cmd.execute = async () => ({ suppressed: false });
    const handler = createResendWebhookHandler({ handleWebhook: cmd as never, secret: SECRET });
    const body = JSON.stringify({ type: "email.opened", data: { to: ["a@b.test"] } });

    const res = await handler({ body, headers: sign(body) });
    expect(res.status).toBe(200);
  });
});

describe("with no secret configured", () => {
  it("refuses everything rather than accepting everything", async () => {
    // The failure mode this guards is a deploy that forgot the variable: an
    // unverified webhook endpoint open to the internet is worse than one that
    // is down, because nobody notices it.
    const cmd = new SpyCommand();
    const handler = createResendWebhookHandler({ handleWebhook: cmd as never, secret: undefined });
    const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.test"] } });

    const res = await handler({ body, headers: sign(body) });
    expect(res.status).toBe(500);
    expect(cmd.calls).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd apps/backend/api && bun test src/__tests__/resend-webhook.test.ts
```

Expected: FAIL — `createResendWebhookHandler` does not exist.

- [ ] **Step 4: Write the framework-free handler**

```ts
// write/notification/http/resend-webhook.routes.ts
import { Webhook } from "svix";
import type { HandleResendWebhookInternalCommand } from "../../../bounded-contexts/notification/app/use-cases/handle-resend-webhook.internal.command";

export interface WebhookRequest {
  body: string;
  headers: Record<string, string>;
}

export interface WebhookResponse {
  status: number;
  body: string;
}

/**
 * Resend's bounce and complaint webhook.
 *
 * **Framework-free on purpose.** It takes a raw body and headers and returns a
 * status, so `packages/backend` never imports Hono — a rule four fitness tests
 * enforce. The binding lives in `apps/backend/api/src/webhooks.ts`.
 *
 * **The body is verified before it is parsed.** Not merely before it is acted
 * on: parsing attacker-controlled JSON is itself a decision, and svix verifies
 * the exact bytes that were signed. Parsing first and verifying after would
 * mean the signature covers something other than what was read.
 *
 * **A missing secret refuses everything.** The failure it guards is a deploy
 * that forgot the variable, which leaves an unverified endpoint open to the
 * internet — worse than one that is down, because nobody notices.
 */
export function createResendWebhookHandler(deps: {
  handleWebhook: HandleResendWebhookInternalCommand;
  secret: string | undefined;
}) {
  return async (req: WebhookRequest): Promise<WebhookResponse> => {
    if (!deps.secret) {
      console.error("[webhook] RESEND_WEBHOOK_SECRET is not set — refusing every event");
      return { status: 500, body: JSON.stringify({ error: "not configured" }) };
    }

    let event: unknown;
    try {
      event = new Webhook(deps.secret).verify(req.body, req.headers);
    } catch {
      // Deliberately no detail. Telling a caller *why* verification failed is
      // telling them how to pass it.
      return { status: 401, body: JSON.stringify({ error: "invalid signature" }) };
    }

    await deps.handleWebhook.execute(event as never);

    // 200 whatever the command decided. A provider retries anything else, and
    // an event we chose to ignore was handled successfully.
    return { status: 200, body: JSON.stringify({ ok: true }) };
  };
}
```

- [ ] **Step 5: Bind it in the app**

```ts
// apps/backend/api/src/webhooks.ts
import type { Hono } from "hono";
import { createResendWebhookHandler } from "@ntizo/backend/modules/ntizo/write/notification";
import { bootstrapNotification } from "@ntizo/backend/modules/ntizo/bounded-contexts/notification";
import type { AppBindings } from "./types";

/**
 * Its own mount, deliberately outside `/api/*`'s CORS middleware.
 *
 * A webhook has no origin — it is a server-to-server POST, and `authCors`
 * exists to police browsers. Running it here would either reject Resend or
 * force the allowlist open for something that never needed it.
 */
export function mountWebhooks(app: Hono<{ Bindings: AppBindings }>) {
  app.post("/api/webhooks/resend", async (c) => {
    const notification = bootstrapNotification();
    const handler = createResendWebhookHandler({
      handleWebhook: notification.useCases.internal.handleResendWebhook,
      secret: c.env.RESEND_WEBHOOK_SECRET,
    });

    // The RAW body, not `c.req.json()`. svix verifies the exact bytes that
    // were signed, and re-serialising parsed JSON changes them.
    const body = await c.req.text();
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((v, k) => {
      headers[k] = v;
    });

    const res = await handler({ body, headers });
    return c.body(res.body, res.status as 200, { "content-type": "application/json" });
  });
}
```

Mount it in `api.ts` **before** `app.use("/api/*", authCors)` if that middleware would otherwise catch it — read the file and check the ordering rather than assuming Hono's.

Add `RESEND_WEBHOOK_SECRET` to `AppBindings` in `types.ts`, to `.env.example`, and to `wrangler.jsonc`'s documentation — **not** as a plain `var`, since it is a secret. Say in a comment that it is set with `wrangler secret put`.

- [ ] **Step 6: Run it and watch it pass**

```bash
cd apps/backend/api && bun test src && bun run typecheck && bun run lint
cd ../../.. && bun run test
```

Expected: PASS, 5 webhook tests. **The fitness gates matter most here** — `fitness-no-framework-in-packages` fails if `svix` or Hono leaked into `packages/backend`. `svix` in `write/notification/http/` is fine; Hono is not.

- [ ] **Step 7: Break-check the verification**

Move the `verify` call to *after* `handleWebhook.execute`. Re-run: both refusal tests must fail. Restore.

A route that verifies after acting has not verified anything, and this is the one test in the plan whose failure would be a security hole rather than a bug.

- [ ] **Step 8: Commit**

```bash
git add packages/backend apps/backend/api
git commit -m "feat(notification): the resend webhook, refused unless it is signed

This repo's first webhook route, and write/<bc>/http/ its first occupant.

Framework-free in packages/backend — the handler takes a raw body and
headers and returns a status; the Hono binding lives in the api app.
Four fitness tests fail if that is done the other way round.

Verified before parsed, not merely before acted on. Parsing
attacker-controlled JSON is itself a decision, and svix verifies the
exact bytes that were signed — which is also why the binding reads
c.req.text() rather than c.req.json(): re-serialising parsed JSON changes
them. Break-checked by moving the verify after the command.

A missing secret refuses everything. The failure it guards is a deploy
that forgot the variable, leaving an unverified endpoint open to the
internet — worse than one that is down, because nobody notices.

Mounted outside /api/*'s CORS middleware: a webhook has no origin, and
authCors exists to police browsers."
```

---

## Task 10: Prove it end to end

**Files:**
- Modify: `apps/e2e/tests/notifications.spec.ts`
- Create: `packages/backend/scripts/check-delivery.ts`
- Modify: `docs/superpowers/follow-ups.md`

**Interfaces:** consumes everything above.

- [ ] **Step 1: Extend the e2e spec**

Phase 1's spec proves a sign-up produces an inbox row. Add one assertion to the same flow: a `notification_delivery` row exists for that address.

The e2e harness runs against its own throwaway Postgres and `apps/e2e/fixtures/db.ts` already opens a client to it. Read that fixture and use it; do not open a second connection.

```ts
test("registering also queues an email, recorded per attempt", async ({ page }) => {
  const email = `delivery-${crypto.randomUUID()}@ntizo.test`;
  await createVerifiedUser({ email });
  await page.goto("/sign-in");
  await fillSignInForm(page, { email, password: "Password123!" });
  await page.waitForURL("http://localhost:3000/");

  // The delivery is written by the same after-commit dispatch as the inbox
  // row, so it is there by the time the session exists. Polled rather than
  // asserted once: waitUntil means the send finishes after the response.
  await expect
    .poll(async () => {
      const rows = await sql()`
        SELECT status FROM ntizo_notification.notification_delivery
        WHERE to_email = ${email}`;
      return rows.length;
    }, { timeout: 10_000 })
    .toBe(1);
});
```

**Check whether `createVerifiedUser` accepts an email** before writing it this way — Phase 1's fixture generates its own. If it does not, extend it the way the provider fixture was extended, keeping existing callers working.

- [ ] **Step 2: Run the e2e suite**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
docker run --rm -d --name ntizo-e2e-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ntizo_e2e -p 55432:5432 postgres:16-alpine
bun run e2e
```

**All 17 must pass.** If the new one does not, that is the finding — report it rather than weakening the assertion. Do **not** call `resetDb()` from a spec; `globalSetup` resets once and a second reset drops schemas out from under parallel specs.

- [ ] **Step 3: Write the operator script**

`packages/backend/scripts/check-delivery.ts` — answers "did the email arrive?" without a database client:

```
bun run --env-file=.env scripts/check-delivery.ts somebody@example.com
```

Print every delivery for an address, newest first: type, locale, status, provider message id, error, timestamp. Then whether the address is suppressed and why.

This is the whole reason the delivery table exists — "did the invitation arrive?" was unanswerable before it. A table nobody can query without writing SQL answers it only for people who already knew.

- [ ] **Step 4: Close the follow-ups this phase resolves**

In `docs/superpowers/follow-ups.md`:

- **#48** — `TeamInvitation`'s snapshotted `providerName` is now rendered by the invitation template. Resolve it in that file's established shape: struck heading, date, what changed, original reasoning kept below.
- **#15** — verification and password-reset emails are still English-only; **this phase does not fix them** and the entry stays. Add a line noting that the per-locale template pattern now has five more users in `bounded-contexts/notification/infrastructure/templates/`, so whoever takes #15 has more precedent than the single invitation template it was written against.
- **#8** — the outbox relay. Unchanged, but its double-delivery warning now covers deliveries as well as inbox rows: a relay replaying the table would re-send every email ever sent. Add that sentence; it is strictly worse than the inbox case it already describes.

- [ ] **Step 5: Run every gate, from the repo root**

```bash
bun run check-types && bun run lint && bun run test && bun run e2e
```

All four. Report the counts you see.

- [ ] **Step 6: Commit**

```bash
git add apps/e2e packages/backend/scripts docs/superpowers/follow-ups.md
git commit -m "test(notification): prove an email is recorded, and give an operator a way to ask

The e2e spec now asserts a delivery row alongside the inbox row, polled
rather than asserted once because waitUntil finishes the send after the
response has gone.

check-delivery.ts answers 'did the invitation arrive?' for an address
without a database client. That question was unanswerable before this
phase, and a table nobody can query without writing SQL answers it only
for people who already knew.

Closes follow-up #48 — the invitation now renders the workspace name it
has been snapshotting. #15 stays open (verification and reset are still
English-only) with a note that the pattern now has five more users than
the one template it was written against. #8's double-delivery warning
grows to cover deliveries: a relay replaying the table would re-send
every email ever sent, which is worse than the inbox case it describes."
```

---

## Self-Review

**Spec coverage.** Walked the spec's "Email delivery" section and the two tables in "Data model" against tasks:

| Spec requirement | Task |
|---|---|
| `notification_delivery` with `queued` written before the attempt | 1, 2, 6 |
| `email_suppression` keyed by address, first reason wins | 1, 4 |
| A delivery renders without a notification (nullable `notification_id`) | 1, 2 |
| Per-locale `Copy` tables, not react-email | 5 |
| Locale: personal from `profile.language`; workspace one per member | 3, 4, 6 |
| Suppression checked before every send | 6 |
| `POST /api/webhooks/resend`, svix-verified, refused before parsing | 9 |
| Bounce/complaint writes suppression | 8 |
| No retry, no re-validation, no un-suppression UI | 8 (stated in comments) |
| Sending inside `ctx.waitUntil` | 7 |
| Preferences stay disabled; no unsubscribe footer | — **see below** |

**Gaps found and closed while reviewing:**

- **`EmailServicePort` returns `void`.** The spec assumes a `provider_message_id` without noticing the sender discards it. Added to Task 3, with the three existing callers named.
- **The locale fallback was unspecified.** The spec says "the recipient's own language" and stops. A `pt-BR` reader, or any locale not among the eight, needed a rule — Task 5 defines exact → language → English, and argues why.
- **Soft versus hard bounces.** The spec says "a `bounced` or `complained` event writes a suppression row", which would suppress a full mailbox permanently with no way back. Task 8 narrows it to permanent bounces and says why.
- **Preferences and unsubscribe need no task.** The spec's reasoning is that all five live types are transactional by `bucketForNotificationType`, so no switch governs them and transactional mail carries no unsubscribe footer. Phase 1 already removed the SMS column. Nothing to build — recorded here so the absence is visible rather than an oversight.

**Type consistency.** `NotificationDelivery`'s getters (Task 2) are what the repository reads and writes (Task 4), what the command transitions (Task 6), and what the webhook correlates on (Task 8) — `providerMessageId` spelled identically in all four, and `DeliveryStatus`'s four values match the CHECK in Task 1 exactly. `Recipient` is defined once in Task 3 and consumed unchanged in Tasks 4 and 6. `RenderedEmail`'s `{ subject, html, text }` matches what every template returns in Task 5 and what `sendEmail` is handed in Task 6.

**Three things this plan asks the implementer to verify rather than assume**, because guessing them is exactly the placeholder this document must not contain:

1. **Resend's actual webhook payload shape** (Task 8, Step 3) — whether `bounce.type` is what it is called, and what values it takes. The `Transient` branch is the most consequential in the phase and a wrong field name makes its test pass for the wrong reason.
2. **Whether `c.executionCtx` is present** before binding `waitUntil` (Task 7, Step 4). Hono throws when there is no execution context, which is the non-Worker case the fallback exists for.
3. **Whether `createVerifiedUser` accepts an email** (Task 10, Step 1), and the exact import path for `infraStore` from the templates directory (Task 5, Step 4) — Phase 1 had an import wrong by exactly one level, and it cost a round.
