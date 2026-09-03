# The Customer's Bookings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/bookings` from a static placeholder into the customer's real bookings page — a tabbed list, a detail page with a timeline, and the two actions a customer needs before a booking is paid: cancel it, or pay it now.

**Architecture:** The backend already serves the customer's list and detail (`booking.mine`, `booking.byId`), both scoped to the session. This plan takes the commission out of the customer's read model rather than leaving each caller to hide it, adds tab/paging/count support to the read, enriches the detail with the timeline the provider's page already reads, adds two customer-authorised commands, and builds the web feature mirroring `features/provider/bookings`.

**Tech Stack:** Bun, Turborepo, Drizzle + Neon Postgres, `@cosmneo/onion-lasagna` GraphQL field kit, Hono on Cloudflare Workers, React 19, TanStack Router/Query, react-i18next (8 locales), Tailwind 4, vitest + testing-library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-03-customer-bookings-design.md`. Mockups: `docs/superpowers/specs/2026-09-03-customer-bookings.mockup.html`.

## Global Constraints

- **The commission is never on a customer's wire.** After Task 1 the fields do not exist on `bookingReadModel`; do not add them back to any customer-facing model, query or component.
- **Ownership lives in the `WHERE` clause, never in an `if` after the read.** Every customer read filters on `customerId` inside the query. Every customer write re-checks it before writing anything.
- **Reads never say whose a booking is.** A stranger's id and a missing id both answer `null`. Writes refuse explicitly with `BookingNotYoursError` / `BOOKING_NOT_YOURS`.
- **`DRAFT` appears in no tab and on no customer page.**
- **The eyebrow rule:** never put a short accent-coloured rule before an uppercase label, anywhere. The owner's standing instruction.
- **Money is integer minor units, never a float.** Format at the edge with `Intl.NumberFormat`.
- **pt-MZ is the reference locale** and is authored first; the other seven are written from it, each reading as its own language, never machine-translated word for word.
- **Commit trailer, on every commit:**
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WJL2JCeKxUTv5mFvtJWzft
  ```
- **Worktree:** `.claude/worktrees/customer-bookings`, branch `feat/customer-bookings`, cut from `origin/dev` at `0a49beaa`.
- **The api worker needs Node 22** for wrangler: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`.

## File Structure

**`packages/shared`**
- `src/read-models/system/booking/booking.schema.ts` — the customer's model. Loses the commission pair, gains `paidAt`, gains the timeline entry model moved in from its provider sibling, gains the two new customer models.
- `src/read-models/system/booking/provider-booking.schema.ts` — re-exports `bookingTimelineEntryReadModel` from its new home so provider imports keep working.
- `src/enums/booking-enums/index.ts` — `CUSTOMER_BOOKING_TABS`, `CUSTOMER_VISIBLE_STATUSES`.

**`packages/backend` — read tier** (`src/modules/ntizo/read/booking/`)
- `app/ports/outbound/booking-read.repository.port.ts` — `CustomerListFilter`, `CUSTOMER_TAB_STATUSES`, three method signatures, `BookingListRow` edits.
- `infra/repositories/drizzle/booking-read.repository.ts` — the tab `WHERE`, the paged list, the grouped count.
- `app/use-cases/to-booking-dto.ts` — drops two fields, gains one.
- `app/use-cases/list-my-bookings.projection.ts` — becomes the paged, tabbed, counted read.
- `app/use-cases/get-my-booking.projection.ts` — gains the timeline.
- `graphql/schema/queries.ts`, `graphql/handlers/queries.handlers.ts` — the two customer fields' new shapes.

**`packages/backend` — booking context** (`src/modules/ntizo/bounded-contexts/booking/`)
- `domain/aggregates/booking.aggregate.ts` — `cancelByCustomer`.
- `domain/exceptions.ts` — `BookingNotYoursError`, `BookingNoCustomerPhoneError`, `BookingChargeUnavailableError`.
- `app/use-cases/cancel-booking.command.ts` — new.
- `app/use-cases/request-booking-charge.command.ts` — new.
- `bootstrap/index.ts` — both wired.

**`packages/backend` — write tier** (`src/modules/ntizo/write/booking/`)
- `graphql/schema/mutations.ts`, `graphql/handlers/mutations.handlers.ts` — `booking.cancel`, `booking.pay`.

**`apps/frontend/web`**
- `src/routes/_customer/bookings.tsx` (rewritten), `src/routes/_customer/bookings.$bookingId.tsx` (new).
- `src/features/bookings/` — `domain/status.ts`, `data/booking.repository.ts`, `viewmodel/use-my-bookings.ts`, `ui/bookings-page.tsx`, `ui/booking-page.tsx`, `ui/booking-status-badge.tsx`, `ui/cancel-dialog.tsx`, `ui/pay-dialog.tsx`.
- `src/shared/locales/<locale>/bookings.json` — eight new files.
- `src/shared/lib/i18n.ts`, `src/shared/locales/__tests__/locales.test.ts` — the new namespace registered.

**`apps/e2e`** — `tests/customer-bookings.spec.ts`.

---

### Task 1: The customer-safe read model

**Files:**
- Modify: `packages/shared/src/read-models/system/booking/booking.schema.ts`
- Modify: `packages/shared/src/read-models/system/booking/provider-booking.schema.ts`
- Modify: `packages/shared/src/enums/booking-enums/index.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/app/ports/outbound/booking-read.repository.port.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/app/use-cases/to-booking-dto.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/infra/repositories/drizzle/booking-read.repository.ts`
- Modify: `apps/frontend/web/src/features/checkout/data/checkout.repository.ts`
- Modify: `apps/frontend/web/src/features/checkout/data/__tests__/checkout.repository.test.ts`
- Test: `packages/shared/src/read-models/__tests__/read-models.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `bookingReadModel` without `commissionBps`/`commissionMinor` and with `paidAt: string | null`; `bookingTimelineEntryReadModel` exported from `booking.schema.ts`; `customerBookingPageReadModel` and `customerBookingDetailReadModel`; `CUSTOMER_BOOKING_TABS: readonly ["waiting","upcoming","history"]`; `CustomerBookingTab`; `CUSTOMER_VISIBLE_STATUSES`.

- [ ] **Step 1: Write the failing test**

In `packages/shared/src/read-models/__tests__/read-models.test.ts`, append:

```ts
describe("the customer's booking read model", () => {
  // The commission is deducted from the provider's payout and is never shown
  // to the customer. That rule used to be kept by each caller's selection set
  // — checkout omitted the fields by hand and a test read the query document
  // to prove it. A second customer-facing caller is the moment follow-up #114
  // anticipated: the fields leave the model, so no selection set can ask.
  it("carries no commission fields at all", () => {
    const keys = Object.keys(bookingReadModel.shape);
    expect(keys).not.toContain("commissionBps");
    expect(keys).not.toContain("commissionMinor");
  });

  // The money block says "Pago a …" once the payment lands, and the timeline
  // draws the hop. Both need the instant, and it is the customer's own fact.
  it("carries paidAt, nullable until the payment lands", () => {
    expect(bookingReadModel.shape).toHaveProperty("paidAt");
    expect(bookingReadModel.parse({ ...validBookingRow(), paidAt: null }).paidAt).toBeNull();
  });

  it("the detail model adds the timeline and nothing else", () => {
    const extra = Object.keys(customerBookingDetailReadModel.shape).filter(
      (k) => !(k in bookingReadModel.shape),
    );
    expect(extra).toEqual(["timeline"]);
  });

  it("the page model carries the three tab counts", () => {
    const page = customerBookingPageReadModel.parse({
      items: [],
      total: 0,
      nextOffset: null,
      counts: { waiting: 0, upcoming: 0, history: 0 },
    });
    expect(page.counts.upcoming).toBe(0);
  });
});
```

Add a `validBookingRow()` helper next to the other fixtures in that file if one does not already exist: an object with every required key of `bookingReadModel`, taken from the model's own field list.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/shared && bunx vitest run src/read-models/__tests__/read-models.test.ts
```
Expected: FAIL — `commissionBps` is still a key, `paidAt` and the two new models do not exist.

- [ ] **Step 3: Edit the shared models**

In `booking.schema.ts`, delete these two lines from `bookingReadModel` and the paragraph of the model's header doc comment that begins "`commissionBps` travels with `commissionMinor` on purpose":

```ts
  commissionBps: z.number().int().min(0).max(10_000),
  commissionMinor: z.number().int().min(0),
```

Replace that paragraph with:

```
 * **No commission.** The rate and the amount are the provider's payout being
 * reduced, never a fee added to this customer's price, so a customer shown a
 * split would be shown a charge they do not pay. They used to be here and be
 * omitted by every caller by hand; follow-up #114 asked for the fence to be
 * the type instead. The provider's own `providerBookingReadModel` is a
 * separate mirror and keeps both, because there the split is the point.
```

Add after `expiresAt`:

```ts
  /**
   * When the payment landed, or null while it has not.
   *
   * The customer's own fact, unlike `paymentRef`, which stays off this model:
   * a gateway reference identifies a transaction to whoever has to chase it,
   * and the customer chasing it does so through support, who read it from the
   * provider's side.
   */
  paidAt: z.string().nullable(),
```

Move `bookingTimelineEntryReadModel` here from `provider-booking.schema.ts`, verbatim, and add above it:

```
/**
 * One hop in a booking's history, read by both audiences.
 *
 * It lived beside the provider's models until the customer's page needed the
 * same list. Neither audience owns it, so it sits with the model that is
 * neither — and `provider-booking.schema.ts` re-exports it so nothing that
 * imports it from there has to move.
 */
```

Then append the two customer models:

```ts
/**
 * One page of the customer's own bookings, plus what the tab chips render.
 *
 * All three counts on every read, rather than three requests: the chips are
 * on screen whichever tab is open, and a count fetched per tab would show a
 * stale number on the two the customer is not looking at.
 */
export const customerBookingPageReadModel = z.object({
  items: z.array(bookingReadModel),
  /** Rows in the requested tab, unpaged — the pager's denominator. */
  total: z.number().int().min(0),
  nextOffset: z.number().int().min(0).nullable(),
  counts: z.object({
    waiting: z.number().int().min(0),
    upcoming: z.number().int().min(0),
    history: z.number().int().min(0),
  }),
});
export type CustomerBookingPageDTO = z.infer<typeof customerBookingPageReadModel>;

/** One booking, for the page that tells its story. */
export const customerBookingDetailReadModel = bookingReadModel.extend({
  timeline: z.array(bookingTimelineEntryReadModel),
});
export type CustomerBookingDetailDTO = z.infer<typeof customerBookingDetailReadModel>;
```

In `provider-booking.schema.ts`, delete the `bookingTimelineEntryReadModel` declaration and add at the top, beside the other imports:

```ts
import { bookingTimelineEntryReadModel } from "./booking.schema";

export { bookingTimelineEntryReadModel };
```

In `packages/shared/src/enums/booking-enums/index.ts`, append:

```ts
/** The customer's three tabs, in the order the page shows them. */
export const CUSTOMER_BOOKING_TABS = ["waiting", "upcoming", "history"] as const;
export type CustomerBookingTab = (typeof CUSTOMER_BOOKING_TABS)[number];

/**
 * Every status a customer may see. `DRAFT` is absent: a draft is a checkout
 * half-finished, not a request the customer made, and offering to cancel one
 * would offer to cancel something they do not believe exists.
 */
export const CUSTOMER_VISIBLE_STATUSES = [
  "AWAITING_PROVIDER",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "MARKED_DONE",
  "COMPLETED",
  "DISPUTED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
] as const;
```

- [ ] **Step 4: Follow the removal through the backend**

In `booking-read.repository.port.ts`, delete `commissionBps` and `commissionMinor` from `BookingListRow` and add `paidAt: Date | null;` beside `expiresAt`.

In `to-booking-dto.ts`, delete the two `commission*` lines and add:

```ts
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
```

In `booking-read.repository.ts`, find `selectedColumns` (the customer selection, not `providerColumns`), delete its two commission entries and add `paidAt: booking.paidAt,`. Then in `toRow` do the same.

- [ ] **Step 5: Follow it through checkout**

In `apps/frontend/web/src/features/checkout/data/checkout.repository.ts`, replace

```ts
export type CheckoutBooking = Omit<BookingDTO, "commissionBps" | "commissionMinor">;
```

with

```ts
/**
 * A booking as checkout reads it.
 *
 * This used to be `BookingDTO` minus the commission, with a test that read
 * the query document to prove neither field was asked for. Both fields left
 * `bookingReadModel` itself on 2026-09-03 — see that model's own comment —
 * so the alias is now the model, and the fence is the type rather than this
 * file's discipline.
 */
export type CheckoutBooking = BookingDTO;
```

In `__tests__/checkout.repository.test.ts`, delete the test that reads the document for the two field names and replace it with:

```ts
  // The fence moved into the model itself, so the question this file used to
  // ask — "does the document request the commission?" — cannot be answered
  // wrong any more. What is worth asserting here is that checkout still asks
  // for every field it renders.
  it("asks for the price and the currency it renders", () => {
    expect(BOOKING_FIELDS).toContain("priceMinor");
    expect(BOOKING_FIELDS).toContain("currency");
  });
```

Use whatever the file's existing constant for the field list is called; do not rename it.

- [ ] **Step 6: Run the gates**

```bash
cd packages/shared && bunx vitest run
cd ../../ && bun run check-types
cd apps/frontend/web && bunx vitest run src/features/checkout
```
Expected: all pass. If `check-types` names a consumer of `commissionBps` on a customer-facing path that this task did not list, fix it there and note it in the commit body — a compile error is exactly the fence working.

- [ ] **Step 7: Commit**

```bash
git add -A packages/shared packages/backend apps/frontend/web/src/features/checkout
git commit -m "$(cat <<'EOF'
feat(booking): the commission leaves the customer's read model

It was kept off the wire by every caller's selection set and a test that read
the query document. A second customer-facing reader is the moment follow-up
#114 named, so the fields leave the model and the fence becomes the type.
paidAt arrives in the same edit: the money block and the timeline both need
the instant, and it is the customer's own fact.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WJL2JCeKxUTv5mFvtJWzft
EOF
)"
```

---

### Task 2: Tabs, paging and counts in the read repository

**Files:**
- Modify: `packages/backend/src/modules/ntizo/read/booking/app/ports/outbound/booking-read.repository.port.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/infra/repositories/drizzle/booking-read.repository.ts`
- Test: `packages/backend/src/modules/ntizo/read/booking/__tests__/booking-read.repository.test.ts` (existing DB-integration file; if absent, create it beside the other read tests and follow their `beforeAll` shape)

**Interfaces:**
- Consumes: `BookingListRow` (Task 1).
- Produces:
  - `CustomerListFilter { tab: CustomerBookingTab; now: Date }`
  - `CUSTOMER_TAB_STATUSES: Record<CustomerBookingTab, readonly string[]>`
  - `listForCustomer(customerId: string, filter: CustomerListFilter, limit: number, offset: number): Promise<BookingListRow[]>`
  - `countForCustomer(customerId: string, filter: CustomerListFilter): Promise<number>`
  - `countsForCustomer(customerId: string, now: Date): Promise<{ waiting: number; upcoming: number; history: number }>`

- [ ] **Step 1: Write the failing test**

```ts
describe("the customer's tabs", () => {
  // A booking the customer never finished paying for is not a request they
  // made. It is in no tab, and the counts do not see it either.
  it("never returns a draft, in any tab", async () => {
    await seedBooking({ customerId: ALICE, status: "DRAFT" });
    for (const tab of ["waiting", "upcoming", "history"] as const) {
      const rows = await repo.listForCustomer(ALICE, { tab, now: NOW }, 20, 0);
      expect(rows).toEqual([]);
    }
    expect(await repo.countsForCustomer(ALICE, NOW)).toEqual({ waiting: 0, upcoming: 0, history: 0 });
  });

  it("puts both waits in the first tab", async () => {
    await seedBooking({ customerId: ALICE, status: "AWAITING_PROVIDER" });
    await seedBooking({ customerId: ALICE, status: "PENDING_PAYMENT" });
    const rows = await repo.listForCustomer(ALICE, { tab: "waiting", now: NOW }, 20, 0);
    expect(rows).toHaveLength(2);
  });

  // The only rule that is not a status lookup: a confirmed booking leaves
  // Próximas for Histórico by the clock, because nothing in the platform can
  // declare the work done.
  it("moves a confirmed booking from upcoming to history when its start passes", async () => {
    await seedBooking({ customerId: ALICE, status: "CONFIRMED", startsAt: new Date("2026-09-10T09:00:00Z") });
    const before = new Date("2026-09-09T00:00:00Z");
    const after = new Date("2026-09-11T00:00:00Z");
    expect(await repo.listForCustomer(ALICE, { tab: "upcoming", now: before }, 20, 0)).toHaveLength(1);
    expect(await repo.listForCustomer(ALICE, { tab: "upcoming", now: after }, 20, 0)).toHaveLength(0);
    expect(await repo.listForCustomer(ALICE, { tab: "history", now: after }, 20, 0)).toHaveLength(1);
  });

  it("counts all three tabs in one read", async () => {
    await seedBooking({ customerId: ALICE, status: "AWAITING_PROVIDER" });
    await seedBooking({ customerId: ALICE, status: "DECLINED" });
    expect(await repo.countsForCustomer(ALICE, NOW)).toEqual({ waiting: 1, upcoming: 0, history: 1 });
  });

  it("never crosses customers", async () => {
    await seedBooking({ customerId: BOB, status: "AWAITING_PROVIDER" });
    expect(await repo.listForCustomer(ALICE, { tab: "waiting", now: NOW }, 20, 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/backend && bunx vitest run src/modules/ntizo/read/booking/__tests__/booking-read.repository.test.ts
```
Expected: FAIL — `listForCustomer` takes one argument today.

- [ ] **Step 3: Extend the port**

In `booking-read.repository.port.ts`, replace the `listForCustomer` signature and add the two new ones, keeping the existing doc comment on `findForCustomer` untouched:

```ts
  /** One tab of the customer's own bookings, paged. `DRAFT` never appears. See `CUSTOMER_TAB_STATUSES`. */
  listForCustomer(
    customerId: string,
    filter: CustomerListFilter,
    limit: number,
    offset: number,
  ): Promise<BookingListRow[]>;
  /** How many `listForCustomer` would return unpaged — the pager's denominator. */
  countForCustomer(customerId: string, filter: CustomerListFilter): Promise<number>;
  /** All three tab counts in one grouped read — the chips are on screen whichever tab is open. */
  countsForCustomer(
    customerId: string,
    now: Date,
  ): Promise<{ waiting: number; upcoming: number; history: number }>;
```

And below, beside `PROVIDER_TAB_STATUSES`:

```ts
export interface CustomerListFilter {
  tab: CustomerBookingTab;
  /** Injected, never `new Date()` inside the query — a test has to be able to say when "upcoming" ends. */
  now: Date;
}

/**
 * The statuses each of the customer's tabs lists.
 *
 * `PENDING_PAYMENT` is a *wait*, so it sits with the other wait rather than
 * with the provider's `upcoming`, which groups it with `CONFIRMED` because a
 * provider is preparing for both. The two zones are looking at the same rows
 * and asking different questions of them.
 *
 * `upcoming` is further split by `startsAt` against `now`; `history` takes
 * the confirmed bookings that split leaves behind. The three future statuses
 * are listed under `history` so that whoever builds the transitions into them
 * does not have to revisit this map.
 */
export const CUSTOMER_TAB_STATUSES: Record<CustomerBookingTab, readonly string[]> = {
  waiting: ["AWAITING_PROVIDER", "PENDING_PAYMENT"],
  upcoming: ["CONFIRMED"],
  history: ["MARKED_DONE", "COMPLETED", "DISPUTED", "DECLINED", "CANCELLED", "EXPIRED"],
};
```

Import `CustomerBookingTab` from `@ntizo/shared`.

- [ ] **Step 4: Implement in the repository**

Add these helpers beside `providerWhere`:

```ts
/**
 * The rows one customer tab holds.
 *
 * `DRAFT` is excluded here rather than in each caller, so a tab added later
 * cannot forget it. The `upcoming` split is by `startsAt`, not `endsAt`: a
 * booking whose start has passed is no longer something the customer is
 * waiting for, even while the work is still happening.
 */
function customerWhere(customerId: string, filter: CustomerListFilter) {
  const live = inArray(booking.status, [...CUSTOMER_TAB_STATUSES.upcoming]);

  const bucket =
    filter.tab === "waiting"
      ? inArray(booking.status, [...CUSTOMER_TAB_STATUSES.waiting])
      : filter.tab === "upcoming"
        ? and(live, gte(booking.startsAt, filter.now))
        : or(
            inArray(booking.status, [...CUSTOMER_TAB_STATUSES.history]),
            and(live, lt(booking.startsAt, filter.now)),
          );

  return and(eq(booking.customerId, customerId), sql`${booking.status} <> 'DRAFT'`, bucket);
}

/** Newest request first while waiting; soonest first when looking forward; most recent first when looking back. */
function customerOrder(tab: CustomerBookingTab) {
  if (tab === "waiting") return [desc(booking.createdAt), desc(booking.id)];
  if (tab === "upcoming") return [asc(booking.startsAt), asc(booking.id)];
  return [desc(booking.startsAt), desc(booking.id)];
}

/** One CASE, so three counts are one trip and cannot disagree with each other. */
function customerBucket(now: Date) {
  return sql<string>`case
    when ${booking.status} in ('AWAITING_PROVIDER','PENDING_PAYMENT') then 'waiting'
    when ${booking.status} = 'CONFIRMED' and ${booking.startsAt} >= ${now} then 'upcoming'
    else 'history'
  end`;
}
```

Replace the body of `listForCustomer` and add the two new methods:

```ts
  async listForCustomer(
    customerId: string,
    filter: CustomerListFilter,
    limit: number,
    offset: number,
  ): Promise<BookingListRow[]> {
    const db = getDb();
    const reviewAgg = reviewAggregate(db);
    const verifiedAgg = verifiedAggregate(db);

    const rows = await db
      .select(selectedColumns(reviewAgg, verifiedAgg))
      .from(booking)
      .innerJoin(provider, eq(provider.id, booking.providerId))
      .leftJoin(service, eq(service.id, booking.serviceId))
      .leftJoin(reviewAgg, eq(reviewAgg.providerId, provider.id))
      .leftJoin(verifiedAgg, eq(verifiedAgg.providerId, provider.id))
      .where(customerWhere(customerId, filter))
      .orderBy(...customerOrder(filter.tab))
      .limit(limit)
      .offset(offset);

    return rows.map(toRow);
  }

  async countForCustomer(customerId: string, filter: CustomerListFilter): Promise<number> {
    // No joins: `customerWhere` reads only `booking`, and a count has nothing
    // to display.
    const [row] = await getDb().select({ n: count() }).from(booking).where(customerWhere(customerId, filter));
    return Number(row?.n ?? 0);
  }

  async countsForCustomer(customerId: string, now: Date) {
    const rows = await getDb()
      .select({ bucket: customerBucket(now), n: count() })
      .from(booking)
      .where(and(eq(booking.customerId, customerId), sql`${booking.status} <> 'DRAFT'`))
      .groupBy(customerBucket(now));

    const counts = { waiting: 0, upcoming: 0, history: 0 };
    for (const row of rows) {
      // A bucket the CASE cannot produce would be a bug in the CASE, not data
      // to carry: the three names below are the whole domain of that expression.
      if (row.bucket === "waiting" || row.bucket === "upcoming" || row.bucket === "history") {
        counts[row.bucket] = Number(row.n);
      }
    }
    return counts;
  }
```

Add `gte` and `or` to the `drizzle-orm` import at the top of the file if they are not already there.

- [ ] **Step 5: Run the tests**

```bash
cd packages/backend && bunx vitest run src/modules/ntizo/read/booking
```
Expected: PASS. The projections still call `listForCustomer(customerId)` and will now fail to compile; Task 3 fixes them. If the suite refuses to run for that reason, land Task 3's projection edit in the same commit and say so in the body.

- [ ] **Step 6: Commit**

```bash
git add -A packages/backend/src/modules/ntizo/read/booking
git commit -m "$(cat <<'EOF'
feat(booking): the customer's list gains tabs, paging and counts

Three tabs, mirroring the provider's page: both waits together, the confirmed
future, and everything finished plus the confirmed past. The upcoming/history
split is by startsAt against an injected now, because nothing in the platform
can declare a booking done. Counts come back for all three in one grouped
read, since the chips are on screen whichever tab is open.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WJL2JCeKxUTv5mFvtJWzft
EOF
)"
```

---

### Task 3: The two customer read fields

**Files:**
- Create: `packages/backend/src/modules/ntizo/read/booking/app/use-cases/booking-timeline.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/app/use-cases/to-provider-booking-dto.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/app/use-cases/list-my-bookings.projection.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/app/use-cases/get-my-booking.projection.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/graphql/schema/queries.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/graphql/handlers/queries.handlers.ts`
- Test: `packages/backend/src/modules/ntizo/read/booking/__tests__/list-my-bookings.projection.test.ts`

**Interfaces:**
- Consumes: `CustomerListFilter`, `countsForCustomer`, `listForCustomer`, `countForCustomer` (Task 2); `customerBookingPageReadModel`, `customerBookingDetailReadModel` (Task 1).
- Produces:
  - `timelineOf(row: { createdAt: Date; customerId: string; status: string; expiresAt: Date | null }, changes: readonly TimelineChangeRow[], now: Date): BookingTimelineEntryDTO[]`
  - `ListMyBookingsProjection.execute({ customerId, tab, limit, offset, now }): Promise<CustomerBookingPageDTO>`
  - `GetMyBookingProjection.execute({ bookingId, customerId, now }): Promise<CustomerBookingDetailDTO | null>`
  - GraphQL `bookingMine(input: { tab, limit, offset })`, `bookingById(input: { bookingId })` now returning the detail model.

- [ ] **Step 1: Write the failing test**

```ts
describe("ListMyBookingsProjection", () => {
  it("returns the page and all three counts", async () => {
    const repo = fakeRepo({
      rows: [row({ status: "AWAITING_PROVIDER" })],
      total: 1,
      counts: { waiting: 1, upcoming: 0, history: 2 },
    });
    const page = await new ListMyBookingsProjection(repo).execute({
      customerId: ALICE, tab: "waiting", limit: 20, offset: 0, now: NOW,
    });
    expect(page.items).toHaveLength(1);
    expect(page.counts).toEqual({ waiting: 1, upcoming: 0, history: 2 });
  });

  // The pager stops rather than offering a page that is not there.
  it("offers no next offset on the last page", async () => {
    const repo = fakeRepo({ rows: [row({})], total: 1, counts: ZERO_COUNTS });
    const page = await new ListMyBookingsProjection(repo).execute({
      customerId: ALICE, tab: "waiting", limit: 20, offset: 0, now: NOW,
    });
    expect(page.nextOffset).toBeNull();
  });

  it("offers the next offset when rows remain", async () => {
    const repo = fakeRepo({ rows: Array.from({ length: 20 }, () => row({})), total: 45, counts: ZERO_COUNTS });
    const page = await new ListMyBookingsProjection(repo).execute({
      customerId: ALICE, tab: "history", limit: 20, offset: 0, now: NOW,
    });
    expect(page.nextOffset).toBe(20);
  });
});

describe("GetMyBookingProjection", () => {
  // The customer's timeline is the provider's, read through the same helper.
  it("tells the story of the booking, ending in the deadline still ahead", async () => {
    const detail = await new GetMyBookingProjection(fakeRepo({
      one: row({ status: "PENDING_PAYMENT", expiresAt: new Date("2026-09-03T10:00:00Z") }),
      changes: [
        { changedAt: new Date("2026-09-03T08:00:00Z"), changedByUserId: ALICE, reason: "submitted_by_customer" },
        { changedAt: new Date("2026-09-03T09:00:00Z"), changedByUserId: PROVIDER_MEMBER, reason: "accepted_by_provider" },
      ],
    })).execute({ bookingId: "b1", customerId: ALICE, now: new Date("2026-09-03T09:30:00Z") });

    expect(detail?.timeline.map((e) => e.reason)).toEqual([
      "created_by_customer", "submitted_by_customer", "accepted_by_provider", "pay_by",
    ]);
    expect(detail?.timeline.at(-1)?.pending).toBe(true);
    expect(detail?.timeline[1]?.actor).toBe("customer");
    expect(detail?.timeline[2]?.actor).toBe("provider");
  });

  it("answers null for a booking that is not the caller's, with no timeline read", async () => {
    const repo = fakeRepo({ one: null });
    const detail = await new GetMyBookingProjection(repo).execute({ bookingId: "b1", customerId: ALICE, now: NOW });
    expect(detail).toBeNull();
    expect(repo.timelineFor).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/backend && bunx vitest run src/modules/ntizo/read/booking/__tests__/list-my-bookings.projection.test.ts
```
Expected: FAIL — `execute` takes `{ customerId }` and returns an array.

- [ ] **Step 3: Lift the timeline out of the provider's mapper**

Create `app/use-cases/booking-timeline.ts` and move `timelineOf` into it, widening its first parameter so both audiences fit:

```ts
import type { BookingTimelineEntryDTO } from "@ntizo/shared/read-models";

/** The three columns a hop is built from, whichever row shape carried them. */
export interface TimelineChangeRow {
  changedAt: Date;
  changedByUserId: string | null;
  reason: string;
}

/** Everything the assembly needs off the booking, from either audience's row. */
export interface TimelineSubject {
  createdAt: Date;
  customerId: string;
  status: string;
  expiresAt: Date | null;
}

/**
 * Creation first, then every recorded hop, then — while a clock is running —
 * the deadline still ahead, drawn hollow.
 *
 * The actor is derived, not stored: a null `changedByUserId` is a machine
 * hop, the booking's own customer is the customer, and anyone else is
 * somebody in the workspace.
 *
 * Both audiences read the same list. It lived in `to-provider-booking-dto.ts`
 * until the customer's page needed it; a second copy would be a second place
 * for the two sides of one booking to start disagreeing about its history.
 */
export function timelineOf(
  subject: TimelineSubject,
  changes: readonly TimelineChangeRow[],
  now: Date,
): BookingTimelineEntryDTO[] {
  const entries: BookingTimelineEntryDTO[] = [
    { at: subject.createdAt.toISOString(), reason: "created_by_customer", actor: "customer", pending: false },
    ...changes.map((c) => ({
      at: c.changedAt.toISOString(),
      reason: c.reason,
      actor:
        c.changedByUserId === null
          ? ("system" as const)
          : c.changedByUserId === subject.customerId
            ? ("customer" as const)
            : ("provider" as const),
      pending: false,
    })),
  ];

  const clock =
    subject.status === "AWAITING_PROVIDER" ? "respond_by" : subject.status === "PENDING_PAYMENT" ? "pay_by" : null;
  if (clock && subject.expiresAt && subject.expiresAt.getTime() > now.getTime()) {
    entries.push({ at: subject.expiresAt.toISOString(), reason: clock, actor: "system", pending: true });
  }
  return entries;
}
```

In `to-provider-booking-dto.ts`, delete the local `timelineOf` and import the new one. Its call site is unchanged: `ProviderBookingRow` already has all four fields.

- [ ] **Step 4: Rewrite the two projections**

`list-my-bookings.projection.ts`:

```ts
import type { CustomerBookingPageDTO } from "@ntizo/shared/read-models";
import type { CustomerBookingTab } from "@ntizo/shared";
import type { BookingReadRepositoryPort } from "../ports/outbound/booking-read.repository.port";
import { toBookingDTO } from "./to-booking-dto";

export interface ListMyBookingsInput {
  /** Stamped by the handler from the session, never read from `args`. */
  customerId: string;
  tab: CustomerBookingTab;
  limit: number;
  offset: number;
  /** Injected: what counts as "upcoming" is a question about a clock. */
  now: Date;
}

/**
 * One tab of a customer's own bookings, with the counts the chips render.
 *
 * Takes no reader-supplied customer id. `customerId` is stamped by the
 * GraphQL handler from the session — BR7 gives a customer the right to read
 * their own bookings and nobody else's, and a query that took the id as an
 * argument would be the endpoint that reads anybody's.
 *
 * Three reads, not one: the page, its total, and the three counts. The counts
 * are their own grouped query rather than three totals, so the chips cannot
 * disagree with each other about the same instant.
 */
export class ListMyBookingsProjection {
  constructor(private readonly repo: BookingReadRepositoryPort) {}

  async execute(input: ListMyBookingsInput): Promise<CustomerBookingPageDTO> {
    const filter = { tab: input.tab, now: input.now };
    const [rows, total, counts] = await Promise.all([
      this.repo.listForCustomer(input.customerId, filter, input.limit, input.offset),
      this.repo.countForCustomer(input.customerId, filter),
      this.repo.countsForCustomer(input.customerId, input.now),
    ]);

    const nextOffset = input.offset + rows.length;
    return {
      items: rows.map(toBookingDTO),
      total,
      // Null rather than an offset past the end: a pager handed a number it
      // cannot fill offers a page that is not there.
      nextOffset: nextOffset < total ? nextOffset : null,
      counts,
    };
  }
}
```

`get-my-booking.projection.ts` — keep the whole existing doc comment, add a paragraph and change the body:

```ts
  async execute(input: {
    bookingId: string;
    customerId: string;
    now: Date;
  }): Promise<CustomerBookingDetailDTO | null> {
    const row = await this.repo.findForCustomer(input.bookingId, input.customerId);
    if (!row) {
      // No timeline read for a booking that is not the caller's. The history
      // of somebody else's booking is not a thing to fetch and then discard.
      return null;
    }

    const changes = await this.repo.timelineFor(row.id);
    return {
      ...toBookingDTO(row),
      timeline: timelineOf(
        // `BookingListRow` carries no `customerId` — it never needed one,
        // being read through a `WHERE` on exactly this value. The caller is
        // the customer by construction, so pass it back in.
        { createdAt: row.createdAt, customerId: input.customerId, status: row.status, expiresAt: row.expiresAt },
        changes,
        input.now,
      ),
    };
  }
```

- [ ] **Step 5: Change the two GraphQL fields**

In `queries.ts`, replace `listMyBookings` and `getMyBooking`:

```ts
/**
 * One tab of the caller's own bookings, paged, with the three tab counts.
 *
 * Takes no customer id — it resolves from the session, so there is nothing to
 * tamper with. BR7 limits reading a booking to its own customer, its
 * provider, or an administrator; this field answers only the first of those.
 *
 * The shape changed on 2026-09-03, from an unpaged array to this page. It had
 * no callers: the page it was written for was a placeholder until then.
 */
export const listMyBookings = defineQuery({
  input: zodSchema(
    z.object({
      tab: z.enum(CUSTOMER_BOOKING_TABS),
      limit: z.number().int().min(1).max(50).optional(),
      offset: z.number().int().min(0).optional(),
    }),
  ),
  output: zodSchema(customerBookingPageReadModel),
  docs: { summary: "Your own bookings, one tab at a time", tags: ["Booking"] },
});

/**
 * One of the caller's own bookings, by id — what checkout's steps 2 and 3
 * load, and what the booking's own page reads.
 *
 * Takes no customer id here either, for the same reason `mine` does not: it
 * resolves from the session, and the repository filters on it *inside the
 * query* rather than checking it after the read — see
 * `BookingReadRepositoryPort.findForCustomer`.
 *
 * The output is nullable, and covers two cases without distinguishing them:
 * no such booking, and one that is not the caller's. Telling an unrelated
 * caller which it was would confirm that a given id names a real booking.
 *
 * It gained `timeline` on 2026-09-03. Checkout does not select it and pays
 * nothing for it.
 */
export const getMyBooking = defineQuery({
  input: zodSchema(z.object({ bookingId: z.string().min(1) })),
  output: zodSchema(customerBookingDetailReadModel.nullable()),
  docs: { summary: "One of your own bookings", tags: ["Booking"] },
});
```

Import `CUSTOMER_BOOKING_TABS` from `@ntizo/shared` and the two models from `@ntizo/shared/read-models`.

In `queries.handlers.ts`:

```ts
    .handle("booking.mine", async (args, ctx) =>
      uc.listMine.execute({
        // Never from the client — see the schema's own doc comment for why
        // there is no `customerId` field to read instead.
        customerId: requireUser(ctx),
        tab: args.input.tab,
        limit: args.input.limit ?? 20,
        offset: args.input.offset ?? 0,
        now: new Date(),
      }),
    )
    .handle("booking.byId", async (args, ctx) =>
      uc.getMine.execute({
        bookingId: args.input.bookingId,
        customerId: requireUser(ctx),
        now: new Date(),
      }),
    )
```

- [ ] **Step 6: Run the tests and the type check**

```bash
cd packages/backend && bunx vitest run src/modules/ntizo/read/booking
cd ../.. && bun run check-types
```
Expected: PASS. `check-types` will name checkout's query if it selects a field that moved; it does not, but fix it there if it does.

- [ ] **Step 7: Commit**

```bash
git add -A packages/backend
git commit -m "$(cat <<'EOF'
feat(booking): the customer's reads answer with a page and a timeline

booking.mine takes a tab and a window and answers with the rows, the total and
the three counts. booking.byId gains the timeline the provider's page already
draws, through a helper lifted out of the provider's mapper so the two sides of
one booking cannot start disagreeing about its history.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WJL2JCeKxUTv5mFvtJWzft
EOF
)"
```

---

### Task 4: The list page

**Files:**
- Create: `apps/frontend/web/src/features/bookings/domain/status.ts`
- Create: `apps/frontend/web/src/features/bookings/data/booking.repository.ts`
- Create: `apps/frontend/web/src/features/bookings/viewmodel/use-my-bookings.ts`
- Create: `apps/frontend/web/src/features/bookings/ui/booking-status-badge.tsx`
- Create: `apps/frontend/web/src/features/bookings/ui/bookings-page.tsx`
- Create: `apps/frontend/web/src/shared/locales/pt-MZ/bookings.json`
- Modify: `apps/frontend/web/src/routes/_customer/bookings.tsx`
- Modify: `apps/frontend/web/src/features/account/ui/placeholder-pages.tsx` (drop `BookingsPage`, keep `FavouritesPage`)
- Modify: `apps/frontend/web/src/shared/lib/i18n.ts`
- Test: `apps/frontend/web/src/features/bookings/ui/__tests__/bookings-page.test.tsx`

**Interfaces:**
- Consumes: `bookingMine` (Task 3); `CustomerBookingPageDTO`, `BookingDTO` (Task 1).
- Produces: `CUSTOMER_BOOKINGS_PAGE_SIZE = 20`; `STATUS_TONE: Record<BookingDTO["status"], BadgeTone>`; `shortReference(id)`; `timeLeftWording(iso, now)`; `deadlineOf(booking)`; `myBookingQueries.page(input)`; `useMyBookings(input)`; `BookingsPage`.

- [ ] **Step 1: Write the failing test**

```tsx
describe("BookingsPage", () => {
  it("shows a row per booking with its status in words", async () => {
    server.use(pageOf([booking({ status: "AWAITING_PROVIDER", serviceName: "Limpeza profunda" })]));
    await renderBookings();
    expect(await screen.findByText("Limpeza profunda")).toBeInTheDocument();
    expect(screen.getByText("À espera do prestador")).toBeInTheDocument();
  });

  // The two buttons live in the first tab and nowhere else. A confirmed
  // booking has nothing a customer can do to it in this product.
  it("offers pay only while the payment is what is being waited for", async () => {
    server.use(pageOf([booking({ status: "PENDING_PAYMENT" })]));
    await renderBookings();
    expect(await screen.findByRole("button", { name: "Pagar" })).toBeInTheDocument();
  });

  it("offers no action on a confirmed booking", async () => {
    server.use(pageOf([booking({ status: "CONFIRMED" })], { tab: "upcoming" }));
    await renderBookings({ tab: "upcoming" });
    expect(await screen.findByText("Confirmada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pagar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
  });

  it("renders the tab counts", async () => {
    server.use(pageOf([], { counts: { waiting: 2, upcoming: 1, history: 4 } }));
    await renderBookings();
    expect(await screen.findByRole("tab", { name: /A aguardar/ })).toHaveTextContent("2");
  });

  it("says the tab is empty and offers a way out", async () => {
    server.use(pageOf([]));
    await renderBookings();
    expect(await screen.findByText("Ainda não há reservas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explorar serviços" })).toBeInTheDocument();
  });

  // The rule the whole read model was reshaped for. Worth one assertion at
  // the surface too: this is where a regression would actually be seen.
  it("never prints a commission", async () => {
    server.use(pageOf([booking({ priceMinor: 180_000 })]));
    await renderBookings();
    expect(await screen.findByText("1 800 MZN")).toBeInTheDocument();
    expect(screen.queryByText(/comiss/i)).not.toBeInTheDocument();
  });
});
```

Mirror the harness in `apps/frontend/web/src/features/provider/bookings/ui/__tests__/bookings-page.test.tsx` for `renderBookings`, including `await router.load()` before rendering — a TanStack route component rendered without it has no loaded match and throws.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bunx vitest run src/features/bookings
```
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the domain helpers**

`features/bookings/domain/status.ts`:

```ts
import type { BookingDTO } from "@ntizo/shared/read-models";
import { CUSTOMER_BOOKING_TABS, type CustomerBookingTab } from "@ntizo/shared";

export type CustomerBookingStatus = BookingDTO["status"];
export type BadgeTone = "info" | "success" | "danger" | "warning" | "neutral";
export { CUSTOMER_BOOKING_TABS, type CustomerBookingTab };

/** Rows per page; the repository and the pager share it. */
export const CUSTOMER_BOOKINGS_PAGE_SIZE = 20;

/**
 * The chip's colour per status, from the customer's side.
 *
 * Warning is spent on the one status where somebody else is deciding, info on
 * the one where the customer is. It differs from the provider's table for
 * that reason and not by accident: there, `PENDING_PAYMENT` is information
 * about a customer, and here it is the customer's own task.
 */
export const STATUS_TONE: Record<CustomerBookingStatus, BadgeTone> = {
  DRAFT: "neutral",
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

/**
 * The deadline this booking is actually running, or null.
 *
 * `expiresAt` is one column meaning three things and it is never cleared, so
 * a countdown driven off the date alone shows an expired timer on a booking
 * that is paid and confirmed. Read the status first — see
 * `bookingReadModel.expiresAt`'s own comment.
 */
export function deadlineOf(b: Pick<BookingDTO, "status" | "expiresAt">): string | null {
  if (b.status !== "AWAITING_PROVIDER" && b.status !== "PENDING_PAYMENT") return null;
  return b.expiresAt;
}

/** "1h42" or "20 min"; null once the deadline is behind us. */
export function timeLeftWording(deadlineIso: string, now: Date): string | null {
  const minutes = Math.floor((new Date(deadlineIso).getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

export function canCancel(status: CustomerBookingStatus): boolean {
  return status === "AWAITING_PROVIDER" || status === "PENDING_PAYMENT";
}

export function canPay(status: CustomerBookingStatus): boolean {
  return status === "PENDING_PAYMENT";
}
```

- [ ] **Step 4: Write the data layer**

`features/bookings/data/booking.repository.ts`, mirroring the provider's file:

```ts
import { queryOptions } from "@tanstack/react-query";
import type { CustomerBookingDetailDTO, CustomerBookingPageDTO } from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import { CUSTOMER_BOOKINGS_PAGE_SIZE, type CustomerBookingTab } from "../domain/status";

/** No commission fields: they left `bookingReadModel` on 2026-09-03 and cannot be asked for. */
const ROW_FIELDS = `
  id status serviceId serviceOptionId serviceName providerName providerSlug providerVerified
  providerRatingAverage optionName durationMinutes locationType priceMinor currency
  startsAt endsAt timezone addressLabel addressLine addressCity addressDistrict addressDirections
  description expiresAt paidAt createdAt`;

const PAGE = `
  query BookingMine($input: BookingMineInput!) {
    bookingMine(input: $input) {
      items {${ROW_FIELDS}
      }
      total nextOffset
      counts { waiting upcoming history }
    }
  }`;

const DETAIL = `
  query BookingById($input: BookingByIdInput!) {
    bookingById(input: $input) {${ROW_FIELDS}
      timeline { at reason actor pending }
    }
  }`;

export interface MyBookingsPageInput {
  tab: CustomerBookingTab;
  offset: number;
}

export const myBookingQueries = {
  page: (input: MyBookingsPageInput) =>
    queryOptions({
      queryKey: ["bookings", "mine", input.tab, input.offset] as const,
      queryFn: async (): Promise<CustomerBookingPageDTO> => {
        const d = await sessionGraphql<{ bookingMine: CustomerBookingPageDTO }>(PAGE, {
          input: { tab: input.tab, limit: CUSTOMER_BOOKINGS_PAGE_SIZE, offset: input.offset },
        });
        return d.bookingMine;
      },
    }),
  detail: (bookingId: string) =>
    queryOptions({
      queryKey: ["bookings", "mine", "one", bookingId] as const,
      queryFn: async (): Promise<CustomerBookingDetailDTO | null> => {
        const d = await sessionGraphql<{ bookingById: CustomerBookingDetailDTO | null }>(DETAIL, {
          input: { bookingId },
        });
        return d.bookingById;
      },
    }),
};
```

- [ ] **Step 5: Write the viewmodel and the UI**

`viewmodel/use-my-bookings.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { myBookingQueries, type MyBookingsPageInput } from "../data/booking.repository";

export function useMyBookings(input: MyBookingsPageInput) {
  return useQuery(myBookingQueries.page(input));
}

export function useMyBooking(bookingId: string) {
  return useQuery(myBookingQueries.detail(bookingId));
}
```

`ui/booking-status-badge.tsx`: a chip taking `status`, reading `STATUS_TONE`, printing `t(\`status.${status}\`)`. Copy the tone-to-class map from `features/provider/bookings/ui/booking-status-badge.tsx` verbatim so the two zones' chips match.

`ui/bookings-page.tsx`: `CollectionCard` with the columns of the mockup — service and option, provider with the verified mark, the date over the start time and duration, the chip with the countdown under it, the price, and the action cell. Tabs from `CUSTOMER_BOOKING_TABS` with their counts, driven by `?tab=` through `Route.useSearch()` / `navigate`. Empty state through `EmptyCard` with a `Link` to `/services`. Read `features/provider/bookings/ui/bookings-page.tsx` first and follow its structure; do not invent a second list idiom.

The action cell renders nothing unless `canCancel(status)` or `canPay(status)`. Both buttons are wired in Tasks 9 and 12; until then they render disabled with no handler, and the tests above assert their presence, not their effect.

- [ ] **Step 6: Route it and register the namespace**

`routes/_customer/bookings.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { CUSTOMER_BOOKING_TABS, type CustomerBookingTab } from "@ntizo/shared";
import { BookingsPage } from "@/features/bookings/ui/bookings-page";

/**
 * The customer's own bookings. It was a placeholder from the day the route
 * existed; checkout deliberately refused to link here until it read real rows.
 */
export const Route = createFileRoute("/_customer/bookings")({
  validateSearch: (s: Record<string, unknown>): { tab?: CustomerBookingTab; offset?: number } => ({
    ...(CUSTOMER_BOOKING_TABS.includes(s["tab"] as CustomerBookingTab)
      ? { tab: s["tab"] as CustomerBookingTab }
      : {}),
    ...(typeof s["offset"] === "number" && s["offset"] > 0 ? { offset: s["offset"] } : {}),
  }),
  component: BookingsPage,
});
```

Delete `BookingsPage` and its now-unused imports from `placeholder-pages.tsx`, and update that file's header comment: messages left when Communication shipped, bookings leaves now, favourites remains.

Add `bookings` to every locale entry in `i18n.ts`, following the existing import-and-key pattern exactly.

Write `pt-MZ/bookings.json` from the mockup's copy. Keys: `title`, `lede`, `tab.waiting`, `tab.upcoming`, `tab.history`, `status.*` (nine), `emptyTitle`, `emptyBody`, `emptyAction`, `respondIn`, `payIn`, `pay`, `cancel`, `view`, `reference`, `minutes`, and the detail keys Task 6 adds. Move `bookingsTitle`, `bookingsEmptyTitle` and `bookingsEmptyBody` out of `account.json` into it, deleting them there.

- [ ] **Step 7: Run the tests**

```bash
cd apps/frontend/web && bunx vitest run src/features/bookings src/features/account
cd ../../.. && bun run check-types
```
Expected: PASS. The locale parity test fails until Task 5; that is expected and is that task's subject.

- [ ] **Step 8: Commit**

```bash
git add -A apps/frontend/web
git commit -m "$(cat <<'EOF'
feat(bookings): the customer's list, reading its own rows

Three tabs with counts, a row per booking with its status in words and the
clock when one is running, and an empty state with a way out. The placeholder
that stood here since the route existed is gone, and checkout's refusal to
link here can be lifted.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WJL2JCeKxUTv5mFvtJWzft
EOF
)"
```

---

### Task 5: The other seven locales

**Files:**
- Create: `apps/frontend/web/src/shared/locales/{pt-PT,en-US,es-ES,fr-FR,de-DE,it-IT,nl-NL}/bookings.json`
- Modify: `apps/frontend/web/src/shared/locales/__tests__/locales.test.ts`

**Interfaces:**
- Consumes: `pt-MZ/bookings.json` (Task 4), the reference.
- Produces: eight parity-complete files.

- [ ] **Step 1: Register the namespace in the parity gate**

In `locales.test.ts`, add `bookings` to `NAMESPACES` beside `checkout` and `company`, importing all eight files the way the existing entries do.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bunx vitest run src/shared/locales
```
Expected: FAIL — seven files missing.

- [ ] **Step 3: Write the seven files**

Translate from pt-MZ, key for key. Rules that have already cost this repo a review round:

- **it-IT and nl-NL use the informal register** (`tu` / `je`), matching the existing files in those locales.
- **es-ES uses `puedes`**, not `puede`.
- **pt-PT writes `Ações`**, not `Acções`.
- Status names are the customer's words in each language, not the enum: "À espera do prestador", "Waiting for the provider", "En attente du prestataire".
- Never machine-translate the empty state or the money sentence; each must read as if written in that language.

- [ ] **Step 4: Run the gate**

```bash
cd apps/frontend/web && bunx vitest run src/shared/locales
```
Expected: PASS — every namespace has the same key set in all eight locales.

- [ ] **Step 5: Commit**

```bash
git add -A apps/frontend/web/src/shared/locales
git commit -m "$(cat <<'EOF'
feat(bookings): the bookings namespace in eight languages

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WJL2JCeKxUTv5mFvtJWzft
EOF
)"
```

---

### Task 6: The detail page

**Files:**
- Create: `apps/frontend/web/src/routes/_customer/bookings.$bookingId.tsx`
- Create: `apps/frontend/web/src/features/bookings/ui/booking-page.tsx`
- Modify: `apps/frontend/web/src/features/bookings/ui/bookings-page.tsx` (rows link to it)
- Modify: the eight `bookings.json` files (the detail's keys)
- Modify: `apps/frontend/web/src/features/checkout/ui/booking-outcome-panel.tsx` and `confirm-page.tsx`
- Test: `apps/frontend/web/src/features/bookings/ui/__tests__/booking-page.test.tsx`

**Interfaces:**
- Consumes: `useMyBooking` (Task 4), `bookingById` with `timeline` (Task 3).
- Produces: `BookingPage`; the route `/bookings/$bookingId`.

- [ ] **Step 1: Write the failing test**

```tsx
describe("BookingPage", () => {
  it("tells the story of the booking in order", async () => {
    server.use(detailOf(booking({
      status: "PENDING_PAYMENT",
      timeline: [
        { at: "2026-09-03T08:12:00Z", reason: "created_by_customer", actor: "customer", pending: false },
        { at: "2026-09-03T09:40:00Z", reason: "accepted_by_provider", actor: "provider", pending: false },
        { at: "2026-09-03T10:02:00Z", reason: "pay_by", actor: "system", pending: true },
      ],
    })));
    await renderBooking();
    const steps = await screen.findAllByRole("listitem");
    expect(steps.map((s) => s.textContent)).toEqual([
      expect.stringContaining("Pedido enviado"),
      expect.stringContaining("Prestador aceitou"),
      expect.stringContaining("A aguardar o seu pagamento"),
    ]);
  });

  it("shows the total and never a split", async () => {
    server.use(detailOf(booking({ priceMinor: 180_000, currency: "MZN" })));
    await renderBooking();
    expect(await screen.findByText("1 800 MZN")).toBeInTheDocument();
    expect(screen.queryByText(/comiss/i)).not.toBeInTheDocument();
  });

  it("says when a paid booking was paid", async () => {
    server.use(detailOf(booking({ status: "CONFIRMED", paidAt: "2026-09-01T14:07:00Z" })));
    await renderBooking();
    expect(await screen.findByText(/Pago a/)).toBeInTheDocument();
  });

  // Not "are you sure it is yours" — the read cannot tell a stranger's id from
  // a missing one, and the page must not imply it can.
  it("renders the not-found card for a booking that is not the caller's", async () => {
    server.use(detailOf(null));
    await renderBooking();
    expect(await screen.findByText("Reserva não encontrada")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bunx vitest run src/features/bookings/ui/__tests__/booking-page.test.tsx
```
Expected: FAIL — no such module.

- [ ] **Step 3: Build the page**

Follow `features/provider/bookings/ui/booking-page.tsx` for structure and the mockup for content. Header: back link, service name as `h1`, provider line with rating and verified mark, chip, short reference, and the action slot (empty until Tasks 9 and 12). Left column: **A marcação**, **O prestador**, **A sua nota**, each a section in one `CollectionCard`-style card, the note omitted when `description` is null. Right column: **O valor** — the total, the sentence "É o preço anunciado pelo prestador. A Ntizo não acrescenta nada por cima.", and the "Pago a …" line when `paidAt` is set; then **Como vai isto** — an `<ol>` of the timeline, each entry `t(\`timeline.${reason}\`)` with a `defaultValue` of `t("timeline.unknown")` so a reason added later renders as a hop rather than as a raw token.

For a `CONFIRMED` booking, render the support line from the mockup instead of the action buttons.

- [ ] **Step 4: Link the rows, and let checkout point here**

In `bookings-page.tsx`, wrap each row's service name in a `Link` to `/bookings/$bookingId`.

In `booking-outcome-panel.tsx`, replace `BrowseMoreLink`'s destination comment and target: the paragraph beginning "**Not `/bookings`.**" is now false, and the honest replacement is a link to the booking's own page. Add a second action, "Ver a minha reserva", to `/bookings/$bookingId`, keeping "Explorar serviços" as the quiet one. Update `confirm-page.tsx`'s doc comment in the same edit: the sentence beginning "**Stays on this page.** The obvious destination, `/bookings`, is a placeholder" now records history rather than a rule, so rewrite it to say the panel offers the booking's page and why staying is still right.

- [ ] **Step 5: Run the tests**

```bash
cd apps/frontend/web && bunx vitest run src/features/bookings src/features/checkout src/routes
cd ../../.. && bun run check-types
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A apps/frontend/web
git commit -m "$(cat <<'EOF'
feat(bookings): one booking, and the story of it

The detail page: what was booked, with whom, where, the total with no split,
and a timeline that says where the booking is and what it is waiting for. It
stops at "pagamento confirmado", because no transition past that exists.

Checkout can now offer the booking's own page, which the outcome panel had
been refusing to do for as long as this page was a placeholder.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WJL2JCeKxUTv5mFvtJWzft
EOF
)"
```

---

### Task 7: Cancelling, in the domain

**Files:**
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/booking/domain/events/index.ts` (or wherever `BookingCancelledReason` is declared)
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/booking/domain/aggregates/booking.aggregate.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/booking/domain/exceptions.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/booking/__tests__/booking.aggregate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BookingCancelledReason` widened to `"customer_did_not_pay" | "cancelled_by_customer"`; `Booking.cancelByCustomer(at: Date): Booking`; `BookingNotYoursError`.

- [ ] **Step 1: Write the failing test**

```ts
describe("cancelByCustomer", () => {
  it("cancels a booking still waiting for the provider", () => {
    const b = awaitingProvider().cancelByCustomer(NOW);
    expect(b.status).toBe("CANCELLED");
    expect(b.cancelledAt).toEqual(NOW);
  });

  it("cancels a booking waiting to be paid", () => {
    expect(pendingPayment().cancelByCustomer(NOW).status).toBe("CANCELLED");
  });

  // The asymmetry `cancel` documents: the sweep's cancel is a no-op from a
  // status its reason does not govern, because a clock that fired late is
  // nobody's mistake. This one is a person pressing a button, so a wrong
  // status is a bug upstream and says so — the same way submit, accept and
  // decline do.
  it("throws rather than no-oping on a paid booking", () => {
    expect(() => confirmed().cancelByCustomer(NOW)).toThrow();
  });

  it("throws on a booking already cancelled", () => {
    expect(() => cancelled().cancelByCustomer(NOW)).toThrow();
  });

  it("leaves the sweep's own cancel a no-op", () => {
    const b = confirmed();
    expect(b.cancel(NOW, "customer_did_not_pay")).toBe(b);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/backend && bunx vitest run src/modules/ntizo/bounded-contexts/booking/__tests__/booking.aggregate.test.ts
```
Expected: FAIL — `cancelByCustomer` is not a function.

- [ ] **Step 3: Widen the reason and add the method**

```ts
export type BookingCancelledReason = "customer_did_not_pay" | "cancelled_by_customer";
```

`CANCELLABLE_FROM` goes red until it answers for the new member, which is the gate its own comment promises. Add:

```ts
const CANCELLABLE_FROM: Record<BookingCancelledReason, readonly BookingStatus[]> = {
  customer_did_not_pay: [BookingStatus.PendingPayment],
  // Both waits, and nothing past them. Once money has moved there is nothing
  // in this platform that can move it back — no refund port, no disbursement,
  // and a wallet ledger with no writer — so a cancellation after payment would
  // be a promise the system cannot keep. See the design's own section.
  cancelled_by_customer: [BookingStatus.AwaitingProvider, BookingStatus.PendingPayment],
};
```

Then, beside `cancel`:

```ts
  /**
   * The customer calls it off, before any money has moved.
   *
   * **This one throws**, unlike `cancel` next door, and the difference is the
   * caller rather than the transition. `cancel` answers a sweep that selected
   * on a deadline it read before the call, so a booking that moved underneath
   * it is an ordinary race and the honest answer is the instance back
   * unchanged. This is one person's single deliberate action on a booking
   * they are looking at, so a wrong status is a bug upstream — the same
   * argument `submit`, `accept` and `decline` already make.
   */
  cancelByCustomer(at: Date): Booking {
    if (!CANCELLABLE_FROM.cancelled_by_customer.includes(this.props.status)) {
      // The same error, with the same arguments, that `submit` throws for a
      // wrong status. Match it exactly rather than introducing a second way
      // to say the same thing.
      throw new BookingTransitionError(this.props.status, BookingStatus.Cancelled);
    }

    Booking.requireValidDate(at, "at");

    return new Booking({ ...this.props, status: BookingStatus.Cancelled, cancelledAt: at });
  }
```

Read `submit`'s own throw before writing this and copy its error construction verbatim; if the constructor takes different arguments, use those.

In `domain/exceptions.ts`, add beside `NotProviderMemberError`:

```ts
/**
 * The caller is signed in, but this booking is somebody else's.
 *
 * Only writes raise it. The reads answer `null` for a stranger's booking and
 * for a missing one alike, deliberately undistinguished — see
 * `BookingReadRepositoryPort.findForCustomer`. A write is different: by then
 * the caller is claiming one specific booking, and a silent no-op would leave
 * a button that appears to do nothing.
 */
export class BookingNotYoursError extends ForbiddenError {
  constructor() {
    super({ message: "This booking is not yours", code: "BOOKING_NOT_YOURS" });
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
cd packages/backend && bunx vitest run src/modules/ntizo/bounded-contexts/booking
```
Expected: PASS, including the existing sweep tests, which must not change behaviour.

- [ ] **Step 5: Commit**

```bash
git add -A packages/backend/src/modules/ntizo/bounded-contexts/booking
git commit -m "$(cat <<'EOF'
feat(booking): a customer may call off a booking before it is paid

cancelByCustomer throws where the sweep's cancel no-ops, because the caller is
a person pressing a button rather than a clock that fired late. Allowed from
both waits and from nothing past them: once money has moved this platform has
no way to move it back.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WJL2JCeKxUTv5mFvtJWzft
EOF
)"
```

---

### Task 8: The cancel command and its mutation

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/booking/app/use-cases/cancel-booking.command.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/booking/bootstrap/index.ts`
- Modify: `packages/backend/src/modules/ntizo/write/booking/graphql/schema/mutations.ts`
- Modify: `packages/backend/src/modules/ntizo/write/booking/graphql/handlers/mutations.handlers.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/booking/__tests__/cancel-booking.command.test.ts`

**Interfaces:**
- Consumes: `Booking.cancelByCustomer`, `BookingNotYoursError` (Task 7).
- Produces: `CancelBookingCommand.execute({ bookingId, requesterUserId }): Promise<void>`; `booking.cancel` → wire `bookingCancel`; `useCases.cancelBooking`.

- [ ] **Step 1: Write the failing test**

```ts
describe("CancelBookingCommand", () => {
  it("refuses a caller who is not the booking's customer, and writes nothing", async () => {
    const repo = fakeRepo({ booking: awaitingProvider({ customerId: ALICE }) });
    await expect(
      command(repo).execute({ bookingId: "b1", requesterUserId: BOB }),
    ).rejects.toThrow(BookingNotYoursError);
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.appendChange).not.toHaveBeenCalled();
    expect(slotHold.release).not.toHaveBeenCalled();
  });

  it("cancels, records the hop, releases the slot and tells the provider", async () => {
    const repo = fakeRepo({ booking: pendingPayment({ customerId: ALICE }) });
    await command(repo).execute({ bookingId: "b1", requesterUserId: ALICE });
    expect(repo.save).toHaveBeenCalled();
    expect(repo.appendChange).toHaveBeenCalledWith(expect.objectContaining({ reason: "cancelled_by_customer", changedByUserId: ALICE }));
    expect(slotHold.release).toHaveBeenCalledWith("b1");
    expect(raise).toHaveBeenCalledWith(expect.objectContaining({ type: NotificationType.ProviderBookingCancelledByCustomer }));
  });

  // The compare-and-swap, as every other command in this context keeps it.
  it("does nothing further when the row moved first", async () => {
    const repo = fakeRepo({ booking: pendingPayment({ customerId: ALICE }), saveApplied: false });
    await command(repo).execute({ bookingId: "b1", requesterUserId: ALICE });
    expect(repo.appendChange).not.toHaveBeenCalled();
    expect(slotHold.release).not.toHaveBeenCalled();
    expect(raise).not.toHaveBeenCalled();
  });

  it("throws for a booking that does not exist", async () => {
    await expect(
      command(fakeRepo({ booking: null })).execute({ bookingId: "b1", requesterUserId: ALICE }),
    ).rejects.toThrow(BookingNotFoundError);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/backend && bunx vitest run src/modules/ntizo/bounded-contexts/booking/__tests__/cancel-booking.command.test.ts
```
Expected: FAIL — no such module.

- [ ] **Step 3: Write the command**

Copy `decline-booking.command.ts` and change exactly what differs: the authorisation is `booking.customerId === input.requesterUserId` rather than a membership read, the transition is `cancelByCustomer`, the `booking_change` reason is the constant `"cancelled_by_customer"`, the event is `BookingCancelled` with that reason, and the notification is `NotificationType.ProviderBookingCancelledByCustomer`, audience `provider`, addressed at the booking's provider. Keep the ordering discipline verbatim — save, append the change, release the slot, publish — and keep `raiseQuietly` outside the transaction with the same argument the other commands make for it.

Write the class doc comment in the same register as its neighbour: say that authorisation is the point of the command, that the ownership check runs before anything is written, and that a paid booking never reaches here because the aggregate refuses it.

Wire it into `bootstrap/index.ts` beside `declineBooking`, sharing the same repository, slot hold, unit of work, outbox and notification port. It needs no member reader.

- [ ] **Step 4: Add the mutation**

In `mutations.ts`:

```ts
/**
 * The customer calls it off. Takes only the booking: whose it is, is on the
 * booking, and whether the caller is that customer is the command's check,
 * not the client's claim. Allowed only before payment — the aggregate refuses
 * anything past it.
 */
export const cancelBooking = defineMutation({
  input: zodSchema(z.object({ bookingId: z.string().min(1) })),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Cancel your own booking", tags: ["Booking"] },
});
```

Add `cancel: cancelBooking` to `bookingWriteSchema`, and the handler:

```ts
    .handle("booking.cancel", async (args, ctx) => {
      await uc.cancelBooking.execute({ bookingId: args.input.bookingId, requesterUserId: requireUser(ctx) });
      return { bookingId: args.input.bookingId };
    })
```

- [ ] **Step 5: Run the tests**

```bash
cd packages/backend && bunx vitest run src/modules/ntizo/bounded-contexts/booking src/modules/ntizo/write/booking
cd ../.. && bun run check-types
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A packages/backend
git commit -m "$(cat <<'EOF'
feat(booking): booking.cancel, for the booking's own customer

Ownership is checked before anything is written and refused with
BOOKING_NOT_YOURS. The hop is recorded, the slot released and the provider
told through the notification type that already existed for it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WJL2JCeKxUTv5mFvtJWzft
EOF
)"
```

---

### Task 9: Cancelling, on the page

**Files:**
- Create: `apps/frontend/web/src/features/bookings/ui/cancel-dialog.tsx`
- Modify: `apps/frontend/web/src/features/bookings/data/booking.repository.ts`
- Modify: `apps/frontend/web/src/features/bookings/viewmodel/use-my-bookings.ts`
- Modify: `apps/frontend/web/src/features/bookings/ui/{bookings-page,booking-page}.tsx`
- Modify: the eight `bookings.json` files
- Test: `apps/frontend/web/src/features/bookings/ui/__tests__/cancel-dialog.test.tsx`

**Interfaces:**
- Consumes: `bookingCancel` (Task 8).
- Produces: `cancelBooking(bookingId): Promise<void>`; `useCancelBooking()`; `CancelDialog`.

- [ ] **Step 1: Write the failing test**

```tsx
describe("CancelDialog", () => {
  it("says what will happen, rather than asking for certainty", async () => {
    render(<CancelDialog booking={pendingPayment()} onClose={noop} />);
    expect(screen.getByText(/fica livre/)).toBeInTheDocument();
    expect(screen.getByText(/é avisada|é avisado/)).toBeInTheDocument();
    expect(screen.getByText(/ainda não pagou/)).toBeInTheDocument();
  });

  it("cancels and closes", async () => {
    const onClose = vi.fn();
    render(<CancelDialog booking={pendingPayment()} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar reserva" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(cancelSpy).toHaveBeenCalledWith("b1");
  });

  // The list and the detail both move on: the row changes tab and the chips
  // change with it.
  it("drops every cached read of the customer's bookings", async () => {
    render(<CancelDialog booking={pendingPayment()} onClose={noop} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar reserva" }));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["bookings"] }));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bunx vitest run src/features/bookings/ui/__tests__/cancel-dialog.test.tsx
```
Expected: FAIL — no such module.

- [ ] **Step 3: Write the mutation, the hook and the dialog**

In the repository:

```ts
const CANCEL = `
  mutation BookingCancel($input: BookingCancelInput!) {
    bookingCancel(input: $input) { bookingId }
  }`;

export async function cancelBooking(bookingId: string): Promise<void> {
  await sessionGraphql(CANCEL, { input: { bookingId } });
}
```

In the viewmodel:

```ts
/**
 * Cancel, then drop every cached read of this customer's bookings: the row
 * changes tab, the three counts change with it, and the detail's status and
 * timeline both move.
 */
export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => cancelBooking(bookingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
}
```

The dialog uses the app's existing dialog primitive — find it in `@ntizo/frontend-ui` or in `features/provider/bookings/ui/decline-dialog.tsx` and use the same one. Its body is the mockup's sentence, with the date and the provider's name interpolated. Two buttons: "Manter" (quiet) and "Cancelar reserva" (destructive). Wire it from both the list's row action and the detail's header button.

- [ ] **Step 4: Run the tests**

```bash
cd apps/frontend/web && bunx vitest run src/features/bookings
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/frontend/web
git commit -m "$(cat <<'EOF'
feat(bookings): the customer can call a booking off

The dialog says what will happen — the slot freed, the provider told, nothing
to refund because nothing was paid — rather than asking for certainty about a
consequence it did not name.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WJL2JCeKxUTv5mFvtJWzft
EOF
)"
```

---

### Task 10: Spike — does background work survive the response?

**This task's output is an answer, not code.** Everything it builds is thrown away. It exists because Task 11's shape depends on it, and the spec records it as the one open question that can change the design.

**Files:**
- Temporary, deleted before the commit: a probe route in `apps/backend/api/src/`
- Modify: `docs/superpowers/specs/2026-09-03-customer-bookings-design.md` (replace the open question with the answer)

- [ ] **Step 1: Write the probe**

Add a temporary authenticated route that calls `c.executionCtx.waitUntil()` with a task that sleeps 115 seconds, then writes a row to any table you can read back (a `booking_change` on a throwaway booking, or a `contact_request`). Log a line before and after the sleep.

- [ ] **Step 2: Deploy it to dev and call it**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd apps/backend/api && bun run deploy:dev
curl -sS -X POST https://dev.api.ntizo.co.mz/<the probe> -H 'content-type: application/json' -d '{}'
```

- [ ] **Step 3: Wait, then look**

After three minutes, query the table. Also read the Worker's logs with `bunx wrangler tail --env dev` during the run.

- [ ] **Step 4: Record the answer, and delete the probe**

**If the row lands:** Task 11 pushes the charge through `waitUntil` as designed.

**If it does not:** Task 11 instead sets `last_charge_attempt_at` to null and returns, so the per-minute cron picks the booking up on its next tick. The customer waits up to a minute, the mutation is otherwise identical, and the dialog's copy gains a line saying the prompt is on its way rather than that it has been sent.

Replace the first bullet of the spec's "Open questions this spec does not settle" with a short paragraph recording what was measured, the date, and which of the two shapes Task 11 uses. Delete the probe route entirely.

- [ ] **Step 5: Commit**

```bash
git add -A docs apps/backend/api
git commit -m "$(cat <<'EOF'
docs: what background work on the api worker actually survives

The pay mutation's shape depended on it. Measured on the dev stage; the probe
is deleted and only the answer is kept.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WJL2JCeKxUTv5mFvtJWzft
EOF
)"
```

---

### Task 11: Paying, in the backend

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/booking/app/use-cases/request-booking-charge.command.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/booking/domain/exceptions.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/booking/bootstrap/index.ts`
- Modify: `packages/backend/src/modules/ntizo/write/booking/graphql/schema/mutations.ts`
- Modify: `packages/backend/src/modules/ntizo/write/booking/graphql/handlers/mutations.handlers.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/booking/__tests__/request-booking-charge.command.test.ts`

**Interfaces:**
- Consumes: `ChargeBookingCommand`, `CustomerPhoneReaderPort`, `BOOKING_CHARGE_ATTEMPT_LIMIT`, `BOOKING_CHARGE_MIN_WINDOW_MS`, `BookingNotYoursError` (Task 7), and Task 10's answer.
- Produces: `RequestBookingChargeCommand.execute({ bookingId, requesterUserId }): Promise<void>`; `booking.pay` → wire `bookingPay`; `BookingNoCustomerPhoneError`, `BookingChargeAttemptsSpentError`, `BookingPaymentWindowClosedError`.

- [ ] **Step 1: Write the failing test**

```ts
describe("RequestBookingChargeCommand", () => {
  it("refuses a caller who is not the booking's customer", async () => {
    await expect(
      command({ booking: pendingPayment({ customerId: ALICE }) }).execute({ bookingId: "b1", requesterUserId: BOB }),
    ).rejects.toThrow(BookingNotYoursError);
    expect(charge.execute).not.toHaveBeenCalled();
  });

  it("refuses a booking that is not waiting to be paid", async () => {
    await expect(
      command({ booking: awaitingProvider({ customerId: ALICE }) }).execute({ bookingId: "b1", requesterUserId: ALICE }),
    ).rejects.toThrow(BookingTransitionError);
  });

  // The whole reason this command exists as more than a shortcut. A customer
  // with no number burns three attempts in silence and is told, through their
  // provider, that they did not pay.
  it("asks for the number before spending an attempt", async () => {
    await expect(
      command({ booking: pendingPayment({ customerId: ALICE }), phone: null }).execute({
        bookingId: "b1", requesterUserId: ALICE,
      }),
    ).rejects.toThrow(BookingNoCustomerPhoneError);
    expect(charge.execute).not.toHaveBeenCalled();
  });

  it("refuses once the attempts are spent", async () => {
    await expect(
      command({ booking: pendingPayment({ customerId: ALICE, chargeAttempts: 3 }) }).execute({
        bookingId: "b1", requesterUserId: ALICE,
      }),
    ).rejects.toThrow(BookingChargeAttemptsSpentError);
  });

  it("refuses with too little of the payment window left to answer in", async () => {
    await expect(
      command({
        booking: pendingPayment({ customerId: ALICE, expiresAt: new Date(NOW.getTime() + 60_000) }),
      }).execute({ bookingId: "b1", requesterUserId: ALICE }),
    ).rejects.toThrow(BookingPaymentWindowClosedError);
  });

  it("pushes the prompt when everything checks out", async () => {
    await command({ booking: pendingPayment({ customerId: ALICE }) }).execute({
      bookingId: "b1", requesterUserId: ALICE,
    });
    expect(charge.execute).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "b1", maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT }),
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/backend && bunx vitest run src/modules/ntizo/bounded-contexts/booking/__tests__/request-booking-charge.command.test.ts
```
Expected: FAIL — no such module.

- [ ] **Step 3: Add the three errors**

In `domain/exceptions.ts`, following `BookingNotYoursError`'s shape: `BookingNoCustomerPhoneError` (`BOOKING_NO_CUSTOMER_PHONE`), `BookingChargeAttemptsSpentError` (`BOOKING_CHARGE_ATTEMPTS_SPENT`), `BookingPaymentWindowClosedError` (`BOOKING_PAYMENT_WINDOW_CLOSED`). The first two are `ConflictError`-shaped rather than forbidden — the caller is entitled, the booking is not in a state to be charged; match whatever base class the context already uses for that, as `BookingTransitionError` does.

- [ ] **Step 4: Write the command**

```ts
/**
 * The customer asks to be charged now, instead of waiting for the sweep.
 *
 * **Everything cheap is checked here, and nothing here blocks.** Ownership,
 * the status, the phone number, the attempt bound and the payment window are
 * five reads of a row this command already loaded, and each of them is a
 * refusal the customer can act on: sign in as yourself, wait for the
 * provider, give us a number, stop retrying, start again. The gateway call
 * behind them is the one slow thing, and it is not waited for — see below.
 *
 * **The phone check is the reason this command exists.** `ChargeBookingCommand`
 * treats a missing number as an ordinary failure and spends an attempt on it,
 * which is right for a sweep that has nobody to ask; three of those and the
 * booking falls to its window and the provider is told the customer did not
 * pay. Nobody was ever asked the one question that would have fixed it. That
 * comment ends "the real fix belongs to a screen that does not exist yet";
 * this command is that screen's half of it, and it refuses *before* the claim.
 *
 * **The cooldown is bypassed, the attempt bound is not.** The cooldown spaces
 * out unattended retries; a person who just pressed a button is not that. The
 * bound is the real protection and it still holds at three.
 */
export class RequestBookingChargeCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly customerPhone: CustomerPhoneReaderPort,
    private readonly charge: ChargeBookingCommand,
    /** Runs the gateway call after the response — see Task 10's answer. */
    private readonly afterResponse: (work: Promise<unknown>) => void,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: { bookingId: string; requesterUserId: string }): Promise<void> {
    const at = this.now();
    const booking = await this.repo.findById(input.bookingId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);
    if (booking.customerId !== input.requesterUserId) throw new BookingNotYoursError();
    if (booking.status !== "PENDING_PAYMENT") {
      throw new BookingTransitionError(booking.status, "CONFIRMED");
    }
    if (booking.chargeAttempts >= BOOKING_CHARGE_ATTEMPT_LIMIT) {
      throw new BookingChargeAttemptsSpentError(input.bookingId);
    }
    // The same guard the sweep applies, for the reason
    // `BOOKING_CHARGE_MIN_WINDOW_MS` documents: a call that outlives the
    // deadline debits a customer whose booking the sweep has already cancelled.
    if (!booking.expiresAt || booking.expiresAt.getTime() - at.getTime() < BOOKING_CHARGE_MIN_WINDOW_MS) {
      throw new BookingPaymentWindowClosedError(input.bookingId);
    }
    const phone = await this.customerPhone.findPhoneNumber(booking.customerId);
    if (!phone) throw new BookingNoCustomerPhoneError(input.bookingId);

    this.afterResponse(
      this.charge
        .execute({
          bookingId: input.bookingId,
          maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
          // No cooldown for a press: `at` makes the predicate "not attempted
          // since now", which every row satisfies.
          notAttemptedSince: at,
        })
        // A charge that fails after the response has nobody to tell. The
        // booking keeps its window and the sweep keeps its bound; this line
        // exists so the failure is one log line rather than an unhandled
        // rejection in the Worker.
        .catch((e: unknown) => console.error("[booking] a customer-initiated charge failed", { bookingId: input.bookingId, e })),
    );
  }
}
```

If Task 10's answer was "background work does not survive", replace the `afterResponse` block with a call clearing `last_charge_attempt_at` on the row and add a `BookingRepositoryPort` method for it; keep every check above unchanged.

Wire it in `bootstrap/index.ts`. `afterResponse` is supplied by the composition root: in the api worker it is `c.executionCtx.waitUntil.bind(c.executionCtx)`; in tests it is a function that awaits inline.

- [ ] **Step 5: Add the mutation**

```ts
/**
 * Push the payment prompt at the customer's handset now, rather than waiting
 * for the sweep's next tick. Returns as soon as the prompt is on its way: the
 * gateway blocks for up to 110 seconds and nobody may watch that.
 */
export const payBooking = defineMutation({
  input: zodSchema(z.object({ bookingId: z.string().min(1) })),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Pay your own booking now", tags: ["Booking"] },
});
```

Add `pay: payBooking` to `bookingWriteSchema`, and a handler shaped like `booking.cancel`'s. In `apps/backend/api/src/graphql/private.ts`, pass the request's `executionCtx.waitUntil` into the booking bootstrap where the composition root builds it.

- [ ] **Step 6: Run the tests**

```bash
cd packages/backend && bunx vitest run src/modules/ntizo/bounded-contexts/booking src/modules/ntizo/write/booking
cd ../.. && bun run check-types && cd apps/backend/api && bunx vitest run
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A packages/backend apps/backend/api
git commit -m "$(cat <<'EOF'
feat(booking): booking.pay, and the question nobody was asked

Five cheap refusals the customer can act on, then the gateway call handed to
the background because it blocks for up to 110 seconds. The phone check is the
point: a customer without a number used to burn three attempts in silence and
have their provider told they did not pay.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WJL2JCeKxUTv5mFvtJWzft
EOF
)"
```

---

### Task 12: Paying, on the page

**Files:**
- Create: `apps/frontend/web/src/features/bookings/ui/pay-dialog.tsx`
- Modify: `apps/frontend/web/src/features/bookings/data/booking.repository.ts`
- Modify: `apps/frontend/web/src/features/bookings/viewmodel/use-my-bookings.ts`
- Modify: `apps/frontend/web/src/features/bookings/ui/{bookings-page,booking-page}.tsx`
- Modify: the eight `bookings.json` files
- Test: `apps/frontend/web/src/features/bookings/ui/__tests__/pay-dialog.test.tsx`

**Interfaces:**
- Consumes: `bookingPay` (Task 11), `userUpdateMe` (existing), `myBookingQueries.detail` (Task 4).
- Produces: `payBooking(bookingId)`; `usePayBooking()`; `PayDialog`.

- [ ] **Step 1: Write the failing test**

```tsx
describe("PayDialog", () => {
  it("tells the customer to confirm on their handset, with the masked number", async () => {
    render(<PayDialog booking={pendingPayment()} phone="+258849994567" onClose={noop} />);
    await waitFor(() => expect(screen.getByText(/Confirme no seu telemóvel/)).toBeInTheDocument());
    expect(screen.getByText(/\+258 84 ••• 45 67/)).toBeInTheDocument();
  });

  // The failure the whole flow was built around.
  it("asks for the number when the mutation says there is none", async () => {
    paySpy.mockRejectedValueOnce(graphqlError("BOOKING_NO_CUSTOMER_PHONE"));
    render(<PayDialog booking={pendingPayment()} phone={null} onClose={noop} />);
    expect(await screen.findByLabelText("Número de telemóvel")).toBeInTheDocument();
  });

  it("saves the number and pays, in that order", async () => {
    paySpy.mockRejectedValueOnce(graphqlError("BOOKING_NO_CUSTOMER_PHONE"));
    render(<PayDialog booking={pendingPayment()} phone={null} onClose={noop} />);
    await userEvent.type(await screen.findByLabelText("Número de telemóvel"), "849994567");
    await userEvent.click(screen.getByRole("button", { name: "Guardar e pagar" }));
    await waitFor(() => expect(saveProfileSpy).toHaveBeenCalled());
    expect(paySpy).toHaveBeenCalledTimes(2);
  });

  it("stops polling and closes once the booking is confirmed", async () => {
    detailSpy.mockResolvedValueOnce(pendingPayment()).mockResolvedValue(confirmedBooking());
    const onClose = vi.fn();
    render(<PayDialog booking={pendingPayment()} phone="+258849994567" onClose={onClose} />);
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 10_000 });
  });

  it("says the window closed rather than spinning for ever", async () => {
    render(<PayDialog booking={pendingPayment({ expiresAt: PAST })} phone="+258849994567" onClose={noop} />);
    expect(await screen.findByText(/O prazo terminou/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bunx vitest run src/features/bookings/ui/__tests__/pay-dialog.test.tsx
```
Expected: FAIL — no such module.

- [ ] **Step 3: Build it**

The repository gains `payBooking(bookingId)` shaped like `cancelBooking`. The viewmodel gains `usePayBooking()`, invalidating `["bookings"]` on success.

`PayDialog` opens by calling the mutation. Three states:

- **waiting** — the mockup's copy, the masked number, and a poll: re-read `myBookingQueries.detail(bookingId)` every three seconds while the dialog is open. Use `refetchInterval` on the query and stop it (`refetchInterval: false`) once the status leaves `PENDING_PAYMENT` or `deadlineOf` is behind us. On `CONFIRMED`, close and let the invalidation redraw the page.
- **needs a number** — reached when the mutation refuses with `BOOKING_NO_CUSTOMER_PHONE`. One field, the hint from the mockup naming the amount, and "Guardar e pagar", which saves through the existing profile mutation and then calls pay again.
- **over** — the window closed while the dialog was open, or the mutation refused with `BOOKING_PAYMENT_WINDOW_CLOSED` or `BOOKING_CHARGE_ATTEMPTS_SPENT`. Each gets its own sentence; none of them spins.

Mask the number by keeping the country code, the first two digits and the last four: `+258 84 ••• 45 67`.

- [ ] **Step 4: Run the tests**

```bash
cd apps/frontend/web && bunx vitest run src/features/bookings
cd ../../.. && bun run check-types && bun run lint
```
Expected: PASS; lint clean apart from warnings that predate this branch.

- [ ] **Step 5: Commit**

```bash
git add -A apps/frontend/web
git commit -m "$(cat <<'EOF'
feat(bookings): pay from the page, and be asked for the number first

The button asks the server to push the M-Pesa prompt and the page follows the
booking until it is confirmed. A missing number is a question rather than
three silently spent attempts, and every ending — paid, window closed,
attempts spent — has its own sentence instead of a spinner.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WJL2JCeKxUTv5mFvtJWzft
EOF
)"
```

---

### Task 13: End to end, and the gates

**Files:**
- Create: `apps/e2e/tests/customer-bookings.spec.ts`
- Modify: `docs/superpowers/follow-ups.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a passing branch.

- [ ] **Step 1: Write the spec**

```ts
test("a customer sees the booking they made, and can call it off", async ({ page }) => {
  await signInAsCustomer(page);
  const bookingId = await bookAService(page);

  await page.goto("/bookings");
  await page.waitForLoadState("networkidle");
  const row = page.getByRole("row", { name: new RegExp(SERVICE_NAME) });
  await expect(row).toBeVisible();
  await expect(row.getByText("À espera do prestador")).toBeVisible();

  await row.getByRole("link", { name: SERVICE_NAME }).click();
  await expect(page.getByText("Pedido enviado")).toBeVisible();

  await page.getByRole("button", { name: "Cancelar reserva" }).click();
  await page.getByRole("button", { name: "Cancelar reserva" }).last().click();

  await page.goto("/bookings?tab=history");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("row", { name: new RegExp(SERVICE_NAME) }).getByText("Cancelada")).toBeVisible();
});
```

Reuse the existing sign-in and booking helpers rather than writing new ones; read `apps/e2e/tests/` first. Paying is deliberately not covered: it needs the M-Pesa sandbox in the loop, and the spec says so.

Do not call `resetDb()` from the spec — globalSetup already resets once, and a second reset drops schemas out from under specs running in parallel.

- [ ] **Step 2: Run it**

```bash
docker run --rm -d --name ntizo-e2e-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ntizo_e2e -p 55432:5432 postgres:16-alpine
bun run e2e
```
Expected: PASS. Stop the container afterwards.

- [ ] **Step 3: Run every gate**

```bash
bun run check-types
bun run lint
cd packages/shared && bunx vitest run
cd ../frontend && bunx vitest run
cd ../backend && bunx vitest run
cd ../../apps/frontend/web && bunx vitest run
cd ../../backend/api && bunx vitest run
```
Expected: all pass. `apps/backend/api` needs `.env`; copy it from the main working tree if this worktree has none. If the backend suite fails only in `communication`, check whether the shared dev database is ahead of this branch before reporting it as a break — it has happened twice.

- [ ] **Step 4: Record what this leaves behind**

Append to `docs/superpowers/follow-ups.md`, numbering from the current highest:

- The three notification types with no email template, if `PROVIDER_BOOKING_CANCELLED_BY_CUSTOMER` is still in-app only — cross-reference #146 rather than duplicating it.
- Whatever the spec's remaining open questions became.
- The unbounded growth of `["bookings"]` invalidation if the customer's other pages later share the key.
- Anything a task's implementer flagged and did not fix.

- [ ] **Step 5: Commit**

```bash
git add -A apps/e2e docs
git commit -m "$(cat <<'EOF'
test(bookings): book it, see it, call it off

End to end over the customer's own page. Paying is not covered: it needs the
M-Pesa sandbox in the loop.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WJL2JCeKxUTv5mFvtJWzft
EOF
)"
```

---

## Self-review

**Spec coverage.** Every section of the design has a task: the customer-safe model and `paidAt` (Task 1); the three tabs and their buckets, drafts excluded (Tasks 2, 4); the page and detail read models and the timeline's new home (Tasks 1, 3); the list, detail, empty state and the mockup's copy (Tasks 4, 5, 6); cancel, its rule and its notification (Tasks 7, 8, 9); pay, the non-blocking push, the phone question and the polling (Tasks 10, 11, 12); the business rules as tests throughout; the testing section (Tasks 1–13); the phasing order (Tasks 4 and 6 before 9 and 12). The spec's "explicitly out of scope" list is not implemented anywhere, which is correct.

**Two decisions this plan makes that the spec left open.** `timelineOf` is lifted into its own module rather than duplicated, because two audiences now read it. `BookingListRow` gains no `customerId`; the detail projection passes the caller's id into the timeline helper instead, since the row is fetched through a `WHERE` on exactly that value.

**Type consistency.** `CustomerBookingTab` is the tab type everywhere, from the shared enum through the port's `CustomerListFilter` to the route's `validateSearch`. `CUSTOMER_TAB_STATUSES` is the backend's map and `STATUS_TONE` the frontend's; neither is the other. `customerBookingPageReadModel.items` (not `rows`) matches the provider's page model and the repository's query document.

**One thing an implementer will hit.** After Task 1 removes the commission from `BookingListRow`, the projections in Task 3 no longer compile against Task 2's changed signatures. Task 2's step 5 says so and permits landing Task 3's projection edit early rather than leaving the branch red.
