# Detail pages redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/providers/$slug` and `/services/$id` one shared shape — collage gallery, title block, facts between hairlines, content, sticky rail — and add the three public fields that shape honestly needs.

**Architecture:** Three new fields land on a detail-only read model (`providerPublicDetailReadModel`) so the 24-card directory does not pay for them. The frontend grows five shared presentation components under `features/directory/ui/` plus two pure domain modules, then both pages are reassembled on top of them. Nothing is invented: every rendered fact traces to a column or an aggregate.

**Tech Stack:** Bun, Turborepo, Hono + `@cosmneo/onion-lasagna`, Drizzle (Neon Postgres), Zod read models, React 19 + TanStack Router/Query, Tailwind v4 with CSS-variable tokens, i18next, vitest (shared + web), `bun test` (backend).

**Spec:** `docs/superpowers/specs/2026-08-28-detail-pages-redesign-design.md`
**Mockup:** `docs/superpowers/specs/2026-08-28-detail-pages-redesign.mockup.html` — open it in a browser; the bar at the top switches between the two pages.

## Global Constraints

- **Never render a fact the platform does not record.** Response time, languages spoken, cancellation policy, escrow, and the service name under a review are all out of scope and must not appear. The spec's table "What the mockup asked for and does not exist" is binding.
- **Booking does not exist.** No button anywhere may imply a reservation was made. The primary CTA is `availabilityCheckAction` ("Ver disponibilidade"); `packageBookingsClosed` stays beside it.
- **Weekday numbering is `0 = Sunday … 6 = Saturday`**, as `member-schedule.aggregate.ts` enforces (`"the weekday must be 0 (Sunday) to 6 (Saturday)"`). Display order is Monday-first via the existing `WEEKDAY_ORDER = [1,2,3,4,5,6,0]`.
- **Weekday names come from `Intl`, never from translation keys.** Eight hand-written copies of "Monday" is eight chances to disagree with the calendar.
- **Every new i18n key lands in all eight locales in the same commit**: `pt-MZ`, `pt-PT`, `en-US`, `es-ES`, `fr-FR`, `de-DE`, `it-IT`, `nl-NL`. A missing key falls back to the key name, which ships an English identifier into a Portuguese page.
- **Design tokens only.** Colours, radii and type come from `packages/frontend/src/styles/globals.css`: `--color-primary`, `--color-foreground`, `--color-muted-foreground`, `--color-border`, `--color-border-strong`, `--color-muted`, `--color-success`, `--color-warning`, `--radius-card` (16px), `--radius-card-sm` (12px), `--shadow-sm`, and the `type-display` / `type-h1` / `type-h2` / `type-body` / `type-body-medium` / `type-caption` classes. No literal hex, no ad-hoc `text-[17px]`.
- **Commission is 10%**, from `NTIZO_COMMISSION_RATE` in `features/directory/services/domain/booking-total.ts`. Never hardcode it again.
- **Web tests read English, not key names.** `src/test/setup.ts` imports the real i18n instance and jsdom's navigator resolves it to `en`, so `t("availabilityClosed")` renders `"Closed"` in a test. Assert the English copy from `en-US/directory.json`; asserting a key id passes while proving nothing.
- **Mock the viewmodel hook, never the query cache.** The `boundaries/dependencies` ESLint rule forbids a `ui/` file — test files included — from importing `data/`, so seeding a `QueryClient` with `directoryQueries.…queryKey` is both a lint error and the wrong seam. `service-detail-page.test.tsx` shows the pattern: `vi.mock` the hook module, hold the fixture in a mutable `state` object, then `await import` the component under test.
- **Test commands**
  - shared: `cd packages/shared && bun run test`
  - backend: `cd packages/backend && bun test src/modules/ntizo/public/provider`
  - web: `cd apps/frontend/web && bunx vitest run <path>`
  - types: `cd <package> && bun run typecheck`

---

### Task 1: The detail read model

**Files:**
- Modify: `packages/shared/src/read-models/public/provider-public.schema.ts`
- Test: `packages/shared/src/read-models/__tests__/read-models.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `weeklyHoursReadModel`, `providerPublicDetailReadModel`, and the types `WeeklyHoursDTO`, `ProviderPublicDetailDTO`. `WeeklyHoursDTO` is `{ weekday: number; intervals: { startMinute: number; endMinute: number }[] }`. `ProviderPublicDetailDTO` is `ProviderPublicDTO` plus `memberSince: string | null`, `serviceLocationTypes: string[]`, `weeklyHours: WeeklyHoursDTO[]`.

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/read-models/__tests__/read-models.test.ts` (add `providerPublicDetailReadModel` and `providerPublicReadModel` to the imports from `../public`):

```ts
describe("providerPublicDetailReadModel", () => {
  const base = {
    id: "p1", name: "Org", slug: "org", type: "organization" as const,
    description: null, city: null, district: null, country: null,
    logoUrl: null, photoUrls: [], verified: false,
    ratingAverage: null, reviewCount: 0, categories: [],
    serviceCount: 0, fromAmountMinor: null, fromCurrency: null,
  };

  it("accepts a provider with hours, a join month and location types", () => {
    const parsed = providerPublicDetailReadModel.parse({
      ...base,
      memberSince: "2025-03",
      serviceLocationTypes: ["at_customer", "remote"],
      weeklyHours: [{ weekday: 1, intervals: [{ startMinute: 480, endMinute: 1080 }] }],
    });
    expect(parsed.memberSince).toBe("2025-03");
    expect(parsed.weeklyHours[0]?.intervals[0]?.endMinute).toBe(1080);
  });

  it("accepts a closed weekday as an empty interval list", () => {
    const parsed = providerPublicDetailReadModel.parse({
      ...base, memberSince: null, serviceLocationTypes: [],
      weeklyHours: [{ weekday: 0, intervals: [] }],
    });
    expect(parsed.weeklyHours[0]?.intervals).toEqual([]);
  });

  it("rejects a weekday outside 0..6", () => {
    expect(() =>
      providerPublicDetailReadModel.parse({
        ...base, memberSince: null, serviceLocationTypes: [],
        weeklyHours: [{ weekday: 7, intervals: [] }],
      }),
    ).toThrow();
  });

  it("rejects a memberSince that is not an ISO year-month", () => {
    expect(() =>
      providerPublicDetailReadModel.parse({
        ...base, memberSince: "2025-03-14", serviceLocationTypes: [], weeklyHours: [],
      }),
    ).toThrow();
  });

  it("still parses as the list model, so the directory is unaffected", () => {
    expect(() => providerPublicReadModel.parse(base)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/shared && bun run test`
Expected: FAIL — `providerPublicDetailReadModel` is not exported.

- [ ] **Step 3: Add the models**

Append to `packages/shared/src/read-models/public/provider-public.schema.ts`, after `export type ProviderPublicDTO`:

```ts
/**
 * One weekday's usual opening, as the business rather than as a member.
 *
 * `intervals` is the *union* of every member's rules for that weekday, already
 * merged by the projection — never `min(start)`–`max(end)`. An organization
 * running two shifts with a gap between them would otherwise publish itself as
 * open through a break it does not staff. An empty array means closed, which is
 * a fact; a missing weekday would be an absence the reader has to interpret, so
 * all seven are always present.
 */
export const weeklyHoursReadModel = z.object({
  weekday: z.number().int().min(0).max(6),
  intervals: z.array(
    z.object({
      startMinute: z.number().int().min(0).max(1440),
      endMinute: z.number().int().min(0).max(1440),
    }),
  ),
});

/**
 * A provider on their own page — the list model plus what only a detail view
 * needs.
 *
 * A separate model rather than three more fields on `providerPublicReadModel`,
 * for the reason `serviceDetailReadModel` already records: the directory asks
 * for 24 providers at a time and needs none of this. Joining every member's
 * availability 24 times to render a list of cards would make the browse pay for
 * a page it is not.
 *
 * Every field here is a one-way publication, the same as `logoUrl` and
 * `photoUrls` above.
 */
export const providerPublicDetailReadModel = providerPublicReadModel.extend({
  /**
   * The month the business joined, as `YYYY-MM` — never the day.
   *
   * The exact date somebody registered is not a thing a customer needs and not
   * a thing the business chose to publish; the month is enough to tell a
   * five-year business from a five-week one, which is the only question being
   * asked. Nullable so a future backfill can admit it does not know, rather
   * than being forced to invent a date.
   */
  memberSince: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullable(),

  /**
   * Where this business actually works, derived from its published services'
   * `location_type` — not from anything it declared.
   *
   * The same reasoning as `categories` above: a provider who says they travel
   * but publishes only at-provider services would otherwise appear to offer
   * something they do not sell.
   */
  serviceLocationTypes: z.array(z.string()),

  /** All seven weekdays, always. See `weeklyHoursReadModel`. */
  weeklyHours: z.array(weeklyHoursReadModel),
});

export type WeeklyHoursDTO = z.infer<typeof weeklyHoursReadModel>;
export type ProviderPublicDetailDTO = z.infer<typeof providerPublicDetailReadModel>;
```

- [ ] **Step 4: Export them from the barrel**

Check `packages/shared/src/read-models/public/index.ts` re-exports `./provider-public.schema` with `export *`. If it names its exports one by one instead, add `weeklyHoursReadModel`, `providerPublicDetailReadModel`, `WeeklyHoursDTO` and `ProviderPublicDetailDTO` to that list.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd packages/shared && bun run test && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/read-models
git commit -m "Publish a provider's join month, where they work and their usual hours

A detail-only model, extended off the list one, so the 24-card directory
does not join every member's availability to render a card. The hours are
the union of the members' rules, merged, with all seven weekdays always
present — an empty interval list is a fact, a missing weekday is a riddle."
```

---

### Task 2: `mergeIntervals`

**Files:**
- Create: `packages/backend/src/modules/ntizo/public/provider/app/use-cases/weekly-hours.ts`
- Test: `packages/backend/src/modules/ntizo/public/provider/__tests__/weekly-hours.test.ts`

**Interfaces:**
- Consumes: `WeeklyHoursDTO` from Task 1.
- Produces: `mergeIntervals(intervals: readonly Interval[]): Interval[]` and `weeklyHoursFromRows(rows: readonly { weekday: number; startMinute: number; endMinute: number }[]): WeeklyHoursDTO[]`, where `Interval = { startMinute: number; endMinute: number }`. `weeklyHoursFromRows` always returns exactly 7 entries, ordered `weekday` 0..6.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/modules/ntizo/public/provider/__tests__/weekly-hours.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { mergeIntervals, weeklyHoursFromRows } from "../app/use-cases/weekly-hours";

describe("mergeIntervals", () => {
  it("returns disjoint intervals untouched, in order", () => {
    expect(
      mergeIntervals([
        { startMinute: 960, endMinute: 1200 },
        { startMinute: 480, endMinute: 720 },
      ]),
    ).toEqual([
      { startMinute: 480, endMinute: 720 },
      { startMinute: 960, endMinute: 1200 },
    ]);
  });

  it("merges overlapping intervals", () => {
    expect(
      mergeIntervals([
        { startMinute: 480, endMinute: 780 },
        { startMinute: 720, endMinute: 1080 },
      ]),
    ).toEqual([{ startMinute: 480, endMinute: 1080 }]);
  });

  it("merges intervals that only touch", () => {
    // The two-member roster this whole function exists for: one works the
    // morning, one the afternoon, and the business is open all day. Left
    // unmerged this reads as two shifts with a seam at noon.
    expect(
      mergeIntervals([
        { startMinute: 480, endMinute: 720 },
        { startMinute: 720, endMinute: 1080 },
      ]),
    ).toEqual([{ startMinute: 480, endMinute: 1080 }]);
  });

  it("absorbs a fully contained interval", () => {
    expect(
      mergeIntervals([
        { startMinute: 480, endMinute: 1080 },
        { startMinute: 600, endMinute: 700 },
      ]),
    ).toEqual([{ startMinute: 480, endMinute: 1080 }]);
  });

  it("keeps a real gap as a gap", () => {
    // The case min/max would destroy: a lunch break becomes "open 08:00-20:00".
    expect(
      mergeIntervals([
        { startMinute: 480, endMinute: 720 },
        { startMinute: 960, endMinute: 1200 },
      ]),
    ).toEqual([
      { startMinute: 480, endMinute: 720 },
      { startMinute: 960, endMinute: 1200 },
    ]);
  });

  it("returns a single interval unchanged", () => {
    expect(mergeIntervals([{ startMinute: 540, endMinute: 840 }])).toEqual([
      { startMinute: 540, endMinute: 840 },
    ]);
  });

  it("returns nothing for nothing", () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = [
      { startMinute: 960, endMinute: 1200 },
      { startMinute: 480, endMinute: 720 },
    ];
    mergeIntervals(input);
    expect(input[0]?.startMinute).toBe(960);
  });
});

describe("weeklyHoursFromRows", () => {
  it("always returns seven weekdays, in order", () => {
    const result = weeklyHoursFromRows([]);
    expect(result).toHaveLength(7);
    expect(result.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(result.every((d) => d.intervals.length === 0)).toBe(true);
  });

  it("unions two members' rules for the same weekday", () => {
    const result = weeklyHoursFromRows([
      { weekday: 1, startMinute: 480, endMinute: 720 },
      { weekday: 1, startMinute: 720, endMinute: 1080 },
    ]);
    expect(result[1]).toEqual({
      weekday: 1,
      intervals: [{ startMinute: 480, endMinute: 1080 }],
    });
  });

  it("keeps weekdays apart", () => {
    const result = weeklyHoursFromRows([
      { weekday: 6, startMinute: 540, endMinute: 840 },
      { weekday: 1, startMinute: 480, endMinute: 1080 },
    ]);
    expect(result[6]?.intervals).toEqual([{ startMinute: 540, endMinute: 840 }]);
    expect(result[1]?.intervals).toEqual([{ startMinute: 480, endMinute: 1080 }]);
    expect(result[0]?.intervals).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/backend && bun test src/modules/ntizo/public/provider/__tests__/weekly-hours.test.ts`
Expected: FAIL — cannot resolve `../app/use-cases/weekly-hours`.

- [ ] **Step 3: Write the implementation**

Create `packages/backend/src/modules/ntizo/public/provider/app/use-cases/weekly-hours.ts`:

```ts
import type { WeeklyHoursDTO } from "@ntizo/shared/read-models";

export interface Interval {
  startMinute: number;
  endMinute: number;
}

/** Every weekday, Sunday first — the numbering `member_availability` stores. */
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * The union of a set of intervals, sorted and folded.
 *
 * `member_availability` is keyed by member, and this card speaks for the
 * business. Taking `min(start)`–`max(end)` instead would report a business with
 * a morning member and an evening member as open through the afternoon nobody
 * staffs — the one failure this function exists to prevent.
 *
 * Touching intervals merge (`next.start <= current.end`, not `<`), because a
 * member working 08:00–12:00 beside one working 12:00–18:00 is one working day,
 * not two shifts with a seam at noon.
 *
 * Copies before sorting: the caller's array is a query result somebody else may
 * still be reading.
 */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.startMinute - b.startMinute);
  const merged: Interval[] = [];

  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, interval.endMinute);
      continue;
    }
    merged.push({ startMinute: interval.startMinute, endMinute: interval.endMinute });
  }

  return merged;
}

/**
 * Availability rows — every member's, for one provider — as the seven-day
 * summary the public page renders.
 *
 * All seven weekdays are always returned. A weekday with no rules comes back
 * with an empty `intervals` array, which the UI renders as closed; omitting it
 * would leave the reader to decide whether the day is shut or the data is
 * missing, and those are not the same claim.
 */
export function weeklyHoursFromRows(
  rows: readonly { weekday: number; startMinute: number; endMinute: number }[],
): WeeklyHoursDTO[] {
  return WEEKDAYS.map((weekday) => ({
    weekday,
    intervals: mergeIntervals(
      rows
        .filter((row) => row.weekday === weekday)
        .map((row) => ({ startMinute: row.startMinute, endMinute: row.endMinute })),
    ),
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/backend && bun test src/modules/ntizo/public/provider/__tests__/weekly-hours.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/public/provider
git commit -m "Union a provider's members' hours instead of spanning them

min(start)-max(end) would publish a business as open through a break
nobody staffs. This merges the intervals, treats touching ones as one
working day, and returns all seven weekdays so a closed day is a fact
rather than an absence the reader has to interpret."
```

---

### Task 3: Serve the three fields

**Files:**
- Modify: `packages/backend/src/modules/ntizo/public/provider/app/ports/outbound/provider-public.repository.port.ts`
- Modify: `packages/backend/src/modules/ntizo/public/provider/app/ports/inbound/index.ts`
- Modify: `packages/backend/src/modules/ntizo/public/provider/app/use-cases/get-public-provider.projection.ts`
- Modify: `packages/backend/src/modules/ntizo/public/provider/infra/repositories/drizzle/provider-public.repository.ts`
- Modify: `packages/backend/src/modules/ntizo/public/provider/graphql/schema/queries.ts`
- Test: `packages/backend/src/modules/ntizo/public/provider/__tests__/public-provider.test.ts`

**Interfaces:**
- Consumes: `providerPublicDetailReadModel` / `ProviderPublicDetailDTO` (Task 1), `weeklyHoursFromRows` (Task 2).
- Produces: `provider.bySlug` returns `ProviderPublicDetailDTO | null`. `ProviderPublicRepositoryPort.findActiveBySlug(slug, locale)` returns the same. `provider.list` is unchanged and still returns `ProviderPublicDTO`.

- [ ] **Step 1: Write the failing tests**

In `packages/backend/src/modules/ntizo/public/provider/__tests__/public-provider.test.ts`:

1. Change the `dto` fixture's type to `ProviderPublicDetailDTO` and add the three fields:

```ts
const dto: ProviderPublicDetailDTO = {
  id: "p1", name: "Org", slug: "org", type: "organization",
  description: null, city: null, district: null, country: null, logoUrl: null,
  photoUrls: [], verified: false, ratingAverage: null, reviewCount: 0,
  categories: [], serviceCount: 0, fromAmountMinor: null, fromCurrency: null,
  memberSince: null, serviceLocationTypes: [], weeklyHours: [],
};
```

`FakeRepo`'s `findActiveBySlug` return type becomes `Promise<ProviderPublicDetailDTO | null>`; `listActive` keeps returning `ProviderPage` built from the same object (the extra keys are harmless there — `listActive` is typed against `ProviderPublicDTO`, which this satisfies).

2. Extend the `PublicProviderRow` type and `row` fixture in the `toDTO` describe with `createdAt: Date`, `locationTypes: string[] | null` and `weeklyHours: WeeklyHoursDTO[]`, then add:

```ts
it("publishes created_at as a year-month, never a day", () => {
  const result = toDTO({ ...row, createdAt: new Date("2025-03-14T09:41:00Z") });
  expect(result.memberSince).toBe("2025-03");
  expect(JSON.stringify(result)).not.toContain("14");
});

it("maps a null location-type aggregate to an empty list, not null", () => {
  const result = toDTO({ ...row, locationTypes: null });
  expect(result.serviceLocationTypes).toEqual([]);
});

it("passes the location types through in the order given", () => {
  const result = toDTO({ ...row, locationTypes: ["at_customer", "remote"] });
  expect(result.serviceLocationTypes).toEqual(["at_customer", "remote"]);
});

it("never carries createdAt, in any form, once mapped", () => {
  const result = toDTO({ ...row }) as Record<string, unknown>;
  expect(Object.keys(result)).not.toContain("createdAt");
});
```

`toDTO`'s narrow cast gains the third argument:

```ts
const raw = (
  DrizzleProviderPublicRepository as unknown as {
    toDTO(
      row: PublicProviderRow,
      categories: { code: string; name: string }[],
      weeklyHours: WeeklyHoursDTO[],
    ): ProviderPublicDetailDTO;
  }
).toDTO;
const toDTO = (row: PublicProviderRow) => raw(row, [], []);
```

3. Add a source assertion beside the existing two:

```ts
it("scopes the weekly-hours query to one provider", () => {
  // Availability rows are not filtered by provider status — the slug lookup
  // above already refused an inactive provider before this query runs — so
  // the only thing standing between one business's hours and another's is
  // this predicate.
  expect(source).toContain("eq(memberAvailability.providerId,");
});
```

Leave `expect(statusChecks.length).toBe(3)` alone: the new query reads `member_availability`, never `provider`, so the count does not move.

4. Add a projection test beside the existing `GetPublicProviderProjection` describe:

```ts
it("passes the detail fields through untouched", async () => {
  const repo = new FakeRepo({
    ...dto,
    memberSince: "2025-03",
    serviceLocationTypes: ["at_customer"],
    weeklyHours: [{ weekday: 1, intervals: [{ startMinute: 480, endMinute: 1080 }] }],
  });
  const result = await new GetPublicProviderProjection(repo).execute({ slug: "org" });
  expect(result?.memberSince).toBe("2025-03");
  expect(result?.weeklyHours[1 - 1]?.intervals[0]?.startMinute).toBe(480);
});
```

Add `ProviderPublicDetailDTO` and `WeeklyHoursDTO` to the `@ntizo/shared/read-models` import at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/backend && bun test src/modules/ntizo/public/provider`
Expected: FAIL — type errors on `memberSince`, and the new assertions fail.

- [ ] **Step 3: Widen the ports and the projection**

In `app/ports/outbound/provider-public.repository.port.ts`, change `findActiveBySlug`'s return type to `Promise<ProviderPublicDetailDTO | null>` and import the type. `listActive` is untouched.

In `app/ports/inbound/index.ts`, change `GetPublicProviderPort.execute`'s return type to `Promise<ProviderPublicDetailDTO | null>` and import the type.

In `app/use-cases/get-public-provider.projection.ts`, swap `ProviderPublicDTO` for `ProviderPublicDetailDTO` in the import and the signature. The body does not change.

- [ ] **Step 4: Add the aggregate, the column and the hours query**

In `infra/repositories/drizzle/provider-public.repository.ts`:

Add to the imports:

```ts
import { memberAvailability } from "../../../../../shared/infrastructure/database/scheduling/schemas/member-availability.schema";
import { weeklyHoursFromRows } from "../../../app/use-cases/weekly-hours";
import type { ProviderPublicDetailDTO, WeeklyHoursDTO } from "@ntizo/shared/read-models";
```

Add a fifth aggregate inside `aggregates()`, before the `return`:

```ts
  // Where this business actually works, from what it publishes rather than
  // from what it declares — the same rule `categories` follows. `array_agg`
  // over a distinct set, so a provider with six at-home services contributes
  // "at_customer" once.
  const locations = db
    .select({
      providerId: service.providerId,
      types: sql<
        string[] | null
      >`array_agg(distinct ${service.locationType})`.as("location_types"),
    })
    .from(service)
    .where(eq(service.status, "published"))
    .groupBy(service.providerId)
    .as("location_agg");
```

and return it: `return { reviews, services, prices, verified, locations };`

Add to `COLUMNS`:

```ts
    createdAt: provider.createdAt,
```

Add to `aggregateColumns`:

```ts
      locationTypes: agg.locations.types,
```

Widen `toDTO`'s row type with `createdAt: Date; locationTypes: string[] | null;`, give it a third parameter `weeklyHours: WeeklyHoursDTO[]`, change its return type to `ProviderPublicDetailDTO`, and add to the object it builds:

```ts
      // Year-month only. `toISOString().slice(0, 7)` rather than a locale
      // format: this is a machine value the reader's own `Intl` turns into
      // "Março 2025", so the server never picks a language.
      memberSince: row.createdAt.toISOString().slice(0, 7),
      // `array_agg` returns null for a provider with no published services,
      // and an empty list is the honest reading of that.
      serviceLocationTypes: row.locationTypes ?? [],
      weeklyHours,
```

`createdAt` must not survive into the DTO — build the object field by field as `toDTO` already does; do not spread `row`.

In `findActiveBySlug`, add the join and the second query:

```ts
      .leftJoin(agg.locations, eq(agg.locations.providerId, provider.id))
```

after the row guard:

```ts
    if (!row) return null;
    const categories = await this.categoriesFor([row.id], locale);
    // Every member's rules for this business, unioned into seven days by
    // `weeklyHoursFromRows`. A second round trip rather than a sixth join:
    // this is one row per member per weekday, and folding it into the
    // aggregate above would multiply the single provider row it decorates.
    const rules = await db
      .select({
        weekday: memberAvailability.weekday,
        startMinute: memberAvailability.startMinute,
        endMinute: memberAvailability.endMinute,
      })
      .from(memberAvailability)
      .where(eq(memberAvailability.providerId, row.id));

    return DrizzleProviderPublicRepository.toDTO(
      row,
      categories.get(row.id) ?? [],
      weeklyHoursFromRows(rules),
    );
```

`listActive` calls `toDTO` too — pass `[]` as the third argument there. Its rows have no `createdAt` unless `COLUMNS` is shared; since `COLUMNS` is shared, `createdAt` comes along for free and `memberSince` is computed for list rows as well. That is fine and cheap: it is a column already on the row, not a join.

- [ ] **Step 5: Change the GraphQL output schema**

In `graphql/schema/queries.ts`, import `providerPublicDetailReadModel` and change `getPublicProvider`'s output to `zodSchema(providerPublicDetailReadModel.nullable())`. Leave `listPublicProviders` alone.

- [ ] **Step 6: Run the tests and the type check**

Run: `cd packages/backend && bun test src/modules/ntizo/public/provider && bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo/public/provider
git commit -m "Serve a provider's join month, where they work and their usual hours

provider.bySlug now answers with the detail model; provider.list is
untouched, so the directory's 24 cards do not grow a join. The hours are
a second round trip on purpose — one row per member per weekday would
multiply the single provider row the aggregates decorate."
```

---

### Task 4: Every new string, in eight languages

**Files:**
- Modify: `apps/frontend/web/src/shared/locales/{pt-MZ,pt-PT,en-US,es-ES,fr-FR,de-DE,it-IT,nl-NL}/directory.json`
- Test: `apps/frontend/web/src/shared/locales/__tests__/locales.test.ts` (create if absent)

**Interfaces:**
- Consumes: nothing.
- Produces: the keys every later task uses — `factCategory`, `factWhere`, `factMemberSince`, `factDuration`, `factPricingMode`, `aboutHeading`, `aboutServiceHeading`, `galleryViewAll` (+`_other`), `galleryDialogTitle`, `availabilityHeading`, `availabilityClosed`, `availabilityUsualNote`, `railFromPrice`, `railCheapestOf` (+`_other`), `railViewServices`, `trustVerified`, `trustMessagesKept`, `trustFeeIncluded`, `quotePrice`, `quoteAction`, `pricingModeFixed`, `pricingModeHourly`, `reviewsSeeAll`.

Existing keys these pages reuse rather than duplicate: `servicesTitle`, `filterWhereOption.*`, `availabilityCheckAction`, `messageProviderCta`, `packagesTitle`, `packageBookingsClosed`, `packagePrice`, `packageCommission`, `packageTotal`, `packageDuration`, `reviewsHeading`, `reviewsShowing`, `reviewsAboutProvider`, `ratingCount`, `providerServiceCount`, `serviceDurationMinutes`, `serviceMinimumMinutes`, `priceHourlySuffix`, `typeIndividual`, `typeOrganization`, `breadcrumbHome`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/shared/locales/__tests__/locales.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import deDE from "../de-DE/directory.json";
import enUS from "../en-US/directory.json";
import esES from "../es-ES/directory.json";
import frFR from "../fr-FR/directory.json";
import itIT from "../it-IT/directory.json";
import nlNL from "../nl-NL/directory.json";
import ptMZ from "../pt-MZ/directory.json";
import ptPT from "../pt-PT/directory.json";

const LOCALES = {
  "de-DE": deDE, "en-US": enUS, "es-ES": esES, "fr-FR": frFR,
  "it-IT": itIT, "nl-NL": nlNL, "pt-MZ": ptMZ, "pt-PT": ptPT,
};

/**
 * A key present in one language and missing in another does not fail loudly —
 * i18next falls back to the key name, so a Portuguese page quietly renders
 * `factMemberSince`. This is the only test that catches that.
 */
describe("directory namespace", () => {
  const reference = Object.keys(ptMZ).sort();

  for (const [locale, bundle] of Object.entries(LOCALES)) {
    it(`${locale} declares exactly the same keys as pt-MZ`, () => {
      expect(Object.keys(bundle).sort()).toEqual(reference);
    });

    it(`${locale} leaves no value empty`, () => {
      for (const [key, value] of Object.entries(bundle)) {
        if (typeof value === "string") expect(value.trim(), key).not.toBe("");
      }
    });
  }
});
```

- [ ] **Step 2: Run it to see it pass on today's files, then fail after the first edit**

Run: `cd apps/frontend/web && bunx vitest run src/shared/locales/__tests__/locales.test.ts`
Expected: PASS (all eight already agree at 161 keys). This test is the guard for the next step; add the keys to `pt-MZ` only, re-run, and watch the other seven fail. That failure is the point.

- [ ] **Step 3: Add the keys to all eight files**

`pt-MZ/directory.json` and `pt-PT/directory.json`:

```json
"factCategory": "Categoria",
"factWhere": "Onde atende",
"factMemberSince": "Na Ntizo desde",
"factDuration": "Duração",
"factPricingMode": "Modo de preço",
"aboutHeading": "Sobre",
"aboutServiceHeading": "Sobre este serviço",
"galleryViewAll": "Ver a {{count}} foto",
"galleryViewAll_other": "Ver as {{count}} fotos",
"galleryDialogTitle": "Fotografias",
"availabilityHeading": "Disponibilidade",
"availabilityClosed": "Fechado",
"availabilityUsualNote": "Horário habitual. As horas livres de cada serviço são as que aparecem no calendário.",
"railFromPrice": "a partir de",
"railCheapestOf": "O mais barato do serviço publicado.",
"railCheapestOf_other": "O mais barato dos {{count}} serviços publicados.",
"railViewServices": "Ver serviços",
"trustVerified": "Documento de identidade e certificação profissional verificados pela Ntizo.",
"trustMessagesKept": "As mensagens ficam guardadas na Ntizo, por isso o que for combinado fica escrito.",
"trustFeeIncluded": "O total já inclui a taxa de serviço. Não há custos acrescentados depois.",
"quotePrice": "Sob orçamento",
"quoteAction": "Pedir orçamento",
"pricingModeFixed": "Preço fixo",
"pricingModeHourly": "Por hora",
"reviewsSeeAll": "Ver todas as avaliações"
```

`en-US/directory.json`:

```json
"factCategory": "Category",
"factWhere": "Works",
"factMemberSince": "On Ntizo since",
"factDuration": "Duration",
"factPricingMode": "Pricing",
"aboutHeading": "About",
"aboutServiceHeading": "About this service",
"galleryViewAll": "See the {{count}} photo",
"galleryViewAll_other": "See all {{count}} photos",
"galleryDialogTitle": "Photos",
"availabilityHeading": "Availability",
"availabilityClosed": "Closed",
"availabilityUsualNote": "Usual hours. The times actually free for each service are the ones in its calendar.",
"railFromPrice": "from",
"railCheapestOf": "The cheapest of the one published service.",
"railCheapestOf_other": "The cheapest of {{count}} published services.",
"railViewServices": "See services",
"trustVerified": "Identity document and professional certification verified by Ntizo.",
"trustMessagesKept": "Messages stay on Ntizo, so what you agree is written down.",
"trustFeeIncluded": "The total already includes the service fee. Nothing is added later.",
"quotePrice": "On request",
"quoteAction": "Request a quote",
"pricingModeFixed": "Fixed price",
"pricingModeHourly": "Hourly",
"reviewsSeeAll": "See all reviews"
```

`es-ES/directory.json`:

```json
"factCategory": "Categoría",
"factWhere": "Dónde atiende",
"factMemberSince": "En Ntizo desde",
"factDuration": "Duración",
"factPricingMode": "Tipo de precio",
"aboutHeading": "Acerca de",
"aboutServiceHeading": "Sobre este servicio",
"galleryViewAll": "Ver la {{count}} foto",
"galleryViewAll_other": "Ver las {{count}} fotos",
"galleryDialogTitle": "Fotografías",
"availabilityHeading": "Disponibilidad",
"availabilityClosed": "Cerrado",
"availabilityUsualNote": "Horario habitual. Las horas libres de cada servicio son las que aparecen en su calendario.",
"railFromPrice": "desde",
"railCheapestOf": "Lo más barato del servicio publicado.",
"railCheapestOf_other": "Lo más barato de los {{count}} servicios publicados.",
"railViewServices": "Ver servicios",
"trustVerified": "Documento de identidad y certificación profesional verificados por Ntizo.",
"trustMessagesKept": "Los mensajes se guardan en Ntizo, así lo acordado queda por escrito.",
"trustFeeIncluded": "El total ya incluye la tarifa de servicio. No se añade nada después.",
"quotePrice": "Bajo presupuesto",
"quoteAction": "Pedir presupuesto",
"pricingModeFixed": "Precio fijo",
"pricingModeHourly": "Por hora",
"reviewsSeeAll": "Ver todas las valoraciones"
```

`fr-FR/directory.json`:

```json
"factCategory": "Catégorie",
"factWhere": "Lieu d'intervention",
"factMemberSince": "Sur Ntizo depuis",
"factDuration": "Durée",
"factPricingMode": "Type de prix",
"aboutHeading": "À propos",
"aboutServiceHeading": "À propos de ce service",
"galleryViewAll": "Voir la {{count}} photo",
"galleryViewAll_other": "Voir les {{count}} photos",
"galleryDialogTitle": "Photographies",
"availabilityHeading": "Disponibilité",
"availabilityClosed": "Fermé",
"availabilityUsualNote": "Horaires habituels. Les créneaux réellement libres sont ceux du calendrier de chaque service.",
"railFromPrice": "à partir de",
"railCheapestOf": "Le moins cher du service publié.",
"railCheapestOf_other": "Le moins cher des {{count}} services publiés.",
"railViewServices": "Voir les services",
"trustVerified": "Pièce d'identité et certification professionnelle vérifiées par Ntizo.",
"trustMessagesKept": "Les messages restent sur Ntizo, ce qui est convenu est donc écrit.",
"trustFeeIncluded": "Le total comprend déjà les frais de service. Rien n'est ajouté ensuite.",
"quotePrice": "Sur devis",
"quoteAction": "Demander un devis",
"pricingModeFixed": "Prix fixe",
"pricingModeHourly": "À l'heure",
"reviewsSeeAll": "Voir tous les avis"
```

`de-DE/directory.json`:

```json
"factCategory": "Kategorie",
"factWhere": "Einsatzort",
"factMemberSince": "Bei Ntizo seit",
"factDuration": "Dauer",
"factPricingMode": "Preisart",
"aboutHeading": "Über",
"aboutServiceHeading": "Über diese Leistung",
"galleryViewAll": "Das {{count}} Foto ansehen",
"galleryViewAll_other": "Alle {{count}} Fotos ansehen",
"galleryDialogTitle": "Fotos",
"availabilityHeading": "Verfügbarkeit",
"availabilityClosed": "Geschlossen",
"availabilityUsualNote": "Übliche Zeiten. Die tatsächlich freien Zeiten stehen im Kalender der jeweiligen Leistung.",
"railFromPrice": "ab",
"railCheapestOf": "Das günstigste der veröffentlichten Leistung.",
"railCheapestOf_other": "Das günstigste von {{count}} veröffentlichten Leistungen.",
"railViewServices": "Leistungen ansehen",
"trustVerified": "Ausweisdokument und Berufsnachweis von Ntizo geprüft.",
"trustMessagesKept": "Nachrichten bleiben bei Ntizo, das Vereinbarte steht also schriftlich fest.",
"trustFeeIncluded": "Die Servicegebühr ist im Gesamtbetrag enthalten. Es kommt nichts hinzu.",
"quotePrice": "Auf Anfrage",
"quoteAction": "Angebot anfragen",
"pricingModeFixed": "Festpreis",
"pricingModeHourly": "Pro Stunde",
"reviewsSeeAll": "Alle Bewertungen ansehen"
```

`it-IT/directory.json`:

```json
"factCategory": "Categoria",
"factWhere": "Dove interviene",
"factMemberSince": "Su Ntizo dal",
"factDuration": "Durata",
"factPricingMode": "Tipo di prezzo",
"aboutHeading": "Chi è",
"aboutServiceHeading": "Su questo servizio",
"galleryViewAll": "Vedi la {{count}} foto",
"galleryViewAll_other": "Vedi tutte le {{count}} foto",
"galleryDialogTitle": "Fotografie",
"availabilityHeading": "Disponibilità",
"availabilityClosed": "Chiuso",
"availabilityUsualNote": "Orario abituale. Gli orari davvero liberi sono quelli nel calendario di ogni servizio.",
"railFromPrice": "a partire da",
"railCheapestOf": "Il più economico del servizio pubblicato.",
"railCheapestOf_other": "Il più economico dei {{count}} servizi pubblicati.",
"railViewServices": "Vedi i servizi",
"trustVerified": "Documento d'identità e certificazione professionale verificati da Ntizo.",
"trustMessagesKept": "I messaggi restano su Ntizo, così quanto concordato resta scritto.",
"trustFeeIncluded": "Il totale include già la commissione di servizio. Non si aggiunge nulla dopo.",
"quotePrice": "Su preventivo",
"quoteAction": "Chiedi un preventivo",
"pricingModeFixed": "Prezzo fisso",
"pricingModeHourly": "All'ora",
"reviewsSeeAll": "Vedi tutte le recensioni"
```

`nl-NL/directory.json`:

```json
"factCategory": "Categorie",
"factWhere": "Werkt",
"factMemberSince": "Op Ntizo sinds",
"factDuration": "Duur",
"factPricingMode": "Prijsvorm",
"aboutHeading": "Over",
"aboutServiceHeading": "Over deze dienst",
"galleryViewAll": "Bekijk de {{count}} foto",
"galleryViewAll_other": "Bekijk alle {{count}} foto's",
"galleryDialogTitle": "Foto's",
"availabilityHeading": "Beschikbaarheid",
"availabilityClosed": "Gesloten",
"availabilityUsualNote": "Gebruikelijke tijden. De werkelijk vrije tijden staan in de agenda van elke dienst.",
"railFromPrice": "vanaf",
"railCheapestOf": "De goedkoopste van de gepubliceerde dienst.",
"railCheapestOf_other": "De goedkoopste van {{count}} gepubliceerde diensten.",
"railViewServices": "Bekijk diensten",
"trustVerified": "Identiteitsbewijs en vakbekwaamheid geverifieerd door Ntizo.",
"trustMessagesKept": "Berichten blijven op Ntizo, dus wat is afgesproken staat zwart op wit.",
"trustFeeIncluded": "Het totaal is inclusief servicekosten. Er komt niets bij.",
"quotePrice": "Op offerte",
"quoteAction": "Offerte aanvragen",
"pricingModeFixed": "Vaste prijs",
"pricingModeHourly": "Per uur",
"reviewsSeeAll": "Bekijk alle beoordelingen"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/frontend/web && bunx vitest run src/shared/locales/__tests__/locales.test.ts`
Expected: PASS — 16 assertions, all eight bundles at 186 keys.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/shared/locales
git commit -m "Add the detail pages' strings, and a test that all eight agree

A key present in one language and missing in another does not fail
loudly — i18next falls back to the key name and a Portuguese page
renders 'factMemberSince'. The new test is the only thing that catches
that, and it now guards the whole directory namespace, not just these."
```

---

### Task 5: Shared weekday formatting, and two pure modules

**Files:**
- Create: `apps/frontend/web/src/shared/domain/week-format.ts`
- Modify: `apps/frontend/web/src/features/provider/availability/domain/week.ts`
- Create: `apps/frontend/web/src/features/directory/domain/weekly-hours.ts`
- Create: `apps/frontend/web/src/features/directory/domain/member-since.ts`
- Test: `apps/frontend/web/src/features/directory/domain/__tests__/weekly-hours.test.ts`
- Test: `apps/frontend/web/src/features/directory/domain/__tests__/member-since.test.ts`

**Interfaces:**
- Consumes: `WeeklyHoursDTO` (Task 1).
- Produces:
  - `shared/domain/week-format.ts` re-exports the locale primitives that were in the provider feature: `WEEKDAY_ORDER`, `weekdayDisplayIndex`, `weekdayLabel`, `weekdayShortLabel`, `weekdayNarrowLabel`, `minutesToLabel`, `labelToMinutes`, `formatDayList`, `formatHours`.
  - `groupWeekdays(hours: readonly WeeklyHoursDTO[], locale: string): HoursRow[]` where `HoursRow = { key: string; label: string; intervals: { startMinute: number; endMinute: number }[] }`. Rows are Monday-first; consecutive weekdays with identical intervals collapse into one row whose label is `"Segunda a sexta"`.
  - `hasAnyHours(hours: readonly WeeklyHoursDTO[]): boolean`.
  - `formatMemberSince(value: string | null, locale: string): string | null`.

The provider availability feature keeps `WeeklyRuleDraft`, `compareRules`, `groupRules`, `overlaps` and `patternMinutes` — those are its own domain and do not move. Only the locale primitives move, and `week.ts` re-exports them so its seven importers do not change.

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/web/src/features/directory/domain/__tests__/weekly-hours.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupWeekdays, hasAnyHours } from "../weekly-hours";
import type { WeeklyHoursDTO } from "@ntizo/shared/read-models";

const closed = (weekday: number): WeeklyHoursDTO => ({ weekday, intervals: [] });
const open = (weekday: number, startMinute: number, endMinute: number): WeeklyHoursDTO => ({
  weekday, intervals: [{ startMinute, endMinute }],
});

/** Mon-Fri 08:00-18:00, Sat 09:00-14:00, Sun closed — the mockup's provider. */
const TYPICAL: WeeklyHoursDTO[] = [
  closed(0), open(1, 480, 1080), open(2, 480, 1080), open(3, 480, 1080),
  open(4, 480, 1080), open(5, 480, 1080), open(6, 540, 840),
];

describe("groupWeekdays", () => {
  it("collapses a run of identical weekdays into one row", () => {
    const rows = groupWeekdays(TYPICAL, "pt-PT");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.intervals).toEqual([{ startMinute: 480, endMinute: 1080 }]);
    expect(rows[1]?.intervals).toEqual([{ startMinute: 540, endMinute: 840 }]);
    expect(rows[2]?.intervals).toEqual([]);
  });

  it("names a run as a range and a single day as itself", () => {
    const rows = groupWeekdays(TYPICAL, "en-US");
    expect(rows[0]?.label).toBe("Monday to Friday");
    expect(rows[1]?.label).toBe("Saturday");
    expect(rows[2]?.label).toBe("Sunday");
  });

  it("starts the week on Monday, not on Sunday", () => {
    // The DTO is indexed 0 = Sunday; the card is not read that way anywhere
    // this product ships.
    const rows = groupWeekdays(TYPICAL, "en-US");
    expect(rows[0]?.label.startsWith("Monday")).toBe(true);
  });

  it("collapses all seven when every day is the same", () => {
    const every = [0, 1, 2, 3, 4, 5, 6].map((d) => open(d, 480, 1080));
    const rows = groupWeekdays(every, "en-US");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("Monday to Sunday");
  });

  it("collapses nothing when every day differs", () => {
    const varied = [0, 1, 2, 3, 4, 5, 6].map((d) => open(d, 480 + d * 30, 1080));
    expect(groupWeekdays(varied, "en-US")).toHaveLength(7);
  });

  it("collapses all seven when every day is closed", () => {
    const rows = groupWeekdays([0, 1, 2, 3, 4, 5, 6].map(closed), "en-US");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.intervals).toEqual([]);
  });

  it("keeps a day with two intervals distinct from one with a single span", () => {
    const split: WeeklyHoursDTO[] = [
      closed(0),
      { weekday: 1, intervals: [{ startMinute: 480, endMinute: 720 }, { startMinute: 840, endMinute: 1080 }] },
      open(2, 480, 1080),
      closed(3), closed(4), closed(5), closed(6),
    ];
    const rows = groupWeekdays(split, "en-US");
    expect(rows[0]?.intervals).toHaveLength(2);
    expect(rows[1]?.intervals).toHaveLength(1);
  });

  it("gives every row a stable, unique key", () => {
    const keys = groupWeekdays(TYPICAL, "en-US").map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("hasAnyHours", () => {
  it("is false when no weekday has an interval", () => {
    expect(hasAnyHours([0, 1, 2, 3, 4, 5, 6].map(closed))).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(hasAnyHours([])).toBe(false);
  });

  it("is true as soon as one weekday opens", () => {
    expect(hasAnyHours(TYPICAL)).toBe(true);
  });
});
```

Create `apps/frontend/web/src/features/directory/domain/__tests__/member-since.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatMemberSince } from "../member-since";

describe("formatMemberSince", () => {
  it("renders the month and year in the reader's language", () => {
    expect(formatMemberSince("2025-03", "pt-PT")).toBe("março de 2025");
    expect(formatMemberSince("2025-03", "en-US")).toBe("March 2025");
  });

  it("reads the month as civil, not as UTC shifted into the previous one", () => {
    // Built from a UTC midday and formatted in UTC. Parsing "2025-01" as a
    // local date in a negative-offset zone lands in December 2024.
    expect(formatMemberSince("2025-01", "en-US")).toBe("January 2025");
  });

  it("returns null for null", () => {
    expect(formatMemberSince(null, "pt-PT")).toBeNull();
  });

  it("returns null for a malformed value rather than an Invalid Date", () => {
    expect(formatMemberSince("2025", "pt-PT")).toBeNull();
    expect(formatMemberSince("2025-13", "pt-PT")).toBeNull();
    expect(formatMemberSince("not-a-date", "pt-PT")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/domain/__tests__/weekly-hours.test.ts src/features/directory/domain/__tests__/member-since.test.ts`
Expected: FAIL — neither module resolves.

- [ ] **Step 3: Move the locale primitives to `shared/lib`**

**Path correction, made during execution:** the plan originally said
`src/shared/lib/week-format.ts`. That location fails this app's own
`boundaries/dependencies` ESLint rule — `eslint.config.js` maps `src/shared/**`
to element type `shared` and forbids `domain -> shared`, so a `domain/` module
importing from `shared/lib` is three lint errors. `src/shared/domain/**` is
already declared as element type `domain` in that same config, reserved for
exactly this: shared, framework-free domain code. Verified against a clean
baseline: the corrected path returns lint to zero errors.

Create `apps/frontend/web/src/shared/domain/week-format.ts` and move into it, verbatim with their doc comments, from `features/provider/availability/domain/week.ts`: `WEEKDAY_ORDER`, `weekdayDisplayIndex`, `REFERENCE_SUNDAY_UTC_MS`, `MS_PER_DAY`, `weekdayLabel`, `LABEL`, `minutesToLabel`, `labelToMinutes`, `weekdayShortLabel`, `weekdayNarrowLabel`, `formatDayList`, `formatHours`.

Add at the top of the new file:

```ts
/**
 * Weekday and clock formatting, in the reader's own language.
 *
 * Lifted out of `features/provider/availability/domain/week.ts` when the
 * customer-facing detail pages needed the same primitives: a second copy of
 * `weekdayLabel` is a second chance to disagree with the calendar the provider
 * configures. What stayed behind is that feature's own domain — rule drafts,
 * grouping, overlap — which has nothing to say to a directory page.
 */
```

In `features/provider/availability/domain/week.ts`, delete those definitions and re-export instead, so its seven importers are untouched:

```ts
export {
  WEEKDAY_ORDER,
  weekdayDisplayIndex,
  weekdayLabel,
  weekdayShortLabel,
  weekdayNarrowLabel,
  minutesToLabel,
  labelToMinutes,
  formatDayList,
  formatHours,
} from "@/shared/domain/week-format";
```

`compareRules`, `patternMinutes`, `WeekRuleGroup`, `groupRules` and `overlaps` stay; they use the moved helpers, so add an `import { ... } from "@/shared/domain/week-format";` for whichever they call.

- [ ] **Step 4: Write the two directory modules**

Create `apps/frontend/web/src/features/directory/domain/weekly-hours.ts`:

```ts
import type { WeeklyHoursDTO } from "@ntizo/shared/read-models";
import { WEEKDAY_ORDER, weekdayLabel } from "@/shared/domain/week-format";

export interface HoursInterval {
  startMinute: number;
  endMinute: number;
}

export interface HoursRow {
  /** Stable across renders, unique within the list — the weekdays it covers. */
  key: string;
  /** "Segunda a sexta", or one weekday's own name. */
  label: string;
  /** Empty means closed. */
  intervals: HoursInterval[];
}

function signature(intervals: readonly HoursInterval[]): string {
  return intervals.map((i) => `${i.startMinute}-${i.endMinute}`).join(",");
}

/**
 * Seven weekdays as the two or three rows a person actually reads.
 *
 * Consecutive weekdays with identical hours collapse: "Segunda a sexta
 * 08:00 – 18:00" is how everybody writes opening hours, and seven rows saying
 * the same thing five times is a table pretending to be information.
 *
 * Monday-first, via `WEEKDAY_ORDER`, even though the DTO is indexed 0 = Sunday
 * to match what `member_availability` stores. Nowhere this product ships reads
 * a week as starting on Sunday, and the grouping has to run in display order or
 * a Monday-to-Friday run would be split by the Sunday sitting between them.
 *
 * Only *consecutive* days merge. A business open Monday and Wednesday on the
 * same hours gets two rows, because "Monday and Wednesday" is a list, and the
 * moment a list has three entries it is longer than the rows it replaced.
 */
export function groupWeekdays(
  hours: readonly WeeklyHoursDTO[],
  locale: string,
): HoursRow[] {
  interface Draft {
    weekdays: number[];
    signature: string;
    intervals: HoursInterval[];
  }

  const byWeekday = new Map(hours.map((h) => [h.weekday, h.intervals]));
  const drafts: Draft[] = [];

  for (const weekday of WEEKDAY_ORDER) {
    const intervals = byWeekday.get(weekday) ?? [];
    const key = signature(intervals);
    const previous = drafts[drafts.length - 1];

    if (previous && previous.signature === key) {
      previous.weekdays.push(weekday);
      continue;
    }

    drafts.push({
      weekdays: [weekday],
      signature: key,
      intervals: intervals.map((interval) => ({ ...interval })),
    });
  }

  return drafts.map(({ weekdays, intervals }) => {
    const first = weekdays[0]!;
    const last = weekdays[weekdays.length - 1]!;
    return {
      key: weekdays.join("-"),
      label:
        weekdays.length === 1
          ? weekdayLabel(locale, first)
          : // `Intl.ListFormat` would give "Monday, Tuesday, …, Friday". A
            // range is how opening hours are written, and the two endpoints
            // are the only thing the reader needs.
            `${weekdayLabel(locale, first)} ${rangeWord(locale)} ${weekdayLabel(locale, last)}`,
      intervals,
    };
  });
}

/**
 * The word between the two ends of a weekday range.
 *
 * There is no `Intl` primitive for "Monday **to** Friday" — `ListFormat` builds
 * conjunctions, not ranges, and `DateTimeFormat.formatRange` needs two dates
 * and produces "Mon – Fri" with a dash rather than a word. So this is a small
 * table, and the fallback is the dash, which is never wrong in any language
 * even where it is not idiomatic.
 */
function rangeWord(locale: string): string {
  const lang = locale.split("-")[0];
  const words: Record<string, string> = {
    pt: "a", en: "to", es: "a", fr: "au", de: "bis", it: "a", nl: "tot",
  };
  return words[lang ?? ""] ?? "–";
}

/**
 * Whether this business has published any hours at all.
 *
 * A provider who never configured availability comes back as seven closed days,
 * which is indistinguishable from a business that is genuinely never open —
 * except that one of those is a fact and the other is an empty form. The card
 * uses this to say "not published yet" instead of printing seven "Fechado"s.
 */
export function hasAnyHours(hours: readonly WeeklyHoursDTO[]): boolean {
  return hours.some((day) => day.intervals.length > 0);
}
```

Create `apps/frontend/web/src/features/directory/domain/member-since.ts`:

```ts
const YEAR_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * `"2025-03"` as "março de 2025", in the reader's language.
 *
 * Built at UTC midday and formatted in UTC. `new Date("2025-01")` is parsed as
 * a UTC instant but formatted in the device's zone, so a reader west of
 * Greenwich would be told a business joined in December 2024 — off by a month,
 * every January, only for some people.
 *
 * Returns null rather than throwing or rendering "Invalid Date": the caller
 * renders nothing at all for a value it cannot read, which is the honest
 * outcome for a fact that failed to arrive.
 */
export function formatMemberSince(value: string | null, locale: string): string | null {
  if (!value) return null;
  const match = YEAR_MONTH.exec(value);
  if (!match) return null;

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 12));
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/domain src/features/provider/availability/domain && bun run typecheck`
Expected: PASS — the new tests, and the provider availability suite still green after the move.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src/shared/domain/week-format.ts apps/frontend/web/src/features/provider/availability/domain/week.ts apps/frontend/web/src/features/directory/domain
git commit -m "Share weekday formatting, and read seven days as three rows

The customer pages need the same weekday names the provider configures
with; a second copy of weekdayLabel is a second chance to disagree with
the calendar. The primitives move to shared/lib and week.ts re-exports
them, so its seven importers do not change.

groupWeekdays collapses consecutive identical days, Monday-first —
running it in storage order would split a Mon-Fri run around the Sunday
sitting between them."
```

---

### Task 6: The provider page asks for its three fields

**Files:**
- Modify: `apps/frontend/web/src/features/directory/data/directory.repository.ts`
- Modify: `apps/frontend/web/src/features/directory/viewmodel/use-directory.ts`
- Test: `apps/frontend/web/src/features/directory/data/__tests__/directory.repository.test.ts` (create)

**Interfaces:**
- Consumes: `ProviderPublicDetailDTO` (Task 1), the backend field names (Task 3).
- Produces: `directoryQueries.bySlug(slug, locale)` resolves `ProviderPublicDetailDTO | null`. `useProviderDetail(slug, locale)` and `prefetchProviderDetail` return the same. `PROVIDER_FIELDS` stays the list's selection; `PROVIDER_DETAIL_FIELDS` is the slug lookup's.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/features/directory/data/__tests__/directory.repository.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PROVIDER_FIELDS, PROVIDER_DETAIL_FIELDS } from "../directory.repository";

/**
 * The list and the detail lookup deliberately ask for different things. If they
 * ever share one selection again, the directory's 24 cards start paying for a
 * join per card — the exact cost `providerPublicDetailReadModel` exists to
 * avoid, and a regression nothing else would catch until a slow page.
 */
describe("provider GraphQL selections", () => {
  it("keeps the detail-only fields out of the list", () => {
    for (const field of ["memberSince", "serviceLocationTypes", "weeklyHours"]) {
      expect(PROVIDER_FIELDS).not.toContain(field);
    }
  });

  it("asks for the detail-only fields on the slug lookup", () => {
    for (const field of ["memberSince", "serviceLocationTypes", "weeklyHours"]) {
      expect(PROVIDER_DETAIL_FIELDS).toContain(field);
    }
  });

  it("still asks for everything the list asks for", () => {
    for (const field of ["id", "name", "slug", "verified", "photoUrls", "fromAmountMinor"]) {
      expect(PROVIDER_DETAIL_FIELDS).toContain(field);
    }
  });

  it("selects the weekly hours' own shape", () => {
    expect(PROVIDER_DETAIL_FIELDS).toContain("weeklyHours { weekday intervals { startMinute endMinute } }");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/data/__tests__/directory.repository.test.ts`
Expected: FAIL — `PROVIDER_DETAIL_FIELDS` is not exported.

- [ ] **Step 3: Split the selection**

In `directory.repository.ts`, export both constants and build the detail one from the list one:

```ts
export const PROVIDER_FIELDS = `
  id name slug type description city district country logoUrl photoUrls
  verified ratingAverage reviewCount serviceCount fromAmountMinor fromCurrency
  categories { code name }`;

/**
 * The slug lookup asks for more than the list does, and that split is the point.
 *
 * `weeklyHours` costs a join over every member's availability. Asking for it in
 * `PROVIDER_FIELDS` would make the directory pay that 24 times to render a grid
 * of cards that show none of it — see `providerPublicDetailReadModel`'s own doc
 * comment for the same reasoning on the server's side of the wire.
 */
export const PROVIDER_DETAIL_FIELDS = `${PROVIDER_FIELDS}
  memberSince
  serviceLocationTypes
  weeklyHours { weekday intervals { startMinute endMinute } }`;

const BY_SLUG = `
  query ProviderBySlug($input: ProviderBySlugInput!) {
    providerBySlug(input: $input) { ${PROVIDER_DETAIL_FIELDS} }
  }`;
```

Change `bySlug`'s `queryFn` return type and its `publicGraphql` type parameter from `ProviderPublicDTO` to `ProviderPublicDetailDTO`, importing it from `@ntizo/shared/read-models`. Keep the existing doc comment about `null` being a legitimate answer.

In `use-directory.ts`, change `useProviderDetail` and `prefetchProviderDetail` to `ProviderPublicDetailDTO`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory && bun run typecheck`
Expected: PASS. `provider-hero.test.tsx` may fail to typecheck on its fixture — add `memberSince: null, serviceLocationTypes: [], weeklyHours: []` to it.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/features/directory
git commit -m "Ask for the detail fields on the slug lookup only

The list and the detail lookup now have separate selections, with a test
that pins them apart: sharing one again would make the directory's 24
cards each pay for a join over every member's availability to show none
of it."
```

---

### Task 7: `DetailGallery`

**Files:**
- Create: `apps/frontend/web/src/features/directory/ui/detail-gallery.tsx`
- Test: `apps/frontend/web/src/features/directory/ui/__tests__/detail-gallery.test.tsx`

**Interfaces:**
- Consumes: `galleryViewAll`, `galleryDialogTitle` (Task 4); `Dialog`, `DialogContent` from `@ntizo/frontend-ui` (the same import `availability-sheet.tsx` uses).
- Produces: `<DetailGallery images={readonly string[]} alt={string} badge?={ReactNode} />`. Renders nothing for an empty list.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/features/directory/ui/__tests__/detail-gallery.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DetailGallery } from "../detail-gallery";

const images = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn.test/${i}.jpg`);

describe("DetailGallery", () => {
  it("renders nothing at all with no photos", () => {
    const { container } = render(<DetailGallery images={[]} alt="Hélder Cossa" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows one photo without offering a gallery to open", () => {
    render(<DetailGallery images={images(1)} alt="Hélder Cossa" />);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /1/ })).not.toBeInTheDocument();
  });

  it("shows at most three tiles, however many there are", () => {
    render(<DetailGallery images={images(8)} alt="Hélder Cossa" />);
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("offers the whole count, not the number of tiles", () => {
    render(<DetailGallery images={images(8)} alt="Hélder Cossa" />);
    expect(screen.getByRole("button", { name: /8/ })).toBeInTheDocument();
  });

  it("opens every photo in a dialog", async () => {
    render(<DetailGallery images={images(8)} alt="Hélder Cossa" />);
    await userEvent.click(screen.getByRole("button", { name: /8/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByRole("img")).toHaveLength(8);
  });

  it("puts a badge over the main tile when given one", () => {
    render(<DetailGallery images={images(3)} alt="x" badge={<span>Documentos verificados</span>} />);
    expect(screen.getByText("Documentos verificados")).toBeInTheDocument();
  });

  it("describes only the main photo, leaving the rest decorative", () => {
    // "photograph 3 of 12" describes nothing. A screen reader gets the one
    // labelled image and skips the tiles, the same call ProviderPortfolio made.
    render(<DetailGallery images={images(3)} alt="Hélder Cossa" />);
    expect(screen.getByAltText("Hélder Cossa")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "" })).toHaveLength(2);
  });
});
```

Add `within` to the `@testing-library/react` import.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/ui/__tests__/detail-gallery.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `apps/frontend/web/src/features/directory/ui/detail-gallery.tsx`. Requirements, all pinned by the tests above:

- `images.length === 0` → `return null`. An empty frame says "no photo" louder than absence does — the call `ServiceGallery` and `ProviderPortfolio` both already made.
- Grid: `grid-cols-[minmax(0,1.72fr)_minmax(0,1fr)] gap-3 h-[clamp(340px,40vw,520px)]`; the side column is `grid-rows-[1fr_1fr_auto] gap-3`. Below `sm`, one column with the main tile at `aspect-[4/3]` and the two side tiles side by side.
- Main tile carries `alt={alt}`; side tiles carry `alt=""` and `loading="lazy"`.
- With exactly one image, the main tile spans both columns and no side column or button renders.
- The button reads `t("galleryViewAll", { count: images.length })` and only renders when `images.length > 3`.
- The dialog uses `Dialog`/`DialogContent` from `@ntizo/frontend-ui`, is titled `t("galleryDialogTitle")`, and lists every image in a `grid-cols-2 sm:grid-cols-3` grid.
- Radii: `rounded-[var(--radius-card)]` on the tiles; the button is the outline variant of `Button`.

Give the component a doc comment covering: why the overflow is a dialog rather than a carousel (a control spent on a number vs. the pictures themselves), and why the side tiles are `alt=""`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/ui/__tests__/detail-gallery.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/features/directory/ui/detail-gallery.tsx apps/frontend/web/src/features/directory/ui/__tests__/detail-gallery.test.tsx
git commit -m "One gallery for both detail pages, with the rest behind a dialog"
```

---

### Task 8: `DetailFacts`, `RailCard`, `TrustList`

**Files:**
- Create: `apps/frontend/web/src/features/directory/ui/detail-facts.tsx`
- Create: `apps/frontend/web/src/features/directory/ui/rail-card.tsx`
- Create: `apps/frontend/web/src/features/directory/ui/trust-list.tsx`
- Test: `apps/frontend/web/src/features/directory/ui/__tests__/detail-facts.test.tsx`
- Test: `apps/frontend/web/src/features/directory/ui/__tests__/trust-list.test.tsx`

**Interfaces:**
- Consumes: `trustVerified`, `trustMessagesKept`, `trustFeeIncluded` (Task 4).
- Produces:
  - `<DetailFacts facts={{ label: string; value: string }[]} />` — drops any entry whose `value` is empty, renders nothing if none survive.
  - `<RailCard label?={string} flat?={boolean} className?={string}>{children}</RailCard>`.
  - `<TrustList items={readonly string[]} />` — renders nothing for an empty list.

- [ ] **Step 1: Write the failing tests**

`detail-facts.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DetailFacts } from "../detail-facts";

describe("DetailFacts", () => {
  it("renders each label with its value", () => {
    render(<DetailFacts facts={[{ label: "Categoria", value: "Electricidade" }]} />);
    expect(screen.getByText("Categoria")).toBeInTheDocument();
    expect(screen.getByText("Electricidade")).toBeInTheDocument();
  });

  it("drops a fact with no value rather than printing an empty cell", () => {
    // A labelled blank reads as data that failed to load. A provider who never
    // published hours or has no services must not get an empty column.
    render(
      <DetailFacts
        facts={[
          { label: "Categoria", value: "Electricidade" },
          { label: "Na Ntizo desde", value: "" },
        ]}
      />,
    );
    expect(screen.queryByText("Na Ntizo desde")).not.toBeInTheDocument();
  });

  it("renders nothing when no fact survives", () => {
    const { container } = render(<DetailFacts facts={[{ label: "Categoria", value: "" }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("pairs each value with its own label for a screen reader", () => {
    render(
      <DetailFacts
        facts={[
          { label: "Categoria", value: "Electricidade" },
          { label: "Duração", value: "60 min" },
        ]}
      />,
    );
    const terms = screen.getAllByRole("term");
    expect(terms).toHaveLength(2);
  });
});
```

`trust-list.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrustList } from "../trust-list";

describe("TrustList", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(<TrustList items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one item per claim", () => {
    render(<TrustList items={["Verificado pela Ntizo.", "As mensagens ficam guardadas."]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/ui/__tests__/detail-facts.test.tsx src/features/directory/ui/__tests__/trust-list.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the three components**

`detail-facts.tsx` — a `<dl>` with `grid grid-cols-2 gap-6 sm:grid-cols-4 border-y border-[var(--color-border)] py-5 mt-7`. Each entry is a `<div>` with a `<dt className="type-caption uppercase tracking-[0.09em] text-[var(--color-muted-foreground)]">` and a `<dd className="mt-1.5 type-body font-semibold">`. Filter `facts` on `value.trim() !== ""` first; `return null` if the survivors are empty.

Doc comment must say why an empty value is dropped rather than rendered: a labelled blank reads as a page that failed to load, not as a business that has not filled something in — the same call `ProviderPortfolio` made about an empty photo grid.

`rail-card.tsx` — `rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-6`, plus `shadow-[var(--shadow-sm)]` unless `flat`. When `label` is given, render it first as `type-caption uppercase tracking-[0.09em] text-[var(--color-muted-foreground)]`.

`trust-list.tsx` — a `<ul>` with `grid gap-3 mt-5 pt-5 border-t border-[var(--color-border)]`, each item `grid-cols-[18px_minmax(0,1fr)] gap-2.5 type-caption`, with a `Check` icon from `lucide-react` at `h-4 w-4 text-[var(--color-success)]` marked `aria-hidden`.

Doc comment on `TrustList` must state the rule: nothing goes in this list without a fact behind it, and the caller is responsible for only passing claims that are true for this provider — the verification sentence is conditional on `verified`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/ui/__tests__/detail-facts.test.tsx src/features/directory/ui/__tests__/trust-list.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/features/directory/ui
git commit -m "The facts row, the rail card and the trust list, shared by both pages

DetailFacts drops a fact with no value instead of rendering a labelled
blank: an empty cell reads as a page that failed to load, which is the
opposite of what a provider who simply has not filled something in
deserves."
```

---

### Task 9: `WeeklyHoursCard`

**Files:**
- Create: `apps/frontend/web/src/features/directory/ui/weekly-hours-card.tsx`
- Test: `apps/frontend/web/src/features/directory/ui/__tests__/weekly-hours-card.test.tsx`

**Interfaces:**
- Consumes: `groupWeekdays`, `hasAnyHours` (Task 5); `minutesToLabel` from `@/shared/domain/week-format`; `RailCard` (Task 8); `availabilityHeading`, `availabilityClosed`, `availabilityUsualNote` (Task 4).
- Produces: `<WeeklyHoursCard hours={readonly WeeklyHoursDTO[]} />`. Renders nothing when no weekday has an interval.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { WeeklyHoursDTO } from "@ntizo/shared/read-models";
import { WeeklyHoursCard } from "../weekly-hours-card";

const closed = (weekday: number): WeeklyHoursDTO => ({ weekday, intervals: [] });
const open = (weekday: number, startMinute: number, endMinute: number): WeeklyHoursDTO => ({
  weekday, intervals: [{ startMinute, endMinute }],
});

const TYPICAL: WeeklyHoursDTO[] = [
  closed(0), open(1, 480, 1080), open(2, 480, 1080), open(3, 480, 1080),
  open(4, 480, 1080), open(5, 480, 1080), open(6, 540, 840),
];

describe("WeeklyHoursCard", () => {
  it("renders nothing when the provider never published hours", () => {
    // Seven closed days is what an unconfigured provider looks like, and a
    // card listing "Fechado" seven times says the business is never open —
    // which is a claim, and the wrong one.
    const { container } = render(<WeeklyHoursCard hours={[0,1,2,3,4,5,6].map(closed)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<WeeklyHoursCard hours={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("prints a collapsed run once, with its hours", () => {
    render(<WeeklyHoursCard hours={TYPICAL} />);
    expect(screen.getByText("08:00 – 18:00")).toBeInTheDocument();
    expect(screen.getByText("09:00 – 14:00")).toBeInTheDocument();
  });

  it("says a closed day is closed", () => {
    render(<WeeklyHoursCard hours={TYPICAL} />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("prints both spans of a split day", () => {
    render(
      <WeeklyHoursCard
        hours={[
          closed(0),
          { weekday: 1, intervals: [{ startMinute: 480, endMinute: 720 }, { startMinute: 840, endMinute: 1080 }] },
          closed(2), closed(3), closed(4), closed(5), closed(6),
        ]}
      />,
    );
    expect(screen.getByText("08:00 – 12:00, 14:00 – 18:00")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/ui/__tests__/weekly-hours-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Wraps `RailCard` with `label={t("availabilityHeading")}` and `flat`. Body is a `<dl className="grid gap-2.5 mt-3.5">`; one `<div className="flex justify-between gap-4 type-body">` per row from `groupWeekdays(hours, locale)`, with the label as `<dt>` and, as `<dd className="font-semibold tabular-nums">`, either the intervals joined by `", "` as `` `${minutesToLabel(start)} – ${minutesToLabel(end)}` `` or `t("availabilityClosed")` in `font-medium text-[var(--color-muted-foreground)]`. Footnote below: `t("availabilityUsualNote")` as `type-caption text-[var(--color-muted-foreground)] mt-3.5`.

Guard with `if (!hasAnyHours(hours)) return null;` and document why: seven closed days is what a provider who never opened the availability screen looks like, and printing that as fact tells a customer the business never works.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/ui/__tests__/weekly-hours-card.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/features/directory/ui
git commit -m "Say a provider's usual week, or say nothing

Seven closed days is what an unconfigured provider looks like, not a
business that never works. The card renders nothing rather than making
that claim on their behalf."
```

---

### Task 10: `ServiceRow`

**Files:**
- Create: `apps/frontend/web/src/features/directory/services/ui/service-row.tsx`
- Test: `apps/frontend/web/src/features/directory/services/ui/__tests__/service-row.test.tsx`

**Interfaces:**
- Consumes: `ServiceDTO` from `features/directory/services/domain/types`; `servicePriceCell` / `formatAmount` / `optionDurationMinutes` from `domain/service-card` (read them before writing — reuse what is there, do not reimplement price formatting); `quotePrice`, `quoteAction`, `pricingModeFixed`, `pricingModeHourly`, `availabilityCheckAction` (Task 4 and existing).
- Produces: `<ServiceRow service={ServiceDTO} providerImageUrl={string | null} locale={string} onSelect={(s: ServiceDTO) => void} />`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServiceRow } from "../service-row";
import type { ServiceDTO } from "../../domain/types";

const base: ServiceDTO = {
  id: "s1", providerId: "p1", providerName: "Hélder Cossa", providerSlug: "helder",
  providerType: "individual", providerVerified: true, providerRatingAverage: 4.8,
  providerReviewCount: 4, categoryCode: "electricity", categoryName: "Electricidade",
  name: "Avaria eléctrica urgente", description: "Deslocação e diagnóstico.",
  locationType: "at_customer", bookingMode: "priced", imageUrls: [],
  defaultOption: { amountMinor: 120000, currency: "MZN", durationMinutes: 60,
    minMinutes: null, stepMinutes: null, pricingMode: "fixed" },
  fromAmountMinor: 120000, optionCount: 1, isFallback: false,
};

describe("ServiceRow", () => {
  it("shows the name, the description and the price", () => {
    render(<ServiceRow service={base} providerImageUrl={null} locale="pt-MZ" onSelect={() => {}} />);
    expect(screen.getByText("Avaria eléctrica urgente")).toBeInTheDocument();
    expect(screen.getByText("Deslocação e diagnóstico.")).toBeInTheDocument();
    expect(screen.getByText(/1[\s.,]?200/)).toBeInTheDocument();
  });

  it("offers the calendar for a priced service", async () => {
    const onSelect = vi.fn();
    render(<ServiceRow service={base} providerImageUrl={null} locale="pt-MZ" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "See availability" }));
    expect(onSelect).toHaveBeenCalledWith(base);
  });

  it("says a quote service is on request, and does not offer a calendar", () => {
    // A quote service has no fixed duration and no price, so there is no slot
    // to check — the same reason ServiceQuoteNotice replaces the availability
    // button on the service page.
    const quote: ServiceDTO = { ...base, bookingMode: "quote", defaultOption: null, fromAmountMinor: null, optionCount: 0 };
    render(<ServiceRow service={quote} providerImageUrl={null} locale="pt-MZ" onSelect={() => {}} />);
    expect(screen.getByText("On request")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "See availability" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request a quote" })).toBeInTheDocument();
  });

  it("falls back to the provider's photo when the service has none", () => {
    render(<ServiceRow service={base} providerImageUrl="https://cdn.test/logo.jpg" locale="pt-MZ" onSelect={() => {}} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://cdn.test/logo.jpg");
  });

  it("renders without any photo at all", () => {
    render(<ServiceRow service={base} providerImageUrl={null} locale="pt-MZ" onSelect={() => {}} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Avaria eléctrica urgente")).toBeInTheDocument();
  });

  it("links the name to the service's own page", () => {
    render(<ServiceRow service={base} providerImageUrl={null} locale="pt-MZ" onSelect={() => {}} />);
    expect(screen.getByRole("link", { name: "Avaria eléctrica urgente" })).toHaveAttribute(
      "href", expect.stringContaining("/services/s1"),
    );
  });
});
```

The link assertion needs a TanStack Router memory router around the render — copy the harness from `provider-hero.test.tsx`, which already builds one.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/services/ui/__tests__/service-row.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Grid `grid-cols-[112px_minmax(0,1fr)_auto] gap-5 py-6 border-b border-[var(--color-border)]`, first child also `border-t`. Below `sm`: `grid-cols-[72px_minmax(0,1fr)]` with the price column moving to `col-start-2` and left-aligned.

- Thumbnail: `service.imageUrls[0] ?? providerImageUrl`; when both are null render no `<img>` at all, only the muted placeholder tile — the row must survive with no photograph.
- Name: a `<Link to="/services/$id" params={{ id: service.id }}>` in `font-display font-semibold text-[17px]`.
- Description: `type-body-medium text-[var(--color-muted-foreground)] max-w-[52ch] mt-1.5`, clamped to two lines.
- Meta line: duration (`serviceDurationMinutes` or `serviceMinimumMinutes` via `optionDurationMinutes`), `filterWhereOption.<locationType>`, and the pricing mode in `text-[var(--color-success)] font-semibold` — `pricingModeFixed` / `pricingModeHourly` / `quotePrice`.
- Price: reuse `servicePriceCell` from `domain/service-card` for the amount and the `/h` suffix. A `quote` service prints `t("quotePrice")` in `type-h3 text-[var(--color-muted-foreground)]` instead of a number.
- CTA: a `priced` service gets `<Button size="sm" onClick={() => onSelect(service)}>{t("availabilityCheckAction")}</Button>`; a `quote` service gets the outline variant reading `t("quoteAction")` and, for now, the same `onSelect` — the sheet's own quote notice is what it lands on.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/services/ui/__tests__/service-row.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/features/directory/services/ui
git commit -m "A service as a row: photo, name, what it costs, what to do next

Rows rather than a card grid on the provider's page, so a customer
comparing three prices reads them in one column instead of scanning
three photographs."
```

---

### Task 11: Reviews, rewritten

**Files:**
- Modify: `apps/frontend/web/src/features/directory/ui/provider-reviews.tsx`
- Modify: `apps/frontend/web/src/features/directory/data/directory.repository.ts`
- Modify: `apps/frontend/web/src/features/directory/viewmodel/use-directory.ts`
- Test: `apps/frontend/web/src/features/directory/ui/__tests__/provider-reviews.test.tsx` (create)

**Interfaces:**
- Consumes: `reviewsSeeAll` (Task 4); the existing `directoryQueries.reviews(providerId, limit)`.
- Produces: `<ProviderReviews providerId={string} />` — unchanged signature. `useProviderReviews(providerId, limit?)` gains an optional second argument.

**Constraint:** the reviews GraphQL input caps `limit` at 50 (`z.number().int().min(1).max(50)`). The "see all" button raises the limit from the default to 50 and no further; past that the existing `reviewsShowing` sentence stays and stays true.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProviderReviewsPublicDTO } from "@ntizo/shared/read-models";

/**
 * The viewmodel hook is the seam, not the query cache — the same choice
 * `service-detail-page.test.tsx` documents: `boundaries/dependencies` forbids a
 * `ui/` file from importing `data/`, test files included, so there is no
 * `queryKey` to seed from here even if seeding were the better idea.
 *
 * `limit` is captured rather than ignored, because "see all" is a claim about
 * what the component asks for, not about what it renders.
 */
const state: { data: ProviderReviewsPublicDTO | undefined; lastLimit: number | undefined } = {
  data: undefined,
  lastLimit: undefined,
};

vi.mock("@/features/directory/viewmodel/use-directory", () => ({
  useProviderReviews: (_providerId: string, limit?: number) => {
    state.lastLimit = limit;
    return state.data;
  },
}));

const { ProviderReviews } = await import("../provider-reviews");

const summary = (count: number) => ({
  average: 4.8,
  count,
  histogram: { one: 0, two: 0, three: 0, four: 1, five: Math.max(count - 1, 0) },
});

const review = (id: string, over: Partial<ProviderReviewsPublicDTO["reviews"][number]> = {}) => ({
  id,
  rating: 5,
  comment: "Chegou a horas.",
  authorName: "Teresa Mondlane",
  createdAt: "2026-07-04T10:00:00Z",
  ...over,
});

function renderReviews(data: ProviderReviewsPublicDTO | undefined) {
  state.data = data;
  state.lastLimit = undefined;
  return render(<ProviderReviews providerId="p1" />);
}

describe("ProviderReviews", () => {
  it("renders nothing while the query has not answered", () => {
    const { container } = renderReviews(undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when nobody has reviewed", () => {
    // An empty "Reviews (0)" over blank space says the business is untested in
    // the least generous way available. The directory card has already said
    // "no reviews yet" in words, which is enough.
    const { container } = renderReviews({ summary: summary(0), reviews: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the score and every comment it was given", () => {
    renderReviews({ summary: summary(4), reviews: [review("r1"), review("r2")] });
    expect(screen.getByText("4.8")).toBeInTheDocument();
    expect(screen.getAllByText("Teresa Mondlane")).toHaveLength(2);
  });

  it("dates a review without naming a service", () => {
    // `review.booking_id` is always null and the booking row carries no
    // `service_id`, so there is nothing truthful to name. See the spec's
    // exclusion table.
    renderReviews({ summary: summary(1), reviews: [review("r1")] });
    expect(screen.getByText("July 4, 2026")).toBeInTheDocument();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("names an author who set no display name without exposing them", () => {
    renderReviews({ summary: summary(1), reviews: [review("r1", { authorName: null })] });
    expect(screen.getByText("A customer")).toBeInTheDocument();
  });

  it("offers to load the rest only when there is a rest", () => {
    renderReviews({ summary: summary(2), reviews: [review("r1"), review("r2")] });
    expect(screen.queryByRole("button", { name: "See all reviews" })).not.toBeInTheDocument();
  });

  it("offers to load the rest when more exist than are shown", () => {
    renderReviews({ summary: summary(20), reviews: [review("r1")] });
    expect(screen.getByRole("button", { name: "See all reviews" })).toBeInTheDocument();
  });

  it("asks for the read model's whole cap when the button is used", async () => {
    renderReviews({ summary: summary(20), reviews: [review("r1")] });
    await userEvent.click(screen.getByRole("button", { name: "See all reviews" }));
    expect(state.lastLimit).toBe(50);
  });

  it("keeps saying how many are shown while more remain", () => {
    renderReviews({ summary: summary(80), reviews: [review("r1")] });
    expect(screen.getByText("Showing 1 of 80.")).toBeInTheDocument();
  });
});
```

The date assertion reads `formatDate`'s existing `Intl` output for `en`. If the helper's options change, change the expectation with it — do not loosen it to a regex, because "which month a review was left" is the fact the line exists to carry.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/ui/__tests__/provider-reviews.test.tsx`
Expected: FAIL on the "see all" assertions.

- [ ] **Step 3: Add the limit to the viewmodel**

In `use-directory.ts`:

```ts
export function useProviderReviews(
  providerId: string,
  limit?: number,
): ProviderReviewsPublicDTO | undefined {
  const { data } = useQuery(directoryQueries.reviews(providerId, limit));
  return data;
}
```

`directoryQueries.reviews` already takes `limit = 10` and keys on it, so a second limit is a second cache entry rather than a mutation of the first — no change needed there.

- [ ] **Step 4: Rewrite the component**

Keep: the `count === 0` guard and its doc comment, `BARS`/`SCORE_OF`, the `initials` and `formatDate` helpers, `reviewAnonymous`, the `aria-hidden` bar treatment.

Change:
- Summary panel: `grid-cols-[auto_minmax(0,1fr)] gap-11 items-center rounded-[var(--radius-card)] border bg-[var(--color-muted)] px-7 py-6`. Score at `font-display text-[52px] font-semibold leading-none`, stars beneath, then the count as `type-caption`.
- Histogram bars: `bg-[var(--color-foreground)]` on a `rgba` track, `h-[7px]`. The stars stay the only gold on the page.
- Comment list: hairline-separated `<li className="py-6 border-t border-[var(--color-border)]">` instead of bordered cards. Head is `grid-cols-[auto_minmax(0,1fr)_auto]`: a 42px initials avatar, then name over date, then the stars right-aligned.
- Below the list: when `summary.count > reviews.length`, a `Button variant="outline"` reading `t("reviewsSeeAll")` that sets local state `limit` to 50 and re-renders; the `reviewsShowing` sentence stays underneath.

Add to the component's doc comment why the button raises a limit rather than paging: the query already caps at 50, so this is the whole of what the read model can offer, and a "load more" that could not reach the end would be a control that lies.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/ui/__tests__/provider-reviews.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src/features/directory
git commit -m "Redraw the reviews, and make 'see all' actually fetch them

The bars stop being gold so the stars are the only gold on the page, the
comments lose their boxes, and the button raises the query's limit to the
50 the read model caps at — the whole of what it can offer, rather than a
'load more' that could never reach the end."
```

---

### Task 12: Assemble the provider page

**Files:**
- Modify: `apps/frontend/web/src/features/directory/ui/provider-detail-page.tsx`
- Modify: `apps/frontend/web/src/features/directory/ui/provider-hero.tsx`
- Create: `apps/frontend/web/src/features/directory/ui/provider-rail.tsx`
- Modify: `apps/frontend/web/src/features/directory/services/ui/services-section.tsx`
- Delete: `apps/frontend/web/src/features/directory/ui/provider-portfolio.tsx`
- Modify: `apps/frontend/web/src/features/directory/ui/__tests__/provider-hero.test.tsx`
- Test: `apps/frontend/web/src/features/directory/ui/__tests__/provider-detail-page.test.tsx` (create)

**Interfaces:**
- Consumes: everything from Tasks 5–11.
- Produces: `<ProviderRail provider={ProviderPublicDetailDTO} />` — the price card, the two buttons and the trust list. `MessageProviderButton` moves into this file from `provider-hero.tsx`, with its doc comment and its `UNAUTHENTICATED` redirect effect intact.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/features/directory/ui/__tests__/provider-detail-page.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type {
  ProviderPublicDetailDTO,
  ProviderReviewsPublicDTO,
} from "@ntizo/shared/read-models";

const state: {
  provider: ProviderPublicDetailDTO | null;
  reviews: ProviderReviewsPublicDTO | undefined;
} = { provider: null, reviews: undefined };

vi.mock("@/features/directory/viewmodel/use-directory", () => ({
  useProviderDetail: () => state.provider,
  useProviderReviews: () => state.reviews,
}));

vi.mock("@/features/directory/services/viewmodel/use-provider-services", () => ({
  useProviderServices: () => ({ data: { items: [] }, isPending: false, isError: false }),
}));

const { ProviderDetailPage } = await import("../provider-detail-page");

function provider(over: Partial<ProviderPublicDetailDTO> = {}): ProviderPublicDetailDTO {
  return {
    id: "p1",
    name: "Hélder Cossa",
    slug: "helder-cossa",
    type: "individual",
    description: "Electricista certificado com nove anos de trabalho em Maputo.",
    city: "Maputo",
    district: "Sommerschield",
    country: "MZ",
    logoUrl: null,
    photoUrls: [],
    verified: true,
    ratingAverage: 4.8,
    reviewCount: 4,
    categories: [{ code: "electricity", name: "Electricity" }],
    serviceCount: 3,
    fromAmountMinor: 120000,
    fromCurrency: "MZN",
    memberSince: "2025-03",
    serviceLocationTypes: ["at_customer"],
    weeklyHours: [
      { weekday: 0, intervals: [] },
      ...[1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        intervals: [{ startMinute: 480, endMinute: 1080 }],
      })),
      { weekday: 6, intervals: [{ startMinute: 540, endMinute: 840 }] },
    ],
    ...over,
  };
}

const CLOSED_ALL_WEEK = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, intervals: [] }));

function renderPage(
  value: ProviderPublicDetailDTO | null,
  reviews: ProviderReviewsPublicDTO | undefined = undefined,
) {
  state.provider = value;
  state.reviews = reviews;

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <ProviderDetailPage slug="helder-cossa" />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("ProviderDetailPage", () => {
  it("names the provider and its trade", () => {
    renderPage(provider());
    expect(screen.getByRole("heading", { level: 1, name: /Hélder Cossa/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Electricity/).length).toBeGreaterThan(0);
  });

  it("states the four facts", () => {
    renderPage(provider());
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByText("Works")).toBeInTheDocument();
    expect(screen.getByText("Services")).toBeInTheDocument();
    expect(screen.getByText("On Ntizo since")).toBeInTheDocument();
    expect(screen.getByText("March 2025")).toBeInTheDocument();
  });

  it("omits the join month when there is none, rather than printing a blank", () => {
    renderPage(provider({ memberSince: null }));
    expect(screen.queryByText("On Ntizo since")).not.toBeInTheDocument();
  });

  it("puts the cheapest price and the message button in the rail", () => {
    renderPage(provider());
    expect(screen.getByText("from")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  });

  it("says nothing about a price when the provider publishes nothing priced", () => {
    // 0 MZN is a number somebody could charge. A provider with no priced
    // service has no "from", and the rail must not invent one.
    renderPage(provider({ fromAmountMinor: null, fromCurrency: null, serviceCount: 0 }));
    expect(screen.queryByText("from")).not.toBeInTheDocument();
  });

  it("claims verification for a verified provider", () => {
    renderPage(provider({ verified: true }));
    expect(screen.getByText(/verified by Ntizo/i)).toBeInTheDocument();
  });

  it("makes no verification claim for an unverified one", () => {
    // `verified` means an administrator accepted a document. A badge that is
    // always lit says nothing, and a sentence that is always printed lies.
    renderPage(provider({ verified: false }));
    expect(screen.queryByText(/verified by Ntizo/i)).not.toBeInTheDocument();
  });

  it("shows the usual week, collapsed", () => {
    renderPage(provider());
    expect(screen.getByText("Availability")).toBeInTheDocument();
    expect(screen.getByText("08:00 – 18:00")).toBeInTheDocument();
    expect(screen.getByText("09:00 – 14:00")).toBeInTheDocument();
  });

  it("says nothing about hours a provider never configured", () => {
    renderPage(provider({ weeklyHours: CLOSED_ALL_WEEK }));
    expect(screen.queryByText("Availability")).not.toBeInTheDocument();
  });

  it("offers no booking anywhere on the page", () => {
    renderPage(provider());
    expect(
      screen.queryByRole("button", { name: /^book$|reservar|pedir marca/i }),
    ).not.toBeInTheDocument();
  });

  it("reads as finished for a provider with no photos, no hours and no reviews", () => {
    // The common case, not the edge one: most providers have uploaded nothing
    // and configured nothing.
    renderPage(provider({ photoUrls: [], weeklyHours: CLOSED_ALL_WEEK }), undefined);
    expect(screen.getByRole("heading", { level: 1, name: /Hélder Cossa/ })).toBeInTheDocument();
    // The site header's own logo is an `img`, so this asks about the gallery
    // specifically rather than about images in general.
    expect(screen.queryByAltText("Hélder Cossa")).not.toBeInTheDocument();
  });

  it("shows the not-found copy for a slug that resolves to nothing", () => {
    renderPage(null);
    expect(screen.queryByRole("heading", { level: 1, name: /Hélder Cossa/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/ui/__tests__/provider-detail-page.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Extract the rail**

Create `provider-rail.tsx`. Move `MessageProviderButton` into it verbatim — the whole function including its doc comment and the `eslint-disable-next-line react-hooks/exhaustive-deps` block, whose comment explains a bug that was measured, not guessed. Do not rewrite that effect.

The rail is:

```
RailCard:
  price   formatAmount(fromAmountMinor, fromCurrency, locale)   type-display-ish, 30px
          t("railFromPrice")                                    type-body muted
  note    t("railCheapestOf", { count: serviceCount })
  ---
  <MessageProviderButton providerId={provider.id} />   (block, primary)
  <a href="#servicos"> t("railViewServices") </a>      (block, outline)
  ---
  <TrustList items={[...]} />
WeeklyHoursCard hours={provider.weeklyHours}
```

The trust items are built as: `[provider.verified && t("trustVerified"), t("trustMessagesKept")].filter(Boolean)`. The price block renders only when `fromAmountMinor !== null` — a provider publishing nothing priced has no "from", and `0 MZN` would be a lie.

- [ ] **Step 4: Shrink the hero**

`provider-hero.tsx` keeps the eyebrow (`type` + categories), the `h1`, the rating/place meta line and the verification badge; it loses the logo tile, the description (which moves to the page's "Sobre" section) and the message button. Update `provider-hero.test.tsx` accordingly — the assertions about the message button move to the new page test.

- [ ] **Step 5: Rebuild the page**

`provider-detail-page.tsx`:

```
<SiteHeader current="providers" />
<main className="page-shell py-8">
  <Breadcrumb />                                     Prestadores / <category> / <name>
  <DetailGallery images={provider.photoUrls} alt={provider.name}
                 badge={provider.verified && <VerifiedBadge />} />
  <div className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
    <div className="min-w-0">
      <ProviderHero provider={provider} />
      <DetailFacts facts={[
        { label: t("factCategory"),    value: provider.categories.map(c => c.name).join(" · ") },
        { label: t("factWhere"),       value: locationLabels(provider.serviceLocationTypes, t) },
        { label: t("servicesTitle"),   value: String(provider.serviceCount) },
        { label: t("factMemberSince"), value: formatMemberSince(provider.memberSince, locale) ?? "" },
      ]} />
      {provider.description && <About heading={t("aboutHeading")} body={provider.description} />}
      <ProviderServicesSection ... />
      <ProviderReviews providerId={provider.id} />
    </div>
    <aside className="lg:sticky lg:top-[100px]"><ProviderRail provider={provider} /></aside>
  </div>
</main>
```

`locationLabels` maps each code through `t(\`filterWhereOption.${code}\`)` and joins with `" · "` — all of them, never collapsed into `flexible`, which is one of the four types and not a word for "several".

The breadcrumb's middle crumb links to `/providers` with `search={{ category: provider.categories[0]?.code }}` when there is a category, and is omitted when there is none.

Keep the existing `!provider` not-found branch exactly as it is.

- [ ] **Step 6: Rows in the services section**

In `services-section.tsx`, replace the `<ul className="… grid …">` of `ServiceCard`s with a `<ul>` of `ServiceRow`s, give the section `id="servicos"` and `scroll-mt-[100px]`, and swap the skeleton for a row-shaped one. Rewrite the doc comment that argues for four across — it currently defends a grid that is gone. Keep the `AvailabilitySheet` mount and its `key={selectedService.id}` exactly as they are.

- [ ] **Step 7: Delete the portfolio**

```bash
git rm apps/frontend/web/src/features/directory/ui/provider-portfolio.tsx
```

Remove its import from `provider-detail-page.tsx`. Confirm nothing else references it: `grep -rn "ProviderPortfolio\|provider-portfolio" apps/frontend/web/src` must come back empty.

- [ ] **Step 8: Run the whole directory suite**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A apps/frontend/web/src/features/directory
git commit -m "Rebuild the provider page around a rail that carries the price

Two columns: who they are and what they sell on the left, what it costs
and how to reach them on the right. The portfolio grid is gone as a
section — its photographs are the gallery at the top now, which is where
'see all 8 photos' was always going to land.

The rail claims exactly two things, and the verification sentence only
when an administrator actually accepted a document."
```

---

### Task 13: Assemble the service page

**Files:**
- Modify: `apps/frontend/web/src/features/directory/services/ui/service-detail-page.tsx`
- Create: `apps/frontend/web/src/features/directory/services/ui/service-options.tsx`
- Create: `apps/frontend/web/src/features/directory/services/ui/rail-price-summary.tsx`
- Delete: `apps/frontend/web/src/features/directory/services/ui/package-chooser.tsx`
- Delete: `apps/frontend/web/src/features/directory/services/ui/service-gallery.tsx`
- Delete: `apps/frontend/web/src/features/directory/services/ui/__tests__/package-chooser.test.tsx`
- Delete: `apps/frontend/web/src/features/directory/services/ui/__tests__/service-gallery.test.tsx`
- Test: `apps/frontend/web/src/features/directory/services/ui/__tests__/service-options.test.tsx` (create)
- Test: `apps/frontend/web/src/features/directory/services/ui/__tests__/rail-price-summary.test.tsx` (create)
- Modify: `apps/frontend/web/src/features/directory/services/ui/__tests__/service-detail-page.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 5–11; `serviceDetailPanel` and `bookingTotal` unchanged.
- Produces:
  - `<ServiceOptions options={readonly ServiceDetailOptionDTO[]} selectedId={string} onSelect={(id: string) => void} locale={string} />` — renders nothing when `options.length < 2`.
  - `<RailPriceSummary option={ServiceDetailOptionDTO} locale={string} onCheckAvailability={() => void} providerId={string} />`.

Selection state lives in `ServiceDetailPage` so the body and the rail cannot disagree.

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/web/src/features/directory/services/ui/__tests__/service-options.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ServiceDetailOptionDTO } from "@ntizo/shared/read-models";
import { ServiceOptions } from "../service-options";

function option(over: Partial<ServiceDetailOptionDTO> = {}): ServiceDetailOptionDTO {
  return {
    id: "opt-1",
    name: "Diagnóstico e reparação",
    amountMinor: 120000,
    currency: "MZN",
    durationMinutes: 60,
    minMinutes: null,
    stepMinutes: null,
    pricingMode: "fixed",
    isDefault: true,
    ...over,
  };
}

const THREE = [
  option(),
  option({ id: "opt-2", name: "Diagnóstico alargado", amountMinor: 190000, durationMinutes: 120, isDefault: false }),
  option({ id: "opt-3", name: "Urgência fora de horas", amountMinor: 240000, isDefault: false }),
];

describe("ServiceOptions", () => {
  it("renders nothing for a single option", () => {
    // One radio in a group of one is a control that cannot be operated. A
    // service with one package says its price once, in the rail.
    const { container } = render(
      <ServiceOptions options={[option()]} selectedId="opt-1" onSelect={() => {}} locale="en-US" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for no options at all", () => {
    const { container } = render(
      <ServiceOptions options={[]} selectedId="" onSelect={() => {}} locale="en-US" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is a radiogroup with one radio per option", () => {
    render(<ServiceOptions options={THREE} selectedId="opt-1" onSelect={() => {}} locale="en-US" />);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("checks the selected option, and only that one", () => {
    render(<ServiceOptions options={THREE} selectedId="opt-2" onSelect={() => {}} locale="en-US" />);
    const checked = screen
      .getAllByRole("radio")
      .filter((radio) => radio.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveTextContent("Diagnóstico alargado");
  });

  it("reports the id of whichever option is chosen", async () => {
    const onSelect = vi.fn();
    render(<ServiceOptions options={THREE} selectedId="opt-1" onSelect={onSelect} locale="en-US" />);
    await userEvent.click(screen.getByRole("radio", { name: /Urgência fora de horas/ }));
    expect(onSelect).toHaveBeenCalledWith("opt-3");
  });

  it("prints each option's own price and length", () => {
    render(<ServiceOptions options={THREE} selectedId="opt-1" onSelect={() => {}} locale="en-US" />);
    // `formatAmount` is Intl currency formatting, so the group separator is
    // the locale's — matched loosely on purpose; the digits are the claim.
    expect(screen.getByText(/1[.,\s]?200/)).toBeInTheDocument();
    expect(screen.getByText(/1[.,\s]?900/)).toBeInTheDocument();
    expect(screen.getByText(/2[.,\s]?400/)).toBeInTheDocument();
    expect(screen.getByText(/120 min/)).toBeInTheDocument();
  });
});
```

Create `apps/frontend/web/src/features/directory/services/ui/__tests__/rail-price-summary.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ServiceDetailOptionDTO } from "@ntizo/shared/read-models";
import { NTIZO_COMMISSION_RATE, bookingTotal } from "../../domain/booking-total";
import { RailPriceSummary } from "../rail-price-summary";

const FIXED: ServiceDetailOptionDTO = {
  id: "opt-1",
  name: "Diagnóstico e reparação",
  amountMinor: 120000,
  currency: "MZN",
  durationMinutes: 60,
  minMinutes: null,
  stepMinutes: null,
  pricingMode: "fixed",
  isDefault: true,
};

function renderRail(
  option: ServiceDetailOptionDTO,
  { onCheck = () => {}, verified = true }: { onCheck?: () => void; verified?: boolean } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <RailPriceSummary
        option={option}
        locale="en-US"
        providerId="p1"
        providerVerified={verified}
        onCheckAvailability={onCheck}
      />
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("RailPriceSummary", () => {
  it("breaks the total into the price, the fee and the sum", () => {
    // The expected numbers come from the same function the component uses, so
    // this pins the wiring rather than restating 10% in a second place.
    const total = bookingTotal(FIXED.amountMinor);
    expect(total.commissionMinor).toBe(Math.round(FIXED.amountMinor * NTIZO_COMMISSION_RATE));

    renderRail(FIXED);
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText(/Ntizo commission/)).toBeInTheDocument();
    expect(screen.getByTestId("booking-total")).toHaveTextContent(/1[.,\s]?320/);
  });

  it("says the bookings are not open yet", () => {
    renderRail(FIXED);
    expect(screen.getByText("Bookings aren't open on Ntizo yet.")).toBeInTheDocument();
  });

  it("offers no control that implies a reservation was made", () => {
    renderRail(FIXED);
    expect(screen.queryByRole("button", { name: /^book$/i })).not.toBeInTheDocument();
  });

  it("opens the calendar when asked", async () => {
    const onCheck = vi.fn();
    renderRail(FIXED, { onCheck });
    await userEvent.click(screen.getByRole("button", { name: "See availability" }));
    expect(onCheck).toHaveBeenCalledOnce();
  });

  it("labels an hourly option by its minimum, not by a duration it does not have", () => {
    renderRail({
      ...FIXED,
      pricingMode: "hourly",
      durationMinutes: null,
      minMinutes: 240,
      stepMinutes: 60,
    });
    expect(screen.getByText("240 min minimum")).toBeInTheDocument();
  });

  it("makes no verification claim for an unverified provider", () => {
    renderRail(FIXED, { verified: false });
    expect(screen.queryByText(/verified by Ntizo/i)).not.toBeInTheDocument();
  });

  it("always says the fee is already in the total", () => {
    renderRail(FIXED);
    expect(screen.getByText(/already includes the service fee/i)).toBeInTheDocument();
  });
});
```

Keep the `data-testid="booking-total"` attribute that `PackageChooser` carries today — move it onto the total row of `RailPriceSummary`. It is the handle the total is asserted through, here and anywhere else that reaches for it.

Add to `apps/frontend/web/src/features/directory/services/ui/__tests__/service-detail-page.test.tsx`, keeping every existing assertion in that file:

```tsx
it("shows the options in the body when there is more than one", async () => {
  renderPage(
    detailService({
      options: [detailOption(), detailOption({ id: "opt-2", name: "Longo", amountMinor: 90000, isDefault: false })],
    }),
  );
  expect(await screen.findByRole("radiogroup")).toBeInTheDocument();
  expect(screen.getAllByRole("radio")).toHaveLength(2);
});

it("shows no options section for a single-package service", async () => {
  renderPage(detailService());
  expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
  expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
});

it("moves the rail's total when a different option is chosen in the body", async () => {
  renderPage(
    detailService({
      options: [
        detailOption({ amountMinor: 50000 }),
        detailOption({ id: "opt-2", name: "Longo", amountMinor: 90000, isDefault: false }),
      ],
    }),
  );
  // 50000 -> 55000 total; 90000 -> 99000.
  expect(await screen.findByTestId("booking-total")).toHaveTextContent(/550/);
  await userEvent.click(screen.getByRole("radio", { name: /Longo/ }));
  expect(screen.getByTestId("booking-total")).toHaveTextContent(/990/);
});

it("states the four facts about the service", async () => {
  renderPage(detailService());
  expect(await screen.findByText("Duration")).toBeInTheDocument();
  expect(screen.getByText("Works")).toBeInTheDocument();
  expect(screen.getByText("Pricing")).toBeInTheDocument();
  expect(screen.getByText("Category")).toBeInTheDocument();
});

it("offers no booking anywhere on the page", async () => {
  renderPage(detailService());
  await screen.findByRole("heading", { level: 1 });
  expect(screen.queryByRole("button", { name: /^book$|reservar|pedir marca/i })).not.toBeInTheDocument();
});
```

This file's existing `renderPage` mocks `useServiceDetail` only. The rebuilt page also calls `useProviderDetail` for the hours, so add a second `vi.mock` for `@/features/directory/viewmodel/use-directory` returning `{ useProviderDetail: () => null, useProviderReviews: () => undefined }` by default, and a mutable slot for the tests that want real hours. `useProviderDetail` returning `null` is a case the page must survive — the provider could be deactivated between the two queries — so the default is also an assertion.

Import `userEvent` at the top of the file if it is not already there.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/services`
Expected: FAIL — the two new modules do not resolve.

- [ ] **Step 3: Split `PackageChooser`**

`service-options.tsx` takes the radio list out of the chooser: the same `role="radiogroup"`, the same per-option `role="radio"` / `aria-checked`, the same selected styling (`border-[var(--color-primary)]` over `color-mix(in srgb, var(--color-primary) 7%, transparent)`), now as full-width body rows with the name over its meta on the left and the price on the right. It is controlled — `selectedId` and `onSelect` come from the page.

`rail-price-summary.tsx` takes the rest: the price headline, the `<dl>` breakdown (`packageDuration`, `packagePrice`, `packageCommission`, `packageTotal`) built from `bookingTotal(option.amountMinor)`, the `availabilityCheckAction` primary button, the `messageProviderCta` outline button reusing `MessageProviderButton` from `provider-rail.tsx`, the `packageBookingsClosed` note, and a `TrustList` with `trustVerified` (only when the provider is verified) and `trustFeeIncluded`.

Carry `optionDurationMinutes`' fixed-vs-hourly handling across unchanged, along with its explanation.

Then `git rm` `package-chooser.tsx` and its test.

- [ ] **Step 4: Rebuild the page**

Body order: `Breadcrumb`, `DetailGallery`, eyebrow (provider link + type + category), `h1`, rating meta, `DetailFacts` (`factDuration`, `factWhere`, `factPricingMode`, `factCategory`), `aboutServiceHeading` + description, `ServiceOptions`, `ServicePerformers`, `ServiceReviewsSection`.

Rail: `RailPriceSummary` for the `priced` branch, `ServiceQuoteNotice` for `quote`, `ServicePackagesUnavailable` for `unavailable` — the `serviceDetailPanel` three-way split stays exactly as it is, including its doc comment. Then `WeeklyHoursCard` and `ServiceProviderCard`.

The hours come from `useProviderDetail(service.providerSlug, locale)`. Guard for `null` — the provider could have been deactivated between the two queries — and render the hours card only when the provider resolves.

Keep `toAvailabilityService` and the `key={service.id}` mounts on `ServiceOptions` and `AvailabilitySheet`, and update `toAvailabilityService`'s doc comment: `providerVerified` is no longer unknowable now that the page holds the provider, so either feed it the real value or say in the comment why it still does not.

Then `git rm` `service-gallery.tsx` and its test; `grep -rn "ServiceGallery" apps/frontend/web/src` must come back empty.

- [ ] **Step 5: Run everything**

Run: `cd apps/frontend/web && bunx vitest run && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 6: Verify both pages in a browser**

Start the app, open a provider and one of its services, and check against the mockup at 1440px, 1100px and 390px: the gallery collage, the facts row, the rows, the sticky rail, the hours card, the reviews. Confirm no control anywhere says "Reservar" or "Pedir marcação".

- [ ] **Step 7: Commit**

```bash
git add -A apps/frontend/web/src/features/directory
git commit -m "Rebuild the service page to rhyme with the provider's

The options leave the rail for the body, as the same rows a provider's
services are listed in, and the rail keeps what the reader acts on: the
chosen option's total with its 10% fee, the calendar, and a way to ask.
Selection lives on the page, so the body and the rail cannot disagree
about which package is chosen."
```

---

## Self-Review

**Spec coverage.** Every section maps to a task: the detail read model → 1; `mergeIntervals` → 2; the repository, ports, projection and GraphQL → 3; i18n → 4; `groupWeekdays` / `formatMemberSince` and the `week.ts` split → 5; the frontend selection split → 6; `DetailGallery` → 7; `DetailFacts` / `RailCard` / `TrustList` → 8; `WeeklyHoursCard` → 9; `ServiceRow` → 10; the reviews rewrite and "see all" → 11; the provider page and the portfolio deletion → 12; the service page, the `PackageChooser` split and the gallery deletion → 13. The spec's exclusion table is carried into Global Constraints and asserted in Tasks 11, 12 and 13.

**One thing the spec did not anticipate**, found while planning and folded into Task 5: `weekdayLabel`, `minutesToLabel` and `WEEKDAY_ORDER` already exist in `features/provider/availability/domain/week.ts`. The directory feature importing from the provider feature would be a cross-feature dependency, and copying them would be a second chance to disagree with the calendar a provider configures. So the locale primitives move to `shared/domain/week-format.ts` and `week.ts` re-exports them, leaving its seven importers untouched. That file's own domain — `WeeklyRuleDraft`, `groupRules`, `overlaps` — does not move.

**Two places the plan deliberately tells the implementer to look before writing**, rather than guessing: whether the web test setup loads real i18n bundles (Task 9, Step 1) and how existing tests seed `QueryClient` data (Task 11, Step 1). Both are conventions the repository already has, and a plan that invented a third would be worse than one that asks.
