# Booking Seats — Design

**Status:** approved 2026-08-31. Supersedes the capacity half of
`booking_member_slot_no_overlap` as shipped in migration `0027`.

## The problem

Migration `0027` added an exclusion constraint so the database refuses two
overlapping bookings on one provider member:

```sql
EXCLUDE USING gist (provider_member_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status IN ('PENDING_PAYMENT','AWAITING_PROVIDER','CONFIRMED','MARKED_DONE'))
```

That closed a real hole — the index it replaced was on `(provider_member_id,
starts_at)`, so a 90-minute booking at 14:00 and a 30-minute one at 14:30 both
inserted. It also broke a feature nobody checked it against.

`member_availability.capacity` is a real column with a live UI. `startsForDay`
honours it: a start whose seats are not all taken is still offered, and
`seatsLeft` travels to the customer in the public availability DTO. The provider's
own card advertises it — *"{{bookings}} em simultâneo"*.

So today, with `capacity: 2`: customer one books 09:00–10:00; customer two opens
the modal and is offered 09:00 with `seatsLeft: 1`; customer two submits; the
insert raises `23P01` and they are refused at the last step of checkout. Capacity
above 1 is inert for a single member, and the product says otherwise on three
surfaces.

The whole-branch review found this. No task's review could have: each read the
constraint against the index it replaced, and the constraint's real counterparty
is the availability engine.

## What capacity means

One member, several customers at the same time. `member_availability.capacity` is
per weekly rule, nullable, and null means one — *"one barber cuts one head"*.
Above one is a member that stands for a room, a class, or a team behind a single
name.

Capacity is **not** a property of the provider or the service. It belongs to the
window, because a member may take three at a time on Saturday mornings and one on
Tuesday evenings.

## The design

### A seat number on every booking

`booking.seat`, `integer NOT NULL`, values from 1. The exclusion constraint gains
it:

```sql
EXCLUDE USING gist (
  provider_member_id WITH =,
  seat WITH =,
  tstzrange(starts_at, ends_at) WITH &&
) WHERE (status IN (…the four slot-holding statuses…))
```

Two bookings on one member may overlap **only if they hold different seats**.
`btree_gist` already supplies `integer WITH =`; it is installed.

This keeps the guarantee `0027` bought — at capacity 1 every booking takes seat 1
and the constraint behaves exactly as it does today — while letting capacity 3
hold three.

### Assignment: the lowest free seat, refused above capacity

The command resolves the rule covering the requested start, reads its capacity
(null → 1), and takes the **lowest seat number not occupied by an overlapping
slot-holding booking on that member**. If that number exceeds the capacity, the
booking is refused with the existing `SlotAlreadyTakenError` — the customer is
told the slot is taken, which is true.

Lowest-free rather than any-free is deliberate. It makes a capacity *reduction*
self-correcting: drop from 3 to 1 while seats 2 and 3 are occupied, and the lowest
free seat is 2, which exceeds 1, so nothing new joins. Existing bookings keep
their seats — a schedule change must never unbook somebody who already paid.

### An advisory lock, not a retry

Two concurrent bookings would otherwise both compute the same lowest free seat and
one would lose to the constraint. Rather than catching `23P01` and retrying the
next seat — which needs savepoints inside a transaction and a retry bound, in code
where a concurrency defect was fixed a week ago — the assignment is serialised:

```sql
SELECT pg_advisory_xact_lock(<hash of provider_member_id>, <civil day>)
```

Transaction-scoped, so it releases on commit or rollback without a `finally`. Taken
**before** reading occupancy and inside the same transaction as the insert, so no
window exists between deciding a seat and taking it.

The lock is per member per civil day, not per member — two customers booking the
same person on different days never wait for each other. It holds for the length
of one insert.

**The constraint stays.** The lock is what stops the race from happening; the
constraint is what makes it impossible for the race to matter if the lock is ever
bypassed — by a backfill, a manual `INSERT`, or a future code path that forgets.
Removing the constraint once the lock exists would be trading a guarantee for a
convention.

## The seat is not a snapshot

Every other value the booking copies — price, commission, names, address — is
frozen because a later edit must not rewrite a sale. The seat is different: it is
an assignment, not a fact about what was bought. It is stored because the
constraint needs it, and it is never shown to anybody.

It does not go in `bookingReadModel`, it does not go in any event payload, and it
does not go in the GraphQL schema. A customer has no concept of "seat 2", and
inventing one would be the first thing somebody built a feature on.

`booking_change` gains `previousSeat` when Plan 2 adds reschedule, because moving a
booking may move its seat. Not now.

## Migration

Three statements, in one file, in this order:

1. `ADD COLUMN seat integer NOT NULL DEFAULT 1` — every existing booking becomes
   seat 1, which is what they effectively were.
2. `DROP CONSTRAINT booking_member_slot_no_overlap`.
3. `ADD CONSTRAINT` with the seat in the key.

**Step 3 can fail on data step 2 permitted.** It is safe here only because `0027`
applied cleanly on dev, which proves no overlapping slot-holding pair exists —
every row can hold seat 1 without colliding. On a stage where `0027` has not run,
`0027` must run first and may itself fail; that is already recorded as its own
deployment consideration.

Like `0027`, `EXCLUDE` is beyond `drizzle-kit generate` and the statement is
hand-written into the generated file, flagged as such in the file itself.

The whole file takes `ACCESS EXCLUSIVE` on `booking` for its duration.

## Where the rules live, and the one that must not fork

The capacity for a start is resolved the same way `ListServiceAvailability` and
`DrizzleSlotValidityReader` already resolve a rule: through the shared scheduling
package. **A third reading of "which rule covers this instant" is the defect this
work exists to prevent, not a shape to reproduce.** If the existing resolution
cannot be reused without contortion, that is a finding to report, not to work
around.

`startsForDay` needs no change. It already counts occupancy against capacity; the
disagreement closes because the database stops refusing what the engine offers.

## What this does not cover

- **Hourly options.** Booking still refuses `pricingMode: "hourly"` (follow-up
  #94). Seats are indifferent to duration, so nothing here blocks that work.
- **The availability modal's default-option blind spot** (follow-up #97). Separate,
  and unchanged by this.
- **Organisations with several real members.** Capacity is one member serving
  several customers, not several members. A provider with three barbers models
  three members, and each gets its own seats.
- **Reschedule.** Plan 2. A reschedule moves `starts_at`/`ends_at` and may need a
  different seat, which is also when `save` must start catching `23P01` — recorded
  as follow-up #101.

## Testing

The tests that decide whether this is right:

- **Capacity 2, two overlapping bookings, both succeed** — and they hold different
  seats. Nothing in the branch currently sets capacity above 1; every existing
  fixture uses 1 and one test says so in its name.
- **Capacity 2, a third overlapping booking is refused.** Not "some booking fails"
  — the third specifically, with the named error.
- **Capacity reduced from 3 to 1 with seats 2 and 3 occupied**: existing bookings
  survive a read, and a new one is refused.
- **The constraint still refuses two bookings on the same seat**, so the guarantee
  `0027` bought is not quietly lost while making room for capacity.
- **The lock actually serialises.** Two real concurrent transactions against the
  live database, both assigning a seat for the same member and day, both
  succeeding with different seats. A sequential test cannot show this — the second
  transaction must genuinely block on the first, which is the mechanism the design
  depends on and the one thing a fake cannot demonstrate.

The last is the one to write first and the one most likely to be written so it
cannot fail.
