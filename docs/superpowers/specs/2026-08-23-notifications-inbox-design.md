# Notifications — the in-app inbox and email delivery

**Date:** 2026-08-23
**Status:** design, approved in outline — awaiting spec review
**Reference project:** `/Users/saliffaustino/Desktop/Salif/Projects/funouts-workspace/doazores`

## Why

The bell in the header does nothing. `header-actions.tsx` says so in a comment
— *"Inert until notifications exist"* — and `/account/notifications` redirects
to `/account/preferences`, where a grid of notification switches renders with
every checkbox `disabled` under a banner admitting there is nowhere to store a
preference and nothing that sends anything.

Meanwhile three emails do send — verification, password reset, team invitation
— with no record that they were sent, no handling of a bounce, and no
suppression list. Nothing can answer *"did the invitation arrive?"*, and a
bounced address is retried forever at the cost of the sender reputation of a
domain that has not launched yet.

So the platform has a complete notification *vocabulary* in `@ntizo/shared` —
32 types, four buckets, four channels, all reasoned — and neither an inbox to
read them in nor an audited way to post them. This builds both.

## Scope

**In:** the in-app inbox for two audiences (personal and workspace), and email
delivery with a per-attempt record, per-locale templates, a suppression list
and a bounce webhook.

**Out:** SMS and push. Notification preferences. Unsubscribe. Digests. An admin
queue. The outbox relay.

### SMS is out, by decision

Delivery is by email. SMS is not built, and the two things that follow are
changes to existing code rather than omissions:

- There is no SMS adapter in the repository at all — only
  `ConsoleSmsServiceAdapter`. Nothing has ever left the machine.
- `/account/preferences` renders an **SMS column** with a "costs money" note.
  It must stop promising a channel the platform will not have.
  `OPTIONAL_NOTIFICATION_CHANNELS` narrows to `Email` and `Push`, and `Push` is
  labelled unavailable — it has no adapter either, and pretending otherwise is
  the same fault in a different column.

`NotificationChannel.Sms` and `isMeteredChannel` stay in the enum. Removing
them would be a wider edit than this slice earns, and the metered-channel rule
is right whenever SMS returns.

**Phone verification is not affected, and must not be.** It uses an SMS OTP to
bind a phone to payments — decided 2026-04-13 — and payment in Mozambique is
M-Pesa and e-Mola, which *are* the phone. An OTP delivered by email verifies no
phone, and a phone nobody verified is a payment account nobody owns. That flow
keeps its own path; this document does not touch it.

It does, however, record what it found: **there is no SMS adapter in the
repository**, only a console one, so no OTP has ever left a machine. Deciding
that notifications go by email does not soften that — it isolates it. SMS is now
needed by exactly one flow, and that flow is the one that takes money. Raised as
a follow-up below rather than folded in here, because an OTP adapter belongs to
the payment slice that depends on it and not to an inbox.

### Why not the rest of doazores

Its `notifications` context is roughly 250 files. Most of the 32 types are
raised by Booking, Payment and Communication — three contexts that **do not
exist in Ntizo**. Porting the machinery for them now would build a sorting
office for post nobody sends.

| From doazores | Verdict |
|---|---|
| Two inbox scopes, personal and workspace | **Take** |
| Per-member read state | **Take.** One notification, many readers |
| Delivery as its own record with a status | **Take** |
| Email suppression + provider bounce webhook | **Take** |
| Deliveries addressed to an email, not only to an account | **Take** — an invitee has no account |
| `write/<bc>/events/handlers/*.event-handler.ts` shape | **Take.** Already Ntizo's target layout, unused |
| Snapshot payload rather than read-time resolution | Take |
| react-email templates with golden files | **Leave.** Ntizo's own pattern is better here — see Templates |
| Cloudflare Queues, cron sweeps, retry | **Leave.** `wrangler.jsonc` declares neither, and deploys are gated |
| Guest-delivery claiming after registration | **Leave.** Record the delivery; do not backfill an inbox |
| PDF attachments, vouchers, unsubscribe tokens | **Leave.** No such concepts here |
| Admin notification queue | **Leave.** A third audience; not this slice |

## Decisions

| Topic | Decision |
|---|---|
| Audiences | Personal and workspace. Not admin |
| Channel | Email only |
| Dispatch | In-process after commit, via the existing `runAfterCommit` |
| Sending | Inside `ctx.waitUntil`, off the response path |
| Outbox | Still written. Not yet read — the relay stays deferred |
| Read state | Its own table, keyed `(notification_id, user_id)` |
| Payload | Snapshot at raise time |
| Templates | Ntizo's existing per-locale `Copy` table, not react-email |
| Retry | None. A failure is recorded and left |
| Live updates | Polling via `refetchInterval`. No websockets |
| User BC events | **In scope** — added so `Welcome` has a producer |

## Data model

Four tables in a new `ntizo_notification` schema.

```
notification                         -- an item in somebody's inbox
  id           uuid        pk
  type         text        not null  -- NotificationType
  audience     text        not null  -- 'user' | 'provider'
  user_id      uuid        null      -- set iff audience = 'user'
  provider_id  uuid        null      -- set iff audience = 'provider'
  payload      jsonb       not null
  created_at   timestamptz not null
  CHECK (num_nonnulls(user_id, provider_id) = 1)

notification_read                    -- who has read what
  notification_id uuid        not null
  user_id         uuid        not null
  read_at         timestamptz not null
  PRIMARY KEY (notification_id, user_id)

notification_delivery                -- one outbound attempt
  id                  uuid        pk
  notification_id     uuid        null   -- null when there is no inbox item
  type                text        not null
  channel             text        not null  -- 'EMAIL'
  to_email            text        not null
  locale              text        not null
  status              text        not null  -- 'queued' | 'sent' | 'failed' | 'suppressed'
  provider_message_id text        null
  error               text        null
  created_at          timestamptz not null
  updated_at          timestamptz not null

email_suppression                    -- addresses we must stop writing to
  email        text        pk
  reason       text        not null  -- 'bounce' | 'complaint'
  suppressed_at timestamptz not null
  detail       jsonb       null
```

**A delivery is not a notification.** They are separated because a team
invitation goes to somebody who has no account: there is no `user_id` to
address an inbox row to, but there is certainly an email to send. So
`notification_id` is nullable, and a delivery carries its own `type` and
`locale` so it can be rendered without one. doazores solves the same problem by
letting a stranger *claim* their deliveries on registration; that mechanism is
left out, and the consequence is stated plainly — an invitee who later registers
will not find the invitation in their new inbox. They were sent an email, and
that is the record.

**Read state is a table, not a column.** A workspace notification is read by
each member independently. A `read_at` column would report that the whole
business had read something the moment one member opened it.

**The payload is a snapshot.** *"Salão X has been verified"* must still say X
after X is renamed, deactivated or deleted. Resolving names at read time makes
an inbox that rewrites its own history and joins each row to the lifetime of
everything it mentions. This is the `BookingSnapshot` lesson from funouts,
applied before it has to be learned again.

**The CHECK is not decoration.** `audience` and the two nullable columns can
disagree, and a row where they do is addressed to nobody or to two parties.
`num_nonnulls` makes that unrepresentable rather than discouraged.

**The delivery row is written before the attempt, not after.** Suppression is
checked first: a suppressed address writes one row at `'suppressed'` and stops.
Otherwise the row is written at `'queued'`, the send is attempted, and the row
moves to `'sent'` or `'failed'`. Writing only after the attempt would mean an
isolate that dies mid-send leaves no trace of an email that may well have gone
out — which is the exact case the audit exists for. A row stuck at `'queued'`
is a visible, queryable symptom; no row at all is not.

**Suppression is keyed by the address itself**, not by a surrogate id. There is
exactly one answer to "may we write to this address", the question is always
asked by address, and a unique index over a surrogate key is the same thing with
an extra hop.

**Foreign keys cross schemas, as they already do here.**
`ntizo_provider.provider_member.user_id` references `ntizo_user.user.id` today,
so the same holds: `notification.user_id` and `notification_read.user_id`
reference `ntizo_user.user`, and `notification.provider_id` references
`ntizo_provider.provider`. `notification_read.notification_id` cascades on
delete. `notification_delivery.notification_id` does **not** — a delivery is an
audit record of something that actually left the building, and it must outlive
the inbox item it was about.

## Backend structure

Follows the tier split the architecture spec already mandates.

```
bounded-contexts/notification/
  domain/aggregates/{notification,notification-delivery,email-suppression}.aggregate.ts
  domain/value-objects/, domain/exceptions/
  app/ports/inbound/{raise-notification.internal, mark-read, mark-all-read,
                     handle-resend-webhook.internal}
  app/ports/outbound/{notification, notification-read, notification-delivery,
                      email-suppression}.repository.port.ts
  app/ports/outbound/{user-locale-reader, provider-member-reader}.port.ts
  app/use-cases/
  infrastructure/repositories/drizzle/
  infrastructure/outbound-adapters/cross-bc/
  infrastructure/templates/
  bootstrap/

read/notification/     four projections — list and unread count, per audience
write/notification/
  graphql/             four mutations
  events/handlers/     *.event-handler.ts, the doazores shape
  http/                the Resend webhook route
```

`write/<bc>/events/` and `write/<bc>/http/` both appear in
`2026-08-07-doazores-pattern-adoption-design.md` as part of the target layout
and neither has ever had an occupant. This slice is the first for both.

## The dispatch

The producing use case commits as it does today — the aggregate records events
and the command calls `outboxPort.publish(agg.pullEvents(), "<bc>")` inside
`unitOfWork.atomicExecute`. Nothing about that changes.

After that transaction commits, `runAfterCommit` hands the same events to an
in-process router, which looks each one up in a registry of handlers. A handler
calls `raiseNotification`, which writes the inbox row and then queues the email.

**Why after commit rather than inside the transaction.** A notification about a
write that rolled back is a lie, and an email about one cannot be recalled at
all. This is exactly what `runAfterCommit` was built for — follow-up #9 names
its trigger as *"the next side-effect that must not fire on a rolled-back
write"*, and it has sat unused since Phase 3A.

**Why in-process rather than a relay.** doazores drives this with Cloudflare
Queues and four cron triggers. Ntizo's `wrangler.jsonc` declares neither,
deploys are gated off, and a deployed Worker cannot yet reach Postgres at all.
Building the relay would mean provisioning infrastructure that cannot run.

**Why the BC boundary survives it.** The registry is wired in
`apps/backend/api/src/bootstrap.ts`, where every other adapter is chosen. The
Provider BC never imports the Notification BC; it publishes events and does not
know who listens.

**Sending happens inside `ctx.waitUntil`.** Rendering and posting to Resend is
network I/O measured in hundreds of milliseconds, and a provider approval must
not wait for it. The Worker's `ExecutionContext` already reaches `index.ts`;
this needs it carried into the request scope. The inbox row is written before
the response; the email leaves after it.

**Failure policy.** A handler that throws must not fail the request — the write
has already committed, and turning a successful approval into a 500 because an
email could not be rendered is a worse outcome than a missing email. Handlers
log, record `status: 'failed'` with the error, and drop. The outbox row remains
as the durable record a future relay can replay.

**The known gap, stated once.** If the isolate dies between commit and dispatch,
that notification is not raised and that email is not sent. The outbox row
survives, so it is recoverable the day the relay exists. Accepted here; it is
also the reason there is no retry — a half-built retry over a mechanism that can
already lose its input is a false promise, and `status: 'failed'` is an honest
row for a future sweep to find.

## Email delivery

### Templates

**Not react-email.** Ntizo already has the pattern and it is the right one:
`provider-invite.template.ts` declares a `Copy` interface and one const per
locale, with the reasoning written above it — *"duplicating eight short strings
is the cost of not shipping an i18n runtime into a Worker to render one email"*.
Follow-up #15 says the same: *"No i18n framework belongs on the backend for
this."*

One template module per notification type, each exporting the same shape, with
a registry from `NotificationType` to module. The `emailLayout` and `buttonHtml`
helpers already exist and are reused unchanged.

### Locale

`ntizo_user.profile.language` exists — `text("language").notNull().default("en-US")`
— so the recipient's own language is resolvable rather than guessed. The
cross-BC reader pattern also exists: `invite-provider-member.command` already
calls `inviterLocale.localeFor(userId)`.

Two rules, because the recipient is not always known:

- **Personal:** the recipient's own `profile.language`.
- **Workspace:** each member's own language. One notification, several members,
  several deliveries — a Portuguese owner and a French colleague each get their
  own, which is the whole reason locale lives on the delivery rather than on the
  notification.
- **No account** (a team invitation to a stranger): the inviter's language, the
  rule already in place and already argued in that template's comment.

### Suppression and bounces

`POST /api/webhooks/resend`, in `write/notification/http/` — Ntizo's first
webhook route of any kind. Signature verification with `svix`, a new dependency
here and the same one doazores uses. An unverified body is refused before it is
parsed.

A `bounced` or `complained` event writes an `email_suppression` row. Every send
checks it first and records `status: 'suppressed'` instead of posting. That is
the whole mechanism: no retry schedule, no re-validation, no un-suppression UI.
Removing an address is a manual database operation until somebody needs it more
often than that.

**Why this is in scope when so much else is not.** The other omissions cost a
feature. This one costs the sending domain's reputation, it accrues silently,
and it is unrecoverable after the fact.

### Preferences stay disabled, and now there is a stronger reason

All five notification types with a live producer are **transactional** by
`@ntizo/shared`'s own classification: `bucketForNotificationType` returns null
for every one of them. So no switch on the preferences page would govern any
email this slice sends, even if the switches worked.

The switches therefore stay disabled and the banner stays honest. What changes
is the SMS column, which goes.

Unsubscribe follows from the same fact: transactional mail carries no
unsubscribe footer, and there is no marketing mail to carry one.

## Adding events to the User bounded context

`Welcome` has no producer because the User aggregates have no event machinery at
all — follow-up #10, whose trigger is *"whenever the User BC needs to publish
anything"*. That has now happened.

The change copies the Provider aggregate exactly: `User` gains `_events`,
`recordEvent()` and `pullEvents()`; a `UserRegistered` event class joins a new
`domain/events/`; and `CreateUserOnSignUpInternalCommand` takes an outbox port
and publishes inside the `atomicExecute` it already opens. That command is
already idempotent — it returns early when the user exists — so the event fires
once per real registration, not once per retry.

`ProfileUpgradedToProvider`, the other half of #10, stays out. Nothing here
listens for it, and an event with no listener is how dead surface starts.

## GraphQL surface

Private schema only. Nothing here belongs on `/public/graphql`, which exists for
crawlers and must stay anonymous.

Queries: `notification.mine`, `notification.mineUnreadCount`,
`notification.forProvider`, `notification.providerUnreadCount`.

Both list queries are paged on `limit` / `offset`, newest first, returning
`{ items, total }` — the shape `providerList` settled on, and for the same
reason. Both are `optional()` rather than zod `.default()`: a default does not
survive into the GraphQL schema, so every caller would have to send it. The
default and the clamp live in the projection.

Mutations: `markNotificationRead`, `markAllNotificationsRead`,
`markProviderNotificationRead`, `markAllProviderNotificationsRead` — the four
doazores exposes, for the reason it exposes four: marking one read and marking
an inbox read are different intentions, and collapsing them into one
nullable-argument mutation makes the audit of who dismissed what unreadable.

**"Mark all read" is always per-reader.** For the workspace inbox it inserts a
read row for the calling member against every unread notification of that
provider. One member catching up must not blank a colleague's badge.

Authorization: the personal inbox resolves from the session and takes no user
argument, so there is no id to tamper with. The workspace inbox is guarded by
membership — the `provider-access.ts` guard the API app already has. The route
that leads there is an affordance, not the control.

The webhook is not GraphQL. It is a signed POST from a vendor with its own
envelope, which is precisely the case `write/<bc>/http/` exists for.

## Frontend

`features/notifications/`, laid out as `eslint-plugin-boundaries` requires:

```
domain/     inbox-groups.ts (grouping by day), notification-target.ts (type → route),
            notification-presentation.ts (type → icon)
data/       notifications.repository.ts — queryOptions, not hooks
viewmodel/  use-inbox.ts, use-unread-count.ts, use-mark-read.ts
ui/         notification-cell.tsx, inbox-list.tsx, notifications-page.tsx,
            notification-bell.tsx
```

Locale catalogues in all eight languages in the same commit as the strings, and
every count-bearing key gets its `_other` form — the convention already in
`directory.json`, and the one this repo has just had to repair once.

Routes:

- `/account/notifications` stops redirecting and becomes the personal inbox. The
  redirect exists because the page did not; it does now.
- `/provider/$slug/notifications` is the workspace inbox, a new entry in the
  provider shell's navigation.
- The bell in `header-actions.tsx` loses its `disabled` and takes its badge from
  `mineUnreadCount`.
- `/account/preferences` loses the SMS column and marks Push unavailable.

**Polling, not sockets.** `refetchInterval` on the unread count. Workers with no
Durable Objects and no queue bindings is not a platform for a socket, and a
badge a minute stale is a badge that is right.

**An empty inbox says so.** `EmptyCard` already exists, and the directory work
established the rule that an empty list and a filtered-to-nothing list are
different sentences. An inbox has only the first.

## What ships with no producer, said out loud

Only the Provider BC emits domain events today. Catalog, Scheduling and Review
emit none, and the User BC gets its first here.

| Type | Producer | Inbox | Email |
|---|---|---|---|
| `ProviderWorkspaceWelcome` | `provider.created` | workspace | yes |
| `ProviderVerified` | `provider.status.decided` → approved | workspace | yes |
| `ProviderDocumentsRequired` | `provider.status.decided` → rejected | workspace | yes |
| `TeamInvitation` | `provider.invite.sent` | only if the invitee has an account | yes |
| `Welcome` | `user.registered` — **new here** | personal | yes |
| `ProviderReviewReceived` | none — Review BC emits nothing | — | — |
| everything booking, quote or payment | none — no such contexts | — | — |

So the workspace inbox ships with three producers and the personal inbox with
one and a half. That is thin, and it is the honest state of the platform rather
than a shortfall of this design: an inbox cannot show events nobody raises. What
the machinery buys is that the next producer is a handler file and a template
rather than a project.

The existing team-invitation email moves onto this path, so it gains a delivery
record and keeps its eight locales. Verification and password-reset stay with
better-auth: they are sent from its hooks, before any of this exists in the
request, and dragging them through the notification pipeline would couple
authentication to a context that must be allowed to fail.

## Testing

- **Domain:** exactly one audience per notification; marking read twice is
  idempotent; a snapshot payload survives its subject changing; a suppressed
  address refuses a send.
- **Application:** each use case against in-memory repositories, the pattern
  every other BC here uses.
- **Handlers:** one test per event → type mapping, asserting the audience and
  the snapshot fields. These catch a handler addressing a workspace notification
  to a person.
- **Templates:** every type renders in all eight locales with no missing key and
  no unreplaced placeholder — one table-driven test, not sixteen files of
  goldens.
- **Webhook:** an unsigned body is refused; a bounce writes a suppression; a
  replayed event does not write it twice.
- **Authorization:** a non-member is refused the workspace inbox; the personal
  inbox cannot be asked for somebody else's.
- **Frontend:** day grouping, the cell per type, the page's empty and populated
  states, the bell's badge, and the preferences page no longer offering SMS.
- **E2E:** an admin verifies a provider; the notification appears in that
  provider's workspace inbox and a delivery row is recorded. One spec, end to
  end, because the seam between commit and dispatch is what no unit test sees.

## Follow-ups

**Closes:** #9 (`runAfterCommit` built but unused) — this is its first caller.
Half of #10 (User BC event machinery).

**Corrects:** #15 is factually stale. It says `verifyEmailTemplate`,
`resetPasswordTemplate` and `verifyPhoneTemplate` are English-only in an
eight-locale app, and lists the invitation among them; the invitation has since
been translated into all eight. The other three remain English and remain
in that follow-up.

**Leaves open, with sharper triggers:** #8, the outbox relay. This slice makes
it more urgent: there is now a consumer whose losses it would recover, and the
missing monotonic sequence column is a bug that will bite the day it is written.
Its trigger moves from *"the first feature that needs to react to something
happening elsewhere"* — which has fired — to *"the first notification whose loss
matters"*, which is the first one about money.

**Opens:** no retry for a failed send; no un-suppression path; `Push` is a
channel with no implementation, now labelled as such on the preferences page.

**Raises, and it is the sharpest one here:** *there is no SMS adapter, and
payments need one.* Only `ConsoleSmsServiceAdapter` exists, so the phone OTP has
never been sent from any environment. This slice makes SMS a single-purpose
dependency rather than a general one — nothing but phone verification will ever
ask for it — and phone verification is what binds a number to M-Pesa and e-Mola.
A payment flow built on an unverified number is a payment flow built on nothing.
**Trigger:** the first slice that takes money, or Mozambique launch, whichever
comes first. It belongs to that slice, not this one.

## Non-goals

No SMS. No push. No digests or grouping. No per-type mute. No unsubscribe. No
admin queue. No relay. No websockets. No changes to the eight locale catalogues
beyond the strings this feature adds.
