# Provider Commission Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a provider the commission rate that comes out of their payouts, so the Terms of Service stop making a promise the product does not keep.

**Architecture:** A read query scoped to the signed-in provider's own workspace, a field on the provider read model, and a place in the provider area that shows it. No writes — an administrator sets the rate and the provider cannot change it, which the copy already says correctly.

**Tech Stack:** Bun, Drizzle over Neon Postgres, `@cosmneo/onion-lasagna`, GraphQL, React 19 + TanStack Router, vitest on the web package.

**Spec:** none of its own. This exists because the whole-branch review of `2026-08-30-booking-seams` found that four surfaces in eight locales — the Terms among them — now state *"a stated percentage, shown to you before you list a service"*, and no provider-facing surface exposes `commissionBps` at all. `provider.schema.ts`'s own comment is the authority on what the rate means.

## Global Constraints

- **The rate is the provider's own, and comes from the session.** Never from a query argument. A provider id in the input is how this becomes the endpoint that reads a competitor's commercial terms.
- Money is integer minor units; the rate is basis points. 1200 bps is 12%, and the dev database holds 1200, not 1000 — do not hardcode 10% anywhere, in copy or in code.
- `app/` must not import `infrastructure/`. **Nothing enforces this mechanically** on the backend — `eslint-plugin-boundaries` is configured only for `apps/frontend/web`.
- Backend tests are `bun test` from `packages/backend`, never the worktree root. The web app uses vitest, and its test setup resolves i18n to `en` — assert English copy, never key names.
- The dev database is shared. Randomise identifiers, clean up, and re-run a failing database test alone before reporting it.
- Any new module under `modules/ntizo/` needs its `packages/backend/package.json` `exports` entry. Without it `tsc` and `bun test` both pass inside `packages/backend` and only a cross-package build fails.
- Comments say *why*, not *what*.

---

### Task 1: The provider can ask what their rate is

**Files:**
- Modify: `packages/shared/src/read-models/system/provider/` — whichever model carries the provider's own workspace
- Modify or create: the read-tier query for the provider's own workspace, following `read/provider`'s existing shape
- Modify: `apps/backend/api/src/graphql/private.ts` if a new handler is registered
- Test: alongside the existing read-tier tests for that module

**Interfaces:**
- Produces: `commissionBps` on the provider's own workspace read model, reachable only by that provider.

**Read `read/provider` before adding anything.** A query for the signed-in provider's own workspace may already exist; if it does, this is one field on an existing model rather than a new query, and adding a second query would be the worse outcome. Say which you found.

**Authorisation is the whole task.** The rate is a commercial term. `read/booking`'s `booking.mine` is the pattern: an empty input object, `requireUser(ctx)` for the identity, and the resolver parameter named `_args` because it is never read. Follow it.

**The fixture must contain another provider's workspace**, with a different rate, and an assertion that the caller gets their own. A fixture holding only the caller's own row cannot fail if the `where` clause is dropped — and dropping it here exposes every provider's terms to every other.

- [ ] **Step 1: Write the failing test**

Assert: the signed-in provider gets their own `commissionBps`; a second provider with a different rate is not returned; the value is the raw basis points, not a formatted percentage — formatting is the view's job and a number that arrives pre-formatted cannot be localised.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Add the field and the query**
- [ ] **Step 4: Run the suites and typecheck**
- [ ] **Step 5: Prove the schema still builds**

```bash
cd apps/backend/api && bun run dev     # Node 22 on the PATH for wrangler
curl -s -X POST http://localhost:8788/graphql -H 'Content-Type: application/json' -d '{"query":"{ __typename }"}'
curl -s -X POST http://localhost:8788/public/graphql -H 'Content-Type: application/json' -d '{"query":"{ __typename }"}'
```

Both endpoints, and paste both responses. A schema that fails to compose fails at request time and nowhere else.

- [ ] **Step 6: Commit**

```bash
git add packages/backend packages/shared apps/backend/api
git commit -m "Let a provider read their own commission rate

The rate comes out of their payouts and until now lived only in the
admin panel. The Terms already tell them they will see it before they
list a service, which was not true when that sentence shipped.

Scoped to the signed-in provider by the same shape booking.mine uses --
empty input, identity from the context, resolver argument named _args
because it is never read. A provider id in the input would make this
the endpoint that reads a competitor's commercial terms."
```

---

### Task 2: And can see it before they list

**Files:**
- Modify: the provider-area page where a workspace's own terms belong — read `apps/frontend/web/src/features/` and say which you chose and why
- Modify: `apps/frontend/web/src/shared/locales/*/` — the provider-area namespace, all eight locales
- Test: alongside that page's existing tests

**Interfaces:**
- Consumes: Task 1's field.

**Where it goes is a judgement, and the Terms constrain it.** They say *"shown to them before they list a service"*. A rate buried three clicks into a settings page does not satisfy that sentence; neither does one shown only after publishing. Somewhere a provider passes through while setting up, or on the workspace surface they see first. Pick, and justify the pick in your report — if you conclude no such place exists and one must be created, say so rather than putting it where it fits most easily.

**Format from the basis points, in the view.** `1200` renders as `12%` through the locale's own number formatting, not by dividing and concatenating a `%`. `Intl.NumberFormat` with `style: "percent"` is how the rest of this app does it.

**Do not restate the mechanics in new copy.** The landing page, the sign-up page and the Terms already explain that the fee comes out of the payout. This surface answers one question — *what is my rate* — and a second explanation here is a second thing to keep true.

- [ ] **Step 1: Write the failing test**

Assert the rate renders as a percentage for a provider whose rate is **not** 10% — use 1200, the value dev actually holds, so a component that ignored the prop and hardcoded the default would fail.

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Build it**
- [ ] **Step 4: Run the web suite and typecheck**

Run: `cd apps/frontend/web && bun run test && bun run typecheck`

- [ ] **Step 5: Look at it, in Portuguese**

Run the app, sign in as a provider, and read the page as one. `pt-MZ` is what a real reader hits first. Then open `/terms` and read the fee clause against what you just built: the sentence promises this, and the page has to keep it. Say in your report whether it does.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/web/src
git commit -m "Show a provider their rate where the Terms promise it

The Terms say the percentage is shown to them before they list a
service. That sentence shipped before anything showed it. This is the
page that makes it true.

Formatted from basis points through the locale's own percent
formatting -- the dev database holds 1200, not 1000, and copy or code
that assumes ten percent is already wrong."
```

---

## Self-Review

**Spec coverage.** There is no spec; the requirement is one sentence in a contract, quoted at the top. Both tasks trace to it.

**The thing this plan is really for.** A false clause in a live document. The alternative was deleting the sentence, and the owner chose to make it true instead — which means the plan is not finished when the tests pass, but when a provider can actually read their rate before publishing. Task 2's Step 5 is that check, and it is the only step that can fail in a way the suite cannot see.

**Placeholder scan.** Task 2 deliberately does not name the page. Choosing it needs the codebase in front of you and the Terms' wording in mind, and naming a file I have not read would be the third short file list on these plans.

**Type consistency.** `commissionBps` is `number` in basis points everywhere — the read model, the query, the prop. It is formatted exactly once, in the view.
