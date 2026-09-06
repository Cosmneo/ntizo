# Provider Bookings — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A provider can see the requests made to their workspace, open one, accept or decline it, and is told when one arrives — end to end, from a new provider-scoped read model to two pages in the provider zone.

**Architecture:** Onion Lasagna, by the book. The read side gains a provider-scoped read model (`read/booking`), the write side mounts the two commands that already exist (`write/booking`), and the booking context raises notifications through an outbound port the composition root fills with the notification context's command — the same shape the communication context already uses. The web app gets a `features/provider/bookings` feature with `data / domain / viewmodel / ui` layers, two routes, and a sidebar entry.

**Tech Stack:** Bun, TypeScript, `@cosmneo/onion-lasagna@1.0.0-beta.3` (GraphQL field kit), Drizzle + Postgres (named schemas), Zod read models in `@ntizo/shared`, React 19 + TanStack Start/Router/Query, react-i18next, Vitest (web) and `bun:test` (backend).

**Spec:** `docs/superpowers/specs/2026-09-02-provider-bookings-and-dashboard-design.md` — phase 1 only ("Reservas"). The dashboard (`bookingStatsForProvider`, the overview rewrite) is phase 2 and is **not** in this plan.

## Global Constraints

- **Reveal rule (BR-P2):** `customerPhone`, `customerEmail`, `addressLine` are `null` on the wire unless status is `CONFIRMED`, `MARKED_DONE`, `COMPLETED` or `DISPUTED`. Enforced in the DTO mapper, never in the UI.
- **`DRAFT` is never a row on the provider's side.**
- **Decline reasons are tokens** from `BOOKING_DECLINE_REASONS = ["not_available", "cannot_perform", "outside_area", "other"]`, never free text.
- **Money shown to the provider is `priceMinor − commissionMinor`**; the commission is shown as a line on the detail page only.
- **A failed notification raise never fails the write** (BR-P6): caught, logged with the booking id.
- **Tiers do not import each other's `app/` trees.** A port needed across a boundary is declared again on the caller's side (see `bounded-contexts/communication/app/ports/outbound/raise-notification.port.ts`).
- **All eight locales** (`en-US pt-PT pt-MZ es-ES de-DE fr-FR it-IT nl-NL`) get every new key; `shared/lib/__tests__/i18n-parity.test.ts` and `shared/locales/__tests__/locales.test.ts` fail otherwise.
- **No accent rule before uppercase labels, anywhere** (owner's rule, 2026-09-02). Section captions are `type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase` and nothing else.
- **No chart library, no new dependencies.**
- **Backend tests:** `bun test <path>` from `packages/backend`. The projection tests hit the dev database (`openDevDbConnection`); everything else uses fakes.
- **Web tests:** `bun run vitest run <path>` from `apps/frontend/web`; `bun run typecheck`; `bun run lint` (eslint-plugin-boundaries: only `domain/ data/ viewmodel/ ui/ locales/` under a feature).
- **Commits:** end every message with the two trailers the session uses (`Co-Authored-By` and `Claude-Session`). Wrap git writes in the retry loop below — another process on this machine creates `.git/index.lock` intermittently:

```bash
g() { local i; for i in 1 2 3 4 5 6; do git "$@" && return 0; sleep 1; done; return 1; }
```

---

## File map

**`packages/shared`**
- Create `src/read-models/system/booking/provider-booking.schema.ts` — `providerBookingReadModel`, `providerBookingDetailReadModel`, `providerBookingPageReadModel`, `bookingTimelineEntryReadModel`, `BOOKING_DECLINE_REASONS`.
- Modify `src/read-models/system/booking/index.ts` — export it.
- Modify `src/enums/notification-enums/notification-type.enum.ts` — two enum values, two `switch` cases.
- Create `src/read-models/system/booking/__tests__/provider-booking.schema.test.ts`.

**`packages/backend/src/modules/ntizo`**
- Modify `read/booking/app/ports/outbound/booking-read.repository.port.ts` — `ProviderBookingRow`, `ProviderTimelineRow`, `ProviderMemberOption`, `ProviderListFilter`, four new port methods.
- Modify `read/booking/infra/repositories/drizzle/booking-read.repository.ts` — the four methods.
- Create `read/booking/app/use-cases/to-provider-booking-dto.ts` — the reveal rule and the timeline.
- Create `read/booking/app/use-cases/list-provider-bookings.projection.ts`, `get-provider-booking.projection.ts`.
- Modify `read/booking/graphql/schema/queries.ts`, `read/booking/graphql/handlers/queries.handlers.ts`, `read/booking/bootstrap/index.ts`.
- Create `read/booking/__tests__/provider-bookings.projection.test.ts` (fakes), `read/booking/__tests__/provider-bookings.repository.test.ts` (dev DB).
- Modify `write/booking/graphql/schema/mutations.ts`, `write/booking/graphql/handlers/mutations.handlers.ts`.
- Create `bounded-contexts/booking/app/ports/outbound/raise-notification.port.ts`.
- Modify `bounded-contexts/booking/app/use-cases/{submit-booking,accept-booking,decline-booking,mark-booking-paid,sweep-booking}.command.ts`, `bounded-contexts/booking/bootstrap/index.ts`.
- Create `bounded-contexts/notification/infrastructure/templates/{provider-booking-received,booking-accepted,booking-declined}.template.ts`; modify `registry.ts`.

**`apps/backend/api/src`**
- Modify `graphql/private.ts`, `api.ts`, `scheduled.ts` — `bootstrapBooking({ raiseNotification })`.

**`apps/frontend/web/src`**
- Create `features/provider/bookings/domain/status.ts`, `domain/__tests__/status.test.ts`.
- Create `features/provider/bookings/data/booking.repository.ts`.
- Create `features/provider/bookings/viewmodel/use-provider-bookings.ts`.
- Create `features/provider/bookings/ui/bookings-page.tsx`, `booking-page.tsx`, `booking-status-badge.tsx`, `decline-dialog.tsx`, `__tests__/bookings-page.test.tsx`, `__tests__/booking-page.test.tsx`.
- Create `routes/provider/$slug/bookings.index.tsx`, `routes/provider/$slug/bookings.$bookingId.tsx`; regenerate `routeTree.gen.ts`.
- Modify `shared/lib/navigation.ts`, `shared/lib/__tests__/navigation.test.ts`.
- Modify `features/notifications/domain/notification-presentation.ts`.
- Modify `shared/locales/<8>/provider.json`, `shared/locales/<8>/notifications.json`.

---

### Task 1: Shared contracts — read models, decline reasons, notification types

**Files:**
- Create: `packages/shared/src/read-models/system/booking/provider-booking.schema.ts`
- Modify: `packages/shared/src/read-models/system/booking/index.ts`
- Modify: `packages/shared/src/enums/notification-enums/notification-type.enum.ts`
- Test: `packages/shared/src/read-models/system/booking/__tests__/provider-booking.schema.test.ts`

**Interfaces:**
- Produces: `providerBookingReadModel`, `providerBookingDetailReadModel`, `providerBookingPageReadModel`, `bookingTimelineEntryReadModel`, `providerMemberOptionReadModel`, types `ProviderBookingDTO`, `ProviderBookingDetailDTO`, `ProviderBookingPageDTO`, `BookingTimelineEntryDTO`, `ProviderMemberOptionDTO`; `BOOKING_DECLINE_REASONS`, `BookingDeclineReason`; `NotificationType.BookingAccepted`, `NotificationType.ProviderBookingConfirmed`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/read-models/system/booking/__tests__/provider-booking.schema.test.ts
import { describe, expect, it } from "bun:test";
import {
  BOOKING_DECLINE_REASONS,
  providerBookingDetailReadModel,
  providerBookingReadModel,
} from "../provider-booking.schema";
import { NotificationType, bucketForNotificationType } from "../../../../enums";

const row = {
  id: "bk-1",
  status: "AWAITING_PROVIDER",
  createdAt: "2026-09-04T09:00:00.000Z",
  serviceId: "svc-1",
  serviceOptionId: "opt-1",
  serviceName: "Corte de cabelo",
  optionName: "Padrão",
  durationMinutes: 45,
  locationType: "at_customer",
  providerMemberId: null,
  memberFirstName: null,
  customerFirstName: "Ana",
  startsAt: "2026-09-05T09:00:00.000Z",
  endsAt: "2026-09-05T09:45:00.000Z",
  timezone: "Africa/Maputo",
  addressDistrict: "Polana",
  addressCity: "Maputo",
  priceMinor: 80000,
  commissionBps: 1000,
  commissionMinor: 8000,
  currency: "MZN",
  respondBy: "2026-09-04T11:00:00.000Z",
};

describe("providerBookingReadModel", () => {
  it("accepts a list row", () => {
    expect(providerBookingReadModel.parse(row)).toEqual(row);
  });

  it("refuses DRAFT — never a row on the provider's side", () => {
    expect(() => providerBookingReadModel.parse({ ...row, status: "DRAFT" })).toThrow();
  });

  it("the detail carries the revealable fields as nullable and a timeline", () => {
    const detail = providerBookingDetailReadModel.parse({
      ...row,
      addressLabel: null,
      addressLine: null,
      addressDirections: null,
      customerPhone: null,
      customerEmail: null,
      description: "Portão azul",
      paymentRef: null,
      expiresAt: "2026-09-04T11:00:00.000Z",
      timeline: [
        { at: "2026-09-04T09:00:00.000Z", reason: "submitted_by_customer", actor: "customer", pending: false },
        { at: "2026-09-04T11:00:00.000Z", reason: "respond_by", actor: "system", pending: true },
      ],
    });
    expect(detail.timeline).toHaveLength(2);
  });
});

describe("decline reasons and notification types", () => {
  it("names the four reasons a provider may give", () => {
    expect(BOOKING_DECLINE_REASONS).toEqual(["not_available", "cannot_perform", "outside_area", "other"]);
  });

  it("the two new notification types are transactional", () => {
    expect(bucketForNotificationType(NotificationType.BookingAccepted)).toBeNull();
    expect(bucketForNotificationType(NotificationType.ProviderBookingConfirmed)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/shared && bun test src/read-models/system/booking/__tests__/provider-booking.schema.test.ts`
Expected: FAIL — `Cannot find module '../provider-booking.schema'`.

- [ ] **Step 3: Write the read models**

```ts
// packages/shared/src/read-models/system/booking/provider-booking.schema.ts
import { z } from "zod";

/**
 * The statuses a provider can be shown. `DRAFT` is a customer's private
 * draft — the slot is held, nobody has asked the provider anything yet — so
 * it is not in this list, and a row carrying it fails validation rather than
 * leaking into a workspace's inbox.
 */
export const PROVIDER_VISIBLE_STATUSES = [
  "PENDING_PAYMENT",
  "AWAITING_PROVIDER",
  "CONFIRMED",
  "MARKED_DONE",
  "COMPLETED",
  "DISPUTED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
] as const;

/** The four reasons the decline dialog offers. Tokens, translated client-side. */
export const BOOKING_DECLINE_REASONS = ["not_available", "cannot_perform", "outside_area", "other"] as const;
export type BookingDeclineReason = (typeof BOOKING_DECLINE_REASONS)[number];

/**
 * One row of the provider's list. The mirror image of `bookingReadModel`:
 * that one carries facts about the provider for a customer deciding whether
 * to trust them; this one carries who the customer is and which member of
 * the workspace is booked.
 */
export const providerBookingReadModel = z.object({
  id: z.string().min(1),
  status: z.enum(PROVIDER_VISIBLE_STATUSES),
  createdAt: z.string(),

  serviceId: z.string().min(1),
  serviceOptionId: z.string().min(1),
  serviceName: z.string(),
  optionName: z.string(),
  durationMinutes: z.number().int().positive(),
  locationType: z.string().nullable(),

  /** Null when the customer booked "anyone". */
  providerMemberId: z.string().nullable(),
  memberFirstName: z.string().nullable(),

  /** Never null: "Cliente" stands in when the profile has no first name. */
  customerFirstName: z.string().min(1),

  startsAt: z.string(),
  endsAt: z.string(),
  timezone: z.string().min(1),

  /** The coarse location, always — enough to decide "can I do this there". */
  addressDistrict: z.string().nullable(),
  addressCity: z.string().nullable(),

  priceMinor: z.number().int().min(0),
  commissionBps: z.number().int().min(0).max(10_000),
  commissionMinor: z.number().int().min(0),
  currency: z.string(),

  /** `expiresAt` while AWAITING_PROVIDER; null in every other status. */
  respondBy: z.string().nullable(),
});

export const bookingTimelineEntryReadModel = z.object({
  at: z.string(),
  /** A machine token — `booking_change.reason`, or one of the two this read adds: `created_by_customer`, `respond_by`, `pay_by`. */
  reason: z.string().min(1),
  actor: z.enum(["customer", "provider", "system"]),
  /** A deadline still ahead, drawn hollow. */
  pending: z.boolean(),
});

/**
 * One booking, for the page that decides it. The four revealable fields are
 * null until the booking is paid — see the spec's reveal rule and
 * `toProviderBookingDetailDTO`, which is where the rule lives.
 */
export const providerBookingDetailReadModel = providerBookingReadModel.extend({
  addressLabel: z.string().nullable(),
  addressLine: z.string().nullable(),
  addressDirections: z.string().nullable(),
  customerPhone: z.string().nullable(),
  customerEmail: z.string().nullable(),
  description: z.string().nullable(),
  paymentRef: z.string().nullable(),
  expiresAt: z.string().nullable(),
  timeline: z.array(bookingTimelineEntryReadModel),
});

/** A member of the workspace, for the list's filter. `id` is `provider_member.id`, which is what a booking references. */
export const providerMemberOptionReadModel = z.object({
  id: z.string().min(1),
  firstName: z.string().min(1),
});

export const providerBookingPageReadModel = z.object({
  items: z.array(providerBookingReadModel),
  total: z.number().int().min(0),
  nextOffset: z.number().int().min(0).nullable(),
  members: z.array(providerMemberOptionReadModel),
});

export type ProviderBookingDTO = z.infer<typeof providerBookingReadModel>;
export type ProviderBookingDetailDTO = z.infer<typeof providerBookingDetailReadModel>;
export type ProviderBookingPageDTO = z.infer<typeof providerBookingPageReadModel>;
export type BookingTimelineEntryDTO = z.infer<typeof bookingTimelineEntryReadModel>;
export type ProviderMemberOptionDTO = z.infer<typeof providerMemberOptionReadModel>;
```

Add to `packages/shared/src/read-models/system/booking/index.ts`:

```ts
export * from "./provider-booking.schema";
```

- [ ] **Step 4: Add the two notification types**

In `notification-type.enum.ts`, under `// --- booking, customer side`, after `BookingRequested`:

```ts
  /** The provider said yes; the payment prompt is on its way to the customer's handset. Not yet confirmed. */
  BookingAccepted = "BOOKING_ACCEPTED",
```

Under `// --- booking, provider side`, after `ProviderBookingReceived`:

```ts
  /** The customer paid — the booking the provider accepted is now a commitment on both sides. */
  ProviderBookingConfirmed = "PROVIDER_BOOKING_CONFIRMED",
```

In `bucketForNotificationType`, add both to the `return null` group:

```ts
    case NotificationType.BookingAccepted:
    case NotificationType.ProviderBookingConfirmed:
```

- [ ] **Step 5: Run the test, then the shared package's own suite**

Run: `cd packages/shared && bun test`
Expected: PASS, including `src/enums/__tests__/notifications.test.ts` (it enumerates the switch).

- [ ] **Step 6: Commit**

```bash
g add packages/shared/src/read-models/system/booking packages/shared/src/enums/notification-enums/notification-type.enum.ts
g commit -m "feat(shared): the provider's booking read models, decline reasons, and two notification types"
```

---

### Task 2: Read port and Drizzle repository — the provider's queries

**Files:**
- Modify: `packages/backend/src/modules/ntizo/read/booking/app/ports/outbound/booking-read.repository.port.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/infra/repositories/drizzle/booking-read.repository.ts`
- Test: `packages/backend/src/modules/ntizo/read/booking/__tests__/provider-bookings.repository.test.ts`

**Interfaces:**
- Produces: on `BookingReadRepositoryPort` —
  `listForProvider(providerId: string, filter: ProviderListFilter, limit: number, offset: number): Promise<ProviderBookingRow[]>`,
  `countForProvider(providerId: string, filter: ProviderListFilter): Promise<number>`,
  `findForProvider(bookingId: string, providerId: string): Promise<ProviderBookingRow | null>`,
  `timelineFor(bookingId: string): Promise<ProviderTimelineRow[]>`,
  `membersOf(providerId: string): Promise<ProviderMemberOption[]>`.
- `ProviderListFilter = { tab: "requests" | "upcoming" | "history"; q: string | null; memberId: string | null; now: Date }`.

- [ ] **Step 1: Add the row types and the port methods**

Append to `booking-read.repository.port.ts`:

```ts
export type ProviderListTab = "requests" | "upcoming" | "history";

export interface ProviderListFilter {
  tab: ProviderListTab;
  /** Matches the customer's first name and the service name; null means no search. */
  q: string | null;
  /** `provider_member.id`; null means every member and "anyone". */
  memberId: string | null;
  /** Injected, never `new Date()` inside the query — a test has to be able to say what "upcoming" means. */
  now: Date;
}

/** The statuses each tab lists. `upcoming` and `history` also split CONFIRMED/PENDING_PAYMENT by `startsAt` against `now`. */
export const PROVIDER_TAB_STATUSES: Record<ProviderListTab, readonly string[]> = {
  requests: ["AWAITING_PROVIDER"],
  upcoming: ["PENDING_PAYMENT", "CONFIRMED"],
  history: ["MARKED_DONE", "COMPLETED", "DISPUTED", "DECLINED", "CANCELLED", "EXPIRED"],
};

/**
 * One booking as the provider's list and page read it. Every column the
 * detail needs is here too: the list simply does not pass the last few on.
 * One row shape for both queries, so a column wired into only one of them
 * cannot give the same booking two contents.
 */
export interface ProviderBookingRow {
  id: string;
  status: string;
  createdAt: Date;
  customerId: string;
  serviceId: string;
  serviceOptionId: string;
  serviceName: string;
  optionName: string;
  durationMinutes: number;
  locationType: string | null;
  providerMemberId: string | null;
  memberFirstName: string | null;
  customerFirstName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  addressLabel: string | null;
  addressLine: string | null;
  addressCity: string | null;
  addressDistrict: string | null;
  addressDirections: string | null;
  description: string | null;
  paymentRef: string | null;
  priceMinor: number;
  commissionBps: number;
  commissionMinor: number;
  currency: string;
  expiresAt: Date | null;
}

export interface ProviderTimelineRow {
  changedAt: Date;
  changedByUserId: string | null;
  reason: string;
}

export interface ProviderMemberOption {
  id: string;
  firstName: string;
}
```

And inside `BookingReadRepositoryPort`:

```ts
  /** The workspace's bookings for one tab, paged. `DRAFT` never appears. See `PROVIDER_TAB_STATUSES`. */
  listForProvider(
    providerId: string,
    filter: ProviderListFilter,
    limit: number,
    offset: number,
  ): Promise<ProviderBookingRow[]>;
  /** How many `listForProvider` would return unpaged — the list shows "a mostrar 8 de 23". */
  countForProvider(providerId: string, filter: ProviderListFilter): Promise<number>;
  /** One booking, only if it is this workspace's — `providerId` in the WHERE, as `findForCustomer` does. `DRAFT` answers null. */
  findForProvider(bookingId: string, providerId: string): Promise<ProviderBookingRow | null>;
  /** Every `booking_change` row, oldest first. */
  timelineFor(bookingId: string): Promise<ProviderTimelineRow[]>;
  /** The workspace's members with a first name to show, for the list's filter. */
  membersOf(providerId: string): Promise<ProviderMemberOption[]>;
```

- [ ] **Step 2: Write the failing repository test (dev database)**

Model it on `list-my-bookings.projection.test.ts`: the same imports, `openDevDbConnection`, `setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS)`, a `suffix = crypto.randomUUID()`, `beforeAll` inserting a `user` (customer, with a `profile` row: `firstName: "Ana"`, `phoneNumber: "+258840000001"`), an owner `user`, a `provider` (`timezone: "Africa/Maputo"`), a `providerMember` for the owner, a `category`, a `service`, a `serviceOption`, and — through `DrizzleBookingRepository` exactly as that test does — three bookings via `Booking.create` + `writeRepo.save`: one left `DRAFT`, one moved to `AWAITING_PROVIDER` (`booking.submit(...)`) with `appendChange({ reason: "submitted_by_customer", changedByUserId: customerId })`, one `CONFIRMED` in the past (`submit` → `accept` → `markPaid`). `afterAll` runs `bestEffortCleanup` for every inserted id. Then:

```ts
const readRepo = new DrizzleBookingReadRepository();
const now = new Date();

describe("DrizzleBookingReadRepository, provider side", () => {
  test("requests lists the awaiting booking and never the draft", async () => {
    const rows = await readRepo.listForProvider(providerId, { tab: "requests", q: null, memberId: null, now }, 20, 0);
    expect(rows.map((r) => r.id)).toEqual([awaitingId]);
    expect(rows[0]!.customerFirstName).toBe("Ana");
    expect(rows[0]!.customerPhone).toBe("+258840000001"); // the row carries it; the DTO mapper hides it
    expect(rows[0]!.timezone).toBe("Africa/Maputo");
  });

  test("history lists the confirmed booking whose start has passed", async () => {
    const rows = await readRepo.listForProvider(providerId, { tab: "history", q: null, memberId: null, now }, 20, 0);
    expect(rows.map((r) => r.id)).toEqual([confirmedPastId]);
  });

  test("search matches the customer's first name, accent-insensitively", async () => {
    const hit = await readRepo.countForProvider(providerId, { tab: "requests", q: "ana", memberId: null, now });
    const miss = await readRepo.countForProvider(providerId, { tab: "requests", q: "zzz", memberId: null, now });
    expect(hit).toBe(1);
    expect(miss).toBe(0);
  });

  test("findForProvider answers null for another workspace's booking and for a draft", async () => {
    expect(await readRepo.findForProvider(awaitingId, crypto.randomUUID())).toBeNull();
    expect(await readRepo.findForProvider(draftId, providerId)).toBeNull();
    expect((await readRepo.findForProvider(awaitingId, providerId))?.id).toBe(awaitingId);
  });

  test("timelineFor returns the change rows oldest first", async () => {
    const rows = await readRepo.timelineFor(awaitingId);
    expect(rows.map((r) => r.reason)).toEqual(["submitted_by_customer"]);
    expect(rows[0]!.changedByUserId).toBe(customerId);
  });

  test("membersOf names the owner by first name", async () => {
    const members = await readRepo.membersOf(providerId);
    expect(members.map((m) => m.id)).toContain(memberId);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking/__tests__/provider-bookings.repository.test.ts`
Expected: FAIL — `readRepo.listForProvider is not a function`.

- [ ] **Step 4: Implement the five methods**

Add these imports at the top of `booking-read.repository.ts`:

```ts
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { bookingChange } from "../../../../../shared/infrastructure/database/booking/schemas";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import { profile, user } from "../../../../../shared/infrastructure/database/user/schemas";
import {
  PROVIDER_TAB_STATUSES,
  type ProviderBookingRow,
  type ProviderListFilter,
  type ProviderMemberOption,
  type ProviderTimelineRow,
} from "../../../app/ports/outbound/booking-read.repository.port";
```

(Keep the existing `and, desc, eq, sql` import merged into the one line — drizzle exports them all from `drizzle-orm`.)

Add to the class:

```ts
  async listForProvider(
    providerId: string,
    filter: ProviderListFilter,
    limit: number,
    offset: number,
  ): Promise<ProviderBookingRow[]> {
    const db = getDb();
    const memberProfile = alias(profile, "member_profile");
    const rows = await db
      .select(providerColumns(memberProfile))
      .from(booking)
      .innerJoin(provider, eq(provider.id, booking.providerId))
      .leftJoin(service, eq(service.id, booking.serviceId))
      .leftJoin(profile, eq(profile.userId, booking.customerId))
      .leftJoin(user, eq(user.id, booking.customerId))
      .leftJoin(providerMember, eq(providerMember.id, booking.providerMemberId))
      .leftJoin(memberProfile, eq(memberProfile.userId, providerMember.userId))
      .where(providerWhere(providerId, filter))
      .orderBy(...providerOrder(filter.tab))
      .limit(limit)
      .offset(offset);
    return rows.map(toProviderRow);
  }

  async countForProvider(providerId: string, filter: ProviderListFilter): Promise<number> {
    const db = getDb();
    const [row] = await db
      .select({ n: count() })
      .from(booking)
      .leftJoin(profile, eq(profile.userId, booking.customerId))
      .where(providerWhere(providerId, filter));
    return Number(row?.n ?? 0);
  }

  async findForProvider(bookingId: string, providerId: string): Promise<ProviderBookingRow | null> {
    const db = getDb();
    const memberProfile = alias(profile, "member_profile");
    const rows = await db
      .select(providerColumns(memberProfile))
      .from(booking)
      .innerJoin(provider, eq(provider.id, booking.providerId))
      .leftJoin(service, eq(service.id, booking.serviceId))
      .leftJoin(profile, eq(profile.userId, booking.customerId))
      .leftJoin(user, eq(user.id, booking.customerId))
      .leftJoin(providerMember, eq(providerMember.id, booking.providerMemberId))
      .leftJoin(memberProfile, eq(memberProfile.userId, providerMember.userId))
      // Ownership in the WHERE, as `findForCustomer` — and a draft is not
      // the provider's to see, so it is excluded here rather than after.
      .where(
        and(
          eq(booking.id, bookingId),
          eq(booking.providerId, providerId),
          sql`${booking.status} <> 'DRAFT'`,
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toProviderRow(row) : null;
  }

  async timelineFor(bookingId: string): Promise<ProviderTimelineRow[]> {
    return getDb()
      .select({
        changedAt: bookingChange.changedAt,
        changedByUserId: bookingChange.changedByUserId,
        reason: bookingChange.reason,
      })
      .from(bookingChange)
      .where(eq(bookingChange.bookingId, bookingId))
      .orderBy(asc(bookingChange.changedAt), asc(bookingChange.id));
  }

  async membersOf(providerId: string): Promise<ProviderMemberOption[]> {
    const rows = await getDb()
      .select({ id: providerMember.id, firstName: profile.firstName, email: user.email })
      .from(providerMember)
      .leftJoin(profile, eq(profile.userId, providerMember.userId))
      .leftJoin(user, eq(user.id, providerMember.userId))
      .where(eq(providerMember.providerId, providerId))
      .orderBy(asc(providerMember.joinedAt));
    // A member with no first name is named by the local part of their
    // email, which is what the members page falls back to as well.
    return rows.map((r) => ({
      id: r.id,
      firstName: r.firstName && r.firstName.trim() !== "" ? r.firstName : (r.email ?? "").split("@")[0] || "—",
    }));
  }
```

Add these module-level helpers below `toRow`:

```ts
/**
 * The provider's WHERE: this workspace, never a draft, the tab's statuses,
 * the tab's side of `now` for the two live statuses, an optional member and
 * an optional search. `unaccent` is not installed, so the search lowers both
 * sides and strips the accents the launch market's names actually carry.
 */
function providerWhere(providerId: string, filter: ProviderListFilter) {
  const live = inArray(booking.status, [...PROVIDER_TAB_STATUSES.upcoming]);
  const byTab =
    filter.tab === "requests"
      ? inArray(booking.status, [...PROVIDER_TAB_STATUSES.requests])
      : filter.tab === "upcoming"
        ? and(live, gte(booking.startsAt, filter.now))
        : or(inArray(booking.status, [...PROVIDER_TAB_STATUSES.history]), and(live, lt(booking.startsAt, filter.now)));
  const byMember = filter.memberId === null ? undefined : eq(booking.providerMemberId, filter.memberId);
  const needle = filter.q?.trim();
  const bySearch =
    needle === undefined || needle === ""
      ? undefined
      : or(
          ilike(unaccented(profile.firstName), `%${unaccentedJs(needle)}%`),
          ilike(unaccented(booking.serviceName), `%${unaccentedJs(needle)}%`),
        );
  return and(eq(booking.providerId, providerId), sql`${booking.status} <> 'DRAFT'`, byTab, byMember, bySearch);
}

/** `translate(lower(col), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')` — the accents Portuguese, Spanish and French names use. `AnyColumn` is `import type { AnyColumn } from "drizzle-orm"`. */
function unaccented(column: AnyColumn) {
  return sql<string>`translate(lower(${column}), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')`;
}

function unaccentedJs(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Requests newest first; upcoming soonest first; history most recent first. Ties broken by id, as `listForCustomer` does. */
function providerOrder(tab: ProviderListFilter["tab"]) {
  if (tab === "requests") return [desc(booking.createdAt), desc(booking.id)];
  if (tab === "upcoming") return [asc(booking.startsAt), asc(booking.id)];
  return [desc(booking.startsAt), desc(booking.id)];
}

function providerColumns(memberProfile: ReturnType<typeof alias<typeof profile, "member_profile">>) {
  return {
    id: booking.id,
    status: booking.status,
    createdAt: booking.createdAt,
    customerId: booking.customerId,
    serviceId: booking.serviceId,
    serviceOptionId: booking.serviceOptionId,
    serviceName: booking.serviceName,
    optionName: booking.optionName,
    durationMinutes: booking.durationMinutes,
    locationType: service.locationType,
    providerMemberId: booking.providerMemberId,
    memberFirstName: memberProfile.firstName,
    customerFirstName: profile.firstName,
    customerPhone: profile.phoneNumber,
    customerEmail: user.email,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    timezone: provider.timezone,
    addressLabel: booking.addressLabel,
    addressLine: booking.addressLine,
    addressCity: booking.addressCity,
    addressDistrict: booking.addressDistrict,
    addressDirections: booking.addressDirections,
    description: booking.description,
    paymentRef: booking.paymentRef,
    priceMinor: booking.priceMinor,
    commissionBps: booking.commissionBps,
    commissionMinor: booking.commissionMinor,
    currency: booking.currency,
    expiresAt: booking.expiresAt,
  };
}

/**
 * One selected row as `ProviderBookingRow` describes it. The `status` cast is
 * safe for the reason `toRow` above gives (the CHECK constraint). A blank
 * first name — the profile's own `.default("")` — reads as none.
 */
function toProviderRow(row: Omit<ProviderBookingRow, "memberFirstName" | "customerFirstName"> & {
  memberFirstName: string | null;
  customerFirstName: string | null;
}): ProviderBookingRow {
  return {
    ...row,
    memberFirstName: row.memberFirstName && row.memberFirstName.trim() !== "" ? row.memberFirstName : null,
    customerFirstName: row.customerFirstName && row.customerFirstName.trim() !== "" ? row.customerFirstName : null,
  };
}
```

Check the column names exist on the schemas before running: `booking.paymentRef`, `booking.providerMemberId`, `booking.customerId` (`booking.schema.ts`), `providerMember.joinedAt`, `profile.firstName/phoneNumber`, `user.email`.

- [ ] **Step 5: Run the repository test**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking/__tests__/provider-bookings.repository.test.ts`
Expected: PASS (6 tests). If `translate` on a `text` column errors, the column reference inside `sql` needs the table alias — `sql\`translate(lower(${profile.firstName}), …)\`` is correct drizzle usage; the error case to watch is `profile` being joined twice, which is why the member's profile is the `alias`.

- [ ] **Step 6: Run the existing customer-side test to prove nothing moved**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking/__tests__/list-my-bookings.projection.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
g add packages/backend/src/modules/ntizo/read/booking
g commit -m "feat(booking-read): the provider's list, detail, timeline and members, off the same table"
```

---

### Task 3: Projections and the DTO mapper — the reveal rule and the timeline

**Files:**
- Create: `packages/backend/src/modules/ntizo/read/booking/app/use-cases/to-provider-booking-dto.ts`
- Create: `packages/backend/src/modules/ntizo/read/booking/app/use-cases/list-provider-bookings.projection.ts`
- Create: `packages/backend/src/modules/ntizo/read/booking/app/use-cases/get-provider-booking.projection.ts`
- Test: `packages/backend/src/modules/ntizo/read/booking/__tests__/provider-bookings.projection.test.ts`

**Interfaces:**
- Consumes: Task 2's port methods and row types; Task 1's DTO types.
- Produces: `toProviderBookingDTO(row): ProviderBookingDTO`; `toProviderBookingDetailDTO(row, changes): ProviderBookingDetailDTO`; `REVEALED_STATUSES`; `ListProviderBookingsProjection.execute({ providerId, tab, q, memberId, limit, offset, now }): Promise<ProviderBookingPageDTO>`; `GetProviderBookingProjection.execute({ providerId, bookingId, now }): Promise<ProviderBookingDetailDTO | null>`; `MAX_PROVIDER_PAGE = 50`.

- [ ] **Step 1: Write the failing test (fakes, no database)**

```ts
// packages/backend/src/modules/ntizo/read/booking/__tests__/provider-bookings.projection.test.ts
import { describe, expect, it } from "bun:test";
import type {
  BookingListRow,
  BookingReadRepositoryPort,
  ProviderBookingRow,
  ProviderListFilter,
  ProviderMemberOption,
  ProviderTimelineRow,
} from "../app/ports/outbound/booking-read.repository.port";
import { ListProviderBookingsProjection } from "../app/use-cases/list-provider-bookings.projection";
import { GetProviderBookingProjection } from "../app/use-cases/get-provider-booking.projection";
import { toProviderBookingDetailDTO } from "../app/use-cases/to-provider-booking-dto";

const NOW = new Date("2026-09-04T10:00:00.000Z");

function row(over: Partial<ProviderBookingRow> = {}): ProviderBookingRow {
  return {
    id: "bk-1",
    status: "AWAITING_PROVIDER",
    createdAt: new Date("2026-09-04T09:00:00.000Z"),
    customerId: "cust-1",
    serviceId: "svc-1",
    serviceOptionId: "opt-1",
    serviceName: "Corte de cabelo",
    optionName: "Padrão",
    durationMinutes: 45,
    locationType: "at_customer",
    providerMemberId: "mem-1",
    memberFirstName: "Célia",
    customerFirstName: "Ana",
    customerPhone: "+258840000001",
    customerEmail: "ana@example.com",
    startsAt: new Date("2026-09-05T09:00:00.000Z"),
    endsAt: new Date("2026-09-05T09:45:00.000Z"),
    timezone: "Africa/Maputo",
    addressLabel: "Casa",
    addressLine: "Av. Julius Nyerere 1234",
    addressCity: "Maputo",
    addressDistrict: "Polana",
    addressDirections: "Portão azul",
    description: "Cabelo curto",
    paymentRef: null,
    priceMinor: 80000,
    commissionBps: 1000,
    commissionMinor: 8000,
    currency: "MZN",
    expiresAt: new Date("2026-09-04T11:00:00.000Z"),
    ...over,
  };
}

class FakeRepo implements BookingReadRepositoryPort {
  public calls: string[] = [];
  constructor(
    private rows: ProviderBookingRow[] = [row()],
    private changes: ProviderTimelineRow[] = [],
    private members: ProviderMemberOption[] = [{ id: "mem-1", firstName: "Célia" }],
  ) {}
  async listForCustomer(): Promise<BookingListRow[]> { return []; }
  async findForCustomer(): Promise<BookingListRow | null> { return null; }
  async listForProvider(providerId: string, filter: ProviderListFilter, limit: number, offset: number) {
    this.calls.push(`list:${providerId}:${filter.tab}:${filter.q}:${filter.memberId}:${limit}:${offset}`);
    return this.rows.slice(offset, offset + limit);
  }
  async countForProvider() { return this.rows.length; }
  async findForProvider(bookingId: string, providerId: string) {
    this.calls.push(`find:${bookingId}:${providerId}`);
    return this.rows.find((r) => r.id === bookingId) ?? null;
  }
  async timelineFor() { return this.changes; }
  async membersOf() { return this.members; }
}

describe("toProviderBookingDetailDTO — the reveal rule", () => {
  it("hides phone, email and street line while the booking is awaiting the provider", () => {
    const dto = toProviderBookingDetailDTO(row(), [], NOW);
    expect(dto.customerPhone).toBeNull();
    expect(dto.customerEmail).toBeNull();
    expect(dto.addressLine).toBeNull();
    // The coarse location and the note stay: they are what decides the answer.
    expect(dto.addressDistrict).toBe("Polana");
    expect(dto.description).toBe("Cabelo curto");
  });

  it("hides them while payment is pending too", () => {
    const dto = toProviderBookingDetailDTO(row({ status: "PENDING_PAYMENT" }), [], NOW);
    expect(dto.customerPhone).toBeNull();
  });

  it.each(["CONFIRMED", "MARKED_DONE", "COMPLETED", "DISPUTED"])("reveals them at %s", (status) => {
    const dto = toProviderBookingDetailDTO(row({ status }), [], NOW);
    expect(dto.customerPhone).toBe("+258840000001");
    expect(dto.customerEmail).toBe("ana@example.com");
    expect(dto.addressLine).toBe("Av. Julius Nyerere 1234");
  });

  it("names a customer with no first name 'Cliente'", () => {
    expect(toProviderBookingDetailDTO(row({ customerFirstName: null }), [], NOW).customerFirstName).toBe("Cliente");
  });
});

describe("toProviderBookingDetailDTO — the timeline", () => {
  it("opens with creation, carries every change with its actor, and ends on the pending deadline", () => {
    const dto = toProviderBookingDetailDTO(
      row(),
      [{ changedAt: new Date("2026-09-04T09:30:00.000Z"), changedByUserId: "cust-1", reason: "submitted_by_customer" }],
      NOW,
    );
    expect(dto.timeline).toEqual([
      { at: "2026-09-04T09:00:00.000Z", reason: "created_by_customer", actor: "customer", pending: false },
      { at: "2026-09-04T09:30:00.000Z", reason: "submitted_by_customer", actor: "customer", pending: false },
      { at: "2026-09-04T11:00:00.000Z", reason: "respond_by", actor: "system", pending: true },
    ]);
  });

  it("derives the actor: the customer by id, null as the system, anyone else as the provider", () => {
    const dto = toProviderBookingDetailDTO(
      row({ status: "DECLINED", expiresAt: null }),
      [
        { changedAt: new Date("2026-09-04T09:30:00.000Z"), changedByUserId: "cust-1", reason: "submitted_by_customer" },
        { changedAt: new Date("2026-09-04T09:40:00.000Z"), changedByUserId: "owner-1", reason: "not_available" },
        { changedAt: new Date("2026-09-04T09:50:00.000Z"), changedByUserId: null, reason: "provider_did_not_respond" },
      ],
      NOW,
    );
    expect(dto.timeline.map((e) => e.actor)).toEqual(["customer", "customer", "provider", "system"]);
    expect(dto.timeline.some((e) => e.pending)).toBe(false);
  });

  it("names the pending hop pay_by while payment is pending", () => {
    const dto = toProviderBookingDetailDTO(row({ status: "PENDING_PAYMENT" }), [], NOW);
    expect(dto.timeline.at(-1)).toEqual({ at: "2026-09-04T11:00:00.000Z", reason: "pay_by", actor: "system", pending: true });
  });
});

describe("ListProviderBookingsProjection", () => {
  it("pages, counts, caps the limit and names the members", async () => {
    const repo = new FakeRepo([row({ id: "a" }), row({ id: "b" }), row({ id: "c" })]);
    const page = await new ListProviderBookingsProjection(repo).execute({
      providerId: "prov-1", tab: "requests", q: "  ana ", memberId: null, limit: 500, offset: 0, now: NOW,
    });
    expect(repo.calls).toEqual(["list:prov-1:requests:ana:null:51:0"]);
    expect(page.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(page.total).toBe(3);
    expect(page.nextOffset).toBeNull();
    expect(page.members).toEqual([{ id: "mem-1", firstName: "Célia" }]);
  });

  it("reports the next offset when a page is full", async () => {
    const repo = new FakeRepo([row({ id: "a" }), row({ id: "b" }), row({ id: "c" })]);
    const page = await new ListProviderBookingsProjection(repo).execute({
      providerId: "prov-1", tab: "requests", q: null, memberId: null, limit: 2, offset: 0, now: NOW,
    });
    expect(page.items).toHaveLength(2);
    expect(page.nextOffset).toBe(2);
  });

  it("carries respondBy only while awaiting the provider", async () => {
    const repo = new FakeRepo([row({ id: "a" }), row({ id: "b", status: "CONFIRMED" })]);
    const page = await new ListProviderBookingsProjection(repo).execute({
      providerId: "prov-1", tab: "requests", q: null, memberId: null, limit: 20, offset: 0, now: NOW,
    });
    expect(page.items[0]!.respondBy).toBe("2026-09-04T11:00:00.000Z");
    expect(page.items[1]!.respondBy).toBeNull();
  });
});

describe("GetProviderBookingProjection", () => {
  it("answers null for a booking the repository does not return", async () => {
    const repo = new FakeRepo([]);
    expect(await new GetProviderBookingProjection(repo).execute({ providerId: "prov-1", bookingId: "bk-x", now: NOW })).toBeNull();
    expect(repo.calls).toEqual(["find:bk-x:prov-1"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking/__tests__/provider-bookings.projection.test.ts`
Expected: FAIL — cannot find `../app/use-cases/list-provider-bookings.projection`.

- [ ] **Step 3: Write the mapper**

```ts
// packages/backend/src/modules/ntizo/read/booking/app/use-cases/to-provider-booking-dto.ts
import type {
  BookingTimelineEntryDTO,
  ProviderBookingDTO,
  ProviderBookingDetailDTO,
} from "@ntizo/shared/read-models";
import type {
  ProviderBookingRow,
  ProviderTimelineRow,
} from "../ports/outbound/booking-read.repository.port";

/**
 * The statuses at which the provider may see who the customer is and exactly
 * where the job is. All four are on the far side of payment: the commission
 * comes out of the provider's payout, and a phone number handed over before
 * any money has moved is the cheapest possible "decline here, call me". The
 * rule lives here, in the mapper, so no screen can leak what it was never
 * sent.
 */
export const REVEALED_STATUSES: ReadonlySet<string> = new Set([
  "CONFIRMED",
  "MARKED_DONE",
  "COMPLETED",
  "DISPUTED",
]);

/** What a customer with no first name on their profile is called. Not translated: the read model promises a non-empty string, and the launch market reads Portuguese. */
const NAMELESS_CUSTOMER = "Cliente";

export function toProviderBookingDTO(row: ProviderBookingRow): ProviderBookingDTO {
  return {
    id: row.id,
    status: row.status as ProviderBookingDTO["status"],
    createdAt: row.createdAt.toISOString(),
    serviceId: row.serviceId,
    serviceOptionId: row.serviceOptionId,
    serviceName: row.serviceName,
    optionName: row.optionName,
    durationMinutes: row.durationMinutes,
    locationType: row.locationType,
    providerMemberId: row.providerMemberId,
    memberFirstName: row.memberFirstName,
    customerFirstName: row.customerFirstName ?? NAMELESS_CUSTOMER,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timezone: row.timezone,
    addressDistrict: row.addressDistrict,
    addressCity: row.addressCity,
    priceMinor: row.priceMinor,
    commissionBps: row.commissionBps,
    commissionMinor: row.commissionMinor,
    currency: row.currency,
    // `expiresAt` is never cleared — see `bookingReadModel.expiresAt` — so
    // it only means "respond by" while the status says so.
    respondBy: row.status === "AWAITING_PROVIDER" && row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

export function toProviderBookingDetailDTO(
  row: ProviderBookingRow,
  changes: readonly ProviderTimelineRow[],
  now: Date,
): ProviderBookingDetailDTO {
  const revealed = REVEALED_STATUSES.has(row.status);
  return {
    ...toProviderBookingDTO(row),
    addressLabel: row.addressLabel,
    addressLine: revealed ? row.addressLine : null,
    addressDirections: revealed ? row.addressDirections : null,
    customerPhone: revealed ? row.customerPhone : null,
    customerEmail: revealed ? row.customerEmail : null,
    description: row.description,
    paymentRef: row.paymentRef,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    timeline: timelineOf(row, changes, now),
  };
}

/**
 * Creation first, then every recorded hop, then — while a clock is running —
 * the deadline still ahead, drawn hollow. The actor is derived, not stored:
 * a null `changedByUserId` is a machine hop, the customer's own id is the
 * customer, and anyone else is somebody in the workspace.
 */
function timelineOf(
  row: ProviderBookingRow,
  changes: readonly ProviderTimelineRow[],
  now: Date,
): BookingTimelineEntryDTO[] {
  const entries: BookingTimelineEntryDTO[] = [
    { at: row.createdAt.toISOString(), reason: "created_by_customer", actor: "customer", pending: false },
    ...changes.map((c) => ({
      at: c.changedAt.toISOString(),
      reason: c.reason,
      actor: c.changedByUserId === null ? ("system" as const) : c.changedByUserId === row.customerId ? ("customer" as const) : ("provider" as const),
      pending: false,
    })),
  ];
  const clock =
    row.status === "AWAITING_PROVIDER" ? "respond_by" : row.status === "PENDING_PAYMENT" ? "pay_by" : null;
  if (clock && row.expiresAt && row.expiresAt.getTime() > now.getTime()) {
    entries.push({ at: row.expiresAt.toISOString(), reason: clock, actor: "system", pending: true });
  }
  return entries;
}
```

- [ ] **Step 4: Write the two projections**

```ts
// packages/backend/src/modules/ntizo/read/booking/app/use-cases/list-provider-bookings.projection.ts
import type { ProviderBookingPageDTO } from "@ntizo/shared/read-models";
import type {
  BookingReadRepositoryPort,
  ProviderListTab,
} from "../ports/outbound/booking-read.repository.port";
import { toProviderBookingDTO } from "./to-provider-booking-dto";

/** Hard ceiling, the wallet's. A list is read a page at a time. */
export const MAX_PROVIDER_PAGE = 50;

export interface ListProviderBookingsInput {
  providerId: string;
  tab: ProviderListTab;
  q: string | null;
  memberId: string | null;
  limit: number;
  offset: number;
  now: Date;
}

/**
 * One tab of the workspace's bookings, with the count behind it and the
 * members the list can be narrowed to. Three reads in one round trip because
 * the page draws all three at once, and the `limit + 1` trick is the wallet's:
 * "is there another page" is a length check, not a second query.
 */
export class ListProviderBookingsProjection {
  constructor(private readonly repo: BookingReadRepositoryPort) {}

  async execute(input: ListProviderBookingsInput): Promise<ProviderBookingPageDTO> {
    const limit = Math.min(Math.max(input.limit, 1), MAX_PROVIDER_PAGE);
    const offset = Math.max(input.offset, 0);
    const q = input.q?.trim() ? input.q.trim() : null;
    const filter = { tab: input.tab, q, memberId: input.memberId, now: input.now };

    const [rows, total, members] = await Promise.all([
      this.repo.listForProvider(input.providerId, filter, limit + 1, offset),
      this.repo.countForProvider(input.providerId, filter),
      this.repo.membersOf(input.providerId),
    ]);

    const hasMore = rows.length > limit;
    return {
      items: (hasMore ? rows.slice(0, limit) : rows).map(toProviderBookingDTO),
      total,
      nextOffset: hasMore ? offset + limit : null,
      members,
    };
  }
}
```

```ts
// packages/backend/src/modules/ntizo/read/booking/app/use-cases/get-provider-booking.projection.ts
import type { ProviderBookingDetailDTO } from "@ntizo/shared/read-models";
import type { BookingReadRepositoryPort } from "../ports/outbound/booking-read.repository.port";
import { toProviderBookingDetailDTO } from "./to-provider-booking-dto";

export class GetProviderBookingProjection {
  constructor(private readonly repo: BookingReadRepositoryPort) {}

  async execute(input: {
    providerId: string;
    bookingId: string;
    now: Date;
  }): Promise<ProviderBookingDetailDTO | null> {
    const row = await this.repo.findForProvider(input.bookingId, input.providerId);
    if (!row) return null;
    const changes = await this.repo.timelineFor(row.id);
    return toProviderBookingDetailDTO(row, changes, input.now);
  }
}
```

- [ ] **Step 5: Run the test**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking/__tests__/provider-bookings.projection.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 6: Commit**

```bash
g add packages/backend/src/modules/ntizo/read/booking
g commit -m "feat(booking-read): provider projections — the reveal rule and the timeline live in the mapper"
```

---

### Task 4: GraphQL reads — schema, authorised handlers, bootstrap, composition

**Files:**
- Modify: `packages/backend/src/modules/ntizo/read/booking/graphql/schema/queries.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/graphql/handlers/queries.handlers.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/bootstrap/index.ts`
- Modify: `apps/backend/api/src/graphql/private.ts` (no change needed if `createBookingReadHandlers({ bookingRead })` keeps its shape — verify)
- Test: `packages/backend/src/modules/ntizo/read/booking/__tests__/queries.handlers.test.ts`

**Interfaces:**
- Produces: wire fields `bookingForProvider(input: { providerId, tab, q?, memberId?, limit?, offset? })` → `providerBookingPageReadModel`; `bookingByIdForProvider(input: { providerId, bookingId })` → `providerBookingDetailReadModel | null`. `assertMayReadWorkspace(ctx, providerId, providerRead)` exported for the test.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/modules/ntizo/read/booking/__tests__/queries.handlers.test.ts
import { describe, expect, it } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import { assertMayReadWorkspace } from "../graphql/handlers/queries.handlers";
import { bookingReadSchema, listProviderBookings } from "../graphql/schema/queries";

function ctx(over: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-session", email: null, firstName: null, lastName: null,
    role: "customer", requestId: null, ipAddress: null, userAgent: null, ...over,
  };
}

const memberOf = (ids: string[]) => ({ isMember: async (providerId: string, userId: string) => ids.includes(`${providerId}:${userId}`) });

describe("bookingReadSchema", () => {
  it("adds the two provider fields beside the customer's", () => {
    expect(Object.keys(bookingReadSchema.fields.booking).sort()).toEqual(["byId", "byIdForProvider", "forProvider", "mine"]);
  });
  it("takes the tab as one of three words", () => {
    expect(() => listProviderBookings.input.parse({ providerId: "p", tab: "everything" })).toThrow();
    expect(listProviderBookings.input.parse({ providerId: "p", tab: "requests" })).toMatchObject({ tab: "requests" });
  });
});

describe("assertMayReadWorkspace", () => {
  it("refuses an anonymous caller with UNAUTHENTICATED", async () => {
    await expect(assertMayReadWorkspace(ctx({ requesterUserId: null }), "p1", memberOf([]))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
  it("refuses a signed-in stranger with NOT_PROVIDER_MEMBER", async () => {
    await expect(assertMayReadWorkspace(ctx(), "p1", memberOf(["p2:u-session"]))).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });
  });
  it("admits a member, and an admin without asking", async () => {
    await expect(assertMayReadWorkspace(ctx(), "p1", memberOf(["p1:u-session"]))).resolves.toBe("u-session");
    await expect(assertMayReadWorkspace(ctx({ role: "admin" }), "p1", memberOf([]))).resolves.toBe("u-session");
  });
});
```

If `bookingReadSchema.fields` is not the kit's shape, look at how `read/notification/__tests__/queries.handlers.test.ts` reads the field names (`expect(fields).toEqual([...])` near its line 39) and use the same accessor.

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking/__tests__/queries.handlers.test.ts`
Expected: FAIL — `listProviderBookings` / `assertMayReadWorkspace` not exported.

- [ ] **Step 3: Extend the schema**

In `read/booking/graphql/schema/queries.ts`, add the imports `providerBookingDetailReadModel, providerBookingPageReadModel` from `@ntizo/shared/read-models` and:

```ts
/**
 * A workspace's bookings, one tab at a time. `providerId` is explicit, as it
 * is on the wallet's read: a person may belong to several workspaces and the
 * shell knows which one is active. Who may ask is decided in the handler —
 * a member of the workspace, or an administrator.
 */
export const listProviderBookings = defineQuery({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      tab: z.enum(["requests", "upcoming", "history"]),
      q: z.string().trim().max(80).optional(),
      memberId: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      offset: z.number().int().min(0).optional(),
    }),
  ),
  output: zodSchema(providerBookingPageReadModel),
  docs: { summary: "A workspace's bookings, by tab", tags: ["Booking"] },
});

/** One of the workspace's bookings. Null covers "no such booking" and "not yours" alike, as `booking.byId` does. */
export const getProviderBooking = defineQuery({
  input: zodSchema(z.object({ providerId: z.string().min(1), bookingId: z.string().min(1) })),
  output: zodSchema(providerBookingDetailReadModel.nullable()),
  docs: { summary: "One of a workspace's bookings", tags: ["Booking"] },
});
```

and in `bookingReadSchema`:

```ts
    booking: {
      mine: listMyBookings,
      byId: getMyBooking,
      forProvider: listProviderBookings,
      byIdForProvider: getProviderBooking,
    },
```

- [ ] **Step 4: Extend the handlers**

Replace `read/booking/graphql/handlers/queries.handlers.ts`'s exports with:

```ts
import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext, type NtizoGraphqlContext } from "../../../../graphql/context";
import type { BookingReadBootstrap } from "../../bootstrap";
import type { ProviderReadRepositoryPort } from "../../../provider/app/ports/outbound/provider-read.repository.port";
import { bookingReadSchema } from "../schema/queries";

export interface BookingReadModule {
  readonly bookingRead: BookingReadBootstrap;
}

function requireUser(ctx: GraphQLHandlerContext): string {
  // (unchanged)
}

/**
 * Who may read a workspace's bookings: an administrator, or somebody who
 * belongs to it. The wallet's rule, and the wallet's order — the membership
 * check is a query, so it runs only when the cheaper role check has failed,
 * and the role is the session's resolved one, never anything the caller sent.
 */
export async function assertMayReadWorkspace(
  ctx: NtizoGraphqlContext,
  providerId: string,
  providerRead: Pick<ProviderReadRepositoryPort, "isMember">,
): Promise<string> {
  const { requesterUserId, role } = ctx;
  if (!requesterUserId) {
    throw new ForbiddenError({ message: "Sign in to see a workspace's bookings", code: "UNAUTHENTICATED" });
  }
  const allowed = role === "admin" || (await providerRead.isMember(providerId, requesterUserId));
  if (!allowed) {
    throw new ForbiddenError({
      message: "These bookings belong to a workspace you are not part of",
      code: "NOT_PROVIDER_MEMBER",
    });
  }
  return requesterUserId;
}

export function createBookingReadHandlers(mod: BookingReadModule) {
  const uc = mod.bookingRead.useCases;

  return graphqlRoutes(bookingReadSchema)
    .handle("booking.mine", async (_args, ctx) => uc.listMine.execute({ customerId: requireUser(ctx) }))
    .handle("booking.byId", async (args, ctx) =>
      uc.getMine.execute({ bookingId: args.input.bookingId, customerId: requireUser(ctx) }),
    )
    .handle("booking.forProvider", async (args, ctx) => {
      await assertMayReadWorkspace(asNtizoGraphqlContext(ctx), args.input.providerId, uc.providerRead);
      return uc.listForProvider.execute({
        providerId: args.input.providerId,
        tab: args.input.tab,
        q: args.input.q ?? null,
        memberId: args.input.memberId ?? null,
        limit: args.input.limit ?? 20,
        offset: args.input.offset ?? 0,
        now: new Date(),
      });
    })
    .handle("booking.byIdForProvider", async (args, ctx) => {
      await assertMayReadWorkspace(asNtizoGraphqlContext(ctx), args.input.providerId, uc.providerRead);
      return uc.getForProvider.execute({
        providerId: args.input.providerId,
        bookingId: args.input.bookingId,
        now: new Date(),
      });
    })
    .build();
}
```

(`NtizoGraphqlContext` is the type the notification test imports from `../../../graphql/context`; if it is not exported under that name, use `ReturnType<typeof asNtizoGraphqlContext>`.)

- [ ] **Step 5: Extend the bootstrap**

```ts
// read/booking/bootstrap/index.ts — add imports and two use cases
import { DrizzleProviderReadRepository } from "../../provider/infra/repositories/drizzle/provider-read.repository";
import { ListProviderBookingsProjection } from "../app/use-cases/list-provider-bookings.projection";
import { GetProviderBookingProjection } from "../app/use-cases/get-provider-booking.projection";
// …
    useCases: {
      listMine: new ListMyBookingsProjection(repo),
      getMine: new GetMyBookingProjection(repo),
      listForProvider: new ListProviderBookingsProjection(repo),
      getForProvider: new GetProviderBookingProjection(repo),
      /** Only `isMember` is used, and only to answer "may this person look" — the wallet's arrangement. */
      providerRead: new DrizzleProviderReadRepository(),
    },
```

`apps/backend/api/src/graphql/private.ts` already calls `createBookingReadHandlers({ bookingRead })` — nothing to change there. Confirm with `grep -n "createBookingReadHandlers" apps/backend/api/src/graphql/private.ts`.

- [ ] **Step 6: Run the tests and the API's type check**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking` then `cd apps/backend/api && bun run typecheck` (or `bunx tsc --noEmit` if there is no script).
Expected: PASS; no type errors.

- [ ] **Step 7: Smoke it against the dev API**

Start the API (`export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"; cd apps/backend/api && bun run dev`) and, signed out, expect `UNAUTHENTICATED`:

```bash
curl -s http://localhost:8788/graphql -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -d '{"query":"query($i: BookingForProviderInput!){ bookingForProvider(input:$i){ total } }","variables":{"i":{"providerId":"x","tab":"requests"}}}'
```

Expected: an `errors[0].extensions.code` of `UNAUTHENTICATED` (the exact input type name is printed by the schema if the guess above is wrong — copy it from the error).

- [ ] **Step 8: Commit**

```bash
g add packages/backend/src/modules/ntizo/read/booking
g commit -m "feat(booking-read): bookingForProvider and bookingByIdForProvider, member-or-admin at the edge"
```

---

### Task 5: Mutations — `bookingAccept` and `bookingDecline`

**Files:**
- Modify: `packages/backend/src/modules/ntizo/write/booking/graphql/schema/mutations.ts`
- Modify: `packages/backend/src/modules/ntizo/write/booking/graphql/handlers/mutations.handlers.ts`
- Test: `packages/backend/src/modules/ntizo/write/booking/__tests__/mutations.test.ts` (extend)

**Interfaces:**
- Produces: wire `bookingAccept(input: { bookingId })` → `{ bookingId }`; `bookingDecline(input: { bookingId, reason? })` → `{ bookingId }`, `reason` one of `BOOKING_DECLINE_REASONS`.

- [ ] **Step 1: Write the failing test**

Open `write/booking/__tests__/mutations.test.ts`, find how it asserts the schema's field names and input shapes (it mirrors `read/notification`'s `shapeKeys`), and add:

```ts
import { acceptBooking, declineBooking, bookingWriteSchema } from "../graphql/schema/mutations";

describe("accept and decline", () => {
  it("are mounted beside create and submit", () => {
    expect(Object.keys(bookingWriteSchema.fields.booking).sort()).toEqual(["accept", "create", "decline", "submit"]);
  });
  it("take only the booking id — the person comes from the session", () => {
    expect(shapeKeys(acceptBooking)).toEqual(["bookingId"]);
    expect(shapeKeys(declineBooking)).toEqual(["bookingId", "reason"]);
  });
  it("refuse a free-text reason", () => {
    expect(() => declineBooking.input.parse({ bookingId: "b", reason: "I am busy" })).toThrow();
    expect(declineBooking.input.parse({ bookingId: "b", reason: "outside_area" })).toMatchObject({ reason: "outside_area" });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/write/booking`
Expected: FAIL — `acceptBooking` not exported.

- [ ] **Step 3: Add the two mutations**

In `mutations.ts`, import `BOOKING_DECLINE_REASONS` from `@ntizo/shared/read-models` and add:

```ts
/**
 * The provider's yes. Takes only the booking: which workspace it belongs to
 * is on the booking, and whether the caller is in that workspace is the
 * command's check (`ProviderMemberReaderPort.isMember`), not the client's
 * claim. Returns the id and nothing else — the page refetches the booking,
 * which by then carries the payment window on `expiresAt`.
 */
export const acceptBooking = defineMutation({
  input: zodSchema(z.object({ bookingId: z.string().min(1) })),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Accept a booking request", tags: ["Booking"] },
});

/** The provider's no, with one of four reasons or none. Tokens, never prose: the customer's inbox translates them. */
export const declineBooking = defineMutation({
  input: zodSchema(
    z.object({
      bookingId: z.string().min(1),
      reason: z.enum(BOOKING_DECLINE_REASONS).optional(),
    }),
  ),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Decline a booking request", tags: ["Booking"] },
});

export const bookingWriteSchema = defineGraphQLSchema(
  { booking: { create: createBooking, submit: submitBooking, accept: acceptBooking, decline: declineBooking } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
```

- [ ] **Step 4: Add the two handlers**

In `mutations.handlers.ts`, after `booking.submit`:

```ts
    .handle("booking.accept", async (args, ctx) => {
      await uc.acceptBooking.execute({ bookingId: args.input.bookingId, requesterUserId: requireUser(ctx) });
      return { bookingId: args.input.bookingId };
    })
    .handle("booking.decline", async (args, ctx) => {
      await uc.declineBooking.execute({
        bookingId: args.input.bookingId,
        requesterUserId: requireUser(ctx),
        // `undefined` reaches the command as "no reason given", which it
        // records as `declined_without_reason`.
        ...(args.input.reason ? { reason: args.input.reason } : {}),
      });
      return { bookingId: args.input.bookingId };
    })
```

`requireUser`'s message says "Sign in to book a service"; leave it — the code is what the client reads.

- [ ] **Step 5: Run the tests**

Run: `cd packages/backend && bun test src/modules/ntizo/write/booking`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
g add packages/backend/src/modules/ntizo/write/booking
g commit -m "feat(booking-write): mount accept and decline — the commands existed, nothing called them"
```

---

### Task 6: The notification relay from the booking context

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/booking/app/ports/outbound/raise-notification.port.ts`
- Modify: `bounded-contexts/booking/app/use-cases/submit-booking.command.ts`, `accept-booking.command.ts`, `decline-booking.command.ts`, `mark-booking-paid.command.ts`, `sweep-booking.command.ts`
- Modify: `bounded-contexts/booking/bootstrap/index.ts`
- Modify: `apps/backend/api/src/graphql/private.ts`, `apps/backend/api/src/scheduled.ts` (two sites), and any other `bootstrapBooking()` call (`grep -rn "bootstrapBooking()" apps packages --include=*.ts`)
- Test: `bounded-contexts/booking/__tests__/submit-accept-decline-booking.command.test.ts` (extend), `bounded-contexts/booking/__tests__/support/fakes.ts` (add `FakeRaiser`)

**Interfaces:**
- Produces: `RaiseNotificationInternalPort` (booking's copy); `bootstrapBooking(deps: { raiseNotification: RaiseNotificationInternalPort })`; the five commands take the port as their **last** constructor argument.

- [ ] **Step 1: Declare the port (a copy, not an import)**

```ts
// bounded-contexts/booking/app/ports/outbound/raise-notification.port.ts
import type { NotificationType } from "@ntizo/shared";

/**
 * What raising a notification looks like from this side of the boundary —
 * the same discriminated union `RaiseNotificationInput` in the notification
 * context is, declared again here rather than imported, exactly as
 * `bounded-contexts/communication/app/ports/outbound/raise-notification.port.ts`
 * does and for the reason written there: no `app/` tree imports another
 * context's `app/` tree.
 */
export type RaiseNotificationInput =
  | { type: NotificationType; audience: "user"; userId: string; payload: Record<string, unknown> }
  | { type: NotificationType; audience: "provider"; providerId: string; payload: Record<string, unknown> };

export interface RaiseNotificationInternalPort {
  execute(input: RaiseNotificationInput): Promise<{ notificationId: string }>;
}

/**
 * Raise, and never let it fail the write that just committed. A request that
 * was accepted and not announced is recoverable; one un-accepted because an
 * email adapter hiccupped is not (BR-P6). Logged with the booking id so a
 * missing announcement can be found.
 */
export async function raiseQuietly(
  port: RaiseNotificationInternalPort,
  input: RaiseNotificationInput,
  bookingId: string,
): Promise<void> {
  try {
    await port.execute(input);
  } catch (error) {
    console.error(`[booking] notification ${input.type} for ${bookingId} not raised`, error);
  }
}
```

- [ ] **Step 2: Add a fake and the failing command tests**

In `__tests__/support/fakes.ts`, append:

```ts
import type { RaiseNotificationInput, RaiseNotificationInternalPort } from "../../app/ports/outbound/raise-notification.port";

export class FakeRaiser implements RaiseNotificationInternalPort {
  public readonly raised: RaiseNotificationInput[] = [];
  constructor(private readonly failWith: Error | null = null) {}
  async execute(input: RaiseNotificationInput): Promise<{ notificationId: string }> {
    if (this.failWith) throw this.failWith;
    this.raised.push(input);
    return { notificationId: `n-${this.raised.length}` };
  }
}
```

In `submit-accept-decline-booking.command.test.ts`, every `new SubmitBookingCommand(...)`, `new AcceptBookingCommand(...)`, `new DeclineBookingCommand(...)` gains a trailing `raiser` argument (`const raiser = new FakeRaiser()` beside the other fakes). Then add, using the file's own fixtures (`bookingInput`, `withId`, the fake repo that holds a booking in a given status):

```ts
describe("notifications", () => {
  it("submit tells the workspace a request arrived", async () => {
    // arrange a DRAFT booking as the existing submit tests do, then:
    await submit.execute(submitInput());
    expect(raiser.raised).toEqual([
      expect.objectContaining({
        type: "PROVIDER_BOOKING_RECEIVED",
        audience: "provider",
        providerId: PROVIDER_ID,
        payload: expect.objectContaining({ bookingId: BOOKING_ID, serviceName: expect.any(String), customerFirstName: expect.any(String) }),
      }),
    ]);
  });

  it("accept tells the customer the provider said yes; decline tells them no, with the reason", async () => {
    await accept.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID });
    expect(raiser.raised.at(-1)).toMatchObject({ type: "BOOKING_ACCEPTED", audience: "user", userId: CUSTOMER_ID });
    // re-arrange an AWAITING_PROVIDER booking, then:
    await decline.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID, reason: "outside_area" });
    expect(raiser.raised.at(-1)).toMatchObject({ type: "BOOKING_DECLINED", audience: "user", userId: CUSTOMER_ID, payload: expect.objectContaining({ reason: "outside_area" }) });
  });

  it("a raiser that throws does not fail the accept", async () => {
    const broken = new FakeRaiser(new Error("smtp down"));
    const acceptWithBroken = new AcceptBookingCommand(repo, members, settings, delayedJobs, uow, outbox, broken);
    await expect(acceptWithBroken.execute({ bookingId: BOOKING_ID, requesterUserId: OWNER_ID })).resolves.toBeUndefined();
  });
});
```

Use the constants and fake names the file already defines (read its top 120 lines first; `PROVIDER_ID`, `BOOKING_ID`, `CUSTOMER_ID`, `OWNER_ID` stand for whatever it calls them). Payload for submit needs the customer's first name, which the command does not read today — see Step 4.

- [ ] **Step 3: Run to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking/__tests__/submit-accept-decline-booking.command.test.ts`
Expected: FAIL — constructor arity / `raised` empty.

- [ ] **Step 4: Wire the port into the five commands**

Each command: add `private readonly raiseNotification: RaiseNotificationInternalPort` as the last constructor parameter, import `raiseQuietly` and `NotificationType` (`import { NotificationType } from "@ntizo/shared"`), and raise **after** `atomicExecute` resolves, only when the write was applied (`moved`/`applied` known outside the transaction — capture what you need in the value the transaction returns).

`submit-booking.command.ts` — the transaction already returns `respondBy`; widen it to return `{ respondBy, moved } | null` and after the `if (respondBy)` block:

```ts
    if (result) {
      await raiseQuietly(
        this.raiseNotification,
        {
          type: NotificationType.ProviderBookingReceived,
          audience: "provider",
          providerId: result.moved.providerId,
          payload: {
            bookingId: input.bookingId,
            serviceName: result.moved.serviceName,
            startsAt: result.moved.startsAt.toISOString(),
            timezone: null,
            customerFirstName: input.customerFirstName ?? null,
            respondBy: result.respondBy.toISOString(),
          },
        },
        input.bookingId,
      );
    }
```

`customerFirstName` is not on `SubmitBookingInput`. Add it as optional there (`customerFirstName?: string | null`) and have the GraphQL handler pass `asNtizoGraphqlContext(ctx).firstName` (the context carries `firstName`; see the notification test's `ctx()` shape). The template names the customer by it; a null renders as "um cliente".

`accept-booking.command.ts` — the transaction returns `payBy`; also return the aggregate. After scheduling the deadline:

```ts
    await raiseQuietly(this.raiseNotification, {
      type: NotificationType.BookingAccepted,
      audience: "user",
      userId: moved.customerId,
      payload: { bookingId: input.bookingId, serviceName: moved.serviceName, providerName: moved.providerName, startsAt: moved.startsAt.toISOString(), payBy: payBy.toISOString(), priceMinor: moved.priceMinor, currency: moved.currency },
    }, input.bookingId);
```

`decline-booking.command.ts` — return the aggregate from the transaction (null when not applied):

```ts
    if (moved) {
      await raiseQuietly(this.raiseNotification, {
        type: NotificationType.BookingDeclined,
        audience: "user",
        userId: moved.customerId,
        payload: { bookingId: input.bookingId, serviceName: moved.serviceName, providerName: moved.providerName, startsAt: moved.startsAt.toISOString(), reason: input.reason ?? "declined_without_reason" },
      }, input.bookingId);
    }
```

`mark-booking-paid.command.ts` — two raises after a successful transition (`BookingConfirmed` to the customer, `ProviderBookingConfirmed` to the provider), payloads `{ bookingId, serviceName, startsAt, priceMinor, currency }` plus `providerName` for the customer and `customerFirstName: null` for the provider (the aggregate has no name; the template says "um cliente").

`sweep-booking.command.ts` — where it cancels with `CUSTOMER_DID_NOT_PAY`, raise `ProviderBookingCancelledByCustomer` to `moved.providerId` with `payload: { bookingId, serviceName, startsAt, reason: "customer_did_not_pay" }`. Expiries (`provider_did_not_respond`, `checkout_hold_expired`) raise nothing in this phase.

Check the aggregate exposes `serviceName`, `providerName`, `customerId`, `providerId` as getters (`grep -n "get serviceName\|get providerName" bounded-contexts/booking/domain/aggregates/booking.aggregate.ts`); the events above are built from the same getters, so they exist.

- [ ] **Step 5: Change the bootstrap signature and every call site**

```ts
// bounded-contexts/booking/bootstrap/index.ts
import type { RaiseNotificationInternalPort } from "../app/ports/outbound/raise-notification.port";

export interface BookingBootstrapDeps {
  /** The notification context's `RaiseNotificationInternalCommand`, handed over by the composition root — never imported here. */
  raiseNotification: RaiseNotificationInternalPort;
}

export function bootstrapBooking(deps: BookingBootstrapDeps) {
  // … existing construction …
  const sweepBooking = new SweepBookingCommand(bookingRepository, slotHold, unitOfWork, outboxPort, deps.raiseNotification);
  const markBookingPaid = new MarkBookingPaidCommand(bookingRepository, unitOfWork, outboxPort, deps.raiseNotification);
  // submitBooking / acceptBooking / declineBooking: append `deps.raiseNotification`
```

Call sites — `private.ts`: `const booking = bootstrapBooking({ raiseNotification: notification.useCases.internal.raiseNotification });` (move `const notification = bootstrapNotification();` above it). `scheduled.ts` (two sites): the `notification` bootstrap already exists at the first site; construct one at the second the same way. Any test that calls `bootstrapBooking()` gets `bootstrapBooking({ raiseNotification: new FakeRaiser() })`.

- [ ] **Step 6: Run the booking context's suite, then the whole backend package**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking && bun test`
Expected: PASS. Then `cd apps/backend/api && bun run typecheck`.

- [ ] **Step 7: Commit**

```bash
g add packages/backend/src/modules/ntizo/bounded-contexts/booking apps/backend/api/src
g commit -m "feat(booking): raise notifications through a port — received, accepted, declined, confirmed, lapsed"
```

---

### Task 7: Email templates for the three that must reach a person who is not in the app

**Files:**
- Create: `bounded-contexts/notification/infrastructure/templates/provider-booking-received.template.ts`, `booking-accepted.template.ts`, `booking-declined.template.ts`
- Modify: `bounded-contexts/notification/infrastructure/templates/registry.ts`
- Test: `bounded-contexts/notification/__tests__/booking-templates.test.ts`

A type with no template produces the in-app row and no email — `deliver-notification.internal.command.ts` renders first and returns nothing for an unknown type — so `BOOKING_CONFIRMED`, `PROVIDER_BOOKING_CONFIRMED` and `PROVIDER_BOOKING_CANCELLED_BY_CUSTOMER` are in-app only in this phase.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { TEMPLATE_REGISTRY } from "../infrastructure/templates/registry";
import { TEMPLATE_LOCALES } from "../infrastructure/templates/copy";

const payload = {
  bookingId: "bk-1", serviceName: "Corte de cabelo", providerName: "Estúdio Mavalane",
  customerFirstName: "Ana", startsAt: "2026-09-05T09:00:00.000Z", payBy: "2026-09-04T11:00:00.000Z",
  respondBy: "2026-09-04T11:00:00.000Z", reason: "outside_area", priceMinor: 80000, currency: "MZN",
};

describe("booking templates", () => {
  it.each([
    NotificationType.ProviderBookingReceived,
    NotificationType.BookingAccepted,
    NotificationType.BookingDeclined,
  ])("%s renders in every locale and names the service", (type) => {
    const template = TEMPLATE_REGISTRY[type];
    expect(template).toBeDefined();
    for (const locale of TEMPLATE_LOCALES) {
      const out = template!.render(locale, payload);
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.html).toContain("Corte de cabelo");
      expect(out.text).toContain("Corte de cabelo");
    }
  });

  it("the received template links to the workspace's bookings, the customer ones to the customer's", () => {
    expect(TEMPLATE_REGISTRY[NotificationType.ProviderBookingReceived]!.render("pt-MZ", payload).text).toContain("/provider");
    expect(TEMPLATE_REGISTRY[NotificationType.BookingAccepted]!.render("pt-MZ", payload).text).toContain("/bookings");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/notification/__tests__/booking-templates.test.ts`
Expected: FAIL — `template` undefined.

- [ ] **Step 3: Write the three templates**

Copy `new-message.template.ts`'s shape exactly (a `Copy` interface, seven `Copy` constants, `BY_LOCALE`, one exported `TemplateModule`). The received template:

```ts
// provider-booking-received.template.ts
import { emailLayout, buttonHtml } from "../../../../../../shared/infrastructure/email/templates/layout";
import { appBaseUrl, escapeHtml, pickCopy, type TemplateModule } from "./copy";

interface Copy { subject: string; heading: string; body: (service: string, who: string) => string; cta: string; disclaimer: string; nobody: string; }

const PT: Copy = {
  subject: "Novo pedido de reserva na Ntizo",
  heading: "Tem um pedido por responder",
  body: (service, who) => `${who} pediu ${service}. Tem um prazo para aceitar ou recusar; depois disso o pedido expira.`,
  cta: "Responder ao pedido",
  disclaimer: "Recebeu este email porque faz parte de um espaço de trabalho na Ntizo que recebeu um pedido.",
  nobody: "Um cliente",
};
// EN, ES, FR, IT, DE, NL: the same five strings in each language (translate faithfully; "nobody" is the word for an unnamed customer).

export const BY_LOCALE: Record<string, Copy> = { "pt-MZ": PT, "pt-PT": PT, "en-US": EN, "es-ES": ES, "fr-FR": FR, "it-IT": IT, "de-DE": DE, "nl-NL": NL };

export const providerBookingReceivedTemplate: TemplateModule = {
  render(locale, payload) {
    const c = pickCopy(BY_LOCALE, locale);
    const service = typeof payload.serviceName === "string" ? payload.serviceName : "";
    const who = typeof payload.customerFirstName === "string" && payload.customerFirstName ? payload.customerFirstName : c.nobody;
    const url = `${appBaseUrl()}/provider`;
    const body = c.body(service, who);
    return {
      subject: c.subject,
      html: emailLayout({ heading: c.heading, bodyHtml: `<p style="font-size:14px;color:#333;line-height:1.5;">${escapeHtml(body)}</p>${buttonHtml(url, c.cta)}`, disclaimer: c.disclaimer }),
      text: `${c.heading}\n\n${body}\n\n${url}`,
    };
  },
};
```

`booking-accepted.template.ts`: subject "O prestador aceitou o seu pedido", body "${providerName} aceitou ${service}. O pedido de pagamento M-Pesa chega ao seu telemóvel; confirme-o antes de o prazo terminar.", cta "Ver a reserva", url `${appBaseUrl()}/bookings`. `booking-declined.template.ts`: subject "O prestador não pôde aceitar o seu pedido", body "${providerName} não pôde aceitar ${service}. Nada foi cobrado. Pode escolher outra hora ou outro prestador.", cta "Procurar outra hora", url `${appBaseUrl()}/services`. (The declined body does not print the reason token — it is a token, and the in-app row translates it.)

Register all three in `registry.ts`.

- [ ] **Step 4: Run the test and the notification context's suite**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/notification`
Expected: PASS (an existing test enumerates the registry; if it pins the exact key list, add the three).

- [ ] **Step 5: Commit**

```bash
g add packages/backend/src/modules/ntizo/bounded-contexts/notification
g commit -m "feat(notification): emails for a request received, accepted and declined"
```

---

### Task 8: Locale blocks, the sidebar entry, and the inbox's presentation of the new types

> **Superseded reference (2026-09-06):** `shared/lib/navigation.ts` and `providerNavGroups` no longer exist. The sidebar entry now goes into `shared/lib/console-nav.ts` — add `bookings` as the first item of `WORKSPACE.work` with `primary: true` and `count: "bookingRequests"`, remove `primary` from `services`, and extend `shared/lib/__tests__/console-nav.test.ts` (the "puts Messages, Calendar and Services on the provider bar" case becomes Bookings, Messages, Calendar). Also add `navShort.bookings` to all eight `provider.json` files. See `2026-09-06-console-navigation-design.md`.

**Files:**
- Modify: `apps/frontend/web/src/shared/locales/<8>/provider.json` — a `bookings` **object** block (the flat `"bookings": "Bookings"` string exists; replace it with the object below and keep `nav.bookings` for the sidebar)
- Modify: `apps/frontend/web/src/shared/locales/<8>/notifications.json` — six `type.*` keys
- Modify: `apps/frontend/web/src/features/notifications/domain/notification-presentation.ts`
- Modify: `apps/frontend/web/src/shared/lib/navigation.ts`, `shared/lib/__tests__/navigation.test.ts`

- [ ] **Step 1: Write the failing navigation test**

Append to `navigation.test.ts`:

```ts
describe("providerNavGroups: bookings", () => {
  it("is the first entry of the work group", () => {
    const work = providerNavGroups.find((g) => g.labelKey === "nav.work")!;
    expect(work.items[0]).toMatchObject({ titleKey: "nav.bookings", url: "/provider/$slug/bookings" });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/frontend/web && bun run vitest run src/shared/lib/__tests__/navigation.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the nav item**

In `navigation.ts`, import `CalendarCheck` from `lucide-react` and insert as the first item of `nav.work`:

```ts
    // First, above what the workspace sells: a request waiting for an answer
    // is the one thing in this zone that is somebody else's time running out.
    { titleKey: "nav.bookings", url: "/provider/$slug/bookings", icon: CalendarCheck },
```

- [ ] **Step 4: Add the locale keys (all eight files)**

`provider.json` — add `"bookings": "Reservas"` under `nav` (en "Bookings", es "Reservas", fr "Réservations", de "Buchungen", it "Prenotazioni", nl "Boekingen"), and replace the top-level `"bookings": "Bookings"` string with this object (pt-MZ shown; translate for the rest, keep the keys):

```json
"bookings": {
  "title": "Reservas",
  "subtitle": "Pedidos por responder, marcações à frente e o que já passou.",
  "tab": { "requests": "Pedidos", "upcoming": "Próximas", "history": "Histórico" },
  "searchPlaceholder": "Pesquisar cliente ou serviço",
  "memberFilterAll": "Todos os profissionais",
  "memberAnyone": "Qualquer pessoa",
  "col": { "customer": "Cliente", "service": "Serviço", "when": "Quando", "price": "Preço", "status": "Estado" },
  "shownOf": "A mostrar {{shown}} de {{total}}",
  "loadMore": "Mais",
  "respondIn": "Responder em {{time}}",
  "respondBy": "Responder até {{time}}",
  "status": {
    "AWAITING_PROVIDER": "Por responder", "PENDING_PAYMENT": "À espera de pagamento", "CONFIRMED": "Confirmada",
    "MARKED_DONE": "Concluída", "COMPLETED": "Concluída", "DISPUTED": "Em disputa",
    "DECLINED": "Recusada", "CANCELLED": "Cancelada", "EXPIRED": "Expirada"
  },
  "empty": {
    "requests": { "title": "Nenhum pedido por responder", "body": "Quando um cliente pedir uma marcação, aparece aqui com o prazo para responder." },
    "upcoming": { "title": "Nada marcado à frente", "body": "As reservas confirmadas e as que aguardam pagamento ficam aqui." },
    "history": { "title": "Ainda sem reservas", "body": "O que já aconteceu, foi recusado ou expirou fica aqui." }
  },
  "noMatchesTitle": "Sem resultados",
  "noMatches": "Nenhuma reserva corresponde à pesquisa.",
  "loadError": "Não foi possível carregar as reservas.",
  "retry": "Tentar de novo",
  "back": "Reservas",
  "notFoundTitle": "Reserva não encontrada",
  "notFoundBody": "Não existe, ou pertence a outro espaço de trabalho.",
  "reference": "Ref. {{ref}}",
  "accept": "Aceitar",
  "decline": "Recusar",
  "accepted": "Aceite. Enviámos o pedido de pagamento ao cliente.",
  "declined": "Pedido recusado. O cliente foi avisado.",
  "alreadyAnswered": "Este pedido já foi respondido.",
  "actionError": "Não foi possível responder agora. Tente de novo.",
  "declineTitle": "Recusar este pedido?",
  "declineBody": "O cliente é avisado e pode escolher outra hora ou outro prestador. Nada é cobrado.",
  "declineReason": { "not_available": "Não estou disponível a essa hora", "cannot_perform": "Não faço este serviço", "outside_area": "Fora da minha zona", "other": "Outro motivo" },
  "declineConfirm": "Recusar pedido",
  "cancel": "Cancelar",
  "section": {
    "appointment": "Marcação", "appointmentBlurb": "O que foi pedido, quando e onde.",
    "customer": "Cliente", "customerBlurb": "Quem pediu.",
    "note": "Nota do cliente", "noteBlurb": "O que o cliente escreveu sobre o trabalho."
  },
  "when": "Quando", "duration": "Duração", "where": "Onde", "with": "Com",
  "minutes": "{{count}} min",
  "location": { "at_customer": "Em casa do cliente", "at_provider": "No seu espaço", "remote": "À distância", "flexible": "A combinar" },
  "hiddenUntilPaid": "Contacto e morada exacta aparecem depois de a reserva estar confirmada e paga.",
  "phone": "Telemóvel", "email": "Email", "address": "Morada",
  "money": "Dinheiro", "price": "Preço", "commission": "Comissão ({{rate}})", "payout": "A receber",
  "timeline": "Linha temporal",
  "timelineReason": {
    "created_by_customer": "Reserva iniciada", "submitted_by_customer": "Pedido enviado", "accepted_by_provider": "Aceite",
    "declined_without_reason": "Recusado", "not_available": "Recusado: sem disponibilidade", "cannot_perform": "Recusado: serviço não prestado",
    "outside_area": "Recusado: fora da zona", "other": "Recusado", "provider_did_not_respond": "Expirou sem resposta",
    "customer_did_not_pay": "Cancelada: pagamento não concluído", "checkout_hold_expired": "Rascunho expirou",
    "respond_by": "Responder até", "pay_by": "Pagamento até", "unknown": "Estado alterado"
  },
  "technical": "Detalhes técnicos", "bookingId": "Reserva", "serviceOptionId": "Opção", "memberId": "Profissional", "paymentRef": "Referência de pagamento", "none": "—"
}
```

`notifications.json` `type` block, six keys (pt-MZ; translate for the rest): `"providerBookingReceived": "Tem um pedido de reserva por responder"`, `"bookingAccepted": "O prestador aceitou o seu pedido — confirme o pagamento"`, `"bookingDeclined": "O prestador não pôde aceitar o seu pedido"`, `"bookingConfirmed": "A sua reserva está confirmada"`, `"providerBookingConfirmed": "Uma reserva foi paga e está confirmada"`, `"providerBookingCancelledByCustomer": "Uma reserva foi cancelada"`.

`notification-presentation.ts` — import `CalendarCheck, CalendarX, CircleDollarSign` and add:

```ts
  PROVIDER_BOOKING_RECEIVED: { icon: CalendarCheck, key: "providerBookingReceived" },
  BOOKING_ACCEPTED: { icon: CircleDollarSign, key: "bookingAccepted" },
  BOOKING_DECLINED: { icon: CalendarX, key: "bookingDeclined" },
  BOOKING_CONFIRMED: { icon: CalendarCheck, key: "bookingConfirmed" },
  PROVIDER_BOOKING_CONFIRMED: { icon: CalendarCheck, key: "providerBookingConfirmed" },
  PROVIDER_BOOKING_CANCELLED_BY_CUSTOMER: { icon: CalendarX, key: "providerBookingCancelledByCustomer" },
```

- [ ] **Step 5: Run the navigation test, the parity tests and the notification tests**

Run: `cd apps/frontend/web && bun run vitest run src/shared/lib src/shared/locales src/features/notifications`
Expected: PASS. A parity failure names the locale and key that is missing — add it.

- [ ] **Step 6: Commit**

```bash
g add apps/frontend/web/src/shared apps/frontend/web/src/features/notifications
g commit -m "feat(web): 'Reservas' in the sidebar, its copy in eight languages, and the inbox's six booking rows"
```

---

### Task 9: The feature's domain, data and viewmodel layers

**Files:**
- Create: `apps/frontend/web/src/features/provider/bookings/domain/status.ts`
- Create: `apps/frontend/web/src/features/provider/bookings/domain/__tests__/status.test.ts`
- Create: `apps/frontend/web/src/features/provider/bookings/data/booking.repository.ts`
- Create: `apps/frontend/web/src/features/provider/bookings/viewmodel/use-provider-bookings.ts`

**Interfaces:**
- Produces: `STATUS_TONE: Record<ProviderBookingStatus, BadgeTone>`, `type ProviderTab`, `PROVIDER_TABS`, `shortReference(id)`, `payoutMinor(b)`, `commissionRate(bps, locale)`, `timeLeft(respondBy, now)` → `{ minutes, label: "hours" | "minutes" | "past" }`; `providerBookingQueries.page(input)`, `providerBookingQueries.detail(providerId, bookingId)`, `acceptBooking(bookingId)`, `declineBooking(bookingId, reason?)`; hooks `useProviderBookings(input)`, `useProviderBooking(providerId, bookingId)`, `useAnswerBooking(providerId)`.

- [ ] **Step 1: Write the failing domain test**

```ts
// domain/__tests__/status.test.ts
import { describe, expect, it } from "vitest";
import { STATUS_TONE, commissionRate, payoutMinor, shortReference, timeLeft } from "../status";

describe("bookings domain", () => {
  it("maps every provider-visible status to a tone, warning for the one that needs an answer", () => {
    expect(STATUS_TONE.AWAITING_PROVIDER).toBe("warning");
    expect(STATUS_TONE.CONFIRMED).toBe("success");
    expect(STATUS_TONE.DECLINED).toBe("danger");
    expect(STATUS_TONE.EXPIRED).toBe("neutral");
  });
  it("the reference is the first eight characters of the id, uppercased", () => {
    expect(shortReference("a1b2c3d4-e5f6-7890")).toBe("A1B2C3D4");
  });
  it("the payout is the price less the commission", () => {
    expect(payoutMinor({ priceMinor: 80000, commissionMinor: 8000 })).toBe(72000);
  });
  it("the rate prints as a percentage in the reader's locale", () => {
    expect(commissionRate(1000, "pt-MZ")).toBe("10%");
    expect(commissionRate(1250, "en-US")).toBe("12.5%");
  });
  it("time left counts down in hours, then minutes, then says it passed", () => {
    const now = new Date("2026-09-04T10:00:00.000Z");
    expect(timeLeft("2026-09-04T12:30:00.000Z", now)).toEqual({ minutes: 150, label: "hours" });
    expect(timeLeft("2026-09-04T10:20:00.000Z", now)).toEqual({ minutes: 20, label: "minutes" });
    expect(timeLeft("2026-09-04T09:00:00.000Z", now)).toEqual({ minutes: 0, label: "past" });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/frontend/web && bun run vitest run src/features/provider/bookings`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the domain module**

```ts
// domain/status.ts
import type { ProviderBookingDTO } from "@ntizo/shared/read-models";

export type ProviderBookingStatus = ProviderBookingDTO["status"];
export type BadgeTone = "info" | "success" | "danger" | "warning" | "neutral";

export const PROVIDER_TABS = ["requests", "upcoming", "history"] as const;
export type ProviderTab = (typeof PROVIDER_TABS)[number];

/** The spec's chip table. Warning is reserved for the one status that is a task. */
export const STATUS_TONE: Record<ProviderBookingStatus, BadgeTone> = {
  AWAITING_PROVIDER: "warning",
  PENDING_PAYMENT: "info",
  CONFIRMED: "success",
  MARKED_DONE: "neutral",
  COMPLETED: "neutral",
  DISPUTED: "danger",
  DECLINED: "danger",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
};

/** Enough to say over the phone; not a second id. */
export function shortReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/** What the provider receives: the commission comes out of the payout. */
export function payoutMinor(b: { priceMinor: number; commissionMinor: number }): number {
  return b.priceMinor - b.commissionMinor;
}

export function commissionRate(bps: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(bps / 10_000);
}

export function timeLeft(deadlineIso: string, now: Date): { minutes: number; label: "hours" | "minutes" | "past" } {
  const minutes = Math.floor((new Date(deadlineIso).getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return { minutes: 0, label: "past" };
  return { minutes, label: minutes >= 60 ? "hours" : "minutes" };
}

/** "1h42" or "20 min" — the countdown wording the list and the page share. */
export function timeLeftWording(deadlineIso: string, now: Date): string | null {
  const left = timeLeft(deadlineIso, now);
  if (left.label === "past") return null;
  if (left.label === "minutes") return `${left.minutes} min`;
  const h = Math.floor(left.minutes / 60);
  const m = left.minutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Write the repository**

```ts
// data/booking.repository.ts
import { queryOptions } from "@tanstack/react-query";
import type {
  BookingDeclineReason,
  ProviderBookingDetailDTO,
  ProviderBookingPageDTO,
} from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type { ProviderTab } from "../domain/status";

const ROW_FIELDS = `
  id status createdAt serviceId serviceOptionId serviceName optionName durationMinutes locationType
  providerMemberId memberFirstName customerFirstName startsAt endsAt timezone
  addressDistrict addressCity priceMinor commissionBps commissionMinor currency respondBy`;

const PAGE = `
  query BookingForProvider($input: BookingForProviderInput!) {
    bookingForProvider(input: $input) {
      items {${ROW_FIELDS}
      }
      total nextOffset
      members { id firstName }
    }
  }`;

const DETAIL = `
  query BookingByIdForProvider($input: BookingByIdForProviderInput!) {
    bookingByIdForProvider(input: $input) {${ROW_FIELDS}
      addressLabel addressLine addressDirections customerPhone customerEmail description paymentRef expiresAt
      timeline { at reason actor pending }
    }
  }`;

const ACCEPT = `
  mutation BookingAccept($input: BookingAcceptInput!) {
    bookingAccept(input: $input) { bookingId }
  }`;

const DECLINE = `
  mutation BookingDecline($input: BookingDeclineInput!) {
    bookingDecline(input: $input) { bookingId }
  }`;

export interface ProviderBookingsPageInput {
  providerId: string;
  tab: ProviderTab;
  q: string;
  memberId: string | null;
  offset: number;
}

export const PROVIDER_BOOKINGS_PAGE_SIZE = 20;

/**
 * Keys start with the workspace, so switching provider cannot serve one
 * workspace's rows under another's heading; every narrowing is in the key.
 */
export const providerBookingQueries = {
  page: (input: ProviderBookingsPageInput) =>
    queryOptions({
      queryKey: ["provider", input.providerId, "bookings", input.tab, input.q, input.memberId, input.offset] as const,
      queryFn: async (): Promise<ProviderBookingPageDTO> => {
        const d = await sessionGraphql<{ bookingForProvider: ProviderBookingPageDTO }>(PAGE, {
          input: {
            providerId: input.providerId,
            tab: input.tab,
            ...(input.q.trim() ? { q: input.q.trim() } : {}),
            ...(input.memberId ? { memberId: input.memberId } : {}),
            limit: PROVIDER_BOOKINGS_PAGE_SIZE,
            offset: input.offset,
          },
        });
        return d.bookingForProvider;
      },
      enabled: input.providerId !== "",
    }),
  detail: (providerId: string, bookingId: string) =>
    queryOptions({
      queryKey: ["provider", providerId, "booking", bookingId] as const,
      queryFn: async (): Promise<ProviderBookingDetailDTO | null> => {
        const d = await sessionGraphql<{ bookingByIdForProvider: ProviderBookingDetailDTO | null }>(DETAIL, {
          input: { providerId, bookingId },
        });
        return d.bookingByIdForProvider;
      },
      enabled: providerId !== "" && bookingId !== "",
    }),
};

export async function acceptBooking(bookingId: string): Promise<void> {
  await sessionGraphql<{ bookingAccept: { bookingId: string } }>(ACCEPT, { input: { bookingId } });
}

export async function declineBooking(bookingId: string, reason?: BookingDeclineReason): Promise<void> {
  await sessionGraphql<{ bookingDecline: { bookingId: string } }>(DECLINE, {
    input: { bookingId, ...(reason ? { reason } : {}) },
  });
}
```

The GraphQL input type names (`BookingForProviderInput` etc.) follow the kit's convention seen in `ServiceMineInput` and `BookingByIdInput`; confirm against the running API's introspection if a query errors with "Unknown type".

- [ ] **Step 5: Write the hooks**

```ts
// viewmodel/use-provider-bookings.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BookingDeclineReason } from "@ntizo/shared/read-models";
import {
  acceptBooking,
  declineBooking,
  providerBookingQueries,
  type ProviderBookingsPageInput,
} from "../data/booking.repository";

export function useProviderBookings(input: ProviderBookingsPageInput) {
  return useQuery(providerBookingQueries.page(input));
}

export function useProviderBooking(providerId: string, bookingId: string) {
  return useQuery(providerBookingQueries.detail(providerId, bookingId));
}

/**
 * Accept or decline, then drop every cached read of this workspace's
 * bookings: the row moves tabs, the detail's status and timeline change, and
 * the sidebar's count of what needs an answer goes down by one.
 */
export function useAnswerBooking(providerId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["provider", providerId] });
  const accept = useMutation({
    mutationFn: (bookingId: string) => acceptBooking(bookingId),
    onSuccess: invalidate,
  });
  const decline = useMutation({
    mutationFn: (v: { bookingId: string; reason?: BookingDeclineReason }) => declineBooking(v.bookingId, v.reason),
    onSuccess: invalidate,
  });
  return { accept, decline };
}
```

- [ ] **Step 6: Run the domain test, typecheck and lint**

Run: `cd apps/frontend/web && bun run vitest run src/features/provider/bookings && bun run typecheck && bun run lint`
Expected: PASS; `eslint-plugin-boundaries` accepts `domain/ data/ viewmodel/`.

- [ ] **Step 7: Commit**

```bash
g add apps/frontend/web/src/features/provider/bookings
g commit -m "feat(web): the provider bookings feature's domain, repository and hooks"
```

---

### Task 10: The list page, its route, and the sidebar badge

**Files:**
- Create: `apps/frontend/web/src/features/provider/bookings/ui/booking-status-badge.tsx`
- Create: `apps/frontend/web/src/features/provider/bookings/ui/bookings-page.tsx`
- Create: `apps/frontend/web/src/routes/provider/$slug/bookings.index.tsx`
- Modify: `apps/frontend/web/src/shared/components/app-sidebar/sidebar-nav.tsx` (badge)
- Test: `apps/frontend/web/src/features/provider/bookings/ui/__tests__/bookings-page.test.tsx`

**Interfaces:**
- Consumes: Task 9's hooks and domain; `CollectionCard`, `Badge`, `EmptyCard`, `usePageHeader`, `useActiveProvider`, `compactSlotWording`, `formatMoney`.
- Produces: `BookingsPage` (default export none; named), `BookingStatusBadge({ status })`.

- [ ] **Step 1: Write the failing page test**

Model the harness on `features/checkout/ui/__tests__/choose-when-page.test.tsx` (a `rootRoute`, `createRoute`s, `createRouter` with `createMemoryHistory`, a `QueryClientProvider`, `i18n.changeLanguage("pt-MZ")` in `beforeEach`). Mock the seams:

```ts
vi.mock("@/features/provider/bookings/data/booking.repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/provider/bookings/data/booking.repository")>();
  return { ...actual, providerBookingQueries: { ...actual.providerBookingQueries, page: vi.fn(actual.providerBookingQueries.page) }, acceptBooking: vi.fn(), declineBooking: vi.fn() };
});
vi.mock("@/shared/lib/graphql/session-graphql", () => ({ sessionGraphql: vi.fn() }));
vi.mock("@/features/provider/viewmodel/use-active-provider", () => ({
  useActiveProvider: () => ({ activeProvider: { id: "prov-1", slug: "estudio", name: "Estúdio Mavalane", role: "owner", type: "organization" }, providers: [], setActive: () => {}, isLoading: false }),
}));
```

Have `sessionGraphql` resolve `{ bookingForProvider: page }` where `page` is a fixture with two `AWAITING_PROVIDER` rows (one `respondBy` 90 minutes ahead), `total: 2`, `nextOffset: null`, `members: [{ id: "mem-1", firstName: "Célia" }]`. Then:

```ts
it("lists the requests with the customer, the service, the time and a countdown", async () => {
  renderBookings("/provider/estudio/bookings");
  expect(await screen.findByText("Ana")).toBeInTheDocument();
  expect(screen.getByText("Corte de cabelo · Célia")).toBeInTheDocument();
  expect(screen.getByText("Por responder")).toBeInTheDocument();
  expect(screen.getByText(/1h30/)).toBeInTheDocument();
});

it("switches tab through the URL, so a tab survives a refresh", async () => {
  const { router } = renderBookings("/provider/estudio/bookings");
  await screen.findByText("Ana");
  await userEvent.click(screen.getByRole("tab", { name: /histórico/i }));
  await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "history" }));
});

it("names the empty tab", async () => {
  // sessionGraphql resolves an empty page
  renderBookings("/provider/estudio/bookings?tab=requests");
  expect(await screen.findByText("Nenhum pedido por responder")).toBeInTheDocument();
});

it("opens a row on its own page", async () => {
  const { router } = renderBookings("/provider/estudio/bookings");
  await userEvent.click(await screen.findByRole("link", { name: /Ana/ }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/provider/estudio/bookings/bk-1"));
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/frontend/web && bun run vitest run src/features/provider/bookings/ui`
Expected: FAIL — module not found.

- [ ] **Step 3: The status badge**

```tsx
// ui/booking-status-badge.tsx
import { useTranslation } from "react-i18next";
import { Badge } from "@ntizo/frontend-ui";
import { STATUS_TONE, type ProviderBookingStatus } from "../domain/status";

export function BookingStatusBadge({ status }: { status: ProviderBookingStatus }) {
  const { t } = useTranslation("provider");
  return <Badge tone={STATUS_TONE[status]}>{t(`bookings.status.${status}`)}</Badge>;
}
```

- [ ] **Step 4: The route, with the tab in the URL**

```tsx
// routes/provider/$slug/bookings.index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { BookingsPage } from "@/features/provider/bookings/ui/bookings-page";
import { PROVIDER_TABS, type ProviderTab } from "@/features/provider/bookings/domain/status";

/**
 * The tab lives in the URL: a provider who refreshes on "Histórico" stays
 * there, and a link to "the requests" is a link. Every key is returned, and
 * a rejected one as `undefined` — see `book.$serviceId.tsx` for why naming
 * the key is what overrides a raw value.
 */
export const Route = createFileRoute("/provider/$slug/bookings/")({
  validateSearch: (search: Record<string, unknown>): { tab?: ProviderTab; member?: string } => {
    const tab = search["tab"];
    const member = search["member"];
    return {
      tab: typeof tab === "string" && (PROVIDER_TABS as readonly string[]).includes(tab) ? (tab as ProviderTab) : undefined,
      member: typeof member === "string" && member !== "" ? member : undefined,
    };
  },
  component: BookingsPage,
});
```

- [ ] **Step 5: The page**

```tsx
// ui/bookings-page.tsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarCheck } from "lucide-react";
import { Button, cn } from "@ntizo/frontend-ui";
import { CollectionCard } from "@/shared/components/collection-card";
import { usePageHeader } from "@/shared/lib/page-header";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { compactSlotWording } from "@/features/checkout/domain/slot-wording";
import { formatMoney } from "@/features/wallet/domain/money";
import { PROVIDER_TABS, timeLeftWording, type ProviderTab } from "../domain/status";
import { PROVIDER_BOOKINGS_PAGE_SIZE } from "../data/booking.repository";
import { useProviderBookings } from "../viewmodel/use-provider-bookings";
import { BookingStatusBadge } from "./booking-status-badge";

/**
 * The workspace's bookings, one tab at a time. Three tabs by what the
 * provider has to do — answer, prepare, look back — rather than a filter
 * over ten statuses that are the system's vocabulary, not theirs.
 *
 * The rows are `CollectionCard`'s: a table from `md`, stacked cards below,
 * the same shape the services and members pages draw. Search goes to the
 * server (`q`), debounced, because the list is paged and a client-side
 * filter over one page would say "no matches" about rows on the next.
 */
export function BookingsPage() {
  const { t, i18n } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { activeProvider } = useActiveProvider();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: ProviderTab; member?: string };
  const tab: ProviderTab = search.tab ?? "requests";
  const memberId = search.member ?? null;

  usePageHeader(t("bookings.title"), t("bookings.subtitle"));

  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const handle = window.setTimeout(() => setQ(typed), 300);
    return () => window.clearTimeout(handle);
  }, [typed]);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [tab, q, memberId]);

  const providerId = activeProvider?.id ?? "";
  const query = useProviderBookings({ providerId, tab, q, memberId, offset });
  const now = useMemo(() => new Date(), [query.dataUpdatedAt]);

  if (!activeProvider) return null;
  const slug = activeProvider.slug;
  const page = query.data;
  const items = page?.items ?? [];

  const setTab = (next: ProviderTab) =>
    void navigate({ to: "/provider/$slug/bookings", params: { slug }, search: { tab: next, member: memberId ?? undefined } });
  const setMember = (next: string | null) =>
    void navigate({ to: "/provider/$slug/bookings", params: { slug }, search: { tab, member: next ?? undefined } });

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label={t("bookings.title")} className="inline-flex rounded-full bg-[var(--color-muted)] p-1">
          {PROVIDER_TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                tab === key ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]" : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
              )}
            >
              {t(`bookings.tab.${key}`)}
            </button>
          ))}
        </div>

        {/* Only when the workspace has more than one person: an individual
            provider has nobody to narrow to. Native `select`, styled as the
            kit's field — a kit `Select` with one option is not worth its keyboard model here. */}
        {page && page.members.length > 1 && (
          <select
            aria-label={t("bookings.memberFilterAll")}
            value={memberId ?? ""}
            onChange={(e) => setMember(e.target.value || null)}
            className="type-body h-10 rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3"
          >
            <option value="">{t("bookings.memberFilterAll")}</option>
            {page.members.map((m) => (
              <option key={m.id} value={m.id}>{m.firstName}</option>
            ))}
          </select>
        )}
      </div>

      {query.isError && (
        <p role="alert" className="type-body text-[var(--color-destructive)]">
          {t("bookings.loadError")}{" "}
          <button type="button" className="underline" onClick={() => void query.refetch()}>{t("bookings.retry")}</button>
        </p>
      )}

      <CollectionCard
        title={t(`bookings.tab.${tab}`)}
        shown={items.length}
        total={page?.total ?? 0}
        loading={query.isLoading}
        search={typed}
        onSearchChange={setTyped}
        searchPlaceholder={t("bookings.searchPlaceholder")}
        columns={[
          { key: "customer", label: t("bookings.col.customer"), className: "pl-5" },
          { key: "service", label: t("bookings.col.service"), skeletonWidth: "w-40" },
          { key: "when", label: t("bookings.col.when"), skeletonWidth: "w-28" },
          { key: "price", label: t("bookings.col.price"), align: "right", skeletonWidth: "w-20" },
          { key: "status", label: t("bookings.col.status"), skeletonWidth: "w-24", skeletonShape: "badge", className: "pr-5" },
        ]}
        emptyTitle={t(`bookings.empty.${tab}.title`)}
        emptyText={t(`bookings.empty.${tab}.body`)}
        emptyBadge={CalendarCheck}
        noMatchesTitle={t("bookings.noMatchesTitle")}
        noMatchesText={t("bookings.noMatches")}
        filtered={q.trim() !== "" || memberId !== null}
        rows={items.map((b) => {
          const slot = compactSlotWording(b.startsAt, b.endsAt, locale, b.timezone);
          const left = b.respondBy ? timeLeftWording(b.respondBy, now) : null;
          return {
            key: b.id,
            primary: (
              <Link
                to="/provider/$slug/bookings/$bookingId"
                params={{ slug, bookingId: b.id }}
                className="type-body-medium block font-semibold hover:underline"
              >
                {b.customerFirstName}
              </Link>
            ),
            cells: {
              customer: (
                <Link to="/provider/$slug/bookings/$bookingId" params={{ slug, bookingId: b.id }} className="type-body-medium font-semibold hover:underline">
                  {b.customerFirstName}
                </Link>
              ),
              service: `${b.serviceName} · ${b.memberFirstName ?? t("bookings.memberAnyone")}`,
              when: <span className="tabular-nums">{slot.date} · {slot.start}</span>,
              price: <span className="tabular-nums">{formatMoney(b.priceMinor, b.currency, locale)}</span>,
              status: (
                <span className="inline-flex items-center gap-2">
                  <BookingStatusBadge status={b.status} />
                  {left && <span className="type-caption text-[var(--color-muted-foreground)]">{left}</span>}
                </span>
              ),
            },
          };
        })}
      />

      {page && (
        <div className="flex items-center justify-between">
          <span className="type-caption text-[var(--color-muted-foreground)]">
            {t("bookings.shownOf", { shown: offset + items.length, total: page.total })}
          </span>
          {page.nextOffset !== null && (
            <Button type="button" variant="outline" onClick={() => setOffset(page.nextOffset ?? offset + PROVIDER_BOOKINGS_PAGE_SIZE)}>
              {t("bookings.loadMore")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
```

`CollectionCard`'s `primary` is what the stacked card shows as its heading and the table's first column draws from `cells.customer`; check `collection-card.tsx` lines 58–70 for which of the two the table uses and drop the duplicate accordingly.

- [ ] **Step 6: The sidebar badge**

In `sidebar-nav.tsx`, next to the `nav.bookings` item only, render the count of requests. Add a small hook in `features/provider/bookings/viewmodel/use-provider-bookings.ts`:

```ts
/** How many requests are waiting — the sidebar's badge. One row is enough: `total` is the number. */
export function useAwaitingCount(providerId: string | undefined) {
  const query = useQuery({
    ...providerBookingQueries.page({ providerId: providerId ?? "", tab: "requests", q: "", memberId: null, offset: 0 }),
    select: (page) => page.total,
    staleTime: 30_000,
  });
  return query.data ?? 0;
}
```

and in `sidebar-nav.tsx`, inside the item's `<Link>` after the title `<span>`:

```tsx
{item.titleKey === "nav.bookings" && awaiting > 0 && (
  <span className="ml-auto rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-primary-foreground)] tabular-nums">
    {awaiting}
  </span>
)}
```

with `const awaiting = useAwaitingCount(activeProvider?.id)` at the top of the nav component (it already knows the active provider through `slug`; use `useActiveProvider()` there if it does not).

- [ ] **Step 7: Regenerate the route tree and run everything**

Run: `cd apps/frontend/web && bun run build` (the TanStack Router plugin rewrites `src/routeTree.gen.ts` on build; commit the regenerated file). Then `bun run vitest run src/features/provider/bookings src/shared && bun run typecheck && bun run lint`.
Expected: PASS.

- [ ] **Step 8: Look at it**

Start the API and web servers, sign in as a provider member on dev (the memory's seeding notes), open `/provider/<slug>/bookings`. Expected: the three tabs, rows, a countdown on requests, the badge in the sidebar.

- [ ] **Step 9: Commit**

```bash
g add apps/frontend/web/src/features/provider/bookings apps/frontend/web/src/routes apps/frontend/web/src/routeTree.gen.ts apps/frontend/web/src/shared/components/app-sidebar
g commit -m "feat(web): Reservas — the provider's list, three tabs, a countdown, a badge"
```

---

### Task 11: The booking page — accept, decline, money, timeline

**Files:**
- Create: `apps/frontend/web/src/features/provider/bookings/ui/decline-dialog.tsx`
- Create: `apps/frontend/web/src/features/provider/bookings/ui/booking-page.tsx`
- Create: `apps/frontend/web/src/routes/provider/$slug/bookings.$bookingId.tsx`
- Test: `apps/frontend/web/src/features/provider/bookings/ui/__tests__/booking-page.test.tsx`

**Interfaces:**
- Consumes: `useProviderBooking`, `useAnswerBooking`, `Section` from `features/provider/ui/settings-shell`, `Dialog` from the kit, `BookingStatusBadge`, the domain helpers.

- [ ] **Step 1: Write the failing test**

Same harness as Task 10 (route `/provider/$slug/bookings/$bookingId`, `sessionGraphql` resolving `{ bookingByIdForProvider: detail }` for the query and `{ bookingAccept: {...} }` / `{ bookingDecline: {...} }` for the mutations). Fixture: an `AWAITING_PROVIDER` detail with `customerPhone: null`, `addressLine: null`, `commissionBps: 1000`, `priceMinor: 80000`, `commissionMinor: 8000`, a two-entry timeline ending in a pending `respond_by`.

```ts
it("shows the decision header and hides the contact until paid", async () => {
  renderBooking("/provider/estudio/bookings/bk-1");
  expect(await screen.findByRole("heading", { name: "Ana" })).toBeInTheDocument();
  expect(screen.getByText("Ref. BK-1")).toBeInTheDocument(); // shortReference of "bk-1"
  expect(screen.getByRole("button", { name: "Aceitar" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Recusar" })).toBeInTheDocument();
  expect(screen.getByText(/contacto e morada exacta aparecem/i)).toBeInTheDocument();
  expect(screen.queryByText("+258")).not.toBeInTheDocument();
});

it("does the provider's arithmetic", async () => {
  renderBooking("/provider/estudio/bookings/bk-1");
  await screen.findByRole("heading", { name: "Ana" });
  expect(screen.getByText("Comissão (10%)")).toBeInTheDocument();
  expect(screen.getByText("720,00 MZN")).toBeInTheDocument();
});

it("accept is one press and says what happens next", async () => {
  renderBooking("/provider/estudio/bookings/bk-1");
  await userEvent.click(await screen.findByRole("button", { name: "Aceitar" }));
  expect(await screen.findByText(/enviámos o pedido de pagamento/i)).toBeInTheDocument();
  expect(sessionGraphqlMock).toHaveBeenCalledWith(expect.stringContaining("bookingAccept"), { input: { bookingId: "bk-1" } });
});

it("decline asks for a reason and sends the token", async () => {
  renderBooking("/provider/estudio/bookings/bk-1");
  await userEvent.click(await screen.findByRole("button", { name: "Recusar" }));
  await userEvent.click(await screen.findByRole("radio", { name: /fora da minha zona/i }));
  await userEvent.click(screen.getByRole("button", { name: "Recusar pedido" }));
  await waitFor(() =>
    expect(sessionGraphqlMock).toHaveBeenCalledWith(expect.stringContaining("bookingDecline"), { input: { bookingId: "bk-1", reason: "outside_area" } }),
  );
});

it("draws the timeline with the pending deadline last", async () => {
  renderBooking("/provider/estudio/bookings/bk-1");
  await screen.findByRole("heading", { name: "Ana" });
  const items = screen.getAllByRole("listitem", { name: /pedido enviado|responder até|reserva iniciada/i });
  expect(items.at(-1)).toHaveTextContent(/responder até/i);
});

it("reveals the contact once confirmed, and drops the actions", async () => {
  // detail fixture with status CONFIRMED, customerPhone "+258840000001", addressLine "Av. X 1"
  renderBooking("/provider/estudio/bookings/bk-1");
  expect(await screen.findByText("+258840000001")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Aceitar" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/frontend/web && bun run vitest run src/features/provider/bookings/ui/__tests__/booking-page.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: The decline dialog**

```tsx
// ui/decline-dialog.tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BOOKING_DECLINE_REASONS, type BookingDeclineReason } from "@ntizo/shared/read-models";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ntizo/frontend-ui";

/**
 * A decline is the one action on this page the customer feels, so it gets a
 * question and a reason. Four tokens, translated here and in the customer's
 * inbox; "other" says nothing more than the default and exists so nobody is
 * made to pick a reason that is not theirs.
 */
export function DeclineDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: BookingDeclineReason) => void;
  busy: boolean;
}) {
  const { t } = useTranslation("provider");
  const [reason, setReason] = useState<BookingDeclineReason>("not_available");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bookings.declineTitle")}</DialogTitle>
          <DialogDescription>{t("bookings.declineBody")}</DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2 border-0 p-0">
          <legend className="sr-only">{t("bookings.declineTitle")}</legend>
          {BOOKING_DECLINE_REASONS.map((key) => (
            <label key={key} className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-3">
              <input type="radio" name="decline-reason" value={key} checked={reason === key} onChange={() => setReason(key)} className="h-4 w-4 accent-[var(--color-primary)]" />
              <span className="type-body">{t(`bookings.declineReason.${key}`)}</span>
            </label>
          ))}
        </fieldset>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t("bookings.cancel")}</Button>
          <Button type="button" variant="destructive" onClick={() => onConfirm(reason)} disabled={busy}>{t("bookings.declineConfirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Confirm the kit exports `DialogDescription`/`DialogFooter` and a `destructive` button variant (`grep -n "destructive\|DialogFooter" packages/frontend/src/components/{button,dialog}.tsx`); if the variant is named differently, use that name.

- [ ] **Step 4: The route**

```tsx
// routes/provider/$slug/bookings.$bookingId.tsx
import { createFileRoute } from "@tanstack/react-router";
import { BookingPage } from "@/features/provider/bookings/ui/booking-page";

export const Route = createFileRoute("/provider/$slug/bookings/$bookingId")({
  component: BookingPage,
});
```

- [ ] **Step 5: The page**

```tsx
// ui/booking-page.tsx
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, ChevronDown, FileText, MapPin, User } from "lucide-react";
import { Button, Skeleton, cn } from "@ntizo/frontend-ui";
import { EmptyCard } from "@/shared/components/empty-card";
import { usePageHeader } from "@/shared/lib/page-header";
import { Section } from "@/features/provider/ui/settings-shell";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { slotWording } from "@/features/checkout/domain/slot-wording";
import { formatMoney } from "@/features/wallet/domain/money";
import { commissionRate, payoutMinor, shortReference, timeLeftWording } from "../domain/status";
import { useAnswerBooking, useProviderBooking } from "../viewmodel/use-provider-bookings";
import { BookingStatusBadge } from "./booking-status-badge";
import { DeclineDialog } from "./decline-dialog";

const CAPTION = "type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase";
const REVEALED = new Set(["CONFIRMED", "MARKED_DONE", "COMPLETED", "DISPUTED"]);

/**
 * One booking, for the page that decides it. The header is the decision:
 * name, status, reference, the two actions while it is waiting, and the
 * deadline. After the decision the actions leave and the header keeps the
 * record. Sections from `settings-shell` — the frames the settings page and
 * checkout's step 2 already draw — and a rail with the provider's arithmetic
 * and the timeline.
 */
export function BookingPage() {
  const { t, i18n } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { activeProvider } = useActiveProvider();
  const { bookingId } = useParams({ strict: false }) as { bookingId: string };
  const providerId = activeProvider?.id ?? "";
  const query = useProviderBooking(providerId, bookingId);
  const { accept, decline } = useAnswerBooking(providerId);
  const [declining, setDeclining] = useState(false);
  const [notice, setNotice] = useState<"accepted" | "declined" | "already" | "error" | null>(null);
  const b = query.data;

  usePageHeader(b ? b.customerFirstName : t("bookings.title"), b ? `${b.serviceName} · ${b.optionName}` : undefined);
  const now = useMemo(() => new Date(), [query.dataUpdatedAt]);

  if (!activeProvider) return null;
  const slug = activeProvider.slug;

  const back = (
    <Link to="/provider/$slug/bookings" params={{ slug }} className="type-caption inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      {t("bookings.back")}
    </Link>
  );

  if (query.isLoading) {
    return <div className="mx-auto grid max-w-6xl gap-4">{back}<Skeleton className="h-10 w-1/2" /><Skeleton className="h-48 w-full" /></div>;
  }
  if (query.isError) {
    return <div className="mx-auto grid max-w-6xl gap-4">{back}<p role="alert" className="type-body text-[var(--color-destructive)]">{t("bookings.loadError")}</p></div>;
  }
  if (!b) {
    return <div className="mx-auto grid max-w-6xl gap-4">{back}<EmptyCard framed title={t("bookings.notFoundTitle")} body={t("bookings.notFoundBody")} /></div>;
  }

  const waiting = b.status === "AWAITING_PROVIDER";
  const revealed = REVEALED.has(b.status);
  const left = b.respondBy ? timeLeftWording(b.respondBy, now) : null;
  const when = slotWording(b.startsAt, b.endsAt, locale, b.timezone);
  const busy = accept.isPending || decline.isPending;

  const onError = (error: unknown) => {
    const code = (error as { code?: string } | null)?.code;
    setNotice(code === "BOOKING_INVALID_TRANSITION" ? "already" : "error");
    void query.refetch();
  };

  return (
    <div className="mx-auto max-w-6xl">
      {back}

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="type-h1">{b.customerFirstName}</h1>
            <BookingStatusBadge status={b.status} />
            <span className="type-caption rounded-full bg-[var(--color-muted)] px-2.5 py-1 font-semibold tabular-nums">
              {t("bookings.reference", { ref: shortReference(b.id) })}
            </span>
          </div>
          <p className="type-body mt-1 text-[var(--color-muted-foreground)]">
            {b.serviceName} · {b.optionName} · {b.memberFirstName ?? t("bookings.memberAnyone")}
          </p>
          {waiting && left && (
            <p className="type-body-medium mt-1 font-semibold">{t("bookings.respondIn", { time: left })}</p>
          )}
        </div>
        {waiting && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setDeclining(true)}>{t("bookings.decline")}</Button>
            <Button type="button" disabled={busy} onClick={() => accept.mutate(b.id, { onSuccess: () => setNotice("accepted"), onError })}>{t("bookings.accept")}</Button>
          </div>
        )}
      </header>

      {notice && (
        <p role="status" className={cn("type-body mt-4 rounded-[var(--radius-card-sm)] p-3", notice === "error" ? "bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)]" : "bg-[var(--color-muted)]")}>
          {t(notice === "accepted" ? "bookings.accepted" : notice === "declined" ? "bookings.declined" : notice === "already" ? "bookings.alreadyAnswered" : "bookings.actionError")}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0">
          <Section icon={<CalendarDays className="h-5 w-5" />} title={t("bookings.section.appointment")} blurb={t("bookings.section.appointmentBlurb")}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div><dt className={CAPTION}>{t("bookings.when")}</dt><dd className="type-body-medium mt-1 font-semibold">{when.date}</dd><dd className="type-body tabular-nums">{when.start} – {when.end}</dd></div>
              <div><dt className={CAPTION}>{t("bookings.duration")}</dt><dd className="type-body mt-1">{t("bookings.minutes", { count: b.durationMinutes })}</dd></div>
              <div>
                <dt className={CAPTION}>{t("bookings.where")}</dt>
                <dd className="type-body mt-1">
                  {b.locationType ? t(`bookings.location.${b.locationType}`) : null}
                  {[b.addressDistrict, b.addressCity].filter(Boolean).length > 0 && ` · ${[b.addressDistrict, b.addressCity].filter(Boolean).join(", ")}`}
                </dd>
                {revealed && b.addressLine && <dd className="type-body">{[b.addressLabel, b.addressLine].filter(Boolean).join(" · ")}</dd>}
                {revealed && b.addressDirections && <dd className="type-caption text-[var(--color-muted-foreground)]">{b.addressDirections}</dd>}
              </div>
              <div><dt className={CAPTION}>{t("bookings.with")}</dt><dd className="type-body mt-1">{b.memberFirstName ?? t("bookings.memberAnyone")}</dd></div>
            </dl>
          </Section>

          <Section icon={<User className="h-5 w-5" />} title={t("bookings.section.customer")} blurb={t("bookings.section.customerBlurb")}>
            <p className="type-body-medium font-semibold">{b.customerFirstName}</p>
            {revealed ? (
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div><dt className={CAPTION}>{t("bookings.phone")}</dt><dd className="type-body mt-1 tabular-nums">{b.customerPhone ?? t("bookings.none")}</dd></div>
                <div><dt className={CAPTION}>{t("bookings.email")}</dt><dd className="type-body mt-1">{b.customerEmail ?? t("bookings.none")}</dd></div>
              </dl>
            ) : (
              <p className="type-body mt-2 text-[var(--color-muted-foreground)]">{t("bookings.hiddenUntilPaid")}</p>
            )}
          </Section>

          {b.description && b.description.trim() !== "" && (
            <Section icon={<FileText className="h-5 w-5" />} title={t("bookings.section.note")} blurb={t("bookings.section.noteBlurb")}>
              <p className="type-body whitespace-pre-line">{b.description.trim()}</p>
            </Section>
          )}
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-6">
          <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
            <h2 className={CAPTION}>{t("bookings.money")}</h2>
            <dl className="mt-3 grid gap-2">
              <div className="flex justify-between"><dt className="type-body">{t("bookings.price")}</dt><dd className="type-body tabular-nums">{formatMoney(b.priceMinor, b.currency, locale)}</dd></div>
              <div className="flex justify-between text-[var(--color-muted-foreground)]"><dt className="type-body">{t("bookings.commission", { rate: commissionRate(b.commissionBps, locale) })}</dt><dd className="type-body tabular-nums">−{formatMoney(b.commissionMinor, b.currency, locale)}</dd></div>
              <div className="flex justify-between border-t border-[var(--color-border)] pt-2"><dt className="type-body-medium font-semibold">{t("bookings.payout")}</dt><dd className="type-h3 font-semibold tabular-nums">{formatMoney(payoutMinor(b), b.currency, locale)}</dd></div>
            </dl>
          </section>

          <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
            <h2 className={CAPTION}>{t("bookings.timeline")}</h2>
            <ol className="mt-3 grid list-none gap-3 p-0">
              {b.timeline.map((e, i) => (
                <li key={`${e.at}-${e.reason}-${i}`} aria-label={t(`bookings.timelineReason.${e.reason}`, { defaultValue: t("bookings.timelineReason.unknown") })} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3">
                  <span aria-hidden="true" className={cn("mt-1.5 h-2.5 w-2.5 rounded-full", e.pending ? "border-2 border-[var(--color-primary)]" : "bg-[var(--color-primary)]")} />
                  <div>
                    <p className={cn("type-body-medium", e.pending ? "text-[var(--color-muted-foreground)]" : "font-semibold")}>
                      {t(`bookings.timelineReason.${e.reason}`, { defaultValue: t("bookings.timelineReason.unknown") })}
                    </p>
                    <p className="type-caption text-[var(--color-muted-foreground)] tabular-nums">
                      {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: b.timezone }).format(new Date(e.at))}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <details className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
            <summary className={cn(CAPTION, "flex cursor-pointer list-none items-center justify-between")}>
              {t("bookings.technical")} <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </summary>
            <dl className="mt-3 grid gap-2 break-all">
              <div><dt className="type-caption text-[var(--color-muted-foreground)]">{t("bookings.bookingId")}</dt><dd className="type-caption tabular-nums">{b.id}</dd></div>
              <div><dt className="type-caption text-[var(--color-muted-foreground)]">{t("bookings.serviceOptionId")}</dt><dd className="type-caption tabular-nums">{b.serviceOptionId}</dd></div>
              <div><dt className="type-caption text-[var(--color-muted-foreground)]">{t("bookings.memberId")}</dt><dd className="type-caption tabular-nums">{b.providerMemberId ?? t("bookings.none")}</dd></div>
              <div><dt className="type-caption text-[var(--color-muted-foreground)]">{t("bookings.paymentRef")}</dt><dd className="type-caption tabular-nums">{b.paymentRef ?? t("bookings.none")}</dd></div>
            </dl>
          </details>
        </aside>
      </div>

      <DeclineDialog
        open={declining}
        onOpenChange={setDeclining}
        busy={decline.isPending}
        onConfirm={(reason) =>
          decline.mutate({ bookingId: b.id, reason }, { onSuccess: () => { setDeclining(false); setNotice("declined"); }, onError })
        }
      />
    </div>
  );
}
```

`slotWording` (not the compact one) is what checkout's confirm page uses for the long date; check its return shape in `slot-wording.ts` line 104 (`{ date, start, end }`) and adjust the destructuring if it differs. The mutation error's `code` — see how `checkout`'s pages read a GraphQL error code (`grep -n "kitCode\|\.code" src/features/checkout/ui/details-page.tsx`) and read it the same way in `onError`. The `MapPin` import is unused above; remove it or use it for the "where" caption.

- [ ] **Step 6: Regenerate the route tree, run the suite, typecheck, lint**

Run: `cd apps/frontend/web && bun run build && bun run vitest run src/features/provider/bookings && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 7: Look at both states**

With the servers running and a provider session, open a request: accept it on one, decline another with a reason; watch the row move tabs and the badge drop. Open a `CONFIRMED` booking: the contact block shows the phone and email.

- [ ] **Step 8: Commit**

```bash
g add apps/frontend/web/src/features/provider/bookings apps/frontend/web/src/routes apps/frontend/web/src/routeTree.gen.ts
g commit -m "feat(web): the booking page — accept, decline with a reason, the provider's arithmetic, the timeline"
```

---

### Task 12: Whole-repo verification and the follow-ups entry

**Files:**
- Modify: `docs/superpowers/follow-ups.md` (append)

- [ ] **Step 1: Run every gate**

```bash
cd packages/shared && bun test
cd ../backend && bun test
cd ../../apps/backend/api && bun run typecheck
cd ../../frontend/web && bun run test && bun run typecheck && bun run lint
```

Expected: all green. The backend's dev-DB projection tests need `DATABASE_URL` resolvable (`apps/backend/api/.dev.vars`); they skip or fail loudly without it — run them with it.

- [ ] **Step 2: Record what this phase left for later**

Append to `docs/superpowers/follow-ups.md`, in its numbering:

```markdown
## N. Bookings the provider cannot act on after acceptance

Phase 1 of `2026-09-02-provider-bookings-and-dashboard-design.md` mounts accept and decline
and nothing else. `MARKED_DONE` is in the enum with no transition; reschedule and cancel by
the provider are drawn in the state machine with no command. A `CONFIRMED` booking whose start
has passed sits in Histórico as "Confirmada" forever.

**Trigger:** the first provider who asks why a finished job still says confirmed, or the wallet
release work, which needs "done" to exist.

## N+1. Three booking notifications have no email

`BOOKING_CONFIRMED`, `PROVIDER_BOOKING_CONFIRMED` and `PROVIDER_BOOKING_CANCELLED_BY_CUSTOMER`
raise in-app rows only. `deliver-notification.internal.command.ts` renders nothing for a type
without a template, by design.

**Trigger:** the notification-preferences work, or the first provider who missed a payment
landing because they were not in the app.
```

- [ ] **Step 3: Commit and hand over**

```bash
g add docs/superpowers/follow-ups.md
g commit -m "docs: what provider bookings phase 1 leaves for later"
```

Then: merge to `dev` and deploy only on the owner's word, as every deploy in this project.

---

## Self-review against the spec

- **One read model, not the customer's** — Task 1, Task 2 (`ProviderBookingRow`, `providerColumns`).
- **Reveal at CONFIRMED, in the projection** — Task 3 (`REVEALED_STATUSES`, tests per status); the page repeats the set only to choose copy (Task 11), never to hide data.
- **Authorisation at the edge as the wallet** — Task 4 (`assertMayReadWorkspace`); commands' own membership check for the mutations — Task 5.
- **Decline reason tokens, four of them** — Task 1 (`BOOKING_DECLINE_REASONS`), Task 5 (zod enum), Task 11 (dialog).
- **Timeline = `booking_change` + timestamps + pending deadline, actor derived** — Task 2 (`timelineFor`), Task 3 (`timelineOf`).
- **Notifications through a port, raised after commit, never failing the write** — Task 6 (`raiseQuietly`, five commands, bootstrap deps, call sites). Two new enum values — Task 1. Templates for received/accepted/declined — Task 7; the other three in-app only, recorded — Task 12.
- **`DRAFT` never a row** — Task 1 (enum), Task 2 (`<> 'DRAFT'` in both WHEREs).
- **Tabs: requests / upcoming / history with the `startsAt` split; ordering** — Task 2 (`providerWhere`, `providerOrder`).
- **Search on first name and service name, accent-insensitive; member filter; `total`; `nextOffset`; members for the filter** — Tasks 2, 3, 4, 10.
- **Sidebar entry first, with a badge** — Task 8 (nav), Task 10 (`useAwaitingCount`).
- **Screens as wireframed** — Task 10 (list), Task 11 (page: header with decision, three sections, money with the commission line, timeline, technical details collapsed).
- **Locales × 8** — Task 8.
- **Out of scope stays out** — Task 12 records it.
- **Phase 2 (stats, dashboard)** — not here, by design.

Type names used across tasks: `ProviderBookingRow`, `ProviderTimelineRow`, `ProviderMemberOption`, `ProviderListFilter`, `ProviderListTab`, `PROVIDER_TAB_STATUSES` (Task 2) — consumed by Task 3; `ProviderBookingDTO`, `ProviderBookingDetailDTO`, `ProviderBookingPageDTO`, `BookingTimelineEntryDTO`, `BookingDeclineReason`, `BOOKING_DECLINE_REASONS` (Task 1) — consumed by Tasks 3, 5, 9, 11; `ProviderTab`, `PROVIDER_TABS`, `STATUS_TONE`, `timeLeftWording`, `shortReference`, `payoutMinor`, `commissionRate` (Task 9) — consumed by Tasks 10, 11; `providerBookingQueries`, `acceptBooking`, `declineBooking`, `PROVIDER_BOOKINGS_PAGE_SIZE`, `ProviderBookingsPageInput` (Task 9) — consumed by Tasks 10, 11; `useProviderBookings`, `useProviderBooking`, `useAnswerBooking`, `useAwaitingCount` (Tasks 9, 10).
