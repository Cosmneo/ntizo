# Phase 3A — Unit of Work + Transactional Outbox

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make multi-aggregate writes atomic, and stop discarding domain events.

**Architecture:** A transaction bound to `AsyncLocalStorage`, exactly as the doazores reference does it. `getDb()` becomes transaction-aware, so all 32 existing call sites join an open transaction with no repository changes. A `DrizzleUnitOfWork` implementing the kit's `UnitOfWorkPort` wraps use cases that write more than once. An outbox table receives domain events **in the same transaction** as the state change, so an event can never describe a write that rolled back.

**Tech Stack:** Bun 1.3.9, Drizzle + postgres.js, Neon, Cloudflare Workers, `@cosmneo/onion-lasagna` 1.0.0-beta.3.

## Global Constraints

- `@cosmneo/*` stays pinned **exactly** at `1.0.0-beta.3`. `latest` is `0.4.1`, a different API line.
- Repo root is `ntizo-workspace/`. All paths are relative to it.
- Workers forbid reusing I/O across requests. The DB handle is already per-request via `infraStore` + `Db.getDbConnection()`; a transaction must live strictly inside one request.
- The per-request pool is `{ max: 1 }`. A transaction therefore holds **the only** connection — anything inside it that asks for a second connection deadlocks. This is precisely why `getDb()` must return the transaction handle.
- `read/<bc>` stays queries-only; `write/<bc>` mutations-only. Fitness tests enforce it.
- No `as UserRole` casts; use `toUserRole()`.
- Run `bun run check-types && bun run lint && bun run test && bun run build` from the repo root before every commit. `lint` now covers all 9 packages.

## What exists today, and what is wrong with it

- **Zero transactions anywhere in the backend.** Verified: `grep -rn "\.transaction(" packages/backend/src` returns nothing.
- **Four use cases write two aggregates non-atomically:**
  - `bounded-contexts/user/app/use-cases/create-user-on-sign-up.internal.command.ts` — user + profile, and it runs inside better-auth's sign-up hook
  - `bounded-contexts/provider/app/use-cases/provider/create-provider.command.ts` — provider + owner member
  - `bounded-contexts/provider/app/use-cases/provider/create-provider.internal.command.ts` — same pair
  - `bounded-contexts/provider/app/use-cases/invite/accept-provider-invite.command.ts` — member + invite
- **`create-provider` failing between its two writes is unrecoverable by the app.** `provider.mine` lists via `provider_member`, and `provider.byId` requires membership (the Phase 1A IDOR fix). A provider with no member row is invisible to everyone, including its creator, forever.
- **14 sites pull domain events and throw them away**, each marked `// TODO(ntizo): dispatch provider.pullEvents() through an outbox/dispatcher.`
- **Domain events are hand-rolled** (`{ name, occurredAt, payload }`) with **no `aggregateId`** — which the outbox table requires.

## Decisions taken up front

**1. Make `getDb()` transaction-aware rather than renaming it to `getActiveDb()`.**
All 32 call sites already funnel through `getDb()`. Changing its body means every repository joins an open transaction automatically, with no edits and no chance of missing one. The reference uses a separate `getActiveDb()` because its repositories were written against it from the start; adopting that name here would mean 32 edits whose only failure mode is silent — a missed call site would quietly write outside the transaction.

**2. Adopt the kit's `BaseDomainEvent`.**
The outbox needs `aggregateId` and a stable event id. The local `DomainEvent` interface has neither. Both fixes touch the same 9 event classes, so take the one that aligns with the kit and the reference instead of growing a parallel abstraction.

**3. No relay, no queue, in this slice.**
Nothing consumes events yet. Events become durable and correctly ordered relative to state; shipping them is a separate concern with its own trigger (see the follow-ups doc). An outbox without a relay is a durable log, which is honest. A relay without a transaction is a queue that can lie — that ordering is why this slice is UoW-first.

---

### Task 1: Transaction context

**Files:**
- Create: `packages/backend/src/shared/infrastructure/database/tx-context.ts`
- Modify: `packages/backend/src/modules/better-auth/infrastructure/client/drizzle.ts`
- Test: `packages/backend/src/shared/infrastructure/database/__tests__/tx-context.test.ts`

**Interfaces:**
- Consumes: `Db.getDbConnection()` from `shared/infrastructure/database/connection`
- Produces: `getActiveDb()`, `hasActiveTransaction()`, `runInTransaction(work)`, `ensureTransaction(work)`, `runAfterCommit(cb)`, and a transaction-aware `getDb()`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "bun:test";
import {
  hasActiveTransaction,
  runAfterCommit,
  __runWithTransactionContextForTests,
} from "../tx-context";

describe("transaction context", () => {
  it("reports no active transaction outside one", () => {
    expect(hasActiveTransaction()).toBe(false);
  });

  it("reports an active transaction inside one", async () => {
    await __runWithTransactionContextForTests({} as never, async () => {
      expect(hasActiveTransaction()).toBe(true);
    });
  });

  it("defers after-commit callbacks until the transaction ends", async () => {
    const order: string[] = [];
    await __runWithTransactionContextForTests({} as never, async () => {
      await runAfterCommit(() => { order.push("after"); });
      order.push("inside");
    });
    expect(order).toEqual(["inside", "after"]);
  });

  it("runs an after-commit callback immediately when no transaction is active", async () => {
    const order: string[] = [];
    await runAfterCommit(() => { order.push("ran"); });
    expect(order).toEqual(["ran"]);
  });

  // A callback throwing must not surface as a failed request: the transaction
  // has already committed, so the write IS durable. Reporting failure would be
  // a lie, and aborting siblings would silently skip unrelated side-effects.
  it("isolates a throwing after-commit callback from its siblings", async () => {
    const ran: string[] = [];
    await __runWithTransactionContextForTests({} as never, async () => {
      await runAfterCommit(() => { throw new Error("boom"); });
      await runAfterCommit(() => { ran.push("second"); });
    });
    expect(ran).toEqual(["second"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test packages/backend/src/shared/infrastructure/database`
Expected: FAIL — module does not resolve.

- [ ] **Step 3: Implement `tx-context.ts`**

Port the reference implementation at
`/Users/saliffaustino/Desktop/Salif/Projects/doazores-workspace/doazores/packages/backend/src/shared/infrastructure/database/tx-context.ts`
— **read it in full first.** Adapt only what must change:
- the client comes from `Db.getDbConnection().drizzleDbClient`, not `getDrizzleClient()`
- Ntizo has no `causeChain` helper; log the error directly
- keep `__runWithTransactionContextForTests`, the test seam the tests above use

- [ ] **Step 4: Make `getDb()` transaction-aware**

In `modules/better-auth/infrastructure/client/drizzle.ts`, `getDb()` returns the
active transaction when one is bound, otherwise the request-scoped client.
Document why the name did not change: 32 call sites, and a missed one fails
silently by writing outside the transaction.

- [ ] **Step 5: Run the tests**

Expected: PASS, 5 tests.

- [ ] **Step 6: Break-check the isolation property**

Make `drainAfterCommit` rethrow instead of logging. The isolation test must
fail. Restore, confirm green. Report what you saw.

- [ ] **Step 7: Commit**

```bash
git commit -am "feat(backend): transaction context bound to AsyncLocalStorage"
```

---

### Task 2: Unit of Work adapter

**Files:**
- Create: `packages/backend/src/shared/infrastructure/unit-of-work/drizzle-unit-of-work.adapter.ts`
- Create: `packages/backend/src/shared/infrastructure/unit-of-work/index.ts`
- Test: `packages/backend/src/shared/infrastructure/unit-of-work/__tests__/drizzle-unit-of-work.test.ts`

**Interfaces:**
- Consumes: `UnitOfWorkPort` from `@cosmneo/onion-lasagna/ports` (verified present in `1.0.0-beta.3`: `atomicExecute<T>(work: () => Promise<T>): Promise<T>`), and `ensureTransaction` from Task 1
- Produces: `DrizzleUnitOfWork`

- [ ] **Step 1: Write the failing test**

Assert that `atomicExecute` runs the work, returns its value, and that a
nested `atomicExecute` joins rather than opening a second transaction (use
`hasActiveTransaction()` plus a counter to prove reentrancy).

- [ ] **Step 2: Run it, watch it fail**

- [ ] **Step 3: Implement**

```ts
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { ensureTransaction } from "../database/tx-context";

/**
 * Unit of Work backed by a Drizzle/postgres.js transaction threaded through
 * AsyncLocalStorage. Any repository reading or writing via `getDb()` joins the
 * transaction opened here automatically — that is the whole reason `getDb()`
 * resolves the active transaction rather than the request client.
 */
export class DrizzleUnitOfWork implements UnitOfWorkPort {
  atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    return ensureTransaction(work);
  }
}
```

- [ ] **Step 4: Run the tests, then commit**

---

### Task 3: Make the four multi-write use cases atomic

**Files (all under `packages/backend/src/modules/ntizo/bounded-contexts/`):**
- Modify: `user/app/use-cases/create-user-on-sign-up.internal.command.ts`
- Modify: `provider/app/use-cases/provider/create-provider.command.ts`
- Modify: `provider/app/use-cases/provider/create-provider.internal.command.ts`
- Modify: `provider/app/use-cases/invite/accept-provider-invite.command.ts`
- Modify: the bootstraps that construct them
- Test: one test per use case asserting rollback

**Interfaces:**
- Consumes: `UnitOfWorkPort`, injected as a constructor dependency — not imported concretely, so the use cases stay testable with an in-memory double

- [ ] **Step 1: Write the failing tests first**

For each use case, one test: make the **second** repository write reject, and
assert the **first** write is not visible afterwards. Use a fake repository
pair sharing an in-memory store plus an in-memory UoW that models rollback:

```ts
class InMemoryUnitOfWork implements UnitOfWorkPort {
  async atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    const snapshot = structuredClone(store);
    try {
      return await work();
    } catch (e) {
      restore(snapshot);
      throw e;
    }
  }
}
```

These tests must fail before the change: today the first write survives.

- [ ] **Step 2: Run them, confirm each fails for the right reason**

Expected: the first write IS visible — that is the bug.

- [ ] **Step 3: Inject the UoW and wrap the writes**

Each use case takes `unitOfWork: UnitOfWorkPort` and wraps its writes in
`this.unitOfWork.atomicExecute(async () => { ... })`. Do not wrap the
authorization checks or input validation — only the writes.

- [ ] **Step 4: Run the tests**

Expected: PASS. Nothing else in the suite regresses.

- [ ] **Step 5: Prove it against the real database**

Start the API (Node ≥22: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`,
then `cd apps/backend/api && bun run dev`, port 8788; every `/graphql` curl
needs `-H 'Origin: http://localhost:3000'`).

Temporarily make the member insert throw inside `create-provider`, call
`providerCreate`, and confirm **no orphan provider row exists** in
`ntizo_provider.provider`. Before this task, the row survives. Restore, confirm
a normal create still works. This is the check that matters — the unit tests
model rollback, they do not prove Postgres performed one.

DB access: `DB=$(grep -h "^DATABASE_URL" apps/backend/api/.dev.vars | head -1 | cut -d= -f2-)`
— use `cut`, not a greedy sed; the connection string contains `=` in
`channel_binding=require`. Query from `packages/backend`. Tables live in named
schemas (`ntizo_provider.*`), never `public`. Delete throwaway users from
**both** `better_auth` and `ntizo_user`; nothing cascades.

- [ ] **Step 6: Commit**

---

### Task 4: Adopt the kit's `BaseDomainEvent`

**Files:**
- Modify: `packages/backend/src/modules/ntizo/bounded-contexts/provider/domain/events/index.ts` (9 event classes)
- Modify: `provider/domain/aggregates/provider/provider.aggregate.ts` (`pullEvents` at line 163)
- Modify: any other aggregate raising events
- Test: assert every event exposes a non-empty `aggregateId` and a unique `eventId`

**Interfaces:**
- Consumes: `BaseDomainEvent` from `@cosmneo/onion-lasagna` (verified present in `1.0.0-beta.3`; constructor shape `super(eventName, aggregateId, payload)`)
- Produces: 9 events carrying `eventId`, `eventName`, `aggregateId`, `payload`, `occurredAt`

- [ ] **Step 1: Read the kit's `BaseDomainEvent` declaration**

`node_modules/.bun/@cosmneo+onion-lasagna@1.0.0-beta.3*/node_modules/@cosmneo/onion-lasagna/dist/index.d.ts`,
around line 817. Match its actual constructor — do not guess from the doc comment.

- [ ] **Step 2: Write the failing test**

Assert, for each event class, that `aggregateId` is the id of the thing the
event is about (not empty, not the payload object) and that two instances get
different `eventId`s.

- [ ] **Step 3: Convert the 9 classes**

The `name` property becomes the kit's `eventName`; keep the same string values
(`"provider.created"` etc.) — they are the outbox's `event_type` and changing
them silently would orphan any consumer written against them later.

- [ ] **Step 4: Run the full suite, then commit**

---

### Task 5: Outbox table

**Files:**
- Create: `packages/backend/src/modules/ntizo/shared/infrastructure/database/outbox/schemas/outbox-event.schema.ts`
- Create: the migration
- Modify: the schema barrel

- [ ] **Step 1: Define the table**

Mirror the reference's shape, in an `ntizo_outbox` schema:
`id` (uuid pk), `eventType` (varchar 255), `aggregateType` (varchar 100),
`aggregateId` (uuid), `payload` (jsonb), `metadata` (jsonb, nullable),
`status` (varchar 20, default `"pending"`), `createdAt` (timestamptz),
plus an index on `status`.

- [ ] **Step 2: Generate and apply the migration**

Follow the existing drizzle-kit setup in `packages/backend`. Read how the
current migrations were generated before running anything — there are two
migration chains in this repo (better-auth and ntizo).

- [ ] **Step 3: Verify the table exists in the real database, then commit**

---

### Task 6: Outbox port, adapter, and the 14 discard sites

**Files:**
- Create: `packages/backend/src/modules/ntizo/shared/app/ports/outbox.port.ts`
- Create: `packages/backend/src/shared/infrastructure/outbox/outbox.adapter.ts`
- Create: `packages/backend/src/shared/infrastructure/outbox/drizzle/outbox-event.repository.ts`
- Modify: the 14 use cases carrying the `// TODO(ntizo): dispatch ... outbox` comment
- Modify: bootstraps

**Interfaces:**
- Produces: `OutboxPort { publish(events: BaseDomainEvent[], aggregateType: string): Promise<void> }`

- [ ] **Step 1: Write the failing test**

The property that matters: `publish` inserts through `getDb()`, so when called
inside `atomicExecute` the insert joins that transaction. Assert that a
rolled-back transaction leaves **no** outbox row — an event describing a write
that did not happen is worse than no event.

- [ ] **Step 2: Implement the repository and adapter**

Read the reference adapter first. Skip its `QueuePublisherPort` — no queue in
this slice. Keep its error-boundary posture: an already-classified `InfraError`
passes through untouched rather than being re-wrapped into a generic one.

- [ ] **Step 3: Replace the 14 discards**

Each site currently reads:

```ts
// TODO(ntizo): dispatch provider.pullEvents() through an outbox/dispatcher.
provider.pullEvents();
```

It becomes a `publish` call inside the same transaction as the writes. Use
cases that do **not** yet have a UoW must get one — publishing outside a
transaction defeats the entire point.

- [ ] **Step 4: Verify no discard sites remain**

```bash
grep -rn "TODO(ntizo): dispatch" packages/backend/src
```
Expected: nothing.

- [ ] **Step 5: Prove it end-to-end against the real database**

Create a provider through GraphQL and confirm a `provider.created` row lands in
`ntizo_outbox.outbox_event` with the right `aggregateId`. Then force the member
write to fail and confirm **neither** the provider row **nor** the outbox row
exists. That pair is the whole thesis of the transactional outbox.

- [ ] **Step 6: Commit**

---

### Task 7: Full verification

- [ ] **Step 1: Root sweep** — `bun run check-types && bun run lint && bun run test && bun run build`

- [ ] **Step 2: Live** — sign up (exercises `create-user-on-sign-up`, now transactional), sign in, create a provider, accept an invite. Confirm the app behaves unchanged and outbox rows appear.

- [ ] **Step 3: Confirm the Workers constraint still holds** — the per-request pool is `max: 1`, so a transaction holds the only connection. Watch for any request that hangs rather than errors; a deadlock here looks like a timeout, not a failure.

- [ ] **Step 4: Record what remains**

- no relay and no consumer — outbox rows accumulate unread, by design
- `status` is always `"pending"`; nothing advances it yet
- pruning is not implemented, so the table grows without bound

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "chore: Phase 3A complete — atomic writes, durable events"
```
