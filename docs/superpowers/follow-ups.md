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

**The trigger below has fired.** The notifications inbox (2026-08-23, branch
`feat/notifications`) is that first feature. It did not build the relay: it
added an in-process `EventRouter` that `OutboxAdapter.publish` fans out to
*after* the producing transaction commits. The row is still written, still
durable, still nobody's input. `EventRouter`'s own comment says why that was
the reversible choice — a deployed Worker cannot reach Postgres at all yet, and
`wrangler.jsonc` declares neither a queue nor a cron, so a relay could not have
run if it had been written.

**What that costs is the reason this entry now matters more, not less: nothing
marks a row as dispatched.** Every row the in-process router has already
delivered still reads `status: "pending"`, indistinguishable from one nobody
has ever seen. A relay that starts from the table as it stands would replay all
of them and deliver **every notification ever raised a second time** — every
WELCOME, every PROVIDER_VERIFIED, into inboxes people have already read and
dismissed. An inbox row about something that did not just happen cannot be
recalled.

**Since 2026-08-24 that replay also sends email.** Raising a notification now
queues a delivery, so a relay replaying the outbox would re-send **every email
this platform has ever sent** — every welcome, every verification result,
every workspace invitation, to addresses that may since have gone somewhere
else. That is strictly worse than the duplicate inbox row it comes with: an
inbox row at least sits inside an app its owner can dismiss it in, while an
email cannot be recalled at all, arrives in front of people who never open the
app, and looks from the outside exactly like the kind of mass send that gets a
sending domain blocklisted. `notification_delivery` is a second reconciliation
source for whoever writes the relay — it records what actually left — but it
is a record of sends, not of outbox rows, and reading it as one would be its
own bug.

So this is a hard requirement on whoever writes the relay, not a nicety: it is
not enough to drain `pending`. Before the first replay it must either

- advance `status` when the in-process dispatch succeeds — which makes the
  router and the relay two paths through one state machine, and forces a
  decision about what "succeeded" means when one of several handlers failed
  and the others did not; or
- reconcile against `ntizo_notification.notification` before replaying — the
  consumer's own table is the only existing record of what was actually
  delivered.

Doing neither is not a degraded relay. It is a mass double-delivery on the day
it ships, to every user at once.

**Trigger:** the relay is now the work itself rather than something waiting to
be triggered. Whoever picks it up inherits the paragraph above and the
missing-sequence-column problem above it. Sooner if table growth becomes
visible.

---

## ~~9. `runAfterCommit` is built but unused~~ — RESOLVED 2026-08-23

`OutboxAdapter.publish` calls it. All 14 use cases that publish domain events
— 13 in the Provider context, one in User — now queue an in-process fan-out
through `runAfterCommit`, so handlers run only once the producing transaction
has committed and never on a write that rolled back. Pinned by tests that watch
the dispatch *not* happen while the transaction is still open, and not happen
at all when the transaction does not commit.

Not the caller this entry predicted. `invite-provider-member` still sends its
email after `atomicExecute` returns rather than through `runAfterCommit`, and
reports a send failure instead of throwing, so the stale-unused-invite failure
mode is exactly as described below. What arrived instead was a consumer with a
stronger reason to wait for the commit: an unsent email can be re-sent, but an
inbox row about something that did not happen cannot be recalled.

The original analysis is kept below because it still names the caller this
mechanism was built for, and that conversion has not been done.

---

## 9. (original) `runAfterCommit` is built but unused

`tx-context.ts` provides it; nothing calls it. Its natural first user is
`invite-provider-member`, which saves the invite **transactionally** (Phase 3A
made it so) and then sends an email **outside** that transaction. The only
failure mode today is a stale unused invite, so this is not urgent — but the
mechanism exists precisely for it.

An earlier draft of this entry said both were untransacted, which was wrong and
contradicted entry 11 below.

**Trigger:** the next side-effect that must not fire on a rolled-back write.

---

## 10. `upgrade-profile-to-provider` emits no event — half done

The machinery half is done. The `User` aggregate now has `_events`,
`recordEvent` and `pullEvents`, copied from `Provider`, plus a `UserRegistered`
event that `User.create` records and `CreateUserOnSignUpInternalCommand`
publishes inside its existing transaction (2026-08-23, branch
`feat/notifications`). `rehydrate` deliberately records nothing, and a test
pins that: loading a user from the database is not a registration.

**What is left is the half this entry is named after.** There is still no
`ProfileUpgradedToProvider` event class and the eleventh dispatch site is still
unwired. It was left out deliberately rather than forgotten — nothing listens
for it, and an event with no listener is how dead surface starts (entry 29).

**Trigger:** the first consumer that needs to know somebody became a provider —
a "your workspace is ready" notification aimed at the *person* rather than the
workspace, an onboarding email, a projection over provider counts. The
machinery is no longer the obstacle; what remains is one event class and one
`recordEvent` call.

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

**Still open — the notifications email-delivery phase (2026-08-24) did not fix
it.** `verifyEmailTemplate`, `resetPasswordTemplate` and `verifyPhoneTemplate`
are the same fixed English strings they were. What that phase did change is
how much precedent the fix now has: the per-locale pattern this entry proposes
("a small message table per template") has five more users in
`bounded-contexts/notification/infrastructure/templates/` — a `Copy`
interface, one `const` per language, a `BY_LOCALE` table over all eight
locales, and a shared `pickCopy` that falls back exact locale → language-only
→ English, so a `pt-BR` reader gets Portuguese rather than English. That is
five worked examples and an argued-out fallback rule, where this entry was
written against one partial precedent: `provider-invite.template.ts`, which
carries EN and PT only and has no language-only fallback.

The undone half is the one this entry already names, and it is the harder one:
carrying the requester's locale into the better-auth hooks. The five templates
above are handed a locale read off `profile.language`; verification cannot use
that column, because at sign-up it still holds its `"en-US"` default — nothing
writes a language until the user edits their profile. So `Accept-Language`
from the endpoint context really is the only source, exactly as written above.

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

## 21. Documents: DONE, except for a queue across providers

Both halves of this are built.

`GET /api/documents/:documentId` serves the bytes to an administrator or to a
member of the workspace the document belongs to, `private, no-store`, by
document id rather than by storage key — a key in a URL is the object's address
in the bucket. `POST /api/documents/:documentId/review` accepts or refuses a
document, administrators only, and a refusal without a reason is rejected
because the provider would be told to send it again with no idea what was
wrong. Only a `pending` row can be decided, enforced in the WHERE rather than
by a check-then-write, so two reviewers on the same queue cannot overwrite each
other; a no-op comes back 409 rather than as an error.

The review route is registered **before** the upload route, and that ordering
is load-bearing: `/api/documents/:providerId/:type` matches any two segments,
so it also matches `/api/documents/<id>/review`. With the upload first, every
review was answered by its membership check and came back 403 with an
administrator's session.

The administrator's provider file shows every document including superseded
ones, which is the point — the reason the table is append-only is that an
approved ID could otherwise be swapped for a forged one, and a reviewer who
cannot see that a document was replaced cannot notice it happened. Verified end
to end: upload → accept → replace → the old row goes `superseded`, the new one
is `pending` and marked as replacing it, and the account is flagged for
re-verification.

**What is still missing:** a queue *across* providers. Today a reviewer finds
pending documents by opening one provider at a time. The index for it already
exists — `provider_document_status_idx` is `(status, uploaded_at)`, which is
exactly "everything still waiting, oldest first".

**Trigger:** when more than a handful of providers are waiting at once.

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

## 23. Slugs changed shape; existing links break

Provider slugs now always carry a Crockford-base32 suffix derived from the
provider's id (`salao-beleza-wgcz6r`), and the slug is a route parameter:
`/provider/$slug/overview`. `scripts/backfill-provider-slugs.ts` rewrote the ten
rows in dev that held bare or numbered slugs; it is idempotent and dry-runs
without `--apply`.

It has **not** been run against qa or prod, which also have neither migrations
0002–0006 nor the cities seed.

Rewriting a slug rewrites a URL. That is free while the only links are in dev
and in this repository, and it stops being free the moment a provider shares
their page. At that point this becomes a redirect table — keep the old slug,
303 to the new one — rather than an `UPDATE`.

**Trigger:** before any provider page URL is shared outside the team, or before
the first qa/prod deploy.

## 24. Local media is served by the Worker, not a bucket URL

`wrangler dev` writes to a simulated R2 on disk that no `r2.dev` URL can reach,
so locally `MEDIA_PUBLIC_URL_BASE` points at `http://localhost:8788/api/media`
and `GET /api/media/*` streams objects out of the binding. Every deployed stage
points at its bucket's public URL, so that route is unused outside local dev.

It is deliberately unauthenticated — it reads the *public* bucket, whose objects
are already served anonymously from a CDN URL in every stage. If a private
variant of that bucket ever appears, this route must not be pointed at it.

**Trigger:** if media ever moves behind signed URLs, or a second, private media
bucket is introduced.

## 25. DONE — the wizard's payout details are stored

`provider.payout_type` and `provider.payout_identifier` (migration 0012),
written by `setPayoutDestination` on the aggregate and saved by the wizard on
the way out of its payout step. Both together or neither: a method with no
number is half an instruction, and storing half means the payout fails when it
runs rather than when it was entered. A card is refused — card networks push
refunds back to the original charge, never to an arbitrary account, which
`supportsDirection` already said and the aggregate now enforces.

Two plain columns rather than a `payment_method` row: a provider has exactly
one place they are paid and the wizard asks for exactly one, so a table would
invite a second with nothing deciding which is current. If several are ever
needed, this becomes a foreign key and these are the migration's source.

Shown on the administrator's provider file and nowhere else — not the queue,
not the public directory, not the workspace's own read.

**Still missing:** the settings page has no payout block, so a provider who
skipped the wizard step, or whose number changes, cannot fix it. The mutation
accepts it already; it needs the form.

**Trigger:** the first provider who changes bank.

## 26. The wallet has no entries yet, by design

`ntizo_provider.wallet` is created with every workspace and
`ntizo_provider.wallet_entry` is ready, but nothing writes an entry: the
payment flows do not exist. `deltasFor` decides how each entry type moves the
two balances and is tested; `WalletRepositoryPort` deliberately exposes only
creation, because a port with methods nobody calls is a design guess wearing
an interface.

Decided and not yet built:
- The platform's own ledger. Commission is 10% from the customer and 0% from
  the provider, so it never touches a provider wallet — it is Ntizo's revenue
  and needs somewhere of its own.
- Payout lifecycle (requested → processing → paid → failed). `PayoutReversed`
  exists as an entry type for the failure leg; nothing drives it.
- Reconciliation: `balance_after_minor` is written on every entry so a
  divergence between the cached balance and the sum of entries can be located,
  but no job compares them.

**Trigger:** the booking + payment bounded context.

## 27. The quote form has no editor

The spec's Interface section agreed a `quote` service asks two things:
"what to ask the customer, and the response window." `service_quote_form`
ships with `responseHours` fixed at `48` and the three `ask*` booleans fixed
at `true` for every quote service ever created — `Service.create` writes that
literal object and nothing since has changed it. `service.update` accepts a
`quoteForm` (now actually enforced against `bookingMode` — see the
`QuoteFormNotAllowedError` guard added alongside this entry), but no frontend
code sends one: the create form asks category, name, description, location
and booking mode, and stops there.

**Trigger:** slice 3, which reads `service_quote_form` to build the request
form a customer sees.

## 28. `save()` deletes and reinserts every option row on every write

`DrizzleServiceRepository.save` deletes every `service_option` row for a
service and reinserts the aggregate's current set, on every save — including
a pure translation save, since `Service.setOptionTranslation` still goes
through the same `save()`. The only FK child today is
`service_option_translation`, which is rebuilt deliberately right after (the
delete cascades, the insert repopulates), so nothing is lost. But the spec
says slice 2's schedule hangs off the option, and the first cascade child
attached to an option — a `service_schedule` row, a slot, anything with its
own lifecycle — will be destroyed the next time a provider renames the
service or edits an unrelated field.

Also, because of the same delete-and-reinsert shape: `service_option.created_at`
is written as the *service's* `createdAt`/`updatedAt` (`service.mapper.ts`'s
`toPersistence` copies `json.createdAt`/`json.updatedAt` onto every option
row), because the aggregate carries no per-option timestamps at all — and
every surviving option's `updated_at` bumps on any unrelated save, since the
row is dropped and reinserted with the service's current `updatedAt` whether
that particular option changed or not.

**Trigger:** before slice 2 attaches anything to an option.

## 29. Dead surface on the branch

Four things this slice built or inherited that nothing calls yet:

- `ServiceRepositoryPort.delete` is implemented by `DrizzleServiceRepository`
  and called by nothing — no command in `bounded-contexts/catalog/app`
  reaches it. There is no "delete a service" use case, only archive.
- `Service.removeTranslation` is called only by
  `service.aggregate.test.ts`; no command exposes a way to remove one
  language's translation once set.
- `Service.update`'s `sortOrder` parameter is unreachable: `updateService`'s
  GraphQL input carries `categoryId`, `locationType`, `imageKeys` and
  `quoteForm`, never `sortOrder`, so `service.sort_order` and its
  `(provider_id, sort_order)` index are permanently `0` for every service and
  the provider's own list is really ordered by `created_at` (the read
  projection's default order), not by anything the spec's index was built to
  serve.
- `BOOKING_PATHS`/`bookingPathSchema` in `packages/shared` have no consumer —
  only a type-only import in `booking-summary.contract.ts`, itself part of a
  bounded context that does not exist yet (booking is slice 4).

**Trigger:** when the provider asks to reorder their services — that is what
gives `sortOrder` a caller and makes the rest of this list worth revisiting
alongside it.

## 30. No customer-facing screen consumes `service.all`

`public/catalog`'s `listServices` (`service.all`) is built, tested
(`public/catalog/__tests__/list-services.test.ts`) and reachable over
`/public/graphql` — but no frontend code calls it. The public read is
reachable only by curl or a GraphQL client hitting the endpoint directly;
there is no customer-facing route or component in
`apps/frontend/web/src/features` that renders a published service.

**Trigger:** the first customer-facing catalogue screen.

## 31. `service.detail` and `service.bySlug` were in the spec's GraphQL surface and were not built

The spec's GraphQL surface section lists `service.mine`, `service.detail`
under private reads and `service.all`, `service.bySlug` under public reads.
Only `service.mine` (`read/catalog`) and `service.all` (`public/catalog`)
exist. Both omissions are individually defensible — a provider's own list
doesn't yet need a single-service detail fetch when the list query returns
full rows, and no public page exists yet to need a slug lookup (entry 30) —
but neither was recorded as a deliberate cut until now, so a reader of the
spec alone would expect four fields and find two.

**Trigger:** whichever arrives first — a provider detail view that outgrows
its list-query data, or the customer-facing screen from entry 30 needing a
single service by slug.

---

*Entries 32 onwards come from slice 2 (availability). Entry 30 — "no customer
screen consumes `service.all`" — is **closed**: the public provider page gained
its services list, and `service.all` gained the `providerId` argument it needed
to answer "this business's services" rather than the whole platform's.*

## 32. The Members page's row-action menu does not open

Verified during slice 2's end-to-end walkthrough and again during its final
fix wave: the "…" dropdown on a member's row stays closed. Reproduced on the
first attempt, via a click by element reference, by raw coordinates, after a
reload, and by a direct DOM `.click()`. The menu is the only route to
**Remove**, so removing a member through the interface is currently
impossible; both verifications had to drive the mutation directly.

This also strands slice 2's own last feature: when a member leaves and their
services are left with nobody, the Members page now shows a banner naming
what went dark — correct, translated into eight languages, and unreachable,
because nobody can get to the action that triggers it.

Pre-existing; it is not caused by slice 2. `people-table.tsx`'s `RowActions`
is untouched by that branch.

**Trigger:** the next time anyone needs to remove a member — which is now,
because the banner is finished and waiting behind it.

## 33. The availability engine's exact boundaries are correct and uncovered

Seven tasks each left one boundary case with no test behind it, and the final
review probed all nineteen empirically: `subtractIntervals`' right edge in
four configurations, the 1440 accept-and-refuse pair, both defensive copies on
the aggregate, the exact-fit offer in both pricing modes, `minuteOfDay: 1440`
on both Lisbon daylight-saving dates, and the gap and ambiguity resolutions.
**All nineteen behave correctly.** What is missing is anything that would
notice if they stopped.

The pattern's origin was the plan's own test values: closing at 18:00 with
45- and 75-minute spans on a 30-minute grid never lands on the boundary the
guard controls, and 1500 fails a 1440 limit by so much that it never touches
it.

**Trigger:** the next change to `intervals.ts`, `offers.ts` or `zoned.ts` —
or, cheaply, an afternoon adding the nineteen cases while the probes are still
written down in the final review's report.

## 34. Nothing tests two members busy at the same minute

The union logic is covered for "both free", "one free", and "nobody free at
day granularity", but not for two members whose busy intervals overlap inside
an otherwise-open day. Harmless today, because `BusyIntervalsPort` returns an
empty map and no booking exists.

**Trigger:** slice 4, the moment the port returns real bookings. This is the
first case that will exercise it and the first that can be wrong.

## 35. `resolveOfferShape`'s six guards are unreachable by any test

Making all six throw leaves the suite green. One of them matters more than
coverage arithmetic suggests: a zero or negative `slotIntervalMinutes` would
make `fixedStarts` loop forever, and the query is anonymous. The database
`CHECK` restricts the column to 15, 30 or 60, so the guard is defence in
depth — but it is defence nothing verifies.

**Trigger:** any change to how the offer shape is derived, or a report of a
public availability request that never returns.

## 36. The unpublish sweep bypasses the aggregate, so no domain event fires

`unpublishServicesWithoutMembers` is a single `UPDATE`. `Service.unpublish()`
pushes a `ServiceUnpublished` event; the raw statement does not. No consumer
exists today — the event type is defined and read by nothing.

**Trigger:** the first projection, notification or audit trail that subscribes
to `ServiceUnpublished`. It will silently miss every service unpublished by a
departure, which is the case a human most wants to hear about.

## 37. The new frontend features have no component tests

`members.tsx`'s removal banner, the performers checkbox, `ServiceCard`,
`ProviderServicesSection` and `AvailabilitySheet`'s rendering all have domain
functions under test and no test that renders them. Two real defects on this
branch — every organization service create failing, and the member picker
vanishing when a person was chosen — were found by a person using the
application, not by its tests, and both lived in exactly this layer.

**Trigger:** the third defect found this way, or the first time a screen is
changed by someone who did not write it.

## 38. `days[].starts[].memberIds` is fetched and never read

The public availability response carries, per start, the ids of the members
free at that moment. The spec justified it as letting the screen offer the
choice without a second query — but the picker's fix made it re-query with a
`memberId`, so the second query is exactly what happens. The field is still
defensible as the seam slice 4 needs, since a booking must name a person.

**Trigger:** slice 4. If booking ends up naming the person some other way,
delete the field rather than leaving it carried and unread.

## 39. Two checks sit behind the quote early-return

`list-service-availability.projection.ts` returns for a `quote` service before
the 62-day window bound and before the performer check. So a quote service
accepts a ten-year range and any `memberId`, including one belonging to
another workspace, and answers success. Nothing is scanned, so nothing is
slow and nothing leaks — but "a member who does not perform the service is
refused rather than answered with an empty week" is not true for quote
services, and the spec says it without qualification.

**Trigger:** slice 3, which is where quote services acquire behaviour worth
guarding.

## 40. `bookingMode` is cast to its union with no constraint behind it

`service_option.pricing_mode` is held to `fixed`/`hourly` by a `CHECK`;
`service.booking_mode` has no equivalent, yet both are cast the same way when
read. A third booking mode added to the column before the type would take the
`else` branch silently. Matches the existing `service.mapper.ts` precedent, so
fixing one means fixing both.

**Trigger:** a third booking mode — which slice 3 may well introduce.

## 41. Hardcoded English strings in the provider shell and Overview page

The "New service" fallback button in `provider-shell.tsx` and several strings
on the Overview page are not translated, and render in English in every
locale including `pt-MZ`, the platform default. Pre-existing; unrelated to
slice 2, found while verifying its eight locales.

**Trigger:** the next locale audit, or the first Portuguese-speaking user who
mentions it.

## 42. The services browse search is accent-blind and unindexed

`ILIKE '%term%'` against `service_translation` matches case but not accents,
so `salao` does not find `Salão` — the common spelling on a phone keyboard,
in the platform's own language. It also cannot use an index, so every search
is a sequential scan of every published translation.

Both have one fix, and it is already in this repository: a stored
accent-folded column, written on save, the way `ntizo_reference.city` keeps
`search_name`. `foldForSearch` is exported and tested in
`public/city/infra/repositories/drizzle/city-public.repository.ts:20`; the
schema comment there explains the index argument in full. No `unaccent`
extension is involved — an earlier note in this session claimed the extension
was the only route, and that was wrong.

Scope: a `search_name` column on `service_translation`, folded on write in
the translation command, and `listPublished` matching against it instead.

**Trigger:** the first Portuguese search that comes back empty for an accent
— or the catalogue passing a few thousand published translations, whichever
lands first. Deferred deliberately: the browse's filters were judged more
valuable than the browse's spelling.

## 43. The service detail page renders invented ratings and reviews

`/services/$id` ships its rating, its review list, its service radius and its
cancellation policy from `service-detail-placeholders.tsx`. It is not the only
place: `features/landing/domain/mock-content.ts` already carried the identical
seed — 4.3, 130 reviews, the same invented reviewer names — before that page
existed. Both go, or neither does; an entry naming one of two places gets
half-actioned. There is no Review
context to read them from, and — decided deliberately on 2026-08-13 — no flag
separating them from the real sections around them.

On a page that also names a real provider, a real business and a real price,
"4.3 · 130 avaliações" is a claim about that provider that nobody made. The
review bodies carry invented author names beside it.

Two ways out, and the cheap one is enough on its own: delete the placeholder
module and the four sections that read it, or gate it behind an environment
variable that is off in production. The second was offered and declined at the
time; the first costs nothing once the sections have served their purpose of
showing what the page will look like.

Precisely what "delete the placeholder module" is: `service-detail-placeholders.tsx`'s
own header says *three* call sites, and this entry says *four* sections — both
are correct, and they answer different questions. `ServiceRating`,
`ServiceFacts` and `ServiceReviews` are the three components
`service-detail-page.tsx` mounts; `ServiceFacts` alone renders two of the four
fabricated facts (service radius, cancellation policy), alongside the rating
and the review list each of the other two components renders. Whoever actions
this needs the four, because that is the unit a reader can see and believe,
not the three components that happen to produce them. (Duration was briefly a
fifth fabricated fact inside `ServiceFacts` — "4–12 horas" beside a real price
— and is not part of this entry's scope any more: it was replaced with real
data, `optionDurationMinutes`, rendered by `PackageChooser` instead, in the
same pass that corrected this count. `PackageChooser` has since been split into
`ServiceOptions` and `RailPriceSummary`, which both still read that same
function.)

Deleting the module also orphans locale keys nothing else reads: `ratingCount`
(and its plural sibling `ratingCount_other`), `ratingAriaLabel`,
`reviewsTitle`, `reviewsStarsLabel`, `reviewsReplyLabel`, `factsAreaLabel`,
`factsAreaValue`, `factsCancellationLabel`, `factsCancellationValue` — 9 keys,
10 JSON lines per locale file once `ratingCount`'s plural sibling is counted.
Repeated in all eight locale files (`src/shared/locales/*/directory.json`),
that is 80 lines the parity test (`i18n-parity.test.ts`) will never flag,
because it checks that every locale carries the same keys, not that a key is
still read by anything.

**Trigger:** before the first real provider is onboarded, or before any deploy
that a customer can reach — whichever comes first. This is not a tidy-up; it is
a false statement about a named business on a public page.

## 44. An open availability window renders as "no times free"

`member_availability.slot_interval_minutes` has three documented states: null
is "use the default", a number is a grid, and `0` means the window is simply
open — for a provider who takes people as they arrive rather than at :00 and
:30. The engine honours it: a `0` window produces no discrete starts, which is
correct, because there are none to produce.

Nothing downstream knows that. `availabilityForService` returns a day with an
empty `starts` array, and `time-grid.tsx:65` renders every empty array as
`availabilityDayEmpty` — "no times free this day". So a business that is open
from eight to five, every weekday, reads to a customer as fully booked. The two
cases are opposite and the wire cannot tell them apart.

Two things are needed and the second is cheap only after the first: the
availability read model has to say that a day is open-without-slots rather than
merely empty, and the grid needs something to draw for it — a stated range and
a way to ask, not a grid of buttons.

Found while seeding demo availability: `cozinha-da-vovo` was deliberately given
`0` to exercise the branch, and its two services became indistinguishable from
broken ones. The seed was reverted to a 30-minute grid rather than shipping a
demo provider that looks faulty; that revert is why no seeded provider
currently exercises this path at all.

**Trigger:** the first provider who says they do not work by appointment — a
caterer, a mechanic taking walk-ins, anyone with a counter. Until then this is
a branch of the engine no screen can display.

## 45. Every `z.literal(true)` mutation output serialises as a String, not a boolean

The GraphQL schema builder (`@cosmneo/onion-lasagna/graphql/field`) maps any
zod schema whose JSON Schema carries an `enum`/`const` — which is what
`z.literal(true)` produces — to the GraphQL `String` scalar, not `Boolean`.
So a mutation declared `output: zodSchema(z.object({ ok: z.literal(true) }))`
resolves over the wire as `{ "ok": "true" }`, the string, not `{ "ok": true }`.
Verified on the wire for the notification BC's `markRead` /
`markProviderRead` mutations (task 12): the response was literally
`{"ok":"true"}`.

This is not a notification-only quirk. `z.literal(true)` is this repo's
standing idiom for "a mutation that only needs to say it worked" — 18
occurrences across six bounded contexts' write-side mutation schemas
(`catalog`, `notification`, `provider`, `review`, `scheduling`, `user`), all
under `packages/backend/src/modules/ntizo/write/*/graphql/schema/mutations.ts`,
tests excluded. Per context: catalog 9, scheduling 3, notification 2,
provider 2, review 1, user 1 — 18 total. Catalog alone is half of it, worth
knowing before starting. Every one of them has the same property:
`.ok === true` is silently `false`, because `.ok` is never a boolean to
begin with.

Nothing is broken today. Every current caller treats a mutation's outcome as
"did the promise resolve" (success) vs. `onError` (failure) and never reads
`.ok` itself — task 12's `useMarkRead` is one instance of that shape.
Three ways out were considered and none were taken: changing the two
notification mutations' output to `z.boolean()` would make them the
exception among 16 siblings a future maintainer has to remember; dropping the
field changes a public contract for no behavioral gain; fixing the idiom
repo-wide is the right shape but touches five bounded contexts this task has
no business in.

**Trigger:** the first caller — frontend or otherwise — that needs to branch
on a mutation's *return value* rather than on whether it threw. Until then
this is a landmine nobody has stepped on, because nobody has needed to read
`.ok`.

## ~~46. The provider shell's own topbar bell is still inert~~ — RESOLVED 2026-08-23

Review caught what this entry's own reasoning missed: `provider-shell.tsx:70`
renders `<HeaderActions showAccount={false} />`, and `showAccount={false}`
hides `HeaderActions`' bell along with its avatar — the same file's own
comment says so. So this was never a *second* bell sitting beside a working
one; in the provider zone it was the *only* one. The distinction mattered
because it changed what the inert dot meant: before this task, nothing about
notifications worked anywhere, so an unlit-in-spirit bell read as unbuilt.
After the rest of task 13 shipped — the customer bell, the provider sidebar
entry — the same permanently-lit dot on the only bell a provider-zone screen
has started claiming "you have something new" to every user, every time,
falsely.

Fixed: `ProviderShell` now calls `useActiveProvider()` (the same mechanism
`SidebarNav` already used to know the active workspace — not a second one)
and `useUnreadCount({ kind: "provider", providerId })`, and renders
`NotificationBell` inside a `Link` to `/provider/$slug/notifications`, in
place of the hardcoded `<Bell/>` + static dot. The 36px bordered-square shape
of the button itself is unchanged, as instructed — only its contents and its
`href` are real now. The original analysis is kept below because the
"differently-styled control" reasoning is still correct about *why* task 13
didn't fold this in on the first pass — it just turned out not to be the
whole story.

---

## 46. (original) The provider shell's own topbar bell is still inert

`ProviderShell`'s header (`shared/components/provider-shell.tsx`) carries its
own notification button, separate from `HeaderActions`' bell — `showAccount=
{false}` turns `HeaderActions`' copy off for this zone, so this hardcoded
button is what a provider-zone user actually sees. Task 13 wired the real
bell into `HeaderActions` (the customer and admin zones) and gave the
provider sidebar a working Notifications entry beside Wallet
(`shared/lib/navigation.ts`), but left this second, independent button
alone: it still renders a permanently lit dot
(`<span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full
bg-primary" />`, unconditional markup, not sourced from `useUnreadCount`)
and opens nothing on click.

Left alone deliberately, not missed: Task 13's brief scoped the bell change
to `header-actions.tsx` by name, and folding a second, differently-styled
control into `NotificationBell` (a 36px bordered square button versus the
20px bare icon `HeaderActions` wraps) is a design decision about that
button's shape, not the one-line swap the brief asked for.

**Trigger:** the first person who notices a provider-zone screen always shows
an unread dot regardless of `useUnreadCount`, or the first task that touches
`ProviderShell`'s header for another reason and can fold this in along the
way.

---

## 47. The inbox has no way to see past its first 20 rows

`NotificationsPage` (`features/notifications/ui/notifications-page.tsx`) calls
`useInbox(scope)` with no offset, and `INBOX_PAGE_SIZE` (20) is never varied.
A workspace or a person with 25 notifications sees the newest 20 and nothing
past them — no "load more", no page 2, no way to reach row 21.

The plumbing for real paging already exists end to end and is simply unused:
`notificationQueries.mine`/`forProvider` take an `offset` parameter,
`useInbox(scope, offset = 0)` threads it through, and the backend's
`page()` helper (read tier) clamps and defaults `limit`/`offset` on both
queries. Wiring a "load more" control is a small, mechanical change to
`notifications-page.tsx` — call `useInbox` with a piece of state instead of
the default, add a button that increments it — not a redesign.

Fixed here, deliberately short of that: when `page.total > page.items.length`,
the page now says how many of how many are shown
(`t("showingCount", { shown, total })`), rather than staying silent about
truncation or growing a control that does nothing. Same ruling
`provider-reviews.tsx:118-123` already made for the reviews list, for the
same stated reason — "a control that lies is worse than a sentence that does
not." That precedent is why this entry exists rather than a load-more button:
building the control was in scope for this fix and was deliberately not
done, so the next person who wants one is not starting from a blank page.

**Trigger:** the first provider or customer whose inbox actually holds more
than 20 rows and needs the 21st — at that point the sentence stops being
enough and the offset control described above is the next step.

---

## ~~48. `TeamInvitation` snapshots the workspace's name, and nothing renders it~~ — RESOLVED 2026-08-24

The invitation email renders it. `team-invitation.template.ts`
(`bounded-contexts/notification/infrastructure/templates/`) reads
`payload.providerName` and interpolates it into the subject, the heading and
the body, in all eight locales — "Foi convidado para Salão X na Ntizo" rather
than the generic sentence this entry describes. The name is escaped before it
reaches the copy (a workspace names itself, and this message lands in someone
else's inbox), and a name the lookup could not resolve falls back to a generic
phrase rather than failing the render, so a deleted or renamed workspace still
gets its invitation out.

This is the trigger the entry predicted, firing where it predicted: "most
likely alongside Phase 2's email templates, since the same fact is wanted in
both places." The email is the place it matters most — it is read outside the
app, with no row beside it to give it context.

**The in-app half is still generic, and that is the remainder.** The
`type.teamInvitation` string in the eight locale catalogues still says "You
have been invited to a team", with no `{{providerName}}` in it, exactly as
described below. That was never a backend problem: the snapshot is in every row written
since the notifications-inbox branch, and changing the string is the whole
change. The email templates are now the worked example of how to say it.

The original analysis is kept below because it still explains why the field is
snapshotted rather than looked up, and because the in-app copy it was written
about has not changed.

---

## 48. (original) `TeamInvitation` snapshots the workspace's name, and nothing renders it

The team-invitation notification carries `providerName` in its payload as of
the notifications-inbox branch (2026-08-23). The reason it is there is
recorded in entry 24's sibling reasoning: a **personal** inbox row can name
several different workspaces, so unlike a workspace row it has to say which
one — and it is the one row with no cascade behind it, because `audience:
"user"` leaves the `provider_id` column NULL. Snapshotting the name is what
keeps the row readable after the business is renamed or deleted.

The screen does not use it. No `type.*` string in any of the eight locale
catalogues interpolates anything — `{{count}}` in `unreadBadge` is the only
placeholder in the namespace — so the invitation currently reads as a
generic sentence with the workspace's name sitting unused in the row beside
it.

This is the same shape as `WELCOME`'s `firstName`, captured on the same
branch and equally unrendered, and it is deliberate in both cases: the
backend snapshot and the copy are separable, and the snapshot has to exist
*first* or the copy has nothing true to say later.

**Trigger:** whoever writes the invitation copy — most likely alongside
Phase 2's email templates, since the same fact ("Ana invited you to Salão X")
is wanted in both places. Changing `type.teamInvitation` to interpolate
`{{providerName}}` is the whole change; the data is already in every row
written since this branch. Rows written *before* it have no name and will
render the placeholder — decide then whether that is worth a backfill or a
fallback, because there are none in production today and the cheapest answer
is likely neither.

---

## 49. Residual minors from the notifications-inbox branch

Fourteen tasks, thirty commits, and a whole-branch review left a tail of small
findings that were triaged as genuinely deferrable. They are collected here
rather than lost with the execution ledger, which is scratch and goes away.
None is a correctness bug; each is the kind of thing that costs an hour when
somebody trips on it and nothing until then.

**In the notification repository** (`bounded-contexts/notification/infrastructure/
repositories/drizzle/notification.repository.ts`): `markRead`'s fallback returns
`true` for a member who was removed after reading — the leak is bounded to rows
they already saw while entitled. A malformed uuid throws rather than returning
`false`; `z.string().min(1)` is the convention at 25 call sites across six
contexts, so making notification the exception would be worse than the
inconsistency. `save()` silently ignores `entity.id`. `scope: ReturnType<typeof
eq>` should be drizzle's `SQL`. Its tests share mutated state and depend on file
order.

**In the event router** (`shared/infrastructure/events/`): multi-event ordering
is guaranteed by `for...of` + `await` but no test pins it. A handler that starts
work without awaiting it can still surface a late unhandled rejection — a
structural limit of any awaiting wrapper, not a bug.

**In the write tier**: `notification.markRead` and `notification.markProviderRead`
are byte-identical handlers, justified by an audit trail the system does not
actually keep — nothing records which field was invoked. `requireUser` is copied
into the read and write handler files with different refusal messages.

**In the frontend**: `NotificationBellLink` types `to` as `string`, so the two
call-site route paths are no longer checked against the generated route tree the
way inline `<Link to="...">` literals were; TanStack's `ValidateLinkOptions`
would restore it. `notifications-page-truncated.test.tsx` asserts English copy
literally.

**Shape inconsistency worth one look if this area is touched again:** the two
list projections are separate classes while the two count projections are two
methods on one class, and `notification-read.schema.ts` re-declares
`pgSchema("ntizo_notification")` instead of importing the one declared beside it.

**Trigger:** the next substantive change inside `bounded-contexts/notification`
or `features/notifications` — read this list first and fix whatever sits in the
file you are already opening. Not worth a dedicated pass.

---

## 50. Two copies of the "which email adapter" decision, and one went stale

`apps/backend/api/src/bootstrap.ts` and
`packages/backend/src/shared/infrastructure/email/resolve-email-service.ts`
both implement `resolveEmailService` + `LazyEmailServiceAdapter`. They differ
only in two log strings: the shared one says `[email]` where the app one says
`[bootstrap]`, and the app one prints an extra `console.info` naming the
console adapter on a local run. The shared module's own doc already claims to
be the single definition ("One definition, called by everything that sends.
The API bootstrap had this logic…"), so the duplicate was meant to go when it
landed and did not.

It cost something: when Task 4 gave `EmailServicePort.sendEmail` a return
value, only the shared copy was updated. `apps/backend/api` stopped
typechecking at `ec431f2` and nobody noticed for four commits, because
`wrangler` bundles with esbuild and never typechecks. Fixed in place at
`095e77d` rather than consolidated — deleting the duplicate changes two log
strings and drops a local-dev hint, which is a decision of its own.

**Trigger:** the next change to either file, or the next field added to
`EmailServicePort`. A port with two implementations of its own factory will
drift again, and the second one will be found by whatever breaks next rather
than by CI.

**Related, and cheap while you are there:** no per-task gate on this branch
touched `apps/backend/api` at all until Task 7, whose brief added
`bun run typecheck` there and found the break on its first run — four commits
late. CI's `bun run check-types` is `turbo run typecheck` across the workspace
and does include `@ntizo/api`, so this branch has been red there since
`ec431f2`. The app's own `test` and `lint` scripts are still in no gate list.

---

## 51. Nothing enforces the app→infrastructure import direction

Two fitness tests guard bounded-context structure —
`fitness-no-framework-in-packages` (no Hono/Yoga inside `packages/backend/src`)
and `fitness-no-bc-router` (no `rest`/`http`/`graphql` directories, no
`create*Router` exports inside `bounded-contexts/`). Neither says anything about
the direction that matters most to this architecture: **an app-layer use case
must not import infrastructure.**

It is currently violated. `provider/app/use-cases/invite/invite-provider-member.command.ts:12`
imports `infraStore` from `shared/infrastructure/stores/`, and
`shared/infrastructure/email/templates/provider-invite.template` on the next
line. A use case that reads the request-scoped store cannot be constructed
outside a request, which is why the notification context went the other way in
Task 7: the deferral there lives in
`notification/infrastructure/inbound-adapters/deferred-notification-delivery.adapter.ts`,
a decorator wired at the bootstrap, precisely so `RaiseNotificationInternalCommand`
stays free of it.

A test asserting "no file under `bounded-contexts/*/app/` imports from
`infrastructure/`" would go red immediately on that pre-existing violation, in a
bounded context nobody was touching — which is why it was ruled out of scope for
Task 7 rather than written and skipped.

**Do it in this order:** move the invite command's `infraStore` read out to an
outbound port (an `AppUrlPort`, or pass the base URL in on the input) and its
template import to an adapter; *then* add the fitness test, so it lands green
and stays that way.

**Trigger:** the next change to `invite-provider-member.command.ts`, or the next
time anyone is tempted to reach for `infraStore` from an app-layer use case
because there is already precedent for it. The precedent is the bug.

---

## 52. Suppression keys are byte-exact, and nothing normalizes an email anywhere in the round trip

`email_suppression.email` is `text("email").primaryKey()` with no
case-folding, and neither the write side
(`resend-email-service.adapter.ts:22`, which sends `message.to` verbatim) nor
the webhook side
(`handle-resend-webhook.internal.command.ts`'s `execute`, which suppresses
each string in `event.data.to` verbatim) lowercases an address before it
touches this table. That is fine today only because the round trip happens to
be exact: whatever casing we sent is the casing Resend echoes back in
`data.to` on the bounce/complaint webhook.

If that round-trip ever stops being exact — Resend starts normalizing
addresses before echoing them, a provider migration changes casing, a second
email provider is added with different echo behavior — `ana@Ntizo.test`
suppressed as stored would silently fail to match `ana@ntizo.test` looked up
later (or vice versa), and there is no un-suppression path to notice the
mismatch by, only a bounce that keeps recurring because the suppression never
actually took.

**Trigger:** this becomes worth fixing only if the round-trip is ever observed
to not be exact — a second email provider, a Resend behavior change, or a
support ticket about an address that keeps bouncing despite being
"suppressed." Until then, lowercasing (or otherwise normalizing) on both the
write and lookup sides is speculative generality for a problem that has not
happened.

---

## 53. Eleven DB-backed tests in `bun run test` reach a remote Neon database, and time out when it is far away

**Corrected 2026-08-24 (email-delivery review): this said "two", and named
only the two that happened to flake on the day it was written. Seven test
files read `DEV_DB_URL`, and the same argument covers all of them —
understating the count understates the case for moving them.**

**Corrected again 2026-08-27 (activity-feed final whole-branch review): seven
became eleven. The activity-feed branch added three new DB-backed tests
under `bounded-contexts/activity/__tests__/`, and the same review converted
`activity-constraints.test.ts` from asserting Drizzle object properties
against themselves to asserting the real table — which made it a fourth new
`DEV_DB_URL` reader, the same fix this follow-up has been arguing for since
it was two. `turbo.json`'s `passThroughEnv` comment carries the same number
and was corrected with it.** The full list, from `grep -rl DEV_DB_URL
packages/backend/src`, filtered to `*.test.ts` (that grep also matches the
two `drizzle.config.ts` files, which are not tests):

- `bounded-contexts/activity/__tests__/activity.repository.test.ts`
- `bounded-contexts/activity/__tests__/provider-name-reader.adapter.test.ts`
- `bounded-contexts/activity/__tests__/service-name-reader.adapter.test.ts`
- `bounded-contexts/notification/__tests__/notification.repository.test.ts`
- `bounded-contexts/notification/__tests__/notification-delivery.repository.test.ts`
- `shared/infrastructure/database/__tests__/activity-constraints.test.ts`
- `shared/infrastructure/database/__tests__/catalog-service-search.test.ts`
- `shared/infrastructure/database/__tests__/catalog-unpublish-sweep.test.ts`
- `shared/infrastructure/database/__tests__/notification-constraints.test.ts`
- `shared/infrastructure/database/__tests__/notification-delivery-constraints.test.ts`
- `shared/infrastructure/database/__tests__/scheduling-constraints.test.ts`

The notification pair arrived with the notifications inbox and the
email-delivery phase, and the four above arrived with the activity feed —
which is how a pattern spreads: each one is individually right, and nobody
is counting.

They connect to `DEV_DB_URL` — the real dev Neon database — and seed their
fixtures in `beforeAll`. Bun's hook timeout is 5 seconds and none of them
raises it. Against a Neon instance a round trip away that budget is a handful
of statements: observed on 2026-08-24 as `a beforeEach/afterEach hook timed
out for this test` twice, followed by `TypeError: undefined is not an object
(evaluating 'seeded')` from the `afterAll` cleanup that then had nothing to
clean up. The identical command passed on the next run, and passed again
after that. It reproduced again during the email-delivery review, on
`catalog-unpublish-sweep.test.ts`, and passed on a re-run of that file alone.

Every one of them is right to exist — the whole argument in their headers is
that an `EXISTS` correlated on the wrong column, a sweep with the wrong
predicate, or a check constraint that does not constrain looks correct in
review and only a real query proves otherwise. The problem is where they run:
`bun run test` is a gate that is supposed to be deterministic and offline-safe,
and these make it depend on the latency of a shared remote database that
anybody can also be writing to.

A second cost, separate from the flake: a shared database accumulates whatever
these tests forget. `notification-delivery.repository.test.ts` leaked one
`notification_delivery` row per run until it was fixed in the same review —
108 of them were sitting in dev when it was found, because
`__runWithTransactionContextForTests` binds a handle and does not roll back,
so every write is real and every cleanup has to be written by hand. An
isolated database makes that class of mistake impossible rather than merely
noticed.

The `resetDb` harness the e2e suite already uses (a throwaway Postgres
container, `packages/backend/scripts/reset-test-db.ts`) is the obvious home
for them, and would make them faster and isolated at the same time. A
`test.setTimeout`-style bump would only move the flake further out.

**Trigger:** the next time CI goes red on one of these with nothing in the
diff to explain it — or sooner, because a gate that fails for reasons unrelated
to the change is a gate people learn to re-run rather than read.

---

## 54. The mark-all-read button overflows the page at very narrow widths — pre-existing, not from the activity-column task

Found while verifying Task 10 (the activity column beside the notifications
inbox) at narrow viewports. At a 200px CSS viewport,
`document.documentElement.scrollWidth - clientWidth` is 45px on
`/account/notifications`. The cause is the "Marcar todas como lidas" (mark
all as read) `<Button>` in `notifications-page.tsx`'s header row
(`flex flex-wrap items-end justify-between gap-4`): the button's label is one
`white-space: nowrap` run wider than 200px, the row's `flex-wrap` moves it to
its own line but does not shrink it, and nothing downstream clips it, so it
paints past the viewport edge.

Confirmed pre-existing and unrelated to the activity-column change: `git
stash`-ing `notifications-page.tsx`'s Task 10 diff and re-measuring the old,
one-column structure at the same 200px width, with the same wait for the
async notification query to resolve, reproduced the identical 45px overflow
from the identical button. The two-column grid Task 10 added contributes
nothing extra at this width — a separate, smaller overflow source inside the
new `ActivityList` row (its `<li>` lacks its own `min-w-0`, `right≈220px`)
stays entirely inside the button's larger footprint (`right≈246px`), so the
*measured* total is identical with or without the activity column.

Judged non-blocking for Task 10 because 200px is narrower than any shipping
phone (320px/375px, the realistic floor, measured 0 overflow both before and
after) and the button lives outside that task's one-file scope (the
component is `@ntizo/frontend-ui`'s `Button`; the long label is
`notifications.json`'s `markAllRead` copy, translated per-locale). Neither
was touched implementing Task 10.

**Trigger:** the next task that touches `notifications-page.tsx`'s header row,
adds another action button beside "Marcar todas como lidas", or does a
narrow-viewport pass on the notifications page specifically — at that point
either shrink/wrap the button's label handling or accept a documented minimum
supported width above 200px.

---

## 55. The provider and admin activity pages still render `[]`

**Corrected 2026-08-27 (final whole-branch review): this said both pages were
"wired to the real `ActivityList` component and a real `renderDescription`".
The `ActivityList` half still holds; the `renderDescription` half did not —
both pages called `t(\`activityType.${activityTypeKey(entry.type)}\`, ...)`
against the `provider`/`admin` i18next namespaces, and neither `provider.json`
nor `admin.json` has ever had any `activityType.*` key (only `account.json`
does). Dead only because `entries={[]}` meant the call was never actually
made — the moment either page got real data it would have rendered the
literal string `activityType.servicePublished` for every row, not a
sentence. Both pages now hand `ActivityList` a stub `renderDescription` that
does nothing and says so, rather than one that looks wired and is not.**

`ProviderActivityPage` and `AdminActivityPage`
(`apps/frontend/web/src/features/activity/ui/`) are real, routable pages —
correct copy, correct header, wired to the real `ActivityList` component —
but both hand it `entries={[]}` rather than a query result. Their own doc
comments say why: `useMyActivity()` (Task 8) is the signed-in caller's *own*
history, `activityMine` scoped to the caller's `actor_user_id`. "What did
this workspace do" (provider) and "what did an admin do to anything" (admin)
are both a different filter over the same `ntizo_activity.activity` table —
grouped by provider, or unfiltered by actor behind an elevated read — not the
per-caller cursor Task 8 built. The projection, repository method, and
GraphQL field either would need did not exist before this task, and
inventing a new query surface was out of scope for "prove the
read-your-own-history path works." Wiring either page for real also needs
`activityType.*` keys added to that page's own namespace (`provider.json` /
`admin.json`) in all eight locales, and rendering through
`describeActivity` (`viewmodel/describe-activity.ts`) rather than a second
copy of its null-name fallback.

**Trigger:** the next task that gives an admin or a workspace owner a reason
to see this page with real content — for admin, the compliance angle its own
comment names ("the one activity feed whose absence is a compliance problem
rather than a missing convenience"); for provider, any team-visibility
feature.

---

## 56. If the isolate dies between the producing commit and the handler dispatch, the activity row is lost

`EventRouter`'s in-process dispatch (follow-up #8) runs after the producing
transaction commits, inside the same request/isolate — no queue or relay sits
between the outbox row and the handler that turns it into an activity row.
If the isolate is recycled, crashes, or the request is cut short after the
commit but before (or during) the matching `registerXActivityHandlers`
handler running `RecordActivityInternalCommand`, the outbox row stays durable
and correctly ordered, but the activity write that should have followed it
never happens — a silent gap the same shape as the one this task's own e2e
test proves against, except caused by infrastructure timing rather than a
missing registration call. The same isolate-death window drops the
equivalent notification row for the same reason: both ride the same
in-process router.

**Trigger:** follow-up #8's relay work. Replaying the outbox at rest is what
recovers both gaps together — do not build a narrower one-off fix for
activity alone when that lands.

---

## 57. `image-cropper.test.ts` never runs anywhere

`packages/frontend/src/components/__tests__/image-cropper.test.ts` exists on
disk, has real assertions, and is excluded from every gate that could run
it. `packages/frontend/vitest.config.ts` excludes it by name, with a comment
saying it "runs on Bun's own test runner" instead — but the package's only
`test` script is `"vitest run"`. There is no second script, and no CI step,
that invokes `bun test` against this package. `bun run test` in
`packages/frontend` reports `Test Files 2 passed (2)` against three
`*.test.ts*` files on disk; the third is this one.

Fourth instance on this branch of a test that appears to be coverage and is
not — the same shape as a test excluded by a stale glob, a test whose gate
never wires the env var it needs, or a test whose own assertion is weaker
than its comment claims. Each one individually reads as "somebody will get
to this"; together they are the pattern this project keeps losing a
whole-branch review round to.

**Trigger:** the next task that touches `image-cropper.tsx` or its test —
at that point either add a `"test:bun": "bun test src/components/__tests__/image-cropper.test.ts"`
script and wire it into whatever runs `packages/frontend`'s gates, or
rewrite the test against Vitest/jsdom like its two siblings and drop the
exclusion.

---

## 58. Unused exports from the activity context

Three exports the activity-feed branch added are not imported anywhere
outside their own definition file:

- `ActivityBootstrap` (`packages/backend/.../bounded-contexts/activity/bootstrap/index.ts`,
  re-exported from `bounded-contexts/activity/index.ts`) — no caller types a
  variable against it; `apps/backend/api/src/api.ts:57`'s
  `const activityBootstrap = bootstrapActivity();` lets TypeScript infer the
  shape instead.
- `ActivityEntryDTO` (`packages/shared/src/read-models/system/activity/activity.schema.ts`)
  — every consumer either infers it from `activityEntryReadModel` or reads
  through `ActivityPageDTO`/`ActivityEntry` instead.
- `bootstrapActivity().repositories.activity` — `api.ts` reads
  `activityBootstrap.useCases.internal.recordActivity` and
  `.adapters.{providerNameReader,serviceNameReader}`, never
  `.repositories.activity`. The raw `DrizzleActivityRepository` instance is
  constructed, wrapped into `recordActivity`, and otherwise unreachable from
  outside the bootstrap function.

None of the three costs anything today — an unused named export is not a
lint error in this repo, unlike an unused local — so this is a note, not a
fix. Removing `ActivityBootstrap`/`ActivityEntryDTO` narrows a public
surface with no runtime effect; removing `repositories` from
`bootstrapActivity()`'s return would be a real behaviour change if anything
ever does need direct repository access (a future admin/provider-scoped read
that bypasses the internal command, say), so that one is better left alone
until asked for.

**Trigger:** the next dependency-cruiser or knip-style pass over
`packages/backend`/`packages/shared`, or the next time either type is
reached for and turns out to already exist.

---

## 59. A spec-listed property has no test: renaming a service must not change what an older activity row says

`docs/superpowers/specs/2026-08-26-activity-feed-design.md`'s Testing
section lists it first: "The snapshot rule: renaming a service after the
fact must not change what an older activity row says." Nothing in the
branch asserts it.

It holds structurally rather than by accident: `catalog.event-handlers.ts`
snapshots `serviceName` into the activity payload at write time (F5), and
`describeActivity`/`activityEntryReadModel` never re-resolve a name from a
live `serviceId` on read — there is no code path left that *could* rewrite
an old row's rendered sentence after a rename. The two greps that would
prove a regression instead — a read model that joins back to
`catalog.service` for the name, or a handler that stores `serviceId` alone
and expects the reader to resolve it — both come back empty today.

The three `service.renamed` occurrences in
`bounded-contexts/activity/__tests__/` (`record-activity.test.ts`,
`activity.aggregate.test.ts`, `activity.repository.test.ts`) are not this
test in disguise — each uses `"service.renamed"` only as an example of an
*unknown* activity type string, to prove `Activity.record`/`rehydrate`
degrade gracefully rather than throw. None of them writes a row, renames the
service, and re-reads to check the sentence is unchanged.

**Trigger:** the next task that touches `catalog.event-handlers.ts`'s
`resolveServiceName` call, `describeActivity`, or `activityEntryReadModel`'s
`payload` field — at that point add the test the spec already promised:
record `service.published` for a service named "A", rename it to "B" via
the catalog context, re-fetch the activity page, and assert the row still
renders "A".

---

## 60. One full-suite run in `packages/backend` reported a different test count than three subsequent runs

Observed once during this review: `bun run test` in `packages/backend`
reported `809 pass, 4 fail` across 813 tests; three later runs of the
identical command, no diff in between, reported `813 pass, 1 fail` across
814 (the 1 failure being `catalog-service-search.test.ts`, already known and
not this branch's). Not reproduced a second time despite trying; confidence
is low that this is even the same bug twice rather than two different
flakes.

The shape matches follow-up #53's argument rather than contradicting it: a
`beforeAll`/`beforeEach` timing out under contention on the shared remote
Neon database would produce exactly a swing in both the pass count and the
total count (a timed-out `beforeAll` can skip every `test` in its
`describe`, not just fail one), and this branch adds three more
`DEV_DB_URL`-reading test files to that same contention surface (follow-up
#53's list, now eleven files deep). Recorded here rather than folded into
#53 because it is a distinct symptom (count instability, not a single named
test's timeout) and because "not reproduced" is worth keeping separate from
"reproduced and diagnosed."

**Trigger:** the next time this reappears with enough detail to name which
test file's hook timed out — or follow-up #53's move to an isolated
database, which would make this unreproducible by construction rather than
merely unreproduced.

---

## 61. `service-name-reader.adapter.test.ts`'s comment overclaims what its primary test proves

The test "resolves the service's own source_locale translation over a
competing, alphabetically-earlier one" carries the comment: `"Corte de
Cabelo" only comes back if the join actually matches on source_locale` — but
it does not only come back then. `DrizzleServiceNameReader.findNameById`'s
primary query is `service` inner-joined to `serviceTranslation` on *two*
predicates (`serviceId` and `locale = service.sourceLocale`) with `limit 1`.
Deleting the second predicate leaves a join on `serviceId` alone, still
`limit 1`, against a fixture where the `pt-MZ` ("Corte de Cabelo") row was
inserted before the competing `de-DE` ("Haarschnitt (errado)") row — and
Postgres returned the `pt-MZ` row first anyway, by heap/insertion order, with
no `source_locale` predicate doing any of the work. The primary test stayed
green under that mutation.

This is not a hole in coverage — the fixture is exactly the right shape (a
real `source_locale` row plus a competing, alphabetically-earlier one), and
the test *does* catch every mutation a real bug would plausibly take
(swapping the join predicate for a different column, dropping the `and(...)`
to only the locale check, reordering the fallback). It caught 3/4 mutations
tried against it, including the realistic ones. It is a chance pass on one
specific, unrealistic mutation (deleting a predicate without also changing
insertion order) — the comment states a stronger guarantee ("only comes back
if") than the test can currently back up.

**Trigger:** the next time this file is touched — at that point either add
`orderBy` or a third competing row inserted in the *opposite* order (`de-DE`
before `pt-MZ`) so the join predicate is the only thing separating the two
outcomes, or soften the comment to say what is actually proven.

---

## ~~62. The catalogue search test asks for one page and asserts on all of it~~ — RESOLVED 2026-08-28

Fixed on `fix/db-test-isolation` (`abefb87`). The helper now passes the run's own
`categoryCode` — unique per run — into `listPublished`, so the rows the query chooses
between *are* the fixtures. Filtering the page afterwards could never have worked: the
seeded rows were not in the page to be filtered. `limit` stays 48 so the query keeps its
production shape.

The diagnosis recorded above was right about the mechanism and wrong about the scale.
Dev held 91 published services, not 72, and 74 of them were leaked test fixtures rather
than real data — two test files had been leaving rows behind since 12 August. Those 98
rows were purged on 2026-08-28, leaving 17 real published services.

Two sibling assertions in the same file failed for the same reason and are fixed with it.
Three further assertions there were vacuous — `not.toContain(englishOnly)`,
`search("CORTE") == search("corte")` and `toEqual(new Set())` all pass when the search
returns nothing at all — and now name the rows that must be present. Every test in the
file was proved to bite by mutation; `M4` (applying the text predicate when no term was
given) fails this test and no other.

---

## 63. `better_auth.user.phone_number` has a second writer

`BetterAuthIdentityAdapter` is the only place the user bounded context writes that column, and the
context is careful about it. But better-auth's own `phoneNumber` plugin is registered
(`better-auth.ts`), and its `send-otp` and `update` routes write the same column directly —
bypassing the adapter and leaving `ntizo_user.profile.phone_number` stale behind it.

This is unreachable today only because `requireSmsService()` throws when no SMS provider is
configured, which is every deployed stage. It goes live the day SMS is wired up, which is precisely
when the number starts mattering.

Options when that day comes: disable the plugin's own update route and route everything through the
adapter, or give the plugin an `after` hook that writes the profile too.

**Trigger:** the first commit that configures an SMS provider.

---

## 64. Two media routes have no behavioural test

`POST /api/media/:providerId/:kind` (provider logo and portfolio) and
`POST /api/media/category/:categoryId` have never had one. This surfaced while writing
`media-avatar.test.ts`, which is the only test file `apps/backend/api/src/media.ts` has ever had.
Both untested routes carry an authorization guard — `canWriteProviderMedia` and `isPlatformAdmin` —
and neither is exercised.

The avatar test is a working template: `mock.module` on the auth module, a fake R2 bucket, and
`app.request` against a freshly mounted `mountMedia`.

**Trigger:** the next change to either guard, or to the shared type and size checks all three
routes rely on.

---

## 65. A teammate's message cannot be named

`messageReadModel` (`packages/shared/src/read-models/system/communication/message.schema.ts`)
carries `senderUserId` and no name, so `ThreadView` (`thread-view.tsx`) can only distinguish "mine"
from "not mine" by an exact id match against the signed-in viewer — it has nothing to label a
colleague's bubble with. `provider-messages-page.tsx`'s own doc comment already names this: a second
staff member's earlier reply in the same thread renders as if it came from the customer rather than a
colleague. Invisible for a single-owner provider — the only shape this phase's e2e exercises — and
genuinely confusing the moment a workspace has more than one active member replying.

**Trigger:** the first provider with two active members using messaging.

---

## 66. The provider-audience new-message email links by provider id while the route matches on slug

`new-message.template.ts` builds its CTA as `` `${appBaseUrl()}/provider/${payload["providerId"]}/messages` ``
for a provider-audience recipient, but `/provider/$slug/messages` matches on `slug`, not `id`
(`routes/provider/$slug/route.tsx`). `useActiveProvider` (`use-active-provider.ts`) falls back to the
last-active provider in local storage, or the first one, whenever the URL's slug segment matches no
provider it knows about — which a raw provider id always does. So the link does not 404; it silently
lands a team member in *some* workspace, not necessarily the one the notification was about.

The two pre-existing provider-audience templates (`provider-verified.template.ts`,
`provider-documents-required.template.ts`) already share the weaker form of this problem — they link
to the generic `/provider` index, which resolves the same way, to whichever provider is "preferred,"
not necessarily the one the decision concerned — so fixing the new-message template's own sharper
bug properly means giving all three a real deep link, not patching one in isolation.

**Trigger:** the first owner of two or more providers who reports a notification email landing them
in the wrong workspace, or the next time any of the three provider-audience templates is touched.

---

## 67. `markNotified` commits before the deferred Resend call is confirmed

`NotifyUnreadInternalCommand` awaits `raiseNotification.execute(...)` and then calls
`this.messages.markNotified(...)` — but in production `raiseNotification`'s deliverer is a decorator
that *defers* the actual `DeliverNotificationInternalCommand` (and its Resend call) past that await,
per `RaiseNotificationInternalCommand`'s own doc comment ("this is a decorator that defers the real
work past the response"). `ResendEmailServiceAdapter.sendEmail` passes no `AbortSignal` to
`client.emails.send(...)`, so a send that hangs — an outage, a dropped connection — has nothing
bounding it. Because `markNotified` already ran, `claimDueForNotice`'s partial index
(`notify_due_at IS NOT NULL AND read_at IS NULL AND notified_at IS NULL`) will never select that
message again: the bell notification itself is safe (its row is written synchronously, before the
deferred part), but the *email* can be silently dropped with no retry. Inherited from the
notification context's existing deferred-delivery design, not introduced by messaging, and present
today on any path that raises a notification, cron-triggered or not.

**Trigger:** the first missing-email bug report for a delayed message notice, or the day this
delivery path is audited for retry guarantees.

---

## 68. `notifications/viewmodel/use-mark-read.ts` has no test at all

Unlike messaging's own `use-mark-read.ts` — which this same phase gave three assertions, including
one that spies on `invalidateQueries` and would fail if that call were deleted (see
`messaging/viewmodel/__tests__/use-mark-read.test.ts`) — the notifications feature's
`use-mark-read.ts` has no `__tests__` file at all. The page-level tests
(`notifications-page*.test.tsx`) exercise the UI around it but mock the hook away, so nothing asserts
that marking read actually calls `notificationMarkRead`/`notificationMarkProviderRead` with the right
field, or that it invalidates the `["notifications"]` prefix afterwards. Deleting the `invalidate`
call in that file would leave every existing test green.

**Trigger:** the next bug report about a notification's unread badge not clearing, or the next time
this file is touched for an unrelated reason.

---

## ~~69. `ServiceQuoteNotice` still disables "contact provider" behind a stale comment~~ — RESOLVED 2026-08-28

`ServiceQuoteNotice` now takes a `providerId` and renders the real `MessageProviderButton` in place
of the disabled button and the `packageContactClosed` sentence — the same control
`RailPriceSummary` and the provider page's own rail already mount. A quote service can be neither
booked nor scheduled, so this is the only action its page offers, which made the stale disabled
button more than cosmetic: the sentence beside it claimed messaging "isn't open on Ntizo yet" when
it had been open since this phase, the same defect class this whole spec exists to prevent, merely
inverted. `packageContactClosed` had no other consumer once this was the last place using it, so the
key is gone from all eight locale files.

The original entry is kept below for the record.

---

## 69. (original) `ServiceQuoteNotice` still disables "contact provider" behind a stale comment

It renders its "Falar com o prestador" / "contact provider" button `disabled`, unwired, with a
comment explaining why: "there is no Communication context in this product either"
(`service-quote-notice.tsx`). That premise is no longer true — this phase built the Communication
context, and `provider-rail.tsx`'s `MessageProviderButton` wires the identical CTA to
`useStartThread`. The button could work today; nobody has gone back to wire it up now that the
reason it was disabled no longer holds.

Half of this entry is now closed. `PackageChooser` carried the same disabled button and was deleted
in the detail-pages redesign; its replacement, `RailPriceSummary`, mounts the real
`MessageProviderButton` — so `ServiceQuoteNotice` is the last place in the product where this
control is a placeholder, and it is now conspicuous rather than consistent.

**Trigger:** the next time `ServiceQuoteNotice` is touched — wire the button the way
`RailPriceSummary` already does, or explain why a quote page shouldn't offer it.

---

## 70. No dedicated malformed-cursor boundary test under `read/communication`

`read/activity` has `cursor-invalid.graphql-code.test.ts`, a dedicated test proving
`CursorInvalidError` survives the GraphQL boundary with its own client-facing code, "created for
exactly this reason" per its own doc comment. `read/communication` throws the identical
`CursorInvalidError` from the identical shape of cursor decode (`thread.repository.ts`,
`message.repository.ts`) but has no equivalent file under `read/communication/__tests__/` — only
`projections.test.ts` and `queries.handlers.test.ts`, neither of which targets a malformed cursor at
the GraphQL-code boundary specifically.

**Trigger:** the next time `read/communication`'s handlers are touched, or the next regression a
malformed cursor would have caught.

---

## 71. Support threads, admin oversight and moderation are phases 2 and 3

Messaging today knows exactly one thread shape: a customer-to-provider `inquiry`
(`thread.schema.ts`'s partial unique index is scoped `where type = 'inquiry'`, anticipating others).
There is no support-thread type, no admin read path at all — `findVisible` admits only the customer
on the thread or a member of its provider, with no admin bypass — and so no moderation surface. Phase
3, whenever it arrives, owes an explicit decision this phase deliberately did not make: whether an
admin reading a private conversation for support or moderation purposes is logged, and whether the
participants are told.

**Trigger:** the start of phase 2 (support threads) or phase 3 (admin oversight and moderation)
design work.

---

## 72. Read receipts are not shown to the sender

`message.read_at` exists, reaches the wire (`messageReadModel.readAt`, `Message.readAt` in the
frontend's own domain type), and is what `countUnreadForViewer` uses to drive the unread badge — but
nothing renders it back to the person who *sent* the message. `ThreadView`'s `MessageBubble`
(`thread-view.tsx`) draws a body and a timestamp only; a sender has no way to tell whether the other
side has seen what they wrote.

**Trigger:** the first customer or provider who asks whether their message was read.

---

## ~~73. Attachments are not supported~~ — RESOLVED 2026-08-28

Communication now carries files: an `attachment` table (Task 1), a byte-sniffing type detector
shared by client and server rather than trusting `file.type` (Task 3), an R2-backed
`POST /api/communication/attachments` upload route and a session-authed, per-message
`GET /api/communication/attachments/:id` download route (Task 5), a read model that returns
`attachments: []` (never omitted) on every message (Task 6), and the `communicationSend` mutation's
`attachments: [{ storageKey, fileName }]` input, with the server reading the real type and size back
from storage rather than trusting either off the wire (Task 6/6b). A caption-less photo is legal —
`Message.compose`'s "something in it, not necessarily words" rule, dead until Task 6b removed the
frontend's own `.min(1)` on the body field.

Proven end to end, not just unit-tested, by `apps/e2e/tests/attachments.spec.ts` (Task 8): a real PDF
uploaded by one signed-in browser rides a real `communicationSend` mutation and comes back down
byte-for-byte to a second, independently signed-in browser on the other side of the conversation; a
third, real, persisted user who is neither the customer nor a provider member gets the identical
403 a nonexistent attachment id gets; and a photo with no caption sends on its own. See that file's own
doc comment for the one claim none of Tasks 1–7 could exercise — `runWithAttachmentsBucket`'s
`AsyncLocalStorage` scope in `apps/backend/api/src/graphql/private.ts:175` — and how this suite closes it.

The original entry is kept below for the record.

---

## 73. (original) Attachments are not supported

`message.body` is `text` and nothing else — no column, no upload path, no rendering for anything but
plain text. A conversation that would be answered fastest with a photo (a leaking pipe, a haircut
reference, a broken part) has no way to include one.

**Trigger:** the first request to send a photo or document through a conversation.

---

## 74. The bell waits up to two minutes along with the email, because one rule covers both channels

`NOTIFY_AFTER_MS = 120_000` (`message.aggregate.ts`) delays the *entire* notice — `NotifyUnreadInternalCommand`
raises one `NotificationType.NewMessage` per unread message past the window, and that single raise is
what produces both the in-app bell row and the deferred email. There is no separate, faster path for
the bell alone; a recipient with the tab open still waits out the same two minutes a recipient who
only checks email would need.

**Trigger:** the first request to make the in-app bell notify sooner than the email does.

---

## 75. Per-person unread counts for a multi-staff provider would need a participant table

`MessageRepositoryPort.markReadForViewer` marks every unread message in a thread read for the whole
provider team, not just the signed-in viewer who opened it — reading is a shared act, by design, per
that port's own doc comment. A provider with several active members therefore cannot tell which of
them has actually seen a given conversation; the unread count `ThreadList` renders is the workspace's,
not any one person's. Getting a per-person count would mean a participant/read-cursor table this
phase's schema does not have.

**Trigger:** the first multi-staff provider workspace that asks who on the team has already read a
message.

---

## 76. The `/providers/$slug` SSR loader occasionally cancels under full-suite concurrent load

Once while developing this task's own e2e spec, a full `bun run e2e` (21 tests, 7 workers) failed
`messaging.spec.ts`'s stranger test with the app's own error boundary — "Something went wrong! /
CancelledError" — where the "Send message" button should have been. The web server's own log
explained it: `` A query that was dehydrated as pending ended up rejecting. [["public","provider","msg-e2e-stranger-…","en-US"]]: Error: CancelledError ``.
`prefetchProviderDetail`'s dehydrated query was cancelled server-side before the page could render —
not a bug in this test's own logic (the identical navigation passed cleanly in two other full runs
and every solo run of the same file), and not reproduced by any other spec that also visits
`/providers/$slug` (`public-directory.spec.ts` seeds its rows in a serial `beforeAll`, so it never
hits that route at the same moment 7 workers all start cold). This is the same shape of thing
`playwright.config.ts`'s `retries: process.env.CI ? 2 : 0` already exists to absorb, and did not
reproduce on a retry in this investigation — filed rather than chased, since a single occurrence
across roughly a dozen full-suite runs gives nothing to `git bisect` yet.

**Trigger:** the next time this specific `CancelledError` shape shows up in a CI run, or any other
spec that hits `/providers/$slug` (or another `ssr: true` route) starts flaking the same way.

---

## 77. `useAllCategories` has no callers left

`features/landing/viewmodel/use-categories.ts` exports two hooks. `useCategoryPreview(limit)` is used
by the home page and, since the listings redesign, by both browse pages' category rails.
`useAllCategories` — the `useInfiniteQuery` one — had exactly one caller, the old `/providers`
directory page, and lost it when that page was rebuilt on the shared browse shells and moved to
`useCategoryPreview(24)` like its twin. Nothing in `src/` references it now.

Left in place rather than deleted with the page: an unused export is not a lint error here, it was
outside that task's scope, and `categoryQueries.all` behind it is a real paged query that a
"browse every category" screen would want back. Deleting it means deleting that query definition too,
or leaving a repository method with no viewmodel.

**Trigger:** the next time someone touches `use-categories.ts` or `category.repository.ts` — delete it
then if no such screen has appeared, or wire it up if one has.

---

## 78. `Sheet` is called a dialog but is not modal, and the bottom nav paints over its backdrop

`packages/frontend/src/components/sheet.tsx` is a deliberately minimal primitive: `SheetContent`
renders a `z-40` backdrop and a `z-50` fixed panel, and that is all. There is **no focus trap, no
Escape handler, no focus move on open, no focus restore on close and no `inert`/`aria-hidden` on the
background.** Tab from the last control in a sheet lands on the page underneath it.

The three browse sheets (`MobileSearchSheet`, `MobileFilterBar`, `MobileDirectoryFilterBar`) carry
`role="dialog"` + `aria-labelledby`, which they earn — the primitive draws a bare div, so without
them a screen reader gets the fields with no boundary and no name. They deliberately do **not** carry
`aria-modal="true"`, which was dropped in task 21's review: `aria-modal` asserts that everything
outside the node is inert, and a false claim of modality is strictly worse than no claim, because it
tells assistive tech to ignore exactly the controls keyboard focus is about to land on.
`features/provider/availability/ui/rule-drawer.tsx` still carries `aria-modal="true"` over the same
primitive and has the same problem.

Second, smaller defect in the same primitive: the backdrop is `z-40`, and `MobileNav`
(`shared/components/mobile-nav.tsx`) is also `z-40` and later in the DOM — `__root.tsx` renders it
after the page content. Equal z-index resolves on tree order, so below `md` the bottom nav paints
**over** the sheet's backdrop and stays tappable behind a sheet short enough not to cover it. A
reader can navigate away from underneath an open dialog.

The fix is one of two, not both: give `Sheet` real modality (focus trap, Escape, focus restore,
background `inert`, and a backdrop above every fixed chrome the app has), and then put `aria-modal`
back everywhere; or accept it as a non-modal disclosure panel and stop the `role="dialog"` too. It
was left alone here because it is a shared primitive with callers outside this branch, and changing
its focus behaviour is not a thing to do inside a listings redesign.

**Trigger:** the first keyboard or screen-reader accessibility pass on the customer app, or the first
report of the bottom nav being tappable behind an open sheet — whichever comes first. Also urgent if
a fourth caller adopts `Sheet` for anything the user must not be able to escape from mid-flow
(a payment confirmation, a destructive confirm).

---

## 79. The provider repository's own `verified` join has no test guarding its `SELECT DISTINCT`

`DrizzleProviderPublicRepository.aggregates().verified`
(`public/provider/infra/repositories/drizzle/provider-public.repository.ts:100-104`) caps a
business with several accepted documents at one row with `selectDistinct` on `providerId` —
the same invariant task 22 added an SQL-shape test for on its own copy,
`verifiedAggregate` in `bounded-contexts/catalog/infrastructure/repositories/drizzle/
service-read.repository.ts` (`__tests__/service-read.repository.test.ts`, "caps the verified
join at one row per provider with SELECT DISTINCT"). The original is still unguarded: nothing
asserts its `SELECT DISTINCT` either, and it is true only by construction, the same way the
copy was before that test existed.

Left alone rather than fixed alongside the copy: `public/provider` is a different bounded
context from `bounded-contexts/catalog`, and reaching into it was explicitly out of scope for
that task.

**Trigger:** somebody simplifying `selectDistinct` away on `aggregates().verified` (it looks
redundant next to the `groupBy`-based `reviews`/`services`/`prices` aggregates in the same
function, and is not), or the first business that legitimately accumulates a second accepted
document and a directory card's service count looks doubled.

---

## 80. `DropdownMenuItem` spreads `{...props}` after its own `onClick`, so a caller's handler replaces it

`packages/frontend/src/components/dropdown-menu.tsx` (`DropdownMenuItem`) writes its `onClick`
and then spreads the rest of the props over it:

```tsx
onClick={(e) => { if (disabled) return; props.onClick?.(e); onSelect?.(); ctx.setOpen(false); … }}
{...props}
```

`props` still carries `onClick`, so a caller that passes one wins the attribute outright. The
row would run the caller's handler and nothing else: `onSelect` never fires, the menu never
closes, and — since the keyboard work landed — focus is never handed back to the trigger
either, leaving a keyboard reader on `<body>` over a menu that is still open. The bug is
invisible today because the spread's own `props.onClick?.(e)` call reads like it covers the
case, and because Enter and Space go through `.click()`, so the keyboard fails in exactly the
same way as the pointer rather than differently.

Left alone rather than fixed: the spread has to stay last for `role` and `aria-checked` to be
overridable — the sort control's `menuitemradio` rows depend on it — so the fix is to
destructure `onClick` out alongside `className`/`onSelect`/`disabled` rather than to reorder,
and that is a change to a shared primitive's prop handling that belongs with a task about its
props, not with one about its keys. All eight call sites were checked: none passes `onClick`.

**Trigger:** the first caller that passes `onClick` to `DropdownMenuItem` — most likely
someone wanting `event.preventDefault()` or a stopPropagation on a row, or a row that is a
link and wants to intercept the navigation. Also worth doing pre-emptively the next time
anything else in this component's props is touched.

---

## 81. Attachment contents are not inspected

A photograph of a business card, or a number written on paper, passes every check this feature
makes — `sniffContentType` decides *format*, never *content*. Catching it needs OCR on every upload:
slow, costly, and still avoidable by a photo taken at a slight angle or with the digits rearranged in
the caption.

**Trigger:** the first time a provider is found routing contacts through photographs.

---

## 82. No virus scanning

R2 stores exactly what it is given. `sniffContentType` only narrows the stored `content-type` to one
of four formats; nothing inspects a JPEG, PNG, WEBP or PDF for an embedded payload before it is
written to the bucket or served back to the other side of the conversation.

**Trigger:** the first accepted file type that can execute on a recipient's machine, or the first report.

---

## 83. `media.ts` still trusts `file.type`

The avatar, category and provider-media routes (`apps/backend/api/src/media.ts`) decide a file's
type from the value the uploader's browser declared, not from its bytes — the exact bypass
`sniffContentType` (Task 3) and this feature's own upload route (Task 5) exist to close for
attachments. `media.ts` was left alone; only the new endpoint got the fix.

**Trigger:** the next change to any of those three routes.

---

## 84. Orphaned R2 objects are never swept

An upload that succeeds while its message write fails — or one a customer picks, then removes before
hitting send — leaves a file in the bucket nothing ever references again (`attachments.ts`'s own doc
comment: "this order leaves, at worst, a sweepable orphan"). Nothing sweeps it. `apps/e2e/tests/
attachments.spec.ts` has to delete its own test objects for exactly this reason — see that file's own
`deleteR2ObjectLocal` — because production has no equivalent.

**Trigger:** the first storage bill that looks wrong, or a sweep becoming cheap to write.

---

## 85. Contact detection is refused without an alternative

Until on-platform payment exists there is nothing to offer somebody who wants to arrange things off
it — `hasContact` (shared by the composer, the file-name check, and the upload route) blocks the
attempt and explains why, but the "why" is a permanent inconvenience with no other path offered.

**Trigger:** the payment step landing — the copy should change the same day.

---

## 86. `scheduled.test.ts` cannot run in every worktree, and its own doc comment is now wrong about why that's safe

`apps/backend/api/.env` does not exist in this worktree (`feat/message-attachments`, this task's
own), so `scheduled.test.ts` — which drives the real notification sweep cron against a real database —
has no connection string to run against and cannot be executed here at all, not merely skipped. Its
own message calls the messaging tables it reads "the real (empty) messaging tables." That was true
when it was written; it is not true any more. This branch's own work (`apps/e2e/tests/messaging.spec.ts`,
`attachments.spec.ts`, and any manual testing before Task 8) writes and — mostly — cleans up rows in
those same tables through the real dev database this test would run against, so "empty" is now an
assumption the test's own comment states as fact rather than something this worktree can verify. This
is not a regression in the test; it is a `.env`-gated test whose own justification has drifted out
from under it in a worktree nobody has pointed at real credentials.

**Trigger:** the day someone runs `scheduled.test.ts` from a worktree with a real `.env` and it is not
actually empty — or the next time this comment is read and taken at face value.

---

## 87. `useSendMessage` fires and forgets, and a test (or a user navigating away) can outrun it

Not a backend bug — logged here because chasing it looked exactly like one for a while, and the
shape is worth knowing about. `MessageComposer.handleSubmit` calls `onSend(...)` (→ `useSendMessage`'s
`mutation.mutate(...)`, TanStack Query's non-blocking form, never `mutateAsync`) and then
unconditionally clears local state — no `await` on the mutation itself. While building this task's
"photo with no caption" test, an assertion right after clicking Send —
`getByRole("button", { name: fileName })` with no `exact: true` — passed instantly for the wrong
reason: `AttachmentPicker`'s own "Remove {fileName}" button (still on screen for the brief window
before `reset()` clears it) contains `fileName` as a substring, and Playwright's default string
matching is substring-based. The test read that as "the message arrived," queried the database
immediately, found nothing (the real mutation was still in flight), failed, and ran its `finally`
cleanup — which deleted the thread, provider and users while the original `communicationSend` request
was still on the wire. By the time it actually reached `SendMessageCommand.execute`, `findVisible`
correctly found nothing, because by then there genuinely was nothing: this test had deleted it out
from under its own still-pending request. That is what produced a real, server-logged
`ThreadNotVisibleError` — not a concurrency bug in `findVisible`, `tx-context.ts`, or the session
layer; a self-inflicted race, fixed by asserting on the exact post-send element
(`{ name: fileName, exact: true }`, which only `attachment-list.tsx`'s post-send item matches) so the
test genuinely waits for the mutation before doing anything else. Confirmed clean across multiple full
runs after the fix. Filed anyway because the general shape — nothing here awaits the send, so a fast
enough navigation-away or a fast enough test assertion can outrun it — is real, even though this
task's own instance of hitting it was self-inflicted.

**Trigger:** the next Playwright assertion in this feature that matches on a bare file name or message
body without `exact: true`, or a real user report of a send that looked like it worked and did not.

---

## 88. What `attachments.spec.ts` does not prove

Two tests, chosen for what would actually catch something over restating unit coverage (see that
file's own doc comment) — which leaves real gaps a reader of this task's report should know about
rather than assume are covered:

- **The download route's own request handling is never exercised by the `AsyncLocalStorage` claim.**
  `GET /api/communication/attachments/:id` reads `c.env.ATTACHMENTS_BUCKET` directly (it is a plain
  Hono handler, not behind Yoga), so it needs no `runWithAttachmentsBucket` scope and proves nothing
  about it either way. Only the send leg (`communicationSend`, over `/graphql`) exercises that scope —
  see entry 73's resolution above for exactly how.
- **No provider-side upload.** Every attachment in this suite is uploaded by the customer; the
  mutation and the upload route apply identically regardless of sender role (nothing in
  `SendMessageCommand` or `attachments.ts` branches on it), but nothing here drives a provider
  attaching a file to a reply.
- **`MAX_ATTACHMENTS` (5), `TOO_LARGE` (413), `UNACCEPTED_TYPE` (415), and `CONTACT_IN_FILE_NAME`
  (422) are unit-tested, not e2e'd.** This suite only ever sends files that succeed.
- **Only Chromium.** `playwright.config.ts` runs one browser project; this task adds no new one.
- **R2 cleanup depends on a hardcoded bucket name** (`ATTACHMENTS_BUCKET_NAME` in the spec file,
  copied from `wrangler.jsonc`'s top-level `r2_buckets` entry) and shells out to the `wrangler` CLI
  against local, file-persisted storage — best-effort, and silently logged rather than failing the
  test if it ever falls out of sync with that config.

**Trigger:** the next time any of these paths is the one actually suspected of breaking, or this spec
file is extended.

---

## 89. The qa and prod attachment buckets do not exist

`apps/backend/api/wrangler.jsonc` binds `ATTACHMENTS_BUCKET` in all four environments, but only
`ntizo-attachments-dev` was created (by hand, at deploy time — the account had none). `-local`,
`-qa` and `-prod` are still missing. A `wrangler deploy --env qa` or `--env prod` fails at binding
time, before any code runs, with no partial deploy to clean up.

The local one matters separately: without it, `wrangler dev` answers 503 to every upload, which is
the configured-not-broken path the route was written for — correct behaviour, confusing symptom.

**Trigger:** the next deploy to qa or prod, or the first time somebody runs the API locally and
finds uploads answering 503.

---

## 90. The `Dialog` primitive is not a dialog

`packages/frontend/src/components/dialog.tsx`'s `DialogContent` renders two bare `div`s. It has no
`role="dialog"`, no `aria-modal`, no focus trap, no focus restoration, and **no Escape handler** —
the only thing that closes it is a click on the backdrop.

Every modal surface in the app inherits this: `mobile-search-sheet.tsx`, `provider-facets.tsx`,
`service-facets.tsx`, `rule-drawer.tsx`, `availability-sheet.tsx`, and now
`detail-gallery.tsx`. Each of them independently supplies its own `role="dialog"` and
`aria-labelledby` to paper over it, which is six copies of a fix that belongs in one place — and
six chances for the seventh consumer to forget.

**What is not broken:** these components are still operable without a mouse, because each supplies
its own focusable close button. A keyboard user is not trapped; they are made to Tab to a control
that Escape should have handled.

**Why it was not fixed here:** it surfaced during Task 7 of the detail-pages redesign, whose diff
touches none of the other five consumers. Changing a primitive with that blast radius would have put
an unreviewed behaviour change under five screens nobody was reviewing that day — and a focus trap
is behaviour, not decoration: it changes what Tab does on every one of them.

**Trigger:** the next accessibility pass, the next keyboard-navigation bug filed against any modal,
or the next component that needs a dialog — at which point it is a seventh copy of the workaround,
and the argument for fixing the primitive has beaten the argument against it.

---

## 91. What the detail-pages redesign deferred

The whole-branch review triaged each of these as a follow-up rather than a merge blocker, with
the reason. Recorded here because the branch's own working notes are deleted once it merges.

**Dead code behind a live export.** `features/directory/services/ui/service-card.tsx` has had no
consumer for its `ServiceCard` export since the browse moved to `ServiceListingCard` — before this
branch. The same file still exports `ServicePrice`, which `availability/ui/availability-sheet.tsx`
imports, so removing it means extracting that first. **Trigger:** the next change to either symbol.

**The browse card still says "Book".** `service-listing-card.tsx` labels its CTA `packageBook` on a
`<Link>` into a page that states, in words, that bookings are not open. The detail pages were
scrubbed of that word; the front door was out of scope. It is asserted by name in that card's own
test, so it is a two-file change. **Trigger:** the next honesty pass, or the first customer who asks
why "Book" does not book.

**Two prices, two spellings, one click apart.** `rail-price-summary.tsx`'s headline keeps
`formatAmount`'s decimals while `ProviderRail`'s headline and `ServiceRow`'s price use
`formatHeadlinePrice`'s whole units. Deliberate — the comment at that line records the trade and its
cost — because rounding it would show two spellings of one amount inside a single card. **Trigger:**
a decision that cross-page consistency matters more, or a redesign that separates the headline from
the breakdown.

**`memberSince` is pinned to UTC.** `provider-public.repository.ts` derives it with
`toISOString().slice(0, 7)`, so a business registered between midnight and 02:00 on the 1st in Maputo
publishes the previous month. Wrong by one month, on a fact whose whole purpose is telling a
five-year business from a five-week one. **Trigger:** the next change to `toDTO`.

**Coverage the redesign did not add.** The rail's fixed-duration label is unasserted (only the hourly
branch is covered); `ServiceRow`'s `from` and `unavailable` price branches are untested; and the
spec asked for the e2e provider journey to assert the rail's price and the availability card, which
was not done. That last one matters more than coverage arithmetic suggests: this work added a second
awaited GraphQL query to `/services/$id`'s SSR loader, and `apps/e2e/tests/public-directory.spec.ts`
exists because a routing bug once made every detail URL render the wrong thing with JavaScript
disabled. **Trigger:** the next SSR or routing change to either detail route.

**Test guards weaker than they look.** `flattenToDottedPaths` in the locale parity test treats `{}`
identically to an absent key, so two content-empty sides compare equal. And
`member-since.test.ts`'s UTC-vs-local regression test cannot fail on a runner whose timezone has a
non-negative offset — `vite.config.ts` pins no `TZ` and CI is almost certainly UTC, so a test named
for catching a timezone bug cannot catch it there. **Trigger:** either, the next time a date or a
locale bug is suspected.

**Keyboard behaviour carried across unchanged.** The service options radiogroup duplicates its own
`h2` as an `aria-label` and has no roving `tabIndex` or arrow-key handling — inherited verbatim from
the deleted `PackageChooser`, and now a full-width body control rather than a rail detail. Every
radio is individually tabbable and `aria-checked` is correct, so it is operable, just not
APG-conformant. **Trigger:** pair it with #90, the `Dialog` primitive's missing focus trap.

## #92 — The backend's hexagonal layering is enforced by nobody

`eslint-plugin-boundaries` is configured only in `apps/frontend/web/eslint.config.js`.
`packages/backend/eslint.config.js` extends `packages/tooling/eslint-config/base.js`, and neither
carries a `boundaries` or `no-restricted-imports` rule. So the rule that `domain/` imports nothing
from `app/` or `infrastructure/` — the architectural premise of every bounded context here — holds
only because people keep remembering it. This was believed otherwise for a long time: six
subagent dispatches during the Booking work asserted the rule was enforced, and an implementer
checking with `eslint --debug` is what settled it.

Turning it on is not a config edit. The domain already imports `BookingStatus` from
`shared/infrastructure/database/booking/enums.ts` — a path with `infrastructure` in it — and
Review's and Communication's aggregates do the identical thing, so the rule would light up existing
code in several contexts on the first run. The work is deciding whether those imports are the
violation or the enum's location is, then moving one or the other.

**Trigger:** the next time a layering violation is found in review, or before a new bounded context
is started — a rule that would have caught it is cheaper than another reviewer reading import lists
by hand.

## #93 — Nothing sets how long an unpaid booking holds its slot — CLOSED, see Task 13

**Closed 2026-08-30.** Raised as a follow-up, then answered the same day: the payment window
becomes a LIVE `platform_settings` column with a default of 15 minutes, and `CreateBookingCommand`
reads it rather than carrying a constant. Task 13 of the booking-core plan. The original text
follows, because the reasoning is still why the number is not a developer's to pick.

## #93 — Nothing sets how long an unpaid booking holds its slot

`CreateBookingCommand` carries `PENDING_PAYMENT_WINDOW_MINUTES = 30` as a named, commented
stand-in. The booking spec deliberately does not set the window and says it must be a configured
value; it also warns that the 30 minutes its own mockup shows is wrong for M-Pesa, whose C2B flow
is synchronous — the customer approves on the handset in a minute or two, not half an hour.

The number is a product decision with a real cost on each side: too long and an abandoned checkout
blocks a member's calendar for half an hour; too short and a customer who fumbles the PIN loses the
slot they were paying for. It belongs in `platform_settings` beside `default_commission_bps`, not
in a constant.

**Trigger:** before the first real M-Pesa payment runs end to end, or the first time a provider asks
why a slot showed as taken with no booking behind it.

## #94 — This plan books fixed-price options only

`CreateBookingCommand` refuses an `hourly` option with `ServiceNotBookableError("hourly")`.
`Booking.create` needs a `durationMinutes` and an hourly option has none by construction: the
customer picks a length within a minimum and a step, and the price follows from that choice. That
is a second pricing rule with its own arithmetic and rounding, and no task in the booking-core plan
contains a line of it.

The MVP scope names hourly as booking path B, so this is a missing feature rather than a deliberate
product boundary. The refusal message says so and does not imply the provider did anything wrong.

**Trigger:** the first provider who publishes an hourly service and finds nobody can book it.
