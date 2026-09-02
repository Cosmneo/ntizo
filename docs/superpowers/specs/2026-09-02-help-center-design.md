# Help Center — Design

**Goal:** anyone on the site can find an answer without asking, and anyone
with an account can ask the platform for help and find that conversation
again. Today the footer's "Apoio" column is an email address and nothing else;
there is no FAQ, no way to write to the platform, and no admin surface that
would receive it if there were.

This is **messaging phase 2** — the support threads the phase-1 spec
(`2026-08-27-messaging-phase-1-design.md`) agreed as scope and follow-up #71
records as unmade — plus the FAQ and the floating Help Center that surface it.
The reference is the DoAzores Help Center
(`doazores/docs/superpowers/specs/2026-07-20-help-center-widget-design.md`);
the shape is borrowed, two of its decisions are deliberately not.

## What this is, and what it is not

The reference feature is four things. This spec is two of them:

| Piece | Here? |
|---|---|
| **A.** Support requests: customer ↔ platform and provider ↔ platform threads, admin inbox with reply, notifications | **Yes** — the backend half |
| **B.** Help Center: floating launcher, side panel (search, FAQ, "send a message", "my requests", conversation), public FAQ page, footer links | **Yes** — the frontend half |
| C. "Share feedback" (type, rating, message, anonymous with captcha) and its admin list | No — its own context, its own spec |
| D. Static `/contact` and `/support` pages | No — a footer link opens the panel; there is nothing a page would add |

One spec because the product decisions are shared; **two implementation
plans**, A then B, because B without A is only a FAQ.

### Decisions taken in the brainstorm

| Question | Decision | Why |
|---|---|---|
| Support model | **One request per subject, with a status** (`open` → `resolved`), not one running thread per user | Ntizo moves money and bookings. The admin needs a queue of what is pending, not a list of what last had a message. DoAzores chose the single thread and listed per-topic tickets as its own follow-up |
| Who can write to support | **Signed-in users only.** FAQ and search are public | Everyone who books or provides has an account; `hello@ntizo.com` in the footer covers "I cannot sign in". Anonymous requests would need a captcha, a `public/` slice, and a reply channel that is email only |
| Provider support | **Two audiences**: personal requests (tied to the user) and provider requests (tied to the provider, opened from `/provider/$slug`, readable by every member, provider named in the admin queue) | Half the users are providers, and the requests with money in them come from that side |
| FAQ content | **Static, in the frontend, per locale** | A small team ships a commit faster than it learns an editor; `/help` prerenders like the rest of the public site |
| Who is told about a new request | **Every user with role `admin`**, bell and email | No new configuration; the admin queue shows the same thing to anyone already inside `/admin` |
| Where the launcher shows | Everywhere except `/admin/*` (the admin *is* support) and checkout (`/book/*`, `/booking/*/confirm`). **Including the provider zone**, as a floating button | Chosen over a sidebar entry for consistency with the public side |

Detail decisions, taken without a question because one answer was clearly
right: the form asks for a **subject and a message**; a booking is attached
only when the panel is opened from that booking's page (no booking picker);
platform replies render as **"Suporte Ntizo"**, never an admin's personal
name; attachments are allowed both ways; **contact detection is off** in
support threads, because giving support a phone number is the point; support
requests also appear in the existing `/messages` inboxes, because that is
where the bell already links; the public FAQ page lives at **`/help`**.

## What already exists and is reused

- `ntizo_communication.thread` + `message` + `attachment`, the 2-minute
  unread sweep, `visibleToViewer`, `MarkThreadReadCommand`, the attachment
  upload/download routes — phase 1 and the attachments spec, unchanged in
  behaviour for inquiries.
- `thread.type` with its partial unique index `WHERE type = 'inquiry'`, put
  there by phase 1 for exactly this.
- `RaiseNotificationInternalPort`, the notification templates registry and
  `pickCopy`, the email adapter behind it.
- `requireAdmin` / `requireUser` handler helpers (copied per slice, by
  convention), the cursor shape `<ISO>|<id>` with the `limit + 1` probe.
- Frontend: `ThreadView`, `MessageComposer`, attachment picker/list, the
  `Sheet` primitive in `@ntizo/frontend-ui`, `useCurrentUser`, the
  `?thread=` search-param convention on both inboxes, `zoneOwnsChrome`.
- Admin: the `admin/reviews` and `admin/providers` feature shape, `adminNavGroups`.

## Data model

Everything in schema `ntizo_communication`. One migration: three changes to
existing tables, one new table.

### `thread` (changed)

```
type              varchar(32) not null      -- 'inquiry' | 'support'
customer_user_id  text not null             -- inquiry: the customer
                                            -- support: the user who opened the request
provider_id       uuid NULL -> provider.id  -- inquiry: the provider contacted (required)
                                            -- support: the provider on whose behalf; NULL for a personal request
```

- `THREAD_TYPES` gains `'support'`.
- `CHECK (type <> 'inquiry' OR provider_id IS NOT NULL)` — phase-1 code keeps
  its right to trust `provider_id` on an inquiry.
- The partial unique index stays. Support threads have **no** uniqueness: a
  user may have several open.
- The two "recent" indexes stay. `idx_thread_provider_recent` now also serves
  a provider's support requests.

`provider_id` goes nullable rather than pointing at a sentinel platform
provider. DoAzores used an all-zeros workspace id for guest support and paid
for it with short-circuits in two places, one of them a bug found later. A
nullable column says what it means.

### `message` (changed)

```
sender_side  varchar(16) not null   -- 'customer' | 'provider' | 'platform'
```

Backfilled in the migration: `'customer'` where `sender_user_id =
thread.customer_user_id`, else `'provider'`.

This replaces the phase-1 rule `fromTheOtherSide`, which resolves "the other
side" against `customer_user_id` alone. That rule cannot describe a provider
request: a member reading it must not count a teammate's message as unread,
and an admin's reply is from a side phase 1 does not know. With the side
written at send time, "unread for X" is `sender_side <> side(X) AND read_at
IS NULL` for every thread type, and the sweep's "who to tell" is the same
predicate turned around.

### `support_request` (new, 1:1 with `thread`)

```
thread_id            uuid pk -> thread.id (on delete cascade)
audience             varchar(16) not null   -- 'customer' | 'provider'
subject              varchar(120) not null
booking_id           uuid NULL -> ntizo_booking.booking.id
status               varchar(16) not null   -- 'open' | 'resolved'
resolved_at          timestamptz NULL
resolved_by_user_id  text NULL -> user.id
created_at           timestamptz not null default now()
```

- `CHECK ((status = 'open') = (resolved_at IS NULL))`.
- `index (status, created_at desc, thread_id desc)` — the admin queue.
- `audience` is redundant with `provider_id IS NULL` and kept anyway: a query
  filtering the admin queue by audience should not have to know that rule.

**Why a second table rather than four nullable columns on `thread`:** the
thread keeps what every conversation has; the lifecycle (subject, status,
resolution) is support's alone and lives under support's name. Inquiries do
not grow four null columns, and phase-1 code changes only where `provider_id`
and `sender_side` force it.

## Domain and use cases

Context `communication`.

- `Thread`: `providerId` becomes `string | null`; gains
  `Thread.openSupport({ customerUserId, providerId, now })`. `open` (inquiry)
  is unchanged.
- `SupportRequest` (new aggregate): `open({ threadId, audience, subject,
  bookingId })`, `resolve(byUserId, now)`, `reopen()`. Invariants: subject 1–120
  characters after trim; `resolve` only from `open`, `reopen` only from
  `resolved`, each with its own error.
- `Message.compose` takes `senderSide`. **The side is decided by which command
  writes**, never inferred from the sender's role: the participant command
  writes the requester's side (`customer` or `provider`, by audience), the
  admin command writes `platform`.

| Command | Caller | Does |
|---|---|---|
| `OpenSupportRequestCommand` (new) | signed-in user | One transaction: `thread(type=support)` + `support_request` + first message (with attachments if given). Audience `provider` requires membership of `providerId`. A `bookingId`, if given, must belong to the requester — the booking's customer, or a booking of the audience's provider — via a new `BookingReaderPort`. At most **10 open requests per requester** (one count, an abuse guard). Raises `SUPPORT_REQUEST_OPENED` to every admin, immediately. |
| `SendMessageCommand` (existing) | participant | Two changes: on a support thread `hasContact` does **not** run, and if the request is `resolved` it is reopened in the same transaction. |
| `ReplyToSupportRequestCommand` (new) | admin | Inserts a `platform` message and touches `last_message_at`. Reads the thread through a repository method restricted to `type = 'support'`, with no `visibleToViewer`: the handler already proved the role. |
| `ResolveSupportRequestCommand` (new) | admin | `resolve`, then raises `SUPPORT_REQUEST_RESOLVED` to the requester side, immediately. |
| `MarkThreadReadCommand` (existing) | participant or admin | With `sender_side`, "from the other side" generalises without a branch per type: the reader's side is resolved in SQL (customer / member / platform) and messages with `sender_side <> side` are marked. The admin slice exposes its own `markRead`, calling this command with side `platform`. |

Reopening on reply is the requester's only way to say "not solved"; there is
no separate reopen mutation and no "awaiting user" state. Two states are
enough for a queue; a third is a product decision to take when the queue
asks for it.

## Sides, visibility and authorization

- **Participants.** `visibleToViewer` is not changed, because it already
  covers both audiences: `customer_user_id` matches on a personal request;
  "a `provider_member` row exists for `(provider_id, viewer)`" matches on a
  provider request. Anybody else is refused, and a thread the caller may not
  see returns the same answer as one that does not exist — the phase-1 rule.
- **Admin.** `requireAdmin` in every handler of the new `support` slices, and
  every repository method those slices use filters `type = 'support'`. No
  admin path reaches an inquiry. This discharges the phase-2 half of
  follow-up #71 and leaves the phase-3 question — whether an admin reading a
  customer ↔ provider conversation is logged, and whether the participants
  are told — explicitly unanswered rather than answered in passing.
- **A member who opens a provider request** is `customer_user_id` on that
  thread and also a member; both predicates admit them, and the thread is
  listed only in the provider's inbox (see the read changes below).

## Notifications

Four new `NotificationType` values, all transactional (no bucket, no switch):

| Type | To | When |
|---|---|---|
| `SUPPORT_REQUEST_OPENED` | each user with role `admin` | immediately, on open |
| `SUPPORT_REQUEST_MESSAGE` | each admin | the 2-minute sweep: a requester-side message still unread |
| `SUPPORT_REPLY` | the requester side (audience `user` or `provider`) | the 2-minute sweep: a platform reply still unread |
| `SUPPORT_REQUEST_RESOLVED` | the requester side | immediately, on resolve |

The sweep decides the recipient by `sender_side`: `platform` → the requester
side (`{ audience: "user", userId }` or `{ audience: "provider", providerId }`);
`customer` or `provider` on a support thread → **one notification per admin**,
through a new `AdminUserReaderPort` (reads `ntizo_user.user` where
`role = 'admin'`). Inquiries keep raising `NEW_MESSAGE`, unchanged.

Emails link to `/messages?thread=<id>`, `/provider/<providerId>/messages?thread=<id>`
or `/admin/support/<threadId>`. Templates follow `new-message.template.ts`
(`pickCopy`, en + pt).

"Opened" is raised directly rather than through the sweep because a new
request is an event in its own right — like a booking request — and the
first message would otherwise arrive two minutes late with a "new message"
wording that hides what it is.

## GraphQL surface

Private, session-authed, in the existing read/write split. Wire names are
the flattened ones and are **verified by introspecting a running server**,
not by reading the source (phase 1 lost a round to this).

### Existing reads, changed (`read/communication`)

- `communicationMyThreads` and `communicationProviderThreads` take an optional
  `type: 'inquiry' | 'support'` (absent → both). Each row gains `type`,
  `providerId` becomes nullable, and `support: { subject, status, audience,
  bookingId } | null`. The panel's "my requests" is `myThreads(type: 'support')`;
  the provider zone's is `providerThreads(providerId, type: 'support')`.
- `listForCustomer` **excludes provider requests**: it returns `type = 'inquiry'`
  or `type = 'support' AND provider_id IS NULL`. Without this the member who
  opened a request on the provider's behalf would see it in their personal
  inbox too.
- `communicationThreadMessages`: each message gains `senderSide`. The frontend
  aligns bubbles by side, not by `senderUserId`, and labels `platform` ones
  "Suporte Ntizo".

### New write (`write/communication`)

- `communicationOpenSupportRequest({ audience, providerId?, subject, body, bookingId?, attachments? })` → `{ threadId }`.

`communicationSend` and `communicationMarkRead` are unchanged for participants.

### New admin slices (`read/support`, `write/support`)

All `requireAdmin`; all repository methods scoped to `type = 'support'`.

| Field | Returns |
|---|---|
| `supportRequests({ status?, audience?, limit, cursor })` | a page of `supportRequestSummaryReadModel`: `threadId, audience, subject, status, requesterName, providerId, providerName, bookingId, lastMessageAt, lastMessagePreview, unreadForAdmin, createdAt, resolvedAt` — ordered by `lastMessageAt desc`, cursor `<ISO>\|<id>` |
| `supportRequest({ threadId })` | one of the same |
| `supportRequestMessages({ threadId, limit, cursor })` | `messagePageReadModel` — `communicationThreadMessages` would refuse the admin as a non-participant |
| `supportOpenCount` | an integer, for the admin nav badge and the dashboard card |
| `supportReply({ threadId, body, attachments? })` | `{ id }` |
| `supportResolve({ threadId })` | `{ threadId, status }` |
| `supportMarkRead({ threadId })` | the count marked |

Read models live in `packages/shared/src/read-models/system/support/`.

### Attachments

Upload is already per uploader and serves the admin unchanged. Download
(`/api/communication/attachments/:id`) re-checks visibility with `findVisible`,
which refuses the admin; it gains a second branch: **admin and the thread is a
support thread**. It is the only HTTP route touched.

### No public fields

The FAQ is static in the frontend; opening a request needs a session.

## Frontend — Help Center

New feature `apps/frontend/web/src/features/help-center/`, layered
`domain / data / viewmodel / ui` under the existing boundaries rule; i18n
namespace `help`.

### Domain

- `faq-content.ts` holds only the **structure**: categories, question ids,
  order, and `popular: true` on the four questions the home screen shows.
  The **text** lives in `help.json` per locale, like the rest of the app, so
  search and the page run over `t()` and a missing locale falls back to en-US
  key by key. Categories: *Reservas*, *Pagamentos*, *Cancelamentos e
  reembolsos*, *Conta*, *Para prestadores*.
- `faq-search.ts`: a pure filter over question + answer, case- and
  diacritic-insensitive; empty query returns everything.

### Viewmodel

- `use-help-center.ts`: global state in a context mounted at the root —
  `open`, `screen: home | faq | requests | new | conversation`,
  `selectedThreadId`, `prefill?: { bookingId, subject }`, and the **current
  audience**: `provider` with that provider's id inside `/provider/$slug/*`,
  `customer` everywhere else. Any button in the app opens the panel through
  this.
- `use-support-requests.ts`: `myThreads(type:'support')` or
  `providerThreads(providerId, type:'support')` by audience; unread total is
  the sum of the page's `unreadCount`s (the launcher badge).
- `use-open-support-request.ts`: the mutation; on success the panel switches
  to the new thread's conversation.

### UI

- `help-launcher`: the floating "?" button, unread badge.
- `help-panel`: `Sheet` from the right on desktop, bottom sheet on mobile;
  returns `null` when closed.
- `help-home`: search, two cards (**Enviar mensagem**, **Os meus pedidos** with
  the badge), the four popular questions, "Ver todas as perguntas".
- `help-faq`: accordion by category, live search.
- `help-requests`: the list — subject, status pill, last message, relative
  time, unread dot.
- `help-new-request`: subject, message, attachments, a booking chip when
  prefilled.
- `help-conversation`: header (subject, status, "Resolvido — responde para
  reabrir" when resolved) over the shared `ThreadView` + `MessageComposer`
  with contact checking off.

Signed out: home and FAQ work; the two cards show "Inicia sessão para falar
com o suporte" with a link to `/sign-in?next=` and `hello@ntizo.com`.

### Mounting

In `routes/__root.tsx`, beside `MobileNav`. Hidden on `/admin/*`, `/book/*`
and `/booking/*/confirm`; shown everywhere else, `/provider/*` and the
booking details page included. On a phone the launcher sits above `MobileNav`
where the bar exists (a `pathname`-driven offset, the same `zoneOwnsChrome`
signal the root already uses).

## Public `/help` page

Prerendered like `/terms` and `/privacy`. Every category with an anchor, a
search box, and at the end "Ainda precisas de ajuda? Contactar suporte",
which opens the panel. `FAQPage` JSON-LD in the head — cheap, and what a
search engine shows under the result.

## Entry points

- **Footer** (`features/landing/ui/footer.tsx`): the *Apoio* column becomes
  "Central de ajuda" (`/help`), "Contactar suporte" (opens the panel), and
  keeps "Precisa de ajuda? hello@ntizo.com".
- **Booking details page** (`routes/booking.$bookingId.details.tsx`): a
  "Precisa de ajuda com esta reserva?" link opening the panel on the new
  request form with the booking prefilled and a suggested subject.

## Messaging inbox changes (`features/messaging`)

- `thread-list` rows for support threads read "Suporte Ntizo · <subject>"
  with a status pill, in `/messages` and `/provider/$slug/messages`.
- `thread-view`: `platform` messages carry the name "Suporte Ntizo".
- `message-composer` gains a prop that turns contact checking off; the inbox
  passes it for support threads.
- `ThreadView` and `MessageComposer` become **presentational** (messages and
  callbacks in, nothing fetched inside) if they are not already — the admin
  page feeds them from different queries. The plan verifies which it is.

## Admin

Feature `features/admin/support/` (`data / viewmodel / ui`), the
`admin/reviews` and `admin/providers` shape.

- `/admin/support`: the queue. Tabs **Abertos / Resolvidos / Todos**, an
  audience filter. Columns: subject, requester (name, or provider name with
  the member who opened), last message, unread, status, opened. Ordered by
  last message; cursor paging.
- `/admin/support/$threadId`: header (subject, requester, provider linked to
  `/admin/providers/$id`, booking id without a link because no admin booking
  page exists, status); the conversation through `supportRequestMessages`
  and the shared `ThreadView`; composer through `supportReply`, attachments
  allowed; **Marcar como resolvido**, with the note that a requester's reply
  reopens. Opening the page calls `supportMarkRead`.
- `adminNavGroups`: **Suporte** after *Utilizadores*, with a
  `supportOpenCount` badge. The dashboard gets a "Pedidos abertos" card.

## `Sheet` becomes modal

Follow-ups #78 and #90 record that `Sheet` and `Dialog` in `@ntizo/frontend-ui`
have no focus trap, no Escape, no focus restore, and a `z-40` backdrop that
`MobileNav` paints over. #90's trigger is "the next component that needs a
dialog". This panel is that component: `Sheet` gains all four here. `Dialog`
is left for whoever touches it next; this closes the `Sheet` half of both
entries.

## i18n and FAQ content

- New namespace `help` in all eight locales; `messaging`, `admin` and
  `notifications` gain keys. `DEFAULT_LOCALE` is `pt-MZ` and the project
  owner reads it, so pt-MZ is **written, not translated**; en-US is written
  too. In the other six, the chrome (~40 short strings) is translated and
  the FAQ text is **left out on purpose**, falling back to en-US — the same
  acceptance follow-up #120 already records for the rest of the app.
- The FAQ text is drafted from what the product does today: fixed packages
  vs hourly vs quote; M-Pesa, e-Mola and card; the commission coming out of
  the provider's payout; cancellation; blocking verification; team and
  invites; notifications. It ships as locale files in the plan with a note
  that **it needs the owner's review before merge** — a wrong answer about
  refunds costs more than a missing one.
- The four email templates follow the existing `pickCopy` (en + pt) pattern.

## Errors

Each with its own code, never a masked `INTERNAL_ERROR`:

| Case | Code |
|---|---|
| Subject empty or over 120 characters | `SUPPORT_SUBJECT_INVALID` |
| Audience `provider` without membership | `SUPPORT_NOT_A_MEMBER` |
| `bookingId` not the requester's | `SUPPORT_BOOKING_NOT_YOURS` |
| Admin field on an id that is not a support thread, or does not exist | `SUPPORT_REQUEST_NOT_FOUND` |
| Resolve on an already-resolved request | `SUPPORT_ALREADY_RESOLVED` |
| An eleventh open request | `SUPPORT_TOO_MANY_OPEN` |
| Body empty, or over 4000 characters | phase 1's validation, unchanged |
| Thread not visible to a participant | phase 1's refusal, indistinguishable from missing |

## Testing

For each assertion, the mutation that would break it — and then running it.

**Domain.** `SupportRequest` refuses an empty or over-long subject, `resolve`
from `resolved`, `reopen` from `open`.

**Commands.** Audience `provider` without membership is refused; another
person's `bookingId` is refused; the eleventh open request is refused; open
writes thread + request + message in one transaction (a failure between the
writes leaves nothing); a requester's reply to a resolved request reopens
it; `hasContact` does **not** run on a support thread and still runs on an
inquiry; an admin reply is written with `sender_side = platform`.

**Security, with a second user** — the defect this codebase has produced four
times is a fixture holding one person's data, which passes whether or not
the check exists: a second customer can neither read nor reply to the
first's request; a member of another provider does not see a provider
request; a non-admin reaches no `support*` field; the `support*` fields do
not return an inquiry even with its real id; attachment download on a
request is allowed to the admin and still refused to a stranger.

**Reads.** `myThreads` excludes provider requests from the personal inbox;
`myThreads(type:'support')` returns only support; unread by side is right in
all three cases (customer; a member whose teammate wrote; the admin); the
admin queue orders by `last_message_at` and the cursor is correct at the
boundary.

**Sweep.** A requester's unread message → one notification **per admin**; an
unread `platform` reply → the requester; an inquiry still raises
`NEW_MESSAGE`; one failing row does not stop the batch.

**Migration.** `sender_side` backfill is right for customer and member
messages; the CHECK refuses an inquiry without `provider_id`.

**Frontend.** `faq-search` ignores diacritics and returns everything for an
empty query; `use-help-center` screen transitions and audience by route; a
closed panel renders nothing; signed out sees the FAQ and the prompt, not the
form; `Sheet` traps focus, closes on Escape, restores focus; the launcher is
absent on `/admin` and `/book`; `/help` renders on the server with the
JSON-LD.

**End to end.** A customer opens a request → the admin sees it in the queue →
replies → the customer sees the reply in the panel and the request in
`/messages`; and the proof that it tests the path, which is that breaking
`send` makes it fail.

## Rollout

- One additive migration with the backfill; four notification types and
  templates; `wrangler.jsonc` unchanged (the sweep already runs).
- Backend before frontend: the new frontend asks for fields the old backend
  does not have.
- No feature flag. The launcher only exposes what is already wired.

## Out of scope, with the trigger that brings each back

Recorded in `docs/superpowers/follow-ups.md` when the plan lands:

- **Feedback** ("Partilhar feedback") as its own context — when the first
  suggestion arrives as a support request.
- **Anonymous requests** with a captcha — when `hello@ntizo.com` receives
  more than a handful of "I cannot sign in" emails a week.
- **FAQ managed by the admin** in the database — when someone who is not a
  developer needs to change an answer.
- **Assignment, categories, SLAs** — when two admins answer the same request.
- **Messaging phase 3**: admin reading customer ↔ provider conversations, and
  the logging/consent decision — at the first moderation need.
- **`Dialog` made modal** — the next component that needs one.
- **FAQ translated** into the remaining six locales — with the rest of
  follow-up #120.

This spec discharges follow-up #71's phase-2 half and the `Sheet` half of
#78 and #90.
