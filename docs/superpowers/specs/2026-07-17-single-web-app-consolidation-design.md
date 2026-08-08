# Single Web App Consolidation — Design

**Date:** 2026-07-17
**Status:** Approved (design), pending implementation plan
**Author:** Salif Faustino (with Claude)

## Summary

Consolidate the three separate Ntizo frontend applications
(`apps/frontend/landing`, `apps/frontend/admin`, `apps/frontend/provider`)
into a **single React web application** at `apps/frontend/web`. The one app
serves the public **landing** at `/`, the **provider** zone at `/provider/*`,
and the **admin** zone at `/admin/*`, with an in-app zone switcher. The three
old apps are deleted.

The new app is scaffolded from the structure and configuration of the
reference app
`funouts-workspace/doazores/apps/frontend/doazores-web-provider-react`
(Vite + React 19 + TanStack Router + Tailwind v4 + Cloudflare Workers), while
keeping Ntizo's existing **REST + better-auth** data layer (the reference uses
GraphQL; Ntizo's Hono backend is REST, so we do not adopt GraphQL).

## Goals

- One web application, one origin, one deploy — instead of three.
- Public landing + Provider zone + Admin zone, switchable in-app.
- Adopt the reference app's tech stack, project structure, and Cloudflare
  Workers deployment as the template.
- Preserve the working provider and admin functionality by migrating it.
- Leave the codebase cleaner: remove the three superseded apps.

## Non-Goals

- **No customer/booking marketplace on web** (browse/compare/book). That
  stays out of scope for this app (future / mobile).
- **No GraphQL adoption.** Keep Ntizo's REST + better-auth data layer.
- **No backend changes.** `apps/backend/api` and `packages/*` are untouched
  except where the new app imports them.
- **No changes to repo-root `landing/` and `landing 2/` folders** (outside
  `ntizo-workspace`). Explicitly out of scope; a separate cleanup if desired.

## Decisions (from brainstorming)

| Topic | Decision |
|-------|----------|
| Zone model | **Path-based**: `/` landing, `/provider/*`, `/admin/*`, with a header/sidebar zone switcher |
| Scope | Landing (marketing + auth) + Provider + Admin. No customer booking flow. |
| Cleanup | Delete `apps/frontend/{landing,admin,provider}`; create `apps/frontend/web`. Keep `packages/*`, `apps/backend/api`, `apps/mobile`. |
| Deploy | Cloudflare Workers (wrangler), like the reference. Dev-local first. |
| Build approach | Scaffold fresh from the reference molde, then migrate existing features. |
| Data layer | Keep Ntizo REST + better-auth (no GraphQL). |
| Provider selection | Keep current context/localStorage active-provider (no `$providerSlug` in URL). |
| Account page | Provider zone only (as today). |

## Architecture

Single-page React app served at the site root by one Cloudflare Worker.

- **Stack:** Vite, React 19, TanStack Router (file-based routing,
  `autoCodeSplitting`, test files ignored), TanStack Query, TanStack Form,
  Tailwind v4, better-auth client, i18next + react-i18next (en/pt), sonner for
  toasts, lucide-react icons.
- **Alias:** `@ → src`.
- **Dev:** Vite dev server on port **3000**, proxying `/api → http://localhost:8788`.
- **Router basepath:** `/` (the reference used `/provider`; here the app owns
  the root).
- **Reused workspace packages:** `@ntizo/frontend-ui` (shared UI kit),
  `@ntizo/shared` (enums/contracts/read-models).

### Route tree (zones by path)

```
src/routes/
  __root.tsx                     LocaleRoot + Outlet + Toaster
  index.tsx                      "/"                    Landing (marketing, public)
  _public/                       public marketing header layout
    sign-in.tsx                  "/sign-in"
    sign-up.tsx                  "/sign-up"
    accept-invite.$token.tsx     "/accept-invite/:token"
  _provider/                     "/provider"  guard: session + provider role
    route.tsx                    ProviderShell (sidebar + provider switcher + zone switcher)
    index.tsx                    → overview
    members.tsx
    settings.tsx
    account.tsx
    no-provider.tsx              no provider yet → create/onboard (backend workflow)
  _admin/                        "/admin"     guard: session + admin role (invite-only)
    route.tsx                    AdminShell (sidebar + zone switcher)
    index.tsx                    → dashboard
    users.tsx
```

TanStack file-based route naming (`_public`, `_provider`, `_admin` layout
groups) is the implementation detail; exact filenames are finalized in the
plan.

### Auth, roles & zone switching

- A single better-auth client (same backend origin, `VITE_AUTH_API_URL`,
  default `http://localhost:8788`).
- Guards run in each layout route's `beforeLoad`:
  - No session → redirect to `/sign-in?next=<path>`.
  - Session but missing the zone's role:
    - Provider zone, user is not yet a provider → `/provider/no-provider`
      (offers to create/onboard a provider via the backend
      `register-user-as-provider` workflow).
    - Admin zone, user is not an admin → bounce to landing `/`.
- **Zone switcher** (in the shell header/sidebar) lists **only the zones the
  current user may access**, derived from backend roles
  (`customer`, `individual_provider`, `organization_owner`, `admin`):
  - Signed-out visitor: Landing + "Sign in".
  - Provider: Landing + Provider.
  - Admin: Landing + Admin.
  - A user who is both provider and admin sees all three.
- Post-login redirect honors `?next=`; otherwise routes by role
  (admin → `/admin`, provider → `/provider`, else → `/`).
- Admin remains invite-only (no admin sign-up); the admin sign-in messaging is
  preserved.

## Project structure (feature-based, from the reference molde)

```
src/
  features/<feature>/
    adapters/      REST calls / query & mutation factories (better-auth, fetch)
    domain/        types, models, pure view-model helpers
    useCases/      business logic orchestration (where non-trivial)
    components/    feature UI
    locales/       en/ + pt/ i18n namespaces
  shared/
    components/    shells (ProviderShell, AdminShell), zone-switcher, layout
    lib/           auth-client, session-query, i18n, query-client, env, navigation
    hooks/
    providers/     active-provider context
    locales/       shared en/pt namespaces
  lib/             query-client, router glue
  routes/          file-based route tree (thin; delegates to features)
  main.tsx         mounts #app: QueryClientProvider + RouterProvider, validateEnv()
  router.tsx       createRouter (basepath "/")
  styles.css       Tailwind entry
```

**Features:** `landing`, `auth`, `account`, `provider`, `admin` (admin
contains `dashboard` and `users`).

Note: the reference's data-layer files (GraphQL client, Google Maps, booking
helpers) are **not** copied. We reuse the reference's *structural* shared/lib
pieces (i18n, locale-root, env validation, query-descriptor patterns, router
setup) adapted to REST + better-auth.

## Migration map (what moves where)

| Source (current) | Destination (new app) | Notes |
|---|---|---|
| `apps/frontend/provider` features (overview, members, settings, account, create-provider dialog, hooks `use-active-provider`/mutations, `provider-api.ts`, `slugify`), sidebar + provider-switcher | `features/provider`, `features/account`, `shared` | Move from root to `/provider/*`; keep context-based active provider. |
| `apps/frontend/provider` auth (sign-in, sign-up, accept-invite) | `features/auth` under `_public` | Unified auth surface; role/`next`-aware redirect. |
| `apps/frontend/admin` (sign-in, dashboard, users, sidebar) | `features/admin` under `/admin/*` | Invite-only guard preserved. |
| `apps/frontend/landing` `src/app/page.tsx` (Next.js) + brand SVGs | `features/landing` route + `public/brand` | Port marketing page (hero, search bar, nav, footer, app badges) to React/Tailwind. |
| `packages/frontend` UI kit, `packages/shared` | imported as `@ntizo/frontend-ui`, `@ntizo/shared` | Reused, not copied. |

## Deployment

- `worker/index.ts` — one Cloudflare Worker serving the built SPA from `dist/`
  with deep-route SPA fallback (root basepath).
- `wrangler.jsonc` — per-stage environments (dev/qa/prod) with vars
  (`VITE_AUTH_API_URL`, etc.) and custom domains; `preview_urls: true`.
- `deploy:dev` / `deploy:qa` / `deploy:prod` scripts.
- Config is prepared but validated later; **initial focus is local dev** via
  Vite.
- Root `turbo dev` runs `@ntizo/api` + the new `@ntizo/web`.

## Deletion list (destructive — confirm exact paths before `rm`)

Remove:
- `apps/frontend/landing/`
- `apps/frontend/admin/`
- `apps/frontend/provider/`

Keep (untouched):
- `packages/frontend`, `packages/shared`, `packages/backend`,
  `packages/tooling`, `packages/docs`
- `apps/backend/api`, `apps/mobile`

Out of scope (do **not** touch without explicit instruction):
- repo-root `landing/` and `landing 2/` folders (outside `ntizo-workspace`).

The root `package.json` `workspaces` glob already includes `apps/frontend/*`,
so `apps/frontend/web` is picked up automatically; deleting the three
directories is sufficient.

## Testing

- **Unit (Vitest + jsdom + Testing Library):** pure guard/redirect resolvers
  (auth redirect, zone-access resolver, post-login destination), i18n wiring,
  and feature view-model helpers — following the reference's pattern of
  keeping route decisions pure and unit-testable.
- **Smoke (manual/dev):** each zone loads; guards redirect correctly; zone
  switcher shows the right zones per role; landing renders.
- Migrated provider/admin flows verified against the running backend
  (`localhost:8788`).

## Risks & mitigations

- **Landing port (Next.js → React/Vite):** re-implement the marketing page;
  low logic, mostly markup/Tailwind. Mitigation: port markup faithfully; the
  page is a single component today.
- **Auth guard regressions:** consolidating three auth surfaces into one.
  Mitigation: pure, unit-tested guard/redirect functions.
- **Role → zone mapping:** ensure backend role fields are exposed to the
  client (better-auth session `additionalFields`). Mitigation: verify the
  session payload early in implementation.

## Open items (defaults chosen; revisit if needed)

- Provider selection stays context/localStorage-based (no URL slug). Slug-based
  routing is a possible future enhancement.
- Account lives in the provider zone only.
