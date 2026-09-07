# Listings Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/services` and `/providers` use the site's own header, search bar, category chips and empty-photo placeholder, so the two lists stop looking like a different product from the pages around them.

**Architecture:** Four surgical changes on top of the shipped listings refresh, nothing else moves. The site header's `search` variant is removed and the file restored to what every other page renders. The landing's `ServiceSearch` bar gains a destination and a placeholder and sits under the header on both pages. `CategoryStrip` keeps its scroller, fades and arrows but its items become chips in the filter pills' style. `BrandTile` is deleted and the shared image component's default placeholder (the pale-blue tile with the brand mark) stands in for a missing photo.

**Tech Stack:** React 19, TanStack Router, Tailwind 4, vitest + jsdom + Testing Library, react-i18next (eight locales, pt-MZ reference).

**Spec:** `docs/superpowers/specs/2026-09-06-listings-refresh-design.md`, section "Revision 2026-09-07" at its end, which overrides the sections it names.

## Global Constraints

- The two page files (`features/directory/services/ui/services-browse-page.tsx`, `features/directory/ui/directory-page.tsx`) differ only in the filters component, the copy keys, the result shape, how the pager steps, and each page's own quick-chip parameter. A change to one is the same change to the other.
- `SiteHeader` renders byte-for-byte what it rendered at `a2f687ff` for every caller once this plan is done; no `search` prop survives.
- Blue (`--color-primary`) appears on the header's nav pill, the header's sign-in button and the search bar's button, as on every other page. Nothing in the results is blue.
- Every count comes from `page.total`; every filter and category option is a `<Link>`.
- The locale parity gate `apps/frontend/web/src/shared/locales/__tests__/locales.test.ts` stays green; a key is deleted only when `grep -rn "<key>" apps/frontend/web/src --include='*.ts' --include='*.tsx'` finds no reader outside the locale files.
- Commit trailer on every commit:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01A99NHohPu8CdTBYPEhkEZH`
- Work happens in the worktree at `.claude/worktrees/listings-refresh` on branch `feat/listings-consistency`; the main checkout is never touched.

---

### Task 1: The site's header and the site's search bar on both pages

**Files:**
- Restore: `apps/frontend/web/src/shared/components/site-header.tsx` and `apps/frontend/web/src/shared/components/__tests__/site-header.test.tsx` to their content at `a2f687ff`
- Modify: `apps/frontend/web/src/shared/components/service-search.tsx` and its test
- Modify: `apps/frontend/web/src/features/directory/services/ui/services-browse-page.tsx`, `apps/frontend/web/src/features/directory/ui/directory-page.tsx` and their tests
- Delete: `apps/frontend/web/src/shared/components/browse/search-pill.tsx` and `apps/frontend/web/src/shared/components/browse/__tests__/search-pill.test.tsx`

**Interfaces:**
- Produces: `ServiceSearch({ initialValue?, className?, autoFocus?, to?: "/services" | "/providers", placeholder?: string })`; `to` defaults to `"/services"`, `placeholder` defaults to `t("searchPlaceholder")`.

- [ ] **Step 1: Restore the header**

```bash
git checkout a2f687ff -- apps/frontend/web/src/shared/components/site-header.tsx apps/frontend/web/src/shared/components/__tests__/site-header.test.tsx
cd apps/frontend/web && bunx vitest run src/shared/components/__tests__/site-header.test.tsx
```
Expected: PASS. Only this plan's branch ever touched these two files since `a2f687ff` (`git log a2f687ff..HEAD -- <file>` shows nothing from anyone else), so the restore is exact.

- [ ] **Step 2: Write the failing tests for the search bar's destination**

In `service-search.test.tsx` (create beside the existing shared component tests if none exists, using the same memory-router harness `site-header.test.tsx` uses):

```tsx
it("goes to /providers with the term when told to", async () => {
  // render <ServiceSearch to="/providers" placeholder="Nome do negócio" /> inside the router
  // type "Cossa", submit
  // expect(router.state.location.pathname).toBe("/providers")
  // expect(router.state.location.search).toEqual({ q: "Cossa" })
});
it("keeps going to /services by default", async () => { /* same, no `to`, expects "/services" */ });
it("shows the placeholder it is given", async () => {
  // expect(screen.getByRole("searchbox")).toHaveAttribute("placeholder", "Nome do negócio")
});
```

- [ ] **Step 3: Implement `to` and `placeholder`**

In `service-search.tsx`: add the two props to `ServiceSearchProps` with the doc comment "Where the term goes. The home page and `/services` search services; `/providers` searches businesses by name."; `navigate({ to, search: q ? { q } : {} })`; `placeholder={placeholder ?? t("searchPlaceholder")}`. Run the file's test: PASS.

- [ ] **Step 4: Put the bar under the header on both pages**

In both page files, replace `<SiteHeader current="…" search={<HeroSearch current={current} />} />` with `<SiteHeader current="…" />`, delete the private `HeroSearch` and the `SearchPill` import, and render as the first child inside the page's `page-shell` container, above `CategoryStrip`:

```tsx
<ServiceSearch
  initialValue={current.q ?? ""}
  className="mx-auto mt-5 max-w-[760px]"
/>
```
on `/services`, and on `/providers`:
```tsx
<ServiceSearch
  to="/providers"
  placeholder={t("searchFieldProviderEmpty")}
  initialValue={current.q ?? ""}
  className="mx-auto mt-5 max-w-[760px]"
/>
```
`searchFieldProviderEmpty` ("Nome do negócio ou profissional" in pt-MZ) already exists in all eight locales. If `useProviderCities` / `useBrowseCities` were only feeding the deleted pill, drop those imports too; if the City pill reads them, leave them.

- [ ] **Step 5: Migrate the page tests**

Delete the cases that exercised the header pill and its phone sheet ("header pill", "filled pills' ×" for the pill, "phone sheet" cases). Add, on each page: "the search bar sits under the header and submits to this page" (type a term, submit, assert the URL's pathname and `q`), and "the search bar shows the current term" (`renderPage("/services?q=barba")` → searchbox value "barba"). Keep every other case.

- [ ] **Step 6: Delete the pill, run, commit**

```bash
git rm apps/frontend/web/src/shared/components/browse/search-pill.tsx apps/frontend/web/src/shared/components/browse/__tests__/search-pill.test.tsx
cd apps/frontend/web && bunx vitest run src/shared/components src/features/directory && bun run typecheck && bun run lint
git commit -m "feat(directory): the site's own header and search bar on both lists"
```

---

### Task 2: Category chips in the filter pills' style

**Files:**
- Modify: `apps/frontend/web/src/shared/components/browse/category-strip.tsx` and `__tests__/category-strip.test.tsx`
- Modify: the `StripItem` in both page files, and the page tests' strip cases

- [ ] **Step 1: Failing test**

In `category-strip.test.tsx`: "an item is a chip: rounded, hairline at rest, navy when chosen, same padding and weight in both states" — assert `categoryItemClass(false)` contains `rounded-full`, `border-[var(--color-border)]`, `font-medium`, does not contain `border-b-2`; `categoryItemClass(true)` contains `bg-[var(--color-navy-surface)]`, `text-[var(--color-navy-on)]`, `font-medium`; the two share `px-3.5` and `h-9`. And "the strip carries no band of its own": the `<nav>` has no `border-b` class.

- [ ] **Step 2: Implement**

`categoryItemClass`:
```ts
const base =
  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[14px] font-medium transition-colors";
return active
  ? `${base} border-[var(--color-navy-surface)] bg-[var(--color-navy-surface)] text-[var(--color-navy-on)]`
  : `${base} border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]`;
```
`CategoryStrip`'s `<nav>` loses `border-b border-[var(--color-border)] bg-[var(--color-background)]` and becomes `relative mt-4`; the scroller's `pt-3.5` becomes `py-1` (the chips carry their own height). Fades and arrows stay; re-centre the arrows on the 36px chip row (`top-1/2 -translate-y-1/2` already does). Rewrite the doc comments that describe the underline and the band so they describe chips.

In both pages' `StripItem`: the icon and label sit inline (`<Icon className="h-[15px] w-[15px]" aria-hidden />` then the label), no column layout. The "Todas" item keeps its compass icon.

- [ ] **Step 3: Run, commit**

```bash
cd apps/frontend/web && bunx vitest run src/shared/components/browse src/features/directory && bun run typecheck
git commit -m "feat(browse): categories as chips in the filter pills' style"
```

---

### Task 3: The site's placeholder for a missing photo

**Files:**
- Modify: `apps/frontend/web/src/shared/components/browse/result-tile.tsx` (`TileMedia`), `apps/frontend/web/src/features/directory/ui/provider-row.tsx`, their tests
- Delete: `apps/frontend/web/src/shared/components/browse/brand-tile.tsx`, `apps/frontend/web/src/shared/components/browse/__tests__/brand-tile.test.tsx`, `apps/frontend/web/public/brand/tie-pattern.svg`
- Modify: `apps/frontend/web/src/shared/components/brand-image.tsx` doc comment on `fallback` (the browse tiles no longer pass one; keep the prop, it is harmless and documented)

- [ ] **Step 1: Failing tests**

`result-tile.test.tsx`: "falls back to the brand tile" becomes "falls back to the site's placeholder": with `imageUrl: null` expect `screen.getByTestId("media-fallback")` and no `brand-tile`. Same in `provider-row.test.tsx` and `service-tile.test.tsx` where they assert the brand tile.

- [ ] **Step 2: Implement**

`TileMedia` renders `<BrandImage src={…} alt="" className={…} />` with no `fallback`; the `MediaFallback` wears the same sizing class as the `<img>` did (it sets no size of its own, by design). `provider-row.tsx` likewise. Delete `brand-tile.tsx`, its test and `public/brand/tie-pattern.svg`; `shared/domain/initials.ts` stays (the landing, account page and user menu use it).

- [ ] **Step 3: Run, commit**

```bash
cd apps/frontend/web && bunx vitest run src/shared/components src/features/directory && bun run typecheck
git commit -m "feat(browse): a missing photo shows the site's own placeholder"
```

---

### Task 4: Dead copy, every suite, the build

**Files:**
- Modify: the eight `apps/frontend/web/src/shared/locales/<locale>/directory.json`

- [ ] **Step 1: Delete only what nothing reads**

For each of `searchPillSubmit`, `searchPillOpen`, `mobileSearchTitle`, `mobileSearchApply`, `searchFieldService`, `searchFieldServiceEmpty`, `searchFieldProvider`, `searchFieldCity`, `searchFieldCityEmpty`, `searchFieldCityToggle`, `searchFieldCityNoResults`, `categoryStripLabel`, `categoryStripScrollLeft`, `categoryStripScrollRight`: run the grep gate from Global Constraints; delete the key from all eight files only if the gate is empty. `searchFieldProviderEmpty` stays (Task 1 reads it). List in the report which keys went and which stayed and why.

- [ ] **Step 2: Everything green**

```bash
cd apps/frontend/web && bunx vitest run src/shared/locales/__tests__/locales.test.ts && bunx vitest run && bun run typecheck && bun run lint && bun run build
```
Expected: all green; lint keeps its one pre-existing warning.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(locales): delete the search pill's copy, which nothing reads"
```
