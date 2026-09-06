# Listings refresh — Design

**Goal:** `/services` and `/providers` are the two pages a customer meets before
they meet a booking. Both were rebuilt on 2026-08-27 and both still read as a
template: a centred hero with a halo, a floating search card, a rail of pills, a
sidebar of checkboxes, and a bordered card per result carrying a blue button.
This replaces the chrome with the catalogue: a white page, photographs at four
across, search in the header, filters as a toolbar, and businesses as hairline
rows that say what they sell.

The approved mockup is `2026-09-06-listings-refresh.mockup.html`, beside this
file. Where this spec and the mockup disagree, this spec wins — every
disagreement is listed under "Deviations from the mockup", with its reason.

## The thesis, unchanged

Ntizo sells **certainty**: a price and a duration fixed before you commit, in a
market where the norm is to negotiate on the doorstep. The 2026-08-27 design
said that with a flourish — a price rail drawn as a perforated ticket stub. This
one says it by making the price the only thing on a tile set in the brand's
navy, and by removing every button that competed with it.

## What is being replaced

| | today | after |
|---|---|---|
| Page head | hero band, halo, `type-display` title, subtitle | none; the results heading is the `h1` |
| Search | a card straddling the hero's edge | a pill in the site header |
| Categories | full-bleed band of bordered pills | icon-over-label strip, underlined when active |
| Filters | 250px sidebar of checkbox links | a row of pill popovers under the heading |
| Applied filters | a chip row under the results bar | the pills themselves, filled navy, each with its own × |
| Results | one bordered card per row, 238px photo, ticket stub | services: four photo tiles per row; providers: hairline rows |
| Result CTA | a blue button per card | none; the price carries the eye, the card is the link |
| Ground | `--color-surface-raised` tint, white cards | white, no cards |
| Mobile | a trigger that opens a search sheet, a bottom filter bar | search pill, quick-filter chips, hairline rows, one floating control, a real filter sheet |

The two pages stay deliberate twins: the same shell in the same order, differing
only in their copy, their result shape and their page size. If they diverge
anywhere else, one of them is wrong.

## Colour and type

**Figtree replaces Poppins and Inter.** The brand manual
(`packages/docs/assets/Ntizo - Manual de Identidade Visual.pdf`, p. 11) names
Figtree for titles *and* text; the app ships two faces the manual does not
mention. `@fontsource/figtree` at 400/500/600/700, `--font-display`,
`--font-rounded` and `--font-sans` all pointed at it, and the `.type-*` classes
keep their sizes. **This changes every page in the app**, not only these two — it
is in this spec because these pages are where the mismatch shows worst, and
because doing it twice is worse than doing it once. If that breadth is
unwelcome, cut this section: the layout below holds in Poppins/Inter and only
looks less like the manual.

**Navy joins the palette, in three roles.** `#00244C` is a brand colour
(manual p. 8) that the web tokens never adopted. It is not one token, because it
does three jobs and a single value breaks in dark mode:

| token | light | dark | used by |
|---|---|---|---|
| `--color-headline` | `#00244c` | `#e6e9ef` | `h1`, tile prices, provider names, the sort trigger's value |
| `--color-navy-surface` | `#00244c` | `#1b2740` | active filter pill, current page number, verified seal, the phone's floating control, the empty-photo tile |
| `--color-navy-on` | `#ffffff` | `#e8ecf3` | text and marks on `--color-navy-surface` |

Blue (`--color-primary`) appears **once per page**, on the header's search
button. Everything else is headline navy, ink, grey, and the amber star.
`--color-surface-raised` stops being used by these pages; it stays in the
system for the surfaces that still want it.

## The shell

```
┌──────────────────────────────────────────────────────────────────────┐
│  ntizo      [ Serviço | Cidade | (⌕) ]      Serviços Prestadores PT [Entrar] │
├──────────────────────────────────────────────────────────────────────┤
│  ⊙      ✂        🔧         ⚡          ✨       …                     │
│ Todos  Beleza  Canalização  Electric.  Limpeza                        │
│ ═════                                                                 │
├──────────────────────────────────────────────────────────────────────┤
│  Serviços em Maputo                                  Ordenar: Sugeridos ⌄│
│  96 serviços em Maputo                                                │
│                                                                       │
│ (Preço fixo ×) (Preço ⌄) (Onde acontece ⌄) (Quem presta ⌄) (Mais ⌄) Limpar│
│ ─────────────────────────────────────────────────────────────────────│
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐                      │
│  │ FOTO   │  │ FOTO   │  │ FOTO   │  │ FOTO   │                      │
│  └────────┘  └────────┘  └────────┘  └────────┘                      │
│  Nome    4,7  Nome    4,8  …                                          │
│  Quem · onde   Quem · onde                                            │
│  800 MZN 45min                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

### The header

`SiteHeader` gains a **variant**, not a replacement: eight surfaces import it
(`landing/ui/hero.tsx`, `become-provider`, both detail pages, checkout, the
customer shell, and these two lists), and the landing page keeps its own hero
search. The variant is `search` and it swaps the centred nav pill for the search
pill and moves Serviços/Prestadores to the right as plain text links, active one
in headline navy.

The pill is one `<form role="search">` with two fields and a submit, and it
keeps the behaviour the current hero card fought for and won:

- **Both fields are drafts; one submission writes the URL.** Composing the next
  search from `current` instead of the drafts is what threw away a typed term
  the moment the other field was touched.
- **A real `type="submit"`**, so Enter works because browsers make it work.
- **The city field is `CitySelect`**, the same combobox `AddressesPage` and
  provider Settings use, opened by the click that reveals it.
- **Escape returns focus to the button that opened the field.**

Below `md` the pill collapses to one row showing the term and the city, which
opens a sheet holding both fields at full size. Both write through one `apply`.

### The category strip

A full-width white band with a bottom hairline; the row itself sits in
`page-shell` and scrolls sideways with the same edge fades and desktop arrows
`CategoryRail` already has. Each item is a 24px stroked icon over a 12.5px
label; the active one is headline navy with a 2px underline. Selection changes
colour and the underline only — never size or padding, or the row jumps
sideways as the selection moves.

`justify-center-safe` from the current rail is kept, and for the same reason:
plain `justify-center` on a scrolling flex container makes the overflow to the
left permanently unreachable.

### The heading

`h1` is the results heading and carries what the URL says. `browseTitle` and
`directoryTitle` gain a **term-aware form**, because the mockup's phone reads
"Corte de cabelo em Maputo" and today the typed term appears only as a chip:

| URL | heading |
|---|---|
| `/services?city=Maputo` | Serviços em Maputo |
| `/services?q=corte&city=Maputo` | Corte de cabelo em Maputo |
| `/services?category=beauty&city=Maputo` | Beleza e cabelo em Maputo |
| `/services?q=corte&category=beauty` | Corte de cabelo |

**The term outranks the category**, because the term is what the reader typed
and the category is already shown, underlined, in the strip above.

Under it, one line: `<b>96 serviços</b>` plus the existing `resultsScope`
clause. The count is `page.total`, never `items.length` — the projection drops
rows it cannot render, and counting what arrived once told somebody with 40
matches that they had 24.

### The filter toolbar

A row of pills under the heading, above a hairline. Each pill is a **`<details>`
element styled as a popover**, not a JavaScript menu: `FacetGroup` already
proves the pattern in this codebase, it opens and closes with no script, it is
keyboard-operable and announced correctly, and it survives the server-rendered
first paint. Inside the popover the options stay exactly what they are today —
route-typed `<Link>`s built by `browseSearch` / `directorySearch`, each carrying
every other parameter, each undoable with the back button.

An applied filter fills its own pill navy and grows an `×` that links back to
the same URL without that one parameter. This replaces `ActiveFilterChips`: two
places showing the same state was one place too many.

| page | pills |
|---|---|
| `/services` | Preço, Onde acontece, Como pagas, Quem presta, Idioma, Cidade (when >1) |
| `/providers` | Avaliação, Preço, Quem presta, Verificados, Cidade (when >1) |

`Mais filtros` collects whatever does not fit at the current width. The sort
control stays the existing `SortDropdown`, restyled to a plain text trigger
("Ordenar: Sugeridos ⌄") on the heading's right.

## The service tile

Four per row at `lg`, three at `md`, two at `sm`, one below. 4:3 photo,
`--radius-card` corners, then three lines:

```
┌──────────────┐
│    FOTO 4:3  │
└──────────────┘
Corte de cabelo com barba              (title, 15px/600, one line, ellipsis)
Estúdio Mavalane ✔ ★ 4,7 (6) · Polana  (provider, seal, their rating, district)
800 MZN   45 min   No salão            (price navy 15.5px/700, then meta)
```

**No border, no shadow, no chip on the photo.** Hover underlines the title and
eases the photograph to 1.035; nothing lifts, nothing scales the card.

**One link, and only one.** The title's `::after` spans the tile
(`LISTING_TITLE_LINK_CLASS`, kept), so a keyboard reader gets a single tab stop
for the destination. There is no second control on the tile — see the heart,
below.

**The price is the call to action.** Four shapes, from `servicePriceCell`, which
does not change:

| state | renders |
|---|---|
| fixed | `800 MZN` · `45 min` |
| hourly | `500 MZN/h` · `mín. 60 min` — the unit inside the amount, 12.5px grey |
| several options | `desde 2 500 MZN` · `3 opções` |
| quote | `Preço a combinar` · `Pede um orçamento`, 14px/600, not a number |
| priced but no active option | `Preço indisponível` — never "by quote", the price exists and its packages are gone |

**No photo is a designed state, not a gap.** The tile fills with a navy
gradient, the brand's tie pattern from
`packages/docs/assets/Pattern/SVG/Pattern 1.svg` at 16% opacity rotated −8°, and
the provider's initials (`features/landing/domain/initials.ts`, reused). Most
listings have no photograph; a column of identical grey rectangles reads as a
broken page, a column of navy tiles reads as a catalogue.

**No reviews is a word, not a missing star:** `Novo` sits where the rating
would, in grey.

## The provider row

Hairline-separated rows, no box, `284px | 1fr | 190px`:

```
┌──────────┐  Estúdio Mavalane ✔                          ★ 4,7 (6)
│  FOTO    │  Salão de cabelo e barbearia em Polana, Maputo
│      ┌──┐│  Quatro profissionais, marcação ao minuto e sem filas…
└──────┤EM├┘  [Corte com barba 800 MZN] [Barba 450 MZN] [+3]      desde
       └──┘                                                     350 MZN
                                                              6 serviços  (›)
```

**The row says what the business sells.** Up to three services with their
prices, as chips inside the row, so a reader compares businesses without opening
each one. This is the single thing the current page cannot say, and the one API
addition this spec needs.

**Kind and place are one sentence**, not a dot-joined meta line: "Electricista
certificado em Sommerschield, Maputo", built from a per-`type` key plus the
existing `district`/`city`. Copy a person would say out loud.

**The logo sits on the photograph**, bottom-left: a rounded square for an
organization, a circle for a person. With no cover photo the tile becomes the
navy pattern and the logo centres on it, so the row keeps its shape either way.

**Rating top right, price under it**, sharing a column because they are the two
numbers a reader weighs against each other. `desde` stays small so it cannot be
misread as the price of anything in particular. The circle chevron is decoration
of the row's own link, `aria-hidden`, not a second tab stop.

## Mobile

390px, three screens in the mockup.

- **A search pill** showing the term and the city, with a filter button carrying
  a count badge. Tapping either opens a sheet.
- **The icon strip**, same component, smaller.
- **Quick-filter chips**: the two or three narrowings people actually use, one
  tap each. Services: Preço fixo, Em tua casa, Até 1 000 MZN. Providers:
  Verificados, 4,5 ou mais, Uma pessoa, Um estabelecimento.
- **Hairline rows** with a 116px square photo, four per screen against today's
  one. The whole row is the tap target.
- **One floating navy control** at the thumb: Filtros · n / Ordenar on services,
  Filtros / Mapa on providers. It replaces the full-width bottom bar.
- **A filter sheet** holding every group: chip rows, a price range with two
  numeric fields, a verified switch, and a footer button that states the
  outcome — "Ver 38 serviços" — because a filter sheet that says "Apply" makes
  you tap to find out what you did.

`closeOnChoice` is kept as it is: a sheet closes on a link or a submit, never on
the click that puts the cursor in the price field.

## Provider map — phase two, not in this spec

The mockup draws a `Lista | Mapa` toggle, price pins, and a card for the chosen
pin. It is drawn so the shape can be judged, and it is **not built here**:
providers carry `city`, `district` and `country`, never a point. Geocoding at
save time, or a pin picker in provider settings, is its own piece of work with
its own spec. The toggle does not ship until it does.

## API additions

Kept to what the design cannot honestly render without.

### 1. `services` on `providerPublicReadModel` — required

```ts
services: z.array(z.object({
  name: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  pricingMode: z.string(),
})).max(3)
```

The public provider model carries `serviceCount` and the cheapest price, and
nothing about the services themselves. Capped at **three server-side**, ordered
cheapest first so the chips agree with the `desde` price beside them; `+n` is
`serviceCount − services.length`.

Built the way `provider-public.repository.ts` already builds its category list:
a second query over the page's provider ids, attached in memory — not a fourth
pre-aggregated CTE, and not a correlated `sql` subquery, which that file's own
comment records as the approach that does not work with drizzle.

A quote-priced service has no amount; it is skipped rather than sent as zero.

### 2. Two counts for the subtitle — optional, or the copy drops them

The mockup writes "96 serviços, **de 41 prestadores**" and "64 negócios, **41
verificados pela Ntizo**". Neither number exists: `servicePageReadModel` and
`providerPageReadModel` carry `total` only. **Unless a distinct-provider count
and a verified count are added to those models, the subtitle is the count plus
the existing scope clause, and the second clause is not written.** This spec
takes the second option; the first is a small, separate change.

### 3. `verified` on `listServices` — optional, or the pill is dropped

The mockup's services toolbar has a "Verificados" pill. `listServices` filters
on category, locationType, paymentMode, providerType, language, city, price and
`q` — there is no verified argument, though `serviceReadModel` already returns
`providerVerified`. **This spec drops the pill from `/services`** and keeps it on
`/providers`, where the filter exists. Adding it is a one-argument change if
wanted.

## Deviations from the mockup

Each is a correction, and each is cheap to revert if you would rather have the
mockup exactly.

1. **The rating moves off the title line onto the provider line.** In the mockup
   a star and a number sit beside the service's name, which reads as the
   *service's* rating. There is no per-service rating in this product — the
   number is the provider's, across everything they offer. Beside the provider's
   name it is true; beside the service's name it is a claim the data does not
   support. The `aria-label` says whose it is.
2. **No heart on the tile.** Favourites is a plan
   (`docs/superpowers/plans/2026-08-27-favourites.md`), not a feature —
   `/favourites` is still `placeholder-pages`. The tile keeps a slot that
   renders nothing and collapses without leaving a gap.
3. **"de 41 prestadores" and "41 verificados" are dropped** from the subtitles.
   See API §2.
4. **"Verificados" is dropped from the services toolbar.** See API §3.
5. **"Hoje" is dropped from the mobile quick filters.** It is availability, and
   there is no availability read model behind a list. The mockup labels it as a
   placeholder; it does not ship.

## Files

**Deleted** — every consumer is one of the two pages or their cards, verified by
grep:

- `shared/components/browse/browse-hero.tsx` (hero, search card, search field)
- `shared/components/browse/price-stub.tsx` (stub, notches, `stubCtaClass`)
- `shared/components/browse/listing-card.tsx` (`ListingCard`, `ListingTag`)
- `shared/components/browse/results-bar.tsx` (the heading absorbs it)
- `shared/components/browse/active-filter-chips.tsx` (the pills absorb it)
- `shared/components/browse/mobile-search-sheet.tsx` (the UI kit's `Sheet` is used directly)
- `shared/components/browse/listing-media.tsx` — its two consumers are the two
  cards being rewritten; the photo and its empty state move into `result-tile`
  and `brand-tile`
- `features/directory/services/domain/service-stub.ts` and its test —
  `serviceStubParts` exists to feed `PriceStub`'s eyebrow, `under` and CTA
  variant, and the tile has none of those. **It is not read by the detail
  page's rail** (checked: its only non-test consumer is
  `service-listing-card.tsx`). It is superseded by `servicePriceLine` in
  `service-card.ts`, which returns the amount and the one meta phrase beside it
  from the same `servicePriceCell` branches
- `FacetPanel` from `facet-panel.tsx` (the sidebar); `facetOptionClass`,
  `FacetBox`, `FacetCount` and `closeOnChoice` stay and are used by the popovers
  and the sheet

**New**, under `shared/components/browse/`:

| file | holds |
|---|---|
| `search-pill.tsx` | the header's two-field search, and its mobile sheet |
| `category-strip.tsx` | icon-over-label strip (supersedes `category-rail.tsx`) |
| `filter-pill.tsx` | the `<details>` popover, and the applied/× state |
| `filter-sheet.tsx` | the phone's full filter sheet with its outcome button |
| `quick-chips.tsx` | the phone's one-tap chips |
| `result-tile.tsx` | photo + three lines, with the empty-photo state |
| `result-row.tsx` | the provider row shell |
| `brand-tile.tsx` | the navy + tie + initials placeholder, shared by both |
| `floating-controls.tsx` | the phone's navy Filtros/Ordenar control |

**Kept:** `pager.tsx` and `domain/page-numbers.ts` (restyled to pill numbers),
`sort-dropdown.tsx` (restyled trigger), `active-match.ts`.

**Rewritten:** `services-browse-page.tsx`, `directory-page.tsx`,
`service-listing-card.tsx` → the tile's call site, `provider-listing-card.tsx` →
the row's call site, `service-facets.tsx` and `provider-facets.tsx` → the pill
and sheet contents. Both cards' private `formatPrice` twins are dropped for the
domain's `formatHeadlinePrice`, which is the same function written three times
today.

**Unchanged:** `browse-search.ts`, `directory-search.ts`, `browse-chips.ts`,
`directory-chips.ts`, the viewmodels, the repositories, and every route file
except the two that render these pages. `service-card.ts` gains
`servicePriceLine` and loses nothing.

`browse-chips.ts` and `directory-chips.ts` are kept although the chip row is
gone: the pills need exactly what those functions already enumerate — which
filters are on, and the URL that removes each — and `ClearAll` still asks them
whether anything is on at all.

## Testing

- **Component tests** for each new component, replacing the suites of the files
  they supersede. The four that must exist because they encode a rule rather
  than a look: the empty-photo tile draws initials and no `<img>`; a quote price
  renders words, not `0 MZN`; an applied filter pill's `×` links to the same URL
  minus exactly that parameter; the provider row renders at most three service
  chips and a `+n` that matches `serviceCount`.
- **Page tests**, rewritten from the existing `services-browse-page.test.tsx`
  and `directory-page.test.tsx`: the heading reads the term when one is typed
  and the category when one is chosen; the count is `total`, not `items.length`;
  an empty narrowed result says "nothing matches" and an empty platform says
  "nothing published yet".
- **Locale parity** stays enforced by
  `shared/locales/__tests__/locales.test.ts`: every new `directory` key exists in
  all eight locales, pt-MZ authored from the mockup and the rest written as their
  own language.
- **A11y checks in the component tests**: the tile has exactly one link, the
  chevron and the strip's arrows are `aria-hidden` and out of the tab order, and
  the popover is reachable and closable by keyboard.
- **Backend**: `provider-public.repository.ts` gets a test for the three-service
  cap, the cheapest-first order, and a provider whose only service is
  quote-priced (empty array, not a zero).

## Not in this spec

| deferred | trigger |
|---|---|
| Provider map | provider coordinates exist |
| Favourites heart | the favourites feature ships |
| Availability chips ("Hoje", "Vaga às 15:30") | an availability read model a list can read |
| Response time, "contratado n vezes" | the aggregates exist |
| `verified` filter on `/services`, subtitle counts | a decision to add them |
