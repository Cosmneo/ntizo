# Service catalogue — design

**Slice 1 of five.** A provider creates services, gives each one what it offers
and at what price, and publishes them. Customers can see them. Nobody books
anything yet.

## Why this slice stops where it does

What the provider described is four systems, not one: the catalogue, the
availability calendar, the quote-and-proposal flow, and the booking lifecycle
with reviews. Each stands alone and each earns its own spec. Designed together
they produce a document nobody finishes implementing in one pass.

| Slice | What it delivers | Depends on |
|---|---|---|
| **1. Catalogue** *(this)* | Services, what each offers, prices, publishing | Categories (built) |
| 2. Availability | Recurring rules, date overrides, slot generation, capacity, multi-staff | 1 |
| 3. Quotes | Request → proposal → acceptance | 1 |
| 4. Booking | Created → paid → confirmed → in progress → completed → released | 2 or 3 |
| 5. Reviews | Feedback after completion | 4 |

Slice 3 does not need Slice 2: a quote settles its date in the proposal, not
against a calendar.

## Reference: doazores, and where it stops applying

The structure comes from the doazores native-inventory model, which solves the
same problem for tourism:

| doazores | here | the barber |
|---|---|---|
| `direct_activity` | `service` | Haircut |
| `direct_option` | `service_option` | "Hair only" 30 min · "Hair and beard" 50 min |
| `direct_pricing_tier` | *(not built — see below)* | |
| `direct_schedule` (per option, `SHARED`/`SEPARATE`) | `service_schedule` *(slice 2)* | one calendar for both |
| `direct_slot` | `service_slot` *(slice 2)* | 30- and 50-minute blocks |

**The middle layer is the point.** It carries the duration, and the duration is
what the calendar reads to cut blocks. Without it either every haircut takes
the same time or the calendar lies. This was twice recommended away during
design and twice wrong.

Three things from doazores are deliberately **not** carried:

- **`direct_pricing_tier`.** A tier under an option earns its place when the
  same offering costs different amounts for different people — child, senior.
  Most trades never need it, and "Hair only → tier Adult → 300" is a screen to
  write 300 in. The price sits on the option. Adding tiers later means moving
  `amount_minor` off `service_option` onto a new `service_option_tier`, seeding
  one tier per option from the current value.
- **`octo_unit_type` and `kind` PERSON/GROUP/VEHICLE.** Channel-manager and
  per-head tourism vocabulary. A plumber does not sell by the head.
- **`direct_extra`.** The "would you like a towel too?" of a tour. If it turns
  up here it turns up as its own service or another option, not a fourth table
  now.

What is worth taking is the rigour: money invariants in the schema rather than
only in code, transitions declared in a map, and deadlines that expire on their
own.

**A naming trap.** doazores has a `BookingStatus.QUOTE` that is not a quote at
all — it is a cart with a held price. Slice 3 must not borrow the word.

## The model

Four tables in `ntizo_catalog`, beside the categories already there.

### `service`

| column | notes |
|---|---|
| `id` | uuid |
| `provider_id` | owner; every authorisation decision starts here |
| `category_id` | **NOT NULL** — a service with no category appears nowhere and nobody can tell why |
| `source_locale` | the language the provider wrote in; see i18n |
| `location_type` | `at_customer` \| `at_provider` \| `remote` \| `flexible` |
| `booking_mode` | `priced` \| `quote` |
| `status` | `draft` \| `published` \| `archived` |
| `image_keys` | text[]; the service's own photographs, separate from the workspace's portfolio |
| `sort_order` | integer, default 0 |
| `created_at`, `updated_at` | |

`name` and `description` are **not** columns — they live in
`service_translation`, because every one of them is the provider's words in the
provider's language.

Indexes: `(provider_id, sort_order)` for the provider's own list;
`(status, category_id)` for the public browse.

### `service_option`

What a customer actually picks. Named `option` in the database because the team
already knows the word; called **"What I offer"** in the provider's interface,
where a barber should never read "option".

| column | notes |
|---|---|
| `id`, `service_id` | cascade on delete |
| `pricing_mode` | `fixed` \| `hourly` |
| `amount_minor` | bigint, minor units, `> 0` |
| `currency` | |
| `duration_minutes` | **required when `fixed`, null when `hourly`** |
| `min_minutes`, `step_minutes` | **required when `hourly`, null when `fixed`** — "two hours minimum, by the hour" |
| `is_default` | the "standard" price |
| `sort_order`, `is_active` | |

`name` lives in `service_option_translation`.

Constraints, as CHECKs and not only as code, because slice 2 reads these to
generate blocks and a null there generates zero-length ones:

```sql
CHECK (amount_minor > 0)
CHECK (
  (pricing_mode = 'fixed'  AND duration_minutes IS NOT NULL
                           AND min_minutes IS NULL AND step_minutes IS NULL)
  OR
  (pricing_mode = 'hourly' AND duration_minutes IS NULL
                           AND min_minutes IS NOT NULL AND step_minutes IS NOT NULL)
)
CHECK (duration_minutes IS NULL OR duration_minutes > 0)
CHECK (min_minutes IS NULL OR min_minutes > 0)
CHECK (step_minutes IS NULL OR step_minutes > 0)
```

Unique partial index — one default per service, enforced by the database rather
than by discipline:

```sql
CREATE UNIQUE INDEX service_option_one_default
  ON ntizo_catalog.service_option (service_id) WHERE is_default;
```

### How this maps to `BookingPath`

`packages/shared` already names four booking paths: `package`, `hourly`,
`custom_quote`, `task_bid`. This slice does not introduce a competing
vocabulary — it splits the same idea across the two places it belongs:

| `booking_mode` | `pricing_mode` | is the path |
|---|---|---|
| `priced` | `fixed` | `package` |
| `priced` | `hourly` | `hourly` |
| `quote` | *(none)* | `custom_quote` |
| — | — | `task_bid` is out of MVP scope and has no service behind it |

The path is a property of a *booking*, derived from what was bought. Storing it
on the service as well would be storing the same fact twice.

### `service_quote_form`

Only for `booking_mode = 'quote'`. One row per service.

| column | notes |
|---|---|
| `service_id` | unique |
| `response_hours` | what the provider commits to; the mockup says 48 |
| `ask_deadline`, `ask_photos`, `ask_location` | booleans — which fields the request form shows |
| `intro` | one line above the form, stored here in the service's `source_locale` and **not translated in this slice** — it is one sentence and translating it would mean a third translation table for it |

Everything that happens *after* the customer presses "Send request" is slice 3.
This table only describes the form.

### Translations

`service_translation(service_id, locale, name, description)` and
`service_option_translation(option_id, locale, name)`, both
`UNIQUE (parent, locale)`, both `ON DELETE CASCADE`.

Two tables rather than one polymorphic `translation(entity_type, entity_id, …)`:
a polymorphic table cannot have a foreign key, and a translation orphaned by a
deleted option stays there for ever. The extra join is cheap; integrity is not
recoverable afterwards.

## i18n: a service is not a category

Copying the category rule here would be wrong. A category is platform content —
ten of them, written once by an administrator, and asking for eight languages
is reasonable. A service is the provider's own words. A barber in Maputo will
not write "Corte de cabelo" in Dutch, and a form with eight boxes is a form he
closes.

Same shape as `category_translation`, different rule:

| | category | service |
|---|---|---|
| required | the **platform's** default locale | the locale the **provider wrote in** |
| falls back to | the platform default | the **service's own** `source_locale` |
| who translates | the administrator | the provider, only if they want to |

In practice the barber writes Portuguese and is finished — one translation row,
written by the create command, no form he ever sees. The photographer chasing
tourists opens "Translate" and adds English. A customer browsing in Italian
sees the Portuguese with a quiet marker saying it is not translated, never an
empty line.

**Translating is optional and carries no friction.** No warning in the list, no
nudge, nothing blocking publication. A provider who abandons publishing because
the platform asked for eight languages costs more than an untranslated service.

`resolveTranslation` already exists in the catalog bounded context and does
exactly this — it takes the rows and the wanted locale and reports whether it
fell back. It needs one change: the fallback locale becomes a parameter instead
of always `DEFAULT_LOCALE`.

## Two things in `packages/shared` that need fixing first

**`ServiceLocationType` and `BookingPath` are bare type unions.** Every other
enum on this project is a `const` array with a zod schema derived from it —
`USER_ROLES`, `LOCALES`, `PROVIDER_STATUSES` — because the API needs the values
at *runtime* to validate against, and a type union has none. These two need the
same treatment before a mutation can accept them.

**`resolveTranslation` hardcodes `DEFAULT_LOCALE` as its fallback.** For a
category that is right. For a service the fallback is the service's own
`source_locale`, so the fallback locale becomes a parameter. The categories keep
passing `DEFAULT_LOCALE` and behave exactly as they do today.

## Domain rules

Owned by the `Service` aggregate, which holds its options as a collection —
they have no life of their own, are never addressed without their service, and
are deleted with it.

1. **A `priced` service needs at least one option to be published.** A
   `quote` service must have none, and must have a quote form.
2. **Exactly one default option.** The first option created becomes it; deleting
   the default promotes the next by `sort_order`. The card in search results
   shows one number and there has to be one.
3. **`durationMinutes` is `fixed`-only, `minMinutes`/`stepMinutes` are
   `hourly`-only.** In the aggregate and in the CHECK.
4. **Publishing requires:** a category, a name in the source locale, and rule 1
   satisfied.
5. **Money is integers in minor units.** 300,50 MT is `30050`, as in the wallet
   and the commission. One decimal here and a cart stops reconciling against a
   statement.
6. **Visible to a customer ⇔ `service.status = 'published'` AND
   `provider.status = 'active'`.** The second condition is evaluated by the
   public read, never copied onto the service — a copied status is two statuses
   that will disagree.

## Slices

Following the shape the categories established.

- **`bounded-contexts/catalog`** — the `Service` aggregate with its options and
  quote form, the repository port, `CreateService`, `UpdateService`,
  `AddOption`, `UpdateOption`, `RemoveOption`, `ReorderOptions`,
  `SetServiceStatus`, `SetTranslation`.
- **`write/catalog`** — mutations, guarded by two different questions, not
  one. `canWriteProviderMedia`'s actual sibling is plain workspace
  membership (`isProviderMember`, on `providerMember` with no `role`
  filter) — that was the precedent, and describing it as role-checked in an
  earlier draft of this section was wrong twice over: wrong about the
  precedent, and not what the code did.

  A late review split the guard instead of picking one of its two obvious
  answers:
  - **Create, update, everything about options, everything about
    translations — any member, staff included.** `isProviderMember`, same
    as `canWriteProviderMedia`. Describing a service and pricing its options
    is the work of whoever does the work, and the person doing it is the
    person who knows what it is and what it takes.
  - **`SetServiceStatus` (publish, unpublish, archive) — owner or admin
    only.** A second port method, `isProviderOwnerOrAdmin`, checking
    `providerMember.role`. Deciding what the business sells and when it
    goes live is not the same act as describing it, and is the one decision
    on this list a business's staff should not be able to make unilaterally.

  Two sibling port methods, not one method with a boolean flag — the call
  sites are what a reviewer scans, and `isProviderOwnerOrAdmin(...)` at the
  one call site that needs it reads better than a stray `true` would.
  **Slice 2 will face this same fork**: availability rules and date
  overrides are "describe how I work" (any member), but whatever screen
  turns a staff member's calendar on or off for bookings is closer to
  "decide what the business does" — worth asking the product owner rather
  than assuming either half of this precedent by default.
- **`read/catalog`** — the provider's own list and detail, every translation
  unresolved, so the provider can see which languages are filled in.
- **`public/catalog`** — the customer's read, resolved into one locale, filtered
  by rule 6. Paged, like `category.all`.

The public tier must not reach into `read/` — the import guard already enforces
it, and the shared persistence belongs in the bounded context.

## GraphQL surface

Write: `service.create`, `service.update`, `service.setStatus`,
`service.options.add`, `service.options.update`, `service.options.remove`,
`service.options.reorder`, `service.translation.set`.

Read (private): `service.mine`, `service.detail`.
Read (public): `service.all` (by category, paged, resolved), `service.bySlug`.

Every refusal is a kit error type. A bare `Error` reaches the browser as "An
unexpected error occurred", which tells a provider that the server broke when
what happened is that they left a box empty. This was got wrong three times in
one session on other work; it is written here so it is got right the first time.

## Interface

**Creating** is a short form, not the seven-step wizard the onboarding uses: a
service is a small thing and a wizard would make it feel like registering a
business again. Category, name, description, where it happens, and then the
branch:

- `priced` → "What I offer": a list of cards, each with name, duration and
  price. The first one created is the standard, marked as such.
- `quote` → what to ask the customer, and the response window.

**The list** uses `CollectionCard`, like every other list in the app — table
above `md`, stacked cards below, one definition.

**Reordering** by dragging, with move-up/move-down in the row menu, exactly as
the categories do: drag events do not fire for touch and cannot be driven from a
keyboard, so dragging alone reorders nothing for most of the ways people use a
list.

**Translating** is a panel behind a "Translate" button, never a field in the
main form.

## Errors

| code | when |
|---|---|
| `SERVICE_NOT_FOUND` | stale link |
| `SERVICE_CATEGORY_REQUIRED` | publishing with no category |
| `SERVICE_NEEDS_OPTION` | publishing a `priced` service with none |
| `SERVICE_QUOTE_HAS_OPTIONS` | a `quote` service given an option |
| `SERVICE_NAME_REQUIRED` | no name in the source locale |
| `OPTION_DURATION_REQUIRED` / `OPTION_DURATION_NOT_ALLOWED` | duration against the pricing mode |
| `OPTION_LAST_ONE` | removing the only option of a published service |
| `NOT_PROVIDER_MEMBER` | acting on somebody else's workspace |
| `NOT_PROVIDER_OWNER_OR_ADMIN` | a member who isn't owner or admin tries `service.setStatus` |

## Testing

Rules 1 to 6 each get a test, and the ones that matter most are the ones that
must **fail**:

- publishing a `priced` service with no options is refused;
- deleting the default option promotes the next, and deleting the last one from
  a published service is refused;
- an `hourly` option with a `durationMinutes` is refused by the aggregate *and*
  by the CHECK — the second asserted against the real database, because a CHECK
  nobody exercises is a CHECK that might not be there;
- the public read hides a published service belonging to a pending provider;
- a service with no translation in the reader's locale comes back in its source
  locale, flagged as a fallback.

Verification is against the running app, not the config. Every silent failure
on this project so far — images that never persisted, submenu clicks that died,
a schema absent from the migration filter, a route shadowed by its neighbour —
passed types, lint and tests.

## What slice 2 will need from this

- `service_option.duration_minutes` for `fixed`, `min_minutes`/`step_minutes`
  for `hourly`. The calendar cuts blocks from these.
- The schedule hangs off the **option**, with doazores' `SHARED`/`SEPARATE`
  scope. Default here is **`SHARED`**, the opposite of theirs: a private tour
  runs on different days from a shared one, but a barber works the same hours
  for everything he does.
- `hourly` is where doazores stops helping. Every tour has a fixed duration;
  nothing there generates "free hours a customer fills". The schema anticipates
  it, this slice does not build its screens, and slice 2 owns the decision.

## Open, deliberately

- **Price tiers under an option.** Not built. The migration path is written
  above.
- **Per-head pricing** — the caterer charging per guest. Would be a unit and a
  minimum on the option. Nobody has asked yet.
- **A service slug** for public URLs. The provider already has one and the
  generator is reusable; whether a service needs its own depends on what the
  public page looks like, which is not this slice.
