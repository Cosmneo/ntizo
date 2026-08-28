# Customer listings redesign — Design

**Goal:** `/services` and `/providers` are the two surfaces a customer meets
before they ever meet a booking, and both currently read as scaffolding: a
white page of white cards outlined in grey, no page head, no way to see or
clear an active filter, and paging that offers only "previous" and "next".
This replaces both with one designed browse — shared shell, list rows on the
desktop, stacked cards on the phone — and adds the smallest set of API fields
that design honestly needs.

Favourites ships with it. The heart on a card is not decoration, so the feature
behind it is built rather than faked.

## The thesis

What Ntizo sells is **certainty**: a price and a duration fixed before you
commit, in a market where the norm is to negotiate on the doorstep. Everything
below serves that, and the one place the design spends boldness — the price
rail drawn as a ticket stub — says it structurally rather than in a caption.

## What is being replaced

| | `/services` today | `/providers` today |
|---|---|---|
| Page head | none — the category band, then results | `h1` + subtitle inside the content column |
| Search | in the filter sidebar | in the filter sidebar |
| Categories | full-bleed band, Lucide icon over a label | same, separate component |
| Filters | chips in a tinted card | chips in a tinted card |
| Sort | two text links | dropdown menu, five options |
| Results | 2/3/4-column grid of cards | 2/3-column grid of cards |
| Count | `items.length` (wrong past a full page) | `total` (correct) |
| Paging | previous / next | previous / next |
| Active filters | not shown, not clearable | not shown, not clearable |

The two pages are meant to be twins and have already drifted — different sort
controls, different card shapes, two copies of the same category band. The
redesign shares the shell so the next change cannot re-open that gap.

## Approach: shared shell, per-page composition

New shared components under `apps/frontend/web/src/shared/components/browse/`:

| Component | Responsibility |
|---|---|
| `BrowseHero` | tinted band, halo, `h1`, subtitle, kicker, slot for the search card |
| `BrowseSearchCard` | the segmented search card that straddles the hero's bottom edge |
| `CategoryRail` | horizontally scrolling pills, edge fades, desktop arrows, sticky |
| `FacetPanel` / `FacetGroup` / `FacetOption` | the sidebar: heading, hairline groups, checkbox-styled links, optional counts |
| `ResultsBar` | count sentence + segmented sort pills |
| `ActiveFilterChips` | one chip per narrowing, each removing only itself, plus "clear all" |
| `ListingCard` | the card shell: `media` / `body` / `stub` slots, hover lift, whole-card link |
| `ListingMedia` | photo, generated placeholder, favourite button, badge slot |
| `PriceStub` | the ticket stub — dashed rule, notches, rating, price block, CTA |
| `Pager` | numbered paging derived from `total` and the page size |

Each page keeps its own typed search model (`BrowseSearch`, `DirectorySearch`),
its own filter links, and its own route-typed `Link`s. Only the shells are
shared. A single generic `<BrowseLayout>` driven by config was considered and
rejected: it erases TanStack Router's typed `search` and turns every future
divergence between the pages into an `if` inside a shared file.

`FilterPanelCard` in `shared/components/filter-panel.tsx` is superseded by
`FacetPanel` and should be deleted, not left beside it.

## The card

Desktop grid: `[238px] [minmax(0,1fr)] [196px]`, 16px padding, 22px gap.

```
┌────────────────────────────────────────────────────────────────┐
│ ┌──────────┐  45 min · Vaga hoje às 15:30 ┊    ★ 4,7 (6)       │
│ │  FOTO  ♡ │  Corte de cabelo com barba   ┊   PREÇO FIXO       │
│ │   4:3    │  por Estúdio Mavalane        ┊   800 MZN          │
│ │          │  [Beleza] [Em casa] [✓Verif.]┊  [  Reservar →  ]  │
│ └──────────┘                              ┊                    │
└────────────────────────────────────────────────────────────────┘
```

**The stub is the signature.** A 1.5px dashed rule in `--color-border-strong`
separates the price rail, and a 12px circle in the page ground, ringed by a
1px `--color-border`, sits on that rule at each card edge — a punched
perforation. It appears on every card, it is structural rather than applied,
and it says the listing is a committed offer.

The notch is only readable because the page ground and the card are different
colours. This is the same reason the whole page moves onto a tinted ground:
white now means "an object you can act on" — header, search card, result card
— and nothing else on the page is white.

**One link, two buttons.** The card is not a link. The title carries an
`::after` spanning the card, and the favourite button and the CTA sit above it
with `position: relative`. That gives a keyboard reader a single tab stop for
the destination while the two real controls stay operable — a card wrapped in
an anchor cannot contain either.

**The placeholder is generated, not grey.** No photo falls back to a tile whose
hue is derived deterministically from the category code, carrying that
category's Lucide icon at low opacity and the provider's initials. Most
listings have no photograph; a column of identical grey rectangles reads as a
broken page, a column of different tiles reads as a catalogue.

**`items-start`, never stretch.** A stretched card puts its slack inside itself
as a band of empty white under the last line. The space belongs between cards.

### What each page's card says

A service card sells one job: duration, name, provider, category, location
type, verification, price with its mode, and **Reservar**. A provider card is a
business somebody is deciding whether to trust: type and place, name,
description clamped to two lines, categories, service count, verification,
"a partir de" price, and **Ver negócio** — you do not book a business, you open
it.

## API additions

Kept to what the design cannot honestly render without.

### 1. `total` on `servicePageReadModel`

`serviceAll` returns only `nextOffset`. The results sentence therefore counts
the array, which tells somebody with 40 matches that they have 24, and numbered
paging is impossible. Adding `total` also serves the provider page, which reads
the same model.

### 2. `sort: "price"` on `listServices`

The sort pills read *Sugeridos · Mais recentes · Preço*. The enum today is
`"default" | "newest"`. Ordering is on the same `fromAmountMinor` the card
prints and the price filter matches, so a service can never sort into a
position its visible price contradicts. Services with no price (`quote`) sort
last, never as zero — and the `NULLS LAST` is written out rather than left to
Postgres's default, because that default is `NULLS LAST` for `ASC` and
`NULLS FIRST` for `DESC`: a later "most expensive first" order would otherwise
move every unpriced service silently to the top.

### 3. `city` filter and a `serviceCities` facet

The hero's second field is a city, and `listServices` has no such argument. The
directory already establishes the pattern exactly: `providerCities` returns
`{ city, count }`, unkeyed on the current filters so a chosen city can always be
un-chosen. `serviceCities` mirrors it, and `listServices` gains
`city: z.string().min(1).max(120).optional()`.

**It filters on the provider's city, resolved through the join that already
supplies `providerName`** — a service carries a `locationType`, never a place of
its own. That is right for `at_provider` and `at_customer` work, where the
business's city is what a customer means by "in Maputo". It is *wrong* for
`remote`, which has no geography at all: a remote service must not be excluded
by a city filter, or "Maputo" silently hides every online listing. Remote
services therefore always match a city filter, and the filter's label must not
promise otherwise.

### 4. `providerRatingAverage` / `providerReviewCount` on `serviceReadModel`

The card shows stars. There is no per-service rating and this spec does not
create one — that is a Review→Catalog aggregation, a separate piece of work.
What exists is the provider's score, reachable through the join already in
place. The card labels it as the provider's, so it claims nothing false.

Both nullable, and null means "nobody has reviewed this business" — the card
then draws no stars at all. Zero is a score a person could have given, and
rendering it for an unreviewed business calls it the worst on the platform.

### Deliberately not added

- **Facet counts on every group.** Only cities carry counts, because only
  cities have them. `FacetOption` takes an optional count and every group
  reads identically without one. A general facet aggregation is its own spec.
- **Per-service ratings**, **cancellation policy**, **duration filter**,
  **availability ("Vaga hoje às 15:30")**, **"Mais reservado" / "Urgências"
  badges.** All appear in the approved mockup as slots. The components accept
  the props; the pages pass nothing until the data exists. Slots that render
  nothing must collapse without leaving a gap — assert this.
## Favourites, and the lists they go into

Its own bounded context, `favourite`, with its own Postgres schema.

A favourite is not a flag on a listing — it is a listing **filed into a named
list**. Everybody gets one list to begin with and can make more, and one
listing can sit in several at once: "Casa nova" and "Urgente" are both true
about the same electrician, and making somebody choose is making them lose one
of the two facts.

### Save first, ask afterwards

Pressing the heart **saves immediately**, into the default list, and only then
opens the dialog that lets the person file it somewhere else. The dialog says
so — "guardado automaticamente" — and its only button is "Concluído".

The alternative, opening a picker before anything is saved, makes the common
case (save it, never think about it again) cost a decision every time, and
loses the save entirely if the person dismisses the dialog. Two mutations
follow from this, one per gesture, rather than one mutation with a mode.

### Schema

`ntizo_favourite`, added to `schemaFilter` in
`packages/backend/src/modules/ntizo/drizzle.config.ts` and re-exported from
`shared/infrastructure/database/schemas.ts`.

```
favourite_list
  id          uuid pk default random
  user_id     text not null
  name        varchar(60)                 -- NULL on the default list; see below
  is_default  boolean not null default false
  created_at  timestamptz not null default now()

  unique (id, user_id)                          -- exists only for the composite FK below
  unique (user_id, lower(name))                 -- two lists with one name are unusable
  unique (user_id) where is_default             -- exactly one default per person
  index  (user_id, created_at desc)

favourite
  id           uuid pk default random
  list_id      uuid not null
  user_id      text not null
  target_type  varchar(16) not null            -- 'service' | 'provider'
  target_id    uuid not null
  created_at   timestamptz not null default now()

  foreign key (list_id, user_id)
    references favourite_list (id, user_id) on delete cascade
  unique (list_id, target_type, target_id)
  index  (list_id, created_at desc)
  index  (user_id, target_type, target_id)
```

**`name` is nullable, and null means "the default list".** Its name is then
rendered from a translated key, so somebody reading in French sees *Favoris*
and somebody in Portuguese sees *Favoritos* — the same list. A stored name
would freeze it in whatever language the account was created in. Renaming the
default writes a name and it stops being translated, which is correct: a list
somebody named is theirs, not the platform's.

**`user_id` is on both tables, and the composite foreign key is why that is
safe.** The hearts query — "which of these twenty-four listings has this person
saved anywhere" — runs on every render of a listing page for a signed-in
reader, and routing it through `favourite_list` puts a join on the hottest read
in the feature. Denormalising is normally two sources of truth that will one
day disagree; `foreign key (list_id, user_id) references favourite_list (id,
user_id)` makes disagreeing impossible at the database level, so this is a
denormalisation with the invariant enforced rather than assumed.

**One table for both target kinds, no foreign key to the target.** A favourite
is the same act whichever listing it lands on, and a list shows both in one
run ordered by when they were saved. The two targets live in different bounded
contexts, so a favourite must not reach across a context boundary at the
database level; a row pointing at something deleted, unpublished, or belonging
to a suspended provider is resolved away on read — the same rule both listings
already apply to their own rows.

### The one list everybody starts with

Created **lazily, on the first save**, not at sign-up: a row for every account
that never saves anything is a table full of nothing.

It is created by `favouriteQuickSave`, which is a mutation, so no query has a
side effect. `favouriteListMine` returns an empty array for somebody who has
never saved, and the page says so rather than inventing a list to show.

The default list can be **renamed but not deleted**. Deleting it would leave
the heart with nowhere to save to; renaming it harms nothing.

### Slices

Following the `activity` precedent, which is the project's small-context shape:

- `bounded-contexts/favourite/` — the `FavouriteList` and `Favourite`
  aggregates, the outbound repository ports and their Drizzle adapters, and the
  commands. Invariants: exactly one default list per person, a name unique
  within a person's lists, and the default list cannot be removed.
- `write/favourite/` — five mutations, on the private (session) schema:

  | Mutation | Gesture |
  |---|---|
  | `favouriteQuickSave(targetType, targetId)` | the heart. Ensures the default list exists, files the listing into it, returns every list the listing is now in |
  | `favouriteSetLists(targetType, targetId, listIds)` | the dialog. Sets **exactly** which lists hold this listing; `[]` unsaves it entirely and empties the heart |
  | `favouriteListCreate(name)` | "criar nova lista", inline in the dialog |
  | `favouriteListRename(id, name)` | allowed on the default |
  | `favouriteListRemove(id)` | refuses the default |

  `setLists` replaces an add/remove pair on purpose. The dialog's natural
  output is "these are the lists it should be in", and a pair of mutations
  would make the client diff two states and send the difference — which is
  where a stale card sends `add` for something already added, gets a conflict,
  and the row flickers.

- `read/favourite/` — four queries, all session-authed and scoped to the
  requester; none accepts a user id:

  | Query | For |
  |---|---|
  | `favouriteListMine` | `/favourites`: every list with its item count and up to four cover images |
  | `favouriteListById(id, locale, limit, cursor)` | `/favourites/$listId`: a page of entries, resolved into the same `ServiceDTO` / `ProviderPublicDTO` the listings already use |
  | `favouriteMarked(targetType, targetIds)` | the hearts. **Takes the ids on screen** and returns which are saved *anywhere* — a reader with two thousand favourites must not ship two thousand ids to draw twenty-four hearts. Bounded to 48, the server's existing page cap |
  | `favouriteListsFor(targetType, targetId)` | the dialog: which lists already hold this one listing |

### The dialog

Two panels above `md`, following the reference the user supplied.

```
┌───────────────────────┬──────────────────────────────────────┐
│ A GUARDAR             │ Guardar numa lista              [×]  │
│                       │ A guardar “Avaria eléctrica urgente” │
│ Avaria eléctrica      │ ┌──────────────────────────────────┐ │
│ urgente               │ │ ⌕  Encontrar uma lista…          │ │
│                       │ └──────────────────────────────────┘ │
│ ⌖ Sommerschield       │ ▣▣  Favoritos          3 itens   (✓) │
│                       │ ▣▣                                   │
│ a partir de 1200 MZN  │ ▣▣  Casa nova          8 itens   ( ) │
│                       │ 🗀   Urgente            0 itens   ( ) │
│ ┌───────────────────┐ │ ┌ + Criar nova lista ──────────────┐ │
│ │      FOTO         │ │ └──────────────────────────────────┘ │
│ └───────────────────┘ ├──────────────────────────────────────┤
│                       │ ✓ Guardado automaticamente  [Concluído]│
└───────────────────────┴──────────────────────────────────────┘
```

- The left panel reuses `ListingMedia`, generated tile included, so a listing
  with no photograph looks deliberate here too.
- Each row's cover is a **2×2 mosaic** of up to four of that list's items,
  falling back to a folder mark when the list is empty. It is what makes a
  column of lists scannable when their names are similar.
- **"Criar nova lista" is inline** — the row becomes a text field and a confirm
  in place. A second dialog stacked on the first is a modal over a modal, and
  the thing being saved disappears behind it.
- The search field appears **only above six lists**. A search box over three
  rows is a control with nothing to do.
- On a phone the left panel drops and the listing is named in the subtitle
  instead; the dialog becomes a bottom sheet.

### On the client

`features/favourites/` with `data/`, `domain/`, `viewmodel/`, `ui/`.

`useFavouriteMarks(targetType, ids)` is called **once per page** with the ids
the results contain and returns a `Set` each card reads — not a hook per card,
which would be one request per card. It is a plain `useQuery`, **not**
`useSuspenseQuery`, and it is the one place on these pages that differs: the
hearts are decoration on a page built to be crawled, and suspending on them
would hold the listing back from a crawler that has no session to read them
with.

`useQuickSave()` and `useSetLists()` mutate optimistically and invalidate the
lists and the marks together.

**Signed out, the heart is still there** and pressing it routes to `/sign-in`
with a return path. Hiding the control teaches nobody the feature exists.
Neither query runs signed out — they are session-authed, and firing them
anonymously trades a wall of 401s for information the page cannot use.

`/favourites` stops rendering `FavouritesPage` from
`features/account/ui/placeholder-pages.tsx` and becomes a grid of list cards;
`/favourites/$listId` shows one list's contents, reusing `ListingCard`. Its
empty state points at `/services`.

## The page head

The hero is a tinted band carrying a kicker, an `h1`, one subtitle line, and
the search card straddling its bottom edge onto the category rail. `SiteHeader`
stays sticky and solid above it.

**The `h1` is built from the active filters**, not hardcoded. "Prestadores em
Moçambique" cements a country into a product built to be multi-region, and a
category-filtered page ranks better under its own name. Composition rules:

| State | `/services` | `/providers` |
|---|---|---|
| nothing | Serviços prontos a reservar | Prestadores verificados |
| category | Serviços de Canalização | Prestadores de Canalização |
| city | Serviços prontos a reservar em Maputo | Prestadores em Maputo |
| both | Serviços de Canalização em Maputo | Prestadores de Canalização em Maputo |

The category's own resolved name is interpolated, never a code. It is used as a
**noun phrase and never inflected** — "Canalizadores" would need an agent noun
per category and per language, and nothing in `category` stores one; "Canalização,
pronta a reservar" would need that name's grammatical gender, which is equally
absent. Every variant above works with the single name the read model returns.

Each case is one whole translated sentence with the name and place interpolated,
not fragments joined at runtime — a language that orders place before trade
cannot be served by concatenation.

**`hero { overflow: hidden }` is the bug to avoid.** The halo wants clipping
and the search card exists to escape the band; the halo must therefore be
sized inside the hero rather than the hero clipping its children. This was hit
and fixed in the approved mockup.

## Mobile

- The hero shrinks; the three-field search card becomes one tappable row that
  opens a full-screen sheet with the same two fields. Three fields inside
  360px is a control nobody completes.
- The category rail and the sort pills scroll horizontally with edge fades.
- Results become the stacked card: 16:10 photo, then the body, then the stub
  turned horizontal with the notches at its left and right ends.
- The existing bottom filter bar and sheet stay, restyled, and the active
  filter chips sit above the first result.

## Tokens

Added to `packages/frontend/src/styles/globals.css`, with `.dark` counterparts.
Nothing existing changes value, so no other surface moves.

```
--color-surface-raised  #eef2f9   the page ground; white becomes "object"
--color-border-strong   #d7dbe3   the stub's perforation, facet checkboxes
--color-primary-deep    #0a4fbd   CTA hover, hero halo
--shadow-xs / --shadow-sm / --shadow-lift / --shadow-float
.type-display           Poppins 600, clamp(30px, 3.6vw, 42px), -0.025em
```

The four shadows replace hand-written `box-shadow` strings. `browse-service-card.tsx`
and `provider-card.tsx` currently carry character-identical copies of both the
resting and the hover shadow — they agree today by transcription, not by
definition, and the redesign multiplies the number of surfaces that have to keep
agreeing.

Prices and durations use `font-variant-numeric: tabular-nums`. A column of
prices that do not align is a column nobody can compare.

## Testing

Behaviour, not markup. The existing suites under
`features/directory/**/__tests__/` are the model.

- **Domain** — `h1` composition for all four filter states on both pages;
  active-filter chip derivation and that removing one keeps the others;
  numbered page derivation from `total` and page size, including the exact
  boundaries (`total` a multiple of the page size, `total` of 0, one page).
- **Cards** — a service with no photo renders the generated placeholder and
  not a broken image; a provider with `ratingAverage: null` renders no stars;
  a `quote` service renders "sob orçamento" and the quiet CTA; every optional
  slot absent leaves no gap.
- **Favourites** — the heart fills before the server answers and reverts on
  failure; a signed out press routes to sign-in with the return path;
  `favouriteMarked` is read once for a page of cards, not once per card;
  unticking every list in the dialog empties the heart; a listing can be in two
  lists at once and the heart stays filled while it is in either.
- **Backend** — `total` matches the count the same filters produce; price sort
  puts unpriced services last and never before a cheaper priced one;
  `serviceCities` counts are unaffected by the current city filter; a second
  `favouriteQuickSave` for the same listing does not create a second row or a
  second default list; `favouriteListRemove` refuses the default; two lists
  cannot share a name within one person and the check ignores case; deleting a
  list deletes its rows and no other list's; and a favourite pointing at an
  unpublished service is omitted from `favouriteListById` rather than erroring.
- **Accessibility** — one tab stop per card for the destination plus the two
  controls; facet links carry `aria-pressed` and their decorative box is
  `aria-hidden`; the sticky mobile bar does not cover the last result.

## Order of work

One spec, but four groups that only depend forwards. The plan should keep them
in this order so each is independently verifiable and nothing is built against
an API that does not exist yet.

1. **Tokens and shells** — `globals.css`, then `shared/components/browse/`
   with their own tests. Nothing on screen changes.
2. **API** — `total`, `sort: "price"`, `city` + `serviceCities`, the two
   provider rating fields. Backend tests pass before a page reads them.
3. **The two pages** — compose the shells, delete `FilterPanelCard`, numbered
   paging, active filter chips, mobile.
4. **Favourites and lists** — two tables, the bounded context, five mutations
   and four queries, then the heart, the save-to-a-list dialog, and the two
   `/favourites` screens.

Group 4 is the only one that can be cut without leaving the product
half-redesigned: until it lands, `ListingMedia` renders no favourite button.
It is large enough to be its own plan, and is —
`docs/superpowers/plans/2026-08-27-favourites.md`.

## Out of scope

The two listing pages and favourites. Not the landing page, not the service
detail page, not the provider detail page, not the provider dashboard, not
admin. The tokens are added such that those surfaces can adopt them later
without being touched now.
