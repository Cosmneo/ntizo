# Quotes Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer can request a quote on a `quote`-mode service, the provider answers with a price, date and duration, and accepting creates a booking already at `PENDING_PAYMENT`; all of it exposed over GraphQL, swept by the cron, and announced by notifications.

**Architecture:** A new bounded context `quote` (schema `ntizo_quote`, tables `quote`, `quote_proposal`, `quote_attachment`) mirroring the booking context's conventions exactly: an immutable aggregate whose transitions return new instances, commands that write inside `unitOfWork.atomicExecute` with a compare-and-swap `save`, events through the outbox, notifications raised after commit with `raiseQuietly`, cross-context reads through outbound ports filled at the composition root. Acceptance calls into the booking context through `BookingOpenerPort`; the booking gains `Booking.createFromQuote` and a nullable `service_option_id`.

**Tech Stack:** TypeScript, Bun (`bun test`), Drizzle ORM + drizzle-kit on Postgres (Neon), `@cosmneo/onion-lasagna` (`ConflictError`/`ForbiddenError`/`NotFoundError`/`UnprocessableError`, `BaseDomainEvent`, `UnitOfWorkPort`), GraphQL Yoga via `@cosmneo/onion-lasagna/graphql/field` (`defineQuery`, `defineMutation`, `defineGraphQLSchema`, `graphqlRoutes`), zod, Hono on Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-09-07-quotes-design.md` (mockup: `docs/superpowers/specs/2026-09-07-quotes.mockup.html`).

## Global Constraints

- Work in the worktree `.claude/worktrees/quotes` on branch `feat/quotes` (cut from `origin/dev`). All paths below are relative to that worktree root. Never `git stash`.
- Backend tests: `bun test <path>` from `packages/backend`. Typecheck: `bun run typecheck` from the repo root (turbo). Tests under `shared/infrastructure/database/__tests__` hit the real dev database through `DEV_DB_URL` in `packages/backend/.env`.
- No bounded context imports another context's `app/` tree. Cross-context calls go through an outbound port declared on the caller's side and filled in `apps/backend/api/src/graphql/private.ts` (and `scheduled.ts` for the cron).
- Every domain exception extends a kit error (`ConflictError`, `ForbiddenError`, `NotFoundError`, `UnprocessableError` from `@cosmneo/onion-lasagna`) and sets a `code` string; the client reads it as `extensions.originalCode`. A plain `Error` reaches the browser as `INTERNAL_ERROR`.
- Money is minor units as integers. Currency `MZN`. Minimum proposal price is `platform_settings.min_service_price_minor` (live).
- Reason tokens are machine tokens, never prose. Free text (description, proposal note, closing note) is refused when `hasContact` from `@ntizo/shared/text` matches, with code `MESSAGE_CONTAINS_CONTACT`.
- Attachments: reuse `POST /api/communication/attachments` for upload; keys look like `attachment/<userId>/<ts>-<uuid>`; up to 5 per step; types from `ACCEPTED_ATTACHMENT_TYPES` in `@ntizo/shared/attachments`.
- Notifications are raised after the transaction commits, inside the command, through `raiseQuietly`; a raise failure never fails the write.
- Commit after every task with a message in the house style (`feat(quote): …`, lower-case, a sentence), ending with the two attribution trailers used in this repo:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NvpF9AFai1N3GqvG244DhE
  ```
- This codebase documents every non-obvious decision in a doc comment above the code. The plan gives the code; write the comment from the spec's reasoning where the plan's own comment is short.

---

## File structure

**`packages/shared`** (contracts both apps share)
- `src/enums/quote-enums/index.ts` — statuses, tabs, reason tokens, attachment steps (Task 1)
- `src/read-models/system/quote/quote.schema.ts` + `index.ts` — customer and provider read models (Task 1)
- `src/read-models/public/service/service.schema.ts` — `quoteForm` on the public service detail (Task 17)
- `src/enums/notification-enums/notification-type.enum.ts` — five new types (Task 13)

**`packages/backend/src/modules/ntizo/shared/infrastructure/database`**
- `quote/enums.ts`, `quote/schemas/{quote,quote-proposal,quote-attachment}.schema.ts`, `quote/schemas/index.ts`, `quote/index.ts` — the tables (Task 2)
- `booking/schemas/booking.schema.ts` — nullable option, `quote_id`, origin check (Task 2)
- `platform/schemas/platform-settings.schema.ts` — `quote_proposal_validity_hours` (Task 2)
- `schemas.ts` — export `./quote`; `../../drizzle.config.ts` — `ntizo_quote` in `schemaFilter` (Task 2)
- `migrations/0039_*.sql` — generated, then hand-checked (Task 2)
- `__tests__/quote-constraints.test.ts` — constraints proven against the dev database (Task 2)

**`packages/backend/src/modules/ntizo/bounded-contexts/quote`**
- `domain/exceptions.ts`, `domain/events/index.ts`, `domain/aggregates/quote.aggregate.ts` (Task 3)
- `app/ports/outbound/*.port.ts` — repository, attachment repository, service reader, member reader, phone reader, settings reader, slot overlap, storage, start thread, booking opener, raise notification (Tasks 4, 6)
- `infrastructure/repositories/drizzle/quote.repository.ts`, `quote-attachment.repository.ts` (Task 4)
- `infrastructure/repositories/drizzle/{quote-service,provider-member,customer-phone,platform-settings,slot-overlap}.reader.ts` (Task 6)
- `app/use-cases/resolve-quote-attachments.ts`, `request-quote.command.ts` (Task 7)
- `app/use-cases/propose-quote.command.ts` (Task 8)
- `app/use-cases/{decline,reject,withdraw}-quote.command.ts` (Task 9)
- `app/use-cases/accept-quote.command.ts`, `mark-proposal-stale.internal.command.ts` (Task 11)
- `app/use-cases/sweep-quote.command.ts`, `sweep-due-quotes.internal.command.ts` (Task 12)
- `bootstrap/index.ts`, `index.ts` (Task 14)
- `__tests__/support/fakes.ts` and one test file per task

**`packages/backend/src/modules/ntizo/bounded-contexts/booking`**
- `domain/aggregates/booking.aggregate.ts` — `createFromQuote`, nullable option, `quoteId` (Task 10)
- `app/use-cases/create-booking-from-quote.command.ts`, `bootstrap/index.ts`, `index.ts`, the Drizzle mapper (Task 10)

**`packages/backend/src/modules/ntizo/bounded-contexts/notification/infrastructure/templates`** — seven quote templates and the registry (Task 13)

**`packages/backend/src/modules/ntizo/write/quote`** — `graphql/schema/mutations.ts`, `graphql/handlers/mutations.handlers.ts`, `index.ts`; `write/schema.ts` (Task 15)

**`packages/backend/src/modules/ntizo/read/quote`** — `app/ports/outbound/quote-read.repository.port.ts`, `app/use-cases/*.projection.ts`, `infra/repositories/drizzle/quote-read.repository.ts`, `graphql/schema/queries.ts`, `graphql/handlers/queries.handlers.ts`, `bootstrap/index.ts`, `index.ts`; `read/schema.ts` (Task 16)

**`packages/backend/src/modules/ntizo/{public,bounded-contexts}/catalog`** — `quoteForm` on the public service read (Task 17)

**`apps/backend/api/src`** — `booking-opener.adapter.ts`, `start-thread.adapter.ts`, `quote-attachments.ts`, `graphql/private.ts`, `scheduled.ts`, `api.ts` (Tasks 14, 18)

---

### Task 1: Shared enums and read models

**Files:**
- Create: `packages/shared/src/enums/quote-enums/index.ts`
- Modify: `packages/shared/src/enums/index.ts`
- Create: `packages/shared/src/read-models/system/quote/quote.schema.ts`
- Create: `packages/shared/src/read-models/system/quote/index.ts`
- Modify: `packages/shared/src/read-models/system/index.ts`
- Modify: `packages/shared/src/enums/notification-enums/notification-type.enum.ts`
- Test: `packages/shared/src/enums/__tests__/quote-enums.test.ts`

**Interfaces:**
- Produces, additionally: `NotificationType.QuoteAccepted`, `.QuoteDeclined`, `.ProviderQuoteWithdrawn`, `.ProviderQuoteExpired`, `.ProviderQuoteSlotTaken` — five new members, so that Tasks 7 to 12 can name them without a forward reference. The other five quote types already exist.
- Produces: `QUOTE_STATUSES`, `quoteStatusSchema`, `QuoteStatus` (type), `QUOTE_OPEN_STATUSES`, `QUOTE_PROVIDER_DECLINE_REASONS`, `QUOTE_CUSTOMER_REJECT_REASONS`, `QUOTE_WITHDRAWN_REASON`, `QUOTE_EXPIRED_CAUSES`, `QUOTE_SUPERSEDED_CAUSES`, `QUOTE_ATTACHMENT_STEPS`, `CUSTOMER_QUOTE_TABS`, `PROVIDER_QUOTE_TABS`; read models `customerQuoteReadModel`, `customerQuoteDetailReadModel`, `customerQuotePageReadModel`, `providerQuoteReadModel`, `providerQuoteDetailReadModel`, `providerQuotePageReadModel`, `providerQuoteCountsReadModel`, `quoteProposalReadModel`, `quoteAttachmentReadModel`, `quoteAddressReadModel` and their `*DTO` types.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/enums/__tests__/quote-enums.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  CUSTOMER_QUOTE_TABS,
  PROVIDER_QUOTE_TABS,
  QUOTE_OPEN_STATUSES,
  QUOTE_STATUSES,
  quoteStatusSchema,
} from "../quote-enums";

describe("quote enums", () => {
  it("names the seven statuses, two of them open", () => {
    expect(QUOTE_STATUSES).toEqual([
      "REQUESTED", "PROPOSED", "ACCEPTED", "DECLINED", "REJECTED", "WITHDRAWN", "EXPIRED",
    ]);
    expect(QUOTE_OPEN_STATUSES).toEqual(["REQUESTED", "PROPOSED"]);
    expect(quoteStatusSchema.safeParse("PROPOSED").success).toBe(true);
    expect(quoteStatusSchema.safeParse("DRAFT").success).toBe(false);
  });

  it("names the tabs each side shows", () => {
    expect(CUSTOMER_QUOTE_TABS).toEqual(["open", "history"]);
    expect(PROVIDER_QUOTE_TABS).toEqual(["toAnswer", "waiting", "history"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/shared && bun test src/enums/__tests__/quote-enums.test.ts`
Expected: FAIL, cannot resolve `../quote-enums`.

- [ ] **Step 3: Write the enums**

`packages/shared/src/enums/quote-enums/index.ts`:

```ts
import { z } from "zod";

/** The seven states of a quote. A set, not a sequence — see the spec's state machine. */
export const QUOTE_STATUSES = [
  "REQUESTED",
  "PROPOSED",
  "ACCEPTED",
  "DECLINED",
  "REJECTED",
  "WITHDRAWN",
  "EXPIRED",
] as const;
export const quoteStatusSchema = z.enum(QUOTE_STATUSES);
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** The two live states: a clock is running on each of them. */
export const QUOTE_OPEN_STATUSES = ["REQUESTED", "PROPOSED"] as const;

/** Why a provider closed a request. Tokens the other side renders in its own language. */
export const QUOTE_PROVIDER_DECLINE_REASONS = [
  "not_available",
  "cannot_perform",
  "outside_area",
  "other",
] as const;
export type QuoteProviderDeclineReason = (typeof QUOTE_PROVIDER_DECLINE_REASONS)[number];

/** Why a customer refused a proposal. */
export const QUOTE_CUSTOMER_REJECT_REASONS = [
  "too_expensive",
  "wrong_time",
  "found_elsewhere",
  "other",
] as const;
export type QuoteCustomerRejectReason = (typeof QUOTE_CUSTOMER_REJECT_REASONS)[number];

/** The one reason a withdrawal records. */
export const QUOTE_WITHDRAWN_REASON = "withdrawn" as const;

export const QUOTE_EXPIRED_CAUSES = ["provider_did_not_respond", "proposal_lapsed"] as const;
export type QuoteExpiredCause = (typeof QUOTE_EXPIRED_CAUSES)[number];

export const QUOTE_SUPERSEDED_CAUSES = ["revised", "slot_taken"] as const;
export type QuoteSupersededCause = (typeof QUOTE_SUPERSEDED_CAUSES)[number];

/** Which step of the quote a file was sent with. */
export const QUOTE_ATTACHMENT_STEPS = ["request", "proposal", "closing"] as const;
export type QuoteAttachmentStep = (typeof QUOTE_ATTACHMENT_STEPS)[number];

export const CUSTOMER_QUOTE_TABS = ["open", "history"] as const;
export type CustomerQuoteTab = (typeof CUSTOMER_QUOTE_TABS)[number];

export const PROVIDER_QUOTE_TABS = ["toAnswer", "waiting", "history"] as const;
export type ProviderQuoteTab = (typeof PROVIDER_QUOTE_TABS)[number];
```

Append to `packages/shared/src/enums/index.ts`:

```ts
export * from "./quote-enums";
```

- [ ] **Step 4: Write the read models**

`packages/shared/src/read-models/system/quote/quote.schema.ts`:

```ts
import { z } from "zod";
import {
  QUOTE_ATTACHMENT_STEPS,
  QUOTE_EXPIRED_CAUSES,
  QUOTE_SUPERSEDED_CAUSES,
  quoteStatusSchema,
} from "../../../enums/quote-enums";

/** A file on a quote. The URL is `/api/quote/attachments/<id>`, built by the client. */
export const quoteAttachmentReadModel = z.object({
  id: z.string().min(1),
  step: z.enum(QUOTE_ATTACHMENT_STEPS),
  proposalId: z.string().nullable(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
});

export const quoteProposalReadModel = z.object({
  id: z.string().min(1),
  priceMinor: z.number().int(),
  currency: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  durationMinutes: z.number().int(),
  providerMemberId: z.string(),
  memberFirstName: z.string(),
  note: z.string().nullable(),
  validUntil: z.string(),
  createdAt: z.string(),
  supersededAt: z.string().nullable(),
  supersededCause: z.enum(QUOTE_SUPERSEDED_CAUSES).nullable(),
  attachments: z.array(quoteAttachmentReadModel),
});

/** The customer's own address on the quote, in full. The provider never receives this shape. */
export const quoteAddressReadModel = z.object({
  label: z.string(),
  line: z.string(),
  city: z.string(),
  district: z.string().nullable(),
  directions: z.string().nullable(),
});

const quoteCore = {
  id: z.string().min(1),
  status: quoteStatusSchema,
  serviceId: z.string(),
  serviceName: z.string(),
  providerId: z.string(),
  /** The provider's timezone, for rendering `startsAt` and the clocks. */
  timezone: z.string(),
  threadId: z.string(),
  /** Whichever clock is running; null once terminal. */
  expiresAt: z.string().nullable(),
  expiredCause: z.enum(QUOTE_EXPIRED_CAUSES).nullable(),
  closedReason: z.string().nullable(),
  bookingId: z.string().nullable(),
  requestedAt: z.string(),
  /** The live proposal, or null while REQUESTED / after a closing that had none. */
  proposal: quoteProposalReadModel.nullable(),
};

export const customerQuoteReadModel = z.object({
  ...quoteCore,
  providerName: z.string(),
  providerSlug: z.string(),
  providerVerified: z.boolean(),
});

export const customerQuoteDetailReadModel = customerQuoteReadModel.extend({
  description: z.string(),
  neededBy: z.string().nullable(),
  address: quoteAddressReadModel.nullable(),
  requestAttachments: z.array(quoteAttachmentReadModel),
  /** Every proposal, newest first, superseded ones included. */
  proposals: z.array(quoteProposalReadModel),
  closedNote: z.string().nullable(),
  closingAttachments: z.array(quoteAttachmentReadModel),
});

export const customerQuotePageReadModel = z.object({
  items: z.array(customerQuoteReadModel),
  counts: z.object({ open: z.number().int(), history: z.number().int() }),
  hasMore: z.boolean(),
});

export const providerQuoteReadModel = z.object({
  ...quoteCore,
  customerFirstName: z.string(),
  /** District and city only before the booking is CONFIRMED — the reveal rule. */
  addressDistrict: z.string().nullable(),
  addressCity: z.string().nullable(),
  neededBy: z.string().nullable(),
  descriptionSnippet: z.string(),
  attachmentCount: z.number().int(),
});

export const quotePerformerReadModel = z.object({
  id: z.string().min(1),
  firstName: z.string(),
});

export const providerQuoteDetailReadModel = providerQuoteReadModel.extend({
  description: z.string(),
  customerCompletedBookings: z.number().int(),
  requestAttachments: z.array(quoteAttachmentReadModel),
  proposals: z.array(quoteProposalReadModel),
  closedNote: z.string().nullable(),
  closingAttachments: z.array(quoteAttachmentReadModel),
  /** The provider's own rate, for the "o cliente paga / recebes" split. */
  commissionBps: z.number().int(),
  /** Members who perform this service; the proposal form's member picker. */
  performers: z.array(quotePerformerReadModel),
});

export const providerQuotePageReadModel = z.object({
  items: z.array(providerQuoteReadModel),
  counts: z.object({
    toAnswer: z.number().int(),
    waiting: z.number().int(),
    history: z.number().int(),
  }),
  hasMore: z.boolean(),
});

export const providerQuoteCountsReadModel = z.object({ toAnswer: z.number().int() });

export type QuoteAttachmentDTO = z.infer<typeof quoteAttachmentReadModel>;
export type QuoteProposalDTO = z.infer<typeof quoteProposalReadModel>;
export type QuoteAddressDTO = z.infer<typeof quoteAddressReadModel>;
export type CustomerQuoteDTO = z.infer<typeof customerQuoteReadModel>;
export type CustomerQuoteDetailDTO = z.infer<typeof customerQuoteDetailReadModel>;
export type CustomerQuotePageDTO = z.infer<typeof customerQuotePageReadModel>;
export type ProviderQuoteDTO = z.infer<typeof providerQuoteReadModel>;
export type ProviderQuoteDetailDTO = z.infer<typeof providerQuoteDetailReadModel>;
export type ProviderQuotePageDTO = z.infer<typeof providerQuotePageReadModel>;
export type ProviderQuoteCountsDTO = z.infer<typeof providerQuoteCountsReadModel>;
```

`packages/shared/src/read-models/system/quote/index.ts`:

```ts
export * from "./quote.schema";
```

Append to `packages/shared/src/read-models/system/index.ts`:

```ts
export * from "./quote";
```

- [ ] **Step 5: Add the five notification types**

In `packages/shared/src/enums/notification-enums/notification-type.enum.ts`, the `--- quotes ---` block becomes:

```ts
  QuoteReceived = "QUOTE_RECEIVED",
  QuoteAccepted = "QUOTE_ACCEPTED",
  QuoteDeclined = "QUOTE_DECLINED",
  QuoteExpired = "QUOTE_EXPIRED",
  ProviderQuoteRequested = "PROVIDER_QUOTE_REQUESTED",
  ProviderQuoteAccepted = "PROVIDER_QUOTE_ACCEPTED",
  ProviderQuoteDeclined = "PROVIDER_QUOTE_DECLINED",
  ProviderQuoteWithdrawn = "PROVIDER_QUOTE_WITHDRAWN",
  ProviderQuoteExpired = "PROVIDER_QUOTE_EXPIRED",
  ProviderQuoteSlotTaken = "PROVIDER_QUOTE_SLOT_TAKEN",
```

`bucketForNotificationType` is an exhaustive switch with no `default`, so it stops compiling until the five new members are listed. Add them beside the existing quote cases in the arm that `return null` — every quote message is transactional, none is a reminder or a promotion:

```ts
    case NotificationType.QuoteAccepted:
    case NotificationType.QuoteDeclined:
    case NotificationType.ProviderQuoteWithdrawn:
    case NotificationType.ProviderQuoteExpired:
    case NotificationType.ProviderQuoteSlotTaken:
```

The templates for them are Task 13; a type with no template is an in-app row by the registry's own rule, so this step leaves nothing broken.

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd packages/shared && bun test src/enums && bun run typecheck`
Expected: PASS, including the existing `src/enums/__tests__/notifications.test.ts`, which iterates every type. A missing `case` is a compile error rather than a test failure, so the typecheck is the real proof.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/enums packages/shared/src/read-models/system
git commit -m "feat(quote): the shared enums, read models and notification types for quotes"
```

---

### Task 2: Database schema, booking and settings changes, migration, constraint tests

**Files:**
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/quote/enums.ts`
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/quote/schemas/quote.schema.ts`
- Create: `.../database/quote/schemas/quote-proposal.schema.ts`
- Create: `.../database/quote/schemas/quote-attachment.schema.ts`
- Create: `.../database/quote/schemas/index.ts`, `.../database/quote/index.ts`
- Modify: `.../database/schemas.ts` (add `export * from "./quote";`)
- Modify: `packages/backend/src/modules/ntizo/drizzle.config.ts` (add `"ntizo_quote"` to `schemaFilter`)
- Modify: `.../database/booking/schemas/booking.schema.ts`
- Modify: `.../database/platform/schemas/platform-settings.schema.ts`
- Create: `.../database/migrations/0039_<generated>.sql` (generated, then hand-checked)
- Test: `.../database/__tests__/quote-constraints.test.ts`

**Interfaces:**
- Produces: `QuoteStatus` const object + type, `QUOTE_STATUS_VALUES`, `QUOTE_DEADLINE_BEARING_STATUSES`; tables `quote`, `quoteProposal`, `quoteAttachment` with `QuoteRow`, `NewQuoteRow`, `QuoteProposalRow`, `NewQuoteProposalRow`, `QuoteAttachmentRow`, `NewQuoteAttachmentRow`; `booking.quoteId`, nullable `booking.serviceOptionId` / `booking.optionName`; `platformSettings.quoteProposalValidityHours`.

- [ ] **Step 1: Write the enums**

`.../database/quote/enums.ts`:

```ts
/** A set, not a sequence — the transitions are the aggregate's business. */
export const QuoteStatus = {
  Requested: "REQUESTED",
  Proposed: "PROPOSED",
  Accepted: "ACCEPTED",
  Declined: "DECLINED",
  Rejected: "REJECTED",
  Withdrawn: "WITHDRAWN",
  Expired: "EXPIRED",
} as const;

export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];
export const QUOTE_STATUS_VALUES = Object.values(QuoteStatus);

/**
 * The statuses on which `expires_at` is a deadline somebody is waiting on:
 * the provider's response window on REQUESTED, the proposal's validity on
 * PROPOSED. Adding one here is two edits — this constant and an arm in
 * `SweepQuoteCommand` — or the row is swept for ever and answered by nobody.
 */
export const QUOTE_DEADLINE_BEARING_STATUSES = [
  QuoteStatus.Requested,
  QuoteStatus.Proposed,
] as const;
```

- [ ] **Step 2: Write the three tables**

`.../database/quote/schemas/quote.schema.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, date, index, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "../../user/schemas/user.schema";
import { provider } from "../../provider/schemas/provider.schema";
import { service } from "../../catalog/schemas/service.schema";
import { thread } from "../../communication/schemas/thread.schema";
import { QUOTE_DEADLINE_BEARING_STATUSES, QUOTE_STATUS_VALUES, type QuoteStatus } from "../enums";

export const quoteSchema = pgSchema("ntizo_quote");

const statusList = (values: readonly QuoteStatus[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

export const quote = quoteSchema.table(
  "quote",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    serviceId: uuid("service_id").notNull().references(() => service.id),
    providerId: uuid("provider_id").notNull().references(() => provider.id),
    customerId: text("customer_id").notNull().references(() => user.id),
    /** The pair's conversation, created or reused when the request is sent. */
    threadId: uuid("thread_id").notNull().references(() => thread.id),

    status: text("status").notNull(),
    /** Whichever clock the status stands on; NULL once terminal. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** The locale the customer requested in; the booking's service-name snapshot is taken in it. */
    locale: text("locale").notNull(),

    // The request.
    description: text("description").notNull(),
    neededBy: date("needed_by"),
    addressLabel: text("address_label"),
    addressLine: text("address_line"),
    addressCity: text("address_city"),
    addressDistrict: text("address_district"),
    addressDirections: text("address_directions"),
    addressLat: text("address_lat"),
    addressLng: text("address_lng"),

    // The close.
    closedReason: text("closed_reason"),
    closedNote: text("closed_note"),
    closedByUserId: text("closed_by_user_id").references(() => user.id),
    expiredCause: text("expired_cause"),
    /**
     * Set at ACCEPTED, in the same transaction that inserts the booking. Not a
     * foreign key: `booking.quote_id` is the enforced link (it references this
     * table), and declaring both would make the two schema files import each
     * other.
     */
    bookingId: uuid("booking_id"),

    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    proposedAt: timestamp("proposed_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("quote_status_known", sql`${t.status} in (${statusList(QUOTE_STATUS_VALUES)})`),
    check(
      "quote_expired_cause_known",
      sql`${t.expiredCause} IS NULL OR ${t.expiredCause} in ('provider_did_not_respond', 'proposal_lapsed')`,
    ),
    // One open quote per customer and service — the mirror of checkout's one-open-draft rule.
    uniqueIndex("quote_open_per_customer_service_uq")
      .on(t.customerId, t.serviceId)
      .where(sql`${t.status} in ('REQUESTED', 'PROPOSED')`),
    index("quote_customer_recent_idx").on(t.customerId, t.createdAt.desc(), t.id.desc()),
    index("quote_provider_status_idx").on(t.providerId, t.status, t.expiresAt),
    // The sweep: predicate generated from the constant, proven live by quote-constraints.test.ts.
    index("quote_sweep_idx")
      .on(t.expiresAt)
      .where(sql`${t.status} in (${statusList(QUOTE_DEADLINE_BEARING_STATUSES)})`),
  ],
);

export type QuoteRow = typeof quote.$inferSelect;
export type NewQuoteRow = typeof quote.$inferInsert;
```

`.../database/quote/schemas/quote-proposal.schema.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, index, integer, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "../../user/schemas/user.schema";
import { providerMember } from "../../provider/schemas/provider-member.schema";
import { quote, quoteSchema } from "./quote.schema";

export const quoteProposal = quoteSchema.table(
  "quote_proposal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quote.id, { onDelete: "cascade" }),

    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull().default("MZN"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    /** starts_at + duration; stored so the overlap read never recomputes it. */
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    providerMemberId: uuid("provider_member_id")
      .notNull()
      .references(() => providerMember.id),
    note: text("note"),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),

    /** NULL on the live proposal; stamped when a revision or a taken slot replaces it. */
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    supersededCause: text("superseded_cause"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("quote_proposal_price_positive", sql`${t.priceMinor} > 0`),
    check("quote_proposal_duration_positive", sql`${t.durationMinutes} > 0`),
    check(
      "quote_proposal_superseded_cause_known",
      sql`${t.supersededCause} IS NULL OR ${t.supersededCause} in ('revised', 'slot_taken')`,
    ),
    // One live proposal per quote.
    uniqueIndex("quote_proposal_live_uq").on(t.quoteId).where(sql`${t.supersededAt} IS NULL`),
    index("quote_proposal_quote_recent_idx").on(t.quoteId, t.createdAt.desc()),
  ],
);

export type QuoteProposalRow = typeof quoteProposal.$inferSelect;
export type NewQuoteProposalRow = typeof quoteProposal.$inferInsert;
```

`.../database/quote/schemas/quote-attachment.schema.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { quote, quoteSchema } from "./quote.schema";
import { quoteProposal } from "./quote-proposal.schema";

/** A file sent with one step of the quote. Same bucket and limits as message attachments. */
export const quoteAttachment = quoteSchema.table(
  "quote_attachment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quote.id, { onDelete: "cascade" }),
    proposalId: uuid("proposal_id").references(() => quoteProposal.id, { onDelete: "cascade" }),
    step: text("step").notNull(),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("quote_attachment_step_known", sql`${t.step} in ('request', 'proposal', 'closing')`),
    check(
      "quote_attachment_proposal_step",
      sql`(${t.step} = 'proposal') = (${t.proposalId} IS NOT NULL)`,
    ),
    index("quote_attachment_quote_idx").on(t.quoteId),
  ],
);

export type QuoteAttachmentRow = typeof quoteAttachment.$inferSelect;
export type NewQuoteAttachmentRow = typeof quoteAttachment.$inferInsert;
```

`.../database/quote/schemas/index.ts`:

```ts
export { quoteSchema, quote } from "./quote.schema";
export type { QuoteRow, NewQuoteRow } from "./quote.schema";
export { quoteProposal } from "./quote-proposal.schema";
export type { QuoteProposalRow, NewQuoteProposalRow } from "./quote-proposal.schema";
export { quoteAttachment } from "./quote-attachment.schema";
export type { QuoteAttachmentRow, NewQuoteAttachmentRow } from "./quote-attachment.schema";
```

`.../database/quote/index.ts`:

```ts
export * from "./schemas";
export * from "./enums";
```

Add to `.../database/schemas.ts` (beside the other context lines):

```ts
export * from "./quote";
```

Add `"ntizo_quote"` to the `schemaFilter` array in `packages/backend/src/modules/ntizo/drizzle.config.ts`.

- [ ] **Step 3: Change the booking table**

In `.../database/booking/schemas/booking.schema.ts`:

```ts
// add the import
import { quote } from "../../quote/schemas/quote.schema";

// replace the two columns
    serviceOptionId: uuid("service_option_id").references(() => serviceOption.id),
    optionName: text("option_name"),

// add, after providerMemberId
    /** Set on a booking born from an accepted quote; exactly one of it and service_option_id is present. */
    quoteId: uuid("quote_id").references(() => quote.id),

// add to the table's constraint array
    check(
      "booking_origin_exactly_one",
      sql`(${t.serviceOptionId} IS NOT NULL) <> (${t.quoteId} IS NOT NULL)`,
    ),
```

- [ ] **Step 4: Add the settings column**

In `.../database/platform/schemas/platform-settings.schema.ts`, after `paymentWindowMinutes`:

```ts
  /** Hours a proposal stays acceptable after it is sent, capped at the proposed start. LIVE. */
  quoteProposalValidityHours: integer("quote_proposal_validity_hours").notNull().default(72),
```

and in the constraint array:

```ts
  check(
    "platform_settings_quote_proposal_validity_hours_positive",
    sql`${t.quoteProposalValidityHours} >= 1`,
  ),
```

- [ ] **Step 5: Generate the migration and check it by hand**

Run: `cd packages/backend && bun run db:ntizo:generate`
Expected: a new `0039_<name>.sql` under `src/modules/ntizo/shared/infrastructure/migrations/` and a journal entry.

Open the SQL and confirm it contains, in this order: `CREATE SCHEMA "ntizo_quote"`, the three `CREATE TABLE`s with their CHECKs, `ALTER TABLE "ntizo_booking"."booking" ALTER COLUMN "service_option_id" DROP NOT NULL`, the same for `option_name`, `ADD COLUMN "quote_id" uuid`, the `booking_origin_exactly_one` CHECK, the `quote_proposal_validity_hours` column with its CHECK, the two partial unique indexes (`WHERE`), and `quote_sweep_idx ... WHERE ("status" in ('REQUESTED', 'PROPOSED'))`. If drizzle-kit emitted the FK from `booking.quote_id` before the `quote` table exists, move the `ALTER TABLE ... ADD CONSTRAINT` below the `CREATE TABLE "ntizo_quote"."quote"` statement.

Apply to the dev database: `cd packages/backend && bun run db:ntizo:dev:migrate` (requires `DEV_DB_URL` in `packages/backend/.env`; every change here is additive or loosening, so a deployed API keeps working).

- [ ] **Step 6: Write the constraint test**

`.../database/__tests__/quote-constraints.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { category } from "../catalog/schemas/category.schema";
import { service } from "../catalog/schemas/service.schema";
import { provider } from "../provider/schemas/provider.schema";
import { providerMember } from "../provider/schemas/provider-member.schema";
import { user } from "../user/schemas/user.schema";
import { thread } from "../communication/schemas/thread.schema";
import { booking } from "../booking/schemas/booking.schema";
import { quote, quoteProposal } from "../quote/schemas";
import { QUOTE_DEADLINE_BEARING_STATUSES, QUOTE_STATUS_VALUES } from "../quote/enums";
import { bestEffortCleanup, DEV_DB_COLD_START_TIMEOUT_MS, openDevDbConnection } from "./dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql);
const suffix = crypto.randomUUID();

let customerId: string;
let ownerUserId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let threadId: string;
const quoteIds: string[] = [];

beforeAll(async () => {
  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    { id: customerId, email: `quote-customer-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: ownerUserId, email: `quote-owner-${suffix}@ntizo.test`, role: "customer", status: "active" },
  ]);
  const [p] = await db
    .insert(provider)
    .values({ ownerUserId, type: "individual", name: "Quote Constraint Provider", slug: `quote-constraint-${suffix}`, status: "active" })
    .returning({ id: provider.id });
  providerId = p!.id;
  const [m] = await db
    .insert(providerMember)
    .values({ providerId, userId: ownerUserId, role: "owner" })
    .returning({ id: providerMember.id });
  memberId = m!.id;
  const [c] = await db
    .insert(category)
    .values({ code: `quote-cat-${suffix}`, sortOrder: 999 })
    .returning({ id: category.id });
  categoryId = c!.id;
  const [s] = await db
    .insert(service)
    .values({ providerId, categoryId, sourceLocale: "pt-MZ", locationType: "at_customer", bookingMode: "quote", status: "published" })
    .returning({ id: service.id });
  serviceId = s!.id;
  const [t] = await db
    .insert(thread)
    .values({ type: "inquiry", customerUserId: customerId, providerId, lastMessageAt: new Date() })
    .returning({ id: thread.id });
  threadId = t!.id;
});

afterAll(async () => {
  await bestEffortCleanup([
    () => db.delete(quote).where(eq(quote.customerId, customerId)),
    () => db.delete(thread).where(eq(thread.id, threadId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(user).where(eq(user.id, customerId)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => sql.end(),
  ]);
});

function openQuote(status: "REQUESTED" | "PROPOSED" | "DECLINED") {
  return {
    serviceId, providerId, customerId, threadId, status, locale: "pt-MZ",
    description: "Dois aparelhos split", requestedAt: new Date(),
    expiresAt: status === "DECLINED" ? null : new Date(Date.now() + 3_600_000),
  };
}

describe("ntizo_quote constraints", () => {
  test("a customer cannot hold two open quotes on one service, but may after the first closes", async () => {
    const [first] = await db.insert(quote).values(openQuote("REQUESTED")).returning({ id: quote.id });
    quoteIds.push(first!.id);
    await expect(db.insert(quote).values(openQuote("PROPOSED"))).rejects.toThrow(/quote_open_per_customer_service_uq/);
    const [closed] = await db.insert(quote).values(openQuote("DECLINED")).returning({ id: quote.id });
    expect(closed?.id).toBeString();
    await db.delete(quote).where(eq(quote.id, first!.id));
  });

  test("a quote carries at most one live proposal", async () => {
    const [q] = await db.insert(quote).values(openQuote("PROPOSED")).returning({ id: quote.id });
    const startsAt = new Date(Date.now() + 7 * 24 * 3_600_000);
    const base = {
      quoteId: q!.id, priceMinor: 9_800, startsAt, durationMinutes: 240,
      endsAt: new Date(startsAt.getTime() + 240 * 60_000), providerMemberId: memberId,
      validUntil: new Date(Date.now() + 72 * 3_600_000), createdByUserId: ownerUserId,
    };
    await db.insert(quoteProposal).values(base);
    await expect(db.insert(quoteProposal).values(base)).rejects.toThrow(/quote_proposal_live_uq/);
    await db.insert(quoteProposal).values({ ...base, supersededAt: new Date(), supersededCause: "revised" });
    await db.delete(quote).where(eq(quote.id, q!.id));
  });

  test("a booking names exactly one origin", async () => {
    const [q] = await db.insert(quote).values(openQuote("DECLINED")).returning({ id: quote.id });
    const startsAt = new Date(Date.now() + 8 * 24 * 3_600_000);
    const row = {
      customerId, providerId, serviceId, providerMemberId: memberId, startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000), status: "DECLINED", priceMinor: 1000,
      commissionBps: 1000, commissionMinor: 100, serviceName: "S", providerName: "P", providerSlug: "p",
      durationMinutes: 60,
    };
    await expect(db.insert(booking).values({ ...row, serviceOptionId: null, quoteId: null })).rejects.toThrow(/booking_origin_exactly_one/);
    const [b] = await db.insert(booking).values({ ...row, serviceOptionId: null, quoteId: q!.id }).returning({ id: booking.id });
    expect(b?.id).toBeString();
    await db.delete(booking).where(eq(booking.id, b!.id));
    await db.delete(quote).where(eq(quote.id, q!.id));
  });

  test("the sweep index is partial on exactly the deadline-bearing statuses", async () => {
    const rows = await sql`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'ntizo_quote' AND tablename = 'quote' AND indexname = 'quote_sweep_idx'`;
    const definition = rows[0]?.["indexdef"] as string | undefined;
    expect(definition).toBeDefined();
    expect(definition).toContain("expires_at");
    for (const status of QUOTE_DEADLINE_BEARING_STATUSES) expect(definition).toContain(status);
    for (const status of QUOTE_STATUS_VALUES) {
      if (!(QUOTE_DEADLINE_BEARING_STATUSES as readonly string[]).includes(status)) {
        expect(definition).not.toContain(status);
      }
    }
  });
});
```

Add one more case to that file, proving the two declarations of the seven statuses agree — the wire enum in `packages/shared` and the column's CHECK cannot import each other, so this test is the only guard against them drifting:

```ts
import { QUOTE_STATUSES } from "@ntizo/shared";

test("the shared status list and the database's are the same set", () => {
  expect([...QUOTE_STATUS_VALUES].sort()).toEqual([...QUOTE_STATUSES].sort());
});
```

- [ ] **Step 7: Carry the nullability through everything that reads those two columns**

Making `service_option_id` and `option_name` nullable breaks the typecheck in six places. All six are mechanical, and they land here rather than in Task 10 so that the tree compiles at the end of every task.

In `booking.aggregate.ts`'s `BookingProps`:

```ts
  /** Null on a booking born from a quote; a priced booking always names its option. */
  readonly serviceOptionId: string | null;
  readonly optionName: string | null;
  /** Null on a priced booking. Exactly one of it and `serviceOptionId` is set. */
  readonly quoteId: string | null;
```

`Booking.create` keeps `serviceOptionId: string` and `optionName: string` in its own input — a priced booking always has both — and adds `quoteId: null` to the props it returns. In `Booking.restore`, the two unconditional `requireNonBlank` calls for those fields become:

```ts
    // Null means "born from a quote"; "" means a bug, and is refused everywhere.
    if (props.serviceOptionId !== null) Booking.requireNonBlank(props.serviceOptionId, "serviceOptionId");
    if (props.optionName !== null) Booking.requireNonBlank(props.optionName, "optionName");
    if ((props.serviceOptionId === null) === (props.quoteId === null)) {
      throw new BookingSnapshotInconsistentError("origin", String(props.serviceOptionId), String(props.quoteId));
    }
```

Add the getter beside the others: `get quoteId(): string | null { return this.props.quoteId; }`.

In `booking/infrastructure/repositories/drizzle/booking.repository.ts`: `toRow` gains `quoteId: entity.quoteId,`; `toAggregate` gains `quoteId: row.quoteId,` and leaves the two option fields passing straight through.

In `packages/shared/src/read-models/system/booking/booking.schema.ts` and `provider-booking.schema.ts`: `serviceOptionId: z.string().nullable()` and `optionName: z.string().nullable()`, with the comment *"Null on a booking born from a quote: the price is the proposal's, not an option's. Screens render the service name alone in that case."*

In `read/booking/app/ports/outbound/booking-read.repository.port.ts`: both row types' `serviceOptionId` and `optionName` become `string | null`. `to-booking-dto.ts` and `to-provider-booking-dto.ts` pass them through unchanged.

- [ ] **Step 8: Run the tests and the whole backend typecheck**

Run: `cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/quote-constraints.test.ts && bun test src/modules/ntizo/bounded-contexts/booking && bun run typecheck`
Expected: PASS on all three, including every existing booking test. Nothing in this task changes booking behaviour; if a booking test fails, the nullability propagation is wrong, not the test.

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/modules/ntizo packages/shared/src/read-models
git commit -m "feat(quote): the ntizo_quote schema, the booking's quote origin, the validity setting"
```

---
### Task 3: The domain — exceptions, events, the `Quote` aggregate

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/quote/domain/exceptions.ts`
- Create: `.../quote/domain/events/index.ts`
- Create: `.../quote/domain/aggregates/quote.aggregate.ts`
- Test: `.../quote/__tests__/quote.aggregate.test.ts`

**Interfaces:**
- Consumes: `QuoteStatus` from `shared/infrastructure/database/quote/enums`.
- Produces: `Quote` (static `request`, `restore`; methods `propose`, `accept`, `withAddress`, `decline`, `reject`, `withdraw`, `expire`, `proposalStale`, `hasCompleteAddress`, getters incl. `liveProposal`), types `QuoteProps`, `QuoteProposalProps`, `QuoteAddress`, `ProposeInput`; every exception class below; events `QuoteRequested`, `QuoteProposed`, `QuoteAccepted`, `QuoteDeclined`, `QuoteRejected`, `QuoteWithdrawn`, `QuoteExpired`, `QuoteProposalStale`.

- [ ] **Step 1: Write the exceptions**

`.../quote/domain/exceptions.ts`:

```ts
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from "@cosmneo/onion-lasagna";

export class QuoteNotFoundError extends NotFoundError {
  constructor(public readonly quoteId: string) {
    super({ message: `No quote was found with id "${quoteId}"`, code: "QUOTE_NOT_FOUND" });
    this.name = "QuoteNotFoundError";
  }
}

export class QuoteNotYoursError extends ForbiddenError {
  constructor() {
    super({ message: "This quote is not yours", code: "QUOTE_NOT_YOURS" });
    this.name = "QuoteNotYoursError";
  }
}

export class NotProviderMemberError extends ForbiddenError {
  constructor() {
    super({ message: "This workspace is not one you belong to", code: "NOT_PROVIDER_MEMBER" });
    this.name = "NotProviderMemberError";
  }
}

export class QuoteTransitionError extends UnprocessableError {
  constructor(public readonly from: string, public readonly to: string) {
    super({ message: `A quote cannot go from ${from} to ${to}`, code: "QUOTE_TRANSITION" });
    this.name = "QuoteTransitionError";
  }
}

export type NotQuotableReason = "not_found" | "not_published" | "not_quote_mode" | "provider_not_active";

export class QuoteServiceNotQuotableError extends UnprocessableError {
  constructor(public readonly reason: NotQuotableReason) {
    super({ message: `This service cannot be quoted: ${reason}`, code: "QUOTE_SERVICE_NOT_QUOTABLE" });
    this.name = "QuoteServiceNotQuotableError";
  }
}

export class QuoteAlreadyOpenError extends ConflictError {
  constructor() {
    super({ message: "You already have an open quote for this service", code: "QUOTE_ALREADY_OPEN" });
    this.name = "QuoteAlreadyOpenError";
  }
}

export class QuoteProposalLapsedError extends UnprocessableError {
  constructor(public readonly validUntil: Date) {
    super({ message: `The proposal expired at ${validUntil.toISOString()}`, code: "QUOTE_PROPOSAL_LAPSED" });
    this.name = "QuoteProposalLapsedError";
  }
}

export class QuoteNoLiveProposalError extends UnprocessableError {
  constructor() {
    super({ message: "This quote has no proposal to act on", code: "QUOTE_NO_LIVE_PROPOSAL" });
    this.name = "QuoteNoLiveProposalError";
  }
}

/** The calendar refused the slot when the booking was inserted; the whole acceptance rolled back. */
export class QuoteSlotTakenError extends ConflictError {
  constructor() {
    super({ message: "That time is no longer free on the provider's calendar", code: "QUOTE_SLOT_TAKEN" });
    this.name = "QuoteSlotTakenError";
  }
}

/** The provider proposed a time they have already sold. */
export class QuoteSlotOverlapError extends ConflictError {
  constructor() {
    super({ message: "A booking already occupies that time for this member", code: "QUOTE_SLOT_OVERLAP" });
    this.name = "QuoteSlotOverlapError";
  }
}

export class QuotePriceBelowMinimumError extends UnprocessableError {
  constructor(public readonly priceMinor: number, public readonly minimumMinor: number) {
    super({ message: `${priceMinor} is below the platform minimum of ${minimumMinor}`, code: "QUOTE_PRICE_BELOW_MINIMUM" });
    this.name = "QuotePriceBelowMinimumError";
  }
}

export class QuoteNoCustomerPhoneError extends UnprocessableError {
  constructor() {
    super({ message: "Add a phone number before accepting", code: "QUOTE_NO_CUSTOMER_PHONE" });
    this.name = "QuoteNoCustomerPhoneError";
  }
}

export class QuoteAddressRequiredError extends UnprocessableError {
  constructor() {
    super({ message: "This quote needs an address", code: "QUOTE_ADDRESS_REQUIRED" });
    this.name = "QuoteAddressRequiredError";
  }
}

export class QuoteMemberCannotPerformError extends UnprocessableError {
  constructor(public readonly providerMemberId: string) {
    super({ message: `Member ${providerMemberId} does not perform this service`, code: "QUOTE_MEMBER_CANNOT_PERFORM" });
    this.name = "QuoteMemberCannotPerformError";
  }
}

export class QuoteStartsInPastError extends UnprocessableError {
  constructor(public readonly startsAt: Date) {
    super({ message: `${startsAt.toISOString()} is in the past`, code: "QUOTE_STARTS_IN_PAST" });
    this.name = "QuoteStartsInPastError";
  }
}

export class QuoteDurationInvalidError extends UnprocessableError {
  constructor(public readonly durationMinutes: number) {
    super({ message: `${durationMinutes} is not a positive whole number of minutes`, code: "QUOTE_DURATION_INVALID" });
    this.name = "QuoteDurationInvalidError";
  }
}

export class QuoteFieldBlankError extends UnprocessableError {
  constructor(public readonly field: string) {
    super({ message: `${field} must not be blank`, code: "QUOTE_FIELD_BLANK" });
    this.name = "QuoteFieldBlankError";
  }
}

export class QuoteDateInvalidError extends UnprocessableError {
  constructor(public readonly field: string) {
    super({ message: `${field} is not a valid date`, code: "QUOTE_DATE_INVALID" });
    this.name = "QuoteDateInvalidError";
  }
}

/** Same code messages use, so the web's existing handling of it applies unchanged. */
export class QuoteContainsContactError extends UnprocessableError {
  constructor() {
    super({ message: "Phone numbers, emails and contact links stay off the platform until the booking is paid", code: "MESSAGE_CONTAINS_CONTACT" });
    this.name = "QuoteContainsContactError";
  }
}

export class QuoteTooManyAttachmentsError extends UnprocessableError {
  constructor(public readonly count: number, public readonly max: number) {
    super({ message: `${count} attachments; the limit is ${max}`, code: "TOO_MANY_ATTACHMENTS" });
    this.name = "QuoteTooManyAttachmentsError";
  }
}

export class QuoteAttachmentNotAvailableError extends UnprocessableError {
  constructor() {
    super({ message: "That file is not available to attach", code: "ATTACHMENT_NOT_AVAILABLE" });
    this.name = "QuoteAttachmentNotAvailableError";
  }
}
```

- [ ] **Step 2: Write the events**

`.../quote/domain/events/index.ts`:

```ts
import { BaseDomainEvent } from "@cosmneo/onion-lasagna";

type Party = { quoteId: string; customerId: string; providerId: string; serviceId: string };

export class QuoteRequested extends BaseDomainEvent<Party & { respondBy: Date }> {
  constructor(payload: Party & { respondBy: Date }) {
    super("quote.requested", payload.quoteId, payload);
  }
}

export class QuoteProposed extends BaseDomainEvent<
  Party & { proposalId: string; priceMinor: number; currency: string; startsAt: Date; validUntil: Date; revision: boolean }
> {
  constructor(payload: Party & { proposalId: string; priceMinor: number; currency: string; startsAt: Date; validUntil: Date; revision: boolean }) {
    super("quote.proposed", payload.quoteId, payload);
  }
}

export class QuoteAccepted extends BaseDomainEvent<Party & { bookingId: string; priceMinor: number; currency: string }> {
  constructor(payload: Party & { bookingId: string; priceMinor: number; currency: string }) {
    super("quote.accepted", payload.quoteId, payload);
  }
}

export class QuoteDeclined extends BaseDomainEvent<Party & { reason: string }> {
  constructor(payload: Party & { reason: string }) {
    super("quote.declined", payload.quoteId, payload);
  }
}

export class QuoteRejected extends BaseDomainEvent<Party & { reason: string }> {
  constructor(payload: Party & { reason: string }) {
    super("quote.rejected", payload.quoteId, payload);
  }
}

export class QuoteWithdrawn extends BaseDomainEvent<Party> {
  constructor(payload: Party) {
    super("quote.withdrawn", payload.quoteId, payload);
  }
}

export type QuoteExpiredCause = "provider_did_not_respond" | "proposal_lapsed";

export class QuoteExpired extends BaseDomainEvent<Party & { cause: QuoteExpiredCause }> {
  constructor(payload: Party & { cause: QuoteExpiredCause }) {
    super("quote.expired", payload.quoteId, payload);
  }
}

export class QuoteProposalStale extends BaseDomainEvent<Party & { proposalId: string; cause: "slot_taken"; respondBy: Date }> {
  constructor(payload: Party & { proposalId: string; cause: "slot_taken"; respondBy: Date }) {
    super("quote.proposal_stale", payload.quoteId, payload);
  }
}
```

- [ ] **Step 3: Write the failing aggregate tests**

`.../quote/__tests__/quote.aggregate.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Quote, type QuoteAddress } from "../domain/aggregates/quote.aggregate";
import {
  QuoteAddressRequiredError,
  QuoteFieldBlankError,
  QuotePriceBelowMinimumError,
  QuoteProposalLapsedError,
  QuoteStartsInPastError,
  QuoteTransitionError,
} from "../domain/exceptions";

const NOW = new Date("2026-09-07T10:00:00Z");
const IN_48H = new Date(NOW.getTime() + 48 * 3_600_000);
const NEXT_WEEK = new Date(NOW.getTime() + 7 * 24 * 3_600_000);
const ADDRESS: QuoteAddress = {
  label: "Casa", line: "Av. Julius Nyerere 1234", city: "Maputo",
  district: "Bairro Central", directions: null, lat: null, lng: null,
};

function requested(over: Partial<Parameters<typeof Quote.request>[0]> = {}) {
  return Quote.request({
    id: "q-1", serviceId: "svc-1", providerId: "prov-1", customerId: "cust-1", threadId: "thr-1",
    locale: "pt-MZ", description: "Dois aparelhos split", neededBy: "2026-09-27",
    address: ADDRESS, at: NOW, respondBy: IN_48H, ...over,
  });
}

function proposeInput(over: Partial<Parameters<Quote["propose"]>[0]> = {}) {
  return {
    priceMinor: 9_800, currency: "MZN", startsAt: NEXT_WEEK, durationMinutes: 240,
    providerMemberId: "mem-1", note: "Inclui tubagem", validUntil: new Date(NOW.getTime() + 72 * 3_600_000),
    createdByUserId: "user-prov", at: NOW, minPriceMinor: 5_000, ...over,
  };
}

describe("Quote.request", () => {
  it("starts REQUESTED with the response clock and no proposals", () => {
    const q = requested();
    expect(q.status).toBe("REQUESTED");
    expect(q.expiresAt).toEqual(IN_48H);
    expect(q.proposals).toEqual([]);
    expect(q.liveProposal).toBeNull();
    expect(q.hasCompleteAddress()).toBe(true);
  });

  it("refuses a blank description and a blank address line, but allows no address at all", () => {
    expect(() => requested({ description: "   " })).toThrow(QuoteFieldBlankError);
    expect(() => requested({ address: { ...ADDRESS, line: "" } })).toThrow(QuoteFieldBlankError);
    expect(requested({ address: null }).hasCompleteAddress()).toBe(false);
  });
});

describe("Quote.propose", () => {
  it("moves REQUESTED to PROPOSED with one live proposal and the validity clock", () => {
    const q = requested().propose(proposeInput());
    expect(q.status).toBe("PROPOSED");
    expect(q.proposals).toHaveLength(1);
    expect(q.liveProposal?.endsAt).toEqual(new Date(NEXT_WEEK.getTime() + 240 * 60_000));
    expect(q.expiresAt).toEqual(proposeInput().validUntil);
    expect(q.proposedAt).toEqual(NOW);
  });

  it("a revision supersedes the live proposal as 'revised' and never edits it", () => {
    const first = requested().propose(proposeInput({ priceMinor: 10_600 }));
    const later = new Date(NOW.getTime() + 3_600_000);
    const second = first.propose(proposeInput({ priceMinor: 9_800, at: later }));
    expect(second.proposals).toHaveLength(2);
    expect(second.proposals[0]).toMatchObject({ priceMinor: 10_600, supersededAt: later, supersededCause: "revised" });
    expect(second.liveProposal).toMatchObject({ priceMinor: 9_800, supersededAt: null });
  });

  it("refuses a price below the minimum, a start in the past, and a closed quote", () => {
    expect(() => requested().propose(proposeInput({ priceMinor: 4_999 }))).toThrow(QuotePriceBelowMinimumError);
    expect(() => requested().propose(proposeInput({ startsAt: NOW }))).toThrow(QuoteStartsInPastError);
    const declined = requested().decline(NOW, "user-prov", "outside_area", null);
    expect(() => declined.propose(proposeInput())).toThrow(QuoteTransitionError);
  });
});

describe("Quote.accept", () => {
  it("closes the quote with the booking id and no clock", () => {
    const q = requested().propose(proposeInput()).accept(NOW, "bk-1");
    expect(q.status).toBe("ACCEPTED");
    expect(q.bookingId).toBe("bk-1");
    expect(q.expiresAt).toBeNull();
    expect(q.acceptedAt).toEqual(NOW);
  });

  it("refuses after the validity passed, without an address, and from REQUESTED", () => {
    const proposed = requested().propose(proposeInput());
    const afterValidity = new Date(proposeInput().validUntil.getTime() + 1);
    expect(() => proposed.accept(afterValidity, "bk-1")).toThrow(QuoteProposalLapsedError);
    expect(() => requested({ address: null }).propose(proposeInput()).accept(NOW, "bk-1")).toThrow(QuoteAddressRequiredError);
    expect(() => requested().accept(NOW, "bk-1")).toThrow(QuoteTransitionError);
  });

  it("withAddress supplies the missing address while the quote is open", () => {
    const q = requested({ address: null }).propose(proposeInput()).withAddress(ADDRESS).accept(NOW, "bk-1");
    expect(q.addressLine).toBe("Av. Julius Nyerere 1234");
  });
});

describe("closing", () => {
  it("decline works from REQUESTED and PROPOSED; reject only from PROPOSED; withdraw only from REQUESTED", () => {
    expect(requested().decline(NOW, "u", "other", "nota").status).toBe("DECLINED");
    expect(requested().propose(proposeInput()).decline(NOW, "u", "other", null).status).toBe("DECLINED");
    expect(() => requested().reject(NOW, "c", "too_expensive", null)).toThrow(QuoteTransitionError);
    expect(requested().propose(proposeInput()).reject(NOW, "c", "too_expensive", null).closedReason).toBe("too_expensive");
    expect(requested().withdraw(NOW, "c", null).closedReason).toBe("withdrawn");
    expect(() => requested().propose(proposeInput()).withdraw(NOW, "c", null)).toThrow(QuoteTransitionError);
  });

  it("a closing clears the clock and records who, when and why", () => {
    const q = requested().decline(NOW, "user-prov", "outside_area", "Só Maputo cidade");
    expect(q.expiresAt).toBeNull();
    expect(q.closedByUserId).toBe("user-prov");
    expect(q.closedNote).toBe("Só Maputo cidade");
    expect(q.declinedAt).toEqual(NOW);
  });
});

describe("clocks", () => {
  it("expire names the cause by the status and is a no-op elsewhere", () => {
    expect(requested().expire(NOW)).toMatchObject({ status: "EXPIRED", expiredCause: "provider_did_not_respond" });
    expect(requested().propose(proposeInput()).expire(NOW)).toMatchObject({ status: "EXPIRED", expiredCause: "proposal_lapsed" });
    const done = requested().decline(NOW, "u", "other", null);
    expect(done.expire(NOW)).toBe(done);
  });

  it("proposalStale returns to REQUESTED, supersedes the live proposal as slot_taken, and restarts the response clock", () => {
    const stale = requested().propose(proposeInput()).proposalStale(NOW, IN_48H);
    expect(stale.status).toBe("REQUESTED");
    expect(stale.liveProposal).toBeNull();
    expect(stale.proposals[0]?.supersededCause).toBe("slot_taken");
    expect(stale.expiresAt).toEqual(IN_48H);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/quote/__tests__/quote.aggregate.test.ts`
Expected: FAIL, cannot resolve the aggregate module.

- [ ] **Step 5: Write the aggregate**

`.../quote/domain/aggregates/quote.aggregate.ts`:

```ts
import { QuoteStatus } from "../../../../shared/infrastructure/database/quote/enums";
import {
  QuoteAddressRequiredError,
  QuoteDateInvalidError,
  QuoteDurationInvalidError,
  QuoteFieldBlankError,
  QuoteNoLiveProposalError,
  QuotePriceBelowMinimumError,
  QuoteProposalLapsedError,
  QuoteStartsInPastError,
  QuoteTransitionError,
} from "../exceptions";

export type QuoteExpiredCause = "provider_did_not_respond" | "proposal_lapsed";
export type QuoteSupersededCause = "revised" | "slot_taken";

export interface QuoteAddress {
  label: string;
  line: string;
  city: string;
  district: string | null;
  directions: string | null;
  lat: number | null;
  lng: number | null;
}

export interface QuoteProposalProps {
  readonly id: string | null;
  readonly priceMinor: number;
  readonly currency: string;
  readonly startsAt: Date;
  readonly durationMinutes: number;
  readonly endsAt: Date;
  readonly providerMemberId: string;
  readonly note: string | null;
  readonly validUntil: Date;
  readonly createdByUserId: string;
  readonly supersededAt: Date | null;
  readonly supersededCause: QuoteSupersededCause | null;
  readonly createdAt: Date;
}

export interface QuoteProps {
  readonly id: string | null;
  readonly serviceId: string;
  readonly providerId: string;
  readonly customerId: string;
  readonly threadId: string;
  readonly status: QuoteStatus;
  readonly expiresAt: Date | null;
  readonly locale: string;
  readonly description: string;
  /** `YYYY-MM-DD`, the customer's wish, advisory only. */
  readonly neededBy: string | null;
  readonly addressLabel: string | null;
  readonly addressLine: string | null;
  readonly addressCity: string | null;
  readonly addressDistrict: string | null;
  readonly addressDirections: string | null;
  readonly addressLat: number | null;
  readonly addressLng: number | null;
  readonly closedReason: string | null;
  readonly closedNote: string | null;
  readonly closedByUserId: string | null;
  readonly expiredCause: QuoteExpiredCause | null;
  readonly bookingId: string | null;
  readonly requestedAt: Date;
  readonly proposedAt: Date | null;
  readonly acceptedAt: Date | null;
  readonly declinedAt: Date | null;
  readonly rejectedAt: Date | null;
  readonly withdrawnAt: Date | null;
  readonly expiredAt: Date | null;
  /** Oldest first. At most one has `supersededAt === null`. */
  readonly proposals: readonly QuoteProposalProps[];
}

export interface ProposeInput {
  priceMinor: number;
  currency: string;
  startsAt: Date;
  durationMinutes: number;
  providerMemberId: string;
  note?: string | null;
  validUntil: Date;
  createdByUserId: string;
  at: Date;
  minPriceMinor: number;
}

const OPEN_STATUSES: readonly QuoteStatus[] = [QuoteStatus.Requested, QuoteStatus.Proposed];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class Quote {
  private constructor(private readonly props: QuoteProps) {}

  private static requireNonBlank(value: string, field: string): void {
    if (value.trim().length === 0) throw new QuoteFieldBlankError(field);
  }

  private static requireValidDate(value: Date, field: string): void {
    if (Number.isNaN(value.getTime())) throw new QuoteDateInvalidError(field);
  }

  private static requireAddress(address: QuoteAddress): void {
    Quote.requireNonBlank(address.label, "addressLabel");
    Quote.requireNonBlank(address.line, "addressLine");
    Quote.requireNonBlank(address.city, "addressCity");
    if (address.district != null) Quote.requireNonBlank(address.district, "addressDistrict");
    if (address.directions != null) Quote.requireNonBlank(address.directions, "addressDirections");
  }

  static request(input: {
    id?: string | null;
    serviceId: string;
    providerId: string;
    customerId: string;
    threadId: string;
    locale: string;
    description: string;
    neededBy?: string | null;
    address?: QuoteAddress | null;
    at: Date;
    respondBy: Date;
  }): Quote {
    Quote.requireNonBlank(input.serviceId, "serviceId");
    Quote.requireNonBlank(input.providerId, "providerId");
    Quote.requireNonBlank(input.customerId, "customerId");
    Quote.requireNonBlank(input.threadId, "threadId");
    Quote.requireNonBlank(input.locale, "locale");
    const description = input.description.trim();
    if (description.length === 0) throw new QuoteFieldBlankError("description");
    Quote.requireValidDate(input.at, "at");
    Quote.requireValidDate(input.respondBy, "respondBy");
    if (input.respondBy.getTime() <= input.at.getTime()) throw new QuoteDateInvalidError("respondBy");
    if (input.neededBy != null && !ISO_DATE.test(input.neededBy)) throw new QuoteDateInvalidError("neededBy");
    const address = input.address ?? null;
    if (address) Quote.requireAddress(address);

    return new Quote({
      id: input.id ?? null,
      serviceId: input.serviceId,
      providerId: input.providerId,
      customerId: input.customerId,
      threadId: input.threadId,
      status: QuoteStatus.Requested,
      expiresAt: input.respondBy,
      locale: input.locale,
      description,
      neededBy: input.neededBy ?? null,
      addressLabel: address?.label ?? null,
      addressLine: address?.line ?? null,
      addressCity: address?.city ?? null,
      addressDistrict: address?.district ?? null,
      addressDirections: address?.directions ?? null,
      addressLat: address?.lat ?? null,
      addressLng: address?.lng ?? null,
      closedReason: null,
      closedNote: null,
      closedByUserId: null,
      expiredCause: null,
      bookingId: null,
      requestedAt: input.at,
      proposedAt: null,
      acceptedAt: null,
      declinedAt: null,
      rejectedAt: null,
      withdrawnAt: null,
      expiredAt: null,
      proposals: [],
    });
  }

  /** Reconstitution from storage. Re-checks the one derived fact each proposal carries. */
  static restore(props: QuoteProps): Quote {
    Quote.requireNonBlank(props.serviceId, "serviceId");
    Quote.requireNonBlank(props.customerId, "customerId");
    for (const p of props.proposals) {
      const expectedEnd = new Date(p.startsAt.getTime() + p.durationMinutes * 60_000);
      if (p.endsAt.getTime() !== expectedEnd.getTime()) throw new QuoteDateInvalidError("endsAt");
    }
    if (props.proposals.filter((p) => p.supersededAt === null).length > 1) {
      throw new QuoteTransitionError(props.status, "two live proposals");
    }
    return new Quote({ ...props, proposals: [...props.proposals] });
  }

  get liveProposal(): QuoteProposalProps | null {
    return this.props.proposals.find((p) => p.supersededAt === null) ?? null;
  }

  hasCompleteAddress(): boolean {
    return this.props.addressLabel !== null && this.props.addressLine !== null && this.props.addressCity !== null;
  }

  private requireOpen(to: QuoteStatus): void {
    if (!OPEN_STATUSES.includes(this.props.status)) throw new QuoteTransitionError(this.props.status, to);
  }

  propose(input: ProposeInput): Quote {
    this.requireOpen(QuoteStatus.Proposed);
    Quote.requireValidDate(input.at, "at");
    Quote.requireValidDate(input.startsAt, "startsAt");
    Quote.requireValidDate(input.validUntil, "validUntil");
    Quote.requireNonBlank(input.providerMemberId, "providerMemberId");
    Quote.requireNonBlank(input.createdByUserId, "createdByUserId");
    Quote.requireNonBlank(input.currency, "currency");
    if (!Number.isInteger(input.priceMinor) || input.priceMinor < input.minPriceMinor) {
      throw new QuotePriceBelowMinimumError(input.priceMinor, input.minPriceMinor);
    }
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
      throw new QuoteDurationInvalidError(input.durationMinutes);
    }
    if (input.startsAt.getTime() <= input.at.getTime()) throw new QuoteStartsInPastError(input.startsAt);
    if (input.validUntil.getTime() <= input.at.getTime()) throw new QuoteDateInvalidError("validUntil");

    const note = (input.note ?? "").trim();
    const superseded = this.props.proposals.map((p) =>
      p.supersededAt === null ? { ...p, supersededAt: input.at, supersededCause: "revised" as const } : p,
    );
    const fresh: QuoteProposalProps = {
      id: null,
      priceMinor: input.priceMinor,
      currency: input.currency,
      startsAt: input.startsAt,
      durationMinutes: input.durationMinutes,
      endsAt: new Date(input.startsAt.getTime() + input.durationMinutes * 60_000),
      providerMemberId: input.providerMemberId,
      note: note.length === 0 ? null : note,
      validUntil: input.validUntil,
      createdByUserId: input.createdByUserId,
      supersededAt: null,
      supersededCause: null,
      createdAt: input.at,
    };
    return new Quote({
      ...this.props,
      status: QuoteStatus.Proposed,
      expiresAt: input.validUntil,
      proposedAt: input.at,
      proposals: [...superseded, fresh],
    });
  }

  /** Supplies the address at acceptance when the request did not ask for one. Only while open. */
  withAddress(address: QuoteAddress): Quote {
    this.requireOpen(this.props.status);
    Quote.requireAddress(address);
    return new Quote({
      ...this.props,
      addressLabel: address.label,
      addressLine: address.line,
      addressCity: address.city,
      addressDistrict: address.district,
      addressDirections: address.directions,
      addressLat: address.lat,
      addressLng: address.lng,
    });
  }

  accept(at: Date, bookingId: string): Quote {
    if (this.props.status !== QuoteStatus.Proposed) throw new QuoteTransitionError(this.props.status, QuoteStatus.Accepted);
    Quote.requireValidDate(at, "at");
    Quote.requireNonBlank(bookingId, "bookingId");
    const live = this.liveProposal;
    if (!live) throw new QuoteNoLiveProposalError();
    if (live.validUntil.getTime() <= at.getTime()) throw new QuoteProposalLapsedError(live.validUntil);
    if (!this.hasCompleteAddress()) throw new QuoteAddressRequiredError();
    return new Quote({ ...this.props, status: QuoteStatus.Accepted, acceptedAt: at, bookingId, expiresAt: null });
  }

  private close(at: Date, byUserId: string, reason: string, note: string | null, patch: Partial<QuoteProps>): Quote {
    Quote.requireValidDate(at, "at");
    Quote.requireNonBlank(byUserId, "byUserId");
    Quote.requireNonBlank(reason, "reason");
    const trimmed = (note ?? "").trim();
    return new Quote({
      ...this.props,
      expiresAt: null,
      closedReason: reason,
      closedNote: trimmed.length === 0 ? null : trimmed,
      closedByUserId: byUserId,
      ...patch,
    });
  }

  /** The provider says no, from REQUESTED (declines the request) or PROPOSED (withdraws the proposal). */
  decline(at: Date, byUserId: string, reason: string, note: string | null): Quote {
    this.requireOpen(QuoteStatus.Declined);
    return this.close(at, byUserId, reason, note, { status: QuoteStatus.Declined, declinedAt: at });
  }

  /** The customer refuses the proposal. */
  reject(at: Date, byUserId: string, reason: string, note: string | null): Quote {
    if (this.props.status !== QuoteStatus.Proposed) throw new QuoteTransitionError(this.props.status, QuoteStatus.Rejected);
    return this.close(at, byUserId, reason, note, { status: QuoteStatus.Rejected, rejectedAt: at });
  }

  /** The customer takes the request back before any proposal. */
  withdraw(at: Date, byUserId: string, note: string | null): Quote {
    if (this.props.status !== QuoteStatus.Requested) throw new QuoteTransitionError(this.props.status, QuoteStatus.Withdrawn);
    return this.close(at, byUserId, "withdrawn", note, { status: QuoteStatus.Withdrawn, withdrawnAt: at });
  }

  /** A clock ran out. No-op from any status that has no clock, so the sweep is idempotent. */
  expire(at: Date): Quote {
    if (!OPEN_STATUSES.includes(this.props.status)) return this;
    Quote.requireValidDate(at, "at");
    const cause: QuoteExpiredCause =
      this.props.status === QuoteStatus.Requested ? "provider_did_not_respond" : "proposal_lapsed";
    return new Quote({ ...this.props, status: QuoteStatus.Expired, expiredAt: at, expiredCause: cause, expiresAt: null });
  }

  /** The calendar refused the proposed time at acceptance: back to the provider, with a fresh response clock. */
  proposalStale(at: Date, respondBy: Date): Quote {
    if (this.props.status !== QuoteStatus.Proposed) throw new QuoteTransitionError(this.props.status, QuoteStatus.Requested);
    Quote.requireValidDate(at, "at");
    Quote.requireValidDate(respondBy, "respondBy");
    const proposals = this.props.proposals.map((p) =>
      p.supersededAt === null ? { ...p, supersededAt: at, supersededCause: "slot_taken" as const } : p,
    );
    return new Quote({ ...this.props, status: QuoteStatus.Requested, expiresAt: respondBy, proposals });
  }

  get id(): string | null { return this.props.id; }
  get serviceId(): string { return this.props.serviceId; }
  get providerId(): string { return this.props.providerId; }
  get customerId(): string { return this.props.customerId; }
  get threadId(): string { return this.props.threadId; }
  get status(): QuoteStatus { return this.props.status; }
  get expiresAt(): Date | null { return this.props.expiresAt; }
  get locale(): string { return this.props.locale; }
  get description(): string { return this.props.description; }
  get neededBy(): string | null { return this.props.neededBy; }
  get addressLabel(): string | null { return this.props.addressLabel; }
  get addressLine(): string | null { return this.props.addressLine; }
  get addressCity(): string | null { return this.props.addressCity; }
  get addressDistrict(): string | null { return this.props.addressDistrict; }
  get addressDirections(): string | null { return this.props.addressDirections; }
  get addressLat(): number | null { return this.props.addressLat; }
  get addressLng(): number | null { return this.props.addressLng; }
  get closedReason(): string | null { return this.props.closedReason; }
  get closedNote(): string | null { return this.props.closedNote; }
  get closedByUserId(): string | null { return this.props.closedByUserId; }
  get expiredCause(): QuoteExpiredCause | null { return this.props.expiredCause; }
  get bookingId(): string | null { return this.props.bookingId; }
  get requestedAt(): Date { return this.props.requestedAt; }
  get proposedAt(): Date | null { return this.props.proposedAt; }
  get acceptedAt(): Date | null { return this.props.acceptedAt; }
  get declinedAt(): Date | null { return this.props.declinedAt; }
  get rejectedAt(): Date | null { return this.props.rejectedAt; }
  get withdrawnAt(): Date | null { return this.props.withdrawnAt; }
  get expiredAt(): Date | null { return this.props.expiredAt; }
  get proposals(): readonly QuoteProposalProps[] { return this.props.proposals; }
  /** Everything, for the repository. */
  toProps(): QuoteProps { return { ...this.props, proposals: [...this.props.proposals] }; }
}
```

- [ ] **Step 6: Run the tests**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/quote/__tests__/quote.aggregate.test.ts`
Expected: PASS (all 12 cases).

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/quote
git commit -m "feat(quote): the Quote aggregate, its exceptions and events"
```

---

### Task 4: Repository ports, the Drizzle repositories, the DB test

**Files:**
- Create: `.../quote/app/ports/outbound/quote.repository.port.ts`
- Create: `.../quote/app/ports/outbound/quote-attachment.repository.port.ts`
- Create: `.../quote/infrastructure/repositories/drizzle/quote.repository.ts`
- Create: `.../quote/infrastructure/repositories/drizzle/quote-attachment.repository.ts`
- Test: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/quote-repository.test.ts`

**Interfaces:**
- Consumes: `Quote`, `QuoteProps`, `QuoteProposalProps` (Task 3); tables (Task 2).
- Produces: `QuoteRepositoryPort { insert(quote): Promise<Quote>; findById(id): Promise<Quote | null>; save(quote, expectedStatus): Promise<Quote | null>; findDueForSweep(now, limit): Promise<Quote[]> }`, `QuoteAttachmentRepositoryPort { insertMany(rows: NewQuoteAttachment[]): Promise<void>; findVisible(attachmentId, viewerUserId): Promise<QuoteAttachmentRow | null>; findAny(attachmentId): Promise<QuoteAttachmentRow | null> }`, `NewQuoteAttachment`, `DrizzleQuoteRepository`, `DrizzleQuoteAttachmentRepository`.

- [ ] **Step 1: Write the ports**

`.../quote/app/ports/outbound/quote.repository.port.ts`:

```ts
import type { Quote } from "../../../domain/aggregates/quote.aggregate";

export interface QuoteRepositoryPort {
  /**
   * Writes the quote row and any proposal rows. Throws `QuoteAlreadyOpenError`
   * when `quote_open_per_customer_service_uq` refuses. Returns the quote with ids.
   */
  insert(quote: Quote): Promise<Quote>;

  findById(id: string): Promise<Quote | null>;

  /**
   * Compare-and-swap: updates the row only while its status is still
   * `expectedStatus`; inserts proposals whose id is null and stamps
   * supersession on the rest. Returns the persisted quote (ids assigned) or
   * null when the row had moved on.
   */
  save(quote: Quote, expectedStatus: Quote["status"]): Promise<Quote | null>;

  /** Open quotes whose clock has run out, oldest deadline first. */
  findDueForSweep(now: Date, limit: number): Promise<Quote[]>;
}
```

`.../quote/app/ports/outbound/quote-attachment.repository.port.ts`:

```ts
import type { QuoteAttachmentRow } from "../../../../../shared/infrastructure/database/quote/schemas";

export type QuoteAttachmentStep = "request" | "proposal" | "closing";

export interface NewQuoteAttachment {
  quoteId: string;
  proposalId: string | null;
  step: QuoteAttachmentStep;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface QuoteAttachmentRepositoryPort {
  insertMany(rows: NewQuoteAttachment[]): Promise<void>;
  /** The row, only if the viewer is the quote's customer or a member of its provider. */
  findVisible(attachmentId: string, viewerUserId: string): Promise<QuoteAttachmentRow | null>;
  /** For administrators. */
  findAny(attachmentId: string): Promise<QuoteAttachmentRow | null>;
}
```

- [ ] **Step 2: Write the Drizzle repositories**

`.../quote/infrastructure/repositories/drizzle/quote.repository.ts`:

```ts
import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  quote,
  quoteProposal,
  type NewQuoteProposalRow,
  type NewQuoteRow,
  type QuoteProposalRow,
  type QuoteRow,
} from "../../../../../shared/infrastructure/database/quote/schemas";
import { QUOTE_DEADLINE_BEARING_STATUSES, type QuoteStatus } from "../../../../../shared/infrastructure/database/quote/enums";
import { Quote, type QuoteProposalProps } from "../../../domain/aggregates/quote.aggregate";
import { QuoteAlreadyOpenError } from "../../../domain/exceptions";
import type { QuoteRepositoryPort } from "../../../app/ports/outbound/quote.repository.port";

const OPEN_QUOTE_CONSTRAINT = "quote_open_per_customer_service_uq";

function isOpenQuoteCollision(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  const constraintName = (error as { constraint_name?: unknown }).constraint_name;
  return code === "23505" && constraintName === OPEN_QUOTE_CONSTRAINT;
}

function toQuoteRow(q: Quote): Omit<NewQuoteRow, "id" | "createdAt" | "updatedAt"> {
  return {
    serviceId: q.serviceId,
    providerId: q.providerId,
    customerId: q.customerId,
    threadId: q.threadId,
    status: q.status,
    expiresAt: q.expiresAt,
    locale: q.locale,
    description: q.description,
    neededBy: q.neededBy,
    addressLabel: q.addressLabel,
    addressLine: q.addressLine,
    addressCity: q.addressCity,
    addressDistrict: q.addressDistrict,
    addressDirections: q.addressDirections,
    addressLat: q.addressLat === null ? null : String(q.addressLat),
    addressLng: q.addressLng === null ? null : String(q.addressLng),
    closedReason: q.closedReason,
    closedNote: q.closedNote,
    closedByUserId: q.closedByUserId,
    expiredCause: q.expiredCause,
    bookingId: q.bookingId,
    requestedAt: q.requestedAt,
    proposedAt: q.proposedAt,
    acceptedAt: q.acceptedAt,
    declinedAt: q.declinedAt,
    rejectedAt: q.rejectedAt,
    withdrawnAt: q.withdrawnAt,
    expiredAt: q.expiredAt,
  };
}

function toProposalRow(quoteId: string, p: QuoteProposalProps): Omit<NewQuoteProposalRow, "id"> {
  return {
    quoteId,
    priceMinor: p.priceMinor,
    currency: p.currency,
    startsAt: p.startsAt,
    durationMinutes: p.durationMinutes,
    endsAt: p.endsAt,
    providerMemberId: p.providerMemberId,
    note: p.note,
    validUntil: p.validUntil,
    createdByUserId: p.createdByUserId,
    supersededAt: p.supersededAt,
    supersededCause: p.supersededCause,
    createdAt: p.createdAt,
  };
}

function toProposalProps(row: QuoteProposalRow): QuoteProposalProps {
  return {
    id: row.id,
    priceMinor: row.priceMinor,
    currency: row.currency,
    startsAt: row.startsAt,
    durationMinutes: row.durationMinutes,
    endsAt: row.endsAt,
    providerMemberId: row.providerMemberId,
    note: row.note,
    validUntil: row.validUntil,
    createdByUserId: row.createdByUserId,
    supersededAt: row.supersededAt,
    supersededCause: row.supersededCause as QuoteProposalProps["supersededCause"],
    createdAt: row.createdAt,
  };
}

function toAggregate(row: QuoteRow, proposals: QuoteProposalRow[]): Quote {
  return Quote.restore({
    id: row.id,
    serviceId: row.serviceId,
    providerId: row.providerId,
    customerId: row.customerId,
    threadId: row.threadId,
    status: row.status as QuoteStatus,
    expiresAt: row.expiresAt,
    locale: row.locale,
    description: row.description,
    neededBy: row.neededBy,
    addressLabel: row.addressLabel,
    addressLine: row.addressLine,
    addressCity: row.addressCity,
    addressDistrict: row.addressDistrict,
    addressDirections: row.addressDirections,
    addressLat: row.addressLat === null ? null : Number(row.addressLat),
    addressLng: row.addressLng === null ? null : Number(row.addressLng),
    closedReason: row.closedReason,
    closedNote: row.closedNote,
    closedByUserId: row.closedByUserId,
    expiredCause: row.expiredCause as Quote["expiredCause"],
    bookingId: row.bookingId,
    requestedAt: row.requestedAt,
    proposedAt: row.proposedAt,
    acceptedAt: row.acceptedAt,
    declinedAt: row.declinedAt,
    rejectedAt: row.rejectedAt,
    withdrawnAt: row.withdrawnAt,
    expiredAt: row.expiredAt,
    proposals: proposals
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(toProposalProps),
  });
}

export class DrizzleQuoteRepository implements QuoteRepositoryPort {
  private async proposalsFor(quoteIds: string[]): Promise<Map<string, QuoteProposalRow[]>> {
    const map = new Map<string, QuoteProposalRow[]>();
    if (quoteIds.length === 0) return map;
    const rows = await getDb().select().from(quoteProposal).where(inArray(quoteProposal.quoteId, quoteIds));
    for (const row of rows) {
      const list = map.get(row.quoteId) ?? [];
      list.push(row);
      map.set(row.quoteId, list);
    }
    return map;
  }

  async insert(entity: Quote): Promise<Quote> {
    const db = getDb();
    let inserted: QuoteRow;
    try {
      const [row] = await db.insert(quote).values(toQuoteRow(entity)).returning();
      inserted = row!;
    } catch (error) {
      if (isOpenQuoteCollision(error)) throw new QuoteAlreadyOpenError();
      throw error;
    }
    const proposals: QuoteProposalRow[] = [];
    for (const p of entity.proposals) {
      const [row] = await db.insert(quoteProposal).values(toProposalRow(inserted.id, p)).returning();
      proposals.push(row!);
    }
    return toAggregate(inserted, proposals);
  }

  async findById(id: string): Promise<Quote | null> {
    const [row] = await getDb().select().from(quote).where(eq(quote.id, id)).limit(1);
    if (!row) return null;
    const proposals = (await this.proposalsFor([row.id])).get(row.id) ?? [];
    return toAggregate(row, proposals);
  }

  async save(entity: Quote, expectedStatus: Quote["status"]): Promise<Quote | null> {
    const db = getDb();
    const id = entity.id as string;
    const [updated] = await db
      .update(quote)
      .set({ ...toQuoteRow(entity), updatedAt: new Date() })
      .where(and(eq(quote.id, id), eq(quote.status, expectedStatus)))
      .returning();
    if (!updated) return null;

    const persisted: QuoteProposalRow[] = [];
    for (const p of entity.proposals) {
      if (p.id === null) {
        const [row] = await db.insert(quoteProposal).values(toProposalRow(id, p)).returning();
        persisted.push(row!);
      } else {
        const [row] = await db
          .update(quoteProposal)
          .set({ supersededAt: p.supersededAt, supersededCause: p.supersededCause })
          .where(eq(quoteProposal.id, p.id))
          .returning();
        persisted.push(row!);
      }
    }
    return toAggregate(updated, persisted);
  }

  async findDueForSweep(now: Date, limit: number): Promise<Quote[]> {
    const rows = await getDb()
      .select()
      .from(quote)
      .where(
        and(
          inArray(quote.status, [...QUOTE_DEADLINE_BEARING_STATUSES]),
          isNotNull(quote.expiresAt),
          lte(quote.expiresAt, now),
        ),
      )
      .orderBy(asc(quote.expiresAt))
      .limit(limit);
    const proposals = await this.proposalsFor(rows.map((r) => r.id));
    return rows.map((row) => toAggregate(row, proposals.get(row.id) ?? []));
  }
}
```

`.../quote/infrastructure/repositories/drizzle/quote-attachment.repository.ts`:

```ts
import { and, eq, or } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { quote, quoteAttachment, type QuoteAttachmentRow } from "../../../../../shared/infrastructure/database/quote/schemas";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { NewQuoteAttachment, QuoteAttachmentRepositoryPort } from "../../../app/ports/outbound/quote-attachment.repository.port";

export class DrizzleQuoteAttachmentRepository implements QuoteAttachmentRepositoryPort {
  async insertMany(rows: NewQuoteAttachment[]): Promise<void> {
    if (rows.length === 0) return;
    await getDb().insert(quoteAttachment).values(rows);
  }

  async findVisible(attachmentId: string, viewerUserId: string): Promise<QuoteAttachmentRow | null> {
    const db = getDb();
    const [row] = await db
      .select({ attachment: quoteAttachment })
      .from(quoteAttachment)
      .innerJoin(quote, eq(quote.id, quoteAttachment.quoteId))
      .leftJoin(
        providerMember,
        and(eq(providerMember.providerId, quote.providerId), eq(providerMember.userId, viewerUserId)),
      )
      .where(
        and(
          eq(quoteAttachment.id, attachmentId),
          or(eq(quote.customerId, viewerUserId), eq(providerMember.userId, viewerUserId)),
        ),
      )
      .limit(1);
    return row?.attachment ?? null;
  }

  async findAny(attachmentId: string): Promise<QuoteAttachmentRow | null> {
    const [row] = await getDb().select().from(quoteAttachment).where(eq(quoteAttachment.id, attachmentId)).limit(1);
    return row ?? null;
  }
}
```

- [ ] **Step 3: Write the DB-backed repository test**

`packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/quote-repository.test.ts` — same fixture setup as `quote-constraints.test.ts` (copy its `beforeAll`/`afterAll` and the imports of `user`, `provider`, `providerMember`, `category`, `service`, `thread`), plus:

```ts
import * as authSchema from "../../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../../shared/infrastructure/database/tx-context";
import { Quote } from "../../../../bounded-contexts/quote/domain/aggregates/quote.aggregate";
import { QuoteAlreadyOpenError } from "../../../../bounded-contexts/quote/domain/exceptions";
import { DrizzleQuoteRepository } from "../../../../bounded-contexts/quote/infrastructure/repositories/drizzle/quote.repository";

const db = drizzle(sql, { schema: authSchema });
const repo = new DrizzleQuoteRepository();
const run = <T>(work: () => Promise<T>) => __runWithTransactionContextForTests(db, work);

describe("DrizzleQuoteRepository", () => {
  test("insert then findById round-trips the request; a second open request on the service is refused", async () => {
    const q = Quote.request({
      serviceId, providerId, customerId, threadId, locale: "pt-MZ", description: "Dois aparelhos split",
      neededBy: "2026-09-27", address: { label: "Casa", line: "Av. X 1", city: "Maputo", district: "Central", directions: null, lat: -25.96, lng: 32.58 },
      at: new Date(), respondBy: new Date(Date.now() + 48 * 3_600_000),
    });
    const saved = await run(() => repo.insert(q));
    expect(saved.id).toBeString();
    const found = await run(() => repo.findById(saved.id as string));
    expect(found?.description).toBe("Dois aparelhos split");
    expect(found?.addressLat).toBe(-25.96);
    expect(found?.proposals).toEqual([]);
    await expect(run(() => repo.insert(q))).rejects.toThrow(QuoteAlreadyOpenError);
    quoteIds.push(saved.id as string);
  });

  test("save inserts a new proposal, stamps the superseded one, and refuses when the status moved on", async () => {
    const found = (await run(() => repo.findById(quoteIds[0]!)))!;
    const startsAt = new Date(Date.now() + 7 * 24 * 3_600_000);
    const propose = (q: Quote, price: number, at: Date) =>
      q.propose({ priceMinor: price, currency: "MZN", startsAt, durationMinutes: 240, providerMemberId: memberId,
        validUntil: new Date(at.getTime() + 72 * 3_600_000), createdByUserId: ownerUserId, at, minPriceMinor: 5_000 });
    const first = await run(() => repo.save(propose(found, 10_600, new Date()), "REQUESTED"));
    expect(first?.liveProposal?.id).toBeString();
    const second = await run(() => repo.save(propose(first!, 9_800, new Date(Date.now() + 1000)), "PROPOSED"));
    expect(second?.proposals).toHaveLength(2);
    expect(second?.proposals[0]?.supersededCause).toBe("revised");
    expect(second?.liveProposal?.priceMinor).toBe(9_800);
    const stale = await run(() => repo.save(second!.decline(new Date(), ownerUserId, "other", null), "REQUESTED"));
    expect(stale).toBeNull();
  });

  test("findDueForSweep returns only open quotes past their clock", async () => {
    const q = Quote.request({
      serviceId, providerId, customerId: ownerUserId, threadId, locale: "pt-MZ", description: "x",
      at: new Date(Date.now() - 2 * 3_600_000), respondBy: new Date(Date.now() - 3_600_000),
    });
    const saved = await run(() => repo.insert(q));
    quoteIds.push(saved.id as string);
    const due = await run(() => repo.findDueForSweep(new Date(), 50));
    expect(due.map((d) => d.id)).toContain(saved.id);
    expect(due.map((d) => d.id)).not.toContain(quoteIds[0]);
  });
});
```

(The second fixture uses `ownerUserId` as the customer so it does not collide with the first test's open quote.)

- [ ] **Step 4: Run it**

Run: `cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/quote-repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo
git commit -m "feat(quote): the repository ports and their Drizzle adapters"
```

---
### Task 5: The remaining outbound ports and the test fakes

**Files:**
- Create: `.../quote/app/ports/outbound/quote-service.reader.port.ts`
- Create: `.../quote/app/ports/outbound/provider-member.reader.port.ts`
- Create: `.../quote/app/ports/outbound/customer-phone.reader.port.ts`
- Create: `.../quote/app/ports/outbound/platform-settings.reader.port.ts`
- Create: `.../quote/app/ports/outbound/slot-overlap.reader.port.ts`
- Create: `.../quote/app/ports/outbound/attachment-storage.port.ts`
- Create: `.../quote/app/ports/outbound/start-thread.port.ts`
- Create: `.../quote/app/ports/outbound/booking-opener.port.ts`
- Create: `.../quote/app/ports/outbound/raise-notification.port.ts`
- Create: `.../quote/__tests__/support/fakes.ts`

**Interfaces:**
- Produces the port interfaces every command consumes (exact shapes below) and the fakes every command test uses: `TrackingUnitOfWork`, `CapturingOutbox`, `FakeRaiser`, `FakeQuoteRepo`, `FakeAttachmentRepo`, `FakeServiceReader`, `FakeMemberReader`, `FakePhoneReader`, `FakeSettings`, `FakeOverlap`, `FakeStorage`, `FakeStartThread`, `FakeBookingOpener`, plus fixture builders `requestedQuote`, `proposedQuote`, `NOW`, `NEXT_WEEK`.

- [ ] **Step 1: Write the ports**

`quote-service.reader.port.ts`:

```ts
export interface QuoteServiceSnapshot {
  serviceId: string;
  providerId: string;
  providerStatus: string;
  serviceStatus: string;
  bookingMode: string;
  locationType: string;
  /** In the requested locale, falling back to the service's source locale. */
  serviceName: string;
  quoteForm: {
    responseHours: number;
    askDeadline: boolean;
    askPhotos: boolean;
    askLocation: boolean;
    intro: string | null;
  } | null;
  /** `provider_member` ids that perform this service. */
  memberIds: string[];
}

export interface QuoteServiceReaderPort {
  /** Null means no such service; a refusable service comes back with its real values. */
  findForQuote(serviceId: string, locale: string): Promise<QuoteServiceSnapshot | null>;
}
```

`provider-member.reader.port.ts`:

```ts
export interface ProviderMemberReaderPort {
  isMember(providerId: string, userId: string): Promise<boolean>;
}
```

`customer-phone.reader.port.ts`:

```ts
export interface CustomerPhoneReaderPort {
  findPhoneNumber(userId: string): Promise<string | null>;
}
```

`platform-settings.reader.port.ts`:

```ts
export interface PlatformSettingsReaderPort {
  /** LIVE: read on every proposal. */
  findQuoteProposalValidityHours(): Promise<number>;
  /** LIVE: the floor a proposal's price must clear. */
  findMinServicePriceMinor(): Promise<number>;
}
```

`slot-overlap.reader.port.ts`:

```ts
export interface SlotOverlapReaderPort {
  /** True when a slot-holding booking of this member overlaps [startsAt, endsAt). */
  overlaps(input: { providerMemberId: string; startsAt: Date; endsAt: Date }): Promise<boolean>;
}
```

`attachment-storage.port.ts` (structurally identical to communication's, so the same adapter fills both):

```ts
export interface StoredAttachmentMetadata {
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly uploadedByUserId: string | null;
  readonly originalName: string | null;
}

export interface AttachmentStoragePort {
  head(storageKey: string): Promise<StoredAttachmentMetadata | null>;
}
```

`start-thread.port.ts`:

```ts
export interface StartThreadPort {
  execute(input: { customerUserId: string; providerId: string }): Promise<{ threadId: string }>;
}
```

`booking-opener.port.ts`:

```ts
export interface OpenBookingFromQuoteInput {
  quoteId: string;
  customerId: string;
  providerId: string;
  serviceId: string;
  providerMemberId: string;
  startsAt: Date;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  serviceName: string;
  address: {
    label: string;
    line: string;
    city: string;
    district: string | null;
    directions: string | null;
    lat: number | null;
    lng: number | null;
  };
  description: string | null;
  acceptedByUserId: string;
}

/**
 * The booking context, from the quote's side. Called INSIDE the acceptance
 * transaction; a calendar refusal must surface as `QuoteSlotTakenError` so the
 * whole transaction rolls back — the adapter at the composition root does that
 * translation.
 */
export interface BookingOpenerPort {
  openFromQuote(input: OpenBookingFromQuoteInput): Promise<{ bookingId: string; payBy: Date }>;
}
```

`raise-notification.port.ts`:

```ts
import type { NotificationType } from "@ntizo/shared";

export type RaiseNotificationInput =
  | { type: NotificationType; audience: "user"; userId: string; payload: Record<string, unknown> }
  | { type: NotificationType; audience: "provider"; providerId: string; payload: Record<string, unknown> };

export interface RaiseNotificationInternalPort {
  execute(input: RaiseNotificationInput): Promise<{ notificationId: string }>;
}

/** A notification that fails to raise never fails the write (BR-Q10). */
export async function raiseQuietly(
  port: RaiseNotificationInternalPort,
  input: RaiseNotificationInput,
  quoteId: string,
): Promise<void> {
  try {
    await port.execute(input);
  } catch (error) {
    console.error(`[quote] notification ${input.type} for ${quoteId} not raised`, error);
  }
}
```

- [ ] **Step 2: Write the fakes**

`.../quote/__tests__/support/fakes.ts`:

```ts
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import { Quote, type QuoteAddress } from "../../domain/aggregates/quote.aggregate";
import type { QuoteRepositoryPort } from "../../app/ports/outbound/quote.repository.port";
import type { NewQuoteAttachment, QuoteAttachmentRepositoryPort } from "../../app/ports/outbound/quote-attachment.repository.port";
import type { QuoteServiceReaderPort, QuoteServiceSnapshot } from "../../app/ports/outbound/quote-service.reader.port";
import type { ProviderMemberReaderPort } from "../../app/ports/outbound/provider-member.reader.port";
import type { CustomerPhoneReaderPort } from "../../app/ports/outbound/customer-phone.reader.port";
import type { PlatformSettingsReaderPort } from "../../app/ports/outbound/platform-settings.reader.port";
import type { SlotOverlapReaderPort } from "../../app/ports/outbound/slot-overlap.reader.port";
import type { AttachmentStoragePort, StoredAttachmentMetadata } from "../../app/ports/outbound/attachment-storage.port";
import type { StartThreadPort } from "../../app/ports/outbound/start-thread.port";
import type { BookingOpenerPort, OpenBookingFromQuoteInput } from "../../app/ports/outbound/booking-opener.port";
import type { RaiseNotificationInput, RaiseNotificationInternalPort } from "../../app/ports/outbound/raise-notification.port";

export const NOW = new Date("2026-09-07T10:00:00Z");
export const IN_48H = new Date(NOW.getTime() + 48 * 3_600_000);
export const NEXT_WEEK = new Date(NOW.getTime() + 7 * 24 * 3_600_000);
export const ADDRESS: QuoteAddress = {
  label: "Casa", line: "Av. Julius Nyerere 1234", city: "Maputo", district: "Bairro Central",
  directions: null, lat: null, lng: null,
};

export class TrackingUnitOfWork implements UnitOfWorkPort {
  public insideTransaction = false;
  public order: string[] = [];
  private pending: Array<() => void> = [];
  stage(commit: () => void): void {
    if (this.insideTransaction) this.pending.push(commit);
    else commit();
  }
  async atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    this.insideTransaction = true;
    try {
      const result = await work();
      for (const commit of this.pending) commit();
      return result;
    } finally {
      this.pending = [];
      this.insideTransaction = false;
    }
  }
}

export class CapturingOutbox implements OutboxPort {
  published: { events: BaseDomainEvent[]; aggregateType: string; insideTransaction: boolean }[] = [];
  constructor(private readonly unitOfWork: TrackingUnitOfWork) {}
  async publish(events: BaseDomainEvent[], aggregateType: string): Promise<void> {
    const record = { events, aggregateType, insideTransaction: this.unitOfWork.insideTransaction };
    this.unitOfWork.stage(() => this.published.push(record));
  }
}

export class FakeRaiser implements RaiseNotificationInternalPort {
  public readonly raised: RaiseNotificationInput[] = [];
  public readonly insideTransactionAtCall: boolean[] = [];
  constructor(private readonly failWith: Error | null = null, private readonly unitOfWork?: TrackingUnitOfWork) {}
  async execute(input: RaiseNotificationInput): Promise<{ notificationId: string }> {
    if (this.unitOfWork) this.insideTransactionAtCall.push(this.unitOfWork.insideTransaction);
    if (this.failWith) throw this.failWith;
    this.raised.push(input);
    return { notificationId: `n-${this.raised.length}` };
  }
}

export function withId(quote: Quote, id: string): Quote {
  return Quote.restore({ ...quote.toProps(), id });
}

export function requestedQuote(over: Partial<Parameters<typeof Quote.request>[0]> = {}): Quote {
  return Quote.request({
    id: "q-1", serviceId: "svc-1", providerId: "prov-1", customerId: "cust-1", threadId: "thr-1",
    locale: "pt-MZ", description: "Dois aparelhos split", neededBy: "2026-09-27", address: ADDRESS,
    at: NOW, respondBy: IN_48H, ...over,
  });
}

export function proposedQuote(over: Partial<Parameters<typeof Quote.request>[0]> = {}): Quote {
  const proposed = requestedQuote(over).propose({
    priceMinor: 9_800, currency: "MZN", startsAt: NEXT_WEEK, durationMinutes: 240, providerMemberId: "mem-1",
    note: "Inclui tubagem", validUntil: new Date(NOW.getTime() + 72 * 3_600_000), createdByUserId: "user-right-1",
    at: NOW, minPriceMinor: 5_000,
  });
  // Give the live proposal an id, as the repository would after a save.
  const props = proposed.toProps();
  return Quote.restore({ ...props, proposals: props.proposals.map((p, i) => ({ ...p, id: p.id ?? `prop-${i + 1}` })) });
}

/**
 * A proposed quote whose live proposal has already lapsed.
 *
 * Built through `restore` with a `validUntil` one second in the past, rather
 * than by relying on the fixture's `NOW` having gone by: a test that only
 * starts asserting on a particular date is worse than one that fails today.
 */
export function lapsedProposedQuote(over: Partial<Parameters<typeof Quote.request>[0]> = {}): Quote {
  const props = proposedQuote(over).toProps();
  return Quote.restore({
    ...props,
    proposals: props.proposals.map((p) =>
      p.supersededAt === null ? { ...p, validUntil: new Date(Date.now() - 1_000) } : p,
    ),
  });
}

export class FakeQuoteRepo implements QuoteRepositoryPort {
  public inserted: Quote[] = [];
  public saveCalls = 0;
  public savedArg: Quote | null = null;
  public currentStatusOverride: Quote["status"] | null = null;
  public insertError: Error | null = null;
  private current: Quote | null;
  constructor(initial: Quote | null, private readonly unitOfWork?: TrackingUnitOfWork) { this.current = initial; }
  get state(): Quote | null { return this.current; }
  async insert(quote: Quote): Promise<Quote> {
    if (this.insertError) throw this.insertError;
    const saved = withId(quote, `q-${this.inserted.length + 1}`);
    this.inserted.push(saved);
    this.unitOfWork?.order.push("insert");
    this.current = saved;
    return saved;
  }
  async findById(id: string): Promise<Quote | null> { return this.current?.id === id ? this.current : null; }
  async save(quote: Quote, expectedStatus: Quote["status"]): Promise<Quote | null> {
    this.saveCalls += 1;
    this.savedArg = quote;
    this.unitOfWork?.order.push("save");
    const actual = this.currentStatusOverride ?? this.current?.status;
    if (actual !== expectedStatus) return null;
    const props = quote.toProps();
    const persisted = Quote.restore({ ...props, proposals: props.proposals.map((p, i) => ({ ...p, id: p.id ?? `prop-${i + 1}` })) });
    const commit = () => { this.current = persisted; };
    if (this.unitOfWork) this.unitOfWork.stage(commit); else commit();
    return persisted;
  }
  async findDueForSweep(): Promise<Quote[]> { return this.current ? [this.current] : []; }
}

export class FakeAttachmentRepo implements QuoteAttachmentRepositoryPort {
  public rows: NewQuoteAttachment[] = [];
  constructor(private readonly unitOfWork?: TrackingUnitOfWork) {}
  async insertMany(rows: NewQuoteAttachment[]): Promise<void> {
    this.unitOfWork?.order.push("attachments");
    this.rows.push(...rows);
  }
  async findVisible(): Promise<null> { return null; }
  async findAny(): Promise<null> { return null; }
}

export function serviceSnapshot(over: Partial<QuoteServiceSnapshot> = {}): QuoteServiceSnapshot {
  return {
    serviceId: "svc-1", providerId: "prov-1", providerStatus: "active", serviceStatus: "published",
    bookingMode: "quote", locationType: "at_customer", serviceName: "Instalação de ar condicionado",
    quoteForm: { responseHours: 48, askDeadline: true, askPhotos: true, askLocation: true, intro: null },
    memberIds: ["mem-1", "mem-2"], ...over,
  };
}

export class FakeServiceReader implements QuoteServiceReaderPort {
  constructor(private readonly snapshot: QuoteServiceSnapshot | null = serviceSnapshot()) {}
  async findForQuote(): Promise<QuoteServiceSnapshot | null> { return this.snapshot; }
}

/** prov-1 has user-right-1 and user-right-2; user-wrong belongs to prov-2. */
export class FakeMemberReader implements ProviderMemberReaderPort {
  public queries: { providerId: string; userId: string }[] = [];
  async isMember(providerId: string, userId: string): Promise<boolean> {
    this.queries.push({ providerId, userId });
    return providerId === "prov-1" && (userId === "user-right-1" || userId === "user-right-2");
  }
}

export class FakePhoneReader implements CustomerPhoneReaderPort {
  constructor(private readonly phones: Record<string, string | null> = { "cust-1": "258841234021" }) {}
  async findPhoneNumber(userId: string): Promise<string | null> { return this.phones[userId] ?? null; }
}

export class FakeSettings implements PlatformSettingsReaderPort {
  constructor(public validityHours = 72, public minPriceMinor = 5_000) {}
  async findQuoteProposalValidityHours(): Promise<number> { return this.validityHours; }
  async findMinServicePriceMinor(): Promise<number> { return this.minPriceMinor; }
}

export class FakeOverlap implements SlotOverlapReaderPort {
  public calls: { providerMemberId: string; startsAt: Date; endsAt: Date }[] = [];
  constructor(private readonly answer = false) {}
  async overlaps(input: { providerMemberId: string; startsAt: Date; endsAt: Date }): Promise<boolean> {
    this.calls.push(input);
    return this.answer;
  }
}

export class FakeStorage implements AttachmentStoragePort {
  constructor(private readonly objects: Record<string, StoredAttachmentMetadata> = {}) {}
  async head(storageKey: string): Promise<StoredAttachmentMetadata | null> { return this.objects[storageKey] ?? null; }
}

export function storedPhoto(uploadedByUserId: string): StoredAttachmentMetadata {
  return { contentType: "image/jpeg", sizeBytes: 120_000, uploadedByUserId, originalName: "parede.jpg" };
}

export class FakeStartThread implements StartThreadPort {
  public calls: { customerUserId: string; providerId: string }[] = [];
  async execute(input: { customerUserId: string; providerId: string }): Promise<{ threadId: string }> {
    this.calls.push(input);
    return { threadId: "thr-1" };
  }
}

export class FakeBookingOpener implements BookingOpenerPort {
  public calls: OpenBookingFromQuoteInput[] = [];
  constructor(private readonly failWith: Error | null = null, private readonly unitOfWork?: TrackingUnitOfWork) {}
  async openFromQuote(input: OpenBookingFromQuoteInput): Promise<{ bookingId: string; payBy: Date }> {
    this.calls.push(input);
    this.unitOfWork?.order.push("openBooking");
    if (this.failWith) throw this.failWith;
    return { bookingId: "bk-1", payBy: new Date(NOW.getTime() + 15 * 60_000) };
  }
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `cd packages/backend && bun run typecheck`
Expected: clean.

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/quote
git commit -m "feat(quote): the outbound ports and the test fakes"
```

---

### Task 6: The Drizzle readers behind the ports

**Files:**
- Create: `.../quote/infrastructure/repositories/drizzle/quote-service.reader.ts`
- Create: `.../quote/infrastructure/repositories/drizzle/provider-member.reader.ts`
- Create: `.../quote/infrastructure/repositories/drizzle/customer-phone.reader.ts`
- Create: `.../quote/infrastructure/repositories/drizzle/platform-settings.reader.ts`
- Create: `.../quote/infrastructure/repositories/drizzle/slot-overlap.reader.ts`
- Test: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/quote-readers.test.ts`

**Interfaces:**
- Consumes: the ports of Task 5.
- Produces: `DrizzleQuoteServiceReader`, `DrizzleQuoteProviderMemberReader`, `DrizzleQuoteCustomerPhoneReader`, `DrizzleQuotePlatformSettingsReader`, `DrizzleSlotOverlapReader`.

- [ ] **Step 1: Write the readers**

`quote-service.reader.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  service,
  serviceMember,
  serviceQuoteForm,
  serviceTranslation,
} from "../../../../../shared/infrastructure/database/catalog/schemas";
import { provider } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { QuoteServiceReaderPort, QuoteServiceSnapshot } from "../../../app/ports/outbound/quote-service.reader.port";

const requested = alias(serviceTranslation, "quote_svc_tr_requested");
const source = alias(serviceTranslation, "quote_svc_tr_source");

export class DrizzleQuoteServiceReader implements QuoteServiceReaderPort {
  async findForQuote(serviceId: string, locale: string): Promise<QuoteServiceSnapshot | null> {
    const db = getDb();
    const [row] = await db
      .select({
        serviceId: service.id,
        providerId: service.providerId,
        providerStatus: provider.status,
        serviceStatus: service.status,
        bookingMode: service.bookingMode,
        locationType: service.locationType,
        requestedName: requested.name,
        sourceName: source.name,
        responseHours: serviceQuoteForm.responseHours,
        askDeadline: serviceQuoteForm.askDeadline,
        askPhotos: serviceQuoteForm.askPhotos,
        askLocation: serviceQuoteForm.askLocation,
        intro: serviceQuoteForm.intro,
      })
      .from(service)
      .innerJoin(provider, eq(provider.id, service.providerId))
      .leftJoin(requested, and(eq(requested.serviceId, service.id), eq(requested.locale, locale)))
      .leftJoin(source, and(eq(source.serviceId, service.id), eq(source.locale, service.sourceLocale)))
      .leftJoin(serviceQuoteForm, eq(serviceQuoteForm.serviceId, service.id))
      .where(eq(service.id, serviceId))
      .limit(1);
    if (!row) return null;

    const members = await db
      .select({ memberId: serviceMember.memberId })
      .from(serviceMember)
      .where(eq(serviceMember.serviceId, serviceId));

    return {
      serviceId: row.serviceId,
      providerId: row.providerId,
      providerStatus: row.providerStatus,
      serviceStatus: row.serviceStatus,
      bookingMode: row.bookingMode,
      locationType: row.locationType,
      serviceName: row.requestedName ?? row.sourceName ?? "",
      quoteForm:
        row.responseHours === null
          ? null
          : {
              responseHours: row.responseHours,
              askDeadline: row.askDeadline ?? true,
              askPhotos: row.askPhotos ?? true,
              askLocation: row.askLocation ?? true,
              intro: row.intro ?? null,
            },
      memberIds: members.map((m) => m.memberId),
    };
  }
}
```

`provider-member.reader.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { ProviderMemberReaderPort } from "../../../app/ports/outbound/provider-member.reader.port";

export class DrizzleQuoteProviderMemberReader implements ProviderMemberReaderPort {
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

`customer-phone.reader.ts`:

```ts
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { profile } from "../../../../../shared/infrastructure/database/user/schemas";
import type { CustomerPhoneReaderPort } from "../../../app/ports/outbound/customer-phone.reader.port";

export class DrizzleQuoteCustomerPhoneReader implements CustomerPhoneReaderPort {
  async findPhoneNumber(userId: string): Promise<string | null> {
    const [row] = await getDb()
      .select({ phoneNumber: profile.phoneNumber })
      .from(profile)
      .where(eq(profile.userId, userId))
      .limit(1);
    return row?.phoneNumber ?? null;
  }
}
```

`platform-settings.reader.ts`:

```ts
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { platformSettings } from "../../../../../shared/infrastructure/database/platform/schemas";
import type { PlatformSettingsReaderPort } from "../../../app/ports/outbound/platform-settings.reader.port";

export class DrizzleQuotePlatformSettingsReader implements PlatformSettingsReaderPort {
  private async global() {
    const [row] = await getDb()
      .select({
        validity: platformSettings.quoteProposalValidityHours,
        minPrice: platformSettings.minServicePriceMinor,
      })
      .from(platformSettings)
      .where(eq(platformSettings.id, "global"))
      .limit(1);
    if (!row) throw new Error("platform_settings has no 'global' row — cannot read quote settings");
    return row;
  }
  async findQuoteProposalValidityHours(): Promise<number> { return (await this.global()).validity; }
  async findMinServicePriceMinor(): Promise<number> { return (await this.global()).minPrice; }
}
```

`slot-overlap.reader.ts`:

```ts
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { booking } from "../../../../../shared/infrastructure/database/booking/schemas";
import { SLOT_HOLDING_STATUSES } from "../../../../../shared/infrastructure/database/booking/enums";
import type { SlotOverlapReaderPort } from "../../../app/ports/outbound/slot-overlap.reader.port";

/** The same predicate `lowestFreeSeat` in the booking repository uses, answered as a boolean. */
export class DrizzleSlotOverlapReader implements SlotOverlapReaderPort {
  async overlaps(input: { providerMemberId: string; startsAt: Date; endsAt: Date }): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: booking.id })
      .from(booking)
      .where(
        and(
          eq(booking.providerMemberId, input.providerMemberId),
          inArray(booking.status, [...SLOT_HOLDING_STATUSES]),
          lt(booking.startsAt, input.endsAt),
          gt(booking.endsAt, input.startsAt),
        ),
      )
      .limit(1);
    return row !== undefined;
  }
}
```

- [ ] **Step 2: Write the DB test**

`.../database/__tests__/quote-readers.test.ts` — same fixtures as `quote-constraints.test.ts` (user, provider, member, category, quote-mode service), plus a `serviceQuoteForm` row `{ serviceId, responseHours: 24, askLocation: false }`, a `serviceTranslation` row `{ serviceId, locale: "pt-MZ", name: "Instalação de AC" }`, a `serviceMember` row `{ serviceId, memberId }`, and one `CONFIRMED` booking for `memberId` from `T` to `T+2h` (any `serviceOptionId: null, quoteId: <a closed quote>` pair, as the constraints test inserts). Then:

```ts
const run = <T>(work: () => Promise<T>) => __runWithTransactionContextForTests(db, work);

test("the service reader returns the form, the name in the locale with source fallback, and the performers", async () => {
  const snap = await run(() => new DrizzleQuoteServiceReader().findForQuote(serviceId, "pt-MZ"));
  expect(snap).toMatchObject({ bookingMode: "quote", serviceName: "Instalação de AC", memberIds: [memberId] });
  expect(snap?.quoteForm).toMatchObject({ responseHours: 24, askLocation: false });
  const fallback = await run(() => new DrizzleQuoteServiceReader().findForQuote(serviceId, "de-DE"));
  expect(fallback?.serviceName).toBe("Instalação de AC");
  expect(await run(() => new DrizzleQuoteServiceReader().findForQuote(crypto.randomUUID(), "pt-MZ"))).toBeNull();
});

test("the overlap reader sees the confirmed booking and nothing beside it", async () => {
  const reader = new DrizzleSlotOverlapReader();
  expect(await run(() => reader.overlaps({ providerMemberId: memberId, startsAt: new Date(T.getTime() + 3_600_000), endsAt: new Date(T.getTime() + 3 * 3_600_000) }))).toBe(true);
  expect(await run(() => reader.overlaps({ providerMemberId: memberId, startsAt: new Date(T.getTime() + 2 * 3_600_000), endsAt: new Date(T.getTime() + 3 * 3_600_000) }))).toBe(false);
});

test("the settings reader reads the live global row", async () => {
  const s = new DrizzleQuotePlatformSettingsReader();
  expect(await run(() => s.findQuoteProposalValidityHours())).toBeGreaterThanOrEqual(1);
  expect(await run(() => s.findMinServicePriceMinor())).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 3: Run and commit**

Run: `cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/quote-readers.test.ts`
Expected: PASS.

```bash
git add packages/backend/src/modules/ntizo
git commit -m "feat(quote): the Drizzle readers behind the quote context's ports"
```

---
### Task 7: `RequestQuoteCommand` and attachment resolution

**Files:**
- Create: `.../quote/app/use-cases/resolve-quote-attachments.ts`
- Create: `.../quote/app/use-cases/request-quote.command.ts`
- Test: `.../quote/__tests__/request-quote.command.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–6.
- Produces: `resolveQuoteAttachments(storage, uploaderUserId, descriptors)` → `Promise<ResolvedAttachment[]>` where `ResolvedAttachment = { storageKey, fileName, contentType, sizeBytes }`; `RequestQuoteCommand` with `RequestQuoteInput { customerId, serviceId, description, neededBy?, address?, attachments?, locale }` → `Promise<{ quoteId: string; respondBy: string }>`.

- [ ] **Step 1: Write the attachment resolver**

`.../quote/app/use-cases/resolve-quote-attachments.ts`:

```ts
import { ACCEPTED_ATTACHMENT_TYPES, MAX_ATTACHMENTS, type AcceptedAttachmentType } from "@ntizo/shared/attachments";
import { QuoteAttachmentNotAvailableError, QuoteTooManyAttachmentsError } from "../../domain/exceptions";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";

export interface AttachmentDescriptor {
  storageKey: string;
}

export interface ResolvedAttachment {
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

function isAcceptedAttachmentType(contentType: string): contentType is AcceptedAttachmentType {
  return (ACCEPTED_ATTACHMENT_TYPES as readonly string[]).includes(contentType);
}

/**
 * The same four checks messages make, against the same bucket and the same
 * key convention: the caller may only attach what they themselves uploaded,
 * the object must exist, its type must be one the server sniffed and accepted,
 * and it must carry the original name the download route serves it under.
 *
 * Every failure is the identical error, so a caller probing keys learns
 * nothing about which of the four it tripped.
 */
export async function resolveQuoteAttachments(
  storage: AttachmentStoragePort,
  uploaderUserId: string,
  descriptors: AttachmentDescriptor[],
): Promise<ResolvedAttachment[]> {
  if (descriptors.length > MAX_ATTACHMENTS) {
    throw new QuoteTooManyAttachmentsError(descriptors.length, MAX_ATTACHMENTS);
  }
  const ownPrefix = `attachment/${uploaderUserId}/`;
  return await Promise.all(
    descriptors.map(async (descriptor): Promise<ResolvedAttachment> => {
      if (!descriptor.storageKey.startsWith(ownPrefix)) throw new QuoteAttachmentNotAvailableError();
      const stored = await storage.head(descriptor.storageKey);
      if (!stored || stored.uploadedByUserId !== uploaderUserId) throw new QuoteAttachmentNotAvailableError();
      if (!isAcceptedAttachmentType(stored.contentType)) throw new QuoteAttachmentNotAvailableError();
      if (stored.originalName === null) throw new QuoteAttachmentNotAvailableError();
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

- [ ] **Step 2: Write the failing test**

`.../quote/__tests__/request-quote.command.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { RequestQuoteCommand, type RequestQuoteInput } from "../app/use-cases/request-quote.command";
import {
  QuoteAddressRequiredError,
  QuoteAttachmentNotAvailableError,
  QuoteContainsContactError,
  QuoteServiceNotQuotableError,
} from "../domain/exceptions";
import {
  ADDRESS,
  CapturingOutbox,
  FakeAttachmentRepo,
  FakeMemberReader,
  FakeQuoteRepo,
  FakeRaiser,
  FakeServiceReader,
  FakeStartThread,
  FakeStorage,
  TrackingUnitOfWork,
  serviceSnapshot,
  storedPhoto,
} from "./support/fakes";

function setup(opts: { snapshot?: ReturnType<typeof serviceSnapshot> | null; storage?: FakeStorage; raiser?: FakeRaiser } = {}) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeQuoteRepo(null, unitOfWork);
  const attachments = new FakeAttachmentRepo(unitOfWork);
  const services = new FakeServiceReader(opts.snapshot === undefined ? serviceSnapshot() : opts.snapshot);
  const storage = opts.storage ?? new FakeStorage({ "attachment/cust-1/1-a.jpg": storedPhoto("cust-1") });
  const startThread = new FakeStartThread();
  const raiser = opts.raiser ?? new FakeRaiser(null, unitOfWork);
  const command = new RequestQuoteCommand(repo, attachments, services, startThread, storage, unitOfWork, outbox, raiser);
  return { command, repo, attachments, services, storage, startThread, raiser, outbox, unitOfWork };
}

const INPUT: RequestQuoteInput = {
  customerId: "cust-1",
  serviceId: "svc-1",
  description: "Dois aparelhos split de 12 000 BTU no 3.º andar",
  neededBy: "2026-09-27",
  address: ADDRESS,
  attachments: [{ storageKey: "attachment/cust-1/1-a.jpg" }],
  locale: "pt-MZ",
};

describe("RequestQuoteCommand", () => {
  it("opens the thread, writes the quote and its files in one transaction, and tells the provider afterwards", async () => {
    const { command, repo, attachments, startThread, raiser, outbox, unitOfWork } = setup();

    const result = await command.execute(INPUT);

    expect(result.quoteId).toBe("q-1");
    expect(startThread.calls).toEqual([{ customerUserId: "cust-1", providerId: "prov-1" }]);
    expect(repo.inserted).toHaveLength(1);
    expect(repo.inserted[0]?.status).toBe("REQUESTED");
    expect(repo.inserted[0]?.threadId).toBe("thr-1");
    expect(attachments.rows).toEqual([
      { quoteId: "q-1", proposalId: null, step: "request", storageKey: "attachment/cust-1/1-a.jpg", fileName: "parede.jpg", contentType: "image/jpeg", sizeBytes: 120_000 },
    ]);
    expect(unitOfWork.order).toEqual(["insert", "attachments"]);
    expect(outbox.published[0]?.aggregateType).toBe("quote");
    expect(outbox.published[0]?.events[0]?.eventName).toBe("quote.requested");
    expect(raiser.raised[0]).toMatchObject({ type: NotificationType.ProviderQuoteRequested, audience: "provider", providerId: "prov-1" });
    expect(raiser.insideTransactionAtCall).toEqual([false]);
  });

  it("stamps the response window from the service's own promise", async () => {
    const { command, repo } = setup({ snapshot: serviceSnapshot({ quoteForm: { responseHours: 24, askDeadline: true, askPhotos: true, askLocation: true, intro: null } }) });
    await command.execute(INPUT);
    const expiresAt = repo.inserted[0]!.expiresAt!.getTime();
    expect(expiresAt - repo.inserted[0]!.requestedAt.getTime()).toBe(24 * 3_600_000);
  });

  it("refuses a service that is missing, unpublished, priced, or whose provider is inactive", async () => {
    await expect(setup({ snapshot: null }).command.execute(INPUT)).rejects.toThrow(QuoteServiceNotQuotableError);
    await expect(setup({ snapshot: serviceSnapshot({ serviceStatus: "draft" }) }).command.execute(INPUT)).rejects.toThrow(QuoteServiceNotQuotableError);
    await expect(setup({ snapshot: serviceSnapshot({ bookingMode: "priced" }) }).command.execute(INPUT)).rejects.toThrow(QuoteServiceNotQuotableError);
    await expect(setup({ snapshot: serviceSnapshot({ providerStatus: "suspended" }) }).command.execute(INPUT)).rejects.toThrow(QuoteServiceNotQuotableError);
  });

  it("requires an address when the form asks for one or the work happens at the customer's", async () => {
    const atCustomer = setup({ snapshot: serviceSnapshot({ locationType: "at_customer", quoteForm: { responseHours: 48, askDeadline: true, askPhotos: true, askLocation: false, intro: null } }) });
    await expect(atCustomer.command.execute({ ...INPUT, address: null })).rejects.toThrow(QuoteAddressRequiredError);

    const remote = setup({ snapshot: serviceSnapshot({ locationType: "remote", quoteForm: { responseHours: 48, askDeadline: true, askPhotos: true, askLocation: false, intro: null } }) });
    const result = await remote.command.execute({ ...INPUT, address: null });
    expect(result.quoteId).toBe("q-1");
    expect(remote.repo.inserted[0]?.hasCompleteAddress()).toBe(false);
  });

  it("refuses a description carrying a phone number, and a file the caller did not upload", async () => {
    await expect(setup().command.execute({ ...INPUT, description: "Liga-me para o 84 123 4567" })).rejects.toThrow(QuoteContainsContactError);
    const foreign = setup({ storage: new FakeStorage({ "attachment/other-user/1-a.jpg": storedPhoto("other-user") }) });
    await expect(foreign.command.execute({ ...INPUT, attachments: [{ storageKey: "attachment/other-user/1-a.jpg" }] })).rejects.toThrow(QuoteAttachmentNotAvailableError);
  });

  it("a failing notification leaves the quote written", async () => {
    const { command, repo } = setup({ raiser: new FakeRaiser(new Error("resend down")) });
    await command.execute(INPUT);
    expect(repo.inserted).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/quote/__tests__/request-quote.command.test.ts`
Expected: FAIL, cannot resolve `../app/use-cases/request-quote.command`.

- [ ] **Step 4: Write the command**

`.../quote/app/use-cases/request-quote.command.ts`:

```ts
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import { hasContact } from "@ntizo/shared/text";
import { Quote, type QuoteAddress } from "../../domain/aggregates/quote.aggregate";
import { QuoteRequested } from "../../domain/events";
import { QuoteAddressRequiredError, QuoteContainsContactError, QuoteServiceNotQuotableError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteAttachmentRepositoryPort } from "../ports/outbound/quote-attachment.repository.port";
import type { QuoteServiceReaderPort } from "../ports/outbound/quote-service.reader.port";
import type { StartThreadPort } from "../ports/outbound/start-thread.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";
import { raiseQuietly, type RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";
import { resolveQuoteAttachments, type AttachmentDescriptor } from "./resolve-quote-attachments";

export interface RequestQuoteInput {
  /** From `requireUser` at the GraphQL layer, never from the client. */
  customerId: string;
  serviceId: string;
  description: string;
  /** `YYYY-MM-DD`. Advisory: the provider proposes whatever date they can. */
  neededBy?: string | null;
  address?: QuoteAddress | null;
  attachments?: AttachmentDescriptor[];
  /** The locale the customer was reading the page in; the service name is snapshotted in it later. */
  locale: string;
}

/** The provider's own promise when a service has no form row of its own. */
const DEFAULT_RESPONSE_HOURS = 48;

/**
 * The customer describes a job and one provider is asked to price it.
 *
 * **The thread is opened before the transaction, not inside it.** The
 * communication context's `startThread` is idempotent — it resolves as an
 * upsert on `thread_customer_provider_uq` — so a request that then fails to
 * write leaves at most an empty conversation, which is exactly what pressing
 * "Enviar mensagem" would have left. Holding it inside would mean this
 * transaction and communication's own writing to the same table through two
 * connections.
 *
 * **The address rule is the service's, not the form's alone.** A job that
 * happens at the customer's address needs one whatever the provider ticked,
 * because the booking that may follow cannot be created without it; a remote
 * or at-provider service is asked for one only when the form says so, and the
 * acceptance asks for it later if it is still missing.
 */
export class RequestQuoteCommand {
  constructor(
    private readonly repo: QuoteRepositoryPort,
    private readonly attachments: QuoteAttachmentRepositoryPort,
    private readonly services: QuoteServiceReaderPort,
    private readonly startThread: StartThreadPort,
    private readonly storage: AttachmentStoragePort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: RequestQuoteInput): Promise<{ quoteId: string; respondBy: string }> {
    const at = new Date();

    const description = input.description.trim();
    if (hasContact(description)) throw new QuoteContainsContactError();

    const service = await this.services.findForQuote(input.serviceId, input.locale);
    if (!service) throw new QuoteServiceNotQuotableError("not_found");
    if (service.serviceStatus !== "published") throw new QuoteServiceNotQuotableError("not_published");
    if (service.bookingMode !== "quote") throw new QuoteServiceNotQuotableError("not_quote_mode");
    if (service.providerStatus !== "active") throw new QuoteServiceNotQuotableError("provider_not_active");

    const addressIsRequired =
      (service.quoteForm?.askLocation ?? true) ||
      service.locationType === "at_customer" ||
      service.locationType === "flexible";
    const address = input.address ?? null;
    if (addressIsRequired && address === null) throw new QuoteAddressRequiredError();

    const resolved = await resolveQuoteAttachments(this.storage, input.customerId, input.attachments ?? []);

    const { threadId } = await this.startThread.execute({
      customerUserId: input.customerId,
      providerId: service.providerId,
    });

    const responseHours = service.quoteForm?.responseHours ?? DEFAULT_RESPONSE_HOURS;
    const respondBy = new Date(at.getTime() + responseHours * 3_600_000);

    const quote = Quote.request({
      serviceId: service.serviceId,
      providerId: service.providerId,
      customerId: input.customerId,
      threadId,
      locale: input.locale,
      description,
      neededBy: input.neededBy ?? null,
      address,
      at,
      respondBy,
    });

    const saved = await this.unitOfWork.atomicExecute(async (): Promise<Quote> => {
      const inserted = await this.repo.insert(quote);
      const quoteId = inserted.id as string;

      await this.attachments.insertMany(
        resolved.map((file) => ({ quoteId, proposalId: null, step: "request" as const, ...file })),
      );

      await this.outboxPort.publish(
        [
          new QuoteRequested({
            quoteId,
            customerId: inserted.customerId,
            providerId: inserted.providerId,
            serviceId: inserted.serviceId,
            respondBy,
          }),
        ],
        "quote",
      );

      return inserted;
    });

    const quoteId = saved.id as string;

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.ProviderQuoteRequested,
        audience: "provider",
        providerId: saved.providerId,
        payload: {
          quoteId,
          serviceName: service.serviceName,
          respondBy: respondBy.toISOString(),
          neededBy: saved.neededBy,
        },
      },
      quoteId,
    );

    return { quoteId, respondBy: respondBy.toISOString() };
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/quote/__tests__/request-quote.command.test.ts`
Expected: PASS (6 cases).

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/quote
git commit -m "feat(quote): a customer can ask one provider for a price"
```

---

### Task 8: `ProposeQuoteCommand`

**Files:**
- Create: `.../quote/app/use-cases/propose-quote.command.ts`
- Test: `.../quote/__tests__/propose-quote.command.test.ts`

**Interfaces:**
- Produces: `ProposeQuoteCommand`, `ProposeQuoteInput { quoteId, requesterUserId, priceMinor, startsAt, durationMinutes, providerMemberId, note?, attachments? }` → `Promise<{ quoteId: string; validUntil: string } | null>` (null when the compare-and-swap lost).

- [ ] **Step 1: Write the failing test**

`.../quote/__tests__/propose-quote.command.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { ProposeQuoteCommand, type ProposeQuoteInput } from "../app/use-cases/propose-quote.command";
import {
  NotProviderMemberError,
  QuoteContainsContactError,
  QuoteMemberCannotPerformError,
  QuotePriceBelowMinimumError,
  QuoteSlotOverlapError,
} from "../domain/exceptions";
import {
  CapturingOutbox,
  FakeAttachmentRepo,
  FakeMemberReader,
  FakeOverlap,
  FakeQuoteRepo,
  FakeRaiser,
  FakeServiceReader,
  FakeSettings,
  FakeStorage,
  NEXT_WEEK,
  TrackingUnitOfWork,
  proposedQuote,
  requestedQuote,
  serviceSnapshot,
  storedPhoto,
  withId,
} from "./support/fakes";

function setup(initial = withId(requestedQuote(), "q-1"), opts: { overlap?: FakeOverlap; settings?: FakeSettings; snapshot?: ReturnType<typeof serviceSnapshot> } = {}) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeQuoteRepo(initial, unitOfWork);
  const attachments = new FakeAttachmentRepo(unitOfWork);
  const members = new FakeMemberReader();
  const services = new FakeServiceReader(opts.snapshot ?? serviceSnapshot());
  const overlap = opts.overlap ?? new FakeOverlap(false);
  const settings = opts.settings ?? new FakeSettings();
  const storage = new FakeStorage({ "attachment/user-right-1/1-o.pdf": { contentType: "application/pdf", sizeBytes: 84_000, uploadedByUserId: "user-right-1", originalName: "orcamento.pdf" } });
  const raiser = new FakeRaiser(null, unitOfWork);
  const command = new ProposeQuoteCommand(repo, attachments, members, services, overlap, settings, storage, unitOfWork, outbox, raiser);
  return { command, repo, attachments, members, overlap, raiser, outbox, unitOfWork };
}

const INPUT: ProposeQuoteInput = {
  quoteId: "q-1",
  requesterUserId: "user-right-1",
  priceMinor: 9_800,
  startsAt: NEXT_WEEK,
  durationMinutes: 240,
  providerMemberId: "mem-1",
  note: "Inclui tubagem até 3 m por aparelho",
  attachments: [{ storageKey: "attachment/user-right-1/1-o.pdf" }],
};

describe("ProposeQuoteCommand", () => {
  it("moves the quote to PROPOSED, writes the proposal's files, and tells the customer", async () => {
    const { command, repo, attachments, raiser, outbox, unitOfWork } = setup();

    const result = await command.execute(INPUT);

    expect(result?.quoteId).toBe("q-1");
    expect(repo.state?.status).toBe("PROPOSED");
    expect(repo.state?.liveProposal).toMatchObject({ priceMinor: 9_800, providerMemberId: "mem-1", durationMinutes: 240 });
    expect(attachments.rows[0]).toMatchObject({ quoteId: "q-1", step: "proposal", proposalId: "prop-1", fileName: "orcamento.pdf" });
    expect(unitOfWork.order).toEqual(["save", "attachments"]);
    expect(outbox.published[0]?.events[0]?.eventName).toBe("quote.proposed");
    expect((outbox.published[0]?.events[0]?.payload as { revision: boolean }).revision).toBe(false);
    expect(raiser.raised[0]).toMatchObject({ type: NotificationType.QuoteReceived, audience: "user", userId: "cust-1" });
  });

  it("a revision supersedes the previous proposal and says so in the event", async () => {
    const { command, repo, outbox } = setup(withId(proposedQuote(), "q-1"));
    await command.execute({ ...INPUT, priceMinor: 8_900 });
    expect(repo.state?.proposals).toHaveLength(2);
    expect(repo.state?.proposals[0]?.supersededCause).toBe("revised");
    expect((outbox.published[0]?.events[0]?.payload as { revision: boolean }).revision).toBe(true);
  });

  it("stamps the validity from the platform setting, capped at the proposed start", async () => {
    const { command, repo } = setup(withId(requestedQuote(), "q-1"), { settings: new FakeSettings(72) });
    await command.execute(INPUT);
    const validUntil = repo.state!.liveProposal!.validUntil.getTime();
    expect(validUntil).toBeLessThanOrEqual(NEXT_WEEK.getTime());
    expect(validUntil - Date.now()).toBeLessThanOrEqual(72 * 3_600_000 + 5_000);

    const soon = new Date(Date.now() + 3_600_000);
    const capped = setup(withId(requestedQuote(), "q-1"), { settings: new FakeSettings(72) });
    await capped.command.execute({ ...INPUT, startsAt: soon, durationMinutes: 30 });
    expect(capped.repo.state!.liveProposal!.validUntil).toEqual(soon);
  });

  it("refuses a caller from another workspace, and never writes for one", async () => {
    const { command, repo } = setup();
    await expect(command.execute({ ...INPUT, requesterUserId: "user-wrong" })).rejects.toThrow(NotProviderMemberError);
    expect(repo.saveCalls).toBe(0);
  });

  it("refuses a member who does not perform the service, a price under the floor, a note with contact details, and a time already sold", async () => {
    await expect(setup().command.execute({ ...INPUT, providerMemberId: "mem-9" })).rejects.toThrow(QuoteMemberCannotPerformError);
    await expect(setup().command.execute({ ...INPUT, priceMinor: 4_999 })).rejects.toThrow(QuotePriceBelowMinimumError);
    await expect(setup().command.execute({ ...INPUT, note: "Whatsapp 84 123 4567" })).rejects.toThrow(QuoteContainsContactError);
    const busy = setup(withId(requestedQuote(), "q-1"), { overlap: new FakeOverlap(true) });
    await expect(busy.command.execute(INPUT)).rejects.toThrow(QuoteSlotOverlapError);
    expect(busy.overlap.calls[0]).toMatchObject({ providerMemberId: "mem-1", startsAt: NEXT_WEEK });
  });

  it("returns null and announces nothing when the row moved on under it", async () => {
    const { command, repo, raiser } = setup();
    repo.currentStatusOverride = "DECLINED";
    expect(await command.execute(INPUT)).toBeNull();
    expect(raiser.raised).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/quote/__tests__/propose-quote.command.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the command**

`.../quote/app/use-cases/propose-quote.command.ts`:

```ts
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import { hasContact } from "@ntizo/shared/text";
import type { Quote } from "../../domain/aggregates/quote.aggregate";
import { QuoteProposed } from "../../domain/events";
import {
  NotProviderMemberError,
  QuoteContainsContactError,
  QuoteMemberCannotPerformError,
  QuoteNotFoundError,
  QuoteServiceNotQuotableError,
  QuoteSlotOverlapError,
} from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteAttachmentRepositoryPort } from "../ports/outbound/quote-attachment.repository.port";
import type { ProviderMemberReaderPort } from "../ports/outbound/provider-member.reader.port";
import type { QuoteServiceReaderPort } from "../ports/outbound/quote-service.reader.port";
import type { SlotOverlapReaderPort } from "../ports/outbound/slot-overlap.reader.port";
import type { PlatformSettingsReaderPort } from "../ports/outbound/platform-settings.reader.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";
import { raiseQuietly, type RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";
import { resolveQuoteAttachments, type AttachmentDescriptor } from "./resolve-quote-attachments";

export interface ProposeQuoteInput {
  quoteId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
  priceMinor: number;
  startsAt: Date;
  durationMinutes: number;
  providerMemberId: string;
  note?: string | null;
  attachments?: AttachmentDescriptor[];
}

/**
 * A validity that outlived the time it offers would be a countdown on a slot
 * that has already passed — the same argument `cappedToSlotStart` makes for
 * the booking's three clocks.
 */
function cappedToStart(validUntil: Date, startsAt: Date): Date {
  return validUntil.getTime() > startsAt.getTime() ? startsAt : validUntil;
}

/**
 * The provider answers with a price, a date, a duration and a member — a
 * complete agreement, so the booking it may become is indistinguishable from
 * a priced one.
 *
 * **The proposal does not hold the slot.** Holding it would block the member's
 * calendar for the whole validity, on a table this context does not own. What
 * it does instead is refuse a start that already overlaps a slot-holding
 * booking, so a provider cannot propose a time they have sold; the exclusion
 * constraint arbitrates for real at acceptance, and `MarkProposalStaleInternalCommand`
 * handles the loser.
 *
 * **Authorisation is checked before anything is written**, and the caller's
 * membership is the only thing that decides it: `providerMemberId` names who
 * does the work, which may be a colleague.
 */
export class ProposeQuoteCommand {
  constructor(
    private readonly repo: QuoteRepositoryPort,
    private readonly attachments: QuoteAttachmentRepositoryPort,
    private readonly members: ProviderMemberReaderPort,
    private readonly services: QuoteServiceReaderPort,
    private readonly overlap: SlotOverlapReaderPort,
    private readonly settings: PlatformSettingsReaderPort,
    private readonly storage: AttachmentStoragePort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: ProposeQuoteInput): Promise<{ quoteId: string; validUntil: string } | null> {
    const at = new Date();

    const note = (input.note ?? "").trim();
    if (note.length > 0 && hasContact(note)) throw new QuoteContainsContactError();

    const quote = await this.repo.findById(input.quoteId);
    if (!quote) throw new QuoteNotFoundError(input.quoteId);

    if (!(await this.members.isMember(quote.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError();
    }

    const service = await this.services.findForQuote(quote.serviceId, quote.locale);
    if (!service) throw new QuoteServiceNotQuotableError("not_found");
    if (!service.memberIds.includes(input.providerMemberId)) {
      throw new QuoteMemberCannotPerformError(input.providerMemberId);
    }

    const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
    if (await this.overlap.overlaps({ providerMemberId: input.providerMemberId, startsAt: input.startsAt, endsAt })) {
      throw new QuoteSlotOverlapError();
    }

    // LIVE on both: an administrator's change reaches the very next proposal.
    const [validityHours, minPriceMinor] = await Promise.all([
      this.settings.findQuoteProposalValidityHours(),
      this.settings.findMinServicePriceMinor(),
    ]);
    const validUntil = cappedToStart(new Date(at.getTime() + validityHours * 3_600_000), input.startsAt);

    const resolved = await resolveQuoteAttachments(this.storage, input.requesterUserId, input.attachments ?? []);

    const wasProposed = quote.liveProposal !== null;
    const moved = quote.propose({
      priceMinor: input.priceMinor,
      currency: "MZN",
      startsAt: input.startsAt,
      durationMinutes: input.durationMinutes,
      providerMemberId: input.providerMemberId,
      note,
      validUntil,
      createdByUserId: input.requesterUserId,
      at,
      minPriceMinor,
    });

    const saved = await this.unitOfWork.atomicExecute(async (): Promise<Quote | null> => {
      const persisted = await this.repo.save(moved, quote.status);
      if (!persisted) return null;

      const proposalId = persisted.liveProposal?.id as string;
      await this.attachments.insertMany(
        resolved.map((file) => ({ quoteId: input.quoteId, proposalId, step: "proposal" as const, ...file })),
      );

      await this.outboxPort.publish(
        [
          new QuoteProposed({
            quoteId: input.quoteId,
            customerId: persisted.customerId,
            providerId: persisted.providerId,
            serviceId: persisted.serviceId,
            proposalId,
            priceMinor: input.priceMinor,
            currency: "MZN",
            startsAt: input.startsAt,
            validUntil,
            revision: wasProposed,
          }),
        ],
        "quote",
      );

      return persisted;
    });

    if (!saved) return null;

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.QuoteReceived,
        audience: "user",
        userId: saved.customerId,
        payload: {
          quoteId: input.quoteId,
          serviceName: service.serviceName,
          priceMinor: input.priceMinor,
          currency: "MZN",
          startsAt: input.startsAt.toISOString(),
          validUntil: validUntil.toISOString(),
          revision: wasProposed,
        },
      },
      input.quoteId,
    );

    return { quoteId: input.quoteId, validUntil: validUntil.toISOString() };
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/quote/__tests__/propose-quote.command.test.ts`
Expected: PASS (6 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/quote
git commit -m "feat(quote): the provider answers with a price, a date and a duration"
```

---

### Task 9: Decline, reject and withdraw

**Files:**
- Create: `.../quote/app/use-cases/close-quote.ts` (the shared body)
- Create: `.../quote/app/use-cases/decline-quote.command.ts`
- Create: `.../quote/app/use-cases/reject-quote.command.ts`
- Create: `.../quote/app/use-cases/withdraw-quote.command.ts`
- Test: `.../quote/__tests__/close-quote.command.test.ts`

**Interfaces:**
- Produces: `DeclineQuoteCommand` (`{ quoteId, requesterUserId, reason, note?, attachments? }`), `RejectQuoteCommand` (same shape), `WithdrawQuoteCommand` (`{ quoteId, requesterUserId, note?, attachments? }`), each `Promise<{ quoteId: string } | null>`.

- [ ] **Step 1: Write the failing test**

`.../quote/__tests__/close-quote.command.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { DeclineQuoteCommand } from "../app/use-cases/decline-quote.command";
import { RejectQuoteCommand } from "../app/use-cases/reject-quote.command";
import { WithdrawQuoteCommand } from "../app/use-cases/withdraw-quote.command";
import { NotProviderMemberError, QuoteContainsContactError, QuoteNotYoursError, QuoteTransitionError } from "../domain/exceptions";
import {
  CapturingOutbox, FakeAttachmentRepo, FakeMemberReader, FakeQuoteRepo, FakeRaiser, FakeStorage,
  TrackingUnitOfWork, proposedQuote, requestedQuote, withId,
} from "./support/fakes";

function wiring(initial: Parameters<typeof withId>[0]) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeQuoteRepo(withId(initial, "q-1"), unitOfWork);
  const attachments = new FakeAttachmentRepo(unitOfWork);
  const members = new FakeMemberReader();
  const storage = new FakeStorage({ "attachment/user-right-1/1-x.pdf": { contentType: "application/pdf", sizeBytes: 1_000, uploadedByUserId: "user-right-1", originalName: "x.pdf" } });
  const raiser = new FakeRaiser(null, unitOfWork);
  return { unitOfWork, outbox, repo, attachments, members, storage, raiser };
}

describe("DeclineQuoteCommand", () => {
  it("closes a request with the reason, the note and its files, and tells the customer", async () => {
    const w = wiring(requestedQuote());
    const command = new DeclineQuoteCommand(w.repo, w.attachments, w.members, w.storage, w.unitOfWork, w.outbox, w.raiser);

    await command.execute({
      quoteId: "q-1", requesterUserId: "user-right-1", reason: "outside_area",
      note: "Só fazemos instalações em Maputo cidade", attachments: [{ storageKey: "attachment/user-right-1/1-x.pdf" }],
    });

    expect(w.repo.state?.status).toBe("DECLINED");
    expect(w.repo.state?.closedReason).toBe("outside_area");
    expect(w.repo.state?.closedNote).toBe("Só fazemos instalações em Maputo cidade");
    expect(w.repo.state?.closedByUserId).toBe("user-right-1");
    expect(w.repo.state?.expiresAt).toBeNull();
    expect(w.attachments.rows[0]).toMatchObject({ step: "closing", proposalId: null, fileName: "x.pdf" });
    expect(w.outbox.published[0]?.events[0]?.eventName).toBe("quote.declined");
    expect(w.raiser.raised[0]).toMatchObject({ type: NotificationType.QuoteDeclined, audience: "user", userId: "cust-1" });
  });

  it("works from PROPOSED too, and refuses a caller from another workspace", async () => {
    const proposed = wiring(proposedQuote());
    const ok = new DeclineQuoteCommand(proposed.repo, proposed.attachments, proposed.members, proposed.storage, proposed.unitOfWork, proposed.outbox, proposed.raiser);
    await ok.execute({ quoteId: "q-1", requesterUserId: "user-right-2", reason: "not_available" });
    expect(proposed.repo.state?.status).toBe("DECLINED");

    const w = wiring(requestedQuote());
    const command = new DeclineQuoteCommand(w.repo, w.attachments, w.members, w.storage, w.unitOfWork, w.outbox, w.raiser);
    await expect(command.execute({ quoteId: "q-1", requesterUserId: "user-wrong", reason: "other" })).rejects.toThrow(NotProviderMemberError);
    expect(w.repo.saveCalls).toBe(0);
  });

  it("refuses a note carrying contact details", async () => {
    const w = wiring(requestedQuote());
    const command = new DeclineQuoteCommand(w.repo, w.attachments, w.members, w.storage, w.unitOfWork, w.outbox, w.raiser);
    await expect(command.execute({ quoteId: "q-1", requesterUserId: "user-right-1", reason: "other", note: "liga 841234567" })).rejects.toThrow(QuoteContainsContactError);
  });
});

describe("RejectQuoteCommand", () => {
  it("lets the quote's own customer refuse a proposal and tells the provider", async () => {
    const w = wiring(proposedQuote());
    const command = new RejectQuoteCommand(w.repo, w.attachments, w.storage, w.unitOfWork, w.outbox, w.raiser);
    await command.execute({ quoteId: "q-1", requesterUserId: "cust-1", reason: "too_expensive" });
    expect(w.repo.state?.status).toBe("REJECTED");
    expect(w.raiser.raised[0]).toMatchObject({ type: NotificationType.ProviderQuoteDeclined, audience: "provider", providerId: "prov-1" });
  });

  it("refuses another customer, and refuses a quote with no proposal yet", async () => {
    const w = wiring(proposedQuote());
    const command = new RejectQuoteCommand(w.repo, w.attachments, w.storage, w.unitOfWork, w.outbox, w.raiser);
    await expect(command.execute({ quoteId: "q-1", requesterUserId: "cust-2", reason: "other" })).rejects.toThrow(QuoteNotYoursError);
    expect(w.repo.saveCalls).toBe(0);

    const early = wiring(requestedQuote());
    const c2 = new RejectQuoteCommand(early.repo, early.attachments, early.storage, early.unitOfWork, early.outbox, early.raiser);
    await expect(c2.execute({ quoteId: "q-1", requesterUserId: "cust-1", reason: "other" })).rejects.toThrow(QuoteTransitionError);
  });
});

describe("WithdrawQuoteCommand", () => {
  it("takes back a request that has no proposal, with the token reason", async () => {
    const w = wiring(requestedQuote());
    const command = new WithdrawQuoteCommand(w.repo, w.attachments, w.storage, w.unitOfWork, w.outbox, w.raiser);
    await command.execute({ quoteId: "q-1", requesterUserId: "cust-1" });
    expect(w.repo.state?.status).toBe("WITHDRAWN");
    expect(w.repo.state?.closedReason).toBe("withdrawn");
    expect(w.raiser.raised[0]).toMatchObject({ type: NotificationType.ProviderQuoteWithdrawn, audience: "provider" });
  });

  it("refuses once a proposal exists — the customer rejects instead", async () => {
    const w = wiring(proposedQuote());
    const command = new WithdrawQuoteCommand(w.repo, w.attachments, w.storage, w.unitOfWork, w.outbox, w.raiser);
    await expect(command.execute({ quoteId: "q-1", requesterUserId: "cust-1" })).rejects.toThrow(QuoteTransitionError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/quote/__tests__/close-quote.command.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the shared closing body**

`.../quote/app/use-cases/close-quote.ts`:

```ts
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { hasContact } from "@ntizo/shared/text";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import type { Quote } from "../../domain/aggregates/quote.aggregate";
import { QuoteContainsContactError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteAttachmentRepositoryPort } from "../ports/outbound/quote-attachment.repository.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";
import { resolveQuoteAttachments, type AttachmentDescriptor } from "./resolve-quote-attachments";

/**
 * What the three closings share: a note the contact detector must pass, files
 * that ride with it, one compare-and-swap, and one event — everything except
 * *which* transition and *who* is told.
 *
 * A shared function rather than a base class: the three commands differ in
 * their authorisation, their transition and their notification, and a class
 * hierarchy would put those three differences behind three abstract methods
 * for no gain.
 */
export interface CloseQuoteDeps {
  repo: QuoteRepositoryPort;
  attachments: QuoteAttachmentRepositoryPort;
  storage: AttachmentStoragePort;
  unitOfWork: UnitOfWorkPort;
  outboxPort: OutboxPort;
}

export async function closeQuote(
  deps: CloseQuoteDeps,
  input: {
    quote: Quote;
    actorUserId: string;
    note: string | null | undefined;
    attachments: AttachmentDescriptor[] | undefined;
    transition: (quote: Quote, note: string | null) => Quote;
    event: (moved: Quote, quoteId: string) => BaseDomainEvent;
  },
): Promise<Quote | null> {
  const note = (input.note ?? "").trim();
  if (note.length > 0 && hasContact(note)) throw new QuoteContainsContactError();

  const resolved = await resolveQuoteAttachments(deps.storage, input.actorUserId, input.attachments ?? []);
  const moved = input.transition(input.quote, note.length === 0 ? null : note);
  const quoteId = input.quote.id as string;

  return await deps.unitOfWork.atomicExecute(async (): Promise<Quote | null> => {
    const persisted = await deps.repo.save(moved, input.quote.status);
    if (!persisted) return null;

    await deps.attachments.insertMany(
      resolved.map((file) => ({ quoteId, proposalId: null, step: "closing" as const, ...file })),
    );

    await deps.outboxPort.publish([input.event(persisted, quoteId)], "quote");
    return persisted;
  });
}
```

- [ ] **Step 4: Write the three commands**

`.../quote/app/use-cases/decline-quote.command.ts`:

```ts
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import { QuoteDeclined } from "../../domain/events";
import { NotProviderMemberError, QuoteNotFoundError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteAttachmentRepositoryPort } from "../ports/outbound/quote-attachment.repository.port";
import type { ProviderMemberReaderPort } from "../ports/outbound/provider-member.reader.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";
import { raiseQuietly, type RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";
import { closeQuote } from "./close-quote";
import type { AttachmentDescriptor } from "./resolve-quote-attachments";

export interface DeclineQuoteInput {
  quoteId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
  /** One of `QUOTE_PROVIDER_DECLINE_REASONS`; the customer's screen renders it in their language. */
  reason: string;
  note?: string | null;
  attachments?: AttachmentDescriptor[];
}

/**
 * The provider's no, from either open state: a request they will not price,
 * or a proposal they are taking back. Both land on `DECLINED`, because from
 * the customer's side they are the same news — this provider is not doing it.
 */
export class DeclineQuoteCommand {
  constructor(
    private readonly repo: QuoteRepositoryPort,
    private readonly attachments: QuoteAttachmentRepositoryPort,
    private readonly members: ProviderMemberReaderPort,
    private readonly storage: AttachmentStoragePort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: DeclineQuoteInput): Promise<{ quoteId: string } | null> {
    const at = new Date();
    const quote = await this.repo.findById(input.quoteId);
    if (!quote) throw new QuoteNotFoundError(input.quoteId);
    if (!(await this.members.isMember(quote.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError();
    }

    const moved = await closeQuote(
      { repo: this.repo, attachments: this.attachments, storage: this.storage, unitOfWork: this.unitOfWork, outboxPort: this.outboxPort },
      {
        quote,
        actorUserId: input.requesterUserId,
        note: input.note,
        attachments: input.attachments,
        transition: (q, note) => q.decline(at, input.requesterUserId, input.reason, note),
        event: (persisted, quoteId) =>
          new QuoteDeclined({
            quoteId,
            customerId: persisted.customerId,
            providerId: persisted.providerId,
            serviceId: persisted.serviceId,
            reason: input.reason,
          }),
      },
    );

    if (!moved) return null;

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.QuoteDeclined,
        audience: "user",
        userId: moved.customerId,
        payload: { quoteId: input.quoteId, reason: input.reason, note: moved.closedNote },
      },
      input.quoteId,
    );

    return { quoteId: input.quoteId };
  }
}
```

`.../quote/app/use-cases/reject-quote.command.ts` — the same shape with three differences: no `members` dependency; the guard is `if (quote.customerId !== input.requesterUserId) throw new QuoteNotYoursError();`; the transition is `q.reject(at, input.requesterUserId, input.reason, note)`, the event `QuoteRejected`, and the notification:

```ts
      {
        type: NotificationType.ProviderQuoteDeclined,
        audience: "provider",
        providerId: moved.providerId,
        payload: { quoteId: input.quoteId, reason: input.reason, note: moved.closedNote },
      },
```

`.../quote/app/use-cases/withdraw-quote.command.ts` — the same again with `WithdrawQuoteInput { quoteId, requesterUserId, note?, attachments? }` (no reason), the guard on `customerId`, the transition `q.withdraw(at, input.requesterUserId, note)`, the event `QuoteWithdrawn`, and:

```ts
      {
        type: NotificationType.ProviderQuoteWithdrawn,
        audience: "provider",
        providerId: moved.providerId,
        payload: { quoteId: input.quoteId },
      },
```

(`NotificationType.ProviderQuoteWithdrawn` is added in Task 13; until then TypeScript will flag it. Write Task 13's enum entry now if the compiler blocks this task — it is one line, `ProviderQuoteWithdrawn = "PROVIDER_QUOTE_WITHDRAWN"`, plus its `case` in `bucketForNotificationType`.)

- [ ] **Step 5: Run the tests**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/quote/__tests__/close-quote.command.test.ts`
Expected: PASS (7 cases).

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/quote packages/shared/src/enums
git commit -m "feat(quote): either side can close a quote, with a reason, a note and files"
```

---
### Task 10: The booking's from-quote entrance

**Files:**
- Modify: `.../bounded-contexts/booking/domain/aggregates/booking.aggregate.ts`
- Create: `.../booking/app/use-cases/create-booking-from-quote.command.ts`
- Modify: `.../booking/bootstrap/index.ts`, `.../booking/index.ts`
- Test: `.../booking/__tests__/create-booking-from-quote.command.test.ts`

**Interfaces:**
- Consumes: `OpenBookingFromQuoteInput` (Task 5) is the shape the adapter maps onto this command's input.
- Produces: `Booking.createFromQuote(input)`, `Booking#quoteId`, `CreateBookingFromQuoteCommand` with `CreateBookingFromQuoteInput` and result `{ bookingId: string; payBy: Date }`; `SlotAlreadyTakenError` is what it throws when the calendar refuses.

- [ ] **Step 1: Add the factory**

Task 2 already made `serviceOptionId` and `optionName` nullable on `BookingProps`, added `quoteId` and its getter, taught `restore` the origin rule, and carried all of that through the mapper and the read models. This task adds only the new behaviour.

Add the factory after `create`:

```ts
  /**
   * A booking born from an accepted quote.
   *
   * It starts at `PENDING_PAYMENT`, not `DRAFT`: the provider said yes when
   * they proposed, and the customer said yes by accepting, so the only thing
   * left is the money. That is the same state `accept` leaves a priced
   * booking in, which is why nothing downstream — the charge sweep, the
   * payment window, `markPaid`, the close reminders — needs to know a booking
   * came from a quote.
   *
   * `optionName` and `serviceOptionId` are null and `quoteId` is set; the
   * price and the duration are the proposal's, not a catalogue option's.
   * The address is required here, unlike in `create`: a quote-born booking is
   * never a draft, and every status past `DRAFT` must carry one.
   */
  static createFromQuote(input: {
    id?: string | null;
    quoteId: string;
    customerId: string;
    providerId: string;
    serviceId: string;
    providerMemberId: string;
    startsAt: Date;
    durationMinutes: number;
    priceMinor: number;
    commissionBps: number;
    currency: string;
    serviceName: string;
    providerName: string;
    providerSlug: string;
    addressLabel: string;
    addressLine: string;
    addressCity: string;
    addressDistrict?: string | null;
    addressDirections?: string | null;
    addressLat?: number | null;
    addressLng?: number | null;
    description?: string | null;
    at: Date;
    payBy: Date;
  }): Booking {
    Booking.requireNonBlank(input.quoteId, "quoteId");
    Booking.requireNonBlank(input.customerId, "customerId");
    Booking.requireNonBlank(input.providerId, "providerId");
    Booking.requireNonBlank(input.serviceId, "serviceId");
    Booking.requireNonBlank(input.providerMemberId, "providerMemberId");
    Booking.requireNonBlank(input.currency, "currency");
    Booking.requireNonBlank(input.serviceName, "serviceName");
    Booking.requireNonBlank(input.providerName, "providerName");
    Booking.requireNonBlank(input.providerSlug, "providerSlug");
    Booking.requireNonBlank(input.addressLabel, "addressLabel");
    Booking.requireNonBlank(input.addressLine, "addressLine");
    Booking.requireNonBlank(input.addressCity, "addressCity");
    if (input.addressDistrict != null) Booking.requireNonBlank(input.addressDistrict, "addressDistrict");
    if (input.addressDirections != null) Booking.requireNonBlank(input.addressDirections, "addressDirections");
    Booking.requireValidDate(input.startsAt, "startsAt");
    Booking.requireValidDate(input.at, "at");
    Booking.requireValidDate(input.payBy, "payBy");

    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
      throw new BookingDurationInvalidError(input.durationMinutes);
    }
    if (!Number.isInteger(input.priceMinor) || input.priceMinor < 0) {
      throw new BookingPriceInvalidError(input.priceMinor);
    }
    if (!Number.isInteger(input.commissionBps) || input.commissionBps < 0 || input.commissionBps > COMMISSION_BPS_MAX) {
      throw new CommissionOutOfRangeError(input.commissionBps);
    }

    const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
    const commissionMinor = Math.round((input.priceMinor * input.commissionBps) / COMMISSION_BPS_MAX);
    const description = (input.description ?? "").trim();

    return new Booking({
      id: input.id ?? null,
      customerId: input.customerId,
      providerId: input.providerId,
      serviceId: input.serviceId,
      serviceOptionId: null,
      optionName: null,
      quoteId: input.quoteId,
      providerMemberId: input.providerMemberId,
      startsAt: input.startsAt,
      endsAt,
      durationMinutes: input.durationMinutes,
      status: BookingStatus.PendingPayment,
      expiresAt: input.payBy,
      paidAt: null,
      paymentRef: null,
      confirmedAt: input.at,
      declinedAt: null,
      cancelledAt: null,
      remindedAt: null,
      markedDoneAt: null,
      completedAt: null,
      disputedAt: null,
      expiredAt: null,
      priceMinor: input.priceMinor,
      commissionBps: input.commissionBps,
      commissionMinor,
      currency: input.currency,
      serviceName: input.serviceName,
      providerName: input.providerName,
      providerSlug: input.providerSlug,
      addressLabel: input.addressLabel,
      addressLine: input.addressLine,
      addressCity: input.addressCity,
      addressDistrict: input.addressDistrict ?? null,
      addressDirections: input.addressDirections ?? null,
      addressLat: input.addressLat ?? null,
      addressLng: input.addressLng ?? null,
      description: description === "" ? null : description,
    });
  }
```

- [ ] **Step 2: Write the failing command test**

`.../booking/__tests__/create-booking-from-quote.command.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Booking } from "../domain/aggregates/booking.aggregate";
import { SlotAlreadyTakenError, SlotInPastError } from "../domain/exceptions";
import { CreateBookingFromQuoteCommand, type CreateBookingFromQuoteInput } from "../app/use-cases/create-booking-from-quote.command";
import type { BookingChangeRecord, BookingRepositoryPort } from "../app/ports/outbound/booking.repository.port";
import { TrackingUnitOfWork } from "./support/fakes";

const NEXT_WEEK = new Date(Date.now() + 7 * 24 * 3_600_000);

const INPUT: CreateBookingFromQuoteInput = {
  quoteId: "q-1", customerId: "cust-1", providerId: "prov-1", serviceId: "svc-1", providerMemberId: "mem-1",
  startsAt: NEXT_WEEK, durationMinutes: 240, priceMinor: 9_800, currency: "MZN",
  serviceName: "Instalação de ar condicionado", description: "Dois aparelhos",
  address: { label: "Casa", line: "Av. X 1", city: "Maputo", district: "Central", directions: null, lat: null, lng: null },
  acceptedByUserId: "cust-1",
};

class FakeRepo implements Partial<BookingRepositoryPort> {
  public inserted: Booking[] = [];
  public changes: BookingChangeRecord[] = [];
  public insertCapacity: number | null = null;
  constructor(private readonly failWith: Error | null = null) {}
  async insert(booking: Booking, capacity: number): Promise<Booking> {
    if (this.failWith) throw this.failWith;
    this.insertCapacity = capacity;
    const saved = Booking.restore({ ...(booking as unknown as { props: never }), ...bookingProps(booking), id: "bk-1" });
    this.inserted.push(saved);
    return saved;
  }
  async appendChange(change: BookingChangeRecord): Promise<void> { this.changes.push(change); }
}

// The aggregate exposes getters, not props; rebuild what `restore` needs from them.
function bookingProps(b: Booking) {
  return {
    id: b.id, customerId: b.customerId, providerId: b.providerId, serviceId: b.serviceId,
    serviceOptionId: b.serviceOptionId, optionName: b.optionName, quoteId: b.quoteId,
    providerMemberId: b.providerMemberId, startsAt: b.startsAt, endsAt: b.endsAt,
    durationMinutes: b.durationMinutes, status: b.status, expiresAt: b.expiresAt, paidAt: b.paidAt,
    paymentRef: b.paymentRef, confirmedAt: b.confirmedAt, declinedAt: b.declinedAt, cancelledAt: b.cancelledAt,
    remindedAt: b.remindedAt, markedDoneAt: b.markedDoneAt, completedAt: b.completedAt, disputedAt: b.disputedAt,
    expiredAt: b.expiredAt, priceMinor: b.priceMinor, commissionBps: b.commissionBps,
    commissionMinor: b.commissionMinor, currency: b.currency, serviceName: b.serviceName,
    providerName: b.providerName, providerSlug: b.providerSlug, addressLabel: b.addressLabel,
    addressLine: b.addressLine, addressCity: b.addressCity, addressDistrict: b.addressDistrict,
    addressDirections: b.addressDirections, addressLat: b.addressLat, addressLng: b.addressLng,
    description: b.description,
  };
}

function setup(opts: { repo?: FakeRepo } = {}) {
  const repo = opts.repo ?? new FakeRepo();
  const providers = { async findForBooking() { return { commissionBps: 1000, name: "Frio & Clima", slug: "frio-clima" }; } };
  const settings = { async findCheckoutHoldMinutes() { return 30; }, async findProviderResponseMinutes() { return 120; }, async findPaymentWindowMinutes() { return 15; } };
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = { published: [] as unknown[], async publish(events: unknown[], aggregateType: string) { this.published.push({ events, aggregateType }); } };
  const command = new CreateBookingFromQuoteCommand(repo as unknown as BookingRepositoryPort, providers, settings, unitOfWork, outbox);
  return { command, repo, outbox };
}

describe("CreateBookingFromQuoteCommand", () => {
  it("creates a PENDING_PAYMENT booking carrying the quote, the proposal's price and the live commission", async () => {
    const { command, repo, outbox } = setup();

    const result = await command.execute(INPUT);

    expect(result.bookingId).toBe("bk-1");
    const booking = repo.inserted[0]!;
    expect(booking.status).toBe("PENDING_PAYMENT");
    expect(booking.quoteId).toBe("q-1");
    expect(booking.serviceOptionId).toBeNull();
    expect(booking.optionName).toBeNull();
    expect(booking.priceMinor).toBe(9_800);
    expect(booking.commissionBps).toBe(1000);
    expect(booking.commissionMinor).toBe(980);
    expect(booking.expiresAt).toEqual(result.payBy);
    expect(repo.insertCapacity).toBe(1);
    expect(repo.changes[0]).toMatchObject({ bookingId: "bk-1", changedByUserId: "cust-1", reason: "created_from_quote" });
    expect(outbox.published[0]).toMatchObject({ aggregateType: "booking" });
  });

  it("caps the payment window at the proposed start", async () => {
    const { command } = setup();
    const soon = new Date(Date.now() + 5 * 60_000);
    const result = await command.execute({ ...INPUT, startsAt: soon, durationMinutes: 60 });
    expect(result.payBy).toEqual(soon);
  });

  it("refuses a start already past, and lets a calendar refusal through untouched", async () => {
    const { command } = setup();
    await expect(command.execute({ ...INPUT, startsAt: new Date(Date.now() - 1000) })).rejects.toThrow(SlotInPastError);

    const busy = setup({ repo: new FakeRepo(new SlotAlreadyTakenError("mem-1", NEXT_WEEK)) });
    await expect(busy.command.execute(INPUT)).rejects.toThrow(SlotAlreadyTakenError);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking/__tests__/create-booking-from-quote.command.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Write the command**

`.../booking/app/use-cases/create-booking-from-quote.command.ts`:

```ts
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { Booking } from "../../domain/aggregates/booking.aggregate";
import { BookingCreated } from "../../domain/events";
import { ProviderNotFoundError, SlotInPastError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import { cappedToSlotStart } from "./capped-to-slot-start";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { PlatformSettingsReaderPort } from "../ports/outbound/platform-settings.reader.port";
import type { ProviderSnapshotReaderPort } from "../ports/outbound/provider-snapshot.reader.port";

export interface CreateBookingFromQuoteInput {
  quoteId: string;
  customerId: string;
  providerId: string;
  serviceId: string;
  providerMemberId: string;
  startsAt: Date;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  /** Snapshotted by the quote context in the locale the customer asked in. */
  serviceName: string;
  address: {
    label: string;
    line: string;
    city: string;
    district: string | null;
    directions: string | null;
    lat: number | null;
    lng: number | null;
  };
  description: string | null;
  /** The accepting customer; `booking_change.changed_by_user_id`. */
  acceptedByUserId: string;
}

/** What `booking_change.reason` records for a booking that began as a quote. */
const CREATED_FROM_QUOTE = "created_from_quote";

/**
 * The quote context's one entrance into this one.
 *
 * **It runs inside the caller's transaction.** `DrizzleUnitOfWork` joins an
 * open transaction rather than opening a second one, so the quote's closing
 * and this booking commit together or not at all — which is the whole point:
 * a quote marked `ACCEPTED` beside no booking, or a booking beside an open
 * quote, are both states nobody could explain.
 *
 * **The calendar is the arbiter, and its refusal is not caught here.**
 * `repo.insert` raises `SlotAlreadyTakenError` when
 * `booking_member_slot_no_overlap` refuses; letting it out is what rolls the
 * acceptance back. The adapter at the composition root turns it into the
 * quote context's own `QuoteSlotTakenError`, and `AcceptQuoteCommand` then
 * puts the quote back in front of the provider.
 *
 * **Capacity is 1.** A quoted job is one person's time at an address for as
 * long as the proposal says; there is no `member_availability` rule behind a
 * time the provider chose by hand, and seats exist for a rule that offers
 * several customers one slot. If quoted group work ever appears, this is the
 * line to revisit.
 */
export class CreateBookingFromQuoteCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly providerReader: ProviderSnapshotReaderPort,
    private readonly platformSettingsReader: PlatformSettingsReaderPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(input: CreateBookingFromQuoteInput): Promise<{ bookingId: string; payBy: Date }> {
    const at = new Date();
    if (input.startsAt.getTime() <= at.getTime()) throw new SlotInPastError(input.startsAt);

    const provider = await this.providerReader.findForBooking(input.providerId);
    if (!provider) throw new ProviderNotFoundError(input.providerId);

    // LIVE, and capped at the slot: a window running past `startsAt` would
    // have the charge sweep chasing a customer for work already due.
    const paymentWindowMinutes = await this.platformSettingsReader.findPaymentWindowMinutes();
    const payBy = cappedToSlotStart(new Date(at.getTime() + paymentWindowMinutes * 60_000), input.startsAt);

    const booking = Booking.createFromQuote({
      quoteId: input.quoteId,
      customerId: input.customerId,
      providerId: input.providerId,
      serviceId: input.serviceId,
      providerMemberId: input.providerMemberId,
      startsAt: input.startsAt,
      durationMinutes: input.durationMinutes,
      priceMinor: input.priceMinor,
      commissionBps: provider.commissionBps,
      currency: input.currency,
      serviceName: input.serviceName,
      providerName: provider.name,
      providerSlug: provider.slug,
      addressLabel: input.address.label,
      addressLine: input.address.line,
      addressCity: input.address.city,
      addressDistrict: input.address.district,
      addressDirections: input.address.directions,
      addressLat: input.address.lat,
      addressLng: input.address.lng,
      description: input.description,
      at,
      payBy,
    });

    return await this.unitOfWork.atomicExecute(async () => {
      const inserted = await this.repo.insert(booking, 1);
      const bookingId = inserted.id as string;

      await this.repo.appendChange({
        bookingId,
        changedByUserId: input.acceptedByUserId,
        reason: CREATED_FROM_QUOTE,
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });

      await this.outboxPort.publish(
        [
          new BookingCreated({
            bookingId,
            customerId: inserted.customerId,
            providerId: inserted.providerId,
            serviceId: inserted.serviceId,
            providerMemberId: inserted.providerMemberId,
            startsAt: inserted.startsAt,
            endsAt: inserted.endsAt,
            priceMinor: inserted.priceMinor,
            currency: inserted.currency,
            expiresAt: payBy,
          }),
        ],
        "booking",
      );

      return { bookingId, payBy };
    });
  }
}
```

- [ ] **Step 5: Wire it into the booking bootstrap**

In `.../booking/bootstrap/index.ts`, beside the other constructions:

```ts
      createBookingFromQuote: new CreateBookingFromQuoteCommand(
        bookingRepository,
        providerReader,
        platformSettingsReader,
        unitOfWork,
        outboxPort,
      ),
```

and in `.../booking/index.ts`:

```ts
export {
  CreateBookingFromQuoteCommand,
  type CreateBookingFromQuoteInput,
} from "./app/use-cases/create-booking-from-quote.command";
```

- [ ] **Step 6: Run the booking suite**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking && bun run typecheck`
Expected: PASS, including every existing booking test (the nullable columns must not have broken them).

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo packages/shared/src/read-models
git commit -m "feat(booking): a booking can be born from an accepted quote"
```

---

### Task 11: `AcceptQuoteCommand` and the slot-taken path

**Files:**
- Create: `.../quote/app/use-cases/mark-proposal-stale.internal.command.ts`
- Create: `.../quote/app/use-cases/accept-quote.command.ts`
- Test: `.../quote/__tests__/accept-quote.command.test.ts`

**Interfaces:**
- Produces: `AcceptQuoteCommand` with `AcceptQuoteInput { quoteId, requesterUserId, address? }` → `Promise<{ bookingId: string; payBy: string }>`; `MarkProposalStaleInternalCommand` with `{ quoteId }` → `Promise<void>`.

- [ ] **Step 1: Write the failing test**

`.../quote/__tests__/accept-quote.command.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { AcceptQuoteCommand, type AcceptQuoteInput } from "../app/use-cases/accept-quote.command";
import { MarkProposalStaleInternalCommand } from "../app/use-cases/mark-proposal-stale.internal.command";
import {
  QuoteAddressRequiredError, QuoteMemberCannotPerformError, QuoteNoCustomerPhoneError,
  QuoteNotYoursError, QuoteProposalLapsedError, QuoteServiceNotQuotableError, QuoteSlotTakenError, QuoteTransitionError,
} from "../domain/exceptions";
import {
  ADDRESS, CapturingOutbox, FakeBookingOpener, FakePhoneReader, FakeQuoteRepo, FakeRaiser,
  FakeServiceReader, FakeSettings, TrackingUnitOfWork, lapsedProposedQuote, proposedQuote,
  requestedQuote, serviceSnapshot, withId,
} from "./support/fakes";

function setup(initial = withId(proposedQuote(), "q-1"), opts: { opener?: FakeBookingOpener; phones?: FakePhoneReader; snapshot?: ReturnType<typeof serviceSnapshot> } = {}) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeQuoteRepo(initial, unitOfWork);
  const services = new FakeServiceReader(opts.snapshot ?? serviceSnapshot());
  const phones = opts.phones ?? new FakePhoneReader();
  const opener = opts.opener ?? new FakeBookingOpener(null, unitOfWork);
  const settings = new FakeSettings();
  const raiser = new FakeRaiser(null, unitOfWork);
  const stale = new MarkProposalStaleInternalCommand(repo, services, settings, unitOfWork, outbox, raiser);
  const command = new AcceptQuoteCommand(repo, services, phones, opener, unitOfWork, outbox, raiser, stale);
  return { command, repo, opener, raiser, outbox, unitOfWork, stale };
}

const INPUT: AcceptQuoteInput = { quoteId: "q-1", requesterUserId: "cust-1" };

describe("AcceptQuoteCommand", () => {
  it("opens the booking inside the transaction and closes the quote onto it", async () => {
    const { command, repo, opener, raiser, outbox, unitOfWork } = setup();

    const result = await command.execute(INPUT);

    expect(result.bookingId).toBe("bk-1");
    expect(repo.state?.status).toBe("ACCEPTED");
    expect(repo.state?.bookingId).toBe("bk-1");
    expect(repo.state?.expiresAt).toBeNull();
    expect(opener.calls[0]).toMatchObject({
      quoteId: "q-1", customerId: "cust-1", providerMemberId: "mem-1", priceMinor: 9_800,
      durationMinutes: 240, serviceName: "Instalação de ar condicionado", acceptedByUserId: "cust-1",
    });
    expect(opener.calls[0]?.address).toMatchObject({ label: "Casa", city: "Maputo" });
    expect(unitOfWork.order).toEqual(["openBooking", "save"]);
    expect(outbox.published[0]?.events[0]?.eventName).toBe("quote.accepted");
    expect(raiser.raised.map((r) => r.type)).toEqual([NotificationType.QuoteAccepted, NotificationType.ProviderQuoteAccepted]);
    expect(raiser.insideTransactionAtCall).toEqual([false, false]);
  });

  it("takes the address at acceptance when the request carried none", async () => {
    const noAddress = withId(proposedQuote({ address: null }), "q-1");
    const { command, opener } = setup(noAddress);
    await command.execute({ ...INPUT, address: ADDRESS });
    expect(opener.calls[0]?.address).toMatchObject({ line: "Av. Julius Nyerere 1234" });

    const still = setup(withId(proposedQuote({ address: null }), "q-1"));
    await expect(still.command.execute(INPUT)).rejects.toThrow(QuoteAddressRequiredError);
  });

  it("refuses another customer, a quote with no proposal, a lapsed proposal, and a customer with no phone", async () => {
    await expect(setup().command.execute({ ...INPUT, requesterUserId: "cust-2" })).rejects.toThrow(QuoteNotYoursError);
    await expect(setup(withId(requestedQuote(), "q-1")).command.execute(INPUT)).rejects.toThrow(QuoteTransitionError);

    const lapsedSetup = setup(withId(lapsedProposedQuote(), "q-1"));
    await expect(lapsedSetup.command.execute(INPUT)).rejects.toThrow(QuoteProposalLapsedError);

    const noPhone = setup(withId(proposedQuote(), "q-1"), { phones: new FakePhoneReader({ "cust-1": null }) });
    await expect(noPhone.command.execute(INPUT)).rejects.toThrow(QuoteNoCustomerPhoneError);
    expect(noPhone.opener.calls).toHaveLength(0);
  });

  it("re-checks that the service and the member are still good", async () => {
    const gone = setup(withId(proposedQuote(), "q-1"), { snapshot: serviceSnapshot({ providerStatus: "suspended" }) });
    await expect(gone.command.execute(INPUT)).rejects.toThrow(QuoteServiceNotQuotableError);
    const dropped = setup(withId(proposedQuote(), "q-1"), { snapshot: serviceSnapshot({ memberIds: ["mem-2"] }) });
    await expect(dropped.command.execute(INPUT)).rejects.toThrow(QuoteMemberCannotPerformError);
  });

  it("when the calendar refuses, nothing is accepted and the quote goes back to the provider", async () => {
    const busy = setup(withId(proposedQuote(), "q-1"), { opener: new FakeBookingOpener(new QuoteSlotTakenError()) });

    await expect(busy.command.execute(INPUT)).rejects.toThrow(QuoteSlotTakenError);

    expect(busy.repo.state?.status).toBe("REQUESTED");
    expect(busy.repo.state?.liveProposal).toBeNull();
    expect(busy.repo.state?.proposals[0]?.supersededCause).toBe("slot_taken");
    expect(busy.repo.state?.expiresAt).not.toBeNull();
    expect(busy.raiser.raised[0]).toMatchObject({ type: NotificationType.ProviderQuoteSlotTaken, audience: "provider" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/quote/__tests__/accept-quote.command.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the stale command**

`.../quote/app/use-cases/mark-proposal-stale.internal.command.ts`:

```ts
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import { QuoteProposalStale } from "../../domain/events";
import { QuoteNotFoundError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteServiceReaderPort } from "../ports/outbound/quote-service.reader.port";
import type { PlatformSettingsReaderPort } from "../ports/outbound/platform-settings.reader.port";
import { raiseQuietly, type RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";

const DEFAULT_RESPONSE_HOURS = 48;

/**
 * The acceptance lost the slot: put the quote back in front of the provider.
 *
 * **Its own transaction, after the acceptance's rolled back.** The acceptance
 * failed precisely because its transaction could not commit, so anything
 * written inside it is gone; this runs afterwards, from the catch, and is the
 * only reason `AcceptQuoteCommand` catches an error at all.
 *
 * Idempotent by the same compare-and-swap every other command uses: a quote
 * that has already moved on gets nothing.
 */
export class MarkProposalStaleInternalCommand {
  constructor(
    private readonly repo: QuoteRepositoryPort,
    private readonly services: QuoteServiceReaderPort,
    private readonly settings: PlatformSettingsReaderPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: { quoteId: string }): Promise<void> {
    const at = new Date();
    const quote = await this.repo.findById(input.quoteId);
    if (!quote) throw new QuoteNotFoundError(input.quoteId);
    if (quote.status !== "PROPOSED") return;

    const service = await this.services.findForQuote(quote.serviceId, quote.locale);
    const respondBy = new Date(at.getTime() + (service?.quoteForm?.responseHours ?? DEFAULT_RESPONSE_HOURS) * 3_600_000);
    const staleProposalId = quote.liveProposal?.id ?? "";

    const moved = await this.unitOfWork.atomicExecute(async () => {
      const persisted = await this.repo.save(quote.proposalStale(at, respondBy), quote.status);
      if (!persisted) return null;
      await this.outboxPort.publish(
        [
          new QuoteProposalStale({
            quoteId: input.quoteId,
            customerId: persisted.customerId,
            providerId: persisted.providerId,
            serviceId: persisted.serviceId,
            proposalId: staleProposalId,
            cause: "slot_taken",
            respondBy,
          }),
        ],
        "quote",
      );
      return persisted;
    });

    if (!moved) return;

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.ProviderQuoteSlotTaken,
        audience: "provider",
        providerId: moved.providerId,
        payload: {
          quoteId: input.quoteId,
          serviceName: service?.serviceName ?? "",
          respondBy: respondBy.toISOString(),
        },
      },
      input.quoteId,
    );
  }
}
```

- [ ] **Step 4: Write the acceptance**

`.../quote/app/use-cases/accept-quote.command.ts`:

```ts
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import type { Quote, QuoteAddress } from "../../domain/aggregates/quote.aggregate";
import { QuoteAccepted } from "../../domain/events";
import {
  QuoteAddressRequiredError,
  QuoteMemberCannotPerformError,
  QuoteNoCustomerPhoneError,
  QuoteNoLiveProposalError,
  QuoteNotFoundError,
  QuoteNotYoursError,
  QuoteServiceNotQuotableError,
  QuoteSlotTakenError,
} from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteServiceReaderPort } from "../ports/outbound/quote-service.reader.port";
import type { CustomerPhoneReaderPort } from "../ports/outbound/customer-phone.reader.port";
import type { BookingOpenerPort } from "../ports/outbound/booking-opener.port";
import { raiseQuietly, type RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";
import type { MarkProposalStaleInternalCommand } from "./mark-proposal-stale.internal.command";

export interface AcceptQuoteInput {
  quoteId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
  /** Supplied only when the request carried no address. */
  address?: QuoteAddress | null;
}

/**
 * Accepting is paying: this is the one act, and there is deliberately no
 * moment where the deal is closed and the money undecided.
 *
 * **The booking is opened first, inside the transaction, and the quote is
 * closed onto its id.** The order matters: the id has to exist before the
 * quote can name it, and both writes are in one transaction because a quote
 * marked `ACCEPTED` beside no booking is a state nobody could explain.
 *
 * **The phone is checked here, not by the charge.** A customer with no
 * number would have the sweep spend all three attempts against nothing and
 * the payment window then cancel a booking the provider had already blocked
 * their Saturday for. The web writes the number through the User context
 * before calling this, exactly as checkout's step 3 does.
 *
 * **`QuoteSlotTakenError` is the one error this command handles rather than
 * raises.** The transaction is gone by the time it surfaces, so the recovery
 * runs in a second one and then the original error is re-thrown for the
 * customer's screen to explain.
 */
export class AcceptQuoteCommand {
  constructor(
    private readonly repo: QuoteRepositoryPort,
    private readonly services: QuoteServiceReaderPort,
    private readonly phones: CustomerPhoneReaderPort,
    private readonly bookings: BookingOpenerPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
    private readonly markStale: MarkProposalStaleInternalCommand,
  ) {}

  async execute(input: AcceptQuoteInput): Promise<{ bookingId: string; payBy: string }> {
    const at = new Date();

    const loaded = await this.repo.findById(input.quoteId);
    if (!loaded) throw new QuoteNotFoundError(input.quoteId);
    if (loaded.customerId !== input.requesterUserId) throw new QuoteNotYoursError();

    const quote = input.address ? loaded.withAddress(input.address) : loaded;
    if (!quote.hasCompleteAddress()) throw new QuoteAddressRequiredError();

    const proposal = quote.liveProposal;
    if (!proposal) throw new QuoteNoLiveProposalError();

    const phone = await this.phones.findPhoneNumber(quote.customerId);
    if (phone === null || phone.trim() === "") throw new QuoteNoCustomerPhoneError();

    // Re-checked at the last moment: a service unpublished, a provider
    // suspended or a member taken off the service between the proposal and
    // the acceptance must not become a booking.
    const service = await this.services.findForQuote(quote.serviceId, quote.locale);
    if (!service) throw new QuoteServiceNotQuotableError("not_found");
    if (service.serviceStatus !== "published") throw new QuoteServiceNotQuotableError("not_published");
    if (service.providerStatus !== "active") throw new QuoteServiceNotQuotableError("provider_not_active");
    if (!service.memberIds.includes(proposal.providerMemberId)) {
      throw new QuoteMemberCannotPerformError(proposal.providerMemberId);
    }

    let outcome: { moved: Quote; bookingId: string; payBy: Date };
    try {
      outcome = await this.unitOfWork.atomicExecute(async () => {
        const opened = await this.bookings.openFromQuote({
          quoteId: input.quoteId,
          customerId: quote.customerId,
          providerId: quote.providerId,
          serviceId: quote.serviceId,
          providerMemberId: proposal.providerMemberId,
          startsAt: proposal.startsAt,
          durationMinutes: proposal.durationMinutes,
          priceMinor: proposal.priceMinor,
          currency: proposal.currency,
          serviceName: service.serviceName,
          address: {
            label: quote.addressLabel as string,
            line: quote.addressLine as string,
            city: quote.addressCity as string,
            district: quote.addressDistrict,
            directions: quote.addressDirections,
            lat: quote.addressLat,
            lng: quote.addressLng,
          },
          description: quote.description,
          acceptedByUserId: input.requesterUserId,
        });

        const persisted = await this.repo.save(quote.accept(at, opened.bookingId), loaded.status);
        if (!persisted) throw new QuoteSlotTakenError();

        await this.outboxPort.publish(
          [
            new QuoteAccepted({
              quoteId: input.quoteId,
              customerId: persisted.customerId,
              providerId: persisted.providerId,
              serviceId: persisted.serviceId,
              bookingId: opened.bookingId,
              priceMinor: proposal.priceMinor,
              currency: proposal.currency,
            }),
          ],
          "quote",
        );

        return { moved: persisted, bookingId: opened.bookingId, payBy: opened.payBy };
      });
    } catch (error) {
      if (error instanceof QuoteSlotTakenError) {
        // Its own transaction: this one is gone. A failure to recover must not
        // replace the error the customer's screen knows how to explain.
        try {
          await this.markStale.execute({ quoteId: input.quoteId });
        } catch (recoveryError) {
          console.error(`[quote] could not put ${input.quoteId} back to the provider`, recoveryError);
        }
      }
      throw error;
    }

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.QuoteAccepted,
        audience: "user",
        userId: outcome.moved.customerId,
        payload: {
          quoteId: input.quoteId,
          bookingId: outcome.bookingId,
          serviceName: service.serviceName,
          priceMinor: proposal.priceMinor,
          currency: proposal.currency,
          payBy: outcome.payBy.toISOString(),
        },
      },
      input.quoteId,
    );

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.ProviderQuoteAccepted,
        audience: "provider",
        providerId: outcome.moved.providerId,
        payload: {
          quoteId: input.quoteId,
          bookingId: outcome.bookingId,
          serviceName: service.serviceName,
          priceMinor: proposal.priceMinor,
          currency: proposal.currency,
          startsAt: proposal.startsAt.toISOString(),
        },
      },
      input.quoteId,
    );

    return { bookingId: outcome.bookingId, payBy: outcome.payBy.toISOString() };
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/quote/__tests__/accept-quote.command.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/quote
git commit -m "feat(quote): accepting a proposal creates the booking and asks for the money"
```

---

### Task 12: The sweep

**Files:**
- Create: `.../quote/app/use-cases/sweep-quote.command.ts`
- Create: `.../quote/app/use-cases/sweep-due-quotes.internal.command.ts`
- Test: `.../quote/__tests__/sweep-quote.command.test.ts`

**Interfaces:**
- Produces: `SweepQuoteCommand` (`{ quoteId }` → `Promise<"expired" | "noop">`) and `SweepDueQuotesInternalCommand` (`{ limit }` → `Promise<{ swept: number; failed: number }>`). The cron entry that calls the second is Task 14's, with the composition root that fills its ports.

- [ ] **Step 1: Write the failing test**

`.../quote/__tests__/sweep-quote.command.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { SweepQuoteCommand } from "../app/use-cases/sweep-quote.command";
import { SweepDueQuotesInternalCommand } from "../app/use-cases/sweep-due-quotes.internal.command";
import {
  CapturingOutbox, FakeQuoteRepo, FakeRaiser, FakeServiceReader, TrackingUnitOfWork,
  proposedQuote, requestedQuote, withId,
} from "./support/fakes";

function setup(initial: Parameters<typeof withId>[0]) {
  const unitOfWork = new TrackingUnitOfWork();
  const outbox = new CapturingOutbox(unitOfWork);
  const repo = new FakeQuoteRepo(withId(initial, "q-1"), unitOfWork);
  const services = new FakeServiceReader();
  const raiser = new FakeRaiser(null, unitOfWork);
  const command = new SweepQuoteCommand(repo, services, unitOfWork, outbox, raiser);
  return { command, repo, raiser, outbox };
}

describe("SweepQuoteCommand", () => {
  it("expires an unanswered request and tells the customer why", async () => {
    const { command, repo, raiser, outbox } = setup(requestedQuote());
    expect(await command.execute({ quoteId: "q-1" })).toBe("expired");
    expect(repo.state?.status).toBe("EXPIRED");
    expect(repo.state?.expiredCause).toBe("provider_did_not_respond");
    expect(outbox.published[0]?.events[0]?.eventName).toBe("quote.expired");
    expect(raiser.raised[0]).toMatchObject({ type: NotificationType.QuoteExpired, audience: "user", userId: "cust-1" });
  });

  it("expires a proposal nobody decided and tells the provider", async () => {
    const { command, repo, raiser } = setup(proposedQuote());
    expect(await command.execute({ quoteId: "q-1" })).toBe("expired");
    expect(repo.state?.expiredCause).toBe("proposal_lapsed");
    expect(raiser.raised[0]).toMatchObject({ type: NotificationType.ProviderQuoteExpired, audience: "provider", providerId: "prov-1" });
  });

  it("does nothing to a quote that already moved on, and announces nothing", async () => {
    const closed = requestedQuote().decline(new Date(), "user-right-1", "other", null);
    const { command, repo, raiser } = setup(closed);
    expect(await command.execute({ quoteId: "q-1" })).toBe("noop");
    expect(repo.saveCalls).toBe(0);
    expect(raiser.raised).toHaveLength(0);
  });
});

describe("SweepDueQuotesInternalCommand", () => {
  it("counts what it settled and lets one bad row pass without stopping", async () => {
    const good = withId(requestedQuote(), "q-1");
    const repo = { async findDueForSweep() { return [good, good]; } };
    let call = 0;
    const one = { async execute() { call += 1; if (call === 1) throw new Error("boom"); return "expired" as const; } };
    const command = new SweepDueQuotesInternalCommand(repo as never, one as never);
    expect(await command.execute({ limit: 200 })).toEqual({ swept: 1, failed: 1 });
  });
});
```

- [ ] **Step 2: Write the two commands**

`.../quote/app/use-cases/sweep-quote.command.ts`:

```ts
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import { QuoteExpired } from "../../domain/events";
import { QuoteNotFoundError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteServiceReaderPort } from "../ports/outbound/quote-service.reader.port";
import { raiseQuietly, type RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";

/**
 * One clock ran out. Which one, and therefore who is owed the news, is the
 * quote's own status: a `REQUESTED` quote expired on the provider and the
 * customer is told; a `PROPOSED` one expired on the customer and the provider
 * is told. `Quote.expire` names the cause from the same fact, so the two
 * cannot disagree.
 *
 * Idempotency belongs to the aggregate: `expire` is a no-op from any status
 * with no clock, so a quote this sweep claims twice costs an extra call and
 * never a double ending.
 */
export class SweepQuoteCommand {
  constructor(
    private readonly repo: QuoteRepositoryPort,
    private readonly services: QuoteServiceReaderPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: { quoteId: string }): Promise<"expired" | "noop"> {
    const at = new Date();
    const quote = await this.repo.findById(input.quoteId);
    if (!quote) throw new QuoteNotFoundError(input.quoteId);

    const moved = quote.expire(at);
    if (moved === quote) return "noop";

    const settled = await this.unitOfWork.atomicExecute(async () => {
      const persisted = await this.repo.save(moved, quote.status);
      if (!persisted) return null;
      await this.outboxPort.publish(
        [
          new QuoteExpired({
            quoteId: input.quoteId,
            customerId: persisted.customerId,
            providerId: persisted.providerId,
            serviceId: persisted.serviceId,
            cause: persisted.expiredCause as "provider_did_not_respond" | "proposal_lapsed",
          }),
        ],
        "quote",
      );
      return persisted;
    });

    if (!settled) return "noop";

    const service = await this.services.findForQuote(settled.serviceId, settled.locale);
    const serviceName = service?.serviceName ?? "";

    if (settled.expiredCause === "provider_did_not_respond") {
      await raiseQuietly(
        this.raiseNotification,
        {
          type: NotificationType.QuoteExpired,
          audience: "user",
          userId: settled.customerId,
          payload: { quoteId: input.quoteId, serviceName, cause: settled.expiredCause },
        },
        input.quoteId,
      );
    } else {
      await raiseQuietly(
        this.raiseNotification,
        {
          type: NotificationType.ProviderQuoteExpired,
          audience: "provider",
          providerId: settled.providerId,
          payload: { quoteId: input.quoteId, serviceName, cause: settled.expiredCause },
        },
        input.quoteId,
      );
    }

    return "expired";
  }
}
```

`.../quote/app/use-cases/sweep-due-quotes.internal.command.ts`:

```ts
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { SweepQuoteCommand } from "./sweep-quote.command";

export interface SweepDueQuotesInternalInput {
  /** The cron caller's budget, not this command's. */
  limit: number;
}

/**
 * The cron's one question — which quotes are past their own deadline — and
 * one settlement per answer. Mirrors `SweepDueBookingsInternalCommand`
 * deliberately: this is not the first sweep in this codebase and should not
 * invent a second convention.
 *
 * One bad row does not stop the batch: each quote is settled inside its own
 * `try`, a failure is counted and logged with its id, and the row is left
 * exactly as it was found so the next sweep picks it up again.
 */
export class SweepDueQuotesInternalCommand {
  constructor(
    private readonly quotes: QuoteRepositoryPort,
    private readonly sweepQuote: SweepQuoteCommand,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: SweepDueQuotesInternalInput): Promise<{ swept: number; failed: number }> {
    const due = await this.quotes.findDueForSweep(this.now(), input.limit);
    let swept = 0;
    let failed = 0;
    for (const quote of due) {
      try {
        await this.sweepQuote.execute({ quoteId: quote.id as string });
        swept++;
      } catch (error) {
        failed++;
        console.error("[quote] could not settle a due quote", {
          quoteId: quote.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { swept, failed };
  }
}
```

- [ ] **Step 3: Run the tests**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/quote/__tests__/sweep-quote.command.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/quote
git commit -m "feat(quote): the sweep ends a request nobody answered and a proposal nobody decided"
```

---
### Task 13: The quote emails

**Files:**
- Create: `.../notification/infrastructure/templates/quote-received.template.ts`
- Create: `.../notification/infrastructure/templates/quote-declined.template.ts`
- Create: `.../notification/infrastructure/templates/quote-accepted.template.ts`
- Create: `.../notification/infrastructure/templates/quote-expired.template.ts`
- Create: `.../notification/infrastructure/templates/provider-quote-requested.template.ts`
- Create: `.../notification/infrastructure/templates/provider-quote-accepted.template.ts`
- Create: `.../notification/infrastructure/templates/provider-quote-slot-taken.template.ts`
- Modify: `.../notification/infrastructure/templates/registry.ts`

**Interfaces:**
- Consumes: the ten `NotificationType` quote members, five of which Task 1 added.
- Produces: seven `TemplateModule` exports registered in `TEMPLATE_REGISTRY`.

- [ ] **Step 1: Write the seven templates**

Each is a copy of `booking-accepted.template.ts`'s shape: seven `Copy` objects (PT, EN, ES, FR, IT, DE, NL), a `BY_LOCALE: Record<string, Copy>` with eight keys (`pt-MZ` and `pt-PT` both pointing at `PT`), and a `TemplateModule` whose `render` reads only the payload fields it needs and links into the app. Written, not translated, for `pt-MZ`; the mockup's copy is the source. The links:

| Template | Type | Links to | pt-MZ subject |
|---|---|---|---|
| `quoteReceivedTemplate` | `QUOTE_RECEIVED` | `${appBaseUrl()}/quotes/${quoteId}` | "Recebeu uma proposta" (a revision: "A proposta foi actualizada") |
| `quoteDeclinedTemplate` | `QUOTE_DECLINED` | `${appBaseUrl()}/quotes/${quoteId}` | "O prestador não vai fazer este trabalho" |
| `quoteAcceptedTemplate` | `QUOTE_ACCEPTED` | `${appBaseUrl()}/bookings/${bookingId}` | "Proposta aceite — confirme o pagamento" |
| `quoteExpiredTemplate` | `QUOTE_EXPIRED` | `${appBaseUrl()}/quotes/${quoteId}` | "O pedido de orçamento expirou" |
| `providerQuoteRequestedTemplate` | `PROVIDER_QUOTE_REQUESTED` | `${appBaseUrl()}/provider` | "Novo pedido de orçamento" |
| `providerQuoteAcceptedTemplate` | `PROVIDER_QUOTE_ACCEPTED` | `${appBaseUrl()}/provider` | "A sua proposta foi aceite" |
| `providerQuoteSlotTakenTemplate` | `PROVIDER_QUOTE_SLOT_TAKEN` | `${appBaseUrl()}/provider` | "A hora proposta já não está livre" |

One written out in full, as the model for the other six — `quote-received.template.ts`:

```ts
import { emailLayout, buttonHtml } from "../../../../../../shared/infrastructure/email/templates/layout";
import { appBaseUrl, escapeHtml, pickCopy, type TemplateModule } from "./copy";

interface Copy {
  subject: (revision: boolean) => string;
  heading: (revision: boolean) => string;
  body: (service: string, amount: string) => string;
  cta: string;
  disclaimer: string;
}

const PT: Copy = {
  subject: (revision) => (revision ? "A proposta foi actualizada" : "Recebeu uma proposta"),
  heading: (revision) => (revision ? "Nova proposta do prestador" : "Já tem uma proposta"),
  body: (service, amount) =>
    `O prestador respondeu ao seu pedido de ${service} com ${amount}, uma data e a duração do trabalho. Veja os detalhes e decida antes de a proposta expirar.`,
  cta: "Ver a proposta",
  disclaimer: "Recebeu este email porque pediu um orçamento na Ntizo.",
};

const EN: Copy = {
  subject: (revision) => (revision ? "The quote was updated" : "You have a quote"),
  heading: (revision) => (revision ? "A new quote from the provider" : "Your quote has arrived"),
  body: (service, amount) =>
    `The provider answered your request for ${service} with ${amount}, a date and how long the work takes. Look it over and decide before it expires.`,
  cta: "View the quote",
  disclaimer: "You are receiving this because you asked for a quote on Ntizo.",
};

// ES, FR, IT, DE, NL follow, same shape.

const BY_LOCALE: Record<string, Copy> = {
  "pt-MZ": PT, "pt-PT": PT, "en-US": EN, "es-ES": ES, "fr-FR": FR, "it-IT": IT, "de-DE": DE, "nl-NL": NL,
};

/**
 * The provider priced the job. Carries the amount, because unlike a booking
 * acceptance this is the first time the customer learns what it costs — the
 * whole point of the quote path.
 */
export const quoteReceivedTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const service = typeof payload["serviceName"] === "string" ? payload["serviceName"] : "";
    const revision = payload["revision"] === true;
    const priceMinor = typeof payload["priceMinor"] === "number" ? payload["priceMinor"] : 0;
    const currency = typeof payload["currency"] === "string" ? payload["currency"] : "MZN";
    const amount = `${(priceMinor / 100).toLocaleString(locale)} ${currency}`;
    const quoteId = typeof payload["quoteId"] === "string" ? payload["quoteId"] : "";
    const url = `${appBaseUrl()}/quotes/${quoteId}`;
    const body = c.body(service, amount);

    return {
      subject: c.subject(revision),
      html: emailLayout({
        heading: c.heading(revision),
        bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">${escapeHtml(body)}</p>${buttonHtml(url, c.cta)}`,
        disclaimer: c.disclaimer,
      }),
      text: `${c.heading(revision)}\n\n${body}\n\n${url}`,
    };
  },
};
```

- [ ] **Step 2: Register them**

In `registry.ts`, import the seven and add:

```ts
  [NotificationType.QuoteReceived]: quoteReceivedTemplate,
  [NotificationType.QuoteAccepted]: quoteAcceptedTemplate,
  [NotificationType.QuoteDeclined]: quoteDeclinedTemplate,
  [NotificationType.QuoteExpired]: quoteExpiredTemplate,
  [NotificationType.ProviderQuoteRequested]: providerQuoteRequestedTemplate,
  [NotificationType.ProviderQuoteAccepted]: providerQuoteAcceptedTemplate,
  [NotificationType.ProviderQuoteSlotTaken]: providerQuoteSlotTakenTemplate,
```

`PROVIDER_QUOTE_DECLINED`, `PROVIDER_QUOTE_WITHDRAWN` and `PROVIDER_QUOTE_EXPIRED` are deliberately absent: a type with no template is an in-app row by the registry's own rule, and none of the three needs to reach a provider's inbox at night.

- [ ] **Step 3: Run and commit**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/notification && cd ../shared && bun run typecheck`
Expected: PASS.

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/notification
git commit -m "feat(quote): seven emails for the quote path"
```

---

### Task 14: The context's bootstrap and the composition root

**Files:**
- Create: `.../quote/bootstrap/index.ts`, `.../quote/index.ts`
- Create: `apps/backend/api/src/booking-opener.adapter.ts`
- Create: `apps/backend/api/src/start-thread.adapter.ts`
- Modify: `packages/backend/package.json` (exports)
- Modify: `apps/backend/api/src/graphql/private.ts`
- Modify: `apps/backend/api/src/scheduled.ts`
- Test: `.../quote/__tests__/bootstrap.test.ts`

**Interfaces:**
- Produces: `bootstrapQuote(deps)` → `{ adapters, useCases: { requestQuote, proposeQuote, declineQuote, rejectQuote, withdrawQuote, acceptQuote, internal: { sweepDue, markProposalStale } } }`, `QuoteBootstrap`; `bookingOpenerOver(createBookingFromQuote)`, `startThreadOver(startThread)`, `QUOTE_SWEEP_LIMIT` and the cron's fourth sweep.

- [ ] **Step 1: Write the bootstrap**

`.../quote/bootstrap/index.ts`:

```ts
import { DrizzleQuoteRepository } from "../infrastructure/repositories/drizzle/quote.repository";
import { DrizzleQuoteAttachmentRepository } from "../infrastructure/repositories/drizzle/quote-attachment.repository";
import { DrizzleQuoteServiceReader } from "../infrastructure/repositories/drizzle/quote-service.reader";
import { DrizzleQuoteProviderMemberReader } from "../infrastructure/repositories/drizzle/provider-member.reader";
import { DrizzleQuoteCustomerPhoneReader } from "../infrastructure/repositories/drizzle/customer-phone.reader";
import { DrizzleQuotePlatformSettingsReader } from "../infrastructure/repositories/drizzle/platform-settings.reader";
import { DrizzleSlotOverlapReader } from "../infrastructure/repositories/drizzle/slot-overlap.reader";
import { RequestQuoteCommand } from "../app/use-cases/request-quote.command";
import { ProposeQuoteCommand } from "../app/use-cases/propose-quote.command";
import { DeclineQuoteCommand } from "../app/use-cases/decline-quote.command";
import { RejectQuoteCommand } from "../app/use-cases/reject-quote.command";
import { WithdrawQuoteCommand } from "../app/use-cases/withdraw-quote.command";
import { AcceptQuoteCommand } from "../app/use-cases/accept-quote.command";
import { MarkProposalStaleInternalCommand } from "../app/use-cases/mark-proposal-stale.internal.command";
import { SweepQuoteCommand } from "../app/use-cases/sweep-quote.command";
import { SweepDueQuotesInternalCommand } from "../app/use-cases/sweep-due-quotes.internal.command";
import type { AttachmentStoragePort } from "../app/ports/outbound/attachment-storage.port";
import type { BookingOpenerPort } from "../app/ports/outbound/booking-opener.port";
import type { StartThreadPort } from "../app/ports/outbound/start-thread.port";
import type { RaiseNotificationInternalPort } from "../app/ports/outbound/raise-notification.port";
import { DrizzleUnitOfWork } from "../../../../../shared/infrastructure/unit-of-work";
import { OutboxAdapter } from "../../../../../shared/infrastructure/outbox/outbox.adapter";
import { DrizzleOutboxEventRepository } from "../../../../../shared/infrastructure/outbox/drizzle/outbox-event.repository";

export interface QuoteBootstrapDeps {
  /** The notification context's own raise command, injected at the composition root. */
  raiseNotification: RaiseNotificationInternalPort;
  /** The booking context's `CreateBookingFromQuoteCommand`, behind this context's port. */
  openBooking: BookingOpenerPort;
  /** The communication context's idempotent `StartThreadCommand`. */
  startThread: StartThreadPort;
  attachmentStorage: AttachmentStoragePort;
}

export function bootstrapQuote(deps: QuoteBootstrapDeps) {
  const quoteRepository = new DrizzleQuoteRepository();
  const attachmentRepository = new DrizzleQuoteAttachmentRepository();
  const serviceReader = new DrizzleQuoteServiceReader();
  const memberReader = new DrizzleQuoteProviderMemberReader();
  const phoneReader = new DrizzleQuoteCustomerPhoneReader();
  const settingsReader = new DrizzleQuotePlatformSettingsReader();
  const overlapReader = new DrizzleSlotOverlapReader();
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());

  // Hoisted: two callers each.
  const markProposalStale = new MarkProposalStaleInternalCommand(
    quoteRepository, serviceReader, settingsReader, unitOfWork, outboxPort, deps.raiseNotification,
  );
  const sweepQuote = new SweepQuoteCommand(
    quoteRepository, serviceReader, unitOfWork, outboxPort, deps.raiseNotification,
  );

  return {
    adapters: {
      quoteRepository, attachmentRepository, serviceReader, memberReader,
      phoneReader, settingsReader, overlapReader, unitOfWork, outboxPort,
    },
    useCases: {
      requestQuote: new RequestQuoteCommand(
        quoteRepository, attachmentRepository, serviceReader, deps.startThread,
        deps.attachmentStorage, unitOfWork, outboxPort, deps.raiseNotification,
      ),
      proposeQuote: new ProposeQuoteCommand(
        quoteRepository, attachmentRepository, memberReader, serviceReader, overlapReader,
        settingsReader, deps.attachmentStorage, unitOfWork, outboxPort, deps.raiseNotification,
      ),
      declineQuote: new DeclineQuoteCommand(
        quoteRepository, attachmentRepository, memberReader, deps.attachmentStorage,
        unitOfWork, outboxPort, deps.raiseNotification,
      ),
      rejectQuote: new RejectQuoteCommand(
        quoteRepository, attachmentRepository, deps.attachmentStorage, unitOfWork, outboxPort, deps.raiseNotification,
      ),
      withdrawQuote: new WithdrawQuoteCommand(
        quoteRepository, attachmentRepository, deps.attachmentStorage, unitOfWork, outboxPort, deps.raiseNotification,
      ),
      acceptQuote: new AcceptQuoteCommand(
        quoteRepository, serviceReader, phoneReader, deps.openBooking,
        unitOfWork, outboxPort, deps.raiseNotification, markProposalStale,
      ),
      internal: {
        sweepDue: new SweepDueQuotesInternalCommand(quoteRepository, sweepQuote),
        markProposalStale,
      },
    },
  };
}

export type QuoteBootstrap = ReturnType<typeof bootstrapQuote>;
```

`.../quote/index.ts` — the same shape the booking context's index uses: `export * from "./bootstrap";`, `export { Quote } from "./domain/aggregates/quote.aggregate";`, a value + `type XInput` export per use case, `export type` for every outbound port, and `export { DrizzleQuoteAttachmentRepository }` plus `export type { QuoteAttachmentRepositoryPort }` for the download route.

- [ ] **Step 2: Write the two composition-root adapters**

`apps/backend/api/src/booking-opener.adapter.ts`:

```ts
import type { BookingBootstrap } from "@ntizo/backend/modules/ntizo/bounded-contexts/booking";
import { SlotAlreadyTakenError } from "@ntizo/backend/modules/ntizo/bounded-contexts/booking";
import type { BookingOpenerPort } from "@ntizo/backend/modules/ntizo/bounded-contexts/quote";
import { QuoteSlotTakenError } from "@ntizo/backend/modules/ntizo/bounded-contexts/quote";

/**
 * The quote context's `BookingOpenerPort`, filled by the booking context's own
 * command — the same shape `bookingCompletionOver` uses for review → booking.
 *
 * **The one thing it does beyond forwarding is translate the calendar's
 * refusal.** `SlotAlreadyTakenError` is the booking context's word for it and
 * would reach the customer as a booking-shaped complaint about a quote they
 * were accepting; `QuoteSlotTakenError` is what `AcceptQuoteCommand` catches
 * to put the quote back in front of the provider, and what the accept page
 * knows how to explain.
 */
export function bookingOpenerOver(
  createBookingFromQuote: BookingBootstrap["useCases"]["createBookingFromQuote"],
): BookingOpenerPort {
  return {
    async openFromQuote(input) {
      try {
        return await createBookingFromQuote.execute(input);
      } catch (error) {
        if (error instanceof SlotAlreadyTakenError) throw new QuoteSlotTakenError();
        throw error;
      }
    },
  };
}
```

`apps/backend/api/src/start-thread.adapter.ts`:

```ts
import type { CommunicationBootstrap } from "@ntizo/backend/modules/ntizo/bounded-contexts/communication";
import type { StartThreadPort } from "@ntizo/backend/modules/ntizo/bounded-contexts/quote";

/** The pair's conversation, created or reused — `startThread` is idempotent. */
export function startThreadOver(
  startThread: CommunicationBootstrap["useCases"]["startThread"],
): StartThreadPort {
  return {
    async execute(input) {
      const { id } = await startThread.execute(input);
      return { threadId: id };
    },
  };
}
```

`SlotAlreadyTakenError` must be exported from the booking context's `index.ts` if it is not already (the exceptions are not re-exported today) — add `export { SlotAlreadyTakenError } from "./domain/exceptions";`.

- [ ] **Step 3: Add the package exports**

In `packages/backend/package.json`'s `exports`, beside the booking entries:

```json
    "./modules/ntizo/bounded-contexts/quote": "./src/modules/ntizo/bounded-contexts/quote/index.ts",
    "./modules/ntizo/read/quote": "./src/modules/ntizo/read/quote/index.ts",
    "./modules/ntizo/write/quote": "./src/modules/ntizo/write/quote/index.ts",
```

- [ ] **Step 4: Wire it in the private GraphQL composition root**

In `apps/backend/api/src/graphql/private.ts`, after `booking` is built (the quote context needs it):

```ts
  const quoteRead = bootstrapQuoteRead();
  const quote = bootstrapQuote({
    raiseNotification: notification.useCases.internal.raiseNotification,
    openBooking: bookingOpenerOver(booking.useCases.createBookingFromQuote),
    startThread: startThreadOver(communication.useCases.startThread),
    attachmentStorage: new AttachmentStorageAdapter(),
  });
```

and in the `fields` array:

```ts
      ...createQuoteWriteHandlers({ quote }),
      ...createQuoteReadHandlers({ quoteRead }),
```

- [ ] **Step 5: Add the fourth sweep to the cron**

In `apps/backend/api/src/scheduled.ts`, beside the other limits:

```ts
/**
 * How many due quotes one sweep may claim.
 *
 * The same budget as the booking sweep and for the same arithmetic: this is
 * database work, two hundred rows is two hundred short transactions, and the
 * clocks it watches are measured in hours rather than minutes, so whatever
 * goes stale in any one minute is a small fraction of the ceiling.
 */
export const QUOTE_SWEEP_LIMIT = 200;
```

and a fourth inner `try` after the charge sweep, in the same shape as the third:

```ts
        try {
          const quote = bootstrapQuote({
            raiseNotification: bootstrapNotification().useCases.internal.raiseNotification,
            openBooking: bookingOpenerForCron(),
            startThread: startThreadForCron(),
            attachmentStorage: new AttachmentStorageAdapter(),
          });
          const { swept, failed: quoteFailed } = await quote.useCases.internal.sweepDue.execute({
            limit: QUOTE_SWEEP_LIMIT,
          });

          if (quoteFailed > 0) {
            console.error(`[scheduled] quote sweep: ${swept} swept, ${quoteFailed} failed`);
          }
        } catch (error) {
          console.error("[scheduled] quote sweep threw", error);
        }
```

with the two cron-only port fillers beside `disputeThreadForCron`:

```ts
/**
 * The booking-opener and thread ports the quote bootstrap requires, for a
 * caller that will never accept or request anything.
 *
 * The sweep reaches `internal.sweepDue` and nothing else, but a bootstrap that
 * constructs every use case constructs the acceptance too. Same situation as
 * `disputeThreadForCron` above, and the same answer: build the real graph
 * lazily, inside `execute`, so a run that never accepts never builds it.
 */
function bookingOpenerForCron(): BookingOpenerPort {
  return {
    async openFromQuote(input) {
      const booking = bootstrapBooking({
        raiseNotification: bootstrapNotification().useCases.internal.raiseNotification,
        openDisputeThread: disputeThreadForCron(),
      });
      return await bookingOpenerOver(booking.useCases.createBookingFromQuote).openFromQuote(input);
    },
  };
}

function startThreadForCron(): StartThreadPort {
  return {
    async execute(input) {
      const communication = bootstrapCommunication({
        raiseNotification: bootstrapNotification().useCases.internal.raiseNotification,
        attachmentStorage: new AttachmentStorageAdapter(),
      });
      return await startThreadOver(communication.useCases.startThread).execute(input);
    },
  };
}
```

Both fillers build their graph lazily, inside `execute`, so a run that never accepts and never requests builds neither — which is every run of the sweep.

- [ ] **Step 6: Write the bootstrap smoke test**

`.../quote/__tests__/bootstrap.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { bootstrapQuote } from "../bootstrap";
import { FakeBookingOpener, FakeRaiser, FakeStartThread, FakeStorage } from "./support/fakes";

describe("bootstrapQuote", () => {
  it("constructs every use case the API and the cron reach", () => {
    const boot = bootstrapQuote({
      raiseNotification: new FakeRaiser(),
      openBooking: new FakeBookingOpener(),
      startThread: new FakeStartThread(),
      attachmentStorage: new FakeStorage(),
    });
    expect(Object.keys(boot.useCases).sort()).toEqual([
      "acceptQuote", "declineQuote", "internal", "proposeQuote", "rejectQuote", "requestQuote", "withdrawQuote",
    ]);
    expect(Object.keys(boot.useCases.internal).sort()).toEqual(["markProposalStale", "sweepDue"]);
  });
});
```

- [ ] **Step 7: Run and commit**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/quote && bun run typecheck`
Expected: PASS.

```bash
git add packages/backend apps/backend/api/src
git commit -m "feat(quote): the context's bootstrap and its two cross-context adapters"
```

---

### Task 15: The GraphQL write surface

**Files:**
- Create: `packages/backend/src/modules/ntizo/write/quote/graphql/schema/mutations.ts`
- Create: `.../write/quote/graphql/handlers/mutations.handlers.ts`
- Create: `.../write/quote/index.ts`
- Modify: `packages/backend/src/modules/ntizo/write/schema.ts`
- Test: `.../write/quote/__tests__/mutations.handlers.test.ts`

**Interfaces:**
- Produces: `quoteWriteSchema` (fields `quote.request`, `.propose`, `.decline`, `.reject`, `.withdraw`, `.accept`, flattened on the wire as `quoteRequest`, `quotePropose`, `quoteDecline`, `quoteReject`, `quoteWithdraw`, `quoteAccept`), `createQuoteWriteHandlers({ quote })`, `QuoteWriteModule`.

- [ ] **Step 1: Write the schema**

`.../write/quote/graphql/schema/mutations.ts`:

```ts
import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { QUOTE_CUSTOMER_REJECT_REASONS, QUOTE_PROVIDER_DECLINE_REASONS } from "@ntizo/shared";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/** The same address shape `bookingSubmit` takes: the client sends the fields, not an id. */
const addressInput = z.object({
  label: z.string().trim().min(1),
  line: z.string().trim().min(1),
  city: z.string().trim().min(1),
  district: z.string().trim().min(1).nullable().optional(),
  directions: z.string().trim().max(500).nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

const attachmentsInput = z.array(z.object({ storageKey: z.string().min(1) })).max(5).optional();

export const requestQuote = defineMutation({
  input: zodSchema(
    z.object({
      serviceId: z.string().min(1),
      description: z.string().trim().min(1).max(4000),
      neededBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      address: addressInput.nullable().optional(),
      attachments: attachmentsInput,
      locale: z.string().min(2),
    }),
  ),
  output: zodSchema(z.object({ quoteId: z.string().min(1), respondBy: z.string() })),
  docs: { summary: "Ask one provider to price a job", tags: ["Quote"] },
});

export const proposeQuote = defineMutation({
  input: zodSchema(
    z.object({
      quoteId: z.string().min(1),
      priceMinor: z.number().int().positive(),
      startsAt: z.string().datetime(),
      durationMinutes: z.number().int().positive().max(24 * 60),
      providerMemberId: z.string().min(1),
      note: z.string().trim().max(2000).nullable().optional(),
      attachments: attachmentsInput,
    }),
  ),
  /**
   * `validUntil` is null when the compare-and-swap lost: a colleague's
   * proposal stands and this call changed nothing. Inventing a deadline here
   * would be a lie the screen would render as a countdown.
   */
  output: zodSchema(z.object({ quoteId: z.string().min(1), validUntil: z.string().nullable() })),
  docs: { summary: "Answer a request with a price, a date and a duration", tags: ["Quote"] },
});

export const declineQuote = defineMutation({
  input: zodSchema(
    z.object({
      quoteId: z.string().min(1),
      reason: z.enum(QUOTE_PROVIDER_DECLINE_REASONS),
      note: z.string().trim().max(2000).nullable().optional(),
      attachments: attachmentsInput,
    }),
  ),
  output: zodSchema(z.object({ quoteId: z.string().min(1) })),
  docs: { summary: "Refuse a request, or take a proposal back", tags: ["Quote"] },
});

export const rejectQuote = defineMutation({
  input: zodSchema(
    z.object({
      quoteId: z.string().min(1),
      reason: z.enum(QUOTE_CUSTOMER_REJECT_REASONS),
      note: z.string().trim().max(2000).nullable().optional(),
      attachments: attachmentsInput,
    }),
  ),
  output: zodSchema(z.object({ quoteId: z.string().min(1) })),
  docs: { summary: "Refuse a proposal", tags: ["Quote"] },
});

export const withdrawQuote = defineMutation({
  input: zodSchema(
    z.object({
      quoteId: z.string().min(1),
      note: z.string().trim().max(2000).nullable().optional(),
      attachments: attachmentsInput,
    }),
  ),
  output: zodSchema(z.object({ quoteId: z.string().min(1) })),
  docs: { summary: "Take a request back before it is answered", tags: ["Quote"] },
});

export const acceptQuote = defineMutation({
  input: zodSchema(z.object({ quoteId: z.string().min(1), address: addressInput.nullable().optional() })),
  output: zodSchema(z.object({ bookingId: z.string().min(1), payBy: z.string() })),
  docs: { summary: "Accept a proposal — creates the booking and pushes the payment", tags: ["Quote"] },
});

export const quoteWriteSchema = defineGraphQLSchema(
  {
    quote: {
      request: requestQuote,
      propose: proposeQuote,
      decline: declineQuote,
      reject: rejectQuote,
      withdraw: withdrawQuote,
      accept: acceptQuote,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
```

- [ ] **Step 2: Write the handlers**

`.../write/quote/graphql/handlers/mutations.handlers.ts`:

```ts
import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { QuoteBootstrap } from "../../../../bounded-contexts/quote/bootstrap";
import { quoteWriteSchema } from "../schema/mutations";

export interface QuoteWriteModule {
  readonly quote: QuoteBootstrap;
}

function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({ message: "Sign in to ask for a quote", code: "UNAUTHENTICATED" });
  }
  return requesterUserId;
}

/** `null` from a losing compare-and-swap answers with the id, not an error: the other member's write stands. */
export function createQuoteWriteHandlers(mod: QuoteWriteModule) {
  const uc = mod.quote.useCases;

  return graphqlRoutes(quoteWriteSchema)
    .handle("quote.request", async (args, ctx) =>
      uc.requestQuote.execute({
        customerId: requireUser(ctx),
        serviceId: args.input.serviceId,
        description: args.input.description,
        neededBy: args.input.neededBy ?? null,
        address: args.input.address
          ? {
              label: args.input.address.label,
              line: args.input.address.line,
              city: args.input.address.city,
              district: args.input.address.district ?? null,
              directions: args.input.address.directions ?? null,
              lat: args.input.address.lat ?? null,
              lng: args.input.address.lng ?? null,
            }
          : null,
        attachments: args.input.attachments ?? [],
        locale: args.input.locale,
      }),
    )
    .handle("quote.propose", async (args, ctx) => {
      const result = await uc.proposeQuote.execute({
        quoteId: args.input.quoteId,
        requesterUserId: requireUser(ctx),
        priceMinor: args.input.priceMinor,
        startsAt: new Date(args.input.startsAt),
        durationMinutes: args.input.durationMinutes,
        providerMemberId: args.input.providerMemberId,
        note: args.input.note ?? null,
        attachments: args.input.attachments ?? [],
      });
      return result ?? { quoteId: args.input.quoteId, validUntil: null };
    })
    .handle("quote.decline", async (args, ctx) => {
      await uc.declineQuote.execute({
        quoteId: args.input.quoteId,
        requesterUserId: requireUser(ctx),
        reason: args.input.reason,
        note: args.input.note ?? null,
        attachments: args.input.attachments ?? [],
      });
      return { quoteId: args.input.quoteId };
    })
    .handle("quote.reject", async (args, ctx) => {
      await uc.rejectQuote.execute({
        quoteId: args.input.quoteId,
        requesterUserId: requireUser(ctx),
        reason: args.input.reason,
        note: args.input.note ?? null,
        attachments: args.input.attachments ?? [],
      });
      return { quoteId: args.input.quoteId };
    })
    .handle("quote.withdraw", async (args, ctx) => {
      await uc.withdrawQuote.execute({
        quoteId: args.input.quoteId,
        requesterUserId: requireUser(ctx),
        note: args.input.note ?? null,
        attachments: args.input.attachments ?? [],
      });
      return { quoteId: args.input.quoteId };
    })
    .handle("quote.accept", async (args, ctx) =>
      uc.acceptQuote.execute({
        quoteId: args.input.quoteId,
        requesterUserId: requireUser(ctx),
        address: args.input.address
          ? {
              label: args.input.address.label,
              line: args.input.address.line,
              city: args.input.address.city,
              district: args.input.address.district ?? null,
              directions: args.input.address.directions ?? null,
              lat: args.input.address.lat ?? null,
              lng: args.input.address.lng ?? null,
            }
          : null,
      }),
    )
    .build();
}
```

`.../write/quote/index.ts`:

```ts
export { quoteWriteSchema } from "./graphql/schema/mutations";
export { createQuoteWriteHandlers, type QuoteWriteModule } from "./graphql/handlers/mutations.handlers";
```

Add `quoteWriteSchema` to the import list and the `mergeGraphQLSchemas(...)` call in `write/schema.ts`.

- [ ] **Step 3: Write the handler test**

`.../write/quote/__tests__/mutations.handlers.test.ts` asserts the two things a handler can get wrong: that the actor comes from the session and never from the client, and that an anonymous caller is refused.

```ts
import { describe, expect, it } from "bun:test";
import { createQuoteWriteHandlers } from "../graphql/handlers/mutations.handlers";

function handlersWith(spy: { calls: unknown[] }) {
  const uc = {
    requestQuote: { async execute(input: unknown) { spy.calls.push(input); return { quoteId: "q-1", respondBy: "x" }; } },
    proposeQuote: { async execute(input: unknown) { spy.calls.push(input); return { quoteId: "q-1", validUntil: "x" }; } },
    declineQuote: { async execute(input: unknown) { spy.calls.push(input); return { quoteId: "q-1" }; } },
    rejectQuote: { async execute(input: unknown) { spy.calls.push(input); return { quoteId: "q-1" }; } },
    withdrawQuote: { async execute(input: unknown) { spy.calls.push(input); return { quoteId: "q-1" }; } },
    acceptQuote: { async execute(input: unknown) { spy.calls.push(input); return { bookingId: "bk-1", payBy: "x" }; } },
  };
  return createQuoteWriteHandlers({ quote: { useCases: uc } } as never);
}

function fieldNamed(handlers: ReturnType<typeof createQuoteWriteHandlers>, name: string) {
  const field = handlers.find((f: { name?: string }) => f.name === name || (f as { field?: string }).field === name);
  expect(field).toBeDefined();
  return field as unknown as { resolve: (args: unknown, ctx: unknown) => Promise<unknown> };
}

describe("quote write handlers", () => {
  it("takes the customer from the session, never from the input", async () => {
    const spy = { calls: [] as unknown[] };
    const handlers = handlersWith(spy);
    const ctx = { requesterUserId: "cust-1", role: "customer", firstName: "Salif" };
    await fieldNamed(handlers, "quoteRequest").resolve(
      { input: { serviceId: "svc-1", description: "x", locale: "pt-MZ", customerId: "someone-else" } },
      ctx,
    );
    expect((spy.calls[0] as { customerId: string }).customerId).toBe("cust-1");
  });

  it("refuses an anonymous caller", async () => {
    const handlers = handlersWith({ calls: [] });
    await expect(
      fieldNamed(handlers, "quoteAccept").resolve({ input: { quoteId: "q-1" } }, { requesterUserId: null, role: null }),
    ).rejects.toThrow(/UNAUTHENTICATED|Sign in/);
  });
});
```

If the built field objects do not expose `name` in this shape, read one from `createBookingWriteHandlers` in a scratch script and adjust `fieldNamed` to match — the assertion is what matters, not the accessor.

- [ ] **Step 4: Run, introspect, commit**

Run: `cd packages/backend && bun test src/modules/ntizo/write/quote && bun run typecheck`

Then verify the wire names against a running server rather than by reading the source (an earlier phase lost a round to exactly this): start the API locally and introspect, expecting `quoteRequest`, `quotePropose`, `quoteDecline`, `quoteReject`, `quoteWithdraw`, `quoteAccept`.

```bash
git add packages/backend/src/modules/ntizo/write
git commit -m "feat(quote): the six quote mutations"
```

---

### Task 16: The GraphQL read surface

**Files:**
- Create: `packages/backend/src/modules/ntizo/read/quote/app/ports/outbound/quote-read.repository.port.ts`
- Create: `.../read/quote/app/use-cases/{to-customer-quote-dto,to-provider-quote-dto}.ts`
- Create: `.../read/quote/app/use-cases/{list-my-quotes,get-my-quote,list-provider-quotes,get-provider-quote,get-provider-quote-counts}.projection.ts`
- Create: `.../read/quote/infra/repositories/drizzle/quote-read.repository.ts`
- Create: `.../read/quote/graphql/schema/queries.ts`, `.../graphql/handlers/queries.handlers.ts`
- Create: `.../read/quote/bootstrap/index.ts`, `.../read/quote/index.ts`
- Modify: `packages/backend/src/modules/ntizo/read/schema.ts`
- Test: `.../read/quote/__tests__/quote-read.repository.test.ts`

**Interfaces:**
- Produces: `bootstrapQuoteRead()` → `{ adapters: { repo }, useCases: { listMine, getMine, listForProvider, getForProvider, countsForProvider, providerRead } }`, `QuoteReadBootstrap`, `createQuoteReadHandlers({ quoteRead })`, and the wire fields `quoteMine`, `quoteById`, `quoteForProvider`, `quoteByIdForProvider`, `quoteCountsForProvider`.

- [ ] **Step 1: Write the read port**

`.../read/quote/app/ports/outbound/quote-read.repository.port.ts`:

```ts
import type { QuoteAttachmentRow, QuoteProposalRow } from "../../../../shared/infrastructure/database/quote/schemas";

/** One quote joined to the facts each side's screen needs. */
export interface QuoteListRow {
  id: string;
  status: string;
  serviceId: string;
  serviceName: string;
  providerId: string;
  providerName: string;
  providerSlug: string;
  providerVerified: boolean;
  timezone: string;
  threadId: string;
  expiresAt: Date | null;
  expiredCause: string | null;
  closedReason: string | null;
  closedNote: string | null;
  bookingId: string | null;
  requestedAt: Date;
  description: string;
  neededBy: string | null;
  addressLabel: string | null;
  addressLine: string | null;
  addressCity: string | null;
  addressDistrict: string | null;
  addressDirections: string | null;
  customerId: string;
  customerFirstName: string;
  attachmentCount: number;
}

export interface QuoteProposalWithMember extends QuoteProposalRow {
  memberFirstName: string;
}

export interface QuoteReadRepositoryPort {
  /**
   * One tab of the customer's own quotes, newest first. The customer id is a
   * `WHERE` parameter, never a post-read check.
   */
  listForCustomer(customerId: string, tab: "open" | "history", limit: number, offset: number): Promise<QuoteListRow[]>;
  countsForCustomer(customerId: string): Promise<{ open: number; history: number }>;
  /** Null for a quote that is not this customer's — indistinguishable from missing. */
  findForCustomer(quoteId: string, customerId: string): Promise<QuoteListRow | null>;

  listForProvider(providerId: string, tab: "toAnswer" | "waiting" | "history", limit: number, offset: number): Promise<QuoteListRow[]>;
  countsForProvider(providerId: string): Promise<{ toAnswer: number; waiting: number; history: number }>;
  findForProvider(quoteId: string, providerId: string): Promise<QuoteListRow | null>;

  /** Every proposal of these quotes, oldest first, with the member's first name. */
  proposalsFor(quoteIds: string[]): Promise<Map<string, QuoteProposalWithMember[]>>;
  attachmentsFor(quoteIds: string[]): Promise<Map<string, QuoteAttachmentRow[]>>;
  /** The provider's live rate, and who performs the service — the proposal form's two facts. */
  providerFormFacts(providerId: string, serviceId: string): Promise<{ commissionBps: number; performers: { id: string; firstName: string }[] }>;
  /** How many bookings this customer has completed on the platform. */
  completedBookingsFor(customerId: string): Promise<number>;
}
```

- [ ] **Step 2: Write the mappers and projections**

`to-customer-quote-dto.ts` maps a `QuoteListRow` plus its proposals and attachments onto `customerQuoteReadModel` / `customerQuoteDetailReadModel`; `to-provider-quote-dto.ts` does the mirror, and **drops `addressLabel`, `addressLine` and `addressDirections` entirely** — the provider's DTO has no field for them, so the reveal rule is enforced by the shape rather than by a screen. It also truncates the description to 160 characters for `descriptionSnippet`.

Each projection is the booking read side's shape: a constructor taking the repository, an `execute` that reads and maps, no authorisation (that lives in the handler). Example, `get-provider-quote.projection.ts`:

```ts
import type { ProviderQuoteDetailDTO } from "@ntizo/shared/read-models";
import type { QuoteReadRepositoryPort } from "../ports/outbound/quote-read.repository.port";
import { toProviderQuoteDetailDTO } from "./to-provider-quote-dto";

export interface GetProviderQuoteInput {
  providerId: string;
  quoteId: string;
}

export class GetProviderQuoteProjection {
  constructor(private readonly repo: QuoteReadRepositoryPort) {}

  async execute(input: GetProviderQuoteInput): Promise<ProviderQuoteDetailDTO | null> {
    const row = await this.repo.findForProvider(input.quoteId, input.providerId);
    if (!row) return null;
    const [proposals, attachments, facts, completed] = await Promise.all([
      this.repo.proposalsFor([row.id]),
      this.repo.attachmentsFor([row.id]),
      this.repo.providerFormFacts(input.providerId, row.serviceId),
      this.repo.completedBookingsFor(row.customerId),
    ]);
    return toProviderQuoteDetailDTO(
      row,
      proposals.get(row.id) ?? [],
      attachments.get(row.id) ?? [],
      facts,
      completed,
    );
  }
}
```

- [ ] **Step 3: Write the Drizzle read repository**

`.../read/quote/infra/repositories/drizzle/quote-read.repository.ts` — one selection shared by every list, built like the booking read repository's `selectedColumns`, joining `quote` to `service`, `provider`, `serviceTranslation` (requested locale then source), `profile` (customer's first name, falling back to the local part of `user.email`), `providerDocument` through the `verifiedAggregate` sub-select, and a `count` of `quote_attachment`. The tab predicates:

```ts
const TAB_STATUSES = {
  open: ["REQUESTED", "PROPOSED"],
  history: ["ACCEPTED", "DECLINED", "REJECTED", "WITHDRAWN", "EXPIRED"],
  toAnswer: ["REQUESTED"],
  waiting: ["PROPOSED"],
} as const;
```

with `history` shared by both sides. Ordering is `expires_at asc` on the two live tabs (the most urgent first, which is what both screens are for) and `created_at desc, id desc` on history. Paging is the `limit + 1` probe the other lists use, so `hasMore` is honest.

- [ ] **Step 4: Write the queries and handlers**

`.../read/quote/graphql/schema/queries.ts` mirrors the booking read schema exactly, with `CUSTOMER_QUOTE_TABS` and `PROVIDER_QUOTE_TABS` as the tab enums and the read models from `@ntizo/shared/read-models` as outputs:

```ts
export const getMyQuote = defineQuery({
  input: zodSchema(z.object({ quoteId: z.string().min(1) })),
  output: zodSchema(customerQuoteDetailReadModel.nullable()),
  docs: { summary: "One of your own quotes", tags: ["Quote"] },
});
// listMyQuotes, listProviderQuotes, getProviderQuote, providerQuoteCounts follow the same shape.

export const quoteReadSchema = defineGraphQLSchema(
  {
    quote: {
      mine: listMyQuotes,
      byId: getMyQuote,
      forProvider: listProviderQuotes,
      byIdForProvider: getProviderQuote,
      countsForProvider: providerQuoteCounts,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
```

The handlers reuse the booking read side's own `assertMayReadWorkspace` — import it from `../../../booking/graphql/handlers/queries.handlers` rather than writing a second copy, since it is already exported and takes the `providerRead` port explicitly:

```ts
    .handle("quote.forProvider", async (args, ctx) => {
      await assertMayReadWorkspace(asNtizoGraphqlContext(ctx), args.input.providerId, uc.providerRead);
      return uc.listForProvider.execute({
        providerId: args.input.providerId,
        tab: args.input.tab,
        limit: args.input.limit ?? 20,
        offset: args.input.offset ?? 0,
      });
    })
```

`quote.mine` and `quote.byId` take `requireUser(ctx)` as the customer id and nothing from the client.

Add `quoteReadSchema` to `read/schema.ts`.

- [ ] **Step 5: Write the DB-backed read test, with a second user**

`.../read/quote/__tests__/quote-read.repository.test.ts` — fixtures for **two** customers and **two** providers, then:

```ts
test("a second customer sees nothing of the first customer's quote", async () => {
  expect(await run(() => repo.findForCustomer(quoteId, otherCustomerId))).toBeNull();
  const theirs = await run(() => repo.listForCustomer(otherCustomerId, "open", 20, 0));
  expect(theirs.map((q) => q.id)).not.toContain(quoteId);
});

test("a second workspace sees nothing of the first workspace's quote", async () => {
  expect(await run(() => repo.findForProvider(quoteId, otherProviderId))).toBeNull();
});

test("the tabs split the seven statuses between them and nothing falls out", async () => {
  const open = await run(() => repo.listForCustomer(customerId, "open", 50, 0));
  const history = await run(() => repo.listForCustomer(customerId, "history", 50, 0));
  const seen = new Set([...open, ...history].map((q) => q.status));
  expect(seen.has("REQUESTED")).toBe(true);
  expect(seen.has("DECLINED")).toBe(true);
  const counts = await run(() => repo.countsForCustomer(customerId));
  expect(counts.open + counts.history).toBe(open.length + history.length);
});
```

The first two are the tests this codebase has needed four times: a fixture holding one person's data passes whether or not the filter exists.

- [ ] **Step 6: Run and commit**

Run: `cd packages/backend && bun test src/modules/ntizo/read/quote && bun run typecheck`

```bash
git add packages/backend/src/modules/ntizo/read
git commit -m "feat(quote): the customer's and the workspace's quote reads"
```

---

### Task 17: `quoteForm` on the public service page

**Files:**
- Modify: `packages/shared/src/read-models/public/service/service.schema.ts`
- Modify: `.../catalog/app/ports/outbound/service-read.repository.port.ts` (`ServiceDetailRow`)
- Modify: `.../catalog/infrastructure/repositories/drizzle/service-read.repository.ts` (`getPublishedById`)
- Modify: `packages/backend/src/modules/ntizo/public/catalog/app/use-cases/get-service.projection.ts`
- Test: `.../read/catalog/__tests__/` — extend the existing public service test if one exists, else add `service-detail-quote-form.test.ts` beside the other DB tests

**Interfaces:**
- Produces: `serviceDetailReadModel.quoteForm: { responseHours, askDeadline, askPhotos, askLocation, intro } | null`.

- [ ] **Step 1: Add the field to the read model**

In `serviceDetailReadModel`, after `options`:

```ts
  /**
   * What this provider asks a customer who wants a price, and what they
   * promise back. Null for a priced service. It is the provider's own
   * configuration and has always been theirs to publish — the page that shows
   * "responde em 48 h" is the first thing to read it.
   */
  quoteForm: z
    .object({
      responseHours: z.number().int(),
      askDeadline: z.boolean(),
      askPhotos: z.boolean(),
      askLocation: z.boolean(),
      intro: z.string().nullable(),
    })
    .nullable(),
```

- [ ] **Step 2: Carry it through the row, the query and the projection**

`ServiceDetailRow` gains `quoteForm: { responseHours: number; askDeadline: boolean; askPhotos: boolean; askLocation: boolean; intro: string | null } | null;`.

In `getPublishedById`, add to the `Promise.all` beside the translations:

```ts
      db.select().from(serviceQuoteForm).where(eq(serviceQuoteForm.serviceId, id)).limit(1),
```

and to the returned row:

```ts
      quoteForm: quoteFormRows[0]
        ? {
            responseHours: quoteFormRows[0].responseHours,
            askDeadline: quoteFormRows[0].askDeadline,
            askPhotos: quoteFormRows[0].askPhotos,
            askLocation: quoteFormRows[0].askLocation,
            intro: quoteFormRows[0].intro,
          }
        : null,
```

In `get-service.projection.ts`, add `quoteForm: r.quoteForm,` beside `options`.

- [ ] **Step 3: Test, run and commit**

The test asserts a quote service's detail carries the form and a priced one carries `null`:

```ts
test("a quote service publishes its form; a priced one publishes null", async () => {
  const quoted = await run(() => projection.execute({ id: quoteServiceId, locale: "pt-MZ" }));
  expect(quoted?.quoteForm).toMatchObject({ responseHours: 24, askLocation: false });
  const priced = await run(() => projection.execute({ id: pricedServiceId, locale: "pt-MZ" }));
  expect(priced?.quoteForm).toBeNull();
});
```

Run: `cd packages/backend && bun test src/modules/ntizo/read/catalog src/modules/ntizo/public && bun run typecheck`

```bash
git add packages/shared packages/backend/src/modules/ntizo
git commit -m "feat(quote): the service page can read the provider's quote form"
```

---

### Task 18: The attachment download route

**Files:**
- Create: `apps/backend/api/src/quote-attachments.ts`
- Modify: `apps/backend/api/src/api.ts` (mount it)
- Test: `apps/backend/api/src/__tests__/quote-attachments.test.ts`

**Interfaces:**
- Consumes: `QuoteAttachmentRepositoryPort` (Task 4), `isPlatformAdmin` (existing).
- Produces: `mountQuoteAttachments(app, deps)` serving `GET /api/quote/attachments/:id`.

- [ ] **Step 1: Write the route**

`apps/backend/api/src/quote-attachments.ts`:

```ts
import type { Hono } from "hono";
import type { QuoteAttachmentRepositoryPort } from "@ntizo/backend/modules/ntizo/bounded-contexts/quote";
import { getAuth } from "@ntizo/backend/modules/better-auth";
import { isPlatformAdmin } from "./admin-access";
import type { AppBindings } from "./types";

export interface QuoteAttachmentDeps {
  readonly quoteAttachmentRepository: QuoteAttachmentRepositoryPort;
}

function safeFilenameForHeader(fileName: string): string {
  // eslint-disable-next-line no-control-regex -- deliberately matching CR/LF and other control bytes.
  return fileName.replace(/["\\\r\n\x00-\x1f\x7f]/g, "");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A quote's files, served the way a document is and never the way media is:
 * permission and existence are answered together, so a stranger guessing ids
 * learns nothing from the difference between 403 and 404; and
 * `content-disposition: attachment`, never `inline`, because the file came
 * from a stranger and is opened by the other side of a deal — forcing a
 * download takes away its ability to execute on our origin.
 *
 * **Upload goes through the messaging route, not a new one.** The key
 * convention (`attachment/<userId>/…`), the byte-sniffed content type and the
 * size limit are all already enforced there, and a second uploader would be a
 * second place for those three rules to drift.
 */
export function mountQuoteAttachments(app: Hono<{ Bindings: AppBindings }>, deps: QuoteAttachmentDeps) {
  app.get("/api/quote/attachments/:id", async (c) => {
    const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "UNAUTHENTICATED" }, 401);

    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "FORBIDDEN" }, 403);

    let row = await deps.quoteAttachmentRepository.findVisible(id, session.user.id);
    if (!row && (await isPlatformAdmin(session.user.id))) {
      row = await deps.quoteAttachmentRepository.findAny(id);
    }
    if (!row) return c.json({ error: "FORBIDDEN" }, 403);

    const bucket = c.env.ATTACHMENTS_BUCKET;
    if (!bucket) return c.json({ error: "ATTACHMENT_STORAGE_UNCONFIGURED" }, 503);

    const object = await bucket.get(row.storageKey);
    if (!object) return c.json({ error: "NOT_FOUND" }, 404);

    return new Response(object.body as unknown as BodyInit, {
      headers: {
        "content-type": row.contentType,
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${safeFilenameForHeader(row.fileName)}"`,
      },
    });
  });
}
```

- [ ] **Step 2: Mount it**

In `apps/backend/api/src/api.ts`, beside `mountAttachments`:

```ts
  mountQuoteAttachments(app, { quoteAttachmentRepository: new DrizzleQuoteAttachmentRepository() });
```

- [ ] **Step 3: Write the route test**

`apps/backend/api/src/__tests__/quote-attachments.test.ts` mirrors the existing attachments test: an anonymous request gets 401; a signed-in caller with no visible row gets 403 whether the id exists or not; a visible row is served with `content-disposition: attachment` and `cache-control: private, no-store`; a malformed id gets 403 without touching the repository.

- [ ] **Step 4: Run and commit**

Run: `cd apps/backend/api && bun test src/__tests__/quote-attachments.test.ts`

```bash
git add apps/backend/api/src
git commit -m "feat(quote): a quote's files download behind the same posture documents use"
```

---

## After the last task

Run the whole suite and the typecheck from the repo root:

```bash
bun run test
bun run check-types
```

Then deploy the API to dev so the web plan has a server to build against (the migration is applied by hand per stage, and Task 2 already applied it to dev):

```bash
cd apps/backend/api && bun run deploy:dev
```

Introspect the deployed schema once and confirm the eleven new fields are on the wire: `quoteRequest`, `quotePropose`, `quoteDecline`, `quoteReject`, `quoteWithdraw`, `quoteAccept`, `quoteMine`, `quoteById`, `quoteForProvider`, `quoteByIdForProvider`, `quoteCountsForProvider`.

**Do not open a pull request yet.** The web plan is the second half; the checkout spec's rule stands, that a mutation nobody can call and a screen with no mutation behind it are the same kind of unfinished.

## Deviations from the spec

1. **The address travels as fields, not as an `addressId`.** The spec's GraphQL table shows `quoteRequest({ …, addressId? })` and `quoteAccept({ quoteId, addressId? })`. The shipped `bookingSubmit` takes the address fields themselves, and following it keeps one convention, avoids a new `CustomerAddressReaderPort` in this context, and keeps the write path free of a cross-context read. The client still picks from the address book; it sends what it picked.
2. **`quotePropose` answers a lost compare-and-swap with a null `validUntil` rather than an error.** The spec does not say. Two members pressing "Enviar proposta" at once is the ordinary case, and an error would report a failure that did not happen: the proposal stands, it is simply the other member's. Null is what says "nothing of yours is counting down".
3. **Three provider-side notifications ship without an email template** (`PROVIDER_QUOTE_DECLINED`, `PROVIDER_QUOTE_WITHDRAWN`, `PROVIDER_QUOTE_EXPIRED`). The spec's table already marks them "no" for email; this records that the registry's absent-template rule is how that is implemented.
4. **A quote-born booking is inserted with capacity 1.** The spec does not mention seats. A time the provider chose by hand has no `member_availability` rule behind it, and seats exist for a rule that offers one slot to several customers.

## Self-review

- **Spec coverage.** Every section of the design has a task: the state machine and both clocks (Tasks 3, 12), the data model including the booking's origin check and the settings column (Task 2), acceptance in one transaction and the slot-taken path (Tasks 10, 11), every port and its filler (Tasks 5, 6, 14), the events (Task 3), all ten notifications (Task 13), the whole GraphQL surface with its error codes (Tasks 15, 16), the reveal rule (Task 16's provider DTO), the one-open-quote rule (Task 2's index plus Task 4's translation), attachments on all three steps (Tasks 4, 7, 8, 9, 18), and the public `quoteForm` (Task 17). The web half is the second plan, as the spec's phasing says.
- **Placeholders.** None: every step carries the code or the exact edit it asks for. Two places name a following task for a symbol that does not exist yet (`ProviderQuoteWithdrawn` in Task 9, the cron's two adapters in Task 12) and each says what to write if the compiler blocks the task early.
- **Type consistency.** `QuoteStatus` is the database enum's type throughout; `Quote#toProps()` is what the repository and the fakes both use; `OpenBookingFromQuoteInput` (Task 5) and `CreateBookingFromQuoteInput` (Task 10) are field-for-field identical, which is what lets `bookingOpenerOver` forward without mapping; `raiseQuietly` has the same signature in both contexts; the read models named in Task 1 are the ones Task 16's queries return.
- **Scope.** One subsystem, one plan. The web plan follows.
