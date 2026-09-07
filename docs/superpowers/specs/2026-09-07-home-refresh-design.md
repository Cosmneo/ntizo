# Home page refresh — Design

**Goal:** `/` is the first page a customer meets, and it is the last surface
still wearing the template the listings shed on 2026-09-06: a generated
gradient hero with a centred slogan, an SVG wave, a tinted ground, bordered
cards, and four placeholder tiles where categories should be. This rebuilds it
on the listings' own rules and, for the first time, puts a price on the home
page.

The approved mockup is `2026-09-07-home-refresh.mockup.html`, beside this file.
Where this spec and the mockup disagree, this spec wins — every disagreement is
listed under "Deviations from the mockup", with its reason.

## The thesis

Ntizo sells **certainty**: a price and a duration fixed before you commit, in a
market where the norm is to negotiate on the doorstep. The deployed home page
never says that. It shows a slogan, then four empty tiles, then three
businesses with no prices on them. The new page says it three times: in the
headline, on eight service tiles that each carry a price, and in three phone
screens that show the money being agreed before anyone knocks on a door.

## What is being replaced

| | today | after |
|---|---|---|
| Header | `SiteHeader overlay`, transparent over the artwork | `SiteHeader providerCta`, solid, with a "Tornar-se prestador" link |
| Hero | `SurfaceArt` gradient, centred slogan, one word in blue, SVG wave | white, navy headline left, search pill, three proofs, three photographs right |
| Ground | `PAGE_TOP` (`#f2f8fe`) behind the whole page | white |
| Categories | 4 tiles, `BrandImage`, no images in the data | 8 photo tiles, `imageUrl`, navy + icon when empty |
| "Serviços populares" | 3 **provider** cards, bordered, shadowed, no price | 8 **service** tiles, borderless, price in navy |
| Tagline | the `h1` | the three step titles under "Como funciona" |
| How it works | did not exist | three phone screens carrying the real flow |
| Providers | the "popular" section, doing double duty | its own section, 3 tiles, the listings' shape |
| Stories | 4 cards, each with a placeholder photo and a gradient caption | 3 reviews as type on hairlines, footers on one baseline |
| Provider call | rounded navy box with two blurred circles | full-width navy band with the brand's tie pattern |

## What this does **not** need

The listings refresh already landed the two things that would otherwise make
this expensive:

- **Figtree is already the site's face.** `packages/frontend/src/styles/globals.css`
  points `--font-display`, `--font-rounded` and `--font-sans` at it.
- **Navy is already a token.** `--color-headline`, `--color-navy-surface` and
  `--color-navy-on` exist and are dark-mode aware.

So this is a page rebuild, not a design-system change.

## The page, section by section

### 1. Header

`SiteHeader` gains **no new variant**. It already has `overlay` and `search`;
the home page simply stops passing `overlay`, which is what put it on the
artwork.

**`overlay` stays in the component.** `become-provider` and the company pages
both pass it, so deleting it would break two surfaces this change has no
business touching.

One addition to the shared component: an opt-in **`providerCta`** boolean that
renders "Tornar-se prestador" as a plain text link in the right-hand cluster,
before the language control, from `lg` up. The provider is the page's second
reader and their only door today is the footer.

It is a prop rather than an always-on link for two reasons. Seven other
surfaces import this header and none of them asked for a new link; and the
`search` variant's right column is already documented as crowded — its own
code carries a `whitespace-nowrap` fix for exactly that. **Only the home page
passes it.**

`SurfaceArt` (`ui/surface-art.tsx`) **stays**: `become-provider-page.tsx`
imports it in five places. Only the landing's own usage goes, along with the
wave, the overlay gradient and `ui/palette.ts`'s page-tint exports.

### 2. Hero

Two columns from `lg`, stacked below it. Left: an `h1` in `--color-headline`,
one sentence naming the trades, the search pill, and three proof lines. Right:
three photographs in a 2×2 grid with the first spanning both rows.

- The search is **`ServiceSearch`**, unchanged, sized up. It already writes one
  submission to `/services` and Enter already works.
- The three proofs are a `<ul>`, each a 20px stroked icon in navy plus a short
  line: fixed price, verified providers, M-Pesa. They are claims the platform
  can support today.
- The photographs are a new `HeroCollage`. Their source is **not yet decided**
  — see "What this needs".

### 3. Categories

Eight square photo tiles at `xl`, four across at `sm`, from
`useCategoryPreview(8)`. Each tile is `imageUrl` over the category name.

**A category with no image draws navy with its own icon in white**, not the
brand tile — `BrandImage`'s fallback repeats one mark across a row and reads as
a broken grid, which is precisely the bug `/` shows on dev today. The icon
comes from the category's `icon` field, which `categoryAll` already returns.

The icon strip (`shared/components/browse/category-strip.tsx`) stays on
`/services`, where it is a filter. On a home page a category is something to
browse, so it gets a picture.

### 4. Serviços populares

Eight `ServiceTile`s — the component `/services` draws, imported unchanged from
`features/directory/services/ui/service-tile.tsx`. One component, one price
treatment, one hover, forever.

The data is a **new query beside the two the landing already owns**:

```ts
// features/landing/data/service.repository.ts
landingServiceQueries.popular(locale, limit)  // serviceAll, limit 8, offset 0, no sort
```

Its own query rather than `browseServicesQueries.page`, for the reason
`landingProviderQueries.popular` and `categoryQueries.preview` both give in
their own comments: the two want different sizes, and sharing a cache entry
would make the home page render whatever the browse had last filtered down to.
No `sort` sends the provider's own arrangement, which is what "Sugeridos"
means on `/services`.

Nothing new on the server. `serviceAll` and `SERVICE_FIELDS` already return
everything `ServiceTile` reads.

### 5. Como funciona

Three columns. Each is a numbered navy marker, the step's word, one sentence,
and then a **phone frame** carrying a real screen:

1. **Encontre** — a category browse: four rows, each a photograph, a name, the
   provider with their rating, and the price with its duration.
2. **Reserve** — the service being booked, a four-day strip with one day
   chosen, the free hours with 09:00 taken and 14:00 chosen, the total, the
   M-Pesa button.
3. **Feito** — the confirmation, the booking, the address and phone number the
   platform reveals at that moment, two actions, the reference, and an empty
   rating ask.

The numbers earn their place: this is a sequence, and the reader needs the
order.

**These are drawn, not screenshotted.** They are markup inside the page, so
they translate, respect dark mode and never go stale against a redesign. They
are also the only bordered objects on the page — a device bezel is an object,
not a card.

Below `lg` **the frame is dropped** and the screen renders borderless under its
sentence. A phone drawn inside a phone is redundant.

### 6. Prestadores verificados

Three provider tiles from `usePopularProviders(3)`, unchanged, redrawn in the
listings' shape: 16:10 photograph, logo badge, name with the verification seal,
trade and district, "desde" price. The section keeps its own heading now that
it no longer has to stand in for services.

### 7. O que dizem os clientes

Three reviews from `useFeaturedReviews(3)`, set as type on a hairline. Per
review: the score actually given, the words, the reviewer, and the business.

**The alignment is the point.** Reviews are different lengths, so the naive
version puts three footers at three different heights, which is what made the
deployed block look unfinished. The card is a flex column and the reviewer
block takes `margin-top: auto`, so the reviewer row and the business row sit on
one baseline across all three columns whatever the quote runs to. The quote
itself is clamped to four lines.

The business row is a link to `/providers/$slug`.

### 8. The provider band

Full width, `--color-navy-surface`, the brand tie pattern
(`packages/docs/assets/Pattern/SVG/Pattern 1.svg`) as an inline SVG background
at 14% opacity, a headline, a paragraph, a white button and a text link, and
three facts on a hairline rail. The page's only dark surface.

`--color-primary` appears **once on the page**, on the search button.

## Deviations from the mockup

1. **The review's business row loses its photograph and its service name.**
   `FeaturedReviewDTO` carries `providerName` and `providerSlug` and neither a
   logo nor the service booked. The row ships as the name plus a chevron. See
   "What this needs" for the alternative.
2. **The hero collage falls back to navy tiles**, with the tie pattern, until
   the company owns photographs. The mockup shows the populated state only.
3. **"Mais procurados" is not built.** It appeared in the first mockup and was
   cut: it needs search logs that do not exist, and four hardcoded terms is a
   guess presented as data.
4. **No scroll-docked search.** The mockup's note floats it as a later nicety;
   it is not in this scope.

## What this needs that the page does not have today

| | what | who |
|---|---|---|
| Blocking | Three photographs for the hero, owned by Ntizo, of listed providers at work in Maputo | the company |
| Non-blocking | Eight category images via the admin form (`imageUrl` exists, none set) | an administrator |
| Optional | `providerLogoUrl` + `serviceName` on `FeaturedReviewDTO`, to restore the review's business row | backend |

The page ships without all three: the collage draws navy, the categories draw
their icons, and the review row draws a name. Each one improves it later
without a redesign.

## Testing

The landing suite (`components/landing-page.test.tsx`) is rewritten alongside
the page, keeping its discipline — every assertion is about a branch on absent
data, because that is what dev actually serves:

- the hero renders its headline, its three proofs and a search that reaches `/services`;
- a category with no `imageUrl` renders its icon, not the brand mark;
- **eight services render with their prices**, and the section is absent when the query returns none;
- a service priced per hour, a "from" price and a quote each render their own line (delegated to `ServiceTile`'s own suite, asserted here only as presence);
- the three flow screens render as static markup with no query behind them;
- a review with a shorter comment still puts its footer on the same row as its neighbours (asserted on the declared style, since jsdom does no layout);
- a review whose author set no name renders "Anónimo", and its rating is the score given, not five stars;
- the footer keeps its six company links and M-Pesa alone.

`site-header.test.tsx` gains two cases: `providerCta` renders the link and
points it at `/become-provider`, and its absence renders nothing — the seven
surfaces that do not pass it must not grow a link.

## Copy

New keys in `landing.json` across all eight locales: the headline, the hero
sentence, three proofs, the categories heading, the services heading and its
blurb, "Como funciona" and its blurb, three step titles and three step
sentences, the two remaining section headings and blurbs, and the band. The
strings inside the three phone screens are illustrative UI, translated with the
rest.

Reviews, provider names and service names are never translated.

## Out of scope

Counts ("500 prestadores"), response times, "reservado N vezes", a city other
than Maputo, and any claim the read models cannot answer.
