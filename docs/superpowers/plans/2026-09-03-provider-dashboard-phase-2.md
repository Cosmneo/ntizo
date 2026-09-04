# Provider Dashboard — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Visão geral" stops showing six hardcoded zeros and becomes the provider's dashboard: what needs an answer, what is coming, what the last thirty days earned, drawn from one new aggregate read.

**Architecture:** Onion Lasagna, by the book, on top of phase 1. The read side gains one more provider-scoped projection (`bookingStatsForProvider`) over the same `booking` table the list already reads — a single row of `count(*) filter` / `sum(...) filter` aggregates plus two grouped day series, with the day boundaries resolved in Postgres against `provider.timezone`. The web app gains a stats query in the existing `features/provider/bookings` data layer, a pure chart-geometry module and a rewritten page in `features/provider/{domain,ui}`, plus one shared-component change so a table can be shown without a search box.

**Tech Stack:** Bun, TypeScript, `@cosmneo/onion-lasagna@1.0.0-beta.3` (GraphQL field kit), Drizzle + Postgres (named schemas), Zod read models in `@ntizo/shared`, React 19 + TanStack Start/Router/Query, react-i18next, Vitest (web) and `bun:test` (backend).

**Spec:** `docs/superpowers/specs/2026-09-02-provider-bookings-and-dashboard-design.md` — phase 2 only ("Visão geral"). Phase 1 ("Reservas") shipped on 2026-09-03 and is on `dev`; this plan builds on it and changes three of its files deliberately (the port's tab union, the web repository's page input, the sidebar badge's source).

## Global Constraints

- **Revenue is the provider's share, never the listed price** (BR-P5): `Σ (priceMinor − commissionMinor)`, over `COMPLETED` in the window by `completedAt`; the pipeline is the same share over `CONFIRMED` with `startsAt ≥ now`. A dashboard that showed the gross would show money the provider does not receive.
- **The window is thirty local days, inclusive of today.** Its first instant is the start of the day 29 days before the provider's today, in `provider.timezone` — the same boundary for the sums and for the chart, so the card and the chart cannot disagree.
- **Day boundaries are Postgres's, not JavaScript's.** `date_trunc('day', $now at time zone p.timezone)`; the repository never computes a local midnight in JS.
- **`perDay` is always exactly 30 entries**, oldest first, zero-filled — a chart with holes lies about the shape. Enforced by the read model (`.length(STATS_WINDOW_DAYS)`).
- **A "request" is the `submitted_by_customer` change row, not a row's `created_at`** — an abandoned checkout is not a request, the same rule phase 1's `askedOfProvider()` enforces on the list.
- **No chart library, no new dependencies.** The chart is inline SVG.
- **Chart palette (validated, do not substitute):** requests `var(--color-primary)`; confirmed `#12a05f`, declared as a scoped `--chart-confirmed` custom property. `#12a05f` and not the `--color-success` token (`#21b872`) because the token fails `scripts/validate_palette.js` twice — light-mode contrast 2.57:1 against white (below the 3:1 floor) and OKLCH L 0.692 against the dark band's 0.48–0.67 ceiling. `#12a05f` passes both modes (light surface `#ffffff`, dark surface `#10141d`). Its tritan separation from the primary blue is ΔE 5.5–6.2, in the floor band, which is **legal only with secondary encoding**: the legend is always present, both series are direct-labelled with their totals, and adjacent bars carry a 2px surface gap. All three are required, not optional.
- **The chart ships a `sr-only` table** of the same thirty days. It is the accessibility path and the contrast relief; the SVG itself is `aria-hidden`.
- **No accent rule before uppercase labels, anywhere** (owner's rule, 2026-09-02). Section captions are `type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase` and nothing else.
- **All eight locales** (`en-US pt-PT pt-MZ es-ES de-DE fr-FR it-IT nl-NL`) get every new key; `shared/lib/__tests__/i18n-parity.test.ts` and `shared/locales/__tests__/locales.test.ts` fail otherwise. Spanish is the **tú** register, French **vous**, German **Sie**, Italian **tu**, Dutch **je** — the convention the existing files hold.
- **Layering:** `ui` may import `domain`, `viewmodel`, other `ui` and `@/shared/**`, and never `data`. `packages/shared` tests import from `"vitest"` (the package's runner), never `bun:test`.
- **Backend tests:** `bun test <path>` from `packages/backend`. The repository test hits the dev database (`openDevDbConnection`); everything else uses fakes.
- **Web tests:** `bun run vitest run <path>` from `apps/frontend/web`; `bun run typecheck`; `bun run lint` (0 errors; one pre-existing warning in `features/onboarding/viewmodel/use-onboarding.ts` is known and not yours).
- **Commits:** end every message with the two trailers this session uses (`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01LDSCKXSpinPNUzrMsZwvvT`). Wrap git writes in the retry loop below — another process on this machine creates `.git/index.lock` intermittently:

```bash
g() { local i; for i in 1 2 3 4 5 6; do git "$@" && return 0; sleep 1; done; return 1; }
```

---

## File map

**`packages/shared`**
- Modify `src/read-models/system/booking/provider-booking.schema.ts` — `STATS_WINDOW_DAYS`, `providerBookingStatsDayReadModel`, `providerBookingStatsReadModel`, their types.
- Modify `src/read-models/system/booking/__tests__/provider-booking.schema.test.ts`.

**`packages/backend/src/modules/ntizo`**
- Modify `read/booking/app/ports/outbound/booking-read.repository.port.ts` — `ProviderListTab` gains `"all"`; `ProviderStatsRow`, `ProviderStatsDayRow`, `ProviderStats`, `statsForProvider`.
- Modify `read/booking/infra/repositories/drizzle/booking-read.repository.ts` — the `all` tab in `providerWhere`/`providerOrder`; `statsForProvider`.
- Create `read/booking/app/use-cases/get-provider-stats.projection.ts` — `GetProviderStatsProjection`, `fillDays`.
- Modify `read/booking/graphql/schema/queries.ts`, `read/booking/graphql/handlers/queries.handlers.ts`, `read/booking/bootstrap/index.ts`.
- Modify `read/booking/__tests__/provider-bookings.repository.test.ts`, `provider-bookings.projection.test.ts`, `queries.handlers.test.ts`.
- Modify `shared/infrastructure/database/booking/schemas/booking-change.schema.ts` — one index; new migration `0037_*.sql`.
- Modify `shared/infrastructure/database/__tests__/booking-constraints.test.ts` — the catalogue assertion for that index.

**`apps/frontend/web/src`**
- Modify `features/provider/bookings/domain/status.ts` — `ProviderQueryTab`, `RECENT_BOOKINGS_LIMIT`.
- Modify `features/provider/bookings/data/booking.repository.ts` — `stats`, the `limit` on `page`.
- Modify `features/provider/bookings/viewmodel/use-provider-bookings.ts` — `useProviderStats`, `useRecentBookings`, `useAwaitingCount` re-pointed.
- Create `features/provider/bookings/ui/booking-row.tsx` — `bookingColumns`, `bookingRow` (shared by the list and the dashboard); modify `features/provider/bookings/ui/bookings-page.tsx` to use them.
- Create `features/provider/domain/activity-chart.ts` + `features/provider/domain/__tests__/activity-chart.test.ts`.
- Create `features/provider/domain/greeting.ts` (+ tests in the same file's `__tests__`).
- Create `features/provider/viewmodel/use-provider-rating.ts`.
- Modify `features/provider/ui/overview.tsx` — the page, rewritten; create `features/provider/ui/overview-chart.tsx`, `features/provider/ui/overview-cards.tsx`, `features/provider/ui/__tests__/overview.test.tsx`.
- Modify `shared/components/collection-card.tsx` — optional search, an `action` slot; modify its test.
- Modify `shared/locales/<8>/provider.json` — the `overview` block.

---

### Task 1: The stats read model

**Files:**
- Modify: `packages/shared/src/read-models/system/booking/provider-booking.schema.ts`
- Modify: `packages/shared/src/read-models/system/booking/__tests__/provider-booking.schema.test.ts`

**Interfaces:**
- Produces: `STATS_WINDOW_DAYS`, `providerBookingStatsDayReadModel`, `providerBookingStatsReadModel`, types `ProviderBookingStatsDayDTO`, `ProviderBookingStatsDTO`.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/provider-booking.schema.test.ts` (the file imports from `"vitest"` — keep that):

```ts
import {
  STATS_WINDOW_DAYS,
  providerBookingStatsReadModel,
} from "../provider-booking.schema";

const day = (date: string) => ({ date, requests: 0, confirmed: 0 });
const thirtyDays = Array.from({ length: STATS_WINDOW_DAYS }, (_, i) =>
  day(`2026-08-${String(i + 5).padStart(2, "0")}`),
);

const stats = {
  awaitingResponse: 3,
  awaitingPayment: 1,
  upcomingToday: 2,
  upcomingWeek: 5,
  completedLast30: 9,
  declinedLast30: 1,
  revenueLast30Minor: 1_240_000,
  pipelineMinor: 630_000,
  currency: "MZN",
  perDay: thirtyDays,
};

describe("providerBookingStatsReadModel", () => {
  it("accepts a full month of numbers", () => {
    expect(providerBookingStatsReadModel.parse(stats)).toEqual(stats);
  });

  it("insists on exactly thirty days — a chart with holes lies about the shape", () => {
    expect(() =>
      providerBookingStatsReadModel.parse({ ...stats, perDay: thirtyDays.slice(1) }),
    ).toThrow();
  });

  it("refuses a day that is not a plain date", () => {
    expect(() =>
      providerBookingStatsReadModel.parse({
        ...stats,
        perDay: [{ ...day("2026-08-05T00:00:00.000Z") }, ...thirtyDays.slice(1)],
      }),
    ).toThrow();
  });

  it("refuses money it cannot show — a negative payout is a bug upstream, not a number", () => {
    expect(() => providerBookingStatsReadModel.parse({ ...stats, revenueLast30Minor: -1 })).toThrow();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/shared && bun run vitest run src/read-models/system/booking/__tests__/provider-booking.schema.test.ts`
Expected: FAIL — `providerBookingStatsReadModel` is not exported.

- [ ] **Step 3: Add the read models**

Append to `provider-booking.schema.ts`:

```ts
/**
 * How many days the dashboard looks back, and how many buckets its chart has.
 * One constant because the window is one window: the revenue card and the
 * chart must be able to disagree about nothing.
 */
export const STATS_WINDOW_DAYS = 30;

/** One bucket of the chart. `date` is the provider's local day — `2026-09-03`, not an instant. */
export const providerBookingStatsDayReadModel = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Requests that reached the workspace that day, counted on the `submitted_by_customer` hop. */
  requests: z.number().int().min(0),
  /** Bookings confirmed that day — paid, not merely accepted. */
  confirmed: z.number().int().min(0),
});

/**
 * Everything the dashboard shows, in one read. The money fields are the
 * provider's share (`priceMinor − commissionMinor`), never the listed price:
 * the commission comes out of the payout, so a gross figure here would be a
 * number the provider never receives.
 */
export const providerBookingStatsReadModel = z.object({
  awaitingResponse: z.number().int().min(0),
  awaitingPayment: z.number().int().min(0),
  /** CONFIRMED starting today, in the workspace's own timezone. */
  upcomingToday: z.number().int().min(0),
  /** CONFIRMED starting between today's first instant and seven days later; `upcomingToday` is a subset. */
  upcomingWeek: z.number().int().min(0),
  completedLast30: z.number().int().min(0),
  declinedLast30: z.number().int().min(0),
  revenueLast30Minor: z.number().int().min(0),
  /** Confirmed and still ahead: money that is coming if nothing goes wrong. */
  pipelineMinor: z.number().int().min(0),
  currency: z.string().min(1),
  /** Oldest first, zero-filled, always `STATS_WINDOW_DAYS` long. */
  perDay: z.array(providerBookingStatsDayReadModel).length(STATS_WINDOW_DAYS),
});

export type ProviderBookingStatsDayDTO = z.infer<typeof providerBookingStatsDayReadModel>;
export type ProviderBookingStatsDTO = z.infer<typeof providerBookingStatsReadModel>;
```

- [ ] **Step 4: Run the package's suite**

Run: `cd packages/shared && bun run test && bun run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
g add packages/shared/src/read-models/system/booking
g commit -m "feat(shared): the provider dashboard's numbers, and the thirty days behind them"
```

---

### Task 2: The fourth tab — `all`, for "Reservas recentes"

**Files:**
- Modify: `packages/backend/src/modules/ntizo/read/booking/app/ports/outbound/booking-read.repository.port.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/infra/repositories/drizzle/booking-read.repository.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/graphql/schema/queries.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/__tests__/provider-bookings.repository.test.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/__tests__/queries.handlers.test.ts`

**Interfaces:**
- Produces: `ProviderListTab` = `"requests" | "upcoming" | "history" | "all"`; the wire enum gains `"all"`.
- Consumes: phase 1's `providerWhere`, `providerOrder`, `askedOfProvider`.

The dashboard's recent table is "the eight newest bookings, whatever state they are in". The three list tabs are each a state, so none of them answers it; a fourth value does, and it stays off the list page — `PROVIDER_TABS` in the web domain keeps its three, and only the query type widens.

- [ ] **Step 1: Write the failing tests**

In `provider-bookings.repository.test.ts`, beside the existing tab tests:

```ts
test("the all tab returns every booking the provider was asked about, newest first", async () => {
  const rows = await readRepo.listForProvider(providerId, { tab: "all", q: null, memberId: null, now }, 20, 0);
  const ids = rows.map((r) => r.id);
  expect(ids).toContain(awaitingId);
  expect(ids).toContain(confirmedPastId);
  expect(ids).toContain(confirmedFutureId);
  // Never the drafts, submitted or not — the same rule the three tabs keep.
  expect(ids).not.toContain(draftId);
  expect(ids).not.toContain(expiredDraftId);
  // Newest first, by creation.
  const created = rows.map((r) => r.createdAt.getTime());
  expect([...created].sort((a, b) => b - a)).toEqual(created);
});

test("counting the all tab agrees with listing it", async () => {
  const filter = { tab: "all", q: null, memberId: null, now } as const;
  const [rows, total] = await Promise.all([
    readRepo.listForProvider(providerId, filter, 50, 0),
    readRepo.countForProvider(providerId, filter),
  ]);
  expect(total).toBe(rows.length);
});
```

In `queries.handlers.test.ts`, extend the tab-enum test:

```ts
it("takes the tab as one of four words", () => {
  expect(() => shape(listProviderBookings).parse({ providerId: "p", tab: "everything" })).toThrow();
  for (const tab of ["requests", "upcoming", "history", "all"]) {
    expect(shape(listProviderBookings).parse({ providerId: "p", tab })).toMatchObject({ tab });
  }
});
```

(`shape(...)` is whatever accessor that file already uses to reach the zod schema behind a field — reuse it verbatim, do not invent a second one.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking`
Expected: FAIL — `"all"` is not assignable to `ProviderListTab`; the enum rejects it.

- [ ] **Step 3: Widen the port**

In `booking-read.repository.port.ts`:

```ts
/**
 * The three the list page draws, plus one the dashboard reads: `all` is every
 * booking the workspace was asked about, newest first. It is not a tab — no
 * screen offers it as a choice — but it is the same query with the status
 * clause dropped, so it lives here rather than in a second method.
 */
export type ProviderListTab = "requests" | "upcoming" | "history" | "all";

/** The statuses each *tab* lists. `all` is absent on purpose: it filters on no status at all. */
export const PROVIDER_TAB_STATUSES: Record<Exclude<ProviderListTab, "all">, readonly string[]> = {
  // …unchanged…
};
```

- [ ] **Step 4: Teach the repository the tab**

In `booking-read.repository.ts`, `providerWhere`'s tab clause becomes:

```ts
  const byTab =
    filter.tab === "all"
      ? undefined
      : filter.tab === "requests"
        ? inArray(booking.status, [...PROVIDER_TAB_STATUSES.requests])
        : filter.tab === "upcoming"
          ? and(live, gte(booking.startsAt, filter.now))
          : or(inArray(booking.status, [...PROVIDER_TAB_STATUSES.history]), and(live, lt(booking.startsAt, filter.now)));
```

and `providerOrder`:

```ts
function providerOrder(tab: ProviderListFilter["tab"]) {
  // `all` orders like `requests` — both answer "what happened lately".
  if (tab === "requests" || tab === "all") return [desc(booking.createdAt), desc(booking.id)];
  if (tab === "upcoming") return [asc(booking.startsAt), asc(booking.id)];
  return [desc(booking.startsAt), desc(booking.id)];
}
```

`live` is the existing `inArray(booking.status, [...PROVIDER_TAB_STATUSES.upcoming])` binding; leave it where it is.

- [ ] **Step 5: Widen the wire**

In `graphql/schema/queries.ts`, `listProviderBookings`'s input:

```ts
      tab: z.enum(["requests", "upcoming", "history", "all"]),
```

- [ ] **Step 6: Run the module's tests and the typecheck**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking && bun run typecheck`
Expected: PASS. The `Record<Exclude<…>>` change makes any forgotten `PROVIDER_TAB_STATUSES.all` a compile error rather than an `undefined` spread.

- [ ] **Step 7: Commit**

```bash
g add packages/backend/src/modules/ntizo/read/booking
g commit -m "feat(booking-read): an 'all' tab for the dashboard's recent bookings"
```

---

### Task 3: An index for the change log

**Files:**
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/booking/schemas/booking-change.schema.ts`
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/migrations/0037_*.sql` (drizzle-kit names it)
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/booking-constraints.test.ts`

`booking_change` carries no index at all. Phase 1 put a correlated `EXISTS` on it in front of every provider list query, and Task 4 below groups it by day for the chart; both scan the whole append-only log today. Postgres does not index foreign keys for you.

- [ ] **Step 1: Write the failing catalogue test**

`booking-constraints.test.ts` already reads `pg_indexes` for the booking table's indexes — copy that test's shape exactly and add:

```ts
test("booking_change is indexed by the booking and the reason the provider reads", async () => {
  const rows = await db.execute(
    sql`select indexname from pg_indexes where schemaname = 'ntizo_booking' and tablename = 'booking_change'`,
  );
  const names = rows.map((r) => String(r["indexname"]));
  expect(names).toContain("booking_change_booking_reason_idx");
});
```

(Use the file's own `db.execute` / result-shape idiom; if it uses `openDevDbConnection` and a `sql` import, follow that.)

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/booking-constraints.test.ts`
Expected: FAIL — the index does not exist.

- [ ] **Step 3: Declare the index**

In `booking-change.schema.ts`, add to the table's extras array (beside the existing check constraint), with `index` imported from `drizzle-orm/pg-core`:

```ts
    // Two readers scan this table by booking: the provider list's
    // `askedOfProvider()` EXISTS (one correlated lookup per candidate row) and
    // the dashboard's per-day requests series (`reason = 'submitted_by_customer'`
    // over thirty days). Postgres does not index a foreign key on its own, so
    // both were sequential scans of an append-only log that only grows.
    // `reason` is the second column because both readers filter on it after
    // the id, and it lets the EXISTS answer from the index alone.
    index("booking_change_booking_reason_idx").on(t.bookingId, t.reason),
```

- [ ] **Step 4: Generate and apply the migration**

```bash
cd packages/backend
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
bun run db:ntizo:generate      # writes migrations/0037_<name>.sql + updates meta/_journal.json
bun run db:ntizo:dev:migrate   # applies it to the shared dev database
```

Read the generated SQL before applying: it must contain exactly one `CREATE INDEX` and nothing else. If drizzle-kit emits anything besides that index (a stray column change from another branch's schema drift), stop and report — do not apply it.

- [ ] **Step 5: Run the test and the booking suite**

Run: `cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/booking-constraints.test.ts && bun test src/modules/ntizo/read/booking`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
g add packages/backend/src/modules/ntizo/shared/infrastructure/database packages/backend/src/modules/ntizo/shared/infrastructure/migrations
g commit -m "perf(booking): index the change log by booking and reason"
```

---

### Task 4: `statsForProvider` — one row of aggregates and two day series

**Files:**
- Modify: `packages/backend/src/modules/ntizo/read/booking/app/ports/outbound/booking-read.repository.port.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/infra/repositories/drizzle/booking-read.repository.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/__tests__/provider-bookings.repository.test.ts`

**Interfaces:**
- Produces: `ProviderStatsRow`, `ProviderStatsDayRow`, `ProviderStats`, and on the port `statsForProvider(providerId: string, now: Date): Promise<ProviderStats>`.

- [ ] **Step 1: Add the row types and the port method**

Append to `booking-read.repository.port.ts`:

```ts
/** The dashboard's numbers, before the projection shapes them. `currency` and `today` are null-safe on the projection's side, not here. */
export interface ProviderStatsRow {
  awaitingResponse: number;
  awaitingPayment: number;
  upcomingToday: number;
  upcomingWeek: number;
  completedLast30: number;
  declinedLast30: number;
  revenueLast30Minor: number;
  pipelineMinor: number;
  /** The currency of this workspace's most recent booking; null when it has none. */
  currency: string | null;
  /** The provider's local day for `now`, `YYYY-MM-DD` — the last bucket of the chart. */
  today: string;
}

/** One local day with something in it. Days with nothing are absent — the projection fills them. */
export interface ProviderStatsDayRow {
  date: string;
  requests: number;
  confirmed: number;
}

export interface ProviderStats {
  totals: ProviderStatsRow;
  perDay: ProviderStatsDayRow[];
}
```

And inside `BookingReadRepositoryPort`:

```ts
  /**
   * Every number the dashboard shows, for one workspace, as of `now`. Day
   * boundaries are the workspace's own (`provider.timezone`), resolved in
   * Postgres — a "today" computed in the Worker's UTC would be wrong for two
   * hours a day in Maputo and wrong for half of one in a DST market.
   */
  statsForProvider(providerId: string, now: Date): Promise<ProviderStats>;
```

- [ ] **Step 2: Write the failing repository test (dev database)**

The file already builds a workspace with `awaitingId`, `confirmedPastId` (a 2020 slot, walked submit → accept → markPaid), `confirmedFutureId` (a 2027 slot, same walk), `draftId` and `expiredDraftId`. Add one more fixture beside them — a booking that was completed inside the window — and the tests:

```ts
// A booking completed inside the window, priced 80 000 with 8 000 of
// commission, so the provider's share of it is exactly 72 000.
const completedId = crypto.randomUUID();

// …in beforeAll, beside the other fixtures. The aggregate has no `complete()`
// transition in phase 1 (it is the follow-up the phase recorded), so this
// fixture is written the way the other tests write a state the commands cannot
// reach: build the booking through `Booking.create` + `submit` + `accept` +
// `markPaid` and `writeRepo.save` it exactly as `confirmedPastId` is built,
// then move the row to COMPLETED with one direct update through the test's own
// connection:
await db
  .update(booking)
  .set({ status: "COMPLETED", completedAt: new Date(Date.now() - 2 * 86_400_000) })
  .where(eq(booking.id, completedId));
```

If the file has no direct `db` handle, add one the way it opens `openDevDbConnection` for its other setup, and say in the report that the fixture is written rather than transitioned, with that reason.

```ts

describe("statsForProvider", () => {
  test("counts what is waiting, what is coming, and what has been done", async () => {
    const { totals } = await readRepo.statsForProvider(providerId, now);
    expect(totals.awaitingResponse).toBe(1);          // awaitingId
    expect(totals.upcomingWeek).toBe(0);              // the confirmed future slot is in 2027
    expect(totals.upcomingToday).toBe(0);
    expect(totals.completedLast30).toBe(1);           // completedId
    expect(totals.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(totals.currency).toBe("MZN");
  });

  test("revenue and pipeline are the provider's share, not the listed price", async () => {
    const { totals } = await readRepo.statsForProvider(providerId, now);
    // 80 000 − 8 000, the completed booking only.
    expect(totals.revenueLast30Minor).toBe(72_000);
    // The 2027 confirmed booking is still ahead, so it is pipeline.
    expect(totals.pipelineMinor).toBe(72_000);
  });

  test("a booking completed before the window is not in the thirty days", async () => {
    // `now` shifted a year forward puts `completedId` outside the window.
    const later = new Date(now.getTime() + 365 * 24 * 3_600_000);
    const { totals } = await readRepo.statsForProvider(providerId, later);
    expect(totals.completedLast30).toBe(0);
    expect(totals.revenueLast30Minor).toBe(0);
  });

  test("the day series buckets a request on the day it was submitted, in the workspace's timezone", async () => {
    const { totals, perDay } = await readRepo.statsForProvider(providerId, now);
    const today = perDay.find((d) => d.date === totals.today);
    // Every fixture was submitted in this test run, so today holds them all;
    // the drafts were never submitted and are in no bucket.
    expect(today?.requests).toBe(4);
    expect(perDay.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);
    // Only days with something in them come back from the repository.
    expect(perDay.length).toBeLessThanOrEqual(30);
  });

  test("another workspace's numbers are not this one's", async () => {
    const { totals } = await readRepo.statsForProvider(crypto.randomUUID(), now);
    expect(totals.awaitingResponse).toBe(0);
    expect(totals.revenueLast30Minor).toBe(0);
    expect(totals.currency).toBeNull();
  });
});
```

Adjust the expected counts to the fixtures the file actually holds when you run it — the assertions above assume the four submitted bookings (`awaitingId`, `confirmedPastId`, `confirmedFutureId`, `completedId`). What must not change is the shape: a share not a price, a window that excludes, a bucket keyed by the submit hop, and another workspace's zero.

- [ ] **Step 3: Run it to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking/__tests__/provider-bookings.repository.test.ts`
Expected: FAIL — `readRepo.statsForProvider is not a function`.

- [ ] **Step 4: Implement it**

Add to the class in `booking-read.repository.ts` (imports: `provider` is already imported; add `sum` is **not** needed — the sums go through `sql<string>`):

```ts
  async statsForProvider(providerId: string, now: Date): Promise<ProviderStats> {
    const db = getDb();

    // The workspace's own clock, read first and then bound as a parameter:
    // every window below is expressed in it, and a workspace with no bookings
    // still has to know what "today" means.
    const [row] = await db
      .select({ timezone: provider.timezone })
      .from(provider)
      .where(eq(provider.id, providerId))
      .limit(1);
    const timezone = row?.timezone ?? DEFAULT_TIMEZONE;

    // Postgres does the calendar. `at time zone` twice is not a typo: the
    // first turns the instant into the workspace's wall clock, the second
    // turns the truncated wall clock back into an instant to compare against
    // `timestamptz` columns.
    const dayStart = sql`(date_trunc('day', ${now}::timestamptz at time zone ${timezone})) at time zone ${timezone}`;
    const dayEnd = sql`(date_trunc('day', ${now}::timestamptz at time zone ${timezone}) + interval '1 day') at time zone ${timezone}`;
    const weekEnd = sql`(date_trunc('day', ${now}::timestamptz at time zone ${timezone}) + interval '7 days') at time zone ${timezone}`;
    const windowStart = sql`(date_trunc('day', ${now}::timestamptz at time zone ${timezone}) - interval '${sql.raw(String(STATS_WINDOW_DAYS - 1))} days') at time zone ${timezone}`;
    const localDate = (column: SQL | AnyColumn) =>
      sql<string>`to_char((${column} at time zone ${timezone})::date, 'YYYY-MM-DD')`;

    const totalsQuery = db
      .select({
        awaitingResponse: sql<number>`count(*) filter (where ${booking.status} = 'AWAITING_PROVIDER')::int`,
        awaitingPayment: sql<number>`count(*) filter (where ${booking.status} = 'PENDING_PAYMENT')::int`,
        upcomingToday: sql<number>`count(*) filter (where ${booking.status} = 'CONFIRMED' and ${booking.startsAt} >= ${dayStart} and ${booking.startsAt} < ${dayEnd})::int`,
        upcomingWeek: sql<number>`count(*) filter (where ${booking.status} = 'CONFIRMED' and ${booking.startsAt} >= ${dayStart} and ${booking.startsAt} < ${weekEnd})::int`,
        completedLast30: sql<number>`count(*) filter (where ${booking.status} = 'COMPLETED' and ${booking.completedAt} >= ${windowStart})::int`,
        declinedLast30: sql<number>`count(*) filter (where ${booking.status} = 'DECLINED' and ${booking.declinedAt} >= ${windowStart})::int`,
        // The provider's share, twice. `coalesce` because a workspace with no
        // completed work sums to null, and a dashboard does not show null.
        revenueLast30Minor: sql<number>`coalesce(sum(${booking.priceMinor} - ${booking.commissionMinor}) filter (where ${booking.status} = 'COMPLETED' and ${booking.completedAt} >= ${windowStart}), 0)::int`,
        pipelineMinor: sql<number>`coalesce(sum(${booking.priceMinor} - ${booking.commissionMinor}) filter (where ${booking.status} = 'CONFIRMED' and ${booking.startsAt} >= ${now}::timestamptz), 0)::int`,
        currency: sql<string | null>`max(${booking.currency})`,
      })
      .from(booking)
      // No `askedOfProvider()` guard: every status counted above is one a
      // booking can only reach through `submit`, so an abandoned checkout is
      // already outside all nine filters. The guard would cost a correlated
      // subquery per row to change nothing.
      .where(eq(booking.providerId, providerId));

    const requestsQuery = db
      .select({ date: localDate(bookingChange.changedAt), n: sql<number>`count(*)::int` })
      .from(bookingChange)
      .innerJoin(booking, eq(booking.id, bookingChange.bookingId))
      .where(
        and(
          eq(booking.providerId, providerId),
          eq(bookingChange.reason, SUBMITTED_BY_CUSTOMER),
          gte(bookingChange.changedAt, windowStart),
        ),
      )
      .groupBy(localDate(bookingChange.changedAt));

    const confirmedQuery = db
      .select({ date: localDate(booking.confirmedAt), n: sql<number>`count(*)::int` })
      .from(booking)
      .where(
        and(
          eq(booking.providerId, providerId),
          isNotNull(booking.confirmedAt),
          gte(booking.confirmedAt, windowStart),
        ),
      )
      .groupBy(localDate(booking.confirmedAt));

    const todayQuery = db.select({ today: localDate(sql`${now}::timestamptz`) }).from(sql`(select 1) as one`);

    const [totalsRows, requestRows, confirmedRows, todayRows] = await Promise.all([
      totalsQuery,
      requestsQuery,
      confirmedQuery,
      todayQuery,
    ]);

    const totals = totalsRows[0];
    const byDate = new Map<string, ProviderStatsDayRow>();
    for (const r of requestRows) {
      byDate.set(r.date, { date: r.date, requests: Number(r.n), confirmed: 0 });
    }
    for (const r of confirmedRows) {
      const hit = byDate.get(r.date);
      if (hit) hit.confirmed = Number(r.n);
      else byDate.set(r.date, { date: r.date, requests: 0, confirmed: Number(r.n) });
    }

    return {
      totals: {
        awaitingResponse: Number(totals?.awaitingResponse ?? 0),
        awaitingPayment: Number(totals?.awaitingPayment ?? 0),
        upcomingToday: Number(totals?.upcomingToday ?? 0),
        upcomingWeek: Number(totals?.upcomingWeek ?? 0),
        completedLast30: Number(totals?.completedLast30 ?? 0),
        declinedLast30: Number(totals?.declinedLast30 ?? 0),
        revenueLast30Minor: Number(totals?.revenueLast30Minor ?? 0),
        pipelineMinor: Number(totals?.pipelineMinor ?? 0),
        currency: totals?.currency ?? null,
        today: todayRows[0]?.today ?? new Date(now).toISOString().slice(0, 10),
      },
      perDay: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }
```

Notes for whoever writes this:
- `SUBMITTED_BY_CUSTOMER` is the literal `"submitted_by_customer"`. The write side declares its own constant in `submit-booking.command.ts`; **do not import it** (a read module importing a bounded context's `app/` tree is the boundary rule this codebase keeps). Declare a module-level `const SUBMITTED_BY_CUSTOMER = "submitted_by_customer";` beside `askedOfProvider()`, which already hardcodes the same token, and reuse it there too so the file states it once.
- `DEFAULT_TIMEZONE` is `"Africa/Maputo"` — the same default the `provider` table's column carries. Declare it as a module constant with that comment.
- `todayQuery` selects one row from a constant: if drizzle refuses `from(sql\`(select 1) as one\`)`, get the same string from the totals query instead by adding `today: localDate(sql\`${now}::timestamptz\`)` to its selection — an aggregate query always returns exactly one row, so a constant expression in it is safe even for a workspace with no bookings. Prefer whichever the type checker accepts and say which you used.
- `sql.raw` appears once, for the interval's day count, because Postgres will not take a bind parameter inside an interval literal. It interpolates `STATS_WINDOW_DAYS`, a number this repository owns — never anything from a request.
- Imports this method needs on top of what the file already has: `STATS_WINDOW_DAYS` from `@ntizo/shared/read-models`; `isNotNull` from `drizzle-orm`; the types `SQL` and `AnyColumn` from `drizzle-orm` (`AnyColumn` is already imported for the accent fold — check before adding it twice); `bookingChange` and `provider` are already imported for `timelineFor` and the joins.
- If the type checker fights `localDate`'s parameter union, give it two call sites' worth of type instead of one: `const localDate = (column: SQL<unknown> | AnyColumn) => …`, or inline the three `to_char(...)` expressions. The union is a convenience, not a contract.

- [ ] **Step 5: Run the repository test**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking/__tests__/provider-bookings.repository.test.ts`
Expected: PASS. If a `filter (where …)` clause fails to parse, the cause is almost always a missing space around an interpolation — print the generated SQL with `.toSQL()` and read it.

- [ ] **Step 6: Commit**

```bash
g add packages/backend/src/modules/ntizo/read/booking
g commit -m "feat(booking-read): the workspace's numbers, counted where the calendar is"
```

---

### Task 5: The stats projection

**Files:**
- Create: `packages/backend/src/modules/ntizo/read/booking/app/use-cases/get-provider-stats.projection.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/__tests__/provider-bookings.projection.test.ts`

**Interfaces:**
- Consumes: Task 4's `statsForProvider`, Task 1's `ProviderBookingStatsDTO`.
- Produces: `GetProviderStatsProjection.execute({ providerId, now }): Promise<ProviderBookingStatsDTO>`, `fillDays(today, rows)`, `DEFAULT_CURRENCY`.

- [ ] **Step 1: Write the failing test**

The file's `FakeRepo` implements the port; add `statsForProvider` to it and the tests:

```ts
import { GetProviderStatsProjection, fillDays } from "../app/use-cases/get-provider-stats.projection";
import type { ProviderStats } from "../app/ports/outbound/booking-read.repository.port";

const STATS: ProviderStats = {
  totals: {
    awaitingResponse: 3,
    awaitingPayment: 1,
    upcomingToday: 2,
    upcomingWeek: 5,
    completedLast30: 9,
    declinedLast30: 1,
    revenueLast30Minor: 1_240_000,
    pipelineMinor: 630_000,
    currency: "MZN",
    today: "2026-09-03",
  },
  perDay: [
    { date: "2026-09-01", requests: 2, confirmed: 1 },
    { date: "2026-09-03", requests: 4, confirmed: 3 },
  ],
};

// …in FakeRepo…
  async statsForProvider(providerId: string): Promise<ProviderStats> {
    this.calls.push(`stats:${providerId}`);
    return this.stats;
  }

describe("fillDays", () => {
  it("returns thirty days ending on the provider's today, oldest first", () => {
    const days = fillDays("2026-09-03", []);
    expect(days).toHaveLength(30);
    expect(days[0]!.date).toBe("2026-08-05");
    expect(days.at(-1)!.date).toBe("2026-09-03");
  });

  it("keeps the days that have something and zeroes the ones that do not", () => {
    const days = fillDays("2026-09-03", STATS.perDay);
    expect(days.at(-1)).toEqual({ date: "2026-09-03", requests: 4, confirmed: 3 });
    expect(days.find((d) => d.date === "2026-09-01")).toEqual({ date: "2026-09-01", requests: 2, confirmed: 1 });
    expect(days.find((d) => d.date === "2026-09-02")).toEqual({ date: "2026-09-02", requests: 0, confirmed: 0 });
  });

  it("drops a day the repository returned from outside the window rather than making thirty-one", () => {
    const days = fillDays("2026-09-03", [{ date: "2026-01-01", requests: 9, confirmed: 9 }]);
    expect(days).toHaveLength(30);
    expect(days.some((d) => d.date === "2026-01-01")).toBe(false);
  });
});

describe("GetProviderStatsProjection", () => {
  it("hands the numbers through and fills the chart", async () => {
    const repo = new FakeRepo();
    repo.stats = STATS;
    const dto = await new GetProviderStatsProjection(repo).execute({
      providerId: "prov-1",
      now: new Date("2026-09-03T10:00:00.000Z"),
    });
    expect(repo.calls).toEqual(["stats:prov-1"]);
    expect(dto.revenueLast30Minor).toBe(1_240_000);
    expect(dto.perDay).toHaveLength(30);
    expect(dto.perDay.at(-1)).toEqual({ date: "2026-09-03", requests: 4, confirmed: 3 });
  });

  it("names a currency for a workspace that has never been booked", async () => {
    const repo = new FakeRepo();
    repo.stats = { totals: { ...STATS.totals, currency: null }, perDay: [] };
    const dto = await new GetProviderStatsProjection(repo).execute({
      providerId: "prov-1",
      now: new Date("2026-09-03T10:00:00.000Z"),
    });
    expect(dto.currency).toBe("MZN");
    expect(dto.perDay.every((d) => d.requests === 0 && d.confirmed === 0)).toBe(true);
  });
});
```

Give `FakeRepo` a public `stats: ProviderStats` field defaulting to a zeroed value so the existing tests keep constructing it unchanged.

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking/__tests__/provider-bookings.projection.test.ts`
Expected: FAIL — cannot find `../app/use-cases/get-provider-stats.projection`.

- [ ] **Step 3: Write the projection**

```ts
// packages/backend/src/modules/ntizo/read/booking/app/use-cases/get-provider-stats.projection.ts
import {
  STATS_WINDOW_DAYS,
  type ProviderBookingStatsDTO,
  type ProviderBookingStatsDayDTO,
} from "@ntizo/shared/read-models";
import type {
  BookingReadRepositoryPort,
  ProviderStatsDayRow,
} from "../ports/outbound/booking-read.repository.port";

/** What a workspace that has never taken a booking is priced in. The launch market's, and the `booking` column's own default. */
const DEFAULT_CURRENCY = "MZN";

const DAY_MS = 86_400_000;

/**
 * Thirty buckets ending on the provider's today, oldest first, with the days
 * nobody booked drawn as zeros.
 *
 * The arithmetic is on bare dates anchored at midnight UTC, which is not the
 * workspace's midnight and does not need to be: these strings were already
 * bucketed by Postgres in the workspace's zone, and stepping a `YYYY-MM-DD`
 * back one calendar day is the same operation in every zone. Doing it here
 * rather than with `generate_series` keeps a thirty-row loop out of the query
 * plan and makes the gap-filling testable without a database.
 */
export function fillDays(
  today: string,
  rows: readonly ProviderStatsDayRow[],
): ProviderBookingStatsDayDTO[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const end = Date.parse(`${today}T00:00:00.000Z`);
  const days: ProviderBookingStatsDayDTO[] = [];
  for (let back = STATS_WINDOW_DAYS - 1; back >= 0; back -= 1) {
    const date = new Date(end - back * DAY_MS).toISOString().slice(0, 10);
    const hit = byDate.get(date);
    days.push({ date, requests: hit?.requests ?? 0, confirmed: hit?.confirmed ?? 0 });
  }
  return days;
}

/**
 * The dashboard's one read. Everything it returns comes from a single
 * repository call, because a dashboard that fetched its cards one at a time
 * would show a workspace mid-blink: eight numbers from eight instants.
 */
export class GetProviderStatsProjection {
  constructor(private readonly repo: BookingReadRepositoryPort) {}

  async execute(input: { providerId: string; now: Date }): Promise<ProviderBookingStatsDTO> {
    const { totals, perDay } = await this.repo.statsForProvider(input.providerId, input.now);
    return {
      awaitingResponse: totals.awaitingResponse,
      awaitingPayment: totals.awaitingPayment,
      upcomingToday: totals.upcomingToday,
      upcomingWeek: totals.upcomingWeek,
      completedLast30: totals.completedLast30,
      declinedLast30: totals.declinedLast30,
      revenueLast30Minor: totals.revenueLast30Minor,
      pipelineMinor: totals.pipelineMinor,
      currency: totals.currency ?? DEFAULT_CURRENCY,
      perDay: fillDays(totals.today, perDay),
    };
  }
}
```

- [ ] **Step 4: Run the test**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking/__tests__/provider-bookings.projection.test.ts && bun run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
g add packages/backend/src/modules/ntizo/read/booking
g commit -m "feat(booking-read): the stats projection, and thirty days with no holes in them"
```

---

### Task 6: `bookingStatsForProvider` on the wire

**Files:**
- Modify: `packages/backend/src/modules/ntizo/read/booking/graphql/schema/queries.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/graphql/handlers/queries.handlers.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/bootstrap/index.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/__tests__/queries.handlers.test.ts`

**Interfaces:**
- Produces: wire field `bookingStatsForProvider(input: { providerId })` → `providerBookingStatsReadModel`; input type name `BookingStatsForProviderInput` (the kit capitalises the flattened field id and appends `Input`). Task 8 hardcodes both.

- [ ] **Step 1: Write the failing test**

In `queries.handlers.test.ts`:

```ts
it("mounts the dashboard's read beside the list's", () => {
  expect(Object.keys(bookingReadSchema.fields.booking).sort()).toEqual([
    "byId",
    "byIdForProvider",
    "forProvider",
    "mine",
    "statsForProvider",
  ]);
});

it("the stats read takes a workspace and nothing else", () => {
  expect(() => shape(getProviderStats).parse({})).toThrow();
  expect(shape(getProviderStats).parse({ providerId: "p1" })).toEqual({ providerId: "p1" });
});
```

The existing `assertMayReadWorkspace` tests already cover the guard itself; they do not need copying per field.

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking/__tests__/queries.handlers.test.ts`
Expected: FAIL — `getProviderStats` is not exported.

- [ ] **Step 3: Add the field**

In `graphql/schema/queries.ts`, import `providerBookingStatsReadModel` from `@ntizo/shared/read-models` and add:

```ts
/**
 * Every number the dashboard draws, for one workspace. No date range on the
 * input: the window is the spec's thirty days and the screen has no control
 * to change it, so a parameter would be a promise the UI does not keep.
 */
export const getProviderStats = defineQuery({
  input: zodSchema(z.object({ providerId: z.string().min(1) })),
  output: zodSchema(providerBookingStatsReadModel),
  docs: { summary: "A workspace's booking numbers", tags: ["Booking"] },
});
```

and in `bookingReadSchema`:

```ts
    booking: {
      mine: listMyBookings,
      byId: getMyBooking,
      forProvider: listProviderBookings,
      byIdForProvider: getProviderBooking,
      statsForProvider: getProviderStats,
    },
```

- [ ] **Step 4: Add the handler**

In `graphql/handlers/queries.handlers.ts`, after `booking.byIdForProvider`:

```ts
    .handle("booking.statsForProvider", async (args, ctx) => {
      await assertMayReadWorkspace(asNtizoGraphqlContext(ctx), args.input.providerId, uc.providerRead);
      return uc.statsForProvider.execute({ providerId: args.input.providerId, now: new Date() });
    })
```

- [ ] **Step 5: Wire the bootstrap**

In `bootstrap/index.ts`, import `GetProviderStatsProjection` and add to `useCases`:

```ts
      statsForProvider: new GetProviderStatsProjection(repo),
```

`apps/backend/api/src/graphql/private.ts` calls `createBookingReadHandlers({ bookingRead })` and needs no change — confirm with `grep -n "createBookingReadHandlers" apps/backend/api/src/graphql/private.ts` and say so in your report.

- [ ] **Step 6: Run the tests, the API's typecheck and its suite**

Run: `cd packages/backend && bun test src/modules/ntizo/read/booking && bun run typecheck`, then `cd ../../apps/backend/api && bun run typecheck && bun test src`
Expected: PASS; no type errors.

- [ ] **Step 7: Smoke it against a local API**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd apps/backend/api && bun run dev -- --port 8799   # any free port; do not kill another process's 8788
```

```bash
curl -s http://localhost:8799/graphql -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -d '{"query":"query($i: BookingStatsForProviderInput!){ bookingStatsForProvider(input:$i){ awaitingResponse } }","variables":{"i":{"providerId":"x"}}}'
```

Expected: an error with `extensions.originalCode` of `UNAUTHENTICATED` — which also proves the input type name. Report the exact name. Stop the server you started.

- [ ] **Step 8: Commit**

```bash
g add packages/backend/src/modules/ntizo/read/booking
g commit -m "feat(booking-read): bookingStatsForProvider, behind the same door as the list"
```

---

### Task 7: The dashboard's words, in eight languages

**Files:**
- Modify: `apps/frontend/web/src/shared/locales/<8>/provider.json`

Today `provider.json` holds a flat `"overview": "Visão geral"` used as a fallback page title, and a separate `nav.overview`. This task replaces the flat string with a block and leaves `nav.overview` alone. Confirm before editing that nothing but the overview page reads the flat key: `grep -rn 't("overview")' apps/frontend/web/src` must return only `features/provider/ui/overview.tsx`.

- [ ] **Step 1: Write the block (pt-MZ, verbatim)**

```json
"overview": {
  "greeting": {
    "morning": "Bom dia, {{name}}",
    "afternoon": "Boa tarde, {{name}}",
    "evening": "Boa noite, {{name}}"
  },
  "subtitle": "O que precisa de resposta, o que vem aí, e como correram os últimos 30 dias.",
  "seeBookings": "Ver reservas",
  "awaitingTitle": "Por responder",
  "awaitingAction": "Responder",
  "awaitingNone": "Nada à sua espera",
  "weekTitle": "Próximos 7 dias",
  "todayCount": "{{count}} hoje",
  "revenueTitle": "Receita (30 dias)",
  "pipeline": "+ {{amount}} por receber",
  "revenueHint": "Já descontada a comissão.",
  "ratingTitle": "Avaliação",
  "ratingCount": "{{count}} avaliações",
  "ratingNone": "Ainda sem avaliações",
  "seeReviews": "Ver avaliações",
  "chartTitle": "Pedidos e confirmações",
  "chartRange": "Últimos 30 dias",
  "chartRequests": "Pedidos",
  "chartConfirmed": "Confirmadas",
  "chartEmpty": "Sem actividade nos últimos 30 dias.",
  "chartTableDay": "Dia",
  "chartDayLabel": "{{date}}: {{requests}} pedidos, {{confirmed}} confirmadas",
  "recentTitle": "Reservas recentes",
  "recentAll": "Ver todas",
  "recentEmptyTitle": "Ainda sem reservas",
  "recentEmpty": "Quando um cliente pedir uma marcação, aparece aqui.",
  "servicesTitle": "Serviços",
  "servicesPublished": "{{count}} publicados",
  "servicesDraft": "{{count}} rascunhos",
  "servicesNone": "Ainda sem serviços",
  "servicesAction": "Gerir serviços",
  "messagesTitle": "Mensagens",
  "messagesUnread": "{{count}} por ler",
  "messagesNone": "Nada por ler",
  "messagesAction": "Abrir mensagens",
  "loadError": "Não foi possível carregar os números.",
  "retry": "Tentar de novo"
}
```

pt-PT is the same text.

- [ ] **Step 2: Translate for the other six**

en-US, es-ES (tú), fr-FR (vous), de-DE (Sie), it-IT (tu), nl-NL (je). Keep every key and every `{{placeholder}}` identical; keep the card titles short — they sit above a large number. The English is the parity test's reference, so write it first and translate from it. Examples to fix the register: en `"Good afternoon, {{name}}"`, `"Awaiting your answer"`, `"Next 7 days"`, `"Revenue (30 days)"`, `"+ {{amount}} to come"`; es `"Buenas tardes, {{name}}"`, `"Por responder"`, `"Próximos 7 días"`; fr `"Bon après-midi, {{name}}"`, `"En attente de réponse"`; de `"Guten Tag, {{name}}"`, `"Wartet auf Antwort"`; it `"Buon pomeriggio, {{name}}"`, `"In attesa di risposta"`; nl `"Goedemiddag, {{name}}"`, `"Wacht op antwoord"`.

- [ ] **Step 3: Run the parity tests**

Run: `cd apps/frontend/web && bun run vitest run src/shared/lib src/shared/locales`
Expected: PASS. A failure names the locale and the key that is missing.

- [ ] **Step 4: Commit**

```bash
g add apps/frontend/web/src/shared/locales
g commit -m "feat(web): the dashboard's copy, in eight languages"
```

---

### Task 8: The web's stats query, the recent list, and the badge

**Files:**
- Modify: `apps/frontend/web/src/features/provider/bookings/domain/status.ts`
- Modify: `apps/frontend/web/src/features/provider/bookings/data/booking.repository.ts`
- Modify: `apps/frontend/web/src/features/provider/bookings/viewmodel/use-provider-bookings.ts`
- Modify: `apps/frontend/web/src/features/provider/bookings/ui/__tests__/bookings-page.test.tsx` (mock fallout only)

**Interfaces:**
- Produces: `ProviderQueryTab`, `RECENT_BOOKINGS_LIMIT`, `providerBookingQueries.stats(providerId)`, `useProviderStats(providerId)`, `useRecentBookings(providerId)`; `useAwaitingCount` keeps its signature and changes its source.
- Consumes: Task 6's wire names.

- [ ] **Step 1: Widen the tab type and name the limit**

In `domain/status.ts`:

```ts
/** The three the page offers. The wire knows a fourth — see `ProviderQueryTab`. */
export const PROVIDER_TABS = ["requests", "upcoming", "history"] as const;
export type ProviderTab = (typeof PROVIDER_TABS)[number];

/** What the repository may ask for: the three tabs, plus "everything, newest first" for the dashboard. */
export type ProviderQueryTab = ProviderTab | "all";

/** How many rows "Reservas recentes" shows. Eight is the wireframe's, and one screen's worth. */
export const RECENT_BOOKINGS_LIMIT = 8;
```

- [ ] **Step 2: Add the stats query and a limit to the page query**

In `data/booking.repository.ts`:

```ts
const STATS = `
  query BookingStatsForProvider($input: BookingStatsForProviderInput!) {
    bookingStatsForProvider(input: $input) {
      awaitingResponse awaitingPayment upcomingToday upcomingWeek
      completedLast30 declinedLast30 revenueLast30Minor pipelineMinor currency
      perDay { date requests confirmed }
    }
  }`;
```

`ProviderBookingsPageInput` gains an optional limit, and `page` uses it:

```ts
export interface ProviderBookingsPageInput {
  providerId: string;
  tab: ProviderQueryTab;
  q: string;
  memberId: string | null;
  offset: number;
  /** The list's page size unless a caller wants fewer — the dashboard asks for eight. */
  limit?: number;
}
```

Inside `page(input)`, after the existing `const q = input.q.trim();`:

```ts
      const limit = input.limit ?? PROVIDER_BOOKINGS_PAGE_SIZE;
```

put `limit` in the key (last) and send it instead of the constant. And add:

```ts
  /**
   * The workspace's numbers. One key for the whole dashboard *and* the
   * sidebar's badge: they show the same figure, so they must not be able to
   * show two. Thirty seconds of staleness is the badge's old bargain kept.
   */
  stats: (providerId: string) =>
    queryOptions({
      queryKey: ["provider", providerId, "booking-stats"] as const,
      queryFn: async (): Promise<ProviderBookingStatsDTO> => {
        const d = await sessionGraphql<{ bookingStatsForProvider: ProviderBookingStatsDTO }>(STATS, {
          input: { providerId },
        });
        return d.bookingStatsForProvider;
      },
      enabled: providerId !== "",
      staleTime: 30_000,
    }),
```

- [ ] **Step 3: Point the hooks at it**

In `viewmodel/use-provider-bookings.ts`:

```ts
/** Every number the dashboard draws. */
export function useProviderStats(providerId: string) {
  return useQuery(providerBookingQueries.stats(providerId));
}

/**
 * How many requests are waiting — the sidebar's badge and the dashboard's
 * first card, from one cache entry. It used to read `total` off a page of the
 * list, which fetched twenty rows, a count and the member roster to show one
 * number on every screen in the zone.
 */
export function useAwaitingCount(providerId: string | undefined) {
  const query = useQuery({
    ...providerBookingQueries.stats(providerId ?? ""),
    select: (stats) => stats.awaitingResponse,
  });
  return query.data ?? 0;
}

/** The dashboard's "Reservas recentes": the newest eight, whatever state they are in. */
export function useRecentBookings(providerId: string) {
  return useProviderBookings({
    providerId,
    tab: "all",
    q: "",
    memberId: null,
    offset: 0,
    limit: RECENT_BOOKINGS_LIMIT,
  });
}
```

- [ ] **Step 4: Fix the list page's test mock**

`bookings-page.test.tsx` mocks `sessionGraphql`. The sidebar is not rendered in that harness, but `BookingsPage` is — check whether anything it renders now issues `BookingStatsForProvider`; if the mock answers by inspecting the query string or the variables, add a branch returning a zeroed stats object so an unmatched query cannot resolve to `undefined`. Run the file and let it tell you.

- [ ] **Step 5: Run the feature's tests, typecheck and lint**

Run: `cd apps/frontend/web && bun run vitest run src/features/provider/bookings && bun run typecheck && bun run lint`
Expected: PASS; 0 lint errors.

- [ ] **Step 6: Commit**

```bash
g add apps/frontend/web/src/features/provider/bookings
g commit -m "feat(web): one stats read for the dashboard and the sidebar's badge"
```

---

### Task 9: The chart's geometry, and the chart

**Files:**
- Create: `apps/frontend/web/src/features/provider/domain/activity-chart.ts`
- Create: `apps/frontend/web/src/features/provider/domain/__tests__/activity-chart.test.ts`
- Create: `apps/frontend/web/src/features/provider/ui/overview-chart.tsx`

**Interfaces:**
- Produces: `CHART`, `chartGeometry(days)`, `barPath(x, y, w, h, r)`, `seriesTotals(days)`, `chartTicks(days, locale)`; the component `ActivityChart({ days, locale })`.

The geometry is pure and lives in `domain` so it can be tested without a DOM; the component only maps it to elements.

- [ ] **Step 1: Write the failing geometry test**

```ts
// features/provider/domain/__tests__/activity-chart.test.ts
import { describe, expect, it } from "vitest";
import { CHART, barPath, chartGeometry, chartTicks, seriesTotals } from "../activity-chart";

const days = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-08-${String(i + 5).padStart(2, "0")}`.replace("2026-08-35", "2026-09-03"),
  requests: i === 29 ? 4 : 0,
  confirmed: i === 29 ? 2 : 0,
}));

describe("chartGeometry", () => {
  it("draws two bars a day and nothing for a day with nothing", () => {
    const { bars, groups, max } = chartGeometry(days);
    expect(groups).toHaveLength(30);
    expect(max).toBe(4);
    // Only the last day has anything: two bars, not sixty.
    expect(bars).toHaveLength(2);
    expect(bars.map((b) => b.series)).toEqual(["requests", "confirmed"]);
  });

  it("scales the tallest bar to the plot and anchors every bar to the baseline", () => {
    const { bars } = chartGeometry(days);
    const tallest = bars.find((b) => b.series === "requests")!;
    const baseline = CHART.height - CHART.padBottom;
    expect(tallest.y + tallest.height).toBeCloseTo(baseline, 5);
    expect(tallest.height).toBeCloseTo(CHART.height - CHART.padTop - CHART.padBottom, 5);
  });

  it("gives a day with a single booking a bar you can see", () => {
    const one = days.map((d, i) => ({ ...d, requests: i === 0 ? 1 : d.requests, confirmed: i === 0 ? 0 : d.confirmed }));
    const { bars } = chartGeometry(one);
    const first = bars.find((b) => b.key.startsWith(one[0]!.date))!;
    expect(first.height).toBeGreaterThanOrEqual(CHART.minBar);
  });

  it("never divides by zero on a month with no bookings", () => {
    const empty = days.map((d) => ({ ...d, requests: 0, confirmed: 0 }));
    const { bars, max } = chartGeometry(empty);
    expect(max).toBe(1);
    expect(bars).toHaveLength(0);
  });
});

describe("barPath", () => {
  it("rounds the top and leaves the base square", () => {
    const d = barPath(10, 20, 8, 40, 4);
    expect(d.startsWith("M10,60")).toBe(true); // the baseline corner
    expect(d).toContain("Q"); // two rounded shoulders
    expect(d.trimEnd().endsWith("Z")).toBe(true);
  });

  it("never rounds more than the bar can carry", () => {
    expect(barPath(0, 0, 3, 2, 4)).toContain("Q");
  });
});

describe("seriesTotals and chartTicks", () => {
  it("adds each series over the window", () => {
    expect(seriesTotals(days)).toEqual({ requests: 4, confirmed: 2 });
  });

  it("labels the first, middle and last day and nothing else", () => {
    const ticks = chartTicks(days, "pt-MZ");
    expect(ticks).toHaveLength(3);
    expect(ticks[0]!.index).toBe(0);
    expect(ticks.at(-1)!.index).toBe(29);
    expect(ticks[0]!.label.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/frontend/web && bun run vitest run src/features/provider/domain`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the geometry**

```ts
// features/provider/domain/activity-chart.ts
import type { ProviderBookingStatsDayDTO } from "@ntizo/shared/read-models";

/**
 * The chart's coordinate space. Fixed, and scaled by CSS: the SVG is drawn
 * once at this size and `width: 100%` shrinks it, so the bars keep their
 * proportions on a phone. The labels are HTML, outside the SVG, so they keep
 * their type size when the drawing shrinks.
 */
export const CHART = {
  width: 640,
  height: 176,
  padTop: 10,
  padBottom: 0,
  /** Between the two bars of one day, and between one day and the next. */
  gap: 2,
  groupGap: 6,
  radius: 4,
  /** A day with one booking must not draw a bar nobody can see. */
  minBar: 3,
} as const;

export type ChartSeries = "requests" | "confirmed";

export interface ChartBar {
  key: string;
  series: ChartSeries;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartGroup {
  day: ProviderBookingStatsDayDTO;
  /** The whole day's slice of the plot — the hover target, not the bars. */
  x: number;
  width: number;
}

/**
 * Bars for the days that have something, groups for all of them.
 *
 * `max` floors at 1 so a month with no bookings divides by something, and an
 * empty day contributes no bar at all: a zero-height rectangle is invisible
 * anyway, and leaving it out halves the element count on a quiet month.
 */
export function chartGeometry(days: readonly ProviderBookingStatsDayDTO[]): {
  bars: ChartBar[];
  groups: ChartGroup[];
  max: number;
} {
  const view = CHART;
  const plot = view.height - view.padTop - view.padBottom;
  const groupWidth = view.width / Math.max(days.length, 1);
  const barWidth = Math.max((groupWidth - view.groupGap - view.gap) / 2, 1);
  const max = Math.max(1, ...days.flatMap((d) => [d.requests, d.confirmed]));

  const bars: ChartBar[] = [];
  const groups: ChartGroup[] = [];

  days.forEach((day, i) => {
    const x = i * groupWidth;
    groups.push({ day, x, width: groupWidth });

    const put = (series: ChartSeries, value: number, offset: number) => {
      if (value <= 0) return;
      const height = Math.max((value / max) * plot, view.minBar);
      bars.push({
        key: `${day.date}-${series}`,
        series,
        x: x + view.groupGap / 2 + offset,
        y: view.padTop + plot - height,
        width: barWidth,
        height,
      });
    };

    put("requests", day.requests, 0);
    put("confirmed", day.confirmed, barWidth + view.gap);
  });

  return { bars, groups, max };
}

/** A bar with a rounded top and a square base, anchored to the baseline. */
export function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(Math.min(r, w / 2, h), 0.5);
  const bottom = y + h;
  return `M${x},${bottom} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${bottom} Z`;
}

export function seriesTotals(days: readonly ProviderBookingStatsDayDTO[]): {
  requests: number;
  confirmed: number;
} {
  return days.reduce(
    (acc, d) => ({ requests: acc.requests + d.requests, confirmed: acc.confirmed + d.confirmed }),
    { requests: 0, confirmed: 0 },
  );
}

/** Three labels — the window's ends and its middle. Thirty would be a wall of text on a phone. */
export function chartTicks(
  days: readonly ProviderBookingStatsDayDTO[],
  locale: string,
): { index: number; label: string }[] {
  if (days.length === 0) return [];
  const format = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  return [0, Math.floor((days.length - 1) / 2), days.length - 1].map((index) => ({
    index,
    label: format.format(new Date(`${days[index]!.date}T00:00:00.000Z`)),
  }));
}
```

- [ ] **Step 4: Run the geometry test**

Run: `cd apps/frontend/web && bun run vitest run src/features/provider/domain`
Expected: PASS (10 tests).

- [ ] **Step 5: Write the component**

```tsx
// features/provider/ui/overview-chart.tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderBookingStatsDayDTO } from "@ntizo/shared/read-models";
import {
  CHART,
  barPath,
  chartGeometry,
  chartTicks,
  seriesTotals,
} from "../domain/activity-chart";

/**
 * Thirty days of two counts, drawn rather than imported: a charting library
 * would be the largest package in this app for one figure.
 *
 * The two colours are validated, not chosen by eye — blue against
 * `#12a05f`, which clears the contrast floor on white and sits inside the
 * dark band on the card's near-black. Their separation for a tritan reader is
 * in the floor band, which is legal only with secondary encoding, so three
 * things here are load-bearing and not decoration: the legend is always
 * drawn, both series carry their total as a direct label, and the two bars of
 * a day are held apart by a gap of surface. The SVG itself is `aria-hidden`;
 * the table below it is the real content for a screen reader, and the relief
 * the contrast check asks for.
 */
export function ActivityChart({
  days,
  locale,
}: {
  days: readonly ProviderBookingStatsDayDTO[];
  locale: string;
}) {
  const { t } = useTranslation("provider");
  const [hovered, setHovered] = useState<number | null>(null);
  const { bars, groups } = chartGeometry(days);
  const totals = seriesTotals(days);
  const ticks = chartTicks(days, locale);
  const empty = totals.requests === 0 && totals.confirmed === 0;
  const dayLabel = (d: ProviderBookingStatsDayDTO) =>
    t("overview.chartDayLabel", {
      date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(
        new Date(`${d.date}T00:00:00.000Z`),
      ),
      requests: d.requests,
      confirmed: d.confirmed,
    });

  return (
    <section
      className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5"
      style={{ ["--chart-confirmed" as string]: "#12a05f" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
            {t("overview.chartTitle")}
          </h2>
          <p className="type-caption text-[var(--color-muted-foreground)]">{t("overview.chartRange")}</p>
        </div>
        <ul className="flex list-none gap-4 p-0">
          {(
            [
              ["requests", "var(--color-primary)", totals.requests, t("overview.chartRequests")],
              ["confirmed", "var(--chart-confirmed)", totals.confirmed, t("overview.chartConfirmed")],
            ] as const
          ).map(([key, colour, total, label]) => (
            <li key={key} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: colour }} />
              <span className="type-caption text-[var(--color-muted-foreground)]">{label}</span>
              <span className="type-body-medium font-semibold tabular-nums">{total}</span>
            </li>
          ))}
        </ul>
      </div>

      {empty ? (
        <p className="type-body mt-6 mb-2 text-[var(--color-muted-foreground)]">{t("overview.chartEmpty")}</p>
      ) : (
        <div className="relative mt-4">
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${CHART.width} ${CHART.height}`}
            preserveAspectRatio="none"
            className="h-[176px] w-full"
            onMouseLeave={() => setHovered(null)}
          >
            {bars.map((bar) => (
              <path
                key={bar.key}
                d={barPath(bar.x, bar.y, bar.width, bar.height, CHART.radius)}
                fill={bar.series === "requests" ? "var(--color-primary)" : "var(--chart-confirmed)"}
              />
            ))}
            {groups.map((group, i) => (
              <rect
                key={group.day.date}
                x={group.x}
                y={0}
                width={group.width}
                height={CHART.height}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
              />
            ))}
            {hovered !== null && (
              <rect
                x={groups[hovered]!.x}
                y={0}
                width={groups[hovered]!.width}
                height={CHART.height}
                fill="color-mix(in srgb, var(--color-foreground) 6%, transparent)"
              />
            )}
          </svg>

          {hovered !== null && (
            <p
              className="type-caption pointer-events-none absolute -top-1 rounded-[var(--radius-field)] bg-[var(--color-foreground)] px-2 py-1 text-[var(--color-background)]"
              style={{
                left: `${((groups[hovered]!.x + groups[hovered]!.width / 2) / CHART.width) * 100}%`,
                transform: "translateX(-50%)",
              }}
            >
              {dayLabel(groups[hovered]!.day)}
            </p>
          )}

          <div className="mt-2 flex justify-between">
            {ticks.map((tick) => (
              <span key={tick.index} className="type-caption text-[var(--color-muted-foreground)]">
                {tick.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <table className="sr-only">
        <caption>{`${t("overview.chartTitle")} — ${t("overview.chartRange")}`}</caption>
        <thead>
          <tr>
            <th scope="col">{t("overview.chartTableDay")}</th>
            <th scope="col">{t("overview.chartRequests")}</th>
            <th scope="col">{t("overview.chartConfirmed")}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{d.date}</th>
              <td>{d.requests}</td>
              <td>{d.confirmed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

One note for whoever writes this: `preserveAspectRatio="none"` is deliberate: the bars are rectangles whose meaning is their height, and letting them stretch horizontally is what keeps thirty days legible at 390px; the rounded shoulders distort by a hair and nothing else does.

- [ ] **Step 6: Typecheck and lint**

Run: `cd apps/frontend/web && bun run vitest run src/features/provider/domain && bun run typecheck && bun run lint`
Expected: PASS; 0 errors. The component's own test comes with the page, in Task 11.

- [ ] **Step 7: Commit**

```bash
g add apps/frontend/web/src/features/provider/domain apps/frontend/web/src/features/provider/ui/overview-chart.tsx
g commit -m "feat(web): thirty days of requests and confirmations, drawn"
```

---

### Task 10: A table without a search box

**Files:**
- Modify: `apps/frontend/web/src/shared/components/collection-card.tsx`
- Modify: `apps/frontend/web/src/shared/components/__tests__/collection-card.test.tsx` (create it if the component has no test today)

`CollectionCard` is the zone's table: a real `<table>` from `md` up, stacked cards below, with skeletons and empty states. Its search box is required today, so the dashboard's eight-row "Reservas recentes" cannot use it without growing a search box it does not want. Two optional props fix that and change nothing for the four pages that pass them.

- [ ] **Step 1: Write the failing test**

```tsx
it("renders no search box when no search is offered, and shows the action instead", () => {
  render(
    <CollectionCard
      title="Reservas recentes"
      shown={1}
      total={1}
      loading={false}
      columns={[{ key: "who", label: "Cliente" }]}
      rows={[{ key: "b1", primary: <span>Ana</span>, cells: { who: "Ana" } }]}
      emptyTitle="Vazio"
      emptyText="Nada"
      noMatchesTitle="Sem resultados"
      noMatchesText="Nada"
      filtered={false}
      action={<a href="/provider/estudio/bookings">Ver todas</a>}
    />,
  );
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ver todas" })).toBeInTheDocument();
});
```

Wrap it in the same i18n/provider harness the other `shared/components` tests use; if none exists, copy the smallest one from `src/features/provider/bookings/ui/__tests__/bookings-page.test.tsx` (the component reads `t("peopleShown")` from the `provider` namespace).

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/frontend/web && bun run vitest run src/shared/components`
Expected: FAIL — `search`, `onSearchChange` and `searchPlaceholder` are required; `action` is not a prop.

- [ ] **Step 3: Make the search optional and add the action slot**

In the props type:

```ts
  /** Omit all three to render no search box — a card that shows a fixed few rows has nothing to search. */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Rendered where the search box would be: the dashboard's "Ver todas →". */
  action?: ReactNode;
```

In the header's right-hand group, replace the unconditional search block with:

```tsx
          {onSearchChange && searchPlaceholder !== undefined && (
            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
              <Input
                value={search ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="pl-9"
              />
            </div>
          )}
          {action}
```

- [ ] **Step 4: Run the shared tests and every page that uses the card**

Run: `cd apps/frontend/web && bun run vitest run src/shared src/features/provider && bun run typecheck && bun run lint`
Expected: PASS. Nothing else changes: every existing caller still passes the three props.

- [ ] **Step 5: Commit**

```bash
g add apps/frontend/web/src/shared/components
g commit -m "feat(web): a collection card can show a few rows without offering a search"
```

---

### Task 11: The dashboard

**Files:**
- Create: `apps/frontend/web/src/features/provider/domain/greeting.ts`
- Create: `apps/frontend/web/src/features/provider/domain/__tests__/greeting.test.ts`
- Create: `apps/frontend/web/src/features/provider/viewmodel/use-provider-rating.ts`
- Create: `apps/frontend/web/src/features/provider/bookings/ui/booking-row.tsx`
- Modify: `apps/frontend/web/src/features/provider/bookings/ui/bookings-page.tsx`
- Create: `apps/frontend/web/src/features/provider/ui/overview-cards.tsx`
- Modify: `apps/frontend/web/src/features/provider/ui/overview.tsx`
- Create: `apps/frontend/web/src/features/provider/ui/__tests__/overview.test.tsx`

**Interfaces:**
- Consumes: Tasks 8, 9, 10; `useServices`, `useProviderThreads`, `useActiveProvider`, `usePageHeader`, `usePageAction`, `formatMoney`.
- Produces: `greetingKey(now)`, `useProviderRating(providerId)`, `bookingColumns(t)`, `bookingRow(booking, ctx)`, `StatCard`, the rewritten `OverviewPage`.

- [ ] **Step 1: Write the failing page test**

Model the harness on `features/provider/bookings/ui/__tests__/bookings-page.test.tsx` (memory router, `QueryClientProvider`, `i18n.changeLanguage("pt-MZ")`, a mocked `@/shared/lib/graphql/session-graphql` and a mocked `use-active-provider`). The reviews call goes through `publicGraphql`, not `sessionGraphql` — mock whichever module `directoryQueries.reviews` actually uses, and mock the messaging repository's module if its threads query is easier to stub than its GraphQL. Dispatch on the operation name in the query string:

```ts
const TODAY = new Date();
const iso = (back: number) => new Date(TODAY.getTime() - back * 86_400_000).toISOString().slice(0, 10);

const STATS = {
  awaitingResponse: 3,
  awaitingPayment: 1,
  upcomingToday: 2,
  upcomingWeek: 5,
  completedLast30: 9,
  declinedLast30: 1,
  revenueLast30Minor: 1_240_000,
  pipelineMinor: 630_000,
  currency: "MZN",
  perDay: Array.from({ length: 30 }, (_, i) => ({
    date: iso(29 - i),
    requests: i === 29 ? 4 : i % 7 === 0 ? 1 : 0,
    confirmed: i === 29 ? 2 : 0,
  })),
};

sessionGraphqlMock.mockImplementation(async (query: string) => {
  if (query.includes("BookingStatsForProvider")) return { bookingStatsForProvider: STATS };
  if (query.includes("BookingForProvider")) return { bookingForProvider: { items: [row("Ana"), row("Bruno")], total: 2, nextOffset: null, members: [] } };
  if (query.includes("ServiceMine")) return { serviceMine: [svc("published"), svc("published"), svc("draft")] };
  return {};
});
```

`row(...)` and `svc(...)` are the fixtures this file builds; copy `row`'s shape from the bookings page test's own fixture and `svc`'s from `ProviderService` (it needs at least `id`, `name`, `status`).

```tsx
it("leads with the number that is a task, and links it to the requests", async () => {
  renderOverview();
  expect(await screen.findByText("Por responder")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Responder" })).toHaveAttribute(
    "href",
    expect.stringContaining("/provider/estudio/bookings"),
  );
});

it("shows the week with today inside it", async () => {
  renderOverview();
  expect(await screen.findByText("Próximos 7 dias")).toBeInTheDocument();
  expect(screen.getByText("5")).toBeInTheDocument();
  expect(screen.getByText("2 hoje")).toBeInTheDocument();
});

it("shows the provider's share, not the listed price", async () => {
  renderOverview();
  // 1 240 000 minor units, already net of commission.
  expect(await screen.findByText(/12[\s .]?400/)).toBeInTheDocument();
  expect(screen.getByText(/6[\s .]?300/)).toBeInTheDocument(); // the pipeline line
});

it("draws a bar for every day that has something and a table for everyone else", async () => {
  renderOverview();
  await screen.findByText("Por responder");
  // The sr-only table is the accessible copy: thirty rows, one per day.
  const table = screen.getByRole("table", { name: /pedidos e confirmações/i });
  expect(within(table).getAllByRole("row")).toHaveLength(31); // 30 days + the header
});

it("lists the recent bookings and links to all of them", async () => {
  renderOverview();
  expect(await screen.findByText("Reservas recentes")).toBeInTheDocument();
  expect(screen.getAllByText("Ana").length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: "Ver todas" })).toBeInTheDocument();
});

it("counts the services and the unread messages", async () => {
  renderOverview();
  expect(await screen.findByText("2 publicados")).toBeInTheDocument();
  expect(screen.getByText("1 rascunhos")).toBeInTheDocument();
  expect(screen.getByText("2 por ler")).toBeInTheDocument();
});

it("says so when the numbers cannot be read", async () => {
  // the stats call rejects
  renderOverview();
  expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível carregar/i);
});
```

Plus the greeting's own test:

```ts
// features/provider/domain/__tests__/greeting.test.ts
import { describe, expect, it } from "vitest";
import { greetingKey } from "../greeting";

describe("greetingKey", () => {
  it("says morning before noon, afternoon until seven, evening after", () => {
    expect(greetingKey(new Date("2026-09-03T08:00:00"))).toBe("morning");
    expect(greetingKey(new Date("2026-09-03T13:00:00"))).toBe("afternoon");
    expect(greetingKey(new Date("2026-09-03T20:00:00"))).toBe("evening");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/frontend/web && bun run vitest run src/features/provider/ui src/features/provider/domain`
Expected: FAIL — modules not found; the page still renders six zeros.

- [ ] **Step 3: The greeting and the rating hook**

```ts
// features/provider/domain/greeting.ts
export type GreetingKey = "morning" | "afternoon" | "evening";

/** The reader's own clock, not the workspace's: this is a hello, not a booking. */
export function greetingKey(now: Date): GreetingKey {
  const hour = now.getHours();
  if (hour < 12) return "morning";
  if (hour < 19) return "afternoon";
  return "evening";
}
```

```ts
// features/provider/viewmodel/use-provider-rating.ts
import { useQuery } from "@tanstack/react-query";
import { directoryQueries } from "@/features/directory/data/directory.repository";

/**
 * The workspace's public rating, read through the public query the provider's
 * own page uses. One review is fetched rather than ten: the dashboard shows
 * the summary, and the summary comes back whatever the limit.
 */
export function useProviderRating(providerId: string) {
  const query = useQuery({
    ...directoryQueries.reviews(providerId, 1),
    enabled: providerId !== "",
    select: (data) => data.summary,
  });
  return query;
}
```

(If `directoryQueries.reviews` already sets `enabled`, drop the override. Check its signature before writing this.)

- [ ] **Step 4: Extract the booking row builder**

```tsx
// features/provider/bookings/ui/booking-row.tsx
import type { TFunction } from "i18next";
import { Link } from "@tanstack/react-router";
import type { ProviderBookingDTO } from "@ntizo/shared/read-models";
import type { CollectionColumn, CollectionRow } from "@/shared/components/collection-card";
import { compactSlotWording } from "@/features/checkout/domain/slot-wording";
import { formatMoney } from "@/features/wallet/domain/money";
import { timeLeftWording } from "../domain/status";
import { BookingStatusBadge } from "./booking-status-badge";

/** The list's five columns. The dashboard passes a subset — a column the card does not receive is not drawn. */
export function bookingColumns(t: TFunction<"provider">): CollectionColumn[] {
  return [
    { key: "customer", label: t("bookings.col.customer"), className: "pl-5" },
    { key: "service", label: t("bookings.col.service"), skeletonWidth: "w-40" },
    { key: "when", label: t("bookings.col.when"), skeletonWidth: "w-28" },
    { key: "price", label: t("bookings.col.price"), align: "right", skeletonWidth: "w-20" },
    { key: "status", label: t("bookings.col.status"), skeletonWidth: "w-24", skeletonShape: "badge", className: "pr-5" },
  ];
}

/**
 * One row, built once for the two screens that show bookings in a table. The
 * list and the dashboard differ in which columns they ask for, never in what a
 * row says.
 */
export function bookingRow(
  b: ProviderBookingDTO,
  ctx: { slug: string; locale: string; now: Date; t: TFunction<"provider"> },
): CollectionRow {
  const { slug, locale, now, t } = ctx;
  const slot = compactSlotWording(b.startsAt, b.endsAt, locale, b.timezone);
  const left = b.respondBy ? timeLeftWording(b.respondBy, now) : null;
  const name = (
    <Link
      to="/provider/$slug/bookings/$bookingId"
      params={{ slug, bookingId: b.id }}
      className="type-body-medium font-semibold hover:underline"
    >
      {b.customerFirstName}
    </Link>
  );
  return {
    key: b.id,
    primary: name,
    cells: {
      service: `${b.serviceName} · ${b.memberFirstName ?? t("bookings.memberAnyone")}`,
      when: <span className="tabular-nums">{`${slot.date} · ${slot.start}`}</span>,
      price: <span className="tabular-nums">{formatMoney(b.priceMinor, b.currency, locale)}</span>,
      status: (
        <span className="inline-flex items-center gap-2">
          <BookingStatusBadge status={b.status} />
          {left && <span className="type-caption text-[var(--color-muted-foreground)]">{left}</span>}
        </span>
      ),
    },
  };
}
```

Then change `bookings-page.tsx` to build its `columns` and `rows` from these two functions instead of inline literals, deleting the duplicated markup. Its tests must stay green with no edit — if a test breaks, the extraction changed behaviour and you have gone too far.

- [ ] **Step 5: The cards**

```tsx
// features/provider/ui/overview-cards.tsx
import type { ReactNode } from "react";
import { Card, CardContent, Skeleton } from "@ntizo/frontend-ui";

const CAPTION = "type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase";

/**
 * One reading. The value is the point, so it is the only thing at heading
 * size; the hint under it is what the number means, and `action` is a verb —
 * only the card that is a task gets one.
 */
export function StatCard({
  label,
  value,
  hint,
  action,
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="grid gap-1 p-4">
        <p className={CAPTION}>{label}</p>
        {loading ? (
          <Skeleton className="h-9 w-20" />
        ) : (
          <p className="type-h1 font-semibold tabular-nums">{value}</p>
        )}
        {hint && <p className="type-caption text-[var(--color-muted-foreground)]">{hint}</p>}
        {action}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: The page**

```tsx
// features/provider/ui/overview.tsx
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { CollectionCard } from "@/shared/components/collection-card";
import { usePageAction, usePageHeader } from "@/shared/lib/page-header";
import { useServices } from "@/features/provider/services/viewmodel/use-services";
import { useProviderThreads } from "@/features/messaging/viewmodel/use-provider-threads";
import {
  useProviderStats,
  useRecentBookings,
} from "../bookings/viewmodel/use-provider-bookings";
import { bookingColumns, bookingRow } from "../bookings/ui/booking-row";
import { formatMoney } from "@/features/wallet/domain/money";
import { greetingKey } from "../domain/greeting";
import { useActiveProvider } from "../viewmodel/use-active-provider";
import { useProviderRating } from "../viewmodel/use-provider-rating";
import { ActivityChart } from "./overview-chart";
import { StatCard } from "./overview-cards";

/**
 * The workspace at a glance: what needs an answer, what is coming, what the
 * month earned, and what people think. Four readings, one of which is a task —
 * so exactly one card carries a verb.
 */
export function OverviewPage() {
  const { t, i18n } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { activeProvider } = useActiveProvider();
  const providerId = activeProvider?.id ?? "";
  const slug = activeProvider?.slug ?? "";

  const stats = useProviderStats(providerId);
  const recent = useRecentBookings(providerId);
  const services = useServices(providerId);
  const rating = useProviderRating(providerId);
  const threads = useProviderThreads(providerId);

  const now = useMemo(() => new Date(), [stats.dataUpdatedAt]);
  usePageHeader(
    t(`overview.greeting.${greetingKey(now)}`, { name: activeProvider?.name ?? "" }),
    t("overview.subtitle"),
  );
  usePageAction(
    slug ? (
      // A styled `Link`, not a `Button asChild`: the kit's Button is a plain
      // forwardRef over `buttonVariants` with no Slot, so `asChild` would
      // render a button with a link inside it.
      <Link
        to="/provider/$slug/bookings"
        params={{ slug }}
        className="type-body-medium inline-flex h-10 items-center rounded-[var(--radius-field)] border border-[var(--color-input)] px-4 font-semibold hover:bg-[var(--color-muted)]"
      >
        {t("overview.seeBookings")}
      </Link>
    ) : null,
    [slug, t],
  );

  if (!activeProvider) return <p className="type-body">{t("noActiveProvider")}</p>;

  const s = stats.data;
  const published = (services.data ?? []).filter((x) => x.status === "published").length;
  const drafts = (services.data ?? []).filter((x) => x.status === "draft").length;
  const unread = threads.threads.reduce((n, thread) => n + thread.unreadCount, 0);
  const items = recent.data?.items ?? [];

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      {stats.isError && (
        <p role="alert" className="type-body text-[var(--color-destructive)]">
          {t("overview.loadError")}{" "}
          <button type="button" className="underline" onClick={() => void stats.refetch()}>
            {t("overview.retry")}
          </button>
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t("overview.awaitingTitle")}
          value={s?.awaitingResponse ?? 0}
          loading={stats.isLoading}
          hint={s && s.awaitingResponse === 0 ? t("overview.awaitingNone") : undefined}
          action={
            s && s.awaitingResponse > 0 ? (
              <Link
                to="/provider/$slug/bookings"
                params={{ slug }}
                search={{ tab: "requests" }}
                className="type-caption font-semibold text-[var(--color-primary)] hover:underline"
              >
                {t("overview.awaitingAction")}
              </Link>
            ) : undefined
          }
        />
        <StatCard
          label={t("overview.weekTitle")}
          value={s?.upcomingWeek ?? 0}
          loading={stats.isLoading}
          hint={t("overview.todayCount", { count: s?.upcomingToday ?? 0 })}
        />
        <StatCard
          label={t("overview.revenueTitle")}
          value={formatMoney(s?.revenueLast30Minor ?? 0, s?.currency ?? "MZN", locale)}
          loading={stats.isLoading}
          hint={t("overview.pipeline", {
            amount: formatMoney(s?.pipelineMinor ?? 0, s?.currency ?? "MZN", locale),
          })}
        />
        <StatCard
          label={t("overview.ratingTitle")}
          value={
            rating.data?.average != null
              ? new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(rating.data.average)
              : "—"
          }
          loading={rating.isLoading}
          hint={
            rating.data?.count
              ? t("overview.ratingCount", { count: rating.data.count })
              : t("overview.ratingNone")
          }
          action={
            rating.data?.count ? (
              <Link
                to="/providers/$slug"
                params={{ slug }}
                className="type-caption font-semibold text-[var(--color-primary)] hover:underline"
              >
                {t("overview.seeReviews")}
              </Link>
            ) : undefined
          }
        />
      </div>

      <ActivityChart days={s?.perDay ?? []} locale={locale} />

      <CollectionCard
        title={t("overview.recentTitle")}
        shown={items.length}
        total={recent.data?.total ?? items.length}
        loading={recent.isLoading}
        columns={bookingColumns(t).filter((c) => c.key !== "price")}
        rows={items.map((b) => bookingRow(b, { slug, locale, now, t }))}
        emptyTitle={t("overview.recentEmptyTitle")}
        emptyText={t("overview.recentEmpty")}
        noMatchesTitle={t("overview.recentEmptyTitle")}
        noMatchesText={t("overview.recentEmpty")}
        filtered={false}
        action={
          <Link
            to="/provider/$slug/bookings"
            params={{ slug }}
            className="type-caption font-semibold text-[var(--color-primary)] hover:underline"
          >
            {t("overview.recentAll")}
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label={t("overview.servicesTitle")}
          value={published}
          loading={services.isLoading}
          hint={
            published + drafts === 0
              ? t("overview.servicesNone")
              : `${t("overview.servicesPublished", { count: published })} · ${t("overview.servicesDraft", { count: drafts })}`
          }
          action={
            <Link
              to="/provider/$slug/services"
              params={{ slug }}
              className="type-caption font-semibold text-[var(--color-primary)] hover:underline"
            >
              {t("overview.servicesAction")}
            </Link>
          }
        />
        <StatCard
          label={t("overview.messagesTitle")}
          value={unread}
          loading={threads.loading}
          hint={unread === 0 ? t("overview.messagesNone") : t("overview.messagesUnread", { count: unread })}
          action={
            <Link
              to="/provider/$slug/messages"
              params={{ slug }}
              className="type-caption font-semibold text-[var(--color-primary)] hover:underline"
            >
              {t("overview.messagesAction")}
            </Link>
          }
        />
      </div>
    </div>
  );
}
```

Check three things against the real signatures before running: `usePageAction`'s parameters (it takes a node and a dependency array), `useServices`' return shape (a query whose `data` is the array), and `useProviderThreads`' field names (`threads`, `loading`). Adjust the calls, not the design. The route file needs no change — it already imports `OverviewPage` from this path.

- [ ] **Step 7: Run everything web**

Run: `cd apps/frontend/web && bun run vitest run src/features/provider src/shared && bun run typecheck && bun run lint`
Expected: PASS; 0 lint errors. The bookings list page's tests must be green without having been edited.

- [ ] **Step 8: Commit**

```bash
g add apps/frontend/web/src/features/provider
g commit -m "feat(web): Visão geral — four readings, thirty days, and the eight newest bookings"
```

---

### Task 12: Whole-repo verification and the follow-ups entries

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

Expected: all green. The backend's dev-database tests need `DATABASE_URL` resolvable (`apps/backend/api/.dev.vars`, `packages/backend/.env`); run them with it. Report the counts.

- [ ] **Step 2: Record what this phase left for later**

Append to `docs/superpowers/follow-ups.md` in its numbering (read the last entry for the next number and the shape — `## #NNN — Title`, prose, then a `**Trigger:**` line):

```markdown
## #N — The dashboard's unread count only sees the first page of threads

`OverviewPage` sums `unreadCount` over `useProviderThreads`' first page, which is what the
design settled for, because the communication read has no aggregate. A workspace with more
threads than one page holds will show an undercount, and the number will change as the
inbox is scrolled elsewhere in the session.

**Trigger:** the first provider whose inbox is longer than a page and who notices the two
screens disagree; the fix is a `communicationProviderUnreadCount` beside the notification
context's, which already has one.

## #N+1 — The stats read has no index for its date windows

`booking_provider_status_idx` (`provider_id`, `status`) serves the dashboard's counts, but the
thirty-day sums filter on `completed_at` and the confirmed series on `confirmed_at`, neither
of which is indexed. At a workspace's row counts this is a scan of a few hundred rows and
costs nothing; at a marketplace's it is a scan of the table.

**Trigger:** the dashboard appearing in a slow-query log, or the first workspace with tens of
thousands of bookings — then `(provider_id, completed_at)` and `(provider_id, confirmed_at)`,
or a rollup table if the numbers are wanted platform-wide.
```

- [ ] **Step 3: Commit and hand over**

```bash
g add docs/superpowers/follow-ups.md
g commit -m "docs: what the provider dashboard leaves for later"
```

Then: merge to `dev` and deploy only on the owner's word, as every deploy in this project. The migration from Task 3 is already applied to dev; QA and production need `db:ntizo:qa:migrate` / `db:ntizo:prod:migrate` before the API that reads through the new index is promoted there.

---

## Self-review against the spec

- **One aggregate query plus what the zone already fetches** — Tasks 4–6 (`bookingStatsForProvider`), Task 11 (services, messages, rating, recent bookings from queries that already existed).
- **Every field the spec's `bookingStatsForProvider` lists** — Task 1's read model, field for field, in the spec's order.
- **Revenue is the provider's share; pipeline is the same share, still ahead** — Task 4's two `sum(... filter ...)` expressions, asserted in its test and in Task 11's page test.
- **Today and the next seven days in the provider's timezone** — Task 4, `date_trunc('day', … at time zone p.timezone)`; `upcomingToday` is a subset of `upcomingWeek` by construction (both start at today's first instant).
- **Thirty days, inclusive, zero-filled** — Task 1 (`.length(30)`), Task 5 (`fillDays`), Task 9 (the chart draws what it is given).
- **The chart is drawn, not imported** — Task 9, inline SVG, no dependency; the palette validated rather than eyeballed, with the legend, direct labels and gaps the floor band requires.
- **The dashboard's screen as wireframed** — Task 11: four cards with one verb, the chart, eight recent bookings with "Ver todas", services and messages beneath.
- **The greeting is the page header the shell already draws, translated** — Task 11 (`usePageHeader` + `greetingKey`), Task 7 (the three greetings ×8). No eyebrow.
- **The badge is `awaitingResponse` from the stats query, which the shell caches** — Task 8 (`useAwaitingCount` re-pointed at one shared cache entry).
- **Locales ×8** — Task 7.
- **Out of scope stays out** — no marking done, no reschedule, no wallet ledger, no cross-entity search; the donuts the reference draws are deliberately absent (two of the three are cards above them).

Type names used across tasks: `ProviderBookingStatsDTO`, `ProviderBookingStatsDayDTO`, `STATS_WINDOW_DAYS` (Task 1) — consumed by Tasks 4, 5, 6, 8, 9; `ProviderListTab` widened (Task 2) — consumed by Tasks 4, 8; `ProviderStats`, `ProviderStatsRow`, `ProviderStatsDayRow`, `statsForProvider` (Task 4) — consumed by Task 5; `GetProviderStatsProjection`, `fillDays` (Task 5) — consumed by Task 6; `getProviderStats` (Task 6) — consumed by Task 8's query string; `ProviderQueryTab`, `RECENT_BOOKINGS_LIMIT`, `providerBookingQueries.stats`, `useProviderStats`, `useRecentBookings` (Task 8) — consumed by Task 11; `CHART`, `chartGeometry`, `barPath`, `seriesTotals`, `chartTicks` (Task 9) — consumed by Task 9's component and its test; `action` on `CollectionCard` (Task 10) — consumed by Task 11; `bookingColumns`, `bookingRow` (Task 11) — consumed by Task 11's page and the list page it is extracted from.
