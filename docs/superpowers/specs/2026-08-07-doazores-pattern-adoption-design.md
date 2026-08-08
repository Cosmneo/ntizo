# Adopting the doazores Architecture in Ntizo — Design

**Date:** 2026-08-07
**Status:** Approved (design), pending implementation plan
**Author:** Salif Faustino (with Claude)
**Reference project:** `/Users/saliffaustino/Desktop/Salif/Projects/doazores-workspace/doazores`

## Summary

Adopt the doazores project's architecture, conventions and technology choices
across Ntizo's backend, packages and web frontend — **without** porting its
tourism/activities domain logic. Alongside the patterns, port the
domain-agnostic shared infrastructure doazores has already proven (outbox,
unit-of-work, error taxonomy, file-storage, dev-db, e2e harness).

The work is decomposed into **four sequential sub-projects**, each with its own
spec, plan and verification cycle. This document covers the shape of all four
and specifies **Phase 1 (the Provider vertical slice)** in detail.

## Supersedes

This design **reverses one decision** from
`2026-07-17-single-web-app-consolidation-design.md`, which stated:

> **No GraphQL adoption.** Keep Ntizo's REST + better-auth data layer.

GraphQL is now **in scope**. Every other decision in that document
(single web app, path-based zones, Cloudflare deployment, feature-based
structure) still stands and is extended, not replaced, by this one.

## Motivation

Ntizo's current architecture is a hand-rolled approximation of the pattern
doazores implements properly with `@cosmneo/onion-lasagna`. Three concrete
problems today:

1. **`packages/backend` depends on a web framework.**
   `bounded-contexts/provider/infrastructure/rest/provider.router.ts` imports
   Hono directly, and reaches across module boundaries into better-auth's
   drizzle client to join user rows. doazores forbids both: route
   *definitions* use only the core kit, and the framework *binding* lives at
   the app layer.
2. **No read/write separation.** Queries and commands share aggregates and
   repositories, so read paths pay aggregate-hydration cost and read models
   can't evolve independently.
3. **Architecture is enforced by convention only.** Nothing fails when a
   boundary is crossed. doazores enforces its boundaries with lint rules and
   fitness tests that fail CI.

The scale gap is the reason this must be decomposed rather than attempted at
once:

| Area | doazores | Ntizo | ratio |
|---|---|---|---|
| `packages/backend` | 320,018 lines | 4,292 | 75× |
| web frontend | 138,223 | 4,582 | 30× |
| **total (5 areas)** | **~492,000** | **~10,700** | **~46×** |

## Decisions

| Topic | Decision |
|---|---|
| Scope | Patterns **+ domain-agnostic shared infrastructure**. No tourism business logic. |
| Sequencing | **Vertical slice per bounded context.** Provider first, then User. |
| Rendering | **TanStack Start; SSR + prerender public routes only.** `/provider` and `/admin` stay client-rendered behind auth. |
| Data layer | **GraphQL** (supersedes the July "no GraphQL" decision). better-auth stays REST. |
| API runtime | **Cloudflare Workers, swapped inside Phase 1.** See "Assumption to confirm". |
| Package naming | Keep Ntizo's `@ntizo/*`. Do **not** adopt doazores' `@repo/*`. |

### API runtime — confirmed

The Workers swap happens **inside Phase 1** (explicitly confirmed 2026-08-07).
Rationale: the API app is being substantially rewritten regardless, so writing
it Bun-shaped first would mean rewriting it Workers-shaped later. It is
sequenced **first** within Phase 1 so that if the runtime proves troublesome,
the failure is cheap and isolated rather than entangled with GraphQL work.

## Target architecture

### Backend: CQRS tier split

Ntizo today puts domain, use cases and the REST router inside
`bounded-contexts/provider/`. doazores splits presentation out by tier:

```
modules/ntizo/
  bounded-contexts/<bc>/   write DOMAIN core — aggregates, ports, use-cases, repos
  write/<bc>/graphql/      session-authed MUTATIONS (schema + handlers)
  write/<bc>/http/         webhooks / M2M — transport-level auth, vendor envelopes
  write/<bc>/events/       event handlers + routes
  read/<bc>/               QUERY side — own bootstrap, ports, use-cases, repos, queries
  public/<bc>/             anonymous / guest-token surface
  orchestrations/          cross-BC sagas   ← Ntizo already has this
```

The read side is **fully independent**: its own `app/ports`, `use-cases`,
`bootstrap` and `infra/repositories`. It bypasses aggregates and projects
straight to read models.

**Load-bearing rule:** `packages/backend` must have **no framework-adapter
dependency**. Route and field definitions use only
`@cosmneo/onion-lasagna/*` + `@cosmneo/onion-lasagna-zod`. The Hono/Yoga
binding lives exclusively in `apps/backend/api/src/`.

### Frontend: Clean Architecture + MVVM

```
src/features/<feature>/
  domain/      pure logic + types      depends on: nothing
  data/        GraphQL repositories    depends on: domain
  viewmodel/   hooks, presentation     depends on: domain, data
  ui/          components              depends on: viewmodel, domain
  locales/     per-feature i18n catalogs
```

Mirrored by `src/shared/{domain,data,viewmodel,ui,lib}`. Dependency arrows are
enforced by `eslint-plugin-boundaries`, classifying elements as
`domain | data | viewmodel | ui | routes | i18n | staticdata`.

`data/*.repository.ts` exports TanStack Query **queryOptions** (not hooks) and
accepts an injectable caller interface, so the data layer is testable without a
network.

## Phase decomposition

| Phase | Scope | Delivers |
|---|---|---|
| **1. Provider slice** | Rails (onion-lasagna, GraphQL Yoga, boundaries lint, `#/` imports, fitness tests, TanStack Start, Workers) + Provider BC end-to-end | Architecture proven by one real context |
| **2. User slice** | User BC through the same layers; `@ntizo/auth-client` package | Pattern repeated; rails validated by a second consumer |
| **3. Shared infra** | outbox, unit-of-work, file-storage, error taxonomy, locale, dev-db, e2e harness | Proven plumbing |
| **4. SSR + public surface** | prerendering, `public/<bc>`, SEO routes | Marketing/listing pages that rank |

Phase 1 is disproportionately large because it carries the one-time rails cost.
That is inherent to the vertical-slice strategy; the alternative ("rails first")
was rejected because it delivers nothing runnable and defers discovery of rail
problems.

---

## Phase 1 — Provider vertical slice

### 1.1 Dependencies

Workspace root `package.json` currently pins `@cosmneo/onion-lasagna` **0.4.0**
in `overrides` — and nothing imports it (the only textual mention is a comment
in `saga.ts`). Bump all seven `@cosmneo/*` overrides to **`1.0.0-beta.3`**,
verified published for every one of them.

> **Pin exactly.** `1.0.0-beta.3` is *not* the `latest` dist-tag — `latest` is
> `0.4.1`. A range like `^1.0.0-beta.3` or any resolution that consults
> `latest` will silently pull the 0.4.x line, which is a different API. This is
> also why doazores pins exact versions in `overrides` rather than in each
> package's `dependencies`.

Add to `packages/backend`: `@cosmneo/onion-lasagna`, `-zod`, `-yoga`, `zod`.
Add to `apps/backend/api`: `-hono`, `graphql`, `graphql-yoga`, the four
`@escape.tech/graphql-armor-*` plugins, `@graphql-yoga/plugin-csrf-prevention`,
`@graphql-yoga/plugin-disable-introspection`, `wrangler`,
`@cloudflare/workers-types`.
Add to `apps/frontend/web`: `@tanstack/react-start`,
`@cosmneo/onion-lasagna-graphql-client`, `-graphql-react-query`,
`@cloudflare/vite-plugin`, `eslint-plugin-boundaries`, `zod`.

### 1.2 `packages/shared`

Convert read-models from bare TS interfaces to **zod schemas** — they become the
GraphQL output contracts and flow through to the typed frontend client.

- `read-models/system/provider/provider-list-item.schema.ts` → zod
- `read-models/system/user/current-user.schema.ts` → zod

Export both the schema and its inferred type, so existing type-only importers
keep compiling.

### 1.3 `packages/backend`

| Action | Path | Detail |
|---|---|---|
| **Delete** | `bounded-contexts/provider/infrastructure/rest/provider.router.ts` | Removes the Hono + cross-module drizzle leak |
| **Keep** | `bounded-contexts/provider/{domain,app,infrastructure/repositories}` | Already matches the reference's write-domain core |
| **Add** | `write/provider/graphql/{schema,handlers}` | Mutations: `create`, `update`, `deactivate`, `invite`, `acceptInvite`, `revokeInvite`, `removeMember`, `updateMemberRole`, `registerMe` (→ existing saga) |
| **Add** | `read/provider/{app,bootstrap,infra,graphql}` | Queries: `provider.mine`, `provider.byId` (members + invites). Own repositories — no aggregate hydration. |
| **Add** | `modules/ntizo/graphql/context.ts` | Context schema shared by all fields |
| **Add** | `modules/ntizo/graphql/private-schema.ts` | `merge(readSchema, writeSchema)` |

The `provider.byId` query absorbs the user-name join that the deleted router did
by importing better-auth's drizzle client. It belongs in a **read-side
repository** that owns that query explicitly.

### 1.4 `apps/backend/api`

- Hono binding + GraphQL Yoga mounted at `/graphql`, built lazily and memoised
  per isolate (`c.env.STAGE` is constant per deployment).
- Hardening: cost-limit, max-aliases, max-tokens, max-directives, CSRF (all
  stages); introspection disabled in prod only; GraphiQL enabled outside prod.
- Context factory fed from the existing `executionContextMiddleware`.
- better-auth stays REST at `/api/auth/*`.
- Runtime swapped from the Bun fetch server to a Workers default export;
  `wrangler.jsonc` per stage; `wrangler dev` for local.

### 1.5 `apps/frontend/web`

- Restructure `features/provider/` from `{components,hooks,lib,pages}` into
  `{domain,data,viewmodel,ui,locales}`.
- Replace `features/provider/lib/provider-api.ts` (hand-rolled `fetch`) with the
  typed GraphQL client; `data/provider.repository.ts` exports queryOptions.
- Add `#/*` subpath imports; retain `@/*` (the reference supports both).
- Add `eslint-plugin-boundaries` config.
- Adopt TanStack Start: SSR + prerender `/` and future public routes;
  `/provider` and `/admin` client-rendered.
- Frontend worker entry becomes `@tanstack/react-start/server-entry`.

### 1.6 Data flow (after)

```
ui/  →  viewmodel/ (hook)  →  data/ (queryOptions + GraphQL client)
                                        │
                                   POST /graphql
                                        │
              apps/backend/api  →  Yoga  →  field handler
                                        │
                    read/provider/use-cases   (queries)
                    write/provider → BC use-cases → aggregate  (mutations)
                                        │
                                    drizzle → Postgres
```

### 1.7 Error handling

- Domain exceptions stay as they are in `domain/exceptions/`.
- A GraphQL error-remap plugin maps them to stable `errorCode`s, so the
  frontend switches on codes rather than message strings (the current
  `provider-api.ts` parses `{ error: message }` text).
- Transport-level failures keep Yoga's envelope.
- better-auth errors are untouched.

### 1.8 Testing

**Backend** (`bun test`):
- Domain unit tests per aggregate (Ntizo has none today — added with the slice).
- Handler tests per GraphQL field.
- **Fitness tests**, ported from the reference and required from day one:
  - `read/` exposes queries only; `write/` mutations only
  - `packages/backend` never imports `@cosmneo/onion-lasagna-hono`
  - no bounded context exposes its own router
  - public-imports guard

**Frontend** (`vitest`):
- `domain/` pure unit tests
- `data/` tests via the injectable caller interface (no network)
- `viewmodel/` hook tests
- `eslint-plugin-boundaries` failing the build on a crossed arrow

Note: `bun run lint` in `apps/frontend/web` currently fails with
`eslint: command not found` — eslint is not installed. This must be fixed as
part of 1.5, since boundaries enforcement depends on lint actually running.

### 1.9 Continuity

REST endpoints stay live until the frontend cuts over within the same slice,
then are deleted. The app remains working throughout — no broken window, and no
period of double-maintenance beyond the slice itself.

### 1.10 Definition of done

- `provider.mine` and `provider.byId` served over GraphQL; REST provider router
  deleted.
- Provider zone works end-to-end against GraphQL in a browser.
- All fitness tests and boundaries lint pass.
- `bun run test`, `typecheck` and `lint` green in every changed workspace.
- Landing page SSRs; `/provider` and `/admin` client-render.

## Risks

| Risk | Mitigation |
|---|---|
| Workers swap is the single riskiest item | Do it first within Phase 1, before GraphQL work, so failure is cheap and isolated |
| onion-lasagna is `1.0.0-beta.3` — a beta | Pinned exactly, as doazores does; the reference is a working proof at scale |
| TanStack Start SSR + auth interaction | Public routes only; authed zones stay client-rendered, avoiding server-side session plumbing in Phase 1 |
| Slice 1 scope is large | Rails cost is one-time; Phases 2–4 are materially smaller |

## Non-goals

- Porting doazores' tourism domain (activities, islands, channels, direct-*).
- Migrating the six placeholder bounded contexts (catalog, pricing, scheduling,
  booking, payment, communication, review) — they are empty schema stubs and
  will be built the new way when they are built.
- Stripe/payments, PostHog, messaging-ui, Tiptap.
- Changing `@ntizo/*` package naming.
- Mobile app.

## Carried forward from Phase 1A into Plan 1B

Phase 1A is complete (branch `feat/phase1a-graphql-backend`). These are the
items it deliberately deferred, recorded here because the execution ledger
lives in git-ignored scratch.

**Must be in Plan 1B's scope:**

1. **Delete `bounded-contexts/provider/infrastructure/rest/provider.router.ts`**
   once the frontend cuts over, and add the two fitness gates that cannot pass
   while it exists: *no `hono` anywhere in `packages/backend`*, and *no bounded
   context exposes its own router*.
2. **Carry the error taxonomy, not just the transport.** All 9 mutations, both
   queries, and all 8 domain exception types currently collapse to
   `INTERNAL_ERROR` on the wire — the kit masks anything that is not one of its
   own error classes. REST returns specific messages that
   `features/provider/lib/provider-api.ts` already parses and displays, so a
   naive cutover *regresses every provider-zone error message*. Spec §1.7's
   error-remap plugin is the fix.
3. **`platformRole` is fabricated as `"customer"`** in `toExecutionContext`
   (`write/provider/graphql/handlers/arg-mappers.ts`), because
   `NtizoGraphqlContext` has no role field. Nothing reads it today, so it is
   inert — but the first `if (platformRole === "admin")` written in Phase 2
   fails closed for every GraphQL caller with no compile error and no test
   failure. Add the field to the context and populate it from the session.
4. **The GraphQL API shape is not what the plan assumed.** The kit flattens
   nested namespaces to camelCase root fields — `provider.mine` is queried as
   `providerMine`, not `provider { mine }` — and every field takes a required
   `input` argument even when its input schema is empty. Plan 1B's client code
   must be written against this, not against the nested shape.

**Known traps:**

- Bare `bun add graphql` resolves to 17.x, which breaks peer deps for
  `graphql-yoga@5` and `@cosmneo/onion-lasagna-yoga` (both want `^16`). Pin
  `graphql@16.14.2`.
- `@cosmneo/*` must be pinned **exactly** to `1.0.0-beta.3`. The `latest`
  dist-tag is `0.4.1`, a different API line, so any caret range resolves wrong.
- `wrangler` requires Node ≥ 22.

**Deferred minors (none blocking):** `closeDbConnection()` does not clear the
store slot after `.end()`; `private.ts` re-bootstraps BCs already built in
`api.ts`; zod enums in `current-user.schema.ts` are inlined rather than derived
from `packages/shared/src/enums`; `packages/frontend` has no scripts at all;
the dead `setRequestScopedLogger`/`getRequestScopedLogger` module-scope
singleton in `shared/infrastructure/logger` should be deleted before someone
uses it.

## Open items

1. ~~`stage-properties.ts` trusted origins~~ — **done in Phase 1A.**
   `getTrustedOrigins` no longer returns the retired `admin.*`/`provider.*`
   subdomains; it returns the API origin and the web origin only.
2. `shared/infrastructure/config/stage-properties.ts` still returns separate
   `adminUrl`/`providerUrl`/`landingUrl` subdomains from the pre-consolidation
   three-app era. Correct-by-accident today (`landingUrl` is the web origin).
   Fold into a single `webUrl` during Phase 1's API work.
