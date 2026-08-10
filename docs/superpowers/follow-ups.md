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

## ~~12. Migration chains exist only for `dev`~~ — RESOLVED 2026-08-09

Phase 3B collapsed the per-stage chains into **one chain per module**. `out` is
now stage-independent in both configs; only `dbCredentials.url` varies by stage,
which is the only thing that should. There are zero stage directories left.

It turned out to be a design flaw rather than a missing step: generating per
stage meant the same schema change produced independently numbered chains, and
a `qa` chain generated later would have been a single migration creating
everything rather than the incremental history — leaving dev and qa databases
permanently incomparable.

Entry 13 below is what remains of this area, and it is the one with a hard
deadline.

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

## 14. The phone number is stored in two places — new signups now agree, existing rows do not

Phone verification writes to `better_auth.user.phone_number` (added by the
better-auth phone-number plugin, with `phone_number_verified` beside it). The
domain has its own field, `ntizo_user.profile.phone_number`, which predates it
and is written by nothing on the signup path — the sign-up hook receives only
`userId`, `email`, `firstName` and `lastName`.

So today a user who signs up with a phone has it in `better_auth`, an empty
`phone_number` on their Profile, and no mechanism keeping the two in step. Any
code that reads the Profile's number sees nothing; any code that reads
better-auth's bypasses the domain.

Neither is obviously the right home. The verified flag has to live where
better-auth writes it, but a marketplace that texts providers about bookings
wants the number inside the User bounded context, not in the auth module.

**Half of this is now closed.** The signup hook carries the number through to
the Profile, so a new account has the same E.164 string in both tables —
verified against the running API, both columns matching. It surfaced exactly
as predicted: the account page told a user who had just confirmed their phone
that it was unverified, because it reads the Profile and only better-auth had
the number.

**What remains:** every account created before that change has a null
`ntizo_user.profile.phone_number` while `better_auth.user.phone_number` holds
their real one. A one-off backfill copying across is enough, and it is safe to
run twice.

Still unanswered is which column is authoritative. Both are written at signup
now; nothing keeps them in step afterwards, and `updateMe` writes only the
Profile's.

**Trigger:** the backfill before the first real user; the ownership question
before anything writes a phone number outside the signup path.

## 15. Verification email and SMS are English-only, in an app with 8 locales

`verifyEmailTemplate`, `resetPasswordTemplate` and `verifyPhoneTemplate` all
return fixed English strings, while the UI ships pt-MZ, pt-PT, en-US, es-ES,
de-DE, fr-FR, it-IT and nl-NL. A user who registers in Portuguese gets a
Portuguese form and an English SMS.

The SMS was written English to match the emails rather than localise one half
of the same signup. The fix is one decision covering both: a locale carried
from the request (better-auth's `sendOTP` and email hooks both receive the
endpoint context, so `Accept-Language` is reachable) and a small message table
per template. No i18n framework belongs on the backend for this.

Note the SMS constraint that the emails do not share: providers bill per
160-character GSM-7 segment, and a single accented character halves that to 70.
Localised bodies must be counted, not just translated.

**Trigger:** before launch in Mozambique, where Portuguese is the working
language and the SMS is the one message a user cannot skim past.

## 16. The landing page is light-only, and the theme switcher now exposes it

The Appearance submenu toggles a `.dark` class the design tokens key off, and
every screen built on those tokens follows it — the directory, the account
pages, auth, provider and admin. The landing page does not: its palette is a
set of hardcoded hex constants and a light radial gradient, written before the
tokens existed.

The moment the switcher shipped this became visible rather than theoretical.
A visitor whose system is in dark mode got a black search field on a white
page, because `ServiceSearch` follows the tokens and the page around it does
not. `landing-page.tsx` now pins the token values to its own light palette,
which makes the page internally consistent — but it pins them to *light*, so
choosing Dark leaves the landing light while the rest of the app turns.

Making it genuinely dark-capable is not a mapping exercise: the gradient, the
navy heading colour, the white product illustration and the two dark app-store
badges each need a dark counterpart. That is a design decision, not a rename.

**Trigger:** before dark mode is advertised as a feature, or the first time
someone reports the landing "ignoring" their theme. Until then the page is
consistent with itself, which is the part that was actually broken.

## 17. Every anonymous page view now logs an authentication error

The shared header and the mobile bar both read the session, and they render on
public pages — so `user.me` fires on the landing page and the directory for
visitors who have no session. The client handles the answer correctly (the
repository narrows "not signed in" to `null`), but the API logs each one at
error level:

```
[api] ✘ [ERROR] GraphQL resolver error [user.me] { message: 'Authentication required' }
```

Nine of them in one e2e run. In production that is one error line per
anonymous visitor per page, on the two pages built to be crawled — enough to
bury a real error, and enough to make an alert on error rate meaningless.

Two halves to the fix, and the second matters more:

- An anonymous caller asking "who am I" is not an error. `user.me` could
  answer `null` for a request with no session instead of raising, and log
  nothing.
- The header does not need a round trip to decide it is signed out. The
  session cookie's presence is knowable without asking the API.

**Trigger:** before the first deploy that has real traffic, or the first time
someone tries to alert on backend error rate and finds it dominated by this.

## 18. Payment methods: schema and domain exist, nothing reaches them yet

The two tables (`payment_method`, `country_payment_method`), the aggregate and
its validation are written, migrated and tested — ten unit tests, break-checked
three ways. What does not exist is everything between them and a user:
repository, commands, GraphQL, and the page.

This is deliberate rather than abandoned. The domain half is the half that has
to be right before the wiring is worth writing:

- Identifier normalisation differs per type. Mobile money is E.164 or nothing,
  because "849876543" and "+258849876543" are one wallet and storing both lets
  a user register it twice. An IBAN is compacted and upper-cased. A card token
  is opaque.
- A card cannot be a payout method, and that is enforced in `create` rather
  than trusted from the picker.
- Labels are masked to the last four characters, so a list of two M-Pesa
  numbers is readable without putting the numbers on screen.

`country_payment_method` is the administrator-maintained half of the earlier
decision: which types a country offers is a row; a type nobody has written
validation for is not. It has no rows yet and no admin screen to add them, so
the picker has nothing to read.

**Trigger:** the provider onboarding wizard needs the payout direction of
exactly this model, so build the wiring with that flow rather than twice. The
customer-facing page can come from the same commands.

## 19. The city gazetteer is seeded per environment, and only dev has it

`ntizo_reference.city` holds 235 206 places from the GeoNames `cities500` dump.
The table is created by migration `0004`, but a migration cannot fill it: the
rows arrive from `bun run db:cities:<stage>:seed`, which downloads the dump and
upserts it. **Dev is seeded. qa and prod are not.**

An unseeded environment does not fail loudly. The address form's city picker
simply offers nothing and falls back to free text — which is exactly what it is
designed to do when a country has no data, so the symptom looks like a working
feature with an empty list. Nothing in the build, the tests or the migration
catches it.

Migrations `0002` and `0003` (addresses, payment methods) are also dev-only.

**Trigger:** before either environment serves a real address form. Run the
stage's migrate, then the stage's seed, then probe
`{ citySearch(input:{country:"MZ"}) { name } }` against that stage's
`/public/graphql` and check the first row is Maputo. The probe is the check —
the seed's own output reports what it inserted, not what the endpoint returns.

## 20. A zod `.default()` does not reach the GraphQL schema

`limit: z.number().default(10)` still emits as `Int!`, so every caller must send
it. Found by probing the running schema; nothing type-checks it, and the field
looks correct in the source.

`public/city` now uses `.optional()` with the default in the projection beside
the clamp. **`public/provider`'s `listPublicProviders` still has `.default(20)`
and `.default(0)`** — harmless today only because the directory repository
happens to pass both explicitly.

**Trigger:** the next caller of `providerList` that omits `limit` or `offset`,
or the next slice written from that file as a template.

## 21. Provider documents: the buckets are declared, not created

`wrangler.jsonc` now declares `DOCUMENTS_BUCKET` for local, dev, qa and prod,
and `POST /api/documents/:providerId/:type` writes to it — session checked,
MIME and size re-checked server-side, `no-store` on the object, the uploader's
id in custom metadata. It answers `503 DOCUMENT_STORAGE_UNCONFIGURED` when the
binding is absent, which is the state today.

**The buckets do not exist yet.** One command each:

    wrangler r2 bucket create ntizo-documents-local
    wrangler r2 bucket create ntizo-documents-dev
    wrangler r2 bucket create ntizo-documents-qa
    wrangler r2 bucket create ntizo-documents-prod

Do **not** attach a public `r2.dev` URL to any of them. The reference project's
media bucket has one because it serves photographs of activities; these hold ID
cards and tax certificates, and the read leg goes through the Worker for that
reason.

Still outstanding after the buckets exist:

1. **The read leg returns 501.** Who may read whose document is a decision that
   belongs with the admin review queue, and that queue does not exist. It
   refuses everyone until it does, because the failure mode of guessing is
   handing someone's ID card to the wrong person.
2. **The wizard does not call the endpoint.** It records a file's name and size;
   wiring the POST needs the provider id, which exists only after the location
   step.
3. **A `provider_document` table** — provider, type, key, status, reviewer,
   timestamps — so the admin queue has something to list.
4. **A retention decision.** How long an identity document is held after a
   decision. Keeping them indefinitely is what happens if nobody chooses.

**Trigger:** before any provider is asked to upload in an environment that is
not local.

## 22. The location map needs a Google Maps key

The location step has a map with a draggable pin: dropping it stores the
coordinates and reverse-geocodes to fill country, city, district, street and
postal code — never overwriting a field the provider typed with an empty one.

It renders **nothing at all** without `VITE_GOOGLE_MAPS_API_KEY`, which is a
designed state rather than a fault: the fields work alone, and a Mozambican
address is often a landmark rather than a coordinate. Set the key (and
optionally `VITE_GOOGLE_MAPS_MAP_ID`, which the vector renderer needs for
advanced markers) and the map appears with no other change.

Not built: the Places **autocomplete search box** the reference has above its
map, which fills the same fields from a typed query. The parsing is already
there — `parseComponents` in `location-map.tsx` handles a geocoder result — so
it is the search UI that is missing, not the plumbing.

**Trigger:** when a Google Cloud project with Maps JavaScript, Geocoding and
(for the search box) Places enabled and billing active exists.
