# Booking core — a booking is born, paid, or expires

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-column `ntizo_booking.booking` placeholder with a real Booking bounded context that can create a booking against a held slot, take it to `AWAITING_PROVIDER` when Payment says it was paid, and expire it when nobody pays.

**Architecture:** A plain-class aggregate with a private constructor and a static factory, following `bounded-contexts/review/domain/aggregates/review.aggregate.ts`. Commands compose ports, wrap their writes in `UnitOfWorkPort.atomicExecute`, and publish domain events through `OutboxPort` inside that same transaction. The context knows nothing about M-Pesa: it consumes a payment event and changes state.

**Tech Stack:** Bun, `@cosmneo/onion-lasagna` (aggregates, ports, GraphQL field definitions), Drizzle over Neon Postgres, Zod read models in `@ntizo/shared`, `bun test` with `bun:test` imports.

**Spec:** `docs/superpowers/specs/2026-08-28-booking-design.md`

## This is the first of two plans for that spec

| | |
|---|---|
| **This plan** | `PENDING_PAYMENT` → `AWAITING_PROVIDER` (paid) and → `EXPIRED` (nobody paid). The schema, the aggregate, the events, the ports, the repository, the two commands, the create mutation and the read. |
| **Plan 2** | Everything the provider does: accept, decline, timeout, reschedule, mark done, dispute, complete, cancel. |

The split is where working software falls out. At the end of this plan a customer can create a real booking that holds a real slot, and it resolves one way or the other. Plan 2 gives the provider somewhere to answer.

## Global Constraints

- **The aggregate is a plain class**, private constructor, static `create`, `readonly` props interface, getters. Follow `review.aggregate.ts` exactly. `@cosmneo/onion-lasagna` has no `BaseAggregate` in this codebase — do not invent one.
- **Money is integer minor units** (`amountMinor`), currency `MZN`. The commission is basis points: `commissionMinor = Math.round(priceMinor * commissionBps / 10000)`, `providerPayoutMinor = priceMinor - commissionMinor`.
- **The snapshot is immutable after creation.** Service name, provider name, option name, duration, price, commission rate, and the address are all copied in at `create` and never written again. This is a financial-audit invariant, not a convenience.
- **The address is snapshotted, not referenced.** A customer editing their saved `ntizo_user.address` six months later must not change where a past booking says the provider went.
- **Events go through the existing outbox**, published inside the same `atomicExecute` block as the write that justifies them. See `submit-review.command.ts` for the pattern, including why the decision to publish reads the write's own result rather than a read taken before the transaction.
- **`PaymentSucceeded` is the only thing that can move `PENDING_PAYMENT` → `AWAITING_PROVIDER`**, and handling it must be idempotent: a webhook that arrives twice must not book twice.
- **Expiry is idempotent.** If the status has already moved on, it is a no-op.
- **A `quote` service cannot be booked.** There is no price to snapshot and no duration to hold a slot against.
- **Migrations are not run by CI.** `cd.yml`'s `migrate` job skips with the rest. Generating a migration is part of this plan; running it is a manual act per stage (`bun db:ntizo:dev:migrate`) that a human does.
- **Test commands:** `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking` and `bun run typecheck`. Backend tests use **`bun test`** with imports from `"bun:test"`, never vitest.
- **Doc comments explain *why*, not what.** This repository's reviewers check that claims in comments are true; a comment naming a consumer that does not exist is a defect here.

---

### Task 1: The status enum and the shared read model

**Files:**
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/booking/enums.ts`
- Create: `packages/shared/src/read-models/system/booking/booking.schema.ts`
- Create: `packages/shared/src/read-models/system/booking/index.ts`
- Modify: `packages/shared/src/read-models/system/index.ts`
- Test: `packages/shared/src/read-models/__tests__/read-models.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BookingStatus` (a const object plus a union type) with members `PENDING_PAYMENT`, `AWAITING_PROVIDER`, `CONFIRMED`, `MARKED_DONE`, `COMPLETED`, `DISPUTED`, `DECLINED`, `CANCELLED`, `EXPIRED`. And `bookingReadModel` / `BookingDTO` in `@ntizo/shared/read-models`.

Read `packages/backend/src/modules/ntizo/shared/infrastructure/database/review/enums.ts` first and follow its shape.

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/read-models/__tests__/read-models.test.ts`, adding `bookingReadModel` to the imports from `../system`:

```ts
describe("bookingReadModel", () => {
  const base = {
    id: "b1",
    status: "PENDING_PAYMENT" as const,
    serviceName: "Avaria eléctrica urgente",
    providerName: "Hélder Cossa",
    providerSlug: "helder-cossa-electricidade",
    optionName: "Diagnóstico e reparação",
    durationMinutes: 60,
    priceMinor: 120000,
    commissionBps: 1000,
    commissionMinor: 12000,
    currency: "MZN",
    startsAt: "2026-09-04T12:30:00.000Z",
    endsAt: "2026-09-04T13:30:00.000Z",
    addressLabel: "Casa",
    addressLine: "Av. Julius Nyerere 812",
    addressCity: "Maputo",
    addressDistrict: "Sommerschield",
    addressDirections: null,
    description: null,
    expiresAt: "2026-09-01T10:15:00.000Z",
    createdAt: "2026-09-01T10:00:00.000Z",
  };

  it("accepts a booking awaiting payment", () => {
    expect(() => bookingReadModel.parse(base)).not.toThrow();
  });

  it("rejects a status outside the machine", () => {
    expect(() => bookingReadModel.parse({ ...base, status: "PAID" })).toThrow();
  });

  it("rejects a negative price", () => {
    // Money is minor units and never negative. A refund is a payment's fact,
    // not a booking with a negative price.
    expect(() => bookingReadModel.parse({ ...base, priceMinor: -1 })).toThrow();
  });

  it("rejects a commission outside 0..10000 basis points", () => {
    expect(() => bookingReadModel.parse({ ...base, commissionBps: 10001 })).toThrow();
  });

  it("allows expiresAt to be null once the booking is no longer waiting to be paid", () => {
    const parsed = bookingReadModel.parse({
      ...base,
      status: "AWAITING_PROVIDER",
      expiresAt: null,
    });
    expect(parsed.expiresAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/shared && bun run test`
Expected: FAIL — `bookingReadModel` is not exported.

- [ ] **Step 3: Write the enum**

`packages/backend/src/modules/ntizo/shared/infrastructure/database/booking/enums.ts`:

```ts
/**
 * The whole of a booking's life, in the order it happens.
 *
 * A const object rather than a TypeScript `enum`, matching this codebase's
 * other status sets: the values are what Postgres stores and what GraphQL
 * publishes, so they have to be readable in a database client without a
 * lookup table.
 *
 * `MARKED_DONE` is deliberately not called `AWAITING_DISPUTE`. It is not
 * waiting for a dispute; it is waiting for the absence of one, and a name
 * that promises the opposite is a name the next reader has to unlearn.
 */
export const BookingStatus = {
  /** Created, slot held, waiting for the customer to pay. */
  PendingPayment: "PENDING_PAYMENT",
  /** Paid. The platform holds the money; the provider has not answered. */
  AwaitingProvider: "AWAITING_PROVIDER",
  /** The provider accepted. */
  Confirmed: "CONFIRMED",
  /** The provider says the work is done; the customer's dispute window is open. */
  MarkedDone: "MARKED_DONE",
  /** The window closed without a dispute. Money moves to the provider's wallet. */
  Completed: "COMPLETED",
  /** The customer disputed inside the window. An administrator decides. */
  Disputed: "DISPUTED",
  /** The provider refused, or never answered in time. */
  Declined: "DECLINED",
  /** Called off after it was confirmed. */
  Cancelled: "CANCELLED",
  /** Nobody paid before the payment window closed. */
  Expired: "EXPIRED",
} as const;

export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const BOOKING_STATUSES = Object.values(BookingStatus);
```

- [ ] **Step 4: Write the read model**

`packages/shared/src/read-models/system/booking/booking.schema.ts`:

```ts
import { z } from "zod";

/**
 * One booking, as its customer or its provider reads it.
 *
 * Everything below the identity fields is the **snapshot** — what was true
 * when the customer bought — rather than a join. `serviceName` is not read
 * from the service today, and `addressLine` is not read from the customer's
 * saved address today, because both are mutable and a booking is a record of
 * what was agreed. A provider renaming a service must not rewrite what a
 * customer booked; a customer correcting their street must not move where a
 * provider went last March.
 *
 * `commissionBps` travels with `commissionMinor` on purpose. The amount alone
 * cannot be checked, and the rate alone cannot be reconciled against money
 * that already moved — an administrator changing a provider's rate tomorrow
 * must leave both of these untouched.
 */
export const bookingReadModel = z.object({
  id: z.string().min(1),

  status: z.enum([
    "PENDING_PAYMENT",
    "AWAITING_PROVIDER",
    "CONFIRMED",
    "MARKED_DONE",
    "COMPLETED",
    "DISPUTED",
    "DECLINED",
    "CANCELLED",
    "EXPIRED",
  ]),

  serviceName: z.string(),
  providerName: z.string(),
  providerSlug: z.string(),
  optionName: z.string(),
  durationMinutes: z.number().int().positive(),

  priceMinor: z.number().int().min(0),
  commissionBps: z.number().int().min(0).max(10_000),
  commissionMinor: z.number().int().min(0),
  currency: z.string(),

  startsAt: z.string(),
  endsAt: z.string(),

  addressLabel: z.string(),
  addressLine: z.string(),
  addressCity: z.string(),
  addressDistrict: z.string().nullable(),
  addressDirections: z.string().nullable(),

  /** What the customer wrote about the job. */
  description: z.string().nullable(),

  /**
   * When the payment window closes. Null once the booking is no longer
   * waiting to be paid — a deadline that has stopped applying is absent,
   * not a date in the past somebody has to compare against `now`.
   */
  expiresAt: z.string().nullable(),

  createdAt: z.string(),
});

export type BookingDTO = z.infer<typeof bookingReadModel>;
```

`packages/shared/src/read-models/system/booking/index.ts`:

```ts
export * from "./booking.schema";
```

Add `export * from "./booking";` to `packages/shared/src/read-models/system/index.ts`, following how its siblings are exported there.

- [ ] **Step 5: Run the tests and the type check**

Run: `cd packages/shared && bun run test && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/read-models packages/backend/src/modules/ntizo/shared/infrastructure/database/booking/enums.ts
git commit -m "Name the states a booking can be in, and what a reader sees

Nine states, and the read model carries the snapshot rather than joins to
what those things are called today. A provider renaming a service must
not rewrite what a customer booked, and a customer correcting their
street must not move where a provider went last March.

The commission's rate travels with its amount: the amount alone cannot be
checked, and the rate alone cannot be reconciled against money that has
already moved."
```

---

### Task 2: The tables

**Files:**
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/booking/schemas/booking.schema.ts`
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/booking/schemas/booking-change.schema.ts`
- Modify: `packages/backend/src/modules/ntizo/shared/infrastructure/database/booking/schemas/index.ts` (create if the folder has only `booking.schema.ts` today)
- Test: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/booking-constraints.test.ts`

**Interfaces:**
- Consumes: `BookingStatus`, `BOOKING_STATUSES` (Task 1).
- Produces: the `booking` and `booking_change` Drizzle tables in the `ntizo_booking` schema, and their inferred row types.

The existing `booking.schema.ts` is a placeholder whose own comment says so: four columns and a note reading "will be expanded per REQUIREMENTS v3.1". Replace its body; keep the file.

Read `packages/backend/src/modules/ntizo/shared/infrastructure/database/review/schemas/review.schema.ts` for how this codebase writes checks, indexes and foreign keys, and `provider/schemas/provider.schema.ts` for how it comments money columns.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/booking-constraints.test.ts`. Follow the shape of `catalog-city-facets.test.ts` in the same directory — it opens a connection with `openDevDbConnection()`, uses `DEV_DB_COLD_START_TIMEOUT_MS` on every hook and test, and cleans up with `bestEffortCleanup`.

Assert, against the real database:

1. A row with a status outside `BOOKING_STATUSES` is rejected by the check constraint.
2. A negative `price_minor` is rejected.
3. A `commission_bps` above 10000 is rejected.
4. Two bookings cannot hold the same `(provider_member_id, starts_at)` while in an active status — the partial unique index below.
5. A `booking_change` row cannot exist without its booking (FK), and deleting the booking cascades.

Write the actual inserts and `expect(...).rejects.toThrow()` assertions; do not describe them.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/booking-constraints.test.ts`
Expected: FAIL — the columns do not exist yet.

**`DEV_DB_URL` must be set** (see `packages/backend/.env`). These tests assert against the real dev database; there is no fake.

- [ ] **Step 3: Write the tables**

`booking.schema.ts` — replace the placeholder's body. Columns:

*Identity and parties:* `id` (uuid pk), `customerId` (text → `user.id`), `providerId` (uuid → `provider.id`), `serviceId` (uuid → `service.id`), `serviceOptionId` (uuid → `service_option.id`), `providerMemberId` (uuid → `provider_member.id`).

*The slot:* `startsAt`, `endsAt` (both `timestamp` with timezone).

*State:* `status` (text, check constrained to `BOOKING_STATUSES`), `expiresAt` (nullable timestamptz), and one nullable timestamptz per transition that has happened: `paidAt`, `confirmedAt`, `declinedAt`, `cancelledAt`, `markedDoneAt`, `completedAt`, `disputedAt`, `expiredAt`.

*The money snapshot:* `priceMinor` (integer, check `>= 0`), `commissionBps` (integer, check `between 0 and 10000`), `commissionMinor` (integer, check `>= 0`), `currency` (text, default `'MZN'`).

*The rest of the snapshot:* `serviceName`, `providerName`, `providerSlug`, `optionName`, `durationMinutes`, `addressLabel`, `addressLine`, `addressCity`, `addressDistrict` (nullable), `addressDirections` (nullable), `addressLat` / `addressLng` (nullable text, matching `address.schema.ts`'s own choice).

*Customer input:* `description` (nullable text).

*Payment linkage:* `paymentRef` (nullable text).

*Timestamps:* `createdAt`, `updatedAt`.

Two indexes and one of them is load-bearing:

```ts
// A member cannot be in two places at once. Enforced in the database rather
// than by the command that checks availability first, because two requests
// can both read "free" before either writes — and the loser of that race
// must be told, not quietly double-booked.
//
// Partial: only statuses that still hold the slot. An expired or declined
// booking releases the time, and a provider who cannot rebook a slot that
// nobody holds would rightly call that a bug.
uniqueIndex("booking_member_slot_active_uq")
  .on(t.providerMemberId, t.startsAt)
  .where(sql`${t.status} in ('PENDING_PAYMENT','AWAITING_PROVIDER','CONFIRMED','MARKED_DONE')`),

index("booking_provider_status_idx").on(t.providerId, t.status),
```

`booking-change.schema.ts` — append-only:

```ts
/**
 * One row per change to a booking that has already been sold.
 *
 * Append-only, and the reason is the whole design: a booking is mutated in
 * place rather than cancelled and recreated, so that it keeps its id and its
 * payment reference. What that costs is the original sale's readability —
 * this table is what buys it back. Every hop stores what the booking was
 * before, so the first sale is never overwritten, only superseded.
 *
 * Nothing updates or deletes a row here. A correction is another row.
 */
```
Columns: `id`, `bookingId` (uuid → `booking.id`, `onDelete: "cascade"`), `changedByUserId` (text → `user.id`), `changedAt`, `reason` (text), and the previous values a hop can move: `previousStartsAt`, `previousEndsAt`, `previousProviderMemberId`, `previousPriceMinor`.

- [ ] **Step 4: Generate the migration**

Run: `cd packages/backend && bun db:ntizo:generate`

Read the generated SQL before going further. It must contain the two indexes and every check. **Do not run it against any stage** — migrations are a manual, human act here, and `cd.yml`'s migrate job skips.

- [ ] **Step 5: Apply it to dev and run the tests**

Ask the human to run `bun db:ntizo:dev:migrate`, or run it only if they have said to. Then:

Run: `cd packages/backend && bun test src/modules/ntizo/shared/infrastructure/database/__tests__/booking-constraints.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo/shared/infrastructure/database/booking packages/backend/src/modules/ntizo/drizzle
git commit -m "Give bookings a table that can hold one

The placeholder had four columns and a note saying so. This is the
snapshot the design calls for, plus an append-only change log, plus the
one index that matters: a partial unique on (member, start) over the
statuses that still hold the slot.

That index is in the database rather than in the command because two
requests can both read 'free' before either writes. The loser of that
race has to be told, not quietly double-booked. It is partial because an
expired booking releases its time, and a provider who could not rebook a
slot nobody holds would rightly call that a bug."
```

---

### Task 3: The aggregate — creation and its invariants

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/booking/domain/exceptions.ts`
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/booking/domain/aggregates/booking.aggregate.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/booking/__tests__/booking.aggregate.test.ts`

**Interfaces:**
- Consumes: `BookingStatus` (Task 1).
- Produces: `Booking` with `static create(input): Booking`, getters for every prop, and the exception types below. Later tasks add transitions to this same class.

`create` takes: `id?`, `customerId`, `providerId`, `serviceId`, `serviceOptionId`, `providerMemberId`, `startsAt: Date`, `durationMinutes`, `priceMinor`, `commissionBps`, `currency`, the snapshot strings, the address fields, `description?`, and `expiresAt: Date`.

It computes `endsAt` from `startsAt + durationMinutes`, and `commissionMinor` from `priceMinor` and `commissionBps`. Status is `PENDING_PAYMENT`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "bun:test";
import { Booking } from "../domain/aggregates/booking.aggregate";
import {
  BookingDurationInvalidError,
  BookingPriceInvalidError,
  CommissionOutOfRangeError,
} from "../domain/exceptions";

const WHEN = new Date("2026-09-04T12:30:00.000Z");

function validInput(over: Partial<Parameters<typeof Booking.create>[0]> = {}) {
  return {
    customerId: "u1",
    providerId: "p1",
    serviceId: "s1",
    serviceOptionId: "o1",
    providerMemberId: "m1",
    startsAt: WHEN,
    durationMinutes: 60,
    priceMinor: 120000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName: "Avaria eléctrica urgente",
    providerName: "Hélder Cossa",
    providerSlug: "helder-cossa-electricidade",
    optionName: "Diagnóstico e reparação",
    addressLabel: "Casa",
    addressLine: "Av. Julius Nyerere 812",
    addressCity: "Maputo",
    addressDistrict: "Sommerschield",
    addressDirections: null,
    addressLat: null,
    addressLng: null,
    description: null,
    expiresAt: new Date("2026-09-01T10:15:00.000Z"),
    ...over,
  };
}

describe("Booking.create", () => {
  it("starts life waiting to be paid", () => {
    expect(Booking.create(validInput()).status).toBe("PENDING_PAYMENT");
  });

  it("derives the end from the start and the duration", () => {
    const booking = Booking.create(validInput({ durationMinutes: 240 }));
    expect(booking.endsAt.toISOString()).toBe("2026-09-04T16:30:00.000Z");
  });

  it("computes the commission from the rate it was given", () => {
    // 1200.00 MZN at 10% is 120.00. The rate is snapshotted alongside, so the
    // arithmetic stays checkable after somebody changes the provider's rate.
    const booking = Booking.create(validInput());
    expect(booking.commissionMinor).toBe(12000);
    expect(booking.commissionBps).toBe(1000);
  });

  it("rounds the commission rather than truncating it", () => {
    // 333 minor at 10% is 33.3. Truncation quietly favours the platform on
    // every booking; rounding is the arithmetic somebody can reproduce.
    const booking = Booking.create(validInput({ priceMinor: 333 }));
    expect(booking.commissionMinor).toBe(33);
  });

  it("refuses a price below zero", () => {
    expect(() => Booking.create(validInput({ priceMinor: -1 }))).toThrow(BookingPriceInvalidError);
  });

  it("refuses a commission outside basis points", () => {
    expect(() => Booking.create(validInput({ commissionBps: 10_001 }))).toThrow(
      CommissionOutOfRangeError,
    );
  });

  it("refuses a duration that is not a positive whole number of minutes", () => {
    expect(() => Booking.create(validInput({ durationMinutes: 0 }))).toThrow(
      BookingDurationInvalidError,
    );
    expect(() => Booking.create(validInput({ durationMinutes: 1.5 }))).toThrow(
      BookingDurationInvalidError,
    );
  });

  it("trims a blank description to null rather than storing whitespace", () => {
    expect(Booking.create(validInput({ description: "   " })).description).toBeNull();
  });

  it("keeps the payout as the price less the commission", () => {
    const booking = Booking.create(validInput());
    expect(booking.providerPayoutMinor).toBe(booking.priceMinor - booking.commissionMinor);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking`
Expected: FAIL — the module does not resolve.

- [ ] **Step 3: Write the exceptions and the aggregate**

`domain/exceptions.ts` — follow `bounded-contexts/review/domain/exceptions.ts` for how this codebase shapes domain errors. Define `BookingPriceInvalidError`, `CommissionOutOfRangeError`, `BookingDurationInvalidError`, and `BookingTransitionError` (which Task 5 uses; define it now so the file is not touched twice).

`domain/aggregates/booking.aggregate.ts` — plain class, private constructor over a `readonly BookingProps`, static `create` that validates then constructs, getters for everything.

`providerPayoutMinor` is a **getter derived from the two stored numbers**, never a stored column: a payout that could disagree with `price - commission` is a reconciliation problem waiting to happen, and there is nothing it can express that the subtraction cannot. Say that in its doc comment.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/backend && bun test src/modules/ntizo/bounded-contexts/booking && bun run typecheck`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/booking
git commit -m "A booking knows what it costs and who owes what

The commission is computed from a rate the booking keeps, so the sum
stays reproducible after an administrator changes that provider's rate.
It rounds rather than truncates: truncation quietly favours the platform
on every booking, and nobody would ever find it.

The payout is a getter, not a column. A stored payout that could
disagree with price minus commission is a reconciliation problem waiting
to happen, and it can express nothing the subtraction cannot."
```

---

### Task 4: The domain events

**Files:**
- Create: `packages/backend/src/modules/ntizo/bounded-contexts/booking/domain/events/index.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/booking/__tests__/booking-events.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BookingCreated`, `BookingPaid`, `BookingExpired` — each extending `BaseDomainEvent` from `@cosmneo/onion-lasagna`, with the event name as its first `super` argument and the booking id as its second.

Read `bounded-contexts/review/domain/events/index.ts` — it is the whole pattern in twenty lines.

Payloads:

- `booking.created` — `{ bookingId, customerId, providerId, serviceId, startsAt, priceMinor, currency, expiresAt }`
- `booking.paid` — `{ bookingId, customerId, providerId, priceMinor, commissionMinor, currency, paymentRef }`
- `booking.expired` — `{ bookingId, providerMemberId, startsAt }`

`booking.expired` carries the member and the start rather than only the id **because its consumer is Scheduling, which has to release a slot and would otherwise have to read the booking back to learn which one.** Say so in the comment.

- [ ] **Step 1: Write the failing test**

Assert, for each event: the name it publishes under, that the aggregate id is the booking id, and that the payload round-trips. Three tests, real assertions.

- [ ] **Step 2: Run it to verify it fails**
- [ ] **Step 3: Write the events**
- [ ] **Step 4: Run the tests**
- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/booking/domain/events packages/backend/src/modules/ntizo/bounded-contexts/booking/__tests__/booking-events.test.ts
git commit -m "Announce a booking's first three facts

booking.expired carries the member and the start, not just the id,
because the consumer that cares is Scheduling and it has a slot to
release — an event that made it read the booking back to learn which one
would be an event that knows less than it could."
```

---

### Task 5: The two transitions this plan owns

**Files:**
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/booking/domain/aggregates/booking.aggregate.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/booking/__tests__/booking.aggregate.test.ts`

**Interfaces:**
- Consumes: `Booking` (Task 3), `BookingTransitionError` (Task 3).
- Produces: `markPaid(paymentRef: string, at: Date): Booking` and `expire(at: Date): Booking`. Both return a **new** `Booking` rather than mutating, matching `Review.revise`'s shape in this codebase.

- [ ] **Step 1: Write the failing tests**

```ts
describe("Booking.markPaid", () => {
  it("moves a pending booking to awaiting the provider", () => {
    const paid = Booking.create(validInput()).markPaid("mpesa-123", new Date());
    expect(paid.status).toBe("AWAITING_PROVIDER");
    expect(paid.paymentRef).toBe("mpesa-123");
  });

  it("clears the payment deadline, rather than leaving a date that no longer applies", () => {
    const paid = Booking.create(validInput()).markPaid("mpesa-123", new Date());
    expect(paid.expiresAt).toBeNull();
  });

  it("is idempotent: paying an already-paid booking changes nothing", () => {
    // A webhook that arrives twice must not book twice. The command layer
    // guards this too, but the aggregate is the last place it can be got
    // wrong quietly.
    const first = Booking.create(validInput()).markPaid("mpesa-123", new Date());
    const second = first.markPaid("mpesa-123", new Date());
    expect(second.status).toBe("AWAITING_PROVIDER");
    expect(second.paymentRef).toBe("mpesa-123");
    expect(second.paidAt).toEqual(first.paidAt);
  });

  it("refuses to pay a booking that already expired", () => {
    const expired = Booking.create(validInput()).expire(new Date());
    expect(() => expired.markPaid("mpesa-123", new Date())).toThrow(BookingTransitionError);
  });
});

describe("Booking.expire", () => {
  it("moves a pending booking to expired and clears the deadline", () => {
    const expired = Booking.create(validInput()).expire(new Date());
    expect(expired.status).toBe("EXPIRED");
    expect(expired.expiresAt).toBeNull();
  });

  it("is a no-op on a booking that has already moved on", () => {
    // The delayed job fires whether or not the payment landed first. If the
    // status has moved, expiry has nothing to say — and throwing here would
    // turn an ordinary race into an error somebody has to read.
    const paid = Booking.create(validInput()).markPaid("mpesa-123", new Date());
    expect(paid.expire(new Date()).status).toBe("AWAITING_PROVIDER");
  });
});
```

- [ ] **Step 2: Run to verify they fail**
- [ ] **Step 3: Implement both transitions**

Note the asymmetry and make it deliberate: paying an expired booking **throws**, expiring a paid booking **is a no-op**. Money arriving for a slot that was released is a real problem somebody must see; a timer firing after the thing it was watching already resolved is ordinary. Write that reasoning into the comments.

- [ ] **Step 4: Run the tests**
- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/booking
git commit -m "Let a booking be paid, or run out of time

The two guards are deliberately asymmetric. Expiring a booking that was
already paid is a no-op: the timer fires whether or not the payment
landed first, and turning an ordinary race into an error just gives
somebody an alert to ignore. Paying one that already expired throws:
money has arrived for a slot that was released, and that is a fact a
person has to see."
```

---

### Task 6: The ports

**Files:**
- Create: `.../booking/app/ports/outbound/booking.repository.port.ts`
- Create: `.../booking/app/ports/outbound/slot-hold.port.ts`
- Create: `.../booking/app/ports/outbound/service-pricing.reader.port.ts`
- Create: `.../booking/app/ports/outbound/provider-commission.reader.port.ts`
- Create: `.../booking/app/ports/outbound/delayed-jobs.port.ts`

**Interfaces:**
- Produces the five interfaces the commands in Tasks 8 and 9 depend on.

These are interfaces only — no test task, because there is nothing to assert about a type. Their doc comments carry the design.

`SlotHoldPort` gets `hold`, `release` **and `transfer`**. `transfer` exists as one operation even though this plan never calls it: Plan 2's reschedule needs the new slot held *before* the old is released, and a port that only offers release-then-hold makes the wrong thing the easy thing. Say that in the comment, and say that Plan 2 is what uses it.

`ServicePricingReader` returns the option's price, duration and name, **and whether the service is `quote`** — the caller must be able to refuse a quote service without a second round trip.

- [ ] **Step 1: Write the five interfaces with their doc comments**
- [ ] **Step 2: Typecheck**

Run: `cd packages/backend && bun run typecheck`

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/booking/app/ports
git commit -m "Name what Booking needs from everyone else

SlotHoldPort offers transfer as one operation although nothing calls it
yet. Plan 2's reschedule must hold the new slot before releasing the old
one, and a port that only offers release-then-hold makes losing the slot
the easy thing to write."
```

---

### Task 7: The repository

**Files:**
- Create: `.../booking/infrastructure/repositories/drizzle/booking.repository.ts`
- Test: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/booking-repository.test.ts`

**Interfaces:**
- Consumes: `BookingRepositoryPort` (Task 6), `Booking` (Tasks 3, 5), the tables (Task 2).
- Produces: `DrizzleBookingRepository` with `insert(booking)`, `findById(id)`, `save(booking)` and `appendChange(...)`.

`insert` must let the partial unique index's violation surface as a **named domain error**, `SlotAlreadyTakenError`, rather than a raw Postgres error string. The command in Task 8 turns that into a message a customer can act on. Catch on the constraint name `booking_member_slot_active_uq`, not on a substring of the message text.

This test hits the real database, in the same directory and style as Task 2's.

- [ ] **Step 1: Write the failing test**

Cover: a booking round-trips through `insert` then `findById` with every snapshot field intact; a second insert on the same `(member, startsAt)` while the first is `PENDING_PAYMENT` raises `SlotAlreadyTakenError`; and the same insert succeeds once the first booking is `EXPIRED`, which is the partial index earning its keep.

**And one more, which is not about this repository so much as about the claim Task 8 makes on its behalf.** Insert a booking inside a real `atomicExecute` against the live database, then throw from inside that block, and assert the row is not there afterwards. Task 8's test suite proves its commands *call* the unit of work in an order compatible with rollback — its own comment says so, and points here for the rest. Nothing in this codebase currently proves Postgres rolls anything back: the existing `drizzle-unit-of-work.test.ts` uses a fake context and no live connection. Until this test exists, the atomicity that BR2 rests on is asserted by two fakes agreeing with each other.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Implement the repository**
- [ ] **Step 4: Run the tests**
- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/booking/infrastructure packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/booking-repository.test.ts
git commit -m "Persist a booking, and name the race when it is lost

The partial unique index's violation becomes SlotAlreadyTakenError here,
caught on the constraint name rather than on a substring of Postgres's
message — message text is not an API, and matching it is how a database
upgrade turns a handled case into a 500."
```

---

### Task 8: Creating a booking

**Files:**
- Create: `.../booking/app/use-cases/create-booking.command.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/booking/__tests__/create-booking.command.test.ts`

**Interfaces:**
- Consumes: every port (Task 6), `Booking.create` (Task 3), `BookingCreated` (Task 4), `UnitOfWorkPort`, `OutboxPort`.
- Produces: `CreateBookingCommand` with `execute(input): Promise<{ bookingId: string; expiresAt: string }>`.

Read `bounded-contexts/review/app/use-cases/submit-review.command.ts` first: it is this codebase's reference for composing ports, wrapping in `atomicExecute`, and publishing to the outbox inside that transaction.

The command: reads the pricing (refusing a `quote` service), reads the provider's `commissionBps`, snapshots the chosen address, builds the aggregate, then **inside one `atomicExecute`** inserts the booking, holds the slot, and publishes `BookingCreated`. Afterwards it schedules the expiry job.

The hold and the insert are in the same transaction on purpose: a booking that exists without its hold is a double-booking waiting to happen, and a hold without its booking is a slot nobody can ever use.

- [ ] **Step 1: Write the failing test**

Use fakes for all five ports, following how `review-commands.test.ts` writes its `FakeRepo` and `FakeEligibility`. Assert:

- a booking is created with the commission read from the provider, not a constant;
- a `quote` service is refused with `ServiceNotBookableError` and **nothing is held** — assert the fake hold port was never called;
- the address the customer chose is copied onto the booking, and mutating the fake address afterwards does not change it;
- `BookingCreated` is published exactly once;
- when the repository raises `SlotAlreadyTakenError`, the error surfaces and **no event is published** — the atomic block is what makes that true, so assert on the fake outbox being empty.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Implement the command**
- [ ] **Step 4: Run the tests**
- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/booking
git commit -m "Create a booking and hold its slot in one write

The insert and the hold share a transaction because either one alone is
a bug you find later: a booking without its hold double-books the
member, and a hold without its booking blocks a slot nobody can use.

The commission is read from the provider rather than assumed. A hardcoded
rate is already live on the service page and shows the wrong fee for any
provider an administrator has changed."
```

---

### Task 9: Paying, and running out of time

**Files:**
- Create: `.../booking/app/use-cases/mark-booking-paid.command.ts`
- Create: `.../booking/app/use-cases/expire-booking.command.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/booking/__tests__/booking-lifecycle.command.test.ts`

**Interfaces:**
- Produces: `MarkBookingPaidCommand.execute({ bookingId, paymentRef })` and `ExpireBookingCommand.execute({ bookingId })`.

`MarkBookingPaidCommand` is **internal** — it is driven by Payment's event, never by a customer. Say so in its doc comment, because the difference decides whether it needs an authorisation check.

- [ ] **Step 1: Write the failing tests**

Assert:

- paying moves the booking and publishes `BookingPaid` once;
- **paying twice publishes once** — the second call finds the status already moved and returns without publishing. This is the webhook-arrives-twice case and it is the reason this test exists;
- expiring a pending booking publishes `BookingExpired` and releases the hold;
- expiring an already-paid booking publishes nothing and releases nothing;
- paying a booking that expired throws, and nothing is published.

- [ ] **Step 2: Run to verify they fail**
- [ ] **Step 3: Implement both commands**
- [ ] **Step 4: Run the tests**
- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/booking
git commit -m "Take the payment's word for it, once

Paying twice publishes once. A payment webhook that arrives twice is
ordinary, and a second booking.paid would tell Notification to send a
second confirmation and Scheduling to hold a slot it already holds."
```

---

### Task 10: Bootstrap, the adapters, and booking.create

**Files:**
- Create: `.../booking/bootstrap/index.ts`
- Create: `.../booking/index.ts`
- Create: `.../booking/infrastructure/repositories/drizzle/service-pricing.reader.ts`
- Create: `.../booking/infrastructure/repositories/drizzle/provider-snapshot.reader.ts`
- Create: `.../booking/infrastructure/adapters/booking-row-slot-hold.adapter.ts`
- Create: `.../booking/infrastructure/adapters/expires-at-delayed-jobs.adapter.ts`
- Create: `packages/backend/src/modules/ntizo/write/booking/graphql/schema/mutations.ts`
- Create: `packages/backend/src/modules/ntizo/write/booking/graphql/handlers/mutations.handlers.ts`
- Create: `packages/backend/src/modules/ntizo/write/booking/index.ts`
- Modify: `packages/backend/src/modules/ntizo/write/schema.ts`
- Modify: `apps/backend/api/src/graphql/private.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `bootstrapBooking()`, and `booking.create` as a mutation on the
  private GraphQL schema.

**The four adapters are part of this task, and two of them do nothing.** The
plan originally named five ports and built only the repository, which would have
left `bootstrapBooking()` unable to construct a single command. The two readers
are real Drizzle queries. `SlotHoldPort` and `DelayedJobsPort` get adapters that
perform no write and say so in their own comments: the booking row plus the
partial unique index *is* the hold — Scheduling has no hold table, it computes
availability — and the delayed job is a no-op because `expires_at` is on the row
and a cron sweep reads it (Task 12), exactly as the notification sweep reads
`notify_due_at`. An adapter that explains why it is empty is honest; one that
pretends to work is not.

**`booking.mine` is not here — it is Task 14.** This plan first put the query
beside the mutation in the `write/` tier. That tier is mutations only; the read
tier has its own barrel (`read/schema.ts`), its own bootstrap convention, and
its own handler shape.

Follow `bounded-contexts/review/bootstrap/index.ts` and `write/review/graphql/*` exactly — they are the shortest complete example of this wiring in the repository.

`booking.create` requires a signed-in user; copy `requireUser` from `write/review/graphql/handlers/mutations.handlers.ts` rather than writing a second version of it.

- [ ] **Step 1: Write the failing test**

Extend `packages/backend/src/modules/ntizo/bounded-contexts/booking/__tests__/` with a bootstrap test asserting `bootstrapBooking()` returns the use cases the handlers reach for — all four, including the two nothing exposes yet, because a bootstrap that omits them leaves Payment and the sweep with nothing to reach for and the omission only surfaces when somebody tries.

Then assert the mutation's zod input rejects a missing address and a `startsAt` that is not a date. Note there is no duration to reject: the duration comes from the service option, not from the client, which is the whole reason a customer cannot book a two-minute house clean.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Write the bootstrap, the schema, the handlers, and register them**
- [ ] **Step 4: Run the whole backend suite and typecheck**

Run: `cd packages/backend && bun test src && bun run typecheck`

- [ ] **Step 5: Prove the schema still builds**

A deploy exiting 0 proves an upload, not a working app. What proves the bootstrap resolved is a GraphQL request:

```bash
curl -s -X POST http://localhost:8788/graphql -H 'Content-Type: application/json' \
  -d '{"query":"{ __typename }"}'
```

against `bun run dev` in `apps/backend/api` (Node 22 on the PATH for wrangler). A schema that cannot build fails here and nowhere else.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo apps/backend/api/src/graphql/private.ts
git commit -m "Expose booking.create, and prove the schema still builds

The bootstrap test is not ceremony: a context that fails to compose
brings down the whole private schema, and the only thing that catches it
is asking the running server for __typename."
```

---

### Task 11: Let Review see real bookings

**Files:**
- Modify: `.../review/infrastructure/repositories/drizzle/open-eligibility.adapter.ts`
- Modify: `.../review/bootstrap/index.ts`
- Test: `packages/backend/src/modules/ntizo/bounded-contexts/review/__tests__/review-commands.test.ts`

`OpenReviewEligibilityAdapter` returns `{ allowed: true, bookingId: null }` unconditionally, and both it and `bootstrapReview` carry a comment saying they are waiting for Booking. Booking has landed.

Replace it with an adapter that answers from the bookings table: a customer may review a provider they have a `COMPLETED` booking with, and the `bookingId` it returns is that booking's.

**This closes a real gap.** The detail-pages spec records that the service name cannot appear under a review because `review.booking_id` is always null — because nothing ever set it. After this task, new reviews carry one.

- [ ] **Step 1: Write the failing test**

In the existing review command tests, assert that a customer with no completed booking is refused, that one with a completed booking is allowed, and that the returned `bookingId` is written onto the review.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Write the adapter and swap the one line in the bootstrap**
- [ ] **Step 4: Run the review and booking suites**
- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/review
git commit -m "A review has to be earned again

OpenReviewEligibilityAdapter allowed everyone, and said in its own
comment that it was waiting for Booking. It has arrived. Reviews now
require a completed booking and carry its id — which is also the missing
half of why a review cannot yet name the service it is about."
```

---

### Task 12: Make expiry actually happen

**Files:**
- Modify: `.../booking/bootstrap/index.ts`
- Modify: `apps/backend/api/src/scheduled.ts`
- Test: `packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/booking-expiry-sweep.test.ts`

**Interfaces:**
- Consumes: `ExpireBookingCommand` (Task 9), `bootstrapBooking()` (Task 10),
  `findDueForExpiry(now, limit)` (Task 7).
- Produces: a booking sweep inside the existing `scheduled` handler.

**`findDueForExpiry` is not yours to write — Task 7 already did.** This plan
originally declared it on the port in Task 6 and left its implementation here,
which cannot work: a class must satisfy every member of the interface it
implements, so Task 7's repository failed to typecheck until it had one. Task 7
implemented it against the specification this task used to carry, and its
integration test covers the cases that matter — a paid booking past its deadline
is not returned, and the oldest are returned first. Your job is the caller.

**Why this task exists at all.** Task 9 writes `ExpireBookingCommand` and Task 10
wires it, but in this plan nothing ever calls it. A customer who opens the
payment page and walks away leaves a booking in `PENDING_PAYMENT` for ever,
and the partial unique index does exactly what it was built to do: holds that
member's slot against every other customer, permanently. The command without a
caller is not a smaller feature — it is a slot leak.

The plan's own self-review named this gap and offered a cron sweep as the
stand-in. It is the right stand-in and not a compromise: `apps/backend/api/src/scheduled.ts`
already runs every minute in `dev`, `qa` and `prod`, and already sweeps
Communication for messages past `notify_due_at`. A booking past `expires_at` is
the same shape of question against the same clock. A Cloudflare Queue would add
a deployment surface to do what one more query on an existing wake-up does.

Read `apps/backend/api/src/scheduled.ts` in full before touching it, especially
its doc comment about `infraStore.runAsync` — a `scheduled` invocation has no
request for `configMiddleware` to wrap, so the context is built by hand and
anything reading it outside that scope throws. Your sweep goes inside the
existing scope, beside the notification sweep, not in a second one.

- [ ] **Step 1: Write the failing test**

Against the real database, in the same style as Task 7's:

- a `PENDING_PAYMENT` booking whose `expires_at` is in the past is returned by
  `findDueForExpiry(now, limit)`;
- one whose `expires_at` is in the future is not;
- one already `PAID`/`AWAITING_PROVIDER` is not, **even with `expires_at` in the
  past** — this is the case that matters, because a paid booking keeps its slot
  and expiring it would cancel a sale that already took the customer's money;
- `limit` is respected, and the oldest are returned first, so a backlog drains
  in the order it accumulated rather than starving the oldest booking for ever.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Implement `findDueForExpiry`, then the sweep**

Give the sweep its own `SWEEP_LIMIT`-style ceiling with a comment saying what
it is protecting against. Run each expiry independently: one booking that
throws must not stop the rest of the wave, and the failure must be logged
rather than swallowed.

- [ ] **Step 4: Run the booking and backend suites, and typecheck**

Run: `cd packages/backend && bun test src && bun run typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/ntizo/bounded-contexts/booking apps/backend/api/src/scheduled.ts packages/backend/src/modules/ntizo/shared/infrastructure/database/__tests__/booking-expiry-sweep.test.ts
git commit -m "Expire the bookings nobody paid for

ExpireBookingCommand had no caller. A customer who opens the payment
page and walks away held that member's slot for ever, because the
partial unique index is doing precisely its job. The cron that already
sweeps Communication every minute now asks the same question of
bookings past expires_at."
```

---

### Task 13: Let an administrator set the payment window

**Files:**
- Modify: `.../shared/infrastructure/database/platform/schemas/platform-settings.schema.ts`
- Create: migration (generate only — do not apply; that is a manual act per stage)
- Create: `.../booking/app/ports/outbound/platform-settings.reader.port.ts`
- Modify: `.../booking/app/use-cases/create-booking.command.ts`
- Modify: `.../booking/__tests__/create-booking.command.test.ts`
- Test: `.../shared/infrastructure/database/__tests__/booking-constraints.test.ts` (extend)

**Interfaces:**
- Consumes: `platformSettings` (existing table), `CreateBookingCommand` (Task 8).
- Produces: `PlatformSettingsReaderPort.findPaymentWindowMinutes(): Promise<number>`.

**Why this task exists.** `CreateBookingCommand` carries
`PENDING_PAYMENT_WINDOW_MINUTES = 30` as a named constant, with a comment saying
it is a stand-in. The booking spec deliberately leaves the window unset and says
it must be configured; it also warns that the 30 minutes its own mockup shows is
wrong for M-Pesa, whose C2B flow is synchronous — the customer approves on the
handset in a minute or two, not half an hour.

The number has a real cost on each side, which is exactly why it is not a
developer's to pick. Too long, and an abandoned checkout blocks a member's
calendar for half an hour while other customers are told the slot is taken. Too
short, and somebody who fumbles their PIN loses the slot they were in the middle
of paying for.

**It is a LIVE setting, not a seed.** Read `platform_settings`' own header
comment before you add the field: a seed is copied onto a row at creation and
the row keeps its copy; a live setting is read at the moment of the decision.
The window is read when a booking is created, so a change applies to every new
booking at once. Existing bookings keep the `expiresAt` they were given — that
is the booking snapshot behaving normally, not a seed relationship, and the
field's comment should say so, because the distinction is exactly what that
header warns people not to blur.

- [ ] **Step 1: Add the column**

```ts
  /**
   * LIVE. Minutes an unpaid booking holds its slot before expiring.
   *
   * Read when the booking is created, so a change applies to new bookings at
   * once; bookings already made keep the deadline they were given. Was a
   * hard-coded 30 in CreateBookingCommand.
   *
   * The trade is real in both directions: long enough and an abandoned
   * checkout blocks a member's calendar while other customers are turned
   * away, short enough and somebody who fumbles an M-Pesa PIN loses the slot
   * they were paying for. M-Pesa's C2B is synchronous — approval takes a
   * minute or two, not half an hour.
   */
  paymentWindowMinutes: integer("payment_window_minutes").notNull().default(15),
```

Add a CHECK that it is at least 1. A zero-minute window creates bookings that
are already expired, and a negative one creates bookings whose deadline is in
the past — both are rows the sweep will delete the instant they exist, and
neither is a state anybody meant to configure.

- [ ] **Step 2: Generate the migration and stop**

Run: `cd packages/backend && bun run db:ntizo:generate`

Read the generated SQL in full. Confirm it is one `ADD COLUMN` with a default
and one `ADD CONSTRAINT`, that there is no `DROP`, and that no `$N` bind
parameter appears anywhere — a migration file cannot carry them, and building a
CHECK with a query-builder helper is how they get in.

**Do not run any migrate command.** Migrations here are a manual act per stage.

- [ ] **Step 3: Write the failing test**

In the constraint test file, assert the CHECK refuses 0 and refuses -1, matching
that file's existing style: an async helper, and an assertion naming the
constraint rather than a bare `toThrow()`.

In the command test, assert that the reader's value is what reaches the
booking's `expiresAt` — set the fake to something that is not 15 and not 30, so
a command that ignored the reader and kept its constant would fail.

- [ ] **Step 4: The port and the command**

`PlatformSettingsReaderPort` returns the number, not the whole settings row. A
port that hands back every knob invites the next command to read a second one
through it and quietly become a dependency on the entire table.

Delete `PENDING_PAYMENT_WINDOW_MINUTES` from the command. Do not leave it as a
fallback: a fallback means a misconfigured deployment silently books with a
window nobody chose, and the single row it reads is created by the same
migration that adds the column.

- [ ] **Step 5: Wire the adapter in the bootstrap**

The Drizzle adapter reads the single `global` row. Task 10's bootstrap composes
it like the others.

- [ ] **Step 6: Run the suites and typecheck**

Run: `cd packages/backend && bun test src && bun run typecheck`

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/modules/ntizo
git commit -m "Let an administrator set how long a slot is held unpaid

The window was a constant with a comment admitting it was a guess, and
the spec says it must be configured. The number is a business trade, not
a developer's: too long blocks a member's calendar for an abandoned
checkout, too short loses the slot for somebody fumbling their M-Pesa
PIN. The default drops from 30 to 15, because M-Pesa's C2B is
synchronous and half an hour was never the shape of that flow."
```

---

### Task 14: The customer's own bookings

**Files:**
- Create: `.../booking/app/ports/outbound/booking-read.repository.port.ts`
- Create: `.../booking/infrastructure/repositories/drizzle/booking-read.repository.ts`
- Create: `packages/backend/src/modules/ntizo/read/booking/app/use-cases/list-my-bookings.projection.ts`
- Create: `packages/backend/src/modules/ntizo/read/booking/graphql/schema/queries.ts`
- Create: `packages/backend/src/modules/ntizo/read/booking/graphql/handlers/queries.handlers.ts`
- Create: `packages/backend/src/modules/ntizo/read/booking/bootstrap/index.ts`
- Create: `packages/backend/src/modules/ntizo/read/booking/index.ts`
- Modify: `packages/backend/src/modules/ntizo/read/schema.ts`
- Modify: `apps/backend/api/src/graphql/private.ts`
- Test: `packages/backend/src/modules/ntizo/read/booking/__tests__/list-my-bookings.projection.test.ts`

**Interfaces:**
- Consumes: `bookingReadModel` (Task 1), the `booking` table (Task 2).
- Produces: `booking.mine` as a query on the private GraphQL schema.

**Why this is a separate reader rather than the write repository.** `read/activity`
and `read/notification` both reuse the write side's repository, and their
bootstraps say why: the read model is the same rows in the same shape, so a
second class running identical SQL is two places to fix one bug. That reasoning
does not hold here. `DrizzleBookingRepository` rebuilds full aggregates through
`Booking.restore`, which re-runs every guard and both consistency checks on
every row — right for a booking you are about to change, wasteful for a list
nobody will mutate, and it turns one corrupt row into a failed page instead of
one odd line. `read/catalog` has the precedent for the other direction: a thin
reader selecting exactly the columns the DTO carries.

**Authorisation is the point of this query, not a detail.** BR7 says only the
booking's own customer, its provider, or an administrator may read it. This
query answers for the signed-in customer, so the `customerId` comes from the
GraphQL context and never from the input — a query that took it as an argument
would let anybody read anybody's bookings by changing one field.

- [ ] **Step 1: Write the failing test**

Assert: the projection returns only the signed-in customer's bookings, newest
first; a customer with none gets an empty list, not an error; every field of
`bookingReadModel` parses, so the DTO and the query cannot drift apart; and
dates come back as ISO strings rather than `Date` objects, because that is what
the read model declares and what crosses the wire.

Include a booking belonging to a *different* customer in the fixture. A test
whose fixture contains only the caller's own rows cannot fail if the `where`
clause is dropped.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Write the reader, the projection, the schema and the handler**
- [ ] **Step 4: Run the suites and typecheck**

Run: `cd packages/backend && bun test src && bun run typecheck`

- [ ] **Step 5: Prove the schema still builds**

The same `__typename` probe Task 10 uses, against both `/public/graphql` and
`/graphql`.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ntizo apps/backend/api/src/graphql/private.ts
git commit -m "Let a customer see their own bookings

The customer id comes from the signed-in context, never from the query
input. Taking it as an argument would have made this the endpoint that
reads anybody's bookings, and no amount of later checking undoes an
interface that invites it.

A thin reader rather than the write repository: that one rebuilds full
aggregates through Booking.restore, which re-runs every guard on every
row -- right before a change, wasteful for a list, and it turns one bad
row into a failed page instead of one odd line."
```

---

## Self-Review

**Spec coverage.** The spec's aggregate, snapshot, immutability, address-snapshot reasoning, commission-at-creation rule, `booking_change` table, the outbox events and the ports are all covered by Tasks 1–10. BR1 (published service), BR2 (slot held atomically), BR3 (commission arithmetic), BR5 (idempotent expiry) and BR8 (no booking for a quote service) each have a task and a test. **BR4, BR6 and BR7 belong to Plan 2** — snapshot immutability across a reschedule, holding before releasing, and read authorisation — and are named here so the gap is deliberate rather than forgotten.

**The expiry gap, and how it was closed.** As first written, this plan defined a `DelayedJobQueue` port in Task 6 and never ran anything that fired `ExpireBookingCommand` — the command was written and tested with no caller, which is not a smaller feature but a permanent slot leak. **Task 12 closes it with the cron sweep this paragraph originally offered as a stand-in.** It turned out not to be a compromise: `apps/backend/api/src/scheduled.ts` already wakes every minute in all three environments and already sweeps Communication for messages past `notify_due_at`, so a booking past `expires_at` is the same question against the same clock. A Cloudflare Queue would have added a deployment surface to do what one more query on an existing wake-up does. The `DelayedJobQueue` port still exists and is still the right seam if a real queue ever earns its place — Task 12 makes its adapter honest about doing nothing, rather than leaving expiry undone.

**Placeholder scan.** Tasks 4, 6, 7 and 11 describe tests by their assertions rather than printing them. That is a deliberate compression where the shape is fully determined by a named reference file in the same repository, and each says which file. Tasks 1, 3, 5, 8 and 9 — where the behaviour is new and the assertions are the design — carry their tests in full.

**Type consistency.** `commissionBps`/`commissionMinor`/`priceMinor` and `providerPayoutMinor` are used identically in Tasks 1, 3 and 7. `markPaid(paymentRef, at)` and `expire(at)` match between Tasks 5 and 9. `SlotAlreadyTakenError` is raised in Task 7 and caught in Task 8. `BookingTransitionError` is defined in Task 3 and first used in Task 5, which is why Task 3 defines it early rather than making Task 5 reopen the file.
