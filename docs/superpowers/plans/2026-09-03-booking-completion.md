# Closing a Booking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A booking reaches an ending. The provider marks the work done, the customer has three days to answer, and the platform closes what nobody answers — after asking first.

**Architecture:** Onion Lasagna, by the book. The booking aggregate gains six transitions and the commands that drive them; the existing minute-by-minute sweep gains two clocks, both carried on the `expires_at` column it already reads. A dispute is a `support_request` of a new kind, reusing the thread, attachments, admin queue and resolve action the support inbox shipped this week. The review context completes a booking through an outbound port the composition root fills, the same shape the booking context already uses to raise notifications. The web app gains two provider actions and one admin queue.

**Tech Stack:** Bun, TypeScript, `@cosmneo/onion-lasagna@1.0.0-beta.3` (GraphQL field kit), Drizzle + Postgres (named schemas), Zod read models in `@ntizo/shared`, React 19 + TanStack Start/Router/Query, react-i18next, Vitest (web) and `bun:test` (backend).

**Spec:** `docs/superpowers/specs/2026-09-03-booking-completion-design.md` — read it before Task 1. Phases 1 and 2 of this line (`Reservas`, `Visão geral`) are merged and deployed; this plan builds on them.

## Global Constraints

- **The platform never asserts that work happened without asking first.** The sweep's first firing on a confirmed booking is a question to the provider, not a transition. Only a booking that was asked and never answered is marked done by the platform.
- **`markDone` is refused before the appointment has ended** (BR-C1), for every caller including administrators and the sweep.
- **A review published at `MARKED_DONE` completes the booking; a review is refused at `DISPUTED`** (BR-C3).
- **A dispute may only be opened by the booking's own customer, only at `MARKED_DONE`** (BR-C4), and only an administrator leaves `DISPUTED` (BR-C5).
- **Money moves nowhere in this phase** (BR-C7). `dispute_upheld` is recorded for the wallet work to read later.
- **A failed notification never fails the write** (BR-C6) — `raiseQuietly`, the port phase 1 introduced, unchanged.
- **Tiers do not import each other's `app/` trees.** A port needed across a boundary is declared again on the caller's side; `bounded-contexts/communication/app/ports/outbound/raise-notification.port.ts` is the precedent.
- **All eight locales** (`en-US pt-PT pt-MZ es-ES de-DE fr-FR it-IT nl-NL`) get every new key, in that file's own register (es **tú**, fr **vous**, de **Sie**, it **tu**, nl **je**). Count-bearing strings ship singular and plural forms, following `directory.json`'s `key` / `key_other` shape — phase 2's review caught "1 avaliações" and it must not come back.
- **No accent rule before uppercase labels, anywhere** (owner's rule). Captions are `type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase` and nothing else.
- **No new dependencies.**
- **Backend tests:** `bun test <path>` from `packages/backend`. The dev-database tests use `openDevDbConnection`; everything else uses fakes.
- **Web tests:** `bun run vitest run <path>` from `apps/frontend/web`; `bun run typecheck`; `bun run lint` (0 errors; one pre-existing warning in `features/onboarding/viewmodel/use-onboarding.ts` is known).
- **This branch collides with `feat/customer-bookings` by the owner's decision.** That branch is rewriting the same aggregate, the same write mutations and the same read repository. Do not try to avoid the collision by writing less; write this plan as specified and leave the merge to whoever lands second.
- **Commits:** end every message with the two trailers this session uses (`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01LDSCKXSpinPNUzrMsZwvvT`). Wrap git writes in the retry loop below — another process on this machine creates `.git/index.lock` intermittently:

```bash
g() { local i; for i in 1 2 3 4 5 6; do git "$@" && return 0; sleep 1; done; return 1; }
```

---

## File map

**`packages/shared`**
- Modify `src/enums/notification-enums/notification-type.enum.ts` — six values, six `switch` cases.
- Create `src/read-models/system/booking/admin-booking.schema.ts` — the admin queue's row and page.
- Modify `src/read-models/system/booking/index.ts`.

**`packages/backend/src/modules/ntizo`**
- Modify `shared/infrastructure/database/booking/enums.ts` — `DEADLINE_BEARING_STATUSES` gains two.
- Modify `shared/infrastructure/database/booking/schemas/booking.schema.ts` — `reminded_at`.
- Modify `shared/infrastructure/database/communication/schemas/support-request.schema.ts` — `kind`.
- Create the generated migration `0038_*.sql`, with one hand-added backfill statement.
- Modify `bounded-contexts/booking/domain/aggregates/booking.aggregate.ts` — six transitions.
- Modify `bounded-contexts/booking/domain/exceptions.ts` — `BookingNotEndedError`.
- Modify `bounded-contexts/booking/domain/events/index.ts` — `BookingCancelledReason` gains `dispute_upheld`.
- Create `bounded-contexts/booking/app/use-cases/{mark-booking-done,keep-booking-open,complete-booking,dispute-booking,resolve-booking-dispute}.command.ts`.
- Modify `bounded-contexts/booking/app/use-cases/{mark-booking-paid,sweep-booking}.command.ts`, `bootstrap/index.ts`.
- Create `bounded-contexts/review/app/ports/outbound/complete-booking.port.ts`; modify `submit-review.command.ts`, `bootstrap`.
- Modify `review/infrastructure/repositories/drizzle/booking-review-eligibility.adapter.ts`.
- Modify `bounded-contexts/communication/app/use-cases/open-support-request.command.ts` — the `kind`.
- Modify `write/booking/graphql/schema/mutations.ts` + handlers; create `write/booking/graphql/handlers/admin.handlers.ts` if the guard warrants it.
- Create `read/booking/app/use-cases/list-admin-bookings.projection.ts`; modify the read port, the Drizzle repository, the read schema, handlers and bootstrap.
- Modify `apps/backend/api/src/graphql/private.ts` — the review context's new dependency.

**`apps/frontend/web/src`**
- Modify `features/provider/bookings/{data,viewmodel,ui}` — two actions on the booking page.
- Create `features/admin/bookings/{data,viewmodel,ui}` + `routes/admin/bookings.tsx`.
- Modify `shared/locales/<8>/provider.json` and `admin.json`.
- Modify `shared/lib/navigation.ts` (admin nav) and its test.

---

### Task 1: Shared contracts — notification types and the admin row

**Files:**
- Modify: `packages/shared/src/enums/notification-enums/notification-type.enum.ts`
- Create: `packages/shared/src/read-models/system/booking/admin-booking.schema.ts`
- Modify: `packages/shared/src/read-models/system/booking/index.ts`
- Test: `packages/shared/src/read-models/system/booking/__tests__/admin-booking.schema.test.ts`

**Interfaces:**
- Produces: `NotificationType.ProviderBookingCloseReminder`, `.BookingMarkedDone`, `.ProviderBookingAutoClosed`, `.AdminBookingAutoClosed`, `.BookingDisputed`, `.BookingDisputeResolved`; `ADMIN_BOOKING_TABS`, `adminBookingReadModel`, `adminBookingPageReadModel`, types `AdminBookingDTO`, `AdminBookingPageDTO`, `AdminBookingTab`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/read-models/system/booking/__tests__/admin-booking.schema.test.ts
import { describe, expect, it } from "vitest";
import { ADMIN_BOOKING_TABS, adminBookingPageReadModel, adminBookingReadModel } from "../admin-booking.schema";
import { NotificationType, bucketForNotificationType } from "../../../../enums";

const row = {
  id: "bk-1",
  status: "CONFIRMED",
  providerId: "prov-1",
  providerName: "Estúdio Mavalane",
  customerFirstName: "Ana",
  serviceName: "Corte de cabelo",
  startsAt: "2026-09-01T09:00:00.000Z",
  endsAt: "2026-09-01T09:45:00.000Z",
  timezone: "Africa/Maputo",
  priceMinor: 80000,
  commissionMinor: 8000,
  currency: "MZN",
  remindedAt: null,
  markedDoneAt: null,
  expiresAt: "2026-09-01T09:45:00.000Z",
  threadId: null,
};

describe("adminBookingReadModel", () => {
  it("accepts a booking waiting to be closed", () => {
    expect(adminBookingReadModel.parse(row)).toEqual(row);
  });

  it("carries the dispute's thread when there is one", () => {
    const disputed = { ...row, status: "DISPUTED", threadId: "th-1" };
    expect(adminBookingReadModel.parse(disputed).threadId).toBe("th-1");
  });

  it("refuses a status this queue never shows", () => {
    expect(() => adminBookingReadModel.parse({ ...row, status: "DRAFT" })).toThrow();
  });

  it("names the three tabs", () => {
    expect(ADMIN_BOOKING_TABS).toEqual(["unclosed", "in_window", "disputed"]);
  });

  it("pages like every other list in this app", () => {
    const page = adminBookingPageReadModel.parse({ items: [row], total: 1, nextOffset: null });
    expect(page.items).toHaveLength(1);
  });
});

describe("the six new notification types", () => {
  it("are transactional, like every other booking notice", () => {
    for (const type of [
      NotificationType.ProviderBookingCloseReminder,
      NotificationType.BookingMarkedDone,
      NotificationType.ProviderBookingAutoClosed,
      NotificationType.AdminBookingAutoClosed,
      NotificationType.BookingDisputed,
      NotificationType.BookingDisputeResolved,
    ]) {
      expect(bucketForNotificationType(type)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/shared && bun run vitest run src/read-models/system/booking/__tests__/admin-booking.schema.test.ts`
Expected: FAIL — cannot find `../admin-booking.schema`.

- [ ] **Step 3: Add the notification types**

In `notification-type.enum.ts`, under the booking section:

```ts
  /** The appointment ended and nobody closed the booking. Asked of the provider, not asserted. */
  ProviderBookingCloseReminder = "PROVIDER_BOOKING_CLOSE_REMINDER",
  /** The provider says the work is done. Starts the customer's window, so the customer must hear it. */
  BookingMarkedDone = "BOOKING_MARKED_DONE",
  /** The provider never answered, so the platform closed it for them. */
  ProviderBookingAutoClosed = "PROVIDER_BOOKING_AUTO_CLOSED",
  /** One for the administrators: a booking the platform had to close alone. */
  AdminBookingAutoClosed = "ADMIN_BOOKING_AUTO_CLOSED",
  /** The customer disputed inside the window. */
  BookingDisputed = "BOOKING_DISPUTED",
  /** An administrator decided a dispute. Both sides hear the same thing. */
  BookingDisputeResolved = "BOOKING_DISPUTE_RESOLVED",
```

and add all six to `bucketForNotificationType`'s `return null` group.

- [ ] **Step 4: Write the read model**

```ts
// packages/shared/src/read-models/system/booking/admin-booking.schema.ts
import { z } from "zod";

/**
 * The three questions an administrator asks about bookings, and the only
 * three. This is not a bookings browser: a queue exists to be emptied, so it
 * shows what needs a hand and nothing else.
 */
export const ADMIN_BOOKING_TABS = ["unclosed", "in_window", "disputed"] as const;
export type AdminBookingTab = (typeof ADMIN_BOOKING_TABS)[number];

/** The statuses that can appear in that queue. Everything else is either not started or already finished. */
const ADMIN_VISIBLE_STATUSES = ["CONFIRMED", "MARKED_DONE", "DISPUTED"] as const;

/**
 * One row of the administrator's queue. It carries the workspace's name,
 * unlike the provider's own row, because an administrator is looking across
 * workspaces and "Ana, Corte de cabelo" names no one workspace.
 */
export const adminBookingReadModel = z.object({
  id: z.string().min(1),
  status: z.enum(ADMIN_VISIBLE_STATUSES),
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  customerFirstName: z.string().min(1),
  serviceName: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  timezone: z.string().min(1),
  priceMinor: z.number().int().min(0),
  commissionMinor: z.number().int().min(0),
  currency: z.string(),
  /** When the platform asked the provider to close it; null while it has not asked. */
  remindedAt: z.string().nullable(),
  markedDoneAt: z.string().nullable(),
  /** The next thing the clock will do, whatever that is in this status. */
  expiresAt: z.string().nullable(),
  /** The dispute's thread, so a row can link straight into it. Null unless disputed. */
  threadId: z.string().nullable(),
});

export const adminBookingPageReadModel = z.object({
  items: z.array(adminBookingReadModel),
  total: z.number().int().min(0),
  nextOffset: z.number().int().min(0).nullable(),
});

export type AdminBookingDTO = z.infer<typeof adminBookingReadModel>;
export type AdminBookingPageDTO = z.infer<typeof adminBookingPageReadModel>;
```

Export it from `index.ts` with `export * from "./admin-booking.schema";`.

- [ ] **Step 5: Run the package's suite**

Run: `cd packages/shared && bun run test && bun run typecheck`
Expected: PASS. `src/enums/__tests__/notifications.test.ts` enumerates the switch; it must stay green.

- [ ] **Step 6: Commit**

```bash
g add packages/shared/src
g commit -m "feat(shared): the six notices a closing booking sends, and the queue an admin reads"
```

---

### Task 2: The schema, the clocks' statuses, and the migration

**Files:**
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/booking/enums.ts`
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/booking/schemas/booking.schema.ts`
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/communication/schemas/support-request.schema.ts`
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/migrations/0038_*.sql` (drizzle-kit names it)
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/booking-constraints.test.ts`

**Interfaces:**
- Produces: `booking.remindedAt`, `supportRequest.kind`, `DEADLINE_BEARING_STATUSES` widened to five.

This task is the one that touches the live dev database. Read the generated SQL before applying it; if drizzle-kit emits anything beyond the three changes below plus your hand-added backfill, stop and report BLOCKED with the file's contents.

- [ ] **Step 1: Write the failing catalogue test**

`booking-constraints.test.ts` already reads `booking_sweep_idx`'s predicate out of `pg_indexes` and compares it to `DEADLINE_BEARING_STATUSES` in both directions. That test will start failing on its own once the constant changes, which is the RED you want — run it after Step 2 and before the migration, and record that failure as this task's RED evidence. Add one test of your own beside it:

```ts
test("a confirmed booking carries the clock the sweep will read", async () => {
  const rows = await db.execute(
    sql`select column_name from information_schema.columns
        where table_schema = 'ntizo_booking' and table_name = 'booking' and column_name = 'reminded_at'`,
  );
  expect(rows).toHaveLength(1);
});

test("a support request knows whether it is a dispute", async () => {
  const rows = await db.execute(
    sql`select column_name from information_schema.columns
        where table_schema = 'ntizo_communication' and table_name = 'support_request' and column_name = 'kind'`,
  );
  expect(rows).toHaveLength(1);
});
```

(Use the file's own connection and result-shape idiom.)

- [ ] **Step 2: Widen the constant and add the columns**

In `enums.ts`:

```ts
/**
 * The statuses in which `expires_at` is a deadline somebody is still waiting on.
 *
 * `CONFIRMED` and `MARKED_DONE` joined when bookings gained an ending. On a
 * confirmed booking the clock is the platform's question to the provider —
 * first "the appointment ended, tell us how it went", then, seven days later
 * and only if nobody answered, the platform closing it alone. On a marked-done
 * booking it is the customer's window.
 *
 * `booking_sweep_idx`'s predicate is generated from this list, so widening it
 * widens the index; `booking-constraints.test.ts` reads the live predicate back
 * and fails until the migration has run.
 */
export const DEADLINE_BEARING_STATUSES = [
  BookingStatus.Draft,
  BookingStatus.AwaitingProvider,
  BookingStatus.PendingPayment,
  BookingStatus.Confirmed,
  BookingStatus.MarkedDone,
] as const;
```

In `booking.schema.ts`, beside the other timestamps:

```ts
    /**
     * When the platform asked the provider to close this booking. Null until
     * it has asked, which is what tells the sweep's second firing apart from
     * its first — an explicit flag rather than an inference from two dates
     * that would read correctly and mean something else.
     */
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
```

In `support-request.schema.ts`:

```ts
    /**
     * What this request is. A dispute moves a booking when it is resolved and
     * an ordinary request does not, so the difference is a column rather than
     * an inference from "has a booking id" — which would break the first time
     * somebody asks a normal question about a booking they are disputing.
     */
    kind: varchar("kind", { length: 16 }).notNull().default("support"),
```

with, in the table's extras array beside the existing checks:

```ts
    check("support_request_kind_known", sql`${t.kind} in ('support', 'dispute')`),
```

- [ ] **Step 3: Run the catalogue test to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/booking-constraints.test.ts`
Expected: FAIL — the live index predicate names three statuses, the constant now names five; and both new columns are absent.

- [ ] **Step 4: Generate the migration, add the backfill, apply it**

```bash
cd packages/backend
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
bun run db:ntizo:generate
```

Read the generated file. It should drop and recreate `booking_sweep_idx` with the five-status predicate, add `reminded_at`, add `kind` and its check. Then append this statement by hand, at the end of the file:

```sql
--> statement-breakpoint
-- Every booking already at CONFIRMED carries a stale `expires_at`: the payment
-- deadline `accept` wrote, long past. The moment CONFIRMED becomes
-- deadline-bearing they are all due at once, which is correct — they are the
-- bookings this work exists to unstick — but their deadline should be the one
-- this design gives them, not a leftover. The sweep's LIMIT 200 a minute drains
-- the backlog rather than mailing every provider their whole history at once.
UPDATE "ntizo_booking"."booking" SET "expires_at" = "ends_at" WHERE "status" = 'CONFIRMED';
```

Then apply it: `bun run db:ntizo:dev:migrate`.

- [ ] **Step 5: Run the catalogue test and the booking suites**

Run: `cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/booking-constraints.test.ts && bun test src/modules/ntizo/read/booking && bun test src/modules/ntizo/bounded-contexts/booking`
Expected: PASS. If a sweep test now picks up bookings it did not before, that is this change working; fix the fixture, not the constant, and say so in your report.

- [ ] **Step 6: Commit**

```bash
g add packages/backend/src/modules/ntizo/shared/infrastructure
g commit -m "feat(booking): a confirmed booking gets a clock, and a request knows if it is a dispute"
```

---

### Task 3: The aggregate learns to finish

**Files:**
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/booking/domain/aggregates/booking.aggregate.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/booking/domain/exceptions.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/booking/domain/events/index.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/booking/__tests__/booking.aggregate.test.ts`

**Interfaces:**
- Produces: `Booking.reminded(at, askAgainAt)`, `.markDone(at, feedbackBy)`, `.keepOpen(at, askAgainAt)`, `.complete(at)`, `.dispute(at)`, `.resolveDispute(at, upheld)`; `BookingNotEndedError`; `BookingCancelledReason` gains `"dispute_upheld"`.

- [ ] **Step 1: Write the failing tests**

Append to the aggregate's test file, following its existing fixture helpers:

```ts
describe("closing a booking", () => {
  it("refuses to be marked done before the appointment has ended", () => {
    const b = confirmed({ endsAt: new Date("2026-09-10T10:00:00.000Z") });
    expect(() => b.markDone(new Date("2026-09-10T09:59:00.000Z"), later())).toThrow(BookingNotEndedError);
  });

  it("marks done once the appointment has ended, and starts the customer's window", () => {
    const at = new Date("2026-09-10T10:00:00.000Z");
    const feedbackBy = new Date("2026-09-13T10:00:00.000Z");
    const moved = confirmed({ endsAt: at }).markDone(at, feedbackBy);
    expect(moved.status).toBe(BookingStatus.MarkedDone);
    expect(moved.markedDoneAt).toEqual(at);
    expect(moved.expiresAt).toEqual(feedbackBy);
  });

  it("refuses to be marked done from any status but confirmed", () => {
    expect(() => awaitingProvider().markDone(new Date(), later())).toThrow(BookingTransitionError);
    expect(() => markedDone().markDone(new Date(), later())).toThrow(BookingTransitionError);
  });

  it("remembers having been asked, and moves nothing else", () => {
    const at = new Date("2026-09-10T10:00:00.000Z");
    const askAgain = new Date("2026-09-17T10:00:00.000Z");
    const moved = confirmed({ endsAt: at }).reminded(at, askAgain);
    expect(moved.status).toBe(BookingStatus.Confirmed);
    expect(moved.remindedAt).toEqual(at);
    expect(moved.expiresAt).toEqual(askAgain);
  });

  it("lets the provider say it is still going, as often as they need", () => {
    const at = new Date("2026-09-10T10:00:00.000Z");
    const once = confirmed({ endsAt: at }).reminded(at, later());
    const twice = once.keepOpen(at, new Date("2026-09-17T10:00:00.000Z"));
    expect(twice.status).toBe(BookingStatus.Confirmed);
    expect(twice.expiresAt).toEqual(new Date("2026-09-17T10:00:00.000Z"));
    expect(twice.markedDoneAt).toBeNull();
  });

  it("completes only from marked done", () => {
    const at = new Date("2026-09-13T10:00:00.000Z");
    expect(markedDone().complete(at).status).toBe(BookingStatus.Completed);
    expect(markedDone().complete(at).completedAt).toEqual(at);
    expect(() => confirmed().complete(at)).toThrow(BookingTransitionError);
  });

  it("disputes only from marked done, and stops the clock", () => {
    const at = new Date("2026-09-12T10:00:00.000Z");
    const moved = markedDone().dispute(at);
    expect(moved.status).toBe(BookingStatus.Disputed);
    expect(moved.disputedAt).toEqual(at);
    expect(moved.expiresAt).toBeNull();
    expect(() => completed().dispute(at)).toThrow(BookingTransitionError);
  });

  it("resolves a dispute both ways, and only from disputed", () => {
    const at = new Date("2026-09-20T10:00:00.000Z");
    const kept = disputed().resolveDispute(at, false);
    expect(kept.status).toBe(BookingStatus.Completed);
    expect(kept.completedAt).toEqual(at);

    const upheld = disputed().resolveDispute(at, true);
    expect(upheld.status).toBe(BookingStatus.Cancelled);
    expect(upheld.cancelledAt).toEqual(at);

    expect(() => markedDone().resolveDispute(at, true)).toThrow(BookingTransitionError);
  });
});
```

Add whichever of `confirmed()`, `markedDone()`, `disputed()`, `completed()` and `later()` the file does not already have, built from its existing `restore`-style helper.

- [ ] **Step 2: Run to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking/__tests__/booking.aggregate.test.ts`
Expected: FAIL — `markDone is not a function`.

- [ ] **Step 3: Add the error and the reason**

In `domain/exceptions.ts`, following the file's shape:

```ts
/**
 * A booking cannot be finished before it has happened. The rule is the same
 * for the provider's own button, an administrator's, and the platform's own
 * sweep: nobody may say a job is done while its appointment is still ahead.
 */
export class BookingNotEndedError extends DomainError {
  constructor(endsAt: Date, at: Date) {
    super({
      message: `This booking runs until ${endsAt.toISOString()} and cannot be closed at ${at.toISOString()}`,
      code: "BOOKING_NOT_ENDED",
    });
  }
}
```

(Match the base class and constructor shape the file's other errors use — `BookingTransitionError` is the model.)

In `domain/events/index.ts`:

```ts
export type BookingCancelledReason = "customer_did_not_pay" | "dispute_upheld";
```

`CANCELLABLE_FROM` in the aggregate gains its entry:

```ts
const CANCELLABLE_FROM: Record<BookingCancelledReason, readonly BookingStatus[]> = {
  customer_did_not_pay: [BookingStatus.PendingPayment],
  dispute_upheld: [BookingStatus.Disputed],
};
```

- [ ] **Step 4: Write the six transitions**

```ts
  /**
   * The platform asked the provider to close this booking. Not a transition —
   * the status does not move — but a fact worth keeping: it is what tells the
   * sweep's second firing from its first, and it is the difference between a
   * platform that asks and one that assumes.
   */
  reminded(at: Date, askAgainAt: Date): Booking {
    if (this.props.status !== BookingStatus.Confirmed) {
      throw new BookingTransitionError(this.props.status, BookingStatus.Confirmed);
    }
    Booking.requireValidDate(at, "at");
    Booking.requireValidDate(askAgainAt, "askAgainAt");
    return new Booking({ ...this.props, remindedAt: at, expiresAt: askAgainAt });
  }

  /**
   * The provider says the work is done — or, after seven days of silence, the
   * platform says it on their behalf. Either way this opens the customer's
   * window, so it also sets the clock that closes it.
   */
  markDone(at: Date, feedbackBy: Date): Booking {
    if (this.props.status !== BookingStatus.Confirmed) {
      throw new BookingTransitionError(this.props.status, BookingStatus.MarkedDone);
    }
    Booking.requireValidDate(at, "at");
    Booking.requireValidDate(feedbackBy, "feedbackBy");
    if (at.getTime() < this.props.endsAt.getTime()) {
      throw new BookingNotEndedError(this.props.endsAt, at);
    }
    return new Booking({
      ...this.props,
      status: BookingStatus.MarkedDone,
      markedDoneAt: at,
      expiresAt: feedbackBy,
    });
  }

  /**
   * "Still going." The job outran its slot, which is ordinary for the trades
   * this platform serves, so the provider pushes the question out rather than
   * being marked done in the middle of it. Repeatable by design: a wall is
   * finished when it is finished.
   */
  keepOpen(at: Date, askAgainAt: Date): Booking {
    if (this.props.status !== BookingStatus.Confirmed) {
      throw new BookingTransitionError(this.props.status, BookingStatus.Confirmed);
    }
    Booking.requireValidDate(at, "at");
    Booking.requireValidDate(askAgainAt, "askAgainAt");
    return new Booking({ ...this.props, expiresAt: askAgainAt });
  }

  /** The window closed without a dispute, or the customer's review closed it early. */
  complete(at: Date): Booking {
    if (this.props.status !== BookingStatus.MarkedDone) {
      throw new BookingTransitionError(this.props.status, BookingStatus.Completed);
    }
    Booking.requireValidDate(at, "at");
    return new Booking({ ...this.props, status: BookingStatus.Completed, completedAt: at });
  }

  /**
   * The customer says something is wrong. Every clock stops: `expires_at`
   * becomes null, so the sweep stops selecting this booking and only a person
   * moves it from here.
   */
  dispute(at: Date): Booking {
    if (this.props.status !== BookingStatus.MarkedDone) {
      throw new BookingTransitionError(this.props.status, BookingStatus.Disputed);
    }
    Booking.requireValidDate(at, "at");
    return new Booking({ ...this.props, status: BookingStatus.Disputed, disputedAt: at, expiresAt: null });
  }

  /**
   * An administrator decided. Keeping the completion and siding with the
   * customer are the only two outcomes, and neither moves money — the wallet
   * work reads `dispute_upheld` later to know what not to pay out.
   */
  resolveDispute(at: Date, upheld: boolean): Booking {
    if (this.props.status !== BookingStatus.Disputed) {
      throw new BookingTransitionError(
        this.props.status,
        upheld ? BookingStatus.Cancelled : BookingStatus.Completed,
      );
    }
    Booking.requireValidDate(at, "at");
    return upheld
      ? new Booking({ ...this.props, status: BookingStatus.Cancelled, cancelledAt: at })
      : new Booking({ ...this.props, status: BookingStatus.Completed, completedAt: at });
  }
```

Add `remindedAt` to `BookingProps`, to `create`'s initial props (`remindedAt: null`), to `restore`, and give it a getter beside `markedDoneAt`'s.

- [ ] **Step 5: Make `markPaid` set the first clock**

`markPaid` currently leaves `expires_at` holding the payment deadline. A confirmed booking is now deadline-bearing, so that stale value would make every freshly paid booking due immediately. In `markPaid`'s `PENDING_PAYMENT` branch:

```ts
        status: BookingStatus.Confirmed,
        paidAt: at,
        paymentRef,
        // The next thing anyone waits on is the appointment's own end, when
        // the platform will ask the provider to close it.
        expiresAt: this.props.endsAt,
```

Its existing tests assert the transition; if one asserts `expiresAt` unchanged, update that assertion and say so in your report.

- [ ] **Step 6: Run the aggregate's tests**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking && bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
g add packages/backend/src/modules/ntizo/bounded-contexts/booking/domain
g commit -m "feat(booking): the six hops that give a booking an ending"
```

---

### Task 4: The three commands that close a booking

**Files:**
- Create: `bounded-contexts/booking/app/use-cases/mark-booking-done.command.ts`, `keep-booking-open.command.ts`, `complete-booking.command.ts`
- Modify: `bounded-contexts/booking/bootstrap/index.ts`
- Test: `bounded-contexts/booking/__tests__/close-booking.command.test.ts` (new)

**Interfaces:**
- Produces: `MarkBookingDoneCommand`, `KeepBookingOpenCommand`, `CompleteBookingCommand`, each with `execute(input)`; `FEEDBACK_WINDOW_DAYS = 3`, `ASK_AGAIN_AFTER_DAYS = 7` exported from `mark-booking-done.command.ts`.
- Consumes: Task 3's transitions; the `RaiseNotificationInternalPort` phase 1 introduced; `ProviderMemberReaderPort` for authorisation.

Copy `accept-booking.command.ts`'s anatomy exactly: constructor order (`repo`, readers, `unitOfWork`, `outboxPort`, `raiseNotification` last), the transaction returning what the raise needs, the compare-and-swap `save`, the `appendChange` inside the transaction, and `raiseQuietly` after it and only on the applied path.

- [ ] **Step 1: Write the failing tests**

```ts
// bounded-contexts/booking/__tests__/close-booking.command.test.ts
import { describe, expect, it } from "bun:test";
// …the file's fake repo, fake members reader, fake unit of work, FakeRaiser…

describe("MarkBookingDoneCommand", () => {
  it("refuses somebody who is not in the workspace", async () => {
    await expect(cmd.execute({ bookingId: BOOKING_ID, requesterUserId: "stranger" })).rejects.toMatchObject({
      code: "NOT_PROVIDER_MEMBER",
    });
  });

  it("moves the booking, records the hop, and tells the customer their window is open", async () => {
    await cmd.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });
    expect(repo.saved?.status).toBe("MARKED_DONE");
    expect(repo.changes.at(-1)).toMatchObject({ reason: "marked_done_by_provider", changedByUserId: OWNER_ID });
    expect(raiser.raised.at(-1)).toMatchObject({
      type: "BOOKING_MARKED_DONE",
      audience: "user",
      userId: CUSTOMER_ID,
      payload: expect.objectContaining({ feedbackBy: expect.any(String) }),
    });
  });

  it("gives the customer three days", async () => {
    await cmd.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });
    const window = repo.saved!.expiresAt!.getTime() - NOW.getTime();
    expect(window).toBe(FEEDBACK_WINDOW_DAYS * 24 * 3_600_000);
  });

  it("refuses a booking whose appointment has not ended", async () => {
    // a fixture ending tomorrow
    await expect(cmd.execute({ bookingId: FUTURE_ID, requesterUserId: OWNER_ID })).rejects.toMatchObject({
      code: "BOOKING_NOT_ENDED",
    });
  });

  it("raises nothing when the compare-and-swap loses", async () => {
    repo.saveReturns = false;
    await cmd.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });
    expect(raiser.raised).toEqual([]);
  });

  it("does not fail the write when the raiser throws", async () => {
    const broken = new MarkBookingDoneCommand(repo, members, uow, outbox, new FakeRaiser(new Error("smtp down")));
    await expect(broken.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID })).resolves.toBeUndefined();
    expect(repo.saved?.status).toBe("MARKED_DONE");
  });
});

describe("KeepBookingOpenCommand", () => {
  it("pushes the question out seven days and records why", async () => {
    await keepOpen.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });
    expect(repo.saved?.status).toBe("CONFIRMED");
    expect(repo.saved!.expiresAt!.getTime() - NOW.getTime()).toBe(ASK_AGAIN_AFTER_DAYS * 24 * 3_600_000);
    expect(repo.changes.at(-1)).toMatchObject({ reason: "still_ongoing" });
  });

  it("tells nobody — this is an answer to the platform, not news for the customer", async () => {
    await keepOpen.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });
    expect(raiser.raised).toEqual([]);
  });
});

describe("CompleteBookingCommand", () => {
  it("completes a marked-done booking and tells both sides", async () => {
    await complete.execute({ bookingId: BOOKING_ID, reason: "completed_by_timer", changedByUserId: null });
    expect(repo.saved?.status).toBe("COMPLETED");
    expect(raiser.raised).toEqual([
      expect.objectContaining({ type: "BOOKING_COMPLETED", audience: "user", userId: CUSTOMER_ID }),
      expect.objectContaining({ type: "BOOKING_COMPLETED", audience: "provider", providerId: PROVIDER_ID }),
    ]);
  });

  it("refuses a booking that is not waiting out its window", async () => {
    repo.status = "CONFIRMED";
    await expect(complete.execute({ bookingId: BOOKING_ID, reason: "completed_by_timer", changedByUserId: null })).rejects.toMatchObject({
      code: "BOOKING_INVALID_TRANSITION",
    });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking/__tests__/close-booking.command.test.ts`
Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Write `MarkBookingDoneCommand`**

```ts
/** How long the customer has to answer once the work is said to be done. */
export const FEEDBACK_WINDOW_DAYS = 3;
/** How long the platform waits for an answer before closing a booking itself. */
export const ASK_AGAIN_AFTER_DAYS = 7;

const DAY_MS = 86_400_000;

export type MarkDoneReason = "marked_done_by_provider" | "marked_done_by_admin" | "marked_done_by_platform";

export interface MarkBookingDoneInput {
  bookingId: string;
  /** Null when the platform is closing it on nobody's behalf. */
  requesterUserId: string | null;
  reason?: MarkDoneReason;
}

/**
 * The provider says the work is done — or an administrator, or the platform
 * after seven days of silence. One command for all three because the hop is
 * the same hop; only who asked for it differs, and that difference is a
 * `booking_change` reason, not a second code path.
 */
export class MarkBookingDoneCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly members: ProviderMemberReaderPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outbox: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: MarkBookingDoneInput): Promise<void> {
    const at = new Date();
    const reason: MarkDoneReason = input.reason ?? "marked_done_by_provider";

    const moved = await this.unitOfWork.atomicExecute(async () => {
      const booking = await this.repo.findById(input.bookingId);
      if (!booking) throw new BookingNotFoundError(input.bookingId);

      // The platform and an administrator answer to a different check than a
      // member does; `requesterUserId` null is the sweep, which asked nobody.
      if (input.requesterUserId !== null && reason === "marked_done_by_provider") {
        const isMember = await this.members.isMember(booking.providerId, input.requesterUserId);
        if (!isMember) throw new NotProviderMemberError(booking.providerId);
      }

      const next = booking.markDone(at, new Date(at.getTime() + FEEDBACK_WINDOW_DAYS * DAY_MS));
      const applied = await this.repo.save(next, booking.status);
      if (!applied) return null;

      await this.repo.appendChange({
        bookingId: input.bookingId,
        changedByUserId: input.requesterUserId,
        reason,
        previousStartsAt: null,
        previousEndsAt: null,
        previousProviderMemberId: null,
        previousPriceMinor: null,
      });
      await this.outbox.publish([/* BookingMarkedDone event, following the file's event shape */]);
      return next;
    });

    if (!moved) return;

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.BookingMarkedDone,
        audience: "user",
        userId: moved.customerId,
        payload: {
          bookingId: input.bookingId,
          serviceName: moved.serviceName,
          providerName: moved.providerName,
          feedbackBy: moved.expiresAt?.toISOString() ?? null,
          markedBy: reason,
        },
      },
      input.bookingId,
    );

    if (reason === "marked_done_by_platform") {
      await raiseQuietly(
        this.raiseNotification,
        {
          type: NotificationType.ProviderBookingAutoClosed,
          audience: "provider",
          providerId: moved.providerId,
          payload: { bookingId: input.bookingId, serviceName: moved.serviceName },
        },
        input.bookingId,
      );
    }
  }
}
```

Use the errors the booking context already declares (`BookingNotFoundError`, and whatever `accept-booking.command.ts` throws for a non-member — copy that exact error, do not invent one).

- [ ] **Step 4: Write `KeepBookingOpenCommand` and `CompleteBookingCommand`**

`KeepBookingOpenCommand`: same anatomy, membership required, `booking.keepOpen(at, at + ASK_AGAIN_AFTER_DAYS days)`, change reason `still_ongoing`, no notification (the provider answered the platform; nobody else is waiting on it).

`CompleteBookingCommand`: takes `{ bookingId, reason: "completed_by_timer" | "completed_by_review" | "completed_by_admin", changedByUserId: string | null }`, no membership check (its three callers are the sweep, the review context and an administrator, each already authorised by its own edge), `booking.complete(at)`, the change row, then two raises after the transaction, in this order:

```ts
    await raiseQuietly(this.raiseNotification, {
      type: NotificationType.BookingCompleted,
      audience: "user",
      userId: moved.customerId,
      payload: { bookingId: input.bookingId, serviceName: moved.serviceName, providerName: moved.providerName },
    }, input.bookingId);

    // The same type to the other side. One notification type, two audiences —
    // the inbox's presentation map keys on the type, and "this booking is
    // finished" is the same news whoever reads it.
    await raiseQuietly(this.raiseNotification, {
      type: NotificationType.BookingCompleted,
      audience: "provider",
      providerId: moved.providerId,
      payload: { bookingId: input.bookingId, serviceName: moved.serviceName, customerFirstName: null },
    }, input.bookingId);
```

- [ ] **Step 5: Wire the bootstrap**

Add all three to `bootstrapBooking`'s `useCases`, built with the same `bookingRepository`, `unitOfWork`, `outboxPort` and `deps.raiseNotification` the other commands get.

- [ ] **Step 6: Run the booking context's suite**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking && bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
g add packages/backend/src/modules/ntizo/bounded-contexts/booking
g commit -m "feat(booking): mark done, keep open, complete"
```

---

### Task 5: The sweep asks, then acts

**Files:**
- Modify: `bounded-contexts/booking/app/use-cases/sweep-booking.command.ts`
- Modify: `bounded-contexts/booking/bootstrap/index.ts` (the sweep's new dependency)
- Test: `bounded-contexts/booking/__tests__/booking-lifecycle.command.test.ts` (extend), `shared/infrastructure/database/__tests__/booking-sweep.test.ts` (extend)

**Interfaces:**
- Consumes: Task 3's `reminded` and Task 4's `MarkBookingDoneCommand`, `CompleteBookingCommand`.
- Produces: two new `SweptOutcome` reasons, `close_reminder` and `feedback_window_closed`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("the sweep, on a confirmed booking whose appointment has ended", () => {
  it("asks the provider once, and does not move the booking", async () => {
    const outcome = await sweep.execute({ bookingId: CONFIRMED_ENDED_ID });
    expect(outcome?.reason).toBe("close_reminder");
    expect(repo.saved?.status).toBe("CONFIRMED");
    expect(repo.saved?.remindedAt).not.toBeNull();
    expect(raiser.raised.at(-1)).toMatchObject({
      type: "PROVIDER_BOOKING_CLOSE_REMINDER",
      audience: "provider",
    });
  });

  it("marks it done itself once it has asked and been ignored", async () => {
    repo.remindedAt = new Date("2026-09-03T10:00:00.000Z");
    await sweep.execute({ bookingId: CONFIRMED_ENDED_ID });
    expect(repo.saved?.status).toBe("MARKED_DONE");
  });

  it("tells every administrator when it had to close one alone", async () => {
    repo.remindedAt = new Date("2026-09-03T10:00:00.000Z");
    await sweep.execute({ bookingId: CONFIRMED_ENDED_ID });
    expect(raiser.raised.filter((r) => r.type === "ADMIN_BOOKING_AUTO_CLOSED")).toHaveLength(admins.ids.length);
  });
});

describe("the sweep, on a booking waiting out its window", () => {
  it("completes it when the window closes", async () => {
    const outcome = await sweep.execute({ bookingId: MARKED_DONE_ID });
    expect(outcome?.reason).toBe("feedback_window_closed");
    expect(repo.saved?.status).toBe("COMPLETED");
  });
});

describe("the sweep, on a disputed booking", () => {
  it("does nothing at all — a person owns it now", async () => {
    expect(await sweep.execute({ bookingId: DISPUTED_ID })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking/__tests__/booking-lifecycle.command.test.ts`
Expected: FAIL — the switch has no case for `CONFIRMED`.

- [ ] **Step 3: Add the two clocks**

In `SweepBookingCommand`'s switch, beside the three existing cases:

```ts
      case BookingStatus.Confirmed: {
        // The first firing is a question, not a transition: the platform asks
        // the provider to close the booking and pushes the clock out. Only the
        // second, seven days later and only if nobody answered, closes it.
        if (booking.remindedAt === null) {
          const next = booking.reminded(at, new Date(at.getTime() + ASK_AGAIN_AFTER_DAYS * DAY_MS));
          const applied = await this.repo.save(next, booking.status);
          if (!applied) return null;
          await this.repo.appendChange({ bookingId, changedByUserId: null, reason: CLOSE_REMINDER, previousStartsAt: null, previousEndsAt: null, previousProviderMemberId: null, previousPriceMinor: null });
          return { moved: next, reason: "close_reminder" };
        }
        const next = booking.markDone(at, new Date(at.getTime() + FEEDBACK_WINDOW_DAYS * DAY_MS));
        const applied = await this.repo.save(next, booking.status);
        if (!applied) return null;
        await this.repo.appendChange({ bookingId, changedByUserId: null, reason: MARKED_DONE_BY_PLATFORM, previousStartsAt: null, previousEndsAt: null, previousProviderMemberId: null, previousPriceMinor: null });
        return { moved: next, reason: "marked_done_by_platform" };
      }
      case BookingStatus.MarkedDone: {
        const next = booking.complete(at);
        const applied = await this.repo.save(next, booking.status);
        if (!applied) return null;
        await this.repo.appendChange({ bookingId, changedByUserId: null, reason: COMPLETED_BY_TIMER, previousStartsAt: null, previousEndsAt: null, previousProviderMemberId: null, previousPriceMinor: null });
        return { moved: next, reason: "feedback_window_closed" };
      }
```

`SweptOutcome["reason"]` widens to include `"close_reminder" | "marked_done_by_platform" | "feedback_window_closed"`. Follow the file's own rule about `EXPIRED_REASON_BY_CLOCK` being a total `Record` so a new ending is a compile error until it is mapped.

After the transaction, the notification branch gains three arms: `close_reminder` raises `ProviderBookingCloseReminder` to the provider; `marked_done_by_platform` raises `BookingMarkedDone` to the customer, `ProviderBookingAutoClosed` to the provider, and `AdminBookingAutoClosed` to every administrator through the `AdminUserReaderPort` the communication context already declares (declare the booking context's own copy of that port, as the notification port was copied — do not import communication's); `feedback_window_closed` raises `BookingCompleted` to the customer.

- [ ] **Step 4: Extend the dev-database sweep test**

`booking-sweep.test.ts` builds real bookings and runs the real sweep. Add: a confirmed booking whose `ends_at` and `expires_at` are in the past gets `reminded_at` stamped and stays confirmed; running the sweep again marks it done; a marked-done booking whose window closed becomes completed. Clean up in `afterAll` as the file does.

- [ ] **Step 5: Run both suites**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/booking-sweep.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
g add packages/backend/src/modules/ntizo/bounded-contexts/booking
g commit -m "feat(booking): the sweep asks before it closes"
```

---

### Task 6: A dispute, and its resolution

**Files:**
- Create: `bounded-contexts/booking/app/use-cases/dispute-booking.command.ts`, `resolve-booking-dispute.command.ts`
- Modify: `bounded-contexts/communication/app/use-cases/open-support-request.command.ts` — the `kind`
- Modify: `bounded-contexts/booking/bootstrap/index.ts`
- Test: `bounded-contexts/booking/__tests__/dispute-booking.command.test.ts` (new)

**Interfaces:**
- Produces: `DisputeBookingCommand.execute({ bookingId, requesterUserId, message, attachments })`, `ResolveBookingDisputeCommand.execute({ bookingId, adminUserId, upheld, note })`.
- Consumes: an outbound `OpenDisputeThreadPort` declared in the booking context, filled at composition with the communication context's `OpenSupportRequestCommand`.

The dispute has two halves that must not know each other: the booking's status, which the booking context owns, and the thread with its attachments, which the communication context owns. The booking context declares a port for the second, exactly as it declares one for notifications.

- [ ] **Step 1: Declare the port**

```ts
// bounded-contexts/booking/app/ports/outbound/open-dispute-thread.port.ts
/**
 * Opening the conversation a dispute lives in. The communication context's
 * `OpenSupportRequestCommand` satisfies this structurally; it is declared again
 * here rather than imported, for the reason `raise-notification.port.ts` gives:
 * no bounded context's `app/` tree imports another's.
 */
export interface OpenDisputeThreadInput {
  bookingId: string;
  requesterUserId: string;
  subject: string;
  message: string;
  attachments: readonly { storageKey: string; fileName: string; contentType: string; sizeBytes: number }[];
}

export interface OpenDisputeThreadPort {
  execute(input: OpenDisputeThreadInput): Promise<{ threadId: string }>;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
describe("DisputeBookingCommand", () => {
  it("refuses anybody but the booking's own customer", async () => {
    await expect(cmd.execute({ bookingId: BOOKING_ID, requesterUserId: "someone-else", message: "m", attachments: [] }))
      .rejects.toMatchObject({ code: "BOOKING_NOT_YOURS" });
  });

  it("refuses a booking that is not waiting out its window", async () => {
    repo.status = "CONFIRMED";
    await expect(cmd.execute({ bookingId: BOOKING_ID, requesterUserId: CUSTOMER_ID, message: "m", attachments: [] }))
      .rejects.toMatchObject({ code: "BOOKING_INVALID_TRANSITION" });
  });

  it("opens the thread, moves the booking, and stops the clock", async () => {
    const out = await cmd.execute({ bookingId: BOOKING_ID, requesterUserId: CUSTOMER_ID, message: "não ficou bem", attachments: [] });
    expect(out.threadId).toBe("th-1");
    expect(repo.saved?.status).toBe("DISPUTED");
    expect(repo.saved?.expiresAt).toBeNull();
    expect(threads.opened.at(-1)).toMatchObject({ bookingId: BOOKING_ID, message: "não ficou bem" });
  });

  it("tells the provider and every administrator", async () => {
    await cmd.execute({ bookingId: BOOKING_ID, requesterUserId: CUSTOMER_ID, message: "m", attachments: [] });
    expect(raiser.raised.filter((r) => r.type === "BOOKING_DISPUTED")).toHaveLength(1 + admins.ids.length);
  });
});

describe("ResolveBookingDisputeCommand", () => {
  it("keeps the completion when the dispute is rejected", async () => {
    await cmd.execute({ bookingId: BOOKING_ID, adminUserId: ADMIN_ID, upheld: false, note: null });
    expect(repo.saved?.status).toBe("COMPLETED");
    expect(repo.changes.at(-1)).toMatchObject({ reason: "dispute_rejected", changedByUserId: ADMIN_ID });
  });

  it("cancels with the dispute's own reason when it is upheld", async () => {
    await cmd.execute({ bookingId: BOOKING_ID, adminUserId: ADMIN_ID, upheld: true, note: null });
    expect(repo.saved?.status).toBe("CANCELLED");
    expect(repo.changes.at(-1)).toMatchObject({ reason: "dispute_upheld" });
  });

  it("tells both sides the same thing", async () => {
    await cmd.execute({ bookingId: BOOKING_ID, adminUserId: ADMIN_ID, upheld: true, note: null });
    const types = raiser.raised.map((r) => `${r.type}:${r.audience}`);
    expect(types).toContain("BOOKING_DISPUTE_RESOLVED:user");
    expect(types).toContain("BOOKING_DISPUTE_RESOLVED:provider");
  });
});
```

- [ ] **Step 3: Write the two commands**

`DisputeBookingCommand`: read the booking; refuse unless `booking.customerId === requesterUserId` (the booking context's existing not-yours error); open the thread through the port **before** the transaction, because it is another context's write and must not sit inside this one's; then in the transaction, `booking.dispute(at)`, the compare-and-swap save, and a change row with reason `disputed_by_customer`. Raise `BookingDisputed` to the provider and to every administrator after it.

If the transaction loses the compare-and-swap after the thread was opened, the thread stands as an ordinary support request about the booking. Say so in a comment: an orphaned conversation is a smaller wrong than a dispute whose thread never opened.

`ResolveBookingDisputeCommand`: administrator-only (the edge guards it), `booking.resolveDispute(at, upheld)`, change reason `dispute_upheld` or `dispute_rejected`, then `BookingDisputeResolved` to both sides. Resolving the support request itself stays the support context's own action, which the administrator takes in the same screen.

- [ ] **Step 4: Give the support request its kind**

`OpenSupportRequestCommand`'s input gains `kind?: "support" | "dispute"` defaulting to `"support"`, passed through to the row. The booking's port implementation at the composition root passes `"dispute"`.

- [ ] **Step 5: Run the suites**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking src/modules/ntizo/bounded-contexts/communication && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
g add packages/backend/src/modules/ntizo/bounded-contexts
g commit -m "feat(booking): a dispute is a support request that moves a booking"
```

---

### Task 7: A review closes the booking it is about

**Files:**
- Create: `bounded-contexts/review/app/ports/outbound/complete-booking.port.ts`
- Modify: `bounded-contexts/review/app/use-cases/submit-review.command.ts`
- Modify: `bounded-contexts/review/infrastructure/repositories/drizzle/booking-review-eligibility.adapter.ts`
- Modify: `bounded-contexts/review/bootstrap/index.ts`, `apps/backend/api/src/graphql/private.ts`
- Test: `bounded-contexts/review/__tests__/submit-review.command.test.ts` (extend)

**Interfaces:**
- Produces: `CompleteBookingPort { execute(input: { bookingId: string; requesterUserId: string }): Promise<void> }` in the review context; the eligibility adapter accepting `MARKED_DONE`.

- [ ] **Step 1: Write the failing tests**

```ts
it("completes the booking it was written about", async () => {
  eligibility.result = { allowed: true, bookingId: "bk-1" };
  await cmd.execute({ providerId: "prov-1", requesterUserId: CUSTOMER_ID, rating: 5, comment: "óptimo" });
  expect(completeBooking.calls).toEqual([{ bookingId: "bk-1", requesterUserId: CUSTOMER_ID }]);
});

it("does not fail the review when the booking refuses to complete", async () => {
  completeBooking.failWith = new BookingTransitionError("COMPLETED", "COMPLETED");
  await expect(cmd.execute({ providerId: "prov-1", requesterUserId: CUSTOMER_ID, rating: 5, comment: null }))
    .resolves.toBeDefined();
});

it("completes nothing when the review was a revision, not a new one", async () => {
  repo.upsertReturns = { inserted: false };
  await cmd.execute({ providerId: "prov-1", requesterUserId: CUSTOMER_ID, rating: 4, comment: null });
  expect(completeBooking.calls).toEqual([]);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/review`
Expected: FAIL — the command takes no such dependency.

- [ ] **Step 3: Open eligibility to marked-done bookings**

```ts
        and(
          eq(booking.providerId, providerId),
          eq(booking.customerId, userId),
          inArray(booking.status, [BookingStatus.MarkedDone, BookingStatus.Completed]),
        ),
      )
      // A marked-done booking has no `completed_at` yet, so ordering by it
      // alone would sort every one of them to the end. The review attaches to
      // the job the customer most recently had done, whichever column knows
      // when that was.
      .orderBy(desc(sql`coalesce(${booking.completedAt}, ${booking.markedDoneAt})`))
```

- [ ] **Step 4: Complete the booking after a new review**

In `SubmitReviewCommand`, after the transaction and only when `upserted.inserted`:

```ts
    // The customer's review is the validation the window was waiting for, so a
    // new review closes the booking it is about. Quietly: a review that landed
    // is worth more than the hop it triggers, and the booking may have been
    // completed a second earlier by the timer.
    if (upserted.inserted && eligible.bookingId) {
      try {
        await this.completeBooking.execute({ bookingId: eligible.bookingId, requesterUserId: input.requesterUserId });
      } catch (error) {
        console.error(`[review] booking ${eligible.bookingId} not completed by its review`, error);
      }
    }
```

The port is the last constructor parameter, as the notification port is in the booking context. Fill it at the composition root with `booking.useCases.completeBooking`, moving `bootstrapBooking` above `bootstrapReview` in `private.ts` if the order requires it.

- [ ] **Step 5: Run the review and API suites**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/review && bun run typecheck`, then `cd apps/backend/api && bun run typecheck && bun test src`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
g add packages/backend/src/modules/ntizo/bounded-contexts/review apps/backend/api/src
g commit -m "feat(review): a review closes the job it is about"
```

---

### Task 8: The write surface

**Files:**
- Modify: `write/booking/graphql/schema/mutations.ts`, `write/booking/graphql/handlers/mutations.handlers.ts`
- Test: `write/booking/__tests__/mutations.test.ts` (extend)

**Interfaces:**
- Produces: `bookingMarkDone`, `bookingStillOngoing`, `bookingDispute`, `bookingAdminMarkDone`, `bookingAdminComplete`, `bookingResolveDispute`, all returning `{ bookingId }` except `bookingDispute`, which returns `{ bookingId, threadId }`.

- [ ] **Step 1: Write the failing test**

```ts
it("mounts the six ways a booking can end", () => {
  expect(Object.keys(bookingWriteSchema.fields.booking).sort()).toEqual([
    "accept", "adminComplete", "adminMarkDone", "create", "decline",
    "dispute", "markDone", "resolveDispute", "stillOngoing", "submit",
  ]);
});

it("takes a dispute's message and its attachments", () => {
  expect(shapeKeys(disputeBooking)).toEqual(["bookingId", "message", "attachments"]);
  expect(() => shape(disputeBooking).parse({ bookingId: "b", message: "" })).toThrow();
});

it("asks an administrator which way the dispute went", () => {
  expect(shapeKeys(resolveBookingDispute)).toEqual(["bookingId", "upheld", "note"]);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/write/booking`
Expected: FAIL.

- [ ] **Step 3: Add the six fields**

Follow `acceptBooking`'s shape. The inputs:

```ts
export const markBookingDone = defineMutation({
  input: zodSchema(z.object({ bookingId: z.string().min(1) })),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Say the work is done", tags: ["Booking"] },
});

export const keepBookingOpen = defineMutation({
  input: zodSchema(z.object({ bookingId: z.string().min(1) })),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Say the work is still going", tags: ["Booking"] },
});

/** The contract the customer's zone implements against. Built and tested here; no screen calls it yet. */
export const disputeBooking = defineMutation({
  input: zodSchema(
    z.object({
      bookingId: z.string().min(1),
      message: z.string().trim().min(1).max(2000),
      attachments: z
        .array(
          z.object({
            storageKey: z.string().min(1),
            fileName: z.string().min(1),
            contentType: z.string().min(1),
            sizeBytes: z.number().int().positive(),
          }),
        )
        .max(5)
        .default([]),
    }),
  ),
  output: zodSchema(z.object({ bookingId: z.string().min(1), threadId: z.string().min(1) })),
  docs: { summary: "Dispute a booking inside its window", tags: ["Booking"] },
});

/** An administrator closing a booking the provider left open. The same hop, a different door. */
export const adminMarkBookingDone = defineMutation({
  input: zodSchema(z.object({ bookingId: z.string().min(1) })),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Close a booking on the provider's behalf", tags: ["Booking", "Admin"] },
});

/** An administrator ending a window early, for a booking nobody is going to answer. */
export const adminCompleteBooking = defineMutation({
  input: zodSchema(z.object({ bookingId: z.string().min(1) })),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Complete a booking without waiting out its window", tags: ["Booking", "Admin"] },
});

export const resolveBookingDispute = defineMutation({
  input: zodSchema(
    z.object({
      bookingId: z.string().min(1),
      upheld: z.boolean(),
      note: z.string().trim().max(2000).nullable().default(null),
    }),
  ),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Decide a dispute", tags: ["Booking"] },
});
```

The attachment shape matches what the upload route returns, so the client passes it back unchanged.

- [ ] **Step 4: Add the handlers**

The three provider- and customer-facing ones follow `booking.accept` exactly, passing `requireUser(ctx)`. The three administrator ones use `requireAdminUserId(ctx)` from `graphql/context.ts` and pass its result as the acting user. `booking.dispute` returns the thread id its command answers with.

- [ ] **Step 5: Run the suites and the API's**

Run: `cd packages/backend && bun test src/modules/ntizo/write/booking && bun run typecheck`, then `cd apps/backend/api && bun run typecheck && bun test src`
Expected: PASS.

- [ ] **Step 6: Smoke the new fields**

Start the API on a free port and, signed out, check one provider field and one admin field both answer `UNAUTHENTICATED` rather than "unknown field". Report the exact input type names — the web tasks hardcode them.

- [ ] **Step 7: Commit**

```bash
g add packages/backend/src/modules/ntizo/write/booking
g commit -m "feat(booking-write): the six mutations that end a booking"
```

---

### Task 9: The administrator's queue, on the wire

**Files:**
- Modify: `read/booking/app/ports/outbound/booking-read.repository.port.ts`
- Modify: `read/booking/infra/repositories/drizzle/booking-read.repository.ts`
- Create: `read/booking/app/use-cases/list-admin-bookings.projection.ts`
- Modify: `read/booking/graphql/schema/queries.ts`, `handlers/queries.handlers.ts`, `bootstrap/index.ts`
- Test: `read/booking/__tests__/admin-bookings.repository.test.ts` (dev DB), `provider-bookings.projection.test.ts` (extend)

**Interfaces:**
- Produces: `listForAdmin(filter, limit, offset)`, `countForAdmin(filter)` on the port; `ListAdminBookingsProjection`; the wire field `bookingNeedsAttentionForAdmin`.

- [ ] **Step 1: Add the port methods**

```ts
export interface AdminBookingFilter {
  tab: AdminBookingTab;
  /** Injected, never `new Date()` in the query — a test has to be able to say what "overdue" means. */
  now: Date;
}

/** One row of the administrator's queue: a provider booking plus the workspace's name and any dispute thread. */
export interface AdminBookingRow extends ProviderBookingRow {
  providerName: string;
  remindedAt: Date | null;
  markedDoneAt: Date | null;
  threadId: string | null;
}
```

with `listForAdmin(filter, limit, offset): Promise<AdminBookingRow[]>` and `countForAdmin(filter): Promise<number>`.

- [ ] **Step 2: Write the failing dev-DB test**

Model it on `provider-bookings.repository.test.ts`. Fixtures: a confirmed booking whose appointment ended (unclosed), a marked-done booking inside its window (in_window), a disputed booking with a support request row pointing at it (disputed), and a confirmed booking in the future (in no tab). Assert each tab returns exactly its own, that `providerName` comes back, and that the disputed row carries its `threadId`.

- [ ] **Step 3: Implement the two methods**

The WHERE per tab:

```ts
function adminWhere(filter: AdminBookingFilter) {
  if (filter.tab === "unclosed") {
    return and(eq(booking.status, "CONFIRMED"), lt(booking.endsAt, filter.now));
  }
  if (filter.tab === "in_window") {
    return eq(booking.status, "MARKED_DONE");
  }
  return eq(booking.status, "DISPUTED");
}
```

Ordering: `unclosed` by `endsAt` ascending (the longest-stuck first, which is what a queue is for); `in_window` by `expiresAt` ascending; `disputed` by `disputedAt` ascending. The thread comes from a left join on `supportRequest` where `bookingId` matches and `kind = 'dispute'`.

- [ ] **Step 4: Write the projection**

`ListAdminBookingsProjection`, the same shape as `ListProviderBookingsProjection`: clamp the limit to 50, `limit + 1` for `nextOffset`, `Promise.all` with the count, and a mapper to `AdminBookingDTO` reusing `toProviderBookingDTO` for the fields they share. No reveal rule here — an administrator resolving a dispute needs the whole row, and this queue is behind the admin guard.

- [ ] **Step 5: Mount it**

`bookingNeedsAttentionForAdmin`, input `{ tab, limit?, offset? }`, output `adminBookingPageReadModel`, handler guarded with `requireAdminUserId(ctx)`. Add the projection to `bootstrapBookingRead`'s `useCases`.

- [ ] **Step 6: Run the suites**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking && bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
g add packages/backend/src/modules/ntizo/read/booking
g commit -m "feat(booking-read): the bookings an administrator has to look at"
```

---

### Task 10: The words, in eight languages

**Files:**
- Modify: `apps/frontend/web/src/shared/locales/<8>/provider.json`
- Modify: `apps/frontend/web/src/shared/locales/<8>/admin.json`
- Modify: `apps/frontend/web/src/features/notifications/domain/notification-presentation.ts`
- Modify: `apps/frontend/web/src/shared/locales/<8>/notifications.json`

- [ ] **Step 1: The provider's new strings (pt-MZ, verbatim; the other seven translated)**

Into `provider.json`'s `bookings` block:

```json
"markDone": "Marcar como concluído",
"markDoneHint": "Só depois de o serviço ter terminado.",
"markDoneConfirm": "O cliente fica com três dias para avaliar ou reclamar.",
"stillOngoing": "Ainda a decorrer",
"stillOngoingDone": "Combinado. Voltamos a perguntar daqui a uma semana.",
"markedDone": "Concluído. O cliente tem três dias para responder.",
"closeError": "Não foi possível fechar a reserva agora. Tente de novo.",
"feedbackBy": "O cliente responde até {{time}}",
"askedToClose": "Pedimos-lhe que feche esta reserva."
```

and into `timelineReason`:

```json
"marked_done_by_provider": "Concluído pelo prestador",
"marked_done_by_platform": "Concluído automaticamente",
"marked_done_by_admin": "Concluído pela plataforma",
"still_ongoing": "Ainda a decorrer",
"close_reminder": "Pedido de fecho",
"completed_by_timer": "Concluída sem resposta",
"completed_by_review": "Confirmada pela avaliação",
"completed_by_admin": "Concluída pela plataforma",
"disputed_by_customer": "Reclamação aberta",
"dispute_upheld": "Reclamação aceite",
"dispute_rejected": "Reclamação recusada",
"close_by": "Fechar até",
"feedback_by": "Resposta até"
```

- [ ] **Step 2: The administrator's strings**

Into `admin.json`, a `bookings` block: the page title and subtitle, the three tab labels ("Por fechar", "Em janela", "Reclamações"), the column labels, the two actions ("Marcar como concluído", "Concluir agora"), the dispute resolution ("Manter conclusão", "Dar razão ao cliente"), the empty states per tab, and the error and retry strings. Count-bearing strings get singular and plural forms.

- [ ] **Step 3: The six notification rows**

`notifications.json`'s `type` block gains the six, and `notification-presentation.ts` maps each to an icon: the close reminder and the auto-close to `CalendarCheck`, the marked-done to `CircleCheck`, the dispute to `TriangleAlert`, the resolution to `Gavel` if lucide has it and `ShieldCheck` otherwise.

- [ ] **Step 4: Run the parity tests**

Run: `cd apps/frontend/web && bun run vitest run src/shared/lib src/shared/locales src/features/notifications`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
g add apps/frontend/web/src/shared apps/frontend/web/src/features/notifications
g commit -m "feat(web): the words for a booking that ends, in eight languages"
```

---

### Task 11: The provider closes a booking

**Files:**
- Modify: `features/provider/bookings/data/booking.repository.ts`
- Modify: `features/provider/bookings/viewmodel/use-provider-bookings.ts`
- Modify: `features/provider/bookings/ui/booking-page.tsx`
- Test: `features/provider/bookings/ui/__tests__/booking-page.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests**

```tsx
it("offers to close a confirmed booking whose appointment has passed", async () => {
  renderBooking("/provider/estudio/bookings/bk-1"); // fixture: CONFIRMED, endsAt yesterday
  expect(await screen.findByRole("button", { name: "Marcar como concluído" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ainda a decorrer" })).toBeInTheDocument();
});

it("offers nothing while the appointment is still ahead", async () => {
  // fixture: CONFIRMED, endsAt tomorrow
  renderBooking("/provider/estudio/bookings/bk-2");
  await screen.findByRole("heading", { name: "Ana" });
  expect(screen.queryByRole("button", { name: "Marcar como concluído" })).not.toBeInTheDocument();
});

it("says what happens next when the provider closes it", async () => {
  renderBooking("/provider/estudio/bookings/bk-1");
  await userEvent.click(await screen.findByRole("button", { name: "Marcar como concluído" }));
  expect(await screen.findByText(/o cliente tem três dias/i)).toBeInTheDocument();
  expect(sessionGraphqlMock).toHaveBeenCalledWith(expect.stringContaining("BookingMarkDone"), { input: { bookingId: "bk-1" } });
});

it("pushes the clock when the work is still going", async () => {
  renderBooking("/provider/estudio/bookings/bk-1");
  await userEvent.click(await screen.findByRole("button", { name: "Ainda a decorrer" }));
  expect(await screen.findByText(/voltamos a perguntar/i)).toBeInTheDocument();
});

it("shows the window on a booking that is waiting for the customer", async () => {
  // fixture: MARKED_DONE with expiresAt two days ahead
  renderBooking("/provider/estudio/bookings/bk-3");
  expect(await screen.findByText(/o cliente responde até/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/frontend/web && bun run vitest run src/features/provider/bookings/ui/__tests__/booking-page.test.tsx`
Expected: FAIL.

- [ ] **Step 3: The mutations and the hook**

In `booking.repository.ts`, two documents and two functions following `acceptBooking`'s shape:

```ts
const MARK_DONE = `
  mutation BookingMarkDone($input: BookingMarkDoneInput!) {
    bookingMarkDone(input: $input) { bookingId }
  }`;

const STILL_ONGOING = `
  mutation BookingStillOngoing($input: BookingStillOngoingInput!) {
    bookingStillOngoing(input: $input) { bookingId }
  }`;
```

(Use the exact input type names Task 8's smoke reported.) In the viewmodel, `useCloseBooking(providerId)` returns `{ markDone, stillOngoing }`, both `useMutation`s invalidating `["provider", providerId]` on success — which also refreshes the dashboard's numbers, since the stats key sits under that prefix.

- [ ] **Step 4: The buttons**

In `booking-page.tsx`, beside the accept/decline pair the header already draws while `AWAITING_PROVIDER`:

```tsx
  const ended = new Date(b.endsAt).getTime() <= now.getTime();
  const closable = b.status === "CONFIRMED" && ended;
```

Render the two buttons when `closable`, the `bookings.markDoneHint` caption when the booking is confirmed but not yet ended, and the `bookings.feedbackBy` line with `expiresAt` while `MARKED_DONE`. Reuse the notice strip the page already has for accept and decline; add `markedDone` and `stillOngoingDone` to its cases.

- [ ] **Step 5: Run the feature's tests, typecheck and lint**

Run: `cd apps/frontend/web && bun run vitest run src/features/provider && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
g add apps/frontend/web/src/features/provider
g commit -m "feat(web): the provider can say a job is done, or that it is still going"
```

---

### Task 12: The administrator's queue

**Files:**
- Create: `features/admin/bookings/data/admin-booking.repository.ts`, `viewmodel/use-admin-bookings.ts`, `ui/admin-bookings-page.tsx`, `ui/__tests__/admin-bookings-page.test.tsx`
- Create: `routes/admin/bookings.tsx`
- Modify: `shared/lib/navigation.ts` and its test

- [ ] **Step 1: Write the failing test**

Model the harness on `features/admin/contact/ui/__tests__` if one exists, or on the provider bookings page test. Assert: the three tabs; that each row shows the workspace, the customer, the service and how long it has been waiting; that "Marcar como concluído" calls the admin mutation with the row's id; that a disputed row links to its thread; and that the tab lives in the URL.

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/frontend/web && bun run vitest run src/features/admin/bookings`
Expected: FAIL — module not found.

- [ ] **Step 3: The repository, the hooks, the page**

The repository queries `bookingNeedsAttentionForAdmin` and calls the three admin mutations. The page follows `AdminContactPage`'s anatomy exactly: `usePageHeader`, a tab row, `CollectionCard` with `filtered={false}` and no search (the card's search became optional in phase 2), row actions, and `invalidateQueries({ queryKey: ["admin", "bookings"] })` after each action.

Add the nav entry to the admin sidebar group in `navigation.ts`, after Support, with the `CalendarCheck` icon, and extend `navigation.test.ts` the way phase 1 did.

- [ ] **Step 4: Regenerate the route tree and run everything**

Run: `cd apps/frontend/web && bunx vite build` to regenerate `routeTree.gen.ts` (not `bun run build`, whose `tsc -b` runs first and fails on a route that does not yet exist in the tree), then `bun run vitest run src/features/admin src/shared && bun run typecheck && bun run lint`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
g add apps/frontend/web/src/features/admin apps/frontend/web/src/routes apps/frontend/web/src/routeTree.gen.ts apps/frontend/web/src/shared
g commit -m "feat(web): the bookings an administrator has to look at, and the two buttons that close them"
```

---

### Task 13: Whole-repo verification and the follow-ups

**Files:**
- Modify: `docs/superpowers/follow-ups.md` (append)

- [ ] **Step 1: Run every gate**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd packages/shared     && bun run test && bun run typecheck
cd ../backend          && bun test && bun run typecheck
cd ../../apps/backend/api && bun run typecheck && bun test src
cd ../../frontend/web  && bun run test && bun run typecheck && bun run lint
```

Expected: zero failures. Anything red in `bounded-contexts/communication` is worth checking against the branch's own base before calling it a regression — that suite has been flaky under dev-database contention before, and this plan touches it.

- [ ] **Step 2: Record what this phase left**

Append to `docs/superpowers/follow-ups.md`, in its numbering and shape:

```markdown
## #N — Nothing stops a provider from pushing "ainda a decorrer" forever

`KeepBookingOpenCommand` has no cap by design: a job is finished when it is finished, and the
platform cannot know better. A provider who presses it every week keeps a booking out of the
customer's hands indefinitely. Each push is a `booking_change` row and the booking sits at the
top of the administrator's "por fechar" queue, so it is visible; nothing makes it stop.

**Trigger:** the first workspace that does it, or a customer complaining that a job they paid for
never closed.

## #N+1 — A dispute's thread can outlive its dispute

`DisputeBookingCommand` opens the thread before the transaction that moves the booking, because
the thread belongs to another context and must not be written inside this one's transaction. If
the compare-and-swap then loses, the thread stands as an ordinary support request about the
booking and the booking stays marked done.

**Trigger:** a support request of kind `dispute` whose booking is not `DISPUTED` showing up in the
queue; the fix is a reconciliation on open, or an outbox hop.

## #N+2 — The customer cannot review or dispute anything yet

`bookingDispute` is built, tested and mounted, and review eligibility now opens at `MARKED_DONE`,
but no screen calls either: the customer's booking zone is being built in `feat/customer-bookings`.
Until it lands, the three-day window is a timer nobody can act inside.

**Trigger:** that branch merging, which is when the contract in
`2026-09-03-booking-completion-design.md` gets its screens.
```

- [ ] **Step 3: Commit and hand over**

```bash
g add docs/superpowers/follow-ups.md
g commit -m "docs: what closing a booking leaves for later"
```

Then: merge to `dev` and deploy only on the owner's word, as every deploy in this project. The migration from Task 2 is applied to dev only.

---

## Self-review against the spec

- **The provider closes; the platform asks first** — Task 3 (`reminded`), Task 5 (the two firings), Task 11 (the buttons).
- **Three days and seven days, in one place** — Task 4 (`FEEDBACK_WINDOW_DAYS`, `ASK_AGAIN_AFTER_DAYS`).
- **Both clocks on `expires_at`, one sweep** — Task 2 (the statuses and the index), Task 5.
- **"Ainda a decorrer" is unlimited and visible** — Task 4 (`KeepBookingOpenCommand`), Task 9 (the queue orders by how long it has waited), follow-up #N.
- **The review is the validation** — Task 7.
- **A dispute is a support request that moves a booking** — Task 6, Task 2 (`kind`).
- **Two outcomes, no money** — Task 3 (`resolveDispute`), Task 6.
- **The administrator can close, and has a queue** — Task 8 (the three admin mutations), Task 9, Task 12.
- **Administrators hear about the stuck ones only** — Task 5 (`AdminBookingAutoClosed`, raised only on the auto-close arm).
- **The customer's actions are a contract** — Task 8 (`bookingDispute` built and tested), Task 7 (eligibility), follow-up #N+2.
- **Backfill of existing confirmed bookings** — Task 2, in the migration.
- **Locales ×8 with plural forms** — Task 10.

Type names across tasks: `AdminBookingTab`, `adminBookingReadModel`, `AdminBookingDTO`, `AdminBookingPageDTO` (Task 1) — consumed by Tasks 9 and 12; `BookingNotEndedError`, the six transitions (Task 3) — consumed by Tasks 4, 5, 6; `FEEDBACK_WINDOW_DAYS`, `ASK_AGAIN_AFTER_DAYS`, `MarkBookingDoneCommand`, `KeepBookingOpenCommand`, `CompleteBookingCommand` (Task 4) — consumed by Tasks 5, 7, 8; `OpenDisputeThreadPort`, `DisputeBookingCommand`, `ResolveBookingDisputeCommand` (Task 6) — consumed by Task 8; `CompleteBookingPort` (Task 7); `AdminBookingFilter`, `AdminBookingRow`, `listForAdmin`, `countForAdmin`, `ListAdminBookingsProjection` (Task 9) — consumed by Task 12.
