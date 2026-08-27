# Messaging, Phase 1 — Design

**Goal:** a customer can write to a provider, the provider can answer, and both
find the conversation again. Today `/messages` renders a hardcoded empty state
and `ntizo_communication` is a stub with no tables.

## This is one of three phases, not the whole feature

Messaging was asked for with the admin included: support conversations,
oversight of other people's threads, and moderation. That is three subsystems,
not one — each has its own inbox, its own access rules, and its own queries.
The reference project keeps them as three separate admin features
(`messaging-inboxes`, `messaging-support`, `messaging-moderation`), which is
not an accident.

| Phase | What it adds |
|---|---|
| **1 — this spec** | `thread` + `message`, customer ↔ provider, both inboxes, unread, bell + email |
| 2 — support | Customer ↔ platform and provider ↔ platform threads, admin inbox, routing |
| 3 — oversight | Admin reads others' threads, `message_report`, moderation queue and actions |

Each phase gets its own spec, plan, and implementation cycle.

**Phase 3 must decide something this spec deliberately does not:** whether an
admin reading two people's private conversation is recorded, and whether users
are told it can happen. That is a question of trust, not of schema, and it
should be answered on purpose rather than discovered afterwards.

## It is not the notification inbox

The bell holds what happened *to* you and carries unread state and email
delivery. Messages are a conversation — two people writing to each other. They
share the notification context (a new message raises one) but they are not the
same surface and do not share a table.

Messages also do **not** enter the activity feed. Its nine types are things a
person did that are worth a history; "sent a message" would flood it and inform
nobody. Left out on purpose.

## What starts a conversation

The customer does, from the provider's public page (`routes/providers.$slug.tsx`).
There is no booking to hang a thread on — `ntizo_booking.booking` is a
three-column stub — so a conversation is simply about a provider.

One conversation per customer↔provider pair. A provider cannot open one with a
customer: allowing that makes cold-messaging possible, and nothing in the
product needs it yet.

The conversation belongs to the **provider**, not to a person inside it. Any
member reads and answers it, the same way the notification context already
treats `audience: "provider"`.

"Member" means a `ntizo_provider.provider_member` row exists for that
`(provider_id, user_id)`. There is no status column on that table — membership
is the row's existence — and `DrizzleProviderMemberReader` in the notification
context already resolves it with exactly that predicate and no further filter.
Messaging uses the same rule rather than inventing a second one.

## Data model

Schema `ntizo_communication`, two tables.

### `thread`

```
id                 uuid pk
type               varchar(32) not null      -- 'inquiry'
customer_user_id   text not null             -> better_auth.user
provider_id        uuid not null             -> ntizo_provider.provider
last_message_at    timestamptz not null
created_at         timestamptz not null default now()
```

- `unique (customer_user_id, provider_id) where type = 'inquiry'` — one
  conversation per pair. Partial on purpose: a phase-2 support thread will
  carry a different `type` and no provider, and Postgres treats NULLs as
  distinct, so a plain unique index would silently stop constraining anything
  the moment that column can be null.
- `index (customer_user_id, last_message_at desc, id desc)` — the customer inbox.
- `index (provider_id, last_message_at desc, id desc)` — the provider inbox.

`type` ships with one value in use. That is not speculative generality: phases 2
and 3 are agreed scope, and adding the column later means a migration plus a
backfill of every existing row. `booking_id` is **not** added — bookings do not
exist, and that column has nothing to point at.

`last_message_at` is denormalised so an inbox can order and page without
touching `message`. It is written in the same transaction as the message.

### `message`

```
id              uuid pk
thread_id       uuid not null -> thread (on delete cascade)
sender_user_id  text not null -> better_auth.user
body            text not null
read_at         timestamptz null
notify_due_at   timestamptz null
notified_at     timestamptz null
created_at      timestamptz not null default now()
```

- `index (thread_id, created_at desc, id desc)` — reading a conversation, paged.
- `index (notify_due_at)` where `notify_due_at is not null and read_at is null
  and notified_at is null` — the only rows the sweep wants.

`read_at` sits on the **message**, not as a per-side cursor on the thread. Each
message has exactly one recipient side, so "unread" is a direct count: messages
in this thread whose sender is the other side and whose `read_at` is null. No
cursor arithmetic, and no second table.

**A consequence worth stating plainly:** for a provider with three staff,
reading is a *shared* act — one member reads and it is read for everybody. That
follows from the conversation belonging to the provider. Per-person unread
counts would need a participant table and are not worth it here.

## Sending

One transaction:

1. Find the thread for `(customer_user_id, provider_id)`, or create it.
2. Insert the message with `notify_due_at = now() + 2 minutes`.
3. Set the thread's `last_message_at`.

The thread lookup-or-create resolves as an upsert on the unique index rather
than a read-then-branch, so two messages sent at once cannot produce two
threads. The review context learned this the expensive way: a decision made
from a read taken outside the transaction is a decision made from a stale fact.

## Telling somebody

`RaiseNotificationInternalCommand` takes its `deliverer` as an **optional**
constructor argument — passing nothing raises the bell entry without sending
email. That seam already exists and is what makes the following possible.

Nothing is raised when the message is sent. A scheduled sweep runs, finds
messages that are due, still unread, and not yet notified, and raises the
notification **with** the deliverer — bell and email together.

One rule covers both channels: *if it is still unread after two minutes, tell
them.* A fast back-and-forth produces no email at all, because each message is
read before its window elapses.

Two minutes is one named constant in the communication context, not a literal
spread across the command and the sweep. The sweep's cron interval is a
separate number in `wrangler.jsonc`; the window is what the product means, the
interval is how often we check, and conflating them makes both harder to change.

The cost is that the bell also waits up to two minutes. Someone sitting in the
conversation sees the message immediately anyway — the page polls — so the delay
only applies to somebody who is elsewhere, where two minutes is not the
difference between working and broken.

The alternative — bell immediately, email delayed — reads slightly better and
costs a link from each message to its notification so that delivery can be
triggered separately later. Not worth it for the difference.

**The sweep must survive a bad row.** One message that fails to notify cannot
stop the batch; the rest of the queue is not its business. And raising a
notification must never break sending: the message is already committed, and it
does not disappear because the telling failed.

## The scheduled worker

This is the only new infrastructure. Neither exists today:

- a `triggers.crons` entry in `apps/backend/api/wrangler.jsonc`, per environment
- a `scheduled` export on the worker, beside the existing `fetch`

Everything else reuses what is already deployed. Notably **no Durable
Objects** — they are not declared anywhere, and the polling decision below is
what keeps it that way.

## Freshness

The open conversation refetches every ~5 seconds, and on tab focus. That reads
as a chat without a socket, uses the TanStack Query layer the notification inbox
already uses, and costs one cheap request per active reader.

Real-time over WebSockets would mean Durable Objects: a new binding, per-object
cost, and a new class of failure — dropped connections, reconnection, state per
isolate. The upgrade path stays open; nothing here forecloses it.

## GraphQL surface

Private, session-authed, in the read/write split the codebase already uses.

The field kit **flattens nested schema keys**: a schema shaped
`{ communication: { myThreads } }` emits on the wire as `communicationMyThreads`.
An earlier phase lost a round to exactly this. Verify the emitted names by
introspecting a running server, not by reading the source.

Reads take no user id — the actor comes from the session, so there is nothing to
tamper with:

- `communicationMyThreads(limit, cursor)` — the customer's conversations
- `communicationProviderThreads(providerId, limit, cursor)` — one provider's
- `communicationThreadMessages(threadId, limit, cursor)` — one conversation

Writes:

- `communicationStartThread(providerId)` — returns the thread for this customer
  and provider, creating it if there is none. Idempotent: called twice it
  returns the same thread, because the unique index resolves it as an upsert.
- `communicationSend(threadId, body)`
- `communicationMarkRead(threadId)`

Two mutations rather than one taking either a provider or a thread. A single
field with two mutually exclusive inputs is awkward to type and easy to call
wrongly; splitting them means every caller says which thing it has. The
customer's flow is *start, then send*; everyone replying already holds a
`threadId`.

Cursors follow the activity feed's shape — `<timestamp ISO>|<id>`, a `limit + 1`
probe for "is there more", and a malformed cursor rejected as `UNPROCESSABLE`
rather than masked as `INTERNAL_ERROR`.

## Frontend

- `/messages` — the customer inbox, replacing the placeholder. List of
  conversations, then the conversation itself.
- `/provider/$slug/messages` — the provider inbox, beside `overview`,
  `services`, `members`.
- A **"Enviar mensagem"** button on `routes/providers.$slug.tsx`. Without it
  the inbox exists and nobody can start a conversation — the same shape of
  failure as a handler that is written, tested, and never mounted.

Copy in all eight locales (`en-US`, `pt-MZ`, `pt-PT`, `es-ES`, `fr-FR`, `it-IT`,
`de-DE`, `nl-NL`). `DEFAULT_LOCALE` is `pt-MZ` and the project owner reads it, so
that copy is written, not translated.

## Authorization

Resolved server-side from the session:

- the customer side is the thread's `customer_user_id`
- the provider side is any member of the thread's `provider_id`, in the sense
  defined above: a `provider_member` row exists for that pair

Anybody else gets a refusal, including for a thread id they guessed.

**This must be proven with a second user.** A fixture holding one person's data
passes whether or not the check exists — that is the defect this codebase has
produced four times, most recently a fixture that could not distinguish the real
query from one ignoring half its logic.

## Errors

Each with its own code, never a masked `INTERNAL_ERROR`:

| Case | Result |
|---|---|
| Provider missing or not active | refusal, own code |
| Body empty or whitespace | validation |
| Body over 4000 characters | validation |
| Thread not visible to the caller | refusal, indistinguishable from missing |
| Malformed cursor | `UNPROCESSABLE` |

A thread the caller may not see returns the same answer as one that does not
exist. Telling them apart tells an attacker which ids are real.

## User text reaches other users' screens

A message body is written by one person and rendered to another. React escapes
by default, but `apps/frontend/web/src/shared/lib/i18n.ts` sets
`interpolation: { escapeValue: false }` — correct for React, and it means safety
rests on the value landing in an ordinary JSX text node.

The test for this must go red if the render path becomes dangerous. A test
asserting escaped output against a path that was never dangerous proves nothing.

## Testing

For each assertion that matters, the question is what mutation would break it —
and then running that mutation. Specifically:

- a second user cannot read the first user's thread
- unread counts only the other side's unread messages
- inbox ordering is by `last_message_at`, and the `limit + 1` probe reports
  "more" correctly at the boundary
- the sweep picks exactly due + unread + not-yet-notified, and skips a message
  read inside its window
- a failing notification leaves the message committed
- a bad row does not stop the sweep's batch

End to end: two real users, one sends, the other sees it — and the proof that it
tests the path, which is that breaking the send makes it fail.

## Out of scope in Phase 1

Attachments. Reports and moderation. Support threads. Admin oversight. A
provider starting a conversation. Editing or deleting a message.

Read receipts shown to the sender: the column exists and drives the unread
count, but "seen" is a product decision with its own consequences and is not
taken in passing.
