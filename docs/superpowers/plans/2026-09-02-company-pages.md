# Company Pages and Contact Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four public company pages (About, Contact, Share feedback, Careers) in one shared editorial frame, a `contact` bounded context that stores what the two forms send and emails the team, and an admin queue at `/admin/contact` to work it. Support-with-an-account and the FAQ belong to the help center (`2026-09-02-help-center-design.md`); this plan builds around them — see the spec's revision note.

**Architecture:** Backend: a new `contact` bounded context modelled line-for-line on `review` (aggregate, Drizzle repository, use cases, write-tier mutations, read-tier admin query, mounted in `apps/backend/api/src/graphql/private.ts`), plus an inbox email adapter on the shared `EmailServicePort`. Frontend: a `features/company` feature with one `CompanyPage` frame, one `ContactForm` parameterised by kind (`contact` | `feedback`), a new `company` i18n namespace in eight locales, and an admin page on the `/admin/reviews` pattern.

**Tech Stack:** Bun, Hono, `@cosmneo/onion-lasagna` GraphQL field kit, Drizzle + Postgres (Neon), Resend 4.8, React 19, TanStack Start/Router/Query, react-i18next, Tailwind 4, vitest (web, shared), `bun test` (backend), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-09-02-company-pages-design.md` — read it first; the approved copy is in `docs/superpowers/specs/2026-09-02-company-pages.mockup.html` beside it.

## Global Constraints

- **No accent hairline before eyebrow labels, anywhere.** Owner's rule (spec, "Decisions"). Eyebrows are letter-spaced uppercase text only. Do not add `h-px w-8` or any rule beside a label, in code or in tests' fixtures.
- **No number that lives in `platform_settings` appears in copy**: not 2 hours, 15 minutes, 30 minutes, 10%, 3 days. Say "o prazo indicado no pedido" / "the time shown on the request".
- **Contact channels are exactly**: `ola@ntizo.co.mz` (general, careers, and where the contact and feedback forms are forwarded — `CONTACT_INBOX_EMAIL`), `suporte@ntizo.co.mz` (support; printed in the footer, owned by the help center), `privacidade@ntizo.co.mz` (data). Instagram `https://www.instagram.com/ntizo.mz/`, LinkedIn `https://www.linkedin.com/company/ntizo/`. No phone, no street address. Every occurrence in code reads `CONTACT` from `apps/frontend/web/src/shared/lib/contact.ts` (Task 8).
- **Eight locales, pt-MZ first**: `pt-MZ` is authored from the mockup and is the parity reference; `pt-PT`, `en-US`, `es-ES`, `fr-FR`, `de-DE`, `it-IT`, `nl-NL` carry exactly the same dotted key set (the gate in `src/shared/locales/__tests__/locales.test.ts` enforces it). Each language must read as its own language, not a word-for-word transfer.
- **Every sentence about the product states only what it does today** (spec, "Perguntas frequentes"): M-Pesa is the only charge method; no refund path; no customer-initiated cancellation; verification is one identity document reviewed by a person. The FAQ itself is the help center's; its approved text is in `docs/superpowers/specs/2026-09-02-faq-content.md`.
- **Not in this plan, by the 2026-09-02 split with the help center:** no `/support` page, no `/faq` page, no `support` kind, nothing named `support*` on the API, no `/admin/support`. The footer's "Falar com o suporte" and "Perguntas frequentes" links return when the help center's `/help` lands (follow-ups #132).
- **Routes for the four pages are top-level** (`src/routes/about.tsx`, not under `_public`), `ssr: true`, each with its own `<head>` title.
- **Commit style** as the repo does: `feat(company): …`, `feat(contact): …`, `test(web): …`, `docs: …`; body explains why; end every message with

  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BzDMYE843QBMp8tfP3aKpf
  ```
- **Where commands run**: backend tests `cd packages/backend && bun test <path>`; shared tests `cd packages/shared && bunx vitest run <path>`; web tests `cd apps/frontend/web && bunx vitest run <path>`; typecheck in each package with `bun run typecheck`; lint with `bun run lint`.
- **Database-backed backend tests** (`packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/*`) need `DEV_DB_URL` (see `packages/backend/.env`) and the new migration applied to that database first (`cd packages/backend && bun run db:ntizo:dev:migrate`). They run against the shared dev database with a random suffix per run and best-effort cleanup — copy that discipline exactly.
- **Work in a worktree** branched from `origin/dev` (superpowers:using-git-worktrees). Another session is committing on `feat/real-home-page` in the main working tree; do not work there.

---

## File structure

**Shared package** (`packages/shared/src`)
- `enums/contact-enums/index.ts` — kinds, topics per kind, statuses, the reference helper. One definition both tiers and the frontend import.
- `read-models/system/contact/contact-request-admin.schema.ts` (+ `index.ts`, registered in `system/index.ts`) — the admin projection.

**Backend** (`packages/backend/src`)
- `modules/ntizo/shared/infrastructure/database/contact/schemas/contact-request.schema.ts` (+ `schemas/index.ts`, `contact/index.ts`; `database/schemas.ts` re-exports) — the table.
- `modules/ntizo/drizzle.config.ts` — `ntizo_contact` in `schemaFilter`.
- `modules/ntizo/bounded-contexts/contact/domain/aggregates/contact-request.aggregate.ts` — rules.
- `modules/ntizo/bounded-contexts/contact/domain/exceptions.ts` — refusals with public codes.
- `modules/ntizo/bounded-contexts/contact/app/ports/outbound/contact-request.repository.port.ts` — persistence port.
- `modules/ntizo/bounded-contexts/contact/app/ports/outbound/contact-inbox.port.ts` — "tell the team" port.
- `modules/ntizo/bounded-contexts/contact/app/use-cases/submit-contact-request.command.ts`, `list-contact-requests-for-admin.query.ts`, `set-contact-request-status.command.ts`.
- `modules/ntizo/bounded-contexts/contact/infrastructure/repositories/drizzle/contact-request.repository.ts`.
- `modules/ntizo/bounded-contexts/contact/infrastructure/outbound-adapters/email-contact-inbox.adapter.ts`.
- `modules/ntizo/bounded-contexts/contact/bootstrap/index.ts`, `index.ts`.
- `modules/ntizo/write/contact/{graphql/schema/mutations.ts, graphql/handlers/mutations.handlers.ts, index.ts}`; `modules/ntizo/write/schema.ts` merges it.
- `modules/ntizo/read/contact/{graphql/schema/queries.ts, graphql/handlers/queries.handlers.ts, bootstrap/index.ts, index.ts}`; `modules/ntizo/read/schema.ts` merges it.
- `shared/infrastructure/email/email-service.port.ts` (+ `resend-email-service.adapter.ts`, `console-email-service.adapter.ts`) — `replyTo`.
- `shared/infrastructure/stores/infra-store.ts` — `CONTACT_INBOX_EMAIL?`.

**API** (`apps/backend/api`)
- `src/graphql/private.ts` — mounts the three new fields.
- `src/middlewares/config.middleware.ts`, `src/scheduled.ts`, `wrangler.jsonc` — carry `CONTACT_INBOX_EMAIL`.

**Web** (`apps/frontend/web/src`)
- `shared/lib/contact.ts` — the addresses.
- `shared/components/site-header.tsx` — `current: "none"`.
- `features/landing/ui/footer.tsx` — Empresa column (five links), `suporte@`, M-Pesa only.
- `features/become-provider/ui/become-provider-page.tsx` — mailto from `CONTACT`; eyebrow without rule.
- `features/legal/ui/legal-page.tsx` — address interpolated.
- `shared/lib/i18n.ts` — `company` namespace.
- `shared/locales/<8>/company.json` — new; `landing.json`, `legal.json`, `admin.json` — additions.
- `shared/locales/__tests__/locales.test.ts` — `company`, `landing`, `legal` join the gate.
- `features/company/domain/contact-form-validation.ts` — pure validation, import-free.
- `features/company/ui/company-page.tsx` — the frame (band, strip, footer) and `Eyebrow`.
- `features/company/ui/about-page.tsx`, `careers-page.tsx`, `contact-form.tsx`, `contact-request-page.tsx`.
- `features/company/data/contact-request.repository.ts`, `features/company/viewmodel/use-submit-contact-request.ts`.
- `routes/about.tsx`, `contact.tsx`, `feedback.tsx`, `careers.tsx`.
- `features/admin/contact/{data/admin-contact.repository.ts, viewmodel/use-admin-contact.ts, ui/contact-page.tsx}`; `routes/admin/contact.tsx`; `shared/lib/admin-navigation.ts`.
- Tests beside each, named in the tasks.

**E2E** (`apps/e2e/tests/company.spec.ts`).

**Docs**: `docs/superpowers/follow-ups.md` gains entries #126–#132.

---

### Task 1: The contact vocabulary, shared by every tier

**Files:**
- Create: `packages/shared/src/enums/contact-enums/index.ts`
- Modify: `packages/shared/src/enums/index.ts`
- Test: `packages/shared/src/enums/__tests__/contact-enums.test.ts`

**Interfaces:**
- Produces: `CONTACT_REQUEST_KINDS`, `ContactRequestKind`, `contactRequestKindSchema`, `CONTACT_TOPICS`, `ContactTopic`, `isContactTopicForKind(kind, topic)`, `CONTACT_REQUEST_STATUSES`, `ContactRequestStatus`, `contactRequestStatusSchema`, `contactEmailRequired(kind)`, `CONTACT_REFERENCE_LENGTH`, `contactReferenceOf(id)` — all from `@ntizo/shared` (and `@ntizo/shared/enums`).

- [ ] **Step 1: Write the failing test**

`packages/shared/src/enums/__tests__/contact-enums.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CONTACT_REQUEST_KINDS,
  CONTACT_TOPICS,
  isContactTopicForKind,
  contactEmailRequired,
  contactReferenceOf,
} from "../contact-enums";

describe("contact enums", () => {
  it("names the two forms", () => {
    expect(CONTACT_REQUEST_KINDS).toEqual(["contact", "feedback"]);
  });

  it("gives every kind its own topics, ending in a catch-all where the list is a set of reasons", () => {
    expect(CONTACT_TOPICS.contact).toEqual(["general", "partnership", "press", "provider", "other"]);
    expect(CONTACT_TOPICS.feedback).toEqual(["idea", "problem", "praise"]);
  });

  it("refuses a topic that belongs to another kind", () => {
    expect(isContactTopicForKind("contact", "general")).toBe(true);
    expect(isContactTopicForKind("contact", "idea")).toBe(false);
    expect(isContactTopicForKind("feedback", "other")).toBe(false);
  });

  it("only feedback may arrive without a way to reply", () => {
    expect(contactEmailRequired("contact")).toBe(true);
    expect(contactEmailRequired("feedback")).toBe(false);
  });

  it("derives the six-character reference from the id's first hex characters, upper-cased", () => {
    expect(contactReferenceOf("7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b")).toBe("7F3A2C");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/shared && bunx vitest run src/enums/__tests__/contact-enums.test.ts`
Expected: FAIL — cannot resolve `../contact-enums`.

- [ ] **Step 3: Write the enums**

`packages/shared/src/enums/contact-enums/index.ts`:

```ts
import { z } from "zod";

/**
 * The two things somebody can write to us about, named after the form each
 * arrives from. Support with an account is the help center's (its own spec). One vocabulary for the write tier, the read tier and the
 * frontend, so a topic added to the form cannot be one the aggregate refuses.
 */
export const CONTACT_REQUEST_KINDS = ["contact", "feedback"] as const;
export type ContactRequestKind = (typeof CONTACT_REQUEST_KINDS)[number];
export const contactRequestKindSchema = z.enum(CONTACT_REQUEST_KINDS);

/**
 * What each form asks the person to file their message under. Stored as text
 * on the row; validated against this list by the aggregate, per kind.
 */
export const CONTACT_TOPICS = {
  contact: ["general", "partnership", "press", "provider", "other"],
  feedback: ["idea", "problem", "praise"],
} as const satisfies Record<ContactRequestKind, readonly string[]>;
export type ContactTopic = (typeof CONTACT_TOPICS)[ContactRequestKind][number];

export function isContactTopicForKind(kind: ContactRequestKind, topic: string): topic is ContactTopic {
  return (CONTACT_TOPICS[kind] as readonly string[]).includes(topic);
}

export const CONTACT_REQUEST_STATUSES = ["open", "resolved"] as const;
export type ContactRequestStatus = (typeof CONTACT_REQUEST_STATUSES)[number];
export const contactRequestStatusSchema = z.enum(CONTACT_REQUEST_STATUSES);

/** Feedback may arrive with no way to reply; a question or a problem needs one. */
export function contactEmailRequired(kind: ContactRequestKind): boolean {
  return kind !== "feedback";
}

/**
 * The reference a person quotes back to us: the first six hex characters of
 * the request id, upper-cased. Six of a uuid's first group are contiguous,
 * so the admin search can match `id::text ILIKE '<ref>%'` without stripping
 * hyphens.
 */
export const CONTACT_REFERENCE_LENGTH = 6;
export function contactReferenceOf(id: string): string {
  return id.replace(/-/g, "").slice(0, CONTACT_REFERENCE_LENGTH).toUpperCase();
}
```

Append to `packages/shared/src/enums/index.ts`:

```ts
export * from "./contact-enums";
```

- [ ] **Step 4: Run the test and the typecheck**

Run: `cd packages/shared && bunx vitest run src/enums/__tests__/contact-enums.test.ts && bun run typecheck`
Expected: 5 passed; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/enums/contact-enums/index.ts packages/shared/src/enums/index.ts packages/shared/src/enums/__tests__/contact-enums.test.ts
git commit -m "feat(shared): the contact request vocabulary — kinds, topics, statuses, reference"
```

---

### Task 2: The `contact_request` table and its migration

**Files:**
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/contact/schemas/contact-request.schema.ts`
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/contact/schemas/index.ts`
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/contact/index.ts`
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/schemas.ts`
- Modify: `packages/backend/src/modules/ntizo/drizzle.config.ts` (the `schemaFilter` array)
- Generated: `packages/backend/src/modules/ntizo/shared/infrastructure/migrations/00NN_contact_request.sql` (+ `meta/`)

**Interfaces:**
- Produces: `contactSchema` (pgSchema `ntizo_contact`), `contactRequest` table, `ContactRequestRecord`, `NewContactRequestRecord`.

- [ ] **Step 1: Write the table**

`contact-request.schema.ts`:

```ts
import { index, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "../../user/schemas/user.schema";

export const contactSchema = pgSchema("ntizo_contact");

/**
 * One message sent through the contact or feedback form.
 *
 * The row is the source of truth: the email to the team is sent after it is
 * written and may fail without losing anything (see `SubmitContactRequestCommand`).
 *
 * `kind`, `topic` and `status` are text rather than enums, like `review.status`:
 * the allowed values are the aggregate's rule (and `@ntizo/shared`'s list), and
 * a Postgres enum would make adding a topic a migration.
 *
 * `requester_user_id` and `resolved_by_user_id` are `set null` on delete:
 * deleting an account must not delete what the team was told, nor the record
 * of who resolved it — but neither may keep pointing at a row that is gone.
 *
 * `ip_address` exists for the per-IP rate limit and for abuse; the privacy
 * policy discloses it (Task 13).
 */
export const contactRequest = contactSchema.table(
  "contact_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `contact` | `feedback` — see `CONTACT_REQUEST_KINDS`. */
    kind: text("kind").notNull(),
    /** One of the kind's topics — see `CONTACT_TOPICS`. */
    topic: text("topic").notNull(),
    name: text("name").notNull(),
    /** Null only on feedback, which may arrive without a way to reply. */
    email: text("email"),
    message: text("message").notNull(),
    requesterUserId: text("requester_user_id").references(() => user.id, { onDelete: "set null" }),
    /** The UI language at submission, so the reply comes in it. */
    locale: text("locale").notNull(),
    /** The page the form was reached from; the feedback page sends it, the others do not. */
    originPath: text("origin_path"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /** `open` | `resolved` — see `CONTACT_REQUEST_STATUSES`. */
    status: text("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: text("resolved_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The admin list: open first, newest first.
    index("contact_request_status_created_idx").on(t.status, t.createdAt),
    // The rate limit: "how many from this address in the last hour".
    index("contact_request_ip_created_idx").on(t.ipAddress, t.createdAt),
    index("contact_request_kind_idx").on(t.kind),
  ],
);

export type ContactRequestRecord = typeof contactRequest.$inferSelect;
export type NewContactRequestRecord = typeof contactRequest.$inferInsert;
```

`contact/schemas/index.ts`:

```ts
export * from "./contact-request.schema";
```

`contact/index.ts`:

```ts
export * from "./schemas";
```

In `database/schemas.ts`, after `export * from "./review";`, add:

```ts
export * from "./contact";
```

In `drizzle.config.ts`, in `schemaFilter`, after `"ntizo_review",` add `"ntizo_contact",`.

- [ ] **Step 2: Typecheck**

Run: `cd packages/backend && bun run typecheck`
Expected: clean.

- [ ] **Step 3: Generate the migration**

Run: `cd packages/backend && bun run db:ntizo:generate --name contact_request`
Expected: a new file `src/modules/ntizo/shared/infrastructure/migrations/00NN_contact_request.sql` and an updated `meta/_journal.json` + snapshot. Open the SQL and confirm it contains `CREATE SCHEMA "ntizo_contact";`, `CREATE TABLE "ntizo_contact"."contact_request"`, the two foreign keys to `"ntizo_user"."user"` with `ON DELETE set null`, and the three indexes. If it contains anything touching another schema, stop: the schema filter or an earlier migration is out of step, and that needs a person.

- [ ] **Step 4: Apply it to the dev database**

Run: `cd packages/backend && bun run db:ntizo:dev:migrate` (needs `DEV_DB_URL`).
Expected: the migration applies; the command exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/shared/infrastructure/database/contact packages/backend/src/modules/ntizo/shared/infrastructure/database/schemas.ts packages/backend/src/modules/ntizo/drizzle.config.ts packages/backend/src/modules/ntizo/shared/infrastructure/migrations
git commit -m "feat(contact): the contact_request table, in its own schema"
```

---

### Task 3: The `ContactRequest` aggregate and its refusals

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/contact/domain/exceptions.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/contact/domain/aggregates/contact-request.aggregate.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/contact/__tests__/contact-request.aggregate.test.ts`

**Interfaces:**
- Consumes: Task 1's enums.
- Produces: `ContactRequest` with `static create(input)`, `static reconstitute(props)`, getters for every prop, `withId(id)`, `resolve(at, byUserId)`, `reopen()`, `get reference()`; the constants `NAME_MIN/MAX`, `MESSAGE_MIN/MAX`, `EMAIL_MAX`, `ORIGIN_PATH_MAX`, `LOCALE_MAX`; errors `ContactNameInvalidError`, `ContactMessageInvalidError`, `ContactEmailRequiredError`, `ContactEmailInvalidError`, `ContactTopicInvalidError`, `ContactRateLimitedError`, `ContactRequestNotFoundError`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "bun:test";
import {
  MESSAGE_MAX,
  NAME_MAX,
  ContactRequest,
} from "../domain/aggregates/contact-request.aggregate";
import {
  ContactEmailInvalidError,
  ContactEmailRequiredError,
  ContactMessageInvalidError,
  ContactNameInvalidError,
  ContactTopicInvalidError,
} from "../domain/exceptions";

/** A complete, valid contact message; each test takes one thing away. */
function input(over: Partial<Parameters<typeof ContactRequest.create>[0]> = {}) {
  return {
    kind: "contact" as const,
    topic: "general",
    name: "  Joana Matola ",
    email: " Joana@Exemplo.com ",
    message: "Gostava de propor uma parceria com a minha escola.",
    locale: "pt-MZ",
    originPath: null,
    requesterUserId: "u-1",
    ipAddress: "197.218.0.1",
    userAgent: "Mozilla/5.0",
    ...over,
  };
}

describe("ContactRequest.create — normalisation", () => {
  it("trims the name and the message, and lower-cases the email", () => {
    const r = ContactRequest.create(input());
    expect(r.name).toBe("Joana Matola");
    expect(r.email).toBe("joana@exemplo.com");
    expect(r.message).toBe("Gostava de propor uma parceria com a minha escola.");
    expect(r.status).toBe("open");
    expect(r.id).toBeNull();
  });

  it("stores an empty feedback email as none, not as an empty string", () => {
    const r = ContactRequest.create(input({ kind: "feedback", topic: "idea", email: "   " }));
    expect(r.email).toBeNull();
  });

  it("cuts an over-long origin path rather than refusing the message for it", () => {
    const r = ContactRequest.create(input({ originPath: `/services/${"x".repeat(300)}` }));
    expect(r.originPath!.length).toBe(200);
  });
});

describe("ContactRequest.create — refusals", () => {
  it("refuses a name that is too short or too long", () => {
    expect(() => ContactRequest.create(input({ name: "J" }))).toThrow(ContactNameInvalidError);
    expect(() => ContactRequest.create(input({ name: "x".repeat(NAME_MAX + 1) }))).toThrow(ContactNameInvalidError);
  });

  it("refuses a message that is too short or too long", () => {
    expect(() => ContactRequest.create(input({ message: "olá" }))).toThrow(ContactMessageInvalidError);
    expect(() => ContactRequest.create(input({ message: "x".repeat(MESSAGE_MAX + 1) }))).toThrow(ContactMessageInvalidError);
  });

  it("requires an email on contact, but not on feedback", () => {
    expect(() => ContactRequest.create(input({ kind: "contact", topic: "general", email: null }))).toThrow(ContactEmailRequiredError);
    expect(() => ContactRequest.create(input({ email: "" }))).toThrow(ContactEmailRequiredError);
    expect(ContactRequest.create(input({ kind: "feedback", topic: "praise", email: null })).email).toBeNull();
  });

  it("refuses an email that is not shaped like one, on feedback too", () => {
    expect(() => ContactRequest.create(input({ email: "joana" }))).toThrow(ContactEmailInvalidError);
    expect(() => ContactRequest.create(input({ kind: "feedback", topic: "idea", email: "not an email" }))).toThrow(ContactEmailInvalidError);
  });

  it("refuses a topic that belongs to another kind", () => {
    expect(() => ContactRequest.create(input({ topic: "idea" }))).toThrow(ContactTopicInvalidError);
  });
});

describe("ContactRequest — resolving", () => {
  const saved = ContactRequest.create(input()).withId("7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b");

  it("resolve records who and when, and reopen clears both", () => {
    const at = new Date("2026-09-02T10:00:00.000Z");
    const resolved = saved.resolve(at, "admin-1");
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedAt).toEqual(at);
    expect(resolved.resolvedByUserId).toBe("admin-1");

    const reopened = resolved.reopen();
    expect(reopened.status).toBe("open");
    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.resolvedByUserId).toBeNull();
  });

  it("is idempotent in both directions — two administrators pressing the same button is not an error", () => {
    const at = new Date("2026-09-02T10:00:00.000Z");
    const once = saved.resolve(at, "admin-1");
    const twice = once.resolve(new Date("2026-09-02T11:00:00.000Z"), "admin-2");
    expect(twice.resolvedAt).toEqual(at);
    expect(twice.resolvedByUserId).toBe("admin-1");
    expect(saved.reopen()).toBe(saved);
  });

  it("derives the reference from the id", () => {
    expect(saved.reference).toBe("7F3A2C");
    expect(() => ContactRequest.create(input()).reference).toThrow();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/contact/__tests__/contact-request.aggregate.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the exceptions**

`domain/exceptions.ts`:

```ts
import { NotFoundError, UnprocessableError } from "@cosmneo/onion-lasagna";

/**
 * The contact context's refusals.
 *
 * Each extends a kit error so `getGraphQLErrorCode` recognises it and the
 * GraphQL layer does not mask it to INTERNAL_ERROR — the same trap the review
 * context documents. The `code` strings are a PUBLIC CONTRACT: the form
 * branches on `CONTACT_RATE_LIMITED` to say something different.
 */

export class ContactNameInvalidError extends UnprocessableError {
  constructor(public readonly length: number) {
    super({
      message: `A name must be between 2 and 80 characters — got ${length}`,
      code: "CONTACT_NAME_INVALID",
    });
    this.name = "ContactNameInvalidError";
  }
}

export class ContactMessageInvalidError extends UnprocessableError {
  constructor(public readonly length: number) {
    super({
      message: `A message must be between 10 and 2000 characters — got ${length}`,
      code: "CONTACT_MESSAGE_INVALID",
    });
    this.name = "ContactMessageInvalidError";
  }
}

export class ContactEmailRequiredError extends UnprocessableError {
  constructor() {
    super({
      message: "An email address is needed so we can reply",
      code: "CONTACT_EMAIL_REQUIRED",
    });
    this.name = "ContactEmailRequiredError";
  }
}

export class ContactEmailInvalidError extends UnprocessableError {
  constructor() {
    super({ message: "That does not look like an email address", code: "CONTACT_EMAIL_INVALID" });
    this.name = "ContactEmailInvalidError";
  }
}

export class ContactTopicInvalidError extends UnprocessableError {
  constructor(public readonly kind: string, public readonly topic: string) {
    super({
      message: `"${topic}" is not a topic of the ${kind} form`,
      code: "CONTACT_TOPIC_INVALID",
    });
    this.name = "ContactTopicInvalidError";
  }
}

/**
 * Refused because this address has sent too much too recently.
 *
 * An `UnprocessableError` rather than a `ForbiddenError`: nothing about who
 * the caller is decides it, only how often they have written. The form shows
 * its own sentence for this code and keeps what was typed.
 */
export class ContactRateLimitedError extends UnprocessableError {
  constructor(public readonly max: number, public readonly windowMinutes: number) {
    super({
      message: `At most ${max} messages every ${windowMinutes} minutes from one address — try again later, or write to us by email`,
      code: "CONTACT_RATE_LIMITED",
    });
    this.name = "ContactRateLimitedError";
  }
}

export class ContactRequestNotFoundError extends NotFoundError {
  constructor(public readonly requestId: string) {
    super({ message: `No contact request with id "${requestId}"`, code: "CONTACT_REQUEST_NOT_FOUND" });
    this.name = "ContactRequestNotFoundError";
  }
}
```

- [ ] **Step 4: Write the aggregate**

`domain/aggregates/contact-request.aggregate.ts`:

```ts
import {
  isContactTopicForKind,
  contactEmailRequired,
  contactReferenceOf,
  type ContactRequestKind,
  type ContactRequestStatus,
  type ContactTopic,
} from "@ntizo/shared";
import {
  ContactEmailInvalidError,
  ContactEmailRequiredError,
  ContactMessageInvalidError,
  ContactNameInvalidError,
  ContactTopicInvalidError,
} from "../exceptions";

export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;
export const EMAIL_MAX = 254;
export const ORIGIN_PATH_MAX = 200;
export const LOCALE_MAX = 16;

/** Something, an @, something, a dot, something. Not RFC 5322 — a reply has to reach it, that is all. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContactRequestProps {
  readonly id: string | null;
  readonly kind: ContactRequestKind;
  readonly topic: ContactTopic;
  readonly name: string;
  readonly email: string | null;
  readonly message: string;
  readonly requesterUserId: string | null;
  readonly locale: string;
  readonly originPath: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly status: ContactRequestStatus;
  readonly resolvedAt: Date | null;
  readonly resolvedByUserId: string | null;
  readonly createdAt: Date | null;
}

/**
 * One message somebody sent us through a form.
 *
 * Small, like `Review`, and an aggregate for the same reason: a handful of
 * rules — a name and a message within bounds, an email unless it is feedback,
 * a topic that belongs to the form it came from — that must hold identically
 * from the API, from a test, and from any future import.
 *
 * **Normalised once, here.** Names and messages are trimmed; the email is
 * trimmed and lower-cased so the admin search finds `Joana@…` under `joana@…`;
 * an empty email is `null`, never `""`. The origin path and the locale are
 * telemetry, not the person's words, so an over-long one is cut rather than
 * refused — refusing a message because the URL it came from was long would be
 * punishing the person for our own routing.
 *
 * `resolve` and `reopen` are idempotent: two administrators pressing the same
 * button at once is an ordinary thing, not an error, and the first press wins.
 */
export class ContactRequest {
  private constructor(private readonly props: ContactRequestProps) {}

  static create(input: {
    kind: ContactRequestKind;
    topic: string;
    name: string;
    email: string | null;
    message: string;
    locale: string;
    originPath: string | null;
    requesterUserId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
  }): ContactRequest {
    const name = input.name.trim();
    if (name.length < NAME_MIN || name.length > NAME_MAX) throw new ContactNameInvalidError(name.length);

    const message = input.message.trim();
    if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
      throw new ContactMessageInvalidError(message.length);
    }

    const email = (input.email ?? "").trim().toLowerCase() || null;
    if (email === null && contactEmailRequired(input.kind)) throw new ContactEmailRequiredError();
    if (email !== null && (email.length > EMAIL_MAX || !EMAIL_SHAPE.test(email))) {
      throw new ContactEmailInvalidError();
    }

    if (!isContactTopicForKind(input.kind, input.topic)) {
      throw new ContactTopicInvalidError(input.kind, input.topic);
    }

    return new ContactRequest({
      id: null,
      kind: input.kind,
      topic: input.topic,
      name,
      email,
      message,
      requesterUserId: input.requesterUserId,
      locale: input.locale.trim().slice(0, LOCALE_MAX) || "en-US",
      originPath: input.originPath?.trim().slice(0, ORIGIN_PATH_MAX) || null,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent?.slice(0, 512) ?? null,
      status: "open",
      resolvedAt: null,
      resolvedByUserId: null,
      createdAt: null,
    });
  }

  /** A row as the repository read it back. No validation: it was validated when written. */
  static reconstitute(props: ContactRequestProps): ContactRequest {
    return new ContactRequest(props);
  }

  get id(): string | null { return this.props.id; }
  get kind(): ContactRequestKind { return this.props.kind; }
  get topic(): ContactTopic { return this.props.topic; }
  get name(): string { return this.props.name; }
  get email(): string | null { return this.props.email; }
  get message(): string { return this.props.message; }
  get requesterUserId(): string | null { return this.props.requesterUserId; }
  get locale(): string { return this.props.locale; }
  get originPath(): string | null { return this.props.originPath; }
  get ipAddress(): string | null { return this.props.ipAddress; }
  get userAgent(): string | null { return this.props.userAgent; }
  get status(): ContactRequestStatus { return this.props.status; }
  get resolvedAt(): Date | null { return this.props.resolvedAt; }
  get resolvedByUserId(): string | null { return this.props.resolvedByUserId; }
  get createdAt(): Date | null { return this.props.createdAt; }

  /** The six characters a person quotes back. Only a stored request has one. */
  get reference(): string {
    if (!this.props.id) throw new Error("A contact request has no reference until it is stored");
    return contactReferenceOf(this.props.id);
  }

  /** The same request, now stored. The repository calls this with the id Postgres assigned. */
  withId(id: string, createdAt: Date = new Date()): ContactRequest {
    return new ContactRequest({ ...this.props, id, createdAt });
  }

  resolve(at: Date, byUserId: string): ContactRequest {
    if (this.props.status === "resolved") return this;
    return new ContactRequest({ ...this.props, status: "resolved", resolvedAt: at, resolvedByUserId: byUserId });
  }

  reopen(): ContactRequest {
    if (this.props.status === "open") return this;
    return new ContactRequest({ ...this.props, status: "open", resolvedAt: null, resolvedByUserId: null });
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/contact/__tests__/contact-request.aggregate.test.ts`
Expected: 10 pass.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/contact
git commit -m "feat(contact): the ContactRequest aggregate and its refusals"
```

---

### Task 4: The repository, against the real table

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/contact/app/ports/outbound/contact-request.repository.port.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/contact/infrastructure/repositories/drizzle/contact-request.repository.ts`
- Test: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/contact-request-repository.test.ts`

**Interfaces:**
- Consumes: `ContactRequest` (Task 3), `contactRequest` table (Task 2), `contactReferenceOf` (Task 1).
- Produces: `ContactRequestRepositoryPort` with `insert(request): Promise<ContactRequest>`, `findById(id): Promise<ContactRequest | null>`, `saveStatus(request): Promise<boolean>`, `countFromIpSince(ipAddress, since): Promise<number>`, `listForAdmin(input): Promise<ContactRequestAdminPage>`; the row shape `ContactRequestAdminRow`; `DrizzleContactRequestRepository`.

- [ ] **Step 1: Write the port**

`contact-request.repository.port.ts`:

```ts
import type { ContactRequestKind, ContactRequestStatus, ContactTopic } from "@ntizo/shared";
import type { ContactRequest } from "../../../domain/aggregates/contact-request.aggregate";

/** One request as the administration list shows it. Everything on the row: this screen is the investigation. */
export interface ContactRequestAdminRow {
  id: string;
  reference: string;
  kind: ContactRequestKind;
  topic: ContactTopic;
  name: string;
  email: string | null;
  message: string;
  requesterUserId: string | null;
  locale: string;
  originPath: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: ContactRequestStatus;
  /** ISO 8601, or null while open. */
  resolvedAt: string | null;
  createdAt: string;
}

export interface ContactRequestListInput {
  limit: number;
  offset: number;
  kind?: ContactRequestKind;
  status?: ContactRequestStatus;
  /** Matches the name, the email, the message, or the id's leading characters (the reference). */
  search?: string;
}

export interface ContactRequestAdminPage {
  items: ContactRequestAdminRow[];
  /** Rows matching the filters, for pagination. */
  total: number;
  /** Open rows across the whole table, whatever the filters — the queue's badge. */
  openCount: number;
}

export interface ContactRequestRepositoryPort {
  /** Writes a new row and returns the same request carrying its id and creation time. */
  insert(request: ContactRequest): Promise<ContactRequest>;
  findById(id: string): Promise<ContactRequest | null>;
  /** Writes `status`, `resolvedAt` and `resolvedByUserId`. False when no such row. */
  saveStatus(request: ContactRequest): Promise<boolean>;
  /** How many rows this address has written since `since`. The rate limit. */
  countFromIpSince(ipAddress: string, since: Date): Promise<number>;
  listForAdmin(input: ContactRequestListInput): Promise<ContactRequestAdminPage>;
}
```

- [ ] **Step 2: Write the failing repository test**

`contact-request-repository.test.ts` (in `shared/infrastructure/database/__tests__/`, beside `booking-repository.test.ts`, whose harness it copies):

```ts
/**
 * `DrizzleContactRequestRepository` against the real dev database, same
 * mechanism as `booking-repository.test.ts`: `getDb()` resolves through the
 * request-scoped context, and `__runWithTransactionContextForTests` binds this
 * file's own `DEV_DB_URL` client into it for one test body.
 *
 * Rows are scoped by a random `suffix` in the name, and cleaned up by that
 * suffix, so a concurrent run in another worktree cannot collide or be
 * cleaned up by this one.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { user } from "../user/schemas/user.schema";
import { contactRequest } from "../contact/schemas/contact-request.schema";
import { ContactRequest } from "../../../../bounded-contexts/contact/domain/aggregates/contact-request.aggregate";
import { DrizzleContactRequestRepository } from "../../../../bounded-contexts/contact/infrastructure/repositories/drizzle/contact-request.repository";
import { bestEffortCleanup, DEV_DB_COLD_START_TIMEOUT_MS, openDevDbConnection } from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql, { schema: authSchema });
const repo = new DrizzleContactRequestRepository();
const suffix = crypto.randomUUID();
const NAME = `Contact Repo Test ${suffix}`;
const IP = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

let requesterId: string;

beforeAll(async () => {
  requesterId = crypto.randomUUID();
  await db.insert(user).values({
    id: requesterId,
    email: `contact-repo-${suffix}@ntizo.test`,
    role: "customer",
    status: "active",
  });
});

afterAll(async () => {
  await bestEffortCleanup([
    () => db.delete(contactRequest).where(like(contactRequest.name, `${NAME}%`)),
    () => db.delete(user).where(eq(user.id, requesterId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

function fresh(over: Partial<Parameters<typeof ContactRequest.create>[0]> = {}) {
  return ContactRequest.create({
    kind: "contact",
    topic: "general",
    name: NAME,
    email: `joana-${suffix}@exemplo.com`,
    message: "Gostava de propor uma parceria com a minha escola.",
    locale: "pt-MZ",
    originPath: null,
    requesterUserId: requesterId,
    ipAddress: IP,
    userAgent: "test",
    ...over,
  });
}

describe("DrizzleContactRequestRepository", () => {
  test("insert returns the request with an id and a creation time, and findById reads it back whole", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const saved = await repo.insert(fresh());
      expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(saved.createdAt).toBeInstanceOf(Date);
      expect(saved.reference).toHaveLength(6);

      const found = await repo.findById(saved.id!);
      expect(found).not.toBeNull();
      expect(found!.name).toBe(NAME);
      expect(found!.email).toBe(`joana-${suffix}@exemplo.com`);
      expect(found!.kind).toBe("contact");
      expect(found!.topic).toBe("general");
      expect(found!.requesterUserId).toBe(requesterId);
      expect(found!.status).toBe("open");
      expect(found!.ipAddress).toBe(IP);
    }, { commit: true });
  });

  test("findById answers null for an id nobody has", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      expect(await repo.findById(crypto.randomUUID())).toBeNull();
    });
  });

  test("saveStatus writes the resolution and reports whether the row existed", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const saved = await repo.insert(fresh());
      const at = new Date("2026-09-02T10:00:00.000Z");
      expect(await repo.saveStatus(saved.resolve(at, requesterId))).toBe(true);

      const found = await repo.findById(saved.id!);
      expect(found!.status).toBe("resolved");
      expect(found!.resolvedAt).toEqual(at);
      expect(found!.resolvedByUserId).toBe(requesterId);

      const ghost = ContactRequest.reconstitute({ ...fresh(), id: crypto.randomUUID() } as never);
      expect(await repo.saveStatus(ghost)).toBe(false);
    }, { commit: true });
  });

  test("countFromIpSince counts only this address, only since the moment given", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const before = await repo.countFromIpSince(IP, new Date(Date.now() - 60 * 60 * 1000));
      await repo.insert(fresh());
      await repo.insert(fresh({ ipAddress: "10.255.255.254" }));
      const after = await repo.countFromIpSince(IP, new Date(Date.now() - 60 * 60 * 1000));
      expect(after).toBe(before + 1);
      expect(await repo.countFromIpSince(IP, new Date(Date.now() + 60 * 1000))).toBe(0);
    }, { commit: true });
  });

  test("listForAdmin filters by kind and status, searches four fields, and counts open rows across the table", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const a = await repo.insert(fresh({ message: `Mensagem única ${suffix} sobre uma parceria.` }));
      const b = await repo.insert(fresh({ kind: "feedback", topic: "idea", email: null, message: `Uma ideia ${suffix} para a página inicial.` }));
      await repo.saveStatus(b.resolve(new Date(), requesterId));

      const bySuffix = await repo.listForAdmin({ limit: 50, offset: 0, search: suffix });
      expect(bySuffix.items.map((r) => r.id)).toEqual(expect.arrayContaining([a.id, b.id]));
      expect(bySuffix.total).toBeGreaterThanOrEqual(2);

      const openOnly = await repo.listForAdmin({ limit: 50, offset: 0, search: suffix, status: "open" });
      expect(openOnly.items.map((r) => r.id)).toContain(a.id);
      expect(openOnly.items.map((r) => r.id)).not.toContain(b.id);

      const feedbackOnly = await repo.listForAdmin({ limit: 50, offset: 0, search: suffix, kind: "feedback" });
      expect(feedbackOnly.items.map((r) => r.id)).toEqual([b.id]);

      const byReference = await repo.listForAdmin({ limit: 50, offset: 0, search: a.reference.toLowerCase() });
      expect(byReference.items.map((r) => r.id)).toContain(a.id);
      expect(byReference.items.find((r) => r.id === a.id)!.reference).toBe(a.reference);

      // openCount ignores the filters: it is the badge for the whole queue.
      expect(feedbackOnly.openCount).toBe(openOnly.openCount);
      expect(openOnly.openCount).toBeGreaterThanOrEqual(1);
    }, { commit: true });
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/contact-request-repository.test.ts`
Expected: FAIL — repository module not found.

- [ ] **Step 4: Write the repository**

`infrastructure/repositories/drizzle/contact-request.repository.ts`:

```ts
import { and, count, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { contactReferenceOf, type ContactRequestKind, type ContactRequestStatus, type ContactTopic } from "@ntizo/shared";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { contactRequest } from "../../../../../shared/infrastructure/database/contact/schemas";
import { ContactRequest } from "../../../domain/aggregates/contact-request.aggregate";
import type {
  ContactRequestAdminPage,
  ContactRequestListInput,
  ContactRequestRepositoryPort,
} from "../../../app/ports/outbound/contact-request.repository.port";

type Row = typeof contactRequest.$inferSelect;

function toAggregate(row: Row): ContactRequest {
  return ContactRequest.reconstitute({
    id: row.id,
    kind: row.kind as ContactRequestKind,
    topic: row.topic as ContactTopic,
    name: row.name,
    email: row.email,
    message: row.message,
    requesterUserId: row.requesterUserId,
    locale: row.locale,
    originPath: row.originPath,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    status: row.status as ContactRequestStatus,
    resolvedAt: row.resolvedAt,
    resolvedByUserId: row.resolvedByUserId,
    createdAt: row.createdAt,
  });
}

export class DrizzleContactRequestRepository implements ContactRequestRepositoryPort {
  async insert(entity: ContactRequest): Promise<ContactRequest> {
    const [row] = await getDb()
      .insert(contactRequest)
      .values({
        kind: entity.kind,
        topic: entity.topic,
        name: entity.name,
        email: entity.email,
        message: entity.message,
        requesterUserId: entity.requesterUserId,
        locale: entity.locale,
        originPath: entity.originPath,
        ipAddress: entity.ipAddress,
        userAgent: entity.userAgent,
        status: entity.status,
      })
      .returning({ id: contactRequest.id, createdAt: contactRequest.createdAt });
    return entity.withId(row!.id, row!.createdAt);
  }

  async findById(id: string): Promise<ContactRequest | null> {
    const [row] = await getDb().select().from(contactRequest).where(eq(contactRequest.id, id)).limit(1);
    return row ? toAggregate(row) : null;
  }

  async saveStatus(entity: ContactRequest): Promise<boolean> {
    if (!entity.id) return false;
    const rows = await getDb()
      .update(contactRequest)
      .set({
        status: entity.status,
        resolvedAt: entity.resolvedAt,
        resolvedByUserId: entity.resolvedByUserId,
      })
      .where(eq(contactRequest.id, entity.id))
      .returning({ id: contactRequest.id });
    return rows.length > 0;
  }

  async countFromIpSince(ipAddress: string, since: Date): Promise<number> {
    const [row] = await getDb()
      .select({ n: count() })
      .from(contactRequest)
      .where(and(eq(contactRequest.ipAddress, ipAddress), gte(contactRequest.createdAt, since)));
    return row?.n ?? 0;
  }

  /**
   * The queue, as the administrator works it.
   *
   * The search covers the four things somebody would type: a name, an email,
   * a phrase from the message, and the reference a person quoted back —
   * which is the id's leading hex characters, so `id::text ILIKE 'ref%'`
   * finds it without stripping hyphens (see `contactReferenceOf`).
   *
   * `openCount` is counted over the whole table, unfiltered: it is the number
   * beside the queue's name, and must not change when somebody searches.
   */
  async listForAdmin(input: ContactRequestListInput): Promise<ContactRequestAdminPage> {
    const db = getDb();
    const term = input.search?.trim();
    const matches = term
      ? or(
          ilike(contactRequest.name, `%${term}%`),
          ilike(contactRequest.email, `%${term}%`),
          ilike(contactRequest.message, `%${term}%`),
          ilike(sql`${contactRequest.id}::text`, `${term}%`),
        )
      : undefined;
    const filter = and(
      input.kind ? eq(contactRequest.kind, input.kind) : undefined,
      input.status ? eq(contactRequest.status, input.status) : undefined,
      matches,
    );

    const [rows, [totals], [open]] = await Promise.all([
      db
        .select()
        .from(contactRequest)
        .where(filter)
        .orderBy(desc(contactRequest.createdAt))
        .limit(input.limit)
        .offset(input.offset),
      db.select({ n: count() }).from(contactRequest).where(filter),
      db.select({ n: count() }).from(contactRequest).where(eq(contactRequest.status, "open")),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        reference: contactReferenceOf(r.id),
        kind: r.kind as ContactRequestKind,
        topic: r.topic as ContactTopic,
        name: r.name,
        email: r.email,
        message: r.message,
        requesterUserId: r.requesterUserId,
        locale: r.locale,
        originPath: r.originPath,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        status: r.status as ContactRequestStatus,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      total: totals?.n ?? 0,
      openCount: open?.n ?? 0,
    };
  }
}
```

- [ ] **Step 5: Run the test**

Run: `cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/contact-request-repository.test.ts`
Expected: 5 pass (the first query may take ~25 s while Neon wakes; that is the cold start, not a failure).

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/contact packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/contact-request-repository.test.ts
git commit -m "feat(contact): the repository, with the admin list and the per-address count"
```

---

### Task 5: Telling the team — the inbox port, `replyTo`, and the address in env

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/contact/app/ports/outbound/contact-inbox.port.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/contact/infrastructure/outbound-adapters/email-contact-inbox.adapter.ts`
- Modify: `packages/backend/src/shared/infrastructure/email/email-service.port.ts` (add `replyTo?`)
- Modify: `packages/backend/src/shared/infrastructure/email/resend-email-service.adapter.ts` (pass it)
- Modify: `packages/backend/src/shared/infrastructure/email/console-email-service.adapter.ts` (print it)
- Modify: `packages/backend/src/shared/infrastructure/stores/infra-store.ts` (`CONTACT_INBOX_EMAIL?: string` on `InfraEnvBindings`)
- Modify: `apps/backend/api/src/middlewares/config.middleware.ts`, `apps/backend/api/src/scheduled.ts` (pass it through), `apps/backend/api/wrangler.jsonc` (a `vars` entry on all four stages)
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/contact/__tests__/email-contact-inbox.adapter.test.ts`

**Interfaces:**
- Produces: `ContactInboxPort { notify(request: ContactRequest): Promise<void> }`, `EmailContactInboxAdapter`, `buildContactInboxEmail({ request, stage, adminUrl })`.

- [ ] **Step 1: Widen `EmailMessage`**

In `email-service.port.ts`, add to `EmailMessage`:

```ts
  /**
   * Where a reply to this message should go, when that is not `EMAIL_FROM`.
   *
   * The contact inbox is the reason this exists: a message forwarded to the
   * team on somebody's behalf must be answerable by pressing Reply, and
   * without this the answer goes to `noreply@`.
   */
  replyTo?: string;
```

In `resend-email-service.adapter.ts`, inside `client.emails.send({ ... })`, after `text: message.textBody,` add:

```ts
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
```

(Resend 4.8.0's `CreateEmailOptions` names it `replyTo`; `reply_to` is the older spelling and is not the one the installed types accept.)

In `console-email-service.adapter.ts`, after the `subject` line in the printed block add:

```ts
        ...(message.replyTo ? [`│ reply-to: ${message.replyTo}`] : []),
```

- [ ] **Step 2: Carry the address in env**

In `infra-store.ts`, inside `InfraEnvBindings`, after `MPESA_SERVICE_PROVIDER_CODE?: string;` (the last M-Pesa entry) add:

```ts
  /**
   * Where a contact or feedback form's message is forwarded.
   *
   * Optional for the same reason the M-Pesa pair is: a local run, a script
   * and every test that builds this shape genuinely have none, and the
   * adapter that reads it says so (it logs and keeps the row) rather than
   * throwing. Configuration, not a secret, so it lives in `wrangler.jsonc`.
   */
  CONTACT_INBOX_EMAIL?: string;
```

In `config.middleware.ts` and in `scheduled.ts`, in the object passed to `infraStore.runAsync`, after `MPESA_SERVICE_PROVIDER_CODE: env.MPESA_SERVICE_PROVIDER_CODE,` add:

```ts
      CONTACT_INBOX_EMAIL: env.CONTACT_INBOX_EMAIL,
```

In `wrangler.jsonc`, add `"CONTACT_INBOX_EMAIL": "ola@ntizo.co.mz"` to the top-level `vars` (local — the console adapter prints it) and to each of the `dev`, `qa` and `prod` `vars` blocks, after `"APP_URL"`. The subject carries the stage on every stage but prod, so a dev submission in the real inbox is recognisable.

- [ ] **Step 3: Write the failing adapter test**

```ts
import { describe, expect, it } from "bun:test";
import { infraStore } from "../../../../../shared/infrastructure/stores/infra-store";
import type { EmailMessage, EmailServicePort, SendResult } from "../../../../../shared/infrastructure/email";
import { ContactRequest } from "../domain/aggregates/contact-request.aggregate";
import { buildContactInboxEmail, EmailContactInboxAdapter } from "../infrastructure/outbound-adapters/email-contact-inbox.adapter";

class CapturingEmail implements EmailServicePort {
  sent: EmailMessage[] = [];
  async sendEmail(message: EmailMessage): Promise<SendResult> {
    this.sent.push(message);
    return { messageId: "m-1" };
  }
}

const BASE_ENV = {
  STAGE: "dev" as const,
  LOG_LEVEL: "info",
  DATABASE_URL: "",
  BETTER_AUTH_SECRET: "x",
  RESEND_API_KEY: "",
  EMAIL_FROM: "Ntizo <noreply@ntizo.co.mz>",
  APP_URL: "https://dev.ntizo.co.mz",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
};

function stored(over: Partial<Parameters<typeof ContactRequest.create>[0]> = {}) {
  return ContactRequest.create({
    kind: "contact",
    topic: "general",
    name: "Joana Matola",
    email: "joana@exemplo.com",
    message: "Gostava de propor uma parceria com a minha escola.\n<b>não é html</b>",
    locale: "pt-MZ",
    originPath: "/contact",
    requesterUserId: "u-1",
    ipAddress: "197.218.0.1",
    userAgent: "Mozilla/5.0",
    ...over,
  }).withId("7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b");
}

describe("EmailContactInboxAdapter", () => {
  it("sends to the configured inbox with the requester as reply-to", async () => {
    const email = new CapturingEmail();
    await infraStore.runAsync({ ...BASE_ENV, CONTACT_INBOX_EMAIL: "ola@ntizo.co.mz" }, async () => {
      await new EmailContactInboxAdapter(email).notify(stored());
    });
    expect(email.sent).toHaveLength(1);
    const m = email.sent[0]!;
    expect(m.to).toEqual(["ola@ntizo.co.mz"]);
    expect(m.replyTo).toBe("joana@exemplo.com");
    expect(m.subject).toBe("[Ntizo dev] Contacto: Pergunta geral — Joana Matola");
    expect(m.textBody).toContain("Referência: 7F3A2C");
    expect(m.textBody).toContain("https://dev.ntizo.co.mz/admin/contact");
    expect(m.htmlBody).toContain("&lt;b&gt;não é html&lt;/b&gt;");
  });

  it("omits reply-to when the person gave no email, and drops the stage tag on prod", async () => {
    const email = new CapturingEmail();
    await infraStore.runAsync({ ...BASE_ENV, STAGE: "prod", CONTACT_INBOX_EMAIL: "ola@ntizo.co.mz" }, async () => {
      await new EmailContactInboxAdapter(email).notify(stored({ kind: "feedback", topic: "idea", email: null }));
    });
    const m = email.sent[0]!;
    expect(m.replyTo).toBeUndefined();
    expect(m.subject).toBe("[Ntizo] Feedback: Uma ideia — Joana Matola");
  });

  it("sends nothing, and does not throw, when no inbox is configured", async () => {
    const email = new CapturingEmail();
    await infraStore.runAsync({ ...BASE_ENV }, async () => {
      await new EmailContactInboxAdapter(email).notify(stored());
    });
    expect(email.sent).toEqual([]);
  });

  it("builds a subject from the kind and topic labels the team reads in", () => {
    const { subject } = buildContactInboxEmail({ request: stored({ kind: "contact", topic: "press" }), stage: "qa", adminUrl: "x" });
    expect(subject).toBe("[Ntizo qa] Contacto: Imprensa — Joana Matola");
  });
});
```

- [ ] **Step 4: Run to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/contact/__tests__/email-contact-inbox.adapter.test.ts`
Expected: FAIL — adapter module not found.

- [ ] **Step 5: Write the port and the adapter**

`app/ports/outbound/contact-inbox.port.ts`:

```ts
import type { ContactRequest } from "../../../domain/aggregates/contact-request.aggregate";

/**
 * Tells the team a request arrived.
 *
 * Called after the row is stored, never before, and allowed to fail: the row
 * is the source of truth and the admin queue shows it regardless. See
 * `SubmitContactRequestCommand`.
 */
export interface ContactInboxPort {
  notify(request: ContactRequest): Promise<void>;
}
```

`infrastructure/outbound-adapters/email-contact-inbox.adapter.ts`:

```ts
import type { ContactRequestKind, ContactTopic } from "@ntizo/shared";
import { LazyEmailServiceAdapter, type EmailServicePort } from "../../../../../shared/infrastructure/email";
import { infraStore } from "../../../../../shared/infrastructure/stores/infra-store";
import type { ContactInboxPort } from "../../app/ports/outbound/contact-inbox.port";
import type { ContactRequest } from "../../domain/aggregates/contact-request.aggregate";

/** The team reads Portuguese; these are for the subject line, not for the person who wrote. */
const KIND_LABEL: Record<ContactRequestKind, string> = {
  contact: "Contacto",
  feedback: "Feedback",
};

const TOPIC_LABEL: Record<ContactTopic, string> = {
  general: "Pergunta geral",
  partnership: "Parceria",
  press: "Imprensa",
  provider: "Sou prestador",
  other: "Outro",
  idea: "Uma ideia",
  problem: "Algo não funcionou",
  praise: "Gostei de algo",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The email the team gets. Every field, the reference, and a link to the queue.
 *
 * The stage is in the subject everywhere but prod, so a message sent from the
 * dev app into the real inbox announces itself as one.
 */
export function buildContactInboxEmail(params: {
  request: ContactRequest;
  stage: string;
  adminUrl: string;
}): { subject: string; html: string; text: string } {
  const { request, stage, adminUrl } = params;
  const tag = stage === "prod" ? "[Ntizo]" : `[Ntizo ${stage}]`;
  const subject = `${tag} ${KIND_LABEL[request.kind]}: ${TOPIC_LABEL[request.topic]} — ${request.name}`;

  const lines: Array<[string, string]> = [
    ["Referência", request.reference],
    ["Tipo", KIND_LABEL[request.kind]],
    ["Assunto", TOPIC_LABEL[request.topic]],
    ["Nome", request.name],
    ["Email", request.email ?? "(não deu)"],
    ["Idioma", request.locale],
    ["Conta", request.requesterUserId ?? "(sem sessão)"],
    ["Página", request.originPath ?? "—"],
    ["IP", request.ipAddress ?? "—"],
  ];

  const text = [
    ...lines.map(([k, v]) => `${k}: ${v}`),
    "",
    request.message,
    "",
    `Fila: ${adminUrl}`,
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f6f6f6;margin:0;padding:24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <tr><td>
        <h1 style="font-size:18px;font-weight:600;color:#111;margin:0 0 16px;">${escapeHtml(subject)}</h1>
        <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13px;color:#333;margin:0 0 16px;">
          ${lines.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#888;">${escapeHtml(k)}</td><td style="padding:2px 0;">${escapeHtml(v)}</td></tr>`).join("\n          ")}
        </table>
        <p style="font-size:14px;color:#111;line-height:1.6;white-space:pre-wrap;border-left:3px solid #006ffd;padding-left:12px;margin:0 0 24px;">${escapeHtml(request.message)}</p>
        <p style="font-size:12px;color:#888;margin:0;">Fila: <a href="${escapeHtml(adminUrl)}">${escapeHtml(adminUrl)}</a></p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

export class EmailContactInboxAdapter implements ContactInboxPort {
  constructor(
    // Lazy, like the provider and notification contexts: Resend where a key
    // exists, the console adapter on a local machine.
    private readonly email: EmailServicePort = new LazyEmailServiceAdapter(),
  ) {}

  async notify(request: ContactRequest): Promise<void> {
    const env = infraStore.getEnv();
    const inbox = env.CONTACT_INBOX_EMAIL?.trim();
    if (!inbox) {
      console.warn("[contact] CONTACT_INBOX_EMAIL is not set on this stage — request stored, nobody emailed", {
        requestId: request.id,
      });
      return;
    }
    const { subject, html, text } = buildContactInboxEmail({
      request,
      stage: env.STAGE ?? "local",
      adminUrl: `${env.APP_URL}/admin/contact`,
    });
    await this.email.sendEmail({
      to: [inbox],
      subject,
      htmlBody: html,
      textBody: text,
      ...(request.email ? { replyTo: request.email } : {}),
    });
  }
}
```

- [ ] **Step 6: Run the tests and both typechecks**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/contact/__tests__/email-contact-inbox.adapter.test.ts && bun run typecheck && cd ../../apps/backend/api && bun run typecheck`
Expected: 4 pass; both typechecks clean.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/shared/infrastructure/email packages/backend/src/shared/infrastructure/stores/infra-store.ts packages/backend/src/modules/ntizo/bounded-contexts/contact apps/backend/api/src/middlewares/config.middleware.ts apps/backend/api/src/scheduled.ts apps/backend/api/wrangler.jsonc
git commit -m "feat(contact): email the inbox after the row is written, with the requester as reply-to"
```

---

### Task 6: The three use cases and the context's bootstrap

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/contact/app/use-cases/submit-contact-request.command.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/contact/app/use-cases/list-contact-requests-for-admin.query.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/contact/app/use-cases/set-contact-request-status.command.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/contact/bootstrap/index.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/contact/index.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/contact/__tests__/contact-commands.test.ts`

**Interfaces:**
- Consumes: `ContactRequestRepositoryPort` (Task 4), `ContactInboxPort` (Task 5), the aggregate and errors (Task 3).
- Produces: `SubmitContactRequestCommand.execute(input): Promise<{ requestId: string; reference: string }>`, `ListContactRequestsForAdminQuery.execute(input): Promise<ContactRequestAdminPage>` with `MAX_ADMIN_LIMIT = 100`, `SetContactRequestStatusCommand.execute({ requestId, status, actorUserId }): Promise<{ status }>`, `bootstrapContact()` returning `{ adapters, useCases: { submitContactRequest, listContactRequestsForAdmin, setContactRequestStatus } }`, `ContactBootstrap`; constants `RATE_LIMIT_MAX = 5`, `RATE_LIMIT_WINDOW_MS = 3_600_000`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "bun:test";
import { ContactRequest } from "../domain/aggregates/contact-request.aggregate";
import { ContactRateLimitedError, ContactRequestNotFoundError } from "../domain/exceptions";
import {
  RATE_LIMIT_MAX,
  SubmitContactRequestCommand,
} from "../app/use-cases/submit-contact-request.command";
import { ListContactRequestsForAdminQuery } from "../app/use-cases/list-contact-requests-for-admin.query";
import { SetContactRequestStatusCommand } from "../app/use-cases/set-contact-request-status.command";
import type {
  ContactRequestAdminPage,
  ContactRequestListInput,
  ContactRequestRepositoryPort,
} from "../app/ports/outbound/contact-request.repository.port";
import type { ContactInboxPort } from "../app/ports/outbound/contact-inbox.port";

class FakeRepo implements ContactRequestRepositoryPort {
  inserted: ContactRequest[] = [];
  statusSaved: ContactRequest[] = [];
  listCalls: ContactRequestListInput[] = [];
  constructor(
    private readonly opts: { countFromIp?: number; existing?: ContactRequest | null; saveStatusExists?: boolean } = {},
  ) {}
  async insert(request: ContactRequest): Promise<ContactRequest> {
    const stored = request.withId("7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", new Date("2026-09-02T10:00:00.000Z"));
    this.inserted.push(stored);
    return stored;
  }
  async findById(): Promise<ContactRequest | null> {
    return this.opts.existing ?? null;
  }
  async saveStatus(request: ContactRequest): Promise<boolean> {
    this.statusSaved.push(request);
    return this.opts.saveStatusExists ?? true;
  }
  async countFromIpSince(): Promise<number> {
    return this.opts.countFromIp ?? 0;
  }
  async listForAdmin(input: ContactRequestListInput): Promise<ContactRequestAdminPage> {
    this.listCalls.push(input);
    return { items: [], total: 0, openCount: 3 };
  }
}

class CapturingInbox implements ContactInboxPort {
  notified: ContactRequest[] = [];
  constructor(private readonly fails = false) {}
  async notify(request: ContactRequest): Promise<void> {
    if (this.fails) throw new Error("Resend is down");
    this.notified.push(request);
  }
}

function input(over: Partial<Parameters<SubmitContactRequestCommand["execute"]>[0]> = {}) {
  return {
    kind: "contact" as const,
    topic: "general",
    name: "Joana Matola",
    email: "joana@exemplo.com",
    message: "Gostava de propor uma parceria com a minha escola.",
    locale: "pt-MZ",
    originPath: null,
    requesterUserId: "u-1",
    ipAddress: "197.218.0.1",
    userAgent: "Mozilla/5.0",
    ...over,
  };
}

describe("SubmitContactRequestCommand", () => {
  it("stores the request, then tells the inbox, and answers with the id and the reference", async () => {
    const repo = new FakeRepo();
    const inbox = new CapturingInbox();
    const out = await new SubmitContactRequestCommand(repo, inbox).execute(input());

    expect(out).toEqual({ requestId: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", reference: "7F3A2C" });
    expect(repo.inserted).toHaveLength(1);
    expect(repo.inserted[0]!.name).toBe("Joana Matola");
    expect(inbox.notified).toHaveLength(1);
    // The inbox gets the STORED request — the one with an id and therefore a reference.
    expect(inbox.notified[0]!.id).toBe("7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b");
  });

  it("a failing inbox does not fail the submission — the row is the source of truth", async () => {
    const repo = new FakeRepo();
    const out = await new SubmitContactRequestCommand(repo, new CapturingInbox(true)).execute(input());
    expect(out.reference).toBe("7F3A2C");
    expect(repo.inserted).toHaveLength(1);
  });

  it("refuses the sixth message from one address inside the window, and stores nothing", async () => {
    const repo = new FakeRepo({ countFromIp: RATE_LIMIT_MAX });
    const inbox = new CapturingInbox();
    await expect(new SubmitContactRequestCommand(repo, inbox).execute(input())).rejects.toThrow(ContactRateLimitedError);
    expect(repo.inserted).toEqual([]);
    expect(inbox.notified).toEqual([]);
  });

  it("allows the fifth", async () => {
    const repo = new FakeRepo({ countFromIp: RATE_LIMIT_MAX - 1 });
    await new SubmitContactRequestCommand(repo, new CapturingInbox()).execute(input());
    expect(repo.inserted).toHaveLength(1);
  });

  it("skips the count when the request carries no address rather than refusing everyone behind a missing header", async () => {
    const repo = new FakeRepo({ countFromIp: 99 });
    await new SubmitContactRequestCommand(repo, new CapturingInbox()).execute(input({ ipAddress: null }));
    expect(repo.inserted).toHaveLength(1);
  });
});

describe("ListContactRequestsForAdminQuery", () => {
  it("bounds the page, drops an empty search, and passes the filters through", async () => {
    const repo = new FakeRepo();
    const q = new ListContactRequestsForAdminQuery(repo);
    await q.execute({ limit: 500, offset: -3, search: "   ", kind: "feedback", status: "open" });
    expect(repo.listCalls[0]).toEqual({ limit: 100, offset: 0, kind: "feedback", status: "open" });
    await q.execute({});
    expect(repo.listCalls[1]).toEqual({ limit: 25, offset: 0 });
  });
});

describe("SetContactRequestStatusCommand", () => {
  const stored = ContactRequest.create(input()).withId("7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b");

  it("resolves an open request, recording who did it", async () => {
    const repo = new FakeRepo({ existing: stored });
    const out = await new SetContactRequestStatusCommand(repo).execute({
      requestId: stored.id!,
      status: "resolved",
      actorUserId: "admin-1",
    });
    expect(out).toEqual({ status: "resolved" });
    expect(repo.statusSaved[0]!.status).toBe("resolved");
    expect(repo.statusSaved[0]!.resolvedByUserId).toBe("admin-1");
  });

  it("reopens a resolved one", async () => {
    const repo = new FakeRepo({ existing: stored.resolve(new Date(), "admin-1") });
    await new SetContactRequestStatusCommand(repo).execute({ requestId: stored.id!, status: "open", actorUserId: "admin-2" });
    expect(repo.statusSaved[0]!.status).toBe("open");
    expect(repo.statusSaved[0]!.resolvedByUserId).toBeNull();
  });

  it("refuses an id nobody has", async () => {
    const repo = new FakeRepo({ existing: null });
    await expect(
      new SetContactRequestStatusCommand(repo).execute({ requestId: "nope", status: "resolved", actorUserId: "admin-1" }),
    ).rejects.toThrow(ContactRequestNotFoundError);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/contact/__tests__/contact-commands.test.ts`
Expected: FAIL — use-case modules not found.

- [ ] **Step 3: Write the submit command**

`app/use-cases/submit-contact-request.command.ts`:

```ts
import type { ContactRequestKind } from "@ntizo/shared";
import { ContactRequest } from "../../domain/aggregates/contact-request.aggregate";
import { ContactRateLimitedError } from "../../domain/exceptions";
import type { ContactInboxPort } from "../ports/outbound/contact-inbox.port";
import type { ContactRequestRepositoryPort } from "../ports/outbound/contact-request.repository.port";

/** Messages one address may send inside the window before being asked to wait. */
export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export interface SubmitContactRequestInput {
  kind: ContactRequestKind;
  topic: string;
  name: string;
  email: string | null;
  message: string;
  locale: string;
  originPath: string | null;
  /** From the session, when there is one. Never from the form. */
  requesterUserId: string | null;
  /** From the request, for the rate limit. Never from the form. */
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Somebody wrote to us through a form.
 *
 * Three steps, in an order that matters:
 *
 * 1. **The rate limit**, counted in the table rather than in memory or a
 *    cache: a Worker isolate remembers nothing between requests, and the
 *    table already has the rows. Five an hour per address is generous for a
 *    person and useless for a script. No address in the context — which
 *    should not happen behind Cloudflare — skips the check rather than
 *    refusing everybody behind a missing header.
 * 2. **The row.** This is the whole point. Once it is written the request
 *    exists, whatever happens next.
 * 3. **The inbox**, after the write returns, and allowed to fail. A Resend
 *    outage is logged with the id and nothing else; the admin queue shows
 *    the row regardless. Not an outbox event: nothing consumes one, and
 *    at-most-once to an inbox that has a queue behind it is enough.
 */
export class SubmitContactRequestCommand {
  constructor(
    private readonly repo: ContactRequestRepositoryPort,
    private readonly inbox: ContactInboxPort,
  ) {}

  async execute(input: SubmitContactRequestInput): Promise<{ requestId: string; reference: string }> {
    if (input.ipAddress) {
      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
      const recent = await this.repo.countFromIpSince(input.ipAddress, since);
      if (recent >= RATE_LIMIT_MAX) {
        throw new ContactRateLimitedError(RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS / 60_000);
      }
    }

    const stored = await this.repo.insert(ContactRequest.create(input));

    try {
      await this.inbox.notify(stored);
    } catch (error) {
      console.error("[contact] the inbox could not be told about a request — it is stored and in the queue", {
        requestId: stored.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { requestId: stored.id!, reference: stored.reference };
  }
}
```

- [ ] **Step 4: Write the admin query and the status command**

`app/use-cases/list-contact-requests-for-admin.query.ts`:

```ts
import type { ContactRequestKind, ContactRequestStatus } from "@ntizo/shared";
import type {
  ContactRequestAdminPage,
  ContactRequestRepositoryPort,
} from "../ports/outbound/contact-request.repository.port";

export const MAX_ADMIN_LIMIT = 100;
const DEFAULT_LIMIT = 25;

/**
 * The queue, for the screen that works it. Authorisation is the edge's job,
 * as with every other administration read here.
 */
export class ListContactRequestsForAdminQuery {
  constructor(private readonly repo: ContactRequestRepositoryPort) {}

  async execute(
    input: {
      limit?: number;
      offset?: number;
      kind?: ContactRequestKind;
      status?: ContactRequestStatus;
      search?: string;
    } = {},
  ): Promise<ContactRequestAdminPage> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_ADMIN_LIMIT);
    const offset = Math.max(input.offset ?? 0, 0);
    // An empty search is no search — see `ListReviewsForAdminQuery`.
    const search = input.search?.trim() || undefined;
    return this.repo.listForAdmin({
      limit,
      offset,
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(search ? { search } : {}),
    });
  }
}
```

`app/use-cases/set-contact-request-status.command.ts`:

```ts
import type { ContactRequestStatus } from "@ntizo/shared";
import { ContactRequestNotFoundError } from "../../domain/exceptions";
import type { ContactRequestRepositoryPort } from "../ports/outbound/contact-request.repository.port";

/**
 * An administrator marking a request done, or taking that back.
 *
 * One command carrying the target status rather than a resolve/reopen pair,
 * for the reason `setReviewFeatured` gives about itself: two endpoints make
 * every caller ask which state it is in first, and get it wrong under a race.
 * The aggregate makes both directions idempotent, so the race is harmless.
 */
export class SetContactRequestStatusCommand {
  constructor(private readonly repo: ContactRequestRepositoryPort) {}

  async execute(input: {
    requestId: string;
    status: ContactRequestStatus;
    actorUserId: string;
  }): Promise<{ status: ContactRequestStatus }> {
    const current = await this.repo.findById(input.requestId);
    if (!current) throw new ContactRequestNotFoundError(input.requestId);

    const next =
      input.status === "resolved" ? current.resolve(new Date(), input.actorUserId) : current.reopen();
    const saved = await this.repo.saveStatus(next);
    if (!saved) throw new ContactRequestNotFoundError(input.requestId);

    return { status: next.status };
  }
}
```

- [ ] **Step 5: Write the bootstrap and the index**

`bootstrap/index.ts`:

```ts
import { DrizzleContactRequestRepository } from "../infrastructure/repositories/drizzle/contact-request.repository";
import { EmailContactInboxAdapter } from "../infrastructure/outbound-adapters/email-contact-inbox.adapter";
import { SubmitContactRequestCommand } from "../app/use-cases/submit-contact-request.command";
import { ListContactRequestsForAdminQuery } from "../app/use-cases/list-contact-requests-for-admin.query";
import { SetContactRequestStatusCommand } from "../app/use-cases/set-contact-request-status.command";

export function bootstrapContact() {
  const contactRequestRepository = new DrizzleContactRequestRepository();
  const inbox = new EmailContactInboxAdapter();
  return {
    adapters: { contactRequestRepository, inbox },
    useCases: {
      submitContactRequest: new SubmitContactRequestCommand(contactRequestRepository, inbox),
      listContactRequestsForAdmin: new ListContactRequestsForAdminQuery(contactRequestRepository),
      setContactRequestStatus: new SetContactRequestStatusCommand(contactRequestRepository),
    },
  };
}

export type ContactBootstrap = ReturnType<typeof bootstrapContact>;
```

`index.ts`:

```ts
export * from "./bootstrap";
export { ContactRequest } from "./domain/aggregates/contact-request.aggregate";
export { SubmitContactRequestCommand } from "./app/use-cases/submit-contact-request.command";
export { ListContactRequestsForAdminQuery } from "./app/use-cases/list-contact-requests-for-admin.query";
export { SetContactRequestStatusCommand } from "./app/use-cases/set-contact-request-status.command";
export type {
  ContactRequestAdminPage,
  ContactRequestAdminRow,
  ContactRequestRepositoryPort,
} from "./app/ports/outbound/contact-request.repository.port";
export type { ContactInboxPort } from "./app/ports/outbound/contact-inbox.port";
```

- [ ] **Step 6: Run the tests**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/contact && bun run typecheck`
Expected: every contact test passes (aggregate 10, adapter 4, commands 9); typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/contact
git commit -m "feat(contact): submit, list for admin, set status — and the context's bootstrap"
```

---

### Task 7: GraphQL — the anonymous mutation, the admin query, the admin mutation, and the mount

**Files:**
- Create: `packages/shared/src/read-models/system/contact/contact-request-admin.schema.ts`, `packages/shared/src/read-models/system/contact/index.ts`
- Modify: `packages/shared/src/read-models/system/index.ts`
- Create: `packages/backend/src/modules/ntizo/write/contact/graphql/schema/mutations.ts`
- Create: `packages/backend/src/modules/ntizo/write/contact/graphql/handlers/mutations.handlers.ts`
- Create: `packages/backend/src/modules/ntizo/write/contact/index.ts`
- Modify: `packages/backend/src/modules/ntizo/write/schema.ts`
- Create: `packages/backend/src/modules/ntizo/read/contact/graphql/schema/queries.ts`
- Create: `packages/backend/src/modules/ntizo/read/contact/graphql/handlers/queries.handlers.ts`
- Create: `packages/backend/src/modules/ntizo/read/contact/bootstrap/index.ts`
- Create: `packages/backend/src/modules/ntizo/read/contact/index.ts`
- Modify: `packages/backend/src/modules/ntizo/read/schema.ts`
- Modify: `apps/backend/api/src/graphql/private.ts`
- Test: `packages/backend/src/modules/ntizo/write/contact/__tests__/mutations.test.ts`

**Interfaces:**
- Produces GraphQL fields (emitted names follow the kit's `<group><Field>` convention, as `reviewAllForAdmin` does): `contactRequestSubmit(input: ContactRequestSubmitInput!): { requestId, reference }`, `contactRequestSetStatus(input: ContactRequestSetStatusInput!): { status }`, `contactRequestAllForAdmin(input: ContactRequestAllForAdminInput!): ContactRequestAdminPage`.
- Produces `contactRequestAdminReadModel`, `ContactRequestAdminDTO`, `contactRequestAdminPageReadModel`, `ContactRequestAdminPageDTO` from `@ntizo/shared/read-models`.

- [ ] **Step 1: The read model**

`packages/shared/src/read-models/system/contact/contact-request-admin.schema.ts`:

```ts
import { z } from "zod";
import { contactRequestKindSchema, contactRequestStatusSchema } from "../../../enums/contact-enums";

/**
 * One request as the administration queue sees it.
 *
 * Everything on the row, including the address it was sent from: unlike the
 * review projection, this screen IS the investigation — it is where somebody
 * decides whether a message is a customer in trouble or a script.
 */
export const contactRequestAdminReadModel = z.object({
  id: z.string().min(1),
  /** The six characters the person was shown. */
  reference: z.string().length(6),
  kind: contactRequestKindSchema,
  topic: z.string().min(1),
  name: z.string(),
  email: z.string().nullable(),
  message: z.string(),
  requesterUserId: z.string().nullable(),
  locale: z.string(),
  originPath: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  status: contactRequestStatusSchema,
  /** ISO 8601, or null while open. */
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type ContactRequestAdminDTO = z.infer<typeof contactRequestAdminReadModel>;

export const contactRequestAdminPageReadModel = z.object({
  items: z.array(contactRequestAdminReadModel),
  total: z.number().int().min(0),
  /** Open across the whole table, whatever the filters — the queue's badge. */
  openCount: z.number().int().min(0),
});

export type ContactRequestAdminPageDTO = z.infer<typeof contactRequestAdminPageReadModel>;
```

`contact/index.ts`: `export * from "./contact-request-admin.schema";`

Append to `read-models/system/index.ts`: `export * from "./contact";`

- [ ] **Step 2: The write schema**

`write/contact/graphql/schema/mutations.ts`:

```ts
import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { contactRequestKindSchema, contactRequestStatusSchema } from "@ntizo/shared";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * Somebody writing to us through a form. **Anonymous callers are allowed** —
 * the first mutation on this tier that is — because a partnership enquiry or
 * a piece of feedback should not need an account.
 *
 * The bounds here refuse obvious nonsense cheaply; the aggregate is where the
 * rules are defined (2–80, 10–2000, email unless feedback, topic per kind).
 *
 * `website` is the honeypot. Visually hidden on the form, filled only by a
 * script that fills every field; the handler answers a filled one with a
 * success it never wrote. It must ACCEPT a value — refusing it would tell the
 * script which field to skip.
 */
export const submitContactRequest = defineMutation({
  input: zodSchema(
    z.object({
      kind: contactRequestKindSchema,
      topic: z.string().trim().min(1).max(40),
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().max(254).nullable(),
      message: z.string().trim().min(1).max(4000),
      locale: z.string().trim().min(2).max(16),
      originPath: z.string().max(400).nullable(),
      website: z.string().max(400).optional(),
    }),
  ),
  output: zodSchema(z.object({ requestId: z.string().min(1), reference: z.string().length(6) })),
  docs: { summary: "Send a message to the team through the contact or feedback form", tags: ["Contact"] },
});

/** An administrator marking a request resolved, or reopening it. */
export const setContactRequestStatus = defineMutation({
  input: zodSchema(
    z.object({
      requestId: z.string().uuid(),
      status: contactRequestStatusSchema,
    }),
  ),
  output: zodSchema(z.object({ status: contactRequestStatusSchema })),
  docs: { summary: "Mark a contact request resolved, or reopen it", tags: ["Contact", "Admin"] },
});

export const contactWriteSchema = defineGraphQLSchema(
  { contactRequest: { submit: submitContactRequest, setStatus: setContactRequestStatus } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
```

- [ ] **Step 3: The write handlers**

`write/contact/graphql/handlers/mutations.handlers.ts`:

```ts
import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { ContactBootstrap } from "../../../../bounded-contexts/contact/bootstrap";
import { contactWriteSchema } from "../schema/mutations";

export interface ContactWriteModule {
  readonly contact: ContactBootstrap;
}

/** Copied rather than shared, as the review handlers' own is — tiers do not import each other here. */
function requireAdmin(ctx: GraphQLHandlerContext): string {
  const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId || role !== "admin") {
    throw new ForbiddenError({ message: "Only administrators may work the contact queue", code: "ADMIN_ONLY" });
  }
  return requesterUserId;
}

export function createContactWriteHandlers(mod: ContactWriteModule) {
  const uc = mod.contact.useCases;

  return graphqlRoutes(contactWriteSchema)
    .handle("contactRequest.submit", async (args, ctx) => {
      const { website, ...form } = args.input;
      // The trap sprung. A success the script cannot tell from a real one,
      // and no row, no email, no count against the address.
      if (website && website.trim() !== "") {
        return { requestId: crypto.randomUUID(), reference: crypto.randomUUID().slice(0, 6).toUpperCase() };
      }
      const { requesterUserId, ipAddress, userAgent } = asNtizoGraphqlContext(ctx);
      return uc.submitContactRequest.execute({ ...form, requesterUserId, ipAddress, userAgent });
    })
    .handle("contactRequest.setStatus", async (args, ctx) => {
      const actorUserId = requireAdmin(ctx);
      return uc.setContactRequestStatus.execute({ ...args.input, actorUserId });
    })
    .build();
}
```

`write/contact/index.ts`:

```ts
export { contactWriteSchema } from "./graphql/schema/mutations";
export { createContactWriteHandlers, type ContactWriteModule } from "./graphql/handlers/mutations.handlers";
```

In `write/schema.ts`: import `contactWriteSchema` from `"./contact/graphql/schema/mutations"` and add it as the last argument of `mergeGraphQLSchemas(...)`.

- [ ] **Step 4: The read schema, handlers, bootstrap**

`read/contact/graphql/schema/queries.ts`:

```ts
import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { contactRequestKindSchema, contactRequestStatusSchema } from "@ntizo/shared";
import { contactRequestAdminPageReadModel } from "@ntizo/shared/read-models";
import { MAX_ADMIN_LIMIT } from "../../../../bounded-contexts/contact/app/use-cases/list-contact-requests-for-admin.query";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/** The contact queue. Guarded by the handler, which refuses anyone who is not an admin. */
export const listContactRequestsForAdmin = defineQuery({
  input: zodSchema(
    z.object({
      // Optional, not `.default()` — a zod default does not survive into the emitted schema.
      limit: z.number().int().min(1).max(MAX_ADMIN_LIMIT).optional(),
      offset: z.number().int().min(0).optional(),
      kind: contactRequestKindSchema.optional(),
      status: contactRequestStatusSchema.optional(),
      // Bounded: the string ends up in a LIKE pattern.
      search: z.string().trim().max(120).optional(),
    }),
  ),
  output: zodSchema(contactRequestAdminPageReadModel),
  docs: { summary: "Every contact request, for administration", tags: ["Admin", "Contact"] },
});

export const contactReadSchema = defineGraphQLSchema(
  { contactRequest: { allForAdmin: listContactRequestsForAdmin } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
```

`read/contact/graphql/handlers/queries.handlers.ts`:

```ts
import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import { contactReadSchema } from "../schema/queries";
import type { ListContactRequestsForAdminQuery } from "../../../../bounded-contexts/contact/app/use-cases/list-contact-requests-for-admin.query";

export interface ContactReadModule {
  readonly listContactRequestsForAdmin: ListContactRequestsForAdminQuery;
}

export function createContactReadHandlers(mod: ContactReadModule) {
  return graphqlRoutes(contactReadSchema)
    .handleWithUseCase("contactRequest.allForAdmin", {
      argsMapper: (args, ctx) => {
        const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
        if (!requesterUserId || role !== "admin") {
          throw new ForbiddenError({ message: "Only administrators may read the contact queue", code: "ADMIN_ONLY" });
        }
        return args.input;
      },
      useCase: mod.listContactRequestsForAdmin,
      responseMapper: (output) => output,
    })
    .build();
}
```

`read/contact/bootstrap/index.ts`:

```ts
import { DrizzleContactRequestRepository } from "../../../bounded-contexts/contact/infrastructure/repositories/drizzle/contact-request.repository";
import { ListContactRequestsForAdminQuery } from "../../../bounded-contexts/contact/app/use-cases/list-contact-requests-for-admin.query";
import type { ContactReadModule } from "../graphql/handlers/queries.handlers";

/** Its own adapter rather than `bootstrapContact()`'s — a read mount owns no inbox. */
export function bootstrapContactRead(): {
  adapters: { contactRequestRepository: DrizzleContactRequestRepository };
  useCases: ContactReadModule;
} {
  const contactRequestRepository = new DrizzleContactRequestRepository();
  return {
    adapters: { contactRequestRepository },
    useCases: { listContactRequestsForAdmin: new ListContactRequestsForAdminQuery(contactRequestRepository) },
  };
}

export type ContactReadBootstrap = ReturnType<typeof bootstrapContactRead>;
```

`read/contact/index.ts`:

```ts
export * from "./bootstrap";
export { contactReadSchema } from "./graphql/schema/queries";
export { createContactReadHandlers, type ContactReadModule } from "./graphql/handlers/queries.handlers";
```

In `read/schema.ts`: import `contactReadSchema` from `"./contact/graphql/schema/queries"` and add it as the last argument of `mergeGraphQLSchemas(...)`.

- [ ] **Step 5: Mount in the composition root**

In `apps/backend/api/src/graphql/private.ts`:

Imports, beside the review ones:

```ts
import { createContactWriteHandlers } from "@ntizo/backend/modules/ntizo/write/contact";
import { bootstrapContactRead, createContactReadHandlers } from "@ntizo/backend/modules/ntizo/read/contact";
import { bootstrapContact } from "@ntizo/backend/modules/ntizo/bounded-contexts/contact";
```

Inside `buildPrivateGraphQLFields`, after `const reviewRead = bootstrapReviewRead();`:

```ts
  const contact = bootstrapContact();
  const contactRead = bootstrapContactRead();
```

In the `fields` array, after `...createReviewReadHandlers(reviewRead.useCases),`:

```ts
      ...createContactReadHandlers(contactRead.useCases),
```

and after `...createReviewWriteHandlers({ review }),`:

```ts
      ...createContactWriteHandlers({ contact }),
```

- [ ] **Step 6: Write the handler tests**

`write/contact/__tests__/mutations.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import type { ContactBootstrap } from "../../../bounded-contexts/contact/bootstrap";
import { createContactWriteHandlers } from "../graphql/handlers/mutations.handlers";
import { contactWriteSchema } from "../graphql/schema/mutations";

function ctx(overrides: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: null,
    email: null,
    firstName: null,
    lastName: null,
    role: "customer",
    requestId: null,
    ipAddress: "197.218.0.1",
    userAgent: "Mozilla/5.0",
    ...overrides,
  };
}

function makeModule(calls: { submit: unknown[]; setStatus: unknown[] }) {
  return {
    contact: {
      adapters: {} as never,
      useCases: {
        submitContactRequest: {
          execute: async (input: unknown) => {
            calls.submit.push(input);
            return { requestId: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", reference: "7F3A2C" };
          },
        },
        listContactRequestsForAdmin: { execute: async () => ({ items: [], total: 0, openCount: 0 }) },
        setContactRequestStatus: {
          execute: async (input: unknown) => {
            calls.setStatus.push(input);
            return { status: "resolved" as const };
          },
        },
      },
    } as unknown as ContactBootstrap,
  };
}

const FORM = {
  kind: "contact" as const,
  topic: "general",
  name: "Joana Matola",
  email: "joana@exemplo.com",
  message: "Gostava de propor uma parceria com a minha escola.",
  locale: "pt-MZ",
  originPath: null,
};

describe("the contact write schema", () => {
  it("exposes submit and setStatus", () => {
    const fields = Object.keys(
      (contactWriteSchema as unknown as { fields: { contactRequest: object } }).fields.contactRequest,
    ).sort();
    expect(fields).toEqual(["setStatus", "submit"]);
  });
});

describe("createContactWriteHandlers", () => {
  it("lets an anonymous caller submit, stamping the address and no user from the context", async () => {
    const calls = { submit: [] as unknown[], setStatus: [] as unknown[] };
    const field = createContactWriteHandlers(makeModule(calls)).find((h) => h.key === "contactRequest.submit")!;
    const out = await field.handler({ ...FORM, requesterUserId: "victim" }, ctx());
    expect(out).toEqual({ requestId: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", reference: "7F3A2C" });
    expect(calls.submit).toEqual([{ ...FORM, requesterUserId: null, ipAddress: "197.218.0.1", userAgent: "Mozilla/5.0" }]);
  });

  it("stamps the session's user id when there is one", async () => {
    const calls = { submit: [] as unknown[], setStatus: [] as unknown[] };
    const field = createContactWriteHandlers(makeModule(calls)).find((h) => h.key === "contactRequest.submit")!;
    await field.handler(FORM, ctx({ requesterUserId: "u-session" }));
    expect((calls.submit[0] as { requesterUserId: string }).requesterUserId).toBe("u-session");
  });

  it("answers a filled honeypot with a success it never wrote", async () => {
    const calls = { submit: [] as unknown[], setStatus: [] as unknown[] };
    const field = createContactWriteHandlers(makeModule(calls)).find((h) => h.key === "contactRequest.submit")!;
    const out = (await field.handler({ ...FORM, website: "http://spam.example" }, ctx())) as { requestId: string; reference: string };
    expect(out.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(out.reference).toHaveLength(6);
    expect(calls.submit).toEqual([]);
  });

  it("refuses setStatus from anyone who is not an administrator, before the use case runs", async () => {
    const calls = { submit: [] as unknown[], setStatus: [] as unknown[] };
    const field = createContactWriteHandlers(makeModule(calls)).find((h) => h.key === "contactRequest.setStatus")!;
    const args = { requestId: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", status: "resolved" };
    await expect(field.handler(args, ctx({ requesterUserId: "u-1", role: "customer" }))).rejects.toThrow("administrators");
    await expect(field.handler(args, ctx({ requesterUserId: null, role: "admin" }))).rejects.toThrow("administrators");
    expect(calls.setStatus).toEqual([]);
  });

  it("stamps the administrator as the actor on setStatus", async () => {
    const calls = { submit: [] as unknown[], setStatus: [] as unknown[] };
    const field = createContactWriteHandlers(makeModule(calls)).find((h) => h.key === "contactRequest.setStatus")!;
    await field.handler(
      { requestId: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", status: "resolved", actorUserId: "victim" },
      ctx({ requesterUserId: "admin-1", role: "admin" }),
    );
    expect(calls.setStatus).toEqual([
      { requestId: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", status: "resolved", actorUserId: "admin-1" },
    ]);
  });
});
```

- [ ] **Step 7: Run everything that guards the wiring**

Run:

```bash
cd packages/shared && bun run typecheck
cd ../backend && bun test src/modules/ntizo/write/contact src/modules/ntizo/__tests__/fitness-tier-segregation.test.ts src/modules/ntizo/public/__tests__/public-imports.guard.test.ts && bun run typecheck
cd ../../apps/backend/api && bun test src/graphql/__tests__/schema-mount.test.ts && bun run typecheck
```

Expected: the five handler tests pass; tier segregation passes (read = queries only, write = mutations only); the public-imports guard passes; `schema-mount.test.ts` passes — it is the test that goes red if a field is in the schema and not in `private.ts`; all typechecks clean.

- [ ] **Step 8: Prove it on the wire, once**

Start the API locally (`cd apps/backend/api && bun run dev`, Node 22 on the PATH for wrangler — see the dev-environment memory) and POST, signed out:

```bash
curl -s http://localhost:8788/graphql -H 'content-type: application/json' -H 'x-graphql-csrf: 1' \
  -d '{"query":"mutation($i: ContactRequestSubmitInput!){ contactRequestSubmit(input:$i){ requestId reference } }","variables":{"i":{"kind":"contact","topic":"general","name":"Curl Test","email":"curl@example.test","message":"Uma mensagem de teste com mais de dez caracteres.","locale":"pt-MZ","originPath":null}}}'
```

Expected: `{"data":{"contactRequestSubmit":{"requestId":"…","reference":"…"}}}`, and the console email printed in the API log with `reply-to: curl@example.test`. Delete the row afterwards (`DELETE FROM ntizo_contact.contact_request WHERE name = 'Curl Test'` against the dev database) so it does not sit in the real queue.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/read-models packages/backend/src/modules/ntizo/write/contact packages/backend/src/modules/ntizo/write/schema.ts packages/backend/src/modules/ntizo/read/contact packages/backend/src/modules/ntizo/read/schema.ts apps/backend/api/src/graphql/private.ts
git commit -m "feat(contact): contactRequest.submit (anonymous, honeypotted), allForAdmin and setStatus, mounted"
```

---

### Task 8: One place for the addresses; the footer, the legal pages and the provider pitch read it

**Files:**
- Create: `apps/frontend/web/src/shared/lib/contact.ts`
- Modify: `apps/frontend/web/src/features/landing/ui/footer.tsx`
- Modify: `apps/frontend/web/src/features/become-provider/ui/become-provider-page.tsx`
- Modify: `apps/frontend/web/src/features/legal/ui/legal-page.tsx`
- Modify: `apps/frontend/web/src/shared/components/site-header.tsx`
- Modify: `apps/frontend/web/src/shared/locales/<8>/landing.json`, `apps/frontend/web/src/shared/locales/<8>/legal.json`
- Modify: `apps/frontend/web/src/shared/locales/__tests__/locales.test.ts`
- Test: `apps/frontend/web/src/features/landing/ui/__tests__/footer.test.tsx`

**Interfaces:**
- Produces: `CONTACT = { general, support, privacy, instagram, linkedin }` from `@/shared/lib/contact`; `SiteHeader` accepts `current="none"`; landing keys `footer.links.{about,contact,feedback,careers}`; legal key `contact` takes `{{email}}`.

- [ ] **Step 1: The constants**

`apps/frontend/web/src/shared/lib/contact.ts`:

```ts
/**
 * How to reach Ntizo, written once.
 *
 * Three addresses on one domain, decided 2026-09-02. Before this the code
 * carried `hello@ntizo.com` in the footer, `ola@ntizo.com` on the provider
 * pitch and `privacidade@ntizo.co.mz` in the policies — three domains' worth
 * of promises, two of them to inboxes nobody reads. Everything that prints an
 * address reads it from here; nothing types one in.
 */
export const CONTACT = {
  /** General correspondence, partnerships, press, careers; where the contact and feedback forms are forwarded. */
  general: "ola@ntizo.co.mz",
  /** Customers and providers with a problem — the help center's address; printed in the footer. */
  support: "suporte@ntizo.co.mz",
  /** Data requests, as the privacy policy says. */
  privacy: "privacidade@ntizo.co.mz",
  instagram: "https://www.instagram.com/ntizo.mz/",
  linkedin: "https://www.linkedin.com/company/ntizo/",
} as const;
```

- [ ] **Step 2: Write the failing footer test**

`apps/frontend/web/src/features/landing/ui/__tests__/footer.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Footer } from "../footer";

/**
 * The footer's promises, pinned.
 *
 * The Empresa column used to be six `href="#"` links; it is now five routes
 * that exist (the help center adds its two when `/help` lands — follow-ups #132). The payment row used to advertise four methods the checkout
 * refuses; it now names the one that charges. Both are the kind of thing a
 * later edit quietly puts back.
 */
function renderFooter() {
  const rootRoute = createRootRoute();
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: Footer }),
      ...["/about", "/contact", "/feedback", "/become-provider", "/careers", "/terms", "/privacy", "/admin"].map(stub),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

describe("Footer", () => {
  it("links the five company pages that exist, in the reference's order", () => {
    renderFooter();
    const company = screen.getByRole("heading", { name: /^company$/i }).parentElement!;
    const hrefs = Array.from(company.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/about", "/contact", "/feedback", "/become-provider", "/careers"]);
  });

  it("prints the support address on the ntizo.co.mz domain and nothing on .com", () => {
    renderFooter();
    expect(screen.getByRole("link", { name: "suporte@ntizo.co.mz" })).toHaveAttribute("href", "mailto:suporte@ntizo.co.mz");
    expect(document.body.textContent).not.toContain("ntizo.com");
  });

  it("advertises only the payment method the checkout actually charges", () => {
    renderFooter();
    expect(screen.getByText("M-Pesa")).toBeInTheDocument();
    expect(screen.queryByText("e-Mola")).toBeNull();
    expect(screen.queryByText("Visa")).toBeNull();
    expect(screen.queryByText("Mastercard")).toBeNull();
  });
});
```

The first assertion needs the column title to be a heading. In `FooterCol`, change `<div style={footerTitle}>{title}</div>` to `<h2 style={footerTitle}>{title}</h2>` (the style already sets the size; add `margin: 0` to `footerTitle`'s object — `marginBottom: 16` stays, so write `marginTop: 0`).

- [ ] **Step 3: Run it to see it fail**

Run: `cd apps/frontend/web && bunx vitest run src/features/landing/ui/__tests__/footer.test.tsx`
Expected: FAIL — one link in the Empresa column, `hello@ntizo.com` present, four chips.

- [ ] **Step 4: Rewrite the footer's three places**

In `footer.tsx`:

Add `import { CONTACT } from "@/shared/lib/contact";`.

Replace the Support column's `FooterMeta` with:

```tsx
            <FooterMeta
              label={t("footer.supportEmailLabel")}
              value={CONTACT.support}
              href={`mailto:${CONTACT.support}`}
            />
```

Replace the Company column (keep the existing comment about the links coming back; add: *"Five of the seven are back as of 2026-09-02. 'Falar com o suporte' and 'Perguntas frequentes' return with the help center's `/help` — follow-ups #132."*) with:

```tsx
          <FooterCol title={t("footer.company")}>
            <FooterLink to="/about">{t("footer.links.about")}</FooterLink>
            <FooterLink to="/contact">{t("footer.links.contact")}</FooterLink>
            <FooterLink to="/feedback">{t("footer.links.feedback")}</FooterLink>
            <FooterLink to="/become-provider">{t("footer.becomeProvider")}</FooterLink>
            <FooterLink to="/careers">{t("footer.links.careers")}</FooterLink>
          </FooterCol>
```

Replace the four `PayChip`s with one, and the comment above them with:

```tsx
              {/* One chip, because one method charges. e-Mola, Visa and
                  Mastercard stood here until 2026-09-02, advertising methods
                  the checkout refuses — see the FAQ's "que métodos aceitam".
                  Each returns the day its charge path ships
                  (follow-ups #129). */}
              <PayChip color="#e60000">M-Pesa</PayChip>
```

Replace the two social `href`s with `CONTACT.instagram` and `CONTACT.linkedin`.

- [ ] **Step 5: The provider pitch, the legal pages, the header**

`become-provider-page.tsx`: add `import { CONTACT } from "@/shared/lib/contact";` and change the closing band's `href="mailto:ola@ntizo.com"` to `href={\`mailto:${CONTACT.general}\`}`. Confirm the `Eyebrow` component has **no** rule element (no `h-px w-8` span; the class list is `font-rounded inline-flex items-center text-[12px] font-bold tracking-[0.18em] uppercase …`). If this worktree's copy still has the span, remove it and its `gap-3`, and write the doc comment: *"It used to carry a short accent-coloured rule to its left. The rule left on 2026-09-02 at the owner's request: it is the kind of flourish that reads as machine-made, and it must not appear on any page."*

`legal-page.tsx`: add `import { CONTACT } from "@/shared/lib/contact";` and change `{t("contact")}` to `{t("contact", { email: CONTACT.privacy })}`.

`site-header.tsx`: widen the prop — `current?: "explore" | "categories" | "services" | "providers" | "none";` — and add above it:

```tsx
  /**
   * Which pill is lit. `"none"` for pages outside the three destinations —
   * the company pages — so the header does not claim they are "Explore".
   * `endsWith("none")` matches no nav key, which is the whole mechanism.
   */
```

- [ ] **Step 6: The locale keys**

In every `landing.json`, inside `footer`, add a `links` object. In every `legal.json`, replace the address in `contact` with `{{email}}`.

| Locale | `footer.links` |
|---|---|
| pt-MZ | `{"about":"Sobre","contact":"Contacto","feedback":"Dar feedback","careers":"Carreiras"}` |
| pt-PT | `{"about":"Sobre","contact":"Contacto","feedback":"Dar feedback","careers":"Carreiras"}` |
| en-US | `{"about":"About","contact":"Contact","feedback":"Share feedback","careers":"Careers"}` |
| es-ES | `{"about":"Sobre nosotros","contact":"Contacto","feedback":"Enviar opinión","careers":"Empleo"}` |
| fr-FR | `{"about":"À propos","contact":"Contact","feedback":"Donner votre avis","careers":"Carrières"}` |
| de-DE | `{"about":"Über uns","contact":"Kontakt","feedback":"Feedback geben","careers":"Karriere"}` |
| it-IT | `{"about":"Chi siamo","contact":"Contatti","feedback":"Lascia un feedback","careers":"Lavora con noi"}` |
| nl-NL | `{"about":"Over ons","contact":"Contact","feedback":"Feedback geven","careers":"Werken bij"}` |

`legal.json` `contact`, per locale (the sentence as it is today with the address replaced by `{{email}}`):

| Locale | `contact` |
|---|---|
| en-US | `Questions about this document? Write to {{email}}.` |
| pt-MZ / pt-PT | `Dúvidas sobre este documento? Escreva para {{email}}.` |
| es-ES | `¿Dudas sobre este documento? Escribe a {{email}}.` |
| fr-FR | `Des questions sur ce document ? Écrivez à {{email}}.` |
| de-DE | `Fragen zu diesem Dokument? Schreiben Sie an {{email}}.` |
| it-IT | `Domande su questo documento? Scrivi a {{email}}.` |
| nl-NL | `Vragen over dit document? Schrijf naar {{email}}.` |

Then add `landing` and `legal` to the parity gate. In `locales.test.ts`, add the sixteen imports beside the `checkout` ones (`import deDELanding from "../de-DE/landing.json";` … and the same for `legal`), and two entries in `NAMESPACES`:

```ts
  landing: {
    "de-DE": deDELanding, "en-US": enUSLanding, "es-ES": esESLanding, "fr-FR": frFRLanding,
    "it-IT": itITLanding, "nl-NL": nlNLLanding, "pt-MZ": ptMZLanding, "pt-PT": ptPTLanding,
  },
  legal: {
    "de-DE": deDELegal, "en-US": enUSLegal, "es-ES": esESLegal, "fr-FR": frFRLegal,
    "it-IT": itITLegal, "nl-NL": nlNLLegal, "pt-MZ": ptMZLegal, "pt-PT": ptPTLegal,
  },
```

(Both namespaces were checked on 2026-09-02 to already agree across the eight files, so this widens the gate without a fix-up.)

- [ ] **Step 7: Run the tests, the parity gate, typecheck and lint**

Run: `cd apps/frontend/web && bunx vitest run src/features/landing src/shared/locales && bun run typecheck && bun run lint`
Expected: footer tests pass, landing-page tests still pass, parity passes for `directory`, `checkout`, `landing`, `legal`; typecheck and lint clean.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/web/src/shared/lib/contact.ts apps/frontend/web/src/features/landing apps/frontend/web/src/features/become-provider apps/frontend/web/src/features/legal apps/frontend/web/src/shared/components/site-header.tsx apps/frontend/web/src/shared/locales
git commit -m "feat(web): one place for the addresses; the footer's company column, on ntizo.co.mz, M-Pesa alone"
```

---

### Task 9: The `company` namespace — the words, in eight languages

**Files:**
- Create: `apps/frontend/web/src/shared/locales/pt-MZ/company.json` (the reference — written first, from the mockup)
- Create: `apps/frontend/web/src/shared/locales/{en-US,pt-PT,es-ES,fr-FR,de-DE,it-IT,nl-NL}/company.json`
- Modify: `apps/frontend/web/src/shared/lib/i18n.ts`
- Modify: `apps/frontend/web/src/shared/locales/__tests__/locales.test.ts`
- Test: `apps/frontend/web/src/shared/locales/__tests__/company-content.test.ts`

**Interfaces:**
- Produces: namespace `company` with the key tree below, identical in all eight files; `t("careers.how", { returnObjects: true })` returns `{ title: string; body: string }[]`; `shared.links.{contact,feedback,about,careers}` feed the "Ver também" strip; `topics.{contact,feedback}.*` label the form's select and the admin list.

- [ ] **Step 1: Write the failing content test**

`company-content.test.ts` — the parity gate compares dotted paths, but an array is one leaf to it, so a locale could drop a principle unnoticed. This pins the shape and the copy rule:

```ts
import { describe, expect, it } from "vitest";
import deDE from "../de-DE/company.json";
import enUS from "../en-US/company.json";
import esES from "../es-ES/company.json";
import frFR from "../fr-FR/company.json";
import itIT from "../it-IT/company.json";
import nlNL from "../nl-NL/company.json";
import ptMZ from "../pt-MZ/company.json";
import ptPT from "../pt-PT/company.json";

const LOCALES = { "de-DE": deDE, "en-US": enUS, "es-ES": esES, "fr-FR": frFR, "it-IT": itIT, "nl-NL": nlNL, "pt-MZ": ptMZ, "pt-PT": ptPT };

describe("company namespace", () => {
  for (const [locale, bundle] of Object.entries(LOCALES)) {
    it(`${locale} has three "how we work" principles, none empty`, () => {
      expect(bundle.careers.how).toHaveLength(3);
      for (const p of bundle.careers.how) {
        expect(p.title.trim()).not.toBe("");
        expect(p.body.trim()).not.toBe("");
      }
    });

    it(`${locale} quotes no platform_settings number`, () => {
      // The durations and the rate live in `platform_settings` and change
      // without the page knowing — the spec forbids them in static copy.
      const text = JSON.stringify(bundle);
      expect(text).not.toMatch(/\b2\s?h\b|\b2 horas\b|\b2 hours\b|\b15 min|\b30 min|\b10\s?%/i);
    });

    it(`${locale} keeps the placeholders the components interpolate`, () => {
      expect(bundle.form.errors.rateLimited).toContain("{{email}}");
      expect(bundle.form.errors.generic).toContain("{{email}}");
      expect(bundle.form.success.replyTo).toContain("{{email}}");
      expect(bundle.form.success.reference).toContain("{{reference}}");
      expect(bundle.careers.openingsHint).toContain("{{email}}");
    });
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/frontend/web && bunx vitest run src/shared/locales/__tests__/company-content.test.ts`
Expected: FAIL — the files do not exist.

- [ ] **Step 3: Write `pt-MZ/company.json` — the reference, verbatim**

```json
{
  "shared": {
    "seeAlso": "Ver também",
    "links": {
      "contact": { "title": "Contacto", "body": "Parcerias, imprensa, ou simplesmente um olá." },
      "feedback": { "title": "Dar feedback", "body": "Uma ideia, algo que não funcionou, ou o que gostou." },
      "about": { "title": "Sobre a Ntizo", "body": "O que fazemos, como funciona e no que acreditamos." },
      "careers": { "title": "Carreiras", "body": "Como trabalhamos, e como se candidatar." }
    }
  },
  "about": {
    "headTitle": "Sobre a Ntizo",
    "eyebrow": "Sobre a Ntizo",
    "heading": "Serviços locais em quem pode",
    "headingAccent": "confiar",
    "lede": "A Ntizo liga quem precisa de um serviço a quem o sabe fazer. Prestadores verificados, preço à vista, e o pagamento só depois de o prestador confirmar a hora.",
    "missionEyebrow": "A nossa missão",
    "missionTitle": "Tornar a contratação de um serviço tão simples e segura como uma compra numa loja.",
    "mission1": "Em Moçambique, encontrar um bom canalizador, uma cabeleireira ou um explicador ainda depende de conhecer alguém que conheça alguém. O preço combina-se por telefone, a hora falha, e quando corre mal não há a quem recorrer.",
    "mission2": "A Ntizo existe para mudar isso. Cada prestador é verificado antes de aparecer nos resultados, cada serviço tem o preço à vista, e cada reserva fica registada de ponta a ponta, da hora marcada ao pagamento.",
    "howEyebrow": "Como funciona",
    "howTitle": "Três passos, e nenhum deles é pagar antes de saber se vai acontecer.",
    "steps": {
      "search": { "title": "Procure e compare", "body": "Veja serviços por categoria e cidade, com o preço, as avaliações de quem já os usou e o selo de verificado." },
      "book": { "title": "Reserve a hora", "body": "Escolha o dia e a hora no calendário do prestador e diga onde o serviço acontece. O pedido segue para ele confirmar." },
      "pay": { "title": "Pague depois da confirmação", "body": "Só depois de o prestador confirmar a hora recebe o pedido de pagamento no telemóvel. Antes disso não é cobrado nada." }
    },
    "principlesEyebrow": "No que acreditamos",
    "principlesTitle": "Quatro regras que não mudam, seja qual for o serviço.",
    "principles": {
      "price": { "title": "O preço é o preço.", "body": "O valor que vê no anúncio é o valor que paga. A comissão da plataforma sai do lado do prestador, nunca do seu." },
      "verification": { "title": "Verificação antes de visibilidade.", "body": "Nenhum prestador aparece nos resultados sem ter enviado um documento de identidade e sem uma pessoa da Ntizo o ter revisto." },
      "payAfter": { "title": "Pagar só depois do sim.", "body": "O pedido de pagamento só chega depois de o prestador confirmar a hora. Se ele não confirmar ou recusar, não há nada a cobrar." },
      "local": { "title": "Feito para aqui, pronto para crescer.", "body": "M-Pesa, português, as cidades onde vivemos. E uma plataforma desenhada para servir outros países quando chegar a altura." }
    },
    "customersEyebrow": "Para clientes",
    "customersTitle": "Encontre, reserve e pague num só sítio.",
    "customersBody": "Sem telefonemas para saber o preço, sem esperar por uma resposta que não vem. Cada reserva tem uma hora, um valor e um registo.",
    "customersCta": "Explorar serviços",
    "providersEyebrow": "Para prestadores",
    "providersTitle": "A sua agenda, os seus preços, os seus clientes.",
    "providersBody": "Publique os serviços, defina quando está disponível e receba pedidos confirmados. A Ntizo trata do calendário, do pagamento e de o dar a conhecer.",
    "providersCta": "Torne-se prestador"
  },
  "contact": {
    "headTitle": "Contacto",
    "eyebrow": "Contacto",
    "heading": "Fale connosco.",
    "lede": "Parcerias, imprensa, uma pergunta sobre a plataforma ou simplesmente um olá. Respondemos em dias úteis.",
    "messagePlaceholder": "Diga-nos o que tem em mente.",
    "cards": {
      "email": { "title": "Por email", "body": "Para quem prefere escrever directamente." },
      "social": { "title": "Nas redes", "body": "Novidades, bastidores e os prestadores que destacamos." },
      "feedback": { "title": "Tem uma ideia, ou algo falhou?", "body": "Isso é feedback, e lemos tudo.", "cta": "Dar feedback" }
    }
  },
  "feedback": {
    "headTitle": "Dar feedback",
    "eyebrow": "Feedback",
    "heading": "Diga-nos o que acha.",
    "lede": "Uma ideia, algo que não funcionou, ou o que gostou. Lemos tudo, e é isto que decide o que construímos a seguir.",
    "messagePlaceholder": "O que gostava que fosse diferente? Se algo falhou, diga-nos onde estava e o que esperava.",
    "cards": {
      "read": { "title": "Lemos tudo", "body": "Cada mensagem chega a uma pessoa da equipa. Nem todas têm resposta, mas todas contam." },
      "contact": { "title": "Uma parceria, a imprensa, uma pergunta?", "body": "Isso é para o contacto, que responde.", "cta": "Ir para o contacto" },
      "social": { "title": "Nas redes", "body": "Novidades, bastidores e os prestadores que destacamos." }
    }
  },
  "form": {
    "signInHint": "Tem conta?",
    "signInLink": "Entre",
    "signInHintRest": "e preenchemos o nome e o email por si.",
    "name": "Nome",
    "namePlaceholder": "O seu nome",
    "email": "Email",
    "emailPlaceholder": "Para onde respondemos",
    "emailOptional": "Opcional. Só se quiser resposta.",
    "topic": "Assunto",
    "message": "Mensagem",
    "privacyNote": "Guardamos esta mensagem para lhe responder. Mais nada.",
    "privacyLink": "Política de privacidade",
    "submit": "Enviar mensagem",
    "sending": "A enviar…",
    "errors": {
      "nameRequired": "Diga-nos como se chama.",
      "emailRequired": "Precisamos de um email para responder.",
      "emailInvalid": "Este email não parece completo.",
      "messageTooShort": "Escreva pelo menos 10 caracteres.",
      "rateLimited": "Recebemos várias mensagens deste dispositivo há pouco. Tente de novo dentro de uma hora, ou escreva para {{email}}.",
      "generic": "Não conseguimos enviar. Tente de novo, ou escreva-nos para {{email}}."
    },
    "success": {
      "title": "Recebemos a sua mensagem.",
      "replyTo": "Respondemos para {{email}} em dias úteis, no idioma em que nos escreveu.",
      "noEmail": "Obrigado. Lemos tudo o que nos chega.",
      "reference": "Referência: {{reference}}",
      "home": "Voltar ao início"
    }
  },
  "topics": {
    "contact": { "general": "Pergunta geral", "partnership": "Parceria", "press": "Imprensa", "provider": "Sou prestador", "other": "Outro" },
    "feedback": { "idea": "Uma ideia", "problem": "Algo não funcionou", "praise": "Gostei de algo" }
  },
  "careers": {
    "headTitle": "Carreiras",
    "eyebrow": "Carreiras",
    "heading": "Construa a Ntizo connosco.",
    "lede": "Somos uma equipa pequena a construir a infra-estrutura dos serviços locais em Moçambique. Não temos vagas abertas neste momento, mas lemos todas as candidaturas.",
    "buildingEyebrow": "O que estamos a construir",
    "building1": "Um mercado onde um cliente encontra, reserva e paga um serviço com a mesma confiança com que compra numa loja, e onde um prestador tem agenda, preços e pagamentos sem precisar de uma empresa por trás.",
    "building2": "Começámos por Moçambique, com M-Pesa e em português. A plataforma é desenhada desde o primeiro dia para servir outros países, outras moedas e outras línguas.",
    "howEyebrow": "Como trabalhamos",
    "how": [
      { "title": "Escrevemos antes de construir.", "body": "Cada decisão tem um documento com o porquê, para que quem chegar depois não a tenha de adivinhar." },
      { "title": "Enviamos cedo, corrigimos depressa.", "body": "Preferimos uma versão real nas mãos de um cliente a uma versão perfeita numa apresentação." },
      { "title": "Quem usa vem primeiro.", "body": "Falamos com prestadores e clientes antes de decidir por eles." }
    ],
    "openingsEyebrow": "Vagas abertas",
    "openingsTitle": "Nenhuma neste momento.",
    "openingsBody": "Se acha que devíamos estar a falar consigo mesmo assim, escreva-nos. Diga o que faz bem, o que já construiu, e porquê a Ntizo. Respondemos a todas.",
    "openingsCta": "Candidatura espontânea",
    "openingsHint": "Abre o seu email para {{email}} com o assunto já preenchido.",
    "mailSubject": "Candidatura espontânea"
  }
}
```

- [ ] **Step 4: Write `en-US/company.json`, verbatim**

```json
{
  "shared": {
    "seeAlso": "See also",
    "links": {
      "contact": { "title": "Contact", "body": "Partnerships, press, or simply a hello." },
      "feedback": { "title": "Share feedback", "body": "An idea, something that did not work, or something you liked." },
      "about": { "title": "About Ntizo", "body": "What we do, how it works, and what we believe." },
      "careers": { "title": "Careers", "body": "How we work, and how to apply." }
    }
  },
  "about": {
    "headTitle": "About Ntizo",
    "eyebrow": "About Ntizo",
    "heading": "Local services you can",
    "headingAccent": "trust",
    "lede": "Ntizo connects people who need a service with people who know how to do it. Verified providers, the price up front, and payment only after the provider confirms the time.",
    "missionEyebrow": "Our mission",
    "missionTitle": "Make hiring a service as simple and as safe as buying in a shop.",
    "mission1": "In Mozambique, finding a good plumber, a hairdresser or a tutor still depends on knowing someone who knows someone. The price is agreed over the phone, the time slips, and when it goes wrong there is nobody to turn to.",
    "mission2": "Ntizo exists to change that. Every provider is verified before they appear in results, every service shows its price, and every booking is on record from start to finish, from the time agreed to the payment.",
    "howEyebrow": "How it works",
    "howTitle": "Three steps, and none of them is paying before you know it will happen.",
    "steps": {
      "search": { "title": "Search and compare", "body": "Browse services by category and city, with the price, reviews from people who used them, and the verified badge." },
      "book": { "title": "Book the time", "body": "Pick the day and time on the provider's calendar and say where the service happens. The request goes to the provider to confirm." },
      "pay": { "title": "Pay after confirmation", "body": "Only once the provider confirms the time do you get the payment prompt on your phone. Nothing is charged before that." }
    },
    "principlesEyebrow": "What we believe",
    "principlesTitle": "Four rules that never change, whatever the service.",
    "principles": {
      "price": { "title": "The price is the price.", "body": "The amount you see on the listing is the amount you pay. The platform's commission comes out of the provider's side, never yours." },
      "verification": { "title": "Verification before visibility.", "body": "No provider appears in results without having sent an identity document and without a person at Ntizo having reviewed it." },
      "payAfter": { "title": "Pay only after the yes.", "body": "The payment prompt arrives only after the provider confirms the time. If they do not confirm, or decline, there is nothing to charge." },
      "local": { "title": "Built for here, ready to grow.", "body": "M-Pesa, Portuguese, the cities we live in. And a platform designed to serve other countries when the time comes." }
    },
    "customersEyebrow": "For customers",
    "customersTitle": "Find, book and pay in one place.",
    "customersBody": "No phone calls to learn the price, no waiting for a reply that never comes. Every booking has a time, an amount and a record.",
    "customersCta": "Explore services",
    "providersEyebrow": "For providers",
    "providersTitle": "Your calendar, your prices, your customers.",
    "providersBody": "Publish your services, set when you are available, and receive confirmed requests. Ntizo handles the calendar, the payment and getting you found.",
    "providersCta": "Become a provider"
  },
  "contact": {
    "headTitle": "Contact",
    "eyebrow": "Contact",
    "heading": "Talk to us.",
    "lede": "Partnerships, press, a question about the platform, or simply a hello. We reply on working days.",
    "messagePlaceholder": "Tell us what is on your mind.",
    "cards": {
      "email": { "title": "By email", "body": "For anyone who would rather write directly." },
      "social": { "title": "On social", "body": "News, behind the scenes, and the providers we feature." },
      "feedback": { "title": "An idea, or something broke?", "body": "That is feedback, and we read all of it.", "cta": "Share feedback" }
    }
  },
  "feedback": {
    "headTitle": "Share feedback",
    "eyebrow": "Feedback",
    "heading": "Tell us what you think.",
    "lede": "An idea, something that did not work, or something you liked. We read all of it, and it is what decides what we build next.",
    "messagePlaceholder": "What would you like to be different? If something failed, tell us where you were and what you expected.",
    "cards": {
      "read": { "title": "We read everything", "body": "Every message reaches a person on the team. Not all get a reply, but all of them count." },
      "contact": { "title": "A partnership, the press, a question?", "body": "That is for contact, which replies.", "cta": "Go to contact" },
      "social": { "title": "On social", "body": "News, behind the scenes, and the providers we feature." }
    }
  },
  "form": {
    "signInHint": "Have an account?",
    "signInLink": "Sign in",
    "signInHintRest": "and we will fill in your name and email for you.",
    "name": "Name",
    "namePlaceholder": "Your name",
    "email": "Email",
    "emailPlaceholder": "Where we reply",
    "emailOptional": "Optional. Only if you want a reply.",
    "topic": "Topic",
    "message": "Message",
    "privacyNote": "We keep this message to reply to you. Nothing else.",
    "privacyLink": "Privacy policy",
    "submit": "Send message",
    "sending": "Sending…",
    "errors": {
      "nameRequired": "Tell us your name.",
      "emailRequired": "We need an email to reply to.",
      "emailInvalid": "That email does not look complete.",
      "messageTooShort": "Write at least 10 characters.",
      "rateLimited": "We received several messages from this device just now. Try again in an hour, or write to {{email}}.",
      "generic": "We could not send it. Try again, or write to us at {{email}}."
    },
    "success": {
      "title": "We got your message.",
      "replyTo": "We will reply to {{email}} on working days, in the language you wrote to us in.",
      "noEmail": "Thank you. We read everything that reaches us.",
      "reference": "Reference: {{reference}}",
      "home": "Back to home"
    }
  },
  "topics": {
    "contact": { "general": "General question", "partnership": "Partnership", "press": "Press", "provider": "I am a provider", "other": "Other" },
    "feedback": { "idea": "An idea", "problem": "Something did not work", "praise": "Something I liked" }
  },
  "careers": {
    "headTitle": "Careers",
    "eyebrow": "Careers",
    "heading": "Build Ntizo with us.",
    "lede": "We are a small team building the infrastructure for local services in Mozambique. There are no open roles right now, but we read every application.",
    "buildingEyebrow": "What we are building",
    "building1": "A marketplace where a customer finds, books and pays for a service with the same confidence as buying in a shop, and where a provider has a calendar, prices and payments without needing a company behind them.",
    "building2": "We started with Mozambique, with M-Pesa and in Portuguese. The platform is designed from day one to serve other countries, other currencies and other languages.",
    "howEyebrow": "How we work",
    "how": [
      { "title": "We write before we build.", "body": "Every decision has a document with the why, so whoever comes next does not have to guess it." },
      { "title": "We ship early and fix fast.", "body": "We would rather have a real version in a customer's hands than a perfect one in a presentation." },
      { "title": "Whoever uses it comes first.", "body": "We talk to providers and customers before deciding for them." }
    ],
    "openingsEyebrow": "Open roles",
    "openingsTitle": "None right now.",
    "openingsBody": "If you think we should be talking to you anyway, write to us. Tell us what you do well, what you have built, and why Ntizo. We reply to every one.",
    "openingsCta": "Spontaneous application",
    "openingsHint": "Opens your email to {{email}} with the subject already filled in.",
    "mailSubject": "Spontaneous application"
  }
}
```

- [ ] **Step 5: Write the other six**

`pt-PT/company.json`: a copy of pt-MZ, unchanged — the two Portugueses agree on every word here ("telemóvel" is both; "Moçambique" is a fact about the company, not a locale).

`es-ES`, `fr-FR`, `de-DE`, `it-IT`, `nl-NL`: translate **every** value of `pt-MZ/company.json` (with `en-US` as the second reference for tone), keeping every key, every `{{email}}` / `{{reference}}` placeholder, and three `careers.how` entries. Rules that apply to every language:

- The `about.heading` + `about.headingAccent` pair renders as `{heading} <accent>{headingAccent}</accent>.` — pick the word order of the target language so the accent word is the LAST word of the sentence (es: `Servicios locales en los que puede` + `confiar`; fr: `Des services locaux en qui vous pouvez avoir` + `confiance`; de: `Lokale Dienstleistungen, denen Sie` + `vertrauen`; it: `Servizi locali di cui potersi` + `fidare`; nl: `Lokale diensten die u kunt` + `vertrouwen`).
- Product nouns stay as the product uses them: M-Pesa, Ntizo.
- No duration or percentage anywhere (the content test greps for them).
- Formal register in de/fr/nl/it (Sie / vous / u / lei), tú in es — matching each locale's existing `landing.json`.

- [ ] **Step 6: Register the namespace**

In `i18n.ts`: for each of the eight locales add `import <loc>Company from "@/shared/locales/<locale>/company.json";` beside the `Checkout` import, add `company: <loc>Company` to that locale's entry in `resources`, and add `"company"` to the `ns` array.

In `locales.test.ts`: add the eight `Company` imports and a `company` entry in `NAMESPACES`, same shape as `checkout`.

- [ ] **Step 7: Run the gate, the content test, typecheck**

Run: `cd apps/frontend/web && bunx vitest run src/shared/locales && bun run typecheck`
Expected: parity passes for `company` (all eight declare the same paths, none empty); `company-content.test.ts` passes (24 tests); typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/web/src/shared/locales apps/frontend/web/src/shared/lib/i18n.ts
git commit -m "feat(company): the company namespace — every word of the four pages, in eight languages"
```

---

### Task 10: The shared frame, and the two editorial pages that use it first (About, Careers)

**Files:**
- Create: `apps/frontend/web/src/features/company/ui/company-page.tsx`
- Create: `apps/frontend/web/src/features/company/ui/about-page.tsx`
- Create: `apps/frontend/web/src/features/company/ui/careers-page.tsx`
- Create: `apps/frontend/web/src/routes/about.tsx`, `apps/frontend/web/src/routes/careers.tsx`
- Create: `apps/frontend/web/src/features/company/ui/__tests__/render-company-page.tsx` (test helper, no tests of its own)
- Test: `apps/frontend/web/src/features/company/ui/__tests__/company-pages.test.tsx`

**Interfaces:**
- Produces: `CompanyPage({ page, eyebrow, title, lede, centred?, children })`, `CompanyPageId = "about" | "contact" | "feedback" | "careers"`, `Eyebrow({ children, onDark? })`, `SectionHeading({ eyebrow, title, blurb? })`, `renderCompanyPage(Page, at?)` from the helper file, `AboutPage`, `CareersPage`.

- [ ] **Step 1: Write the helper, then the failing tests**

`render-company-page.tsx` — a helper, not a test file, so that importing it from three suites does not run one suite's tests three times:

```tsx
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ComponentType } from "react";

/**
 * Every company page in a router that knows every route they link to. The
 * header reads the session, so a QueryClient is needed and left unseeded —
 * the signed-out branch is the one these pages are mostly read in.
 */
export function renderCompanyPage(Page: ComponentType, at = "/") {
  const rootRoute = createRootRoute();
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: at, component: Page }),
      ...[
        "/about", "/contact", "/feedback", "/careers",
        "/", "/services", "/providers", "/become-provider", "/sign-in", "/sign-up",
        "/terms", "/privacy", "/admin",
      ].filter((p) => p !== at).map(stub),
    ]),
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { qc };
}
```

`company-pages.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { AboutPage } from "../about-page";
import { CareersPage } from "../careers-page";
import { renderCompanyPage } from "./render-company-page";

/** The strip's links, as hrefs, in order. */
function stripHrefs() {
  const strip = screen.getByRole("heading", { name: /see also/i }).parentElement!;
  return Array.from(strip.querySelectorAll("a")).map((a) => a.getAttribute("href"));
}

describe("AboutPage", () => {
  it("leads with the title, the mission, the three steps and the four principles", () => {
    renderCompanyPage(AboutPage, "/about");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Local services you can trust.");
    expect(screen.getByText("Make hiring a service as simple and as safe as buying in a shop.")).toBeInTheDocument();
    for (const step of ["Search and compare", "Book the time", "Pay after confirmation"]) {
      expect(screen.getByRole("heading", { name: step })).toBeInTheDocument();
    }
    for (const rule of ["The price is the price.", "Verification before visibility.", "Pay only after the yes.", "Built for here, ready to grow."]) {
      expect(screen.getByRole("heading", { name: rule })).toBeInTheDocument();
    }
  });

  it("sends customers to services and providers to the pitch", () => {
    renderCompanyPage(AboutPage, "/about");
    expect(screen.getByRole("link", { name: /explore services/i })).toHaveAttribute("href", "/services");
    expect(screen.getByRole("link", { name: /become a provider/i })).toHaveAttribute("href", "/become-provider");
  });

  it("offers contact, feedback and careers at the bottom — and not itself", () => {
    renderCompanyPage(AboutPage, "/about");
    expect(stripHrefs()).toEqual(["/contact", "/feedback", "/careers"]);
  });

  it("draws no accent rule beside its eyebrows", () => {
    renderCompanyPage(AboutPage, "/about");
    // The owner's rule: no hairline flourish before uppercase labels.
    expect(document.querySelector(".h-px.w-8")).toBeNull();
  });
});

describe("CareersPage", () => {
  it("says there are no open roles and opens the mail client with the subject filled in", () => {
    renderCompanyPage(CareersPage, "/careers");
    expect(screen.getByRole("heading", { name: "None right now." })).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /spontaneous application/i });
    expect(cta).toHaveAttribute("href", "mailto:ola@ntizo.co.mz?subject=Spontaneous%20application");
  });

  it("lists the three ways of working", () => {
    renderCompanyPage(CareersPage, "/careers");
    for (const h of ["We write before we build.", "We ship early and fix fast.", "Whoever uses it comes first."]) {
      expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    }
  });

  it("offers contact, feedback and about at the bottom", () => {
    renderCompanyPage(CareersPage, "/careers");
    expect(stripHrefs()).toEqual(["/contact", "/feedback", "/about"]);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/frontend/web && bunx vitest run src/features/company`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the frame**

`company-page.tsx`:

```tsx
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { LANDING_VARS } from "@/features/landing/ui/sections";
import { ACCENT, NAVY, PAGE_TOP } from "@/features/landing/ui/palette";
import { Footer } from "@/features/landing/ui/footer";
import { SiteHeader } from "@/shared/components/site-header";

export type CompanyPageId = "about" | "contact" | "feedback" | "careers";

/**
 * The strip's candidates, in priority order. A page shows the first three
 * that are not itself. The help center's `/help` joins this list when it
 * lands (follow-ups #132), ahead of `about`.
 */
const STRIP: ReadonlyArray<{ id: CompanyPageId; to: string }> = [
  { id: "contact", to: "/contact" },
  { id: "feedback", to: "/feedback" },
  { id: "about", to: "/about" },
  { id: "careers", to: "/careers" },
];

/**
 * The frame every company page wears.
 *
 * A compact dark band with the site header over it and the title left, not
 * the provider pitch's 660px hero: four secondary pages in a row with that
 * hero would tire the reader and push the answer under the fold on a phone.
 * Decided in brainstorming, 2026-09-02, against a light top and against the
 * full hero.
 *
 * Below the page's own sections, the "see also" strip and the footer, the
 * same on all four — which is how a reader who landed on the wrong page
 * reaches the right one without scrolling for the footer.
 */
export function CompanyPage({
  page,
  eyebrow,
  title,
  lede,
  centred = false,
  children,
}: {
  page: CompanyPageId;
  eyebrow: string;
  title: ReactNode;
  lede: string;
  /** The form pages centre their band, because the form under it is centred. */
  centred?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation("company");
  const strip = STRIP.filter((link) => link.id !== page).slice(0, 3);

  return (
    <main style={{ ...LANDING_VARS, background: PAGE_TOP }} className="text-[color:var(--l-navy)]">
      <header className="relative isolate overflow-hidden" style={{ background: NAVY }}>
        <span
          aria-hidden="true"
          className="absolute -top-40 -left-32 -z-10 h-[420px] w-[420px] rounded-full opacity-[0.14]"
          style={{ background: ACCENT }}
        />
        <span
          aria-hidden="true"
          className="absolute -right-24 -bottom-36 -z-10 h-[320px] w-[320px] rounded-full opacity-[0.14]"
          style={{ background: ACCENT }}
        />
        <SiteHeader overlay current="none" />
        <div className={`page-shell pt-28 pb-16 text-white md:pt-32 md:pb-20 ${centred ? "text-center" : ""}`}>
          <Eyebrow onDark>{eyebrow}</Eyebrow>
          <h1
            className={`font-rounded mt-5 max-w-[18ch] text-[clamp(2.2rem,5vw,3.6rem)] leading-[1.04] font-extrabold tracking-[-0.03em] text-balance ${
              centred ? "mx-auto" : ""
            }`}
          >
            {title}
          </h1>
          <p className={`mt-5 max-w-[54ch] text-[17px] leading-relaxed text-white/80 ${centred ? "mx-auto" : ""}`}>
            {lede}
          </p>
        </div>
      </header>

      {children}

      <section className="page-shell border-t py-14" style={{ borderColor: "var(--l-border)" }}>
        <h2 className="m-0">
          <Eyebrow>{t("shared.seeAlso")}</Eyebrow>
        </h2>
        <div
          className="mt-5 grid overflow-hidden rounded-[16px] border md:grid-cols-3"
          style={{ borderColor: "var(--l-border)", background: "var(--l-card)" }}
        >
          {strip.map((link) => (
            <Link
              key={link.id}
              to={link.to}
              className="group border-t p-6 no-underline first:border-t-0 md:border-t-0 md:border-l md:first:border-l-0"
              style={{ borderColor: "var(--l-border)", color: "inherit" }}
            >
              <span className="font-rounded flex items-center gap-2 text-[15px] font-extrabold">
                {t(`shared.links.${link.id}.title`)}
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  style={{ color: ACCENT }}
                  aria-hidden="true"
                />
              </span>
              <span className="mt-1.5 block text-sm leading-relaxed text-[color:var(--l-muted)]">
                {t(`shared.links.${link.id}.body`)}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}

/**
 * A small uppercase label above a heading. Letter-spacing and weight keep it
 * from floating; there is no rule beside it, by the owner's rule.
 */
export function Eyebrow({ children, onDark = false }: { children: string; onDark?: boolean }) {
  return (
    <span
      className={`font-rounded inline-flex items-center text-[12px] font-bold tracking-[0.18em] uppercase ${
        onDark ? "text-white/65" : "text-[color:var(--l-muted)]"
      }`}
    >
      {children}
    </span>
  );
}

/** A section's opening: eyebrow, heading, and an optional sentence. */
export function SectionHeading({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb?: string }) {
  return (
    <div className="max-w-[62ch]">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="font-rounded mt-4 text-[clamp(1.7rem,3.4vw,2.5rem)] leading-[1.08] font-extrabold tracking-[-0.025em] text-balance">
        {title}
      </h2>
      {blurb && <p className="mt-4 text-[17px] leading-relaxed text-[color:var(--l-muted)]">{blurb}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Write the About page**

`about-page.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { ACCENT } from "@/features/landing/ui/palette";
import { CompanyPage, Eyebrow, SectionHeading } from "./company-page";

/**
 * Who Ntizo is, told through what the product does — mission, the three
 * steps, four principles, two audiences. No founding year, no city, no names:
 * the owner chose (2026-09-02) not to publish them.
 */
export function AboutPage() {
  const { t } = useTranslation("company");

  return (
    <CompanyPage
      page="about"
      eyebrow={t("about.eyebrow")}
      title={
        <>
          {t("about.heading")} <span style={{ color: ACCENT }}>{t("about.headingAccent")}</span>.
        </>
      }
      lede={t("about.lede")}
    >
      <section className="page-shell py-16 md:py-20">
        <div className="grid gap-10 md:grid-cols-[1.1fr_1fr] md:gap-16">
          <div>
            <Eyebrow>{t("about.missionEyebrow")}</Eyebrow>
            <p className="font-rounded mt-4 max-w-[24ch] text-[clamp(1.6rem,3vw,2.2rem)] leading-[1.12] font-extrabold tracking-[-0.02em] text-balance">
              {t("about.missionTitle")}
            </p>
          </div>
          <div className="text-[16px] leading-relaxed text-[color:var(--l-muted)]">
            <p>{t("about.mission1")}</p>
            <p className="mt-4">{t("about.mission2")}</p>
          </div>
        </div>
      </section>

      <section className="page-shell border-t py-16 md:py-20" style={{ borderColor: "var(--l-border)" }}>
        <SectionHeading eyebrow={t("about.howEyebrow")} title={t("about.howTitle")} />
        <ol className="mt-12 grid gap-10 p-0 md:grid-cols-3">
          {(["search", "book", "pay"] as const).map((key, i) => (
            <li key={key} className="list-none">
              <span className="font-rounded text-[13px] font-extrabold tracking-[0.06em] tabular-nums" style={{ color: ACCENT }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="font-rounded mt-3 text-[1.25rem] font-extrabold tracking-[-0.01em]">
                {t(`about.steps.${key}.title`)}
              </h3>
              <p className="mt-2 leading-relaxed text-[color:var(--l-muted)]">{t(`about.steps.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="page-shell border-t py-16 md:py-20" style={{ borderColor: "var(--l-border)" }}>
        <SectionHeading eyebrow={t("about.principlesEyebrow")} title={t("about.principlesTitle")} />
        <div
          className="mt-10 grid overflow-hidden rounded-[20px] border md:grid-cols-2"
          style={{ borderColor: "var(--l-border)", background: "var(--l-card)" }}
        >
          {(["price", "verification", "payAfter", "local"] as const).map((key, i) => (
            <article
              key={key}
              className={`border-t p-7 first:border-t-0 md:p-8 ${i % 2 === 1 ? "md:border-l" : ""} ${i < 2 ? "md:border-t-0" : ""}`}
              style={{ borderColor: "var(--l-border)" }}
            >
              <h3 className="font-rounded text-[1.15rem] font-extrabold tracking-[-0.01em]">
                {t(`about.principles.${key}.title`)}
              </h3>
              <p className="mt-2 leading-relaxed text-[color:var(--l-muted)]">{t(`about.principles.${key}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="page-shell border-t py-16 md:py-20" style={{ borderColor: "var(--l-border)" }}>
        <div className="grid gap-5 md:grid-cols-2">
          <Audience
            eyebrow={t("about.customersEyebrow")}
            title={t("about.customersTitle")}
            body={t("about.customersBody")}
            cta={t("about.customersCta")}
            to="/services"
            primary
          />
          <Audience
            eyebrow={t("about.providersEyebrow")}
            title={t("about.providersTitle")}
            body={t("about.providersBody")}
            cta={t("about.providersCta")}
            to="/become-provider"
          />
        </div>
      </section>
    </CompanyPage>
  );
}

function Audience({
  eyebrow, title, body, cta, to, primary = false,
}: { eyebrow: string; title: string; body: string; cta: string; to: string; primary?: boolean }) {
  return (
    <article className="rounded-[20px] border p-7 md:p-8" style={{ borderColor: "var(--l-border)", background: "var(--l-card)" }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h3 className="font-rounded mt-3 text-[clamp(1.3rem,2.2vw,1.6rem)] font-extrabold tracking-[-0.02em]">{title}</h3>
      <p className="mt-3 leading-relaxed text-[color:var(--l-muted)]">{body}</p>
      <Link
        to={to}
        className={`font-rounded mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-extrabold no-underline ${
          primary ? "text-white" : "border"
        }`}
        style={primary ? { background: ACCENT } : { borderColor: "rgba(19,23,27,.25)", color: "inherit" }}
      >
        {cta}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </article>
  );
}
```

- [ ] **Step 5: Write the Careers page**

`careers-page.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { ACCENT } from "@/features/landing/ui/palette";
import { CONTACT } from "@/shared/lib/contact";
import { CompanyPage, Eyebrow } from "./company-page";

interface Principle {
  title: string;
  body: string;
}

/**
 * No open roles, said plainly, and a spontaneous application by email. The
 * three "how we work" sentences are the only copy on the four pages not
 * derived from the code; the owner approved them.
 */
export function CareersPage() {
  const { t } = useTranslation("company");
  const how = t("careers.how", { returnObjects: true }) as Principle[] | string;
  const mailto = `mailto:${CONTACT.general}?subject=${encodeURIComponent(t("careers.mailSubject"))}`;

  return (
    <CompanyPage page="careers" eyebrow={t("careers.eyebrow")} title={t("careers.heading")} lede={t("careers.lede")}>
      <section className="page-shell py-16 md:py-20">
        <div className="grid gap-12 md:grid-cols-2 md:gap-16">
          <div>
            <Eyebrow>{t("careers.buildingEyebrow")}</Eyebrow>
            <p className="mt-4 text-[16px] leading-relaxed text-[color:var(--l-muted)]">{t("careers.building1")}</p>
            <p className="mt-4 text-[16px] leading-relaxed text-[color:var(--l-muted)]">{t("careers.building2")}</p>
          </div>
          <div>
            <Eyebrow>{t("careers.howEyebrow")}</Eyebrow>
            <ul className="mt-4 grid gap-5 p-0">
              {Array.isArray(how) &&
                how.map((p) => (
                  <li key={p.title} className="list-none">
                    <h3 className="font-rounded text-[1.1rem] font-extrabold tracking-[-0.01em]">{p.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[color:var(--l-muted)]">{p.body}</p>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="page-shell pb-16 md:pb-20">
        <div
          className="flex flex-col gap-6 rounded-[20px] border p-7 md:flex-row md:items-center md:justify-between md:p-8"
          style={{ borderColor: "var(--l-border)", background: "var(--l-card)" }}
        >
          <div>
            <Eyebrow>{t("careers.openingsEyebrow")}</Eyebrow>
            <h2 className="font-rounded mt-3 text-[clamp(1.4rem,2.4vw,1.8rem)] font-extrabold tracking-[-0.02em]">
              {t("careers.openingsTitle")}
            </h2>
            <p className="mt-3 max-w-[56ch] leading-relaxed text-[color:var(--l-muted)]">{t("careers.openingsBody")}</p>
          </div>
          <a
            href={mailto}
            className="font-rounded inline-flex shrink-0 items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-extrabold text-white no-underline"
            style={{ background: ACCENT }}
          >
            {t("careers.openingsCta")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        <p className="mt-3 text-right text-sm text-[color:var(--l-muted)]">
          {t("careers.openingsHint", { email: CONTACT.general })}
        </p>
      </section>
    </CompanyPage>
  );
}
```

- [ ] **Step 6: Write the two routes**

`routes/about.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import i18n from "@/shared/lib/i18n";
import { AboutPage } from "@/features/company/ui/about-page";

/**
 * Top level, not under `_public`, for the reason `/privacy` gives: `_public`
 * redirects anyone with a session away, and the signed-in are exactly who
 * reads this. `ssr: true` because it is the kind of page a crawler indexes.
 */
export const Route = createFileRoute("/about")({
  ssr: true,
  head: () => ({ meta: [{ title: `${i18n.t("about.headTitle", { ns: "company" })} · Ntizo` }] }),
  component: AboutPage,
});
```

`routes/careers.tsx`: the same with `"/careers"`, `careers.headTitle`, `CareersPage` from `@/features/company/ui/careers-page`.

- [ ] **Step 7: Run the tests, typecheck, lint**

Run: `cd apps/frontend/web && bunx vitest run src/features/company && bun run typecheck && bun run lint`
Expected: 7 pass; typecheck clean (the route tree regenerates on the first `vite`/`tsc` run — if `routeTree.gen.ts` does not pick the new files up, run `bunx vite build --mode development` once, or start `bun run dev` for a moment); lint clean, including the boundaries rules (ui imports ui and shared only).

- [ ] **Step 8: Look at it**

Start the app (`bun run dev` in `apps/frontend/web`, API running per the dev-environment memory) and open `/about` and `/careers` at desktop and at 390px wide. Check: the header sits over the band with the white logo and no lit pill; the band is ~300px, not a full screen; no hairline beside any eyebrow; the strip stacks on the phone; the footer's Empresa column shows five links.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/web/src/features/company apps/frontend/web/src/routes/about.tsx apps/frontend/web/src/routes/careers.tsx apps/frontend/web/src/routeTree.gen.ts
git commit -m "feat(company): the shared frame, and the About and Careers pages"
```

---

### Task 11: The form, and the two pages built on it (Contact, Feedback)

**Files:**
- Create: `apps/frontend/web/src/features/company/domain/contact-form-validation.ts`
- Create: `apps/frontend/web/src/features/company/data/contact-request.repository.ts`
- Create: `apps/frontend/web/src/features/company/viewmodel/use-submit-contact-request.ts`
- Create: `apps/frontend/web/src/features/company/ui/contact-form.tsx`
- Create: `apps/frontend/web/src/features/company/ui/contact-request-page.tsx`
- Create: `apps/frontend/web/src/routes/contact.tsx`, `feedback.tsx`
- Test: `apps/frontend/web/src/features/company/domain/__tests__/contact-form-validation.test.ts`, `apps/frontend/web/src/features/company/ui/__tests__/contact-form.test.tsx`

**Interfaces:**
- Consumes: `CONTACT_TOPICS`, `contactEmailRequired` (`@ntizo/shared`); `sessionGraphql`, `GraphqlError` (`@/shared/lib/graphql/session-graphql`); `useCurrentUser`; `CONTACT`; `CompanyPage`, `renderCompanyPage`.
- Produces: `validateContactForm(values, { emailRequired }): ContactFormErrors`; `submitContactRequest(input): Promise<{ requestId; reference }>` and `SubmitContactRequestInput`; `useSubmitContactRequest()` (a `useMutation`); `ContactForm({ kind, messagePlaceholder })`; `ContactRequestPage({ kind })`.

- [ ] **Step 1: The validation, and its failing test**

`domain/__tests__/contact-form-validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateContactForm } from "../contact-form-validation";

const ok = { name: "Joana Matola", email: "joana@exemplo.com", message: "Gostava de propor uma parceria." };

describe("validateContactForm", () => {
  it("passes a complete form", () => {
    expect(validateContactForm(ok, { emailRequired: true })).toEqual({});
  });
  it("needs a name of at least two characters", () => {
    expect(validateContactForm({ ...ok, name: " J " }, { emailRequired: true })).toEqual({ name: "required" });
  });
  it("needs an email when the kind requires one, and a well-formed one whenever one is given", () => {
    expect(validateContactForm({ ...ok, email: "" }, { emailRequired: true })).toEqual({ email: "required" });
    expect(validateContactForm({ ...ok, email: "" }, { emailRequired: false })).toEqual({});
    expect(validateContactForm({ ...ok, email: "joana" }, { emailRequired: false })).toEqual({ email: "invalid" });
  });
  it("needs at least ten characters of message", () => {
    expect(validateContactForm({ ...ok, message: "olá   " }, { emailRequired: true })).toEqual({ message: "tooShort" });
  });
});
```

`domain/contact-form-validation.ts` (import-free — the boundaries lint requires it):

```ts
export interface ContactFormValues {
  name: string;
  email: string;
  message: string;
}

export interface ContactFormErrors {
  name?: "required";
  email?: "required" | "invalid";
  message?: "tooShort";
}

/** The same bounds the aggregate enforces, checked before the round trip so the refusal lands beside the field. */
export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactForm(
  values: ContactFormValues,
  options: { emailRequired: boolean },
): ContactFormErrors {
  const errors: ContactFormErrors = {};
  if (values.name.trim().length < NAME_MIN) errors.name = "required";
  const email = values.email.trim();
  if (email === "") {
    if (options.emailRequired) errors.email = "required";
  } else if (!EMAIL_SHAPE.test(email)) {
    errors.email = "invalid";
  }
  if (values.message.trim().length < MESSAGE_MIN) errors.message = "tooShort";
  return errors;
}
```

Run: `cd apps/frontend/web && bunx vitest run src/features/company/domain` — Expected: 4 pass.

- [ ] **Step 2: The repository and the hook**

`data/contact-request.repository.ts`:

```ts
import type { ContactRequestKind } from "@ntizo/shared";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

const SUBMIT = `
  mutation ContactRequestSubmit($input: ContactRequestSubmitInput!) {
    contactRequestSubmit(input: $input) { requestId reference }
  }`;

export interface SubmitContactRequestInput {
  kind: ContactRequestKind;
  topic: string;
  name: string;
  email: string | null;
  message: string;
  locale: string;
  originPath: string | null;
  /** The honeypot. Always sent, always empty for a person. */
  website: string;
}

/**
 * Through the private endpoint, not `publicGraphql`: the public mount serves
 * queries only and builds an empty context, so it has neither the address
 * the rate limit counts on nor the session the prefill comes from. The
 * private mount accepts anonymous callers (`requesterUserId: null`) and this
 * is the first mutation that relies on it — see the spec.
 */
export async function submitContactRequest(
  input: SubmitContactRequestInput,
): Promise<{ requestId: string; reference: string }> {
  const d = await sessionGraphql<{ contactRequestSubmit: { requestId: string; reference: string } }>(SUBMIT, {
    input,
  });
  return d.contactRequestSubmit;
}
```

`viewmodel/use-submit-contact-request.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { submitContactRequest, type SubmitContactRequestInput } from "../data/contact-request.repository";

/** Not retried: a retry after a rate-limit refusal is exactly what the limit refuses. */
export function useSubmitContactRequest() {
  return useMutation({
    mutationFn: (input: SubmitContactRequestInput) => submitContactRequest(input),
    retry: false,
  });
}
```

- [ ] **Step 3: Write the failing form tests**

`ui/__tests__/contact-form.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUserDTO } from "@ntizo/shared";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import { userQueries } from "@/features/user/data/user.repository";
import { ContactRequestPage } from "../contact-request-page";
import { renderCompanyPage } from "./render-company-page";

const fakes = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/features/company/data/contact-request.repository", () => ({
  submitContactRequest: fakes.submit,
}));

function ContactPage() {
  return <ContactRequestPage kind="contact" />;
}
function FeedbackPage() {
  return <ContactRequestPage kind="feedback" />;
}

function user(): CurrentUserDTO {
  return {
    id: "u-1", email: "joana@exemplo.com", role: "customer", status: "active", createdAt: "2026-01-01T00:00:00.000Z",
    name: "Joana Matola", firstName: "Joana", lastName: "Matola", displayName: "Joana", avatarUrl: null, avatarKey: null,
    phoneNumber: null, bio: null, language: "pt-MZ", timezone: "Africa/Maputo", dateOfBirth: null, gender: null,
  };
}

async function fillContact() {
  await userEvent.type(screen.getByLabelText("Name"), "Joana Matola");
  await userEvent.type(screen.getByLabelText("Email"), "joana@exemplo.com");
  await userEvent.type(screen.getByLabelText("Message"), "Gostava de propor uma parceria com a minha escola.");
}

beforeEach(() => {
  fakes.submit.mockReset();
  fakes.submit.mockResolvedValue({ requestId: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", reference: "7F3A2C" });
});
afterEach(() => vi.clearAllMocks());

describe("ContactRequestPage — contact", () => {
  it("validates before sending and lands the refusal beside the field", async () => {
    renderCompanyPage(ContactPage, "/contact");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(screen.getByText("Tell us your name.")).toBeInTheDocument();
    expect(screen.getByText("We need an email to reply to.")).toBeInTheDocument();
    expect(screen.getByText("Write at least 10 characters.")).toBeInTheDocument();
    expect(fakes.submit).not.toHaveBeenCalled();
  });

  it("sends what was typed, with the locale, the first topic by default, and an empty honeypot", async () => {
    renderCompanyPage(ContactPage, "/contact");
    await fillContact();
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(fakes.submit).toHaveBeenCalledTimes(1));
    expect(fakes.submit.mock.calls[0]![0]).toEqual({
      kind: "contact",
      topic: "general",
      name: "Joana Matola",
      email: "joana@exemplo.com",
      message: "Gostava de propor uma parceria com a minha escola.",
      locale: expect.stringMatching(/^en/),
      originPath: null,
      website: "",
    });
  });

  it("replaces the form with the reference and the reply address on success", async () => {
    renderCompanyPage(ContactPage, "/contact");
    await fillContact();
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByRole("heading", { name: "We got your message." })).toBeInTheDocument();
    expect(screen.getByText("Reference: 7F3A2C")).toBeInTheDocument();
    expect(screen.getByText(/We will reply to joana@exemplo.com/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Message")).toBeNull();
  });

  it("says the rate-limit sentence, with the general address, and keeps what was typed", async () => {
    fakes.submit.mockRejectedValue(
      new GraphqlError(200, [{ message: "too many", extensions: { code: "UNPROCESSABLE", originalCode: "CONTACT_RATE_LIMITED" } }]),
    );
    renderCompanyPage(ContactPage, "/contact");
    await fillContact();
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText(/Try again in an hour, or write to ola@ntizo.co.mz/)).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toHaveValue("Gostava de propor uma parceria com a minha escola.");
  });

  it("prefills name and email from the session and hides the sign-in hint", async () => {
    const { qc } = renderCompanyPage(ContactPage, "/contact");
    qc.setQueryData(userQueries.me().queryKey, user());
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Joana Matola"));
    expect(screen.getByLabelText("Email")).toHaveValue("joana@exemplo.com");
    expect(screen.queryByText(/have an account/i)).toBeNull();
  });

  it("offers sign-in carrying the way back, when signed out", () => {
    renderCompanyPage(ContactPage, "/contact");
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/sign-in?next=%2Fcontact");
  });

  it("hides the honeypot from people", () => {
    renderCompanyPage(ContactPage, "/contact");
    const trap = document.querySelector('input[name="website"]')!;
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap).toHaveAttribute("aria-hidden", "true");
  });

  it("offers feedback, about and careers at the bottom", () => {
    renderCompanyPage(ContactPage, "/contact");
    const strip = screen.getByRole("heading", { name: /see also/i }).parentElement!;
    expect(Array.from(strip.querySelectorAll("a")).map((a) => a.getAttribute("href"))).toEqual(["/feedback", "/about", "/careers"]);
  });
});

describe("ContactRequestPage — feedback", () => {
  it("lets the email be empty, sends the page it came from, and thanks without a reply line", async () => {
    renderCompanyPage(FeedbackPage, "/feedback");
    await userEvent.type(screen.getByLabelText("Name"), "Joana Matola");
    await userEvent.type(screen.getByLabelText("Message"), "Gostava de filtrar por bairro na lista de serviços.");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(fakes.submit).toHaveBeenCalledTimes(1));
    expect(fakes.submit.mock.calls[0]![0]).toMatchObject({ kind: "feedback", topic: "idea", email: null, originPath: "/feedback" });
    expect(await screen.findByText("Thank you. We read everything that reaches us.")).toBeInTheDocument();
    expect(screen.queryByText(/We will reply to/)).toBeNull();
  });
});
```

`userQueries.me().queryKey` is the session's cache key — confirm `features/user/data/user.repository.ts` exports `userQueries` that way; if the export is shaped differently, use whatever it exposes for the `me` key rather than a literal.

- [ ] **Step 4: Run to see them fail**

Run: `cd apps/frontend/web && bunx vitest run src/features/company/ui/__tests__/contact-form.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 5: Write the form**

`ui/contact-form.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check } from "lucide-react";
import { CONTACT_TOPICS, contactEmailRequired, type ContactRequestKind } from "@ntizo/shared";
import { Input, Label, Select } from "@ntizo/frontend-ui";
import { ACCENT } from "@/features/landing/ui/palette";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import { CONTACT } from "@/shared/lib/contact";
import { MESSAGE_MAX, NAME_MAX, validateContactForm, type ContactFormErrors } from "../domain/contact-form-validation";
import { useSubmitContactRequest } from "../viewmodel/use-submit-contact-request";

/**
 * One form, two kinds.
 *
 * What differs by kind is the topic list, whether an email is required, and
 * whether the page it came from is sent (feedback only — "I was on the
 * services page" is the whole context of half of it). Everything else —
 * prefill, the trap, the success state, the errors — is the same and lives
 * here once.
 *
 * **Prefill is a suggestion, not a lock.** The fields fill from the session
 * once and stay editable: somebody writing on a colleague's behalf, or from a
 * shared account, should be able to say so.
 *
 * **The trap** is `website`: visually hidden, out of the tab order, hidden
 * from screen readers. A script that fills every field fills it; the server
 * answers with a success it never wrote.
 */
export function ContactForm({ kind, messagePlaceholder }: { kind: ContactRequestKind; messagePlaceholder: string }) {
  const { t, i18n } = useTranslation("company");
  const { data: user } = useCurrentUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const topics = CONTACT_TOPICS[kind];
  const emailRequired = contactEmailRequired(kind);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<string>(topics[0]);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (!user || prefilled) return;
    setName((n) => n || user.name);
    setEmail((e) => e || user.email);
    setPrefilled(true);
  }, [user, prefilled]);

  const submit = useSubmitContactRequest();
  const errors: ContactFormErrors = attempted ? validateContactForm({ name, email, message }, { emailRequired }) : {};

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (Object.keys(validateContactForm({ name, email, message }, { emailRequired })).length > 0) return;
    submit.mutate({
      kind,
      topic,
      name: name.trim(),
      email: email.trim() === "" ? null : email.trim(),
      message: message.trim(),
      locale: i18n.resolvedLanguage ?? i18n.language,
      originPath: kind === "feedback" ? pathname : null,
      website,
    });
  }

  if (submit.data) {
    const replyEmail = email.trim();
    return (
      <div
        className="rounded-[20px] border p-8 text-center md:p-10"
        style={{ borderColor: "var(--l-border)", background: "var(--l-card)" }}
      >
        <span
          className="inline-flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`, color: ACCENT }}
        >
          <Check className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="font-rounded mt-4 text-[clamp(1.4rem,2.4vw,1.8rem)] font-extrabold tracking-[-0.02em]">
          {t("form.success.title")}
        </h2>
        <p className="mx-auto mt-2 max-w-[46ch] leading-relaxed text-[color:var(--l-muted)]">
          {replyEmail ? t("form.success.replyTo", { email: replyEmail }) : t("form.success.noEmail")}
        </p>
        <p className="mt-4 inline-block rounded-md px-3 py-1.5 font-mono text-sm" style={{ background: "var(--color-muted)" }}>
          {t("form.success.reference", { reference: submit.data.reference })}
        </p>
        <div className="mt-6 flex justify-center">
          <Link to="/" className="font-rounded rounded-full border px-6 py-3 text-[14px] font-bold no-underline" style={{ borderColor: "rgba(19,23,27,.25)", color: "inherit" }}>
            {t("form.success.home")}
          </Link>
        </div>
      </div>
    );
  }

  const serverError = submit.error
    ? submit.error instanceof GraphqlError && submit.error.code === "CONTACT_RATE_LIMITED"
      ? t("form.errors.rateLimited", { email: CONTACT.general })
      : t("form.errors.generic", { email: CONTACT.general })
    : null;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="relative rounded-[20px] border p-6 md:p-8"
      style={{ borderColor: "var(--l-border)", background: "var(--l-card)" }}
    >
      {!user && (
        <p className="m-0 mb-5 text-sm text-[color:var(--l-muted)]">
          {t("form.signInHint")}{" "}
          <Link to="/sign-in" search={{ next: pathname }} className="font-semibold" style={{ color: ACCENT }}>
            {t("form.signInLink")}
          </Link>{" "}
          {t("form.signInHintRest")}
        </p>
      )}

      <div className="grid gap-5">
        <Field label={t("form.name")} htmlFor="contact-name" error={errors.name && t("form.errors.nameRequired")}>
          <Input
            id="contact-name"
            name="name"
            autoComplete="name"
            maxLength={NAME_MAX}
            placeholder={t("form.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errors.name ? true : undefined}
          />
        </Field>

        <Field
          label={t("form.email")}
          htmlFor="contact-email"
          hint={emailRequired ? undefined : t("form.emailOptional")}
          error={errors.email && t(errors.email === "required" ? "form.errors.emailRequired" : "form.errors.emailInvalid")}
        >
          <Input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t("form.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
          />
        </Field>

        <Field label={t("form.topic")} htmlFor="contact-topic">
          <Select
            id="contact-topic"
            name="topic"
            value={topic}
            onChange={setTopic}
            options={topics.map((value) => ({ value, label: t(`topics.${kind}.${value}`) }))}
          />
        </Field>

        <Field label={t("form.message")} htmlFor="contact-message" error={errors.message && t("form.errors.messageTooShort")}>
          <textarea
            id="contact-message"
            name="message"
            rows={6}
            maxLength={MESSAGE_MAX}
            placeholder={messagePlaceholder}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-invalid={errors.message ? true : undefined}
            className="type-body w-full rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 py-2.5 focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
          />
        </Field>

        {/* The trap. Off-screen, out of the tab order, invisible to assistive
            tech; `autoComplete="off"` so a browser does not fill it for a
            person either. */}
        <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
      </div>

      {serverError && (
        <p role="alert" className="mt-5 text-sm text-[var(--color-destructive)]">
          {serverError}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 max-w-[48ch] text-xs leading-relaxed text-[color:var(--l-muted)]">
          {t("form.privacyNote")}{" "}
          <Link to="/privacy" className="underline" style={{ color: "inherit" }}>
            {t("form.privacyLink")}
          </Link>
        </p>
        <button
          type="submit"
          disabled={submit.isPending}
          className="font-rounded inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-extrabold text-white disabled:opacity-60"
          style={{ background: ACCENT }}
        >
          {submit.isPending ? t("form.sending") : t("form.submit")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

function Field({
  label, htmlFor, hint, error, children,
}: { label: string; htmlFor: string; hint?: string; error?: string | false; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {hint && <p className="mt-1 mb-0 text-xs text-[color:var(--l-muted)]">{hint}</p>}
      <div className="mt-2">{children}</div>
      {error && <p className="mt-1.5 mb-0 text-xs text-[var(--color-destructive)]">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Write the page the two routes share**

`ui/contact-request-page.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ContactRequestKind } from "@ntizo/shared";
import { ACCENT } from "@/features/landing/ui/palette";
import { CONTACT } from "@/shared/lib/contact";
import { CompanyPage } from "./company-page";
import { ContactForm } from "./contact-form";

/** Which three cards sit under each form, and where the linking one goes. */
const CARDS: Record<ContactRequestKind, ReadonlyArray<{ key: string; kind: "email" | "social" | "text" | "link"; to?: string }>> = {
  contact: [
    { key: "email", kind: "email" },
    { key: "social", kind: "social" },
    { key: "feedback", kind: "link", to: "/feedback" },
  ],
  feedback: [
    { key: "read", kind: "text" },
    { key: "contact", kind: "link", to: "/contact" },
    { key: "social", kind: "social" },
  ],
};

/**
 * Contact and Feedback: a centred band, the form, three cards.
 *
 * Single centred column, decided 2026-09-02 against a side rail: the form is
 * what the page is for, and the alternatives sit under it rather than beside
 * it. Each kind's copy lives under its own key in the `company` namespace,
 * and the kind doubles as the frame's page id.
 */
export function ContactRequestPage({ kind }: { kind: ContactRequestKind }) {
  const { t } = useTranslation("company");

  return (
    <CompanyPage page={kind} eyebrow={t(`${kind}.eyebrow`)} title={t(`${kind}.heading`)} lede={t(`${kind}.lede`)} centred>
      <section className="page-shell py-12 md:py-16">
        <div className="mx-auto max-w-[640px]">
          <ContactForm kind={kind} messagePlaceholder={t(`${kind}.messagePlaceholder`)} />
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {CARDS[kind].map((card) => (
            <article
              key={card.key}
              className="rounded-[16px] border p-5"
              style={{ borderColor: "var(--l-border)", background: "var(--l-card)" }}
            >
              <h2 className="font-rounded m-0 text-[15px] font-extrabold">{t(`${kind}.cards.${card.key}.title`)}</h2>
              <p className="mt-1.5 mb-0 text-sm leading-relaxed text-[color:var(--l-muted)]">
                {card.kind === "email" && (
                  <>
                    <a href={`mailto:${CONTACT.general}`} className="font-semibold no-underline" style={{ color: "var(--l-navy)" }}>
                      {CONTACT.general}
                    </a>
                    <br />
                  </>
                )}
                {t(`${kind}.cards.${card.key}.body`)}
                {card.kind === "social" && (
                  <>
                    <br />
                    <a href={CONTACT.instagram} target="_blank" rel="noopener noreferrer" className="font-semibold" style={{ color: ACCENT }}>Instagram</a>
                    {" · "}
                    <a href={CONTACT.linkedin} target="_blank" rel="noopener noreferrer" className="font-semibold" style={{ color: ACCENT }}>LinkedIn</a>
                  </>
                )}
              </p>
              {card.to && (
                <Link to={card.to} className="mt-3 inline-flex items-center text-sm font-semibold no-underline" style={{ color: ACCENT }}>
                  {t(`${kind}.cards.${card.key}.cta`)} →
                </Link>
              )}
            </article>
          ))}
        </div>
      </section>
    </CompanyPage>
  );
}
```

- [ ] **Step 7: The two routes**

`routes/contact.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import i18n from "@/shared/lib/i18n";
import { ContactRequestPage } from "@/features/company/ui/contact-request-page";

/** Top level, outside `_public`, like `/about` — the signed-in write too. */
export const Route = createFileRoute("/contact")({
  ssr: true,
  head: () => ({ meta: [{ title: `${i18n.t("contact.headTitle", { ns: "company" })} · Ntizo` }] }),
  component: () => <ContactRequestPage kind="contact" />,
});
```

`routes/feedback.tsx`: the same with `"/feedback"`, `feedback.headTitle`, `kind="feedback"`.

- [ ] **Step 8: Run the tests, typecheck, lint**

Run: `cd apps/frontend/web && bunx vitest run src/features/company && bun run typecheck && bun run lint`
Expected: all company tests pass (domain 4, pages 7, form 9); clean.

- [ ] **Step 9: Prove it end to end by hand, once**

With the API and the app running, signed out, open `/contact`, fill the form, send. Expected: the success panel with a reference; the API log shows the console email with `reply-to`; the row is in `ntizo_contact.contact_request`. Delete the row afterwards.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/web/src/features/company apps/frontend/web/src/routes/contact.tsx apps/frontend/web/src/routes/feedback.tsx apps/frontend/web/src/routeTree.gen.ts
git commit -m "feat(company): one form, two pages — contact and feedback"
```

---

### Task 12: The queue — `/admin/contact`

**Files:**
- Create: `apps/frontend/web/src/features/admin/contact/data/admin-contact.repository.ts`
- Create: `apps/frontend/web/src/features/admin/contact/viewmodel/use-admin-contact.ts`
- Create: `apps/frontend/web/src/features/admin/contact/ui/contact-page.tsx`
- Create: `apps/frontend/web/src/routes/admin/contact.tsx`
- Modify: `apps/frontend/web/src/shared/lib/admin-navigation.ts`
- Modify: `apps/frontend/web/src/shared/locales/<8>/admin.json`
- Test: `apps/frontend/web/src/features/admin/contact/ui/__tests__/contact-page.test.tsx`

**Interfaces:**
- Consumes: `ContactRequestAdminDTO`, `ContactRequestAdminPageDTO` (`@ntizo/shared/read-models`); `sessionGraphql`; `CollectionCard`; `usePageHeader`; `Badge`, `Button` (`@ntizo/frontend-ui`).
- Produces: `adminContactQueries.all(search)`, `setContactRequestStatus(requestId, status)`, `ADMIN_CONTACT_PAGE_SIZE = 25`, `AdminContactSearch`; `useAdminContact(search)`, `useSetContactRequestStatus()`; `AdminContactPage`.

- [ ] **Step 1: The repository and the hooks**

`data/admin-contact.repository.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import type { ContactRequestKind, ContactRequestStatus } from "@ntizo/shared";
import type { ContactRequestAdminPageDTO } from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

const ALL = `
  query ContactRequestAllForAdmin($input: ContactRequestAllForAdminInput!) {
    contactRequestAllForAdmin(input: $input) {
      items {
        id reference kind topic name email message requesterUserId locale
        originPath ipAddress userAgent status resolvedAt createdAt
      }
      total
      openCount
    }
  }`;

const SET_STATUS = `
  mutation ContactRequestSetStatus($input: ContactRequestSetStatusInput!) {
    contactRequestSetStatus(input: $input) { status }
  }`;

export const ADMIN_CONTACT_PAGE_SIZE = 25;

export interface AdminContactSearch {
  offset?: number;
  kind?: ContactRequestKind;
  status?: ContactRequestStatus;
  search?: string;
}

export const adminContactQueries = {
  /** The whole search is the key: "resolved" is a different result set from "open". */
  all: (search: AdminContactSearch) =>
    queryOptions({
      queryKey: ["admin", "contact", search] as const,
      queryFn: async (): Promise<ContactRequestAdminPageDTO> => {
        const d = await sessionGraphql<{ contactRequestAllForAdmin: ContactRequestAdminPageDTO }>(ALL, {
          input: {
            limit: ADMIN_CONTACT_PAGE_SIZE,
            offset: search.offset ?? 0,
            ...(search.kind ? { kind: search.kind } : {}),
            ...(search.status ? { status: search.status } : {}),
            ...(search.search ? { search: search.search } : {}),
          },
        });
        return d.contactRequestAllForAdmin;
      },
    }),
};

export async function setContactRequestStatus(requestId: string, status: ContactRequestStatus): Promise<void> {
  await sessionGraphql(SET_STATUS, { input: { requestId, status } });
}
```

`viewmodel/use-admin-contact.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContactRequestStatus } from "@ntizo/shared";
import { adminContactQueries, setContactRequestStatus, type AdminContactSearch } from "../data/admin-contact.repository";

export function useAdminContact(search: AdminContactSearch) {
  return useQuery(adminContactQueries.all(search));
}

/** Not optimistic: `openCount` rides on the same payload and would have to be kept in step by hand. */
export function useSetContactRequestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, status }: { requestId: string; status: ContactRequestStatus }) =>
      setContactRequestStatus(requestId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "contact"] }),
  });
}
```

- [ ] **Step 2: Write the failing page test**

`ui/__tests__/contact-page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import type { ContactRequestAdminDTO } from "@ntizo/shared/read-models";
import { AdminContactPage } from "../contact-page";

const fakes = vi.hoisted(() => ({ setStatus: vi.fn() }));
vi.mock("@/features/admin/contact/data/admin-contact.repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/admin/contact/data/admin-contact.repository")>();
  return { ...actual, setContactRequestStatus: fakes.setStatus };
});

function row(over: Partial<ContactRequestAdminDTO> = {}): ContactRequestAdminDTO {
  return {
    id: "7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", reference: "7F3A2C", kind: "contact", topic: "partnership",
    name: "Joana Matola", email: "joana@exemplo.com", message: "Gostava de propor uma parceria com a minha escola.",
    requesterUserId: "u-1", locale: "pt-MZ", originPath: null, ipAddress: "197.218.0.1", userAgent: "Mozilla/5.0",
    status: "open", resolvedAt: null, createdAt: "2026-09-02T10:00:00.000Z", ...over,
  };
}

function renderPage(items: ContactRequestAdminDTO[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The default search: first page, open only. Seeded so no fetch happens.
  qc.setQueryData(["admin", "contact", { offset: 0, status: "open" }], { items, total: items.length, openCount: items.length });
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: AdminContactPage }),
      createRoute({ getParentRoute: () => rootRoute, path: "/admin/users", component: () => <p>users</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return qc;
}

beforeEach(() => fakes.setStatus.mockReset().mockResolvedValue(undefined));

describe("AdminContactPage", () => {
  it("lists a request with its kind, topic, who wrote, and the reference", () => {
    renderPage([row()]);
    expect(screen.getByText("Joana Matola")).toBeInTheDocument();
    expect(screen.getByText("joana@exemplo.com")).toBeInTheDocument();
    expect(screen.getByText("Partnership")).toBeInTheDocument();
    expect(screen.getByText("#7F3A2C")).toBeInTheDocument();
    expect(screen.getByText(/1 open request/)).toBeInTheDocument();
  });

  it("offers a reply by email with the reference in the subject", () => {
    renderPage([row()]);
    expect(screen.getByRole("link", { name: /reply by email/i })).toHaveAttribute(
      "href",
      "mailto:joana@exemplo.com?subject=%5BNtizo%20%237F3A2C%5D%20Partnership",
    );
  });

  it("marks a request resolved and refetches the queue", async () => {
    const qc = renderPage([row()]);
    const spy = vi.spyOn(qc, "invalidateQueries");
    await userEvent.click(screen.getByRole("button", { name: /mark resolved/i }));
    await waitFor(() => expect(fakes.setStatus).toHaveBeenCalledWith("7f3a2c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", "resolved"));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["admin", "contact"] }));
  });

  it("says the queue is empty in words", () => {
    renderPage([]);
    expect(screen.getByText("Nothing to answer.")).toBeInTheDocument();
  });

  it("expands a row to the whole message and where it came from", async () => {
    renderPage([row({ kind: "feedback", topic: "problem", originPath: "/services/abc" })]);
    await userEvent.click(screen.getByRole("button", { name: /show details/i }));
    expect(screen.getByText("/services/abc")).toBeInTheDocument();
    expect(screen.getByText("197.218.0.1")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `cd apps/frontend/web && bunx vitest run src/features/admin/contact`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the page**

`ui/contact-page.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Mail, MailOpen } from "lucide-react";
import type { ContactRequestKind, ContactRequestStatus } from "@ntizo/shared";
import type { ContactRequestAdminDTO } from "@ntizo/shared/read-models";
import { Badge, Button } from "@ntizo/frontend-ui";
import { CollectionCard } from "@/shared/components/collection-card";
import { usePageHeader } from "@/shared/lib/page-header";
import { ADMIN_CONTACT_PAGE_SIZE } from "../data/admin-contact.repository";
import { useAdminContact, useSetContactRequestStatus } from "../viewmodel/use-admin-contact";

const KINDS: readonly ContactRequestKind[] = ["contact", "feedback"];

/**
 * The contact queue: what people wrote through the two forms, and whether
 * anybody has answered yet.
 *
 * On the `/admin/reviews` pattern. Open requests by default — the queue is
 * worked, not browsed — with kind and status filters and a search that also
 * matches the reference a person quoted back. A row expands to the whole
 * message and where it came from; the two actions are "reply by email" (a
 * mailto with the reference in the subject, because the reply happens in the
 * inbox, not here — spec, "What the context deliberately does not do") and
 * resolve/reopen. Support with an account is the help center's queue, at
 * `/admin/support`, not this one.
 */
export function AdminContactPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const [kind, setKind] = useState<ContactRequestKind | undefined>(undefined);
  const [status, setStatus] = useState<ContactRequestStatus | undefined>("open");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useAdminContact({
    offset,
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  });
  const setRequestStatus = useSetContactRequestStatus();

  usePageHeader(t("contactTitle"), t("contactSubtitle"));

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const openCount = query.data?.openCount ?? 0;
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const topicLabel = (r: ContactRequestAdminDTO) => t(`topics.${r.kind}.${r.topic}`, { ns: "company", defaultValue: r.topic });

  function resetPage() {
    setOffset(0);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {query.error && <p className="type-body text-[var(--color-destructive)]">{t("contactError")}</p>}
      {setRequestStatus.error && <p className="type-body text-[var(--color-destructive)]">{t("contactStatusFailed")}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body">{t("contactOpenCount", { count: openCount })}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant={kind === undefined ? "default" : "outline"} size="sm" onClick={() => { setKind(undefined); resetPage(); }}>
            {t("contactKindAll")}
          </Button>
          {KINDS.map((k) => (
            <Button key={k} variant={kind === k ? "default" : "outline"} size="sm" onClick={() => { setKind(k); resetPage(); }}>
              {t(`contactKind.${k}`)}
            </Button>
          ))}
          <span className="mx-1 hidden w-px bg-[var(--color-border)] sm:block" aria-hidden="true" />
          <Button variant={status === "open" ? "default" : "outline"} size="sm" onClick={() => { setStatus("open"); resetPage(); }}>
            {t("contactStatus.open")}
          </Button>
          <Button variant={status === "resolved" ? "default" : "outline"} size="sm" onClick={() => { setStatus("resolved"); resetPage(); }}>
            {t("contactStatus.resolved")}
          </Button>
          <Button variant={status === undefined ? "default" : "outline"} size="sm" onClick={() => { setStatus(undefined); resetPage(); }}>
            {t("contactStatusAll")}
          </Button>
        </div>
      </div>

      <CollectionCard
        title={t("contactTitle")}
        shown={rows.length}
        total={total}
        loading={query.isLoading}
        search={search}
        onSearchChange={(value) => { setSearch(value); resetPage(); }}
        searchPlaceholder={t("contactSearchPlaceholder")}
        columns={[
          { key: "request", label: t("contactRequest"), className: "pl-5" },
          { key: "kind", label: t("contactKindColumn"), skeletonWidth: "w-20", skeletonShape: "badge" },
          { key: "topic", label: t("contactTopic"), skeletonWidth: "w-28" },
          { key: "date", label: t("contactDate"), align: "right", skeletonWidth: "w-24" },
          { key: "actions", label: t("contactAction"), align: "right", className: "pr-5", skeletonWidth: "w-40" },
        ]}
        emptyText={t("contactEmpty")}
        emptyTitle={t("contactEmptyTitle")}
        emptyBadge={MailOpen}
        noMatchesText={t("contactNoMatches")}
        noMatchesTitle={t("contactNoMatchesTitle")}
        filtered={kind !== undefined || status !== "open" || search.trim() !== ""}
        rows={rows.map((r) => ({
          key: r.id,
          primary: (
            <RequestSummary
              request={r}
              expanded={expanded === r.id}
              onToggle={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
            />
          ),
          cells: {
            kind: <Badge tone={r.kind === "feedback" ? "info" : "neutral"}>{t(`contactKind.${r.kind}`)}</Badge>,
            topic: <span className="block max-w-[22ch] truncate">{topicLabel(r)}</span>,
            date: <span className="tabular-nums text-[var(--color-muted-foreground)]">{dateFormat.format(new Date(r.createdAt))}</span>,
          },
          actions: (
            <span className="flex items-center justify-end gap-2">
              {r.email && (
                <a
                  href={`mailto:${r.email}?subject=${encodeURIComponent(`[Ntizo #${r.reference}] ${topicLabel(r)}`)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold no-underline"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {t("contactReply")}
                </a>
              )}
              <Button
                variant={r.status === "open" ? "default" : "outline"}
                size="sm"
                disabled={setRequestStatus.isPending}
                onClick={() => setRequestStatus.mutate({ requestId: r.id, status: r.status === "open" ? "resolved" : "open" })}
              >
                {r.status === "open" ? t("contactResolve") : t("contactReopen")}
              </Button>
            </span>
          ),
        }))}
      />

      {total > ADMIN_CONTACT_PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - ADMIN_CONTACT_PAGE_SIZE))}>
            {t("contactPrevious")}
          </Button>
          <Button variant="outline" size="sm" disabled={offset + ADMIN_CONTACT_PAGE_SIZE >= total} onClick={() => setOffset((o) => o + ADMIN_CONTACT_PAGE_SIZE)}>
            {t("contactNext")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Who wrote, what they said (two lines, or all of it), and where from. */
function RequestSummary({ request, expanded, onToggle }: { request: ContactRequestAdminDTO; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation("admin");
  return (
    <div className="min-w-0">
      <p className="type-body-medium m-0 flex flex-wrap items-center gap-x-2 font-semibold">
        {request.requesterUserId ? (
          <Link to="/admin/users" className="no-underline" style={{ color: "inherit" }}>
            {request.name}
          </Link>
        ) : (
          request.name
        )}
        <span className="type-caption font-mono text-[var(--color-muted-foreground)]">#{request.reference}</span>
      </p>
      <p className="type-caption m-0 text-[var(--color-muted-foreground)]">
        {request.email ?? t("contactNoEmail")} · {request.locale}
      </p>
      <p className={`type-caption mt-1 mb-0 whitespace-pre-wrap text-[var(--color-foreground)] ${expanded ? "" : "line-clamp-2"}`}>
        {request.message}
      </p>
      {expanded && (
        <dl className="type-caption mt-2 mb-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[var(--color-muted-foreground)]">
          <dt>{t("contactOrigin")}</dt><dd className="m-0">{request.originPath ?? "—"}</dd>
          <dt>{t("contactIp")}</dt><dd className="m-0">{request.ipAddress ?? "—"}</dd>
          <dt>{t("contactUserAgent")}</dt><dd className="m-0 break-all">{request.userAgent ?? "—"}</dd>
        </dl>
      )}
      <button type="button" onClick={onToggle} className="type-caption mt-1 font-semibold text-[var(--color-primary)]">
        {expanded ? t("contactHideDetails") : t("contactShowDetails")}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: The route and the navigation entry**

`routes/admin/contact.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { AdminContactPage } from "@/features/admin/contact/ui/contact-page";

export const Route = createFileRoute("/admin/contact")({
  component: AdminContactPage,
});
```

In `admin-navigation.ts`: import `Mail` from `lucide-react`, and after the `nav.users` item add:

```ts
      // After users, before the catalog: a queue of messages arriving, worked
      // daily like the provider queue — not content the platform curates.
      // The help center's "Suporte" queue lands beside it (its own spec).
      { titleKey: "nav.contact", url: "/admin/contact", icon: Mail },
```

- [ ] **Step 6: The admin strings**

Add to every `admin.json`. pt-MZ and en-US verbatim; pt-PT copies pt-MZ; es/fr/de/it/nl translated from these two with the same keys (`{{count}}` kept; `_one`/`_other` plural forms kept).

pt-MZ:

```json
"nav": { "...existing": "...", "contact": "Contactos" },
"contactTitle": "Contactos",
"contactSubtitle": "O que as pessoas nos escreveram pelos formulários de contacto e feedback, e o que ainda está por responder.",
"contactOpenCount_one": "{{count}} pedido aberto",
"contactOpenCount_other": "{{count}} pedidos abertos",
"contactKindAll": "Todos",
"contactKind": { "contact": "Contacto", "feedback": "Feedback" },
"contactKindColumn": "Tipo",
"contactStatus": { "open": "Abertos", "resolved": "Resolvidos" },
"contactStatusAll": "Todos",
"contactRequest": "Pedido",
"contactTopic": "Assunto",
"contactDate": "Recebido",
"contactAction": "Acções",
"contactSearchPlaceholder": "Procurar por nome, email, texto ou referência",
"contactEmpty": "Nada por responder.",
"contactEmptyTitle": "Fila vazia",
"contactNoMatches": "Nenhum pedido corresponde a esta pesquisa.",
"contactNoMatchesTitle": "Sem resultados",
"contactError": "Não foi possível carregar os pedidos.",
"contactStatusFailed": "Não foi possível alterar esse pedido. Tente de novo.",
"contactReply": "Responder por email",
"contactResolve": "Marcar resolvido",
"contactReopen": "Reabrir",
"contactPrevious": "Anterior",
"contactNext": "Seguinte",
"contactNoEmail": "sem email",
"contactOrigin": "Página",
"contactIp": "IP",
"contactUserAgent": "Navegador",
"contactShowDetails": "Mostrar detalhes",
"contactHideDetails": "Esconder detalhes"
```

en-US:

```json
"nav": { "...existing": "...", "contact": "Contact" },
"contactTitle": "Contact",
"contactSubtitle": "What people wrote to us through the contact and feedback forms, and what is still unanswered.",
"contactOpenCount_one": "{{count}} open request",
"contactOpenCount_other": "{{count}} open requests",
"contactKindAll": "All",
"contactKind": { "contact": "Contact", "feedback": "Feedback" },
"contactKindColumn": "Kind",
"contactStatus": { "open": "Open", "resolved": "Resolved" },
"contactStatusAll": "All",
"contactRequest": "Request",
"contactTopic": "Topic",
"contactDate": "Received",
"contactAction": "Actions",
"contactSearchPlaceholder": "Search a name, an email, the text, or a reference",
"contactEmpty": "Nothing to answer.",
"contactEmptyTitle": "Queue empty",
"contactNoMatches": "No request matches this search.",
"contactNoMatchesTitle": "No results",
"contactError": "The requests could not be loaded.",
"contactStatusFailed": "That request could not be changed. Try again.",
"contactReply": "Reply by email",
"contactResolve": "Mark resolved",
"contactReopen": "Reopen",
"contactPrevious": "Previous",
"contactNext": "Next",
"contactNoEmail": "no email",
"contactOrigin": "Page",
"contactIp": "IP",
"contactUserAgent": "Browser",
"contactShowDetails": "Show details",
"contactHideDetails": "Hide details"
```

Then add `admin` to the parity gate in `locales.test.ts` the same way `landing` and `legal` were added in Task 8 (it agrees across the eight files today).

- [ ] **Step 7: Run the tests, typecheck, lint**

Run: `cd apps/frontend/web && bunx vitest run src/features/admin/contact src/shared/locales && bun run typecheck && bun run lint`
Expected: 5 pass; parity passes for `admin`; clean.

- [ ] **Step 8: Look at it** — sign in as an administrator, open `/admin/contact`: the nav shows "Contact" after Users; the queue lists the row from Task 11's manual check if it still exists; resolve it; switch to "Resolved" and see it there; "Reply by email" opens the mail client with `[Ntizo #…]` in the subject.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/web/src/features/admin/contact apps/frontend/web/src/routes/admin/contact.tsx apps/frontend/web/src/shared/lib/admin-navigation.ts apps/frontend/web/src/shared/locales apps/frontend/web/src/routeTree.gen.ts
git commit -m "feat(admin): the contact queue — filter, search by reference, reply by email, resolve"
```

---

### Task 13: The privacy sentence, the follow-ups, and the end-to-end proof

**Files:**
- Modify: `apps/frontend/web/src/shared/locales/<8>/legal.json` (one sentence appended to `privacy.sections[0].body`)
- Modify: `docs/superpowers/follow-ups.md`
- Create: `apps/e2e/tests/company.spec.ts`

- [ ] **Step 1: The privacy sentence**

Append one string to the `body` array of the first section of `privacy` (the "what we collect" section) in each locale:

| Locale | Sentence |
|---|---|
| pt-MZ / pt-PT | `O que nos escreve pelos formulários de contacto e feedback, com o endereço IP de onde foi enviado, para lhe respondermos e travarmos abusos.` |
| en-US | `What you write to us through the contact and feedback forms, with the IP address it was sent from, so we can reply and stop abuse.` |
| es-ES | `Lo que nos escribes a través de los formularios de contacto y opinión, con la dirección IP desde la que se envió, para responderte y frenar abusos.` |
| fr-FR | `Ce que vous nous écrivez via les formulaires de contact et d'avis, avec l'adresse IP d'envoi, pour vous répondre et prévenir les abus.` |
| de-DE | `Was Sie uns über die Kontakt- und Feedback-Formulare schreiben, samt der IP-Adresse, von der es gesendet wurde, damit wir antworten und Missbrauch unterbinden können.` |
| it-IT | `Ciò che ci scrivi tramite i moduli di contatto e feedback, con l'indirizzo IP da cui è stato inviato, per risponderti e fermare gli abusi.` |
| nl-NL | `Wat u ons schrijft via de contact- en feedbackformulieren, met het IP-adres van waaruit het is verzonden, zodat we kunnen antwoorden en misbruik kunnen tegengaan.` |

Run: `cd apps/frontend/web && bunx vitest run src/shared/locales` — Expected: the `legal` gate still passes (arrays are one leaf; every locale's array grew by one).

- [ ] **Step 2: The follow-ups**

Append to `docs/superpowers/follow-ups.md`, continuing its numbering (the last entry is #125 as of 2026-09-02; use the next numbers if more were added since):

```markdown
## #126 — Reply to a contact request from inside the admin queue

`/admin/contact` replies with a `mailto:`; the thread lives in the inbox and the queue cannot show what was said.

**Trigger:** the first week the inbox has more than a handful of open requests a day.

---

## #127 — Tell the requester when their contact request is resolved

Resolving a request writes `resolved_at` and nothing reaches the person who wrote.

**Trigger:** the same as #126.

---

## #128 — Read the contact address from `platform_settings.support_email`

The column exists and nothing reads it; the addresses are constants in `shared/lib/contact.ts` and `CONTACT_INBOX_EMAIL` is a `var` in `wrangler.jsonc`.

**Trigger:** an address has to change without a deploy.

---

## #129 — The payment chips return to the footer

The footer advertises M-Pesa alone because it is the only method that charges (`MpesaPaymentCharge` is the sole `PaymentChargePort` adapter). e-Mola, Visa and Mastercard were removed on 2026-09-02.

**Trigger:** the day e-Mola or card charging ships, its chip returns the same day — and the FAQ's "que métodos aceitam" answer (`2026-09-02-faq-content.md`, and wherever the help center put it) changes with it.

---

## #130 — A careers listing

`/careers` says there are no open roles and takes spontaneous applications by email.

**Trigger:** the first open role.

---

## #131 — A captcha on the contact forms

The forms carry a honeypot and a five-per-hour-per-address count in the table.

**Trigger:** the honeypot and the count stop being enough, measured in the admin queue.

---

## #132 — The footer's "Falar com o suporte" and "Perguntas frequentes" links, and the company pages' strip

The Empresa column shows five of the reference's seven links. The two missing ones belong to the help center (`2026-09-02-help-center-design.md`): "Perguntas frequentes" → `/help`, "Falar com o suporte" → the panel (or `/help` until it exists). The `CompanyPage` strip's `STRIP` list gets a `help` entry ahead of `about` at the same time, and `shared.links.help` joins the `company` namespace in eight languages.

**Trigger:** the help center's `/help` route lands. Same day, between the links "Contacto" and "Dar feedback", in the reference's order: Sobre, Contacto, Falar com o suporte, Perguntas frequentes, Dar feedback, Torne-se prestador, Carreiras.

---

## #85 — updated 2026-09-02

The approved FAQ text (`2026-09-02-faq-content.md`) answers "can I share my number in messages?" and says why. When the help center puts it on `/help`, the contact-detection refusal copy in messaging should point there.
```

- [ ] **Step 3: Write the e2e spec**

`apps/e2e/tests/company.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { createVerifiedUser } from "../fixtures/auth";
import { fillSignInForm } from "../fixtures/ui";
import { sql } from "../fixtures/db";

/**
 * The seam no unit test can see: a real anonymous visitor sending the real
 * form through the real private endpoint (which must accept a caller with no
 * session — the first mutation that relies on it), the row landing in a real
 * table, and a real administrator finding it by the reference the visitor
 * was shown and resolving it. Verified by mutation: commenting out
 * `...createContactWriteHandlers` in `apps/backend/api/src/graphql/private.ts`
 * turns this red.
 *
 * Cleanup is by the name this spec chose, in `finally`, never a global DELETE.
 */
test("a visitor writes to us, and an administrator resolves it", async ({ page, browser }) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const name = `E2E Contact ${suffix}`;
  let reference = "";
  let admin: Awaited<ReturnType<typeof createVerifiedUser>> | undefined;

  try {
    await page.goto("/contact");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Talk to us.");

    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Email").fill(`e2e-contact-${suffix}@example.test`);
    await page.getByLabel("Message").fill("We would like to propose a partnership with our school.");
    await page.getByRole("button", { name: /send message/i }).click();

    await expect(page.getByRole("heading", { name: "We got your message." })).toBeVisible();
    const refText = await page.getByText(/^Reference: /).textContent();
    reference = refText!.replace("Reference: ", "").trim();
    expect(reference).toMatch(/^[0-9A-F]{6}$/);

    // The row exists, open, with the reference derived from its id.
    const rows = await sql()<{ id: string; status: string }[]>`
      SELECT id::text, status FROM ntizo_contact.contact_request WHERE name = ${name}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("open");
    expect(rows[0]!.id.replace(/-/g, "").slice(0, 6).toUpperCase()).toBe(reference);

    admin = await createVerifiedUser("admin", { firstName: "Ada", lastName: "Admin" });
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/sign-in");
    await fillSignInForm(adminPage, admin);
    await adminPage.waitForURL(/\/admin/);

    await adminPage.goto("/admin/contact");
    await adminPage.getByPlaceholder(/search a name/i).fill(reference);
    const row = adminPage.getByText(`#${reference}`);
    await expect(row).toBeVisible();
    await adminPage.getByRole("button", { name: /mark resolved/i }).first().click();

    // Open is the default filter, so a resolved request leaves the list.
    await expect(row).toBeHidden();

    const after = await sql()<{ status: string; resolved_by_user_id: string | null }[]>`
      SELECT status, resolved_by_user_id FROM ntizo_contact.contact_request WHERE name = ${name}`;
    expect(after[0]!.status).toBe("resolved");
    expect(after[0]!.resolved_by_user_id).toBe(admin.id);

    await adminContext.close();
  } finally {
    await sql()`DELETE FROM ntizo_contact.contact_request WHERE name = ${name}`;
    if (admin) {
      await sql()`DELETE FROM ntizo_user.user WHERE id = ${admin.id}`;
      await sql()`DELETE FROM better_auth."user" WHERE id = ${admin.id}`;
    }
  }
});
```

Check `apps/e2e/tests/auth.spec.ts`'s own cleanup for the exact user-deletion statements it uses (table names and order) and match them; the two statements above are the shape, not necessarily the exact tables.

- [ ] **Step 4: Run it**

Run: `cd apps/e2e && bunx playwright test tests/company.spec.ts` (the harness starts both servers against the throwaway database and applies every migration from zero, so the new table exists; see `apps/e2e/fixtures/db.ts`).
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/shared/locales docs/superpowers/follow-ups.md apps/e2e/tests/company.spec.ts
git commit -m "feat(company): the privacy sentence, the follow-ups, and the end-to-end proof"
```

---

### Task 14: Everything green, then hand it over

**Files:** none new.

- [ ] **Step 1: The full gates**

Run, from the repo root:

```bash
bun run typecheck && bun run lint && bun run test
```

(or `turbo run typecheck lint test` — whichever `package.json` at the root defines). Expected: every package clean. The backend suite runs against the shared dev database and is known to flake under load (`follow-ups.md` #124) — a red there is re-run once in isolation before it is reported as a failure, per the CI-quota memory: classify before reporting.

- [ ] **Step 2: Walk the four pages and the queue once more** in the browser, signed out and signed in, on a desktop and at 390px: `/about`, `/contact`, `/feedback`, `/careers`, `/admin/contact`. Check every link in every strip and in the footer's Empresa column lands.

- [ ] **Step 3: Hand over**

Use superpowers:finishing-a-development-branch. The branch merges to `dev`. The PR description names the spec and its revision, the FAQ handover file, the four routes, the new GraphQL fields, the migration (`00NN_contact_request.sql`, applied to dev already), the new `CONTACT_INBOX_EMAIL` var, and the follow-ups #126–#132.

---

## Self-review notes (already applied)

- **Spec coverage, revised scope:** pages and frame (Tasks 10–11); copy and eight locales (Task 9); contact channels and footer, including M-Pesa only and the five links (Task 8); `contact` context — table, aggregate, use cases, inbox email with `replyTo`, honeypot, rate limit (Tasks 2–7); admin queue and nav (Task 12); privacy sentence, follow-ups incl. #132, e2e (Task 13); the owner's eyebrow rule (Global Constraints, Task 8 Step 5, Task 10 test). The FAQ is deliberately absent: its text is handed over in `2026-09-02-faq-content.md` for the help center's `/help`.
- **Endpoint correction carried from the spec:** the form talks to the private `/graphql` mount through `sessionGraphql` (Task 11 Step 2), not `publicGraphql`.
- **Type consistency:** `ContactRequest.withId(id, createdAt)`, `reference`, `resolve(at, byUserId)`, `reopen()` (Task 3) are what Tasks 4–7 call; `ContactRequestRepositoryPort.insert/findById/saveStatus/countFromIpSince/listForAdmin` (Task 4) are what Task 6's fake implements; the GraphQL field names `contactRequestSubmit`, `contactRequestSetStatus`, `contactRequestAllForAdmin` (Task 7) are what Tasks 11–12's documents query; the `company` keys used by Tasks 10–12 all exist in Task 9's file; `CONTACT_INBOX_EMAIL` (Task 5) is the one `wrangler.jsonc` var; `CompanyPageId` (Task 10) covers exactly the four routes.
