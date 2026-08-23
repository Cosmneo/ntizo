# In-app notifications — design

**Date:** 2026-08-23
**Status:** design, approved in outline — awaiting spec review
**Reference project:** `/Users/saliffaustino/Desktop/Salif/Projects/funouts-workspace/doazores`

## Why

The bell in the header does nothing. `header-actions.tsx` says so in a comment
— *"Inert until notifications exist"* — and `/account/notifications` redirects
to `/account/preferences`, where a grid of notification switches is rendered
with every checkbox `disabled` under a banner admitting there is nowhere to
store a preference and nothing that sends anything.

So the platform has a complete notification *vocabulary* and no notifications.
`@ntizo/shared` defines 32 `NotificationType`s, four buckets, four channels,
`isTransactionalNotificationType`, `bucketForNotificationType` and
`isMeteredChannel`, all with their reasoning written down. One comment in there
is load-bearing for this document: `InApp` is deliberately excluded from the
switchable channels because *"it is where the bell in the header reads from"*.
The design was taken; it was never built.

This builds it: the two inboxes, the bell, and the first events that fill them.

## Scope boundary

**In:** the in-app inbox. A `notification` table, a bounded context, read and
write tiers, a GraphQL surface, two pages and a working bell.

**Out, and deliberately:** email, SMS and push delivery; the notification
preference switches (they stay disabled and honest); the outbox relay; template
rendering; unsubscribe tokens; bounce webhooks; email suppression.

That boundary is not timidity. Most of the 32 types are raised by Booking,
Payment and Communication — three contexts that **do not exist in Ntizo**.
Porting doazores' delivery machinery now would build a sorting office for a
post that nobody posts.

## What doazores does, and what is taken

Its `notifications` bounded context is roughly 250 files: `NotificationDelivery`
and `EmailSuppression` aggregates, a Cloudflare Queues adapter, a react-email
template renderer with 24 templates and golden files per locale, a Resend
sender, an svix webhook verifier, a PDF voucher renderer, guest-action tokens,
17 event handlers, crons and four HTTP routes.

| From doazores | Verdict |
|---|---|
| Two inbox scopes — personal and workspace | **Take.** The shape of the problem is identical |
| Per-member read state for the workspace inbox | **Take.** One notification, many readers |
| `write/<bc>/events/handlers/*.event-handler.ts` shape | **Take.** It is already Ntizo's target layout, unused |
| Read-side projections for list + unread count | Take |
| Frontend `features/notifications` with its own domain layer | Take |
| Snapshot payload rather than read-time resolution | Take |
| Cloudflare Queues + cron-driven delivery | **Leave.** Ntizo's `wrangler.jsonc` has neither queues nor triggers, and deploys are gated off entirely |
| Email templates, Resend, suppression, webhooks | **Leave.** Out of scope above |
| PDF vouchers, guest claims, unsubscribe tokens | **Leave.** No such concepts here |
| Admin notification queue | **Leave.** A third audience; not this slice |

## Decisions

| Topic | Decision |
|---|---|
| Scope | In-app inbox only |
| Audiences | Personal **and** workspace. Not admin |
| Dispatch | In-process, after commit, via the existing `runAfterCommit` |
| Outbox | Still written. Not yet read — the relay stays deferred |
| Read state | Its own table, keyed `(notification_id, user_id)` |
| Payload | Snapshot at raise time |
| Live updates | Polling via TanStack Query `refetchInterval`. No websockets |
| User BC events | **In scope** — added so `Welcome` has a producer |

## Data model

Two tables in a new `ntizo_notification` schema.

```
notification
  id           uuid        pk
  type         text        not null   -- NotificationType
  audience     text        not null   -- 'user' | 'provider'
  user_id      uuid        null       -- set iff audience = 'user'
  provider_id  uuid        null       -- set iff audience = 'provider'
  payload      jsonb       not null
  created_at   timestamptz not null
  CHECK (num_nonnulls(user_id, provider_id) = 1)

notification_read
  notification_id uuid        not null
  user_id         uuid        not null
  read_at         timestamptz not null
  PRIMARY KEY (notification_id, user_id)
```

**Read state is a table, not a column.** A workspace notification is read by
each member independently, so a `read_at` column would report that the whole
business had read something the moment one member opened it. For a personal
notification only one row can ever exist — a small cost for having one model
instead of two.

**The payload is a snapshot.** *"Salão X has been verified"* must still say X
after X is renamed, deactivated or deleted. Resolving names at read time makes
an inbox that rewrites its own history, and joins the notification to the
lifetime of everything it mentions. This is the `BookingSnapshot` lesson from
funouts, applied before it has to be learned again.

**The CHECK is not decoration.** `audience` and the two nullable columns can
disagree, and a row where they do is a notification addressed to nobody or to
two parties. `num_nonnulls` makes that unrepresentable rather than merely
discouraged.

**Foreign keys cross schemas, as they already do here.**
`ntizo_provider.provider_member.user_id` references `ntizo_user.user.id` today,
so `notification.user_id` and `notification_read.user_id` reference the same
table, and `notification.provider_id` references `ntizo_provider.provider.id`.
`notification_read.notification_id` cascades on delete; the two subject columns
do not, because a deleted provider must not silently erase the record that its
members were told something.

## Backend structure

Follows the tier split the architecture spec already mandates.

```
bounded-contexts/notification/
  domain/aggregates/notification.aggregate.ts
  domain/value-objects/{notification-id, audience}.vo.ts
  domain/exceptions/
  app/ports/inbound/{raise-notification.internal, mark-read, mark-all-read}
  app/ports/outbound/{notification, notification-read}.repository.port.ts
  app/use-cases/
  infrastructure/repositories/drizzle/
  bootstrap/

read/notification/
  app/use-cases/list-my-notifications.projection.ts
  app/use-cases/count-my-unread-notifications.projection.ts
  app/use-cases/list-provider-notifications.projection.ts
  app/use-cases/count-provider-unread-notifications.projection.ts
  graphql/{schema,handlers}/

write/notification/
  graphql/{schema,handlers}/
  events/handlers/*.event-handler.ts
  events/router.ts
```

`write/<bc>/events/` appears in `2026-08-07-doazores-pattern-adoption-design.md`
as part of the target layout and has never had an occupant. This is its first.

## The dispatch

The producing use case commits as it does today — aggregate records events,
the command calls `outboxPort.publish(agg.pullEvents(), "<bc>")` inside
`unitOfWork.atomicExecute`. Nothing about that changes.

What is added: after that transaction commits, `runAfterCommit` hands the same
events to an in-process router, which looks each one up in a registry of
handlers and calls `raiseNotification`.

**Why after commit rather than inside the transaction.** A notification about a
write that rolled back is a lie, and it is the exact case
`runAfterCommit` was built for — follow-up #9 names its trigger as *"the next
side-effect that must not fire on a rolled-back write"*. It has been sitting
unused since Phase 3A.

**Why in-process rather than a real relay.** doazores drives this with
Cloudflare Queues and four cron triggers. Ntizo's `wrangler.jsonc` declares
neither, deploys are gated off, and a deployed Worker cannot yet reach Postgres
at all. Building the relay would mean provisioning infrastructure that cannot
run, in a slice whose point is to make the bell work.

**Why the BC boundary survives it.** The registry is wired in
`apps/backend/api/src/bootstrap.ts`, the same place every other adapter is
chosen. The Provider BC never imports the Notification BC; it publishes events
and does not know who listens.

**Failure policy.** A handler that throws must not fail the request — the write
already committed, and turning a successful provider approval into a 500
because a notification could not be written is a worse outcome than a missing
notification. Handlers log and drop. The outbox row remains as the durable
record a future relay can replay, which is what makes this choice reversible
rather than merely cheap.

**The known gap, stated once.** If the isolate dies between commit and dispatch,
that notification is not raised. The outbox row survives, so it is recoverable
the day the relay exists — but until then it is genuinely lost from the inbox.
Accepted for an inbox; it would not be acceptable for a payment receipt, and
this is a reason the delivery tier is out of scope rather than half-built.

## Adding events to the User bounded context

`Welcome` has no producer because the User aggregates have no event machinery
at all — follow-up #10, whose trigger is *"whenever the User BC needs to publish
anything"*. That has now happened.

The change is small and copies the Provider aggregate exactly: `User` gains
`_events`, `recordEvent()` and `pullEvents()`; a `UserRegistered` event class
joins a new `domain/events/`; and `CreateUserOnSignUpInternalCommand` takes an
outbox port and publishes inside the `atomicExecute` it already opens. The
command is already idempotent — it returns early when the user exists — so the
event fires once per real registration and not once per retry.

`ProfileUpgradedToProvider`, the other half of #10, stays out. Nothing in this
slice needs it and inventing an event with no listener is how dead surface
starts.

## GraphQL surface

Private schema only — both inboxes are session-authed. Nothing here belongs on
`/public/graphql`, which exists for crawlers and must stay anonymous.

Queries: `notification.mine`, `notification.mineUnreadCount`,
`notification.forProvider`, `notification.providerUnreadCount`.

Both list queries are paged on `limit` / `offset`, newest first, returning
`{ items, total }` — the shape `providerList` settled on, and for the same
reason: `items.length` is how many fit on this page and `total` is how many
there are. Both are `optional()` rather than zod `.default()`, because a
default does not survive into the GraphQL schema and every caller would then
have to send them. The default and the clamp live in the projection.

Mutations: `markNotificationRead`, `markAllNotificationsRead`,
`markProviderNotificationRead`, `markAllProviderNotificationsRead` — the same
four doazores exposes, and for the same reason: marking one read and marking a
whole inbox read are different intentions, and collapsing them into one
nullable-argument mutation makes the audit of who dismissed what unreadable.

**"Mark all read" is always per-reader.** For the workspace inbox it inserts a
read row for the calling member against every unread notification of that
provider — it does not mark the inbox read for the team. One member catching up
must not blank the badge of a colleague who has not looked.

Authorization: the personal inbox resolves from the session and takes no user
argument, so there is no id to tamper with. The workspace inbox is guarded by
membership of the provider — the `provider-access.ts` guard the API app already
has. The route that leads there is an affordance, not the control.

## Frontend

`features/notifications/`, laid out as `eslint-plugin-boundaries` requires:

```
domain/     inbox-groups.ts (grouping by day), notification-target.ts (type → route),
            notification-presentation.ts (type → icon)
data/       notifications.repository.ts — queryOptions, no hooks
viewmodel/  use-inbox.ts, use-unread-count.ts, use-mark-read.ts
ui/         notification-cell.tsx, inbox-list.tsx, notifications-page.tsx,
            notification-bell.tsx
```

Locale catalogues in all eight languages, in the same commit as the strings —
and every count-bearing key gets its `_other` form, the convention already in
`directory.json` and the one this repo has just had to repair once.

Routes:

- `/account/notifications` stops redirecting and becomes the personal inbox.
  The redirect was added because the page did not exist; it does now.
- `/provider/$slug/notifications` is the workspace inbox, a new entry in the
  provider shell's navigation.
- The bell in `header-actions.tsx` loses its `disabled` and takes its badge
  from `mineUnreadCount`.

**Polling, not sockets.** `refetchInterval` on the unread count. Workers with no
Durable Objects and no queue bindings is not a platform for a socket, and a
badge that is a minute stale is a badge that is right.

**An empty inbox says so.** The `EmptyCard` component already exists and the
directory work established the rule: an empty list and a filtered-to-nothing
list are different sentences. An inbox has only the first, and it reads as
"nothing yet", never as a page that failed.

## What ships with no producer, said out loud

Only the Provider BC emits domain events today. Catalog, Scheduling and Review
emit none, and the User BC gets its first in this slice.

| Notification type | Producer | Inbox |
|---|---|---|
| `ProviderWorkspaceWelcome` | `provider.created` | workspace |
| `ProviderVerified` | `provider.status.decided` → approved | workspace |
| `ProviderDocumentsRequired` | `provider.status.decided` → rejected | workspace |
| `TeamInvitation` | `provider.invite.sent` | personal |
| `Welcome` | `user.registered` — **new here** | personal |
| `ProviderReviewReceived` | none — Review BC emits nothing | — |
| everything booking, quote or payment | none — no such contexts | — |

So the personal inbox ships with two producers and the workspace inbox with
three. That is thin, and it is the honest state of the platform rather than a
shortfall of this design: an inbox cannot show events nobody raises. The
machinery is what makes the next producer a handler file instead of a project.

## Testing

- **Domain:** exactly one audience per notification; marking read twice is
  idempotent; a snapshot payload survives its subject changing.
- **Application:** each use case against in-memory repositories, the pattern
  every other BC here uses.
- **Handlers:** one test per event → type mapping, asserting the audience and
  the snapshot fields. These are the tests that catch a handler addressing a
  workspace notification to a person.
- **Authorization:** a non-member is refused the workspace inbox; the personal
  inbox cannot be asked for somebody else's.
- **Frontend:** day grouping, the cell's rendering per type, the page's empty
  and populated states, and the bell's badge.
- **E2E:** an admin verifies a provider, and the notification appears in that
  provider's workspace inbox. One spec, end to end, because the seam between
  commit and dispatch is the part no unit test observes.

## Follow-ups

**Closes:** #9 (`runAfterCommit` built but unused) — this is its first caller.
Half of #10 (User BC event machinery) — `UserRegistered` lands,
`ProfileUpgradedToProvider` does not.

**Leaves open, with sharper triggers:** #8 (the outbox relay). This slice makes
it more urgent rather than less: there is now a consumer whose losses the relay
would recover, and the missing monotonic sequence column is a bug that will bite
the day the relay is written. Its trigger moves from *"the first feature that
needs to react to something happening elsewhere"* — which has now fired — to
*"the first notification whose loss matters"*, which is the first one that is
about money.

**Opens:** the preference switches are still disabled while an inbox now exists.
The `InApp` channel is deliberately not switchable, so nothing on that page
governs this inbox — but a user reading "Reminders / Email / SMS / Push" beside
a working bell may reasonably expect otherwise. Trigger: the first delivery
channel that actually sends.

## Non-goals

No delivery of any kind outside the app. No admin queue. No notification
grouping or digest. No per-type mute. No relay. No websockets. No changes to
the eight locale files beyond the strings this feature adds.
