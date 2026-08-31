# Booking Seats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a member with `capacity > 1` hold that many overlapping bookings, without giving back the overlap guarantee migration `0027` bought.

**Architecture:** Every booking gains a seat number. The exclusion constraint gains it too, so two bookings on one member overlap only on different seats. The command asks for the lowest free seat and is refused above capacity; a transaction-scoped advisory lock per member per civil day serialises that assignment so the constraint is a backstop rather than a race arbiter.

**Tech Stack:** Bun, Drizzle over Neon Postgres (17.11, `btree_gist` installed), `@cosmneo/onion-lasagna`, `bun test`.

**Spec:** `docs/superpowers/specs/2026-08-31-booking-seats-design.md`. Read it — it carries the reasoning this plan only executes.

## Global Constraints

- Money is integer minor units; commission is basis points. Untouched by this work but the aggregate's guards still apply.
- `domain/` imports nothing from `app/` or `infrastructure/`; `app/` imports nothing from `infrastructure/`. **Nothing enforces this mechanically** on the backend — `eslint-plugin-boundaries` is configured only for `apps/frontend/web` — so every task checks its own imports and every review checks them by hand.
- Tests are `bun test` with `"bun:test"` imports, run **from `packages/backend`**, never the worktree root — the root discovers 298 files and fails on a missing `DEV_DB_URL`.
- The `dev` database is shared with other worktrees and sessions. Randomise identifiers per run, use distinct timestamps, clean up. **Re-run a failing database test alone before reporting it** — a contended run looks exactly like a broken one.
- Migrations are generated, never applied by an implementer. Applying is a manual act per stage.
- **The seat is never exposed.** Not in `bookingReadModel`, not in an event payload, not in GraphQL. A customer has no concept of it.
- **There must not be a third reading of "which rule covers this instant."** `ListServiceAvailability` and `DrizzleSlotValidityReader` already share one through the shared scheduling package. If reuse turns out to need contortion, that is a finding to report, not to work around.
- Comments say *why*, not *what*.
- Baseline before this plan: **1211 pass, 0 fail** in `packages/backend`.

---

### Task 1: The seat column and the constraint that uses it

**Files:**
- Modify: `.../shared/infrastructure/database/booking/schemas/booking.schema.ts`
- Create: a migration (generate, hand-edit, **do not apply**)
- Modify: `.../shared/infrastructure/database/__tests__/booking-constraints.test.ts`

**Interfaces:**
- Produces: `booking.seat`, and `booking_member_slot_no_overlap` re-created with `seat WITH =` in its key.

**The order matters and step 3 can fail on data step 2 allowed.** Add the column with `DEFAULT 1 NOT NULL` first, so every existing row is seat 1; drop the old constraint; add the new one. It is safe only because `0027` applied cleanly on dev, which proves no overlapping slot-holding pair exists — every row can be seat 1 without colliding. Say that in the migration's own comment, because on a stage where `0027` never ran this is not true.

`EXCLUDE` is beyond `drizzle-kit generate`, as it was for `0027`. Hand-write those statements into the generated file and flag them there. Read the whole file before committing: no `DROP` you did not intend, and **no `$1`-style bind parameters** — a migration cannot carry them, and building a predicate with a query-builder helper is how they get in. Use `sql.raw` from the constants, as `booking.schema.ts` already does.

- [ ] **Step 1: Write the failing tests**

Extend the existing `booking_member_slot_no_overlap` describe block:

- two overlapping bookings on one member with **different seats** both insert;
- two overlapping bookings on one member with the **same seat** are refused, naming the constraint;
- the existing non-overlap cases still pass unchanged — a different member, and the same slot once the first booking is `EXPIRED`.

Use the file's async-helper idiom. **Never hand a Drizzle query builder to `expect(...).rejects`** — a builder is a thenable, not a Promise, `.rejects` will not run it, and the assertion passes on the builder regardless of what Postgres would have done. That bug shipped in this exact file once.

Extend the `pg_get_constraintdef` check to assert the definition now names `seat`, in both directions as it already does for the statuses.

- [ ] **Step 2: Run to verify they fail**
- [ ] **Step 3: Add the column and re-create the constraint, then generate**

Run: `cd packages/backend && bun run db:ntizo:generate`

- [ ] **Step 4: Run the suites and typecheck**

The new constraint tests stay red until the migration is applied. Say so in your report, precisely which and why, rather than treating it as a failure.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo
git commit -m "Give a booking a seat, and the constraint a reason to allow two

0027's constraint refused any two overlapping bookings on one member,
which is right at capacity 1 and wrong for a member who takes three at
a time -- a room, a class, a team behind one name. The availability
engine already counts seats and the provider's card already advertises
them; only the database disagreed.

With the seat in the exclusion key, two bookings overlap only on
different seats. At capacity 1 everything is seat 1 and the guarantee
0027 bought is unchanged."
```

---

### Task 2: The reader answers how many seats a start has

**Files:**
- Modify: `.../booking/app/ports/outbound/slot-validity.reader.port.ts`
- Modify: `.../booking/infrastructure/repositories/drizzle/slot-validity.reader.ts`
- Modify: `.../shared/infrastructure/database/__tests__/slot-validity.reader.test.ts`

**Interfaces:**
- Produces: `capacity: number` on the reader's success result.

**Consumes: the rule resolution that already exists.** The reader resolves the covering rule today to answer whether the start is offered at all. Capacity comes off the same rule — `member_availability.capacity`, nullable, **null means 1**. Do not add a second resolution; return what the existing one already has in hand.

The success shape changes from a bare `ok` to one carrying the number, so the command has it without a second query. The refusal shapes are unchanged.

- [ ] **Step 1: Write the failing tests**

Against the real database:

- a rule with `capacity: 3` yields `capacity: 3`;
- a rule with `capacity: null` yields `capacity: 1` — the null-means-one rule, which is where a silent zero would come from;
- a member with two rules on different weekdays yields each day's own capacity, so the resolution is per-window rather than per-member.

Every existing fixture in this file uses capacity 1 and one test says so in its name. **That is the blind spot this whole plan exists to close** — write at least one fixture above 1.

- [ ] **Step 2: Run to verify they fail**
- [ ] **Step 3: Widen the result**
- [ ] **Step 4: Run the suites and typecheck**
- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo
git commit -m "Let the slot check say how many fit, not just whether one does

Capacity lives on the rule the reader already resolves to decide
whether a start is offered. Returning it costs nothing and saves the
command a second reading of the same window -- a third definition of
which rule covers an instant is the defect this work exists to close."
```

---

### Task 3: Assigning a seat, under a lock

**Files:**
- Modify: `.../booking/app/ports/outbound/booking.repository.port.ts`
- Modify: `.../booking/infrastructure/repositories/drizzle/booking.repository.ts`
- Modify: `.../booking/app/use-cases/create-booking.command.ts`
- Modify: `.../booking/__tests__/create-booking.command.test.ts`
- Test: `.../shared/infrastructure/database/__tests__/booking-seat-assignment.test.ts`

**Interfaces:**
- Produces: `insert(booking, capacity)` — the repository assigns the seat.

**Why the repository and not the command.** The seat is a database mechanic: it needs the lock, the occupancy query and the constraint, all in one transaction. The command's job is to know the capacity and to turn a refusal into a named error.

**The lock.** `pg_advisory_xact_lock(<member>, <civil day>)`, transaction-scoped so it releases on commit or rollback with no `finally`. Taken **before** reading occupancy and inside the same transaction as the insert — a lock taken after the read leaves exactly the window it exists to close.

Per member **per civil day**, not per member: two customers booking the same person on different days must not wait for each other. Derive the civil day in the provider's timezone, the way `DrizzleBookingBusyAdapter` already does — a lock keyed on a UTC day would serialise the wrong pairs near midnight.

**The assignment.** Lowest seat number not occupied by an overlapping slot-holding booking on that member. Refuse with `SlotAlreadyTakenError` if that number exceeds the capacity. Lowest-free rather than any-free is what makes a capacity reduction self-correcting: drop 3 → 1 with seats 2 and 3 occupied, and the lowest free is 2, which exceeds 1, so nothing new joins while existing bookings survive.

- [ ] **Step 1: Write the failing tests**

Command-level, with fakes: a refusal above capacity surfaces `SlotAlreadyTakenError` and **nothing is written** — assert the fake hold port was never called and the fake outbox is empty, not merely that no booking came back.

Then against the real database, and these are the ones that decide the task:

- capacity 2, two overlapping bookings, **both succeed and hold different seats**;
- capacity 2, a third overlapping booking is refused — the third specifically, with the named error;
- capacity reduced from 3 to 1 with seats 2 and 3 occupied: the existing bookings still read back, and a new one is refused;
- the same seat is still refused for two overlapping bookings, so Task 1's guarantee is not lost while making room.

- [ ] **Step 2: The concurrency test — write this one first**

Two **real concurrent transactions** against the live database, both assigning a seat for the same member and civil day, both succeeding with different seats.

A sequential test cannot show this: the second call would see its own transaction's write and pick the next seat whether or not a lock exists. The second transaction must genuinely block on the first — that is the mechanism the design depends on, and the one thing no fake can demonstrate.

**Prove it bites.** Remove the `pg_advisory_xact_lock` call, run the test, and show it failing — either both transactions choosing the same seat and one raising `23P01`, or a deadlock. Restore, verify the file is byte-identical, and include that as evidence. A test written for a lock, that passes without the lock, is worse than no test: it stops the next person looking.

- [ ] **Step 3: Run to verify they fail**
- [ ] **Step 4: Implement the assignment and thread the capacity through**
- [ ] **Step 5: Run the suites and typecheck**

Run: `cd packages/backend && bun test src && bun run typecheck`

- [ ] **Step 6: Prove it end to end**

Set a real member's rule to `capacity: 2`, then drive **two real `bookingCreate` mutations** through `/graphql` for the same overlapping slot. Both must succeed. A third must be refused. Paste all three exchanges into your report.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo
git commit -m "Assign the lowest free seat, one booking at a time

A transaction-scoped advisory lock per member per civil day serialises
assignment, so two customers booking the same slot never compute the
same seat. The exclusion constraint stays as the backstop -- the lock
stops the race, the constraint makes it not matter if a backfill or a
future path ever skips the lock.

Lowest-free rather than any-free: drop capacity from 3 to 1 with seats
2 and 3 taken and the lowest free is 2, which exceeds 1, so nothing new
joins and nobody already booked is turned away."
```

---

## Self-Review

**Spec coverage.** The seat column, the constraint, lowest-free assignment, the advisory lock, the capacity-reduction behaviour and the never-expose rule all have a task. The spec's five named tests map onto Tasks 1 and 3.

**What this plan does not fix.** Hourly options stay refused (#94). The availability modal's default-option blind spot is untouched (#97). `save` still does not catch `23P01` (#101) — and note that this plan does not make that reachable either, since no transition here moves a booking's slot.

**Placeholder scan.** Task 3's lock is given as the exact call rather than described, because "take a lock" is the kind of instruction that produces a session-scoped one that never releases.

**Type consistency.** `capacity` is `number` everywhere and null-means-one is resolved once, in Task 2's reader. `insert(booking, capacity)` is the only signature change; `save` is untouched, so Task 5 of the previous plan's compare-and-swap is unaffected.

**Ordering.** Task 1's migration must be applied before Task 3's database tests mean anything. Task 2 is independent of the migration and can land between them. The controller asks before applying.
