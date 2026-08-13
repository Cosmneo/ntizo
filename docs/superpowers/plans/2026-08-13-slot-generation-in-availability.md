# Slot Generation in Availability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the buffer and slot grid off the service and onto the availability rule that owns them, add per-rule capacity and a "no slots" option, and show the provider the slots their rules produce.

**Architecture:** Slots stay **computed**, never stored. Three nullable columns join `member_availability`; `NULL` resolves to a system constant, `slot_interval_minutes = 0` means the window is open with no slots at all. The availability projection stops merging a day's rules into one interval set before generating — it generates per rule, so two rules on one day can carry different grids — and capacity turns the busy check from a subtraction into a count.

**Tech Stack:** Bun, Drizzle + Postgres (named schemas), Hono + GraphQL, Vitest (frontend) / `bun test` (backend), React 19 + TanStack Router, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-13-slot-generation-in-availability-design.md`

## Global Constraints

- **Slots are computed, never persisted.** No slot table, no generation job, no generation window. If a task's design needs one, stop and re-open the spec.
- **Defaults are constants:** `BUFFER_MINUTES = 0`, `SLOT_INTERVAL_MINUTES = 30`, `CAPACITY = 1`.
- **`slot_interval_minutes` has three states:** `NULL` = use default, `0` = no slots, `15|30|60` = grid.
- **Capacity default is 1** and must stay 1 — anything higher silently oversells providers who never opened the field.
- **Duration is not moving.** It stays on `ntizo_catalog.service_option.duration_minutes`.
- **A rule with three `NULL`s must produce byte-identical output to today's engine.** This is the migration's safety net and is asserted in Task 3.
- **Postgres schemas are named:** `ntizo_scheduling`, `ntizo_catalog`. Never `public`.
- Test runners differ per package and are not interchangeable: `packages/shared` and `apps/frontend/web` run **vitest** (`npx vitest run`); `packages/backend` runs **bun** (`bun test src scripts`).
- Migrations are generated, never hand-written: `cd packages/backend && bun run db:ntizo:generate`, applied with `bun run db:ntizo:dev:migrate`.

---

### Task 1: `fixedStarts` refuses a zero grid

`firstMark` divides by `gridMinutes`. At `0` that is `x/0` → `Infinity`, or `0/0` → `NaN`, and the loop currently exits by accident rather than by decision. A grid of `0` is about to become a real, storable value, so the engine has to mean it.

**Files:**
- Modify: `packages/shared/src/scheduling/offers.ts:34-43`
- Test: `packages/shared/src/scheduling/__tests__/offers.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `fixedStarts(free, shape)` returns `[]` when `shape.gridMinutes <= 0`. `hourlyStarts` gains the same guard.

- [ ] **Step 1: Write the failing test**

```typescript
describe("a grid of zero", () => {
  const day: Interval[] = [{ start: 540, end: 1080 }]; // 09:00–18:00

  test("fixedStarts offers nothing rather than dividing by zero", () => {
    // Zero is a real answer — "I am open, there are no slots to pick" —
    // not a broken 30. It must be refused by decision, not by NaN
    // happening to fail a comparison.
    expect(fixedStarts(day, { durationMinutes: 30, bufferMinutes: 0, gridMinutes: 0 })).toEqual([]);
  });

  test("hourlyStarts offers nothing either", () => {
    expect(
      hourlyStarts(day, { minMinutes: 60, stepMinutes: 30, bufferMinutes: 0, gridMinutes: 0 }),
    ).toEqual([]);
  });

  test("a negative grid is refused the same way", () => {
    expect(fixedStarts(day, { durationMinutes: 30, bufferMinutes: 0, gridMinutes: -30 })).toEqual([]);
  });

  test("a real grid is untouched", () => {
    expect(fixedStarts(day, { durationMinutes: 30, bufferMinutes: 0, gridMinutes: 60 })).toEqual([
      540, 600, 660, 720, 780, 840, 900, 960, 1020,
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run src/scheduling/__tests__/offers.test.ts`
Expected: the three zero/negative cases FAIL (`[]` expected, garbage or `[]`-by-accident received); the last one PASSES.

*(If the zero cases pass by accident, that is the point of Step 3 — make them pass by decision. Change the assertion to a temporary `expect(true).toBe(false)` to confirm the file is running, then restore.)*

- [ ] **Step 3: Write minimal implementation**

```typescript
export function fixedStarts(free: readonly Interval[], shape: FixedShape): number[] {
  // A grid of zero is "no slots" — a real answer a provider gives, not a
  // broken 30. Refused here rather than left to `firstMark`'s division,
  // which returns Infinity or NaN and exits the loop by accident.
  if (shape.gridMinutes <= 0) return [];
  const span = shape.durationMinutes + shape.bufferMinutes;
  const out: number[] = [];
  for (const iv of free) {
    for (let t = firstMark(iv.start, shape.gridMinutes); t + span <= iv.end; t += shape.gridMinutes) {
      out.push(t);
    }
  }
  return out;
}
```

And the same first line in `hourlyStarts`:

```typescript
export function hourlyStarts(free: readonly Interval[], shape: HourlyShape): HourlyOffer[] {
  if (shape.gridMinutes <= 0) return [];
  const out: HourlyOffer[] = [];
  // …unchanged…
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/shared && npx vitest run src/scheduling/`
Expected: PASS, whole scheduling suite green, no warnings.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/scheduling/offers.ts packages/shared/src/scheduling/__tests__/offers.test.ts
git commit -m "feat(scheduling): a zero grid offers no starts, by decision"
```

---

### Task 2: The rule shape and its defaults

The one function that turns a rule's three nullable columns into the numbers the engine wants. It lives in `@ntizo/shared/scheduling` beside the engine it feeds, so the frontend preview and the backend projection resolve defaults the same way rather than twice.

**Files:**
- Create: `packages/shared/src/scheduling/rule-shape.ts`
- Modify: `packages/shared/src/scheduling/index.ts`
- Test: `packages/shared/src/scheduling/__tests__/rule-shape.test.ts`

**Interfaces:**
- Consumes: `FixedShape` from `./offers`.
- Produces:
  - `SCHEDULING_DEFAULTS: { bufferMinutes: 0; slotIntervalMinutes: 30; capacity: 1 }`
  - `interface RuleShapeInput { bufferMinutes: number | null; slotIntervalMinutes: number | null; capacity: number | null }`
  - `interface ResolvedRuleShape { bufferMinutes: number; gridMinutes: number; capacity: number; offersSlots: boolean }`
  - `resolveRuleShape(rule: RuleShapeInput): ResolvedRuleShape`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "vitest";
import { SCHEDULING_DEFAULTS, resolveRuleShape } from "../rule-shape";

const bare = { bufferMinutes: null, slotIntervalMinutes: null, capacity: null };

describe("resolveRuleShape", () => {
  test("a rule that says nothing gets every default", () => {
    expect(resolveRuleShape(bare)).toEqual({
      bufferMinutes: 0,
      gridMinutes: 30,
      capacity: 1,
      offersSlots: true,
    });
  });

  test("capacity defaults to one, because one barber cuts one head", () => {
    expect(SCHEDULING_DEFAULTS.capacity).toBe(1);
  });

  test("each field is taken when it is set", () => {
    expect(resolveRuleShape({ bufferMinutes: 15, slotIntervalMinutes: 60, capacity: 10 })).toEqual({
      bufferMinutes: 15,
      gridMinutes: 60,
      capacity: 10,
      offersSlots: true,
    });
  });

  test("a zero buffer is a real answer, not a missing one", () => {
    // `?? ` and not `||`: 0 is falsy and would silently become the default,
    // which happens to also be 0 today and would stop being so the day the
    // default changes.
    expect(resolveRuleShape({ ...bare, bufferMinutes: 0 }).bufferMinutes).toBe(0);
  });

  test("a grid of zero means no slots, and is not the default grid", () => {
    const open = resolveRuleShape({ ...bare, slotIntervalMinutes: 0 });
    expect(open.offersSlots).toBe(false);
    expect(open.gridMinutes).toBe(0);
    // The distinction the whole feature rests on.
    expect(open).not.toEqual(resolveRuleShape(bare));
  });

  test("null grid still offers slots", () => {
    expect(resolveRuleShape(bare).offersSlots).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run src/scheduling/__tests__/rule-shape.test.ts`
Expected: FAIL — `Cannot find module '../rule-shape'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * A rule's three nullable columns, resolved to the numbers the engine wants.
 *
 * One function, in the shared package, because the provider's own preview and
 * the customer's calendar must resolve a default the same way. Two copies of
 * "null means 30" is how they stop agreeing.
 */

/**
 * What a rule that says nothing means.
 *
 * `capacity: 1` is load-bearing, not a placeholder: one barber cuts one head
 * at a time, and any higher default would silently oversell every provider
 * who never opened the field.
 */
export const SCHEDULING_DEFAULTS = {
  bufferMinutes: 0,
  slotIntervalMinutes: 30,
  capacity: 1,
} as const;

export interface RuleShapeInput {
  readonly bufferMinutes: number | null;
  readonly slotIntervalMinutes: number | null;
  readonly capacity: number | null;
}

export interface ResolvedRuleShape {
  readonly bufferMinutes: number;
  readonly gridMinutes: number;
  readonly capacity: number;
  /** False when the rule said `0` — the window is open and offers nothing to pick. */
  readonly offersSlots: boolean;
}

export function resolveRuleShape(rule: RuleShapeInput): ResolvedRuleShape {
  // `??` throughout, never `||`: zero is a real answer for both the buffer
  // and the grid, and `||` would read each of them as "unset".
  const gridMinutes = rule.slotIntervalMinutes ?? SCHEDULING_DEFAULTS.slotIntervalMinutes;
  return {
    bufferMinutes: rule.bufferMinutes ?? SCHEDULING_DEFAULTS.bufferMinutes,
    gridMinutes,
    capacity: rule.capacity ?? SCHEDULING_DEFAULTS.capacity,
    offersSlots: gridMinutes > 0,
  };
}
```

Add to `packages/shared/src/scheduling/index.ts`:

```typescript
export * from "./rule-shape";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && npx vitest run src/scheduling/`
Expected: PASS, whole suite green.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/scheduling/rule-shape.ts packages/shared/src/scheduling/index.ts packages/shared/src/scheduling/__tests__/rule-shape.test.ts
git commit -m "feat(scheduling): resolve a rule's nullable shape to engine numbers"
```

---

### Task 3: Generate per rule, not per merged day

The behaviour-preserving refactor, and the one the whole feature rests on. `freeIntervals` **merges** a day's stretches: 08:00–12:00 beside 11:00–14:00 becomes one 08:00–14:00. Correct for "when is this person free", fatal for "which grid did this minute come from".

The fix needs no change to `freeIntervals` — it is called **once per rule**, with that rule as the only weekly entry.

**Files:**
- Create: `packages/shared/src/scheduling/per-rule.ts`
- Modify: `packages/shared/src/scheduling/index.ts`
- Test: `packages/shared/src/scheduling/__tests__/per-rule.test.ts`

**Interfaces:**
- Consumes: `freeIntervals` (`./intervals`), `fixedStarts` (`./offers`), `resolveRuleShape` (`./rule-shape`).
- Produces:
  - `interface DayRule extends RuleShapeInput { startMinute: number; endMinute: number }`
  - `interface StartsInput { houseClosed: boolean; exceptions: DayException[]; rules: readonly DayRule[]; durationMinutes: number }`
  - `startsForDay(input: StartsInput): Map<number, number>` — minute → capacity at that minute.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "vitest";
import { startsForDay, type DayRule } from "../per-rule";

const bare = { bufferMinutes: null, slotIntervalMinutes: null, capacity: null };
const rule = (startMinute: number, endMinute: number, over: Partial<DayRule> = {}): DayRule => ({
  ...bare,
  startMinute,
  endMinute,
  ...over,
});
const base = { houseClosed: false, exceptions: [], durationMinutes: 30 };

describe("startsForDay", () => {
  test("one plain rule is the engine's own answer", () => {
    // 09:00–11:00, 30-minute service, default 30 grid, no buffer.
    const starts = startsForDay({ ...base, rules: [rule(540, 660)] });
    expect([...starts.keys()]).toEqual([540, 570, 600, 630]);
  });

  test("two rules on one day keep their own grids", () => {
    // THE regression test. Merged into one 09:00–13:00 interval, the
    // afternoon's 60-minute grid would be lost and every start would land
    // on 30.
    const starts = startsForDay({
      ...base,
      rules: [
        rule(540, 660, { slotIntervalMinutes: 30 }), // 09:00–11:00 every 30
        rule(660, 780, { slotIntervalMinutes: 60 }), // 11:00–13:00 every 60
      ],
    });
    expect([...starts.keys()]).toEqual([540, 570, 600, 630, 660, 720]);
  });

  test("a rule with a zero grid contributes nothing", () => {
    const starts = startsForDay({
      ...base,
      rules: [rule(540, 660, { slotIntervalMinutes: 0 })],
    });
    expect(starts.size).toBe(0);
  });

  test("an open rule beside a slotted one leaves the slotted one alone", () => {
    const starts = startsForDay({
      ...base,
      rules: [rule(540, 660, { slotIntervalMinutes: 0 }), rule(660, 720, {})],
    });
    expect([...starts.keys()]).toEqual([660]);
  });

  test("overlapping rules offer a start once, at the larger capacity", () => {
    const starts = startsForDay({
      ...base,
      rules: [rule(540, 600, { capacity: 2 }), rule(540, 600, { capacity: 5 })],
    });
    expect([...starts.keys()]).toEqual([540]);
    expect(starts.get(540)).toBe(5);
  });

  test("capacity defaults to one", () => {
    const starts = startsForDay({ ...base, rules: [rule(540, 600)] });
    expect(starts.get(540)).toBe(1);
  });

  test("a house closure empties the day whatever the rules say", () => {
    const starts = startsForDay({ ...base, houseClosed: true, rules: [rule(540, 1080)] });
    expect(starts.size).toBe(0);
  });

  test("a closed exception empties the day", () => {
    const starts = startsForDay({
      ...base,
      exceptions: [{ kind: "closed", start: null, end: null }],
      rules: [rule(540, 1080)],
    });
    expect(starts.size).toBe(0);
  });

  test("a custom exception replaces the weekly rules, keeping their shape", () => {
    // The precedence chain still belongs to `freeIntervals`; this only
    // proves it is still being asked.
    const starts = startsForDay({
      ...base,
      exceptions: [{ kind: "custom", start: 600, end: 660 }],
      rules: [rule(540, 1080, { slotIntervalMinutes: 60 })],
    });
    expect([...starts.keys()]).toEqual([600]);
  });

  test("the buffer eats the last start, not the first", () => {
    // 09:00–10:00, 30-minute service, 15-minute buffer: 09:00 fits
    // (ends 09:45), 09:30 does not (would end 10:15).
    const starts = startsForDay({
      ...base,
      rules: [rule(540, 600, { bufferMinutes: 15 })],
    });
    expect([...starts.keys()]).toEqual([540]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run src/scheduling/__tests__/per-rule.test.ts`
Expected: FAIL — `Cannot find module '../per-rule'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { freeIntervals, type DayException } from "./intervals";
import { fixedStarts } from "./offers";
import { resolveRuleShape, type RuleShapeInput } from "./rule-shape";

/** One weekly rule on one date, with its own shape. */
export interface DayRule extends RuleShapeInput {
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface StartsInput {
  readonly houseClosed: boolean;
  readonly exceptions: readonly DayException[];
  readonly rules: readonly DayRule[];
  /** From the service's option — the one thing that is not the rule's to say. */
  readonly durationMinutes: number;
}

/**
 * Every start one member offers on one date, and how many bookings each holds.
 *
 * Generated **per rule**, which is the whole point. `freeIntervals` merges
 * overlapping and back-to-back stretches — 08:00–12:00 beside 11:00–14:00
 * becomes one 08:00–14:00 — and that merge is correct for "when is this person
 * free" and destroys the only thing that could say which rule contributed
 * which minutes. Once merged, a 15-minute grid in the morning and a 60-minute
 * one in the afternoon cannot both be honoured.
 *
 * So `freeIntervals` is asked once per rule, with that rule as the only weekly
 * entry. It keeps its job — the house-closure/closed/custom precedence chain
 * is still its and only its — and it is simply asked a narrower question.
 *
 * `busy` is deliberately **not** passed: with capacity above 1 a booked start
 * is still offered, so occupancy is counted by the caller against the capacity
 * returned here rather than subtracted from the free time.
 */
export function startsForDay(input: StartsInput): Map<number, number> {
  const out = new Map<number, number>();

  for (const rule of input.rules) {
    const shape = resolveRuleShape(rule);
    // "Open, nothing to pick" — the window still exists, it just offers no
    // list of times.
    if (!shape.offersSlots) continue;

    const free = freeIntervals({
      houseClosed: input.houseClosed,
      exceptions: input.exceptions,
      weekly: [{ start: rule.startMinute, end: rule.endMinute }],
      busy: [],
    });

    for (const minute of fixedStarts(free, {
      durationMinutes: input.durationMinutes,
      bufferMinutes: shape.bufferMinutes,
      gridMinutes: shape.gridMinutes,
    })) {
      // A start offered by two rules is offered by both, so it takes the
      // larger capacity rather than whichever rule was read last.
      const existing = out.get(minute);
      if (existing === undefined || shape.capacity > existing) out.set(minute, shape.capacity);
    }
  }

  return out;
}
```

Add to `packages/shared/src/scheduling/index.ts`:

```typescript
export * from "./per-rule";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && npx vitest run src/scheduling/`
Expected: PASS, whole scheduling suite green.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/scheduling/per-rule.ts packages/shared/src/scheduling/index.ts packages/shared/src/scheduling/__tests__/per-rule.test.ts
git commit -m "feat(scheduling): generate starts per rule so grids cannot be merged away"
```

---

### Task 4: Capacity counts occupancy instead of subtracting it

Today a busy interval is removed from the free time, so a start overlapping a booking never appears. With capacity that becomes a count: a start stays until `capacity` bookings overlap it.

At capacity 1 the two are equivalent, which is what makes the whole change a no-op for every provider until somebody opens the field.

**Files:**
- Modify: `packages/shared/src/scheduling/per-rule.ts`
- Test: `packages/shared/src/scheduling/__tests__/per-rule.test.ts`

**Interfaces:**
- Consumes: Task 3's `startsForDay`.
- Produces: `StartsInput` gains `busy: readonly Interval[]`; the returned map's value becomes **seats left**, not capacity. Signature unchanged otherwise: `startsForDay(input): Map<number, number>`.

- [ ] **Step 1: Write the failing test**

```typescript
describe("capacity against bookings", () => {
  test("capacity one behaves exactly as subtracting busy did", () => {
    // The migration's safety net: today's engine removes a start whose span
    // overlaps a booking, and so must this.
    const starts = startsForDay({
      ...base,
      rules: [rule(540, 660)],
      busy: [{ start: 570, end: 600 }], // 09:30–10:00 booked
    });
    expect([...starts.keys()]).toEqual([540, 600, 630]);
  });

  test("a start with room left is still offered, and says how much", () => {
    const starts = startsForDay({
      ...base,
      rules: [rule(540, 600, { capacity: 3 })],
      busy: [{ start: 540, end: 570 }], // one of three chairs taken
    });
    expect(starts.get(540)).toBe(2);
  });

  test("a full start disappears", () => {
    const starts = startsForDay({
      ...base,
      rules: [rule(540, 600, { capacity: 2 })],
      busy: [
        { start: 540, end: 570 },
        { start: 540, end: 570 },
      ],
    });
    expect(starts.has(540)).toBe(false);
  });

  test("the buffer is occupied but not sold, so a booking inside it collides", () => {
    // A 09:00 start of a 30-minute service with a 15-minute buffer occupies
    // 540–585 (09:00–09:45). A booking at 570–585 (09:30–09:45) lands inside
    // that span — in the buffer, not in the appointment — and still takes the
    // seat, because the buffer is time nobody else can have.
    const starts = startsForDay({
      ...base,
      rules: [rule(540, 720, { bufferMinutes: 15 })],
      busy: [{ start: 570, end: 585 }],
    });
    expect(starts.has(540)).toBe(false);
  });

  test("a booking starting exactly where the buffer ends does not collide", () => {
    // 585 is the first minute the span no longer covers. Half-open on
    // purpose: `b.start < to && from < b.end`.
    const starts = startsForDay({
      ...base,
      rules: [rule(540, 720, { bufferMinutes: 15 })],
      busy: [{ start: 585, end: 600 }],
    });
    expect(starts.has(540)).toBe(true);
  });

  test("no bookings leaves every start at full capacity", () => {
    const starts = startsForDay({ ...base, rules: [rule(540, 600, { capacity: 4 })], busy: [] });
    expect(starts.get(540)).toBe(4);
  });
});
```

Add `busy: []` to the shared `base` object at the top of the file:

```typescript
const base = { houseClosed: false, exceptions: [], busy: [], durationMinutes: 30 };
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run src/scheduling/__tests__/per-rule.test.ts`
Expected: FAIL — `busy` is not on `StartsInput` (type error), and the capacity assertions fail because the map still returns capacity rather than seats left.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { freeIntervals, type DayException, type Interval } from "./intervals";

export interface StartsInput {
  readonly houseClosed: boolean;
  readonly exceptions: readonly DayException[];
  readonly rules: readonly DayRule[];
  /** What is already booked. Counted against capacity, never subtracted from the window. */
  readonly busy: readonly Interval[];
  readonly durationMinutes: number;
}

/** How many bookings overlap `[from, to)`. Touching ends do not overlap. */
function overlapCount(busy: readonly Interval[], from: number, to: number): number {
  let n = 0;
  for (const b of busy) if (b.start < to && from < b.end) n += 1;
  return n;
}
```

Then, inside the `for (const minute of fixedStarts(...))` loop, replace the body:

```typescript
      // The span the booking occupies is duration + buffer: the buffer is
      // time nobody else can have, even though it is not sold.
      const taken = overlapCount(input.busy, minute, minute + input.durationMinutes + shape.bufferMinutes);
      const seatsLeft = shape.capacity - taken;
      // A start with no seats left is not offered at all — the same answer
      // subtracting `busy` used to give, arrived at by counting.
      if (seatsLeft <= 0) continue;
      const existing = out.get(minute);
      if (existing === undefined || seatsLeft > existing) out.set(minute, seatsLeft);
```

Update the function's doc comment's last paragraph:

```typescript
 * `busy` is counted, not subtracted: with capacity above 1 a booked start is
 * still offered to the next customer. At capacity 1 the count and the
 * subtraction give the same answer, which is what makes this change invisible
 * to every provider who never opens the field.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && npx vitest run src/scheduling/`
Expected: PASS, whole suite green.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/scheduling/per-rule.ts packages/shared/src/scheduling/__tests__/per-rule.test.ts
git commit -m "feat(scheduling): count bookings against capacity instead of subtracting them"
```

---

### Task 5: The three nullable columns

Deploy point 1 from the spec's migration order. Nothing reads them yet; this task only makes them exist and proves the constraints refuse what they should.

**Files:**
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/scheduling/schemas/member-availability.schema.ts`
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/migrations/00NN_*.sql` (generated)
- Test: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/member-availability.schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MemberAvailabilityRecord` gains `bufferMinutes: number | null`, `slotIntervalMinutes: number | null`, `capacity: number | null`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { memberAvailability } from "../scheduling/schemas/member-availability.schema";

describe("member_availability shape columns", () => {
  const { columns, checks } = getTableConfig(memberAvailability);
  const byName = new Map(columns.map((c) => [c.name, c]));

  test("carries the three shape columns", () => {
    for (const name of ["buffer_minutes", "slot_interval_minutes", "capacity"]) {
      expect(byName.has(name)).toBe(true);
    }
  });

  test("all three are nullable, because null means 'use the default'", () => {
    // Not-null with a default would make "nothing said" and "said the
    // default's own number" indistinguishable, and the day the default
    // changes every untouched rule would silently keep the old one.
    for (const name of ["buffer_minutes", "slot_interval_minutes", "capacity"]) {
      expect(byName.get(name)!.notNull).toBe(false);
    }
  });

  test("the grid check admits zero — 'open, no slots'", () => {
    const grid = checks.find((c) => c.name === "member_availability_slot_interval");
    expect(grid).toBeDefined();
    expect(String(grid!.value.queryChunks.join(""))).toContain("0");
  });

  test("capacity refuses zero and below", () => {
    const cap = checks.find((c) => c.name === "member_availability_capacity");
    expect(cap).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/member-availability.schema.test.ts`
Expected: FAIL — `buffer_minutes` is not a column.

- [ ] **Step 3: Write minimal implementation**

In `member-availability.schema.ts`, after `endMinute`:

```typescript
    /**
     * The three that shape the slots this window produces. All nullable, and
     * that is the design: `NULL` means "use the default", which is what the
     * `Use default: …` placeholder on the rule drawer says out loud.
     *
     * `slotIntervalMinutes` has three states, not two. `NULL` is "nothing
     * said". `0` is **"said: no slots"** — the window is simply open, for a
     * provider who takes people as they arrive. `15`/`30`/`60` is a grid.
     * Spelled as a value rather than a separate `slotted` boolean because a
     * boolean plus a number can contradict each other, and
     * `slotted = false, interval = 30` would still be storable.
     */
    bufferMinutes: integer("buffer_minutes"),
    slotIntervalMinutes: integer("slot_interval_minutes"),
    /** How many bookings one slot holds. Null → 1: one barber cuts one head. */
    capacity: integer("capacity"),
```

And in the constraints array:

```typescript
    check(
      "member_availability_buffer_range",
      sql`${t.bufferMinutes} IS NULL OR ${t.bufferMinutes} BETWEEN 0 AND 480`,
    ),
    check(
      "member_availability_slot_interval",
      sql`${t.slotIntervalMinutes} IS NULL OR ${t.slotIntervalMinutes} IN (0, 15, 30, 60)`,
    ),
    check("member_availability_capacity", sql`${t.capacity} IS NULL OR ${t.capacity} >= 1`),
```

- [ ] **Step 4: Generate the migration and run the tests**

Run:
```bash
cd packages/backend && bun run db:ntizo:generate && bun test src/modules/ntizo/shared/
```
Expected: a new `00NN_*.sql` appears under `src/modules/ntizo/shared/infrastructure/migrations/` containing three `ADD COLUMN`s and three `ADD CONSTRAINT`s; tests PASS.

Read the generated SQL before continuing. It must contain **no** `DROP` — if drizzle-kit proposes dropping anything, stop and report it rather than applying.

- [ ] **Step 5: Apply to dev and commit**

```bash
cd packages/backend && bun run db:ntizo:dev:migrate
git add packages/backend/src/modules/ntizo/shared/infrastructure/database/scheduling/schemas/member-availability.schema.ts \
        packages/backend/src/modules/ntizo/shared/infrastructure/migrations/ \
        packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/member-availability.schema.test.ts
git commit -m "feat(scheduling): buffer, grid and capacity on the availability rule"
```

---

### Task 6: The rule's shape travels through the write path

The GraphQL input, the aggregate and the repository all currently carry exactly `{ weekday, startMinute, endMinute }`. They gain the three optional fields so a provider can actually set them.

**Files:**
- Modify: `packages/backend/src/modules/ntizo/write/scheduling/graphql/schema/mutations.ts:9-13`
- Modify: the `setWeeklyPattern` command and the member-schedule aggregate's weekly-rule entry (find with `grep -rn "setWeeklyPattern" packages/backend/src --include="*.ts" -l`)
- Modify: the drizzle schedule repository's weekly-rule insert
- Test: `packages/backend/src/modules/ntizo/write/scheduling/__tests__/scheduling-mutations.test.ts`

**Interfaces:**
- Consumes: Task 5's columns.
- Produces: `weeklyRuleInput` accepts `bufferMinutes?: number | null`, `slotIntervalMinutes?: number | null`, `capacity?: number | null`. Absent and `null` both persist as `NULL`.

- [ ] **Step 1: Write the failing test**

Add to `scheduling-mutations.test.ts`:

```typescript
test("a weekly rule may carry its own shape", async () => {
  const result = await call("availability.setWeeklyPattern", {
    providerId: "p1",
    memberId: "m1",
    rules: [
      {
        weekday: 1,
        startMinute: 540,
        endMinute: 1080,
        bufferMinutes: 15,
        slotIntervalMinutes: 60,
        capacity: 3,
      },
    ],
  });
  expect(result.ok).toBe(true);
});

test("a weekly rule without a shape is still accepted", async () => {
  // The shape is optional in every sense: absent means "use the default",
  // and every rule written before this feature existed is exactly that.
  const result = await call("availability.setWeeklyPattern", {
    providerId: "p1",
    memberId: "m1",
    rules: [{ weekday: 1, startMinute: 540, endMinute: 1080 }],
  });
  expect(result.ok).toBe(true);
});

test("a grid of zero is accepted — it means no slots", async () => {
  const result = await call("availability.setWeeklyPattern", {
    providerId: "p1",
    memberId: "m1",
    rules: [{ weekday: 1, startMinute: 540, endMinute: 1080, slotIntervalMinutes: 0 }],
  });
  expect(result.ok).toBe(true);
});

test("a grid the engine has no meaning for is refused", async () => {
  await expect(
    call("availability.setWeeklyPattern", {
      providerId: "p1",
      memberId: "m1",
      rules: [{ weekday: 1, startMinute: 540, endMinute: 1080, slotIntervalMinutes: 45 }],
    }),
  ).rejects.toThrow();
});

test("a capacity of zero is refused — nobody can be booked into it", async () => {
  await expect(
    call("availability.setWeeklyPattern", {
      providerId: "p1",
      memberId: "m1",
      rules: [{ weekday: 1, startMinute: 540, endMinute: 1080, capacity: 0 }],
    }),
  ).rejects.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && bun test src/modules/ntizo/write/scheduling/`
Expected: FAIL — the zod input strips or rejects the unknown fields, and the `45` / `0` cases resolve rather than throwing.

- [ ] **Step 3: Write minimal implementation**

In `mutations.ts`:

```typescript
const weeklyRuleInput = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  // The rule's own shape. Every one optional and nullable, and both spellings
  // mean the same thing — "use the default" — because a client that omits a
  // field and one that sends `null` are saying the same thing and should not
  // have to know which this endpoint prefers.
  bufferMinutes: z.number().int().min(0).max(480).nullish(),
  // `0` is a real value here: it means the window offers no slots at all.
  slotIntervalMinutes: z
    .union([z.literal(0), z.literal(15), z.literal(30), z.literal(60)])
    .nullish(),
  capacity: z.number().int().min(1).nullish(),
});
```

Then thread the three fields through the command's rule mapping and the repository insert, normalising `undefined` to `null` at the persistence boundary:

```typescript
  bufferMinutes: rule.bufferMinutes ?? null,
  slotIntervalMinutes: rule.slotIntervalMinutes ?? null,
  capacity: rule.capacity ?? null,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/backend && bun test src/modules/ntizo/write/scheduling/`
Expected: PASS, and `bun test src` still green.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/write/scheduling/
git commit -m "feat(scheduling): a weekly rule carries its own buffer, grid and capacity"
```

---

### Task 7: The projection generates per rule

Deploy point 2. The read path stops asking the service for a buffer and a grid and starts asking each rule. This is where `startsForDay` replaces the merge-then-generate shape.

**Files:**
- Modify: `packages/backend/src/modules/ntizo/public/scheduling/app/use-cases/list-service-availability.projection.ts:75-107, 240-290`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/scheduling/app/ports/outbound/schedule.repository.port.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/scheduling/infrastructure/repositories/drizzle/schedule.repository.ts`
- Test: `packages/backend/src/modules/ntizo/public/scheduling/__tests__/list-service-availability.test.ts`

**Interfaces:**
- Consumes: `startsForDay`, `DayRule` (Task 3/4).
- Produces: `MemberCalendar.weeklyByWeekday` becomes `ReadonlyMap<number, DayRule[]>` (was `ReadonlyMap<number, Interval[]>`). `ServiceAvailabilityDTO`'s start entries gain `seatsLeft: number`. `SchedulingInfo` loses `bufferMinutes` and `slotIntervalMinutes`.

- [ ] **Step 1: Write the failing test**

```typescript
test("two rules on one day keep their own grids end to end", async () => {
  // The projection-level twin of the engine test: proof the rules reach
  // `startsForDay` unmerged.
  const result = await listServiceAvailability(deps, {
    serviceId: SERVICE_WITH_30_MIN_OPTION,
    from: "2026-08-10",
    to: "2026-08-10",
  });
  const minutes = result.days[0]!.starts.map((s) => s.minuteOfDay);
  expect(minutes).toEqual([540, 570, 600, 630, 660, 720]);
});

test("a rule with no grid offers no starts", async () => {
  const result = await listServiceAvailability(deps, {
    serviceId: SERVICE_WITH_OPEN_RULE,
    from: "2026-08-10",
    to: "2026-08-10",
  });
  expect(result.days[0]!.starts).toEqual([]);
});

test("every start says how many seats are left", async () => {
  const result = await listServiceAvailability(deps, {
    serviceId: SERVICE_WITH_30_MIN_OPTION,
    from: "2026-08-10",
    to: "2026-08-10",
  });
  expect(result.days[0]!.starts[0]!.seatsLeft).toBe(1);
});

test("a rule with three nulls answers exactly as before", async () => {
  // The migration's safety net, at the level a customer actually sees.
  const result = await listServiceAvailability(deps, {
    serviceId: SERVICE_UNTOUCHED_RULE,
    from: "2026-08-10",
    to: "2026-08-10",
  });
  expect(result.days[0]!.starts.map((s) => s.minuteOfDay)).toEqual(EXPECTED_BEFORE_THE_CHANGE);
});
```

Seed `SERVICE_WITH_30_MIN_OPTION` with two rules on weekday 1 — `540–660` at grid 30 and `660–780` at grid 60 — and a 30-minute fixed option. Seed `SERVICE_WITH_OPEN_RULE` with one rule `540–1080, slot_interval_minutes = 0`. Seed `SERVICE_UNTOUCHED_RULE` with one rule `540–660` and three nulls; `EXPECTED_BEFORE_THE_CHANGE` is `[540, 570, 600, 630]`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && bun test src/modules/ntizo/public/scheduling/`
Expected: FAIL — the two-grid case returns the merged 30-minute grid throughout, `seatsLeft` is undefined, and the open rule still emits starts.

- [ ] **Step 3: Write minimal implementation**

Replace `resolveOfferShape`'s grid/buffer reads — those two lines and the `SchedulingInfo` fields behind them go away entirely; the function now only decides duration:

```typescript
/**
 * What the default option makes bookable, or null when it makes nothing.
 *
 * Reduced to the one thing the *service* still says: how long it takes. The
 * buffer and the grid moved to the availability rule, because a provider's day
 * is cut up by how they work rather than by which of their services is being
 * looked at. Null still covers a quote service and the shapes the CHECK
 * constraints forbid.
 */
function resolveDuration(info: SchedulingInfo): number | null {
  const option = info.defaultOption;
  if (!option) return null;
  if (option.pricingMode !== "fixed") return null;
  const durationMinutes = option.durationMinutes;
  if (durationMinutes === null || durationMinutes <= 0) return null;
  return durationMinutes;
}
```

Then the day loop's inner block:

```typescript
      for (const calendar of calendars) {
        const starts = startsForDay({
          houseClosed,
          exceptions: calendar.exceptionsByDate.get(date) ?? [],
          rules: calendar.weeklyByWeekday.get(weekday) ?? [],
          busy: calendar.busyByDate.get(date) ?? [],
          durationMinutes,
        });

        for (const [minute, seatsLeft] of starts) {
          const existing = byMinute.get(minute);
          if (!existing) {
            byMinute.set(minute, { memberIds: [calendar.memberId], seatsLeft });
            continue;
          }
          existing.memberIds.push(calendar.memberId);
          // Seats add up across members: two barbers free at 09:00 is two
          // haircuts, not one.
          existing.seatsLeft += seatsLeft;
        }
      }
```

And the repository's `weeklyByWeekday` build now carries the shape:

```typescript
        const day = weeklyByWeekday.get(rule.weekday) ?? [];
        day.push({
          startMinute: rule.startMinute,
          endMinute: rule.endMinute,
          bufferMinutes: rule.bufferMinutes,
          slotIntervalMinutes: rule.slotIntervalMinutes,
          capacity: rule.capacity,
        });
        weeklyByWeekday.set(rule.weekday, day);
```

`hourlyStarts` keeps its own path unchanged for hourly options — route to it before calling `startsForDay` when `option.pricingMode === "hourly"`, using the same per-rule loop and `resolveRuleShape` for its buffer and grid.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/backend && bun test src`
Expected: PASS, whole backend suite green.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/public/scheduling/ packages/backend/src/modules/ntizo/bounded-contexts/scheduling/
git commit -m "feat(scheduling): generate availability per rule, with seats left per start"
```

---

### Task 8: The rule drawer asks the three questions

**Files:**
- Modify: `apps/frontend/web/src/features/provider/availability/ui/rule-drawer.tsx`
- Modify: `apps/frontend/web/src/features/provider/availability/domain/types.ts` (`WeeklyRuleDraft`)
- Modify: `apps/frontend/web/src/features/provider/availability/data/availability.repository.ts`
- Modify: `apps/frontend/web/src/shared/locales/*/provider.json` (8 files)
- Test: `apps/frontend/web/src/features/provider/availability/ui/__tests__/rule-drawer.test.tsx`

**Interfaces:**
- Consumes: Task 6's mutation input.
- Produces: `WeeklyRuleDraft` gains `bufferMinutes: number | null`, `slotIntervalMinutes: number | null`, `capacity: number | null`.

- [ ] **Step 1: Write the failing test**

```typescript
it("offers the three shape fields, each stating its default", async () => {
  renderDrawer();

  expect(screen.getByLabelText("Buffer time")).toHaveAttribute("placeholder", "Use default: 0 min");
  expect(screen.getByLabelText("Time grid")).toBeInTheDocument();
  expect(screen.getByLabelText("Capacity")).toHaveAttribute(
    "placeholder",
    "Use default: 1 booking",
  );
});

it("leaves an untouched field null rather than writing the default into it", async () => {
  // "I did not say" and "I said 30" must stay different, or the day the
  // default changes every untouched rule silently keeps the old one.
  const { onSubmit } = renderDrawer();
  await userEvent.click(screen.getByRole("button", { name: "Done" }));

  expect(onSubmit).toHaveBeenCalledWith([
    expect.objectContaining({ bufferMinutes: null, slotIntervalMinutes: null, capacity: null }),
  ]);
});

it("offers 'no slots' as a grid choice", async () => {
  const { onSubmit } = renderDrawer();
  await userEvent.click(screen.getByRole("radio", { name: "No slots" }));
  await userEvent.click(screen.getByRole("button", { name: "Done" }));

  expect(onSubmit).toHaveBeenCalledWith([
    expect.objectContaining({ slotIntervalMinutes: 0 }),
  ]);
});

it("refuses a capacity below one", async () => {
  renderDrawer();
  await userEvent.type(screen.getByLabelText("Capacity"), "0");
  await userEvent.click(screen.getByRole("button", { name: "Done" }));

  expect(screen.getByText("At least one booking must fit.")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend/web && npx vitest run src/features/provider/availability/ui/__tests__/rule-drawer.test.tsx`
Expected: FAIL — none of the three fields exist.

- [ ] **Step 3: Write minimal implementation**

Add to the drawer, under the existing days and times, using the wizard's `Field` wrapper already imported elsewhere in this feature:

```tsx
      <Field label={t("availabilityRuleBuffer")}>
        <Input
          id="rule-buffer"
          inputMode="numeric"
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
          placeholder={t("availabilityRuleBufferDefault")}
        />
      </Field>

      <ChoiceChips
        name="rule-grid"
        legend={t("availabilityRuleGrid")}
        showLegend
        value={grid}
        onChange={setGrid}
        options={[
          { value: "", label: t("availabilityRuleGridDefault") },
          { value: "0", label: t("availabilityRuleGridNone") },
          { value: "15", label: t("serviceSlotInterval15") },
          { value: "30", label: t("serviceSlotInterval30") },
          { value: "60", label: t("serviceSlotInterval60") },
        ]}
      />

      <Field label={t("availabilityRuleCapacity")} error={capacityError}>
        <Input
          id="rule-capacity"
          inputMode="numeric"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          placeholder={t("availabilityRuleCapacityDefault")}
        />
      </Field>
```

Empty string → `null` on submit. Not a checkbox beside each field: "leave it alone" and "type the number the default happens to be" are the same intent, and a second control to express it is a second thing to get wrong.

New keys, `en-US` shown, `pt-PT`/`pt-MZ` written properly, the other five carrying the English until translated (the parity gate in `src/shared/lib/__tests__/i18n-parity.test.ts` enforces the key sets match):

```json
"availabilityRuleBuffer": "Buffer time",
"availabilityRuleBufferDefault": "Use default: 0 min",
"availabilityRuleGrid": "Time grid",
"availabilityRuleGridDefault": "Use default: 30 min",
"availabilityRuleGridNone": "No slots",
"availabilityRuleCapacity": "Capacity",
"availabilityRuleCapacityDefault": "Use default: 1 booking",
"availabilityRuleCapacityInvalid": "At least one booking must fit."
```

```json
"availabilityRuleBuffer": "Tempo de intervalo",
"availabilityRuleBufferDefault": "Usar omissão: 0 min",
"availabilityRuleGrid": "Grelha de horários",
"availabilityRuleGridDefault": "Usar omissão: 30 min",
"availabilityRuleGridNone": "Sem slots",
"availabilityRuleCapacity": "Capacidade",
"availabilityRuleCapacityDefault": "Usar omissão: 1 reserva",
"availabilityRuleCapacityInvalid": "Tem de caber pelo menos uma reserva."
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend/web && npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all green; the i18n parity suite in particular.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/features/provider/availability/ apps/frontend/web/src/shared/locales/
git commit -m "feat(availability): the rule drawer asks for buffer, grid and capacity"
```

---

### Task 9: The wizard loses its Tempos step

**Files:**
- Modify: `apps/frontend/web/src/features/provider/services/domain/wizard-model.ts`
- Delete: `apps/frontend/web/src/features/provider/services/ui/steps/step-timing.tsx`
- Modify: `apps/frontend/web/src/features/provider/services/ui/service-wizard-page.tsx`
- Modify: `apps/frontend/web/src/features/provider/services/viewmodel/use-service-wizard.ts`
- Modify: `apps/frontend/web/src/features/provider/services/domain/service-draft.ts`
- Modify: `apps/frontend/web/src/shared/locales/*/provider.json` (8 files)
- Test: `apps/frontend/web/src/features/provider/services/domain/__tests__/wizard-model.test.ts`, `.../ui/__tests__/service-wizard-page.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `ServiceStep` loses `"timing"`. `CREATES_SERVICE` becomes `"booking"`. `ServiceDraft` loses `bufferMinutes` and `slotIntervalMinutes`; `SlotIntervalMinutes` and `SLOT_INTERVAL_OPTIONS` are deleted.

- [ ] **Step 1: Write the failing test**

```typescript
test("an organization selling a priced service walks six steps", () => {
  expect(stepsFor(ORGANIZATION_PRICED)).toEqual([
    "basics",
    "booking",
    "performers",
    "pricing",
    "languages",
    "review",
  ]);
});

test("the service is created on the way out of the booking step", () => {
  // It has to be the last step that always exists before `pricing`, and
  // `performers` does not exist for an individual provider.
  expect(CREATES_SERVICE).toBe("booking");
});

test("the step that creates the service is present in every shape", () => {
  for (const individualProvider of [true, false]) {
    for (const bookingMode of ["priced", "quote"] as const) {
      expect(stepsFor({ individualProvider, bookingMode })).toContain(CREATES_SERVICE);
    }
  }
});

test("the steps that need a saved service still come after it", () => {
  const steps = stepsFor(ORGANIZATION_PRICED);
  const created = steps.indexOf(CREATES_SERVICE);
  for (const needsId of ["pricing", "languages"] as const) {
    expect(steps.indexOf(needsId)).toBeGreaterThan(created);
  }
});
```

And in the page suite, replace the seven-step assertion and delete the Tempos navigation from the create-flow test:

```typescript
it("an organization walks all six steps", async () => {
  const qc = makeQueryClient();
  seed(qc);
  renderWizard("/provider/bela-vista/services/new", qc);
  await screen.findByRole("heading", { name: "What service are you offering?" });
  for (const label of [
    /The essentials/, /How it is charged/, /Who does it/,
    /Prices/, /Languages/, /Check and publish/,
  ]) {
    expect(railRow(label)).toBeInTheDocument();
  }
  expect(screen.queryByRole("button", { name: /Timing/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend/web && npx vitest run src/features/provider/services/`
Expected: FAIL — seven steps returned, `CREATES_SERVICE` is `"timing"`.

- [ ] **Step 3: Write minimal implementation**

In `wizard-model.ts`:

```typescript
export type ServiceStep =
  | "basics"
  | "booking"
  | "performers"
  | "pricing"
  | "languages"
  | "review";

/**
 * The step that creates the service.
 *
 * `booking`, because it is the last step that exists in *every* shape before
 * `pricing` — `performers` is dropped for an individual provider, so it cannot
 * be relied on. It moved here from `timing` when the buffer and the grid left
 * the service for the availability rule that owns them.
 */
export const CREATES_SERVICE: ServiceStep = "booking";
```

Drop `"timing"` from `stepsFor` and from `stepBlocks`'s `timing` branch (the buffer it guarded no longer exists on the draft). Delete `step-timing.tsx`, its import and its `case "timing"` in `service-wizard-page.tsx`, and `bufferMinutes`/`slotIntervalMinutes` from `ServiceDraft`, `emptyDraft`, `draftFrom` and the `save.mutateAsync` payload in `use-service-wizard.ts`. Delete `parseBufferMinutes`, `SLOT_INTERVAL_OPTIONS` and `SlotIntervalMinutes` from `service-draft.ts` along with their tests.

Remove from all 8 locales: `serviceStep.timing`, `serviceStepTitle.timing`, `serviceStepDescription.timing`, `serviceBuffer`, `serviceBufferHint`, `serviceBufferError`, `serviceSlotInterval`, `serviceSlotIntervalHint`, `serviceSlotInterval15/30/60`.

Keep `serviceSlotInterval15/30/60` **only if** Task 8 reused them for the drawer's chips — it does. So delete every key above **except** those three.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend/web && npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all green, including the i18n parity suite.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/features/provider/services/ apps/frontend/web/src/shared/locales/
git commit -m "feat(services): the wizard drops Tempos; the rule owns the slot shape"
```

---

### Task 10: Drop the two service columns

Deploy point 4. Safe only because Task 7 already stopped reading them.

**Files:**
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/catalog/schemas/service.schema.ts:57-59, 71-72`
- Modify: the catalog service aggregate, `create-service.command.ts`, `update-service.command.ts`, `service.mapper.ts`, `service-read.repository.ts`, `list-my-services.projection.ts`, `write/catalog/graphql/schema/mutations.ts`
- Create: generated migration
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/__tests__/service.mapper.test.ts`

**Interfaces:**
- Consumes: Task 7 (nothing reads the columns).
- Produces: `ServiceCreateInput` and `ServiceUpdateInput` lose `bufferMinutes` and `slotIntervalMinutes`; the service read model loses both.

- [ ] **Step 1: Write the failing test**

```typescript
test("a service no longer carries a buffer or a grid", () => {
  const { columns } = getTableConfig(service);
  const names = columns.map((c) => c.name);
  // They belong to the availability rule now: a provider's day is cut up by
  // how they work, not by which of their services is being looked at.
  expect(names).not.toContain("buffer_minutes");
  expect(names).not.toContain("slot_interval_minutes");
});

test("the mapper round-trips without them", () => {
  const row = { ...SERVICE_ROW };
  expect(toDomain(row)).not.toHaveProperty("bufferMinutes");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/catalog/`
Expected: FAIL — both columns still present.

- [ ] **Step 3: Write minimal implementation**

Delete from `service.schema.ts` the two column definitions and the two `check(...)` entries `service_buffer_range` and `service_slot_interval`. Then remove the fields from the aggregate, both commands, the mapper, the read repository, the projection and the GraphQL input.

- [ ] **Step 4: Generate the migration, read it, run the tests**

Run:
```bash
cd packages/backend && bun run db:ntizo:generate && bun test src
```
Expected: a migration containing exactly two `DROP COLUMN`s and two `DROP CONSTRAINT`s and nothing else. **Read it before applying** — a generated `DROP` that touches any other table is a stop-and-report.

- [ ] **Step 5: Apply to dev and commit**

```bash
cd packages/backend && bun run db:ntizo:dev:migrate
git add packages/backend/src/modules/ntizo/
git commit -m "feat(catalog): a service no longer carries a buffer or a slot grid"
```

---

### Task 11: The availability page previews the slots

The last piece: the provider sees the answer while deciding. The week grid already draws the *window*; it gains the starts that window produces, and a count.

Because duration lives on the service option, the preview needs a service to be exact — so it offers a picker, defaulting to the provider's first published service, and falls back to saying the grid marks alone when there is none.

**Files:**
- Create: `apps/frontend/web/src/features/provider/availability/domain/slot-preview.ts`
- Create: `apps/frontend/web/src/features/provider/availability/domain/__tests__/slot-preview.test.ts`
- Modify: `apps/frontend/web/src/features/provider/availability/ui/week-preview.tsx`
- Modify: `apps/frontend/web/src/features/provider/availability/ui/availability-page.tsx`
- Modify: `apps/frontend/web/src/shared/locales/*/provider.json` (8 files)
- Test: `apps/frontend/web/src/features/provider/availability/ui/__tests__/week-preview.test.tsx`

**Interfaces:**
- Consumes: `startsForDay` (Tasks 3/4), `WeeklyRuleDraft` with its shape (Task 8).
- Produces: `previewSlots(input): { byDate: Record<string, number[]>; totalSlots: number; totalSeats: number }`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "vitest";
import { previewSlots } from "../slot-preview";

const rule = (weekday: number, over = {}) => ({
  weekday,
  startMinute: 540,
  endMinute: 1080,
  bufferMinutes: null,
  slotIntervalMinutes: null,
  capacity: null,
  ...over,
});

describe("previewSlots", () => {
  test("counts the slots a week produces", () => {
    // 09:00–18:00, 90-minute service, 15-minute buffer → 09:00, 10:45,
    // 12:30, 14:15, 16:00. Five a day, one weekday.
    const preview = previewSlots({
      dates: ["2026-08-10"],
      rules: [rule(1, { bufferMinutes: 15 })],
      exceptions: [],
      closures: [],
      durationMinutes: 90,
    });
    expect(preview.byDate["2026-08-10"]).toEqual([540, 645, 750, 855, 960]);
    expect(preview.totalSlots).toBe(5);
  });

  test("counts seats, not only slots", () => {
    const preview = previewSlots({
      dates: ["2026-08-10"],
      rules: [rule(1, { bufferMinutes: 15, capacity: 390 })],
      exceptions: [],
      closures: [],
      durationMinutes: 90,
    });
    expect(preview.totalSeats).toBe(5 * 390);
  });

  test("a rule with no grid produces no slots but is not an error", () => {
    const preview = previewSlots({
      dates: ["2026-08-10"],
      rules: [rule(1, { slotIntervalMinutes: 0 })],
      exceptions: [],
      closures: [],
      durationMinutes: 90,
    });
    expect(preview.totalSlots).toBe(0);
    expect(preview.byDate["2026-08-10"]).toEqual([]);
  });

  test("a closed day contributes nothing", () => {
    const preview = previewSlots({
      dates: ["2026-08-10"],
      rules: [rule(1)],
      exceptions: [],
      closures: [{ fromDate: "2026-08-10", toDate: "2026-08-10" }],
      durationMinutes: 30,
    });
    expect(preview.totalSlots).toBe(0);
  });
});
```

The first test's numbers are the reference screen's own: `09:00-10:30, 10:45-12:15, 12:30-14:00, 14:15-15:45, 16:00-17:30` — five slots, and at 390 seats each, 1950 for one day.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend/web && npx vitest run src/features/provider/availability/domain/__tests__/slot-preview.test.ts`
Expected: FAIL — `Cannot find module '../slot-preview'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { startsForDay, type DayRule } from "@ntizo/shared/scheduling";
import { weekdayOf } from "@ntizo/shared/datetime";

/**
 * What the rules on screen would actually offer, computed in the browser by
 * the same function that answers a customer.
 *
 * There is no forecast here and no second implementation to drift: the
 * provider is looking at the product.
 */
export interface SlotPreview {
  readonly byDate: Readonly<Record<string, number[]>>;
  readonly totalSlots: number;
  readonly totalSeats: number;
}

export function previewSlots(input: {
  readonly dates: readonly string[];
  readonly rules: readonly (DayRule & { weekday: number })[];
  readonly exceptions: readonly { onDate: string; kind: "closed" | "custom"; startMinute: number | null; endMinute: number | null }[];
  readonly closures: readonly { fromDate: string; toDate: string }[];
  readonly durationMinutes: number;
}): SlotPreview {
  const byDate: Record<string, number[]> = {};
  let totalSlots = 0;
  let totalSeats = 0;

  for (const date of input.dates) {
    const starts = startsForDay({
      houseClosed: input.closures.some((c) => c.fromDate <= date && date <= c.toDate),
      exceptions: input.exceptions
        .filter((e) => e.onDate === date)
        .map((e) => ({ kind: e.kind, start: e.startMinute, end: e.endMinute })),
      rules: input.rules.filter((r) => r.weekday === weekdayOf(date)),
      busy: [],
      durationMinutes: input.durationMinutes,
    });

    const minutes = [...starts.keys()].sort((a, b) => a - b);
    byDate[date] = minutes;
    totalSlots += minutes.length;
    for (const seats of starts.values()) totalSeats += seats;
  }

  return { byDate, totalSlots, totalSeats };
}
```

Then in `week-preview.tsx`, draw each previewed start as a block inside its day column, and in `availability-page.tsx` add above the grid:

```tsx
        <p className="type-caption text-[var(--color-muted-foreground)]">
          {t("availabilityPreviewCount", { slots: preview.totalSlots, seats: preview.totalSeats })}
        </p>
```

with the service picker beside it, defaulting to the first published service and rendering nothing when there is none.

New keys (`en-US` / `pt-PT` shown; the other six as in Task 8):

```json
"availabilityPreviewCount": "{{slots}} slots · {{seats}} places",
"availabilityPreviewFor": "Preview for",
"availabilityPreviewNoService": "Publish a service to preview its slots."
```

```json
"availabilityPreviewCount": "{{slots}} slots · {{seats}} lugares",
"availabilityPreviewFor": "Prever para",
"availabilityPreviewNoService": "Publique um serviço para pré-visualizar os seus slots."
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend/web && npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/features/provider/availability/ apps/frontend/web/src/shared/locales/
git commit -m "feat(availability): preview the slots the rules produce"
```

---

## Self-Review

**Spec coverage.** Every section maps to a task: the three nullable columns → Task 5; the three-state grid → Tasks 1, 2, 5, 8; capacity defaulting to 1 → Tasks 2, 4; per-rule generation and the merge trap → Task 3; capacity counting rather than vetoing → Task 4; the two service columns dropped → Task 10; the wizard's six steps and `CREATES_SERVICE` moving → Task 9; the drawer's three fields → Task 8; the live preview and its service picker → Task 11; the migration order's four deploy points → Tasks 5, 7, 8–9, 10 in that sequence.

**Deliberately deferred, and stated in the spec as out of scope:** provider-level defaults above the rule, a persisted slot table, `seasonStart`/`seasonEnd`, and the booking flow's own concurrency check. What a customer can *do* inside a `grid = 0` window is a booking-flow question and is named as out of scope in Task 3's implementation comment.

**Type consistency.** `resolveRuleShape` → `ResolvedRuleShape { bufferMinutes, gridMinutes, capacity, offersSlots }` is produced in Task 2 and consumed under those exact names in Tasks 3, 4 and 11. `startsForDay` is introduced in Task 3 returning `Map<number, number>` and Task 4 changes that map's *meaning* (capacity → seats left) while keeping the signature — Task 4's Interfaces block says so explicitly, and Tasks 7 and 11 consume the post-Task-4 meaning. `DayRule` carries `startMinute`/`endMinute` (the database's names), never `start`/`end` (the engine's) — the rename happens once, inside `startsForDay`, which is the same discipline `toDayExceptions` already follows in the projection.

**Boundary arithmetic, checked rather than assumed.** A 09:00 start of a 30-minute service with a 15-minute buffer occupies minutes 540–585. `overlapCount` is half-open (`b.start < to && from < b.end`), so a booking at 570–585 collides and one at 585–600 does not. Task 4 asserts both directions, because an off-by-one here either hides a real collision or invents one, and only the pair of tests distinguishes the two.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-13-slot-generation-in-availability.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.
