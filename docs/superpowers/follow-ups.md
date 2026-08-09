# Carried-forward work

Findings that surfaced during implementation, judged non-blocking at the time,
with the reasoning that made them non-blocking. Each says what makes it urgent
again — a deferral without a trigger is just a forgotten bug.

Last updated at the end of Phase 3A (branch `feat/phase3a-uow-outbox`).

---

## ~~1. Two `role` columns, nothing synchronises them~~ — RESOLVED 2026-08-09

The GraphQL context now resolves the role through `findPlatformRole`, a single
primary-key lookup on `ntizo_user.user.role` — the column the Ntizo user BC
owns and the one `userMe` projects. Anonymous callers skip the query; a missing
ntizo row degrades to `"customer"`, least privilege rather than unrestricted.

`better_auth.user.role` still exists because better-auth needs a column, but
**nothing reads it for authorization any more**, so the two are free to drift
without consequence. Proven live with the columns deliberately desynced:
`sessao.role="customer" -> ctx.role="admin"`.

The original analysis is kept below because the reasoning still explains why
the fix is shaped the way it is.

---

## 1. (original) Two `role` columns, nothing synchronises them

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

## ~~2. `packages/backend` is never linted~~ — RESOLVED 2026-08-09

`bun run lint` now runs in 9 packages instead of 1, covering 243 previously
unlinted files. `@ntizo/backend`, `@ntizo/api`, `@ntizo/shared` and
`@ntizo/auth-client` were already clean; `@ntizo/frontend-ui` needed two
changes, neither a suppression — the shared base config now honours a leading
underscore in `no-unused-vars` (the `asChild: _asChild` destructure exists so
the prop is *not* spread onto the DOM), and the eight `as any` casts in the
`asChild` triggers are now properly typed.

Break-checked in both directions: an unused `deadVariable` in
`packages/backend` fails the **root** gate; `_intentional` is ignored as
designed.

Four `react-hooks/exhaustive-deps` warnings remain in `frontend-ui` — warnings,
not errors, and untouched.

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

---

## 8. The outbox has no relay, no consumer, and no pruning

Phase 3A made domain events durable and correctly ordered relative to state:
an outbox row can never describe a write that rolled back. It did **not** ship
them anywhere. Rows accumulate with `status: "pending"` forever; nothing
advances the status and nothing prunes the table.

That ordering was deliberate — a relay over a non-transactional outbox is a
queue that can lie, so the transaction had to come first. But a durable log
nobody reads is only half the pattern.

Scoping note, from reading the doazores relay: its SQL fits Ntizo's table
as-is, but the module also needs `OutboxEventStatus`, `infraStore.getQueue()`,
`infraStore.getLogger()`, `causeChain`, and a `database/index.ts` barrel —
none of which exist here. The queue-consumer and dead-letter paths additionally
need `outbox_event_subscriber` and `outbox_event_subscriber_execution`. It is
not a drop-in port.

**Ordering is not recoverable from the table as it stands.** There is no
monotonic sequence column: `id` is a random uuid and `created_at` is the event's
`occurredOn`, a `new Date()` at millisecond resolution. That was harmless while
every multi-event publish was order-independent. It stopped being harmless when
provider creation began emitting `provider.created` and `provider.member.added`
together — you cannot project a member onto a provider that does not exist, and
those two rows can tie on `created_at`. A relay doing `ORDER BY created_at`
would then hand them over backwards. Add a sequence column with the relay; do
not discover this in production.

**Trigger:** the first feature that needs to react to something happening
elsewhere — a notification, an email on booking, a projection. Also sooner if
table growth becomes visible.

---

## 9. `runAfterCommit` is built but unused

`tx-context.ts` provides it; nothing calls it. Its natural first user is
`invite-provider-member`, which saves the invite **transactionally** (Phase 3A
made it so) and then sends an email **outside** that transaction. The only
failure mode today is a stale unused invite, so this is not urgent — but the
mechanism exists precisely for it.

An earlier draft of this entry said both were untransacted, which was wrong and
contradicted entry 11 below.

**Trigger:** the next side-effect that must not fire on a rolled-back write.

---

## 10. `upgrade-profile-to-provider` emits no event

The eleventh dispatch site was left unwired: there is no
`ProfileUpgradedToProvider` event class, and the `User` aggregate has no
event-recording machinery at all. That is domain modelling, not adapter work,
which is why Phase 3A did not force it.

**Trigger:** whenever the User BC needs to publish anything. It will need the
machinery either way.

---

## 11. `ProviderEmailServiceAdapter` hardcodes Resend

Unlike better-auth's env-aware lazy adapter, it constructs
`ResendEmailServiceAdapter` regardless of `STAGE` or `RESEND_API_KEY`. Locally
this makes `providerInvitesSend` throw `INTERNAL_ERROR` to the client — after
the invite row and its outbox event have already committed, since the email is
sent post-commit. So the transaction mechanics are correct; the error is
misleading noise from unrelated wiring.

Pre-existing, and the same fix already exists for better-auth: select the
console adapter lazily when no key is present.

**Trigger:** the next time anyone tries to exercise invites locally.

---

## 12. Migration chains exist only for `dev`

`drizzle.config.ts` writes to `migrations/${stage}`; qa and prod have no chain.
Pre-existing, but Phase 3A added the first whole new schema
(`CREATE SCHEMA "ntizo_outbox"`), so it is the first migration whose absence
would break the app at runtime rather than merely drift.

**Trigger:** before the first deploy to any stage other than local.

---

## 13. The journal-table split (`db03649`) has no upgrade path for existing databases

`db03649` gave each migration chain its own journal table
(`ntizo_migrations` / `better_auth_migrations`), replacing the shared
`drizzle.__drizzle_migrations`. `dev` was migrated by hand: the 3 existing
rows redistributed by hash via direct SQL, verified byte-identical before and
after, and the whole procedure recorded only in that commit's message — not
as a runnable script.

Any OTHER database still holding the legacy shared table — qa, prod, another
developer's machine, or even `dev` again if someone re-runs migrations from a
checkout that predates the manual fix — fails the next `drizzle-kit migrate`
with `42P06 schema "drizzle" already exists` (or the per-chain equivalent)
and is left half-migrated: the new per-chain tables created but empty, the
legacy shared table still holding its rows, and drizzle-kit with no reliable
way to tell which migrations are actually applied.

**Recovery today is only the hand-written row redistribution recorded in
`db03649`'s commit message.** There is no backfill script, and none should be
written speculatively — verifying a migration tool against a database that
doesn't yet need it is how the original journal-sharing bug shipped in the
first place.

**Why this is bounded today:** `cd.yml`'s migrate job runs only when the
repository variable `DEPLOY_ENABLED` is exactly `true`, and it is currently
off (`.github/README.md`). No automated path reaches qa or prod's databases
yet, so no database besides the already-fixed `dev` is at risk.

**Trigger:** must be resolved — a proper migration/backfill script, or at
minimum documented manual steps per target database — before
`DEPLOY_ENABLED` is ever set to `true`. Do not attempt the backfill now;
there is nothing yet that needs it.
