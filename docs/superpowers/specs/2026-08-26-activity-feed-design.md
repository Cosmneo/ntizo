# Activity feed — design

**Date:** 2026-08-26
**Status:** approved, ready for an implementation plan

## What this is

A record of **what a person did on Ntizo**, shown at `/activity` and as a
column beside the notification inbox — the shape the doazores "Recent
activity" panel has.

It is not the notification inbox. That one holds what happened *to* you and
carries unread state and email delivery. This one holds what *you* did, has
no unread state, and sends nothing. One event never produces both for the
same person: an admin approving a provider writes activity for the admin
("approved X") and a notification for the provider ("your account was
verified"), which is where that already goes today.

## Why now, and what it can honestly show

The three activity pages — customer, provider, admin — already exist and
render a hardcoded empty list. `ActivityEntry`'s own comment says a real read
model would either map onto it or replace it. Nothing writes activity because
there is no table, no events keyed to an actor, and no read model.

What exists to draw on today, measured against the dev database:

| | |
|---|---|
| `ntizo_review.review` | 41 rows, and **no domain events at all** |
| `ntizo_catalog.service` | 89 rows, four events, none carrying an actor |
| `ntizo_outbox.outbox_event` | 143 rows |
| `ntizo_booking.booking` | **0 rows, no bounded context in code** |

Bookings are the interesting half of a customer's history and they do not
exist. This phase builds the machinery and fills it with what is real now;
every context added later feeds the same table without further work here.

## Scope

**In:** the personal feed — one table, an actor on the events that lack one,
handlers, a paged read, the `/activity` page, and the activity column beside
the notification inbox.

**Out:** the provider and admin feeds. The table will serve them with a
different filter, but "what this workspace did" is a different question from
"what I did", and answering it now would be deciding without needing to.

**Out:** messaging and bookings. A doazores conversation is keyed to a
`bookingId`; Ntizo has no bookings, so messaging has nothing to attach to.

## Data model

`ntizo_activity.activity`:

| column | type | note |
|---|---|---|
| `id` | uuid pk | |
| `actor_user_id` | text not null | who did it |
| `type` | varchar(64) not null | e.g. `service.published` |
| `payload` | jsonb not null | the snapshot the sentence is rendered from |
| `occurred_at` | timestamptz not null | **from the event**, not the insert |
| `created_at` | timestamptz not null | when the row was written |

Index: `(actor_user_id, occurred_at desc, id desc)`.

### The payload is a snapshot

It carries the words the sentence needs — a service's name, a provider's name
— never a foreign key. A history entry has to keep saying the same thing when
the service is renamed or deleted; a row that resolved its name on read would
silently rewrite the past.

This is not a theoretical worry. The notifications phase shipped a team
invitation that snapshotted a uuid instead of a name, and the email arrived
saying nothing.

### No read state

Activity is not read, marked, or counted. That is the whole difference from
the inbox, and the reason this is a separate table rather than a flag on the
notification one.

## The actor

Every activity row is keyed to the person who caused it. Domain events carry
`aggregateId` — the thing the event is about — and a payload. Some already
carry the actor; the rest gain one.

**Commands already know who is acting.** `requesterUserId` is an input to
commands in catalog, review, scheduling and notification, used for
authorization. The actor is not missing from the system, only from the event,
so this is passing a value that is already in hand.

| event | actor | change needed |
|---|---|---|
| `user.registered` | `userId` | none — already there |
| `provider.created` | `ownerUserId` | none — already there |
| `provider.status.decided` | `decidedByUserId` | none — already there |
| `provider.invite.sent` | inviter | add `actorUserId` |
| `provider.invite.accepted` | invitee | add `actorUserId` |
| `service.created` | the member | add `actorUserId` |
| `service.published` | the member | add `actorUserId` |
| `service.unpublished` | the member | add `actorUserId` |
| `review.created` | the author | **the event does not exist** |

Adding a field to an event payload is additive: existing consumers ignore it.

### Review needs an event

The review context emits nothing. Without `review.created`, a customer's feed
reads "you created your account" and nothing else, forever — and the customer
page is what prompted this work. `submit-review.command.ts` already has
`requesterUserId`, so the event is a small, contained addition to a context
that is otherwise untouched.

### Names come from the handler, not the event

`service.published` carries only `serviceId`. The sentence needs the service's
name. The handler resolves it once, at write time, and snapshots it into the
payload.

The alternative — adding a name to every event — changes events for one
consumer's benefit, and events have other consumers. The handler is where the
knowledge that "activity needs a display name" belongs.

## Writing

Handlers registered on the existing `EventRouter`, exactly as the notification
handlers are. They run in-process after the producing transaction commits.

**A handler never fails its caller.** By the time it runs the write has
committed and the response may have been sent; throwing would turn a
successful service publication into a 500 over a log entry. This is the
router's own documented rule, not a new one.

**Known limitation, stated rather than hidden:** if the isolate dies between
the commit and the dispatch, the activity row is never written. The outbox row
survives, so the relay in follow-up #8 would recover both this and the
equivalent gap in notifications. A lost activity row is an incomplete record,
not a visible error.

## Reading

A paged GraphQL field scoped to the authenticated user, following the
notification read side.

**Cursor paging on `(occurred_at, id)`, not offset.** An entry written between
two page fetches shifts every offset by one, which makes a row appear twice or
not at all. The id breaks ties when two events share a timestamp.

## Rendering

`ActivityEntry` changes from a pre-translated `description` to `type` +
`payload`, and the client renders it with
`t(\`type.${key}\`, { replace: payload })` — the same mechanism the
notification inbox already uses, so the server never needs the reader's
locale.

The existing file anticipates this: *"When a real read model lands it maps
onto this or this changes to meet it."*

Nine type keys × eight locales.

**Interpolated values are user-chosen.** A service name reaches the sentence
through `replace`. React escapes by default, so this is not a live hole, but
it is worth a test: the value comes from whoever created the service.

## The page

`/activity` renders the real feed. The notification inbox gains the activity
column beside it, which is the layout that prompted this design.

## Testing

- The snapshot rule: renaming a service after the fact must not change what an
  older activity row says.
- Cursor paging: a row written between two pages must not duplicate or skip.
- Ordering by `occurred_at`, so a late write still sorts where it belongs.
- A handler that throws must not fail its caller, and must not stop its
  siblings — the property the notifications phase needed three rounds to get
  right, so it is asserted here from the start.
- Every type key resolves in all eight locales, and no locale is the English
  string pasted under a translated key. The legal-content test is the model.
- Interpolation escapes a service name containing markup.

## What this does not solve

Bookings, messaging, favourites — all still placeholders. Provider and admin
feeds stay empty. This phase makes the machinery real and fills it with what
the platform can honestly say today.
