# Availability — design

**Slice 2 of five.** A provider says when they work. A customer sees when a
service can be had. Nothing is booked yet — booking is slice 4 — and this
document says exactly where the seam between them is.

## Why this slice stops where it does

| Slice | What it delivers | Depends on |
|---|---|---|
| 1. Catalogue | Services, options, prices, translations | — |
| **2. Availability** | **Working hours, exceptions, closures, the free-time engine, named staff** | **1** |
| 3. Quotes | Request → proposal → acceptance | 1 |
| 4. Booking | The lifecycle, payment hold, the overlap constraint | 2 |
| 5. Reviews | After a booking is released | 4 |

Slice 3 does not need this one: a quote settles its date inside the proposal.

## What was decided, and against what

Five forks. Each was put to the product owner with its cost; four were answered
against the cheaper option, and the reasoning is recorded here because a later
reader will otherwise assume the expensive half was an accident.

**The calendar belongs to the provider, not to the service or the option.**
Slice 1 anticipated doazores' shape — a schedule per option with a
`SHARED`/`SEPARATE` scope. Reading doazores again decided against it: they
built the per-option machinery and then defaulted every row to `SHARED`, and
the first gap in their own analysis is that the provider-facing GraphQL never
exposed `SEPARATE` at all. A boat tour genuinely runs different days for
private and shared. A barber opens at eight and closes at six, and that is
true of the cut, the beard, and the cut-and-beard alike.

**Staff are named, and the customer picks one.** The cheaper answer was a
capacity number — "I serve three at a time" — which gets the correctness
(nobody overbooks) for one column. It was rejected: choosing your barber is
most of why you go back to that barber. The cost is real and was stated
before the choice: a calendar per member, exceptions per member, a picker on
the customer's screen, and a booking that points at a person. It is a
subsystem, not a field.

**Which member performs which service is a relation, edited on the service.**
A salon with a barber and a manicurist must not let anyone book a manicure
with the barber. The relation is edited where the provider is already deciding
what the service is and what it costs.

**Hourly is served by this slice.** Slice 1 already lets a provider create an
hourly service — three-hour minimum, half-hour increments — and slice 1's own
final review named "wider than the product" as its central defect. Shipping a
calendar that cannot serve a service the catalogue can already create would
repeat it deliberately.

**A member edits their own calendar; owner and admin edit anyone's.** Slice 1
left this open by name and asked that it be put to the product owner rather
than assumed from either half of its precedent. A day off is the member's own
knowledge; closing the calendar of someone who is ill and not answering their
phone is the manager's necessity. House closures are owner and admin only.

## The model

A new `scheduling` schema. **It must be added to both `drizzle.config.ts`'s
`schemaFilter` and the database `index.ts`** — a schema missing from the filter
is a migration that silently does nothing, which has already happened once on
this project.

### `scheduling.member_availability`

One row per contiguous stretch a member works on a weekday. Someone who works
Tuesday morning and Tuesday afternoon has two rows.

| column | notes |
|---|---|
| `id` | uuid |
| `provider_id` | → `provider`, cascade. Denormalised so authorisation never joins across contexts |
| `member_id` | → `provider_member`, cascade |
| `weekday` | smallint, 0 = Sunday … 6 = Saturday |
| `start_minute` / `end_minute` | integer, minutes from local midnight |

```sql
CHECK (weekday BETWEEN 0 AND 6)
CHECK (start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute)
INDEX (member_id, weekday)
```

Minutes rather than `time` for two reasons: the engine does arithmetic in
minutes and would otherwise cast on every read, and `time` cannot say `24:00`
— a shop that closes at midnight has no way to write its closing hour.

**Overlapping rows carry no constraint.** `08:00–12:00` beside `11:00–14:00`
means `08:00–14:00`; the engine merges and nothing is corrupted. The form
refuses to create one, because two rows saying the same thing look like a
mistake. Slice 1's lesson is that a `CHECK` guards what must never be true —
this is merely untidy.

### `scheduling.date_exception`

A specific date for a specific member. Either `closed` — not working — or
`custom`, which replaces that day's weekly pattern outright.

| column | notes |
|---|---|
| `id` | uuid |
| `provider_id` / `member_id` | → cascade, as above |
| `on_date` | date |
| `kind` | `closed` \| `custom` |
| `start_minute` / `end_minute` | null for `closed`, required for `custom` |
| `note` | free text, shown back to the member |

```sql
CHECK ((kind = 'closed' AND start_minute IS NULL AND end_minute IS NULL)
    OR (kind = 'custom' AND start_minute IS NOT NULL AND end_minute IS NOT NULL
        AND start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute))
INDEX (member_id, on_date)
```

No uniqueness on `(member_id, on_date)`. Several `custom` rows on one date
merge, and that is how "Saturday I work the morning and the late afternoon"
gets written. A `closed` row on the same date beats all of them.

Doazores holds both kinds in the backend and shows only the closed one in the
provider's screen. **Here both are built or neither is stored.**

### `scheduling.house_closure`

A date range that applies to everybody. Christmas is one row and one gesture,
not seven rows per member.

| column | notes |
|---|---|
| `id` | uuid |
| `provider_id` | → `provider`, cascade |
| `from_date` / `to_date` | date, inclusive |
| `note` | why |

```sql
CHECK (to_date >= from_date)
INDEX (provider_id, from_date, to_date)
```

### Additions to slice 1

`catalog.service_member` — `(service_id, member_id)` as the primary key, both
cascading, with an index on `member_id` for "what does this person do".
Whoever creates a service is inserted into it. A service with nobody in it
cannot be published: the same family of rule that already refuses to publish a
priced service with no options.

**A published service can be emptied two ways, and they are answered
differently.** `service.members.set` clearing the last performer of a
published service is refused outright — it is an edit, and the person making
it can simply not make it. A member leaving the workspace is not an edit that
can be refused: people leave. The cascade removes their rows, and the member
removal use case then **unpublishes every service left with nobody**, naming
them in the result so the owner learns which ones went dark rather than
discovering it from a customer. A foreign key cannot express either rule,
which is why both live in the use cases.

`catalog.service` gains two columns:

- `buffer_minutes` — integer, default 0, `CHECK BETWEEN 0 AND 480`. Without it
  appointments touch end to end, and a service at the customer's address still
  needs the journey.
- `slot_interval_minutes` — integer, default 30, `CHECK IN (15, 30, 60)`. The
  grid the offered start times land on. A barber wants 15; a photographer 30.

`provider` gains `timezone`, text, not null, default `Africa/Maputo`. Chosen
explicitly on the availability screen and **never derived from the address
country** — Brazil has four.

An **individual provider is the one-member case**: the owner. They configure
one calendar and the word "staff" never appears on their screen.

## The engine

A pure core with no database, no clock and no timezone. Everything in minutes
from local midnight; the timezone enters only at the boundary, when instants
are returned.

```ts
interface Interval { start: number; end: number }

freeIntervals({ houseClosed, exceptions, weekly, busy }): Interval[]
```

In this order:

1. a house closure covers the date → nothing;
2. a `closed` exception for that member → nothing;
3. any `custom` exceptions → their merge, **replacing** the weekly pattern;
4. otherwise → the merge of that weekday's weekly rows;
5. subtract `busy`.

Presentation is a second function, and it is where the two pricing modes
diverge without duplicating the core:

```ts
fixedStarts(free, { durationMinutes, bufferMinutes, gridMinutes }): number[]
hourlyStarts(free, { minMinutes, stepMinutes, bufferMinutes, gridMinutes }):
  { start: number; maxMinutes: number }[]
```

**Fixed.** The grid is anchored to local midnight, not to the interval — with a
30-minute grid the marks are 00:00, 00:30, 01:00 and so on, so the offered
times stay on the half hour whatever the day has already eaten. Walk from the
first mark at or after each free interval's start; offer `t` while
`t + duration + buffer <= interval.end`. An interval that opens at 08:10,
because an earlier appointment ended there, offers 08:30 and not 08:10. A
45-minute service on a 30-minute grid offers 08:00, 08:30, 09:00 — the grid is
independent of the duration. The appointment is `[t, t + duration)`; the
buffer is occupied but not sold, so the last session of the day appears only
if it finishes, buffer included, before closing.

**Hourly.** Starts on the same grid; for each start, the longest bookable
length is the largest `min + k·step` that still fits before the window ends,
buffer included. A start offering less than `minMinutes` is not offered at all.
The option's `stepMinutes` sizes the durations; the service's `gridMinutes`
sizes the starts. They are different questions and stay separate fields.

### Timezone

There is no date library in this repository and `Temporal` does not exist in
Bun. A small `zoned.ts` in `packages/shared`:

```ts
offsetMinutesAt(timeZone, utcMs): number
localDateTimeToInstant(timeZone, isoDate, minuteOfDay): Date
```

The offset comes from `Intl.DateTimeFormat` with `timeZoneName: 'longOffset'`.
Converting a local wall-clock time takes two passes: read the offset at a naive
guess, correct by it, read the offset again at the corrected instant, and
correct once more if it moved. That second pass is what makes the hour either
side of a transition right.

**Tested against Europe/Lisbon on 2026-03-29 and 2026-10-25**, even though
Mozambique has no daylight saving. The bug exists only in a market we have not
opened, which is the worst possible place to find it. Two edge behaviours are
chosen and documented rather than left to emerge: a local time that does not
exist (the hour skipped in spring) maps forward, and one that happens twice
(autumn) resolves to the first.

### Bounds

A single availability query spans at most **62 days, counting both ends** —
two months, which is what a calendar shows. There is no generation and no
horizon, but a ten-year question is still a question nobody should be able to
ask.

### The seam with booking

`BusyIntervalsPort.forMember(memberId, from, to)`. This slice ships an
implementation returning an empty list, because no booking exists yet. **The
engine's tests pass busy intervals directly**, so subtraction is proven now
rather than in a slice where nobody remembers it was never exercised.

Slice 4 replaces the implementation and adds the overlap guarantee: a Postgres
exclusion constraint over the booking's `tstzrange` per member, which unlike a
counter cannot drift out of step with the rows it counts. It is not written
here — a constraint is not placed on a table that does not exist.

## Layers

Following the shape slice 1 established.

- **`bounded-contexts/scheduling`** — the pure engine, the `MemberSchedule`
  aggregate, the repository port, and the use cases.
- **`write/scheduling`** — the mutations, guarded by
  `isSelfOrProviderOwnerOrAdmin`, a third sibling to the two port methods
  slice 1 introduced. Closures use `isProviderOwnerOrAdmin` directly.
- **`read/scheduling`** — the provider's own configuration.
- **`public/scheduling`** — the customer's question. It must not reach into
  `read/`; the import guard already enforces it.

## GraphQL surface

Write: `availability.setWeeklyPattern`, `availability.addException`,
`availability.removeException`, `availability.addClosure`,
`availability.removeClosure`, `service.members.set`, and `service.update`
gaining `bufferMinutes` and `slotIntervalMinutes`. The provider timezone joins
`provider.update`.

Read (private): `availability.config(memberId)` — rules, exceptions, the
house's closures and the timezone, unresolved.

Read (public): `availability.forService(serviceId, memberId, from, to)` — a
list of days, each with its offered starts.

**`memberId` is optional, and its two meanings are both needed.** Given, the
answer is that one person's calendar, and a member who does not perform the
service is refused rather than answered with an empty week. Omitted, the answer
is the union across everyone who performs it — "when can *anybody* here see
me?" — and every start carries the ids of the members free at that moment, so
the screen can offer the choice without asking a second time. The union is what
a customer with no preference wants, and the per-member list is what makes
choosing possible; returning only one of them would force the other to be
assembled by N round trips.

Every refusal is a kit error type carrying a `code`. A bare `Error` reaches the
browser as "An unexpected error occurred", which tells a provider the server
broke when what happened is that they left a box empty. This was got wrong
three times in one session on other work and a fourth time inside slice 1.

## Interface

**A new tab in the provider zone: "Availability".** For an individual, a
weekly grid, the list of exceptions, and the timezone. For an organization, a
person picker above the same grid, with the house's closures and the timezone
in a separate block visible only to those who may change them.

**The service form** gains three things: who performs it, the buffer, and the
grid interval.

**On the customer's side**, the public provider page gains its list of
services — closing a slice 1 follow-up — and a service opens a panel with a
date strip and the free times. There is no booking button: booking is slice 4.
The screen still answers a true question, "when can this person see me?", and
it is what proves the engine runs.

Without it this slice would ship an engine nothing can reach, which is the
defect slice 1's final review named by its name.

## Errors

| code | when |
|---|---|
| `AVAILABILITY_RULE_INVALID` | end at or before start, or outside the day |
| `EXCEPTION_SHAPE_INVALID` | a `closed` with hours, or a `custom` without |
| `AVAILABILITY_WINDOW_TOO_WIDE` | a query spanning more than 62 days |
| `TIMEZONE_INVALID` | a zone `Intl` does not recognise |
| `MEMBER_NOT_IN_PROVIDER` | a member id belonging to another workspace |
| `SERVICE_NEEDS_MEMBER` | publishing a service nobody performs |
| `SERVICE_MEMBER_CANNOT_PERFORM` | asking a member's availability for a service they do not do |
| `NOT_SELF_OR_PROVIDER_OWNER_OR_ADMIN` | a member editing someone else's calendar |

## Testing

The precedence chain gets a test per link, and the ones that matter are the
ones that must **fail**:

- a house closure empties a day the member's weekly pattern fills;
- a `closed` exception beats a `custom` on the same date;
- a `custom` exception replaces the weekly pattern rather than adding to it;
- overlapping weekly rows merge into one interval, not two;
- busy intervals passed by hand are subtracted, though nothing supplies them;
- the last start of the day is withheld when duration plus buffer overruns
  closing time;
- an hourly window shorter than `minMinutes` offers no start at all;
- a `staff` member editing another member's calendar is refused, and adding a
  house closure is refused;
- clearing the last performer of a published service is refused, while
  removing that person from the workspace succeeds and leaves the service
  unpublished and named in the result;
- the `CHECK` constraints are exercised against the real database, because a
  constraint nobody exercises is a constraint that might not be there;
- the public query refuses a named member who does not perform the service,
  and with no member named returns the union with each start's free members.

Verification is against the running application, not the configuration. Every
silent failure on this project so far — images that never persisted, a route
shadowed by its neighbour, a schema absent from the migration filter — passed
types, lint and tests.

## Open, deliberately

- **Overnight windows.** `end_minute` is capped at 1440, so a shift crossing
  midnight cannot be written. The migration path is to lift the cap and let the
  engine split the interval at midnight; nobody has asked, and the launch
  market's services close in the evening.
- **Per-person pricing.** The counter and the "per person" unit belong to the
  price configuration on the option, where doazores keeps them in its tiers.
  Not an availability question: four people at one photo session occupy one
  place in the photographer's day.
- **Capacity per time slot** — a yoga class with ten places. Named staff answer
  a different question, and holding both would be two notions of fullness that
  have to agree.
- **Travel time distinct from buffer.** One number covers both today. A
  provider who serves two cities will eventually need them separated.
- **Seasonal bounds** on a weekly rule, which doazores carries and never shows.
- **A default template** seeding a new member's week from the provider's usual
  hours, instead of an empty grid.
