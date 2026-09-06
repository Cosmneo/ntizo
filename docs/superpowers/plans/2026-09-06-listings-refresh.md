# Listings Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/services` and `/providers` as a white, photograph-led catalogue — search in the header, categories as an icon strip, filters as `<details>` popovers, four service tiles per row, hairline provider rows that show what a business sells — and add the one read-model field that row needs.

**Architecture:** New borderless components under `apps/frontend/web/src/shared/components/browse/`, composed by the two page files. Every filter option stays a route-typed `<Link>` built by `browseSearch`/`directorySearch`, so a filtered list stays a URL the back button undoes and a crawler can follow. One backend change: `services` (max three, cheapest first) on `providerPublicReadModel`, attached by a second query keyed on the page's provider ids, the way `categoriesFor` already works. Old components are deleted only after both pages stop importing them, so every task ends with a green build.

**Tech Stack:** Bun, React 19, TanStack Start/Router/Query, react-i18next, Tailwind 4, `@ntizo/frontend-ui`, Drizzle + Postgres, `@cosmneo/onion-lasagna` GraphQL field kit, vitest (web, frontend-ui, shared), `bun test` (backend).

**Spec:** `docs/superpowers/specs/2026-09-06-listings-refresh-design.md` — read it first. The approved drawing is `docs/superpowers/specs/2026-09-06-listings-refresh.mockup.html` beside it; where the two disagree the spec wins, and its "Deviations from the mockup" section says why.

## Global Constraints

- **Blue appears once per page.** `--color-primary` is the header's search button and nothing else on these two pages. Headings, prices, provider names, active pills, the current page number and the verified seal are `--color-headline` / `--color-navy-surface`. The amber star keeps `--color-warning`.
- **No borders, no shadows, no radius on a result.** A service tile is a photograph with three lines under it; a provider row is separated by a 1px `--color-border` hairline. `shadow-*` appears only on the header search pill and the phone's floating control.
- **Every filter option is a `<Link>`**, never a checkbox or a button, built by `browseSearch` / `directorySearch` so it carries every other parameter. The popover that holds them is a `<details>`, so it opens with no JavaScript.
- **Counts come from `page.total`, never `items.length`.** The projection drops rows it cannot render; counting what arrived once told somebody with 40 matches that they had 24.
- **The rating on a service tile is the provider's**, and its `aria-label` says so (`providerRatingLabel`). It sits on the provider's line, never beside the service's name. This is deviation 1 in the spec.
- **No heart, no "Verificados" pill on `/services`, no "Hoje" chip, no map, no "de N prestadores" clause.** Deviations 2–5; each has no data behind it today.
- **Eight locales, pt-MZ authored first**: `pt-MZ`, `pt-PT`, `en-US`, `es-ES`, `fr-FR`, `de-DE`, `it-IT`, `nl-NL`. `src/shared/locales/__tests__/locales.test.ts` fails the build if one key is missing from one file.
- **Where commands run:** web tests `cd apps/frontend/web && bunx vitest run <path>`; frontend-ui tests `cd packages/frontend && bunx vitest run <path>`; shared tests `cd packages/shared && bunx vitest run <path>`; backend tests `cd packages/backend && bun test <path>`. Typecheck per package with `bun run typecheck`, lint with `bun run lint`.
- **Commit style:** `feat(directory): …`, `feat(provider): …`, `test(web): …`, `refactor(web): …`, `docs: …`; body explains why; end every message with

  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_015PZzqSMWVoXxyPCc2h1Vhy
  ```
- **Work in a worktree** branched from `origin/dev` (superpowers:using-git-worktrees). The main working tree is on `feat/real-home-page`.

---

## File structure

**`packages/frontend`** (the UI kit, where the design system lives)
- `package.json` — `@fontsource/figtree` replaces `@fontsource/poppins` and `@fontsource/inter`.
- `src/styles/globals.css` — the font imports, the three font variables, and three new colour tokens in `:root`, `.dark` and `@theme inline`.
- `src/styles/__tests__/tokens.test.ts` — its `ADDED` list gains the three tokens, which is what proves they exist in both themes.

**`packages/shared`**
- `src/read-models/public/provider-public.schema.ts` — `services` on `providerPublicReadModel`.

**`packages/backend`**
- `src/modules/ntizo/public/provider/infra/repositories/drizzle/provider-public.repository.ts` — a `servicesFor` second query beside the existing `categoriesFor`, and its wiring into `listActive`.
- `src/modules/ntizo/public/provider/__tests__/public-provider.test.ts` — the cap, the order, and the quote-only provider.

**`apps/frontend/web/public/brand`**
- `tie-pattern.svg` — the manual's tie, two per 144×244 tile, in `#38b6ff`. Served at `/brand/tie-pattern.svg` and referenced by CSS, so it is cached once rather than inlined into every tile.

**`apps/frontend/web/src/shared/domain`**
- `initials.ts` — moved from `features/landing/domain/`, because shared components need it now.

**`apps/frontend/web/src/shared/components/browse`** (new)
| file | responsibility |
|---|---|
| `brand-tile.tsx` | the navy + tie + initials surface, for any listing with no photograph |
| `result-tile.tsx` | `TileMedia`, `RatingMark`, `ResultTile` — the photo-and-three-lines layout |
| `result-row.tsx` | `ResultRow` — the provider row's three-column layout and its service chips |
| `search-pill.tsx` | the header's two-field search and its phone sheet, shared by both pages |
| `category-strip.tsx` | icon-over-label strip with fades and desktop arrows |
| `filter-pill.tsx` | the `<details>` popover pill, its applied state and its × slot |
| `filter-sheet.tsx` | the phone's full-height filter sheet with its outcome button |
| `quick-chips.tsx` | the phone's one-tap chip row |
| `floating-controls.tsx` | the phone's navy Filtros/Ordenar control |

**Deleted at the end (Task 16), never before both pages stop importing them:** `browse-hero.tsx`, `price-stub.tsx`, `listing-card.tsx`, `listing-media.tsx`, `results-bar.tsx`, `active-filter-chips.tsx`, `mobile-search-sheet.tsx`, `category-rail.tsx`, `features/directory/services/domain/service-stub.ts`, `FacetPanel` from `facet-panel.tsx`, and the test files of each.

---

### Task 1: Figtree, and navy in three roles

**Files:**
- Modify: `packages/frontend/package.json`
- Modify: `packages/frontend/src/styles/globals.css`
- Test: `packages/frontend/src/styles/__tests__/tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS variables `--color-headline`, `--color-navy-surface`, `--color-navy-on`, usable as `text-[var(--color-headline)]` and `bg-[var(--color-navy-surface)]` in every later task. `--font-display`, `--font-rounded` and `--font-sans` all resolve to Figtree.

- [ ] **Step 1: Add the three tokens to the test's `ADDED` list**

In `packages/frontend/src/styles/__tests__/tokens.test.ts`, extend the existing array:

```ts
const ADDED = [
  "--color-surface-raised",
  "--color-border-strong",
  "--color-primary-deep",
  "--color-headline",
  "--color-navy-surface",
  "--color-navy-on",
  "--shadow-xs",
  "--shadow-sm",
  "--shadow-lift",
  "--shadow-float",
];
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/frontend && bunx vitest run src/styles/__tests__/tokens.test.ts`
Expected: FAIL — the three new names are declared in neither `:root` nor `.dark`.

- [ ] **Step 3: Install Figtree and drop the two faces it replaces**

```bash
cd packages/frontend && bun remove @fontsource/poppins @fontsource/inter && bun add @fontsource/figtree
```

- [ ] **Step 4: Swap the font imports at the top of `globals.css`**

Replace the five `@import "@fontsource/…"` lines with:

```css
/*
 * One family, as the brand manual specifies (p. 11). The app shipped Poppins
 * and Inter, neither of which the manual mentions; Figtree is the face the
 * logotype was drawn from, so headings finally match the wordmark above them.
 * Four weights, because that is what the type scale below asks for — the full
 * family is megabytes nobody renders.
 */
@import "@fontsource/figtree/400.css";
@import "@fontsource/figtree/500.css";
@import "@fontsource/figtree/600.css";
@import "@fontsource/figtree/700.css";
```

- [ ] **Step 5: Add the three tokens to `:root`**

Inside the `:root` block, after `--color-primary-deep`:

```css
  /*
   * Navy, from the manual (p. 8, #00244C), in the three roles it actually
   * plays. One token could not do all three: on a dark ground a navy heading
   * is invisible and a navy fill is indistinguishable from the page, so each
   * role needs its own dark value.
   */
  --color-headline: #00244c;
  --color-navy-surface: #00244c;
  --color-navy-on: #ffffff;
```

- [ ] **Step 6: Add their dark counterparts to `.dark`**

Inside the `.dark` block, after `--color-primary-deep`:

```css
  /*
   * Headline text goes near-white rather than navy — the same reason
   * `--shadow-*` deepens here. The surface lifts to a slate that still reads
   * as "chosen" against #0a0d14, and what sits on it stays legible.
   */
  --color-headline: #e6e9ef;
  --color-navy-surface: #1b2740;
  --color-navy-on: #e8ecf3;
```

- [ ] **Step 7: Point the three font variables at Figtree and register the tokens**

In the `@theme inline` block, replace the font declarations and add the three colours:

```css
  --font-display: "Figtree", ui-sans-serif, system-ui, sans-serif;
  --font-rounded: "Figtree", ui-sans-serif, system-ui, sans-serif;
  --font-sans: "Figtree", ui-sans-serif, system-ui, sans-serif;

  --color-headline: var(--color-headline);
  --color-navy-surface: var(--color-navy-surface);
  --color-navy-on: var(--color-navy-on);
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd packages/frontend && bunx vitest run src/styles/__tests__/tokens.test.ts`
Expected: PASS.

- [ ] **Step 9: Prove nothing else referenced the old faces**

Run: `grep -rn "Poppins\|@fontsource/inter\|@fontsource/poppins" --include="*.css" --include="*.ts" --include="*.tsx" packages apps --exclude-dir=node_modules`
Expected: no hits. If `font-rounded` or `font-display` appear as Tailwind classes elsewhere, they are unchanged — they now resolve to Figtree.

- [ ] **Step 10: Commit**

```bash
git add packages/frontend/package.json packages/frontend/src/styles/globals.css \
        packages/frontend/src/styles/__tests__/tokens.test.ts bun.lock
git commit -m "feat(ui): Figtree, and navy in the three roles it plays"
```

---

### Task 2: `servicePriceLine`, the tile's price in one function

**Files:**
- Modify: `apps/frontend/web/src/features/directory/services/domain/service-card.ts`
- Test: `apps/frontend/web/src/features/directory/services/domain/__tests__/service-card.test.ts`

**Interfaces:**
- Consumes: `servicePriceCell`, `optionDurationMinutes` from the same file.
- Produces:

```ts
export interface ServicePriceLine {
  amount:
    | { kind: "money"; amountMinor: number; currency: string; from: boolean; perHour: boolean }
    | { kind: "words"; key: string };
  meta: { key: string; values?: Record<string, number> } | null;
}
export function servicePriceLine(service: ServiceDTO): ServicePriceLine;
```

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/service-card.test.ts`:

```ts
import { servicePriceLine } from "../service-card";

describe("servicePriceLine", () => {
  const base: ServiceDTO = {
    // Reuse the file's existing `service()` helper if it has one; otherwise
    // this literal is the shape every case below varies.
    id: "s1", providerId: "p1", providerName: "Estúdio Mavalane",
    providerSlug: "estudio", providerType: "organization", providerVerified: true,
    providerRatingAverage: 4.7, providerReviewCount: 6,
    categoryCode: "hair", categoryName: "Beleza", name: "Corte",
    description: null, locationType: "at_provider", bookingMode: "priced",
    imageUrls: [], optionCount: 1, fromAmountMinor: null, isFallback: false,
    defaultOption: {
      amountMinor: 80_000, currency: "MZN", durationMinutes: 45,
      minMinutes: null, stepMinutes: null, pricingMode: "fixed",
    },
  };

  it("prints a fixed price with its duration beside it", () => {
    expect(servicePriceLine(base)).toEqual({
      amount: { kind: "money", amountMinor: 80_000, currency: "MZN", from: false, perHour: false },
      meta: { key: "serviceDurationMinutes", values: { count: 45 } },
    });
  });

  it("marks an hourly price so the unit can be drawn inside the amount", () => {
    const hourly = servicePriceLine({
      ...base,
      defaultOption: { ...base.defaultOption!, pricingMode: "hourly", durationMinutes: null, minMinutes: 60 },
    });
    expect(hourly.amount).toMatchObject({ perHour: true });
    expect(hourly.meta).toEqual({ key: "serviceMinimumMinutes", values: { count: 60 } });
  });

  it("leads with the cheapest option and says how many there are", () => {
    expect(servicePriceLine({ ...base, optionCount: 3, fromAmountMinor: 250_000 })).toEqual({
      amount: { kind: "money", amountMinor: 250_000, currency: "MZN", from: true, perHour: false },
      meta: { key: "priceOptionCount", values: { count: 3 } },
    });
  });

  it("answers a quote with words, never with a zero", () => {
    expect(servicePriceLine({ ...base, bookingMode: "quote" })).toEqual({
      amount: { kind: "words", key: "priceToAgree" },
      meta: { key: "priceQuoteHint" },
    });
  });

  it("says the price is unavailable, not that it is by quote, when the options are gone", () => {
    // A `priced` service whose last option was deactivated. Telling this
    // customer to ask for a price is wrong advice: the price exists, its
    // packages do not.
    expect(servicePriceLine({ ...base, defaultOption: null })).toEqual({
      amount: { kind: "words", key: "priceUnavailable" },
      meta: null,
    });
  });

  it("omits the meta phrase when an option carries no minutes", () => {
    expect(
      servicePriceLine({ ...base, defaultOption: { ...base.defaultOption!, durationMinutes: null } }).meta,
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/services/domain/__tests__/service-card.test.ts`
Expected: FAIL — `servicePriceLine is not a function`.

- [ ] **Step 3: Implement it**

Append to `service-card.ts`:

```ts
/**
 * What a tile prints where the price goes.
 *
 * The successor to `serviceStubParts`, which shaped the same four branches for
 * a control the tile does not have: `PriceStub` needed an eyebrow above the
 * amount and a CTA variant beneath it, and a tile has neither. Keyed off
 * `servicePriceCell` so the branch order — `quote` before `defaultOption` is
 * even inspected — is decided in exactly one place.
 *
 * Returns keys and minor units rather than strings: the amount is formatted in
 * the reader's locale by the component, and a domain function that interpolated
 * an English "min" would put it in front of every locale that calls this.
 */
export interface ServicePriceLine {
  amount:
    | { kind: "money"; amountMinor: number; currency: string; from: boolean; perHour: boolean }
    | { kind: "words"; key: string };
  /** The one phrase beside the amount, or nothing when the data has none. */
  meta: { key: string; values?: Record<string, number> } | null;
}

export function servicePriceLine(service: ServiceDTO): ServicePriceLine {
  const cell = servicePriceCell(service);

  if (cell.kind === "quote") {
    return { amount: { kind: "words", key: "priceToAgree" }, meta: { key: "priceQuoteHint" } };
  }
  if (cell.kind === "unavailable") {
    return { amount: { kind: "words", key: "priceUnavailable" }, meta: null };
  }
  if (cell.kind === "from") {
    return {
      amount: {
        kind: "money",
        amountMinor: cell.amountMinor,
        currency: cell.currency,
        from: true,
        perHour: false,
      },
      meta: { key: "priceOptionCount", values: { count: service.optionCount } },
    };
  }

  const hourly = cell.option.pricingMode === "hourly";
  const minutes = optionDurationMinutes(cell.option);
  return {
    amount: {
      kind: "money",
      amountMinor: cell.option.amountMinor,
      currency: cell.option.currency,
      from: false,
      perHour: hourly,
    },
    meta:
      minutes == null
        ? null
        : {
            key: hourly ? "serviceMinimumMinutes" : "serviceDurationMinutes",
            values: { count: minutes },
          },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/services/domain/__tests__/service-card.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/features/directory/services/domain/service-card.ts \
        apps/frontend/web/src/features/directory/services/domain/__tests__/service-card.test.ts
git commit -m "feat(directory): the tile's price line, in one domain function"
```

---

### Task 3: Headings that read back the typed term

**Files:**
- Modify: `apps/frontend/web/src/features/directory/services/domain/browse-title.ts`
- Modify: `apps/frontend/web/src/features/directory/domain/directory-title.ts`
- Test: `apps/frontend/web/src/features/directory/services/domain/__tests__/browse-title.test.ts`
- Test: `apps/frontend/web/src/features/directory/domain/__tests__/directory-title.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `browseTitle(search, categoryName)` and `directoryTitle(search, categoryName)` keep their signatures, but `search` now also reads `q`, and `TitleParts.values` gains `term?: string`. New keys: `titleServicesTerm`, `titleServicesTermCity`, `titleProvidersTerm`, `titleProvidersTermCity` (written in Task 4).

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/browse-title.test.ts`:

```ts
describe("browseTitle with a typed term", () => {
  it("reads the term back, in the city when there is one", () => {
    expect(browseTitle({ q: "corte de cabelo", city: "Maputo" }, null)).toEqual({
      key: "titleServicesTermCity",
      values: { term: "corte de cabelo", city: "Maputo" },
    });
  });

  it("reads the term back on its own", () => {
    expect(browseTitle({ q: "corte" }, null)).toEqual({
      key: "titleServicesTerm",
      values: { term: "corte" },
    });
  });

  it("lets the term outrank the category, which the strip is already showing", () => {
    expect(browseTitle({ q: "corte", category: "hair" }, "Beleza")).toEqual({
      key: "titleServicesTerm",
      values: { term: "corte" },
    });
  });

  it("ignores a term that is only whitespace", () => {
    expect(browseTitle({ q: "   ", city: "Maputo" }, null)).toEqual({
      key: "titleServicesCity",
      values: { city: "Maputo" },
    });
  });
});
```

Append the same four cases to `__tests__/directory-title.test.ts`, calling `directoryTitle` and expecting `titleProvidersTerm` / `titleProvidersTermCity`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/services/domain/__tests__/browse-title.test.ts src/features/directory/domain/__tests__/directory-title.test.ts`
Expected: FAIL — the term is ignored and the plain keys come back.

- [ ] **Step 3: Implement both**

`browse-title.ts` becomes:

```ts
export interface TitleParts {
  key: string;
  values: { category?: string; city?: string; term?: string };
}

/**
 * The `h1`, which is now the page's only heading — the hero that used to carry
 * a title is gone.
 *
 * **The term outranks the category.** A reader who typed "corte de cabelo"
 * should see those words at the top of their results; the category they are in
 * is already stated, underlined, by the strip above. Ranking the category first
 * meant the heading answered a question nobody had asked.
 */
export function browseTitle(
  search: { category?: string | undefined; city?: string | undefined; q?: string | undefined },
  categoryName: string | null,
): TitleParts {
  const city = search.city?.trim() || undefined;
  const term = search.q?.trim() || undefined;
  const category = search.category ? (categoryName ?? undefined) : undefined;

  if (term && city) return { key: "titleServicesTermCity", values: { term, city } };
  if (term) return { key: "titleServicesTerm", values: { term } };
  if (category && city) return { key: "titleServicesCategoryCity", values: { category, city } };
  if (category) return { key: "titleServicesCategory", values: { category } };
  if (city) return { key: "titleServicesCity", values: { city } };
  return { key: "titleServices", values: {} };
}
```

`directory-title.ts` takes the identical shape with `titleProviders*` keys.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/services/domain/__tests__/browse-title.test.ts src/features/directory/domain/__tests__/directory-title.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the pages' `resultsScope` helper for the new value shape**

Both page files hold a private `resultsScope(values)` that reads `values.category` and `values.city`. It compiles unchanged — `term` is an extra optional key — but confirm with:

Run: `cd apps/frontend/web && bun run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src/features/directory/services/domain/browse-title.ts \
        apps/frontend/web/src/features/directory/domain/directory-title.ts \
        apps/frontend/web/src/features/directory/services/domain/__tests__/browse-title.test.ts \
        apps/frontend/web/src/features/directory/domain/__tests__/directory-title.test.ts
git commit -m "feat(directory): the heading reads back what was typed"
```

---

### Task 4: The words, in eight languages

**Files:**
- Modify: `apps/frontend/web/src/shared/locales/{pt-MZ,pt-PT,en-US,es-ES,fr-FR,de-DE,it-IT,nl-NL}/directory.json`
- Test: `apps/frontend/web/src/shared/locales/__tests__/locales.test.ts` (existing gate, no change)

**Interfaces:**
- Consumes: the key names invented in Tasks 2 and 3.
- Produces: every key used by Tasks 7–15.

- [ ] **Step 1: Add the new keys to `pt-MZ/directory.json`**

pt-MZ is authored first and is the parity reference. Add:

```json
{
  "titleServicesTerm": "{{term}}",
  "titleServicesTermCity": "{{term}} em {{city}}",
  "titleProvidersTerm": "{{term}}",
  "titleProvidersTermCity": "{{term}} em {{city}}",

  "priceToAgree": "Preço a combinar",
  "priceQuoteHint": "Pede um orçamento",
  "priceOptionCount_one": "{{count}} opção",
  "priceOptionCount_other": "{{count}} opções",
  "priceFromPrefix": "desde",
  "pricePerHourUnit": "/h",

  "ratingNew": "Novo",
  "providerKindSentence": {
    "individual": "{{category}} em {{place}}",
    "organization": "{{category}} em {{place}}"
  },
  "providerServicesMore": "mais {{count}}",
  "providerOpenBusiness": "Ver negócio",
  "providerOpenPerson": "Ver perfil",

  "searchPillSubmit": "Procurar",
  "searchPillOpen": "Alterar a procura",
  "categoryStripLabel": "Categorias",
  "categoryStripScrollLeft": "Categorias anteriores",
  "categoryStripScrollRight": "Categorias seguintes",

  "filterPillMore": "Mais filtros",
  "filterPillRemove": "Remover {{filter}}",
  "filterSheetApply_one": "Ver {{count}} resultado",
  "filterSheetApply_other": "Ver {{count}} resultados",
  "sortTrigger": "Ordenar:"
}
```

`titleServicesTerm` is deliberately the bare term: "Corte de cabelo" as a heading, with the count line under it saying how many and where. A locale that needs a verb ("Résultats pour …") writes one.

- [ ] **Step 2: Delete the keys the removed components owned**

Remove from all eight files: `stubProviderRating`, `stubQuoteAmount`, `stubPerService`, `listingByProvider`, `mobileSearchTitle`, `mobileSearchApply`, `servicesFilterByCategory`, `providersFilterByCategory`, `activeFiltersLabel`, `chipRemove`, `heroSubtitleServices`, `heroSubtitleProviders`.

**Keep `servicesAllCategories` and `providersAllCategories`.** The strip still
opens with an "All" item; only the band around it changed.

**Keep `chipSearch`, `chipCity`, `chipRating`, `chipVerified`, `chipPriceRange`,
`chipPriceMin` and `chipPriceMax`** even though no component renders a chip any
more. `browseFilterChips` and `directoryFilterChips` survive — the pills ask them
which filters are on and what URL removes each — and they still return these keys
in their `label` field. Deleting the keys would leave a function returning
references to copy that no longer exists, which renders as a raw key the day
anything reads it again.

Keep `filtersClearAll`, `filtersTitle`, every `filter*Option`, `servicesFound`, `providersFound`, `resultsScope.*`, `serviceDurationMinutes`, `serviceMinimumMinutes`, `priceUnavailable`, `providerVerified`, `providerRatingLabel`, `providerServiceCount`, `providerFrom`, `pagerLabel`, `servicesNext`, `servicesPrevious`, `providersNext`, `providersPrevious`, `searchFieldService`, `searchFieldServiceEmpty`, `searchFieldProvider`, `searchFieldProviderEmpty`, `searchFieldCity`, `searchFieldCityEmpty`, `searchFieldCityToggle`, `searchFieldCityNoResults`, `sortOption.*`, `sortLabel`, `servicesNoMatch`, `servicesNoMatchHint`, `servicesEmpty`, `servicesEmptyTitle`, `noResultsTitle`, `noResultsHint`, `emptyTitle`, `empty`, and every `title*` key.

- [ ] **Step 3: Write the same key set into the other seven files**

Each language written as its own language, not transferred word for word. en-US for reference:

```json
{
  "titleServicesTerm": "{{term}}",
  "titleServicesTermCity": "{{term}} in {{city}}",
  "titleProvidersTerm": "{{term}}",
  "titleProvidersTermCity": "{{term}} in {{city}}",
  "priceToAgree": "Price to agree",
  "priceQuoteHint": "Ask for a quote",
  "priceOptionCount_one": "{{count}} option",
  "priceOptionCount_other": "{{count}} options",
  "priceFromPrefix": "from",
  "pricePerHourUnit": "/h",
  "ratingNew": "New",
  "providerKindSentence": {
    "individual": "{{category}} in {{place}}",
    "organization": "{{category}} in {{place}}"
  },
  "providerServicesMore": "{{count}} more",
  "providerOpenBusiness": "View business",
  "providerOpenPerson": "View profile",
  "searchPillSubmit": "Search",
  "searchPillOpen": "Change your search",
  "categoryStripLabel": "Categories",
  "categoryStripScrollLeft": "Previous categories",
  "categoryStripScrollRight": "Next categories",
  "filterPillMore": "More filters",
  "filterPillRemove": "Remove {{filter}}",
  "filterSheetApply_one": "Show {{count}} result",
  "filterSheetApply_other": "Show {{count}} results",
  "sortTrigger": "Sort:"
}
```

- [ ] **Step 4: Run the parity gate**

Run: `cd apps/frontend/web && bunx vitest run src/shared/locales/__tests__/locales.test.ts`
Expected: PASS. A failure names the exact dotted path missing from the exact file.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/shared/locales
git commit -m "feat(directory): the listings' words, in eight languages"
```

---

### Task 5: Up to three services on a provider row

**Files:**
- Modify: `packages/shared/src/read-models/public/provider-public.schema.ts`
- Modify: `packages/backend/src/modules/ntizo/public/provider/infra/repositories/drizzle/provider-public.repository.ts`
- Test: `packages/backend/src/modules/ntizo/public/provider/__tests__/public-provider.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ProviderPublicDTO.services: { name: string; amountMinor: number; currency: string; pricingMode: string }[]`, at most 3, cheapest first. Consumed by Task 6 (the client field list) and Task 9 (the row).

- [ ] **Step 1: Write the failing schema test**

In `packages/shared`, add to the read-model suite (or create `src/read-models/public/__tests__/provider-public.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { providerPublicReadModel } from "../provider-public.schema";

describe("providerPublicReadModel.services", () => {
  const base = {
    id: "p1", name: "Estúdio", slug: "estudio", type: "organization" as const,
    description: null, city: "Maputo", district: null, country: "MZ",
    logoUrl: null, photoUrls: [], verified: true, ratingAverage: 4.7,
    reviewCount: 6, categories: [], serviceCount: 6,
    fromAmountMinor: 35_000, fromCurrency: "MZN",
  };

  it("accepts up to three priced services", () => {
    const parsed = providerPublicReadModel.parse({
      ...base,
      services: [
        { name: "Corte com barba", amountMinor: 80_000, currency: "MZN", pricingMode: "fixed" },
        { name: "Barba", amountMinor: 45_000, currency: "MZN", pricingMode: "fixed" },
        { name: "Corte infantil", amountMinor: 35_000, currency: "MZN", pricingMode: "fixed" },
      ],
    });
    expect(parsed.services).toHaveLength(3);
  });

  it("refuses a fourth, because a row cannot show it", () => {
    const four = Array.from({ length: 4 }, (_, i) => ({
      name: `S${String(i)}`, amountMinor: 1000, currency: "MZN", pricingMode: "fixed",
    }));
    expect(() => providerPublicReadModel.parse({ ...base, services: four })).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/shared && bunx vitest run src/read-models/public/__tests__/provider-public.test.ts`
Expected: FAIL — `services` is not a key of the model.

- [ ] **Step 3: Add the field to the schema**

In `provider-public.schema.ts`, inside `providerPublicReadModel`, after `serviceCount`:

```ts
  /**
   * The cheapest few things this business sells, so a directory row can say
   * what it does without the reader opening it.
   *
   * Capped at three **here**, not in the client: a row draws three chips and a
   * "+n", and a model that could return forty would let one business push the
   * price off every row beside it. `serviceCount` above is still the true
   * total, and `serviceCount - services.length` is the "+n".
   *
   * A quote-priced service has no amount and is skipped rather than sent as a
   * zero, which a client would print as "0 MZN".
   */
  services: z
    .array(
      z.object({
        name: z.string(),
        amountMinor: z.number().int(),
        currency: z.string(),
        pricingMode: z.string(),
      }),
    )
    .max(3),
```

- [ ] **Step 4: Run the schema test to verify it passes**

Run: `cd packages/shared && bunx vitest run src/read-models/public/__tests__/provider-public.test.ts`
Expected: PASS. The backend will not compile yet — the repository does not return the key.

- [ ] **Step 5: Write the failing repository test**

In `packages/backend/src/modules/ntizo/public/provider/__tests__/public-provider.test.ts`, following the file's existing seeding helpers:

```ts
it("carries the three cheapest services, cheapest first, with the total left on serviceCount", async () => {
  const providerId = await seedProvider({ name: "Estúdio Mavalane" });
  await seedPublishedService(providerId, { name: "Corte com barba", amountMinor: 80_000 });
  await seedPublishedService(providerId, { name: "Barba", amountMinor: 45_000 });
  await seedPublishedService(providerId, { name: "Corte infantil", amountMinor: 35_000 });
  await seedPublishedService(providerId, { name: "Tranças", amountMinor: 250_000 });

  const page = await repo.listActive({ limit: 20, offset: 0, locale: "pt-MZ" });
  const row = page.items.find((p) => p.id === providerId)!;

  expect(row.services.map((s) => s.name)).toEqual(["Corte infantil", "Barba", "Corte com barba"]);
  expect(row.serviceCount).toBe(4);
});

it("returns an empty list, not a zero, for a business that only quotes", async () => {
  const providerId = await seedProvider({ name: "Mestre Zunguze" });
  await seedPublishedService(providerId, { name: "Reparação", bookingMode: "quote" });

  const page = await repo.listActive({ limit: 20, offset: 0, locale: "pt-MZ" });
  expect(page.items.find((p) => p.id === providerId)!.services).toEqual([]);
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd packages/backend && bun test src/modules/ntizo/public/provider/__tests__/public-provider.test.ts`
Expected: FAIL — `services` is undefined on the row.

- [ ] **Step 7: Add `servicesFor` beside `categoriesFor`**

In `provider-public.repository.ts`, add the private method directly under `categoriesFor`:

```ts
  /**
   * The cheapest three things each of these businesses sells.
   *
   * A second query keyed on the page's provider ids, exactly as
   * `categoriesFor` above and for the same reason: this is a per-provider
   * *list*, and a fourth pre-aggregated CTE would have to return an array,
   * which puts a `json_agg` over a window into the page query for no gain.
   * One extra round trip for the whole page.
   *
   * Cheapest first, so the chips agree with the `desde` price printed beside
   * them — a row whose first chip cost more than its own "from" price reads as
   * a bug. Ties break on name so the order is stable between renders.
   *
   * Only `priced` services with an active option: a quote has no amount, and
   * sending it as zero is how a client comes to print "0 MZN".
   */
  private async servicesFor(providerIds: string[]): Promise<Map<string, ProviderPublicDTO["services"]>> {
    const byProvider = new Map<string, ProviderPublicDTO["services"]>();
    if (providerIds.length === 0) return byProvider;

    const rows = await getDb()
      .select({
        providerId: service.providerId,
        name: service.name,
        amountMinor: serviceOption.amountMinor,
        currency: serviceOption.currency,
        pricingMode: serviceOption.pricingMode,
      })
      .from(service)
      .innerJoin(serviceOption, eq(serviceOption.serviceId, service.id))
      .where(
        and(
          inArray(service.providerId, providerIds),
          eq(service.status, "published"),
          eq(service.bookingMode, "priced"),
          eq(serviceOption.isActive, true),
        ),
      )
      .orderBy(asc(serviceOption.amountMinor), asc(service.name));

    for (const row of rows) {
      const list = byProvider.get(row.providerId) ?? [];
      // The cap is applied here rather than in SQL: a per-provider LIMIT needs
      // a lateral join or a window, and the page is at most 50 providers with
      // a handful of options each. Ordered above, so the first three are the
      // cheapest three.
      if (list.length >= 3) continue;
      // One chip per service, not per option: a service with three options
      // arrives three times and its cheapest row is the one already in hand.
      if (list.some((s) => s.name === row.name)) continue;
      list.push({
        name: row.name,
        amountMinor: Number(row.amountMinor),
        currency: row.currency,
        pricingMode: row.pricingMode,
      });
      byProvider.set(row.providerId, list);
    }
    return byProvider;
  }
```

Add `asc` to the drizzle imports at the top of the file if it is not already there.

- [ ] **Step 8: Wire it into `listActive` and the row mapper**

In `listActive`, beside the existing `categoriesFor` call:

```ts
    const ids = rows.map((r) => r.id);
    const [categories, services] = await Promise.all([
      this.categoriesFor(ids, locale),
      this.servicesFor(ids),
    ]);
```

and where each row is mapped, pass `services.get(row.id) ?? []` into the DTO's new `services` key. The detail projection (`getBySlug`) passes `[]`: a business's own page lists every service it sells, so three of them in the header would be a worse version of the list below it.

- [ ] **Step 9: Run the repository tests to verify they pass**

Run: `cd packages/backend && bun test src/modules/ntizo/public/provider/__tests__/public-provider.test.ts`
Expected: PASS. These tests need `DEV_DB_URL` from `packages/backend/.env`.

- [ ] **Step 10: Typecheck both packages**

Run: `cd packages/shared && bun run typecheck && cd ../backend && bun run typecheck`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src/read-models/public/provider-public.schema.ts \
        packages/shared/src/read-models/public/__tests__/provider-public.test.ts \
        packages/backend/src/modules/ntizo/public/provider
git commit -m "feat(provider): a directory row can say what a business sells"
```

---

### Task 6: Ask for the field on the client

**Files:**
- Modify: `apps/frontend/web/src/features/directory/data/directory.repository.ts`
- Test: `apps/frontend/web/src/features/directory/data/__tests__/directory.repository.test.ts`

**Interfaces:**
- Consumes: Task 5's `services` field.
- Produces: `ProviderPublicDTO.services` populated on every `directoryQueries.list` result.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/directory.repository.test.ts`:

```ts
it("asks for the three services a row prints", () => {
  expect(PROVIDER_FIELDS).toContain("services { name amountMinor currency pricingMode }");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/data/__tests__/directory.repository.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the field to the shared selection**

```ts
export const PROVIDER_FIELDS = `
  id name slug type description city district country logoUrl photoUrls
  verified ratingAverage reviewCount serviceCount fromAmountMinor fromCurrency
  categories { code name }
  services { name amountMinor currency pricingMode }`;
```

`PROVIDER_DETAIL_FIELDS` interpolates `PROVIDER_FIELDS`, so the detail query asks for it too and receives the empty array Task 5 sends. That is cheaper than maintaining two field lists that differ by one line.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/data/__tests__/directory.repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/features/directory/data
git commit -m "feat(directory): request the provider's cheapest services"
```

---

### Task 7: The brand tile, for every listing with no photograph

**Files:**
- Create: `apps/frontend/web/public/brand/tie-pattern.svg`
- Create: `apps/frontend/web/src/shared/domain/initials.ts`
- Delete: `apps/frontend/web/src/features/landing/domain/initials.ts`
- Modify: `apps/frontend/web/src/features/landing/ui/sections.tsx` (its import)
- Create: `apps/frontend/web/src/shared/components/browse/brand-tile.tsx`
- Test: `apps/frontend/web/src/shared/components/browse/__tests__/brand-tile.test.tsx`

**Interfaces:**
- Consumes: `--color-navy-surface` from Task 1.
- Produces: `initialsOf(name: string): string` at `@/shared/domain/initials`; `<BrandTile name={string} className?={string} />`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandTile } from "../brand-tile";

describe("BrandTile", () => {
  it("stands in for a photograph with the business's initials", () => {
    render(<BrandTile name="Estúdio Mavalane" />);
    expect(screen.getByText("EM")).toBeInTheDocument();
  });

  it("draws no image element at all, so nothing can 404 into a broken icon", () => {
    const { container } = render(<BrandTile name="Estúdio Mavalane" />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("keeps the pattern out of the accessibility tree", () => {
    const { container } = render(<BrandTile name="Casa Limpa" />);
    expect(container.querySelector("[data-testid='tie-pattern']")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("survives a name with no letters rather than rendering an empty tile", () => {
    render(<BrandTile name="   " />);
    expect(screen.getByTestId("brand-tile")).toHaveTextContent("—");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/frontend/web && bunx vitest run src/shared/components/browse/__tests__/brand-tile.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Move `initialsOf` into shared**

Create `src/shared/domain/initials.ts` with the existing implementation and its comment, delete `src/features/landing/domain/initials.ts`, and change the import in `features/landing/ui/sections.tsx` to `@/shared/domain/initials`. It moves because shared components need it now, and `shared → features/*/domain` is an import direction worth not normalising.

- [ ] **Step 4: Add the tie pattern as a static asset**

Create `apps/frontend/web/public/brand/tie-pattern.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="144" height="244" viewBox="0 0 144 244">
  <g fill="#38b6ff">
    <path d="M32.76 127.51L26.74 185.63L36.2 195.09L45.67 185.63L39.64 127.51L45.1 122.05C48.01 122.86 51.1 124.04 54.54 125.59L72.24 243.7H0L17.69 125.59C21.19 124 24.31 122.81 27.25 122L32.76 127.51Z"/>
    <path transform="translate(0 -244)" d="M104.76 360.19L98.74 302.07L108.2 292.61L117.67 302.07L111.64 360.19L117.1 365.65C120.01 364.84 123.1 363.66 126.55 362.11L144.24 244H72L89.69 362.11C93.19 363.7 96.31 364.89 99.25 365.7L104.76 360.19Z"/>
  </g>
</svg>
```

Two ties per tile, taken from `packages/docs/assets/Pattern/SVG/Pattern 1.svg`. A file rather than a data URI so the browser caches it once for a page of twenty-four tiles.

- [ ] **Step 5: Write the component**

```tsx
import { cn } from "@ntizo/frontend-ui";
import { initialsOf } from "@/shared/domain/initials";

/**
 * What a listing with no photograph looks like.
 *
 * Most listings have none, and the page this replaces filled that space with a
 * pale grey rectangle: a column of them read as a page that had failed to load
 * rather than as a catalogue. This is navy, carries the brand's own tie pattern
 * from the identity manual, and states whose listing it is.
 *
 * The pattern is a background image and the initials are real text, so the tile
 * is legible to a screen reader as the name it stands for and invisible to it
 * as decoration.
 */
export function BrandTile({ name, className }: { name: string; className?: string }) {
  const initials = initialsOf(name);
  return (
    <span
      data-testid="brand-tile"
      className={cn(
        "relative grid h-full w-full place-items-center overflow-hidden",
        "bg-[linear-gradient(160deg,#00305f_0%,var(--color-navy-surface)_100%)]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        data-testid="tie-pattern"
        className="pointer-events-none absolute -inset-x-[10%] -inset-y-[20%] -rotate-[8deg] opacity-[0.16] bg-[url('/brand/tie-pattern.svg')] bg-[length:96px_163px]"
      />
      <span className="relative text-[2rem] font-bold tracking-[0.02em] text-white/90">
        {/* A name with no letters — an emoji, punctuation — would render an
            empty tile that reads as a loading failure. */}
        {initials || "—"}
      </span>
    </span>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/frontend/web && bunx vitest run src/shared/components/browse/__tests__/brand-tile.test.tsx`
Expected: PASS.

- [ ] **Step 7: Confirm the move broke nothing**

Run: `cd apps/frontend/web && bun run typecheck && bunx vitest run src/features/landing`
Expected: no errors, landing tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/web/public/brand/tie-pattern.svg \
        apps/frontend/web/src/shared/domain/initials.ts \
        apps/frontend/web/src/features/landing \
        apps/frontend/web/src/shared/components/browse
git commit -m "feat(directory): a listing with no photo gets the brand, not a grey box"
```

---

### Task 8: The service tile

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/result-tile.tsx`
- Create: `apps/frontend/web/src/shared/components/browse/__tests__/result-tile.test.tsx`
- Rewrite: `apps/frontend/web/src/features/directory/services/ui/service-listing-card.tsx` → `service-tile.tsx`
- Rewrite: `apps/frontend/web/src/features/directory/services/ui/__tests__/service-listing-card.test.tsx` → `service-tile.test.tsx`

**Interfaces:**
- Consumes: `BrandTile` (Task 7), `servicePriceLine` (Task 2), `formatHeadlinePrice` from `service-card.ts`.
- Produces:

```tsx
export const TILE_TITLE_LINK_CLASS: string;
export function TileMedia(props: { src: string | null; name: string; ratio?: "4/3" | "1/1" }): JSX.Element;
export function RatingMark(props: { average: number; count?: number; label: string }): JSX.Element;
export function ResultTile(props: {
  media: ReactNode; title: ReactNode; byline: ReactNode; price: ReactNode;
}): JSX.Element;
export function ServiceTile(props: { service: ServiceDTO; locale: string }): JSX.Element;
```

- [ ] **Step 1: Write the failing tile tests**

`__tests__/result-tile.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RatingMark, ResultTile, TileMedia } from "../result-tile";

describe("TileMedia", () => {
  it("shows the photograph when there is one", () => {
    render(<TileMedia src="https://cdn/photo.jpg" name="Estúdio Mavalane" />);
    expect(screen.getByRole("presentation")).toHaveAttribute("src", "https://cdn/photo.jpg");
  });

  it("falls back to the brand tile, not to an empty box", () => {
    render(<TileMedia src={null} name="Estúdio Mavalane" />);
    expect(screen.getByTestId("brand-tile")).toBeInTheDocument();
  });
});

describe("RatingMark", () => {
  it("says whose score it is, because the number is not the service's", () => {
    render(<RatingMark average={4.7} count={6} label="4.7 out of 5, from 6 reviews of this provider" />);
    expect(screen.getByLabelText("4.7 out of 5, from 6 reviews of this provider")).toBeInTheDocument();
  });

  it("prints one decimal, always", () => {
    render(<RatingMark average={5} label="5.0 out of 5" />);
    expect(screen.getByText("5,0")).toBeInTheDocument();
  });
});

describe("ResultTile", () => {
  it("draws no border and no shadow — the photograph separates it", () => {
    const { container } = render(
      <ResultTile media={<i />} title={<h3>T</h3>} byline={<p>B</p>} price={<p>P</p>} />,
    );
    const article = container.querySelector("article")!;
    expect(article.className).not.toMatch(/border|shadow|rounded-\[var\(--radius-card\)\]/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/frontend/web && bunx vitest run src/shared/components/browse/__tests__/result-tile.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `result-tile.tsx`**

```tsx
import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import { BrandTile } from "@/shared/components/browse/brand-tile";

/**
 * The whole-tile link, carried by the title.
 *
 * The tile is not wrapped in an anchor: a keyboard reader gets one tab stop for
 * the destination this way, and an anchor around the whole thing could not
 * contain a second control if one is ever added back.
 */
export const TILE_TITLE_LINK_CLASS =
  "after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:outline-none";

/** The photograph, or the brand tile when there is none. */
export function TileMedia({
  src,
  name,
  ratio = "4/3",
}: {
  src: string | null;
  /** Whose listing this is — the brand tile prints its initials. */
  name: string;
  ratio?: "4/3" | "1/1";
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-navy-surface)]",
        ratio === "4/3" ? "aspect-[4/3]" : "aspect-square",
      )}
    >
      {src ? (
        // `role="presentation"` with an empty alt: the name is the heading
        // right beside this, and repeating it is read twice and says nothing
        // new either time.
        <img
          src={src}
          alt=""
          role="presentation"
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
        />
      ) : (
        <BrandTile name={name} />
      )}
    </div>
  );
}

/**
 * A score, with the sentence that says whose it is.
 *
 * `label` is the whole `aria-label`, translated by the caller: on a service
 * tile this number is the *provider's* average across everything they sell,
 * and a bare star beside a service's name claims a per-service rating this
 * product does not have.
 */
export function RatingMark({
  average,
  count,
  label,
}: {
  average: number;
  count?: number | undefined;
  label: string;
}) {
  return (
    <span
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-1 text-[13.5px] font-semibold text-[var(--color-foreground)]"
    >
      <Star className="h-3 w-3 fill-[var(--color-warning)] text-[var(--color-warning)]" aria-hidden="true" />
      <span className="tabular-nums">{average.toFixed(1).replace(".", ",")}</span>
      {count != null && (
        <span className="font-normal text-[var(--color-muted-foreground)]">({count})</span>
      )}
    </span>
  );
}

/**
 * A result: a photograph, then three lines.
 *
 * No border, no shadow, no card. The photograph is the separation, and white
 * space between tiles is the grid's. The design this replaces put every result
 * in a bordered box on a tinted ground, which is the shape of a template rather
 * than of a catalogue.
 */
export function ResultTile({
  media,
  title,
  byline,
  price,
}: {
  media: ReactNode;
  /** An `h3` holding the route-typed title link. */
  title: ReactNode;
  /** Who provides it, their seal, their rating, where they are. */
  byline: ReactNode;
  price: ReactNode;
}) {
  return (
    <article className="group relative">
      {media}
      <div className="grid gap-[3px] pt-2.5">
        {title}
        {byline}
        {price}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Run the tile tests to verify they pass**

Run: `cd apps/frontend/web && bunx vitest run src/shared/components/browse/__tests__/result-tile.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing `ServiceTile` tests**

Create `src/features/directory/services/ui/__tests__/service-tile.test.tsx`, reusing the router harness from the existing `service-listing-card.test.tsx` (copy `renderCard`, rename to `renderTile`, render `<ServiceTile>` inside an `<li>`):

```tsx
describe("ServiceTile", () => {
  it("prints the price in full and the duration beside it", () => {
    renderTile(service());
    expect(screen.getByText("800 MZN")).toBeInTheDocument();
    expect(screen.getByText("45 min")).toBeInTheDocument();
  });

  it("puts the rating on the provider's line, labelled as the provider's", () => {
    renderTile(service());
    // The score is the provider's average across everything they sell. Beside
    // the service's name it would claim a per-service rating that does not
    // exist in this product.
    const byline = screen.getByTestId("tile-byline");
    expect(byline).toHaveTextContent("Estúdio Mavalane");
    expect(within(byline).getByLabelText(/out of 5/i)).toBeInTheDocument();
  });

  it("answers a quote with words", () => {
    renderTile(service({ bookingMode: "quote", defaultOption: null }));
    expect(screen.getByText("Price to agree")).toBeInTheDocument();
    expect(screen.queryByText(/0 MZN/)).toBeNull();
  });

  it("draws the unit inside an hourly amount", () => {
    renderTile(service({ defaultOption: { ...option, pricingMode: "hourly", durationMinutes: null, minMinutes: 60 } }));
    expect(screen.getByText(/500 MZN/)).toHaveTextContent("/h");
  });

  it("says New where the rating would be, for a provider nobody has reviewed", () => {
    renderTile(service({ providerRatingAverage: null, providerReviewCount: 0 }));
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("is exactly one link", () => {
    renderTile(service());
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("falls back to the brand tile when the service has no photograph", () => {
    renderTile(service({ imageUrls: [] }));
    expect(screen.getByTestId("brand-tile")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/services/ui/__tests__/service-tile.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Write `service-tile.tsx`**

Create `src/features/directory/services/ui/service-tile.tsx` and delete `service-listing-card.tsx` and its test:

```tsx
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import {
  RatingMark,
  ResultTile,
  TileMedia,
  TILE_TITLE_LINK_CLASS,
} from "@/shared/components/browse/result-tile";
import {
  formatHeadlinePrice,
  servicePriceLine,
} from "@/features/directory/services/domain/service-card";
import type { ServiceDTO } from "@/features/directory/services/domain/types";

/**
 * One published service, as a customer browses the whole platform.
 *
 * A tile rather than the row this replaces: four of these fit where one row
 * did, and a service is a product — a photograph, a name and a price is the
 * whole of it. The row existed to give a ticket-stub price rail somewhere to
 * sit, and that rail is gone.
 *
 * **No button.** The price is what the eye lands on and the tile is the link.
 * A blue button repeated twenty-four times down a page competes with every
 * price on it and with the one button that matters, in the header.
 */
export function ServiceTile({ service, locale }: { service: ServiceDTO; locale: string }) {
  const { t } = useTranslation("directory");
  const line = servicePriceLine(service);
  const where = t(`filterWhereOption.${service.locationType}`, { defaultValue: "" });

  return (
    <ResultTile
      media={<TileMedia src={service.imageUrls[0] ?? null} name={service.providerName} />}
      title={
        <div className="flex items-baseline justify-between gap-2.5">
          <h3 className="min-w-0 truncate text-[15px] font-semibold text-[var(--color-foreground)]">
            <Link to="/services/$id" params={{ id: service.id }} className={TILE_TITLE_LINK_CLASS}>
              {service.name}
            </Link>
          </h3>
          {service.providerRatingAverage === null ? (
            // Not a zero and not an empty star: a business nobody has reviewed
            // is new, and rendering 0,0 calls it the worst on the platform.
            <span className="shrink-0 text-[13px] text-[var(--color-muted-foreground)]">
              {t("ratingNew")}
            </span>
          ) : (
            <RatingMark
              average={service.providerRatingAverage}
              label={t("providerRatingLabel", {
                score: service.providerRatingAverage.toFixed(1),
                count: service.providerReviewCount,
              })}
            />
          )}
        </div>
      }
      byline={
        <p
          data-testid="tile-byline"
          className="flex min-w-0 items-center gap-1.5 truncate text-[13.5px] text-[var(--color-muted-foreground)]"
        >
          <span className="truncate font-medium text-[var(--color-foreground)]">
            {service.providerName}
          </span>
          {service.providerVerified && (
            <span
              className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full bg-[var(--color-navy-surface)]"
              aria-label={t("providerVerified")}
            >
              <Check className="h-2.5 w-2.5 text-[var(--color-navy-on)]" aria-hidden="true" strokeWidth={3.4} />
            </span>
          )}
        </p>
      }
      price={
        <p className="mt-[3px] flex items-baseline gap-3 text-[13.5px] text-[var(--color-muted-foreground)]">
          <b className="text-[15.5px] font-bold text-[var(--color-headline)]">
            {line.amount.kind === "words" ? (
              <span className="text-[14px] font-semibold">{t(line.amount.key)}</span>
            ) : (
              <>
                {line.amount.from && (
                  <span className="mr-[3px] text-[12.5px] font-medium text-[var(--color-muted-foreground)]">
                    {t("priceFromPrefix")}
                  </span>
                )}
                <span className="tabular-nums">
                  {formatHeadlinePrice(line.amount.amountMinor, line.amount.currency, locale)}
                </span>
                {line.amount.perHour && (
                  <span className="text-[12.5px] font-semibold text-[var(--color-muted-foreground)]">
                    {t("pricePerHourUnit")}
                  </span>
                )}
              </>
            )}
          </b>
          {line.meta && <span>{t(line.meta.key, line.meta.values ?? {})}</span>}
          {where && <span>{where}</span>}
        </p>
      }
    />
  );
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/services/ui/__tests__/service-tile.test.tsx`
Expected: PASS. `services-browse-page.tsx` still imports the deleted card and will not typecheck until Task 14 — that is expected and is why the deletion of the old test file happens here, with its replacement.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse/result-tile.tsx \
        apps/frontend/web/src/shared/components/browse/__tests__/result-tile.test.tsx \
        apps/frontend/web/src/features/directory/services/ui
git commit -m "feat(directory): a service is a photograph, a name and a price"
```

---

### Task 9: The provider row

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/result-row.tsx`
- Create: `apps/frontend/web/src/shared/components/browse/__tests__/result-row.test.tsx`
- Rewrite: `apps/frontend/web/src/features/directory/ui/provider-listing-card.tsx` → `provider-row.tsx`
- Rewrite: its test → `__tests__/provider-row.test.tsx`

**Interfaces:**
- Consumes: `TileMedia`, `RatingMark`, `TILE_TITLE_LINK_CLASS` (Task 8), `ProviderPublicDTO.services` (Tasks 5–6).
- Produces: `<ResultRow media title kind description services side />`, `<ProviderRow provider locale />`.

- [ ] **Step 1: Write the failing row tests**

`__tests__/provider-row.test.tsx`, on the same router harness as the card it replaces:

```tsx
describe("ProviderRow", () => {
  it("shows what the business sells, with prices, without opening it", () => {
    renderRow(provider({
      services: [
        { name: "Corte com barba", amountMinor: 80_000, currency: "MZN", pricingMode: "fixed" },
        { name: "Barba", amountMinor: 45_000, currency: "MZN", pricingMode: "fixed" },
      ],
    }));
    expect(screen.getByText("Corte com barba")).toBeInTheDocument();
    expect(screen.getByText("800 MZN")).toBeInTheDocument();
  });

  it("counts the rest against serviceCount, not against what it was sent", () => {
    renderRow(provider({
      serviceCount: 6,
      services: [
        { name: "A", amountMinor: 1000, currency: "MZN", pricingMode: "fixed" },
        { name: "B", amountMinor: 2000, currency: "MZN", pricingMode: "fixed" },
        { name: "C", amountMinor: 3000, currency: "MZN", pricingMode: "fixed" },
      ],
    }));
    expect(screen.getByText("3 more")).toBeInTheDocument();
  });

  it("says nothing about the rest when there is no rest", () => {
    renderRow(provider({ serviceCount: 2, services: [
      { name: "A", amountMinor: 1000, currency: "MZN", pricingMode: "fixed" },
      { name: "B", amountMinor: 2000, currency: "MZN", pricingMode: "fixed" },
    ] }));
    expect(screen.queryByText(/more/)).toBeNull();
  });

  it("writes the kind and the place as one sentence", () => {
    renderRow(provider({ type: "individual", district: "Sommerschield", city: "Maputo",
      categories: [{ code: "electrical", name: "Electrical" }] }));
    expect(screen.getByTestId("row-kind")).toHaveTextContent("Electrical in Sommerschield, Maputo");
  });

  it("centres the logo on the brand tile when there is no cover photo", () => {
    renderRow(provider({ photoUrls: [], logoUrl: null }));
    expect(screen.getByTestId("brand-tile")).toBeInTheDocument();
  });

  it("is exactly one link, and the chevron is not a second one", () => {
    renderRow(provider());
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("says a person's profile is a profile, not a business", () => {
    renderRow(provider({ type: "individual" }));
    expect(screen.getByText("View profile")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/ui/__tests__/provider-row.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `result-row.tsx`**

```tsx
import type { ReactNode } from "react";

/**
 * A business, as a row.
 *
 * A row rather than the tile a service gets, because a business needs more
 * words than a service: what it is, where it is, what it sells and for how
 * much. Given a tile's width those lines wrap into a paragraph; given a row's
 * they read.
 *
 * Separated from its neighbours by a hairline and nothing else. The design this
 * replaces drew a bordered card with a shadow, which is three separations doing
 * one job.
 */
export function ResultRow({
  media,
  title,
  kind,
  description,
  services,
  side,
}: {
  media: ReactNode;
  /** An `h3` holding the route-typed title link and, when earned, the seal. */
  title: ReactNode;
  kind: ReactNode;
  description: ReactNode;
  /** Up to three service chips and the "+n". */
  services: ReactNode;
  /** Rating, price, and the chevron. */
  side: ReactNode;
}) {
  return (
    <article className="group relative grid gap-7 border-t border-[var(--color-border)] py-6 first:border-t-0 first:pt-1 md:grid-cols-[284px_minmax(0,1fr)_190px]">
      {media}
      <div className="grid min-w-0 content-start gap-1.5 pt-0.5">
        {title}
        {kind}
        {description}
        {services}
      </div>
      {side}
    </article>
  );
}

/** One service the business sells, with what it costs. */
export function ServiceChip({ name, price }: { name: string; price: string }) {
  return (
    <li className="inline-flex items-baseline gap-2 whitespace-nowrap rounded-[8px] bg-[var(--color-muted)] px-2.5 py-1.5 text-[13px]">
      {name}
      <b className="font-bold text-[var(--color-headline)] tabular-nums">{price}</b>
    </li>
  );
}
```

- [ ] **Step 4: Write `provider-row.tsx`**

Create `src/features/directory/ui/provider-row.tsx`, delete `provider-listing-card.tsx` and its test:

```tsx
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight } from "lucide-react";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { ResultRow, ServiceChip } from "@/shared/components/browse/result-row";
import { BrandTile } from "@/shared/components/browse/brand-tile";
import {
  RatingMark,
  TILE_TITLE_LINK_CLASS,
} from "@/shared/components/browse/result-tile";
import { formatHeadlinePrice } from "@/features/directory/services/domain/service-card";

export function ProviderRow({
  provider,
  locale,
}: {
  provider: ProviderPublicDTO;
  locale: string;
}) {
  const { t } = useTranslation("directory");
  const photo = provider.photoUrls[0] ?? null;
  const place = [provider.district, provider.city].filter(Boolean).join(", ");
  // The kind and the place as one sentence, not a dot-joined meta line:
  // "Electricista certificado em Sommerschield, Maputo" is what a person would
  // say out loud, and "Individual · Sommerschield" is what a database would.
  const kind = t(`providerKindSentence.${provider.type}`, {
    category: provider.categories[0]?.name ?? t(`filterProviderKindOption.${provider.type}`),
    place,
  });
  const rest = provider.serviceCount - provider.services.length;

  return (
    <ResultRow
      media={
        <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-navy-surface)]">
          {photo ? (
            <img
              src={photo}
              alt=""
              role="presentation"
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
            />
          ) : (
            <BrandTile name={provider.name} />
          )}
          {/* The logo sits on the photograph: a square for a business, a circle
              for a person. With no photograph the tile above is the brand's own
              and the logo centres on it, so the row keeps its shape either way. */}
          {provider.logoUrl && (
            <span
              className={[
                "absolute z-[2] grid place-items-center overflow-hidden bg-[var(--color-background)] shadow-[0_2px_10px_rgba(0,0,0,.22)]",
                photo ? "bottom-3 left-3 h-11 w-11" : "bottom-1/2 left-1/2 h-16 w-16 translate-x-[-50%] translate-y-1/2",
                provider.type === "individual" ? "rounded-full" : "rounded-[12px]",
              ].join(" ")}
            >
              <img src={provider.logoUrl} alt="" role="presentation" className="h-full w-full object-cover" />
            </span>
          )}
        </div>
      }
      title={
        <h3 className="flex items-center gap-2 text-[19px] font-bold leading-tight tracking-[-0.015em] text-[var(--color-foreground)]">
          <Link
            to="/providers/$slug"
            params={{ slug: provider.slug }}
            className={TILE_TITLE_LINK_CLASS}
          >
            {provider.name}
          </Link>
          {provider.verified && (
            <span
              className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full bg-[var(--color-navy-surface)]"
              aria-label={t("providerVerified")}
            >
              <Check className="h-3 w-3 text-[var(--color-navy-on)]" aria-hidden="true" strokeWidth={3.4} />
            </span>
          )}
        </h3>
      }
      kind={
        <p data-testid="row-kind" className="text-[14px] text-[var(--color-muted-foreground)]">
          {kind}
        </p>
      }
      description={
        provider.description ? (
          <p className="line-clamp-2 max-w-[60ch] text-[14.5px] leading-relaxed">
            {provider.description}
          </p>
        ) : null
      }
      services={
        provider.services.length > 0 ? (
          <ul className="mt-2 flex list-none flex-wrap gap-1.5 p-0">
            {provider.services.map((s) => (
              <ServiceChip
                key={s.name}
                name={s.name}
                price={formatHeadlinePrice(s.amountMinor, s.currency, locale)}
              />
            ))}
            {/* Against `serviceCount`, not against the array: the array is
                capped at three server-side, and counting it would always say
                "+0". */}
            {rest > 0 && (
              <li className="self-center pl-0.5 text-[13px] font-semibold text-[var(--color-primary)]">
                {t("providerServicesMore", { count: rest })}
              </li>
            )}
          </ul>
        ) : null
      }
      side={
        <div className="grid content-between justify-items-end pt-1 text-right">
          {provider.ratingAverage === null ? (
            <span className="text-[13px] text-[var(--color-muted-foreground)]">{t("ratingNew")}</span>
          ) : (
            <RatingMark
              average={provider.ratingAverage}
              count={provider.reviewCount}
              label={t("providerRatingLabel", {
                score: provider.ratingAverage.toFixed(1),
                count: provider.reviewCount,
              })}
            />
          )}
          <div>
            {provider.fromAmountMinor !== null && provider.fromCurrency !== null && (
              <p className="grid justify-items-end">
                <small className="text-[12.5px] text-[var(--color-muted-foreground)]">
                  {t("priceFromPrefix")}
                </small>
                <b className="text-[20px] font-bold leading-tight text-[var(--color-headline)] tabular-nums">
                  {formatHeadlinePrice(provider.fromAmountMinor, provider.fromCurrency, locale)}
                </b>
                <span className="mt-0.5 text-[12.5px] text-[var(--color-muted-foreground)]">
                  {t("providerServiceCount", { count: provider.serviceCount })}
                </span>
              </p>
            )}
            {/* Decoration of the row's own link, not a second tab stop: the
                whole row already goes there, and a chevron a keyboard reader
                has to step past adds a stop that goes nowhere new. */}
            <span
              aria-hidden="true"
              className="mt-2.5 grid h-[34px] w-[34px] place-items-center rounded-full border border-[var(--color-border-strong)] text-[var(--color-headline)]"
            >
              <ChevronRight className="h-[15px] w-[15px]" />
            </span>
            <span className="sr-only">
              {t(provider.type === "individual" ? "providerOpenPerson" : "providerOpenBusiness")}
            </span>
          </div>
        </div>
      }
    />
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/ui/__tests__/provider-row.test.tsx src/shared/components/browse/__tests__/result-row.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse/result-row.tsx \
        apps/frontend/web/src/shared/components/browse/__tests__/result-row.test.tsx \
        apps/frontend/web/src/features/directory/ui
git commit -m "feat(directory): a business row says what it sells"
```

---

### Task 10: The header's search pill, written once

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/search-pill.tsx`
- Create: `apps/frontend/web/src/shared/components/browse/__tests__/search-pill.test.tsx`
- Modify: `apps/frontend/web/src/shared/components/site-header.tsx`

**Interfaces:**
- Consumes: `CitySelect`, `Sheet` from `@ntizo/frontend-ui`.
- Produces:

```tsx
export function SearchPill(props: {
  termLabel: string; termPlaceholder: string;
  cityLabel: string; cityPlaceholder: string;
  term: string; city: string; cities: string[];
  onApply: (next: { term: string; city: string }) => void;
}): JSX.Element;
```
and `SiteHeader` gains `search?: ReactNode`, rendered in the centre column in place of the nav pill, with the destinations moving to the right as text links.

- [ ] **Step 1: Write the failing tests**

```tsx
describe("SearchPill", () => {
  function setup(onApply = vi.fn()) {
    render(
      <SearchPill
        termLabel="Service" termPlaceholder="What do you need?"
        cityLabel="City" cityPlaceholder="Anywhere"
        term="" city="Maputo" cities={["Maputo", "Beira"]}
        onApply={onApply}
      />,
    );
    return onApply;
  }

  it("submits both fields together, from the drafts", async () => {
    // Composing the next search from the URL instead of the drafts is what
    // threw away a typed term the moment the other field was touched.
    const onApply = setup();
    await userEvent.click(screen.getByRole("button", { name: /service/i }));
    await userEvent.type(screen.getByLabelText("Service"), "corte");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(onApply).toHaveBeenCalledWith({ term: "corte", city: "Maputo" });
  });

  it("submits on Enter, because it is a real form", async () => {
    const onApply = setup();
    await userEvent.click(screen.getByRole("button", { name: /service/i }));
    await userEvent.type(screen.getByLabelText("Service"), "corte{Enter}");
    expect(onApply).toHaveBeenCalled();
  });

  it("returns focus to the field's button when Escape closes it", async () => {
    setup();
    const button = screen.getByRole("button", { name: /service/i });
    await userEvent.click(button);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /service/i })).toHaveFocus();
  });

  it("puts the URL back into both fields when it changes underneath", () => {
    const { rerender } = render(<SearchPill {...props} term="corte" city="Maputo" />);
    rerender(<SearchPill {...props} term="" city="" />);
    expect(screen.getByRole("button", { name: /service/i })).toHaveTextContent("What do you need?");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/frontend/web && bunx vitest run src/shared/components/browse/__tests__/search-pill.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `search-pill.tsx`**

Move the body of the two identical `HeroSearch` functions in `services-browse-page.tsx` and `directory-page.tsx` here, restyled as one pill and parameterised by labels and `onApply`. Keep, verbatim in behaviour: the draft state, the `useEffect` that re-reads the URL, `close()` returning focus through `queueMicrotask`, the real `<form>` with a real submit, `CitySelect` for the city, and the phone sheet holding both fields full-size. The visual change is the container:

```tsx
<form
  role="search"
  onSubmit={submit}
  className="hidden h-[52px] w-[600px] items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] py-0 pr-1.5 pl-1 shadow-[0_1px_2px_rgba(0,36,76,.04),0_6px_18px_-10px_rgba(0,36,76,.25)] transition-shadow hover:shadow-[0_1px_2px_rgba(0,36,76,.06),0_8px_22px_-10px_rgba(0,36,76,.35)] md:flex"
>
```

with each resting field a button showing its label above its value, a hairline between the two, and the submit a 40px circle in `--color-primary` — the one blue on the page.

- [ ] **Step 4: Give `SiteHeader` its search variant**

```tsx
export function SiteHeader({
  overlay = false,
  current = "explore",
  search,
}: {
  overlay?: boolean;
  current?: "explore" | "categories" | "services" | "providers";
  /**
   * The browse pages' search, drawn in the centre column in place of the nav
   * pill. A variant rather than a second header: eight surfaces import this
   * one, and the landing page keeps its own hero search.
   */
  search?: ReactNode;
}) {
```

When `search` is present, render it in the centre and render the destinations on the right as text links, the active one `font-bold text-[var(--color-headline)]`. When it is absent, the current nav pill is unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/frontend/web && bunx vitest run src/shared/components/browse/__tests__/search-pill.test.tsx`
Expected: PASS.

- [ ] **Step 6: Prove the other seven headers are untouched**

Run: `cd apps/frontend/web && bunx vitest run src/features/landing src/features/account src/features/checkout`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse/search-pill.tsx \
        apps/frontend/web/src/shared/components/browse/__tests__/search-pill.test.tsx \
        apps/frontend/web/src/shared/components/site-header.tsx
git commit -m "feat(directory): the search moves into the header, written once"
```

---

### Task 11: The category strip

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/category-strip.tsx`
- Create: `apps/frontend/web/src/shared/components/browse/__tests__/category-strip.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `<CategoryStrip label={string}>{children}</CategoryStrip>` and `categoryItemClass(active: boolean): string`.

- [ ] **Step 1: Write the failing test**

```tsx
describe("CategoryStrip", () => {
  it("is navigation, named", () => {
    render(<CategoryStrip label="Categories"><a href="#">Todos</a></CategoryStrip>);
    expect(screen.getByRole("navigation", { name: "Categories" })).toBeInTheDocument();
  });

  it("keeps its arrows out of the tab order — the chips are already tabbable", () => {
    render(<CategoryStrip label="Categories"><a href="#">Todos</a></CategoryStrip>);
    expect(screen.getByTestId("strip-arrow-right")).toHaveAttribute("tabindex", "-1");
    expect(screen.getByTestId("strip-arrow-right")).toHaveAttribute("aria-hidden", "true");
  });

  it("changes nothing but colour and the underline when a category is chosen", () => {
    // A chosen chip that grows shifts every chip after it and the row jumps
    // sideways as the selection moves.
    const off = categoryItemClass(false);
    const on = categoryItemClass(true);
    for (const size of ["px-", "py-", "text-[12.5px]", "gap-"]) {
      expect(off.includes(size)).toBe(on.includes(size));
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/frontend/web && bunx vitest run src/shared/components/browse/__tests__/category-strip.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write it**

Copy `category-rail.tsx`'s scroller, fades, `RailArrow` and `justify-center-safe` behaviour verbatim — including the comment explaining why plain `justify-center` makes the left overflow unreachable — and change three things: the band is `--color-background` with a bottom hairline, the items are icon-over-label, and the active state is an underline rather than a filled pill:

```tsx
export function categoryItemClass(active: boolean): string {
  const base =
    "flex shrink-0 flex-col items-center gap-[7px] whitespace-nowrap border-b-2 pb-3 text-[12.5px] font-medium transition-colors";
  return active
    ? `${base} border-[var(--color-headline)] font-semibold text-[var(--color-headline)]`
    : `${base} border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/frontend/web && bunx vitest run src/shared/components/browse/__tests__/category-strip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse/category-strip.tsx \
        apps/frontend/web/src/shared/components/browse/__tests__/category-strip.test.tsx
git commit -m "feat(directory): categories as a strip, not a row of buttons"
```

---

### Task 12: Filters as pills that open without JavaScript

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/filter-pill.tsx`
- Create: `apps/frontend/web/src/shared/components/browse/__tests__/filter-pill.test.tsx`
- Rewrite: `apps/frontend/web/src/features/directory/services/ui/service-facets.tsx`
- Rewrite: `apps/frontend/web/src/features/directory/ui/provider-facets.tsx`
- Modify: `apps/frontend/web/src/shared/components/browse/facet-panel.tsx` (delete `FacetPanel` and `FacetGroup`, keep the rest)

**Interfaces:**
- Consumes: `facetOptionClass`, `FacetBox`, `FacetCount`, `closeOnChoice` from `facet-panel.tsx`.
- Produces:

```tsx
export function FilterPill(props: {
  label: string;
  /** The chosen option's label. Present means applied, and the pill fills. */
  active?: string | undefined;
  /** The page's own `<Link>` back to this URL without this parameter. */
  clear?: ReactNode;
  children: ReactNode;
}): JSX.Element;
export function FilterBar(props: { children: ReactNode }): JSX.Element;
```
plus, per page, `ServiceFilters({ current })` and `ProviderFilters({ current })` rendering the pills, and `clearedBrowseSearch` / `clearedDirectorySearch` unchanged.

- [ ] **Step 1: Write the failing tests**

```tsx
describe("FilterPill", () => {
  it("opens with no JavaScript, because it is a details element", () => {
    const { container } = render(
      <FilterPill label="Price"><a href="#">Under 1000</a></FilterPill>,
    );
    expect(container.querySelector("details")).toBeInTheDocument();
    expect(container.querySelector("summary")).toHaveTextContent("Price");
  });

  it("shows the chosen option in place of the group's name once applied", () => {
    render(<FilterPill label="How you pay" active="Fixed price"><a href="#">x</a></FilterPill>);
    expect(screen.getByText("Fixed price")).toBeInTheDocument();
    expect(screen.queryByText("How you pay")).toBeNull();
  });

  it("puts the remove link outside the summary, so it is not a toggle", () => {
    // A link inside <summary> both navigates and toggles the disclosure; the
    // two race, and which wins depends on the browser.
    const { container } = render(
      <FilterPill label="City" active="Maputo" clear={<a href="/services">×</a>}>
        <a href="#">x</a>
      </FilterPill>,
    );
    expect(container.querySelector("summary a")).toBeNull();
    expect(screen.getByRole("link", { name: "×" })).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const { container } = render(<FilterPill label="Price"><a href="#">x</a></FilterPill>);
    const details = container.querySelector("details")!;
    details.setAttribute("open", "");
    await userEvent.keyboard("{Escape}");
    expect(details).not.toHaveAttribute("open");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/frontend/web && bunx vitest run src/shared/components/browse/__tests__/filter-pill.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write `filter-pill.tsx`**

```tsx
import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * One group of filters, as a pill that opens a small panel.
 *
 * **A `<details>`, not a menu.** `FacetGroup` already proved the pattern in
 * this codebase: it opens and closes with no script, it is keyboard-operable
 * and announced correctly without a line of ARIA, and it survives the
 * server-rendered first paint — which matters on a page built to be crawled,
 * where the filters are links a crawler should be able to follow.
 *
 * The options inside stay route-typed `<Link>`s owned by the page, so a
 * filtered list is still a URL somebody can send and the back button still
 * undoes it.
 */
export function FilterPill({
  label,
  active,
  clear,
  children,
}: {
  label: string;
  active?: string | undefined;
  clear?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  // Progressive enhancement, both of them: without JavaScript the panel still
  // opens and still closes on its own summary, which is the floor. With it,
  // Escape and a click outside behave the way every other popover on the web
  // does.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) ref.current.removeAttribute("open");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ref.current?.removeAttribute("open");
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const on = active != null;
  return (
    <div className="relative inline-flex">
      <details ref={ref}>
        <summary
          className={[
            "flex h-[38px] cursor-pointer list-none items-center gap-[7px] rounded-full border px-3.5 text-[13.5px] transition-colors [&::-webkit-details-marker]:hidden",
            on
              ? "border-[var(--color-navy-surface)] bg-[var(--color-navy-surface)] font-semibold text-[var(--color-navy-on)]"
              : "border-[var(--color-border-strong)] bg-[var(--color-background)] font-medium text-[var(--color-foreground)] hover:border-[var(--color-headline)]",
            clear ? "pr-9" : "",
          ].join(" ")}
        >
          {active ?? label}
          {!on && <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
        </summary>
        <div className="absolute top-[calc(100%+6px)] left-0 z-20 grid min-w-56 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] bg-[var(--color-background)] p-3 shadow-[var(--shadow-float)]">
          {children}
        </div>
      </details>
      {/* Outside the summary on purpose: a link inside it both navigates and
          toggles the disclosure, and which of the two wins is a browser
          detail rather than a decision. */}
      {clear && <span className="absolute top-1/2 right-2.5 -translate-y-1/2">{clear}</span>}
    </div>
  );
}

/** The row the pills sit in, above the results and under the heading. */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pt-1.5 pb-5">
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite the two facet files as pill sets**

`ServiceFilters({ current })` renders, in order: Preço (`PriceRangeFilter`), Onde acontece, Como pagas, Quem presta, Idioma, and Cidade when `cities.length > 1`. Each `FilterPill` gets `active` = the chosen option's translated label or `undefined`, and `clear` = a `<Link to="/services">` built by `browseSearch(current, { <that key>: undefined, offset: undefined })` with `aria-label={t("filterPillRemove", { filter: label })}`. Inside each pill, the existing `FacetOption` rows are reused unchanged.

`ProviderFilters({ current })` mirrors it with Avaliação, Preço, Quem presta, Verificados and Cidade. `Verificados` is a single-option pill that toggles.

Delete `FacetPanel` and `FacetGroup` from `facet-panel.tsx`; keep `facetOptionClass`, `FacetBox`, `FacetCount` and `closeOnChoice`, which the pills and the sheet both use.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/frontend/web && bunx vitest run src/shared/components/browse/__tests__/filter-pill.test.tsx src/shared/components/browse/__tests__/facet-panel.test.tsx`
Expected: PASS. Trim the `facet-panel` suite to the exports that survive.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse apps/frontend/web/src/features/directory
git commit -m "feat(directory): filters as pills that open without JavaScript"
```

---

### Task 13: The phone — quick chips, the sheet, and one floating control

**Files:**
- Create: `apps/frontend/web/src/shared/components/browse/quick-chips.tsx`
- Create: `apps/frontend/web/src/shared/components/browse/filter-sheet.tsx`
- Create: `apps/frontend/web/src/shared/components/browse/floating-controls.tsx`
- Create: `apps/frontend/web/src/shared/components/browse/__tests__/filter-sheet.test.tsx`
- Create: `apps/frontend/web/src/shared/components/browse/__tests__/floating-controls.test.tsx`

**Interfaces:**
- Consumes: `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` from `@ntizo/frontend-ui`; `closeOnChoice` from `facet-panel.tsx`.
- Produces:

```tsx
export function QuickChips(props: { label: string; children: ReactNode }): JSX.Element;
export function quickChipClass(active: boolean): string;
export function FilterSheet(props: {
  open: boolean; onOpenChange: (open: boolean) => void;
  title: string; clear: ReactNode; apply: string; onApply: () => void;
  children: ReactNode;
}): JSX.Element;
export function FloatingControls(props: { children: ReactNode }): JSX.Element;
export function floatingControlClass(): string;
```

- [ ] **Step 1: Write the failing tests**

```tsx
describe("FilterSheet", () => {
  it("says what pressing the button will show", async () => {
    // "Apply" makes you tap to find out what you did.
    render(<FilterSheet open title="Filters" apply="Show 38 results" onApply={vi.fn()} clear={<a href="#">Clear</a>} onOpenChange={vi.fn()}><p>groups</p></FilterSheet>);
    expect(screen.getByRole("button", { name: "Show 38 results" })).toBeInTheDocument();
  });

  it("is a dialog with a name, not an unlabelled box of controls", () => {
    render(<FilterSheet open title="Filters" apply="Show 38" onApply={vi.fn()} clear={null} onOpenChange={vi.fn()}><p>g</p></FilterSheet>);
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
  });

  it("closes on a choice but not on a click into the price field", async () => {
    const onOpenChange = vi.fn();
    render(
      <FilterSheet open title="Filters" apply="Show" onApply={vi.fn()} clear={null} onOpenChange={onOpenChange}>
        <a href="#">An option</a>
        <input aria-label="Min" />
      </FilterSheet>,
    );
    await userEvent.click(screen.getByLabelText("Min"));
    expect(onOpenChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("link", { name: "An option" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("FloatingControls", () => {
  it("sits above the customer bottom bar, not under it", () => {
    // MobileNav is `fixed bottom-0 z-40` below md. A control at bottom-0 was
    // painted over completely and could not be pressed at all.
    render(<FloatingControls><button type="button">Filters</button></FloatingControls>);
    expect(screen.getByTestId("floating-controls").className).toContain("safe-area-inset-bottom");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/frontend/web && bunx vitest run src/shared/components/browse/__tests__/filter-sheet.test.tsx src/shared/components/browse/__tests__/floating-controls.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the three components**

`FilterSheet` reuses the `Sheet` primitive and the `role="dialog"` + `aria-labelledby` wrapper the current `MobileFilterBar` already builds, keeps `closeOnChoice`, and adds the footer:

```tsx
<div className="mt-auto flex items-center justify-between border-t border-[var(--color-border)] py-3.5 pb-6">
  {clear}
  <button
    type="button"
    onClick={onApply}
    className="rounded-[12px] bg-[var(--color-navy-surface)] px-5.5 py-3.5 text-[15px] font-bold text-[var(--color-navy-on)]"
  >
    {apply}
  </button>
</div>
```

`FloatingControls` is the navy capsule, centred, `bottom-[calc(1.5rem+env(safe-area-inset-bottom))]`, `z-30`, with `data-testid="floating-controls"` and a `lg:hidden`. It replaces the full-width bar and the `h-20` spacer that reserved room for it.

`QuickChips` is a horizontally scrolling row with the same fade mask the strip uses; `quickChipClass(active)` fills navy when on.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/frontend/web && bunx vitest run src/shared/components/browse/__tests__/filter-sheet.test.tsx src/shared/components/browse/__tests__/floating-controls.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/shared/components/browse
git commit -m "feat(directory): the phone gets chips, a real sheet and one control"
```

---

### Task 14: `/services`, composed

**Files:**
- Rewrite: `apps/frontend/web/src/features/directory/services/ui/services-browse-page.tsx`
- Rewrite: `apps/frontend/web/src/features/directory/services/ui/__tests__/services-browse-page.test.tsx`

**Interfaces:**
- Consumes: every component from Tasks 8, 10–13, plus `browseTitle` (Task 3) and the copy (Task 4).
- Produces: nothing further.

- [ ] **Step 1: Rewrite the page's body**

Keep, unchanged: the `useSearch({ strict: false })` read, `useBrowseServices`, `useCategoryPreview(CATEGORY_RAIL_LIMIT)`, `chooseSort`, `isNarrowed` with every filter named in it, the two `EmptyCard` branches, and `Pager` with `page.nextOffset` for "next". Replace the shell:

```tsx
  return (
    <>
      <SiteHeader
        current="services"
        search={
          <HeroSearch current={current} />
        }
      />

      <CategoryStrip label={t("categoryStripLabel")}>
        <StripItem
          search={browseSearch(current, { category: undefined, offset: undefined })}
          label={t("servicesAllCategories")}
          icon={null}
          isAll
          active={!category}
        />
        {categories.map((c) => (
          <StripItem
            key={c.id}
            search={browseSearch(current, { category: c.code, offset: undefined })}
            label={c.name}
            icon={c.icon}
            active={category === c.code}
          />
        ))}
      </CategoryStrip>

      <main className="page-shell pb-14">
        <div className="flex items-end justify-between gap-5 pt-6 pb-3.5">
          <div>
            <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-[var(--color-headline)]">
              {t(title.key, title.values)}
            </h1>
            <p className="mt-1 text-[14.5px] text-[var(--color-muted-foreground)]">
              <b className="font-semibold text-[var(--color-foreground)]">
                {t("servicesFound", { count: page.total })}
              </b>{" "}
              {t(`resultsScope.${resultsScope(title.values)}`, title.values)}
            </p>
          </div>
          <SortDropdown
            active={sort}
            options={sortOptions}
            sortLabel={t("sortLabel")}
            onChoose={chooseSort}
          />
        </div>

        <FilterBar>
          <ServiceFilters current={current} />
        </FilterBar>

        {page.items.length === 0 ? (
          isNarrowed ? (
            <EmptyCard icon={SearchX} title={t("servicesNoMatch")} body={t("servicesNoMatchHint")} />
          ) : (
            <EmptyCard badge={LayoutGrid} title={t("servicesEmptyTitle")} body={t("servicesEmpty")} />
          )
        ) : (
          <>
            <ul className="grid list-none grid-cols-1 gap-x-6 gap-y-8 p-0 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {page.items.map((service) => (
                <li key={service.id}>
                  <ServiceTile service={service} locale={locale} />
                </li>
              ))}
            </ul>
            <Pager … />
          </>
        )}
      </main>

      <MobileServiceFilters current={current} total={page.total} />
    </>
  );
```

`HeroSearch` becomes a thin wrapper that builds `onApply` from `browseSearch` and hands the rest to `SearchPill`; its long doc comment moves to `SearchPill`.

`StripItem` is the page's existing `RailChip`, renamed and restyled — the same
route-typed `<Link>` and the same `iconComponent(name, isAll)` lookup, which
stays because the icon set lives in a table an administrator edits and cannot be
known at build time. Only its class changes, from `categoryChipClass` to
`categoryItemClass`, and its children become the icon above the label:

```tsx
function StripItem({ search, label, icon, isAll = false, active }: {
  search: BrowseSearch; label: string; icon: string | null; isAll?: boolean; active: boolean;
}) {
  const Icon = iconComponent(icon, isAll);
  return (
    <Link to="/services" activeOptions={EXACT_MATCH} search={search} className={categoryItemClass(active)}>
      <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
```

- [ ] **Step 2: Rewrite the page test**

Keep every existing behavioural assertion that still has a subject and add the three the redesign introduces:

```tsx
it("heads the page with the term when one is typed", async () => {
  await renderPage({ q: "corte", city: "Maputo" });
  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("corte in Maputo");
});

it("counts the total, not the page", async () => {
  await renderPage({}, { items: threeServices, total: 40, nextOffset: 24 });
  expect(await screen.findByText("40 services found")).toBeInTheDocument();
});

it("draws no result button at all — the tile is the link", async () => {
  await renderPage({});
  expect(screen.queryByRole("link", { name: /book/i })).toBeNull();
});
```

- [ ] **Step 3: Run the page suite**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory/services/ui/__tests__/services-browse-page.test.tsx`
Expected: PASS.

- [ ] **Step 4: Typecheck**

Run: `cd apps/frontend/web && bun run typecheck`
Expected: errors only in `directory-page.tsx`, which Task 15 rewrites.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/web/src/features/directory/services/ui
git commit -m "feat(directory): /services, composed on the new shell"
```

---

### Task 15: `/providers`, composed

**Files:**
- Rewrite: `apps/frontend/web/src/features/directory/ui/directory-page.tsx`
- Rewrite: `apps/frontend/web/src/features/directory/ui/__tests__/directory-page.test.tsx`

**Interfaces:**
- Consumes: Task 9's `ProviderRow`, Task 14's shell decisions.
- Produces: nothing further.

- [ ] **Step 1: Rewrite the page**

The twin of Task 14, differing in exactly four things: `ProviderFilters` instead of `ServiceFilters`, `providersFound` instead of `servicesFound`, a `<ul>` of `ProviderRow` in place of the tile grid, and `Pager` stepping from `total` rather than a server cursor (`providerPageReadModel` carries a count and no `nextOffset`). Everything else — the heading block, the filter bar, the empty branches, the sort — is the same code in the same order. If the two page files come to differ anywhere else, one of them is wrong.

- [ ] **Step 2: Rewrite the page test**

Keep the existing assertions and add:

```tsx
it("shows what each business sells, inside the row", async () => {
  await renderPage({}, { items: [providerWithServices], total: 1 });
  expect(await screen.findByText("Corte com barba")).toBeInTheDocument();
  expect(screen.getByText("800 MZN")).toBeInTheDocument();
});

it("heads the page with the term when one is typed", async () => {
  await renderPage({ q: "estúdio" });
  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("estúdio");
});
```

- [ ] **Step 3: Run both page suites together**

Run: `cd apps/frontend/web && bunx vitest run src/features/directory`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/web/src/features/directory/ui
git commit -m "feat(directory): /providers, composed on the new shell"
```

---

### Task 16: Delete what nothing imports, then prove it green

**Files:**
- Delete: `browse-hero.tsx`, `price-stub.tsx`, `listing-card.tsx`, `listing-media.tsx`, `results-bar.tsx`, `active-filter-chips.tsx`, `mobile-search-sheet.tsx`, `category-rail.tsx` and each one's test, all under `apps/frontend/web/src/shared/components/browse/`
- Delete: `apps/frontend/web/src/features/directory/services/domain/service-stub.ts` and `__tests__/service-stub.test.ts`

- [ ] **Step 1: Prove each file is unimported before deleting it**

```bash
cd apps/frontend/web/src
for f in browse-hero price-stub listing-card listing-media results-bar active-filter-chips mobile-search-sheet category-rail service-stub; do
  echo "== $f"; grep -rn "$f" --include="*.ts" --include="*.tsx" . | grep -v "browse/$f\|domain/$f\|__tests__/$f"
done
```
Expected: no output under any heading. A hit means a page still imports it and Task 14 or 15 is incomplete.

- [ ] **Step 2: Delete them**

```bash
cd apps/frontend/web/src
git rm shared/components/browse/{browse-hero,price-stub,listing-card,listing-media,results-bar,active-filter-chips,mobile-search-sheet,category-rail}.tsx
git rm shared/components/browse/__tests__/{browse-hero,price-stub,listing-card,listing-media,results-bar,mobile-search-sheet,category-rail}.test.tsx
git rm features/directory/services/domain/service-stub.ts features/directory/services/domain/__tests__/service-stub.test.ts
```

- [ ] **Step 3: Confirm the dead copy went with them**

Run: `grep -rn "stubProviderRating\|stubQuoteAmount\|stubPerService\|listingByProvider\|mobileSearchTitle\|activeFiltersLabel\|heroSubtitle" apps/frontend/web/src`
Expected: no hits. Any survivor is a key Task 4 removed from the locale files but a component still asks for, which renders as the raw key on screen.

- [ ] **Step 4: Run everything**

```bash
cd apps/frontend/web && bunx vitest run && bun run typecheck && bun run lint
cd ../../../packages/frontend && bunx vitest run && bun run typecheck
cd ../shared && bunx vitest run && bun run typecheck
cd ../backend && bun test && bun run typecheck
```
Expected: all green.

- [ ] **Step 5: Look at both pages in a browser**

```bash
cd apps/frontend/web && bun run dev
```
Open `/services` and `/providers` at 1440 and at 390. Check, in this order, because each has bitten this codebase before: the category strip scrolls to its first chip and not past it; a filter pill opens, applies, and its × removes only itself; the phone's floating control is above the customer bottom bar and pressable; a listing with no photograph shows the navy tile and initials; and the pages are legible in dark mode, which is what the three tokens in Task 1 exist for.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(directory): delete the hero, the stub and the sidebar"
```

---

## Self-review notes (already applied)

- **Spec coverage.** Every spec section maps to a task: colour and type → 1; the shell → 10, 11, 14, 15; the heading → 3, 4; the filter toolbar → 12; the service tile → 2, 7, 8; the provider row → 5, 6, 9; mobile → 13; API additions → 5, 6; files → 16. The map is explicitly out of scope in both documents.
- **Deviations carried through.** The rating's placement is asserted in Task 8's test and named in Global Constraints; the heart, the services "Verificados" pill, the "Hoje" chip and the two subtitle clauses appear nowhere in any task.
- **Type consistency.** `servicePriceLine` returns `{ amount, meta }` in Task 2 and is destructured as `line.amount` / `line.meta` in Task 8. `services` is `{ name, amountMinor, currency, pricingMode }` in Tasks 5, 6 and 9. `TILE_TITLE_LINK_CLASS` is defined in Task 8 and used in Tasks 8 and 9.
- **Ordering.** Nothing is deleted until Task 16, after both pages stop importing it, so every task before it ends with a build that compiles. The two exceptions are stated in place: Task 8 leaves `services-browse-page.tsx` red until Task 14, and Task 12 leaves both pages red until 14 and 15, because a card and its page cannot be swapped in the same commit without one of them being unreviewable.
- **Three inconsistencies found and fixed in review.** Task 4 was deleting
  `servicesAllCategories` while Task 14 still rendered an "All" item with it, and
  was deleting the `chip*` label keys that `browseFilterChips` still returns;
  both sets are now kept, with the reason written next to them. Task 14 named a
  `StripItem` that no task defined; it is now defined there as the renamed
  `RailChip`, including the `iconComponent` lookup it depends on.
