# The provider's three editors — design

Three screens a provider spends real time in — creating a service, saying when
they work, and registering their business — rebuilt on one set of parts. No new
feature, no schema change, no new capability. What changes is whether the
screens show a person where they are, what is left, and what their choices
produce.

This is deliberately taken **before** slice 3. Reworking a screen is cheaper
than reworking a screen plus everything a later slice hung off it.

## What prompted it

The product owner brought three screens from doazores — the sibling project
this platform's architecture came from — as references: an availability
configurator with a live week preview beside the rules, a rule editor in a
side drawer that says in a sentence what the rule will produce, and an
activity creator with numbered sections, a progress ring and choices as pills.

**Half of what those screens show exists because doazores materialises slots.**
"12 projected slots", "Generate 90 days", and the trio *Unsaved changes /
Check changes / Save schedule* are the interface of a machine that writes rows
ahead of time and must regenerate them. Ntizo computes availability on read —
a decision taken and verified in slice 2. Copying that chrome would reimport
a mental model this platform deliberately rejected: it would tell a provider
their edits are pending when they are already live.

What does translate is the part doazores has and Ntizo lacks: **feedback**.

## What is taken, and what is left

| From the references | Verdict |
|---|---|
| Live week preview beside the rules | **Take** — and it is truer here than there, see below |
| Rules as cards with weekday pills and a summary line | Take |
| Rule editor in a drawer with a preview sentence | Take |
| Numbered section rail with per-section status | Take |
| Progress ring and "N of M required" | Take |
| Choices as pills rather than dropdowns | Take |
| Sticky footer carrying progress and the primary action | Take |
| Capacity and seats | Leave — Ntizo books named people, one at a time |
| Projected slot counts, "generate N days" | Leave — nothing is generated |
| Save-as-batch, unsaved-changes gating, "check changes" | Leave — each rule saves on its own and takes effect immediately |
| Per-option schedule selector | Leave — the calendar belongs to the person, not the option |

**The preview is truer here.** In doazores it forecasts what a cron will
produce. In Ntizo the same rules that draw the preview *are* what answers a
customer, so the provider is looking at the product rather than at a promise.

## Visual language

Unchanged. `--color-primary` `#006ffd`, `--color-success` `#21b872`, the
existing `type-h1…type-caption` scale, the three radii, the three families.
No new token, no new colour. The references are green; this is blue, and that
is the point — the parts are borrowed, the identity is not.

If these three screens end up visibly better than the rest of the application,
that is useful information for deciding whether to refresh everything later.
It is not this decision.

## The shared parts

Four things all three screens need and none of which exists. Built once, in
`packages/frontend/src/components/`, beside `button`, `card`, `select` and the
rest.

### `ChoiceChips`

A pill group replacing `Select` wherever the set is small and each member has
a name worth reading: service category, where a service happens, booking mode,
slot interval, languages, provider type, weekdays.

Single-select and multi-select in one component, because they differ only in
what a click does. **The accessibility roles are the point, not the shape**: a
`Select` is one control with one focus stop; a chip row is a `radiogroup` or a
group of checkboxes, arrow keys move within it, space toggles, and the group
carries the label. Getting that wrong produces something that looks better and
is worse — which is a strictly negative outcome for a screen whose whole job is
to be easier to use.

`Select` stays for long lists — timezone, country, city.

### `SectionRail`

The numbered list down the left. One row per section: its number, its name, and
a status — **done**, **to do**, or **has a problem**. Required sections are
marked as such; optional ones are not.

A row is clickable when reaching it is legal. What "legal" means is the
consuming screen's business, not the rail's.

### `ProgressRing`

A small ring with a count. It reports **required** sections completed out of
required sections total — not all sections, which would make a screen look
half-finished when everything mandatory is done.

### `StickyActionBar`

The footer that follows: progress on the left, actions on the right. When the
primary action is unavailable it says why, in words, beside itself.

## Screen one: the service editor

**From a 595-line sheet to a page.** A service now carries a name, a category,
where it happens, a booking mode, options with prices and durations, who
performs it, a buffer, a slot interval, translations and images. That outgrew a
side panel a slice ago.

Route: `/provider/$slug/services/$serviceId`, with the literal `new` as the id
for one that does not exist yet — service ids are UUIDs, so the two cannot
collide. The services list stays exactly as it is.

**The translations sheet is absorbed, not kept.** `translations-sheet.tsx`
becomes section 5 rather than a second overlay opened from inside the first;
a sheet on top of a sheet was a consequence of the editor being a sheet, and
that reason is gone.

Sections, in this order:

| # | Section | Required | Holds |
|---|---|---|---|
| 1 | The essentials | yes | name, category, where it happens |
| 2 | How it is charged | yes | booking mode; then options with price and duration, or what to ask the customer |
| 3 | Who does it | yes | performers — see below |
| 4 | Timing | no | buffer, slot interval |
| 5 | Languages | no | translations |
| 6 | Images | no | media |

**"Who does it" disappears for an individual provider, and so does its count.**
A one-member workspace has one answer to that question and the server already
seeded it, so the section is not rendered, is not listed in the rail, and is
not counted by the ring. An individual sees **2 of 2 required**, an
organization **3 of 3** — a rail that showed a permanently-complete section
nobody can act on would be furniture.

**The rail's status comes from the same rules the server publishes by.** A
section is complete when the corresponding publish rule is satisfied: a
category chosen, a name in the source locale, at least one option for a priced
service, at least one performer. It must not compute its own notion of
completeness.

This is the requirement that decides whether the screen helps or annoys. A rail
with a private definition of "done" will eventually show everything green while
`SERVICE_CATEGORY_REQUIRED` or `SERVICE_NEEDS_MEMBER` comes back from the
server — and after that nobody believes the rail again. The publish rules live
in `catalog/domain/service-rules.ts`; the client mirrors them by name, and
each mirrored rule carries the error code it corresponds to.

**A disabled Publish says why and takes you there.** "Publish" greyed out with
no explanation is the same failure as a generic error banner, moved earlier.

## Screen two: availability

Two columns.

**Left — what the provider changes.** The workspace timezone on a small card
with its own edit control. The person picker. Then the weekly rules as cards:
each shows its days as pills, its hours, and one sentence saying what it
produces. Exceptions and closures follow in the same shape. Adding or editing
any of them opens a drawer, with a preview sentence at its foot naming the
result — the pattern from the reference's second screen.

Closures and the timezone remain visible only to an owner or admin, exactly as
today. Hiding is not the guard; the server refuses regardless, and that was
verified in slice 2.

**Right — what those changes produce.** The week, with a legend and week
navigation, and a toggle between the selected person and the whole team. The
team view is the union of everyone's working time: when the business is
reachable at all.

**For an individual provider neither control appears** — no person picker, no
team toggle. One member means both offer a single choice, and the word for
"staff" never reaches that provider's screen, which is the rule slice 2 already
holds.

**The preview shows configured time, not free time.** No bookings are
subtracted. "When do I work" and "when am I free" are different questions and
the second belongs to an agenda screen that does not exist yet. Conflating them
here would make the configurator lie about itself the moment slice 4 lands.

### Moving the engine into `packages/shared`

Drawing that week means running the precedence chain: weekly rules, minus
closures, minus exceptions. That chain lives in the backend. Three ways to get
it into a browser:

1. reimplement it in the frontend;
2. ask the server on every keystroke;
3. **move it to the shared package.**

The third is nearly free, for a concrete reason. `intervals.ts` contains
**zero** `import` statements, and `offers.ts` imports one type from it. They
were written that way on purpose — pure functions with no database, no clock
and no timezone. Their only non-test consumer is
`list-service-availability.projection.ts`. Moving both to
`packages/shared/src/scheduling/` and repointing three imports makes the
backend and the browser run literally the same code, and the preview answers
with no network while somebody drags an hour.

Reimplementing would leave two versions of the same precedence chain obliged to
agree forever. Round-tripping every edit would put a network hop inside a drag.

The `busy` parameter stays in the signature and the preview passes `[]`. It is
what slice 4 fills, and the preview deliberately does not.

## Screen three: onboarding

The cheapest of the three, because its logic already exists. `STEP_ORDER`,
`stepProgress`, `validateStep` and `firstIncompleteStep` are all in place; what
is missing is a screen that shows what they know.

- Each rail row's status comes from `validateStep` — which already returns the
  field errors for a step.
- The ring reports required steps.
- Provider type, country and languages become pills.

**One behaviour changes.** Today navigation is backwards only, one step at a
time. It becomes: any step up to and including `firstIncompleteStep` is
reachable. That keeps the reason the restriction exists — nobody may skip past
the step that creates the provider — while ending the six clicks it currently
takes to correct a name typed on screen one.

## What this does not touch

The admin zone, the wallet, the public directory, authentication, and the
customer's availability panel. No token, no colour, no schema, no GraphQL
field, and no backend behaviour except the file move described above.

## Errors

No new error codes. The service editor consumes the ones slice 1 and slice 2
already defined — `SERVICE_CATEGORY_REQUIRED`, `SERVICE_NAME_REQUIRED`,
`SERVICE_NEEDS_OPTION`, `SERVICE_NEEDS_MEMBER`, `SERVICE_QUOTE_HAS_OPTIONS` —
and its contribution is to raise them **before** the request, under the field
that owns them, rather than after it in a banner.

## Testing

The parts get unit tests for their logic, not their pixels: `ProgressRing`'s
count, `SectionRail`'s status derivation, `ChoiceChips`' selection behaviour in
both modes.

The tests that matter are about agreement and about keyboards:

- **the service rail agrees with the server** — for each publish rule, a draft
  that violates it shows that section incomplete, and a draft that satisfies
  every rule shows Publish enabled. Drive both from the same fixtures the
  `canPublish` tests use, so the two cannot drift apart silently;
- **the preview agrees with the engine** — the shared functions produce the
  same intervals from the frontend's inputs as the backend's own tests assert;
- **chips are operable from a keyboard** — arrow keys move within the group,
  space toggles, the group is labelled. This is the one thing that, done
  wrong, makes the change a regression;
- **onboarding reachability** — every step up to the first incomplete one is
  reachable and no step beyond it is, including when the first incomplete step
  is the one that creates the provider.

Verification is against the running application. The three defects slice 2
shipped and caught — a form that discarded typing on a background refetch, a
create path that failed entirely behind a generic banner, and a picker that
vanished when used — were all found by a person clicking, and all three lived
in this layer.

Each screen is walked in a browser in **`pt-MZ` and one other locale**, because
a hardcoded string is invisible in the language it was written in.

## Open, deliberately

- **Refreshing the visual language.** Palette, spacing and type as a whole.
  Deferred until these three screens exist to judge against.
- **An agenda screen** showing bookings against the configured week. Needs
  slice 4.
- **Reordering a service's sections**, or remembering which one a provider left
  off in. Nobody has asked, and the rail makes the current section obvious.
- **Rich text in service descriptions.** Out of scope; the field stays plain.
