# Slot generation moves to availability

**Date:** 2026-08-13
**Status:** awaiting review

## The problem

A barber's customer picks a time: 09:00–09:30, 10:00–10:30. That already works
— `fixedStarts` in `packages/shared/src/scheduling/offers.ts` walks the free
intervals on a grid and emits starts. What is wrong is *where the inputs live*.

Today the two numbers that shape those slots sit on the **service**:

```
service.buffer_minutes         int not null default 0   CHECK 0..480
service.slot_interval_minutes  int not null default 30  CHECK IN (15,30,60)
```

They do not belong there. A provider is open 09:00–18:00 and their day is cut
into slots by how *they* work, not by which of their services is being looked
at. Asking the question once per service means asking it again for every
service they ever add, and lets two services disagree about a fact that has
one answer.

Three things follow from moving them, and this spec covers all three:

1. The wizard's **Tempos** step disappears; the fields reappear on the
   availability rule that owns them.
2. A rule gains **capacity** — how many bookings one slot can hold. One
   barber cannot cut two heads at once, so the default is 1; a salon with
   several chairs says otherwise.
3. A rule can say it has **no slots at all** — open 09:00–18:00, turn up or
   call, nothing to pick from.
4. The availability page gains a **live preview** of the slots the rules
   produce, so the provider sees the answer while deciding rather than after
   publishing.

## What already exists

Worth stating plainly, because most of the engine is already built and this
spec must not rebuild it.

| Piece | Where it lives today |
|---|---|
| Free intervals, precedence chain | `@ntizo/shared/scheduling` `freeIntervals` |
| Slot starts on a grid | `@ntizo/shared/scheduling` `fixedStarts` |
| Hourly offers | `@ntizo/shared/scheduling` `hourlyStarts` |
| The window (days + start + end) | `ntizo_scheduling.member_availability` |
| Duration | `ntizo_catalog.service_option.duration_minutes` |
| Buffer, grid | `ntizo_catalog.service.*` — **moving** |
| Capacity | nowhere — **new** |
| Slot preview | nowhere — **new** |

Reference: `doazores`'s `direct-availability` bounded context models the same
problem. Its `RecurringSlot` value object carries `daysOfWeek`, `startTime`,
`endTime`, and optional `capacity` / `durationMinutes` / `bufferMinutes`
overrides above a `DirectSchedule`'s defaults. This spec borrows that shape
but deliberately **not** its persistence: see "Slots stay computed" below.

## Slots stay computed, not stored

`doazores` pre-generates slot rows (`DirectSlot`, `generate-slots-for-schedule`,
`regenerate-unbooked-future-slots`, a generation window in days). Ntizo
computes on request.

We keep computing. The reasons:

- There is no generation job to run, nothing to regenerate when a rule
  changes, and no window beyond which the calendar is silently empty.
- The same function that answers a customer draws the provider's own preview,
  so the preview cannot drift from the product.
- Capacity is a *count*, and counting does not need rows. What needs rows is
  **reserving** a seat, and that is what `booking` already is.

This is revisitable: if seats are ever sold as stock with holds and expiry, a
slot table becomes the right answer. Nothing here forecloses it.

## Schema

### `ntizo_scheduling.member_availability` — three nullable columns

```sql
ALTER TABLE ntizo_scheduling.member_availability
  ADD COLUMN buffer_minutes        integer,
  ADD COLUMN slot_interval_minutes integer,
  ADD COLUMN capacity              integer;

ALTER TABLE ntizo_scheduling.member_availability
  ADD CONSTRAINT member_availability_buffer_range
    CHECK (buffer_minutes IS NULL OR buffer_minutes BETWEEN 0 AND 480),
  ADD CONSTRAINT member_availability_slot_interval
    CHECK (slot_interval_minutes IS NULL OR slot_interval_minutes IN (0, 15, 30, 60)),
  ADD CONSTRAINT member_availability_capacity
    CHECK (capacity IS NULL OR capacity >= 1);
```

**Nullable is the point.** `NULL` means "use the default", which is what the
`Use default: …` placeholder in the reference screens says out loud. A rule
that has never been touched carries three nulls and behaves exactly as it does
today.

`slot_interval_minutes` therefore has **three** states, not two, and they are
different sentences:

| Value | Means |
|---|---|
| `NULL` | Nothing said — use the default grid. |
| `0` | **Said: no slots.** The window is simply open. |
| `15` / `30` / `60` | Starts land on this grid. |

Zero is not "a grid of length nothing"; it is the absence of a grid, and it is
a real answer a provider gives. Someone open 09:00–18:00 who takes people as
they arrive has no slot to offer and should not be made to invent one. It is
spelled as a value rather than as a separate `slotted` boolean because a
boolean plus a number can contradict each other — `slotted = false,
interval = 30` has no meaning and would still be storable.

### The defaults are constants, not a table

```
BUFFER_MINUTES        = 0
SLOT_INTERVAL_MINUTES = 30
CAPACITY              = 1
```

Capacity defaults to **1**: with nothing said, one booking can be made in that
slot. That is the answer the product owner gave and it is also the only safe
one — a default above 1 would silently oversell every provider who never
opened the field.

A *provider-level* default layer (so a salon sets `capacity = 10` once rather
than per rule) is deliberately **not** in this spec. It is one more table, one
more resolution step and one more screen, and nothing yet needs it. The
resolution helper below is written so adding that layer later is a change in
one function.

### `ntizo_catalog.service` — two columns dropped

```sql
ALTER TABLE ntizo_catalog.service
  DROP CONSTRAINT service_buffer_range,
  DROP CONSTRAINT service_slot_interval,
  DROP COLUMN buffer_minutes,
  DROP COLUMN slot_interval_minutes;
```

Destructive, and worth a sentence on why it is safe to be: both columns are
provider-set configuration with system defaults, not customer data. Nothing
references them but the projection changed below.

### Duration is **not** moving — open question for review

`doazores` puts `durationMinutes` on the rule. Ntizo puts it on
`service_option.duration_minutes`, and the column's own comment says why:

> The layer that carries the duration, which is the reason it exists: the
> calendar reads it to cut blocks, and thirty minutes and fifty minutes
> cannot come out of one rule.

A haircut is 30 minutes and a colour is 90. They share the barber's window and
their grid, but not their length. **Recommendation: duration stays on the
option.** The rule supplies the window, the grid, the buffer and the capacity;
the option supplies the length.

The cost of that recommendation is on the preview — see below.

## The engine

### Slots are generated per rule, not per merged day

This is the part that is easy to get wrong. `freeIntervals` **merges**
overlapping and back-to-back stretches: 08:00–12:00 beside 11:00–14:00 becomes
one 08:00–14:00 interval. That merge is correct for "when is this person free"
and destroys the very thing this spec adds — once merged, there is no way to
tell which rule contributed which minutes, so a 15-minute grid on the morning
rule and a 60-minute grid on the afternoon one cannot both be honoured.

So the projection changes shape: instead of

```
free = freeIntervals(all rules for the day)
starts = fixedStarts(free, oneShape)
```

it becomes, per rule that survives the day's exceptions:

```
for each rule r active on this date:
    window = r ∩ (what exceptions and closures leave open)
    starts += fixedStarts(window, {
        durationMinutes: option.durationMinutes,   // from the service
        bufferMinutes:   r.bufferMinutes        ?? BUFFER_MINUTES,
        gridMinutes:     r.slotIntervalMinutes  ?? SLOT_INTERVAL_MINUTES,
    })
```

A rule whose grid is `0` emits **no starts at all**. Its window still counts —
it is time the provider is open, it still appears in the week preview, and it
still blocks nothing — but there is no list of times for a customer to choose
between. What a customer can do inside an open window is a booking-flow
question and is out of scope here; this spec only stops inventing slots that
were never offered.

Two rules that genuinely overlap can now emit the same start twice; the
projection de-duplicates by start, keeping the **larger** capacity, on the
grounds that a start offered by two rules is offered by both.

`freeIntervals` itself does not change — the exception and closure precedence
chain is still its job, and it is still the only place that decides it. What
changes is that the projection asks it per rule rather than once per day.

### Capacity subtracts, it does not veto

Today a busy interval removes a start outright. With capacity it counts
instead:

```
seatsTaken(start) = bookings overlapping [start, start + duration)
offered           = seatsTaken < (r.capacity ?? CAPACITY)
```

With capacity 1 — every rule today, and every rule after the migration until
somebody opens the field — this is exactly the current behaviour, which is
what makes the migration a no-op for existing providers.

The read model gains `capacity` and `seatsLeft` per start so the customer's
screen can say "2 lugares" rather than only "available".

## Frontend

### The wizard loses a step

`stepsFor` drops `timing`, so an organization selling a priced service walks
six steps instead of seven:

```
basics → booking → performers → pricing → languages → review
```

`CREATES_SERVICE` moves from `timing` to `booking` — it must be the last step
that always exists before `pricing`, and `performers` does not exist for an
individual provider. `service.create` stops sending `bufferMinutes` and
`slotIntervalMinutes`. `step-timing.tsx` and its i18n keys are deleted.

### The availability rule drawer gains three fields

In `rule-drawer.tsx`, under the days and times, in the reference screens' own
shape — a labelled card whose placeholder states the default rather than a
blank that says nothing:

```
Intervalo        Usar omissão: 0 min
Grelha           Usar omissão: 30 min
Capacidade       Usar omissão: 1 reserva
```

Empty input → `NULL` → default. Not a checkbox beside each one: "leave it
alone" and "type the same number the default happens to be" are the same
intent, and a second control to express it is a second thing to get wrong.

### The live preview

The availability page's week grid already draws the *window*. It gains a
second reading: the slots that window produces, with a count.

```
Semana de 10 ago    25 slots · 25 lugares
09:00–09:30  10:00–10:30  …
```

**This is where the duration decision bites.** The availability page does not
know which service is being booked, and duration lives on the option. Three
ways out, and the spec picks the third:

1. Move duration to the rule — rejected above; a barber cannot then sell a
   90-minute colour.
2. Preview the grid marks only (09:00, 09:30, 10:00 …) without lengths —
   honest, but it does not show the buffer working, which is half of what the
   provider is configuring.
3. **Preview against a chosen service.** A small picker above the grid —
   "prever para: Corte de cabelo" — defaulting to the provider's first
   published service. The preview is then exact, uses the real engine, and
   says out loud that slots depend on what is being booked.

With no published service yet, the preview falls back to option 2 and says so.

## Testing

Domain first, as everything in `scheduling` already is:

- `resolveShape(rule)` — the null-to-default resolution, one test per field
  and one for a rule with all three set.
- Grid `0` emits no starts, and is distinct from `NULL`, which emits the
  default grid's. The test that matters: a rule with `NULL` and a rule with
  `0` must not produce the same thing.
- Per-rule generation: two rules on one day with different grids emit both
  grids; the merged-interval version of this test is the regression that would
  catch a return to `freeIntervals`-then-generate.
- Overlapping rules emit a start once, at the larger capacity.
- Capacity: 1 behaves as today; N offers the start until N bookings overlap it.
- A rule with three nulls produces byte-identical output to today's engine —
  the migration's own safety net.

Then the projection against a seeded provider, and the two frontend suites
(`wizard-model.test.ts` for the six-step shape, the availability page test for
the drawer fields and the preview).

## Migration order

1. Add the three nullable columns. Deploy. Nothing reads them yet.
2. Ship the resolution helper and the per-rule projection, still reading
   `service.*` as the fallback when a rule is null. Both sources agree,
   because the service defaults and the system defaults are the same numbers.
3. Ship the drawer fields and the wizard's six steps.
4. Drop the two service columns.

Step 2 is what makes step 4 safe: at no point is there a deploy where the
engine has nowhere to read a buffer from.

## Out of scope

- Provider-level defaults above the rule (see above).
- A persisted slot table, holds, or seat expiry.
- `seasonStart` / `seasonEnd` from the reference model — Ntizo has no seasonal
  providers yet and a date-range override already exists.
- Selling seats: capacity is counted and offered here, but the booking flow's
  own concurrency check is a separate change.
