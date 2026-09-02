# Detail pages redesign — provider and service — Design

**Goal:** `/providers/$slug` and `/services/$id` are the last two customer
surfaces still reading as scaffolding. The provider page is a horizontal hero
over three stacked sections with no rail and no price; the service page has a
rail but the two pages share no vocabulary — different galleries, different
review treatment, different idea of where a price lives. This gives both the
same shape: a collage gallery, a title block, a row of facts between hairlines,
the content, and one sticky rail that carries the price and the way to act.

The visual target is the mockup committed beside this file
(`2026-08-28-detail-pages-redesign.mockup.html`), approved on 2026-08-28. It
opens on the provider page; the bar at the top switches to the service page.

## The thesis, unchanged

Ntizo sells **certainty** — a price and a duration fixed before you commit.
Everything below either states a fact the platform actually checked or says
nothing. That constraint is what shaped the redesign more than the mockup did,
and the section "What the mockup asked for and does not exist" is the load
bearing part of this document.

## What is being replaced

| | `/providers/$slug` today | `/services/$id` today |
|---|---|---|
| Photos | `ProviderPortfolio`, a 5-tile grid halfway down | `ServiceGallery`, one image over a thumbnail strip |
| Head | logo + name + rating + description, one row | title, rating, place, description in a bordered box |
| Facts | none | none |
| Price | nowhere on the page | `PackageChooser`, in the rail |
| Services | 4-across grid of image cards | n/a |
| Options | n/a | radio list inside the rail |
| Reviews | score card + bordered list | the same component, with a qualifying line |
| Rail | none | `PackageChooser` + availability button + provider card |
| Contact | button beside the `h1` | two disabled buttons in the chooser |

## What the mockup asked for and does not exist

Verified against the schema and the write paths, not assumed. Each of these is
**out of scope** and must not appear in the built pages.

| Asked for | Why it is not built |
|---|---|
| "Responde em cerca de 2 horas" | Nothing measures response time. There is no column, no event, and no derivation from the messaging context that would not be a guess. |
| `IDIOMAS` | No column anywhere records a language a person speaks. The services browse's language filter filters the language a *listing* is written in, which is a different fact. Adding it is a provider-profile feature with a write side and a settings screen — its own spec. |
| "Pedir marcação" / "Reservar" | The Booking context does not exist. `ntizo_booking.booking` is a placeholder table with `id`, `customer_id`, `status`, `created_at` and nothing else. `PackageChooser` already renders a disabled book button with `packageBookingsClosed` beside it; that honesty is kept. |
| "Cancelamento gratuito até 6 horas antes" | No cancellation policy is implemented. Printing it is a promise nobody can keep. |
| "Pagamento retido até o serviço estar concluído" | No escrow, no payment capture. Same reason. |
| Service name under each review (`Avaria eléctrica urgente · Julho 2026`) | `review.booking_id` is the only path to a service, and the booking row carries no `service_id`. On top of that `OpenReviewEligibilityAdapter` returns `{ allowed: true, bookingId: null }` unconditionally, so no existing review has a booking at all. The review sub-line is the date alone. |

**Trigger for revisiting:** the first three return when the Booking context
ships. The review sub-line returns when `booking` gains `service_id`. Languages
and response time need new provider-profile fields and are not blocked by
anything here.

## Data: three new fields, on a detail-only read model

`providerPublicReadModel` is shared by `provider.list` and `provider.bySlug`.
The directory asks for 24 providers at a time; it needs none of what follows.
So the three fields land on a new model that extends it:

```
providerPublicDetailReadModel = providerPublicReadModel.extend({
  memberSince,           // string | null — ISO year-month, e.g. "2025-03"
  serviceLocationTypes,  // string[] — distinct, from published services
  weeklyHours,           // WeeklyHours[] — 7 entries, weekday 0..6
})
```

This is the same reasoning `serviceDetailReadModel` already records for not
adding option lists to `serviceReadModel`. `provider.bySlug`'s output schema
changes to `providerPublicDetailReadModel.nullable()`; `provider.list` is
untouched.

`weeklyHours` shape:

```
{ weekday: 0..6, intervals: [{ startMinute, endMinute }] }
```

### Where each field comes from

**`memberSince`** — `provider.created_at`, truncated to year and month. Never
the day: the exact date a business registered is not something a customer needs
and not something the business chose to publish. Null is impossible in practice
(the column is `notNull`) but the model allows it so a future backfill cannot
force a lie.

**`serviceLocationTypes`** — `select distinct location_type from service where
provider_id = ? and status = 'published'`. A new aggregate beside `services`,
`prices` and `verified` in `DrizzleProviderPublicRepository.aggregates()`,
following that function's existing shape. Derived from published services for
the same reason `categories` already is: a provider who *says* they travel but
publishes only at-provider services would otherwise claim something they do not
sell. The UI renders the translated labels joined by `·`, all of them: there are
only four possible values and the cell wraps. An earlier draft collapsed three
or more into `filterWhereOption.flexible`, which is wrong — `flexible` is one
of the four location types, not a word for "several", and a provider who
travels *and* receives would have been relabelled as one who does neither
specifically.

**`weeklyHours`** — from `ntizo_scheduling.member_availability`, which is keyed
`(provider_id, member_id, weekday, start_minute, end_minute)`.

The rules are per **member**, and the card speaks for the **business**. For an
individual provider there is one member and the reading is direct. For an
organization running shifts, `min(start_minute)`–`max(end_minute)` would report
a business open 08:00–20:00 when it is really open 08:00–12:00 and 16:00–20:00.
So the projection takes the **union** of every member's intervals for that
weekday, merges the ones that touch or overlap, and returns the survivors in
order. A weekday with no rules returns an empty `intervals` array, which the UI
renders as closed.

The merge is a pure function (`mergeIntervals(intervals) -> intervals`) sitting
beside the projection with its own unit tests: sorted by start, folded while
`next.start <= current.end`. Adjacent intervals (`end === next.start`) merge;
this is the case that makes a 08:00–12:00 / 12:00–18:00 two-member roster read
as one working day rather than two.

**Date exceptions and closures are deliberately excluded.** `member_availability_exception`
and the closure rows are date-specific, and a weekly card that folded them in
would be answering a question it was not asked ("is this Tuesday open?") with
data shaped for another ("what are the usual hours?"). The card is labelled
"horário habitual" and its footnote sends the reader to the calendar, which is
the surface that already answers per-date correctly.

### Files

| File | Change |
|---|---|
| `packages/shared/src/read-models/public/provider-public.schema.ts` | add `weeklyHoursReadModel`, `providerPublicDetailReadModel`, exported types |
| `.../public/provider/app/ports/inbound/index.ts` | `GetPublicProviderPort` returns the detail DTO |
| `.../public/provider/app/ports/outbound/provider-public.repository.port.ts` | `findActiveBySlug` returns the detail DTO |
| `.../public/provider/app/use-cases/get-public-provider.projection.ts` | pass the new fields through; `mergeIntervals` lives beside it |
| `.../public/provider/infra/repositories/drizzle/provider-public.repository.ts` | location-type aggregate, `created_at` column, weekly-hours query |
| `.../public/provider/graphql/schema/queries.ts` | `getPublicProvider` output schema |
| `.../public/provider/__tests__/public-provider.test.ts` | extend the fixture DTO and the fake repository |

The service page needs the same hours for the same provider. It reads them
through the existing `provider.bySlug` query using `service.providerSlug`,
which `ServiceDetailDTO` already carries — no second backend field, no
duplicated projection.

That second query pays for more than the hours. `ServiceDetailDTO` carries no
`verified`, no `ratingAverage` and no `reviewCount` — the gap
`toAvailabilityService` documents today, where it hardcodes `providerVerified:
false` because there is nothing truthful to read. With `provider.bySlug` in
hand the service page can render the verification bullet from the same fact the
provider page does, and that hardcoded `false` stops being a lie the page
happens not to display.

## The pages

Shared column geometry, both pages: gallery full width, then
`grid-template-columns: minmax(0,1fr) 22rem` with `2.5rem` gap, rail sticky at
`top: 100px` (the header is 84px and sticky). Below `lg` the rail unstacks
under the content. This matches the service page's existing
`lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]`, so the measurement is not new.

### New shared components — `features/directory/ui/`

| Component | Responsibility |
|---|---|
| `DetailGallery` | the collage: one large tile, two stacked, a "Ver as N fotos" button that opens a dialog with every photo. Absorbs `ProviderPortfolio`'s grid as the dialog's body. Renders nothing with no photos; renders a single full-width tile with one. |
| `DetailFacts` | the `dl` between hairlines — up to four `{ label, value }` pairs, two columns on a phone |
| `RailCard` | the rail's card shell: optional uppercase label, body, optional trust list |
| `WeeklyHoursCard` | the availability card, from `weeklyHours` |
| `TrustList` | the green-check bullets, so the two pages cannot drift on which claims they make |

### New domain — `features/directory/domain/`

| Module | Function |
|---|---|
| `weekly-hours.ts` | `groupWeekdays(hours, locale)` — folds consecutive weekdays with identical intervals into one row ("Segunda a sexta"), leaves the rest alone, formats minutes as `HH:MM` and empty days as closed. Pure, locale-aware, unit-tested. |
| `member-since.ts` | `"2025-03"` → "Março 2025" in the reader's language, via `Intl.DateTimeFormat` with `{ month: "long", year: "numeric" }` |

Both are pure functions in `domain/` rather than inline in the components,
because the weekday folding has real edge cases (Tue–Thu identical with Mon and
Fri different; every day different; every day closed) and those deserve tests
that do not mount React.

### Provider page

```
breadcrumb   Prestadores / Electricidade / Hélder Cossa
gallery      [ main ][ two stacked + "Ver as 8 fotos" ]      full width
─────────────────────────────────────────────────────────────────────
eyebrow      Individual · Electricidade            │  RAIL (sticky)
h1           Hélder Cossa                          │  1200 MZN a partir de
meta         ★ 4,8 · 4 avaliações · Sommerschield  │  o mais barato de N
facts        Categoria · Onde atende ·             │  [Enviar mensagem]
             Serviços · Na Ntizo desde             │  [Ver serviços] → #servicos
Sobre                                              │  ✓ documentos verificados
Serviços     rows: thumb, name, desc, meta,        │  ✓ mensagens ficam na Ntizo
             price, CTA                            │
Avaliações   score + histogram + list              │  DISPONIBILIDADE card
```

`ProviderHero` shrinks to the eyebrow / `h1` / meta / facts block and loses its
message button — the button moves into the rail, where the price is. That is a
move, not a deletion: `MessageProviderButton` keeps its unauthenticated
redirect effect and its error handling verbatim, and its doc comment moves with
it.

`ProviderPortfolio` is deleted as a section. Its grid survives as the body of
`DetailGallery`'s dialog, which is where "see all 8 photos" was always going to
land. Its own file and any test go with it.

`ProviderServicesSection` swaps the 4-across card grid for `ServiceRow`s. The
existing doc comment argues for four across on the grounds that two columns of
a 4:3 photo push the catalogue below the fold; rows are the same argument taken
further, and that comment is rewritten rather than left contradicting the code.

`ServiceRow` — `grid-template-columns: 112px minmax(0,1fr) auto`:
thumbnail, then name / description / meta, then price and CTA right-aligned.
Below `sm` the thumbnail narrows to 72px and the price column wraps under the
body. The meta line is `duration · location · pricing mode`, with the pricing
mode in `--color-success`. A `quote` service prints "Sob orçamento" where the
price goes and gets an outline CTA instead of the filled one, because it is a
different action.

### Service page

Same skeleton. Facts are `Duração · Onde atende · Modo de preço · Categoria`.

`PackageChooser` splits:

- **`ServiceOptions`** (body) — the radio rows, one per option, showing name,
  duration/scope and price. This is the mockup's "Opções" section. Rendered
  only when there is more than one option; a single-option service says its
  price once, in the rail.
- **`RailPriceSummary`** (rail) — the selected option's price, the `bookingTotal`
  breakdown (service, 10% Ntizo fee, total) and the buttons.

Selection state lifts to `ServiceDetailPage` so the body and the rail cannot
disagree about which option is chosen. `bookingTotal` and
`NTIZO_COMMISSION_RATE` are untouched; the rail renders what the chooser
rendered before.

The rail's primary button stays `availabilityCheckAction` — the control that
works today. The `packageBookingsClosed` sentence follows it. `ServiceQuoteNotice`
and `ServicePackagesUnavailable` keep their existing places in the rail for the
`quote` and `unavailable` branches of `serviceDetailPanel`, which is unchanged.

`ServiceProviderCard` moves below the availability card in the rail.
`ServiceGallery` is deleted in favour of `DetailGallery`.

### Reviews, both pages

`ProviderReviews` is rewritten to the mockup's shape: the score, its stars and
the count on the left of a tinted panel, the histogram on the right, then the
comments as hairline-separated rows rather than bordered cards. The histogram
bars become `--color-foreground` rather than `--color-warning`, so the stars
stay the only gold on the page and the bars read as quantity.

**"Ver todas as avaliações" is real.** The reviews query already takes `limit`
(capped at 50) and `offset`. The button appears only when
`summary.count > reviews.length`, and clicking it refetches at the higher
limit. Beyond 50 the existing `reviewsShowing` sentence remains, unchanged and
still true.

The review sub-line is the date alone — see the table above.

## What each rail claims

Exactly two bullets, identical wording on both pages, from `TrustList`:

1. "Documento de identidade e certificação profissional verificados pela
   Ntizo." — rendered **only when `verified` is true**. The flag means an
   administrator accepted at least one document, which is the fact the sentence
   states.
2. Provider page: "As mensagens ficam guardadas na Ntizo, por isso o que for
   combinado fica escrito." Service page: "O total já inclui a taxa de serviço.
   Não há custos acrescentados depois."

Both are true today. Nothing else goes in this list without a fact behind it.

## i18n

Eight locales — `pt-MZ`, `pt-PT`, `en-US`, `es-ES`, `fr-FR`, `de-DE`, `it-IT`,
`nl-NL` — in the `directory` namespace. Roughly twenty new keys: the fact
labels, the gallery's "Ver as N fotos" (pluralised), the availability card's
label, weekday names and "Fechado", the rail's price caption and trust
sentences, the service row's quote CTA, and the reviews' "see all" button.
Weekday names come from `Intl`, not from translation keys — eight hand-written
copies of Monday is eight chances to disagree with the date the calendar
renders.

Every key lands in all eight files in the same change. A missing key falls back
to the key name, which ships an English identifier into a Portuguese page.

## Testing

**Domain (vitest, no DOM)**
- `mergeIntervals`: disjoint, overlapping, adjacent (`end === next.start`),
  fully contained, single, empty.
- `groupWeekdays`: all seven identical; Mon–Fri identical with a different
  Saturday and a closed Sunday; every day different; every day closed;
  a day with two intervals.
- `memberSince`: formats in each of two locales; rejects a malformed value.

**Backend**
- `get-public-provider.projection` returns the three new fields.
- The repository's location-type aggregate ignores unpublished services.
- The weekly-hours query unions two members' rules for the same weekday.

**UI (testing-library)**
- Provider page renders with: no photos, no reviews, no configured hours, a
  provider with one service, a provider with only a quote service.
- Service page renders with: one option, several options, a quote service, a
  priced service with no active options.
- Selecting an option in the body updates the rail's total.
- The trust bullet is absent when `verified` is false.
- "Ver todas as avaliações" appears only when there are more than are shown,
  and refetching adds them.

**e2e** — the existing harness covers the two routes; extend the provider
journey to assert the rail's price and the availability card.

## Explicitly out of scope

Booking, payments, cancellation policy, languages, response time, per-service
reviews, review paging beyond 50, and any change to `/services` or
`/providers` browse. `ServiceCard` stays exactly as it is — it is the browse's
component, not this page's.
