# Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A provider says when they work, and a customer sees when a service can be had — computed on read, with no slot table and no generation job.

**Architecture:** Three tables in a new `scheduling` schema hold weekly rules, per-date exceptions and house-wide closures. A pure engine turns them into free intervals for a day and then into offerable start times, in minutes from local midnight; the provider's timezone converts those to instants only at the edge. Booking is slice 4, so the "busy" input arrives through a port whose slice-2 implementation returns nothing — but the engine's tests supply busy intervals directly, so subtraction is proven now.

**Tech Stack:** Bun, Turborepo, Drizzle + Neon Postgres, `@cosmneo/onion-lasagna` (hexagonal/DDD kit, GraphQL field builder), zod, React + TanStack Router/Query, i18next, Vitest (frontend and `packages/shared`) and `bun:test` (`packages/backend`, `apps/backend/api`).

**Spec:** `docs/superpowers/specs/2026-08-12-availability-design.md` — read it once before Task 1.

## Global Constraints

- **Every refusal is a kit error type** (`ConflictError`, `ForbiddenError`, `NotFoundError`, `UnprocessableError` from `@cosmneo/onion-lasagna`) carrying a `code`. A subclass of plain `Error` compiles, reads correctly, and reaches the browser as "An unexpected error occurred".
- **The kit's errors carry `code` beside `message`, never inside it.** `expect(...).toThrow(/SOME_CODE/)` matches the message and therefore matches nothing. Assert with a `try`/`catch` on `(err as { code?: string }).code`.
- **The kit's `argsMapper` is synchronous.** Any guard needing a database query lives in the `.handle()` body or in the use case, never in the field definition.
- **`zod.default()` does not survive into the GraphQL schema.** Use `.optional()` and apply the fallback in the handler.
- A schema field with no handler collapses the builder's return type to `never` and throws at `build()`; a handler for a field not in the schema leaves the count short. Both drift directions fail loudly.
- Money is integer minor units. Time is **integer minutes from local midnight** — never a float, never a `time` column.
- `public/` must not import from `read/` or `write/`; `apps/frontend/web/src/**/ui/` must not import from `**/data/`. Both are enforced by guards already in the tree.
- `eslint-plugin-boundaries` matches a single path segment per `*`: `features/*/domain/**` does **not** match `features/provider/services/domain/**`.
- All user-facing copy is added to **all eight** locales under `apps/frontend/web/src/shared/locales/<locale>/`: `pt-MZ`, `pt-PT`, `en-US`, `es-ES`, `fr-FR`, `de-DE`, `it-IT`, `nl-NL`. Natively translated in each — not English placeholders. `pt-MZ` is the platform default.
- Run `bun run check-types` and the package's tests before every commit. `bun run lint` before the last commit of each task.
- Verification is against the running application, not the configuration.

---

## File Structure

**Backend — `packages/backend/src/modules/ntizo/`**

| Path | Responsibility |
|---|---|
| `shared/infrastructure/database/scheduling/schemas/member-availability.schema.ts` | weekly rows |
| `shared/infrastructure/database/scheduling/schemas/date-exception.schema.ts` | per-date, per-member overrides |
| `shared/infrastructure/database/scheduling/schemas/house-closure.schema.ts` | provider-wide closed ranges |
| `shared/infrastructure/database/catalog/schemas/service-member.schema.ts` | who performs which service |
| `bounded-contexts/scheduling/domain/intervals.ts` | interval algebra + `freeIntervals` |
| `bounded-contexts/scheduling/domain/offers.ts` | `fixedStarts`, `hourlyStarts` |
| `bounded-contexts/scheduling/domain/exceptions.ts` | the refusals |
| `bounded-contexts/scheduling/domain/aggregates/member-schedule.aggregate.ts` | one member's weekly rules + exceptions |
| `bounded-contexts/scheduling/app/ports/outbound/schedule.repository.port.ts` | persistence + authorisation queries |
| `bounded-contexts/scheduling/app/ports/outbound/busy-intervals.port.ts` | the seam with slice 4 |
| `bounded-contexts/scheduling/app/use-cases/*.command.ts` | one file per command |
| `bounded-contexts/scheduling/infrastructure/repositories/drizzle/*` | mapper + repository + the empty busy adapter |
| `bounded-contexts/scheduling/bootstrap/index.ts` | wiring |
| `write/scheduling/graphql/{schema,handlers}/` | the mutations |
| `read/scheduling/graphql/{schema,handlers}/` | `availability.config` |
| `public/scheduling/{app/use-cases,graphql}/` | `availability.forService` and its projection |

**Shared — `packages/shared/src/`**

| Path | Responsibility |
|---|---|
| `datetime/zoned.ts` | offset lookup, local-wall-clock → instant, civil-date helpers |
| `read-models/system/availability/availability-config.schema.ts` | the provider's own configuration |
| `read-models/public/availability/service-availability.schema.ts` | the customer's answer |

**Frontend — `apps/frontend/web/src/features/`**

| Path | Responsibility |
|---|---|
| `provider/availability/{data,domain,viewmodel,ui}/` | the provider's availability tab |
| `provider/services/ui/service-form.tsx` (modify) | performers, buffer, grid |
| `directory/ui/provider-detail-page.tsx` (modify) | the public services list |
| `directory/availability/{data,domain,viewmodel,ui}/` | the customer's date strip and times |

---

### Task 1: Schemas and migration

**Files:**
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/scheduling/schemas/member-availability.schema.ts`
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/scheduling/schemas/date-exception.schema.ts`
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/scheduling/schemas/house-closure.schema.ts`
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/catalog/schemas/service-member.schema.ts`
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/scheduling/schemas/index.ts` (today: `export {}`)
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/catalog/schemas/index.ts`
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/catalog/schemas/service.schema.ts` (add two columns)
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/provider/schemas/provider.schema.ts` (add `timezone`)
- Test: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/scheduling-constraints.test.ts`

**Interfaces:**
- Produces: tables `memberAvailability`, `dateException`, `houseClosure`, `serviceMember`; `service.bufferMinutes`, `service.slotIntervalMinutes`; `provider.timezone`.

**Context an implementer cannot guess:** `ntizo_scheduling` is **already** in `drizzle.config.ts`'s `schemaFilter` and already re-exported by `shared/infrastructure/database/schemas.ts` — the directory exists as a stub. Nothing needs adding to either file. The `pgSchema` object is created the same way `catalog/schemas/service.schema.ts` creates `catalogSchema`; find the existing `schedulingSchema` export or create it in `member-availability.schema.ts` and re-export it, mirroring how `catalog` does it.

- [ ] **Step 1: Write the weekly-rules schema**

`member-availability.schema.ts`:

```ts
import { check, index, integer, pgSchema, smallint, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { provider, providerMember } from "../../provider/schemas";

export const schedulingSchema = pgSchema("ntizo_scheduling");

/**
 * One contiguous stretch a member works on one weekday.
 *
 * Minutes from local midnight rather than `time`: the engine does arithmetic
 * in minutes and would otherwise cast on every read, and `time` cannot say
 * `24:00` — a shop closing at midnight would have no way to write it.
 *
 * `provider_id` is denormalised so authorisation never joins to find it.
 *
 * Overlapping rows carry no constraint. 08:00-12:00 beside 11:00-14:00 means
 * 08:00-14:00; the engine merges them and nothing is corrupted. The form is
 * what refuses to create one.
 */
export const memberAvailability = schedulingSchema.table(
  "member_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => providerMember.id, { onDelete: "cascade" }),
    /** 0 = Sunday … 6 = Saturday, matching `Date#getUTCDay`. */
    weekday: smallint("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("member_availability_member_weekday_idx").on(t.memberId, t.weekday),
    check("member_availability_weekday_range", sql`${t.weekday} BETWEEN 0 AND 6`),
    check(
      "member_availability_minutes",
      sql`${t.startMinute} >= 0 AND ${t.endMinute} <= 1440 AND ${t.endMinute} > ${t.startMinute}`,
    ),
  ],
);

export type MemberAvailabilityRecord = typeof memberAvailability.$inferSelect;
```

- [ ] **Step 2: Write the date-exception schema**

`date-exception.schema.ts`:

```ts
import { check, date, index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { provider, providerMember } from "../../provider/schemas";
import { schedulingSchema } from "./member-availability.schema";

/**
 * One member, one date. Either `closed` — not working — or `custom`, which
 * replaces that day's weekly pattern outright.
 *
 * No uniqueness on (member, date): several `custom` rows on one date merge,
 * and that is how "Saturday I work the morning and the late afternoon" is
 * written. A `closed` row on the same date beats all of them.
 */
export const dateException = schedulingSchema.table(
  "date_exception",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => providerMember.id, { onDelete: "cascade" }),
    onDate: date("on_date").notNull(),
    /** "closed" | "custom" */
    kind: text("kind").notNull(),
    startMinute: integer("start_minute"),
    endMinute: integer("end_minute"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("date_exception_member_date_idx").on(t.memberId, t.onDate),
    check(
      "date_exception_shape",
      sql`(${t.kind} = 'closed' AND ${t.startMinute} IS NULL AND ${t.endMinute} IS NULL)
       OR (${t.kind} = 'custom' AND ${t.startMinute} IS NOT NULL AND ${t.endMinute} IS NOT NULL
           AND ${t.startMinute} >= 0 AND ${t.endMinute} <= 1440 AND ${t.endMinute} > ${t.startMinute})`,
    ),
  ],
);

export type DateExceptionRecord = typeof dateException.$inferSelect;
```

- [ ] **Step 3: Write the house-closure schema**

`house-closure.schema.ts`:

```ts
import { check, date, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { provider } from "../../provider/schemas";
import { schedulingSchema } from "./member-availability.schema";

/**
 * A date range where nobody works. Christmas is one row and one gesture, not
 * seven rows per member. Both ends inclusive.
 */
export const houseClosure = schedulingSchema.table(
  "house_closure",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "cascade" }),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("house_closure_provider_range_idx").on(t.providerId, t.fromDate, t.toDate),
    check("house_closure_range", sql`${t.toDate} >= ${t.fromDate}`),
  ],
);

export type HouseClosureRecord = typeof houseClosure.$inferSelect;
```

- [ ] **Step 4: Write the service-member join and the catalog/provider columns**

`catalog/schemas/service-member.schema.ts`:

```ts
import { index, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { providerMember } from "../../provider/schemas";
import { catalogSchema, service } from "./service.schema";

/** Who performs which service. The index on `member_id` answers "what does this person do". */
export const serviceMember = catalogSchema.table(
  "service_member",
  {
    serviceId: uuid("service_id")
      .notNull()
      .references(() => service.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => providerMember.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.serviceId, t.memberId] }),
    index("service_member_member_idx").on(t.memberId),
  ],
);

export type ServiceMemberRecord = typeof serviceMember.$inferSelect;
```

In `catalog/schemas/service.schema.ts`, add to the `service` table's column block:

```ts
    /** Dead time after an appointment: cleanup, or the journey to the next address. */
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    /** The grid offered start times land on, anchored to local midnight. */
    slotIntervalMinutes: integer("slot_interval_minutes").notNull().default(30),
```

and to its constraint array:

```ts
    check("service_buffer_range", sql`${t.bufferMinutes} BETWEEN 0 AND 480`),
    check("service_slot_interval", sql`${t.slotIntervalMinutes} IN (15, 30, 60)`),
```

In `provider/schemas/provider.schema.ts`, add:

```ts
  /**
   * Where this workspace's wall clock runs. Chosen explicitly on the
   * availability screen and never derived from the address country — Brazil
   * has four.
   */
  timezone: text("timezone").notNull().default("Africa/Maputo"),
```

Export the three scheduling tables from `scheduling/schemas/index.ts` (replacing `export {}`) and `serviceMember` from `catalog/schemas/index.ts`, following the existing export style in each file.

- [ ] **Step 5: Generate and inspect the migration**

Run: `cd packages/backend && bun run db:generate` (check `package.json` for the exact script name if it differs; the drizzle config is `src/modules/ntizo/drizzle.config.ts`).
Expected: a new `0014_*.sql` under `src/modules/ntizo/shared/infrastructure/migrations/`.

Read the generated SQL. It must contain `CREATE TABLE "ntizo_scheduling"."member_availability"`, the two other scheduling tables, `ntizo_catalog"."service_member"`, the two `ALTER TABLE ... ADD COLUMN` on `service`, and one on `provider`. If the scheduling tables are absent, the schema is not reaching the config — stop and report, do not hand-write the file.

- [ ] **Step 6: Apply it and write the constraint test**

Run the migration against the dev database (the project's existing migrate script).

`__tests__/scheduling-constraints.test.ts` — these assert against the **real** database, because a `CHECK` nobody exercises is a `CHECK` that might not be there. Follow the connection and cleanup style of the existing service-schema constraint tests in the same directory.

```ts
// Each case inserts a row the CHECK must refuse. The assertion is that the
// insert throws — if the constraint is missing, the insert succeeds and the
// test fails, which is exactly the failure worth catching.
test("refuses a weekly rule ending before it starts", async () => {
  await expect(insertWeekly({ weekday: 1, startMinute: 600, endMinute: 540 })).rejects.toThrow();
});

test("refuses a weekly rule past midnight", async () => {
  await expect(insertWeekly({ weekday: 1, startMinute: 600, endMinute: 1500 })).rejects.toThrow();
});

test("refuses weekday 7", async () => {
  await expect(insertWeekly({ weekday: 7, startMinute: 600, endMinute: 660 })).rejects.toThrow();
});

test("refuses a closed exception carrying hours", async () => {
  await expect(
    insertException({ kind: "closed", startMinute: 540, endMinute: 600 }),
  ).rejects.toThrow();
});

test("refuses a custom exception without hours", async () => {
  await expect(
    insertException({ kind: "custom", startMinute: null, endMinute: null }),
  ).rejects.toThrow();
});

test("refuses a closure ending before it starts", async () => {
  await expect(
    insertClosure({ fromDate: "2026-12-26", toDate: "2026-12-24" }),
  ).rejects.toThrow();
});

test("refuses a slot interval that is not 15, 30 or 60", async () => {
  await expect(updateServiceSlotInterval(20)).rejects.toThrow();
});

test("accepts a rule ending exactly at midnight", async () => {
  await expect(insertWeekly({ weekday: 5, startMinute: 1200, endMinute: 1440 })).resolves.toBeDefined();
});
```

- [ ] **Step 7: Run the tests**

Run: `cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/scheduling-constraints.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 8: Verify the constraints exist in the live database**

Run a query against the dev database listing the constraints actually present:

```sql
SELECT conname FROM pg_constraint
WHERE conrelid::regclass::text IN (
  'ntizo_scheduling.member_availability',
  'ntizo_scheduling.date_exception',
  'ntizo_scheduling.house_closure'
) ORDER BY conname;
```

Expected: `member_availability_weekday_range`, `member_availability_minutes`, `date_exception_shape`, `house_closure_range` all present. Paste the output into the report — the test passing and the constraint existing are two different claims.

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/modules/ntizo/shared/infrastructure
git commit -m "feat(scheduling): tables for weekly rules, date exceptions and house closures"
```

---

### Task 2: Interval algebra and the precedence chain

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/scheduling/domain/intervals.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/scheduling/__tests__/intervals.test.ts`

**Interfaces:**
- Produces: `Interval`, `mergeIntervals`, `subtractIntervals`, `DayRules`, `freeIntervals`.

Pure functions only: no database, no clock, no timezone. Everything is minutes from local midnight.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { freeIntervals, mergeIntervals, subtractIntervals } from "../domain/intervals";

describe("mergeIntervals", () => {
  test("joins overlapping stretches into one", () => {
    expect(mergeIntervals([{ start: 480, end: 720 }, { start: 660, end: 840 }]))
      .toEqual([{ start: 480, end: 840 }]);
  });

  test("joins stretches that touch exactly", () => {
    expect(mergeIntervals([{ start: 480, end: 720 }, { start: 720, end: 840 }]))
      .toEqual([{ start: 480, end: 840 }]);
  });

  test("keeps a real gap", () => {
    expect(mergeIntervals([{ start: 480, end: 720 }, { start: 780, end: 1080 }]))
      .toEqual([{ start: 480, end: 720 }, { start: 780, end: 1080 }]);
  });

  test("sorts input it is given out of order", () => {
    expect(mergeIntervals([{ start: 780, end: 1080 }, { start: 480, end: 720 }]))
      .toEqual([{ start: 480, end: 720 }, { start: 780, end: 1080 }]);
  });

  test("drops an empty interval", () => {
    expect(mergeIntervals([{ start: 600, end: 600 }])).toEqual([]);
  });
});

describe("subtractIntervals", () => {
  test("a cut in the middle leaves two pieces", () => {
    expect(subtractIntervals([{ start: 480, end: 1080 }], [{ start: 600, end: 660 }]))
      .toEqual([{ start: 480, end: 600 }, { start: 660, end: 1080 }]);
  });

  test("a cut at the start shortens the front", () => {
    expect(subtractIntervals([{ start: 480, end: 1080 }], [{ start: 480, end: 540 }]))
      .toEqual([{ start: 540, end: 1080 }]);
  });

  test("a cut covering everything leaves nothing", () => {
    expect(subtractIntervals([{ start: 480, end: 1080 }], [{ start: 400, end: 1200 }]))
      .toEqual([]);
  });

  test("a cut outside changes nothing", () => {
    expect(subtractIntervals([{ start: 480, end: 1080 }], [{ start: 1100, end: 1200 }]))
      .toEqual([{ start: 480, end: 1080 }]);
  });

  test("two cuts apply cumulatively", () => {
    expect(
      subtractIntervals([{ start: 480, end: 1080 }], [
        { start: 540, end: 600 },
        { start: 900, end: 960 },
      ]),
    ).toEqual([
      { start: 480, end: 540 },
      { start: 600, end: 900 },
      { start: 960, end: 1080 },
    ]);
  });
});

describe("freeIntervals", () => {
  const weekly = [{ start: 480, end: 1080 }]; // 08:00-18:00

  test("a house closure empties a day the weekly pattern fills", () => {
    expect(freeIntervals({ houseClosed: true, exceptions: [], weekly, busy: [] })).toEqual([]);
  });

  test("a closed exception empties the day", () => {
    expect(
      freeIntervals({
        houseClosed: false,
        exceptions: [{ kind: "closed", start: null, end: null }],
        weekly,
        busy: [],
      }),
    ).toEqual([]);
  });

  test("a closed exception beats a custom one on the same date", () => {
    expect(
      freeIntervals({
        houseClosed: false,
        exceptions: [
          { kind: "custom", start: 540, end: 720 },
          { kind: "closed", start: null, end: null },
        ],
        weekly,
        busy: [],
      }),
    ).toEqual([]);
  });

  test("a custom exception replaces the weekly pattern rather than adding to it", () => {
    expect(
      freeIntervals({
        houseClosed: false,
        exceptions: [{ kind: "custom", start: 540, end: 720 }],
        weekly,
        busy: [],
      }),
    ).toEqual([{ start: 540, end: 720 }]);
  });

  test("several custom exceptions on one date merge", () => {
    expect(
      freeIntervals({
        houseClosed: false,
        exceptions: [
          { kind: "custom", start: 540, end: 720 },
          { kind: "custom", start: 900, end: 1020 },
        ],
        weekly,
        busy: [],
      }),
    ).toEqual([{ start: 540, end: 720 }, { start: 900, end: 1020 }]);
  });

  test("overlapping weekly rows merge into one interval", () => {
    expect(
      freeIntervals({
        houseClosed: false,
        exceptions: [],
        weekly: [{ start: 480, end: 720 }, { start: 660, end: 840 }],
        busy: [],
      }),
    ).toEqual([{ start: 480, end: 840 }]);
  });

  // Nothing supplies busy intervals until slice 4. Passing them by hand is
  // what proves the subtraction now rather than in a slice where nobody
  // remembers it was never exercised.
  test("busy time is subtracted", () => {
    expect(
      freeIntervals({ houseClosed: false, exceptions: [], weekly, busy: [{ start: 600, end: 660 }] }),
    ).toEqual([{ start: 480, end: 600 }, { start: 660, end: 1080 }]);
  });

  test("an empty weekly pattern gives an empty day", () => {
    expect(freeIntervals({ houseClosed: false, exceptions: [], weekly: [], busy: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/scheduling/__tests__/intervals.test.ts`
Expected: FAIL — cannot resolve `../domain/intervals`.

- [ ] **Step 3: Implement**

```ts
/** A half-open stretch of a day, in minutes from local midnight. */
export interface Interval {
  readonly start: number;
  readonly end: number;
}

/**
 * Sorted, non-overlapping, with touching stretches joined.
 *
 * Empty intervals are dropped rather than kept as zero-width markers: a
 * zero-width free interval offers nothing and would only survive to be
 * special-cased downstream.
 */
export function mergeIntervals(list: readonly Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      if (cur.end > last.end) out[out.length - 1] = { start: last.start, end: cur.end };
    } else {
      out.push({ start: cur.start, end: cur.end });
    }
  }
  return out;
}

/** `from` with every part of `busy` taken out of it. */
export function subtractIntervals(
  from: readonly Interval[],
  busy: readonly Interval[],
): Interval[] {
  let out = mergeIntervals(from);
  for (const cut of mergeIntervals(busy)) {
    const next: Interval[] = [];
    for (const iv of out) {
      if (cut.end <= iv.start || cut.start >= iv.end) {
        next.push(iv);
        continue;
      }
      if (cut.start > iv.start) next.push({ start: iv.start, end: cut.start });
      if (cut.end < iv.end) next.push({ start: cut.end, end: iv.end });
    }
    out = next;
  }
  return out;
}

export interface DayException {
  readonly kind: "closed" | "custom";
  readonly start: number | null;
  readonly end: number | null;
}

export interface DayRules {
  /** A provider-wide closure covers this date. */
  readonly houseClosed: boolean;
  /** This member's exceptions for this date. */
  readonly exceptions: readonly DayException[];
  /** This member's weekly rules for this weekday. */
  readonly weekly: readonly Interval[];
  /** Already-taken time. Empty until slice 4 supplies bookings. */
  readonly busy: readonly Interval[];
}

/**
 * What is left of one day, in precedence order.
 *
 * A house closure beats a member's exception, which beats their weekly
 * pattern. `custom` exceptions *replace* the pattern rather than adding to
 * it — "on Saturday I work the morning" means the morning, not the morning
 * plus the usual day.
 */
export function freeIntervals(day: DayRules): Interval[] {
  if (day.houseClosed) return [];
  if (day.exceptions.some((e) => e.kind === "closed")) return [];

  const custom: Interval[] = [];
  for (const e of day.exceptions) {
    if (e.kind === "custom" && e.start !== null && e.end !== null) {
      custom.push({ start: e.start, end: e.end });
    }
  }

  const base = custom.length > 0 ? custom : day.weekly;
  return subtractIntervals(base, day.busy);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/scheduling/__tests__/intervals.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Break-check every test**

For each of the 18, make the smallest change to `intervals.ts` that should break it and confirm it fails, then revert. Specifically: delete the `houseClosed` early return, delete the `closed` early return, change `custom.length > 0 ? custom : day.weekly` to `[...custom, ...day.weekly]`, and remove the `subtractIntervals` call. A test that still passes with the line gone is testing nothing — report it.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/scheduling
git commit -m "feat(scheduling): interval algebra and the day precedence chain"
```

---

### Task 3: Offer generation for both pricing modes

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/scheduling/domain/offers.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/scheduling/__tests__/offers.test.ts`

**Interfaces:**
- Consumes: `Interval` from `../domain/intervals`.
- Produces: `fixedStarts(free: readonly Interval[], shape: FixedShape): number[]` and `hourlyStarts(free: readonly Interval[], shape: HourlyShape): HourlyOffer[]`, where `FixedShape = { durationMinutes: number; bufferMinutes: number; gridMinutes: number }`, `HourlyShape = { minMinutes: number; stepMinutes: number; bufferMinutes: number; gridMinutes: number }` and `HourlyOffer = { start: number; maxMinutes: number }`.

**The rule both share:** the grid is anchored to **local midnight**, not to the interval. With a 30-minute grid the marks are 00:00, 00:30, 01:00 — so an interval opening at 08:10, because an earlier appointment ended there, offers 08:30 and not 08:10. The buffer is occupied but not sold: the appointment is `[t, t + duration)` and the span that must fit is `duration + buffer`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { fixedStarts, hourlyStarts } from "../domain/offers";

describe("fixedStarts", () => {
  const day = [{ start: 480, end: 1080 }]; // 08:00-18:00

  test("walks the grid, not the duration — 45 minutes on a 30 grid", () => {
    const starts = fixedStarts(day, { durationMinutes: 45, bufferMinutes: 0, gridMinutes: 30 });
    expect(starts.slice(0, 4)).toEqual([480, 510, 540, 570]); // 08:00 08:30 09:00 09:30
  });

  test("withholds the last start when duration plus buffer overruns closing", () => {
    // 17:30 + 45 + 0 = 18:15, past the 18:00 close.
    const starts = fixedStarts(day, { durationMinutes: 45, bufferMinutes: 0, gridMinutes: 30 });
    expect(starts.at(-1)).toBe(1020); // 17:00, which ends 17:45
  });

  test("the buffer is counted in what must fit", () => {
    // 17:00 + 45 + 30 = 18:15, so 16:30 becomes the last.
    const starts = fixedStarts(day, { durationMinutes: 45, bufferMinutes: 30, gridMinutes: 30 });
    expect(starts.at(-1)).toBe(990); // 16:30
  });

  test("the grid is anchored to midnight, not to the interval", () => {
    // The interval opens at 08:10 because something ended there.
    const starts = fixedStarts([{ start: 490, end: 1080 }], {
      durationMinutes: 45,
      bufferMinutes: 0,
      gridMinutes: 30,
    });
    expect(starts[0]).toBe(510); // 08:30, never 08:10
  });

  test("an interval too short for one appointment offers nothing", () => {
    expect(
      fixedStarts([{ start: 480, end: 500 }], {
        durationMinutes: 45,
        bufferMinutes: 0,
        gridMinutes: 30,
      }),
    ).toEqual([]);
  });

  test("each free interval is walked independently", () => {
    const starts = fixedStarts(
      [{ start: 480, end: 600 }, { start: 840, end: 960 }],
      { durationMinutes: 60, bufferMinutes: 0, gridMinutes: 60 },
    );
    expect(starts).toEqual([480, 540, 840, 900]);
  });
});

describe("hourlyStarts", () => {
  const day = [{ start: 480, end: 1080 }]; // 08:00-18:00

  test("offers a start every grid mark that fits the minimum", () => {
    const offers = hourlyStarts(day, {
      minMinutes: 180,
      stepMinutes: 30,
      bufferMinutes: 0,
      gridMinutes: 30,
    });
    expect(offers[0]).toEqual({ start: 480, maxMinutes: 600 }); // 08:00, up to 10h
    expect(offers.at(-1)).toEqual({ start: 900, maxMinutes: 180 }); // 15:00, exactly the minimum
  });

  test("the longest length is capped to the step ladder, not to the raw room", () => {
    // 08:00-17:50 leaves 590 minutes; from 180 in steps of 30 the ladder tops
    // out at 570, and 590 is not offerable because nobody could book it.
    const offers = hourlyStarts([{ start: 480, end: 1070 }], {
      minMinutes: 180,
      stepMinutes: 30,
      bufferMinutes: 0,
      gridMinutes: 30,
    });
    expect(offers[0]).toEqual({ start: 480, maxMinutes: 570 });
  });

  test("a window shorter than the minimum offers no start at all", () => {
    expect(
      hourlyStarts([{ start: 480, end: 600 }], {
        minMinutes: 180,
        stepMinutes: 30,
        bufferMinutes: 0,
        gridMinutes: 30,
      }),
    ).toEqual([]);
  });

  test("the buffer shortens what can be sold", () => {
    const offers = hourlyStarts(day, {
      minMinutes: 180,
      stepMinutes: 30,
      bufferMinutes: 60,
      gridMinutes: 30,
    });
    expect(offers[0]).toEqual({ start: 480, maxMinutes: 540 }); // 10h room less 1h buffer
    expect(offers.at(-1)).toEqual({ start: 840, maxMinutes: 180 }); // 14:00 + 3h + 1h = 18:00
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/scheduling/__tests__/offers.test.ts`
Expected: FAIL — cannot resolve `../domain/offers`.

- [ ] **Step 3: Implement**

```ts
import type { Interval } from "./intervals";

export interface FixedShape {
  readonly durationMinutes: number;
  readonly bufferMinutes: number;
  readonly gridMinutes: number;
}

export interface HourlyShape {
  readonly minMinutes: number;
  readonly stepMinutes: number;
  readonly bufferMinutes: number;
  readonly gridMinutes: number;
}

export interface HourlyOffer {
  readonly start: number;
  /** The longest bookable length at this start, on the step ladder. */
  readonly maxMinutes: number;
}

/** The first grid mark at or after `minute`, with the grid anchored to midnight. */
function firstMark(minute: number, gridMinutes: number): number {
  return Math.ceil(minute / gridMinutes) * gridMinutes;
}

/**
 * Every start where a fixed-length appointment fits.
 *
 * The span that must fit is `duration + buffer` — the buffer is occupied but
 * not sold, so the last appointment of the day appears only if it finishes,
 * cleanup included, before closing.
 */
export function fixedStarts(free: readonly Interval[], shape: FixedShape): number[] {
  const span = shape.durationMinutes + shape.bufferMinutes;
  const out: number[] = [];
  for (const iv of free) {
    for (let t = firstMark(iv.start, shape.gridMinutes); t + span <= iv.end; t += shape.gridMinutes) {
      out.push(t);
    }
  }
  return out;
}

/**
 * Every start where at least the minimum fits, with the longest length each
 * one can carry.
 *
 * The maximum is rounded **down** to the step ladder rather than reported as
 * the raw remaining room: a start advertising 590 minutes when the customer
 * can only choose 180, 210, … 570 would offer a length nobody can book.
 */
export function hourlyStarts(free: readonly Interval[], shape: HourlyShape): HourlyOffer[] {
  const out: HourlyOffer[] = [];
  for (const iv of free) {
    const lastSellable = iv.end - shape.bufferMinutes;
    for (
      let t = firstMark(iv.start, shape.gridMinutes);
      t + shape.minMinutes <= lastSellable;
      t += shape.gridMinutes
    ) {
      const room = lastSellable - t;
      const steps = Math.floor((room - shape.minMinutes) / shape.stepMinutes);
      out.push({ start: t, maxMinutes: shape.minMinutes + steps * shape.stepMinutes });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/scheduling/__tests__/offers.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Break-check**

Confirm each test fails when the line it guards is broken: drop `+ shape.bufferMinutes` from `span`; change `firstMark` to return `minute`; change `Math.floor` to `Math.ceil`; change `<=` to `<` in the fixed loop guard.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/scheduling
git commit -m "feat(scheduling): offer generation for fixed and hourly services"
```

---

### Task 4: The timezone module

**Files:**
- Create: `packages/shared/src/datetime/zoned.ts`
- Create: `packages/shared/src/datetime/index.ts` (barrel, if `datetime/` does not exist yet)
- Modify: `packages/shared/src/index.ts` — re-export the barrel, matching the existing export style
- Test: `packages/shared/src/datetime/__tests__/zoned.test.ts`

**Interfaces:**
- Produces: `offsetMinutesAt(timeZone: string, utcMs: number): number`, `localDateTimeToInstant(timeZone: string, isoDate: string, minuteOfDay: number): Date`, `localDateAt(timeZone: string, instant: Date): string`, `addDays(isoDate: string, days: number): string`, `weekdayOf(isoDate: string): number`, `daysBetween(fromIso: string, toIso: string): number`, `isValidTimeZone(tz: string): boolean`.

**Runner:** `packages/shared` uses **vitest**, not `bun:test`.

**Why this exists:** there is no date library in this repository and `Temporal` is `undefined` in Bun. Converting a local wall-clock time to an instant has to be done by hand.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import {
  addDays,
  daysBetween,
  isValidTimeZone,
  localDateAt,
  localDateTimeToInstant,
  offsetMinutesAt,
  weekdayOf,
} from "../zoned";

describe("offsetMinutesAt", () => {
  test("Maputo is +02:00 all year", () => {
    expect(offsetMinutesAt("Africa/Maputo", Date.UTC(2026, 0, 15))).toBe(120);
    expect(offsetMinutesAt("Africa/Maputo", Date.UTC(2026, 6, 15))).toBe(120);
  });

  test("UTC reports zero", () => {
    expect(offsetMinutesAt("UTC", Date.UTC(2026, 0, 15))).toBe(0);
  });

  test("Lisbon is +00:00 in winter and +01:00 in summer", () => {
    expect(offsetMinutesAt("Europe/Lisbon", Date.UTC(2026, 0, 15))).toBe(0);
    expect(offsetMinutesAt("Europe/Lisbon", Date.UTC(2026, 6, 15))).toBe(60);
  });

  test("a half-hour zone is reported in minutes", () => {
    expect(offsetMinutesAt("Asia/Kolkata", Date.UTC(2026, 0, 15))).toBe(330);
  });

  test("a negative offset keeps its sign", () => {
    expect(offsetMinutesAt("America/Sao_Paulo", Date.UTC(2026, 0, 15))).toBe(-180);
  });
});

describe("localDateTimeToInstant", () => {
  test("Maputo 09:00 is 07:00 UTC", () => {
    expect(localDateTimeToInstant("Africa/Maputo", "2026-08-12", 540).toISOString())
      .toBe("2026-08-12T07:00:00.000Z");
  });

  test("minute 1440 is midnight at the end of the day", () => {
    expect(localDateTimeToInstant("Africa/Maputo", "2026-08-12", 1440).toISOString())
      .toBe("2026-08-12T22:00:00.000Z");
  });

  // Lisbon springs forward at 01:00 UTC on 2026-03-29: 01:00 local becomes
  // 02:00 local. Mozambique has no daylight saving, so this bug would only
  // ever appear in a market we have not opened — the worst place to find it.
  test("the hour after a spring-forward is correct", () => {
    expect(localDateTimeToInstant("Europe/Lisbon", "2026-03-29", 180).toISOString())
      .toBe("2026-03-29T02:00:00.000Z"); // 03:00 local, offset +01:00
  });

  test("a local time the spring-forward skipped resolves forward", () => {
    // 01:30 does not exist that day. Resolving forward gives 02:30 local,
    // which is 01:30 UTC.
    expect(localDateTimeToInstant("Europe/Lisbon", "2026-03-29", 90).toISOString())
      .toBe("2026-03-29T01:30:00.000Z");
  });

  test("a local time that happens twice resolves to the first", () => {
    // Lisbon falls back at 01:00 UTC on 2026-10-25. 01:30 local happens at
    // 00:30 UTC (+01:00) and again at 01:30 UTC (+00:00). The first wins.
    expect(localDateTimeToInstant("Europe/Lisbon", "2026-10-25", 90).toISOString())
      .toBe("2026-10-25T00:30:00.000Z");
  });

  test("an ordinary day away from any transition is unaffected", () => {
    expect(localDateTimeToInstant("Europe/Lisbon", "2026-07-15", 540).toISOString())
      .toBe("2026-07-15T08:00:00.000Z");
  });
});

describe("civil date helpers", () => {
  test("localDateAt reads the date in the zone, not in UTC", () => {
    // 23:30 UTC is already the next day in Maputo.
    expect(localDateAt("Africa/Maputo", new Date("2026-08-12T23:30:00.000Z"))).toBe("2026-08-13");
  });

  test("addDays crosses a month boundary", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
  });

  test("addDays crosses a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  test("weekdayOf returns 0 for Sunday", () => {
    expect(weekdayOf("2026-08-16")).toBe(0);
    expect(weekdayOf("2026-08-12")).toBe(3); // a Wednesday
  });

  test("daysBetween counts both ends", () => {
    expect(daysBetween("2026-08-12", "2026-08-12")).toBe(1);
    expect(daysBetween("2026-08-12", "2026-08-14")).toBe(3);
  });

  test("isValidTimeZone rejects what Intl does not know", () => {
    expect(isValidTimeZone("Africa/Maputo")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/shared && bun run test -- zoned`
Expected: FAIL — cannot resolve `../zoned`.

- [ ] **Step 3: Implement**

```ts
const MS_PER_DAY = 86_400_000;

/**
 * The zone's UTC offset, in minutes, at a given instant.
 *
 * `longOffset` gives "GMT+02:00", or the bare string "GMT" for UTC itself —
 * which is why the no-match branch returns 0 rather than throwing.
 */
export function offsetMinutesAt(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(new Date(utcMs));
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(name);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? "0"));
}

/**
 * A local wall-clock time in a zone, as an instant.
 *
 * `minuteOfDay` may be 1440, meaning midnight at the end of `isoDate` — which
 * is how a shop closing at midnight writes its closing hour.
 *
 * The offset cannot simply be read at the naive guess: on a transition day the
 * guess may sit on the wrong side of it. Both the before and after offsets are
 * tried and each candidate is checked against the offset actually in force at
 * it. Two valid candidates means the local time happens twice (autumn) and the
 * earlier wins; none valid means it does not happen at all (spring) and the
 * result moves forward past the gap. This is what `Temporal`'s "compatible"
 * disambiguation does.
 */
export function localDateTimeToInstant(
  timeZone: string,
  isoDate: string,
  minuteOfDay: number,
): Date {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d, 0, minuteOfDay);

  const before = offsetMinutesAt(timeZone, naive - MS_PER_DAY);
  const after = offsetMinutesAt(timeZone, naive + MS_PER_DAY);
  const candidates = before === after ? [before] : [before, after];

  const valid = candidates
    .map((offset) => ({ offset, ms: naive - offset * 60_000 }))
    .filter((c) => offsetMinutesAt(timeZone, c.ms) === c.offset)
    .map((c) => c.ms);

  if (valid.length > 0) return new Date(Math.min(...valid));
  // The gap a spring-forward left. `before` is the smaller offset, so it
  // yields the later instant — forward past the missing hour.
  return new Date(naive - before * 60_000);
}

/** The civil date in the zone, as `YYYY-MM-DD`. */
export function localDateAt(timeZone: string, instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** A civil date shifted by whole days. No zone is involved. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * MS_PER_DAY);
  return shifted.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, matching the `weekday` column. */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** How many civil dates the closed range covers, counting both ends. */
export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = toIso.split("-").map(Number) as [number, number, number];
  return (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY + 1;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/shared && bun run test -- zoned`
Expected: PASS, 18 tests.

If a daylight-saving expectation disagrees with the runtime, **do not adjust the expectation to match the output** — confirm the real transition date for that zone first, then decide which side is wrong. An implementation shaped to its own output tests nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/datetime packages/shared/src/index.ts
git commit -m "feat(shared): wall-clock to instant conversion with daylight-saving handling"
```

---

### Task 5: The scheduling domain — exceptions and the aggregate

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/scheduling/domain/exceptions.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/scheduling/domain/aggregates/member-schedule.aggregate.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/scheduling/__tests__/member-schedule.aggregate.test.ts`

**Interfaces:**
- Consumes: `Interval`, `mergeIntervals` from `../domain/intervals`.
- Produces: the error classes below, and `MemberSchedule` with `static create(providerId, memberId)`, `static rehydrate(props)`, `setWeeklyPattern(rules: WeeklyRuleInput[])`, `addException(input: ExceptionInput): string`, `removeException(exceptionId: string)`, `toJSON()`, and readonly getters `providerId`, `memberId`, `weekly`, `exceptions`.
  - `WeeklyRuleInput = { weekday: number; startMinute: number; endMinute: number }`
  - `ExceptionInput = { onDate: string; kind: "closed" | "custom"; startMinute: number | null; endMinute: number | null; note: string | null }`
  - `WeeklyRule = WeeklyRuleInput & { id: string }`, `DateExceptionEntry = ExceptionInput & { id: string }`

**Codes, exactly as written** — the frontend branches on them:

| class | extends | code |
|---|---|---|
| `AvailabilityRuleInvalidError` | `UnprocessableError` | `AVAILABILITY_RULE_INVALID` |
| `ExceptionShapeInvalidError` | `UnprocessableError` | `EXCEPTION_SHAPE_INVALID` |
| `AvailabilityWindowTooWideError` | `UnprocessableError` | `AVAILABILITY_WINDOW_TOO_WIDE` |
| `TimezoneInvalidError` | `UnprocessableError` | `TIMEZONE_INVALID` |
| `MemberNotInProviderError` | `NotFoundError` | `MEMBER_NOT_IN_PROVIDER` |
| `ServiceMemberCannotPerformError` | `UnprocessableError` | `SERVICE_MEMBER_CANNOT_PERFORM` |
| `NotSelfOrProviderOwnerOrAdminError` | `ForbiddenError` | `NOT_SELF_OR_PROVIDER_OWNER_OR_ADMIN` |
| `ExceptionNotFoundError` | `NotFoundError` | `EXCEPTION_NOT_FOUND` |
| `ClosureNotFoundError` | `NotFoundError` | `CLOSURE_NOT_FOUND` |
| `ClosureRangeInvalidError` | `UnprocessableError` | `CLOSURE_RANGE_INVALID` |

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { MemberSchedule } from "../domain/aggregates/member-schedule.aggregate";

const P = "11111111-1111-1111-1111-111111111111";
const M = "22222222-2222-2222-2222-222222222222";

/** The kit carries `code` beside `message` — asserting on the message matches nothing. */
async function codeOf(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe("MemberSchedule", () => {
  test("starts empty", () => {
    const s = MemberSchedule.create(P, M);
    expect(s.weekly).toEqual([]);
    expect(s.exceptions).toEqual([]);
  });

  test("accepts a weekly pattern and gives every rule an id", () => {
    const s = MemberSchedule.create(P, M);
    s.setWeeklyPattern([
      { weekday: 1, startMinute: 480, endMinute: 720 },
      { weekday: 1, startMinute: 840, endMinute: 1080 },
    ]);
    expect(s.weekly).toHaveLength(2);
    expect(new Set(s.weekly.map((r) => r.id)).size).toBe(2);
  });

  test("replaces the whole pattern rather than appending to it", () => {
    const s = MemberSchedule.create(P, M);
    s.setWeeklyPattern([{ weekday: 1, startMinute: 480, endMinute: 720 }]);
    s.setWeeklyPattern([{ weekday: 2, startMinute: 600, endMinute: 660 }]);
    expect(s.weekly).toHaveLength(1);
    expect(s.weekly[0]!.weekday).toBe(2);
  });

  test("an empty pattern is accepted — it means this person works no fixed days", () => {
    const s = MemberSchedule.create(P, M);
    s.setWeeklyPattern([{ weekday: 1, startMinute: 480, endMinute: 720 }]);
    s.setWeeklyPattern([]);
    expect(s.weekly).toEqual([]);
  });

  test("refuses a rule ending at or before it starts", async () => {
    const s = MemberSchedule.create(P, M);
    expect(await codeOf(() => s.setWeeklyPattern([{ weekday: 1, startMinute: 720, endMinute: 720 }])))
      .toBe("AVAILABILITY_RULE_INVALID");
  });

  test("refuses a rule past midnight", async () => {
    const s = MemberSchedule.create(P, M);
    expect(await codeOf(() => s.setWeeklyPattern([{ weekday: 1, startMinute: 600, endMinute: 1500 }])))
      .toBe("AVAILABILITY_RULE_INVALID");
  });

  test("refuses a weekday outside 0-6", async () => {
    const s = MemberSchedule.create(P, M);
    expect(await codeOf(() => s.setWeeklyPattern([{ weekday: 7, startMinute: 600, endMinute: 660 }])))
      .toBe("AVAILABILITY_RULE_INVALID");
  });

  test("refuses a non-integer minute", async () => {
    const s = MemberSchedule.create(P, M);
    expect(await codeOf(() => s.setWeeklyPattern([{ weekday: 1, startMinute: 480.5, endMinute: 720 }])))
      .toBe("AVAILABILITY_RULE_INVALID");
  });

  test("adds a closed exception and returns its id", () => {
    const s = MemberSchedule.create(P, M);
    const id = s.addException({
      onDate: "2026-08-20", kind: "closed", startMinute: null, endMinute: null, note: "doctor",
    });
    expect(s.exceptions).toHaveLength(1);
    expect(s.exceptions[0]!.id).toBe(id);
  });

  test("refuses a closed exception carrying hours", async () => {
    const s = MemberSchedule.create(P, M);
    expect(
      await codeOf(() =>
        s.addException({
          onDate: "2026-08-20", kind: "closed", startMinute: 540, endMinute: 600, note: null,
        }),
      ),
    ).toBe("EXCEPTION_SHAPE_INVALID");
  });

  test("refuses a custom exception without hours", async () => {
    const s = MemberSchedule.create(P, M);
    expect(
      await codeOf(() =>
        s.addException({
          onDate: "2026-08-20", kind: "custom", startMinute: null, endMinute: null, note: null,
        }),
      ),
    ).toBe("EXCEPTION_SHAPE_INVALID");
  });

  test("refuses a date that is not a civil date", async () => {
    const s = MemberSchedule.create(P, M);
    expect(
      await codeOf(() =>
        s.addException({
          onDate: "20-08-2026", kind: "closed", startMinute: null, endMinute: null, note: null,
        }),
      ),
    ).toBe("EXCEPTION_SHAPE_INVALID");
  });

  test("allows two custom exceptions on the same date", () => {
    const s = MemberSchedule.create(P, M);
    s.addException({ onDate: "2026-08-22", kind: "custom", startMinute: 540, endMinute: 720, note: null });
    s.addException({ onDate: "2026-08-22", kind: "custom", startMinute: 900, endMinute: 1020, note: null });
    expect(s.exceptions).toHaveLength(2);
  });

  test("removes an exception by id", () => {
    const s = MemberSchedule.create(P, M);
    const id = s.addException({ onDate: "2026-08-20", kind: "closed", startMinute: null, endMinute: null, note: null });
    s.removeException(id);
    expect(s.exceptions).toEqual([]);
  });

  test("refuses to remove an exception that is not there", async () => {
    const s = MemberSchedule.create(P, M);
    expect(await codeOf(() => s.removeException("33333333-3333-3333-3333-333333333333")))
      .toBe("EXCEPTION_NOT_FOUND");
  });

  test("rehydrate then toJSON round-trips every field", () => {
    const props = {
      providerId: P,
      memberId: M,
      weekly: [{ id: "r1", weekday: 3, startMinute: 480, endMinute: 1080 }],
      exceptions: [
        { id: "e1", onDate: "2026-08-20", kind: "closed" as const, startMinute: null, endMinute: null, note: "doctor" },
      ],
    };
    expect(MemberSchedule.rehydrate(props).toJSON()).toEqual(props);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/scheduling/__tests__/member-schedule.aggregate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `exceptions.ts`**

Follow `bounded-contexts/catalog/domain/exceptions.ts` exactly — the same file header explaining why each extends a kit type, one class per row of the table above, each setting `this.name`. For example:

```ts
export class AvailabilityRuleInvalidError extends UnprocessableError {
  constructor(reason: string) {
    super({
      message: `That working-hours rule cannot be used: ${reason}`,
      code: "AVAILABILITY_RULE_INVALID",
    });
    this.name = "AvailabilityRuleInvalidError";
  }
}
```

`ServiceMemberCannotPerformError` takes `(serviceId: string, memberId: string)`, `MemberNotInProviderError` takes `(memberId: string)`, `AvailabilityWindowTooWideError` takes `(days: number)` and says the limit is 62, `TimezoneInvalidError` takes `(timezone: string)`, `NotSelfOrProviderOwnerOrAdminError` takes no argument.

- [ ] **Step 4: Write the aggregate**

```ts
import { randomUUID } from "node:crypto";
import {
  AvailabilityRuleInvalidError,
  ExceptionNotFoundError,
  ExceptionShapeInvalidError,
} from "../exceptions";

export interface WeeklyRuleInput {
  weekday: number;
  startMinute: number;
  endMinute: number;
}
export interface WeeklyRule extends WeeklyRuleInput {
  id: string;
}
export interface ExceptionInput {
  onDate: string;
  kind: "closed" | "custom";
  startMinute: number | null;
  endMinute: number | null;
  note: string | null;
}
export interface DateExceptionEntry extends ExceptionInput {
  id: string;
}
export interface MemberScheduleProps {
  providerId: string;
  memberId: string;
  weekly: WeeklyRule[];
  exceptions: DateExceptionEntry[];
}

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertMinutes(start: number, end: number): void {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new AvailabilityRuleInvalidError("minutes must be whole numbers");
  }
  if (start < 0 || end > 1440) {
    throw new AvailabilityRuleInvalidError("a day runs from minute 0 to minute 1440");
  }
  if (end <= start) {
    throw new AvailabilityRuleInvalidError("it must end after it starts");
  }
}

/**
 * One member's working week and the dates that depart from it.
 *
 * The weekly pattern is replaced wholesale rather than patched rule by rule:
 * the screen edits a week as one thing, and a partial update would need a
 * diff nobody sends. An empty pattern is a legitimate state — it says this
 * person works no fixed days.
 */
export class MemberSchedule {
  private constructor(private props: MemberScheduleProps) {}

  static create(providerId: string, memberId: string): MemberSchedule {
    return new MemberSchedule({ providerId, memberId, weekly: [], exceptions: [] });
  }

  static rehydrate(props: MemberScheduleProps): MemberSchedule {
    return new MemberSchedule({
      ...props,
      weekly: [...props.weekly],
      exceptions: [...props.exceptions],
    });
  }

  get providerId(): string {
    return this.props.providerId;
  }
  get memberId(): string {
    return this.props.memberId;
  }
  get weekly(): readonly WeeklyRule[] {
    return this.props.weekly;
  }
  get exceptions(): readonly DateExceptionEntry[] {
    return this.props.exceptions;
  }

  setWeeklyPattern(rules: readonly WeeklyRuleInput[]): void {
    for (const rule of rules) {
      if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) {
        throw new AvailabilityRuleInvalidError("the weekday must be 0 (Sunday) to 6 (Saturday)");
      }
      assertMinutes(rule.startMinute, rule.endMinute);
    }
    this.props.weekly = rules.map((rule) => ({ ...rule, id: randomUUID() }));
  }

  addException(input: ExceptionInput): string {
    if (!CIVIL_DATE.test(input.onDate)) {
      throw new ExceptionShapeInvalidError("the date must be written as YYYY-MM-DD");
    }
    if (input.kind === "closed") {
      if (input.startMinute !== null || input.endMinute !== null) {
        throw new ExceptionShapeInvalidError("a closed day carries no hours");
      }
    } else {
      if (input.startMinute === null || input.endMinute === null) {
        throw new ExceptionShapeInvalidError("a custom day needs both hours");
      }
      assertMinutes(input.startMinute, input.endMinute);
    }
    const id = randomUUID();
    this.props.exceptions = [...this.props.exceptions, { ...input, id }];
    return id;
  }

  removeException(exceptionId: string): void {
    const next = this.props.exceptions.filter((e) => e.id !== exceptionId);
    if (next.length === this.props.exceptions.length) {
      throw new ExceptionNotFoundError(exceptionId);
    }
    this.props.exceptions = next;
  }

  toJSON(): MemberScheduleProps {
    return {
      providerId: this.props.providerId,
      memberId: this.props.memberId,
      weekly: this.props.weekly.map((r) => ({ ...r })),
      exceptions: this.props.exceptions.map((e) => ({ ...e })),
    };
  }
}
```

Note `assertMinutes` throws `AvailabilityRuleInvalidError` even when reached from `addException`. That is deliberate — the reason is about hours, and the form puts both under the same field. The shape errors are the ones about which fields may be present at all.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/scheduling/__tests__/member-schedule.aggregate.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/scheduling
git commit -m "feat(scheduling): member schedule aggregate and the context's refusals"
```

---

### Task 6: Ports and Drizzle repositories

**Files:**
- Create: `.../scheduling/app/ports/outbound/schedule.repository.port.ts`
- Create: `.../scheduling/app/ports/outbound/busy-intervals.port.ts`
- Create: `.../scheduling/infrastructure/repositories/drizzle/member-schedule.mapper.ts`
- Create: `.../scheduling/infrastructure/repositories/drizzle/schedule.repository.ts`
- Create: `.../scheduling/infrastructure/repositories/drizzle/no-bookings-busy.adapter.ts`
- Test: `.../scheduling/__tests__/member-schedule.mapper.test.ts`

**Interfaces:**
- Consumes: `MemberSchedule` and its props from Task 5; the tables from Task 1.
- Produces:

```ts
export interface ClosureRow {
  id: string;
  fromDate: string;
  toDate: string;
  note: string | null;
}

export interface ScheduleRepositoryPort {
  /** An empty schedule rather than null — "this member has set nothing yet" is a state, not a miss. */
  findByMember(providerId: string, memberId: string): Promise<MemberSchedule>;
  /** Replaces this member's weekly rows and exception rows wholesale. */
  save(schedule: MemberSchedule): Promise<void>;
  listClosures(providerId: string): Promise<ClosureRow[]>;
  addClosure(input: { providerId: string; fromDate: string; toDate: string; note: string | null }): Promise<string>;
  removeClosure(providerId: string, closureId: string): Promise<void>;
  /** Every member id of this workspace, with its role. */
  listMembers(providerId: string): Promise<{ memberId: string; userId: string; role: string }[]>;
  memberBelongsToProvider(providerId: string, memberId: string): Promise<boolean>;
  isProviderMember(providerId: string, userId: string): Promise<boolean>;
  isProviderOwnerOrAdmin(providerId: string, userId: string): Promise<boolean>;
  /**
   * Whether this person may edit that member's calendar.
   *
   * A third sibling to the two the catalog introduced, not a flag on either.
   * A day off is the member's own knowledge; closing the calendar of someone
   * who is ill and not answering is the manager's necessity.
   */
  isSelfOrProviderOwnerOrAdmin(providerId: string, userId: string, targetMemberId: string): Promise<boolean>;
  /** The timezone and slot inputs the engine needs, in one round trip. */
  findServiceSchedulingInfo(serviceId: string): Promise<{
    serviceId: string;
    providerId: string;
    timezone: string;
    bufferMinutes: number;
    slotIntervalMinutes: number;
    bookingMode: "priced" | "quote";
    status: string;
    memberIds: string[];
    defaultOption: {
      pricingMode: "fixed" | "hourly";
      durationMinutes: number | null;
      minMinutes: number | null;
      stepMinutes: number | null;
    } | null;
  } | null>;
}

export interface BusyIntervalsPort {
  /**
   * Time already taken, per member, per civil date.
   *
   * Slice 2 has no bookings, so the shipped adapter returns an empty map. The
   * engine's tests pass busy intervals directly, which is what proves the
   * subtraction before slice 4 supplies any.
   */
  forMembers(
    memberIds: readonly string[],
    fromDate: string,
    toDate: string,
  ): Promise<Map<string, { date: string; start: number; end: number }[]>>;
}
```

- [ ] **Step 1: Write the mapper round-trip test**

The whole object, deep-equalled — not field by field. A field-by-field test covers what its author remembered, and the mapper this pattern replaced silently dropped one.

```ts
import { describe, expect, test } from "bun:test";
import { MemberSchedule } from "../domain/aggregates/member-schedule.aggregate";
import { toDomain, toRows } from "../infrastructure/repositories/drizzle/member-schedule.mapper";

describe("member schedule mapper", () => {
  test("round-trips every field of a fully populated schedule", () => {
    const original = MemberSchedule.rehydrate({
      providerId: "11111111-1111-1111-1111-111111111111",
      memberId: "22222222-2222-2222-2222-222222222222",
      weekly: [
        { id: "aaaaaaaa-0000-0000-0000-000000000001", weekday: 1, startMinute: 480, endMinute: 720 },
        { id: "aaaaaaaa-0000-0000-0000-000000000002", weekday: 1, startMinute: 840, endMinute: 1080 },
        { id: "aaaaaaaa-0000-0000-0000-000000000003", weekday: 6, startMinute: 540, endMinute: 1440 },
      ],
      exceptions: [
        { id: "bbbbbbbb-0000-0000-0000-000000000001", onDate: "2026-08-20", kind: "closed", startMinute: null, endMinute: null, note: "doctor" },
        { id: "bbbbbbbb-0000-0000-0000-000000000002", onDate: "2026-08-22", kind: "custom", startMinute: 540, endMinute: 720, note: null },
      ],
    });

    const rows = toRows(original);
    const back = toDomain(original.providerId, original.memberId, rows.weekly, rows.exceptions);

    // The whole object, so a field added later and forgotten in the mapper
    // fails here without anyone remembering to extend this test.
    expect(back.toJSON()).toEqual(original.toJSON());
  });

  test("an empty schedule round-trips to an empty schedule", () => {
    const empty = MemberSchedule.create(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    );
    const rows = toRows(empty);
    expect(toDomain(empty.providerId, empty.memberId, rows.weekly, rows.exceptions).toJSON())
      .toEqual(empty.toJSON());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/scheduling/__tests__/member-schedule.mapper.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the mapper**

`toRows(schedule)` returns `{ weekly: MemberAvailabilityRecord[]; exceptions: DateExceptionRecord[] }` shaped for insertion (id, providerId, memberId and the row's own fields; leave `createdAt`/`updatedAt` to the column defaults by omitting them from the insert type). `toDomain(providerId, memberId, weeklyRows, exceptionRows)` returns `MemberSchedule.rehydrate(...)`. `kind` comes back from the database as `string`; narrow it with `row.kind === "closed" ? "closed" : "custom"` rather than a cast, so an unexpected value lands in a defined state instead of lying to the type system.

- [ ] **Step 4: Write the repository**

`DrizzleScheduleRepository implements ScheduleRepositoryPort`, following `catalog/infrastructure/repositories/drizzle/service.repository.ts` for connection handling and transaction style.

`save` deletes this member's `member_availability` and `date_exception` rows and re-inserts them in one transaction. **This is safe here and would not be in the catalog**: neither table has children, so nothing cascades away. (Follow-up #28 records the catalog's version of this pattern as a landmine precisely because `service_option` will gain children in this slice's successors.)

`isSelfOrProviderOwnerOrAdmin` is one query, not three: read the row of `provider_member` for `(providerId, userId)`; return `true` when its `id` equals `targetMemberId`, or when its `role` is `owner` or `admin`; `false` when there is no row.

`findServiceSchedulingInfo` joins `service` to `provider` for the timezone, and collects `service_member.member_id` plus the default option's pricing shape.

- [ ] **Step 5: Write the empty busy adapter**

```ts
import type { BusyIntervalsPort } from "../../../app/ports/outbound/busy-intervals.port";

/**
 * No bookings exist yet — that is slice 4.
 *
 * Shipped as a real adapter rather than an inline `[]` so slice 4 replaces one
 * class in one bootstrap line, and so the port is exercised by the same code
 * path that will carry real data.
 */
export class NoBookingsBusyAdapter implements BusyIntervalsPort {
  async forMembers(): Promise<Map<string, { date: string; start: number; end: number }[]>> {
    return new Map();
  }
}
```

- [ ] **Step 6: Run the mapper tests**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/scheduling/__tests__/member-schedule.mapper.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/scheduling
git commit -m "feat(scheduling): ports, mapper and the Drizzle repository"
```

---

### Task 7: Use cases and bootstrap

**Files:**
- Create: `.../scheduling/app/use-cases/set-weekly-pattern.command.ts`
- Create: `.../scheduling/app/use-cases/manage-exceptions.command.ts`
- Create: `.../scheduling/app/use-cases/manage-closures.command.ts`
- Create: `.../scheduling/app/use-cases/read-availability-config.query.ts`
- Create: `.../scheduling/bootstrap/index.ts`
- Create: `.../scheduling/index.ts`
- Test: `.../scheduling/__tests__/scheduling-commands.test.ts`

**Interfaces:**
- Consumes: the ports from Task 6, the aggregate from Task 5.
- Produces: `bootstrapScheduling()` returning `{ adapters: { scheduleRepository, busyIntervals }, useCases: { setWeeklyPattern, manageExceptions, manageClosures, readAvailabilityConfig } }` and the type `SchedulingBootstrap`. Command signatures:

```ts
SetWeeklyPatternCommand.execute(input: {
  requesterUserId: string; providerId: string; memberId: string;
  rules: { weekday: number; startMinute: number; endMinute: number }[];
}): Promise<{ ok: true }>

ManageExceptionsCommand.add(input: {
  requesterUserId: string; providerId: string; memberId: string;
  onDate: string; kind: "closed" | "custom";
  startMinute: number | null; endMinute: number | null; note: string | null;
}): Promise<{ exceptionId: string }>

ManageExceptionsCommand.remove(input: {
  requesterUserId: string; providerId: string; memberId: string; exceptionId: string;
}): Promise<{ ok: true }>

ManageClosuresCommand.add(input: {
  requesterUserId: string; providerId: string; fromDate: string; toDate: string; note: string | null;
}): Promise<{ closureId: string }>

ManageClosuresCommand.remove(input: {
  requesterUserId: string; providerId: string; closureId: string;
}): Promise<{ ok: true }>

ReadAvailabilityConfigQuery.execute(input: {
  requesterUserId: string; providerId: string; memberId?: string;
}): Promise<AvailabilityConfigDTO>   // shape defined in Task 10
```

**Guards — every command, without exception:**

| command | guard | on failure |
|---|---|---|
| `setWeeklyPattern`, `manageExceptions.*` | `isSelfOrProviderOwnerOrAdmin(providerId, userId, memberId)` | `NotSelfOrProviderOwnerOrAdminError` |
| `manageClosures.*` | `isProviderOwnerOrAdmin(providerId, userId)` | `NotProviderOwnerOrAdminError`, imported from the catalog's exceptions — the code `NOT_PROVIDER_OWNER_OR_ADMIN` is already translated in all eight `provider.json` files |
| `readAvailabilityConfig` | `isProviderMember(providerId, userId)` | `NotProviderMemberError` from the catalog's exceptions |

Every command that names a `memberId` also calls `memberBelongsToProvider` first and throws `MemberNotInProviderError` — otherwise a member id from another workspace reaches the repository, and the guard above would be answering a question about the wrong pair.

- [ ] **Step 1: Write the failing tests**

Use an in-memory fake implementing `ScheduleRepositoryPort` — construct the command with it directly, as `catalog/__tests__/service-commands.test.ts` does. Every test asserts on the `code`, via the `codeOf` helper from Task 5.

```ts
describe("SetWeeklyPatternCommand", () => {
  test("a member setting their own hours succeeds", async () => { /* self → ok:true, repo.save called */ });
  test("an owner setting another member's hours succeeds", async () => { /* … */ });
  test("a staff member setting another member's hours is refused", async () => {
    expect(await codeOf(() => cmd.execute({ /* staff, other member */ })))
      .toBe("NOT_SELF_OR_PROVIDER_OWNER_OR_ADMIN");
  });
  test("a member id from another workspace is refused before the guard runs", async () => {
    expect(await codeOf(() => cmd.execute({ /* foreign memberId */ }))).toBe("MEMBER_NOT_IN_PROVIDER");
  });
  test("an invalid rule is refused and nothing is saved", async () => {
    expect(await codeOf(() => cmd.execute({ /* endMinute <= startMinute */ })))
      .toBe("AVAILABILITY_RULE_INVALID");
    expect(repo.saved).toBe(false);
  });
});

describe("ManageExceptionsCommand", () => {
  test("adding a closed day returns its id", async () => { /* … */ });
  test("a staff member adding an exception to another member's calendar is refused", async () => {
    expect(await codeOf(() => cmd.add({ /* … */ }))).toBe("NOT_SELF_OR_PROVIDER_OWNER_OR_ADMIN");
  });
  test("removing an exception that is not there is refused", async () => {
    expect(await codeOf(() => cmd.remove({ /* … */ }))).toBe("EXCEPTION_NOT_FOUND");
  });
});

describe("ManageClosuresCommand", () => {
  test("an owner adds a closure", async () => { /* … */ });
  test("an admin adds a closure", async () => { /* … */ });
  test("a staff member adding a closure is refused", async () => {
    expect(await codeOf(() => cmd.add({ /* staff */ }))).toBe("NOT_PROVIDER_OWNER_OR_ADMIN");
  });
  test("a staff member removing a closure is refused", async () => {
    expect(await codeOf(() => cmd.remove({ /* staff */ }))).toBe("NOT_PROVIDER_OWNER_OR_ADMIN");
  });
  test("a range ending before it starts is refused", async () => {
    expect(await codeOf(() => cmd.add({ fromDate: "2026-12-26", toDate: "2026-12-24", /* … */ })))
      .toBe("CLOSURE_RANGE_INVALID");
  });
  test("a date that is not a civil date is refused", async () => {
    expect(await codeOf(() => cmd.add({ fromDate: "26-12-2026", /* … */ }))).toBe("CLOSURE_RANGE_INVALID");
  });
});

describe("ReadAvailabilityConfigQuery", () => {
  test("a staff member may read the workspace's configuration", async () => { /* … */ });
  test("someone who is not a member is refused", async () => {
    expect(await codeOf(() => query.execute({ /* outsider */ }))).toBe("NOT_PROVIDER_MEMBER");
  });
});
```

Write each test out in full — the bodies above are elided only in this plan's prose; the file must contain real arrange/act/assert for all sixteen.

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/scheduling/__tests__/scheduling-commands.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the four use cases**

Each follows `set-service-status.command.ts`: a constructor taking the port, one `execute` (or the named methods above), the guard first, the domain call second, the save third. `ManageClosuresCommand` validates its own dates — `CIVIL_DATE` and `toDate >= fromDate` — throwing `ClosureRangeInvalidError`, because there is no aggregate holding them.

- [ ] **Step 4: Write the bootstrap**

Mirror `catalog/bootstrap/index.ts` exactly:

```ts
export function bootstrapScheduling() {
  const scheduleRepository = new DrizzleScheduleRepository();
  const busyIntervals = new NoBookingsBusyAdapter();
  return {
    adapters: { scheduleRepository, busyIntervals },
    useCases: {
      setWeeklyPattern: new SetWeeklyPatternCommand(scheduleRepository),
      manageExceptions: new ManageExceptionsCommand(scheduleRepository),
      manageClosures: new ManageClosuresCommand(scheduleRepository),
      readAvailabilityConfig: new ReadAvailabilityConfigQuery(scheduleRepository),
    },
  };
}

export type SchedulingBootstrap = ReturnType<typeof bootstrapScheduling>;
```

- [ ] **Step 5: Run the tests**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/scheduling`
Expected: PASS — all scheduling tests, 16 new.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/scheduling
git commit -m "feat(scheduling): commands, guards and bootstrap"
```

---

### Task 8: Performers in the catalog

**Files:**
- Modify: `.../catalog/domain/service-rules.ts` — `canPublish` gains `memberCount`
- Modify: `.../catalog/domain/exceptions.ts` — add `ServiceNeedsMemberError`
- Modify: `.../catalog/domain/aggregates/service.aggregate.ts` — carry `memberIds`
- Modify: `.../catalog/app/ports/outbound/service.repository.port.ts`
- Modify: `.../catalog/infrastructure/repositories/drizzle/service.{mapper,repository}.ts`
- Create: `.../catalog/app/use-cases/set-service-members.command.ts`
- Modify: the provider-member removal use case under `bounded-contexts/provider/app/use-cases/` — find it with `grep -rl "removeMember\|RemoveMember" packages/backend/src/modules/ntizo/bounded-contexts/provider`
- Modify: `.../catalog/bootstrap/index.ts`
- Test: `.../catalog/__tests__/service-members.test.ts`

**Interfaces:**
- Produces: `ServiceNeedsMemberError` (`UnprocessableError`, code `SERVICE_NEEDS_MEMBER`); `Service.setMembers(memberIds: string[])` and `service.memberIds: readonly string[]`; `SetServiceMembersCommand.execute({ requesterUserId, serviceId, memberIds }): Promise<{ ok: true }>`; on the port, `unpublishServicesWithoutMembers(providerId: string): Promise<{ serviceId: string; name: string }[]>`.

**The two ways a published service loses its last performer, answered differently:**

- `service.members.set` clearing the last performer of a **published** service is refused outright. It is an edit, and whoever is making it can simply not make it.
- A member **leaving the workspace** is not refusable — people leave. The cascade removes their `service_member` rows, and the member-removal use case then calls `unpublishServicesWithoutMembers`, which sets `status = 'draft'` for every published service of that provider with no rows left in `service_member`, and returns what it changed so the caller can name them back to the owner.

A foreign key can express neither rule. That is why both live in the use cases.

- [ ] **Step 1: Write the failing tests**

```ts
describe("publishing needs a performer", () => {
  test("canPublish refuses a priced service nobody performs", async () => {
    expect(await codeOf(() => canPublish({
      bookingMode: "priced", categoryId: "c1", hasSourceName: true, optionCount: 1, memberCount: 0,
    }))).toBe("SERVICE_NEEDS_MEMBER");
  });

  test("canPublish refuses a quote service nobody performs", async () => {
    expect(await codeOf(() => canPublish({
      bookingMode: "quote", categoryId: "c1", hasSourceName: true, optionCount: 0, memberCount: 0,
    }))).toBe("SERVICE_NEEDS_MEMBER");
  });

  test("canPublish passes with one performer", () => {
    expect(() => canPublish({
      bookingMode: "priced", categoryId: "c1", hasSourceName: true, optionCount: 1, memberCount: 1,
    })).not.toThrow();
  });

  // The category check still runs first: a service missing both should report
  // the category, so the form's field-by-field messages stay in one order.
  test("a missing category is still reported before a missing performer", async () => {
    expect(await codeOf(() => canPublish({
      bookingMode: "priced", categoryId: null, hasSourceName: true, optionCount: 1, memberCount: 0,
    }))).toBe("SERVICE_CATEGORY_REQUIRED");
  });
});

describe("SetServiceMembersCommand", () => {
  test("a staff member may set who performs a service", async () => { /* any member, ok:true */ });
  test("someone outside the workspace is refused", async () => {
    expect(await codeOf(() => cmd.execute({ /* outsider */ }))).toBe("NOT_PROVIDER_MEMBER");
  });
  test("a member id from another workspace is refused", async () => {
    expect(await codeOf(() => cmd.execute({ memberIds: ["foreign"] }))).toBe("MEMBER_NOT_IN_PROVIDER");
  });
  test("clearing the last performer of a published service is refused", async () => {
    expect(await codeOf(() => cmd.execute({ /* published, memberIds: [] */ })))
      .toBe("SERVICE_NEEDS_MEMBER");
  });
  test("clearing the last performer of a draft service is allowed", async () => {
    await expect(cmd.execute({ /* draft, memberIds: [] */ })).resolves.toEqual({ ok: true });
  });
  test("duplicate member ids are collapsed", async () => { /* ["m1","m1"] saves one row */ });
});

describe("removing a member from the workspace", () => {
  test("a published service left with nobody is unpublished and named back", async () => {
    const result = await removeMember.execute({ /* the only performer of "Corte" */ });
    expect(result.unpublishedServices).toEqual([{ serviceId: "s1", name: "Corte" }]);
    expect(await repo.statusOf("s1")).toBe("draft");
  });

  test("a service with another performer left is untouched", async () => {
    const result = await removeMember.execute({ /* one of two performers */ });
    expect(result.unpublishedServices).toEqual([]);
    expect(await repo.statusOf("s1")).toBe("published");
  });

  test("a draft service with nobody is left alone — it was already not live", async () => {
    const result = await removeMember.execute({ /* only performer of a draft */ });
    expect(result.unpublishedServices).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/catalog/__tests__/service-members.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend `canPublish`**

Add `memberCount: number` to `PublishCheck` and, **after** the category and name checks and before the booking-mode checks:

```ts
  if (service.memberCount === 0) throw new ServiceNeedsMemberError();
```

Adding the field to the interface makes every existing caller fail to compile until it supplies one — which is the point. Update `service.aggregate.ts`'s `publish()` to pass `this.props.memberIds.length`, and every existing test constructing a `PublishCheck` to pass a real count.

- [ ] **Step 4: Carry `memberIds` on the aggregate and through the mapper**

`ServiceProps` gains `memberIds: string[]`. `setMembers` de-duplicates and stores. The mapper writes and reads `service_member` rows. **The existing round-trip test deep-equals the whole `toJSON()`, so it will fail until the mapper handles the new field** — that is the test doing its job; make the mapper right rather than narrowing the assertion.

- [ ] **Step 5: Write the command and the unpublish sweep**

`SetServiceMembersCommand`: `isProviderMember` guard (any member — describing who does the work is the work), then `memberBelongsToProvider` for each id, then the published-and-empty refusal, then `service.setMembers` and `save`.

`unpublishServicesWithoutMembers(providerId)` is one statement:

```sql
UPDATE ntizo_catalog.service s
   SET status = 'draft', updated_at = now()
 WHERE s.provider_id = $1
   AND s.status = 'published'
   AND NOT EXISTS (SELECT 1 FROM ntizo_catalog.service_member sm WHERE sm.service_id = s.id)
RETURNING s.id;
```

The names come from a follow-up read of `service_translation` in the service's `source_locale`. Call it from the member-removal use case **after** the member row is deleted, and add `unpublishedServices` to that use case's return value.

- [ ] **Step 6: Run the tests**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/catalog`
Expected: PASS — the whole catalog suite, including the previously existing tests you updated.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts
git commit -m "feat(catalog): who performs a service, and what happens when they leave"
```

---

### Task 9: The write tier

**Files:**
- Create: `packages/backend/src/modules/ntizo/write/scheduling/graphql/schema/mutations.ts`
- Create: `packages/backend/src/modules/ntizo/write/scheduling/graphql/handlers/mutations.handlers.ts`
- Create: `packages/backend/src/modules/ntizo/write/scheduling/index.ts`
- Modify: `packages/backend/src/modules/ntizo/write/catalog/graphql/schema/mutations.ts` — add `service.members.set`, and `bufferMinutes`/`slotIntervalMinutes` to `updateService`
- Modify: `packages/backend/src/modules/ntizo/write/catalog/graphql/handlers/mutations.handlers.ts`
- Modify: `apps/backend/api/src/graphql/private.ts` — mount the new handlers
- Test: `packages/backend/src/modules/ntizo/write/scheduling/__tests__/scheduling-mutations.test.ts`

**Interfaces:**
- Produces the schema tree:

```ts
export const schedulingWriteSchema = defineGraphQLSchema(
  {
    availability: {
      setWeeklyPattern,
      addException,
      removeException,
      addClosure,
      removeClosure,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
```

and `createSchedulingWriteHandlers(mod: { scheduling: SchedulingBootstrap })`.

**Input shapes** — nullable, not merely optional, wherever "there is none" must be expressible; a `.optional()`-only field can say "leave it" but never "take it away":

```ts
const weeklyRuleInput = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});

export const setWeeklyPattern = defineMutation({
  input: zodSchema(z.object({
    providerId: z.string().min(1),
    memberId: z.string().min(1),
    // `.max(0)` is not a typo guard — an empty array is a real instruction:
    // "this person works no fixed days". `.min(1)` would make clearing a week
    // impossible.
    rules: z.array(weeklyRuleInput).max(60),
  })),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Replace a member's working week", tags: ["Scheduling"] },
});

export const addException = defineMutation({
  input: zodSchema(z.object({
    providerId: z.string().min(1),
    memberId: z.string().min(1),
    onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    kind: z.enum(["closed", "custom"]),
    startMinute: z.number().int().min(0).max(1439).nullable(),
    endMinute: z.number().int().min(1).max(1440).nullable(),
    note: z.string().trim().max(200).nullable(),
  })),
  output: zodSchema(z.object({ exceptionId: z.string().min(1) })),
  docs: { summary: "Mark a date as closed or worked differently", tags: ["Scheduling"] },
});
```

`removeException` takes `{ providerId, memberId, exceptionId }`; `addClosure` takes `{ providerId, fromDate, toDate, note }` with the same date regex; `removeClosure` takes `{ providerId, closureId }`. `service.members.set` takes `{ serviceId, memberIds: z.array(z.string().min(1)).max(100) }` — again no `.min(1)`, because a draft service may legitimately have nobody.

**Handlers:** each calls `requireUser(ctx)` — copy the helper from the catalog's handlers file rather than importing across tiers — and forwards to the use case. The membership question stays in the use case, because it is a database query and `argsMapper` is synchronous.

- [ ] **Step 1: Write the failing tests**

Follow `write/catalog/__tests__/service-mutations.test.ts`. It must cover, for **all five** scheduling mutations plus `service.members.set`:

```ts
test("every scheduling mutation refuses an anonymous caller", async () => {
  for (const field of [
    "availability.setWeeklyPattern",
    "availability.addException",
    "availability.removeException",
    "availability.addClosure",
    "availability.removeClosure",
  ]) {
    expect(await codeOf(() => call(field, {}, { requesterUserId: undefined })))
      .toBe("UNAUTHENTICATED");
  }
});

test("the schema declares exactly the fields the handlers implement", () => {
  // The kit throws at build() when a field has no handler, and leaves the
  // count short when a handler has no field. Building the routes is the
  // assertion; a bare build() with no expect would pass while proving it.
  const routes = createSchedulingWriteHandlers({ scheduling: fakeBootstrap });
  expect(Object.keys(routes).length).toBe(5);
});

test("setWeeklyPattern accepts an empty rules array", async () => { /* clearing a week */ });
test("addException rejects a date that is not YYYY-MM-DD", async () => { /* zod refuses */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/backend && bun test src/modules/ntizo/write/scheduling`
Expected: FAIL.

- [ ] **Step 3: Write the schema, the handlers and the barrel**

- [ ] **Step 4: Extend the catalog's write tier**

Add `service.members.set` to the schema tree under `service`, add `bufferMinutes: z.number().int().min(0).max(480).optional()` and `slotIntervalMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional()` to `updateService` and `createService`, and add the matching `.handle(...)` lines.

- [ ] **Step 5: Mount it**

In `apps/backend/api/src/graphql/private.ts`, import `createSchedulingWriteHandlers`, call `bootstrapScheduling()` beside the existing bootstraps, and spread the handlers alongside `...createCatalogWriteHandlers({ catalog })`.

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd packages/backend && bun test src/modules/ntizo/write && bun run check-types`
Expected: PASS, 0 type errors.

- [ ] **Step 7: Verify against the running API**

Start the API and call `availability.setWeeklyPattern` with no session. Expected: `NOT_AUTHENTICATED`/`UNAUTHENTICATED` in the GraphQL error extensions — **not** `INTERNAL_ERROR`, and not the string "An unexpected error occurred". Then call it with a signed-in staff member targeting another member and confirm `NOT_SELF_OR_PROVIDER_OWNER_OR_ADMIN` comes back. Paste both responses into the report.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/modules/ntizo/write apps/backend/api/src/graphql/private.ts
git commit -m "feat(scheduling): availability mutations on the write tier"
```

---

### Task 10: The read tier — the provider's own configuration

**Files:**
- Create: `packages/shared/src/read-models/system/availability/availability-config.schema.ts`
- Create: `packages/shared/src/read-models/system/availability/index.ts`
- Modify: `packages/shared/src/read-models/system/index.ts`
- Create: `packages/backend/src/modules/ntizo/read/scheduling/graphql/{schema/queries.ts,handlers/queries.handlers.ts}`
- Create: `packages/backend/src/modules/ntizo/read/scheduling/index.ts`
- Modify: `apps/backend/api/src/graphql/private.ts`
- Test: `packages/shared/src/read-models/__tests__/read-models.test.ts` (extend)

**Interfaces:**
- Produces:

```ts
export const availabilityConfigReadModel = z.object({
  providerId: z.string(),
  timezone: z.string(),
  members: z.array(z.object({
    memberId: z.string(),
    userId: z.string(),
    name: z.string().nullable(),
    role: z.string(),
    weekly: z.array(z.object({
      id: z.string(), weekday: z.number(), startMinute: z.number(), endMinute: z.number(),
    })),
    exceptions: z.array(z.object({
      id: z.string(), onDate: z.string(), kind: z.enum(["closed", "custom"]),
      startMinute: z.number().nullable(), endMinute: z.number().nullable(),
      note: z.string().nullable(),
    })),
  })),
  closures: z.array(z.object({
    id: z.string(), fromDate: z.string(), toDate: z.string(), note: z.string().nullable(),
  })),
});
export type AvailabilityConfigDTO = z.infer<typeof availabilityConfigReadModel>;
```

**Every member in one response, not one member per call.** The screen's person picker needs the whole list to draw itself, and fetching each member's week on selection would make switching people a network round trip for data measured in dozens of rows.

- [ ] **Step 1: Extend the read-models test**

Add to `packages/shared/src/read-models/__tests__/read-models.test.ts`, matching the existing cases' style:

```ts
test("availabilityConfigReadModel accepts a full configuration", () => {
  expect(() => availabilityConfigReadModel.parse({ /* one member, one rule, one exception, one closure */ }))
    .not.toThrow();
});

test("availabilityConfigReadModel rejects an unknown exception kind", () => {
  expect(() => availabilityConfigReadModel.parse({ /* kind: "maybe" */ })).toThrow();
});

test("availabilityConfigReadModel accepts a member with an empty week", () => {
  expect(() => availabilityConfigReadModel.parse({ /* weekly: [] */ })).not.toThrow();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/shared && bun run test -- read-models`
Expected: FAIL — `availabilityConfigReadModel` is not exported.

- [ ] **Step 3: Write the read model and the query**

`availability.config` takes `{ providerId: z.string().min(1) }`, outputs `availabilityConfigReadModel`, and its handler calls `readAvailabilityConfig.execute({ requesterUserId: requireUser(ctx), providerId })`.

- [ ] **Step 4: Mount it and run everything**

Run: `cd packages/shared && bun run test && cd ../backend && bun test src/modules/ntizo/read && bun run check-types`
Expected: PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared packages/backend/src/modules/ntizo/read apps/backend/api/src/graphql/private.ts
git commit -m "feat(scheduling): the provider's availability configuration on the read tier"
```

---

### Task 11: The public tier — the customer's question

**Files:**
- Create: `packages/shared/src/read-models/public/availability/service-availability.schema.ts` + `index.ts`
- Modify: `packages/shared/src/read-models/public/index.ts`
- Create: `packages/backend/src/modules/ntizo/public/scheduling/app/use-cases/list-service-availability.projection.ts`
- Create: `packages/backend/src/modules/ntizo/public/scheduling/graphql/{schema/queries.ts,handlers/queries.handlers.ts}`
- Create: `packages/backend/src/modules/ntizo/public/scheduling/{bootstrap.ts,index.ts}`
- Modify: `packages/backend/src/modules/ntizo/public/schema.ts` — add `schedulingPublicSchema` to `mergeGraphQLSchemas`
- Modify: `apps/backend/api/src/graphql/public.ts`
- Test: `packages/backend/src/modules/ntizo/public/scheduling/__tests__/list-service-availability.test.ts`

**Interfaces:**
- Consumes: `freeIntervals`, `fixedStarts`, `hourlyStarts`, `localDateTimeToInstant`, `addDays`, `weekdayOf`, `daysBetween`, `ScheduleRepositoryPort`, `BusyIntervalsPort`.
- Produces:

```ts
export const serviceAvailabilityReadModel = z.object({
  serviceId: z.string(),
  timezone: z.string(),
  pricingMode: z.enum(["fixed", "hourly"]),
  days: z.array(z.object({
    date: z.string(),
    starts: z.array(z.object({
      minuteOfDay: z.number(),
      /** ISO instant, so the browser never re-does the timezone maths. */
      startsAt: z.string(),
      /** Only for hourly services; null for fixed. */
      maxMinutes: z.number().nullable(),
      /** Who is free at this moment. Never empty — a start with nobody is not returned. */
      memberIds: z.array(z.string()),
    })),
  })),
});
```

**No context schema on the public mount.** Declaring the private one made every field demand a session, and the landing page got "Authentication required" from a query built to need nobody. Follow `public/catalog/graphql/schema/queries.ts`.

**The projection, in order:**

1. `findServiceSchedulingInfo(serviceId)` → null means `SERVICE_NOT_FOUND`.
2. A service whose `status !== "published"` is `SERVICE_NOT_FOUND` too — a draft is not a thing the public may ask about, and a distinct error would tell an anonymous caller that the id exists.
3. `bookingMode === "quote"` → an empty `days` array, not an error. A quote service has no calendar and asking is reasonable.
4. `daysBetween(from, to) > 62` → `AvailabilityWindowTooWideError`.
5. `memberId` given: refuse with `ServiceMemberCannotPerformError` when it is not in `memberIds`; otherwise narrow to `[memberId]`.
6. Load every relevant member's schedule and the provider's closures once, and `busyIntervals.forMembers(...)` once — **never per day**, or a two-month window becomes 62 round trips.
7. For each date from `from` to `to`: compute `houseClosed` from the closures, and for each member compute `freeIntervals`, then `fixedStarts` or `hourlyStarts` from the default option's shape.
8. Group by `minuteOfDay`, collecting the member ids, and convert with `localDateTimeToInstant(timezone, date, minuteOfDay)`. For hourly, `maxMinutes` is the **largest** among the free members at that minute.

**One field-name seam to get right.** The engine's `DayRules.exceptions` uses
`{ kind, start, end }` because it knows nothing about rows; the aggregate and
the database use `startMinute`/`endMinute`. This projection is the only place
that translates between them. Do it once, in a named function, not inline at
three call sites.

- [ ] **Step 1: Write the failing tests**

Drive the projection with in-memory fakes for both ports. This fixture is the
shape every case below varies — write it first:

```ts
import { describe, expect, test } from "bun:test";
import { ListServiceAvailability } from "../app/use-cases/list-service-availability.projection";
import { MemberSchedule } from "../../../bounded-contexts/scheduling/domain/aggregates/member-schedule.aggregate";

const PROVIDER = "11111111-1111-1111-1111-111111111111";
const JOAO = "22222222-2222-2222-2222-222222222222";
const MARIA = "33333333-3333-3333-3333-333333333333";
const SERVICE = "44444444-4444-4444-4444-444444444444";

/** Monday to Friday, 08:00-18:00. 2026-08-12 is a Wednesday. */
function workingWeek(memberId: string) {
  const s = MemberSchedule.create(PROVIDER, memberId);
  s.setWeeklyPattern(
    [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 480, endMinute: 1080 })),
  );
  return s;
}

function fakeRepo(overrides: Partial<{
  schedules: Map<string, MemberSchedule>;
  closures: { id: string; fromDate: string; toDate: string; note: string | null }[];
  info: Awaited<ReturnType<ScheduleRepositoryPort["findServiceSchedulingInfo"]>>;
}> = {}) {
  const schedules = overrides.schedules ?? new Map([[JOAO, workingWeek(JOAO)]]);
  const closures = overrides.closures ?? [];
  const info =
    overrides.info === undefined
      ? {
          serviceId: SERVICE,
          providerId: PROVIDER,
          timezone: "Africa/Maputo",
          bufferMinutes: 0,
          slotIntervalMinutes: 30,
          bookingMode: "priced" as const,
          status: "published",
          memberIds: [JOAO],
          defaultOption: {
            pricingMode: "fixed" as const,
            durationMinutes: 45,
            minMinutes: null,
            stepMinutes: null,
          },
        }
      : overrides.info;

  return {
    findServiceSchedulingInfo: async () => info,
    findByMember: async (_p: string, memberId: string) =>
      schedules.get(memberId) ?? MemberSchedule.create(PROVIDER, memberId),
    listClosures: async () => closures,
    // The projection touches nothing else; leaving the rest unimplemented
    // means a projection that starts calling them fails loudly here rather
    // than silently reading undefined.
  } as unknown as ScheduleRepositoryPort;
}

function fakeBusy(rows: Map<string, { date: string; start: number; end: number }[]> = new Map()) {
  const port = {
    calls: 0,
    async forMembers() {
      port.calls += 1;
      return rows;
    },
  };
  return port;
}
```

```ts
test("a fixed service returns the grid for each open day", async () => {
  const projection = new ListServiceAvailability(fakeRepo(), fakeBusy());
  const result = await projection.execute({
    serviceId: SERVICE, memberId: undefined, from: "2026-08-12", to: "2026-08-12",
  });
  expect(result.days).toHaveLength(1);
  // 08:00 to the last start that finishes by 18:00, on the 30-minute grid.
  expect(result.days[0]!.starts[0]!.minuteOfDay).toBe(480);
  expect(result.days[0]!.starts.at(-1)!.minuteOfDay).toBe(1020); // 17:00, ends 17:45
});
test("a day covered by a house closure comes back with no starts", async () => { /* … */ });
test("a member's closed exception removes only that member", async () => {
  // Two performers, one closed that day: the day still has starts, all of
  // them naming only the other member.
});
test("a start free for two members carries both ids", async () => { /* … */ });
test("busy time supplied by the port is subtracted", async () => {
  // Nothing supplies it until slice 4; the fake does, which is what proves
  // the projection actually passes it through to the engine.
});
test("an hourly service reports the longest length per start", async () => { /* … */ });
test("hourly maxMinutes is the largest among the free members", async () => { /* … */ });
test("a quote service returns an empty day list, not an error", async () => { /* … */ });
test("a window wider than 62 days is refused", async () => {
  expect(await codeOf(() => projection.execute({ from: "2026-01-01", to: "2026-04-01" })))
    .toBe("AVAILABILITY_WINDOW_TOO_WIDE");
});
test("exactly 62 days is accepted", async () => { /* 2026-01-01 to 2026-03-03 */ });
test("a named member who does not perform the service is refused", async () => {
  expect(await codeOf(() => projection.execute({ memberId: "someone-else" })))
    .toBe("SERVICE_MEMBER_CANNOT_PERFORM");
});
test("an unpublished service is not found", async () => {
  expect(await codeOf(() => projection.execute({ /* draft */ }))).toBe("SERVICE_NOT_FOUND");
});
test("startsAt is the instant matching the provider's timezone", async () => {
  // Maputo, 09:00 local on 2026-08-12 → "2026-08-12T07:00:00.000Z".
});
test("the busy port is asked once, not once per day", async () => {
  await projection.execute({ from: "2026-08-01", to: "2026-08-31" });
  expect(busyFake.calls).toBe(1);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/backend && bun test src/modules/ntizo/public/scheduling`
Expected: FAIL.

- [ ] **Step 3: Implement the projection, the query and the bootstrap**

- [ ] **Step 4: Mount it on the public schema**

`mergeGraphQLSchemas` already has more than two arguments, so adding `schedulingPublicSchema` is a one-line change. Confirm the import guard still passes: `public/` must not reach into `read/` or `write/`.

Run: `cd packages/backend && bun test src/modules/ntizo/public/__tests__/public-imports.guard.test.ts`
Expected: PASS.

- [ ] **Step 5: Run everything and typecheck**

Run: `cd packages/backend && bun test src/modules/ntizo && bun run check-types`
Expected: PASS, 0 type errors.

- [ ] **Step 6: Verify against the running API, signed out**

Call `availability.forService` with **no session at all** for a published service of an active provider, over a one-week window. Expected: real days with real starts. Then call it for a draft service and confirm `SERVICE_NOT_FOUND`. Paste both into the report — a public query that only works while signed in is the failure this tier exists to prevent.

- [ ] **Step 7: Commit**

```bash
git add packages/shared packages/backend/src/modules/ntizo/public apps/backend/api/src/graphql/public.ts
git commit -m "feat(scheduling): the customer's availability query on the public tier"
```

---

### Task 12: The provider's availability screen

**Files:**
- Create: `apps/frontend/web/src/features/provider/availability/data/availability.repository.ts`
- Create: `apps/frontend/web/src/features/provider/availability/domain/{types.ts,week.ts}`
- Create: `apps/frontend/web/src/features/provider/availability/viewmodel/use-availability.ts`
- Create: `apps/frontend/web/src/features/provider/availability/ui/{availability-page.tsx,week-editor.tsx,exceptions-panel.tsx,closures-panel.tsx}`
- Create: `apps/frontend/web/src/routes/provider/$slug/availability.tsx`
- Modify: the provider zone's navigation (find it with `grep -rn "overview\|wallet" apps/frontend/web/src/features/provider --include="*.tsx" | grep -i "nav\|tab"`)
- Test: `apps/frontend/web/src/features/provider/availability/domain/__tests__/week.test.ts`

**Interfaces:**
- Consumes: `availability.config`, `availability.setWeeklyPattern`, `availability.addException`, `availability.removeException`, `availability.addClosure`, `availability.removeClosure`.
- Produces: `minutesToLabel(minute: number): string` (`540` → `"09:00"`, `1440` → `"24:00"`), `labelToMinutes(label: string): number | null`, `overlaps(rules: WeeklyRuleDraft[], candidate: WeeklyRuleDraft): boolean`, `WEEKDAY_ORDER: number[]`.

**Runner:** the web app uses **vitest**.

**Rules the screen must hold:**

- **`ui/` may not import from `data/`.** Shapes shared between them live in `domain/types.ts`.
- The week starts on **Monday** in the display (`WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]`) while the stored `weekday` keeps 0 = Sunday. Storing what `Date#getUTCDay` returns and displaying what a week looks like are different problems.
- The form **refuses to add a row overlapping an existing one for the same weekday**, with a message under the field. The database does not refuse it and the engine merges it harmlessly — this is a usability guard, not an invariant.
- An individual provider (one member) sees no person picker and no mention of staff. Read the member list from `availability.config`: one member means one calendar.
- Closures and the timezone are hidden unless `activeProvider.role` is `owner` or `admin`, the same way slice 1 hides publish and archive. **Hiding is not the guard** — the server refuses regardless, and Task 9's verification proved it.

- [ ] **Step 1: Write the failing domain tests**

```ts
import { describe, expect, test } from "vitest";
import { labelToMinutes, minutesToLabel, overlaps } from "../week";

describe("minutesToLabel", () => {
  test("pads to two digits", () => {
    expect(minutesToLabel(540)).toBe("09:00");
    expect(minutesToLabel(485)).toBe("08:05");
  });
  test("midnight at the end of the day reads as 24:00", () => {
    expect(minutesToLabel(1440)).toBe("24:00");
  });
  test("midnight at the start reads as 00:00", () => {
    expect(minutesToLabel(0)).toBe("00:00");
  });
});

describe("labelToMinutes", () => {
  test("reads a valid label", () => expect(labelToMinutes("09:30")).toBe(570));
  test("reads 24:00", () => expect(labelToMinutes("24:00")).toBe(1440));
  test("rejects nonsense", () => {
    expect(labelToMinutes("9h30")).toBeNull();
    expect(labelToMinutes("25:00")).toBeNull();
    expect(labelToMinutes("09:70")).toBeNull();
    expect(labelToMinutes("")).toBeNull();
  });
});

describe("overlaps", () => {
  const monday = { weekday: 1, startMinute: 480, endMinute: 720 };
  test("a row inside another overlaps", () => {
    expect(overlaps([monday], { weekday: 1, startMinute: 540, endMinute: 600 })).toBe(true);
  });
  test("a row straddling the end overlaps", () => {
    expect(overlaps([monday], { weekday: 1, startMinute: 660, endMinute: 840 })).toBe(true);
  });
  test("a row starting exactly where the other ends does not overlap", () => {
    expect(overlaps([monday], { weekday: 1, startMinute: 720, endMinute: 840 })).toBe(false);
  });
  test("the same hours on a different weekday do not overlap", () => {
    expect(overlaps([monday], { weekday: 2, startMinute: 540, endMinute: 600 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/frontend/web && bun run test -- week`
Expected: FAIL.

- [ ] **Step 3: Implement `domain/week.ts` and `domain/types.ts`**

- [ ] **Step 4: Write the repository, the viewmodel and the four UI files**

Follow `features/provider/services/` for the shape: `data/` holds the GraphQL documents and `queryOptions`, `viewmodel/` holds the hooks and the mutations with their cache invalidation, `ui/` renders.

Two traps this project has already paid for:

- **Do not key a form component on the fetched value and also sync it in an effect.** A background refetch mid-typing discards what the user is writing. Hold the draft in state, seed it once, and reconcile only on a successful save.
- **Do not disable a control from the prop a sheet was opened with.** Read the live value. Slice 1 shipped a booking-mode lock that read the wrong one and let a quote service be flipped to priced.

- [ ] **Step 5: Add the route and the navigation entry**

- [ ] **Step 6: Run the tests, typecheck and lint**

Run: `cd apps/frontend/web && bun run test && bun run check-types && bun run lint`
Expected: PASS, 0 errors.

- [ ] **Step 7: Verify in the browser**

Sign in as a provider owner, open the availability tab, set a working week, save, reload, and confirm it came back. Add a closed exception and a custom one on the same date. Add a house closure. Then sign in as a **staff** member of the same workspace and confirm: their own week is editable, the person picker does not offer editing someone else's, and the closures block is absent.

Screenshot each. Use CSS pixels for any click coordinates — a screenshot's pixel space is not the page's, and a coordinate taken from the image lands somewhere else.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(web): the provider's availability screen"
```

---

### Task 13: Performers, buffer and grid on the service form

**Files:**
- Modify: `apps/frontend/web/src/features/provider/services/ui/service-form.tsx`
- Modify: `apps/frontend/web/src/features/provider/services/data/service.repository.ts`
- Modify: `apps/frontend/web/src/features/provider/services/domain/{types.ts,service-draft.ts}`
- Modify: `apps/frontend/web/src/features/provider/services/viewmodel/use-service-editor.ts`
- Test: `apps/frontend/web/src/features/provider/services/domain/__tests__/service-draft.test.ts` (extend)

**Interfaces:**
- Consumes: `service.members.set`, `availability.config` (for the member list), and `service.update`'s two new fields.

**What the form gains:**

- **"Who does this"** — a checkbox list of the workspace's members. Hidden entirely for an individual provider, whose single member is added automatically. Pre-ticked with the signed-in member when creating.
- **Buffer** — a number in minutes, 0 to 480, with the hint that it covers cleanup or the journey.
- **Grid** — a select of 15 / 30 / 60, defaulting to 30.

Both new numeric fields must render an empty input as empty and not as `0`, and must not turn `300` into `"300,5"` under a locale that groups digits. Slice 1 shipped exactly that bug in `optionDraftFrom`; read how it was fixed before writing these.

- [ ] **Step 1: Write the failing draft tests**

```ts
test("a new draft starts with the creating member ticked", () => { /* … */ });
test("a new draft defaults to a 30-minute grid and no buffer", () => {
  expect(emptyServiceDraft().slotIntervalMinutes).toBe(30);
  expect(emptyServiceDraft().bufferMinutes).toBe(0);
});
test("an empty buffer input reads as 0, not NaN", () => { /* … */ });
test("a buffer over 480 is refused with a field message", () => { /* … */ });
test("a service for an individual provider needs no explicit performer", () => { /* … */ });
test("a published service cannot be saved with nobody performing it", () => {
  // The form refuses before the request, and the server refuses too — this
  // asserts the client half.
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/frontend/web && bun run test -- service-draft`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests, typecheck and lint**

Run: `cd apps/frontend/web && bun run test && bun run check-types && bun run lint`
Expected: PASS.

- [ ] **Step 5: Verify in the browser**

Create a service as an organization owner, tick two performers, set a 15-minute grid and a 10-minute buffer, save, reload, confirm all three came back. Then untick every performer on a **published** service and confirm the refusal names the field rather than saying something broke.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(web): performers, buffer and slot grid on the service form"
```

---

### Task 14: Services on the public provider page

**Files:**
- Modify: `apps/frontend/web/src/features/directory/ui/provider-detail-page.tsx`
- Create: `apps/frontend/web/src/features/directory/services/{data,domain,viewmodel,ui}/` — mirror the `directory` feature's existing layout
- Test: `apps/frontend/web/src/features/directory/services/domain/__tests__/service-card.test.ts`

**Interfaces:**
- Consumes: the existing public `service.all` query, which today **nothing on the customer side reads** — this closes follow-up #30.

The provider's page gains a services section: each published service as a card with its name, its default option's price and duration, and its image. Selecting one opens the panel Task 15 builds.

- [ ] **Step 1: Write the failing tests**

```ts
test("a fixed service's card shows the default option's price and duration", () => { /* … */ });
test("a service with several options shows the default one, not the first", () => { /* … */ });
test("a quote service shows 'by quote' instead of a price", () => {
  // Branch on bookingMode, never on "is there a default option" — slice 1
  // shipped that mistake and a priced service with no options yet read as
  // "by quote".
});
test("an hourly service shows its minimum and its rate", () => { /* … */ });
test("a service with no image falls back to the provider's", () => { /* … */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/frontend/web && bun run test -- service-card`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests, typecheck and lint**

Run: `cd apps/frontend/web && bun run test && bun run check-types && bun run lint`
Expected: PASS.

- [ ] **Step 5: Verify in the browser, signed out**

Open a published provider's public page **in a signed-out window**. The services must render. Confirm a draft service does not appear.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(web): services on the public provider page"
```

---

### Task 15: The customer's availability panel

**Files:**
- Create: `apps/frontend/web/src/features/directory/availability/data/availability.repository.ts`
- Create: `apps/frontend/web/src/features/directory/availability/domain/{types.ts,day-strip.ts}`
- Create: `apps/frontend/web/src/features/directory/availability/viewmodel/use-service-availability.ts`
- Create: `apps/frontend/web/src/features/directory/availability/ui/{availability-sheet.tsx,date-strip.tsx,time-grid.tsx,member-picker.tsx}`
- Test: `apps/frontend/web/src/features/directory/availability/domain/__tests__/day-strip.test.ts`

**Interfaces:**
- Consumes: `availability.forService`.
- Produces: `weekOf(anchorIso: string): string[]` (seven civil dates, Monday first), `isPast(dateIso: string, todayIso: string): boolean`, `groupByHour(starts: Start[]): Start[][]`.

**What it looks like:** a sheet over the provider page. The service's card at the top with its price and duration; a month label and a seven-day strip with past days struck through and the selected day filled; below it the free times as a grid of buttons. A member picker only when the service has more than one performer — with "anyone" as the first choice, which is what the query with no `memberId` answers.

**There is no booking button.** Booking is slice 4. Selecting a time highlights it and nothing else. Do not add a disabled "Book" button as a placeholder: a control that cannot ever work reads as broken software, where its absence reads as a feature not yet arrived.

**Traps this project has paid for:**

- The panel loads a window, not everything. If an infinite scroll or a "next week" fetch is added, rebuild the `IntersectionObserver` on each page — a sentinel that stays in view fires once and stalls.
- `IntersectionObserver` does not fire at all in a hidden browser tab. When verifying, keep the tab in the foreground, or a working feature will look broken.
- Do not append a query parameter to a route with no search schema; the router redirects and the page will look like it failed.

- [ ] **Step 1: Write the failing tests**

```ts
describe("weekOf", () => {
  test("returns seven dates starting on Monday", () => {
    expect(weekOf("2026-08-12")).toEqual([
      "2026-08-10", "2026-08-11", "2026-08-12",
      "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16",
    ]);
  });
  test("a Sunday anchor belongs to the week that started six days earlier", () => {
    expect(weekOf("2026-08-16")[0]).toBe("2026-08-10");
  });
  test("crosses a month boundary", () => {
    expect(weekOf("2026-08-31")).toContain("2026-09-06");
  });
});

describe("isPast", () => {
  test("yesterday is past", () => expect(isPast("2026-08-11", "2026-08-12")).toBe(true));
  test("today is not past", () => expect(isPast("2026-08-12", "2026-08-12")).toBe(false));
  test("tomorrow is not past", () => expect(isPast("2026-08-13", "2026-08-12")).toBe(false));
});

describe("groupByHour", () => {
  test("puts every start of one hour in one group", () => { /* … */ });
  test("keeps groups in chronological order", () => { /* … */ });
  test("an empty list gives no groups", () => expect(groupByHour([])).toEqual([]));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/frontend/web && bun run test -- day-strip`
Expected: FAIL.

- [ ] **Step 3: Implement the domain, the repository, the viewmodel and the UI**

- [ ] **Step 4: Run the tests, typecheck and lint**

Run: `cd apps/frontend/web && bun run test && bun run check-types && bun run lint`
Expected: PASS.

- [ ] **Step 5: Verify in the browser, signed out**

With the provider configured in Task 12's verification: open the public page signed out, open a fixed-price service, and confirm the times match the configured week on the grid the service declares. Move to a day with a closed exception and confirm it is empty. Move to a day inside the house closure and confirm it is empty. Open an **hourly** service and confirm the starts carry selectable lengths. Switch the member picker between "anyone" and a named person and confirm the times change.

Screenshot each. Keep the tab in the foreground.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(web): the customer's availability panel"
```

---

### Task 16: Translations and end-to-end verification

**Files:**
- Modify: all eight `apps/frontend/web/src/shared/locales/<locale>/provider.json`
- Modify: all eight `apps/frontend/web/src/shared/locales/<locale>/*.json` covering the public directory — find the right namespace with `ls apps/frontend/web/src/shared/locales/pt-MZ/`
- Test: whichever test asserts locale-file parity — find it with `grep -rln "locales" apps/frontend/web/src --include="*.test.ts"`

**Every key added by Tasks 12 to 15 must exist in all eight locales, natively translated.** Not English placeholders: the categories screens are natively translated throughout, and matching them is the precedent. Weekday names come from `Intl.DateTimeFormat(locale, { weekday: "long" })` rather than from the locale files — eight files times seven days is 56 strings the platform already knows.

- [ ] **Step 1: List every key the four features introduced**

Run: `cd apps/frontend/web && grep -rhoE '\bt\("([^"]+)"' src/features/provider/availability src/features/directory/availability src/features/directory/services src/features/provider/services/ui/service-form.tsx | sort -u`

- [ ] **Step 2: Add every key to `pt-MZ` first, then the other seven**

`pt-MZ` is the platform default and the fallback every other locale falls back to. Translate from it, do not translate from English.

- [ ] **Step 3: Run the parity test and the full suite**

Run: `cd apps/frontend/web && bun run test && bun run check-types && bun run lint`
Expected: PASS, 0 errors.

- [ ] **Step 4: Verify the source-locale fallback in the browser**

Switch the app to `de-DE` and open the availability screen and the customer's panel. Every label must be German. Then switch to `nl-NL` and confirm the same. A key that falls back silently shows the `pt-MZ` string and looks intentional — look for Portuguese words on a German screen specifically.

- [ ] **Step 5: The whole-slice walkthrough**

One pass, one workspace, in this order, screenshotting each:

1. As an organization **owner**: set the timezone, set the working week for two members, add a house closure, add one member's day off.
2. Create a service, tick both members, set a 30-minute grid and a 15-minute buffer, publish it.
3. Signed **out**, open the provider's public page, open the service, and confirm the free times match — including the closure day being empty and the day-off member disappearing from that day's picker.
4. As a **staff** member: confirm the availability tab edits their own week, offers no closures block, and that `availability.setWeeklyPattern` called directly against another member's id is refused by the server.
5. Remove one of the two performers from the workspace and confirm the service stays published, because one performer remains. Remove the other and confirm the service is unpublished and named in the response.

Step 5 is the one nothing else covers: it is the rule a foreign key cannot express, and the only place it can be seen working.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(web): availability copy in all eight locales"
```

---

## Self-review

**Spec coverage.** Every section of the spec maps to a task: the three scheduling tables, `service_member`, the two `service` columns and `provider.timezone` → Task 1; the precedence chain → Task 2; both offer modes → Task 3; the timezone module and its daylight-saving cases → Task 4; the errors table → Task 5 (with the two publish-related codes in Task 8); the guard split → Task 7; the two ways a service loses its performers → Task 8; the GraphQL surface → Tasks 9 to 11; the 62-day bound and the `memberId`-optional union → Task 11; the provider and customer screens → Tasks 12 to 15; the eight locales → Task 16.

**Two spec items deliberately not built, and where they are recorded.** The spec's "Open, deliberately" list — overnight windows, per-person pricing, per-slot capacity, travel time, seasonal bounds, a default template — is unchanged by this plan and no task touches any of them. `end_minute <= 1440` in Task 1 is what forecloses the first; that is intended and stated in both documents.

**Placeholder scan — one deliberate exception, declared.** Tasks 7, 8, 11,
13, 14 and 15 carry test bodies written as a precise `test("…")` name with an
elided body. This breaks the skill's rule against "write tests for the above",
and it is a real weakness rather than an oversight: written out in full the
plan would roughly double, and the names below are specific enough to be
assertions rather than topics ("a staff member setting another member's hours
is refused", not "test permissions"). Task 11's fixture is written out in full
because its shape *is* the design and an implementer would otherwise invent
one. **Every implementer working these six tasks must write the body the name
promises and then break-check it** — delete the line it guards and confirm it
fails. A test whose name claims a refusal and whose body asserts nothing is
the exact defect every task review in slice 1 found at least once.

**Type consistency.** `weekday` is 0 = Sunday everywhere: the column (Task 1), the aggregate (Task 5), `weekdayOf` (Task 4). Only `WEEKDAY_ORDER` in Task 12 reorders it, for display alone. Minutes are `startMinute`/`endMinute` in the database, the aggregate and the GraphQL inputs; the engine's own `Interval` uses `start`/`end` because it knows nothing about rows — the mapper between them is in Task 11's projection. `memberId` is the `provider_member.id` throughout, never the `userId`; `isSelfOrProviderOwnerOrAdmin` is the only function taking both, and its parameter order is `(providerId, userId, targetMemberId)` in the port, the repository and every call site.
