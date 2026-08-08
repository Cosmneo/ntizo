# Carried-forward work

Findings that surfaced during implementation, judged non-blocking at the time,
with the reasoning that made them non-blocking. Each says what makes it urgent
again — a deferral without a trigger is just a forgotten bug.

Last updated at the end of Phase 2 (branch `feat/phase2-user-slice`).

---

## 1. Two `role` columns, nothing synchronises them

`better_auth.user.role` drives authorization: it reaches the session, becomes
`platformRole` in the `ExecutionContext`, and is what any future authorization
check would read. `ntizo_user.user.role` drives display: it feeds the
`userMe` read model and is what the UI branches on.

Both default to `"customer"` — better-auth's `defaultValue`, and a hardcoded
`"customer"` in `create-user-on-sign-up.internal.command.ts`. **No code writes
both.** Promoting someone to admin means updating two tables; updating one
gives split brain, where the UI shows one role and authorization enforces
another.

Verified directly: desyncing them (`better_auth` = customer, `ntizo_user` =
admin) makes `userMe` return `"admin"`, confirming which column the read model
reads.

**Why it does not bite yet:** no backend authorization reads a role at all.
`platformRole` is written and read by nobody, and `/admin` is a "coming soon"
stub. The split brain can currently produce nothing worse than a cosmetic
disagreement about an empty room.

**Trigger:** the first use case that branches on `platformRole`, or the first
real data behind `/admin`. Whichever comes first.

**Direction already recorded** in `better-auth/infrastructure/database/schema.ts`:
`// TODO(ntizo): role is managed by Ntizo user BC, but better-auth needs a column.`
The sync simply does not exist yet.

---

## 2. `packages/backend` is never linted

Only `apps/frontend/web` defines a `lint` script, so `bun run lint` at the root
covers a fraction of what its name implies. Every backend file written across
Phases 1 and 2 has been typechecked and tested, never linted.

Narrower than it first looked: `packages/backend` *does* define
`typecheck: tsc --noEmit` and passes it. This is a lint gap, not a type-safety
gap.

**Trigger:** now, really — it is cheap, and the gap widens with every backend
file added.

---

## 3. Schema barrels are explicit imports, not a glob

`read/schema.ts` and `write/schema.ts` list their slices by hand. A new bounded
context can be added and silently excluded from the tier-segregation fitness
gate if someone forgets the one-line merge — the gate would pass while covering
nothing new.

A second instance of the same blind spot: the kit's `deepMergeConfigs` does
`result[key] = bVal` on a leaf collision, so if a write slice ever defined a
field id a read slice owns, **the query would be silently replaced by the
mutation** — and tier-segregation would still pass, because it inspects
`readSchema` and `writeSchema` separately and never the merged product.

**Trigger:** adding the third bounded context. Two is where the pattern is
still obvious; three is where someone copies it wrong.

---

## 4. SSR hydration payload carries 3 NUL bytes

Framework-internal, at the `__root__` route-match id. Harmless in local dev.
NUL bytes in an HTML body can be mangled by proxies and WAFs.

**Trigger:** first deploy behind Cloudflare. Cannot be checked from a dev
server.

---

## 5. Deploys are gated and hostnames are placeholders

CD runs but skips deploys unless `DEPLOY_ENABLED` is set, and the route
hostnames in `wrangler.jsonc` are not real. Hyperdrive is the actual blocker
for a deployed API — a Worker cannot reach Postgres without it. Checklist in
`.github/README.md`.

**Trigger:** whenever the domain is ready.

---

## 6. `shared/lib/env.ts` is production-dead

Its only production importer went away when `@ntizo/auth-client` was extracted.
`AUTH_API_URL` is now imported only by its own test, and `validateEnv()` has no
callers (it had none before either). The `VITE_AUTH_API_URL` default is
duplicated into the package behind a "keep in sync" comment.

**Not a deploy risk on the CI path** — `cd.yml` sets `VITE_AUTH_API_URL` on the
build step and comments the trap explicitly. The exposure is the manual
`deploy:dev|qa|prod` scripts, which `wrangler.jsonc` already warns against.

**Trigger:** either wire `validateEnv()` up so it actually guards something, or
delete the file. Leaving a validator nobody calls is worse than neither.

---

## 7. Stale claims in the Phase 1 plan documents

`2026-08-07-phase1b-graphql-cutover.md` and `2026-08-08-phase1c-tanstack-start-ssr.md`
assert "`/api/me` still REST; no `read/user` slice" in the present tense. Both
became false in Phase 2. They are historical records, so arguably fine — but a
reader skimming for current state will be misled.
