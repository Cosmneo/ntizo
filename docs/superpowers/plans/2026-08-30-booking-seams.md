# Booking Seams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the six defects the whole-branch review found in `feat/booking-core` — every one of them a seam between tasks or a wrong premise, none of them visible to a scoped review.

**Architecture:** No new structure. Booking gains one outbound call before it inserts, Scheduling gains a real adapter where a placeholder sits, the database gains a constraint it should always have had, and two commands stop trusting a stale read. The frontend stops adding a fee that the backend deducts.

**Tech Stack:** Bun, Drizzle over Neon Postgres, `@cosmneo/onion-lasagna`, Hono on Cloudflare Workers, React 19 + TanStack Router, vitest on the web package and `bun test` on the backend.

**Spec:** `docs/superpowers/specs/2026-08-28-booking-design.md`. BR3 is correct as written and as implemented — see Task 1. BR2 is the one this plan actually repairs.

## Global Constraints

- Money is integer minor units (centavos), never floats, never negative. Commission is basis points; 1000 bps is 10%.
- **The commission is deducted from the provider's payout.** `providerPayoutMinor = priceMinor − commissionMinor`. The price the provider set is the price the customer pays; nothing is added on top. Decided 2026-08-30.
- `domain/` imports nothing from `app/` or `infrastructure/`; `app/` imports nothing from `infrastructure/`. **Nothing enforces this mechanically** on the backend — `eslint-plugin-boundaries` is configured only for `apps/frontend/web` — so every task checks its own imports and every review checks them by hand.
- Backend tests are `bun test` with `"bun:test"` imports. `packages/shared` and `apps/frontend/web` use vitest.
- The `dev` database is shared with other worktrees and sessions. Randomise identifiers per run, use distinct timestamps, clean up. **If a database test fails, re-run that file alone before reporting it** — a contended run looks exactly like a broken one.
- Migrations are generated, never applied by an implementer. Applying is a manual act per stage.
- Any task adding a module under `modules/ntizo/` must add its `packages/backend/package.json` `exports` entry. Without it `tsc` and `bun test` in `packages/backend` both pass and only a cross-package build fails.
- Comments say *why*, not *what*.

---

### Task 1: The customer pays the price on the page

**Files:**
- Modify: `apps/frontend/web/src/features/directory/services/domain/booking-total.ts`
- Modify: `apps/frontend/web/src/features/directory/services/ui/rail-price-summary.tsx`
- Modify: `apps/frontend/web/src/features/directory/services/domain/__tests__/booking-total.test.ts`
- Modify: `apps/frontend/web/src/features/directory/services/ui/__tests__/rail-price-summary.test.tsx`
- Modify: `apps/frontend/web/src/features/directory/services/ui/__tests__/service-detail-page.test.tsx`
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/platform/schemas/platform-settings.schema.ts` (comment only)
- Modify: the `directory` locale files that carry `trustFeeIncluded`

**Interfaces:**
- Consumes: `ServiceDetailOptionDTO.amountMinor`.
- Produces: nothing new. `bookingTotal` either changes meaning or goes away — see below.

**The backend is right and the page is wrong.** `Booking` computes `providerPayoutMinor = priceMinor − commissionMinor`, which matches the decision made on 2026-08-30: the provider prices with the fee in mind, the calculation runs on the price they set, and the customer pays exactly that. The page currently adds 10% on top and tells the reader, in a doc comment, that the asymmetry is "the platform's permanent commercial model". Two of those three sentences must go.

A 1000 MT service at 10% is now: customer pays 1000, platform keeps 100, provider receives 900.

**Decide `bookingTotal`'s fate deliberately.** With nothing added, `totalMinor === packageMinor` and the function has no arithmetic left. Deleting it is the honest outcome, and its test with it. If anything still wants a breakdown, that breakdown belongs to the provider's own earnings view, not to a customer's price summary — do not keep a customer-facing function that returns its own input.

`NTIZO_COMMISSION_RATE = 0.1` is a hardcoded rate the backend already reads per provider from `provider.commission_bps`. Once the page stops adding it, the constant has no customer-facing job. Remove it rather than leaving a second source of truth for a number an administrator can change.

**The copy.** `trustFeeIncluded` sits in the rail's trust list. Read what it currently says in every locale before touching it: if it promises the fee is included in the number shown, that is now simply true and the string may stand. If it says the platform takes nothing from the provider, it is now false and must change. This is the kind of sentence a customer screenshots.

- [ ] **Step 1: Read the current copy in every locale**

```bash
grep -rn "trustFeeIncluded" apps/frontend/web/src apps/frontend/web/public 2>/dev/null
```

Report what each says before changing anything.

- [ ] **Step 2: Update the failing tests first**

`booking-total.test.ts` asserts `totalMinor = packageMinor + commissionMinor`. Rewrite the expectations to the new model, run them, and watch them fail against the current implementation. If you are deleting `bookingTotal`, delete its test file in the same step and move any surviving assertion about the displayed price into `rail-price-summary.test.tsx`.

- [ ] **Step 3: Change the implementation**

- [ ] **Step 4: Fix the doc comment on `default_commission_bps`**

It currently reads "The platform fee charged to the **customer** … Charged to the customer and never deducted from the provider — that is a permanent commitment of this product, not a default. There is deliberately no provider-side rate anywhere in this table, because a field is an invitation and this is one nobody should be able to accept."

Replace it with what is true now: the rate is deducted from the provider's payout, the provider sets a price with the fee in mind, and the customer pays the listed price. Keep the SEED framing — it is still a seed, copied onto `provider.commission_bps` at creation — and keep the basis-points reasoning. **Do not leave the old sentence commented out or hedged**; a comment recording a reversed decision as if it still held is worse than one that says nothing.

- [ ] **Step 5: Run the web suite and typecheck**

Run: `cd apps/frontend/web && bun run test && bun run typecheck`

- [ ] **Step 6: Look at the page**

Run the app and open a service detail page. The rail's headline number, the breakdown, and the trust list must agree with each other and with what a booking would actually charge. A number that is right in three files and wrong on screen is the failure this step exists to catch.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/web/src packages/backend/src/modules/ntizo/shared/infrastructure/database/platform
git commit -m "Charge the customer the price on the page

The page added 10% on top and called the asymmetry a permanent
commercial model. The backend deducts the same 10% from the provider's
payout. Both could not be true, and the decision of 2026-08-30 is that
the provider prices with the fee in mind: the customer pays what they
see and the provider receives the rest.

The rate also stops being a frontend constant. It is per provider and an
administrator can change it, so a hardcoded 0.1 on the page was a second
source of truth for a number that already had one."
```

---

### Task 2: Booking asks whether the slot is real

**Files:**
- Create: `.../booking/app/ports/outbound/slot-validity.reader.port.ts`
- Create: `.../booking/infrastructure/repositories/drizzle/slot-validity.reader.ts`
- Modify: `.../booking/app/use-cases/create-booking.command.ts`
- Modify: `.../booking/domain/exceptions.ts`
- Modify: `.../booking/bootstrap/index.ts`
- Modify: `.../booking/__tests__/create-booking.command.test.ts`
- Test: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/slot-validity.reader.test.ts`

**Interfaces:**
- Consumes: `service_member`, `provider`, and Scheduling's availability rules.
- Produces: `SlotValidityReaderPort.check({ serviceId, serviceOptionId, providerMemberId, startsAt, durationMinutes })` returning a discriminated result the command turns into a named refusal.

**What is wrong today.** `bookingCreate` takes `providerMemberId` and `startsAt` from the client and checks neither against anything but a foreign key. `ListServiceAvailability` — the query behind the availability modal — already enforces that the member performs the service (`ServiceMemberCannotPerformError`) and that the provider is active, and explains why: `provider.status` defaults to `pending`, and a workspace suspended after trading has already distributed its ids.

So a signed-in user can post provider B's member id with provider A's option id. The booking is created with A's `provider_id` and B's member, and the partial unique index then blocks B's member at that instant against every real customer — while every provider-side query filters on `provider_id`, so B never sees it. That is a free, repeatable calendar denial-of-service against a competitor.

The same field is why the mutation's own doc comment is only two thirds right. It argues that omitting `customerId` and `durationMinutes` makes a class of bug unwritable. `providerMemberId` is the third field of that class and it was left in.

**This closes four findings at once**: the member/service check, the provider-status check, the past-or-off-grid `startsAt`, and the honest half of the double-booking problem. The database constraint in Task 4 is the other half — this one gives a customer a good error before they pay, that one makes the race impossible.

- [ ] **Step 1: Write the failing tests**

Command-level, with a fake reader. Assert each refusal is its own named error and that **nothing is written** in any of them — the fake repository, the fake hold and the fake outbox must all be untouched:

- a member who does not perform this service;
- a member belonging to a different provider than the option's;
- a provider whose status is not active;
- a `startsAt` in the past;
- a `startsAt` that is not an offered slot for that member;
- the happy path still creates a booking.

Then a database-level test for the reader itself, against the real dev database, covering the member/service join and the provider-status filter with rows that would pass if either predicate were dropped.

- [ ] **Step 2: Run to verify they fail**
- [ ] **Step 3: Write the port, the reader and the refusals**

Read `list-service-availability.projection.ts` first and reuse its rules rather than restating them — if the two disagree, a slot the modal offers becomes a booking the command refuses, which is worse than either rule alone.

- [ ] **Step 4: Wire it into the command and the bootstrap**

The check runs **before** anything is written, alongside the existing six refusals. Extend the mutation schema's doc comment: the argument about unwritable bugs now has to account for the field that stayed.

- [ ] **Step 5: Run the suites and typecheck**

Run: `cd packages/backend && bun test src && bun run typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo
git commit -m "Refuse a slot nobody offered

providerMemberId came from the client and was checked against nothing
but a foreign key, so a booking could name provider A's service and
provider B's member. The partial unique index then held B's calendar
against every real customer, invisibly, because every provider-side
query filters on provider_id.

The rules are Scheduling's, not new ones: the availability projection
already refuses a member who cannot perform the service and a provider
who is not active, and a slot the modal offers must not be a booking the
command rejects."
```

---

### Task 3: Scheduling learns that bookings exist

**Files:**
- Create: `.../scheduling/infrastructure/repositories/drizzle/booking-busy.adapter.ts`
- Delete: `.../scheduling/infrastructure/repositories/drizzle/no-bookings-busy.adapter.ts`
- Modify: `.../scheduling/bootstrap/index.ts`
- Modify: `.../public/scheduling/bootstrap.ts`
- Test: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/booking-busy.adapter.test.ts`

**Interfaces:**
- Consumes: the `booking` table, `SLOT_HOLDING_STATUSES`.
- Produces: `BusyIntervalsPort.forMembers(...)` returning real intervals.

**`NoBookingsBusyAdapter` returns an empty map**, and its own doc comment says why: *"No bookings exist yet — that is slice 4. Shipped as a real adapter rather than an inline `[]` so slice 4 replaces one class in one bootstrap line."* This is slice 4. `docs/superpowers/follow-ups.md` entries #34 and #38 both carry the trigger *"slice 4, the moment the port returns real bookings"*.

Until this lands, a booked slot is still offered to the next customer, who fills in the whole checkout and is refused at the last step — the worst place to be told.

**Busy means slot-holding, not merely existing.** Use `SLOT_HOLDING_STATUSES` — the same constant the partial unique index is built from — so a declined, cancelled or expired booking releases its time in the modal at the same moment it releases it in the database. Do not retype the list.

- [ ] **Step 1: Write the failing test**

Against the real database. A `PENDING_PAYMENT` booking makes its interval busy; an `EXPIRED` one at the same time does not; a booking for a different member does not appear under this member's key; and two bookings on one member on one day both appear. Include a member with no bookings and assert an empty list rather than a missing key, if that is what the port's consumers expect — read `list-service-availability.projection.ts` to find out which, and say in a comment which it is.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Write the adapter and swap the two bootstrap lines**

Delete the placeholder rather than leaving it beside the real one. A permissive adapter left in the tree is one bootstrap line from being live again, and its name stops reading as a warning the moment it is not the one in use.

- [ ] **Step 4: Run the suites and typecheck**
- [ ] **Step 5: Prove it end to end**

Create a booking through `bookingCreate`, then ask `/public/graphql` for that member's availability on that date and confirm the slot is gone. This is the only step that proves the two contexts actually meet; every test above proves one side of the seam.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo
git commit -m "Stop offering slots that are already booked

The busy-intervals adapter returned an empty map and said in its own
comment that real bookings were slice 4's job. This is slice 4, and two
follow-up entries had been waiting on exactly this line.

Busy is read from SLOT_HOLDING_STATUSES, the same constant the partial
unique index is built from, so a cancelled booking frees its time in the
modal at the same moment it frees it in the database."
```

---

### Task 4: The database refuses an overlap

**Files:**
- Modify: `.../shared/infrastructure/database/booking/schemas/booking.schema.ts`
- Create: a migration (generate only; do not apply)
- Modify: `.../shared/infrastructure/database/__tests__/booking-constraints.test.ts`

**Interfaces:**
- Consumes: `SLOT_HOLDING_STATUSES`.
- Produces: an exclusion constraint over `(provider_member_id, tstzrange(starts_at, ends_at))`, plus two indexes.

**The unique index only catches identical start instants.** `booking_member_slot_active_uq` is on `(provider_member_id, starts_at)`, `ends_at` is not in it, and nothing re-checks. So a 90-minute booking at 14:00 and a 30-minute booking at 14:30 both insert — and 14:30 is a legal grid start the availability modal offers, because `slot_interval_minutes` is 30. The member is double-booked and both customers pay. Every existing test collides on identical `starts_at`, which is why nothing caught it.

The shape that actually holds:

```sql
ALTER TABLE "ntizo_booking"."booking"
  ADD CONSTRAINT "booking_member_slot_no_overlap"
  EXCLUDE USING gist (
    provider_member_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('PENDING_PAYMENT','AWAITING_PROVIDER','CONFIRMED','MARKED_DONE'));
```

`btree_gist` must be installed for a `uuid WITH =` operand. Add `CREATE EXTENSION IF NOT EXISTS btree_gist;` ahead of it and check it succeeds on Neon before assuming it will.

**Decide what happens to the old index, and say why in the comment.** The exclusion constraint subsumes it — an identical start is a degenerate overlap. Keeping both means two constraints that can disagree only if one is wrong. Removing it means the repository's `isSlotCollision` must catch the new constraint's name too, and its SQLSTATE is `23P01`, not `23505`. Whichever you choose, `booking.repository.ts` must map both codes to `SlotAlreadyTakenError` or the honest race becomes a 500.

**Two missing indexes belong in the same migration.** The expiry sweep runs `WHERE status='PENDING_PAYMENT' AND expires_at <= $1 ORDER BY expires_at ASC LIMIT 200` every sixty seconds forever, and neither existing index serves it — the composite's leading column is `provider_id`. That is a sequential scan plus a sort of the whole table, every minute, on a Worker's single connection. `booking.mine` runs `WHERE customer_id = $1 ORDER BY created_at DESC` with no index either. Both are invisible to every gate because every fixture holds a handful of rows.

- [ ] **Step 1: Write the failing test**

The overlap case in full: insert 14:00–15:30, then attempt 14:30–15:00 on the same member and assert it is refused, naming the constraint. Then the cases that must still succeed — the same overlap on a *different* member, and the same overlap once the first booking is `EXPIRED`.

Use the file's async-helper idiom. **Never hand a Drizzle query builder to `expect(...).rejects`**: a builder is a thenable, not a Promise, `.rejects` will not run it, and the assertion passes on the builder regardless of what Postgres would have done. That bug shipped in this exact file.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Add the constraint and the indexes, then generate the migration**

Run: `cd packages/backend && bun run db:ntizo:generate`

Drizzle may not express an exclusion constraint; if it does not, hand-write those statements into the generated file and say so in your report. Read the whole file before committing: no `DROP` you did not intend, and **no `$1`-style bind parameters** — a migration cannot carry them, and building a predicate with a query-builder helper is how they get in. Use `sql.raw` from the constants, as `booking.schema.ts` already does.

**Do not run any migrate command.**

- [ ] **Step 4: Teach the repository the new error code**
- [ ] **Step 5: Run the suites and typecheck**

The new constraint tests stay red until the migration is applied. Say so in your report rather than treating it as a failure.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo
git commit -m "Refuse two bookings that overlap on one member

The unique index was on (member, starts_at), so it only ever caught an
identical start. A 90-minute booking at 14:00 and a 30-minute one at
14:30 both inserted, and 14:30 is a grid start the availability modal
offers. Every existing test collided on the same instant, which is why
nothing caught it.

The expiry sweep's and the customer list's indexes go in the same
migration: the sweep sequentially scanned the whole table every sixty
seconds and no fixture is large enough for any gate to notice."
```

---

### Task 5: Two writers cannot both win

**Files:**
- Modify: `.../booking/infrastructure/repositories/drizzle/booking.repository.ts`
- Modify: `.../booking/app/use-cases/mark-booking-paid.command.ts`
- Modify: `.../booking/app/use-cases/expire-booking.command.ts`
- Modify: `.../booking/domain/aggregates/booking.aggregate.ts`
- Modify: `apps/backend/api/src/scheduled.ts`
- Modify: `.../booking/__tests__/booking-lifecycle.command.test.ts`
- Modify: `.../booking/__tests__/booking.aggregate.test.ts`

**Interfaces:**
- Produces: `save(booking, expectedStatus)` — or an equivalent guard — returning whether it applied.

**The lost update.** Both commands read, transition, and write inside `atomicExecute`, and `save` is `UPDATE … WHERE id = $1` with no version column and no status predicate. The transaction runs at READ COMMITTED and nothing takes `FOR UPDATE`.

So: the window closes at T. The sweep selects the booking as `PENDING_PAYMENT` at T+0.4s; the M-Pesa webhook selects the same row as `PENDING_PAYMENT` at T+0.5s. Both compute a real transition, the second `UPDATE` waits on the row lock and then applies over the first, and **both outbox rows are written and both drain**. Either the customer is told they paid while the row says `EXPIRED` and the slot is gone, or the row says `AWAITING_PROVIDER` while `BookingExpired` has already told Scheduling and Notification otherwise. Nothing detects either.

M-Pesa's C2B is synchronous against a fifteen-minute window, so approvals land near the deadline routinely. This is not a theoretical race.

The aggregate's identity-based idempotency cannot help: it reasons about a value read before the conflict.

Put the expected status in the `WHERE` and treat zero rows affected as "somebody else moved it" — the command then returns without publishing, exactly as it does for a no-op transition.

**Three smaller repairs belong in this task**, because they touch the same two commands and the same handler:

**`markPaid` still throws at `COMPLETED` and `DISPUTED` for a matching reference.** The current discriminator is "does this status still hold the slot?", so a duplicate webhook is absorbed at `MARKED_DONE` and raises one status later — and a retry landing after the work finished is the *most* likely late duplicate. The right discriminator is the payment reference: the same reference is always a duplicate, whatever the status; a different one is always a second transaction. Move the reference comparison above the slot-holding branch.

**`expiresAt` stops being nulled on transition.** It was nulled so a later query could not act on it, but the sweep filters on `status = 'PENDING_PAYMENT'` first and the repository's own comment says the `IS NOT NULL` is "belt-and-braces on top of the status filter, not a second filter doing real work". So nulling buys nothing, and it destroys the deadline a customer disputing "you gave my slot away" would need. It also contradicts Task 13's own justification for the setting being LIVE — that bookings already made keep the deadline they were given.

**The cron's two sweeps get their own `try` blocks.** They currently share one, notification first, so anything Communication throws skips booking expiry entirely — reinstating the permanent slot leak the sweep exists to prevent, from an unrelated context.

- [ ] **Step 1: Write the failing tests**

- Two commands transition the same booking from the same stale read; assert exactly one publishes and the row's final status matches whichever won.
- `markPaid` with the same reference at `COMPLETED` and at `DISPUTED` is a no-op, not a throw.
- `markPaid` with a *different* reference throws at every status, including the slot-holding ones.
- `expiresAt` survives `markPaid` and `expire`.
- A throwing notification sweep still runs the booking sweep.

- [ ] **Step 2: Run to verify they fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run the suites and typecheck**
- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo apps/backend/api/src/scheduled.ts
git commit -m "Stop a payment and an expiry both winning

Both commands read, transition and write under READ COMMITTED with no
status predicate in the UPDATE, so a webhook arriving as the sweep runs
produced two transitions from one stale read and two outbox rows. The
customer is told they paid while the row says EXPIRED, or the row says
paid while BookingExpired has already told Scheduling otherwise.

markPaid also stopped discriminating on the wrong thing: a duplicate is
a duplicate because the payment reference matches, not because the
booking still holds its slot -- and a retry landing after the work
finished is the likeliest late duplicate there is.

expiresAt is no longer nulled. The status filter was already doing that
work, and the deadline is the fact a disputed booking needs most."
```

---

### Task 6: The events say enough, and the comments stop lying

**Files:**
- Modify: `.../booking/domain/events/index.ts`
- Modify: `.../booking/__tests__/booking-events.test.ts`
- Modify: `.../shared/infrastructure/database/booking/enums.ts` (comment only)
- Modify: `.../booking/app/ports/outbound/booking.repository.port.ts` (comment only)
- Move: `.../booking/app/ports/outbound/booking-read.repository.port.ts` → `read/booking/app/ports/outbound/`
- Move: `.../booking/infrastructure/repositories/drizzle/booking-read.repository.ts` → `read/booking/infra/repositories/drizzle/`
- Modify: `read/booking/bootstrap/index.ts`

**Interfaces:**
- Produces: `BookingExpired` gains `customerId`; `BookingPaid` gains `startsAt`, `endsAt`, `providerMemberId`.

**Two events carry less than their consumers need — the exact defect that was fixed for the third.** `booking.created` was given `providerMemberId` and `endsAt` precisely so a consumer marking a slot held would not have to read the booking back. `booking.expired` has no `customerId`, so Notification cannot tell the customer their booking expired without that same read. `booking.paid` has no slot at all, so "your booking is paid, awaiting confirmation" cannot name a time. Cheap now; a versioning problem once Payment and Notification consume them.

**Three comments say things the rulings that followed made false.**

- `enums.ts` recommends building the index predicate with Drizzle's `inArray`. That was replaced by `sql.raw`, and `booking.schema.ts` spends thirty lines explaining why `inArray` is wrong here — while the enum, which a reader reaches first, still recommends it.
- `booking.repository.port.ts` says `findDueForExpiry` is Task 12's to implement and Task 6's only to declare. The opposite is true and the plan was amended to say so.
- `read/booking/bootstrap/index.ts` claims a thin reader means "rendering nineteen bookings and skipping the odd one". The projection is a plain `.map` with no per-row guard; nothing skips anything. The real benefits — no `restore` cost, no `restore` throw — are true and should stay. The invented one should go.

**And the read tier's port and adapter sit inside the write bounded context.** `read/wallet` is the precedent and does the opposite: its own `app/ports/outbound/` and its own `infra/repositories/drizzle/`. `read/communication`, `read/provider` and `read/user` all carry their own `infra/` too. Moving them is mechanical and makes the tier boundary mean what it says.

- [ ] **Step 1: Extend the event tests**

Assert the new fields round-trip, with fixture values distinct from every other id and date, so a mis-bound field cannot pass by coincidence.

- [ ] **Step 2: Run to verify they fail**
- [ ] **Step 3: Add the fields, rewrite the three comments, move the two files**
- [ ] **Step 4: Run the whole backend suite and typecheck**

Run: `cd packages/backend && bun test src && bun run typecheck`

- [ ] **Step 5: Prove the schema still builds**

```bash
cd apps/backend/api && bun run dev
curl -s -X POST http://localhost:8788/graphql -H 'Content-Type: application/json' -d '{"query":"{ __typename }"}'
curl -s -X POST http://localhost:8788/public/graphql -H 'Content-Type: application/json' -d '{"query":"{ __typename }"}'
```

Both. Moving a module is exactly the change that breaks resolution without breaking `tsc`.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo
git commit -m "Let the other two events answer their consumers too

booking.created was given the member and the slot's end so a consumer
would not have to read the booking back. booking.expired still has no
customerId and booking.paid has no slot, so Notification cannot name
who to tell or when. The argument was right the first time; it was
applied to one event of three.

Three comments also outlived the decisions they described -- one
recommends the inArray that a thirty-line comment elsewhere explains is
wrong, one assigns a method to the task that did not write it, and one
claims a per-row guard that does not exist."
```

---

## Self-Review

**Spec coverage.** BR2 is what this plan repairs: Tasks 2, 3 and 4 together make "the slot must be free for the chosen staff member, and held atomically" true rather than nearly true. BR1's provider half arrives in Task 2. BR3 needed no code change — the implementation was right and the *page* was wrong, which Task 1 fixes. BR5's idempotency is tightened in Task 5. BR4, BR6 and BR7's provider half remain Plan 2's, as before.

**One thing this plan does not fix.** Reviewing is impossible in production: nothing can set a booking to `COMPLETED`, and the new eligibility adapter requires one. It blocks only *new* reviews — a revise reuses the stored booking id — and nothing in the frontend calls the mutation, so it is latent. It is a decision, not a defect: accept the freeze until Plan 2 ships the completion transition, or keep the permissive adapter one more plan. **Left open deliberately, recorded here so it is not rediscovered.**

**Placeholder scan.** Task 4's exclusion constraint is given as literal SQL because Drizzle may not express it and a paraphrase would be a guess. Task 1's copy decision is deliberately not pre-decided: the current strings must be read first, and inventing replacements for text nobody has looked at is how a false promise gets translated into eight locales.

**Type consistency.** `SLOT_HOLDING_STATUSES` is the single list behind the partial index, the new exclusion constraint (Task 4) and the busy-intervals adapter (Task 3). `SlotAlreadyTakenError` is raised for both `23505` and `23P01` after Task 4. `expiresAt` stays `Date | null` on the aggregate — Task 5 stops the transitions nulling it but `create` still requires one, so the type is unchanged.

**Ordering.** Task 4's migration must be applied before Task 3's end-to-end proof means anything, and migration `0026` must be applied before `bookingCreate` works at all in any environment. Both are manual acts; the controller asks.
