# Phase 1C — TanStack Start + SSR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt TanStack Start so public pages are server-rendered and prerendered for SEO, while every authenticated route stays client-rendered exactly as it behaves today.

**Architecture:** The Vite SPA build is replaced by the `tanstackStart` plugin; the hand-written SPA-fallback worker is replaced by Start's server entry. `/` server-renders. Every route whose `beforeLoad` needs a session sets `ssr: false` and renders on the client — unchanged behaviour, no server-side auth plumbing.

**Tech Stack:** Vite, React 19, TanStack Router + Query + **Start**, Cloudflare Workers, Bun.

**Spec:** `docs/superpowers/specs/2026-08-07-doazores-pattern-adoption-design.md` (§1.5, rendering half).

**Reference:** `doazores-workspace/doazores/apps/frontend/doazores-web-storefront`

## Global Constraints

- **Authenticated behaviour must not change.** `/provider/*`, `/admin/*` and everything under `_public` render on the client, run the same guards, and hit the same endpoints as today. If a guard starts running on the server, you have broken it.
- All `@cosmneo/*` pinned exactly `1.0.0-beta.3`; `graphql` pinned `16.14.2`. Never a caret.
- The architecture lint stays green: `ui → viewmodel → data → domain`, and `boundaries/no-unknown-files` means **every new file must match an element pattern or be explicitly ignored**. A new top-level directory needs a deliberate decision, not an `ignores` entry by reflex.
- Every task ends green at `ntizo-workspace/`: `bun run check-types`, `lint`, `test`, `build`.
- `wrangler` needs Node ≥ 22 (`nvm use 22`); clear stale servers with `pkill -f "workerd|wrangler"`.
- Test account: `pw.tester.0807@example.com` / `password123`, owns one provider.

## Two decisions this plan encodes

**1. SSR is OFF by default; `/` opts in.** `/` is the sole route with no `beforeLoad` and no session dependency (verified). Every other guard calls `authClient.getSession()` — a browser `fetch` at a relative URL — which cannot work during SSR without forwarding cookies and switching to an absolute origin.

`createStart` accepts `defaultSsr` (confirmed in the installed
`start-client-core` types), so this plan sets `defaultSsr: false` globally and
marks only `/` with `ssr: true`.

This inversion is deliberate and it is the safety property of the phase. The
obvious alternative — leave SSR on and switch it off in three places — is
fail-OPEN: the next authenticated route someone adds silently server-renders,
its shell becomes edge-cacheable, and a logged-in user's HTML can be served to
someone else. Default-off fails SAFE: forgetting the flag costs a little
first-paint performance on a public page, which is visible and harmless, rather
than leaking a session-shaped response, which is neither.

**2. Zones stay in one app.** The reference splits `/admin` and `/provider` into separate Workers routed by Cloudflare (`start.ts`: *"Multi-zone is handled by Cloudflare Workers Routes at cutover — not this file"*). Ntizo deliberately consolidated to a single app, so it uses per-route `ssr: false` instead. `SSROption = boolean | 'data-only'`, confirmed in the installed `router-core` types.

---

### Task 1: Install Start and convert the router

**Files:**
- Modify: `apps/frontend/web/package.json`
- Modify: `apps/frontend/web/src/router.tsx`
- Modify: `apps/frontend/web/src/main.tsx`

**Interfaces:**
- Produces: `getRouter()` replacing `createRouter()`, with SSR/query hydration wired.

- [ ] **Step 1: Install**

```bash
cd ntizo-workspace/apps/frontend/web
bun add @tanstack/react-start @tanstack/react-router-ssr-query
```

Strip any caret the installer writes onto a pinned package. `@tanstack/react-start` may pull peer updates to `@tanstack/react-router` — that is expected; do not downgrade it.

- [ ] **Step 2: Convert `router.tsx`**

The current file exports `createRouter()` and builds its own context. Start expects a `getRouter()` factory and needs the query client bridged for hydration:

```ts
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { queryClient } from "@/lib/query-client";

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    basepath: "/",
    defaultPreload: "intent",
    scrollRestoration: true,
  });

  // Bridges TanStack Query's cache across the SSR boundary so a server-rendered
  // route's data hydrates instead of refetching on mount.
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
```

- [ ] **Step 3: Update `main.tsx`**

It currently calls `createRouter()`. Point it at `getRouter()`. Leave everything else — the `QueryClientProvider`, `StrictMode`, the i18n and CSS imports — alone.

- [ ] **Step 4: Verify nothing changed yet**

```bash
bun run check-types && bun run lint && bun run test
```

Expected: clean, 31 tests. The app is still an SPA at this point — Task 2 flips the build.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(web): getRouter factory with SSR query integration"
```

---

### Task 2: Switch the build to TanStack Start

**Files:**
- Modify: `apps/frontend/web/vite.config.ts`
- Create: `apps/frontend/web/src/start.ts`

- [ ] **Step 1: Add the plugin**

In `vite.config.ts`, add `tanstackStart` and give the router plugin the SSR environment. Order matters — `tanstackStart` must come before `viteReact`:

```ts
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

// … in plugins:
    tailwindcss(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routeFileIgnorePattern: "\\.(test|spec)\\.|-guard\\.",
    }),
    tanstackStart(),
    viteReact(),
```

Keep the existing `server.proxy` block **exactly as it is** — `/api` and `/graphql` both proxy to `DEV_WORKER_ORIGIN`, and losing `/graphql` breaks every provider screen in dev (that regression already happened once in Phase 1B).

- [ ] **Step 2: Add `start.ts` with cache shaping**

```ts
import { createStart } from "@tanstack/react-start";

/**
 * TanStack Start instance.
 *
 * Cache policy — the only thing this file decides:
 *   `/`                     public, edge-cacheable with stale-while-revalidate
 *   everything else         private, no-store
 *
 * Every non-`/` route is session-dependent and client-rendered (`ssr: false`),
 * so its HTML shell must never be shared between users. `no-store` is the safe
 * default and anything public must opt in explicitly.
 */
export const startInstance = createStart(() => ({
  // SSR is OFF by default. Only routes that explicitly set `ssr: true` are
  // server-rendered — today just `/`. Fail-safe: a new authenticated route that
  // forgets the flag stays client-rendered instead of silently emitting a
  // session-shaped, cacheable HTML shell.
  defaultSsr: false,
  requestMiddleware: [],
}));
```

> **Verify the `createStart` signature against the installed version before
> writing this.** The reference uses `createStart` with request middleware for
> locale redirects and cache shaping; the exact option shape has moved between
> releases. Read `node_modules/@tanstack/react-start/dist/**/*.d.ts` and use
> what is actually exported. If cache-header shaping needs a middleware rather
> than a config field, add one — the policy above is the requirement, not the
> mechanism.

- [ ] **Step 3: Verify the build produces a server bundle**

```bash
bun run build
ls -la dist/
```

Expected: a server output directory alongside the client assets. A client-only `dist/` means the plugin is not active — stop and fix before continuing.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(web): build with the TanStack Start plugin"
```

---

### Task 3: Client-render every session-dependent route

**Files:**
- Modify: `apps/frontend/web/src/routes/index.tsx` (the only opt-in)

**This is the task that protects Phase 1B's behaviour.** Each of these layout routes has a `beforeLoad` calling `authClient.getSession()`. Under SSR that runs on the server, where the browser cookie is absent and `API_BASE_URL` is a relative `""` — it would fail or, worse, silently resolve "no session" and redirect a logged-in user to sign-in.

- [ ] **Step 1: Opt `/` into SSR**

Task 2 set `defaultSsr: false`, so every route is client-rendered unless it says
otherwise. Add the opt-in to the landing route only:

```ts
export const Route = createFileRoute("/")({
  ssr: true,
  component: LandingPage,
});
```

**Do not touch** `routes/_public/route.tsx`, `routes/provider/route.tsx` or
`routes/admin/route.tsx`. They inherit the safe default. Leaving them untouched
is the point — there is no per-route flag to forget.

- [ ] **Step 2: Confirm `/` is the only SSR route**

```bash
grep -rn "ssr:" src/routes/
```

Expected: exactly one hit — `ssr: true` in `routes/index.tsx`. Any `ssr: true`
elsewhere, or any `ssr: false`, means the default is being second-guessed.

- [ ] **Step 3: Verify the guards still run — in a browser**

Start both servers (`nvm use 22`; API on 8788, web on 3000). Then confirm, and report each result:

1. Visiting `/provider/overview` **signed out** redirects to `/sign-in?next=/provider/overview`.
2. Signing in as `pw.tester.0807@example.com` / `password123` lands on `/provider/overview` with the dashboard populated.
3. `/admin` signed in as that (non-admin) account redirects away rather than rendering.
4. Zero console errors beyond a missing favicon.

If any guard misbehaves, `ssr: false` is not applied where it needs to be. Do not work around it in the guard.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(web): client-render session-dependent routes under Start"
```

---

### Task 4: Replace the SPA worker with Start's server entry

**Files:**
- Modify: `apps/frontend/web/wrangler.jsonc`
- Delete: `apps/frontend/web/worker/index.ts`

The hand-written worker does SPA fallback — serve the asset, else `index.html`. Start's server entry replaces it wholesale. The reference is explicit that keeping a custom worker as `main` **breaks prerendering**.

- [ ] **Step 1: Point wrangler at the Start entry**

```jsonc
"main": "@tanstack/react-start/server-entry",
"compatibility_date": "2026-02-12",
"compatibility_flags": ["nodejs_compat"],
```

Keep `preview_urls`, the per-stage `vars`, and the `routes` blocks as they are. `nodejs_compat` is required — Start's server entry uses Node APIs.

> The `routes[].pattern` hostnames are still unregistered placeholders. That is
> pre-existing and out of scope; deploys remain gated behind `DEPLOY_ENABLED`.

- [ ] **Step 2: Delete the old worker**

```bash
git rm ntizo-workspace/apps/frontend/web/worker/index.ts
```

If `worker/**` appears in `eslint.config.js`'s `boundaries/ignore`, remove that entry too — it now points at nothing, and a stale ignore is exactly the kind of silent exemption Phase 1B spent a round closing.

- [ ] **Step 3: Verify the built worker serves both a rendered `/` and a client route**

```bash
bun run build
npx wrangler dev --port 3001 &
sleep 8
curl -s http://localhost:3001/ | grep -c "Find it\." # SSR'd landing copy in the HTML
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/provider/overview
```

Expected: a non-zero count for the first (the landing copy is **in the served HTML**, not injected by JS) and `200` for the second (the client-rendered shell). A zero count means `/` is not actually server-rendering.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(web): serve via the Start server entry, drop the SPA worker"
```

---

### Task 5: Prerender the public route

**Files:**
- Modify: `apps/frontend/web/vite.config.ts`

- [ ] **Step 1: Add the prerender config**

```ts
tanstackStart({
  pages: [{ path: "/" }],
  prerender: { enabled: true, crawlLinks: false },
}),
```

`crawlLinks: false` is deliberate: the landing page links to `/sign-in` and `/provider`, all of which are `ssr: false` and session-dependent. Crawling would attempt to prerender routes that cannot render without a user.

> Confirm the option shape against the installed plugin's types — `pages` is a
> top-level `tanstackStart` option while `filter`/`crawlLinks`/`enabled` live
> under `prerender`, and this has moved between releases.

- [ ] **Step 2: Verify `/` is prerendered to a real HTML file**

```bash
bun run build
find dist -name "*.html" | head
grep -c "Find it\." $(find dist -name "index.html" | head -1)
```

Expected: an `index.html` containing the landing copy as static markup. If the file exists but the copy is absent, prerendering ran but produced an empty shell — that is a failure, not a pass.

- [ ] **Step 3: Confirm nothing else got prerendered**

```bash
find dist -name "*.html" | wc -l
```

Expected: 1. A prerendered `/provider` or `/sign-in` means `crawlLinks` is on or a route is missing `ssr: false`.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(web): prerender the landing route"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Everything green**

```bash
cd ntizo-workspace
bun run check-types && bun run lint && bun run test && bun run build
```

- [ ] **Step 2: SSR actually happened**

With the servers running, fetch `/` **with JavaScript irrelevant** — curl does not execute JS, so anything in the response body was rendered on the server:

```bash
curl -s http://localhost:3000/ > /tmp/landing.html
grep -c "Find it\." /tmp/landing.html
grep -c "Book it\." /tmp/landing.html
```

Expected: non-zero for both. This is the entire point of the phase — if the copy is not in the HTML, no search engine sees it.

- [ ] **Step 3: The authenticated app is unchanged**

In a browser, signed in as `pw.tester.0807@example.com`:
- login routes to `/provider/overview`, dashboard populated
- the members page lists members and invites
- the network tab shows `/graphql` and **no** `/api/providers/*`
- zero console errors beyond the favicon

- [ ] **Step 4: Client-rendered routes are NOT in the HTML**

```bash
curl -s http://localhost:3000/provider/overview | grep -c "Active services"
```

Expected: **0**. A non-zero count means a session-dependent route is server-rendering, which is the failure this plan exists to prevent — the shell could be cached and served to the wrong user.

- [ ] **Step 5: Record what remains**

Confirm and carry forward:
- `/api/me` still REST; no `read/user` slice
- `#/` remains a single-import beachhead against ~84 `@/`
- `platformRole` still fabricated as `"customer"` in the GraphQL write path
- deploys still gated; route hostnames still placeholders

- [ ] **Step 6: Commit**

```bash
git commit --allow-empty -m "chore: Phase 1C complete — public SSR, zones client-rendered"
```

---

## Deliberately NOT in this plan

- **SSR for authenticated routes.** Requires forwarding the session cookie into server-side `fetch` and switching `API_BASE_URL` to an absolute origin during SSR. Worth doing when a *public* page needs user-specific data; not before.
- **Locale-prefixed routes and redirect middleware.** The reference has an elaborate locale system (`/pt`, `/es`, bare-path negotiation). Ntizo has i18n but no locale routing. Out of scope.
- **ISR / edge-cache tuning beyond the `/` vs everything-else split.** Meaningful only once deployed.
- **Anything requiring a domain or Cloudflare account.**

## Self-Review

**Spec coverage.** §1.5's rendering half — Start adoption (Task 1–2), SSR for public routes (Tasks 2, 5), client-rendered zones (Task 3), worker entry swap (Task 4). The data-layer half shipped in Plan 1B.

**Type consistency.** `getRouter` is defined in Task 1 and consumed by `main.tsx` in the same task and by the server entry in Task 4. `ssr: false` is applied in Task 3 and verified in Tasks 4–6.

**Two flagged uncertainties**, both with a stated way to resolve rather than a guess: `createStart`'s option shape (Task 2) and the `tanstackStart` prerender option shape (Task 5). Both have moved between releases, so each step says to read the installed types first. The requirement is stated as policy — what must be cached and what must be prerendered — so an API difference changes the mechanism, not the goal.
