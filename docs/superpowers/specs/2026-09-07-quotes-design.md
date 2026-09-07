# Orçamentos — Design

**Status:** approved in brainstorming, 2026-09-07. Awaiting the owner's review of this document
before a plan is written.

**Mockups:** `2026-09-07-quotes.mockup.html`, next to this file, and published at
<https://claude.ai/code/artifact/7e87fc88-129d-4423-a199-c02140adbf2a>. The Portuguese in it is the
approved pt-MZ copy and is the source the locale files are written from. Where this spec and the
mockup disagree, this spec wins; every disagreement is listed under "Deviations from the mockup".

**Depends on** `2026-09-01-payment-and-confirmation-order-design.md` (the booking's state machine and
the M-Pesa charge sweep), `2026-09-01-customer-checkout-design.md` (the phone requirement and the
two-mutation order), `2026-09-02-provider-bookings-and-dashboard-design.md` (the provider read models,
the reveal rule, the notification port), `2026-08-28-message-attachments-design.md` (the upload
pipeline and the contact detector). All four are built and on `dev`.

## What this is

A provider can already mark a service "por orçamento" (`service.booking_mode = 'quote'`) and configure
what to ask a customer (`service_quote_form`: response hours, ask deadline, ask photos, ask location,
an intro). Today that configuration is read by nothing: the service page shows a sentence and a
"Enviar mensagem" button, and the checkout refuses the service outright (BR8).

This spec builds the path the 2026-08-27 direction document named as step 3: *"The quote path. One
customer, one provider, one proposal. Reuses all of step 2 and adds one thing: the price is agreed
rather than listed."* The customer describes the job, the provider answers with a price, a date and a
duration, the customer accepts, and a booking is born already waiting for M-Pesa. From that moment on
it is a booking like any other.

The direction document's rule stands unchanged: **accepting a proposal is the same act as paying.**
There is no state in which a deal is closed and the money is undecided.

## What exists, and what does not

Stated plainly, from reading the code on 2026-09-07.

- **`service_quote_form` exists and is configured** by the provider's service wizard
  (`step-booking.tsx`, `step-pricing.tsx`). `responseHours` defaults to 48. The public service read
  model does not expose it; only the owner's and the admin's do.
- **The frontend already routes on `bookingMode`.** `serviceDetailPanel` and `servicePriceCell`
  (`features/directory/services/domain/service-card.ts`) return `{ kind: "quote" }` for a quote
  service; `ServiceQuoteNotice` renders the sentence and the message button; `service-row.tsx`
  renders a "Pedir orçamento" button that today links to the service page.
- **Booking refuses quote services by construction.** `CreateBookingCommand` throws
  `ServiceNotBookableError("quote")`; `booking.service_option_id` and `option_name` are `NOT NULL`;
  `Booking.create` requires both non-blank.
- **The booking already knows how to be paid from `PENDING_PAYMENT`.** `Booking.accept` stamps
  `confirmedAt` and `expiresAt = payBy`; `ChargeAcceptedBookingsInternalCommand` pushes the M-Pesa
  prompt to every `PENDING_PAYMENT` booking within its attempt bound and cooldown; `markPaid` moves
  it to `CONFIRMED`; the sweep cancels it with `customer_did_not_pay` when the window lapses and
  tells the provider. None of that cares how the booking reached `PENDING_PAYMENT`.
- **Five notification types are already reserved:** `QUOTE_RECEIVED`, `QUOTE_EXPIRED`,
  `PROVIDER_QUOTE_REQUESTED`, `PROVIDER_QUOTE_ACCEPTED`, `PROVIDER_QUOTE_DECLINED`. No producer.
- **`BOOKING_PATHS` already lists `custom_quote`.** Nothing stores it.
- **Attachments have a pipeline:** upload to the private bucket through
  `POST /api/communication/attachments`, the server sniffing the content type from the bytes, and
  `resolveAttachments` checking through `AttachmentStoragePort.head` that each key exists, was
  uploaded by the requester and has an accepted type. The `attachment` table hangs off `message_id`.
- **The contact detector lives in `packages/shared/src/text/contact-detection.ts`** and refuses
  Mozambican mobile numbers, emails and direct-contact links in message bodies.
- **Cross-context calls go through outbound ports filled at the composition root**, never by importing
  another context's `app/` tree: `disputeThreadOver` hands the booking context the communication
  context's `openSupportRequest`; the booking context raises notifications through
  `RaiseNotificationInternalPort`. The unit of work joins an open transaction (`ensureTransaction`
  over `AsyncLocalStorage`), so a command calling another context's command inside its own
  `atomicExecute` writes both in one transaction.
- **The per-minute cron** (`apps/backend/api/src/scheduled.ts`) already runs three sweeps against
  `expires_at`-style deadlines; the booking one is the model to copy.
- **The console nav** is one schema (`shared/lib/console-nav.ts`), with `count` sources such as
  `bookingRequests`; the phone's tab bar shows the three `primary` items plus Menu.

## Decisions taken, and why

### The proposal is a complete agreement: price, date, time, duration

Decided 2026-09-07 over "price only, date agreed later". A booking without a date breaks every clock
downstream: the payment window is capped at `startsAt`, the close reminder fires at `endsAt`, the
calendar's exclusion constraint needs a range, the dispute window needs an end. A proposal that fixes
all four lets the booking it produces be indistinguishable from a priced one.

### The provider proposes and may revise; the customer accepts or declines

No counter-offers by the customer. A counter-offer flow adds states and screens and moves the right to
set the price to the customer; the conversation that already exists between the pair is where the
haggling happens, if any. A provider who mistyped a price sends a new proposal, and the previous one is
kept as history rather than deleted.

### "Orçamentos" is its own section on both sides

Decided over a tab inside "Reservas" and over cards inside the chat. A quote is not a booking until
it is accepted, and the bookings lists are tabbed by a booking's clocks (waiting / upcoming /
history) that a quote does not have. The chat is per customer↔provider pair, not per request, and
gives the provider no queue of what is owed an answer.

### A bounded context of its own; acceptance creates the booking

`ntizo_quote` is a new schema and `bounded-contexts/quote` a new context. The booking context gains
one entry point, `CreateBookingFromQuoteCommand`, reached from the quote context through an outbound
port. The booking's own state machine is untouched: a quote-born booking starts at `PENDING_PAYMENT`,
exactly where `accept` leaves a priced one, because the provider has already said yes by proposing.

The rejected alternative was new statuses on the booking (`QUOTE_REQUESTED`, `QUOTE_SENT`). It would
make `price_minor`, `starts_at`, `provider_member_id` and the snapshot nullable on a table whose
invariants depend on them being present, and it cannot represent the job-post path the direction
document already names, where several providers answer one request.

### Every step carries a note and attachments

Decided 2026-09-07 ("todos os cenários"). The request, each proposal and every refusal, from either
side, take an optional free-text note and up to five files. One attachment table for the context,
keyed by the step that brought the files. The three free texts pass the shared contact detector and
are refused with the same code a message would be.

The booking's decline chose tokens over free text for translatability and abuse; here the reason
stays a token (rendered in the reader's language) **and** a note is allowed beside it, under the same
detector messages already have. The owner chose to allow the text.

### The address is asked at request time when the provider needs it to price, else at acceptance

A booking past `DRAFT` must carry a complete address (customer checkout spec). The request form asks
for one whenever `askLocation` is on **or** the service's `location_type` is `at_customer` or
`flexible`. Otherwise the accept page asks for it. Two paths, both honest: a provider who does not need
the location to price is not shown one, and a booking is never born without one.

### The provider sees enough to price, not enough to leave

Before acceptance the provider sees: the description, the photos, the deadline, the address's
district and city, and the customer's first name. The street line, the phone and the email appear on
the booking once it is `CONFIRMED`, by the same rule and for the same reason the provider bookings
spec set: the commission comes out of the provider's payout, and the cheapest moment to say "decline
here, call me" is before any money has moved. Enforced in the projection, not in the UI.

### The slot is checked when proposing and arbitrated when accepting

The proposal does not hold the slot. Holding it would block the member's calendar for the proposal's
whole validity, on a table (`booking`) the quote context does not own. Instead:

- `quotePropose` refuses a start that overlaps a slot-holding booking of that member
  (`SlotOverlapReaderPort`, a read against the booking table), so a provider cannot propose a time
  they have already sold.
- `quoteAccept` inserts the booking, and `booking_member_slot_no_overlap` is the final arbiter.

**When the constraint refuses** (the member was booked in the meantime): the acceptance transaction
rolls back whole. In a second transaction the live proposal is marked `superseded_cause = 'slot_taken'`,
the quote returns to `REQUESTED` with a fresh response clock, and the provider is told to propose
again (`PROVIDER_QUOTE_SLOT_TAKEN`). The accept page tells the customer the time is gone and that the
provider was asked for a new time. Nobody is left holding a proposal that can no longer be accepted.

The proposal is not required to fall inside the member's availability grid. The grid exists so that
customers can self-serve; a provider choosing a time for a quoted job is choosing on their own
calendar. It **is** required that the member performs the service (`service_member`) and that the
provider is active.

### One open quote per customer and service

A partial unique index on `(customer_id, service_id) WHERE status IN ('REQUESTED', 'PROPOSED')`. The
mirror of checkout's one-open-draft rule: an ordinary customer changing their mind must not leave five
identical requests in the provider's queue. A second request while one is open is refused with
`QUOTE_ALREADY_OPEN`.

### Notifications are raised after the commit, inside the command

The rule the booking context set (BR-P6), unchanged: `raiseQuietly` after `atomicExecute` resolves, so
nothing is announced that a rollback could take back, and a failing adapter never fails the write.

## The state machine

```
REQUESTED ── provider proposes ─────────▶ PROPOSED
   ├── provider declines ──────────────▶ DECLINED
   ├── customer withdraws ─────────────▶ WITHDRAWN
   └── response window passes ────────▶ EXPIRED   (expired_cause: provider_did_not_respond)

PROPOSED ── customer accepts ───────────▶ ACCEPTED ──▶ booking created at PENDING_PAYMENT
   ├── provider revises ───────────────▶ PROPOSED  (new proposal row; previous superseded: revised)
   ├── provider withdraws the proposal ▶ DECLINED
   ├── customer declines ─────────────▶ REJECTED
   ├── slot taken at acceptance ──────▶ REQUESTED (proposal superseded: slot_taken; new response clock)
   └── validity passes ───────────────▶ EXPIRED   (expired_cause: proposal_lapsed)
```

Seven statuses: two live (`REQUESTED`, `PROPOSED`), five terminal. The terminal ones distinguish who
closed the quote because the lists and the timeline say it in different words. A terminal quote never
reopens; the customer makes a new request.

After `ACCEPTED` the quote is closed. Whatever happens to the booking afterwards (paid, unpaid and
cancelled, disputed) is the booking's story; the quote's detail page links to it and says nothing more.

Every transition refuses a wrong source status with `QuoteTransitionError` (`QUOTE_TRANSITION`), the
way `BookingTransitionError` does.

## Two clocks, both on `expires_at`

| Clock | Length | Runs from | Protects |
|---|---|---|---|
| **Response window** | `service_quote_form.response_hours`, the provider's own promise (default 48 h) | the request is sent, and again when a proposal goes stale | the customer, from a provider who never answers |
| **Proposal validity** | `platform_settings.quote_proposal_validity_hours`, new, LIVE, default 72, capped at the proposed `starts_at` | each proposal is sent (a revision restarts it) | the provider, from a price held open for ever |

`expires_at` carries whichever clock the status stands on and is `NULL` on a terminal quote. A quote
sweep joins the per-minute cron beside the booking and message sweeps: `findDueForSweep` selects
`status IN ('REQUESTED', 'PROPOSED') AND expires_at <= now()`, ordered, limit 200, on a partial index
over those two statuses; one bad row does not stop the batch; expiry is a no-op from any other status.

The validity cap follows `cappedToSlotStart` for the same reason: a proposal for tomorrow at 09:00
cannot be accepted after tomorrow at 09:00.

## The data model

Schema `ntizo_quote`, three tables. Timestamps `timestamptz`; money in minor units as integers.

### `quote`

```
id                  uuid pk
service_id          uuid not null -> ntizo_catalog.service
provider_id         uuid not null -> ntizo_provider.provider
customer_id         text not null -> better_auth.user
thread_id           uuid not null -> ntizo_communication.thread
status              text not null   (the seven above, check constraint)
expires_at          timestamptz null
locale              text not null   (the locale the customer requested in; the booking's service-name snapshot is taken in it)
-- the request
description         text not null
needed_by           date null
address_label, address_line, address_city, address_district, address_directions,
address_lat, address_lng                     -- the booking's seven columns, all null until supplied
-- the close
closed_reason       text null       (token; see below)
closed_note         text null
closed_by_user_id   text null -> better_auth.user
expired_cause       text null       (provider_did_not_respond | proposal_lapsed)
booking_id          uuid null -> ntizo_booking.booking   (set at ACCEPTED)
requested_at, proposed_at, accepted_at, declined_at, rejected_at, withdrawn_at, expired_at
created_at, updated_at
```

- `unique (customer_id, service_id) where status in ('REQUESTED', 'PROPOSED')` — one open quote.
- `index (customer_id, created_at desc, id desc)` — the customer's list.
- `index (provider_id, status, expires_at)` — the provider's tabs and badge.
- `index (expires_at) where status in ('REQUESTED', 'PROPOSED')` — the sweep. Its predicate is
  generated from one constant, `QUOTE_DEADLINE_BEARING_STATUSES`, and a catalogue test reads it back
  from `pg_indexes` in both directions, the way `booking_sweep_idx` is guarded.

`closed_reason` tokens: provider side `not_available`, `cannot_perform`, `outside_area`, `other`;
customer side `too_expensive`, `wrong_time`, `found_elsewhere`, `other`; withdrawal `withdrawn`.
Rendered in the reader's language; an unknown token renders as the generic "fechado".

`thread_id` is `NOT NULL`: the request creates or reuses the pair's inquiry thread through the
communication context's existing idempotent start-thread command, so both sides have a "Conversar"
that lands somewhere. A provider cannot start a thread (the cold-messaging rule); the customer's
request is what starts it.

### `quote_proposal`

```
id                  uuid pk
quote_id            uuid not null -> quote (on delete cascade)
price_minor         integer not null   (>= platform_settings.min_service_price_minor)
currency            text not null default 'MZN'
starts_at           timestamptz not null
duration_minutes    integer not null   (> 0)
ends_at             timestamptz not null   (starts_at + duration; stored for the overlap read)
provider_member_id  uuid not null -> ntizo_provider.provider_member
note                text null
valid_until         timestamptz not null
created_by_user_id  text not null -> better_auth.user
superseded_at       timestamptz null
superseded_cause    text null   (revised | slot_taken)
created_at
```

- `unique (quote_id) where superseded_at is null` — one live proposal per quote.
- `index (quote_id, created_at desc)` — the history.

### `quote_attachment`

```
id             uuid pk
quote_id       uuid not null -> quote (on delete cascade)
proposal_id    uuid null -> quote_proposal (on delete cascade)
step           text not null   (request | proposal | closing)
storage_key    text not null
file_name      text not null
content_type   text not null
size_bytes     integer not null
created_at
```

Same private bucket, same byte-sniffed content type, same limits as messages (10 MB, 5 per step,
JPEG/PNG/WebP/PDF, SVG excluded), same two-phase upload (upload, then send the keys with the mutation),
same `head` verification that the key exists, was uploaded by the requester, and has an accepted
type. A download route of its own, `GET /api/quote/attachments/:id`, session-authed, permission and
existence answered together, `content-disposition: attachment`, `cache-control: private, no-store`.
Readable by the quote's customer, any member of the quote's provider, and an administrator.

### What changes on `booking`

- `service_option_id` and `option_name` become nullable.
- New `quote_id uuid null -> ntizo_quote.quote`.
- New check `booking_origin_exactly_one`: `(service_option_id IS NOT NULL) <> (quote_id IS NOT NULL)`.
- `Booking.createFromQuote(...)`: the same guards as `create` minus the option, plus a required
  address; produces `status = PENDING_PAYMENT`, `confirmedAt = at`, `expiresAt = payBy`. `create`
  itself is unchanged and BR8 stands: the checkout still refuses a quote service.
- `booking_change` gains the reason token `created_from_quote`, so both timelines show where the
  booking came from. `changedByUserId` is the accepting customer.

### What changes on `platform_settings`

- `quote_proposal_validity_hours integer not null default 72`, with a `>= 1` check, LIVE, read through
  the quote context's own `PlatformSettingsReaderPort` alongside `min_service_price_minor`.

## The acceptance, in one transaction

1. The quote context loads the quote and refuses unless: the caller is its customer
   (`QUOTE_NOT_YOURS`); it is `PROPOSED` (`QUOTE_TRANSITION`); the live proposal's `valid_until` is
   ahead (`QUOTE_PROPOSAL_LAPSED`); the customer has a phone number, read through
   `CustomerPhoneReaderPort` (`QUOTE_NO_CUSTOMER_PHONE`); the address is complete, either on the quote
   or supplied now as `addressId` from the address book (`QUOTE_ADDRESS_REQUIRED`).
2. It calls `BookingOpenerPort.openFromQuote(...)`, filled at the composition root with the booking
   context's `CreateBookingFromQuoteCommand`, which: reads the provider snapshot (name, slug, live
   `commission_bps`) and the service name in the quote's locale; refuses an inactive provider, a
   member who no longer performs the service, or a start in the past; computes `payBy = now +
   payment_window_minutes` capped at `starts_at`; inserts the booking (the exclusion constraint is the
   arbiter); appends the `created_from_quote` change row; publishes `BookingCreated`.
3. The quote moves to `ACCEPTED` with `booking_id`; `QuoteAccepted` is published.
4. After the commit: the booking's deadline is scheduled; `PROVIDER_QUOTE_ACCEPTED` goes to the
   provider and `QUOTE_ACCEPTED` (with `payBy`) to the customer. The charge sweep pushes the M-Pesa
   prompt on its next wave; the customer can also press "Pagar agora" on the booking.

The phone is written first by the User context's profile mutation, from the accept page, and
`quoteAccept` is called second, the same order and for the same reason as checkout's step 3.

## Ports and wiring

Outbound ports of the quote context, each filled at the composition root:

| Port | Filled by | Used for |
|---|---|---|
| `QuoteServiceReaderPort` | Catalog (Drizzle reader) | the service: published, `quote` mode, provider id, location type, the quote form, name in a locale, member ids that perform it |
| `ProviderMemberReaderPort` | Provider | `isMember(providerId, userId)` |
| `StartThreadPort` | Communication's start-thread command | the pair's thread id |
| `AttachmentStoragePort` | the existing R2 adapter | `head(storageKey)` |
| `BookingOpenerPort` | Booking's `CreateBookingFromQuoteCommand` | acceptance |
| `SlotOverlapReaderPort` | Booking (Drizzle reader over `booking`) | `overlaps(memberId, startsAt, endsAt)` against `SLOT_HOLDING_STATUSES` |
| `PlatformSettingsReaderPort` | Platform | `findQuoteProposalValidityHours()`, `findMinServicePriceMinor()` |
| `CustomerPhoneReaderPort` | User | acceptance refuses a customer without one |
| `RaiseNotificationInternalPort` | Notification's raise command | every announcement |

Commands: `RequestQuoteCommand`, `ProposeQuoteCommand`, `DeclineQuoteCommand` (provider),
`RejectQuoteCommand` (customer), `WithdrawQuoteCommand` (customer), `AcceptQuoteCommand`,
`MarkProposalStaleInternalCommand` (the slot-taken path), `SweepQuoteCommand`,
`SweepDueQuotesInternalCommand`. Each writes through the repository's compare-and-swap
`save(quote, expectedStatus)`, so two members pressing "Enviar proposta" at once produce one proposal.

Booking context: `CreateBookingFromQuoteCommand`, the `booking.quote_id` column, and
`Booking.createFromQuote`. Nothing else.

Catalog: the public `serviceById` read gains `quoteForm` (intro, askDeadline, askPhotos,
askLocation, responseHours) for quote services, `null` otherwise.

## Events, through the outbox

`QuoteRequested`, `QuoteProposed { revision: boolean }`, `QuoteAccepted { bookingId }`,
`QuoteDeclined`, `QuoteRejected`, `QuoteWithdrawn`, `QuoteExpired { cause }`,
`QuoteProposalStale { cause: 'slot_taken' }`. Aggregate type `quote`.

## Notifications

Five types exist; five are new. Raised after the commit, inside the command, `raiseQuietly`.
Payloads carry ids and the facts a template needs (`quoteId`, `serviceName`, `providerName` or
`customerFirstName`, `priceMinor`, `currency`, `startsAt`, `validUntil`, `respondBy`, `payBy`,
`bookingId`), never a phone, an email or a street line.

| When | Audience | Type | Email |
|---|---|---|---|
| request sent | provider | `PROVIDER_QUOTE_REQUESTED` | yes |
| proposal sent or revised | customer | `QUOTE_RECEIVED` | yes |
| provider declines | customer | `QUOTE_DECLINED` (new) | yes |
| customer declines | provider | `PROVIDER_QUOTE_DECLINED` | no |
| customer withdraws | provider | `PROVIDER_QUOTE_WITHDRAWN` (new) | no |
| accepted | provider | `PROVIDER_QUOTE_ACCEPTED` | yes |
| accepted | customer | `QUOTE_ACCEPTED` (new), with `payBy` | yes |
| response window lapsed | customer | `QUOTE_EXPIRED` | yes |
| proposal validity lapsed | provider | `PROVIDER_QUOTE_EXPIRED` (new) | no |
| slot taken at acceptance | provider | `PROVIDER_QUOTE_SLOT_TAKEN` (new) | yes |

A type without a template is an in-app row, by the registry's existing rule.

## The GraphQL surface

Private mount, session-authed, flattened names as everywhere else. Reads take no user id; "not
yours" and "does not exist" return the same `null`. Writes refuse explicitly with their own codes.

Reads:

| Field | Shape |
|---|---|
| `quoteMine(tab: open \| history, limit, offset)` | `customerQuotePageReadModel` (items + counts per tab) |
| `quoteById(quoteId)` | `customerQuoteDetailReadModel \| null`: request, live proposal, superseded proposals, closing reason and note, attachments per step, `threadId`, `bookingId` |
| `quoteForProvider(providerId, tab: toAnswer \| waiting \| history, limit, offset)` | `providerQuotePageReadModel` |
| `quoteByIdForProvider(providerId, quoteId)` | `providerQuoteDetailReadModel \| null`, address reduced to district and city, customer reduced to first name and completed-bookings count |
| `quoteCountsForProvider(providerId)` | `{ toAnswer }`, for the sidebar badge |

Writes:

| Field | Input | Who | From |
|---|---|---|---|
| `quoteRequest` | `{ serviceId, description, neededBy?, addressId?, attachments?, locale }` → `{ quoteId }` | signed-in customer | — |
| `quotePropose` | `{ quoteId, priceMinor, startsAt, durationMinutes, providerMemberId, note?, attachments? }` | member of the provider | `REQUESTED`, `PROPOSED` |
| `quoteDecline` | `{ quoteId, reason, note?, attachments? }` | member of the provider | `REQUESTED`, `PROPOSED` |
| `quoteReject` | `{ quoteId, reason, note?, attachments? }` | the customer | `PROPOSED` |
| `quoteWithdraw` | `{ quoteId, note?, attachments? }` | the customer | `REQUESTED` |
| `quoteAccept` | `{ quoteId, addressId? }` → `{ bookingId, payBy }` | the customer | `PROPOSED` |

Errors, each with its own code: `QUOTE_NOT_FOUND`, `QUOTE_NOT_YOURS`, `QUOTE_TRANSITION`,
`QUOTE_SERVICE_NOT_QUOTABLE` (not published, or not `quote` mode), `QUOTE_ALREADY_OPEN`,
`QUOTE_PROPOSAL_LAPSED`, `QUOTE_SLOT_TAKEN`, `QUOTE_SLOT_OVERLAP` (at proposal time),
`QUOTE_PRICE_BELOW_MINIMUM`, `QUOTE_NO_CUSTOMER_PHONE`, `QUOTE_ADDRESS_REQUIRED`,
`QUOTE_MEMBER_CANNOT_PERFORM`, `QUOTE_STARTS_IN_PAST`, `QUOTE_DURATION_INVALID`, the attachment
codes messages already use, and the contact-detected code messages already use. Never a masked
`INTERNAL_ERROR`.

Authorisation: the customer side is `quote.customer_id`; the provider side is any
`provider_member` of `quote.provider_id`; an administrator may read. The read filters sit inside the
query, as `findForCustomer` does. **Proven with a second user in the tests.**

## The screens

All copy is in the mockup. Routes and navigation:

**Customer**

- The service page's quote panel (`ServiceQuoteNotice`) becomes: the question, "Pedir orçamento"
  (primary, links to the request), "Enviar mensagem" (text). The listing row's existing
  "Pedir orçamento" button links to the request page instead of the service page.
- `/quote/$serviceId` — the request. Signed-in only; an anonymous visitor signs in and returns. Fields
  per the quote form and the address rule above. The provider's intro from the form sits above the
  fields.
- `/quotes` — "Os meus orçamentos", two tabs. Enters the customer nav beside "Reservas", in the header
  and in the user menu.
- `/quotes/$quoteId` — the detail: the live proposal first, then the request, then the history
  (superseded proposals with the provider's note, refusals with reason and note). Actions by status:
  Aceitar, Recusar, Retirar, Conversar. Accepted: the booking link.
- `/quotes/$quoteId/accept` — summary, phone (the `msisdn` normaliser), address when missing, one
  button. The page handles `QUOTE_SLOT_TAKEN` with its own copy and no button.

**Provider**

- Sidebar: "Orçamentos" between "Reservas" and "Mensagens", `count: "quoteRequests"` fed by
  `quoteCountsForProvider`. On the phone's tab bar it is `primary`, in place of "Disponibilidade",
  which moves to the menu sheet: a request with a 48-hour clock is owed sooner than a week of
  availability is. `PRIMARY_TAB_COUNT` stays 3.
- `/provider/$slug/quotes` — three tabs, the owed ones first.
- `/provider/$slug/quotes/$quoteId` — the request at full size on the left; the proposal form on the
  right with the split (`o cliente paga / comissão / recebe`) computed from the provider's own
  `commission_bps`, which the console shell already loads. "Recusar pedido" opens the dialog. With a
  live proposal the page shows it as the customer sees it, "válida até", and "Rever proposta".

**Both:** the web feature follows the house layout, `features/quotes/{data,domain,viewmodel,ui}` and
`features/provider/quotes/{…}`. A new `quotes` locale namespace in all eight locales, registered in
`i18n.ts` and in the parity test's `NAMESPACES`; pt-MZ written from the mockup, not translated.

## Business rules

- **BR-Q1** A quote may be requested only for a `published` service in `quote` mode, by a signed-in
  customer, and only while that customer has no open quote for that service.
- **BR-Q2** The request's description, a proposal's note and a closing note are refused when the
  contact detector matches, with the code messages use.
- **BR-Q3** A proposal's price is at least `min_service_price_minor`; its start is in the future; its
  duration is a positive whole number of minutes; its member performs the service; its window does not
  overlap a slot-holding booking of that member.
- **BR-Q4** A revision supersedes the live proposal (`revised`) and restarts the validity clock. The
  superseded row is never edited or deleted.
- **BR-Q5** Acceptance requires a customer phone number and a complete address, creates the booking
  and closes the quote in one transaction, and raises nothing until that transaction commits.
- **BR-Q6** A slot refusal at acceptance leaves the quote at `PROPOSED` in that transaction; the
  follow-up transaction marks the proposal `slot_taken` and returns the quote to `REQUESTED` with a
  fresh response clock.
- **BR-Q7** Expiry is idempotent: a sweep that finds a quote already moved on does nothing.
- **BR-Q8** Before `CONFIRMED` on the resulting booking, the provider's projections carry no street
  line, phone or email for the customer.
- **BR-Q9** Only the quote's customer, a member of its provider, or an administrator may read it; only
  the named side may perform each write.
- **BR-Q10** A notification that fails to raise never fails the write, and is logged with the quote id.

## Explicitly out of scope

- **The admin zone.** No quotes list or statistics; follow-up. Administrators can read through the
  existing role bypass on the provider reads, which is enough for support today.
- **Job posts** (one request, several providers). The direction document's step 4; this context is
  shaped so that path can reuse `quote_proposal`, and nothing more is done for it now.
- **Reschedule after acceptance.** The booking's own concern, still unbuilt.
- **Counter-offers by the customer.** Decided against; the thread is the venue.
- **A quote card inside the conversation.** The thread and the quote link to each other; a rendered
  card in the chat is a later nicety.
- **Provider-set validity per proposal.** One platform setting for now.
- **Refunds.** Still the booking's and Payment's, unchanged by this spec.

## Open questions this spec does not settle

1. **Whether `askDeadline`, `askPhotos` and `askLocation` make their fields required or merely
   shown.** This spec shows them and keeps them optional, except the address under the rule above. If
   a provider's "ask photos" should mean "no photos, no request", that is a one-line change in the
   request command and the form.
2. **Whether a provider should be able to propose a start outside their availability grid.** Allowed
   here; the alternative is `SlotValidityReaderPort` with `slot_not_offered` enforced, which would
   refuse a Sunday job the provider is happy to take.

## Testing

- **Aggregate:** every transition from every status, allowed and refused; the two expiry causes;
  supersession never mutating the previous proposal; validity capped at the start.
- **Commands, against fakes:** each authorisation with a second user who must be refused; the
  one-open-quote rule with an existing open quote on the same service and a different one; the contact
  refusal on each of the three texts; the proposal's overlap refusal, asserted on the port call; the
  acceptance's phone and address refusals with a fixture that lacks each; the slot-taken path,
  asserting the quote is `REQUESTED`, the proposal `slot_taken`, and the provider notified.
- **Integration, against the real database:** acceptance writes the booking and the quote in one
  transaction, and a constraint refusal leaves neither; the sweep index predicate matches the constant
  in both directions; the `booking_origin_exactly_one` check refuses a row with both or neither.
- **Sweep:** a due `REQUESTED` expires with `provider_did_not_respond`, a due `PROPOSED` with
  `proposal_lapsed`, a moved-on row is untouched, a bad row does not stop the batch.
- **Web:** view models against fakes; the request form's field visibility from the quote form and the
  location type; the accept page's phone ordering (profile mutation before `quoteAccept`); the
  provider form's split arithmetic at the rounding boundary; locale parity across the eight files.
- **End to end:** one customer requests, one provider proposes, the customer accepts, and a
  `PENDING_PAYMENT` booking with `quote_id` appears in both bookings lists. Breaking the acceptance
  must make it fail.

## Phasing

Two plans on one branch, in order:

1. **Backend.** The context, its schema and migration, the booking's from-quote entry, the catalog's
   public `quoteForm`, the sweep, the notifications and their templates, the GraphQL surface, the
   attachment download route. Complete and tested before the web starts, so no screen calls a
   mutation that does not exist.
2. **Web.** The service page and listing entry, the five customer routes, the two provider routes,
   the nav on both sides, the locale namespace.

The checkout spec's lesson stands: a mutation nobody can call and a screen with no mutation behind it
are the same kind of unfinished, so neither plan is "done" until the other lands.

## Deviations from the mockup

None recorded. The mockup draws the provider pages borderless inside the approved console shell; if
the console keeps its cards when the web plan reaches it, the same rows sit inside one card and the
rest of the drawing stands.

## What this costs in already-shipped work

- `booking`: two columns nullable, one column and one check added, one migration.
- `Booking`: one factory added; `create` untouched.
- `platform_settings`: one column.
- `serviceById`: one nullable field.
- `console-nav.ts`: one item, one count source, and "Disponibilidade" losing `primary`.
- `ServiceQuoteNotice` and `service-row.tsx`: a link each.
- `NotificationType`: five values, and templates for the six emailed types.

Untouched: the booking's state machine, its sweeps, the charge, the snapshot, `booking_change`'s
shape, seats and the exclusion constraint, messaging, and every existing read model.
