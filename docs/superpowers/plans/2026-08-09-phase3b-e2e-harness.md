# Phase 3B — CI-gated end-to-end harness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser-driven end-to-end suite that runs in CI against a database built from scratch, so the regressions this project has been catching by hand get caught automatically.

**Architecture:** One stage-independent migration chain per module, applied to a throwaway Postgres. Playwright drives a real browser against `wrangler dev` (API, 8788) and `vite` (web, 3000). CI runs it as a job with a Postgres service container.

**Tech Stack:** Bun 1.3.9, Turborepo, drizzle-kit, Playwright, Postgres 16, GitHub Actions.

## Global Constraints

- `@cosmneo/*` stays pinned **exactly** at `1.0.0-beta.3`; `better-auth` exactly at `1.6.2`. Neither may become a range.
- Repo root is `ntizo-workspace/`. All paths are relative to it.
- The API needs **Node ≥ 22** (wrangler refuses v20). Locally: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`.
- Every `/graphql` request needs an `Origin` header the CORS allowlist accepts, or it fails misleadingly.
- There is no `/api/health` route. A 404 there means the server is up.
- Run `bun run check-types && bun run lint && bun run test && bun run build` from the repo root before every commit. `lint` covers all 9 packages.

## The problem this starts from

**Migrations are generated per stage.** `drizzle.config.ts` sets
`out: ./migrations/${stage}`, and only `migrations/dev` has ever been
generated — 2 ntizo files, 1 better-auth. `qa` and `prod` are empty
directories.

That is a design flaw, not a missing step. A migration describes how a schema
evolved; it should not depend on which database it will be applied to.
Generating per stage means the same change produces three independently
numbered chains that can drift, and a `qa` chain generated today would be a
**single** migration creating everything rather than the incremental history —
so a dev database and a qa database could never be compared, promoted, or
reasoned about together.

Two facts make the fix safe, both verified against the real dev database:
- `drizzle.__drizzle_migrations` has exactly 3 entries, matching the 3 SQL files.
- drizzle records applied migrations **by hash of the SQL content**, not by
  path. Moving a file without editing it leaves its hash unchanged.

One oddity to preserve deliberately: both configs write to the same default
journal table. That works because drizzle applies any migration whose hash is
absent, and the two chains' hashes never collide. It is coincidental, not
designed — do not rely on it further, and note it where someone would trip.

## File Structure

**Modified — migrations**
- `packages/backend/src/modules/ntizo/drizzle.config.ts` — `out` loses `${stage}`
- `packages/backend/src/modules/better-auth/drizzle.config.ts` — same
- `packages/backend/package.json` — the 18 stage scripts collapse to per-module `generate` plus per-stage `migrate`
- The SQL and `meta/` move from `migrations/dev/` up to `migrations/`

**New — the harness**
- `apps/e2e/` — its own workspace package: `package.json`, `playwright.config.ts`, `tsconfig.json`
- `apps/e2e/tests/*.spec.ts`
- `apps/e2e/fixtures/` — database reset and user creation helpers

**Modified — CI**
- `.github/workflows/ci.yml` — an `e2e` job with a Postgres service

---

### Task 1: One migration chain per module, not per stage

**Files:**
- Modify: `packages/backend/src/modules/ntizo/drizzle.config.ts`, `packages/backend/src/modules/better-auth/drizzle.config.ts`
- Modify: `packages/backend/package.json`
- Move: `src/modules/*/infrastructure/migrations/dev/*` → `.../migrations/`

- [ ] **Step 1: Record the current journal**

Query the dev database and save the three hashes and timestamps. You will
compare against this after the move — if any hash changes, the move edited a
file and the dev database would re-run a migration it has already applied.

```
DB=$(grep -h "^DATABASE_URL" apps/backend/api/.dev.vars | head -1 | cut -d= -f2-)
```
Use `cut`, not a greedy sed — the connection string contains `=` in
`channel_binding=require`. Query from `packages/backend` with
`import postgres from "postgres"`.

- [ ] **Step 2: Move the files with `git mv`**

`git mv` preserves content exactly. Do not copy-and-edit. Move `meta/` too —
drizzle-kit reads its snapshots to compute the next diff, and leaving them
behind makes the next `generate` re-emit everything.

- [ ] **Step 3: Make `out` stage-independent**

In both configs, `out` becomes `./src/modules/<module>/infrastructure/migrations`.
`dbCredentials.url` keeps varying by stage — that is the only thing that should.

Add a comment saying why: a migration is a description of schema evolution, not
of an environment, and per-stage chains cannot be promoted between databases.

- [ ] **Step 4: Collapse the scripts**

`generate` no longer needs a stage (there is one chain). `migrate` still does
(it picks the target URL). Keep `studio` per stage.

- [ ] **Step 5: Prove the dev database is untouched**

Run `db:ntizo:dev:migrate` and `db:auth:dev:migrate`. Both must report **nothing
to apply**, and the journal must still hold the same three hashes from Step 1.
If either re-applies a migration, stop — the move was not clean.

- [ ] **Step 6: Prove `generate` produces nothing new**

Run both `generate` commands. Neither may emit a new SQL file — the schema has
not changed, so a new file would mean the `meta/` snapshots did not travel with
the SQL.

- [ ] **Step 7: Commit**

---

### Task 2: Prove a database can be built from zero

**Files:**
- Create: `packages/backend/scripts/reset-test-db.ts`

This is the task that decides whether the harness is possible at all. If the
chains cannot construct a working database from an empty one, nothing after
this matters.

- [ ] **Step 1: Start a local Postgres**

Docker is installed on this machine but the daemon may be stopped — start it.

```bash
docker run --rm -d --name ntizo-e2e-db \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ntizo_e2e \
  -p 55432:5432 postgres:16-alpine
```

Connection string: `postgres://postgres:postgres@localhost:55432/ntizo_e2e`.
Port 55432 on the host deliberately — 5432 is often already taken, and a
silent connection to someone else's Postgres is a bad first surprise.

- [ ] **Step 2: Apply both chains to the empty database**

Point `DEV_DB_URL` at the local instance and run both `migrate` scripts.

- [ ] **Step 3: Compare the result against dev, structurally**

Query `information_schema.columns` for every non-system schema on **both**
databases and diff the results. They must match on schema, table, column,
type, nullability and default. A harness running against a database that
differs from dev tests something that does not exist.

Report the diff. If there is any, that is a finding about the chains, not about
your comparison — do not paper over it.

- [ ] **Step 4: Write the reset script**

`reset-test-db.ts` drops and recreates every ntizo schema plus `better_auth`
and `drizzle`, then applies both chains. The e2e suite calls it before running.

Make it refuse to run against a URL it was not explicitly given — an accidental
`DATABASE_URL` default pointing at dev would destroy real data. Require an
explicit env var with a distinct name, and abort if the host looks like Neon.

- [ ] **Step 5: Break-check the guard**

Point the reset script at the dev URL and confirm it refuses. This guard is the
only thing standing between a test run and the shared database.

- [ ] **Step 6: Commit**

---

### Task 3: The harness skeleton

**Files:**
- Create: `apps/e2e/{package.json,playwright.config.ts,tsconfig.json}`
- Create: `apps/e2e/fixtures/db.ts`, `apps/e2e/fixtures/auth.ts`
- Modify: root `package.json` if a script is needed

**Interfaces:**
- Produces: `bun run e2e` at the repo root; fixtures `resetDb()`, `createVerifiedUser(role?)`

- [ ] **Step 1: Read how the apps start**

`apps/backend/api` runs `wrangler dev --port 8788` and needs Node ≥ 22 plus
`.dev.vars` (which is gitignored — CI will inject the values instead).
`apps/frontend/web` runs `vite --port 3000` and proxies `/api` and `/graphql`
to 8788.

- [ ] **Step 2: Scaffold the package**

Match `packages/auth-client`'s packaging conventions — the workspace globs are
`["apps/frontend/*","apps/backend/*","apps/mobile/*","packages/*","packages/tooling/*"]`,
so `apps/e2e` needs a glob entry added, or the package placed where an existing
glob reaches it. Check before choosing; a package outside every glob is never
linked and fails to resolve.

- [ ] **Step 3: Configure Playwright to start both servers**

Use `webServer` with two entries. Give the API a generous timeout — wrangler
takes ~8s cold. Point both at the test database, not dev.

- [ ] **Step 4: Write the fixtures**

`createVerifiedUser` signs up through the real API and marks the user verified
directly in the database — email verification cannot be driven from a browser
here. Return the credentials and the id.

- [ ] **Step 5: Prove the harness starts and stops cleanly**

A single trivial spec that loads `/` and asserts the hero text. Run it, confirm
both servers start, the test passes, and both servers are gone afterwards. A
harness that leaks processes will wedge CI.

- [ ] **Step 6: Commit**

---

### Task 4: The tests

**Files:**
- Create: `apps/e2e/tests/auth.spec.ts`, `provider.spec.ts`, `zones.spec.ts`, `ssr.spec.ts`

Cover the things that actually broke during development. Each of these was
found by hand; each should now be found automatically:

- [ ] **Step 1: Auth**

Sign up → verify → sign in → land on the right zone. Sign out → confirm the
next sign-in as a *different* user shows that user's name and zones, not the
previous one's. That leak was real and survived a first fix.

- [ ] **Step 2: Provider**

Create a provider; confirm it appears in the dashboard. This is the flow whose
non-atomic write could leave an invisible orphan.

- [ ] **Step 3: Zones and guards**

A customer must not see the Provider or Admin links. `/admin` must bounce a
non-admin. An admin must reach it. Drive it with real users of each role.

- [ ] **Step 4: SSR and prerender**

Fetch `/` with JavaScript disabled and assert the hero text is in the HTML.
Fetch `/provider/overview` and `/admin` the same way and assert they are
**not** — that is the property two independent switches control, and the build
once emitted 12 prerendered pages including authenticated routes.

- [ ] **Step 5: Break-check every spec**

For each, break the thing it guards and confirm the spec fails. A suite whose
tests have never failed is decoration. Report each observation.

- [ ] **Step 6: Commit**

---

### Task 5: Wire it into CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a Postgres service to a new `e2e` job**

Postgres 16, health-checked, on a port the job can reach.

- [ ] **Step 2: Provide the env the apps need**

`.dev.vars` is gitignored, so the API needs its values injected. Work out the
minimum set from `apps/backend/api/src` rather than copying a local file
wholesale — a secret that CI does not need should not be in CI.

`BETTER_AUTH_SECRET` can be any value in CI. `RESEND_API_KEY` must be **absent**
so the console email adapter is selected — CI must not send real email.

- [ ] **Step 3: Cache the Playwright browsers**

Without a cache this job downloads ~200MB every run.

- [ ] **Step 4: Run migrations, then the suite**

- [ ] **Step 5: Prove CI actually gates**

Push a branch with a deliberately broken assertion and confirm the job fails.
Then fix it and confirm it passes. A job that cannot fail is worse than no job,
because it reads as coverage.

- [ ] **Step 6: Commit**

---

### Task 6: Full verification

- [ ] **Step 1: Root sweep** — all four gates.

- [ ] **Step 2: Run the suite locally twice in a row.** The second run proves
the reset is real — a suite that only passes against a fresh database has a
hidden dependency on leftover state.

- [ ] **Step 3: Confirm no process leaks** — no `wrangler`, `workerd`, `vite`
or `node` left behind after a run, and no containers.

- [ ] **Step 4: Confirm the dev database was never touched** — the journal
still holds the same three hashes from Task 1 Step 1.

- [ ] **Step 5: Record what remains**

- the harness covers the flows above and nothing else
- email verification is short-circuited in the database, not driven through a real inbox
- no test covers the outbox, because nothing consumes events yet

- [ ] **Step 6: Commit**
