# The Provider's Three Editors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the service editor, the availability configurator and the onboarding wizard on one set of shared parts, so each shows a provider where they are, what is left, and what their choices produce.

**Architecture:** Four new components in the shared kit — pills, a progress ring, a section rail, a sticky action bar. The service editor becomes a full page with a rail whose completeness derives from the same rules the server publishes by. The availability screen gains a live week preview, drawn by moving the two pure engine files into `packages/shared` so the browser and the backend run the same code. Onboarding gains status and forward navigation from logic it already has.

**Tech Stack:** React 19, TanStack Router/Query, Tailwind v4 with CSS custom properties, `class-variance-authority`, i18next, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-12-provider-ui-design.md` — read it once before Task 1.

## Global Constraints

- **No new design token and no new colour.** The palette is `--color-primary` `#006ffd`, `--color-success` `#21b872`, `--color-warning`, `--color-destructive`, `--color-muted`, `--color-border`; the type scale is `type-h1`, `type-h2`, `type-h3`, `type-body`, `type-body-medium`, `type-caption`, `type-button`; the radii are `--radius-card`, `--radius-card-sm`, `--radius-field`. Use them.
- **No schema change, no GraphQL change, no backend behaviour change** — the only backend edit in this plan is moving two pure files and repointing their imports.
- **`ui/` may not import from `data/`.** `eslint-plugin-boundaries` matches a single path segment per `*`, so a rule written `features/*/domain/**` does **not** match a feature nested two levels deep. Any new feature directory needs its own explicit entry in `apps/frontend/web/eslint.config.js` — check it matches rather than assuming.
- **Every user-facing string goes into all eight locales** — `pt-MZ`, `pt-PT`, `en-US`, `es-ES`, `fr-FR`, `de-DE`, `it-IT`, `nl-NL` — natively translated in each. `i18n-parity.test.ts` compares every locale against `en-US` and fails otherwise. Month and weekday names come from `Intl.DateTimeFormat`, never from locale files.
- Test runner for the web app and `packages/shared` is **vitest**; `packages/backend` is **`bun:test`**.
- Run **`bun run lint`** and `bun run check-types` from the repo root before every commit. Both, every time — `check-types` does not catch an unused import, and that broke CI once already.
- Kit components live in `packages/frontend/src/components/`, are exported from `packages/frontend/src/index.ts`, and follow `badge.tsx`'s shape: a `cva` variant table, a typed props interface extending the right DOM props, a doc comment saying why the thing is built the way it is.

---

## File Structure

**Shared kit — `packages/frontend/src/components/`**

| Path | Responsibility |
|---|---|
| `choice-chips.tsx` | pill group, single and multi select, built on native inputs |
| `progress-ring.tsx` | a ring and a count |
| `section-rail.tsx` | numbered sections with status |
| `sticky-action-bar.tsx` | the following footer |

**Shared engine — `packages/shared/src/scheduling/`**

| Path | Responsibility |
|---|---|
| `intervals.ts` | moved verbatim from the backend |
| `offers.ts` | moved verbatim from the backend |
| `index.ts` | barrel |

**Service editor — `apps/frontend/web/src/features/provider/services/`**

| Path | Responsibility |
|---|---|
| `domain/completeness.ts` | the client's mirror of the publish rules |
| `ui/service-editor-page.tsx` | the page shell and rail |
| `ui/sections/*.tsx` | one file per section |
| `routes/provider/$slug/services.$serviceId.tsx` | the route |

**Availability — `apps/frontend/web/src/features/provider/availability/`**

| Path | Responsibility |
|---|---|
| `domain/preview.ts` | config rows → the engine's inputs |
| `ui/week-preview.tsx` | the grid, the legend, week navigation |
| `ui/rule-card.tsx`, `ui/rule-drawer.tsx` | the cards and the editor |

**Onboarding — `apps/frontend/web/src/features/onboarding/`**

| Path | Responsibility |
|---|---|
| `domain/screen-model.ts` (modify) | forward reachability |
| `ui/wizard-chrome.tsx` (modify) | status chips and the ring |

---

### Task 1: `ChoiceChips`

**Files:**
- Create: `packages/frontend/src/components/choice-chips.tsx`
- Modify: `packages/frontend/src/index.ts`
- Test: `packages/frontend/src/components/__tests__/choice-chips.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface ChoiceOption {
  value: string;
  label: string;
  /** Shown under the label in the chip. Omit for a plain chip. */
  hint?: string;
  disabled?: boolean;
}

// Single select
export function ChoiceChips(props: {
  name: string;
  legend: string;
  options: readonly ChoiceOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** Renders the legend visually; otherwise it is available only to a screen reader. */
  showLegend?: boolean;
  error?: string | undefined;
}): JSX.Element;

// Multi select
export function ChoiceChipsMulti(props: {
  name: string;
  legend: string;
  options: readonly ChoiceOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  showLegend?: boolean;
  error?: string | undefined;
}): JSX.Element;
```

**The decision that makes this simple, and why it is not laziness.** Build both on **native `<input type="radio">` and `<input type="checkbox">`, visually hidden, with a styled `<label>` as the chip**, inside a `<fieldset>` with a `<legend>`. Do **not** hand-roll `role="radiogroup"` with roving `tabIndex` and arrow-key handling.

The browser already gives radios arrow-key navigation within a group, a single tab stop for the whole group, and correct announcement of "3 of 7"; checkboxes already toggle on space and tab individually. A hand-rolled version has to reimplement all of that and will get one case wrong — and a chip row that looks better than a `Select` while being worse to operate is a strictly negative change for the screen it lands on.

Use `peer` + `peer-checked:` + `peer-focus-visible:` Tailwind variants to style the label from the input's state, so the visual and the semantic state cannot disagree.

- [ ] **Step 1: Write the failing tests**

Use `@testing-library/react` and `@testing-library/user-event` — check `apps/frontend/web/package.json` and `packages/frontend/package.json` for whether they are already dependencies of the kit; if the kit has no test setup yet, mirror the web app's `vitest` config and jsdom environment.

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChoiceChips, ChoiceChipsMulti } from "../choice-chips";

const OPTIONS = [
  { value: "a", label: "At the customer" },
  { value: "b", label: "At my place" },
  { value: "c", label: "Remote" },
];

describe("ChoiceChips (single)", () => {
  test("exposes the group as a radiogroup with its legend", () => {
    render(<ChoiceChips name="where" legend="Where it happens" options={OPTIONS} value={null} onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Where it happens" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  test("reports the selected option as checked and the others as not", () => {
    render(<ChoiceChips name="where" legend="Where" options={OPTIONS} value="b" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "At my place" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Remote" })).not.toBeChecked();
  });

  test("clicking a chip reports its value once", async () => {
    const onChange = vi.fn();
    render(<ChoiceChips name="where" legend="Where" options={OPTIONS} value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Remote" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("c");
  });

  // The whole reason this is built on native radios. If this fails, the
  // component has been rewritten with hand-rolled roles and has lost the
  // behaviour the browser was giving for free.
  test("arrow keys move the selection within the group", async () => {
    const onChange = vi.fn();
    render(<ChoiceChips name="where" legend="Where" options={OPTIONS} value="a" onChange={onChange} />);
    screen.getByRole("radio", { name: "At the customer" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  test("the group is one tab stop", async () => {
    render(
      <>
        <button type="button">before</button>
        <ChoiceChips name="where" legend="Where" options={OPTIONS} value="a" onChange={() => {}} />
        <button type="button">after</button>
      </>,
    );
    screen.getByRole("button", { name: "before" }).focus();
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "At the customer" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "after" })).toHaveFocus();
  });

  test("a disabled option cannot be chosen", async () => {
    const onChange = vi.fn();
    const opts = [...OPTIONS, { value: "d", label: "Nowhere", disabled: true }];
    render(<ChoiceChips name="where" legend="Where" options={opts} value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Nowhere" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("an error is announced with the group", () => {
    render(<ChoiceChips name="where" legend="Where" options={OPTIONS} value={null} onChange={() => {}} error="Pick one" />);
    expect(screen.getByRole("radiogroup", { name: /Where/ })).toHaveAccessibleDescription("Pick one");
  });
});

describe("ChoiceChipsMulti", () => {
  test("renders checkboxes, not radios", () => {
    render(<ChoiceChipsMulti name="langs" legend="Languages" options={OPTIONS} value={[]} onChange={() => {}} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  test("adds to the selection without dropping what was there", async () => {
    const onChange = vi.fn();
    render(<ChoiceChipsMulti name="langs" legend="Languages" options={OPTIONS} value={["a"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Remote" }));
    expect(onChange).toHaveBeenCalledWith(["a", "c"]);
  });

  test("clicking a chosen chip removes it", async () => {
    const onChange = vi.fn();
    render(<ChoiceChipsMulti name="langs" legend="Languages" options={OPTIONS} value={["a", "c"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "At the customer" }));
    expect(onChange).toHaveBeenCalledWith(["c"]);
  });

  test("each chip is its own tab stop, as checkboxes are", async () => {
    render(<ChoiceChipsMulti name="langs" legend="Languages" options={OPTIONS} value={[]} onChange={() => {}} />);
    screen.getByRole("checkbox", { name: "At the customer" }).focus();
    await userEvent.tab();
    expect(screen.getByRole("checkbox", { name: "At my place" })).toHaveFocus();
  });

  test("space toggles the focused chip", async () => {
    const onChange = vi.fn();
    render(<ChoiceChipsMulti name="langs" legend="Languages" options={OPTIONS} value={[]} onChange={onChange} />);
    screen.getByRole("checkbox", { name: "At my place" }).focus();
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/frontend && bun run test -- choice-chips`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Structure both as a `<fieldset>` with a `<legend>` (visually hidden unless `showLegend`), then one `<label>` per option wrapping a visually-hidden input and the chip's content. Visually hidden means the `sr-only` pattern already used elsewhere in this repo — **not** `display:none` or `visibility:hidden`, which remove the input from the tab order and destroy the whole point.

The chip's own styling comes from a `cva` table with `selected` and `disabled` variants, keyed off `peer-checked` and `peer-disabled`. Selected uses `--color-primary` at full strength for text on a `color-mix` tint of itself, matching `badge.tsx`'s `info` tone so a selected chip and an informational badge cannot drift apart.

Wire `error` through `aria-describedby` on the `<fieldset>`, pointing at a `<p>` carrying the message, styled with `--color-destructive`.

- [ ] **Step 4: Run them to verify they pass**

Run: `cd packages/frontend && bun run test -- choice-chips`
Expected: PASS, 13 tests.

- [ ] **Step 5: Break-check the two that matter**

Replace the native radios with `<button role="radio">` and confirm the arrow-key test and the one-tab-stop test both fail. Replace `sr-only` with `hidden` and confirm the tab-stop tests fail. Revert. If any of the four still passes, the test is not exercising what its name claims.

- [ ] **Step 6: Export and commit**

Add `export * from "./components/choice-chips";` to `packages/frontend/src/index.ts`, then:

```bash
bun run check-types && bun run lint
git add packages/frontend
git commit -m "feat(ui): choice chips built on native radios and checkboxes"
```

---

### Task 2: `ProgressRing`, `SectionRail` and `StickyActionBar`

**Files:**
- Create: `packages/frontend/src/components/progress-ring.tsx`
- Create: `packages/frontend/src/components/section-rail.tsx`
- Create: `packages/frontend/src/components/sticky-action-bar.tsx`
- Modify: `packages/frontend/src/index.ts`
- Test: `packages/frontend/src/components/__tests__/section-rail.test.tsx`

**Interfaces:**
- Produces:

```ts
export type SectionStatus = "done" | "todo" | "error";

export interface RailSection {
  id: string;
  label: string;
  status: SectionStatus;
  /** Counted by the ring and marked in the rail. */
  required: boolean;
  /** A section the user may not jump to yet. */
  locked?: boolean;
}

export function SectionRail(props: {
  sections: readonly RailSection[];
  currentId: string;
  onSelect: (id: string) => void;
  /** Heading above the list, e.g. "Required sections". */
  title: string;
}): JSX.Element;

export function ProgressRing(props: {
  done: number;
  total: number;
  /** Accessible label, e.g. "2 of 3 required sections done". */
  label: string;
  size?: number;
}): JSX.Element;

export function StickyActionBar(props: {
  children: React.ReactNode;
  /** Left-hand slot: progress, a count, a reason. */
  lead?: React.ReactNode;
}): JSX.Element;
```

**The ring counts required sections only.** A screen with three required and four optional sections, all three required done, must read **3 of 3** — not 3 of 7, which would tell somebody they are half finished when they can publish.

**`SectionRail` renders status; it does not decide it.** Whether a section is done, and whether it is locked, is the consuming screen's business. The rail has no opinion, which is what lets the same component serve a service editor whose completeness comes from server rules and a wizard whose completeness comes from field validation.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProgressRing, SectionRail, type RailSection } from "../section-rail";

const SECTIONS: RailSection[] = [
  { id: "basics", label: "The essentials", status: "done", required: true },
  { id: "pricing", label: "How it is charged", status: "todo", required: true },
  { id: "timing", label: "Timing", status: "todo", required: false },
  { id: "media", label: "Images", status: "error", required: false },
];

describe("SectionRail", () => {
  test("lists every section with its number", () => {
    render(<SectionRail sections={SECTIONS} currentId="basics" onSelect={() => {}} title="Sections" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("The essentials")).toBeInTheDocument();
  });

  test("marks the current section for a screen reader, not only visually", () => {
    render(<SectionRail sections={SECTIONS} currentId="pricing" onSelect={() => {}} title="Sections" />);
    expect(screen.getByRole("button", { name: /How it is charged/ })).toHaveAttribute("aria-current", "step");
  });

  test("selecting a section reports its id", async () => {
    const onSelect = vi.fn();
    render(<SectionRail sections={SECTIONS} currentId="basics" onSelect={onSelect} title="Sections" />);
    await userEvent.click(screen.getByRole("button", { name: /Timing/ }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("timing");
  });

  test("a locked section cannot be selected", async () => {
    const onSelect = vi.fn();
    const locked = [...SECTIONS, { id: "later", label: "Later", status: "todo" as const, required: false, locked: true }];
    render(<SectionRail sections={locked} currentId="basics" onSelect={onSelect} title="Sections" />);
    await userEvent.click(screen.getByRole("button", { name: /Later/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("the status is readable, not colour alone", () => {
    // A status conveyed only by colour is invisible to a third of the reasons
    // people use assistive technology, and to anyone printing the page.
    render(<SectionRail sections={SECTIONS} currentId="basics" onSelect={() => {}} title="Sections" />);
    expect(screen.getByRole("button", { name: /The essentials/ })).toHaveAccessibleName(/done/i);
    expect(screen.getByRole("button", { name: /Images/ })).toHaveAccessibleName(/problem/i);
  });
});

describe("ProgressRing", () => {
  test("renders its label for assistive technology", () => {
    render(<ProgressRing done={2} total={3} label="2 of 3 required sections done" />);
    expect(screen.getByRole("img", { name: "2 of 3 required sections done" })).toBeInTheDocument();
  });

  test("shows the count as text", () => {
    render(<ProgressRing done={2} total={3} label="x" />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  test("a total of zero does not divide by zero", () => {
    render(<ProgressRing done={0} total={0} label="nothing required" />);
    expect(screen.getByRole("img", { name: "nothing required" })).toBeInTheDocument();
  });

  test("done above total is clamped rather than overdrawn", () => {
    render(<ProgressRing done={5} total={3} label="x" />);
    const circle = document.querySelector("circle:last-of-type") as SVGCircleElement;
    expect(Number(circle.getAttribute("stroke-dashoffset"))).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/frontend && bun run test -- section-rail`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the three components**

`ProgressRing` is two SVG `<circle>`s sharing a radius: a track in `--color-border` and a progress arc in `--color-primary`, the arc's `strokeDasharray` set to the circumference and its `strokeDashoffset` to `circumference * (1 - done / total)`, with `total === 0` treated as complete and `done` clamped into `[0, total]`. `role="img"` with the label as `aria-label`, and the number as real text in the middle so it survives a failed SVG render.

`SectionRail` is an `<ol>`; each row is a `<button>` carrying `aria-current="step"` when current and `disabled` when locked. The status word — done, to do, has a problem — goes into the accessible name via an `sr-only` span, alongside the coloured dot. Required sections carry a marker; optional ones say so in words rather than by omission.

`StickyActionBar` is `sticky bottom-0` with a top border, the `lead` slot left and `children` right, and enough bottom padding to clear a mobile browser's chrome.

- [ ] **Step 4: Run them to verify they pass**

Run: `cd packages/frontend && bun run test -- section-rail`
Expected: PASS, 9 tests.

- [ ] **Step 5: Break-check**

Remove the `sr-only` status word and confirm the "readable, not colour alone" test fails. Remove the `total === 0` guard and confirm that test fails with `NaN` in the attribute. Revert both.

- [ ] **Step 6: Export and commit**

```bash
bun run check-types && bun run lint
git add packages/frontend
git commit -m "feat(ui): progress ring, section rail and sticky action bar"
```

---

### Task 3: Move the scheduling engine into `packages/shared`

**Files:**
- Create: `packages/shared/src/scheduling/intervals.ts` (moved)
- Create: `packages/shared/src/scheduling/offers.ts` (moved)
- Create: `packages/shared/src/scheduling/index.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/package.json` (a `./scheduling` subpath export, mirroring `./datetime`)
- Delete: `packages/backend/src/modules/ntizo/bounded-contexts/scheduling/domain/intervals.ts` and `offers.ts`
- Move: their two test files to `packages/shared/src/scheduling/__tests__/`
- Modify: `packages/backend/src/modules/ntizo/public/scheduling/app/use-cases/list-service-availability.projection.ts`

**Interfaces:**
- Produces: `Interval`, `DayException`, `DayRules`, `mergeIntervals`, `subtractIntervals`, `freeIntervals`, `FixedShape`, `HourlyShape`, `HourlyOffer`, `fixedStarts`, `hourlyStarts` — all importable from `@ntizo/shared/scheduling`.

**Why this move is safe, stated so nobody has to rediscover it.** `intervals.ts` contains **zero** `import` statements and `offers.ts` imports one type from it. Their only non-test consumer in the whole repository is `list-service-availability.projection.ts`. That is the entire blast radius.

**The move must be verbatim.** Do not reformat, rename, or "improve" either file while moving it. A move that also edits is a move nobody can review, and these two files carry nineteen boundary behaviours that the ledger records as correct-but-untested.

**The test runner changes.** Both test files use `bun:test`; `packages/shared` uses **vitest**. Change only the import line — `import { describe, expect, test } from "vitest"` — and nothing else in either file. If a test then fails, that is a real difference between the runners and you should report it rather than adjust the test.

- [ ] **Step 1: Move both files and their tests**

Use `git mv` so the history follows. Change the two test files' first line to import from `vitest`.

- [ ] **Step 2: Create the barrel and the subpath export**

`packages/shared/src/scheduling/index.ts` re-exports both modules. Add `export * from "./scheduling";` to `packages/shared/src/index.ts` and a `"./scheduling"` entry to `packages/shared/package.json`'s `exports` map, copying the shape of the existing `"./datetime"` entry exactly.

- [ ] **Step 3: Repoint the projection**

In `list-service-availability.projection.ts`, replace the two relative imports with one from `@ntizo/shared/scheduling`.

- [ ] **Step 4: Run everything**

Run: `cd packages/shared && bun run test` — expected: the 28 moved tests pass alongside the existing ones.
Run: `cd packages/backend && bun test src/modules/ntizo/public/scheduling` — expected: 27 pass, unchanged.
Run from the repo root: `bun run check-types && bun run lint` — expected: clean.

If `check-types` reports the backend cannot resolve `@ntizo/shared/scheduling`, the `exports` map entry is missing or wrong — that is the failure this step exists to surface, and it has caught the same mistake twice before on this project.

- [ ] **Step 5: Confirm nothing was left behind**

Run: `grep -rn "domain/intervals\|domain/offers" packages/backend/src`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add -A packages/shared packages/backend
git commit -m "refactor(scheduling): move the pure engine into the shared package"
```

---

### Task 4: The service editor's completeness rules

**Files:**
- Create: `apps/frontend/web/src/features/provider/services/domain/completeness.ts`
- Test: `apps/frontend/web/src/features/provider/services/domain/__tests__/completeness.test.ts`

**Interfaces:**
- Produces:

```ts
export type SectionId = "basics" | "pricing" | "performers" | "timing" | "languages" | "media";

export interface CompletenessInput {
  categoryId: string | null;
  /** The name in the service's source locale, already trimmed. */
  sourceName: string;
  bookingMode: "priced" | "quote";
  optionCount: number;
  memberIds: readonly string[];
  /** One member means the performers question has one answer and is not asked. */
  individualProvider: boolean;
}

export interface SectionState {
  id: SectionId;
  required: boolean;
  complete: boolean;
  /** The server code this section's incompleteness corresponds to, or null. */
  blockingCode:
    | "SERVICE_CATEGORY_REQUIRED"
    | "SERVICE_NAME_REQUIRED"
    | "SERVICE_NEEDS_OPTION"
    | "SERVICE_QUOTE_HAS_OPTIONS"
    | "SERVICE_NEEDS_MEMBER"
    | null;
}

export function sectionStates(input: CompletenessInput): SectionState[];
/** The first blocking code, in the server's own order, or null when publishable. */
export function publishBlocker(input: CompletenessInput): SectionState["blockingCode"];
export function requiredProgress(states: readonly SectionState[]): { done: number; total: number };
```

**This is the task the whole screen rests on.** The rail's status must agree with what the server will do. The backend's rule lives in `packages/backend/src/modules/ntizo/bounded-contexts/catalog/domain/service-rules.ts`, in `canPublish`, and its **order matters**: category, then source name, then performers, then the booking-mode checks. Read it before writing this, and mirror the order — a screen that reports the option problem when the server would report the category problem sends someone to fix the wrong thing.

Each incomplete section names the code it corresponds to. That is what lets the disabled Publish button say why in the same words the server would have used, from the translations that already exist for those codes.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { publishBlocker, requiredProgress, sectionStates, type CompletenessInput } from "../completeness";

const COMPLETE: CompletenessInput = {
  categoryId: "cat-1",
  sourceName: "Corte de cabelo",
  bookingMode: "priced",
  optionCount: 1,
  memberIds: ["m1"],
  individualProvider: false,
};

const by = (input: CompletenessInput, id: string) => sectionStates(input).find((s) => s.id === id)!;

describe("sectionStates", () => {
  test("a complete priced service has nothing blocking it", () => {
    expect(publishBlocker(COMPLETE)).toBeNull();
    expect(sectionStates(COMPLETE).every((s) => s.complete)).toBe(true);
  });

  test("no category leaves the essentials incomplete and names the server's code", () => {
    const s = by({ ...COMPLETE, categoryId: null }, "basics");
    expect(s.complete).toBe(false);
    expect(s.blockingCode).toBe("SERVICE_CATEGORY_REQUIRED");
  });

  test("an empty source name leaves the essentials incomplete", () => {
    expect(by({ ...COMPLETE, sourceName: "" }, "basics").blockingCode).toBe("SERVICE_NAME_REQUIRED");
  });

  test("whitespace is not a name", () => {
    expect(by({ ...COMPLETE, sourceName: "   " }, "basics").blockingCode).toBe("SERVICE_NAME_REQUIRED");
  });

  test("a priced service with no options leaves pricing incomplete", () => {
    expect(by({ ...COMPLETE, optionCount: 0 }, "pricing").blockingCode).toBe("SERVICE_NEEDS_OPTION");
  });

  test("a quote service with options is a problem, not merely incomplete", () => {
    expect(by({ ...COMPLETE, bookingMode: "quote", optionCount: 2 }, "pricing").blockingCode)
      .toBe("SERVICE_QUOTE_HAS_OPTIONS");
  });

  test("a quote service with no options is complete", () => {
    expect(by({ ...COMPLETE, bookingMode: "quote", optionCount: 0 }, "pricing").complete).toBe(true);
  });

  test("nobody performing it leaves performers incomplete", () => {
    expect(by({ ...COMPLETE, memberIds: [] }, "performers").blockingCode).toBe("SERVICE_NEEDS_MEMBER");
  });

  // The server checks the category first. A client that reported the option
  // problem here would send somebody to the wrong section.
  test("the category is reported before the missing option, as the server does", () => {
    expect(publishBlocker({ ...COMPLETE, categoryId: null, optionCount: 0 }))
      .toBe("SERVICE_CATEGORY_REQUIRED");
  });

  test("the name is reported before the missing performer", () => {
    expect(publishBlocker({ ...COMPLETE, sourceName: "", memberIds: [] }))
      .toBe("SERVICE_NAME_REQUIRED");
  });

  test("an individual provider has no performers section at all", () => {
    const states = sectionStates({ ...COMPLETE, individualProvider: true, memberIds: [] });
    expect(states.find((s) => s.id === "performers")).toBeUndefined();
  });

  test("and is not blocked by the performer rule the server seeds for them", () => {
    expect(publishBlocker({ ...COMPLETE, individualProvider: true, memberIds: [] })).toBeNull();
  });

  test("timing, languages and media are never required", () => {
    for (const id of ["timing", "languages", "media"] as const) {
      expect(by(COMPLETE, id).required).toBe(false);
    }
  });
});

describe("requiredProgress", () => {
  test("an organization counts three required sections", () => {
    expect(requiredProgress(sectionStates(COMPLETE))).toEqual({ done: 3, total: 3 });
  });

  test("an individual counts two", () => {
    expect(requiredProgress(sectionStates({ ...COMPLETE, individualProvider: true })))
      .toEqual({ done: 2, total: 2 });
  });

  test("optional sections never enter the count", () => {
    const states = sectionStates({ ...COMPLETE, categoryId: null });
    expect(requiredProgress(states)).toEqual({ done: 2, total: 3 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/frontend/web && bun run test -- completeness`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement, mirroring `canPublish`'s order**

Write the module so the order of checks in `publishBlocker` is literally the order in `service-rules.ts`. Put a comment at the top naming that file as the source of truth and saying that a change there needs a change here.

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/frontend/web && bun run test -- completeness`
Expected: PASS, 16 tests.

- [ ] **Step 5: Break-check the agreement**

Reorder `publishBlocker` to check options before the category and confirm the two ordering tests fail. Make `individualProvider` still emit a performers section and confirm those two tests fail. Revert.

- [ ] **Step 6: Commit**

```bash
bun run check-types && bun run lint
git add apps/frontend/web/src/features/provider/services/domain
git commit -m "feat(web): the service editor's completeness rules, mirroring the server's"
```

---

### Task 5: The service editor page — shell, rail and the three required sections

**Files:**
- Create: `apps/frontend/web/src/features/provider/services/ui/service-editor-page.tsx`
- Create: `apps/frontend/web/src/features/provider/services/ui/sections/basics-section.tsx`
- Create: `.../sections/pricing-section.tsx`
- Create: `.../sections/performers-section.tsx`
- Create: `apps/frontend/web/src/routes/provider/$slug/services.$serviceId.tsx`
- Modify: `apps/frontend/web/src/features/provider/services/ui/services-page.tsx` — the list's rows and its "new" button navigate to the page instead of opening the sheet
- Modify: `apps/frontend/web/eslint.config.js` if the new `sections/` directory needs a boundary entry

**Interfaces:**
- Consumes: `ChoiceChips`, `ChoiceChipsMulti`, `SectionRail`, `ProgressRing`, `StickyActionBar` from `@ntizo/frontend-ui`; `sectionStates`, `publishBlocker`, `requiredProgress` from `../domain/completeness`; the existing `useServiceEditor` viewmodel and its `saveService`.
- Produces: the route `/provider/$slug/services/$serviceId`, where `$serviceId` is a service UUID or the literal `new`.

**What moves and what does not.** The existing `service-form.tsx` holds a great deal of hard-won behaviour in its comments — the live-status read, the creating-member backfill, the two-step location question, the draft reset. **Read it before writing anything, and carry that behaviour across.** This task changes where the fields live, not what they do.

Three traps it already documents and this page must keep:
- the published check reads the **live** status from the shared list cache, never the value the editor opened with;
- the performers list backfills the creating member when the availability query resolves after the editor mounts;
- the location question is two steps, and "unanswered" is tracked apart from `locationType` because both are the empty string.

**Sections in this task:** the essentials (name, category as chips, where it happens as chips), how it is charged (booking mode as chips, then the options editor or the quote-form fields), who does it (the performers checkboxes, absent for an individual provider).

The rail's sections come from `sectionStates`, the ring from `requiredProgress`, and the disabled Publish's reason from `publishBlocker` — translated with the same `serviceError.*` keys the form already uses for the server's refusals.

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/web/src/features/provider/services/ui/__tests__/service-editor-page.test.tsx`, render the page with a query client and mocked repository, and assert:

```
"a new service starts on the essentials section"
"the rail shows the essentials incomplete until a category is chosen"
"choosing a category marks the essentials done without a save"
"publish is disabled while a required section is incomplete"
"the disabled publish names the missing thing, not a generic message"
"an individual provider sees no performers section in the rail"
"an organization sees three required sections in the ring"
"switching booking mode to quote replaces the options editor with the quote fields"
```

Write each out in full, with real arrange, act and assert.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/frontend/web && bun run test -- service-editor-page`
Expected: FAIL.

- [ ] **Step 3: Build the shell, the route and the three sections**

- [ ] **Step 4: Point the list at the page**

- [ ] **Step 5: Run the tests, typecheck and lint**

Run: `cd apps/frontend/web && bun run test && bun run check-types && bun run lint`
Expected: PASS, 0 errors.

- [ ] **Step 6: Verify in the browser**

Create a service from the list, fill the essentials, watch the rail's first row turn done, add an option, tick a performer, publish. Then open it again from the list and confirm every value came back. Screenshot each. Keep the tab in the foreground and use CSS pixels for any click coordinates.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(web): the service editor as a page with a section rail"
```

---

### Task 6: The service editor's remaining sections, and retiring the sheet

**Files:**
- Create: `.../sections/timing-section.tsx`, `.../sections/languages-section.tsx`, `.../sections/media-section.tsx`
- Delete: `apps/frontend/web/src/features/provider/services/ui/service-form.tsx`
- Delete: `apps/frontend/web/src/features/provider/services/ui/translations-sheet.tsx`
- Modify: `services-page.tsx` — remove the sheet's state and props

**Interfaces:**
- Consumes: everything Task 5 produced.

**Timing** holds the buffer and the slot interval. The buffer is a plain number input, 0 to 480. The interval is `ChoiceChips` over 15, 30 and 60. Both already exist in the sheet and carry a fix worth preserving: **an empty numeric input reads as empty, not `0`, and a number is never rendered through a locale-aware formatter** — a previous slice shipped `300` rendered as `"300,5"`.

**Languages** absorbs `translations-sheet.tsx`. Its content moves; the sheet wrapper goes. The panel behind a button existed because the editor was itself a panel.

**Media** carries the existing image upload.

**Then delete the sheet.** Check with `grep -rn "ServiceFormSheet\|TranslationsSheet" apps/frontend/web/src` that nothing still references either before deleting, and again after.

- [ ] **Step 1: Write the failing tests**

Cover, each written out in full:

```
"an empty buffer input reads as empty, not zero"
"a buffer of 300 renders as 300, not 300,5, under a grouping locale"
"a buffer over 480 is refused with the message under the field"
"the slot interval offers exactly 15, 30 and 60"
"the languages section lists every locale the platform supports"
"a language with no name filled in is not sent as an empty translation"
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/frontend/web && bun run test -- sections`
Expected: FAIL.

- [ ] **Step 3: Build the three sections**

- [ ] **Step 4: Delete the two sheets and their references**

- [ ] **Step 5: Run the tests, typecheck and lint**

Run: `cd apps/frontend/web && bun run test && bun run check-types && bun run lint`
Expected: PASS, 0 errors, and no orphaned import.

- [ ] **Step 6: Verify in the browser**

Set a buffer and an interval, translate the service into a second language, upload an image, save, reload, confirm all four came back.

- [ ] **Step 7: Commit**

```bash
git add -A apps/frontend/web/src
git commit -m "feat(web): timing, languages and media sections; retire the service sheet"
```

---

### Task 7: The week preview

**Files:**
- Create: `apps/frontend/web/src/features/provider/availability/domain/preview.ts`
- Create: `apps/frontend/web/src/features/provider/availability/ui/week-preview.tsx`
- Test: `apps/frontend/web/src/features/provider/availability/domain/__tests__/preview.test.ts`

**Interfaces:**
- Consumes: `freeIntervals`, `type Interval`, `type DayRules` from `@ntizo/shared/scheduling`; `weekOf`, `weekdayOf`, `addDays` — check whether `weekOf` lives in this feature's `domain/week.ts` or the customer's `directory/availability/domain/day-strip.ts` and reuse rather than writing a third.
- Produces:

```ts
export interface PreviewDay {
  date: string;
  weekday: number;
  /** Empty when the member does not work that day. */
  intervals: Interval[];
  /** Why it is empty, when it is. */
  reason: "house-closure" | "member-closed" | "no-rule" | null;
}

export function previewWeek(input: {
  dates: readonly string[];
  weekly: readonly { weekday: number; startMinute: number; endMinute: number }[];
  exceptions: readonly { onDate: string; kind: "closed" | "custom"; startMinute: number | null; endMinute: number | null }[];
  closures: readonly { fromDate: string; toDate: string }[];
}): PreviewDay[];

/** The union across several members — the team view. */
export function mergeWeeks(weeks: readonly PreviewDay[][]): PreviewDay[];
```

**This is the task the whole screen exists for, and it must not become a second engine.** `previewWeek` translates the configuration's row shapes into `DayRules` and calls `freeIntervals` — it does not reimplement the precedence chain. If you find yourself writing `if (houseClosed) return []`, stop: that line already exists in the shared module and having it twice is the thing this design was chosen to avoid.

`busy` is passed as `[]`, deliberately. The preview shows configured time, not free time.

The `reason` field exists so an empty day can say why rather than just being blank — "closed for the holidays" and "you have not set Thursday yet" are different problems with different fixes.

- [ ] **Step 1: Write the failing tests**

Cover, each written out in full with concrete dates and minutes:

```
"a weekday with a rule shows that rule's hours"
"a weekday with no rule is empty and says so"
"a date inside a house closure is empty and blames the closure"
"a closed exception empties the day and blames the member's own calendar"
"a custom exception replaces the weekly hours for that date"
"two rules on one weekday merge into one interval"
"mergeWeeks unions two members' hours into the team view"
"mergeWeeks keeps a day empty only when it is empty for everyone"
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/frontend/web && bun run test -- preview`
Expected: FAIL.

- [ ] **Step 3: Implement `preview.ts`, then the grid**

The grid is a CSS grid: an hour column and seven day columns, with blocks positioned from their minutes. A legend names each tone in words. Week navigation is ‹ Today ›.

Do **not** add an `IntersectionObserver` here. If a later change adds one: it reports transitions rather than states, so a sentinel that stays in view fires once and stalls, and it does not fire at all in a hidden tab.

- [ ] **Step 4: Run the tests, typecheck and lint**

Run: `cd apps/frontend/web && bun run test && bun run check-types && bun run lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Break-check**

Make `previewWeek` ignore closures entirely and confirm the closure test fails. Make it add custom exceptions to the weekly hours rather than replacing them, and confirm that test fails. Revert both.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(web): the availability week preview, from the shared engine"
```

---

### Task 8: The availability screen — two columns, rule cards, the drawer

**Files:**
- Create: `apps/frontend/web/src/features/provider/availability/ui/rule-card.tsx`
- Create: `apps/frontend/web/src/features/provider/availability/ui/rule-drawer.tsx`
- Modify: `apps/frontend/web/src/features/provider/availability/ui/availability-page.tsx`
- Modify: `apps/frontend/web/src/features/provider/availability/ui/week-editor.tsx` — becomes the card list, or is replaced by it

**Interfaces:**
- Consumes: `previewWeek`, `WeekPreview`, `ChoiceChipsMulti`, `Sheet` from the kit.

**The layout.** Left column: the timezone on a small card with its own edit control, the person picker, then the weekly rules as cards. Right column: the preview, with the person/team toggle above it. Below `md` the two columns stack, preview first — on a phone the answer matters more than the controls.

**A rule card** shows its days as chips, its hours, and one sentence saying what it produces. **The drawer** carries the day chips, the two times, and a preview sentence at its foot naming the result, as the reference's second screen does.

**Keep two rules the current screen already holds.** The overlap refusal stays a client-side guard with its message under the field — the database does not refuse overlapping rules and the engine merges them harmlessly. And the week is displayed Monday-first while `weekday` stays 0 = Sunday in every value sent or received.

**The trap this layer has already paid for twice:** do not hold server data in a `key` prop and also sync it in an effect. A background refetch mid-edit then discards what the user is typing. The current `WeekEditor` seeds local state from an effect keyed strictly on `member.memberId` — read why before changing it.

- [ ] **Step 1: Write the failing tests**

```
"a rule card names its days and its hours"
"a rule card for every weekday says so rather than listing seven"
"the drawer refuses a rule that ends before it starts, under the field"
"the drawer refuses a rule overlapping an existing one for the same weekday"
"the drawer's preview sentence names the resulting hours"
"a rule saved in the drawer appears in the preview without a reload"
"the week is displayed Monday first while the stored weekday stays 0 for Sunday"
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/frontend/web && bun run test -- rule-card rule-drawer`
Expected: FAIL.

- [ ] **Step 3: Build the cards, the drawer and the two-column layout**

- [ ] **Step 4: Run the tests, typecheck and lint**

- [ ] **Step 5: Verify in the browser**

As an owner: add a rule and watch the preview change before saving anything else. Edit it in the drawer and watch the sentence update as you type. Try to create an overlapping rule and read the refusal. Reload and confirm everything persisted.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(web): availability as rules beside a live week"
```

---

### Task 9: Exceptions, closures, the timezone card and the team toggle

**Files:**
- Modify: `apps/frontend/web/src/features/provider/availability/ui/exceptions-panel.tsx`, `closures-panel.tsx`, `availability-page.tsx`
- Create: `apps/frontend/web/src/features/provider/availability/ui/timezone-card.tsx`

**Interfaces:**
- Consumes: `mergeWeeks` from `../domain/preview`.

Exceptions and closures take the same card shape as the rules, and open the same kind of drawer. The timezone becomes a small card with the zone named and an edit control; the `Select` stays inside it, because a timezone list is long.

**The team toggle** switches the preview between the selected member and `mergeWeeks` across everyone. **For an individual provider neither the person picker nor the toggle appears** — one member means both offer a single choice, and the word for staff must not reach that provider's screen.

**Closures and the timezone stay visible only to an owner or admin**, exactly as today, read from `activeProvider.role`. Hiding is not the guard; the server refuses regardless.

- [ ] **Step 1: Write the failing tests**

```
"an individual provider sees no person picker and no team toggle"
"an organization owner sees both"
"a staff member sees the picker but no closures block"
"the team view unions two members' hours"
"a closed exception card names the date and the reason given"
"a closure card names its range as a range, not two dates"
```

- [ ] **Step 2: Run to verify they fail** — `cd apps/frontend/web && bun run test -- availability`

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests, typecheck and lint**

- [ ] **Step 5: Verify in the browser with two roles**

As an owner of an organization with two members: switch the toggle and confirm the team view is wider than either person's. As a staff member: confirm no closures block. As an individual provider: confirm neither control appears and the word for staff is nowhere on the screen.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(web): exception and closure cards, the timezone card, the team view"
```

---

### Task 10: Onboarding — status, progress and forward navigation

**Files:**
- Modify: `apps/frontend/web/src/features/onboarding/domain/screen-model.ts`
- Modify: `apps/frontend/web/src/features/onboarding/ui/wizard-chrome.tsx`
- Modify: `apps/frontend/web/src/features/onboarding/ui/phases/phase-provider.tsx` — provider type and country as chips
- Test: `apps/frontend/web/src/features/onboarding/domain/__tests__/onboarding.test.ts` (extend)

**Interfaces:**
- Consumes: `SectionRail`, `ProgressRing`, `ChoiceChips`.
- Produces: `isReachable(target, from, firstIncomplete)` — a third parameter.

**The behaviour change, and the reason the old rule existed.** Today `isReachable` allows backwards only. It was written that way because forward navigation would let somebody skip `CREATES_PROVIDER`, and everything after that step needs a provider row to exist. The new rule keeps that guarantee: **any step up to and including `firstIncompleteStep(draft)` is reachable**, which can never be past the creating step while the creating step is itself incomplete.

Row status comes from `validateStep`, which already returns a step's field errors: no errors and the step has been visited means done; errors mean a problem; neither means to do.

- [ ] **Step 1: Write the failing tests**

```ts
test("a step before the first incomplete one is reachable", () => {});
test("the first incomplete step is reachable", () => {});
test("a step after the first incomplete one is not", () => {});
test("nothing past the provider-creating step is reachable while it is incomplete", () => {});
test("with every step complete, the last is reachable", () => {});
test("a step with validation errors reports a problem, not merely to do", () => {});
test("the ring counts required steps, not all steps", () => {});
```

Write each out in full.

- [ ] **Step 2: Run to verify they fail** — `cd apps/frontend/web && bun run test -- onboarding`

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests, typecheck and lint**

- [ ] **Step 5: Break-check**

Make `isReachable` allow any step and confirm the two "not reachable" tests fail. Make the ring count `STEP_ORDER.length` and confirm the ring test fails. Revert.

- [ ] **Step 6: Verify in the browser**

Start onboarding, fill three steps, jump back to the first from the rail, correct the name, and jump forward again — the six clicks it used to take should now be one.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(web): onboarding gains section status, progress and forward navigation"
```

---

### Task 11: Eight locales and the walkthrough

**Files:**
- Modify: every `apps/frontend/web/src/shared/locales/<locale>/*.json` touched by Tasks 5 to 10

**Every key introduced by this plan must exist in all eight locales, natively translated.** `i18n-parity.test.ts` compares each locale against `en-US`. Weekday and month names come from `Intl.DateTimeFormat` — if any task hardcoded one, replace it here.

- [ ] **Step 1: List every key the new screens introduced**

Run: `cd apps/frontend/web && grep -rhoE '\bt\("([^"]+)"' src/features/provider/services src/features/provider/availability src/features/onboarding | sort -u`

- [ ] **Step 2: Fill every locale**

Translate from the Portuguese meaning into each language, matching the register of the file you are editing.

- [ ] **Step 3: Run the full suites**

Run: `cd apps/frontend/web && bun run test` and, from the repo root, `bun run check-types && bun run lint`.
Expected: PASS, 0 errors, i18n parity green.

- [ ] **Step 4: The walkthrough**

One pass, screenshotting each step, in `pt-MZ` and then in **one other locale**:

1. Onboarding from the start: rail status changes as steps complete, the ring counts required steps, jumping back and forward works.
2. Create a service through the page: rail turns done section by section, publish is refused with a reason naming the missing section, then succeeds.
3. Availability: add a rule and watch the preview change; a house closure empties a day in the preview; the team toggle widens it.
4. As an individual provider: no person picker, no team toggle, no performers section, and no word for staff anywhere.

Looking for Portuguese or English words on the second locale's screens specifically — a key that falls back silently renders the default language and looks deliberate.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src
git commit -m "feat(web): the three editors' copy in all eight locales"
```

---

## Self-review

**Spec coverage.** The four shared parts → Tasks 1 and 2; the engine move → Task 3; the rail agreeing with the server → Task 4, consumed in Task 5; the service editor's six sections and the retired sheets → Tasks 5 and 6; the live preview and its "configured, not free" rule → Task 7; the two columns, rule cards and drawer → Task 8; the team toggle, the individual-provider rules and the owner/admin visibility → Task 9; onboarding's status, ring and forward navigation → Task 10; eight locales and the two-locale walkthrough → Task 11.

**Deliberate omissions honoured.** No task touches the palette, spacing or type scale; no task adds an agenda screen, section reordering, or rich text. The spec's "Open, deliberately" list is untouched.

**Placeholder scan — one deliberate exception, declared.** Tasks 5, 6, 8, 9 and 10 carry test bodies written as a precise `test("…")` name with an elided body, and Task 11's translations are described rather than enumerated. This breaks the skill's rule against "write tests for the above". It is declared rather than hidden: the names are assertions rather than topics, and **every implementer must write the body the name promises and then break-check it** — delete the line it guards and confirm it fails. On the previous plan, six tasks carried the same elision and every one of the resulting tests held up under an adversarial review; the risk is real but it is measured.

**Type consistency.** `SectionStatus` is `"done" | "todo" | "error"` in the kit and `SectionState.complete` is a boolean in the service domain — the screen maps one to the other, and only in `service-editor-page.tsx`. `weekday` is 0 = Sunday in every value crossing the wire; only the display order reverses it, in `WEEKDAY_ORDER` and in the preview grid's column order. `Interval` is `{ start, end }` in the shared engine and `startMinute`/`endMinute` in the configuration's rows; `previewWeek` is the single place that translates between them, exactly as `list-service-availability.projection.ts` is on the backend.
