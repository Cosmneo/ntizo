# Public service detail page

**Date:** 2026-08-13
**Route:** `/services/$id`
**Status:** design, approved in outline — awaiting spec review

## Why

The browse links every card to `/providers/$slug`. A reader who clicks
"Corte (A, com equipa)" lands on the barbershop and has to find that service
again among the others. There is no page for a service, so the one thing the
browse exists to sell has nowhere to send anybody.

This adds it: the page where a customer decides, picks a package, sees when it
can happen and who would do it.

## Scope boundary

Four of Ntizo's eight bounded contexts exist: `catalog`, `provider`,
`scheduling`, `user`. There is no Booking, Payment, Review or Communication
context. Roughly half of the approved mockup therefore has no data source.

The decision taken (2026-08-13) is to build those sections against **inline
placeholder data with no runtime flag separating it from real data**. The
consequence, stated once here so it is on the record: if this page reaches
production before those contexts exist, invented ratings and review text will
render attributed to real, named providers. Tracked in `follow-ups.md` with
the trigger "before the first real provider is onboarded".

## What is real, and what is not

| Section | Source | Status |
| --- | --- | --- |
| Gallery | `service.imageUrls` | real |
| Title, description | `service.name` / `description` | real |
| Category, location type | `categoryName`, `locationType` | real |
| Duration | option `durationMinutes` / `minMinutes` | real |
| City, district | `provider.city` / `district` | real, needs joining |
| Package chooser | `service_option` | real, **needs public exposure** |
| Ntizo commission (10%) + total | pure calculation | real |
| Date and time picker | `availability.forService` | real, **already built** |
| Provider card: name, logo | `providerPublic` | real |
| Who performs the service | `service_member` | **reverses a decision — see below** |
| Verified badge | — | **omitted**, see below |
| Rating, reviews | — | placeholder |
| "Reservar" | — | placeholder |
| "Falar com o prestador" | — | placeholder |
| Service radius, cancellation policy | — | placeholder |

## Architecture

### Two queries, not one

`serviceById` returns the service, its options, its provider and its
performers. Availability stays on the existing `availability.forService`,
which is windowed by `from`/`to` and refetches as the reader moves through
dates. Folding it into the detail query would refetch the gallery, the
description and the package list every time somebody looked at next week.

### `getService` — new public query

Exported as `getService`, mounted at `service: { byId: getService }`, which the
kit renders as the GraphQL field `serviceById` — the same shape `listServices`
follows to become `serviceAll`.

Mirrors `listServices` in every respect that matters: public tier, no context
schema, locale argument rather than session, the published-AND-provider-active
rule enforced in the projection rather than trusted from the repository.

Returns `null` for a service that is missing, unpublished, or whose provider
is not active. Not an error: those three are indistinguishable to an anonymous
reader by design, and saying which would let anyone probe for unpublished
services by id.

### `servicePublicOptionReadModel` grows a public list

Today the public model carries one `defaultOption`. The package chooser needs
all of them, each with its own translated name — the data exists on
`service_option` and `service_option_translation` and is currently exposed
only to the service's owner.

New `serviceDetailReadModel` rather than widening `serviceReadModel`: the
browse asks for twenty-four services at a time and does not want every option
of each. One model per question.

Option names resolve by the same rule the service's own name follows —
fall back to the service's `sourceLocale`, not the platform default, because
the author is the provider.

### Performers: reversing a documented decision

`member-picker.tsx` currently renders "Profissional 1", "Profissional 2",
and its comment says why: *"rather than inventing a display name the platform
has deliberately not published"*. `availability.forService` publishes
`memberIds` and nothing else about them.

The decision taken (2026-08-13) reverses this: publish each performer's **first
name and photo**. This is not filling a gap — it is overturning a choice made
on purpose, and it publishes personal data about employees who are not the
account holder. Two consequences to carry:

1. `provider-public.schema.ts` warns that additions are one-way: anything
   crawled stays crawled. A member's first name and photo become permanently
   public the moment their employer publishes a service they perform.
2. `MemberPicker`'s comment and its numbered labels must be replaced, not left
   to disagree with the new data.

A provider-side control over this — a member choosing not to be listed — is
out of scope here and belongs with whoever designs the member profile.

**Where the name comes from, and what it crosses.** The chain is
`service_member.memberId` → `provider_member.id` → `provider_member.userId` →
`ntizo_user.profile.firstName` and `.avatarUrl`. That last hop leaves the
Catalog context and reads a table the User context owns.

A read-side projection assembling a view across contexts is normal and is what
read models are for; reaching into another context's tables from a repository
that belongs to Catalog is not. The performer lookup therefore goes behind its
own outbound port on the catalog read side — `PerformerReadPort`, answering
"first name and avatar for these member ids" — implemented by an adapter that
owns the join. The projection depends on the port, never on `profile`.

`displayName` is deliberately not used: it is the name a person chose for
themselves across the product, and it can be anything. `firstName` is the
narrower, more predictable field, and the one that matches what was approved —
a first name, not a full identity.

### The verified badge is omitted, not placeholdered

The mockup puts a green tick beside the provider's name.
`providerPublicReadModel` carries no verification status, and the two ways to
get one are both wrong here.

Publishing `verificationStatus` is another one-way disclosure and was not among
the decisions taken — it says something about a business's standing with the
platform, and what a tick is understood to promise is a question for whoever
owns trust and safety, not a field to add in passing.

Faking it is worse than the ratings are. An invented rating is an invented
opinion; an invented verification tick is the platform itself vouching for a
business it has not checked. The badge is left out until there is a real
answer behind it.

## Composition

```
routes/services.$id.tsx          route, loader prefetch, ssr: true
features/directory/services/
  data/service-detail.repository.ts     serviceById query
  viewmodel/use-service-detail.ts       useSuspenseQuery + prefetch
  domain/booking-total.ts               package + commission = total
  domain/__tests__/booking-total.test.ts
  ui/service-detail-page.tsx            composition only
  ui/service-gallery.tsx
  ui/package-chooser.tsx                radio list + total + Reservar
  ui/service-provider-card.tsx
  ui/service-performers.tsx             names and photos
  ui/service-detail-placeholders.tsx    ratings, reviews, radius, policy
```

Backend:

```
bounded-contexts/catalog/app/ports/outbound/performer-read.port.ts
bounded-contexts/catalog/infrastructure/repositories/drizzle/
  performer-read.repository.ts          owns the cross-context join
  service-read.repository.ts            +getPublishedById
public/catalog/app/use-cases/get-service.projection.ts
public/catalog/graphql/schema/queries.ts      +getService
public/catalog/graphql/handlers/arg-mappers.ts +mapGetServiceInput
```

The arg mapper is not optional bookkeeping. `arg-mappers.ts` records that
`locationType` and `sort` both shipped doing nothing because they were added to
the GraphQL schema and not to the mapper — validation accepted them, the mapper
dropped them, and the page read as having no matching data rather than as
broken. A new query gets a mapper and a test for it on the same day.

`ui/` composes; the arithmetic lives in `domain/booking-total.ts` and is unit
tested. The commission is 10% of the package price, charged to the customer,
and the provider receives the full price — the permanent model recorded in
`project_payment_model`. Money is integer minor units throughout; a percentage
of a float is how a total ends in `550.0000000001`.

Availability reuses `AvailabilitySheet`, `DateStrip`, `TimeGrid` and
`MemberPicker` unchanged apart from the picker's labels. Nothing new is written
for the calendar.

## Testing

- `booking-total.ts` — commission rounding at awkward amounts, zero, and the
  largest amount the schema admits. Rounding is the thing that silently costs
  somebody money.
- `getService` projection — returns null for unpublished, for inactive
  provider, and for missing; resolves option names by `sourceLocale` fallback.
- Repository selection set — the same guard `service.repository.test.ts`
  already applies, extended to the detail query's fields. A field missing from
  a GraphQL selection set is invisible to every other test in the suite.
- Page render — the package chooser changes the total; a quote service shows
  no chooser at all.

## Out of scope

- A `slug` column for services. `/services/$id` works today; a slug is a
  migration plus a uniqueness rule and belongs with an SEO pass.
- Booking, Review, Payment and Communication contexts.
- A member's ability to withhold their name and photo.
