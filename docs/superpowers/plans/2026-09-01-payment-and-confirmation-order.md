# Payment and Confirmation Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reverse the booking flow to the order the approved mockup shows — the customer requests, the provider confirms, and only then does the money move — and make an M-Pesa charge actually happen.

**Architecture:** A `DRAFT` state gives the mockup's countdown something real to hold. `markPaid` moves to after the provider's yes. Three clocks replace one, swept by the cron that already wakes every minute. The M-Pesa C2B call is initiated from that sweep rather than from a request, because by then nobody is waiting on a spinner.

**Tech Stack:** Bun, Drizzle over Neon Postgres 17, `@cosmneo/onion-lasagna`, Hono on Cloudflare Workers, `bun test`.

**Spec:** `docs/superpowers/specs/2026-09-01-payment-and-confirmation-order-design.md`. Read it — it carries the reasoning, and the failure case that is most of the design.

## Global Constraints

- Money is integer minor units (centavos), never floats. Commission is basis points and is **deducted from the provider's payout**; the price the provider set is what the customer pays. Decided 2026-08-30.
- **`SLOT_HOLDING_STATUSES` is one list, read by the TypeScript union, the exclusion constraint's predicate, the seat assignment and the availability engine.** Adding `DRAFT` to it changes all four. The constraint's predicate is hand-typed into a migration and cannot be generated — the `pg_get_constraintdef` test asserting the predicate matches that constant **in both directions** is what catches a forgotten migration. Do not weaken it.
- **Never write drizzle-kit's statement separator inside a migration comment.** It splits on that literal string wherever it appears, so a comment describing the syntax becomes the syntax and Postgres receives an empty statement (`42601` at position 1). That cost a round on 2026-08-31.
- **Never hand a Drizzle query builder to `expect(...).rejects`.** A builder is a thenable, not a Promise; `.rejects` will not run it and the assertion passes regardless of what Postgres would have done. That bug shipped once in `booking-constraints.test.ts`.
- **The seat is never exposed** — not in a read model, not in an event payload, not in GraphQL.
- `domain/` imports nothing from `app/` or `infrastructure/`; `app/` imports nothing from `infrastructure/`. **Nothing enforces this on the backend** — `eslint-plugin-boundaries` is configured only for `apps/frontend/web` — so every task checks its own imports and every review checks by hand.
- Tests are `bun test` with `"bun:test"` imports, run **from `packages/backend`**, never the worktree root — the root discovers 298 files and fails on a missing `DEV_DB_URL`.
- The `dev` database is shared. Randomise identifiers, use distinct timestamps, clean up, and **re-run a failing database test alone before reporting it** — a contended run looks exactly like a broken one.
- Migrations are generated, never applied by an implementer. Applying is a manual act per stage.
- **One implementer at a time.** The git index in this worktree is shared state: `git add <paths> && git commit` commits the index, not the paths. Use `git commit -m "…" -- <paths>` and verify with `git show --stat`.
- **No M-Pesa credential ever reaches the repository.** Not in a test fixture, not in a comment, not in a committed `.env`.
- Comments say *why*, not *what*.
- Baseline before this plan: **1227 pass, 0 fail** in `packages/backend`.

---

### Task 1: A third clock, and a state to hold it

**Files:**
- Modify: `.../shared/infrastructure/database/booking/enums.ts`
- Modify: `.../shared/infrastructure/database/booking/schemas/booking.schema.ts`
- Modify: `.../shared/infrastructure/database/platform/schemas/platform-settings.schema.ts`
- Create: a migration (generate, hand-edit the `EXCLUDE`, **do not apply**)
- Modify: `.../shared/infrastructure/database/__tests__/booking-constraints.test.ts`
- Modify: `packages/shared/src/read-models/system/booking/booking.schema.ts` if the status union is declared there

**Interfaces:**
- Produces: `BookingStatus.Draft`, `DRAFT` in `SLOT_HOLDING_STATUSES`, and two `platform_settings` columns.

**What `DRAFT` is.** The mockup's countdown — *"Hora reservada 29:40"* — runs on all three steps, so the slot is held from the moment the customer picks it, not from the moment they finish. `DRAFT` is that hold. Without it, two customers can complete checkout for the same slot and the second finds out at the end.

Two new settings, both LIVE, following `payment_window_minutes`' shape and its seed-versus-live comment:

- `checkout_hold_minutes` — default 30. How long a `DRAFT` holds its slot.
- `provider_response_minutes` — default 120. How long a provider has to answer.

`payment_window_minutes` keeps its name, its meaning and its value. Only its position in the flow changes, and that is Task 3's business, not this task's.

**The predicate is hand-typed and the test is the only thing that notices.** Adding `DRAFT` to `SLOT_HOLDING_STATUSES` does not change the constraint — a human must edit the migration's `WHERE` clause too. The `pg_get_constraintdef` test asserts every member is present and every non-member absent; it will go red for exactly the right reason until you do.

- [ ] **Step 1: Write the failing tests**

- the constraint's predicate names `DRAFT` (the existing both-directions check will fail until the migration says so);
- two overlapping `DRAFT` bookings on one member at the same seat are refused;
- a `DRAFT` and a `CONFIRMED` booking overlapping at the same seat are refused — a held slot is a held slot whichever end of the flow it is at;
- both new settings refuse 0 and refuse -1, naming their constraint, through the file's async-helper idiom.

- [ ] **Step 2: Run to verify they fail**
- [ ] **Step 3: Add the enum member, the columns, and the constraint's new predicate; then generate**

Run: `cd packages/backend && bun run db:ntizo:generate`

Read the whole generated file. No `DROP` you did not intend, no `$1`-style bind parameters, and the hand-written `EXCLUDE` flagged as hand-written. The file takes `ACCESS EXCLUSIVE` on `booking` for its duration.

- [ ] **Step 4: Run the suites and typecheck**

The new constraint tests stay red until the migration is applied. Say precisely which and why.

- [ ] **Step 5: Commit**

```bash
git commit -m "Hold the slot while the customer is still filling the form

The mockup's countdown runs on all three steps, so the slot is reserved
from the moment it is picked. DRAFT is that hold. Without it two
customers complete checkout for the same slot and the second finds out
at the end.

It joins SLOT_HOLDING_STATUSES, which the exclusion constraint, the seat
assignment and the availability engine all read -- three of those follow
automatically and the fourth, the constraint's hand-typed predicate,
does not. The both-directions catalogue test is what says so." -- <paths>
```

---

### Task 2: The transitions the flow now needs

**Files:**
- Modify: `.../booking/domain/aggregates/booking.aggregate.ts`
- Modify: `.../booking/domain/exceptions.ts`
- Modify: `.../booking/domain/events/index.ts`
- Modify: `.../booking/__tests__/booking.aggregate.test.ts`
- Modify: `.../booking/__tests__/booking-events.test.ts`

**Interfaces:**
- Produces: `submit(at)`, `accept(at)`, `decline(at, reason?)`, and `markPaid` retargeted.

**Four changes, and one of them is a single word.**

- `submit(at)` — `DRAFT → AWAITING_PROVIDER`. The customer has finished the form and the provider's clock starts.
- `accept(at)` — `AWAITING_PROVIDER → PENDING_PAYMENT`. **This is the reversal.** The provider has said yes and the money has not moved.
- `decline(at, reason?)` — `AWAITING_PROVIDER → DECLINED`.
- `markPaid` — its target becomes `CONFIRMED` instead of `AWAITING_PROVIDER`. One word, and its whole existing discipline stays: same reference absorbs a duplicate at any status, a different one throws `PaymentReferenceMismatchError`, and the no-op branch returns `this` so a command can compare identity.

Every transition returns a new `Booking`, never mutates, matching `Review.revise`. Each records its own timestamp — the props already carry `confirmedAt` and `declinedAt` and have since the aggregate was written, precisely so this task would not have to reopen the interface.

Two new events, following `booking.created`'s rule: **carry what the consumer needs so it does not read the booking back.** `booking.accepted` is what triggers the charge, so it needs whatever the charge needs — the customer, the amount, the currency. `booking.declined` reaches Notification, which must tell a customer whose slot is gone.

- [ ] **Step 1: Write the failing tests**

The nine-status table for each new transition — every status either transitions, no-ops or throws, asserted by name. `markPaid`'s existing table changes one expected value. Then the event payloads, with `satisfies ConstructorParameters<typeof X>[0]` on each payload const: without it the payload is untyped at runtime and the excess-property check does not fire on a named variable, so the test cannot fail. That is not hypothetical — it shipped here once.

- [ ] **Step 2: Run to verify they fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run the suites and typecheck**
- [ ] **Step 5: Commit**

---

### Task 3: The commands, and where the booking now starts

**Files:**
- Modify: `.../booking/app/use-cases/create-booking.command.ts`
- Create: `.../booking/app/use-cases/submit-booking.command.ts`
- Create: `.../booking/app/use-cases/accept-booking.command.ts`
- Create: `.../booking/app/use-cases/decline-booking.command.ts`
- Modify: `.../booking/bootstrap/index.ts`
- Modify: `.../booking/app/ports/outbound/platform-settings.reader.port.ts`
- Modify: `.../booking/infrastructure/repositories/drizzle/platform-settings.reader.ts`
- Modify: the command tests

**Interfaces:**
- Produces: three commands; `CreateBookingCommand` now produces a `DRAFT`.

**`accept` and `decline` are the provider's, and authorisation is the point.** Only a member of the booking's provider may accept or decline it. That check belongs in the command, and its test needs a **different provider's member** in the fixture — a fixture holding only the right person cannot fail if the check is dropped.

The settings reader gains the two new windows. `expiresAt` at creation is now `checkout_hold_minutes`, not the payment window.

**Every command uses the compare-and-swap.** `save(booking, expectedStatus)` exists and returns whether it applied; a `false` means somebody else moved the booking and the command returns without publishing, exactly as the aggregate's own no-op path does. Two provider members hitting accept at once is the ordinary case this exists for.

- [ ] **Step 1: Write the failing tests**

Fakes for the ports. Assert per command: the happy path publishes exactly once; a caller who is not a member of that provider is refused and **nothing is written** — the fake outbox empty, the fake repository's save never called; a losing compare-and-swap publishes nothing and throws nothing.

- [ ] **Step 2: Run to verify they fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run the suites and typecheck**
- [ ] **Step 5: Commit**

---

### Task 4: Three clocks, one sweep

**Files:**
- Modify: `.../booking/app/ports/outbound/booking.repository.port.ts`
- Modify: `.../booking/infrastructure/repositories/drizzle/booking.repository.ts`
- Modify: `.../booking/app/use-cases/expire-due-bookings.internal.command.ts`
- Modify: `apps/backend/api/src/scheduled.ts`
- Modify: `.../booking/bootstrap/index.ts`
- Test: `.../shared/infrastructure/database/__tests__/booking-expiry-sweep.test.ts`

**Interfaces:**
- Produces: `findDueForExpiry` becomes clock-aware — a `DRAFT` past its hold, an `AWAITING_PROVIDER` past the provider's window, a `PENDING_PAYMENT` past the payment window.

Three questions, three outcomes, and **the third is not an expiry**:

| Status past its clock | Becomes | Who is told |
|---|---|---|
| `DRAFT` | `EXPIRED` | nobody — the customer walked away |
| `AWAITING_PROVIDER` | `EXPIRED` | the customer: the provider never answered |
| `PENDING_PAYMENT` | `CANCELLED` | **the provider, with the reason** |

That last row is the whole point of the spec's failure section. A provider blocked their calendar, the customer never paid, and the platform's own choice of ordering cost them the slot. `BookingCancelled` must carry enough for Notification to say *why* — not "cancelled", but "the customer did not complete payment".

**One booking must not stop the wave**, as now: each expiry runs in its own `try`, a failure is logged with the booking id, and the rest continue. The booking sweep keeps its own `try` separate from the notification sweep's, inside the one `infraStore.runAsync` scope.

- [ ] **Step 1: Write the failing tests**

Against the real database. For each clock: past it, swept to the right status; not yet past it, untouched. Then the case that matters most and is easiest to write so it cannot fail: **a `PENDING_PAYMENT` booking past its window becomes `CANCELLED`, not `EXPIRED`, and publishes an event carrying the reason.** And a booking past one clock in a status that clock does not govern is left alone.

- [ ] **Step 2: Run to verify they fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run the suites and typecheck**
- [ ] **Step 5: Commit**

---

### Task 5: M-Pesa, from the sweep

**Files:**
- Create: `.../booking/app/ports/outbound/payment-charge.port.ts`
- Create: `.../payment/infrastructure/mpesa/mpesa.client.ts` — or wherever a Payment context belongs; say which you chose
- Create: `.../booking/app/use-cases/charge-accepted-bookings.internal.command.ts`
- Modify: `.../booking/infrastructure/repositories/drizzle/booking.repository.ts` — a query for bookings awaiting a charge
- Modify: `.../shared/infrastructure/database/booking/schemas/booking.schema.ts` — a charge-attempt count
- Create: a migration (generate, **do not apply**)
- Modify: `apps/backend/api/src/scheduled.ts`
- Modify: `apps/backend/api/wrangler.jsonc` — the secret bindings, names only
- Test: the client against a stub, and the sweep against the real database

**Interfaces:**
- Produces: `PaymentChargePort.charge({ bookingId, phone, amountMinor, currency, reference })`.

**What the predecessor got wrong, so we do not repeat it.** `ntizo-v1` calls C2B synchronously and treats the response as final, and its callback handler is dead code: it parses Safaricom Kenya's `Body.stkCallback` shape and looks up `mpesa_checkout_request_id`, whose only writer is never called. Read it for the API surface — `developer.mpesa.vm.co.mz`, success `INS-0`, phone normalised to `258XXXXXXXXX` — and for nothing else.

**The charge runs in the sweep**, decided 2026-09-01. By then nobody is waiting on a request: the trigger is the provider's acceptance, not a customer's click. A Cloudflare Queue would buy backoff and is the alternative if this proves wrong.

**A retry count on the booking**, so a permanent failure is visible rather than infinite. The sweep stops attempting past a small bound and leaves the booking to its payment window, which cancels it and tells the provider — Task 4's path, reached without a special case.

**Credentials are secrets.** Names in `wrangler.jsonc`, values via `wrangler secret`. **No credential in the repository** — not in a fixture, not in a comment, not in a committed `.env`. The client's tests run against a stub; the real call is proved by hand against the sandbox and pasted into the report.

- [ ] **Step 1: Write the failing tests**

The client against a stub: `INS-0` is success; any other code is a failure carrying the provider's own description; a malformed response is a failure rather than a crash; the phone normaliser accepts `84…`, `+258 84…` and `258 84…` and refuses everything else, **including a number that is nine digits but starts with the wrong prefix** — the predecessor's normaliser accepts any nine digits.

The sweep against the real database: an accepted booking with no charge attempt is picked up; one already `CONFIRMED` is not; one past its retry bound is not; a failure increments the count and leaves the booking payable.

- [ ] **Step 2: Run to verify they fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run the suites and typecheck**
- [ ] **Step 5: Prove it against the sandbox**

By hand, with real credentials that never enter the repository: one successful charge and one refusal. Paste both responses, **with the account identifiers redacted**, into the report.

- [ ] **Step 6: Commit**

---

## Self-Review

**Spec coverage.** The three clocks, `DRAFT`, the reversed order, the failure path with its reason, the retry bound and the sweep-not-queue decision each have a task. The spec's out-of-scope list — card, cash, refunds, the cancellation policy, materials, travel — is untouched here and stays that way.

**What this plan does not do.** The provider has no *screen* to accept on. `accept` and `decline` exist as commands with authorisation, reachable from GraphQL, and that is deliberate: the provider's list and detail page are their own spec, and a customer cannot reach the end of this flow without a provider who answers. **Nothing is demonstrable end to end until that lands or somebody accepts by hand.** Say so rather than discovering it.

**Placeholder scan.** Task 5 does not name the Payment context's directory, because whether M-Pesa belongs in a new bounded context or in Booking's infrastructure is a judgement that needs the tree in front of you. Every other file is named.

**Type consistency.** `BookingStatus` gains exactly one member. `SLOT_HOLDING_STATUSES` gains the same one, and the constraint predicate must be hand-edited to match — the catalogue test is the guard. `markPaid`'s signature is unchanged; only its target status moves. `save(booking, expectedStatus)` and `insert(booking, capacity)` are untouched.

**Ordering.** Task 1's migration must be applied before Tasks 4 and 5 can be verified; Task 5 adds a second migration. Both are manual acts and the controller asks. Tasks 2 and 3 are green throughout.
