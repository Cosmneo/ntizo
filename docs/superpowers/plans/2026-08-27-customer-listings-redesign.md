# Customer Listings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rebuild `/services` and `/providers` on one shared browse shell — hero, category rail, facet sidebar, list rows on the desktop and stacked cards on the phone — and add the four API fields that design needs.

**Architecture:** presentational shells live in `apps/frontend/web/src/shared/components/browse/` and take `ReactNode` slots; each page keeps its own typed search model and builds its own route-typed `Link`s. Logic that can be wrong (title composition, active-filter derivation, page numbers, placeholder hue) lives in tested domain functions, never inside a component.

**Tech Stack:** React 19, TanStack Router + Query, Tailwind v4 with CSS custom properties, vitest + @testing-library/react (frontend); Hono, Drizzle, zod, `@cosmneo/onion-lasagna` field kit, `bun test` (backend).

**Spec:** `docs/superpowers/specs/2026-08-27-customer-listings-redesign-design.md`
**Approved visual reference:** `docs/superpowers/specs/2026-08-27-customer-listings-redesign.mockup.html` — open it in a browser. Where this plan gives no exact class list, that file is the answer.

**Favourites is a separate plan:** `docs/superpowers/plans/2026-08-27-favourites.md`. It owns the heart, the `favourite` bounded context, and `/favourites`. This plan leaves `ListingMedia`'s `favourite` slot empty and the product is complete without it.

## Global Constraints

- **Never invent a colour.** Every colour is a `var(--color-*)` from `packages/frontend/src/styles/globals.css`. A hex literal in a component is a review rejection.
- **Every new token is declared twice** — once in `:root`, once in `.dark`. Task 1's test enforces this.
- **Filters, sort, category and paging are `<Link>`s, never buttons.** A filtered list is a URL somebody sends, the back button undoes a filter, and these pages are server-rendered for crawlers.
- **Every new copy string exists in all 8 locales** (`de-DE`, `en-US`, `es-ES`, `fr-FR`, `it-IT`, `nl-NL`, `pt-MZ`, `pt-PT`). `shared/lib/__tests__/i18n-parity.test.ts` fails the build otherwise, and it compares interpolation placeholders too.
- **Tests assert English copy.** `test/setup.ts` resolves i18n to `en` under jsdom.
- **`useSuspenseQuery`, never `useQuery`,** on anything these pages render. A plain `useQuery` renders its loading state on the server and ships an empty page to a crawler.
- **GraphQL field names are flattened by the field kit.** `{ catalog: { serviceCities } }` emits as `catalogServiceCities` on the wire, with input type `CatalogServiceCitiesInput!`. Never `catalog { serviceCities }`.
- **`.optional()` on GraphQL inputs, never `.default()`.** A zod default does not survive into the emitted schema — the argument still emits as required. Defaults and clamps live in the projection.
- **Prices and durations carry `tabular-nums`.**
- **Task order is fixed.** Tasks 1–13 build shells and domain functions and change nothing on screen; 14–17 are the API; 18 is the copy; 19–21 switch the pages over. Do not reorder — Task 13 adds `city` to `BrowseSearch` and Task 16 adds it to the route, and doing 16 first leaves the filter reachable from a URL and silently dropped by every link on the page.

---

## File Structure

**Created — shared shells** (`apps/frontend/web/src/shared/components/browse/`)

| File | Responsibility |
|---|---|
| `price-stub.tsx` | the ticket stub: dashed rule, notches, rating, price block, CTA slot |
| `listing-media.tsx` | photo or generated placeholder, badge slot, favourite slot |
| `listing-card.tsx` | the card grid and hover lift; exports `LISTING_TITLE_LINK_CLASS` |
| `category-rail.tsx` | scrolling pills, edge fades, desktop arrows; exports `categoryChipClass` |
| `facet-panel.tsx` | `FacetPanel`, `FacetGroup`, `FacetBox`, `FacetCount`; exports `facetOptionClass` |
| `results-bar.tsx` | the count sentence and the sort control; exports `segmentClass` |
| `active-filter-chips.tsx` | `ActiveFilterChips`, `ActiveFilterChip` |
| `pager.tsx` | numbered paging shell |
| `browse-hero.tsx` | `BrowseHero`, `BrowseSearchCard`, `BrowseSearchField` |

**Created — shared domain** (`apps/frontend/web/src/shared/components/browse/domain/`)

| File | Responsibility |
|---|---|
| `placeholder-tile.ts` | `placeholderHue(seed)`, `initialsOf(name)` |
| `page-numbers.ts` | `pageNumbers(total, pageSize, offset)` |

**Created — per-page domain**

- `features/directory/services/domain/browse-title.ts` — `browseTitleKey(search)`
- `features/directory/services/domain/browse-chips.ts` — `browseFilterChips(search)`
- `features/directory/domain/directory-title.ts` — `directoryTitleKey(search)`
- `features/directory/domain/directory-chips.ts` — `directoryFilterChips(search)`

**Modified**

- `packages/frontend/src/styles/globals.css` — tokens, `.type-display`
- `packages/shared/src/read-models/public/service/service.schema.ts` — `total`, provider rating
- `packages/backend/.../public/catalog/graphql/schema/queries.ts` — `sort`, `city`, `serviceCities`
- `packages/backend/.../public/catalog/app/use-cases/list-services.projection.ts`
- `packages/backend/.../bounded-contexts/catalog/infrastructure/repositories/drizzle/service-read.repository.ts`
- `apps/frontend/web/src/features/directory/services/ui/services-browse-page.tsx`
- `apps/frontend/web/src/features/directory/ui/directory-page.tsx`
- `apps/frontend/web/src/shared/locales/*/directory.json` (8 files)
- `apps/frontend/web/src/routes/services.index.tsx` — `sort` and `city` in `validateSearch`

**Deleted**

- `shared/components/filter-panel.tsx` and its consumers' imports (superseded by `facet-panel.tsx`)
- `features/directory/services/ui/browse-filters.tsx`, `.../ui/category-band.tsx`, `.../ui/search-box.tsx`
- `features/directory/ui/directory-filters.tsx`, `.../ui/directory-category-band.tsx`, `.../ui/directory-search-box.tsx`, `.../ui/directory-sort.tsx`
- `features/directory/services/ui/browse-service-card.tsx`, `features/directory/ui/provider-card.tsx`

---

### Task 1: Design tokens and the display type

**Files:**
- Modify: `packages/frontend/src/styles/globals.css`
- Test: `packages/frontend/src/styles/__tests__/tokens.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties `--color-surface-raised`, `--color-border-strong`, `--color-primary-deep`, `--shadow-xs`, `--shadow-sm`, `--shadow-lift`, `--shadow-float`; the class `.type-display`. Every later task reads these by name.

- [ ] **Step 1: Write the failing test**

Create `packages/frontend/src/styles/__tests__/tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
// `?raw` rather than node:fs — this package is a browser bundle with no Node
// types in its tsconfig, so a readFileSync here fails `check-types` and
// `build` even though vitest would happily run it. Same reason
// `i18n-parity.test.ts` reaches for `import.meta.glob`.
import css from "../globals.css?raw";

/**
 * A token declared in `:root` and forgotten in `.dark` does not fall back to
 * anything sensible — it inherits the light value, so a dark page renders a
 * near-white surface. Nothing else in the build notices, and it is invisible
 * to anyone developing in light mode.
 */
const ADDED = [
  "--color-surface-raised",
  "--color-border-strong",
  "--color-primary-deep",
  "--shadow-xs",
  "--shadow-sm",
  "--shadow-lift",
  "--shadow-float",
] as const;

/** The body of a top-level block, by its selector. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} block not found`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`${selector} block never closed`);
}

describe("design tokens", () => {
  const root = block(":root");
  const dark = block(".dark");

  it.each(ADDED)("declares %s in :root", (token) => {
    expect(root).toContain(`${token}:`);
  });

  it.each(ADDED)("declares %s in .dark too", (token) => {
    expect(dark).toContain(`${token}:`);
  });

  it("keeps the display class in the type scale", () => {
    expect(css).toContain(".type-display");
  });

  it("does not silently change the brand blue", () => {
    // The redesign adds a deeper blue beside the brand one; it must not
    // replace it. Every other surface in the product reads --color-primary.
    expect(root).toContain("--color-primary: #006ffd");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd packages/frontend && bun run test src/styles/__tests__/tokens.test.ts
```

Expected: FAIL — `:root` does not contain `--color-surface-raised:`.

- [ ] **Step 3: Add the tokens**

In `packages/frontend/src/styles/globals.css`, inside `:root`, after the `--radius: 16px;` line and before the closing brace:

```css
  /*
   * The page ground the browse surfaces sit on.
   *
   * Separate from `--color-muted`, which is the design system's Tint Blue and
   * is a *highlight*. This is the opposite job: a neutral floor, so that white
   * comes to mean "an object you can act on" — the header, the search card, a
   * result card — and nothing else on the page is white. The listings read as
   * a wireframe today precisely because white cards sat on a white page.
   */
  --color-surface-raised: #eef2f9;

  /*
   * A divider with enough weight to be read as structure rather than as a
   * hairline between rows. The price stub's perforation and the facet
   * checkboxes are the two things that need it; `--color-border` disappears
   * at both sizes.
   */
  --color-border-strong: #d7dbe3;

  /*
   * The brand blue pressed down, for a CTA's hover and the hero's halo.
   * Not a second brand colour: nothing is ever *at rest* in this colour.
   */
  --color-primary-deep: #0a4fbd;

  /*
   * One elevation scale, so a card cannot lift by a different amount than
   * its neighbour. `browse-service-card.tsx` and `provider-card.tsx` today
   * carry character-identical copies of the first two — they agree by
   * transcription, not by definition.
   */
  --shadow-xs: 0 1px 2px rgba(19, 23, 27, 0.05);
  --shadow-sm: 0 1px 3px rgba(19, 23, 27, 0.06), 0 6px 16px -10px rgba(19, 23, 27, 0.14);
  --shadow-lift: 0 2px 4px rgba(19, 23, 27, 0.06), 0 16px 34px -18px rgba(19, 23, 27, 0.24);
  --shadow-float: 0 10px 34px -14px rgba(13, 32, 64, 0.22), 0 2px 6px rgba(19, 23, 27, 0.05);
```

Inside `.dark`, before its closing brace:

```css
  --color-surface-raised: #0e131c;
  --color-border-strong: #2b3242;
  --color-primary-deep: #3d9bff;

  /*
   * Deeper and more opaque than the light scale. A shadow tuned for a white
   * page is invisible on a near-black one; the lift has to come from a
   * darker shadow, not a paler one.
   */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.45), 0 6px 16px -10px rgba(0, 0, 0, 0.6);
  --shadow-lift: 0 2px 4px rgba(0, 0, 0, 0.5), 0 16px 34px -18px rgba(0, 0, 0, 0.7);
  --shadow-float: 0 10px 34px -14px rgba(0, 0, 0, 0.75), 0 2px 6px rgba(0, 0, 0, 0.5);
```

- [ ] **Step 4: Expose the two colours to Tailwind and add the display class**

In the `@theme inline` block, beside the other `--color-*` lines:

```css
  --color-surface-raised: var(--color-surface-raised);
  --color-border-strong: var(--color-border-strong);
  --color-primary-deep: var(--color-primary-deep);
```

In `@layer components`, immediately above `.type-h1`:

```css
  /*
   * One step above `type-h1`, and only for a page's own head.
   *
   * `clamp` rather than a breakpoint: this is the one size on the page that
   * has to work at 360px and at 1440px, and a two-value jump at `lg` leaves
   * a tablet reading either a phone's heading or a desktop's.
   */
  .type-display { font-family: var(--font-display); font-weight: 600; font-size: clamp(30px, 3.6vw, 42px); line-height: 1.1; letter-spacing: -0.025em; }
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
cd packages/frontend && bun run test src/styles/__tests__/tokens.test.ts
```

Expected: PASS, 16 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/styles/globals.css packages/frontend/src/styles/__tests__/tokens.test.ts
git commit -m "feat(ui): a ground, a strong border, a deeper blue and one elevation scale

Nothing existing changes value, so no surface moves. The test is the point:
a token declared in :root and forgotten in .dark inherits the light value and
renders a near-white panel on a black page, which nothing else notices."
```

---

### Task 2: `placeholderHue` and `initialsOf`

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/domain/placeholder-tile.ts`
- Test: `apps/frontend/web/src/shared/components/browse/domain/__tests__/placeholder-tile.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `placeholderHue(seed: string): number` — 0–359, stable for a given seed.
  - `initialsOf(name: string): string` — one or two grapheme initials, uppercased; `"?"` for a blank name.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/shared/components/browse/domain/__tests__/placeholder-tile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initialsOf, placeholderHue } from "../placeholder-tile";

describe("placeholderHue", () => {
  it("gives the same trade the same colour everywhere it appears", () => {
    // A category that looked different on /services than on /providers would
    // read as two categories.
    expect(placeholderHue("plumbing")).toBe(placeholderHue("plumbing"));
  });

  it("gives different trades different colours", () => {
    // The whole point: a column of placeholders should read as a varied
    // catalogue, not as a column of identical grey rectangles.
    const hues = ["plumbing", "electrical", "cleaning", "hair", "music"].map(placeholderHue);
    expect(new Set(hues).size).toBe(hues.length);
  });

  it("stays inside a hue wheel", () => {
    for (const seed of ["", "a", "plumbing", "a-very-long-category-code-indeed"]) {
      const h = placeholderHue(seed);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
      expect(Number.isInteger(h)).toBe(true);
    }
  });

  it("answers for an empty seed rather than throwing", () => {
    // A service whose category code failed to resolve still has to render.
    expect(() => placeholderHue("")).not.toThrow();
  });
});

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Estúdio Mavalane")).toBe("EM");
  });

  it("takes one letter from a single-word name", () => {
    expect(initialsOf("Ntizo")).toBe("N");
  });

  it("ignores the words past the second", () => {
    expect(initialsOf("Casa Limpa Lda")).toBe("CL");
  });

  it("survives a name that starts with an emoji", () => {
    // `name[0]` cuts a surrogate pair in half and renders a replacement box.
    expect(initialsOf("🌟 Salão")).toBe("🌟S");
  });

  it("survives an accented letter written as two code points", () => {
    // "Á" as A + U+0301. Splitting by code unit yields a bare combining mark.
    expect(initialsOf("Água Limpa")).toBe("ÁL".toUpperCase());
  });

  it("answers for a blank name rather than rendering nothing", () => {
    expect(initialsOf("   ")).toBe("?");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/domain/__tests__/placeholder-tile.test.ts
```

Expected: FAIL — cannot resolve `../placeholder-tile`.

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/web/src/shared/components/browse/domain/placeholder-tile.ts`:

```ts
/**
 * A stable hue for a listing with no photograph.
 *
 * Most listings have no photograph, and a column of identical grey rectangles
 * reads as a broken page while a column of different tiles reads as a
 * catalogue. Seeded on the category code rather than on the listing id so a
 * trade looks the same wherever it appears — an id would give one plumber a
 * purple tile and the next a green one, which says nothing.
 *
 * FNV-1a, not `hashCode`-style `h * 31 + c`: the latter clusters badly on
 * short lowercase ASCII strings, which is exactly what a category code is,
 * and adjacent codes came out adjacent on the wheel.
 */
export function placeholderHue(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    // `Math.imul` rather than `*`: the product overflows 2^53 and JavaScript
    // starts losing low bits, which is where a hash's entropy lives.
    h = Math.imul(h, 0x01000193);
  }
  // `>>> 0` first: the operations above leave a signed 32-bit value, and a
  // negative modulo would return a negative hue.
  return (h >>> 0) % 360;
}

/**
 * Up to two initials from a name.
 *
 * `Intl.Segmenter` rather than `name[0]`, and the same reasoning
 * `provider-card.tsx` documented before this file existed: a name beginning
 * with an emoji, an accented letter formed from two code points, or a script
 * outside the BMP is cut mid-character by an index and renders as a
 * replacement box.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (words.length === 0) return "?";
  return words
    .map((word) => {
      if (typeof Intl.Segmenter === "function") {
        const [first] = new Intl.Segmenter().segment(word);
        return first?.segment ?? "";
      }
      return [...word][0] ?? "";
    })
    .join("")
    .toUpperCase();
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/domain/__tests__/placeholder-tile.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse/domain/placeholder-tile.ts apps/frontend/web/src/shared/components/browse/domain/__tests__/placeholder-tile.test.ts
git commit -m "feat(browse): a stable colour and initials for a listing with no photo

Seeded on the category code, not the listing id: a trade should look the same
wherever it appears, and an id gives one plumber purple and the next green."
```

---

### Task 3: `pageNumbers`

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/domain/page-numbers.ts`
- Test: `apps/frontend/web/src/shared/components/browse/domain/__tests__/page-numbers.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `pageNumbers(total: number, pageSize: number, offset: number): PageSlot[]` where `type PageSlot = { page: number; offset: number; current: boolean } | "gap"`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/shared/components/browse/domain/__tests__/page-numbers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pageNumbers } from "../page-numbers";

/** Just the labels, for readability. */
const shape = (total: number, size: number, offset: number) =>
  pageNumbers(total, size, offset).map((s) => (s === "gap" ? "…" : String(s.page)));

describe("pageNumbers", () => {
  it("renders nothing when everything fits on one page", () => {
    // A pager offering page 1 of 1 is a control with no outcome.
    expect(pageNumbers(8, 24, 0)).toEqual([]);
  });

  it("renders nothing when there are no results at all", () => {
    expect(pageNumbers(0, 24, 0)).toEqual([]);
  });

  it("lists every page while they fit", () => {
    expect(shape(100, 24, 0)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("marks exactly one page as current", () => {
    const slots = pageNumbers(100, 24, 48).filter((s) => s !== "gap");
    expect(slots.filter((s) => s !== "gap" && s.current)).toHaveLength(1);
    expect(slots.find((s) => s !== "gap" && s.current)).toMatchObject({ page: 3, offset: 48 });
  });

  it("elides the middle on a long list, keeping the ends and the neighbours", () => {
    // Page 10 of 20: first, gap, 9, 10, 11, gap, last.
    expect(shape(480, 24, 216)).toEqual(["1", "…", "9", "10", "11", "…", "20"]);
  });

  it("does not draw a gap that hides a single page", () => {
    // A "…" standing in for page 2 alone is longer than page 2.
    expect(shape(480, 24, 72)).toEqual(["1", "2", "3", "4", "5", "…", "20"]);
  });

  it("counts a total that is an exact multiple of the page size correctly", () => {
    // 96 / 24 = 4 exactly. An off-by-one here invents an empty fifth page.
    expect(shape(96, 24, 0)).toEqual(["1", "2", "3", "4"]);
  });

  it("counts one item past a full page as a second page", () => {
    expect(shape(25, 24, 0)).toEqual(["1", "2"]);
  });

  it("clamps an offset past the end onto the last page", () => {
    // ?offset=99999 is a URL somebody can type. It must not mark no page.
    const slots = pageNumbers(96, 24, 99_999);
    expect(slots.find((s) => s !== "gap" && s.current)).toMatchObject({ page: 4 });
  });

  it("treats a negative offset as the first page", () => {
    const slots = pageNumbers(96, 24, -40);
    expect(slots.find((s) => s !== "gap" && s.current)).toMatchObject({ page: 1 });
  });

  it("gives every slot the offset that reaches it", () => {
    const slots = pageNumbers(96, 24, 0).filter((s): s is Exclude<typeof s, "gap"> => s !== "gap");
    expect(slots.map((s) => s.offset)).toEqual([0, 24, 48, 72]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/domain/__tests__/page-numbers.test.ts
```

Expected: FAIL — cannot resolve `../page-numbers`.

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/web/src/shared/components/browse/domain/page-numbers.ts`:

```ts
export type PageSlot = { page: number; offset: number; current: boolean } | "gap";

/**
 * How many numbers sit either side of the current page before the list is
 * elided. Two neighbours plus the current page plus both ends plus two gaps
 * is seven slots, which is the most that fits beside "Previous"/"Next" on a
 * 360px screen without wrapping.
 */
const WINDOW = 1;

/**
 * How many pages are listed flat before any eliding happens.
 *
 * Seven, because seven is what the windowed form costs at its widest — two
 * ends, two gaps, and three around the current page. Eliding below that spends
 * a destination to save nothing.
 */
const MAX_FLAT = 7;

/**
 * The pages a reader can jump to.
 *
 * Empty when there is one page or none — a pager offering "page 1 of 1" is a
 * control with no outcome, and drawing it makes an eight-result search look
 * like a truncated one.
 *
 * A gap is only drawn where it stands in for two or more pages. Replacing a
 * single page with "…" is both longer and worse: the reader loses a
 * destination and gains nothing.
 */
export function pageNumbers(total: number, pageSize: number, offset: number): PageSlot[] {
  const pages = Math.ceil(Math.max(total, 0) / pageSize);
  if (pages <= 1) return [];

  // Clamped, not trusted. `?offset=99999` is a URL somebody can type, and an
  // out-of-range current page would leave nothing marked at all.
  const current = Math.min(Math.max(Math.floor(Math.max(offset, 0) / pageSize) + 1, 1), pages);
  const slot = (page: number): PageSlot => ({
    page,
    offset: (page - 1) * pageSize,
    current: page === current,
  });

  // Short lists are drawn whole. The windowed form below is never narrower
  // than this until there are more than MAX_FLAT pages.
  if (pages <= MAX_FLAT) {
    return Array.from({ length: pages }, (_, i) => slot(i + 1));
  }

  const wanted = new Set<number>([1, pages]);
  for (let p = current - WINDOW; p <= current + WINDOW; p += 1) {
    if (p >= 1 && p <= pages) wanted.add(p);
  }

  const slots: PageSlot[] = [];
  let previous = 0;
  for (const page of [...wanted].sort((a, b) => a - b)) {
    // Exactly one page missing is drawn rather than elided.
    if (page - previous === 2) {
      slots.push(slot(page - 1));
    } else if (page - previous > 2) {
      slots.push("gap");
    }
    slots.push(slot(page));
    previous = page;
  }
  return slots;
}
```

Trace it against the two elision tests before moving on. `pageNumbers(480, 24, 216)`: 20 pages, current 10, wanted `{1, 9, 10, 11, 20}` → `1, gap, 9, 10, 11, gap, 20`. `pageNumbers(480, 24, 72)`: current 4, wanted `{1, 3, 4, 5, 20}` → the `3 - 1 === 2` branch draws page 2 rather than a gap → `1, 2, 3, 4, 5, gap, 20`.
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/domain/__tests__/page-numbers.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse/domain/page-numbers.ts apps/frontend/web/src/shared/components/browse/domain/__tests__/page-numbers.test.ts
git commit -m "feat(browse): numbered paging, elided only where it saves a slot

A gap standing in for one page is longer than the page it hides. Offsets past
the end clamp onto the last page rather than marking none."
```

---

### Task 4: `PriceStub` — the ticket stub

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/price-stub.tsx`
- Test: `apps/frontend/web/src/shared/components/browse/__tests__/price-stub.test.tsx`

**Interfaces:**
- Consumes: `--color-border-strong`, `--color-surface-raised`, `--shadow-*` (Task 1).
- Produces:

```ts
export interface StubRating {
  average: number;
  count: number;
  /** Names whose score this is, e.g. "provider rating". Omitted where it is the listing's own. */
  attribution?: string | undefined;
}

export function PriceStub(props: {
  rating?: StubRating | undefined;
  /** "Fixed price", "Per hour", "By quote", "from" — the eyebrow above the amount. */
  eyebrow: string;
  /** Already formatted by the caller: `Intl.NumberFormat` needs a locale this component has no business holding. */
  amount: string;
  /** One line under the amount: "45 min", "per service", "free visit". */
  under?: string | undefined;
  /** The page's own route-typed CTA `<Link>`. */
  action: ReactNode;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/shared/components/browse/__tests__/price-stub.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriceStub } from "../price-stub";

describe("PriceStub", () => {
  it("leads with the amount and says what kind of price it is", () => {
    render(<PriceStub eyebrow="Fixed price" amount="800 MZN" action={<a href="/x">Book</a>} />);
    expect(screen.getByText("800 MZN")).toBeInTheDocument();
    expect(screen.getByText("Fixed price")).toBeInTheDocument();
  });

  it("draws no stars for a listing nobody has reviewed", () => {
    // The gap is the point. A "0,0" where every other card has a score tells
    // every reader this is the worst listing on the platform, which is the
    // opposite of true — the same reason `ratingAverage` is null and not 0 all
    // the way from the database.
    const { container } = render(
      <PriceStub eyebrow="Fixed price" amount="800 MZN" action={<a href="/x">Book</a>} />,
    );
    expect(screen.queryByText("0,0")).not.toBeInTheDocument();
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
    expect(container.querySelector("[data-testid='stub-rating']")).toBeNull();
  });

  it("collapses without leaving a hole when the optional lines are absent", () => {
    // Every optional slot missing is the common case — most listings carry no
    // rating and no under-line — and it must not leave a band of empty space
    // where the next card in the column has content.
    const { container } = render(
      <PriceStub eyebrow="By quote" amount="To agree" action={<a href="/x">Ask</a>} />,
    );
    const stub = container.querySelector("[data-testid='price-stub']")!;
    expect(stub.querySelector("[data-testid='stub-rating']")).toBeNull();
    expect(stub.querySelector("[data-testid='stub-under']")).toBeNull();
  });

  it("carries the score, the count and one decimal", () => {
    // 4.9 from two people and 4.9 from two hundred are different claims, and
    // a bare "5" reads as a different kind of number than "4.7".
    render(
      <PriceStub
        rating={{ average: 5, count: 214 }}
        eyebrow="Fixed price"
        amount="800 MZN"
        action={<a href="/x">Book</a>}
      />,
    );
    expect(screen.getByText("5.0")).toBeInTheDocument();
    expect(screen.getByText("(214)")).toBeInTheDocument();
  });

  it("says whose score it is when it is not the listing's own", () => {
    // A service card shows the provider's rating. Printing it unlabelled
    // claims the service has been reviewed 6 times, which it has not.
    render(
      <PriceStub
        rating={{ average: 4.7, count: 6, attribution: "provider rating" }}
        eyebrow="Fixed price"
        amount="800 MZN"
        action={<a href="/x">Book</a>}
      />,
    );
    expect(screen.getByText("provider rating")).toBeInTheDocument();
  });

  it("states the score as a phrase for anyone who cannot see the stars", () => {
    render(
      <PriceStub
        rating={{ average: 4.7, count: 3 }}
        eyebrow="Fixed price"
        amount="800 MZN"
        action={<a href="/x">Book</a>}
      />,
    );
    expect(screen.getByLabelText("4.7 out of 5, from 3 reviews")).toBeInTheDocument();
  });

  it("keeps the caller's action clickable", () => {
    // The stub sits inside a card whose title link covers the whole surface;
    // the CTA has to sit above it or it is decoration.
    render(<PriceStub eyebrow="Fixed price" amount="800 MZN" action={<a href="/svc/1">Book</a>} />);
    expect(screen.getByRole("link", { name: "Book" })).toHaveAttribute("href", "/svc/1");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/price-stub.test.tsx
```

Expected: FAIL — cannot resolve `../price-stub`.

- [ ] **Step 3: Write the component**

Create `apps/frontend/web/src/shared/components/browse/price-stub.tsx`:

```tsx
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";

export interface StubRating {
  average: number;
  count: number;
  /** Names whose score this is. Omitted where it is the listing's own. */
  attribution?: string | undefined;
}

/**
 * The price rail of a listing card, drawn as a ticket stub.
 *
 * The dashed rule and the two punched notches are the design's one deliberate
 * flourish, and they are structural rather than applied: what this platform
 * sells is a *committed offer* — a price and a duration fixed before you
 * agree, in a market whose norm is to negotiate on the doorstep — and a stub
 * is what a committed offer looks like.
 *
 * The notch is a circle in the page's ground colour sitting on the rule at
 * each card edge, half inside the card and half out. It is only readable
 * because the ground and the card are different colours, which is the same
 * reason the whole page moved onto `--color-surface-raised`. It carries a 1px
 * ring so the half sitting on white still reads as a hole rather than as a
 * smudge.
 *
 * Every optional slot collapses. Most listings carry no rating and no
 * under-line, and a fixed-height rail would put a band of empty white inside
 * every card shorter than the tallest in its column.
 *
 * `amount` arrives already formatted. `Intl.NumberFormat` needs a locale and a
 * currency, and a presentational shell that reached for either would be
 * deciding something two different pages should decide for themselves.
 */
export function PriceStub({
  rating,
  eyebrow,
  amount,
  under,
  action,
}: {
  rating?: StubRating | undefined;
  eyebrow: string;
  amount: string;
  under?: string | undefined;
  action: ReactNode;
}) {
  const { t } = useTranslation("directory");

  return (
    <div
      data-testid="price-stub"
      className="relative flex flex-col items-end justify-between gap-3 pl-5 sm:pl-6"
    >
      {/* The perforation. `border-l` on a zero-width span rather than a
          dashed border on the container: a dashed border on the flex parent
          would also dash the three edges nobody asked for. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-[-2px] left-0 w-0 border-l-[1.5px] border-dashed border-[var(--color-border-strong)]"
      />
      <Notch className="top-[-23px]" />
      <Notch className="bottom-[-23px]" />

      {rating && (
        <p
          data-testid="stub-rating"
          className="grid justify-items-end gap-0.5"
          // One label for the pair. Five icons read out one by one are not a
          // rating, and the number alone loses the count.
          aria-label={t("ratingAriaLabel", {
            score: rating.average.toFixed(1),
            count: rating.count,
          })}
        >
          <span className="flex items-center gap-1.5">
            <Star
              className="h-3.5 w-3.5 fill-[var(--color-warning)] text-[var(--color-warning)]"
              aria-hidden="true"
            />
            <b className="font-rounded text-[0.95rem] font-semibold tabular-nums">
              {rating.average.toFixed(1)}
            </b>
            <span className="type-caption text-[var(--color-muted-foreground)]">
              ({rating.count})
            </span>
          </span>
          {rating.attribution && (
            <span className="type-caption text-[var(--color-muted-foreground)]">
              {rating.attribution}
            </span>
          )}
        </p>
      )}

      <p className="grid justify-items-end gap-0.5 text-right">
        <span className="text-[11px] font-medium tracking-[0.09em] text-[var(--color-muted-foreground)] uppercase">
          {eyebrow}
        </span>
        <b className="font-rounded text-[1.45rem] leading-tight font-semibold tracking-[-0.02em] tabular-nums">
          {amount}
        </b>
        {under && (
          <span
            data-testid="stub-under"
            className="type-caption text-[var(--color-muted-foreground)]"
          >
            {under}
          </span>
        )}
      </p>

      {/* `relative` so it sits above the card's whole-surface title link. A
          CTA underneath that overlay is a button nobody can press. */}
      <div className="relative w-full">{action}</div>
    </div>
  );
}

/** One punched hole where the perforation meets a card edge. */
function Notch({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute left-[-6px] h-3 w-3 rounded-full bg-[var(--color-surface-raised)] shadow-[0_0_0_1px_var(--color-border)] ${className}`}
    />
  );
}
```

- [ ] **Step 4: Add the CTA class the pages will share**

Append to the same file:

```tsx
/**
 * The stub's call to action, as a class rather than a component.
 *
 * Each page's CTA is a route-typed `<Link>` — `/services/$id` on one,
 * `/providers/$slug` on the other — and wrapping those in a shared component
 * would erase the typing that makes a broken link a build failure.
 *
 * `whitespace-nowrap`: "Pedir orçamento" wrapped onto two lines inside a
 * 196px rail and turned the button into a paragraph with a border.
 */
export function stubCtaClass(variant: "primary" | "quiet" = "primary"): string {
  const base =
    "font-rounded inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-field)] px-3.5 py-3 text-sm font-semibold transition-[background-color,transform]";
  return variant === "primary"
    ? `${base} bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:-translate-y-px hover:bg-[var(--color-primary-deep)]`
    : // Quiet, for "ask for a quote": it leads somewhere that cannot be paid
      // for yet, and a solid blue button beside a price of "to agree" promises
      // a checkout that does not exist.
      `${base} border border-[var(--color-border-strong)] bg-[var(--color-background)] text-[var(--color-foreground)] hover:border-[var(--color-foreground)] hover:bg-[var(--color-foreground)] hover:text-[var(--color-background)]`;
}
```

- [ ] **Step 5: Run it and watch it pass**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/price-stub.test.tsx
```

Expected: PASS, 7 tests. `ratingAriaLabel` already exists in `directory.json` — check its English value reads `"{{score}} out of 5, from {{count}} reviews"` and fix the test's expected string if it differs rather than editing the locale.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse/price-stub.tsx apps/frontend/web/src/shared/components/browse/__tests__/price-stub.test.tsx
git commit -m "feat(browse): the price rail, drawn as a ticket stub

The dashed rule and the punched notches are structural, not applied: what the
platform sells is a committed offer, and a stub is what one looks like. Every
optional slot collapses — most listings have no rating and no under-line."
```

---

### Task 5: `ListingMedia`

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/listing-media.tsx`
- Test: `apps/frontend/web/src/shared/components/browse/__tests__/listing-media.test.tsx`

**Interfaces:**
- Consumes: `placeholderHue`, `initialsOf` (Task 2).
- Produces:

```ts
export function ListingMedia(props: {
  imageUrl: string | null;
  /** Decides the placeholder's hue. The category code — a trade looks the same everywhere. */
  seed: string;
  /** The business's name; its initials are the placeholder's mark. */
  name: string;
  /** A Lucide icon name from the category's `icon` column, or null. */
  icon: string | null;
  /** `"4/3"` on the desktop row, `"16/10"` on the stacked card. */
  ratio?: "4/3" | "16/10";
  /** Top-left. "Most booked", "Urgent". */
  badge?: ReactNode;
  /** Top-right. Left empty by this plan; the favourites plan fills it. */
  favourite?: ReactNode;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/shared/components/browse/__tests__/listing-media.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListingMedia } from "../listing-media";

describe("ListingMedia", () => {
  it("shows the photograph when there is one", () => {
    render(<ListingMedia imageUrl="https://cdn/x.jpg" seed="hair" name="Estúdio Mavalane" icon="Scissors" />);
    expect(screen.getByRole("presentation")).toHaveAttribute("src", "https://cdn/x.jpg");
  });

  it("draws a generated tile rather than a broken image when there is none", () => {
    // Most listings have no photograph. A column of empty grey rectangles
    // reads as a broken page; a column of different tiles reads as a
    // catalogue.
    const { container } = render(
      <ListingMedia imageUrl={null} seed="hair" name="Estúdio Mavalane" icon="Scissors" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("EM")).toBeInTheDocument();
  });

  it("gives the same trade the same tile on both pages", () => {
    const a = render(<ListingMedia imageUrl={null} seed="plumbing" name="Canalizações Beira" icon="Wrench" />);
    const first = a.container.querySelector("[data-testid='listing-placeholder']")!.getAttribute("style");
    a.unmount();
    const b = render(<ListingMedia imageUrl={null} seed="plumbing" name="Outra Empresa" icon="Wrench" />);
    const second = b.container.querySelector("[data-testid='listing-placeholder']")!.getAttribute("style");
    expect(first).toBe(second);
  });

  it("still renders a tile for a category whose icon is unknown to this build", () => {
    // The icon name comes from a table an administrator edits, so the code
    // cannot know the set at build time. A hole in the grid reads as a bug.
    const { container } = render(
      <ListingMedia imageUrl={null} seed="hair" name="Estúdio" icon="NotARealLucideIcon" />,
    );
    expect(container.querySelector("[data-testid='listing-placeholder']")).not.toBeNull();
  });

  it("still renders a tile for a category with no icon at all", () => {
    const { container } = render(
      <ListingMedia imageUrl={null} seed="hair" name="Estúdio" icon={null} />,
    );
    expect(container.querySelector("[data-testid='listing-placeholder']")).not.toBeNull();
  });

  it("leaves no marker in the corners when nothing was passed for them", () => {
    // This plan ships with no favourite button; the slot must not reserve
    // visible space for one.
    const { container } = render(
      <ListingMedia imageUrl={null} seed="hair" name="Estúdio" icon="Scissors" />,
    );
    expect(container.querySelector("[data-testid='listing-badge']")).toBeNull();
    expect(container.querySelector("[data-testid='listing-favourite']")).toBeNull();
  });

  it("puts the badge top-left and the favourite top-right", () => {
    // Badges left, save right — the convention every listing product shares,
    // and getting it backwards makes both feel misplaced.
    const { container } = render(
      <ListingMedia
        imageUrl={null}
        seed="hair"
        name="Estúdio"
        icon="Scissors"
        badge={<span>Most booked</span>}
        favourite={<button type="button">Save</button>}
      />,
    );
    expect(container.querySelector("[data-testid='listing-badge']")?.className).toContain("left-");
    expect(container.querySelector("[data-testid='listing-favourite']")?.className).toContain("right-");
  });

  it("gives the image an empty alt, because the name is already beside it", () => {
    // Alt text repeating the heading is read twice by a screen reader and
    // says nothing new either time.
    render(<ListingMedia imageUrl="https://cdn/x.jpg" seed="hair" name="Estúdio" icon="Scissors" />);
    expect(screen.getByRole("presentation")).toHaveAttribute("alt", "");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/listing-media.test.tsx
```

Expected: FAIL — cannot resolve `../listing-media`.

- [ ] **Step 3: Write the component**

Create `apps/frontend/web/src/shared/components/browse/listing-media.tsx`:

```tsx
import type { ReactNode } from "react";
import { Tag, icons } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import {
  initialsOf,
  placeholderHue,
} from "@/shared/components/browse/domain/placeholder-tile";

/**
 * The picture end of a listing card.
 *
 * The fallback is generated rather than grey, and that is the whole reason
 * this component exists instead of an `<img>` with a background colour. Most
 * listings on this platform have no photograph — the placeholder is the
 * common case, not the exception — and a column of identical grey rectangles
 * reads as a page that failed to load.
 *
 * The tile's hue comes from the *category*, never from the listing's id: a
 * trade should look the same wherever it appears, and an id gives one plumber
 * a purple tile and the next a green one, which tells the reader nothing.
 */
export function ListingMedia({
  imageUrl,
  seed,
  name,
  icon,
  ratio = "4/3",
  badge,
  favourite,
}: {
  imageUrl: string | null;
  seed: string;
  name: string;
  icon: string | null;
  ratio?: "4/3" | "16/10";
  badge?: ReactNode;
  favourite?: ReactNode;
}) {
  const Icon = iconComponent(icon);
  const hue = placeholderHue(seed);

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--color-muted)]",
        ratio === "4/3" ? "aspect-[4/3] rounded-[var(--radius-card-sm)]" : "aspect-[16/10]",
      )}
    >
      {imageUrl ? (
        // `role="presentation"` follows from the empty alt; naming it here is
        // what lets a test find the element at all.
        <img
          src={imageUrl}
          alt=""
          role="presentation"
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          data-testid="listing-placeholder"
          className="grid h-full w-full place-items-center"
          // Inline, because the hue is computed per listing and Tailwind
          // cannot emit a class for a value it does not know at build time.
          // Two stops rather than a flat fill so the tile has a direction and
          // does not read as a swatch.
          style={{
            background: `linear-gradient(140deg, hsl(${hue} 62% 58%), hsl(${(hue + 22) % 360} 68% 40%))`,
          }}
        >
          <Icon
            className="absolute h-[58%] w-[58%] text-white opacity-20"
            aria-hidden="true"
            strokeWidth={1.4}
          />
          <span
            aria-hidden="true"
            className="font-rounded relative text-[1.6rem] font-semibold text-white/90"
          >
            {initialsOf(name)}
          </span>
        </span>
      )}

      {badge && (
        <span data-testid="listing-badge" className="absolute top-2.5 left-2.5 z-10">
          {badge}
        </span>
      )}
      {favourite && (
        <span data-testid="listing-favourite" className="absolute top-2.5 right-2.5 z-10">
          {favourite}
        </span>
      )}
    </div>
  );
}

/**
 * A Lucide name from the database, resolved to a component.
 *
 * Looked up rather than imported one by one: the set lives in a table an
 * administrator edits, so the code cannot know it at build time. An unknown or
 * missing name falls back to a tag rather than rendering nothing — a tile with
 * a hole in it reads as a broken image, which is the one thing the generated
 * placeholder exists to avoid.
 */
function iconComponent(name: string | null) {
  if (!name) return Tag;
  return icons[name as keyof typeof icons] ?? Tag;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/listing-media.test.tsx
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse/listing-media.tsx apps/frontend/web/src/shared/components/browse/__tests__/listing-media.test.tsx
git commit -m "feat(browse): a generated tile where a listing has no photograph

The placeholder is the common case on this platform, not the exception. Hue
from the category so a trade looks the same everywhere; initials and the
category's own icon so the tiles differ from each other."
```

---

### Task 6: `ListingCard`

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/listing-card.tsx`
- Test: `apps/frontend/web/src/shared/components/browse/__tests__/listing-card.test.tsx`

**Interfaces:**
- Consumes: `--shadow-xs`, `--shadow-lift` (Task 1).
- Produces:

```ts
/** Applied by each page to its own route-typed title `<Link>`. */
export const LISTING_TITLE_LINK_CLASS: string;

export function ListingCard(props: {
  media: ReactNode;      // a <ListingMedia>
  meta?: ReactNode;      // the small line above the title
  title: ReactNode;      // the page's typed <Link>, carrying LISTING_TITLE_LINK_CLASS
  subtitle?: ReactNode;
  description?: string | undefined;
  tags?: ReactNode;
  stub: ReactNode;       // a <PriceStub>
}): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/shared/components/browse/__tests__/listing-card.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LISTING_TITLE_LINK_CLASS, ListingCard } from "../listing-card";

const card = (over: Partial<Parameters<typeof ListingCard>[0]> = {}) => (
  <ul>
    <ListingCard
      media={<div data-testid="media" />}
      title={
        <h3>
          <a href="/services/1" className={LISTING_TITLE_LINK_CLASS}>
            Corte de cabelo
          </a>
        </h3>
      }
      stub={
        <div>
          <a href="/services/1">Book</a>
        </div>
      }
      {...over}
    />
  </ul>
);

describe("ListingCard", () => {
  it("is a list item, so a column of results is a list", () => {
    // A screen reader announces "list, 8 items" and lets the reader skip it.
    // A column of divs announces nothing at all.
    render(card());
    expect(screen.getByRole("listitem")).toBeInTheDocument();
  });

  it("gives the whole card one destination without swallowing the buttons", () => {
    // The card is not wrapped in an anchor: an anchor cannot legally contain
    // the CTA or the favourite button, and browsers resolve the nesting by
    // dropping one of them. The title's ::after covers the surface instead.
    const { container } = render(card());
    const title = screen.getByRole("link", { name: "Corte de cabelo" });
    expect(title.className).toContain("after:absolute");
    expect(container.querySelector("li > a")).toBeNull();
  });

  it("leaves both links reachable", () => {
    render(card());
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("omits the description element entirely when there is none", () => {
    // Most providers have written none. An empty <p> still occupies its line
    // height, which is a band of white inside every card that has no text.
    const { container } = render(card());
    expect(container.querySelector("[data-testid='listing-description']")).toBeNull();
  });

  it("clamps a long description rather than letting one card set the row height", () => {
    render(card({ description: "A very long description ".repeat(40) }));
    expect(screen.getByTestId("listing-description").className).toContain("line-clamp-2");
  });

  it("renders each optional slot only when given", () => {
    const { container } = render(card());
    expect(container.querySelector("[data-testid='listing-meta']")).toBeNull();
    expect(container.querySelector("[data-testid='listing-subtitle']")).toBeNull();
    expect(container.querySelector("[data-testid='listing-tags']")).toBeNull();
  });

  it("renders the optional slots when they are given", () => {
    render(
      card({
        meta: <span>45 min</span>,
        subtitle: <span>Estúdio Mavalane</span>,
        tags: <span>Beleza</span>,
      }),
    );
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(screen.getByText("Estúdio Mavalane")).toBeInTheDocument();
    expect(screen.getByText("Beleza")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/listing-card.test.tsx
```

Expected: FAIL — cannot resolve `../listing-card`.

- [ ] **Step 3: Write the component**

Create `apps/frontend/web/src/shared/components/browse/listing-card.tsx`:

```tsx
import type { ReactNode } from "react";

/**
 * The class each page puts on its own title `<Link>`.
 *
 * A class and not a component, because the two pages' links are typed against
 * two different routes — `/services/$id` and `/providers/$slug` — and wrapping
 * them in a shared component would erase the typing that turns a broken link
 * into a build failure.
 *
 * The `::after` spans the card, so the whole surface is the target while the
 * tab order gets a single stop named by the listing. The card itself is
 * deliberately NOT an anchor: an anchor cannot legally contain the CTA or the
 * favourite button, and every browser resolves that nesting by dropping one of
 * them.
 */
export const LISTING_TITLE_LINK_CLASS =
  "after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:outline-none";

/**
 * One result, on either browse.
 *
 * Three columns on the desktop — picture, what it is, what it costs — and one
 * stacked column on a phone, where the stub turns horizontal underneath the
 * body. See `PriceStub`, whose notches sit on the card's edges and are what
 * make the third column read as a stub rather than as a paragraph pushed
 * right.
 *
 * White on the page's tinted ground. That single relationship is what makes a
 * result an object: before it, white cards sat on a white page separated only
 * by a hairline, and a column of them read as a wireframe.
 *
 * Nothing here stretches. A stretched card puts its slack *inside* itself as a
 * band of white under the last line of text; sized to what it has to say, the
 * space falls between the cards instead. The page's `<ul>` carries
 * `items-start` for the same reason.
 */
export function ListingCard({
  media,
  meta,
  title,
  subtitle,
  description,
  tags,
  stub,
}: {
  media: ReactNode;
  meta?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  description?: string | undefined;
  tags?: ReactNode;
  stub: ReactNode;
}) {
  return (
    <li
      className={[
        "group relative grid gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)]",
        "bg-[var(--color-background)] p-4 shadow-[var(--shadow-xs)]",
        "transition-[border-color,box-shadow,transform] duration-200",
        "hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--color-primary)_34%,var(--color-border))]",
        "hover:shadow-[var(--shadow-lift)] focus-within:border-[var(--color-primary)]",
        // The stacked card first, the row from `md` up. `238px` for the
        // picture and `196px` for the stub are measured from the approved
        // mockup; between them the body gets whatever is left and never less
        // than zero — `minmax(0,1fr)`, because a bare `1fr` is
        // `minmax(auto,1fr)` and a long unbroken word would push the stub off
        // the card.
        "md:grid-cols-[238px_minmax(0,1fr)_196px] md:gap-5",
      ].join(" ")}
    >
      {media}

      <div className="flex min-w-0 flex-col gap-1.5 md:pt-0.5">
        {meta && (
          <p
            data-testid="listing-meta"
            className="type-caption flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--color-muted-foreground)]"
          >
            {meta}
          </p>
        )}

        {title}

        {subtitle && (
          <p data-testid="listing-subtitle" className="type-body-medium text-[var(--color-muted-foreground)]">
            {subtitle}
          </p>
        )}

        {description && (
          <p
            data-testid="listing-description"
            className="type-body-medium line-clamp-2 text-[var(--color-muted-foreground)]"
          >
            {description}
          </p>
        )}

        {/* `mt-auto` only inside the body column, which has a floor of its own
            from the picture beside it — this pushes the tags to the bottom of
            an already-sized card rather than stretching the card to fit. */}
        {tags && (
          <p data-testid="listing-tags" className="mt-auto flex flex-wrap gap-1.5 pt-1.5">
            {tags}
          </p>
        )}
      </div>

      {stub}
    </li>
  );
}

/**
 * One fact about a listing, as a chip.
 *
 * `tone` names what the chip is *for*, not what colour it is: `category` is
 * the trade, `plain` is a neutral fact, `good` is a trust signal the platform
 * itself vouches for. A caller asking for "green" would be deciding a thing
 * this component exists to decide.
 */
export function ListingTag({
  tone = "plain",
  children,
}: {
  tone?: "plain" | "category" | "good";
  children: ReactNode;
}) {
  const styles = {
    plain: "bg-[var(--color-surface-raised)] text-[var(--color-muted-foreground)]",
    category:
      "bg-[color-mix(in_srgb,var(--color-primary)_9%,transparent)] font-semibold text-[var(--color-primary)]",
    good: "bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] font-semibold text-[color-mix(in_srgb,var(--color-success)_78%,var(--color-foreground))] inline-flex items-center gap-1.5",
  } as const;
  return (
    <span className={`type-caption rounded-[7px] px-2.5 py-1 ${styles[tone]}`}>{children}</span>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/listing-card.test.tsx
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse/listing-card.tsx apps/frontend/web/src/shared/components/browse/__tests__/listing-card.test.tsx
git commit -m "feat(browse): the listing card shell, one destination and two buttons

The card is not an anchor — an anchor cannot contain the CTA, and browsers
resolve that nesting by dropping one of them. The title's ::after covers the
surface instead, so the keyboard gets one stop and both buttons still work."
```

---

### Task 7: `CategoryRail`

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/category-rail.tsx`
- Test: `apps/frontend/web/src/shared/components/browse/__tests__/category-rail.test.tsx`

**Interfaces:**
- Consumes: `--color-surface-raised` (Task 1).
- Produces:
  - `CategoryRail(props: { label: string; children: ReactNode }): JSX.Element`
  - `categoryChipClass(active: boolean): string`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/shared/components/browse/__tests__/category-rail.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategoryRail, categoryChipClass } from "../category-rail";

describe("CategoryRail", () => {
  it("is navigation, and says what it navigates", () => {
    // An unnamed <nav> in a page that already has two others is three
    // identical landmarks a screen-reader user has to open to tell apart.
    render(
      <CategoryRail label="Filter by category">
        <a href="/services">All</a>
      </CategoryRail>,
    );
    expect(screen.getByRole("navigation", { name: "Filter by category" })).toBeInTheDocument();
  });

  it("keeps the chips on one line rather than wrapping to a second row", () => {
    // A band that grows taller pushes the results down by a different amount
    // at every screen width, and the categories past the fold are the rarer
    // ones.
    const { container } = render(
      <CategoryRail label="Filter by category">
        <a href="/services">All</a>
      </CategoryRail>,
    );
    const scroller = container.querySelector("[data-testid='rail-scroller']")!;
    expect(scroller.className).toContain("overflow-x-auto");
    expect(scroller.className).not.toContain("flex-wrap");
  });

  it("hides its scroll arrows from assistive technology", () => {
    // They scroll a container a keyboard user reaches with the arrow keys
    // anyway; announcing them adds two stops that do nothing new.
    const { container } = render(
      <CategoryRail label="Filter by category">
        <a href="/services">All</a>
      </CategoryRail>,
    );
    for (const arrow of container.querySelectorAll("[data-testid^='rail-arrow']")) {
      expect(arrow).toHaveAttribute("aria-hidden", "true");
      expect(arrow).toHaveAttribute("tabindex", "-1");
    }
  });
});

describe("categoryChipClass", () => {
  it("distinguishes the chosen category from the rest", () => {
    expect(categoryChipClass(true)).not.toBe(categoryChipClass(false));
  });

  it("does not change the chip's box when it is chosen", () => {
    // A selected chip that gains a border width shifts every chip after it,
    // and the whole row jumps sideways as the selection moves.
    const on = categoryChipClass(true);
    const off = categoryChipClass(false);
    for (const boxAffecting of ["px-4", "py-2", "border"]) {
      expect(on.includes(boxAffecting)).toBe(off.includes(boxAffecting));
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/category-rail.test.tsx
```

Expected: FAIL — cannot resolve `../category-rail`.

- [ ] **Step 3: Write the component**

Create `apps/frontend/web/src/shared/components/browse/category-rail.tsx`:

```tsx
import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** How far one press of an arrow moves the rail. */
const SCROLL_STEP = 320;

/**
 * The categories, as a band under the hero.
 *
 * Navigation between whole result sets — the same weight as the site header
 * above it — rather than one control among several inside the results. The
 * facets narrow a list; this changes which list.
 *
 * It scrolls sideways rather than wrapping: a band that grows to two rows
 * pushes the results down by a different amount at every screen width, and the
 * categories past the fold are the rarer ones.
 *
 * On the page's tinted ground, not on white. The band being white made three
 * white surfaces stack — header, search card, rail — and the search card,
 * which overlaps this band's top edge, disappeared into it.
 *
 * The fades and the arrows are the difference between a scroll container and a
 * finished one: without them the row simply ends mid-chip, which reads as a
 * clipping bug rather than as more content.
 */
export function CategoryRail({ label, children }: { label: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const nudge = (by: number) => scroller.current?.scrollBy({ left: by, behavior: "smooth" });

  return (
    <nav
      aria-label={label}
      className="relative border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]"
    >
      <Fade side="left" />
      <Fade side="right" />

      <RailArrow side="left" onClick={() => nudge(-SCROLL_STEP)} />
      <RailArrow side="right" onClick={() => nudge(SCROLL_STEP)} />

      <div
        ref={scroller}
        data-testid="rail-scroller"
        className="page-shell flex gap-2 overflow-x-auto py-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </nav>
  );
}

function Fade({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "pointer-events-none absolute inset-y-0 z-10 w-14",
        side === "left"
          ? "left-0 bg-gradient-to-r from-[var(--color-surface-raised)] to-transparent"
          : "right-0 bg-gradient-to-l from-[var(--color-surface-raised)] to-transparent",
      ].join(" ")}
    />
  );
}

/**
 * Hidden from assistive technology and out of the tab order on purpose.
 *
 * A keyboard reader reaches every chip by tabbing, and the container scrolls to
 * follow focus; two extra stops that scroll a list they are already walking
 * add nothing. This is a mouse affordance, and only a mouse affordance —
 * which is also why it is drawn only from `sm` up.
 */
function RailArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      data-testid={`rail-arrow-${side}`}
      aria-hidden="true"
      tabIndex={-1}
      onClick={onClick}
      className={[
        "absolute top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full sm:grid",
        "border border-[var(--color-border)] bg-[var(--color-background)] shadow-[var(--shadow-sm)]",
        "transition-colors hover:border-[var(--color-muted-foreground)]",
        side === "left" ? "left-3" : "right-3",
      ].join(" ")}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/**
 * One category chip.
 *
 * The chosen state changes colour only — never the border width, never the
 * padding. A selected chip that grows shifts every chip after it, and the
 * whole row jumps sideways as the selection moves.
 */
export function categoryChipClass(active: boolean): string {
  const base =
    "type-body-medium shrink-0 whitespace-nowrap rounded-full border px-4 py-2 transition-colors";
  return active
    ? `${base} border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_9%,transparent)] font-semibold text-[var(--color-primary)]`
    : `${base} border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] hover:border-[var(--color-muted-foreground)]`;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/category-rail.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse/category-rail.tsx apps/frontend/web/src/shared/components/browse/__tests__/category-rail.test.tsx
git commit -m "feat(browse): one category rail for both pages, with fades and arrows

Replaces two near-identical bands. It scrolls rather than wrapping — a band
that grows to two rows moves the results by a different amount at every width."
```

---

### Task 8: `FacetPanel`

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/facet-panel.tsx`
- Test: `apps/frontend/web/src/shared/components/browse/__tests__/facet-panel.test.tsx`

**Interfaces:**
- Consumes: `--color-border-strong` (Task 1).
- Produces:
  - `FacetPanel(props: { title: string; clear?: ReactNode; children: ReactNode })`
  - `FacetGroup(props: { icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>; label: string; hint?: string; children: ReactNode })`
  - `FacetBox(props: { active: boolean })`
  - `FacetCount(props: { value: number })`
  - `facetOptionClass(active: boolean): string`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/shared/components/browse/__tests__/facet-panel.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapPin } from "lucide-react";
import { FacetBox, FacetCount, FacetGroup, FacetPanel, facetOptionClass } from "../facet-panel";

describe("FacetPanel", () => {
  it("names itself, so the sidebar is not an unlabelled column of headings", () => {
    render(
      <FacetPanel title="Filters">
        <p>body</p>
      </FacetPanel>,
    );
    expect(screen.getByRole("heading", { name: "Filters" })).toBeInTheDocument();
  });

  it("offers no clear-all when nothing was passed for it", () => {
    // "Clear all" beside no active filter is a control whose only outcome is
    // the page you are already on.
    render(
      <FacetPanel title="Filters">
        <p>body</p>
      </FacetPanel>,
    );
    expect(screen.queryByText("Clear all")).not.toBeInTheDocument();
  });

  it("shows the clear-all the caller passed", () => {
    render(
      <FacetPanel title="Filters" clear={<a href="/services">Clear all</a>}>
        <p>body</p>
      </FacetPanel>,
    );
    expect(screen.getByRole("link", { name: "Clear all" })).toBeInTheDocument();
  });
});

describe("FacetGroup", () => {
  it("opens by default, because a collapsed panel hides what the reader came for", () => {
    const { container } = render(
      <FacetGroup icon={MapPin} label="City">
        <a href="/x">Maputo</a>
      </FacetGroup>,
    );
    expect(container.querySelector("details")).toHaveAttribute("open");
  });

  it("uses <details>, so it opens with no JavaScript and announces correctly", () => {
    // Server-rendered first paint, keyboard-operable, and correct to a screen
    // reader without a line of ARIA — all of which a hand-rolled disclosure
    // would need a hook and an aria-expanded to approximate.
    const { container } = render(
      <FacetGroup icon={MapPin} label="City">
        <a href="/x">Maputo</a>
      </FacetGroup>,
    );
    expect(container.querySelector("details > summary")).not.toBeNull();
  });

  it("shows a hint only where one was given", () => {
    const { container } = render(
      <FacetGroup icon={MapPin} label="City">
        <a href="/x">Maputo</a>
      </FacetGroup>,
    );
    expect(container.querySelector("[data-testid='facet-hint']")).toBeNull();
  });
});

describe("facetOptionClass and FacetBox", () => {
  it("marks the chosen option without changing its box", () => {
    // A row that gains weight or padding when chosen shifts every row under
    // it, and the list jumps as the reader clicks down it.
    const on = facetOptionClass(true);
    const off = facetOptionClass(false);
    expect(on).not.toBe(off);
    for (const boxAffecting of ["py-1.5", "gap-3"]) {
      expect(on.includes(boxAffecting)).toBe(off.includes(boxAffecting));
    }
  });

  it("hides the tick box from assistive technology", () => {
    // The option is a link carrying aria-pressed. A checkbox role on top of
    // that announces one control twice, in two contradictory ways.
    const { container } = render(<FacetBox active />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("renders a count as a number beside the label", () => {
    render(<FacetCount value={7} />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("lines counts up in a column", () => {
    // A column of counts that do not align is a column nobody can compare.
    const { container } = render(<FacetCount value={7} />);
    expect(container.firstElementChild?.className).toContain("tabular-nums");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/facet-panel.test.tsx
```

Expected: FAIL — cannot resolve `../facet-panel`.

- [ ] **Step 3: Write the component**

Create `apps/frontend/web/src/shared/components/browse/facet-panel.tsx`:

```tsx
import { ChevronDown } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

/**
 * The browse sidebar.
 *
 * No card around it, unlike the tinted `FilterPanelCard` it replaces. That one
 * existed because the filters floated on a white page with nothing to sit on;
 * now the whole page is tinted and the results beside it are white cards, so a
 * second tinted panel would be a surface competing with the hero above it. The
 * sidebar is background, the results are content, and that is the hierarchy.
 */
export function FacetPanel({
  title,
  clear,
  children,
}: {
  title: string;
  /** The page's own "clear all" `<Link>`. Absent when nothing is narrowing. */
  clear?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid">
      <div className="flex items-baseline justify-between gap-3 pb-3">
        <h2 className="font-rounded text-base font-semibold">{title}</h2>
        {clear}
      </div>
      {children}
    </div>
  );
}

/**
 * One group of options.
 *
 * `<details>`, not React state. It opens and closes with no JavaScript, it is
 * keyboard-operable and announced correctly without a line of ARIA, and the
 * chevron turns on `[open]` in CSS — everything a hand-rolled disclosure would
 * have needed a hook, two handlers and an `aria-expanded` to get right, and
 * would have got wrong on the server-rendered first paint.
 *
 * Open by default: a panel that starts collapsed hides what the reader came to
 * use and turns one click into two for every filter on the page.
 */
export function FacetGroup({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  /** A line under the heading, where the label alone would overclaim. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <details
      open
      className="group/facet border-t border-[var(--color-border)] py-4 first:border-t-0 first:pt-0"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold tracking-[0.05em] text-[var(--color-muted-foreground)] uppercase [&::-webkit-details-marker]:hidden">
        <Icon className="h-3.5 w-3.5" aria-hidden={true} />
        {label}
        <ChevronDown
          aria-hidden="true"
          className="ml-auto h-4 w-4 transition-transform group-open/facet:rotate-180"
        />
      </summary>
      {hint && (
        <p data-testid="facet-hint" className="type-caption mt-2 text-[var(--color-muted-foreground)]">
          {hint}
        </p>
      )}
      <div className="mt-3 grid">{children}</div>
    </details>
  );
}

/**
 * One option row.
 *
 * A class rather than a component, for the same reason `LISTING_TITLE_LINK_CLASS`
 * is: the row is a route-typed `<Link>` owned by its page.
 *
 * The row stays a link and carries `aria-pressed`, so it announces as a toggle
 * button in a pressed or unpressed state. It is deliberately NOT given a
 * checkbox role: it navigates, a filtered list is a URL somebody can send, and
 * the back button undoes it — none of which a real checkbox does. The box
 * beside the label is a picture of that state and nothing more.
 */
export function facetOptionClass(active: boolean): string {
  const base =
    "type-body-medium flex items-center gap-3 py-1.5 text-[var(--color-foreground)] transition-colors";
  return active ? `${base} font-semibold` : `${base} hover:text-[var(--color-primary)]`;
}

/** The tick box. Hidden from assistive technology — the link's `aria-pressed` already says this. */
export function FacetBox({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] border-[1.5px] transition-colors",
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
          : "border-[var(--color-border-strong)] bg-[var(--color-background)]",
      ].join(" ")}
    >
      {active && (
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor">
          <path
            d="m4 12 5.5 5.5L20 7"
            stroke="var(--color-primary-foreground)"
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

/**
 * How many results an option would leave.
 *
 * Optional throughout, and absent on most groups: only the city facets are
 * counted server-side today. A group without counts renders identically minus
 * this element, so adding counts later moves nothing.
 */
export function FacetCount({ value }: { value: number }) {
  return (
    <span className="type-caption ml-auto tabular-nums text-[var(--color-muted-foreground)]">
      {value}
    </span>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/facet-panel.test.tsx
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse/facet-panel.tsx apps/frontend/web/src/shared/components/browse/__tests__/facet-panel.test.tsx
git commit -m "feat(browse): facets as checkbox-shaped links, on the ground rather than in a card

The row stays a link — a filtered list is a URL, and the back button should
undo a filter — and carries aria-pressed. The box is a picture of that state,
hidden from assistive technology so one control is not announced twice."
```

---

### Task 9: `ResultsBar` and `ActiveFilterChips`

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/results-bar.tsx`
- Create: `apps/frontend/web/src/shared/components/browse/active-filter-chips.tsx`
- Test: `apps/frontend/web/src/shared/components/browse/__tests__/results-bar.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `ResultsBar(props: { summary: ReactNode; sortLabel: string; children: ReactNode })`
  - `segmentClass(active: boolean): string`
  - `ActiveFilterChips(props: { label: string; children: ReactNode })`
  - `ActiveFilterChip(props: { label: string; remove: ReactNode })`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/shared/components/browse/__tests__/results-bar.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultsBar, segmentClass } from "../results-bar";
import { ActiveFilterChip, ActiveFilterChips } from "../active-filter-chips";

describe("ResultsBar", () => {
  it("states how many results there are, not how many fit on this page", () => {
    render(
      <ResultsBar summary={<span>8 services in all categories</span>} sortLabel="Sort">
        <a href="/services">Suggested</a>
      </ResultsBar>,
    );
    expect(screen.getByText("8 services in all categories")).toBeInTheDocument();
  });

  it("names the sort control, so it is not an unlabelled row of links", () => {
    render(
      <ResultsBar summary={<span>8 services</span>} sortLabel="Sort">
        <a href="/services">Suggested</a>
      </ResultsBar>,
    );
    expect(screen.getByRole("navigation", { name: "Sort" })).toBeInTheDocument();
  });

  it("lets the sort scroll sideways rather than wrapping under the count", () => {
    // Five orders at 360px wrap to a second row and push the first result off
    // the screen.
    const { container } = render(
      <ResultsBar summary={<span>8</span>} sortLabel="Sort">
        <a href="/services">Suggested</a>
      </ResultsBar>,
    );
    expect(screen.getByRole("navigation", { name: "Sort" }).className).toContain("overflow-x-auto");
    expect(container.firstElementChild?.className).not.toContain("flex-wrap");
  });
});

describe("segmentClass", () => {
  it("distinguishes the active order", () => {
    expect(segmentClass(true)).not.toBe(segmentClass(false));
  });
});

describe("ActiveFilterChips", () => {
  it("names the row, so it is not an anonymous strip of buttons", () => {
    render(
      <ActiveFilterChips label="Active filters">
        <ActiveFilterChip label="At your place" remove={<a href="/services">×</a>} />
      </ActiveFilterChips>,
    );
    expect(screen.getByRole("list", { name: "Active filters" })).toBeInTheDocument();
  });

  it("gives every chip its own way off", () => {
    // This is the hole in the design it replaces: there was no way to see
    // what was on, and no way to take one thing off without clearing all.
    render(
      <ActiveFilterChips label="Active filters">
        <ActiveFilterChip label="At your place" remove={<a href="/services?a">×</a>} />
        <ActiveFilterChip label="500 – 5000 MZN" remove={<a href="/services?b">×</a>} />
      </ActiveFilterChips>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("keeps the label beside the control that removes it", () => {
    render(
      <ActiveFilterChips label="Active filters">
        <ActiveFilterChip label="At your place" remove={<a href="/services">×</a>} />
      </ActiveFilterChips>,
    );
    expect(screen.getByText("At your place")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/results-bar.test.tsx
```

Expected: FAIL — cannot resolve `../results-bar`.

- [ ] **Step 3: Write `results-bar.tsx`**

```tsx
import type { ReactNode } from "react";

/**
 * The line between the filters and the first result.
 *
 * It answers two questions and no others: how many results there are, and what
 * order they are in. The count states the *total*, never the length of this
 * page — `items.length` told somebody with 40 matches that they had 24, which
 * is the page size talking rather than the search.
 */
export function ResultsBar({
  summary,
  sortLabel,
  children,
}: {
  summary: ReactNode;
  /** Names the sort control for assistive technology. */
  sortLabel: string;
  /** The page's own route-typed sort `<Link>`s. */
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="type-body text-[var(--color-muted-foreground)]">{summary}</p>
      {/* Scrolls rather than wraps. Five orders at 360px wrap onto a second
          row and push the first result off the screen. */}
      <nav
        aria-label={sortLabel}
        className="flex shrink-0 gap-1 overflow-x-auto rounded-full border border-[var(--color-border)] bg-[var(--color-background)] p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </nav>
    </div>
  );
}

/**
 * One order, as a segment of the control.
 *
 * The active one is filled with the foreground colour rather than the brand
 * blue: the CTA on every card below is brand blue, and a sort pill in the same
 * colour reads as a second call to action rather than as a setting.
 */
export function segmentClass(active: boolean): string {
  const base =
    "type-body-medium whitespace-nowrap rounded-full px-4 py-1.5 transition-colors";
  return active
    ? `${base} bg-[var(--color-foreground)] font-semibold text-[var(--color-background)]`
    : `${base} text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]`;
}
```

- [ ] **Step 4: Write `active-filter-chips.tsx`**

```tsx
import type { ReactNode } from "react";

/**
 * Everything currently narrowing the list, each with its own way off.
 *
 * The hole this fills is the one the reference design also had: a reader could
 * set five filters and then had no way to see what was on, and no way to take
 * one off without going back to the sidebar and hunting for it. On a phone,
 * where the sidebar lives behind a sheet, that was the whole story.
 *
 * A `<ul>`, so it announces as "list, 3 items" and can be skipped.
 */
export function ActiveFilterChips({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="flex list-none flex-wrap items-center gap-2 p-0">
      {children}
    </ul>
  );
}

/**
 * One narrowing.
 *
 * `remove` is the page's own `<Link>` back to the same URL without this one
 * parameter — built by `browseSearch`/`directorySearch` so it drops exactly
 * this filter and keeps every other.
 */
export function ActiveFilterChip({ label, remove }: { label: string; remove: ReactNode }) {
  return (
    <li className="type-caption inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] py-1.5 pr-1.5 pl-3.5 font-medium shadow-[var(--shadow-xs)]">
      {label}
      {remove}
    </li>
  );
}

/** The class the page puts on the chip's own remove `<Link>`. */
export const CHIP_REMOVE_CLASS =
  "grid h-[18px] w-[18px] place-items-center rounded-full bg-[var(--color-surface-raised)] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-foreground)] hover:text-[var(--color-background)]";
```

- [ ] **Step 5: Run it and watch it pass**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/results-bar.test.tsx
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse/results-bar.tsx apps/frontend/web/src/shared/components/browse/active-filter-chips.tsx apps/frontend/web/src/shared/components/browse/__tests__/results-bar.test.tsx
git commit -m "feat(browse): the results bar, and chips for what is currently narrowing

The chips are the hole in the reference design: five filters on, no way to see
which, and no way to remove one without clearing all — worst on a phone, where
the sidebar lives behind a sheet."
```

---

### Task 10: `Pager`

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/pager.tsx`
- Test: `apps/frontend/web/src/shared/components/browse/__tests__/pager.test.tsx`

**Interfaces:**
- Consumes: `pageNumbers`, `PageSlot` (Task 3).
- Produces:

```ts
export function Pager(props: {
  total: number;
  pageSize: number;
  offset: number;
  label: string;
  /** The page's own route-typed <Link> for one slot. */
  renderPage: (slot: Exclude<PageSlot, "gap">) => ReactNode;
  previous?: ReactNode;
  next?: ReactNode;
}): JSX.Element | null;

export function pagerPageClass(current: boolean): string;
```

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/shared/components/browse/__tests__/pager.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Pager } from "../pager";

const renderPage = (slot: { page: number; offset: number; current: boolean }) => (
  <a key={slot.page} href={`/services?offset=${slot.offset}`} aria-current={slot.current ? "page" : undefined}>
    {slot.page}
  </a>
);

describe("Pager", () => {
  it("renders nothing at all when everything fits on one page", () => {
    // Drawing "1" alone makes an eight-result search look truncated.
    const { container } = render(
      <Pager total={8} pageSize={24} offset={0} label="Pages" renderPage={renderPage} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("names itself, so it is not a third unlabelled nav on the page", () => {
    render(<Pager total={96} pageSize={24} offset={0} label="Pages" renderPage={renderPage} />);
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
  });

  it("marks the current page for assistive technology, not only in colour", () => {
    render(<Pager total={96} pageSize={24} offset={48} label="Pages" renderPage={renderPage} />);
    expect(screen.getByRole("link", { current: "page" })).toHaveTextContent("3");
  });

  it("draws an ellipsis that is not a link", () => {
    // A "…" a keyboard user can focus is a stop that goes nowhere.
    render(<Pager total={480} pageSize={24} offset={216} label="Pages" renderPage={renderPage} />);
    const gaps = screen.getAllByText("…");
    expect(gaps).toHaveLength(2);
    for (const gap of gaps) expect(gap.tagName).not.toBe("A");
  });

  it("shows only the edges the reader can actually reach", () => {
    // "Previous" on page one is a control whose only outcome is the page you
    // are on. Each page passes its own edges, and passes nothing at the ends.
    render(
      <Pager
        total={96}
        pageSize={24}
        offset={0}
        label="Pages"
        renderPage={renderPage}
        next={<a href="/services?offset=24">Next</a>}
      />,
    );
    expect(screen.queryByText("Previous")).not.toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/pager.test.tsx
```

Expected: FAIL — cannot resolve `../pager`.

- [ ] **Step 3: Write the component**

Create `apps/frontend/web/src/shared/components/browse/pager.tsx`:

```tsx
import type { ReactNode } from "react";
import {
  pageNumbers,
  type PageSlot,
} from "@/shared/components/browse/domain/page-numbers";

/**
 * Numbered paging.
 *
 * Replaces a bare previous/next pair, which could say how to step but never
 * how far there was to go — a reader on page one of eight had no way to learn
 * there were eight. It became possible only once both listings returned a
 * `total`.
 *
 * `renderPage` rather than a `to`/`search` pair: each page's links are typed
 * against its own route and its own search model, and a shared component that
 * built them would have to erase both.
 */
export function Pager({
  total,
  pageSize,
  offset,
  label,
  renderPage,
  previous,
  next,
}: {
  total: number;
  pageSize: number;
  offset: number;
  label: string;
  renderPage: (slot: Exclude<PageSlot, "gap">) => ReactNode;
  previous?: ReactNode;
  next?: ReactNode;
}) {
  const slots = pageNumbers(total, pageSize, offset);
  if (slots.length === 0) return null;

  return (
    <nav aria-label={label} className="flex items-center justify-center gap-1.5 pt-9">
      {previous}
      {slots.map((slot, i) =>
        slot === "gap" ? (
          // Not a link, and not focusable: a "…" a keyboard user can reach is
          // a tab stop that goes nowhere.
          <span
            // Index is the only stable identity a gap has — there is no page
            // number behind it, and two gaps in one pager are indistinguishable.
            key={`gap-${String(i)}`}
            aria-hidden="true"
            className="type-body-medium grid h-9 w-9 place-items-center text-[var(--color-muted-foreground)]"
          >
            …
          </span>
        ) : (
          renderPage(slot)
        ),
      )}
      {next}
    </nav>
  );
}

/**
 * One page number.
 *
 * The current page is filled, matching the sort segments rather than the CTA:
 * both are "which of these is on", and neither is an action.
 */
export function pagerPageClass(current: boolean): string {
  const base =
    "type-body-medium grid h-9 min-w-9 place-items-center rounded-[10px] border px-2.5 transition-colors";
  return current
    ? `${base} border-[var(--color-foreground)] bg-[var(--color-foreground)] font-semibold text-[var(--color-background)]`
    : `${base} border-transparent text-[var(--color-muted-foreground)] hover:border-[var(--color-border)] hover:bg-[var(--color-background)] hover:text-[var(--color-foreground)]`;
}

/** "Previous" / "Next", which are wider than a number and read as words. */
export const PAGER_EDGE_CLASS =
  "type-body-medium grid h-9 place-items-center rounded-[10px] border border-[var(--color-border)] bg-[var(--color-background)] px-4 transition-colors hover:border-[var(--color-muted-foreground)]";
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/pager.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse/pager.tsx apps/frontend/web/src/shared/components/browse/__tests__/pager.test.tsx
git commit -m "feat(browse): numbered paging, possible now that both listings return a total

Previous/next could say how to step but never how far there was to go."
```

---

### Task 11: `BrowseHero` and the search card

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/browse-hero.tsx`
- Test: `apps/frontend/web/src/shared/components/browse/__tests__/browse-hero.test.tsx`

**Interfaces:**
- Consumes: `--color-surface-raised`, `--color-primary-deep`, `--shadow-float`, `.type-display` (Task 1).
- Produces:
  - `BrowseHero(props: { kicker?: { badge: string; body: string }; title: string; subtitle: string; search: ReactNode })`
  - `BrowseSearchCard(props: { action: ReactNode; children: ReactNode })`
  - `BrowseSearchField(props: { icon; label: string; value: string; onClick?: () => void })`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/shared/components/browse/__tests__/browse-hero.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Search } from "lucide-react";
import { BrowseHero, BrowseSearchCard, BrowseSearchField } from "../browse-hero";

const hero = (over: Partial<Parameters<typeof BrowseHero>[0]> = {}) => (
  <BrowseHero
    title="Services ready to book"
    subtitle="Price and duration settled up front."
    search={<div data-testid="search" />}
    {...over}
  />
);

describe("BrowseHero", () => {
  it("carries the page's only h1", () => {
    // These pages are built to rank. Two h1s, or none, is the one structural
    // mistake that costs on a page whose whole job is to be found.
    render(hero());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Services ready to book");
  });

  it("does not clip what deliberately hangs out of it", () => {
    // `overflow: hidden` to contain the halo cut the search card in half —
    // and the search card exists precisely to escape the band. The halo is
    // sized inside the hero instead. This was hit and fixed in the mockup.
    const { container } = render(hero());
    expect(container.firstElementChild?.className).not.toContain("overflow-hidden");
  });

  it("renders no kicker when none was given", () => {
    const { container } = render(hero());
    expect(container.querySelector("[data-testid='hero-kicker']")).toBeNull();
  });

  it("renders the kicker when one was given", () => {
    render(hero({ kicker: { badge: "No haggling", body: "price settled before you book" } }));
    expect(screen.getByText("No haggling")).toBeInTheDocument();
    expect(screen.getByText("price settled before you book")).toBeInTheDocument();
  });
});

describe("BrowseSearchCard", () => {
  it("is a search landmark", () => {
    render(
      <BrowseSearchCard action={<button type="submit">Search</button>}>
        <BrowseSearchField icon={Search} label="Service" value="What do you need?" />
      </BrowseSearchCard>,
    );
    expect(screen.getByRole("search")).toBeInTheDocument();
  });

  it("labels each field, so the fields are not two identical boxes", () => {
    render(
      <BrowseSearchCard action={<button type="submit">Search</button>}>
        <BrowseSearchField icon={Search} label="Service" value="What do you need?" />
        <BrowseSearchField icon={Search} label="City" value="Maputo, Matola…" />
      </BrowseSearchCard>,
    );
    expect(screen.getByText("Service")).toBeInTheDocument();
    expect(screen.getByText("City")).toBeInTheDocument();
  });

  it("stacks on a phone rather than squeezing three controls into 360px", () => {
    const { container } = render(
      <BrowseSearchCard action={<button type="submit">Search</button>}>
        <BrowseSearchField icon={Search} label="Service" value="What do you need?" />
      </BrowseSearchCard>,
    );
    const grid = container.querySelector("[data-testid='search-grid']")!;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("md:grid-cols-");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/browse-hero.test.tsx
```

Expected: FAIL — cannot resolve `../browse-hero`.

- [ ] **Step 3: Write the component**

Create `apps/frontend/web/src/shared/components/browse/browse-hero.tsx`:

```tsx
import type { ComponentType, ReactNode } from "react";

/**
 * The head of a browse page.
 *
 * The listings had none: `/services` went from the site header straight to a
 * category band, and `/providers` put an `h1` inside the content column beside
 * the filters. Neither page had a face, and neither said what it was for.
 *
 * **No `overflow: hidden`.** The halo below wants clipping and the search card
 * exists to escape the band — the first version clipped the card in half. The
 * halo is therefore sized to sit inside the hero rather than the hero clipping
 * its children.
 */
export function BrowseHero({
  kicker,
  title,
  subtitle,
  search,
}: {
  kicker?: { badge: string; body: string };
  title: string;
  subtitle: string;
  /** A `BrowseSearchCard`. It straddles the hero's bottom edge onto the rail below. */
  search: ReactNode;
}) {
  return (
    <section className="relative bg-[var(--color-surface-raised)] pt-14">
      {/* Inside the hero, top-aligned — see the note above. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[300px] bg-[radial-gradient(58%_100%_at_50%_0%,color-mix(in_srgb,var(--color-primary)_16%,transparent)_0%,transparent_72%)]"
      />

      <div className="page-shell relative">
        <div className="mx-auto max-w-[44rem] text-center">
          {kicker && (
            <p
              data-testid="hero-kicker"
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] py-1.5 pr-4 pl-2 shadow-[var(--shadow-xs)]"
            >
              <b className="rounded-full bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] text-[var(--color-primary)] uppercase">
                {kicker.badge}
              </b>
              <span className="type-caption text-[var(--color-muted-foreground)]">{kicker.body}</span>
            </p>
          )}

          <h1 className="type-display mx-auto max-w-[20ch]">{title}</h1>
          <p className="type-body mt-3 text-[var(--color-muted-foreground)]">{subtitle}</p>
        </div>

        {/* The negative margin plus the spacer below is what makes the card
            straddle the boundary onto the rail rather than float above it. */}
        <div className="relative mx-auto mt-8 -mb-[42px] max-w-[1000px]">{search}</div>
        <div className="h-[26px]" aria-hidden="true" />
      </div>
    </section>
  );
}

/**
 * The search card the hero carries.
 *
 * A `role="search"` form, not a row of buttons: it is the page's primary
 * control and a screen-reader user should be able to jump straight to it.
 *
 * One column on a phone. Two fields and a button squeezed into 360px is a
 * control nobody completes; on a phone each page renders a single collapsed
 * field that opens a full-screen sheet instead (Task 18).
 */
export function BrowseSearchCard({
  action,
  children,
}: {
  /** The submit button. */
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <form
      role="search"
      className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-2 shadow-[var(--shadow-float)]"
    >
      <div
        data-testid="search-grid"
        className="grid grid-cols-1 items-stretch gap-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
      >
        {children}
        {action}
      </div>
    </form>
  );
}

/**
 * One field of the search card.
 *
 * A button rather than an `<input>`: both fields open something — a suggestion
 * list, a city picker — and an input that does nothing until you click it
 * anyway is a text box that lies about being one.
 */
export function BrowseSearchField({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  /** What is chosen, or the placeholder when nothing is. */
  value: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-[var(--radius-card-sm)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-raised)] md:border-l md:border-[var(--color-border)] md:first:border-l-0"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--color-muted)] text-[var(--color-primary)]">
        <Icon className="h-4 w-4" aria-hidden={true} />
      </span>
      <span className="grid min-w-0">
        <b className="type-body-medium font-semibold">{label}</b>
        <span className="type-body-medium truncate text-[var(--color-muted-foreground)]">
          {value}
        </span>
      </span>
    </button>
  );
}

/** The search card's submit button. */
export const SEARCH_SUBMIT_CLASS =
  "font-rounded inline-flex items-center justify-center gap-2 rounded-[var(--radius-card-sm)] bg-[var(--color-primary)] px-10 py-3.5 text-[15px] font-semibold text-[var(--color-primary-foreground)] transition-colors hover:bg-[var(--color-primary-deep)]";
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd apps/frontend/web && bun run vitest run src/shared/components/browse/__tests__/browse-hero.test.tsx
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse/browse-hero.tsx apps/frontend/web/src/shared/components/browse/__tests__/browse-hero.test.tsx
git commit -m "feat(browse): a page head, with the search card straddling its bottom edge

No overflow:hidden on the hero — it clipped the card that exists to escape the
band. The halo is sized inside the hero instead."
```

---

### Task 12: The page title, composed from the filters

**Files:**
- Create: `apps/frontend/web/src/features/directory/services/domain/browse-title.ts`
- Create: `apps/frontend/web/src/features/directory/domain/directory-title.ts`
- Test: `apps/frontend/web/src/features/directory/services/domain/__tests__/browse-title.test.ts`
- Test: `apps/frontend/web/src/features/directory/domain/__tests__/directory-title.test.ts`
- Modify: `apps/frontend/web/src/shared/locales/{de-DE,en-US,es-ES,fr-FR,it-IT,nl-NL,pt-MZ,pt-PT}/directory.json`

**Interfaces:**
- Consumes: `BrowseSearch` (`features/directory/services/domain/browse-search.ts`), `DirectorySearch` (`features/directory/domain/directory-search.ts`).
- Produces:

```ts
export interface TitleParts { key: string; values: { category?: string; city?: string } }
export function browseTitle(search: { category?: string | undefined; city?: string | undefined }, categoryName: string | null): TitleParts;
export function directoryTitle(search: { category?: string | undefined; city?: string | undefined }, categoryName: string | null): TitleParts;
```

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/web/src/features/directory/services/domain/__tests__/browse-title.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { browseTitle } from "../browse-title";

describe("browseTitle", () => {
  it("names the page plainly when nothing is narrowing it", () => {
    expect(browseTitle({}, null)).toEqual({ key: "titleServices", values: {} });
  });

  it("names the trade when a category is chosen", () => {
    // A category-filtered page ranks under its own name, and a reader who
    // clicked "Plumbing" should see the word they clicked.
    expect(browseTitle({ category: "plumbing" }, "Plumbing")).toEqual({
      key: "titleServicesCategory",
      values: { category: "Plumbing" },
    });
  });

  it("names the place when a city is chosen", () => {
    expect(browseTitle({ city: "Maputo" }, null)).toEqual({
      key: "titleServicesCity",
      values: { city: "Maputo" },
    });
  });

  it("names both when both are chosen", () => {
    expect(browseTitle({ category: "plumbing", city: "Maputo" }, "Plumbing")).toEqual({
      key: "titleServicesCategoryCity",
      values: { category: "Plumbing", city: "Maputo" },
    });
  });

  it("falls back to the plain title when the category has not resolved yet", () => {
    // The category list is a separate query and may arrive a beat later. A
    // title reading "undefined services" for that beat is worse than the
    // generic one, and worse still if a crawler catches it.
    expect(browseTitle({ category: "plumbing" }, null)).toEqual({
      key: "titleServices",
      values: {},
    });
  });

  it("keeps the city even when the category has not resolved", () => {
    expect(browseTitle({ category: "plumbing", city: "Maputo" }, null)).toEqual({
      key: "titleServicesCity",
      values: { city: "Maputo" },
    });
  });

  it("ignores a blank city rather than composing an empty place", () => {
    // `?city=` reaches here as "" through a URL somebody typed.
    expect(browseTitle({ city: "  " }, null)).toEqual({ key: "titleServices", values: {} });
  });
});
```

Create `apps/frontend/web/src/features/directory/domain/__tests__/directory-title.test.ts` — the same seven cases against `directoryTitle`, with the keys `titleProviders`, `titleProvidersCategory`, `titleProvidersCity`, `titleProvidersCategoryCity`. Write them out; do not import the services test.

- [ ] **Step 2: Run them and watch them fail**

```bash
cd apps/frontend/web && bun run vitest run src/features/directory/services/domain/__tests__/browse-title.test.ts src/features/directory/domain/__tests__/directory-title.test.ts
```

Expected: FAIL — cannot resolve `../browse-title`.

- [ ] **Step 3: Write both implementations**

Create `apps/frontend/web/src/features/directory/services/domain/browse-title.ts`:

```ts
export interface TitleParts {
  /** A key in the `directory` namespace. */
  key: string;
  values: { category?: string; city?: string };
}

/**
 * The `h1` for the services browse, composed from what is narrowing the list.
 *
 * Four whole translated sentences rather than fragments joined at runtime.
 * A language that orders the place before the trade cannot be served by
 * concatenation, and one that inflects the trade cannot be served at all —
 * which is why the category's name is interpolated as a **noun phrase and
 * never inflected**. "Canalizadores" would need an agent noun per category per
 * language and `category` stores none; "Canalização, pronta a reservar" would
 * need that name's grammatical gender, which is equally absent.
 *
 * The category name is resolved by the caller and may be null while the
 * category query is still in flight. Null falls back to the next-simplest
 * title rather than interpolating nothing: a heading reading "undefined
 * services" for one frame is worse than the generic one, and worse again if a
 * crawler catches it.
 */
export function browseTitle(
  search: { category?: string | undefined; city?: string | undefined },
  categoryName: string | null,
): TitleParts {
  // Trimmed: `?city=` reaches here as an empty string through a URL somebody
  // typed, and an empty place composed into the sentence reads as a bug.
  const city = search.city?.trim() || undefined;
  const category = search.category ? (categoryName ?? undefined) : undefined;

  if (category && city) {
    return { key: "titleServicesCategoryCity", values: { category, city } };
  }
  if (category) return { key: "titleServicesCategory", values: { category } };
  if (city) return { key: "titleServicesCity", values: { city } };
  return { key: "titleServices", values: {} };
}
```

Create `apps/frontend/web/src/features/directory/domain/directory-title.ts` with the same shape and the `titleProviders*` keys. Repeat the doc comment's reasoning in one line and point at `browse-title.ts` for the rest — the two are siblings, not a shared helper, because their key sets are different and a shared one would take the key prefix as a parameter, which is a way of writing the same four `if`s with an extra argument.

- [ ] **Step 4: Add the eight keys to all eight locales**

Add to each `apps/frontend/web/src/shared/locales/<locale>/directory.json`. The parity gate compares keys **and interpolation placeholders**, so `{{category}}` and `{{city}}` must appear in exactly the sentences shown.

`en-US`:
```json
  "titleServices": "Services ready to book",
  "titleServicesCategory": "{{category}} services",
  "titleServicesCity": "Services ready to book in {{city}}",
  "titleServicesCategoryCity": "{{category}} services in {{city}}",
  "titleProviders": "Verified providers",
  "titleProvidersCategory": "{{category}} providers",
  "titleProvidersCity": "Providers in {{city}}",
  "titleProvidersCategoryCity": "{{category}} providers in {{city}}"
```

`pt-MZ` and `pt-PT` (identical here — the difference between the two is vocabulary this copy does not use):
```json
  "titleServices": "Serviços prontos a reservar",
  "titleServicesCategory": "Serviços de {{category}}",
  "titleServicesCity": "Serviços prontos a reservar em {{city}}",
  "titleServicesCategoryCity": "Serviços de {{category}} em {{city}}",
  "titleProviders": "Prestadores verificados",
  "titleProvidersCategory": "Prestadores de {{category}}",
  "titleProvidersCity": "Prestadores em {{city}}",
  "titleProvidersCategoryCity": "Prestadores de {{category}} em {{city}}"
```

`es-ES`:
```json
  "titleServices": "Servicios listos para reservar",
  "titleServicesCategory": "Servicios de {{category}}",
  "titleServicesCity": "Servicios listos para reservar en {{city}}",
  "titleServicesCategoryCity": "Servicios de {{category}} en {{city}}",
  "titleProviders": "Profesionales verificados",
  "titleProvidersCategory": "Profesionales de {{category}}",
  "titleProvidersCity": "Profesionales en {{city}}",
  "titleProvidersCategoryCity": "Profesionales de {{category}} en {{city}}"
```

`fr-FR`:
```json
  "titleServices": "Des services prêts à réserver",
  "titleServicesCategory": "Services de {{category}}",
  "titleServicesCity": "Des services prêts à réserver à {{city}}",
  "titleServicesCategoryCity": "Services de {{category}} à {{city}}",
  "titleProviders": "Prestataires vérifiés",
  "titleProvidersCategory": "Prestataires en {{category}}",
  "titleProvidersCity": "Prestataires à {{city}}",
  "titleProvidersCategoryCity": "Prestataires en {{category}} à {{city}}"
```

`it-IT`:
```json
  "titleServices": "Servizi pronti da prenotare",
  "titleServicesCategory": "Servizi di {{category}}",
  "titleServicesCity": "Servizi pronti da prenotare a {{city}}",
  "titleServicesCategoryCity": "Servizi di {{category}} a {{city}}",
  "titleProviders": "Professionisti verificati",
  "titleProvidersCategory": "Professionisti di {{category}}",
  "titleProvidersCity": "Professionisti a {{city}}",
  "titleProvidersCategoryCity": "Professionisti di {{category}} a {{city}}"
```

`de-DE`:
```json
  "titleServices": "Sofort buchbare Leistungen",
  "titleServicesCategory": "Leistungen für {{category}}",
  "titleServicesCity": "Sofort buchbare Leistungen in {{city}}",
  "titleServicesCategoryCity": "Leistungen für {{category}} in {{city}}",
  "titleProviders": "Geprüfte Anbieter",
  "titleProvidersCategory": "Anbieter für {{category}}",
  "titleProvidersCity": "Anbieter in {{city}}",
  "titleProvidersCategoryCity": "Anbieter für {{category}} in {{city}}"
```

`nl-NL`:
```json
  "titleServices": "Direct boekbare diensten",
  "titleServicesCategory": "Diensten voor {{category}}",
  "titleServicesCity": "Direct boekbare diensten in {{city}}",
  "titleServicesCategoryCity": "Diensten voor {{category}} in {{city}}",
  "titleProviders": "Geverifieerde aanbieders",
  "titleProvidersCategory": "Aanbieders voor {{category}}",
  "titleProvidersCity": "Aanbieders in {{city}}",
  "titleProvidersCategoryCity": "Aanbieders voor {{category}} in {{city}}"
```

German and Dutch use `für`/`voor` rather than a genitive precisely because the category name is a noun phrase that cannot be inflected — "Leistungen der Klempnerarbeit" would need a gender and a case this data does not carry.

- [ ] **Step 5: Run the tests and the parity gate**

```bash
cd apps/frontend/web && bun run vitest run src/features/directory/services/domain/__tests__/browse-title.test.ts src/features/directory/domain/__tests__/directory-title.test.ts src/shared/lib/__tests__/i18n-parity.test.ts
```

Expected: PASS. If parity fails, it names the locale and key it found missing — add it there rather than removing it from `en-US`.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src/features/directory/services/domain/browse-title.ts apps/frontend/web/src/features/directory/domain/directory-title.ts apps/frontend/web/src/features/directory/services/domain/__tests__/browse-title.test.ts apps/frontend/web/src/features/directory/domain/__tests__/directory-title.test.ts apps/frontend/web/src/shared/locales
git commit -m "feat(directory): the page title follows the filters instead of naming a country

'Prestadores em Moçambique' cements one country into a product built to be
multi-region, and a category-filtered page ranks better under its own name.
Four whole sentences per locale, never fragments joined at runtime — and the
category is interpolated as a noun phrase, because nothing stores an agent
noun or a gender for it."
```

---

### Task 13: Deriving the active-filter chips

**Files:**
- Create: `apps/frontend/web/src/features/directory/services/domain/browse-chips.ts`
- Create: `apps/frontend/web/src/features/directory/domain/directory-chips.ts`
- Test: `apps/frontend/web/src/features/directory/services/domain/__tests__/browse-chips.test.ts`
- Test: `apps/frontend/web/src/features/directory/domain/__tests__/directory-chips.test.ts`
- Modify: the eight `directory.json` files

**Interfaces:**
- Consumes: `browseSearch`, `BrowseSearch`; `directorySearch`, `DirectorySearch`.
- Produces:

```ts
export interface FilterChip {
  /** Stable across renders; also the React key. */
  key: string;
  /** A key in the `directory` namespace, plus its values. */
  label: { key: string; values?: Record<string, string | number> };
  /** The search object that removes exactly this chip and keeps every other. */
  next: BrowseSearch;   // DirectorySearch in the sibling
}
export function browseFilterChips(current: BrowseSearch): FilterChip[];
export function directoryFilterChips(current: DirectorySearch): FilterChip[];
```

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/web/src/features/directory/services/domain/__tests__/browse-chips.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { browseFilterChips } from "../browse-chips";

describe("browseFilterChips", () => {
  it("shows nothing when nothing is narrowing the list", () => {
    expect(browseFilterChips({})).toEqual([]);
  });

  it("does not offer the category as a chip", () => {
    // The rail is on screen above the results at every width, so a chip for
    // it is a second control for something the reader can already see and
    // clear — and on a phone it would be the only one that duplicates.
    expect(browseFilterChips({ category: "plumbing" })).toEqual([]);
  });

  it("offers one chip per narrowing", () => {
    const chips = browseFilterChips({ locationType: "at_customer", paymentMode: "fixed" });
    expect(chips.map((c) => c.key)).toEqual(["locationType", "paymentMode"]);
  });

  it("removes exactly one filter and keeps the others", () => {
    // The bug this prevents: a remove link built by hand drops every
    // parameter the component that built it did not know about.
    const chips = browseFilterChips({
      locationType: "at_customer",
      paymentMode: "fixed",
      q: "corte",
      sort: "newest",
    });
    const removeLocation = chips.find((c) => c.key === "locationType")!.next;
    expect(removeLocation).toEqual({ paymentMode: "fixed", q: "corte", sort: "newest" });
  });

  it("sends the reader back to the first page when a filter comes off", () => {
    // Page 4 of a wider result set is not page 4 of the narrower one, and
    // keeping the offset lands them mid-list with no idea why.
    const chips = browseFilterChips({ locationType: "at_customer", offset: 72 });
    expect(chips[0]!.next.offset).toBeUndefined();
  });

  it("treats a price range as one chip however many bounds are set", () => {
    // Two chips for one range invites the reader to remove half a range.
    expect(browseFilterChips({ minPrice: 500, maxPrice: 5000 }).map((c) => c.key)).toEqual(["price"]);
    expect(browseFilterChips({ minPrice: 500 }).map((c) => c.key)).toEqual(["price"]);
    expect(browseFilterChips({ maxPrice: 5000 }).map((c) => c.key)).toEqual(["price"]);
  });

  it("removes both bounds when the price chip is removed", () => {
    const chip = browseFilterChips({ minPrice: 500, maxPrice: 5000 })[0]!;
    expect(chip.next.minPrice).toBeUndefined();
    expect(chip.next.maxPrice).toBeUndefined();
  });

  it("counts a minimum of zero as a range somebody set", () => {
    // "Free and up" is a bound, and `if (min)` steps straight over it.
    expect(browseFilterChips({ minPrice: 0 }).map((c) => c.key)).toEqual(["price"]);
  });

  it("labels the range with both bounds when both are set, and one when one is", () => {
    expect(browseFilterChips({ minPrice: 500, maxPrice: 5000 })[0]!.label).toEqual({
      key: "chipPriceRange",
      values: { min: 500, max: 5000 },
    });
    expect(browseFilterChips({ minPrice: 500 })[0]!.label).toEqual({
      key: "chipPriceMin",
      values: { min: 500 },
    });
    expect(browseFilterChips({ maxPrice: 5000 })[0]!.label).toEqual({
      key: "chipPriceMax",
      values: { max: 5000 },
    });
  });

  it("shows the search term as its own chip", () => {
    // Somebody who typed a word and then filtered has two narrowings, and
    // only one of them is visible in the sidebar.
    expect(browseFilterChips({ q: "corte" })[0]).toMatchObject({
      key: "q",
      label: { key: "chipSearch", values: { term: "corte" } },
    });
  });

  it("does not offer the sort as a chip", () => {
    // An order is not a narrowing: removing it does not widen the result set,
    // and a chip that changes nothing about what is shown is a lie.
    expect(browseFilterChips({ sort: "newest" })).toEqual([]);
  });
});
```

Create `apps/frontend/web/src/features/directory/domain/__tests__/directory-chips.test.ts` against `directoryFilterChips`, covering the same rules for that page's own filters: `q`, `city`, `providerType`, `minRating`, `verified`, and the price range. Two directory-specific cases to add:

```ts
  it("shows the verified filter only when it is on", () => {
    // `verified=false` and no `verified` at all are the same page.
    expect(directoryFilterChips({ verified: false }).map((c) => c.key)).toEqual([]);
    expect(directoryFilterChips({ verified: true }).map((c) => c.key)).toEqual(["verified"]);
  });

  it("labels a rating threshold with the score, not the word 'rating'", () => {
    expect(directoryFilterChips({ minRating: 4.5 })[0]!.label).toEqual({
      key: "chipRating",
      values: { score: 4.5 },
    });
  });
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd apps/frontend/web && bun run vitest run src/features/directory/services/domain/__tests__/browse-chips.test.ts src/features/directory/domain/__tests__/directory-chips.test.ts
```

Expected: FAIL — cannot resolve `../browse-chips`.

- [ ] **Step 3: Write `browse-chips.ts`**

```ts
import {
  browseSearch,
  type BrowseSearch,
} from "@/features/directory/services/domain/browse-search";

export interface FilterChip {
  key: string;
  label: { key: string; values?: Record<string, string | number> };
  next: BrowseSearch;
}

/**
 * Everything currently narrowing the browse, each with the URL that removes it.
 *
 * The removal link is built by `browseSearch`, never by hand: an object
 * assembled at the call site only ever remembers the parameters that call site
 * knows about, which is the exact bug `browseSearch` was written to end.
 *
 * `offset: undefined` on every one of them. Page 4 of a wider result set is not
 * page 4 of the narrower one — usually it is past its end — so a reader who
 * removed a filter would land on an empty page having asked for a fuller one.
 *
 * **The category is not here.** The rail sits above the results at every width,
 * so a chip for it is a second control for something already visible and
 * already clearable. **Nor is the sort:** an order is not a narrowing, and a
 * chip whose removal changes nothing about what is shown is a lie about what
 * chips mean.
 */
export function browseFilterChips(current: BrowseSearch): FilterChip[] {
  const chips: FilterChip[] = [];
  const drop = (change: BrowseSearch) => browseSearch(current, { ...change, offset: undefined });

  if (current.locationType) {
    chips.push({
      key: "locationType",
      label: { key: `filterWhereOption.${current.locationType}` },
      next: drop({ locationType: undefined }),
    });
  }
  if (current.paymentMode) {
    chips.push({
      key: "paymentMode",
      label: { key: `filterPaymentOption.${current.paymentMode}` },
      next: drop({ paymentMode: undefined }),
    });
  }
  if (current.providerType) {
    chips.push({
      key: "providerType",
      label: { key: `filterProviderKindOption.${current.providerType}` },
      next: drop({ providerType: undefined }),
    });
  }
  if (current.city) {
    chips.push({
      key: "city",
      label: { key: "chipCity", values: { city: current.city } },
      next: drop({ city: undefined }),
    });
  }
  if (current.language) {
    chips.push({
      key: "language",
      label: { key: `filterLanguageOption.${current.language}` },
      next: drop({ language: undefined }),
    });
  }
  if (current.q) {
    chips.push({
      key: "q",
      label: { key: "chipSearch", values: { term: current.q } },
      next: drop({ q: undefined }),
    });
  }
  // `!= null`, not truthy: a minimum of 0 is "free and up", which is a bound
  // somebody set, and `if (min)` steps straight over it.
  if (current.minPrice != null || current.maxPrice != null) {
    // One chip however many bounds are set. Two chips for one range invites
    // the reader to remove half of it, which leaves a range nobody chose.
    const label =
      current.minPrice != null && current.maxPrice != null
        ? { key: "chipPriceRange", values: { min: current.minPrice, max: current.maxPrice } }
        : current.minPrice != null
          ? { key: "chipPriceMin", values: { min: current.minPrice } }
          : { key: "chipPriceMax", values: { max: current.maxPrice! } };
    chips.push({
      key: "price",
      label,
      next: drop({ minPrice: undefined, maxPrice: undefined }),
    });
  }
  return chips;
}
```

Write `directory-chips.ts` the same way against `directorySearch`, with `q`, `city` (`chipCity`), `providerType`, `minRating` (`chipRating`, `values: { score }`), `verified` (`chipVerified`, only when `true`) and the price range.

> **`current.city` on `BrowseSearch` does not exist yet.** Task 16 adds it. Until then TypeScript will reject that block — write it, let it fail to compile, and add `city?: string | undefined` to the `BrowseSearch` interface in `browse-search.ts` **plus** the `...(next.city ? { city: next.city } : {})` line to `browseSearch` as part of this task. Task 16 then only has to teach the route and the repository about it. Add a test to the existing `browse-search.test.ts` asserting the city survives a category change, so the new field is not carried on trust.

- [ ] **Step 4: Add the chip labels to all eight locales**

`en-US`:
```json
  "chipCity": "in {{city}}",
  "chipSearch": "“{{term}}”",
  "chipPriceRange": "{{min}} – {{max}}",
  "chipPriceMin": "from {{min}}",
  "chipPriceMax": "up to {{max}}",
  "chipRating": "{{score}}+ stars",
  "chipVerified": "Verified only",
  "chipRemove": "Remove filter",
  "activeFiltersLabel": "Active filters",
  "filtersClearAll": "Clear all"
```

`pt-MZ` / `pt-PT`:
```json
  "chipCity": "em {{city}}",
  "chipSearch": "“{{term}}”",
  "chipPriceRange": "{{min}} – {{max}}",
  "chipPriceMin": "a partir de {{min}}",
  "chipPriceMax": "até {{max}}",
  "chipRating": "{{score}}+ estrelas",
  "chipVerified": "Só verificados",
  "chipRemove": "Remover filtro",
  "activeFiltersLabel": "Filtros activos",
  "filtersClearAll": "Limpar tudo"
```

`es-ES`: `"en {{city}}"`, `"“{{term}}”"`, `"{{min}} – {{max}}"`, `"desde {{min}}"`, `"hasta {{max}}"`, `"{{score}}+ estrellas"`, `"Solo verificados"`, `"Quitar filtro"`, `"Filtros activos"`, `"Borrar todo"`.

`fr-FR`: `"à {{city}}"`, `"« {{term}} »"`, `"{{min}} – {{max}}"`, `"à partir de {{min}}"`, `"jusqu’à {{max}}"`, `"{{score}}+ étoiles"`, `"Vérifiés uniquement"`, `"Retirer le filtre"`, `"Filtres actifs"`, `"Tout effacer"`.

`it-IT`: `"a {{city}}"`, `"“{{term}}”"`, `"{{min}} – {{max}}"`, `"da {{min}}"`, `"fino a {{max}}"`, `"{{score}}+ stelle"`, `"Solo verificati"`, `"Rimuovi filtro"`, `"Filtri attivi"`, `"Cancella tutto"`.

`de-DE`: `"in {{city}}"`, `"„{{term}}“"`, `"{{min}} – {{max}}"`, `"ab {{min}}"`, `"bis {{max}}"`, `"{{score}}+ Sterne"`, `"Nur geprüfte"`, `"Filter entfernen"`, `"Aktive Filter"`, `"Alle zurücksetzen"`.

`nl-NL`: `"in {{city}}"`, `"‘{{term}}’"`, `"{{min}} – {{max}}"`, `"vanaf {{min}}"`, `"tot {{max}}"`, `"{{score}}+ sterren"`, `"Alleen geverifieerd"`, `"Filter verwijderen"`, `"Actieve filters"`, `"Alles wissen"`.

- [ ] **Step 5: Run the tests and the parity gate**

```bash
cd apps/frontend/web && bun run vitest run src/features/directory src/shared/lib/__tests__/i18n-parity.test.ts
```

Expected: PASS, including the existing `browse-search.test.ts` and `directory-search.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src/features/directory apps/frontend/web/src/shared/locales
git commit -m "feat(directory): derive the active-filter chips, each removing only itself

Built through browseSearch/directorySearch rather than by hand — an object
assembled at the call site only remembers what that call site knows about,
which is the bug those two functions exist to end. A price range is one chip:
two would let somebody remove half a range."
```

---

### Task 14: `total` on the services page

**Files:**
- Modify: `packages/shared/src/read-models/public/service/service.schema.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/app/ports/outbound/service-read.repository.port.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/infrastructure/repositories/drizzle/service-read.repository.ts`
- Modify: `packages/backend/src/modules/ntizo/public/catalog/app/use-cases/list-services.projection.ts`
- Test: `packages/backend/src/modules/ntizo/public/catalog/__tests__/list-services.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `servicePageReadModel` gains `total: z.number().int().min(0)`; `ServicePageDTO` gains `total: number`.
  - `ServiceReadRepositoryPort` gains `countPublished(filter: Omit<ListPublishedServicesFilter, "limit" | "offset" | "sort">): Promise<number>`.
  - `ListServicesOutput` gains `total: number`.

- [ ] **Step 1: Write the failing test**

Append to `packages/backend/src/modules/ntizo/public/catalog/__tests__/list-services.test.ts` (follow the file's existing `row()` factory and fake-repo style; give the fake a `countPublished` that returns a number you set):

```ts
describe("ListServicesProjection — total", () => {
  it("reports how many matched, not how many fit on the page", () => {
    // `items.length` told somebody with 40 matches that they had 24, which is
    // the page size talking rather than the search. It is also what made
    // numbered paging impossible.
    const repo = new FakeRepo([row(), row({ id: "svc-2" })], 40);
    const out = await new ListServicesProjection(repo).execute({
      locale: "pt-MZ",
      limit: 24,
      offset: 0,
    });
    expect(out.total).toBe(40);
    expect(out.items).toHaveLength(2);
  });

  it("counts with the same filters it lists with", () => {
    // A count that ignored the filters would say 400 above a page of three.
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo).execute({
      locale: "pt-MZ",
      categoryCode: "hair",
      locationType: "at_customer",
      minPriceMinor: 50_000,
      q: "corte",
      limit: 24,
      offset: 0,
    });
    expect(repo.countedWith).toMatchObject({
      categoryCode: "hair",
      locationType: "at_customer",
      minPriceMinor: 50_000,
      q: "corte",
    });
  });

  it("does not ask the count to page or sort", () => {
    // `limit`, `offset` and `sort` cannot change how many rows match, and
    // passing them invites an implementation that applies them.
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo).execute({
      locale: "pt-MZ",
      sort: "newest",
      limit: 24,
      offset: 48,
    });
    expect(repo.countedWith).not.toHaveProperty("limit");
    expect(repo.countedWith).not.toHaveProperty("offset");
    expect(repo.countedWith).not.toHaveProperty("sort");
  });

  it("trims the search term for the count exactly as it does for the list", () => {
    // A phone keyboard leaves a trailing space, and `%  corte %` matches
    // nothing — a count and a list that disagree about that show "0 services"
    // above a page of results.
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo).execute({
      locale: "pt-MZ",
      q: "  corte  ",
      limit: 24,
      offset: 0,
    });
    expect(repo.countedWith).toMatchObject({ q: "corte" });
  });

  it("reports zero rather than omitting the number when nothing matches", () => {
    const repo = new FakeRepo([], 0);
    const out = await new ListServicesProjection(repo).execute({
      locale: "pt-MZ",
      limit: 24,
      offset: 0,
    });
    expect(out.total).toBe(0);
    expect(out.nextOffset).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/backend && bun test src/modules/ntizo/public/catalog/__tests__/list-services.test.ts
```

Expected: FAIL — `out.total` is undefined.

- [ ] **Step 3: Widen the read model**

In `packages/shared/src/read-models/public/service/service.schema.ts`, replace `servicePageReadModel`'s body and its doc comment:

```ts
/**
 * One page of services.
 *
 * Both a cursor and a total, which the doc comment here used to argue against.
 * The argument was sound while the browse only stepped forward — "is there
 * more and from where" is all a next link needs. It stopped being sound when
 * the page began stating how many results there are and offering numbered
 * pages: `items.length` reports the page size, not the search, and told
 * somebody with 40 matches that they had 24.
 *
 * `total` counts what the *filters* match. The projection then drops rows it
 * cannot render — a service whose translations resolve to nothing in any
 * locale — so across every page the rows shown can be very slightly fewer than
 * `total` claims. That is the honest trade: the alternative is counting by
 * fetching and mapping the whole result set on every request.
 */
export const servicePageReadModel = z.object({
  items: z.array(serviceReadModel),
  nextOffset: z.number().int().nullable(),
  total: z.number().int().min(0),
});
```

- [ ] **Step 4: Add `countPublished` to the port and the repository**

In `service-read.repository.port.ts`, beside `listPublished`:

```ts
  /**
   * How many published services of active providers match — before the page
   * size cuts in.
   *
   * Deliberately takes the filter *without* `limit`, `offset` or `sort`: none
   * of the three can change how many rows match, and accepting them invites an
   * implementation that applies one.
   */
  countPublished(
    filter: Omit<ListPublishedServicesFilter, "limit" | "offset" | "sort">,
  ): Promise<number>;
```

In `service-read.repository.ts`, extract the condition list `listPublished` builds into a private method so the two can never drift:

```ts
  /**
   * The WHERE both `listPublished` and `countPublished` run.
   *
   * Extracted rather than copied: a count built from a second, hand-kept copy
   * of these conditions is a count that will one day disagree with the list
   * above it, and the disagreement shows up as "40 services" over a page of
   * three with no way to tell which number is wrong.
   */
  private conditionsFor(
    db: ReturnType<typeof getDb>,
    filter: Omit<ListPublishedServicesFilter, "limit" | "offset" | "sort">,
  ) {
    // Move the existing body of `listPublished` from `const conditions = [...]`
    // down to the end of the `if (filter.q)` block here verbatim, and return
    // `conditions`. Change nothing about it in this task.
  }

  async countPublished(
    filter: Omit<ListPublishedServicesFilter, "limit" | "offset" | "sort">,
  ): Promise<number> {
    const db = getDb();
    const [counted] = await db
      .select({ total: sql<number>`count(*)` })
      .from(service)
      .innerJoin(category, eq(category.id, service.categoryId))
      .innerJoin(provider, eq(provider.id, service.providerId))
      .where(and(...this.conditionsFor(db, filter)));
    // `count(*)` arrives as a string from postgres-js on a bigint; `Number`
    // here rather than at the call site, so nothing downstream sees a string
    // where the read model declares an integer.
    return Number(counted?.total ?? 0);
  }
```

`listPublished` then calls `this.conditionsFor(db, filter)` in place of its inline list. The joins in `countPublished` must match `listPublished`'s exactly — the conditions reference `category` and `provider` columns, and dropping either join makes the count a different query.

- [ ] **Step 5: Return it from the projection**

In `list-services.projection.ts`, add `total: number` to `ListServicesOutput` with the doc comment from Step 3's read model, then in `execute`:

```ts
    // The same object both calls receive, so a filter added to one can never
    // be forgotten by the other.
    const filters = {
      categoryCode: input.categoryCode,
      providerId: input.providerId,
      locationType: input.locationType,
      paymentMode: input.paymentMode,
      providerType: input.providerType,
      language: input.language,
      minPriceMinor: input.minPriceMinor,
      maxPriceMinor: input.maxPriceMinor,
      q: q ? q : undefined,
    };

    // Concurrently: the count and the page are independent queries, and
    // awaiting them in sequence adds a round trip to every browse.
    const [rows, total] = await Promise.all([
      this.repo.listPublished({ ...filters, sort: input.sort, limit: limit + 1, offset }),
      this.repo.countPublished(filters),
    ]);
```

and `return { items, nextOffset: hasMore ? offset + limit : null, total };`.

- [ ] **Step 6: Run the tests and watch them pass**

```bash
cd packages/backend && bun test src/modules/ntizo/public/catalog
cd ../shared && bun test
```

Expected: PASS. The provider's own public page also reads `serviceAll` and now receives a `total` it ignores, which is harmless — but check `packages/backend/src/modules/ntizo/public/__tests__/public-imports.guard.test.ts` still passes.

- [ ] **Step 7: Ask the frontend for it**

In `apps/frontend/web/src/features/directory/services/data/service.repository.ts`, add `total` to the `ALL` query's selection beside `nextOffset`. Without this the field is simply absent from the response — the server does not object to an unrequested field, and `total` would arrive `undefined` and render as "NaN services" with the suite green. This is the failure mode `SERVICE_FIELDS`' own doc comment records.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/read-models packages/backend/src/modules/ntizo apps/frontend/web/src/features/directory/services/data/service.repository.ts
git commit -m "feat(catalog): serviceAll reports how many matched, not how many fit

items.length is the page size talking, not the search: 40 matches read as 24.
The count shares one conditionsFor() with the list so the two cannot drift."
```

---

### Task 15: Ordering services by price

**Files:**
- Modify: `packages/backend/src/modules/ntizo/public/catalog/graphql/schema/queries.ts`
- Modify: `packages/backend/src/modules/ntizo/public/catalog/app/use-cases/list-services.projection.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/infrastructure/repositories/drizzle/service-read.repository.ts`
- Modify: `apps/frontend/web/src/features/directory/services/domain/types.ts` (`BrowseSort`)
- Modify: `apps/frontend/web/src/routes/services.index.tsx` (`validateSearch`)
- Test: `packages/backend/src/modules/ntizo/public/catalog/__tests__/list-services.test.ts`

**Interfaces:**
- Consumes: `conditionsFor` (Task 14).
- Produces: `sort: "default" | "newest" | "price"` end to end; `BrowseSort = "newest" | "price"` on the client.

- [ ] **Step 1: Write the failing test**

```ts
describe("ListServicesProjection — price order", () => {
  it("passes the price order through to the repository", () => {
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo).execute({
      locale: "pt-MZ",
      sort: "price",
      limit: 24,
      offset: 0,
    });
    expect(repo.listedWith).toMatchObject({ sort: "price" });
  });

  it("puts a service with no price last rather than treating it as free", () => {
    // A quote service has no price to compare. Sorted as zero it takes the
    // top of "cheapest first" — the one position it cannot honestly hold.
    const repo = new FakeRepo(
      [
        row({ id: "quote", bookingMode: "quote", fromAmountMinor: null, defaultOption: null }),
        row({ id: "cheap", fromAmountMinor: 20_000 }),
      ],
      2,
    );
    const out = await new ListServicesProjection(repo).execute({
      locale: "pt-MZ",
      sort: "price",
      limit: 24,
      offset: 0,
    });
    // The projection preserves the repository's order — the assertion that
    // matters is the SQL one below; this one guards against the projection
    // quietly re-sorting what it was handed.
    expect(out.items.map((i) => i.id)).toEqual(["quote", "cheap"]);
  });
});
```

Add a matching assertion to the repository's own SQL: `orderBy` under `sort: "price"` must be `asc(sql\`... nulls last\`)`. If this repository has no SQL-level test today, add one under `packages/backend/src/modules/ntizo/bounded-contexts/catalog/__tests__/` that asserts the generated SQL string contains `nulls last` via drizzle's `.toSQL()`, rather than reaching for a database.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/backend && bun test src/modules/ntizo/public/catalog/__tests__/list-services.test.ts
```

Expected: FAIL — `sort: "price"` is not assignable to `"default" | "newest"`.

- [ ] **Step 3: Widen the enum, the input type and the order**

In `public/catalog/graphql/schema/queries.ts`:

```ts
      sort: z.enum(["default", "newest", "price"]).optional(),
```

In `list-services.projection.ts`, `ListServicesInput`:

```ts
  /**
   * `default` is the provider's own order; `newest` is most recently added
   * first; `price` is cheapest first, on the same `fromAmountMinor` the card
   * prints and the price filter matches — so a service can never sort into a
   * position its own visible price contradicts.
   */
  sort?: "default" | "newest" | "price" | undefined;
```

In `service-read.repository.ts`, widen `ListPublishedServicesFilter["sort"]` the same way and replace the `orderBy`:

```ts
      .orderBy(
        ...(filter.sort === "newest"
          ? [desc(service.createdAt)]
          : filter.sort === "price"
            ? [
                // NULLS LAST, spelled out. Postgres sorts nulls FIRST under
                // ASC by default, which would put every quote service — the
                // ones with no price at all — at the top of "cheapest first".
                sql`(${cheapestActiveOption}) asc nulls last`,
                asc(service.createdAt),
              ]
            : [asc(service.sortOrder), asc(service.createdAt)]),
      );
```

**`fromAmountMinor` is not reachable from this `ORDER BY` — read the method before writing this.** The number the card prints comes from `priceAgg`, a *second* grouped query this repository runs after the page has already been fetched and paged (`.select({ fromAmountMinor: min(serviceOption.amountMinor), ... }).groupBy(serviceOption.serviceId)`). It cannot order a query that has not run yet, and it is not a column or an alias in the paging query at all.

The order therefore needs its own correlated subselect over the same rows `priceAgg` aggregates, declared once at module level so the two sit side by side and can be checked to agree:

```ts
/**
 * The cheapest active option of the service in the surrounding row.
 *
 * The same rows `priceAgg` groups over further down `listPublished` —
 * `isActive`, and `min(amountMinor)` — written again as a correlated subselect
 * because ordering happens in the query that *pages* the services, and
 * `priceAgg` only runs once that page is already chosen.
 *
 * These two must agree. If they diverge, the browse sorts on one number and
 * prints another, which reads as a sort that does not work and is close to
 * undiagnosable from the page. Changing either means changing both.
 */
const cheapestActiveOption = sql`
  select min(${serviceOption.amountMinor})
  from ${serviceOption}
  where ${serviceOption.serviceId} = ${service.id}
    and ${serviceOption.isActive} = true`;
```

A second `asc(service.createdAt)` breaks ties, so two services at 800 MZN do not swap places between requests and reappear on the next page.

- [ ] **Step 4: Teach the client**

In `apps/frontend/web/src/features/directory/services/domain/types.ts`:

```ts
/**
 * How the browse orders its results.
 *
 * `default` is the provider's own arrangement — their answer to "what do I
 * want shown first" — and is written as an *absent* parameter, so `/services`
 * and `/services?sort=default` stay one page. `newest` and `price` each ignore
 * that arrangement rather than ordering within it: a reader who asked for the
 * cheapest is asking a different question, and one provider's arrangement
 * should not outrank another's price.
 */
export type BrowseSort = "newest" | "price";
```

In `routes/services.index.tsx`, replace the `sort` line in `validateSearch` and its declared return type:

```ts
    const rawSort = search["sort"];
    const sort = rawSort === "newest" || rawSort === "price" ? rawSort : undefined;
```

- [ ] **Step 5: Run everything and watch it pass**

```bash
cd packages/backend && bun test src/modules/ntizo
cd ../../apps/frontend/web && bun run vitest run && bun run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo apps/frontend/web/src
git commit -m "feat(catalog): order services by price, with unpriced ones last

Postgres sorts nulls first under ASC, which puts every quote service at the
top of 'cheapest first' — the one position it cannot honestly hold. Ordered on
the same fromAmountMinor the card prints, so the sort and the label agree."
```

---

### Task 16: A city filter for services, and its facets

**Files:**
- Modify: `packages/backend/src/modules/ntizo/public/catalog/graphql/schema/queries.ts`
- Modify: `packages/backend/src/modules/ntizo/public/catalog/graphql/handlers/arg-mappers.ts`
- Modify: `packages/backend/src/modules/ntizo/public/catalog/graphql/handlers/queries.handlers.ts`
- Modify: `packages/backend/src/modules/ntizo/public/catalog/bootstrap.ts`
- Create: `packages/backend/src/modules/ntizo/public/catalog/app/use-cases/list-service-cities.projection.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/app/ports/outbound/service-read.repository.port.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/infrastructure/repositories/drizzle/service-read.repository.ts`
- Modify: `packages/backend/src/modules/ntizo/public/catalog/app/use-cases/list-services.projection.ts`
- Modify: `apps/frontend/web/src/routes/services.index.tsx`
- Modify: `apps/frontend/web/src/features/directory/services/data/service.repository.ts`
- Test: `packages/backend/src/modules/ntizo/public/catalog/__tests__/list-services.test.ts`

**Interfaces:**
- Consumes: `conditionsFor` (Task 14), `BrowseSearch.city` (added in Task 13).
- Produces:
  - `listServices` input gains `city: z.string().trim().min(1).max(120).optional()`.
  - `catalogPublicSchema` gains `service.cities` → `catalogServiceCities` on the wire.
  - `ServiceReadRepositoryPort` gains `listCityFacets(): Promise<{ city: string; count: number }[]>`.

- [ ] **Step 1: Write the failing test**

```ts
describe("ListServicesProjection — city", () => {
  it("passes the city through to the repository", () => {
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo).execute({
      locale: "pt-MZ",
      city: "Maputo",
      limit: 24,
      offset: 0,
    });
    expect(repo.listedWith).toMatchObject({ city: "Maputo" });
  });

  it("trims the city, so a trailing space from a picker is not a different place", () => {
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo).execute({
      locale: "pt-MZ",
      city: "  Maputo  ",
      limit: 24,
      offset: 0,
    });
    expect(repo.listedWith).toMatchObject({ city: "Maputo" });
  });

  it("treats a blank city as no filter at all", () => {
    // `?city=` is a URL somebody can produce by clearing the field.
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo).execute({
      locale: "pt-MZ",
      city: "   ",
      limit: 24,
      offset: 0,
    });
    expect(repo.listedWith.city).toBeUndefined();
  });

  it("counts with the city too", () => {
    const repo = new FakeRepo([row()], 1);
    await new ListServicesProjection(repo).execute({
      locale: "pt-MZ",
      city: "Maputo",
      limit: 24,
      offset: 0,
    });
    expect(repo.countedWith).toMatchObject({ city: "Maputo" });
  });
});
```

And, in a new SQL-shape test beside the repository, the rule that matters most:

```ts
it("never hides a remote service behind a city filter", () => {
  // A remote service has no geography at all. Excluding it from "Maputo"
  // silently removes every online listing from a filter the reader thinks
  // narrows by where the *work* happens.
  const { sql } = buildListPublishedQuery({ city: "Maputo", limit: 24, offset: 0 }).toSQL();
  expect(sql).toContain("location_type");
  expect(sql.toLowerCase()).toContain("or");
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/backend && bun test src/modules/ntizo/public/catalog/__tests__/list-services.test.ts
```

Expected: FAIL — `city` is not a property of `ListServicesInput`.

- [ ] **Step 3: Add the filter to the repository**

In `service-read.repository.ts`, inside `conditionsFor`, after the `providerType` condition:

```ts
    if (filter.city) {
      // A service has no city of its own — it has a `locationType`. The place
      // is the *provider's*, which is right for `at_provider` and
      // `at_customer` work: "in Maputo" means the business is there.
      //
      // It is wrong for `remote`, which has no geography at all, so a remote
      // service matches every city rather than none. Excluding them would
      // silently drop every online listing from a filter the reader believes
      // narrows by where the work happens — and they would have no way to
      // discover it, because the filter's label says "city", not "excludes
      // anything without one".
      conditions.push(
        or(
          eq(service.locationType, "remote"),
          // `ilike` and not `eq`: the city arrives from a free-text combobox
          // (`CitySelect` lets people type their own), so "maputo" and
          // "Maputo" are one place. No wildcards — this is an exact match
          // that ignores case, not a prefix search.
          ilike(provider.addressCity, filter.city),
        )!,
      );
    }
```

Widen `ListPublishedServicesFilter` with `city?: string | undefined`.

- [ ] **Step 4: Thread it through the projection and the schema**

`ListServicesInput` gains, with the doc comment from Step 3 condensed to three lines:

```ts
  /** The provider's city. A `remote` service matches every city — it has none. */
  city?: string | undefined;
```

In `execute`, beside the `q` trim:

```ts
    // Trimmed and blank-normalised for the same reason `q` is: a picker leaves
    // a trailing space, and a string of spaces is truthy — it would narrow the
    // browse to a city nobody is in.
    const city = input.city?.trim() || undefined;
```

and `city` joins the shared `filters` object from Task 14, so the count and the list receive it together.

In `public/catalog/graphql/schema/queries.ts`, on `listServices`:

```ts
      // 120, matching `provider.address_city`'s own column width. A longer
      // string is not a city name, and every character is one more the
      // database compares with no index to help it.
      city: z.string().trim().min(1).max(120).optional(),
```

Add `city` to `mapListServicesInput` in `arg-mappers.ts` alongside the other optional passthroughs.

- [ ] **Step 5: Add the facet field**

In `service-read.repository.port.ts`:

```ts
  /**
   * The cities that currently have a published service, with how many.
   *
   * Read from the data rather than from the reference `city` table, so the
   * filter never offers a place that returns nothing — a chip reading
   * "Nampula 0" is a control whose only outcome is an empty page. The same
   * rule `DrizzleProviderPublicRepository.listCityFacets` follows.
   *
   * Unfiltered on purpose: the options a filter offers must not shrink as that
   * filter is used, or somebody who picked Matola is stranded with no way back
   * to Maputo.
   */
  listCityFacets(): Promise<{ city: string; count: number }[]>;
```

Implement it in `service-read.repository.ts` by joining `service` → `provider`, filtering `service.status = 'published'`, `provider.status = 'active'`, `addressCity` not null and not blank, grouping by `addressCity` and ordering by it. Copy the blank-string guard from the provider repository verbatim — `sql\`btrim(${provider.addressCity}) <> ''\`` — a provider row can carry `''` for a city nobody filled in, and it reaches the filter as a chip with no label.

Create `list-service-cities.projection.ts` — a four-line class holding the port and returning `this.repo.listCityFacets()`, with a comment saying it exists so the handler talks to a use case rather than to an adapter, matching every other slice here.

In `public/catalog/graphql/schema/queries.ts`:

```ts
/**
 * The cities that currently have a published service, with how many.
 *
 * Mirrors `listProviderCityFacets` field for field. A separate query rather
 * than a shared one because the two count different things: a city with four
 * providers and no published services must appear in one list and not the
 * other.
 */
export const listServiceCityFacets = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(z.array(z.object({ city: z.string(), count: z.number().int().min(0) }))),
  docs: { summary: "Cities with at least one published service", tags: ["Catalog"] },
});

export const catalogPublicSchema = defineGraphQLSchema({
  category: { all: listCategories },
  service: { all: listServices, byId: getService, cities: listServiceCityFacets },
});
```

Wire the handler (`"service.cities"`) and the bootstrap (`listServiceCities: new ListServiceCitiesProjection(serviceReadRepository)`).

- [ ] **Step 6: Teach the client**

In `routes/services.index.tsx`, `validateSearch` gains — and the declared return type gains `city?: string`:

```ts
    // Capped at the 120 the schema accepts. A longer string would fail
    // validation at the server and blank the page, with no way for the reader
    // to see why.
    const city = typeof search["city"] === "string" ? search["city"].trim().slice(0, 120) : "";
```

with `...(city ? { city } : {})` in the returned object, `city` in `loaderDeps`, and `city` threaded through `BrowseNarrowing`, `useBrowseServices`, `prefetchBrowseServices` and `browseServicesQueries.page` — **including its query key**, which is the whole reason those keys list every narrowing.

Add the `CITIES` query and a `serviceCities` entry to `browseServicesQueries`, copying `directoryQueries.cities`:

```ts
const CITIES = `
  query ServiceCities {
    catalogServiceCities(input: {}) { city count }
  }`;
```

The field is `catalogServiceCities` — `{ catalog: { service: { cities } } }` flattens through the kit, so confirm the exact name by introspecting the running server (`__schema { queryType { fields { name } } }`) before trusting this line. `activity` and `messaging` each lost a round to guessing it.

- [ ] **Step 7: Run everything**

```bash
cd packages/backend && bun test src/modules/ntizo
cd ../../apps/frontend/web && bun run vitest run && bun run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/modules/ntizo apps/frontend/web/src
git commit -m "feat(catalog): filter services by city, and offer the cities that have any

The place is the provider's — a service has a locationType, not an address. A
remote service matches every city rather than none: excluding it would drop
every online listing from a filter whose label says 'city'."
```

---

### Task 17: The provider's rating on a service card

**Files:**
- Modify: `packages/shared/src/read-models/public/service/service.schema.ts`
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/catalog/infrastructure/repositories/drizzle/service-read.repository.ts`
- Modify: `packages/backend/src/modules/ntizo/public/catalog/app/use-cases/list-services.projection.ts`
- Modify: `apps/frontend/web/src/features/directory/services/data/service.repository.ts` (`SERVICE_FIELDS`)
- Test: `packages/backend/src/modules/ntizo/public/catalog/__tests__/list-services.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ServiceDTO` gains `providerRatingAverage: number | null` and `providerReviewCount: number`.

- [ ] **Step 1: Write the failing test**

```ts
describe("ListServicesProjection — the provider's rating", () => {
  it("carries the business's score onto the card", () => {
    const repo = new FakeRepo([row({ providerRatingAverage: "4.7", providerReviewCount: 6 })], 1);
    const out = await new ListServicesProjection(repo).execute({ locale: "pt-MZ", limit: 24, offset: 0 });
    expect(out.items[0]).toMatchObject({ providerRatingAverage: 4.7, providerReviewCount: 6 });
  });

  it("gives null, never zero, for a business nobody has reviewed", () => {
    // Zero is a score a person could have given. Printing it for an
    // unreviewed business tells every visitor it is the worst on the
    // platform — the same reason `providerPublicReadModel.ratingAverage` is
    // nullable, and this field must not undo that decision at the card.
    const repo = new FakeRepo([row({ providerRatingAverage: null, providerReviewCount: 0 })], 1);
    const out = await new ListServicesProjection(repo).execute({ locale: "pt-MZ", limit: 24, offset: 0 });
    expect(out.items[0]!.providerRatingAverage).toBeNull();
    expect(out.items[0]!.providerReviewCount).toBe(0);
  });

  it("turns the average into a number, not the string Postgres returns", () => {
    // `avg()` comes back as a string on a numeric column. A string reaching
    // the read model fails output validation for the WHOLE page, not one row.
    const repo = new FakeRepo([row({ providerRatingAverage: "4.7", providerReviewCount: 6 })], 1);
    const out = await new ListServicesProjection(repo).execute({ locale: "pt-MZ", limit: 24, offset: 0 });
    expect(typeof out.items[0]!.providerRatingAverage).toBe("number");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/backend && bun test src/modules/ntizo/public/catalog/__tests__/list-services.test.ts
```

Expected: FAIL — `providerRatingAverage` is undefined.

- [ ] **Step 3: Widen the read model**

In `service.schema.ts`, inside `serviceReadModel`, after `providerType`:

```ts
  /**
   * The business's average review score, to one decimal — null when nobody
   * has reviewed it.
   *
   * The *provider's* score, not the service's. Nothing aggregates reviews per
   * service yet, and this is deliberately not that: the card labels it as the
   * business's rating, so it claims nothing false. A per-service score is a
   * Review→Catalog aggregation and its own piece of work.
   *
   * Publishing it here is not a new disclosure — it is already public on
   * `providerPublicReadModel` — it is the same fact reaching the card that
   * already names the business, instead of the card fetching each provider to
   * learn it.
   *
   * Null rather than 0, and the distinction is the whole point: zero is a
   * score a person could have given, and rendering it for an unreviewed
   * business tells every visitor it is the worst on the platform.
   */
  providerRatingAverage: z.number().nullable(),
  providerReviewCount: z.number().int().min(0),
```

- [ ] **Step 4: Select them**

In `service-read.repository.ts`, `listPublished` already joins `provider`. Reviews are aggregated per provider in `DrizzleProviderPublicRepository`'s `aggregates()` helper — read it and mirror the review aggregate here as a `leftJoin` on the paging query, selecting `providerRatingAverage` and `providerReviewCount`. A `leftJoin`, never an inner one: an inner join drops every service whose provider has no reviews, which is most of them.

Add both to `ServicePublicRow`. Coerce in the row mapper, not at the call site:

```ts
        // `avg()` comes back as a string on a numeric column and null on an
        // empty group. Neither is a number, and a string reaching
        // `serviceReadModel` fails output validation for the whole page rather
        // than for the one row — the failure mode `activityEntryReadModel`
        // documents.
        providerRatingAverage:
          r.providerRatingAverage === null || r.providerRatingAverage === undefined
            ? null
            : Number(r.providerRatingAverage),
        providerReviewCount: Number(r.providerReviewCount ?? 0),
```

- [ ] **Step 5: Pass them through the projection**

Add both to the object `list-services.projection.ts` pushes into `items`, taking them straight from the row — the repository has already coerced them.

- [ ] **Step 6: Ask for them on the wire**

In `service.repository.ts`, add `providerRatingAverage providerReviewCount` to `SERVICE_FIELDS`. This is the constant whose own doc comment records that a field left out of it is invisible to the entire test suite — every card test builds a complete fixture and every repository test replaces the transport.

- [ ] **Step 7: Run everything**

```bash
cd packages/backend && bun test src/modules/ntizo
cd ../shared && bun test
cd ../../apps/frontend/web && bun run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add packages/shared packages/backend apps/frontend/web/src/features/directory/services/data/service.repository.ts
git commit -m "feat(catalog): a service card carries its provider's rating

Not a per-service score — nothing aggregates those yet, and this does not
pretend to. The card labels it as the business's rating. Null, never zero, for
a business nobody has reviewed."
```

---

### Task 18: All the copy the three remaining tasks need

**Files:**
- Modify: `apps/frontend/web/src/shared/locales/{de-DE,en-US,es-ES,fr-FR,it-IT,nl-NL,pt-MZ,pt-PT}/directory.json`
- Test: `apps/frontend/web/src/shared/lib/__tests__/i18n-parity.test.ts` (runs unchanged)

**Interfaces:**
- Consumes: nothing.
- Produces: the keys below, in every locale. Tasks 19–21 read them and add none of their own.

Doing this once rather than three times is deliberate: the parity gate compares all eight locales at once, and splitting locale edits across three tasks is three chances to leave seven languages showing raw key ids.

- [ ] **Step 1: Delete the three keys being replaced**

Remove `sortDefault`, `sortNewest` and the whole `providerSort` object from **all eight** files. `sortDefault`/`sortNewest` served a two-link control on one page and `providerSort` a five-item dropdown on the other; both pages now render the same segmented control, and two vocabularies for one control is how the two pages drifted in the first place. `directory-sort.tsx`, the only reader of `providerSort`, is deleted in Task 20.

- [ ] **Step 2: Add the new keys**

`en-US`:
```json
  "sortOption": {
    "default": "Suggested",
    "newest": "Newest",
    "price": "Price",
    "rating": "Best rated",
    "reviews": "Most reviewed",
    "name": "Name (A–Z)"
  },
  "resultsScope": {
    "all": "in all categories",
    "category": "in {{category}}",
    "city": "in {{city}}",
    "categoryCity": "in {{category}}, {{city}}"
  },
  "heroBadgeServices": "No haggling",
  "heroBadgeServicesBody": "price and duration settled before you book",
  "heroSubtitleServices": "Pick the job, see what it costs and how long it takes, and agree a time.",
  "heroBadgeProviders": "Verified",
  "heroBadgeProvidersBody": "documents checked by Ntizo, one by one",
  "heroSubtitleProviders": "People and businesses with prices in the open and reviews written by the customers who hired them.",
  "searchFieldService": "Service",
  "searchFieldServiceEmpty": "What do you need done?",
  "searchFieldProvider": "Provider",
  "searchFieldProviderEmpty": "Business or professional name",
  "searchFieldCity": "City",
  "searchFieldCityEmpty": "Anywhere",
  "pagerLabel": "Pages",
  "stubProviderRating": "provider rating",
  "stubQuoteAmount": "To agree",
  "stubPerService": "per service",
  "mobileSearchOpen": "Search",
  "mobileSearchTitle": "What are you looking for?",
  "mobileSearchApply": "Show results"
```

`pt-MZ` and `pt-PT` (identical — nothing here differs between the two):
```json
  "sortOption": {
    "default": "Sugeridos",
    "newest": "Mais recentes",
    "price": "Preço",
    "rating": "Melhor avaliados",
    "reviews": "Mais avaliados",
    "name": "Nome (A–Z)"
  },
  "resultsScope": {
    "all": "em todas as categorias",
    "category": "em {{category}}",
    "city": "em {{city}}",
    "categoryCity": "em {{category}}, {{city}}"
  },
  "heroBadgeServices": "Sem regateio",
  "heroBadgeServicesBody": "preço e duração fechados antes de reservar",
  "heroSubtitleServices": "Escolha o trabalho, veja quanto custa e quanto demora, e combine a hora.",
  "heroBadgeProviders": "Verificados",
  "heroBadgeProvidersBody": "documentos conferidos pela Ntizo, um a um",
  "heroSubtitleProviders": "Pessoas e negócios com preços à vista e avaliações escritas por quem já os contratou.",
  "searchFieldService": "Serviço",
  "searchFieldServiceEmpty": "O que precisa de fazer?",
  "searchFieldProvider": "Prestador",
  "searchFieldProviderEmpty": "Nome do negócio ou profissional",
  "searchFieldCity": "Cidade",
  "searchFieldCityEmpty": "Em qualquer cidade",
  "pagerLabel": "Páginas",
  "stubProviderRating": "nota do prestador",
  "stubQuoteAmount": "A combinar",
  "stubPerService": "por serviço",
  "mobileSearchOpen": "Procurar",
  "mobileSearchTitle": "O que procura?",
  "mobileSearchApply": "Ver resultados"
```

`es-ES`:
```json
  "sortOption": { "default": "Sugeridos", "newest": "Más recientes", "price": "Precio", "rating": "Mejor valorados", "reviews": "Más valorados", "name": "Nombre (A–Z)" },
  "resultsScope": { "all": "en todas las categorías", "category": "en {{category}}", "city": "en {{city}}", "categoryCity": "en {{category}}, {{city}}" },
  "heroBadgeServices": "Sin regatear",
  "heroBadgeServicesBody": "precio y duración cerrados antes de reservar",
  "heroSubtitleServices": "Elige el trabajo, mira cuánto cuesta y cuánto dura, y acuerda la hora.",
  "heroBadgeProviders": "Verificados",
  "heroBadgeProvidersBody": "documentos comprobados por Ntizo, uno a uno",
  "heroSubtitleProviders": "Personas y negocios con precios a la vista y opiniones escritas por quienes ya los contrataron.",
  "searchFieldService": "Servicio",
  "searchFieldServiceEmpty": "¿Qué necesitas hacer?",
  "searchFieldProvider": "Profesional",
  "searchFieldProviderEmpty": "Nombre del negocio o profesional",
  "searchFieldCity": "Ciudad",
  "searchFieldCityEmpty": "En cualquier ciudad",
  "pagerLabel": "Páginas",
  "stubProviderRating": "valoración del profesional",
  "stubQuoteAmount": "A convenir",
  "stubPerService": "por servicio",
  "mobileSearchOpen": "Buscar",
  "mobileSearchTitle": "¿Qué buscas?",
  "mobileSearchApply": "Ver resultados"
```

`fr-FR`:
```json
  "sortOption": { "default": "Suggérés", "newest": "Plus récents", "price": "Prix", "rating": "Mieux notés", "reviews": "Plus d’avis", "name": "Nom (A–Z)" },
  "resultsScope": { "all": "dans toutes les catégories", "category": "en {{category}}", "city": "à {{city}}", "categoryCity": "en {{category}}, à {{city}}" },
  "heroBadgeServices": "Sans marchander",
  "heroBadgeServicesBody": "prix et durée fixés avant de réserver",
  "heroSubtitleServices": "Choisissez la prestation, voyez ce qu’elle coûte et combien de temps elle prend, puis convenez d’une heure.",
  "heroBadgeProviders": "Vérifiés",
  "heroBadgeProvidersBody": "documents contrôlés par Ntizo, un par un",
  "heroSubtitleProviders": "Des personnes et des entreprises aux prix affichés, avec des avis écrits par ceux qui les ont engagées.",
  "searchFieldService": "Prestation",
  "searchFieldServiceEmpty": "Que faut-il faire ?",
  "searchFieldProvider": "Prestataire",
  "searchFieldProviderEmpty": "Nom de l’entreprise ou du professionnel",
  "searchFieldCity": "Ville",
  "searchFieldCityEmpty": "Partout",
  "pagerLabel": "Pages",
  "stubProviderRating": "note du prestataire",
  "stubQuoteAmount": "À convenir",
  "stubPerService": "par prestation",
  "mobileSearchOpen": "Rechercher",
  "mobileSearchTitle": "Que cherchez-vous ?",
  "mobileSearchApply": "Voir les résultats"
```

`it-IT`:
```json
  "sortOption": { "default": "Consigliati", "newest": "Più recenti", "price": "Prezzo", "rating": "Più votati", "reviews": "Più recensiti", "name": "Nome (A–Z)" },
  "resultsScope": { "all": "in tutte le categorie", "category": "in {{category}}", "city": "a {{city}}", "categoryCity": "in {{category}}, a {{city}}" },
  "heroBadgeServices": "Senza trattare",
  "heroBadgeServicesBody": "prezzo e durata fissati prima di prenotare",
  "heroSubtitleServices": "Scegli il lavoro, guarda quanto costa e quanto dura, e concorda l’orario.",
  "heroBadgeProviders": "Verificati",
  "heroBadgeProvidersBody": "documenti controllati da Ntizo, uno per uno",
  "heroSubtitleProviders": "Persone e attività con i prezzi in chiaro e recensioni scritte da chi le ha già ingaggiate.",
  "searchFieldService": "Servizio",
  "searchFieldServiceEmpty": "Di cosa hai bisogno?",
  "searchFieldProvider": "Professionista",
  "searchFieldProviderEmpty": "Nome dell’attività o del professionista",
  "searchFieldCity": "Città",
  "searchFieldCityEmpty": "Ovunque",
  "pagerLabel": "Pagine",
  "stubProviderRating": "voto del professionista",
  "stubQuoteAmount": "Da concordare",
  "stubPerService": "a servizio",
  "mobileSearchOpen": "Cerca",
  "mobileSearchTitle": "Cosa cerchi?",
  "mobileSearchApply": "Vedi i risultati"
```

`de-DE`:
```json
  "sortOption": { "default": "Empfohlen", "newest": "Neueste", "price": "Preis", "rating": "Beste Bewertung", "reviews": "Meiste Bewertungen", "name": "Name (A–Z)" },
  "resultsScope": { "all": "in allen Kategorien", "category": "für {{category}}", "city": "in {{city}}", "categoryCity": "für {{category}} in {{city}}" },
  "heroBadgeServices": "Ohne Feilschen",
  "heroBadgeServicesBody": "Preis und Dauer stehen vor der Buchung fest",
  "heroSubtitleServices": "Wählen Sie die Leistung, sehen Sie Preis und Dauer, und vereinbaren Sie einen Termin.",
  "heroBadgeProviders": "Geprüft",
  "heroBadgeProvidersBody": "Dokumente von Ntizo einzeln geprüft",
  "heroSubtitleProviders": "Menschen und Betriebe mit offenen Preisen und Bewertungen von Kundinnen und Kunden, die sie beauftragt haben.",
  "searchFieldService": "Leistung",
  "searchFieldServiceEmpty": "Was soll erledigt werden?",
  "searchFieldProvider": "Anbieter",
  "searchFieldProviderEmpty": "Name des Betriebs oder der Fachkraft",
  "searchFieldCity": "Stadt",
  "searchFieldCityEmpty": "Überall",
  "pagerLabel": "Seiten",
  "stubProviderRating": "Bewertung des Anbieters",
  "stubQuoteAmount": "Nach Absprache",
  "stubPerService": "pro Leistung",
  "mobileSearchOpen": "Suchen",
  "mobileSearchTitle": "Wonach suchen Sie?",
  "mobileSearchApply": "Ergebnisse anzeigen"
```

`nl-NL`:
```json
  "sortOption": { "default": "Aanbevolen", "newest": "Nieuwste", "price": "Prijs", "rating": "Best beoordeeld", "reviews": "Meest beoordeeld", "name": "Naam (A–Z)" },
  "resultsScope": { "all": "in alle categorieën", "category": "voor {{category}}", "city": "in {{city}}", "categoryCity": "voor {{category}} in {{city}}" },
  "heroBadgeServices": "Geen afdingen",
  "heroBadgeServicesBody": "prijs en duur staan vast voordat je boekt",
  "heroSubtitleServices": "Kies de klus, zie wat die kost en hoelang die duurt, en spreek een tijd af.",
  "heroBadgeProviders": "Geverifieerd",
  "heroBadgeProvidersBody": "documenten stuk voor stuk gecontroleerd door Ntizo",
  "heroSubtitleProviders": "Mensen en bedrijven met open prijzen en beoordelingen van klanten die ze al inhuurden.",
  "searchFieldService": "Dienst",
  "searchFieldServiceEmpty": "Wat moet er gebeuren?",
  "searchFieldProvider": "Aanbieder",
  "searchFieldProviderEmpty": "Naam van het bedrijf of de vakman",
  "searchFieldCity": "Stad",
  "searchFieldCityEmpty": "Overal",
  "pagerLabel": "Pagina’s",
  "stubProviderRating": "beoordeling van de aanbieder",
  "stubQuoteAmount": "In overleg",
  "stubPerService": "per dienst",
  "mobileSearchOpen": "Zoeken",
  "mobileSearchTitle": "Waar ben je naar op zoek?",
  "mobileSearchApply": "Resultaten tonen"
```

- [ ] **Step 3: Run the parity gate and the whole suite**

```bash
cd apps/frontend/web && bun run vitest run
```

Expected: parity PASSES. Any test still asserting `sortDefault`/`sortNewest`/`providerSort` FAILS — those are `services-browse-page` and `directory-sort` assertions, and Tasks 19–21 delete both. Leave them red for exactly one commit and say so in the message; do not weaken the assertions to make them green.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/web/src/shared/locales
git commit -m "feat(directory): one sort vocabulary for both browse pages

Two pages rendering the same control read from two key sets — sortDefault/
sortNewest on one, providerSort on the other — which is how they drifted into
a row of links and a dropdown. Tests asserting the old keys are red until
Tasks 19-21 replace their readers."
```

---

### Task 19: `/services`, rebuilt on the shells

**Files:**
- Create: `apps/frontend/web/src/features/directory/services/domain/service-stub.ts`
- Create: `apps/frontend/web/src/features/directory/services/domain/__tests__/service-stub.test.ts`
- Create: `apps/frontend/web/src/features/directory/services/ui/service-listing-card.tsx`
- Create: `apps/frontend/web/src/features/directory/services/ui/service-facets.tsx`
- Rewrite: `apps/frontend/web/src/features/directory/services/ui/services-browse-page.tsx`
- Test: `apps/frontend/web/src/features/directory/services/ui/__tests__/service-listing-card.test.tsx`

**Interfaces:**
- Consumes: every shell from Tasks 4–11; `browseTitle` (12); `browseFilterChips` (13); `total` (14); `sort: "price"` (15); `city` + `serviceCities` (16); `providerRatingAverage`/`providerReviewCount` (17); the copy from Task 18.
- Produces: `serviceStubParts(service: ServiceDTO): StubParts`.

- [ ] **Step 1: Write the failing test for the price mapping**

Create `apps/frontend/web/src/features/directory/services/domain/__tests__/service-stub.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { serviceStubParts } from "../service-stub";
import type { ServiceDTO } from "../types";

const service = (over: Partial<ServiceDTO> = {}): ServiceDTO =>
  ({
    id: "s1",
    providerId: "p1",
    providerName: "Estúdio Mavalane",
    providerSlug: "estudio-mavalane",
    providerType: "organization",
    providerRatingAverage: 4.7,
    providerReviewCount: 6,
    categoryCode: "hair",
    categoryName: "Hair & beauty",
    name: "Haircut",
    description: null,
    locationType: "at_provider",
    bookingMode: "priced",
    imageUrls: [],
    defaultOption: {
      amountMinor: 80_000,
      currency: "MZN",
      durationMinutes: 45,
      minMinutes: null,
      stepMinutes: null,
      pricingMode: "fixed",
    },
    fromAmountMinor: 80_000,
    optionCount: 1,
    isFallback: false,
    ...over,
  }) as ServiceDTO;

describe("serviceStubParts", () => {
  it("shows a fixed price as an amount, with the job's own length under it", () => {
    expect(serviceStubParts(service())).toEqual({
      eyebrowKey: "filterPaymentOption.fixed",
      amount: { kind: "money", amountMinor: 80_000, currency: "MZN" },
      under: { key: "serviceDurationMinutes", values: { minutes: 45 } },
      variant: "primary",
    });
  });

  it("shows an hourly price with the minimum booking, never a duration", () => {
    // An hourly option's durationMinutes is null precisely because the
    // customer decides how long the job runs. minMinutes is the only number
    // that option has to offer here.
    const parts = serviceStubParts(
      service({
        defaultOption: {
          amountMinor: 60_000,
          currency: "MZN",
          durationMinutes: null,
          minMinutes: 120,
          stepMinutes: 60,
          pricingMode: "hourly",
        },
      }),
    );
    expect(parts.eyebrowKey).toBe("filterPaymentOption.hourly");
    expect(parts.under).toEqual({ key: "serviceMinimumMinutes", values: { minutes: 120 } });
  });

  it("says the price is to be agreed on a quote service, and softens the button", () => {
    // A solid blue CTA beside a price of "to agree" promises a checkout that
    // does not exist for this service.
    const parts = serviceStubParts(service({ bookingMode: "quote", defaultOption: null, fromAmountMinor: null }));
    expect(parts.amount).toEqual({ kind: "key", key: "stubQuoteAmount" });
    expect(parts.variant).toBe("quiet");
    expect(parts.under).toBeUndefined();
  });

  it("says 'from' only when there is more than one option to be from", () => {
    // With a single option, "from 800" invites the reader to look for a
    // cheaper price that cannot exist.
    expect(serviceStubParts(service({ optionCount: 1 })).eyebrowKey).toBe("filterPaymentOption.fixed");
    expect(serviceStubParts(service({ optionCount: 3, fromAmountMinor: 50_000 })).eyebrowKey).toBe("providerFrom");
  });

  it("carries no duration for a 'from' price, because it belongs to another option", () => {
    // The amount is the cheapest option's; the default option's "45 min" is a
    // fact about a different thing, and printing the two together reads as one.
    expect(serviceStubParts(service({ optionCount: 3, fromAmountMinor: 50_000 })).under).toBeUndefined();
  });

  it("does not call a priced service with no option a quote", () => {
    // Deactivating a service's last option leaves a published `priced`
    // service behind, and it looks exactly like a quote one on the wire.
    // Telling that customer to ask for a price is wrong advice, not merely a
    // mislabelled one — the price exists, its packages are (probably
    // temporarily) gone.
    const parts = serviceStubParts(service({ bookingMode: "priced", defaultOption: null, fromAmountMinor: null }));
    expect(parts.amount).toEqual({ kind: "key", key: "priceUnavailable" });
    expect(parts.variant).toBe("quiet");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bun run vitest run src/features/directory/services/domain/__tests__/service-stub.test.ts
```

Expected: FAIL — cannot resolve `../service-stub`.

- [ ] **Step 3: Write `service-stub.ts`**

```ts
import {
  optionDurationMinutes,
  servicePriceCell,
} from "@/features/directory/services/domain/service-card";
import type { ServiceDTO } from "@/features/directory/services/domain/types";

export interface StubParts {
  /** A key in the `directory` namespace, for the eyebrow above the amount. */
  eyebrowKey: string;
  amount:
    | { kind: "money"; amountMinor: number; currency: string }
    | { kind: "key"; key: string };
  under?: { key: string; values: Record<string, number> };
  variant: "primary" | "quiet";
}

/**
 * What a service's price rail says.
 *
 * Built on `servicePriceCell`, which already decides the hard part and keys
 * off `bookingMode` before it ever inspects `defaultOption` — read its doc
 * comment before changing anything here. This adds only what the stub needs on
 * top: which eyebrow, which line underneath, and whether the button should be
 * loud.
 *
 * `quiet` wherever the destination cannot be paid for: a solid brand-blue CTA
 * beside a price of "to agree" promises a checkout that does not exist.
 */
export function serviceStubParts(service: ServiceDTO): StubParts {
  const cell = servicePriceCell(service);

  if (cell.kind === "quote") {
    return { eyebrowKey: "filterPaymentOption.quote", amount: { kind: "key", key: "stubQuoteAmount" }, variant: "quiet" };
  }
  if (cell.kind === "unavailable") {
    // Deliberately not `quote`. See `serviceDetailPanel`'s comment: a `priced`
    // service whose last option was deactivated is reachable and normal, and
    // telling its customer to ask for a price is wrong advice.
    return { eyebrowKey: "filterPaymentOption.fixed", amount: { kind: "key", key: "priceUnavailable" }, variant: "quiet" };
  }
  if (cell.kind === "from") {
    // No duration. The amount belongs to the *cheapest* option and this card
    // knows nothing else about it — printing the default option's length
    // beside another option's price is two facts about two things read as one.
    return {
      eyebrowKey: "providerFrom",
      amount: { kind: "money", amountMinor: cell.amountMinor, currency: cell.currency },
      variant: "primary",
    };
  }

  const minutes = optionDurationMinutes(cell.option);
  return {
    eyebrowKey: `filterPaymentOption.${cell.option.pricingMode === "hourly" ? "hourly" : "fixed"}`,
    amount: { kind: "money", amountMinor: cell.option.amountMinor, currency: cell.option.currency },
    ...(minutes != null
      ? {
          under: {
            // Two different sentences: a fixed job has a length, an hourly one
            // has a minimum the customer must book.
            key: cell.option.pricingMode === "hourly" ? "serviceMinimumMinutes" : "serviceDurationMinutes",
            values: { minutes },
          },
        }
      : {}),
    variant: "primary",
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd apps/frontend/web && bun run vitest run src/features/directory/services/domain/__tests__/service-stub.test.ts
```

Expected: PASS, 6 tests. Check the existing `serviceDurationMinutes` / `serviceMinimumMinutes` keys interpolate `{{minutes}}`; if they use another name, use theirs rather than editing eight locale files.

- [ ] **Step 5: Write `service-listing-card.tsx`**

One card, composing `ListingCard` + `ListingMedia` + `PriceStub`. Its own file, not inline in the page, because it is the piece with real branching in it. Key decisions to encode:

```tsx
// The title link, not the card, carries the destination — and it goes to
// `/services/$id`, not to the provider. A reader who clicked "Haircut" wanted
// that service, not a chance to hunt for it again among everything else the
// barbershop offers.
<Link to="/services/$id" params={{ id: service.id }} className={LISTING_TITLE_LINK_CLASS}>

// The image falls back to nothing rather than to the provider's logo: on a
// provider's own page a logo is recognisable context, but in a mixed browse it
// puts the same picture on four unrelated cards. `ListingMedia`'s generated
// tile is the fallback instead.
<ListingMedia imageUrl={service.imageUrls[0] ?? null} seed={service.categoryCode} name={service.providerName} icon={categoryIcon} />

// The rating is the *provider's*, so it says so. Unlabelled it would claim the
// service has been reviewed six times, which it has not.
rating={service.providerRatingAverage === null ? undefined
  : { average: service.providerRatingAverage, count: service.providerReviewCount, attribution: t("stubProviderRating") }}
```

Write `apps/frontend/web/src/features/directory/services/ui/__tests__/service-listing-card.test.tsx` covering: a service with no photo renders the generated tile; a provider with `providerRatingAverage: null` renders no stars; a `quote` service renders the quiet CTA and "To agree"; the title links to `/services/$id` and not to `/providers/$slug`; the rating carries its attribution. Render inside a `createMemoryHistory` router stub — copy the harness from `features/directory/services/ui/__tests__/service-detail-page.test.tsx`, which already solves this.

- [ ] **Step 6: Write `service-facets.tsx`**

The sidebar, replacing `browse-filters.tsx`. Same five groups it has today (`locationType`, `paymentMode`, `providerType`, `language`, price) **plus city**, rendered with `FacetGroup` / `facetOptionClass` / `FacetBox` / `FacetCount`. Cities come from the new `serviceCities` query and carry counts; the other five carry none, and `FacetCount` is simply not rendered for them.

Keep two rules the current file already gets right and a rewrite loses easily: clicking the active option clears it (`toSearch(active ? undefined : value)`), and every link is built by `browseSearch` so it keeps the search term and the sort. Keep the mobile sheet wrapper (`MobileFilterBar`) as it is — Task 21 restyles it.

- [ ] **Step 7: Rewrite `services-browse-page.tsx`**

```
<SiteHeader current="services" />
<BrowseHero
  kicker={{ badge: t("heroBadgeServices"), body: t("heroBadgeServicesBody") }}
  title={t(title.key, title.values)}
  subtitle={t("heroSubtitleServices")}
  search={<BrowseSearchCard …>}
/>
<CategoryRail label={t("servicesFilterByCategory")}>…</CategoryRail>
<main className="page-shell">
  <div className="grid lg:grid-cols-[250px_minmax(0,1fr)] gap-11 items-start py-8">
    <ServiceFacets current={current} />
    <div className="min-w-0">
      <ResultsBar summary={…} sortLabel={t("sortLabel")}>…3 sort links…</ResultsBar>
      <ActiveFilterChips …/>            {/* only when browseFilterChips is non-empty */}
      <ul className="mt-4 grid list-none items-start gap-3.5 p-0">…</ul>
      <Pager total={page.total} pageSize={BROWSE_PAGE_SIZE} offset={offset} … />
    </div>
  </div>
</main>
<MobileFilterBar current={current} />
```

Keep, unchanged, the two empty states and `isNarrowed`. Extend `isNarrowed` with `current.city` — a filter left out of it makes an empty result say "the platform has published nothing" to somebody who only asked for Maputo.

The results summary is two translated pieces, not one: `t("servicesFound", { count: page.total })` followed by the matching `resultsScope` entry. Pass `page.total`, never `page.items.length` — that is the bug this whole task chain started from.

- [ ] **Step 8: Run everything**

```bash
cd apps/frontend/web && bun run vitest run && bun run typecheck && bun run lint
```

Expected: PASS. The old `services-browse-page` assertions about `sortDefault`/`sortNewest` left red by Task 18 go green here, rewritten against `sortOption`.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/web/src/features/directory/services
git commit -m "feat(services): the browse, rebuilt on the shared shell

A page head, list rows with a ticket stub, chips for what is narrowing, and
numbered paging on the real total. The summary states page.total — items.length
told somebody with 40 matches that they had 24."
```

---

### Task 20: `/providers`, rebuilt on the same shells

**Files:**
- Create: `apps/frontend/web/src/features/directory/ui/provider-listing-card.tsx`
- Create: `apps/frontend/web/src/features/directory/ui/provider-facets.tsx`
- Rewrite: `apps/frontend/web/src/features/directory/ui/directory-page.tsx`
- Test: `apps/frontend/web/src/features/directory/ui/__tests__/provider-listing-card.test.tsx`
- Delete: `apps/frontend/web/src/features/directory/ui/provider-card.tsx`, `directory-filters.tsx`, `directory-category-band.tsx`, `directory-search-box.tsx`, `directory-sort.tsx`

**Interfaces:**
- Consumes: every shell (4–11); `directoryTitle` (12); `directoryFilterChips` (13); the copy (18); the composition pattern established by Task 19.
- Produces: nothing new. This page is deliberately the twin of the last one.

- [ ] **Step 1: Write the failing card test**

Create `apps/frontend/web/src/features/directory/ui/__tests__/provider-listing-card.test.tsx`. Cases:

```tsx
it("leads with the business's photograph, then its logo, then a generated tile", () => {
  // Three fallbacks because most businesses have none of the first two, and a
  // provider directory of empty grey boxes reads as a directory of nothing.
});

it("draws no stars for a business nobody has reviewed", () => {
  // ratingAverage null, not 0 — see providerPublicReadModel.
});

it("shows the score without an attribution, because it is this business's own", () => {
  // Unlike a service card, where the score belongs to the provider and says so.
  expect(screen.queryByText("provider rating")).not.toBeInTheDocument();
});

it("links to the business, and calls the action 'View business' rather than 'Book'", () => {
  // You do not book a business; you open it.
  expect(screen.getByRole("link", { name: "View business" })).toHaveAttribute("href", "/providers/estudio-mavalane");
});

it("caps the trades it lists", () => {
  // A business publishing in eight would push the price off every card in
  // its row.
  render(card({ categories: eight }));
  expect(screen.getAllByTestId("provider-category")).toHaveLength(3);
});

it("says how many services it publishes, and omits the chip at zero", () => {
  // "0 services" beside a business you can still message is a discouragement
  // with no action behind it.
});

it("omits the description element entirely when the business has written none", () => {
  // Which is most of them.
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/frontend/web && bun run vitest run src/features/directory/ui/__tests__/provider-listing-card.test.tsx
```

- [ ] **Step 3: Write `provider-listing-card.tsx`**

`ListingCard` + `ListingMedia` + `PriceStub`, carrying:

| Slot | Content |
|---|---|
| media | `provider.photoUrls[0] ?? provider.logoUrl ?? null`, seeded on `provider.categories[0]?.code ?? provider.id` |
| meta | `typeIndividual`/`typeOrganization`, then district + city |
| title | `<Link to="/providers/$slug" params={{ slug }}>` with `LISTING_TITLE_LINK_CLASS` |
| description | `provider.description`, clamped by `ListingCard` |
| tags | up to 3 categories, then `providerServiceCount` when above zero, then a `good`-toned "verified" chip when `provider.verified` |
| stub | rating with **no** attribution; eyebrow `providerFrom`; amount from `fromAmountMinor`/`fromCurrency`; under `stubPerService`; CTA `providerOpen` |

Where `fromAmountMinor` is null the stub is not rendered at all and the CTA moves into the body — a business that publishes nothing priced has no price rail to draw, and an empty stub is a dashed line with a hole in it and nothing beside it. Add a test for this case.

Whole-unit money, as `provider-card.tsx` does today: a directory "from" price is already an approximation, and two decimals on it is noise. Copy `formatPrice`'s `maximumFractionDigits: 0` and its reasoning across; do not import it from the file being deleted.

- [ ] **Step 4: Write `provider-facets.tsx`**

The five groups `directory-filters.tsx` has today — city (with its existing counts), provider kind, rating, verification, price — rendered with the shared facet parts. Keep the rule that the city group is drawn only when there is more than one city to choose between: a filter offering a single option narrows nothing and spends a row of the panel saying so.

- [ ] **Step 5: Rewrite `directory-page.tsx`**

The same composition as Task 19's page, differing only in: the hero's kicker and subtitle keys, the search card's first field (`searchFieldProvider`), five sort links instead of three, `DIRECTORY_PAGE_SIZE`, and the card. If the two page files diverge in anything else, one of them is wrong.

The `h1` moves out of the content column and into the hero — that column no longer holds a heading at all. Keep `isNarrowed` exactly as it is; the directory's filter set does not change in this plan.

- [ ] **Step 6: Delete the five superseded files**

`provider-card.tsx`, `directory-filters.tsx`, `directory-category-band.tsx`, `directory-search-box.tsx`, `directory-sort.tsx`, and their tests. Then delete `shared/components/filter-panel.tsx` — with both pages moved to `FacetPanel`, nothing imports it, and leaving it beside its replacement is how a later change lands in the wrong one.

```bash
cd apps/frontend/web && bun run lint
```

Expected: no unused-import errors. If `filter-panel.tsx` still has a reader, find it before deleting.

- [ ] **Step 7: Run everything**

```bash
cd apps/frontend/web && bun run vitest run && bun run typecheck && bun run lint
```

Expected: PASS, with every `providerSort` assertion left red by Task 18 now gone with the file that made them.

- [ ] **Step 8: Commit**

```bash
git add -A apps/frontend/web/src/features/directory apps/frontend/web/src/shared/components/filter-panel.tsx
git commit -m "feat(providers): the directory, rebuilt as the services browse's twin

Five files deleted, including the dropdown sort that was the clearest sign the
two pages had drifted. If the two page files differ in anything but their copy,
their card and their page size, one of them is wrong."
```

---

### Task 21: The phone, and the sweep

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/mobile-search-sheet.tsx`
- Modify: `apps/frontend/web/src/features/directory/services/ui/services-browse-page.tsx` and `.../ui/directory-page.tsx`
- Modify: `apps/frontend/web/src/features/directory/services/ui/service-facets.tsx` and `.../ui/provider-facets.tsx`
- Delete: `features/directory/services/ui/{browse-filters,category-band,search-box,browse-service-card,service-card-legacy}.tsx` as applicable
- Test: `apps/frontend/web/src/shared/components/browse/__tests__/mobile-search-sheet.test.tsx`

**Interfaces:**
- Consumes: `BrowseSearchField` (11), `Sheet` from `@ntizo/frontend-ui`.
- Produces: `MobileSearchTrigger`, `MobileSearchSheet`.

- [ ] **Step 1: Write the failing test**

```tsx
describe("MobileSearchSheet", () => {
  it("shows one tappable row instead of the three-field bar", () => {
    // Two fields and a button squeezed into 360px is a control nobody
    // completes; the desktop card is hidden below `md` and this replaces it.
    render(<MobileSearchTrigger label="Search" value="Anywhere" onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: /Search/ })).toBeInTheDocument();
  });

  it("opens a dialog with both fields and a way to apply them", () => {
    render(<MobileSearchSheet open onOpenChange={() => {}} title="What are you looking for?" apply="Show results">…</MobileSearchSheet>);
    expect(screen.getByRole("dialog", { name: "What are you looking for?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show results" })).toBeInTheDocument();
  });

  it("closes when the results are applied", () => {
    // A sheet left open over the results it just changed hides the answer to
    // the question the reader asked — the same rule MobileFilterBar follows.
  });
});
```

- [ ] **Step 2: Run it, watch it fail, then write the component**

A `Sheet` with `side="bottom"`, `max-h-[85svh]`, the two `BrowseSearchField`s stacked, and a full-width apply button. The trigger is rendered by `BrowseHero`'s `search` slot below `md`, with the `BrowseSearchCard` hidden below `md` — one of the two is on screen at any width, never both.

- [ ] **Step 3: Restyle the existing mobile filter bar**

`MobileFilterBar` and `MobileDirectoryFilterBar` keep their behaviour exactly — fixed to the bottom, a count badge, closing on any choice — and take the new tokens: `--shadow-float` on the bar, `--color-border-strong` on the button. Keep the `h-20 lg:hidden` spacer that reserves the height the fixed bar covers; without it the last card and the pager sit underneath it.

Add the active-filter chips above the first result on the phone as well as the desktop — this is where they matter most, because the sidebar is behind a sheet and there is otherwise no way at all to see what is on.

- [ ] **Step 4: Delete what the services page superseded**

`browse-filters.tsx`, `category-band.tsx`, `search-box.tsx`, `browse-service-card.tsx` and their tests. `service-card.tsx` **stays** — it is the provider's own page's card, opening the availability sheet, and is not part of this redesign. Check its imports still resolve after `browse-service-card.tsx` goes: `ServicePrice` is exported from it and was imported by the deleted file, not the other way round.

- [ ] **Step 5: Check both pages at both widths against the mockup**

```bash
cd apps/frontend/web && bun run dev
```

Open `/services` and `/providers` at 1440px and at 390px beside `docs/superpowers/specs/2026-08-27-customer-listings-redesign.mockup.html`. Confirm specifically:

- the search card straddles the hero's bottom edge and **is not clipped** — this was a real bug in the first mockup, caused by `overflow: hidden` on the hero;
- the stub's notches are visible as holes on both card edges, in light **and** dark;
- a card with no photo shows a coloured tile, not a grey box;
- the category rail scrolls with a fade at both ends and does not show a raw scrollbar;
- the mobile card stacks with the stub turned horizontal and its notches at the ends;
- nothing scrolls the page sideways at 360px.

- [ ] **Step 6: Full suite, then commit**

```bash
cd apps/frontend/web && bun run vitest run && bun run typecheck && bun run lint
cd ../../.. && bun run test && bun run check-types
```

```bash
git add -A
git commit -m "feat(browse): the phone, and delete what the shells replaced

Three fields in 360px is a control nobody completes: below md the search card
becomes one row that opens a sheet. The active-filter chips matter most here —
the sidebar is behind a sheet, so they are the only way to see what is on."
```

---

## Self-Review

Run before handing this plan to an executor.

**Spec coverage.** Every section of the design doc maps to a task: the shells (4–11), the title (12), the chips (13), `total` (14), price sort (15), city + facets (16), the provider rating (17), the copy (18), the two pages (19–20), the phone and the deletions (21). The tokens section is Task 1. The testing section is distributed — each task carries the assertions its own deliverable needs.

**Two spec items are deliberately absent, and both are honest:**
- *Favourites* — its own plan, `docs/superpowers/plans/2026-08-27-favourites.md`, because it is a bounded context, a Postgres schema and a feature rather than a redesign. `ListingMedia`'s `favourite` slot stays empty and renders nothing until then.
- *The badges and the availability line* ("Most booked", "Urgent", "Vaga hoje às 15:30") — shown in the approved mockup as slots. `ListingMedia` accepts a `badge` and both pages pass nothing. Building the data behind them is not in this plan and is not implied by it.

**Type consistency check.** `StubRating` (Task 4) is what Tasks 19 and 20 construct. `PageSlot` (Task 3) is what `Pager` (10) consumes and both pages render. `FilterChip` (13) is what `ActiveFilterChip` (9) is fed. `StubParts` (19) is used only inside the services card. `browseTitle`/`directoryTitle` both return `TitleParts`. `ServicePageDTO.total` (14) is read by Task 19's `Pager` and its summary.

**One ordering trap to respect.** Task 13 adds `city` to `BrowseSearch` and to `browseSearch()`, and Task 16 adds it to the route, the repository and the query key. Doing 16 before 13 leaves the filter reachable from a URL and silently dropped by every link on the page.

**One risk this plan does not remove.** `total` counts what the filters match; the projection then drops rows whose translations resolve to nothing. Across every page the rows shown can be very slightly fewer than the count claims. Stated in the read model's own doc comment rather than hidden — the alternative is fetching and mapping the whole result set on every request.
