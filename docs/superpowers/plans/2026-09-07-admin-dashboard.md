# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin's placeholder home with a dashboard built to the provider Overview's skeleton — what needs the administrator, how the platform's last thirty days went, and who applied — fed by one new platform-wide bookings stats query and one already-written-but-never-wired provider count.

**Architecture:** Backend: `bookingStatsForAdmin` (a platform-wide sibling of `bookingStatsForProvider`, same window, same per-day series, plus the platform's gross and commission) and `providerCountByStatusForAdmin` (wires the dead `countByStatus` projection). Frontend: the provider's `StatCard`, `ActivityChart` and `greetingKey` move to `shared/` so the admin does not import a provider screen; a new `features/admin/dashboard` feature reads five queries and renders three rows: Needs you (the first three of four sources above zero), four tiles, Latest applications.

**Tech Stack:** Bun/turbo monorepo. Backend: `@cosmneo/onion-lasagna` GraphQL field kit, Drizzle over Postgres, `bun test`. Shared: zod read models. Web: React 19, TanStack Router file routes, TanStack Query, react-i18next (8 locales), Tailwind v4 tokens, vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-09-06-console-navigation-design.md`, section "Dashboards open with what is owed", including its 2026-09-07 paragraph "The admin's sources, as built".

## Global Constraints

- **Worktree:** all work happens in `.claude/worktrees/admin-dashboard` on branch `feat/admin-dashboard`, cut from `dev`. Every path below is relative to that worktree root unless it starts with `apps/`, `packages/` or `docs/` — those are relative to the root too.
- **Window and zone (ruling R1, R2):** the admin's month is the same rolling `STATS_WINDOW_DAYS` (30) window the provider uses, so one chart and one window; every tile that names a period says "(30 days)". Day boundaries for the platform are `Africa/Maputo` — the platform's home market and the `provider.timezone` column default — held in one constant `PLATFORM_TIMEZONE`, never a per-workspace zone.
- **Money semantics:** gross = `sum(price_minor)` and commission = `sum(commission_minor)` over `COMPLETED` bookings whose `completed_at` is inside the window — the same status and clock the provider's `revenueLast30Minor` uses, so the platform's figure and the sum of its providers' figures describe the same bookings.
- **Admin authorization** is the field's handler, not a directive: `!requesterUserId || role !== "admin"` → `ForbiddenError({ code: "ADMIN_ONLY" })`, thrown before anything is read, identical for every refused caller.
- **Every new string** goes into all eight `admin.json` files (`de-DE en-US es-ES fr-FR it-IT nl-NL pt-MZ pt-PT`) under `apps/frontend/web/src/shared/locales/<locale>/admin.json`; `shared/locales/__tests__/locales.test.ts` fails otherwise. Plurals use the file's own convention: `_one`, `_other`, `_many`.
- **Boundaries lint** (`apps/frontend/web/eslint.config.js`): `src/shared/domain/**` is `domain`; `src/shared/components/**` and the whole `src/features/admin/**` tree are `ui`; `ui` may import `domain`, `viewmodel`, `ui`, `shared` — never `data` outside admin. A `ui` file never imports from `src/routes/**`.
- **Console chrome** uses only `md`/`lg` breakpoints; a page's own grids may use `sm`/`xl` as the provider Overview does. Controls are 44px; the page width is `ConsolePage` (this dashboard is its first adopter).
- **Backend tests:** `bun run test` in `packages/backend` runs everything; files that call `openDevDbConnection()` need `DEV_DB_URL` (in `packages/backend/.env`, already present in the worktree). On `dev` the suite has 5 pre-existing failures with the DB and 32 without it; compare against that, not zero.
- **Commits:** one message via `git commit -F - <<'EOF' … EOF`, ending with the two adjacent trailer lines `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v`. Never `git add -A`, never `git stash`.
- **Never** run `playwright test` without `--list` in this environment (no Postgres on 55432).

---

### Task 1: The two read models, in `packages/shared`

**Files:**
- Create: `packages/shared/src/read-models/system/booking/admin-booking-stats.schema.ts`
- Create: `packages/shared/src/read-models/system/provider/provider-status-counts.schema.ts`
- Modify: `packages/shared/src/read-models/system/booking/index.ts` (add one export line)
- Modify: `packages/shared/src/read-models/system/provider/index.ts` (add one export line)
- Test: `packages/shared/src/read-models/__tests__/read-models.test.ts` (append two describes)

**Interfaces:**
- Produces: `adminBookingStatsReadModel`, `type AdminBookingStatsDTO`, `providerStatusCountsReadModel`, `type ProviderStatusCountsDTO`, all importable from `@ntizo/shared/read-models`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared/src/read-models/__tests__/read-models.test.ts` (add the two imports beside the existing ones from `../system`):

```ts
import { adminBookingStatsReadModel } from "../system/booking";
import { providerStatusCountsReadModel } from "../system/provider";

describe("adminBookingStatsReadModel", () => {
  const day = (i: number) => ({ date: `2026-08-${String(i + 1).padStart(2, "0")}`, requests: 0, confirmed: 0 });
  const valid = {
    disputed: 1, confirmedLast30: 12, completedLast30: 9,
    grossLast30Minor: 1_240_000, commissionLast30Minor: 124_000, newProvidersLast30: 3,
    currency: "MZN", perDay: Array.from({ length: 30 }, (_, i) => day(i)),
  };
  it("accepts the platform's numbers with exactly thirty days", () => {
    expect(adminBookingStatsReadModel.parse(valid).perDay).toHaveLength(30);
  });
  it("refuses a chart that is not thirty days long", () => {
    expect(() => adminBookingStatsReadModel.parse({ ...valid, perDay: valid.perDay.slice(1) })).toThrow();
  });
  it("refuses negative money", () => {
    expect(() => adminBookingStatsReadModel.parse({ ...valid, commissionLast30Minor: -1 })).toThrow();
  });
});

describe("providerStatusCountsReadModel", () => {
  it("carries one count per status, all five, none negative", () => {
    const parsed = providerStatusCountsReadModel.parse({ pending: 2, active: 40, rejected: 1, suspended: 0, archived: 3 });
    expect(parsed.pending).toBe(2);
    expect(() => providerStatusCountsReadModel.parse({ pending: 2, active: 40, rejected: 1, suspended: 0 })).toThrow();
    expect(() => providerStatusCountsReadModel.parse({ pending: -1, active: 0, rejected: 0, suspended: 0, archived: 0 })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run, from `packages/shared`: `bun run test -- read-models`
Expected: FAIL — the two imports resolve to `undefined`.

- [ ] **Step 3: Write the two schemas and export them**

`packages/shared/src/read-models/system/booking/admin-booking-stats.schema.ts`:

```ts
import { z } from "zod";
import { STATS_WINDOW_DAYS, providerBookingStatsDayReadModel } from "./provider-booking.schema";

/**
 * The platform's numbers, in one read — the mirror image of
 * `providerBookingStatsReadModel`. That one shows a workspace its own share;
 * this one shows the platform what was booked in full and what it kept.
 *
 * Same window (`STATS_WINDOW_DAYS`), same per-day series, same clock on the
 * money (`COMPLETED`, by `completed_at`), so the platform's figure and the sum
 * of its providers' figures describe the same bookings. `disputed` is the one
 * count with no window: a dispute is owed a decision whenever it was opened.
 */
export const adminBookingStatsReadModel = z.object({
  /** `DISPUTED`, any date — what the administrator has to decide. */
  disputed: z.number().int().min(0),
  /** Paid inside the window, whatever happened to them since. Equals the sum of `perDay[].confirmed`. */
  confirmedLast30: z.number().int().min(0),
  completedLast30: z.number().int().min(0),
  /** Σ `price_minor` over `COMPLETED` inside the window: what customers paid. */
  grossLast30Minor: z.number().int().min(0),
  /** Σ `commission_minor` over the same bookings: what the platform kept. */
  commissionLast30Minor: z.number().int().min(0),
  /** Workspaces created inside the window, whatever their status now. */
  newProvidersLast30: z.number().int().min(0),
  currency: z.string().min(1),
  /** Oldest first, zero-filled, always `STATS_WINDOW_DAYS` long. Platform-wide. */
  perDay: z.array(providerBookingStatsDayReadModel).length(STATS_WINDOW_DAYS),
});

export type AdminBookingStatsDTO = z.infer<typeof adminBookingStatsReadModel>;
```

`packages/shared/src/read-models/system/provider/provider-status-counts.schema.ts`:

```ts
import { z } from "zod";

/**
 * How many providers stand in each status, all five named, zero when none:
 * a tile has to render a zero, and a GraphQL object cannot carry a map.
 * `pending` is the administrator's queue; the rest are the platform's shape.
 */
export const providerStatusCountsReadModel = z.object({
  pending: z.number().int().min(0),
  active: z.number().int().min(0),
  rejected: z.number().int().min(0),
  suspended: z.number().int().min(0),
  archived: z.number().int().min(0),
});

export type ProviderStatusCountsDTO = z.infer<typeof providerStatusCountsReadModel>;
```

Append to `packages/shared/src/read-models/system/booking/index.ts`: `export * from "./admin-booking-stats.schema";`
Append to `packages/shared/src/read-models/system/provider/index.ts`: `export * from "./provider-status-counts.schema";`

- [ ] **Step 4: Run the tests and typecheck**

Run, from `packages/shared`: `bun run test -- read-models && bun run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/read-models/system/booking/admin-booking-stats.schema.ts packages/shared/src/read-models/system/booking/index.ts packages/shared/src/read-models/system/provider/provider-status-counts.schema.ts packages/shared/src/read-models/system/provider/index.ts packages/shared/src/read-models/__tests__/read-models.test.ts
git commit -F - <<'EOF'
feat(shared): the platform's booking numbers and the provider counts, as read models

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v
EOF
```

---

### Task 2: `providerCountByStatusForAdmin` — wire the dead projection

**Files:**
- Modify: `packages/backend/src/modules/ntizo/read/provider/app/ports/inbound/index.ts` (the `CountProvidersByStatusPort` interface, lines 34-37)
- Modify: `packages/backend/src/modules/ntizo/read/provider/app/use-cases/list-providers-for-admin.projection.ts` (the `CountProvidersByStatusProjection` class, lines 28-33)
- Modify: `packages/backend/src/modules/ntizo/read/provider/graphql/schema/queries.ts`
- Modify: `packages/backend/src/modules/ntizo/read/provider/graphql/handlers/queries.handlers.ts`
- Modify: `packages/backend/src/modules/ntizo/read/provider/bootstrap/index.ts`
- Create: `packages/backend/src/modules/ntizo/read/provider/__tests__/count-providers-by-status.projection.test.ts`
- Modify: `packages/backend/src/modules/ntizo/read/provider/__tests__/queries.handlers.test.ts`

**Interfaces:**
- Consumes: `ProviderAdminRepositoryPort.countByStatus(): Promise<Record<string, number>>` (exists, sparse: a status with no rows is absent).
- Produces: GraphQL field `providerCountByStatusForAdmin(input: {}) { pending active rejected suspended archived }`; module member `countProvidersByStatus: CountProvidersByStatusPort` with `execute(): Promise<ProviderStatusCountsDTO>`.

- [ ] **Step 1: Write the failing projection test**

`packages/backend/src/modules/ntizo/read/provider/__tests__/count-providers-by-status.projection.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { CountProvidersByStatusProjection } from "../app/use-cases/list-providers-for-admin.projection";
import type { ProviderAdminRepositoryPort } from "../app/ports/outbound/provider-read.repository.port";

function repoAnswering(counts: Record<string, number>): ProviderAdminRepositoryPort {
  return { countByStatus: async () => counts } as unknown as ProviderAdminRepositoryPort;
}

describe("CountProvidersByStatusProjection", () => {
  it("fills the statuses the repository is silent about with zero", async () => {
    const out = await new CountProvidersByStatusProjection(repoAnswering({ pending: 2, active: 5 })).execute();
    expect(out).toEqual({ pending: 2, active: 5, rejected: 0, suspended: 0, archived: 0 });
  });

  it("answers all zeros for an empty platform", async () => {
    const out = await new CountProvidersByStatusProjection(repoAnswering({})).execute();
    expect(out).toEqual({ pending: 0, active: 0, rejected: 0, suspended: 0, archived: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run, from `packages/backend`: `bun test src/modules/ntizo/read/provider/__tests__/count-providers-by-status.projection.test.ts`
Expected: FAIL — `execute()` returns the sparse record `{ pending: 2, active: 5 }`, not the five-key object.

- [ ] **Step 3: Make the projection answer the DTO**

In `app/ports/inbound/index.ts`, change the port (add the type import at the top of the file beside its existing `@ntizo/shared/read-models` import):

```ts
import type { ProviderAdminDTO, ProviderStatusCountsDTO } from "@ntizo/shared/read-models";
// …
export interface CountProvidersByStatusPort {
  /** One count per status, all five, for the queue's badge and the dashboard. */
  execute(): Promise<ProviderStatusCountsDTO>;
}
```
(If `ProviderAdminDTO` is imported from a different line in that file, add `ProviderStatusCountsDTO` to whichever import already names `@ntizo/shared/read-models`.)

In `list-providers-for-admin.projection.ts`, replace the class and add the imports it needs:

```ts
import { ProviderStatus } from "@ntizo/shared";
import type { ProviderStatusCountsDTO } from "@ntizo/shared/read-models";
// …
/**
 * One count per status. The repository answers only the statuses that have
 * rows — a status with no providers is absent from a `GROUP BY`, not zero —
 * and the tile has to render either way, so the gaps are filled here.
 */
export class CountProvidersByStatusProjection implements CountProvidersByStatusPort {
  constructor(private readonly repo: ProviderAdminRepositoryPort) {}

  async execute(): Promise<ProviderStatusCountsDTO> {
    const counts = await this.repo.countByStatus();
    return {
      pending: counts[ProviderStatus.Pending] ?? 0,
      active: counts[ProviderStatus.Active] ?? 0,
      rejected: counts[ProviderStatus.Rejected] ?? 0,
      suspended: counts[ProviderStatus.Suspended] ?? 0,
      archived: counts[ProviderStatus.Archived] ?? 0,
    };
  }
}
```

- [ ] **Step 4: Run the projection test**

Run: `bun test src/modules/ntizo/read/provider/__tests__/count-providers-by-status.projection.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the failing handler tests**

In `packages/backend/src/modules/ntizo/read/provider/__tests__/queries.handlers.test.ts`:

(a) In `makeModule`, add one member beside `listProvidersForAdmin`:
```ts
    countProvidersByStatus: {
      async execute() {
        return { pending: 2, active: 5, rejected: 0, suspended: 0, archived: 0 };
      },
    },
```
(b) In the test "builds a handler for every read field", change `expect(handlers.length).toBe(4);` to `expect(handlers.length).toBe(5);` and its comment to `// Five: my list, my detail, the admin list, the admin detail, and the admin counts.`
(c) Append this block at the end of the file:

```ts
function ctx(over: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-session", email: null, firstName: null, lastName: null,
    role: "customer", requestId: null, ipAddress: null, userAgent: null, ...over,
  };
}

/**
 * The counts span every workspace and take no input, so the handler's role
 * check is the field's whole security surface — as `provider.allForAdmin`'s
 * is. Refused callers are refused identically, before the projection runs.
 */
describe("provider.countByStatusForAdmin", () => {
  const handlerFor = () => {
    const found = createProviderReadHandlers(makeModule()).find((h) => h.key === "provider.countByStatusForAdmin");
    if (!found) throw new Error("no handler mounted for provider.countByStatusForAdmin");
    return found;
  };

  it("answers an administrator with the five counts", async () => {
    const out = await handlerFor().handler({}, ctx({ requesterUserId: "u-admin", role: "admin" }));
    expect(out).toEqual({ pending: 2, active: 5, rejected: 0, suspended: 0, archived: 0 });
  });

  const refused = [
    { name: "a customer", over: { requesterUserId: "u-cust", role: "customer" } as const },
    { name: "a provider", over: { requesterUserId: "u-member", role: "individual_provider" } as const },
    { name: "an anonymous caller", over: { requesterUserId: null, role: "customer" } as const },
    { name: "an admin role with nobody behind it", over: { requesterUserId: null, role: "admin" } as const },
  ];
  for (const who of refused) {
    it(`refuses ${who.name} with ADMIN_ONLY`, async () => {
      await expect(handlerFor().handler({}, ctx(who.over))).rejects.toMatchObject({ code: "ADMIN_ONLY" });
    });
  }
});
```
If the file already defines a `ctx` helper or already imports `NtizoGraphqlContext`, reuse them instead of adding a second. (`NtizoGraphqlContext` is imported at line 2 of the file today.) If `handler(...)`'s first argument is typed as the field's input object, pass `{}`; if it is typed as `{ input: {} }`, pass that — match how the file's existing tests call `.handler`.

- [ ] **Step 6: Run to verify they fail**

Run: `bun test src/modules/ntizo/read/provider/__tests__/queries.handlers.test.ts`
Expected: FAIL — handler count is 4 and no handler has key `provider.countByStatusForAdmin`.

- [ ] **Step 7: Schema, handler, bootstrap**

In `graphql/schema/queries.ts`, add `providerStatusCountsReadModel` to the `@ntizo/shared/read-models` import, add the query after `getProviderDetailForAdmin`, and mount it:

```ts
/**
 * One count per status, platform-wide. Takes nothing — it spans every
 * workspace by design, so there is nothing to scope it by — and is refused
 * to everybody but an admin in the handler, exactly as `allForAdmin` is.
 * The dashboard's "providers awaiting review" and the sidebar's badge read
 * this one number, instead of the length of a page of twenty-five.
 */
export const countProvidersByStatusForAdmin = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(providerStatusCountsReadModel),
  docs: { summary: "How many providers stand in each status", tags: ["Admin"] },
});

export const providerReadSchema = defineGraphQLSchema(
  {
    provider: {
      mine: listMyProviders,
      byId: getProviderDetail,
      allForAdmin: listProvidersForAdmin,
      detailForAdmin: getProviderDetailForAdmin,
      countByStatusForAdmin: countProvidersByStatusForAdmin,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
```

In `graphql/handlers/queries.handlers.ts`: add `CountProvidersByStatusPort` to the `../../app/ports/inbound` type import; add `readonly countProvidersByStatus: CountProvidersByStatusPort;` to `ProviderReadModule`; add this handler before `.build()`:

```ts
    .handle("provider.countByStatusForAdmin", async (_args, ctx) => {
      // Stated again rather than shared with the two admin fields above, for
      // the reason they state it: two fields, two decisions.
      const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
      if (!requesterUserId || role !== "admin") {
        throw new ForbiddenError({
          message: "Only administrators may count every provider",
          code: "ADMIN_ONLY",
        });
      }
      return readModule.countProvidersByStatus.execute();
    })
```

In `bootstrap/index.ts`: import `CountProvidersByStatusProjection` from `../app/use-cases/list-providers-for-admin.projection` (same module as `ListProvidersForAdminProjection`, so extend that import) and add to `useCases`:
```ts
      countProvidersByStatus: new CountProvidersByStatusProjection(providerAdminRepository),
```

- [ ] **Step 8: Run the provider read tests, the mount gate, typecheck**

Run, from `packages/backend`: `bun test src/modules/ntizo/read/provider && bun run typecheck`
Then, from `apps/backend/api`: `bun test src/graphql/__tests__/schema-mount.test.ts && bun run typecheck`
Expected: all PASS; both typechecks clean. (The mount gate compares the SDL's leaf paths with the mounted handler keys — both now contain `provider.countByStatusForAdmin`.)

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/modules/ntizo/read/provider
git commit -F - <<'EOF'
feat(provider): providerCountByStatusForAdmin — the count that was written and never wired

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v
EOF
```

---

### Task 3: `bookingStatsForAdmin` — port, SQL, projection, field

**Files:**
- Modify: `packages/backend/src/modules/ntizo/read/booking/app/ports/outbound/booking-read.repository.port.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/infra/repositories/drizzle/booking-read.repository.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/app/use-cases/get-provider-stats.projection.ts` (export `DEFAULT_CURRENCY`)
- Create: `packages/backend/src/modules/ntizo/read/booking/app/use-cases/get-admin-stats.projection.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/graphql/schema/queries.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/graphql/handlers/queries.handlers.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/bootstrap/index.ts`
- Create: `packages/backend/src/modules/ntizo/read/booking/__tests__/get-admin-stats.projection.test.ts`
- Modify: `packages/backend/src/modules/ntizo/read/booking/__tests__/queries.handlers.test.ts`

**Interfaces:**
- Produces: `BookingReadRepositoryPort.statsForAdmin(now: Date): Promise<AdminStats>`; `GetAdminStatsProjection.execute({ now }): Promise<AdminBookingStatsDTO>`; GraphQL field `bookingStatsForAdmin(input: {})`.

- [ ] **Step 1: Write the failing projection test**

`packages/backend/src/modules/ntizo/read/booking/__tests__/get-admin-stats.projection.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { STATS_WINDOW_DAYS } from "@ntizo/shared/read-models";
import { GetAdminStatsProjection } from "../app/use-cases/get-admin-stats.projection";
import type { AdminStats, BookingReadRepositoryPort } from "../app/ports/outbound/booking-read.repository.port";

function repoAnswering(stats: AdminStats): BookingReadRepositoryPort {
  return { statsForAdmin: async () => stats } as unknown as BookingReadRepositoryPort;
}

const totals = {
  disputed: 1, confirmedLast30: 12, completedLast30: 9,
  grossLast30Minor: 1_240_000, commissionLast30Minor: 124_000, newProvidersLast30: 3,
  currency: "MZN", today: "2026-09-07",
};

describe("GetAdminStatsProjection", () => {
  it("passes the totals through and fills the thirty days, oldest first", async () => {
    const out = await new GetAdminStatsProjection(
      repoAnswering({ totals, perDay: [{ date: "2026-09-07", requests: 4, confirmed: 2 }] }),
    ).execute({ now: new Date("2026-09-07T10:00:00.000Z") });

    expect(out).toMatchObject({ disputed: 1, confirmedLast30: 12, completedLast30: 9, grossLast30Minor: 1_240_000, commissionLast30Minor: 124_000, newProvidersLast30: 3, currency: "MZN" });
    expect(out.perDay).toHaveLength(STATS_WINDOW_DAYS);
    expect(out.perDay[0]).toEqual({ date: "2026-08-09", requests: 0, confirmed: 0 });
    expect(out.perDay[STATS_WINDOW_DAYS - 1]).toEqual({ date: "2026-09-07", requests: 4, confirmed: 2 });
  });

  it("prices an empty platform in MZN", async () => {
    const out = await new GetAdminStatsProjection(
      repoAnswering({ totals: { ...totals, currency: null }, perDay: [] }),
    ).execute({ now: new Date("2026-09-07T10:00:00.000Z") });
    expect(out.currency).toBe("MZN");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run, from `packages/backend`: `bun test src/modules/ntizo/read/booking/__tests__/get-admin-stats.projection.test.ts`
Expected: FAIL — the projection module does not exist.

- [ ] **Step 3: The port**

In `booking-read.repository.port.ts`, add after the `statsForProvider` declaration (line 173):

```ts
  /**
   * The platform's own numbers, as of `now`, across every workspace. Day
   * boundaries are the platform's (`PLATFORM_TIMEZONE` in the repository),
   * not any one workspace's: an administrator's thirty days have to be one
   * span, and `listForAdmin` already compares against the bare instant for
   * the same reason. Takes no owner id, like `listForAdmin` — the handler's
   * role check is this read's whole security surface.
   */
  statsForAdmin(now: Date): Promise<AdminStats>;
```

and after the `ProviderStats` interface (line 381):

```ts
/** The platform's numbers, before the projection shapes them. Same null-safety split as `ProviderStatsRow`. */
export interface AdminStatsRow {
  disputed: number;
  confirmedLast30: number;
  completedLast30: number;
  grossLast30Minor: number;
  commissionLast30Minor: number;
  newProvidersLast30: number;
  currency: string | null;
  /** The platform's local day for `now`, `YYYY-MM-DD`. */
  today: string;
}

export interface AdminStats {
  totals: AdminStatsRow;
  perDay: ProviderStatsDayRow[];
}
```

- [ ] **Step 4: The repository method**

In `booking-read.repository.ts`: add `type AdminStats` and `type AdminStatsRow` to the port import; add the constant beside `DEFAULT_TIMEZONE` (line 421):

```ts
/**
 * The zone the platform's own days are counted in. The home market's, and
 * the same string `provider.timezone` defaults to — but a constant of its
 * own, because the two answer different questions: a workspace's dashboard
 * is cut at that workspace's midnight, the platform's at the platform's.
 */
const PLATFORM_TIMEZONE = "Africa/Maputo";
```

and add this method directly after `statsForProvider` (after line 383):

```ts
  /**
   * `statsForProvider` without the workspace: no `provider.timezone` read
   * (the platform has one zone), no `providerId` in any WHERE, and the money
   * is the gross and the platform's cut rather than the provider's share.
   * The window arithmetic is repeated rather than factored out of the method
   * above — six lines, and the two methods must be free to drift apart.
   */
  async statsForAdmin(now: Date): Promise<AdminStats> {
    const db = getDb();
    const timezone = PLATFORM_TIMEZONE;

    // ISO text cast by Postgres, never the `Date` — see `statsForProvider`.
    const at = sql`${now.toISOString()}::timestamptz`;
    const localMidnight = sql`date_trunc('day', ${at} at time zone ${timezone})`;
    const windowStart = sql`(${localMidnight} - interval '${sql.raw(String(STATS_WINDOW_DAYS - 1))} days') at time zone ${timezone}`;
    const localDate = (column: SQL<unknown> | AnyColumn) =>
      sql<string>`to_char((${column} at time zone ${timezone})::date, 'YYYY-MM-DD')`;

    const totalsQuery = db
      .select({
        disputed: sql<number>`count(*) filter (where ${booking.status} = 'DISPUTED')::int`,
        // Paid inside the window, whatever the row's status is now — the same
        // column and window the per-day `confirmed` series is bucketed on, so
        // the tile and the chart's total are one number.
        confirmedLast30: sql<number>`count(*) filter (where ${booking.paidAt} is not null and ${booking.paidAt} >= ${windowStart})::int`,
        completedLast30: sql<number>`count(*) filter (where ${booking.status} = 'COMPLETED' and ${booking.completedAt} >= ${windowStart})::int`,
        // No `::int` on the sums — `statsForProvider` says why.
        grossLast30Minor: sql<string | number>`coalesce(sum(${booking.priceMinor}) filter (where ${booking.status} = 'COMPLETED' and ${booking.completedAt} >= ${windowStart}), 0)`,
        commissionLast30Minor: sql<string | number>`coalesce(sum(${booking.commissionMinor}) filter (where ${booking.status} = 'COMPLETED' and ${booking.completedAt} >= ${windowStart}), 0)`,
        currency: sql<string | null>`max(${booking.currency})`,
      })
      .from(booking);

    const providersQuery = db
      .select({ n: sql<number>`count(*)::int` })
      .from(provider)
      .where(gte(provider.createdAt, windowStart));

    const requestsQuery = db
      .select({ date: localDate(bookingChange.changedAt), n: sql<number>`count(*)::int` })
      .from(bookingChange)
      .where(and(eq(bookingChange.reason, SUBMITTED_BY_CUSTOMER), gte(bookingChange.changedAt, windowStart)))
      .groupBy(sql`1`);

    const confirmedQuery = db
      .select({ date: localDate(booking.paidAt), n: sql<number>`count(*)::int` })
      .from(booking)
      .where(and(isNotNull(booking.paidAt), gte(booking.paidAt, windowStart)))
      .groupBy(sql`1`);

    const todayQuery = db.select({ today: localDate(at) }).from(sql`(select 1) as one`);

    const [totalsRows, providerRows, requestRows, confirmedRows, todayRows] = await Promise.all([
      totalsQuery,
      providersQuery,
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

    const row: AdminStatsRow = {
      disputed: Number(totals?.disputed ?? 0),
      confirmedLast30: Number(totals?.confirmedLast30 ?? 0),
      completedLast30: Number(totals?.completedLast30 ?? 0),
      grossLast30Minor: Number(totals?.grossLast30Minor ?? 0),
      commissionLast30Minor: Number(totals?.commissionLast30Minor ?? 0),
      newProvidersLast30: Number(providerRows[0]?.n ?? 0),
      currency: totals?.currency ?? null,
      today: todayRows[0]?.today ?? new Date(now).toISOString().slice(0, 10),
    };
    return { totals: row, perDay: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) };
  }
```

`and`, `eq`, `gte`, `isNotNull`, `sql`, `SQL`, `AnyColumn`, `booking`, `bookingChange`, `provider`, `STATS_WINDOW_DAYS`, `SUBMITTED_BY_CUSTOMER` are all already imported or declared in this file.

- [ ] **Step 5: The projection**

In `get-provider-stats.projection.ts`, export the currency constant: change `const DEFAULT_CURRENCY = "MZN";` to `export const DEFAULT_CURRENCY = "MZN";`.

Create `get-admin-stats.projection.ts`:

```ts
import type { AdminBookingStatsDTO } from "@ntizo/shared/read-models";
import type { BookingReadRepositoryPort } from "../ports/outbound/booking-read.repository.port";
import { DEFAULT_CURRENCY, fillDays } from "./get-provider-stats.projection";

/**
 * The administrator's one read — one repository call, for the reason the
 * provider's projection gives: a dashboard fetched a card at a time shows
 * the platform mid-blink. The day-filling is the provider's own, because
 * the platform's chart is the same thirty buckets.
 */
export class GetAdminStatsProjection {
  constructor(private readonly repo: BookingReadRepositoryPort) {}

  async execute(input: { now: Date }): Promise<AdminBookingStatsDTO> {
    const { totals, perDay } = await this.repo.statsForAdmin(input.now);
    return {
      disputed: totals.disputed,
      confirmedLast30: totals.confirmedLast30,
      completedLast30: totals.completedLast30,
      grossLast30Minor: totals.grossLast30Minor,
      commissionLast30Minor: totals.commissionLast30Minor,
      newProvidersLast30: totals.newProvidersLast30,
      currency: totals.currency ?? DEFAULT_CURRENCY,
      perDay: fillDays(totals.today, perDay),
    };
  }
}
```

- [ ] **Step 6: Run the projection test**

Run: `bun test src/modules/ntizo/read/booking/__tests__/get-admin-stats.projection.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 7: Write the failing handler tests**

In `packages/backend/src/modules/ntizo/read/booking/__tests__/queries.handlers.test.ts`:

(a) In the `bookingReadSchema` mount test, the sorted key list becomes:
```ts
      "byId",
      "byIdForProvider",
      "forProvider",
      "mine",
      "needsAttentionForAdmin",
      "statsForAdmin",
      "statsForProvider",
```
(b) Above `makeModule`, add a fixture, and extend `makeModule` so both admin projections are spies:

```ts
/** A valid, empty platform: the field's own output schema validates this shape. */
const EMPTY_STATS = {
  disputed: 0, confirmedLast30: 0, completedLast30: 0,
  grossLast30Minor: 0, commissionLast30Minor: 0, newProvidersLast30: 0, currency: "MZN",
  perDay: Array.from({ length: 30 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, "0")}`, requests: 0, confirmed: 0 })),
};

function makeModule(listForAdmin = spyProjection(), statsForAdmin = spyProjection(EMPTY_STATS)) {
  return {
    listForAdmin,
    statsForAdmin,
    module: {
      bookingRead: { adapters: {}, useCases: { listForAdmin, statsForAdmin } },
    } as unknown as BookingReadModule,
  };
}
```
(c) Append after the `booking.needsAttentionForAdmin` describe:

```ts
/**
 * The platform's numbers: the same guard as the queue, for the same reason —
 * `GetAdminStatsProjection` takes no requester and the repository no owner
 * id, so this `requireAdmin` is the entire security surface of the field.
 */
describe("booking.statsForAdmin", () => {
  const handlerFor = (mod: BookingReadModule) => {
    const found = createBookingReadHandlers(mod).find((h) => h.key === "booking.statsForAdmin");
    if (!found) throw new Error("no handler mounted for booking.statsForAdmin");
    return found;
  };
  const adminCtx = () => ctx({ requesterUserId: "u-admin", role: "admin" });

  it("asks the projection for the platform's numbers as of now", async () => {
    const { module, statsForAdmin } = makeModule();
    const before = Date.now();
    const out = await handlerFor(module).handler({}, adminCtx());
    const after = Date.now();

    expect(out).toEqual(EMPTY_STATS);
    expect(statsForAdmin.calls).toHaveLength(1);
    const { now } = statsForAdmin.calls[0] as { now: Date };
    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });

  const refused = [
    { name: "a customer", over: { requesterUserId: "u-cust", role: "customer" } as const },
    { name: "a provider", over: { requesterUserId: "u-member", role: "individual_provider" } as const },
    { name: "an anonymous caller", over: { requesterUserId: null, role: "customer" } as const },
    { name: "an admin role with nobody behind it", over: { requesterUserId: null, role: "admin" } as const },
  ];
  for (const who of refused) {
    it(`refuses ${who.name} with ADMIN_ONLY, before the projection runs`, async () => {
      const { module, statsForAdmin } = makeModule();
      await expect(handlerFor(module).handler({}, ctx(who.over))).rejects.toMatchObject({ code: "ADMIN_ONLY" });
      expect(statsForAdmin.calls).toEqual([]);
    });
  }
});
```
Match the first argument of `.handler(...)` to what the file's `needsAttentionForAdmin` tests pass (they pass the input object directly, e.g. `{ tab: "disputed" }`; here the input is `{}`).

- [ ] **Step 8: Run to verify they fail**

Run: `bun test src/modules/ntizo/read/booking/__tests__/queries.handlers.test.ts`
Expected: FAIL — mount list lacks `statsForAdmin`; no handler with that key.

- [ ] **Step 9: Schema, handler, bootstrap**

In `graphql/schema/queries.ts`: add `adminBookingStatsReadModel` to the `@ntizo/shared/read-models` import; add after `listAdminBookings`:

```ts
/**
 * The platform's numbers, in one read. Takes nothing, for the reason
 * `listAdminBookings` takes no workspace: it spans all of them by design,
 * and who may ask is decided in the handler by the session's role.
 */
export const getAdminStats = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(adminBookingStatsReadModel),
  docs: { summary: "The platform's booking numbers", tags: ["Admin", "Booking"] },
});
```
and mount it in `bookingReadSchema` after `needsAttentionForAdmin`: `statsForAdmin: getAdminStats,`.

In `graphql/handlers/queries.handlers.ts`, add after the `booking.needsAttentionForAdmin` handler (before `.build()`):

```ts
    .handle("booking.statsForAdmin", async (_args, ctx) => {
      // First line, for the reason the queue's handler gives: nothing below
      // this takes a requester, so nothing below this can refuse anybody.
      requireAdmin(ctx);
      return uc.statsForAdmin.execute({ now: new Date() });
    })
```

In `bootstrap/index.ts`: import `GetAdminStatsProjection` from `../app/use-cases/get-admin-stats.projection` and add `statsForAdmin: new GetAdminStatsProjection(repo),` to `useCases` after `listForAdmin`.

- [ ] **Step 10: Run the booking read tests without the database, the mount gate, typecheck, lint**

Run, from `packages/backend`: `bun test src/modules/ntizo/read/booking/__tests__/queries.handlers.test.ts src/modules/ntizo/read/booking/__tests__/get-admin-stats.projection.test.ts src/modules/ntizo/read/booking/__tests__/provider-bookings.projection.test.ts && bun run typecheck && bun run lint`
Then, from `apps/backend/api`: `bun test src/graphql/__tests__/schema-mount.test.ts && bun run typecheck`
Expected: all PASS; typechecks clean; lint no new problems.

- [ ] **Step 11: Commit**

```bash
git add packages/backend/src/modules/ntizo/read/booking
git commit -F - <<'EOF'
feat(booking): bookingStatsForAdmin — the platform's thirty days, in one read

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v
EOF
```

---

### Task 4: `statsForAdmin` against the real dev database

**Files:**
- Create: `packages/backend/src/modules/ntizo/read/booking/__tests__/admin-stats.repository.test.ts`

**Interfaces:**
- Consumes: `DrizzleBookingReadRepository.statsForAdmin(now)` from Task 3; the seeding helpers are copied from `provider-bookings.repository.test.ts` (same directory), not imported — that file exports nothing.

- [ ] **Step 1: Write the integration test**

```ts
/**
 * `DrizzleBookingReadRepository.statsForAdmin` against the real dev database,
 * by the mechanism `provider-bookings.repository.test.ts` beside it uses.
 *
 * **This read is deliberately unscoped**, and a sum cannot be filtered down
 * to this file's rows the way `admin-bookings.repository.test.ts` filters its
 * lists. So every assertion here is a *delta*: the numbers before this file
 * seeds anything, then after, and the difference is what the fixtures are
 * worth. Two worktrees share one `DEV_DB_URL`; a sibling committing a
 * `COMPLETED` booking in the seconds between the two reads would move a
 * delta, and that is the one way this file can fail without being wrong.
 *
 * The fixture is one workspace with two bookings: one that actually happened
 * (80 000 at 1 000 bps — a commission of 8 000, three distinct numbers so a
 * query summing the wrong column is recognisable), completed two days ago,
 * and one that was paid and then disputed, priced 55 000 so a gross that
 * counted a disputed booking would be off by a number nothing else is.
 * Both are submitted through the aggregate and carry the
 * `submitted_by_customer` change row, so both are requests in the chart.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as authSchema from "../../../../better-auth/infrastructure/database/schema";
import { __runWithTransactionContextForTests } from "../../../../../shared/infrastructure/database/tx-context";
import { category, service, serviceOption } from "../../../shared/infrastructure/database/catalog/schemas";
import { provider, providerMember } from "../../../shared/infrastructure/database/provider/schemas";
import { profile, user } from "../../../shared/infrastructure/database/user/schemas";
import { booking } from "../../../shared/infrastructure/database/booking/schemas";
import { BookingStatus } from "../../../shared/infrastructure/database/booking/enums";
import { Booking } from "../../../bounded-contexts/booking/domain/aggregates/booking.aggregate";
import { DrizzleBookingRepository } from "../../../bounded-contexts/booking/infrastructure/repositories/drizzle/booking.repository";
import { DrizzleBookingReadRepository } from "../infra/repositories/drizzle/booking-read.repository";
import type { AdminStats } from "../app/ports/outbound/booking-read.repository.port";
import {
  bestEffortCleanup,
  DEV_DB_COLD_START_TIMEOUT_MS,
  openDevDbConnection,
} from "../../../shared/infrastructure/database/__tests__/dev-db-test-connection";

setDefaultTimeout(DEV_DB_COLD_START_TIMEOUT_MS);

const sql = openDevDbConnection();
const db = drizzle(sql, { schema: authSchema });

const writeRepo = new DrizzleBookingRepository();
const readRepo = new DrizzleBookingReadRepository();
const now = new Date();
const suffix = crypto.randomUUID();

let customerId: string;
let ownerUserId: string;
let providerId: string;
let memberId: string;
let categoryId: string;
let serviceId: string;
let serviceOptionId: string;
let before: AdminStats;

beforeAll(async () => {
  before = await __runWithTransactionContextForTests(db, () => readRepo.statsForAdmin(now));

  customerId = crypto.randomUUID();
  ownerUserId = crypto.randomUUID();
  await db.insert(user).values([
    { id: customerId, email: `admin-stats-customer-${suffix}@ntizo.test`, role: "customer", status: "active" },
    { id: ownerUserId, email: `admin-stats-owner-${suffix}@ntizo.test`, role: "customer", status: "active" },
  ]);
  await db.insert(profile).values([
    { userId: customerId, firstName: "Ana", lastName: "Machava", phoneNumber: "+258840000002" },
    { userId: ownerUserId, firstName: "Beatriz", lastName: "Cossa" },
  ]);

  const [providerRow] = await db
    .insert(provider)
    .values({
      ownerUserId,
      type: "individual",
      name: "Admin Stats Test Provider",
      slug: `admin-stats-test-${suffix}`,
      status: "active",
      timezone: "Africa/Maputo",
    })
    .returning({ id: provider.id });
  providerId = providerRow!.id;

  const [memberRow] = await db
    .insert(providerMember)
    .values({ providerId, userId: ownerUserId, role: "owner" })
    .returning({ id: providerMember.id });
  memberId = memberRow!.id;

  const [categoryRow] = await db
    .insert(category)
    .values({ code: `admin-stats-test-${suffix}` })
    .returning({ id: category.id });
  categoryId = categoryRow!.id;

  const [serviceRow] = await db
    .insert(service)
    .values({ providerId, categoryId, sourceLocale: "pt-MZ", locationType: "at_customer", status: "published" })
    .returning({ id: service.id });
  serviceId = serviceRow!.id;

  const [optionRow] = await db
    .insert(serviceOption)
    .values({ serviceId, pricingMode: "fixed", amountMinor: 80_000, durationMinutes: 60 })
    .returning({ id: serviceOption.id });
  serviceOptionId = optionRow!.id;

  await __runWithTransactionContextForTests(db, async () => {
    // Happened: booked four days ago, worked three, completed two.
    const submittedDone = (
      await writeRepo.insert(
        Booking.create(bookingInput({ priceMinor: 80_000, startsAt: daysAgo(3), expiresAt: daysAgo(4) })),
        1,
      )
    ).submit(daysAgo(4), daysAgo(3.9), address(), null);
    await commit(submittedDone, BookingStatus.Draft);
    await recordSubmission(submittedDone.id as string);
    const acceptedDone = submittedDone.accept(daysAgo(4), daysAgo(3.8));
    await commit(acceptedDone, BookingStatus.AwaitingProvider);
    const paidDone = acceptedDone.markPaid(`mpesa-done-${suffix}`, daysAgo(4));
    await commit(paidDone, BookingStatus.PendingPayment);
    // Written, not transitioned — the same single hop the provider file writes.
    await db
      .update(booking)
      .set({ status: BookingStatus.Completed, completedAt: daysAgo(2) })
      .where(eq(booking.id, paidDone.id as string));

    // Paid yesterday, disputed today. Counts as confirmed in the window and
    // as a dispute; must not count as gross.
    const submittedDisputed = (
      await writeRepo.insert(
        Booking.create(bookingInput({ priceMinor: 55_000, startsAt: daysAgo(1), expiresAt: daysAgo(1.5) })),
        1,
      )
    ).submit(daysAgo(1.5), daysAgo(1.4), address(), null);
    await commit(submittedDisputed, BookingStatus.Draft);
    await recordSubmission(submittedDisputed.id as string);
    const acceptedDisputed = submittedDisputed.accept(daysAgo(1.5), daysAgo(1.3));
    await commit(acceptedDisputed, BookingStatus.AwaitingProvider);
    const paidDisputed = acceptedDisputed.markPaid(`mpesa-disputed-${suffix}`, daysAgo(1));
    await commit(paidDisputed, BookingStatus.PendingPayment);
    await db
      .update(booking)
      .set({ status: BookingStatus.Disputed, disputedAt: now })
      .where(eq(booking.id, paidDisputed.id as string));
  });
});

afterAll(async () => {
  await bestEffortCleanup([
    () => db.delete(booking).where(eq(booking.providerId, providerId)),
    () => db.delete(serviceOption).where(eq(serviceOption.id, serviceOptionId)),
    () => db.delete(service).where(eq(service.id, serviceId)),
    () => db.delete(category).where(eq(category.id, categoryId)),
    () => db.delete(providerMember).where(eq(providerMember.id, memberId)),
    () => db.delete(provider).where(eq(provider.id, providerId)),
    () => db.delete(profile).where(eq(profile.userId, customerId)),
    () => db.delete(profile).where(eq(profile.userId, ownerUserId)),
    () => db.delete(user).where(eq(user.id, customerId)),
    () => db.delete(user).where(eq(user.id, ownerUserId)),
    () => sql.end({ timeout: 5 }),
  ]);
}, DEV_DB_COLD_START_TIMEOUT_MS);

function bookingInput(
  overrides: Partial<Parameters<typeof Booking.create>[0]> = {},
): Parameters<typeof Booking.create>[0] {
  return {
    customerId,
    providerId,
    serviceId,
    serviceOptionId,
    providerMemberId: memberId,
    startsAt: new Date("2027-03-01T09:00:00.000Z"),
    durationMinutes: 60,
    priceMinor: 80_000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName: "Depilação",
    providerName: "Admin Stats Test Provider",
    providerSlug: `admin-stats-test-${suffix}`,
    optionName: "Standard",
    description: null,
    expiresAt: new Date("2027-02-28T09:30:00.000Z"),
    ...overrides,
  };
}

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

function address() {
  return {
    label: "Casa",
    line: "Av. Julius Nyerere 123",
    city: "Maputo",
    district: "Sommerschield",
    directions: "Portão azul",
    lat: -25.9655,
    lng: 32.5832,
  };
}

async function recordSubmission(bookingId: string): Promise<void> {
  await writeRepo.appendChange({
    bookingId,
    changedByUserId: customerId,
    reason: "submitted_by_customer",
    previousStartsAt: null,
    previousEndsAt: null,
    previousProviderMemberId: null,
    previousPriceMinor: null,
  });
}

async function commit(entity: Booking, expected: Booking["status"]): Promise<void> {
  const written = await writeRepo.save(entity, expected);
  if (!written) throw new Error(`fixture: save of ${entity.id} expecting ${expected} matched no row`);
}

describe("DrizzleBookingReadRepository.statsForAdmin", () => {
  test("counts the platform, and its money is the stored gross and the stored commission", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const after = await readRepo.statsForAdmin(now);
      expect(after.totals.disputed - before.totals.disputed).toBe(1);
      expect(after.totals.confirmedLast30 - before.totals.confirmedLast30).toBe(2);
      expect(after.totals.completedLast30 - before.totals.completedLast30).toBe(1);
      expect(after.totals.grossLast30Minor - before.totals.grossLast30Minor).toBe(80_000);
      expect(after.totals.commissionLast30Minor - before.totals.commissionLast30Minor).toBe(8_000);
      expect(after.totals.newProvidersLast30 - before.totals.newProvidersLast30).toBe(1);
      expect(after.totals.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(after.totals.currency).toBe("MZN");
    });
  });

  test("the chart's confirmed series and the confirmed count are one number", async () => {
    await __runWithTransactionContextForTests(db, async () => {
      const after = await readRepo.statsForAdmin(now);
      const confirmed = after.perDay.reduce((n, d) => n + d.confirmed, 0);
      const requests = after.perDay.reduce((n, d) => n + d.requests, 0);
      const requestsBefore = before.perDay.reduce((n, d) => n + d.requests, 0);
      expect(confirmed).toBe(after.totals.confirmedLast30);
      expect(requests - requestsBefore).toBe(2);
      // Sparse and sorted: the projection fills the gaps, the repository does not.
      expect(after.perDay.map((d) => d.date)).toEqual([...after.perDay.map((d) => d.date)].sort());
    });
  });
});
```

- [ ] **Step 2: Run it**

Run, from `packages/backend`: `bun test src/modules/ntizo/read/booking/__tests__/admin-stats.repository.test.ts`
Expected: PASS, 2 tests (the first query may take up to ~25 s while the dev database wakes). If the sums fail by a round number that is not 80 000 or 8 000, re-run once before investigating: the file's doc comment names the race.

- [ ] **Step 3: Run the whole backend suite and compare with the baseline**

Run: `bun run test 2>&1 | tail -4`
Expected: pass count up by the tests this plan added so far; fail count no higher than the 5 pre-existing failures.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/modules/ntizo/read/booking/__tests__/admin-stats.repository.test.ts
git commit -F - <<'EOF'
test(booking): statsForAdmin against the dev database, as deltas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v
EOF
```

---

### Task 5: The tile, the chart and the greeting leave the provider feature

**Files:**
- Move: `apps/frontend/web/src/features/provider/ui/overview-cards.tsx` → `apps/frontend/web/src/shared/components/stat-card.tsx`
- Move: `apps/frontend/web/src/features/provider/ui/overview-chart.tsx` → `apps/frontend/web/src/shared/components/activity-chart.tsx`
- Move: `apps/frontend/web/src/features/provider/domain/activity-chart.ts` → `apps/frontend/web/src/shared/domain/activity-chart.ts`
- Move: `apps/frontend/web/src/features/provider/domain/__tests__/activity-chart.test.ts` → `apps/frontend/web/src/shared/domain/__tests__/activity-chart.test.ts`
- Move: `apps/frontend/web/src/features/provider/domain/greeting.ts` → `apps/frontend/web/src/shared/domain/greeting.ts`
- Move: `apps/frontend/web/src/features/provider/domain/__tests__/greeting.test.ts` → `apps/frontend/web/src/shared/domain/__tests__/greeting.test.ts`
- Modify: `apps/frontend/web/src/features/provider/ui/overview.tsx`
- Modify: `apps/frontend/web/src/features/bookings/ui/booking-page.tsx` (one comment, line 235, names `overview-cards.tsx`)

**Interfaces:**
- Produces: `StatCard` and `CARD_LINK` from `@/shared/components/stat-card`; `ActivityChart` and `ActivityChartLabels` from `@/shared/components/activity-chart`; `greetingKey` from `@/shared/domain/greeting`; the chart geometry from `@/shared/domain/activity-chart`.
- `ActivityChart` props: `{ days: readonly ProviderBookingStatsDayDTO[]; locale: string; labels: ActivityChartLabels; dayLabel: (date: string, day: ProviderBookingStatsDayDTO) => string }` — the chart no longer reads a namespace; the caller hands it its words.

- [ ] **Step 1: Move the files with git**

Run, from the worktree root:
```bash
mkdir -p apps/frontend/web/src/shared/domain/__tests__
git mv apps/frontend/web/src/features/provider/ui/overview-cards.tsx apps/frontend/web/src/shared/components/stat-card.tsx
git mv apps/frontend/web/src/features/provider/ui/overview-chart.tsx apps/frontend/web/src/shared/components/activity-chart.tsx
git mv apps/frontend/web/src/features/provider/domain/activity-chart.ts apps/frontend/web/src/shared/domain/activity-chart.ts
git mv apps/frontend/web/src/features/provider/domain/__tests__/activity-chart.test.ts apps/frontend/web/src/shared/domain/__tests__/activity-chart.test.ts
git mv apps/frontend/web/src/features/provider/domain/greeting.ts apps/frontend/web/src/shared/domain/greeting.ts
git mv apps/frontend/web/src/features/provider/domain/__tests__/greeting.test.ts apps/frontend/web/src/shared/domain/__tests__/greeting.test.ts
```

- [ ] **Step 2: Run the provider Overview test to see it fail**

Run, from `apps/frontend/web`: `bun run vitest run src/features/provider/ui/__tests__/overview.test.tsx`
Expected: FAIL — `overview.tsx` cannot resolve `./overview-cards`, `./overview-chart`, `../domain/greeting`.

- [ ] **Step 3: The tile exports its link style**

In `shared/components/stat-card.tsx`, add above `StatCard` (keep everything else as it is):

```tsx
/** A card's way out, at caption size: small enough not to compete with the number. */
export const CARD_LINK = "type-caption font-semibold text-[var(--color-primary)] hover:underline";
```

- [ ] **Step 4: The chart takes its words from the caller**

Edit `shared/components/activity-chart.tsx`:

- Delete `import { useTranslation } from "react-i18next";`.
- Change the domain import to `} from "@/shared/domain/activity-chart";`.
- Add, above the component:

```tsx
/** The chart's own words, handed in: the provider's namespace and the admin's differ, the figure does not. */
export interface ActivityChartLabels {
  title: string;
  range: string;
  requests: string;
  confirmed: string;
  empty: string;
  /** The accessible table's first column header. */
  day: string;
}
```

- Change the signature to:

```tsx
export function ActivityChart({
  days,
  locale,
  labels,
  dayLabel,
}: {
  days: readonly ProviderBookingStatsDayDTO[];
  locale: string;
  labels: ActivityChartLabels;
  /** The tooltip's sentence for one day; `date` is already formatted for the reader. */
  dayLabel: (date: string, day: ProviderBookingStatsDayDTO) => string;
}) {
```

- Delete `const { t } = useTranslation("provider");`.
- Replace the local `dayLabel` closure (the `const dayLabel = (d: ProviderBookingStatsDayDTO) => t("overview.chartDayLabel", {...})` block) with:

```tsx
  const formatDay = (d: ProviderBookingStatsDayDTO) =>
    dayLabel(
      new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(
        new Date(`${d.date}T00:00:00.000Z`),
      ),
      d,
    );
```

- Replace every `t("overview.chartTitle")` with `labels.title`, `t("overview.chartRange")` with `labels.range`, `t("overview.chartRequests")` with `labels.requests`, `t("overview.chartConfirmed")` with `labels.confirmed`, `t("overview.chartEmpty")` with `labels.empty`, `t("overview.chartTableDay")` with `labels.day`, and the tooltip's `{dayLabel(groups[hovered]!.day)}` with `{formatDay(groups[hovered]!.day)}`. After this, the file contains no `t(` call.

- [ ] **Step 5: The provider Overview follows the moves**

In `features/provider/ui/overview.tsx`:

- Replace the three imports `import { greetingKey } from "../domain/greeting";`, `import { ActivityChart } from "./overview-chart";`, `import { StatCard } from "./overview-cards";` with:

```tsx
import type { ProviderBookingStatsDayDTO } from "@ntizo/shared/read-models";
import { ActivityChart } from "@/shared/components/activity-chart";
import { CARD_LINK as LINK } from "@/shared/components/stat-card";
import { StatCard } from "@/shared/components/stat-card";
import { greetingKey } from "@/shared/domain/greeting";
```
(Merge the two `stat-card` imports into one line: `import { CARD_LINK as LINK, StatCard } from "@/shared/components/stat-card";`.)

- Delete the local `const LINK = …` declaration and its comment.
- Replace `<ActivityChart days={s?.perDay ?? []} locale={locale} />` with:

```tsx
      <ActivityChart
        days={s?.perDay ?? []}
        locale={locale}
        labels={{
          title: t("overview.chartTitle"),
          range: t("overview.chartRange"),
          requests: t("overview.chartRequests"),
          confirmed: t("overview.chartConfirmed"),
          empty: t("overview.chartEmpty"),
          day: t("overview.chartTableDay"),
        }}
        dayLabel={(date, d: ProviderBookingStatsDayDTO) =>
          t("overview.chartDayLabel", { date, requests: d.requests, confirmed: d.confirmed })
        }
      />
```

In `features/bookings/ui/booking-page.tsx` line 235, change the comment's `overview-cards.tsx` to `stat-card.tsx`.

- [ ] **Step 6: Run the moved tests, the provider Overview test, typecheck, lint**

Run, from `apps/frontend/web`: `bun run vitest run src/shared/domain src/features/provider/ui/__tests__/overview.test.tsx && bun run typecheck && bun run lint`
Expected: PASS (the Overview's DOM is unchanged, so its 16 tests pass untouched); typecheck clean; lint no new problems — in particular no `boundaries/element-types` error, since `shared/components` is `ui` and `shared/domain` is `domain`.

- [ ] **Step 7: Commit**

```bash
git add -A apps/frontend/web/src/shared/components/stat-card.tsx apps/frontend/web/src/shared/components/activity-chart.tsx apps/frontend/web/src/shared/domain apps/frontend/web/src/features/provider apps/frontend/web/src/features/bookings/ui/booking-page.tsx
git commit -F - <<'EOF'
refactor(web): the stat tile, the activity chart and the greeting move to shared

The admin dashboard draws the same tile and the same chart; an admin
screen importing a provider screen is the wrong edge. The chart takes its
words from the caller now instead of reading the provider namespace.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v
EOF
```
(`git add -A <paths>` limited to those paths stages the renames as renames; it is not a bare `git add -A`.)

---

### Task 6: The admin's reads — repository, hooks, the exact pending count

**Files:**
- Create: `apps/frontend/web/src/features/admin/dashboard/data/admin-dashboard.repository.ts`
- Create: `apps/frontend/web/src/features/admin/dashboard/domain/needs-you.ts`
- Create: `apps/frontend/web/src/features/admin/dashboard/domain/__tests__/needs-you.test.ts`
- Create: `apps/frontend/web/src/features/admin/dashboard/viewmodel/use-admin-dashboard.ts`
- Modify: `apps/frontend/web/src/features/admin/providers/data/admin-provider.repository.ts` (add `counts`)
- Modify: `apps/frontend/web/src/features/admin/providers/viewmodel/use-admin-providers.ts` (add `limit`, add `useProviderStatusCounts`)
- Modify: `apps/frontend/web/src/features/admin/contact/data/admin-contact.repository.ts` (add `openCount`)
- Modify: `apps/frontend/web/src/features/admin/contact/viewmodel/use-admin-contact.ts` (add `useContactOpenCount`)
- Modify: `apps/frontend/web/src/shared/components/console/console-counts.tsx`
- Modify: `apps/frontend/web/src/shared/components/console/console-counts.test.tsx`

**Interfaces:**
- Consumes: GraphQL fields from Tasks 2 and 3; `adminSupportQueries.openCount()` / `useSupportOpenCount()` (exist).
- Produces: `useAdminStats()`, `useLatestApplications()`, `useNeedsYou()`, `useProviderStatusCounts()`, `useContactOpenCount()`, `needsYou(counts)`, `LATEST_APPLICATIONS_LIMIT`.

- [ ] **Step 1: Write the failing domain test**

`features/admin/dashboard/domain/__tests__/needs-you.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { needsYou } from "../needs-you";

describe("needsYou", () => {
  it("shows the first three sources above zero, in priority order", () => {
    expect(needsYou({ disputed: 2, providers: 4, support: 1, contact: 3 })).toEqual([
      { key: "disputed", count: 2 },
      { key: "providers", count: 4 },
      { key: "support", count: 1 },
    ]);
  });

  it("lets a lower source in when a higher one is quiet", () => {
    expect(needsYou({ disputed: 0, providers: 4, support: 0, contact: 3 })).toEqual([
      { key: "providers", count: 4 },
      { key: "contact", count: 3 },
    ]);
  });

  it("shows nothing on a quiet day, and nothing for a count that has not arrived", () => {
    expect(needsYou({ disputed: 0, providers: 0, support: 0, contact: 0 })).toEqual([]);
    expect(needsYou({ disputed: undefined, providers: undefined })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run, from `apps/frontend/web`: `bun run vitest run src/features/admin/dashboard`
Expected: FAIL — module not found.

- [ ] **Step 3: The domain**

`features/admin/dashboard/domain/needs-you.ts`:

```ts
/**
 * What is owed, in the order somebody is waiting on it: a customer whose
 * money is in dispute, a business waiting to trade, a person waiting on
 * support, a person who wrote in. Four sources, and the row shows the first
 * three that are above zero — the spec's "at most three cards, each only
 * when its count is above zero", applied to more sources than three.
 */
export type NeedsYouKey = "disputed" | "providers" | "support" | "contact";

export interface NeedsYouItem {
  key: NeedsYouKey;
  count: number;
}

export const NEEDS_YOU_ORDER: readonly NeedsYouKey[] = ["disputed", "providers", "support", "contact"];
export const NEEDS_YOU_LIMIT = 3;

/** How many applications the dashboard lists: enough to see who is new, few enough to stay a glance. */
export const LATEST_APPLICATIONS_LIMIT = 5;

export function needsYou(counts: Partial<Record<NeedsYouKey, number | undefined>>): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];
  for (const key of NEEDS_YOU_ORDER) {
    const count = counts[key];
    if (count !== undefined && count > 0) items.push({ key, count });
  }
  return items.slice(0, NEEDS_YOU_LIMIT);
}
```

- [ ] **Step 4: Run the domain test**

Run: `bun run vitest run src/features/admin/dashboard`
Expected: PASS, 3 tests.

- [ ] **Step 5: The repositories**

`features/admin/dashboard/data/admin-dashboard.repository.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import type { AdminBookingStatsDTO } from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

const STATS = `
  query BookingStatsForAdmin {
    bookingStatsForAdmin(input: {}) {
      disputed confirmedLast30 completedLast30 grossLast30Minor commissionLast30Minor
      newProvidersLast30 currency
      perDay { date requests confirmed }
    }
  }`;

export const adminDashboardQueries = {
  /**
   * The platform's numbers. Under the admin bookings prefix on purpose: a
   * dispute decided on the queue invalidates `["admin", "bookings"]`, and the
   * dashboard's dispute count has to follow it down.
   */
  stats: () =>
    queryOptions({
      queryKey: ["admin", "bookings", "stats"] as const,
      queryFn: async (): Promise<AdminBookingStatsDTO> => {
        const d = await sessionGraphql<{ bookingStatsForAdmin: AdminBookingStatsDTO }>(STATS, {});
        return d.bookingStatsForAdmin;
      },
      staleTime: 30_000,
    }),
};
```

In `features/admin/providers/data/admin-provider.repository.ts`: add `import type { ProviderStatusCountsDTO } from "@ntizo/shared/read-models";`, the document, and the query:

```ts
const COUNTS = `
  query ProviderCountByStatusForAdmin {
    providerCountByStatusForAdmin(input: {}) { pending active rejected suspended archived }
  }`;
```
and inside `adminProviderQueries`, after `all`:
```ts
  /**
   * One count per status — the sidebar's badge and the dashboard read
   * `pending` from here, instead of measuring a page of twenty-five. Under
   * the list's prefix, so a decision on a provider refreshes both.
   */
  counts: () =>
    queryOptions({
      queryKey: ["admin", "providers", "counts"] as const,
      queryFn: async (): Promise<ProviderStatusCountsDTO> => {
        const d = await sessionGraphql<{ providerCountByStatusForAdmin: ProviderStatusCountsDTO }>(COUNTS, {});
        return d.providerCountByStatusForAdmin;
      },
      staleTime: 30_000,
    }),
```

In `features/admin/providers/viewmodel/use-admin-providers.ts`: widen the input and add the hook:

```ts
export function useAdminProviders(input: {
  status?: string;
  search?: string;
  /** Fewer than the page when a caller wants a glance — the dashboard asks for five. */
  limit?: number;
}) {
  // Server-side, not filtered in the browser: this is the one list that grows
  // without bound, and deciding which fifty of ten thousand to draw is not a
  // decision the browser can make.
  return useQuery(adminProviderQueries.all(input));
}

/** How many providers stand in each status; `pending` is the queue. */
export function useProviderStatusCounts() {
  return useQuery(adminProviderQueries.counts());
}
```

In `features/admin/contact/data/admin-contact.repository.ts`, inside `adminContactQueries` after `all`:

```ts
  /**
   * `openCount` rides on the page payload, so the cheapest way to read it
   * alone is a page of one. Under the same prefix, so resolving a request
   * refreshes it with the list.
   */
  openCount: () =>
    queryOptions({
      queryKey: ["admin", "contact", "openCount"] as const,
      queryFn: async (): Promise<number> => {
        const d = await sessionGraphql<{ contactRequestAllForAdmin: ContactRequestAdminPageDTO }>(ALL, {
          input: { limit: 1, offset: 0 },
        });
        return d.contactRequestAllForAdmin.openCount;
      },
      staleTime: 30_000,
    }),
```

In `features/admin/contact/viewmodel/use-admin-contact.ts`, add:

```ts
export function useContactOpenCount() {
  return useQuery(adminContactQueries.openCount());
}
```

- [ ] **Step 6: The viewmodel**

`features/admin/dashboard/viewmodel/use-admin-dashboard.ts`:

```ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useContactOpenCount } from "@/features/admin/contact/viewmodel/use-admin-contact";
import { useAdminProviders, useProviderStatusCounts } from "@/features/admin/providers/viewmodel/use-admin-providers";
import { useSupportOpenCount } from "@/features/admin/support/viewmodel/use-admin-support";
import { adminDashboardQueries } from "../data/admin-dashboard.repository";
import { LATEST_APPLICATIONS_LIMIT, needsYou, type NeedsYouItem } from "../domain/needs-you";

/** Every number the tiles and the chart draw. */
export function useAdminStats() {
  return useQuery(adminDashboardQueries.stats());
}

/** The newest applications, whatever their status: who is new, not who is pending. */
export function useLatestApplications() {
  return useAdminProviders({ limit: LATEST_APPLICATIONS_LIMIT });
}

/**
 * The four sources the "Needs you" row reads, folded by `needsYou`. Four
 * bounded contexts, four queries — each one is the same cache entry its own
 * screen uses, so the card and the queue it opens cannot disagree.
 */
export function useNeedsYou(): { items: NeedsYouItem[]; loading: boolean } {
  const stats = useAdminStats();
  const providers = useProviderStatusCounts();
  const support = useSupportOpenCount();
  const contact = useContactOpenCount();
  const disputed = stats.data?.disputed;
  const pending = providers.data?.pending;
  const items = useMemo(
    () => needsYou({ disputed, providers: pending, support: support.data, contact: contact.data }),
    [disputed, pending, support.data, contact.data],
  );
  return {
    items,
    loading: stats.isLoading || providers.isLoading || support.isLoading || contact.isLoading,
  };
}
```

- [ ] **Step 7: The sidebar badge reads the exact count**

In `shared/components/console/console-counts.tsx`: change the import to `import { useProviderStatusCounts } from "@/features/admin/providers/viewmodel/use-admin-providers";`, delete `import { ProviderStatus } from "@ntizo/shared";`, and replace `PlatformCounts`:

```tsx
function PlatformCounts({ children }: { children: ReactNode }) {
  // The count, not the length of a page: the list read caps at fifty rows.
  const counts = useProviderStatusCounts();
  const pendingProviders = counts.data?.pending;
  const value = useMemo<ConsoleCounts>(
    () => (pendingProviders === undefined ? EMPTY : { pendingProviders }),
    [pendingProviders],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

In `console-counts.test.tsx`: rename the mock and the two platform tests:

```tsx
const providerCounts = vi.fn();
vi.mock("@/features/admin/providers/viewmodel/use-admin-providers", () => ({
  useProviderStatusCounts: () => providerCounts(),
}));
```
(replacing the `adminProviders` mock), and:

```tsx
  it("counts the pending applications, for the platform", () => {
    providerCounts.mockReturnValue({ data: { pending: 3, active: 9, rejected: 0, suspended: 1, archived: 0 } });
    render(<ConsoleCountsProvider zone="platform"><Probe /></ConsoleCountsProvider>);
    expect(screen.getByTestId("counts")).toHaveTextContent('{"pendingProviders":3}');
  });

  it("reports nothing for the platform while the counts are loading", () => {
    providerCounts.mockReturnValue({ data: undefined });
    render(<ConsoleCountsProvider zone="platform"><Probe /></ConsoleCountsProvider>);
    expect(screen.getByTestId("counts")).toHaveTextContent("{}");
  });
```

- [ ] **Step 8: Run the console suite, the admin suites, typecheck, lint**

Run, from `apps/frontend/web`: `bun run vitest run src/shared/components/console src/features/admin && bun run typecheck && bun run lint`
Expected: PASS; typecheck clean; lint no new problems.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/web/src/features/admin/dashboard apps/frontend/web/src/features/admin/providers apps/frontend/web/src/features/admin/contact apps/frontend/web/src/shared/components/console/console-counts.tsx apps/frontend/web/src/shared/components/console/console-counts.test.tsx
git commit -F - <<'EOF'
feat(admin): the dashboard's reads, and a badge that counts instead of measuring a page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v
EOF
```

---

### Task 7: The words, in eight languages

**Files:**
- Modify: `apps/frontend/web/src/shared/locales/{de-DE,en-US,es-ES,fr-FR,it-IT,nl-NL,pt-MZ,pt-PT}/admin.json`

**Interfaces:**
- Produces: the `overview` block Task 8 reads. Removes `title` and `welcome` (used only by the placeholder page Task 8 deletes; the two e2e assertions that name "Ntizo Admin Dashboard" are updated in Task 8).

- [ ] **Step 1: Run the parity gate to see it pass before the change**

Run, from `apps/frontend/web`: `bun run vitest run src/shared/locales`
Expected: PASS.

- [ ] **Step 2: In every one of the eight files, delete the two top-level keys `title` and `welcome`, and insert the `overview` block immediately after the `nav` object**

Use a small script or eight careful edits; JSON must stay valid (watch the trailing comma after `nav`'s closing brace). The blocks:

`en-US`:
```json
  "overview": {
    "greeting": {
      "morning": "Good morning, {{name}}",
      "afternoon": "Good afternoon, {{name}}",
      "evening": "Good evening, {{name}}"
    },
    "subtitle": "What needs you, how the last 30 days went, and who applied.",
    "needsYou": {
      "disputed": "Disputes to decide",
      "disputedAction": "Decide",
      "providers": "Providers awaiting review",
      "providersAction": "Review",
      "support": "Open support requests",
      "supportAction": "Answer",
      "contact": "Contact messages open",
      "contactAction": "Answer"
    },
    "bookingsTitle": "Bookings (30 days)",
    "bookingsHint_one": "{{count}} completed",
    "bookingsHint_other": "{{count}} completed",
    "bookingsHint_many": "{{count}} completed",
    "grossTitle": "Gross booked (30 days)",
    "grossHint": "What customers paid for completed work.",
    "commissionTitle": "Commission earned (30 days)",
    "commissionHint": "Ntizo's share of the gross.",
    "nothingCompleted": "Nothing completed in the last 30 days yet.",
    "newProvidersTitle": "New providers (30 days)",
    "chartTitle": "Requests and confirmations",
    "chartRange": "Last 30 days, across every workspace",
    "chartRequests": "Requests",
    "chartConfirmed": "Confirmed",
    "chartEmpty": "No activity in the last 30 days.",
    "chartTableDay": "Day",
    "chartDayLabel": "{{date}} · requests {{requests}} · confirmed {{confirmed}}",
    "applicationsTitle": "Latest applications",
    "applicationsAll": "See all providers",
    "applicationsBusiness": "Business",
    "applicationsStatus": "Status",
    "applicationsApplied": "Applied",
    "applicationsEmptyTitle": "No applications yet",
    "applicationsEmpty": "Businesses that finish signing up appear here.",
    "loadError": "Could not load the numbers.",
    "retry": "Try again"
  },
```

`pt-PT`:
```json
  "overview": {
    "greeting": {
      "morning": "Bom dia, {{name}}",
      "afternoon": "Boa tarde, {{name}}",
      "evening": "Boa noite, {{name}}"
    },
    "subtitle": "O que precisa de si, como correram os últimos 30 dias e quem se candidatou.",
    "needsYou": {
      "disputed": "Reclamações por decidir",
      "disputedAction": "Decidir",
      "providers": "Prestadores por rever",
      "providersAction": "Rever",
      "support": "Pedidos de suporte abertos",
      "supportAction": "Responder",
      "contact": "Mensagens de contacto abertas",
      "contactAction": "Responder"
    },
    "bookingsTitle": "Reservas (30 dias)",
    "bookingsHint_one": "{{count}} concluída",
    "bookingsHint_other": "{{count}} concluídas",
    "bookingsHint_many": "{{count}} concluídas",
    "grossTitle": "Valor reservado (30 dias)",
    "grossHint": "O que os clientes pagaram por trabalho concluído.",
    "commissionTitle": "Comissão ganha (30 dias)",
    "commissionHint": "A parte da Ntizo no valor acima.",
    "nothingCompleted": "Ainda nada concluído nos últimos 30 dias.",
    "newProvidersTitle": "Novos prestadores (30 dias)",
    "chartTitle": "Pedidos e confirmações",
    "chartRange": "Últimos 30 dias, em todos os espaços de trabalho",
    "chartRequests": "Pedidos",
    "chartConfirmed": "Confirmadas",
    "chartEmpty": "Sem atividade nos últimos 30 dias.",
    "chartTableDay": "Dia",
    "chartDayLabel": "{{date}} · pedidos {{requests}} · confirmadas {{confirmed}}",
    "applicationsTitle": "Últimas candidaturas",
    "applicationsAll": "Ver todos os prestadores",
    "applicationsBusiness": "Negócio",
    "applicationsStatus": "Estado",
    "applicationsApplied": "Candidatou-se",
    "applicationsEmptyTitle": "Ainda sem candidaturas",
    "applicationsEmpty": "Os negócios que terminam o registo aparecem aqui.",
    "loadError": "Não foi possível carregar os números.",
    "retry": "Tentar de novo"
  },
```

`pt-MZ`: identical to `pt-PT` except `"chartEmpty": "Sem actividade nos últimos 30 dias."`.

`es-ES`:
```json
  "overview": {
    "greeting": {
      "morning": "Buenos días, {{name}}",
      "afternoon": "Buenas tardes, {{name}}",
      "evening": "Buenas noches, {{name}}"
    },
    "subtitle": "Qué necesita de ti, cómo fueron los últimos 30 días y quién se ha inscrito.",
    "needsYou": {
      "disputed": "Reclamaciones por decidir",
      "disputedAction": "Decidir",
      "providers": "Proveedores por revisar",
      "providersAction": "Revisar",
      "support": "Solicitudes de soporte abiertas",
      "supportAction": "Responder",
      "contact": "Mensajes de contacto abiertos",
      "contactAction": "Responder"
    },
    "bookingsTitle": "Reservas (30 días)",
    "bookingsHint_one": "{{count}} completada",
    "bookingsHint_other": "{{count}} completadas",
    "bookingsHint_many": "{{count}} completadas",
    "grossTitle": "Importe reservado (30 días)",
    "grossHint": "Lo que los clientes pagaron por trabajo completado.",
    "commissionTitle": "Comisión ganada (30 días)",
    "commissionHint": "La parte de Ntizo del importe anterior.",
    "nothingCompleted": "Todavía nada completado en los últimos 30 días.",
    "newProvidersTitle": "Nuevos proveedores (30 días)",
    "chartTitle": "Solicitudes y confirmaciones",
    "chartRange": "Últimos 30 días, en todos los espacios de trabajo",
    "chartRequests": "Solicitudes",
    "chartConfirmed": "Confirmadas",
    "chartEmpty": "Sin actividad en los últimos 30 días.",
    "chartTableDay": "Día",
    "chartDayLabel": "{{date}} · solicitudes {{requests}} · confirmadas {{confirmed}}",
    "applicationsTitle": "Últimas inscripciones",
    "applicationsAll": "Ver todos los proveedores",
    "applicationsBusiness": "Negocio",
    "applicationsStatus": "Estado",
    "applicationsApplied": "Inscrito",
    "applicationsEmptyTitle": "Todavía sin inscripciones",
    "applicationsEmpty": "Los negocios que terminan el registro aparecen aquí.",
    "loadError": "No se pudieron cargar los números.",
    "retry": "Reintentar"
  },
```

`fr-FR`:
```json
  "overview": {
    "greeting": {
      "morning": "Bonjour, {{name}}",
      "afternoon": "Bon après-midi, {{name}}",
      "evening": "Bonsoir, {{name}}"
    },
    "subtitle": "Ce qui vous attend, les 30 derniers jours et les nouvelles candidatures.",
    "needsYou": {
      "disputed": "Litiges à trancher",
      "disputedAction": "Trancher",
      "providers": "Prestataires à examiner",
      "providersAction": "Examiner",
      "support": "Demandes d'assistance ouvertes",
      "supportAction": "Répondre",
      "contact": "Messages de contact ouverts",
      "contactAction": "Répondre"
    },
    "bookingsTitle": "Réservations (30 jours)",
    "bookingsHint_one": "{{count}} terminée",
    "bookingsHint_other": "{{count}} terminées",
    "bookingsHint_many": "{{count}} terminées",
    "grossTitle": "Montant réservé (30 jours)",
    "grossHint": "Ce que les clients ont payé pour le travail terminé.",
    "commissionTitle": "Commission perçue (30 jours)",
    "commissionHint": "La part de Ntizo sur le montant ci-dessus.",
    "nothingCompleted": "Rien de terminé ces 30 derniers jours pour l'instant.",
    "newProvidersTitle": "Nouveaux prestataires (30 jours)",
    "chartTitle": "Demandes et confirmations",
    "chartRange": "30 derniers jours, tous espaces confondus",
    "chartRequests": "Demandes",
    "chartConfirmed": "Confirmées",
    "chartEmpty": "Aucune activité ces 30 derniers jours.",
    "chartTableDay": "Jour",
    "chartDayLabel": "{{date}} · demandes {{requests}} · confirmées {{confirmed}}",
    "applicationsTitle": "Dernières candidatures",
    "applicationsAll": "Voir tous les prestataires",
    "applicationsBusiness": "Entreprise",
    "applicationsStatus": "Statut",
    "applicationsApplied": "Candidature",
    "applicationsEmptyTitle": "Pas encore de candidature",
    "applicationsEmpty": "Les entreprises qui terminent leur inscription apparaissent ici.",
    "loadError": "Impossible de charger les chiffres.",
    "retry": "Réessayer"
  },
```

`de-DE`:
```json
  "overview": {
    "greeting": {
      "morning": "Guten Morgen, {{name}}",
      "afternoon": "Guten Tag, {{name}}",
      "evening": "Guten Abend, {{name}}"
    },
    "subtitle": "Was auf Sie wartet, wie die letzten 30 Tage liefen und wer sich beworben hat.",
    "needsYou": {
      "disputed": "Zu entscheidende Reklamationen",
      "disputedAction": "Entscheiden",
      "providers": "Anbieter zur Prüfung",
      "providersAction": "Prüfen",
      "support": "Offene Supportanfragen",
      "supportAction": "Antworten",
      "contact": "Offene Kontaktnachrichten",
      "contactAction": "Antworten"
    },
    "bookingsTitle": "Buchungen (30 Tage)",
    "bookingsHint_one": "{{count}} abgeschlossen",
    "bookingsHint_other": "{{count}} abgeschlossen",
    "bookingsHint_many": "{{count}} abgeschlossen",
    "grossTitle": "Gebuchter Umsatz (30 Tage)",
    "grossHint": "Was Kunden für abgeschlossene Arbeit bezahlt haben.",
    "commissionTitle": "Verdiente Provision (30 Tage)",
    "commissionHint": "Ntizos Anteil am obigen Betrag.",
    "nothingCompleted": "In den letzten 30 Tagen noch nichts abgeschlossen.",
    "newProvidersTitle": "Neue Anbieter (30 Tage)",
    "chartTitle": "Anfragen und Bestätigungen",
    "chartRange": "Letzte 30 Tage, über alle Arbeitsbereiche",
    "chartRequests": "Anfragen",
    "chartConfirmed": "Bestätigt",
    "chartEmpty": "Keine Aktivität in den letzten 30 Tagen.",
    "chartTableDay": "Tag",
    "chartDayLabel": "{{date}} · Anfragen {{requests}} · bestätigt {{confirmed}}",
    "applicationsTitle": "Neueste Bewerbungen",
    "applicationsAll": "Alle Anbieter ansehen",
    "applicationsBusiness": "Unternehmen",
    "applicationsStatus": "Status",
    "applicationsApplied": "Beworben",
    "applicationsEmptyTitle": "Noch keine Bewerbungen",
    "applicationsEmpty": "Unternehmen, die die Registrierung abschließen, erscheinen hier.",
    "loadError": "Die Zahlen konnten nicht geladen werden.",
    "retry": "Erneut versuchen"
  },
```

`it-IT`:
```json
  "overview": {
    "greeting": {
      "morning": "Buongiorno, {{name}}",
      "afternoon": "Buon pomeriggio, {{name}}",
      "evening": "Buonasera, {{name}}"
    },
    "subtitle": "Cosa ti aspetta, come sono andati gli ultimi 30 giorni e chi si è candidato.",
    "needsYou": {
      "disputed": "Contestazioni da decidere",
      "disputedAction": "Decidere",
      "providers": "Fornitori da esaminare",
      "providersAction": "Esaminare",
      "support": "Richieste di assistenza aperte",
      "supportAction": "Rispondere",
      "contact": "Messaggi di contatto aperti",
      "contactAction": "Rispondere"
    },
    "bookingsTitle": "Prenotazioni (30 giorni)",
    "bookingsHint_one": "{{count}} completata",
    "bookingsHint_other": "{{count}} completate",
    "bookingsHint_many": "{{count}} completate",
    "grossTitle": "Importo prenotato (30 giorni)",
    "grossHint": "Quanto i clienti hanno pagato per lavoro completato.",
    "commissionTitle": "Commissione guadagnata (30 giorni)",
    "commissionHint": "La quota di Ntizo sull'importo sopra.",
    "nothingCompleted": "Ancora niente di completato negli ultimi 30 giorni.",
    "newProvidersTitle": "Nuovi fornitori (30 giorni)",
    "chartTitle": "Richieste e conferme",
    "chartRange": "Ultimi 30 giorni, in tutti gli spazi di lavoro",
    "chartRequests": "Richieste",
    "chartConfirmed": "Confermate",
    "chartEmpty": "Nessuna attività negli ultimi 30 giorni.",
    "chartTableDay": "Giorno",
    "chartDayLabel": "{{date}} · richieste {{requests}} · confermate {{confirmed}}",
    "applicationsTitle": "Ultime candidature",
    "applicationsAll": "Vedi tutti i fornitori",
    "applicationsBusiness": "Attività",
    "applicationsStatus": "Stato",
    "applicationsApplied": "Candidatura",
    "applicationsEmptyTitle": "Ancora nessuna candidatura",
    "applicationsEmpty": "Le attività che completano la registrazione compaiono qui.",
    "loadError": "Impossibile caricare i numeri.",
    "retry": "Riprova"
  },
```

`nl-NL`:
```json
  "overview": {
    "greeting": {
      "morning": "Goedemorgen, {{name}}",
      "afternoon": "Goedemiddag, {{name}}",
      "evening": "Goedenavond, {{name}}"
    },
    "subtitle": "Wat op u wacht, hoe de laatste 30 dagen gingen en wie zich heeft aangemeld.",
    "needsYou": {
      "disputed": "Geschillen om te beslissen",
      "disputedAction": "Beslissen",
      "providers": "Aanbieders ter beoordeling",
      "providersAction": "Beoordelen",
      "support": "Open supportverzoeken",
      "supportAction": "Beantwoorden",
      "contact": "Open contactberichten",
      "contactAction": "Beantwoorden"
    },
    "bookingsTitle": "Boekingen (30 dagen)",
    "bookingsHint_one": "{{count}} afgerond",
    "bookingsHint_other": "{{count}} afgerond",
    "bookingsHint_many": "{{count}} afgerond",
    "grossTitle": "Geboekt bedrag (30 dagen)",
    "grossHint": "Wat klanten betaalden voor afgerond werk.",
    "commissionTitle": "Verdiende commissie (30 dagen)",
    "commissionHint": "Het aandeel van Ntizo in het bedrag hierboven.",
    "nothingCompleted": "Nog niets afgerond in de laatste 30 dagen.",
    "newProvidersTitle": "Nieuwe aanbieders (30 dagen)",
    "chartTitle": "Aanvragen en bevestigingen",
    "chartRange": "Laatste 30 dagen, over alle werkruimten",
    "chartRequests": "Aanvragen",
    "chartConfirmed": "Bevestigd",
    "chartEmpty": "Geen activiteit in de laatste 30 dagen.",
    "chartTableDay": "Dag",
    "chartDayLabel": "{{date}} · aanvragen {{requests}} · bevestigd {{confirmed}}",
    "applicationsTitle": "Nieuwste aanmeldingen",
    "applicationsAll": "Alle aanbieders bekijken",
    "applicationsBusiness": "Bedrijf",
    "applicationsStatus": "Status",
    "applicationsApplied": "Aangemeld",
    "applicationsEmptyTitle": "Nog geen aanmeldingen",
    "applicationsEmpty": "Bedrijven die de registratie afronden verschijnen hier.",
    "loadError": "De cijfers konden niet worden geladen.",
    "retry": "Opnieuw proberen"
  },
```

- [ ] **Step 3: Run the parity gate and the JSON check**

Run, from `apps/frontend/web`: `bun run vitest run src/shared/locales && for f in src/shared/locales/*/admin.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" || echo "BAD $f"; done`
Expected: PASS; no `BAD` line. (The placeholder page still references `t("title")`/`t("welcome")` until Task 8 replaces it; that is a runtime fallback to the key name, not a test failure — Task 8 follows immediately.)

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/web/src/shared/locales
git commit -F - <<'EOF'
feat(admin): the dashboard's words, in eight languages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v
EOF
```

---

### Task 8: The page, its test, and the two e2e assertions that named the placeholder

**Files:**
- Create: `apps/frontend/web/src/features/admin/providers/domain/providers-search.ts`
- Create: `apps/frontend/web/src/features/admin/providers/ui/provider-row.tsx`
- Modify: `apps/frontend/web/src/features/admin/providers/ui/providers-page.tsx` (import `ProviderBusiness`/`PROVIDER_STATUS_TONE`; initial status from the URL)
- Modify: `apps/frontend/web/src/routes/admin/providers.index.tsx` (add `validateSearch`)
- Rewrite: `apps/frontend/web/src/features/admin/dashboard/pages/dashboard.tsx`
- Create: `apps/frontend/web/src/features/admin/dashboard/pages/__tests__/dashboard.test.tsx`
- Modify: `apps/e2e/tests/zones.spec.ts` (line 59) and `apps/e2e/tests/ssr.spec.ts` (line 53)

**Interfaces:**
- Consumes: Task 5's `StatCard`, `CARD_LINK`, `ActivityChart`, `greetingKey`; Task 6's hooks; Task 7's keys; `useCurrentUser()` (`data.firstName`); `CollectionCard`; `ConsolePage`; `formatMoney`; `parseAdminQueueSearch` from `@/features/admin/bookings/domain/queue-search`.
- Produces: `parseProvidersSearch(search): { status?: ProviderStatus }`; `ProviderBusiness`, `PROVIDER_STATUS_TONE`.

- [ ] **Step 1: The providers list accepts `?status=` from the address bar**

`features/admin/providers/domain/providers-search.ts`:

```ts
import { PROVIDER_STATUSES, type ProviderStatus } from "@ntizo/shared";

export interface ProvidersSearch {
  status?: ProviderStatus;
}

/** `?status=pending` narrows the list on arrival — the dashboard's card links here already filtered. Anything else is ignored. */
export function parseProvidersSearch(search: Record<string, unknown>): ProvidersSearch {
  const status = search["status"];
  return {
    status:
      typeof status === "string" && (PROVIDER_STATUSES as readonly string[]).includes(status)
        ? (status as ProviderStatus)
        : undefined,
  };
}
```

`routes/admin/providers.index.tsx`: add `import { parseProvidersSearch } from "@/features/admin/providers/domain/providers-search";` and `validateSearch: parseProvidersSearch,` inside the `createFileRoute("/admin/providers/")({ … })` options.

`features/admin/providers/ui/provider-row.tsx` — the row's identity and its status tone, lifted out of `providers-page.tsx` so the dashboard can draw the same row:

```tsx
import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "@ntizo/frontend-ui";
import { ProviderStatus } from "@ntizo/shared";
import { initialsFrom } from "@/shared/lib/initials";
import type { AdminProvider } from "../domain/types";

export const PROVIDER_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info"> = {
  [ProviderStatus.Active]: "success",
  [ProviderStatus.Pending]: "warning",
  [ProviderStatus.Rejected]: "danger",
  [ProviderStatus.Suspended]: "danger",
  [ProviderStatus.Archived]: "info",
};

/** Who the row is about: the icon, the name, and where they are. */
export function ProviderBusiness({ provider }: { provider: AdminProvider }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className="text-xs">{initialsFrom(provider.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <Link
          to="/admin/providers/$providerId"
          params={{ providerId: provider.id }}
          className="type-body-medium block truncate font-semibold hover:underline"
        >
          {provider.name}
        </Link>
        <p className="type-caption truncate text-[var(--color-muted-foreground)]">
          {[provider.city, provider.country].filter(Boolean).join(", ") || provider.slug}
        </p>
      </div>
    </div>
  );
}
```

In `providers-page.tsx`: delete the local `STATUS_TONE` and `Business` (and the now-unused `Avatar`, `AvatarFallback`, `initialsFrom`, `ProviderStatus` imports if nothing else in the file uses them); import `{ PROVIDER_STATUS_TONE, ProviderBusiness } from "./provider-row"`; use `PROVIDER_STATUS_TONE[provider.status]` and `<ProviderBusiness provider={provider} />`. For the initial filter, add `import { useSearch } from "@tanstack/react-router";` and change `const [status, setStatus] = useState("");` to:

```tsx
  // `strict: false`: this is a `ui` file and may not import the route to name
  // it. Only the arrival value — the filter sheet keeps its own state after.
  const arrived = useSearch({ strict: false }) as { status?: string };
  const [status, setStatus] = useState(arrived.status ?? "");
```

Run: `bun run vitest run src/features/admin/providers src/routes && bun run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 2: Write the failing page test**

`features/admin/dashboard/pages/__tests__/dashboard.test.tsx`:

```tsx
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { PageHeaderContext, type PageHeaderState } from "@/shared/lib/page-header";
import { parseAdminQueueSearch } from "@/features/admin/bookings/domain/queue-search";
import { parseProvidersSearch } from "@/features/admin/providers/domain/providers-search";
import { DashboardPage } from "../dashboard";

/**
 * Five queries, one seam: the wire. Each answers by the operation name in the
 * document it is handed, as the provider Overview's test does. The signed-in
 * user is stood in for at the hook — the greeting needs a first name, and
 * that is all it needs.
 */
const fakes = vi.hoisted(() => ({ session: vi.fn() }));

vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>()),
  sessionGraphql: fakes.session,
}));

vi.mock("@/features/user/viewmodel/use-current-user", () => ({
  useCurrentUser: () => ({ data: { firstName: "Salif", name: "Salif Faustino" }, isLoading: false }),
}));

const TODAY = new Date();
const iso = (back: number) => new Date(TODAY.getTime() - back * 86_400_000).toISOString().slice(0, 10);

const STATS = {
  disputed: 2,
  confirmedLast30: 12,
  completedLast30: 9,
  grossLast30Minor: 124_000_000,
  commissionLast30Minor: 12_400_000,
  newProvidersLast30: 3,
  currency: "MZN",
  perDay: Array.from({ length: 30 }, (_, i) => ({
    date: iso(29 - i),
    requests: i === 29 ? 4 : i % 7 === 0 ? 1 : 0,
    confirmed: i === 29 ? 2 : 0,
  })),
};

const COUNTS = { pending: 4, active: 40, rejected: 1, suspended: 0, archived: 2 };

function application(id: string, name: string, status = "pending") {
  return {
    id, name, slug: id, type: "individual", status, description: null,
    city: "Maputo", country: "MZ", commissionBps: 1000, ownerEmail: `${id}@ntizo.test`,
    createdAt: "2026-09-05T08:00:00.000Z",
  };
}

function Shell({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<PageHeaderState>({ title: "" });
  const [action, setAction] = useState<ReactNode>(null);
  return (
    <PageHeaderContext.Provider value={{ header, setHeader, action, setAction }}>
      <header>
        <h1>{header.title}</h1>
        <p>{header.subtitle ?? ""}</p>
        <div>{action}</div>
      </header>
      {children}
    </PageHeaderContext.Provider>
  );
}

function renderDashboard({
  stats = STATS,
  statsFails = false,
  counts = COUNTS,
  supportOpen = 1,
  contactOpen = 3,
  applications = [application("p1", "Estúdio Mavalane"), application("p2", "Salão Beira", "active")],
}: {
  stats?: typeof STATS;
  statsFails?: boolean;
  counts?: typeof COUNTS;
  supportOpen?: number;
  contactOpen?: number;
  applications?: ReturnType<typeof application>[];
} = {}) {
  fakes.session.mockReset();
  fakes.session.mockImplementation(async (query: string) => {
    if (query.includes("BookingStatsForAdmin")) {
      if (statsFails) throw new Error("the numbers are unreachable");
      return { bookingStatsForAdmin: stats };
    }
    if (query.includes("ProviderCountByStatusForAdmin")) return { providerCountByStatusForAdmin: counts };
    if (query.includes("SupportOpenCount")) return { supportOpenCount: { count: supportOpen } };
    if (query.includes("ContactRequestAllForAdmin")) {
      return { contactRequestAllForAdmin: { items: [], total: contactOpen, openCount: contactOpen } };
    }
    if (query.includes("ProviderAllForAdmin")) return { providerAllForAdmin: applications };
    return {};
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const routes = [
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/admin/dashboard",
      component: () => (
        <Shell>
          <DashboardPage />
        </Shell>
      ),
    }),
    createRoute({ getParentRoute: () => rootRoute, path: "/admin/bookings", validateSearch: parseAdminQueueSearch, component: () => <p>bookings</p> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/admin/providers/", validateSearch: parseProvidersSearch, component: () => <p>providers</p> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/admin/providers/$providerId", component: () => <p>provider</p> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/admin/support/", component: () => <p>support</p> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/admin/contact", component: () => <p>contact</p> }),
  ];
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/admin/dashboard"] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** The one render where the stats are committed: `12` is `confirmedLast30` and appears nowhere else. */
async function waitForStats() {
  await screen.findByText("12");
}

describe("DashboardPage", () => {
  it("greets the administrator by first name and says what the page is", async () => {
    renderDashboard();
    expect(
      await screen.findByRole("heading", { name: /^(Good morning|Good afternoon|Good evening), Salif$/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("What needs you, how the last 30 days went, and who applied.")).toBeInTheDocument();
  });

  it("opens with the three most-owed things, each linking into its queue already narrowed", async () => {
    renderDashboard();
    expect(await screen.findByText("Disputes to decide")).toBeInTheDocument();
    expect(screen.getByText("Providers awaiting review")).toBeInTheDocument();
    expect(screen.getByText("Open support requests")).toBeInTheDocument();
    // Four sources, three cards: contact is fourth in priority and stays off.
    expect(screen.queryByText("Contact messages open")).toBeNull();

    expect(screen.getByRole("link", { name: "Decide" })).toHaveAttribute("href", "/admin/bookings?tab=disputed");
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute("href", "/admin/providers?status=pending");
    expect(screen.getByRole("link", { name: "Answer" })).toHaveAttribute("href", "/admin/support");
  });

  it("lets contact in when something above it is quiet", async () => {
    renderDashboard({ stats: { ...STATS, disputed: 0 } });
    expect(await screen.findByText("Contact messages open")).toBeInTheDocument();
    expect(screen.queryByText("Disputes to decide")).toBeNull();
  });

  it("opens straight onto the numbers on a quiet day", async () => {
    renderDashboard({ stats: { ...STATS, disputed: 0 }, counts: { ...COUNTS, pending: 0 }, supportOpen: 0, contactOpen: 0 });
    await waitForStats();
    for (const label of ["Disputes to decide", "Providers awaiting review", "Open support requests", "Contact messages open"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.getByText("Bookings (30 days)")).toBeInTheDocument();
  });

  it("shows the thirty days: bookings, the gross, the commission, the new providers", async () => {
    renderDashboard();
    await waitForStats();
    expect(screen.getByText("9 completed")).toBeInTheDocument();
    // 124 000 000 minor units — the gross, what customers paid.
    expect(screen.getByText(/1,240,000/)).toBeInTheDocument();
    expect(screen.getByText("What customers paid for completed work.")).toBeInTheDocument();
    // 12 400 000 minor units — the platform's cut.
    expect(screen.getByText(/124,000\.00/)).toBeInTheDocument();
    expect(screen.getByText("New providers (30 days)")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("says why the gross is zero when nothing has been completed", async () => {
    renderDashboard({ stats: { ...STATS, completedLast30: 0, grossLast30Minor: 0, commissionLast30Minor: 0 } });
    expect(await screen.findByText("Nothing completed in the last 30 days yet.")).toBeInTheDocument();
    expect(screen.queryByText("What customers paid for completed work.")).toBeNull();
  });

  it("draws the platform's thirty days and a table for everyone else", async () => {
    renderDashboard();
    await waitForStats();
    const table = screen.getByRole("table", { name: /requests and confirmations/i });
    expect(within(table).getAllByRole("row")).toHaveLength(31);
  });

  it("lists the newest applications and links to all of them", async () => {
    renderDashboard();
    expect(await screen.findByText("Latest applications")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Estúdio Mavalane" })).toHaveAttribute("href", "/admin/providers/p1");
    expect(screen.getByRole("link", { name: "See all providers" })).toHaveAttribute("href", "/admin/providers");
    const call = fakes.session.mock.calls.find((c) => String(c[0]).includes("ProviderAllForAdmin"));
    expect(call?.[1]).toMatchObject({ input: { limit: 5 } });
  });

  it("says so when the numbers cannot be read, and offers to ask again", async () => {
    renderDashboard({ statsFails: true });
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load the numbers/i);
    const asked = () => fakes.session.mock.calls.filter((c) => String(c[0]).includes("BookingStatsForAdmin")).length;
    const before = asked();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(asked()).toBeGreaterThan(before);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun run vitest run src/features/admin/dashboard`
Expected: the new file FAILS on the first assertion (the placeholder has no greeting).

- [ ] **Step 4: The page**

Replace `features/admin/dashboard/pages/dashboard.tsx` in full:

```tsx
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ntizo/frontend-ui";
import { ProviderStatus } from "@ntizo/shared";
import type { ProviderBookingStatsDayDTO } from "@ntizo/shared/read-models";
import { ActivityChart } from "@/shared/components/activity-chart";
import { CollectionCard } from "@/shared/components/collection-card";
import { ConsolePage } from "@/shared/components/console/console-page";
import { CARD_LINK, StatCard } from "@/shared/components/stat-card";
import { greetingKey } from "@/shared/domain/greeting";
import { usePageHeader } from "@/shared/lib/page-header";
import { PROVIDER_STATUS_TONE, ProviderBusiness } from "@/features/admin/providers/ui/provider-row";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { formatMoney } from "@/features/wallet/domain/money";
import type { NeedsYouItem } from "../domain/needs-you";
import { useAdminStats, useLatestApplications, useNeedsYou } from "../viewmodel/use-admin-dashboard";

/**
 * The platform at a glance, in the order the spec fixes: what is owed, then
 * the thirty days, then who applied. The first row is verbs — every card on
 * it is a task — and it is absent on a quiet day rather than a row of zeros.
 * The tiles below carry no verb; they are readings.
 *
 * The provider's dashboard shows a workspace its share; this one shows the
 * platform the gross and what it kept, over the same bookings and the same
 * window, so the two never describe different money.
 */
export function DashboardPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const me = useCurrentUser();
  const stats = useAdminStats();
  const needs = useNeedsYou();
  const applications = useLatestApplications();

  // The instant the numbers were answered, as the provider Overview reasons.
  const now = useMemo(() => new Date(stats.dataUpdatedAt || Date.now()), [stats.dataUpdatedAt]);

  usePageHeader(
    t(`overview.greeting.${greetingKey(now)}`, { name: me.data?.firstName ?? "" }),
    t("overview.subtitle"),
  );

  const s = stats.data;
  const money = (minor: number) => formatMoney(minor, s?.currency ?? "MZN", locale);
  const rows = applications.data ?? [];
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <ConsolePage>
      {stats.isError && (
        <p role="alert" className="type-body text-[var(--color-destructive)]">
          {t("overview.loadError")}{" "}
          <button type="button" className="underline" onClick={() => void stats.refetch()}>
            {t("overview.retry")}
          </button>
        </p>
      )}

      {needs.items.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {needs.items.map((item) => (
            <StatCard
              key={item.key}
              label={t(`overview.needsYou.${item.key}`)}
              value={item.count}
              action={<NeedsYouLink item={item} label={t(`overview.needsYou.${item.key}Action`)} />}
            />
          ))}
        </div>
      )}

      {/* `xl:`, not `lg:` — the provider Overview says why: four-up at 1024px
          with the sidebar showing is narrower than a phone. */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label={t("overview.bookingsTitle")}
          value={s?.confirmedLast30 ?? 0}
          loading={stats.isLoading}
          hint={t("overview.bookingsHint", { count: s?.completedLast30 ?? 0 })}
        />
        <StatCard
          label={t("overview.grossTitle")}
          value={money(s?.grossLast30Minor ?? 0)}
          loading={stats.isLoading}
          hint={s && s.completedLast30 === 0 ? t("overview.nothingCompleted") : t("overview.grossHint")}
        />
        <StatCard
          label={t("overview.commissionTitle")}
          value={money(s?.commissionLast30Minor ?? 0)}
          loading={stats.isLoading}
          hint={t("overview.commissionHint")}
        />
        <StatCard
          label={t("overview.newProvidersTitle")}
          value={s?.newProvidersLast30 ?? 0}
          loading={stats.isLoading}
        />
      </div>

      <ActivityChart
        days={s?.perDay ?? []}
        locale={locale}
        labels={{
          title: t("overview.chartTitle"),
          range: t("overview.chartRange"),
          requests: t("overview.chartRequests"),
          confirmed: t("overview.chartConfirmed"),
          empty: t("overview.chartEmpty"),
          day: t("overview.chartTableDay"),
        }}
        dayLabel={(date, d: ProviderBookingStatsDayDTO) =>
          t("overview.chartDayLabel", { date, requests: d.requests, confirmed: d.confirmed })
        }
      />

      <CollectionCard
        title={t("overview.applicationsTitle")}
        shown={rows.length}
        total={rows.length}
        loading={applications.isLoading}
        columns={[
          { key: "business", label: t("overview.applicationsBusiness"), className: "pl-5" },
          { key: "status", label: t("overview.applicationsStatus"), skeletonWidth: "w-20", skeletonShape: "badge" },
          { key: "applied", label: t("overview.applicationsApplied"), align: "right", className: "pr-5", skeletonWidth: "w-24" },
        ]}
        rows={rows.map((provider) => ({
          key: provider.id,
          primary: <ProviderBusiness provider={provider} />,
          cells: {
            status: (
              <Badge tone={PROVIDER_STATUS_TONE[provider.status] ?? "info"}>
                {t(`providerStatus.${provider.status}`)}
              </Badge>
            ),
            applied: (
              <span className="tabular-nums text-[var(--color-muted-foreground)]">
                {dateFormat.format(new Date(provider.createdAt))}
              </span>
            ),
          },
        }))}
        emptyTitle={t("overview.applicationsEmptyTitle")}
        emptyText={t("overview.applicationsEmpty")}
        noMatchesTitle={t("overview.applicationsEmptyTitle")}
        noMatchesText={t("overview.applicationsEmpty")}
        // Nothing narrows this card — it is the newest five, always.
        filtered={false}
        action={
          <Link to="/admin/providers" className={CARD_LINK}>
            {t("overview.applicationsAll")}
          </Link>
        }
      />
    </ConsolePage>
  );
}

/** Each owed thing opens its own queue, already narrowed to what is owed. */
function NeedsYouLink({ item, label }: { item: NeedsYouItem; label: string }) {
  switch (item.key) {
    case "disputed":
      return (
        <Link to="/admin/bookings" search={{ tab: "disputed" }} className={CARD_LINK}>
          {label}
        </Link>
      );
    case "providers":
      return (
        <Link to="/admin/providers" search={{ status: ProviderStatus.Pending }} className={CARD_LINK}>
          {label}
        </Link>
      );
    case "support":
      return (
        <Link to="/admin/support" className={CARD_LINK}>
          {label}
        </Link>
      );
    case "contact":
      return (
        <Link to="/admin/contact" className={CARD_LINK}>
          {label}
        </Link>
      );
  }
}
```

If TypeScript rejects `to="/admin/providers"` because the generated route is `/admin/providers/`, use `to="/admin/providers/"` in both places and change the test's two expected hrefs to `/admin/providers/?status=pending` and `/admin/providers/` — the router's own answer is the truth, not this file's guess; the nav's `resolveUrl` already links the same route with `/admin/providers`, so the bare form should type.

- [ ] **Step 5: Run the page test, the admin suites, typecheck, lint**

Run: `bun run vitest run src/features/admin src/shared/components/console src/features/provider/ui/__tests__/overview.test.tsx && bun run typecheck && bun run lint`
Expected: PASS (9 new tests); typecheck clean; lint no new problems.

- [ ] **Step 6: The two e2e assertions**

`apps/e2e/tests/zones.spec.ts` line 59: replace
`await expect(page.getByRole("heading", { name: "Ntizo Admin Dashboard" })).toBeVisible();`
with
`await expect(page.getByRole("heading", { name: /^(Good morning|Good afternoon|Good evening), / })).toBeVisible();`

`apps/e2e/tests/ssr.spec.ts` line 53: replace
`expect(adminHtml).not.toContain("Ntizo Admin Dashboard");`
with
`expect(adminHtml).not.toContain("Latest applications");`

Run, from `apps/e2e`: `bun run typecheck && bunx playwright test --list 2>&1 | tail -3`
Expected: typecheck clean; the list still enumerates every test (no syntax error).

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/web/src/features/admin apps/frontend/web/src/routes/admin/providers.index.tsx apps/e2e/tests/zones.spec.ts apps/e2e/tests/ssr.spec.ts
git commit -F - <<'EOF'
feat(admin): the dashboard — what needs you, the platform's thirty days, who applied

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v
EOF
```

---

### Task 9: The whole tree, the follow-ups, the spec's wording

**Files:**
- Modify: `docs/superpowers/follow-ups.md` (append one entry; amend #202's body)
- Modify: `docs/superpowers/specs/2026-09-06-console-navigation-design.md` (one sentence)
- Modify: `apps/frontend/web/src/shared/lib/console-nav.ts` (the comment at lines 100-104 that says the counts wait on #202)

- [ ] **Step 1: Every gate, on the whole tree**

Run, from the worktree root:
```bash
cd apps/frontend/web && bun run vitest run 2>&1 | grep -E "Test Files|Tests |FAIL" ; bun run typecheck && bun run lint ; cd ../../..
cd packages/shared && bun run test 2>&1 | tail -3 && bun run typecheck ; cd ../..
cd packages/backend && bun run test 2>&1 | tail -4 && bun run typecheck && bun run lint ; cd ../..
cd apps/backend/api && bun run test 2>&1 | tail -3 && bun run typecheck ; cd ../../..
cd apps/e2e && bun run typecheck && bunx playwright test --list 2>&1 | tail -2 ; cd ../..
```
Expected: web all files pass (baseline 182 files / 2364 tests, plus this plan's); shared pass; backend pass count up and fail count ≤ 5 (the pre-existing DB-dependent failures on `dev`); api pass; e2e lists.

- [ ] **Step 2: Follow-ups**

Append to `docs/superpowers/follow-ups.md`, numbered one above the file's current last entry (the file mixes `## N.` and `## #N —` headings; use the style of the entry directly above yours):

```markdown
## #203 — The admin's phone tabs could carry the queue counts now

`bookingStatsForAdmin.disputed` and `providerCountByStatusForAdmin.pending` exist, and
`supportOpenCount` always did. The platform's `ConsoleCounts` still resolves only
`pendingProviders`; wiring `disputed` and the support count into it, and re-choosing the three
tabs by what carries a count (the rule in the console spec), is one small task. `flaggedReviews`
stays unresolvable — there is no such concept in the review domain.

**Trigger:** the next change to the platform zone's tab bar, or the first admin who asks why
Bookings has no badge.
```

In #202's entry, add one line at the end of its body: `Partly unblocked by the admin dashboard (2026-09-07): the reads exist now — see #203.`

In `apps/frontend/web/src/shared/lib/console-nav.ts`, the `PLATFORM.work` comment: change `The three tabs stay Providers, Reviews and Users until the bookings and support reads expose counts — follow-up #202.` to `The three tabs stay Providers, Reviews and Users; the bookings and support reads expose counts now, and re-choosing the tabs is follow-up #203.`

- [ ] **Step 3: The spec's one sentence**

In `docs/superpowers/specs/2026-09-06-console-navigation-design.md`, in the paragraph "The admin's sources, as built", change `The admin's **This month** is a real month, not a set of live totals:` to `The admin's **This month** is the same rolling thirty days as the provider's, not a calendar month — one window, one chart — and every tile that names a period says "(30 days)":`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/follow-ups.md docs/superpowers/specs/2026-09-06-console-navigation-design.md apps/frontend/web/src/shared/lib/console-nav.ts
git commit -F - <<'EOF'
docs: the admin dashboard's window, and the tab counts it unblocks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0137neNHJJv594fiF8cKvt5v
EOF
```

---

## Self-review

- **Spec coverage.** Needs you (≤3, only above zero, priority order over four sources) → Tasks 6 and 8. Four tiles, "(30 days)" → Tasks 3, 7, 8. Chart from the same per-day series, inline SVG → Tasks 3, 5, 8. Next up as `CollectionCard` of the five newest applications → Tasks 6, 8. Exact pending count shared by card and badge → Tasks 2, 6. Tile leaves the provider feature → Task 5. `ConsolePage` first adopter → Task 8. Every string in eight locales → Task 7.
- **Placeholders.** None: every step names the file, the code, the command and the expected result. The one conditional (`/admin/providers` vs `/admin/providers/` typing) states both branches.
- **Type consistency.** `AdminStats`/`AdminStatsRow` (port) → `GetAdminStatsProjection` → `AdminBookingStatsDTO` (shared) → `adminDashboardQueries.stats()` → `useAdminStats()`; `ProviderStatusCountsDTO` → `CountProvidersByStatusPort.execute()` → `adminProviderQueries.counts()` → `useProviderStatusCounts()` → `PlatformCounts`; `ActivityChartLabels` + `dayLabel(date, day)` used identically by the provider Overview and the admin page; `needsYou` keys `disputed | providers | support | contact` match the locale keys `overview.needsYou.<key>` and `<key>Action`.
