# Provider Bookings, and the Dashboard They Feed — Design

**Status:** draft for review, 2026-09-02.

**Depends on** `2026-09-01-payment-and-confirmation-order-design.md` (built and deployed) and
`2026-09-01-customer-checkout-design.md` (built and deployed). The checkout spec ends with:
*"The provider's inbox — its own spec, next. Until it exists, a submitted request can only be
accepted by hand."* This is that spec. It also covers the dashboard, because every number a
dashboard could honestly show comes from the same read this spec introduces.

## What this is

The request: *"Na parte do Provider, vamos começar a melhorar as páginas do portal, a página
dos detalhes, dos bookings, etc."* — with three doazores screens as the reference: a dashboard
of KPI cards over a chart and a recent-bookings table; a bookings table (guest, activity, date,
price, status); and a booking detail with a header (guest, status, reference, actions), sections
(briefing, guest, questions) and a rail (money, timeline, technical details).

Three provider screens, in the order a provider meets them:

1. **Reservas** — the list, with the requests that need an answer on top.
2. **A reserva** — one booking: what, when, where, for whom; accept or decline while it is
   waiting; the money and the timeline beside it.
3. **Visão geral** — the dashboard, with real numbers instead of the six hardcoded zeros it
   shows today.

## What exists, and what does not

Stated plainly, because the reference screens suggest more is in place than is.

- **No provider-side booking read exists.** `bookingMine` and `bookingById` resolve the customer
  from the session; the repository port has `listForCustomer` and `findForCustomer` and nothing
  else. A provider cannot see a request made to them, on any screen, by any query.
- **`AcceptBookingCommand` and `DeclineBookingCommand` exist and are tested** (`AWAITING_PROVIDER →
  PENDING_PAYMENT` / `→ DECLINED`, membership checked through `ProviderMemberReaderPort`, a
  `booking_change` row written). Nothing mounts them: no GraphQL field, no route. The checkout
  spec left them for this one.
- **The booking context emits seven events and nobody outside it listens.** `BookingSubmitted`,
  `BookingAccepted`, `BookingDeclined`, `BookingPaid`, `BookingCancelled`, `BookingExpired`,
  `BookingCreated` — no notification is raised for any of them. The notification type enum already
  names the rows this spec needs (`PROVIDER_BOOKING_RECEIVED`, `BOOKING_DECLINED`,
  `BOOKING_CONFIRMED`, …); the relay was never wired.
- **`booking_change` is the timeline and is exposed nowhere.** It carries `changedAt`,
  `changedByUserId` (null for a machine hop), and a machine `reason` token. The full token set today:
  `submitted_by_customer`, `accepted_by_provider`, `checkout_hold_expired`,
  `provider_did_not_respond`, `customer_did_not_pay`, `superseded_by_new_draft`,
  `member_cannot_perform_service`, `provider_not_active`, `slot_not_offered`, `starts_at_in_past`.
- **The overview page has no query.** Six `StatCard`s with hardcoded English labels and zeros.
  `provider.json` already holds unused `bookings` and `revenue` keys.
- **No chart library** anywhere in the monorepo. `ProgressRing` is the only drawn data component.
- **What does exist with real data:** the wallet (`walletForProvider`), services (`serviceMine`,
  counted client-side), unread messages (`communicationProviderThreads` carries `unreadCount` per
  thread), notifications, the provider detail the shell already loads, and the public
  `reviewByProvider` summary (average, count, histogram).
- **Nothing marks a booking done.** `Booking` has `markPaid`, `submit`, `accept`, `decline`,
  `expire`, `cancel`. `MARKED_DONE` is in the enum with no transition behind it. Decided
  2026-09-02: **out of this spec.** It touches the payment window and the wallet release, and it
  is a spec of its own.

## Decisions taken, and why

### One read model for the provider, not the customer's with a different filter

`bookingReadModel` is the customer's view: it carries `providerName`, `providerVerified`,
`providerRatingAverage` — facts about the other party, for a person deciding whether to trust
them. The provider needs the mirror image: who the customer is, which member of the workspace is
booked, what the platform keeps and what the provider receives. Reusing the customer DTO would
mean either fields that are meaningless on one side or two nullable halves in one shape.

So: **`providerBookingReadModel`** for the list and **`providerBookingDetailReadModel`** for one
booking, in `packages/shared/src/read-models/system/booking/`, beside the existing schema.

### The customer's contact details are revealed at `CONFIRMED`, not before

The provider decides whether to accept from **the service, the time, the length, the bairro and
the city, and the customer's note** — everything that bears on "can I do this job, there, then".
The phone number, the email and the exact street line appear once the booking is `CONFIRMED`,
which under confirm-first means once the customer has paid.

The reason is the commission model (`project_payment_model`): the commission comes out of the
provider's payout, so a provider who has the customer's number before any money has moved has
every incentive to say "decline here, call me". A `PENDING_PAYMENT` booking is exactly the window
in which that is cheapest. Revealing at `CONFIRMED` closes it without hiding anything the provider
needs to decide.

The rejected alternative is the doazores model, where the guest's email and phone show on every
booking. That marketplace is paid up front; the provider there never holds an unpaid commitment.

**The rule is enforced in the projection, not in the UI:** `customerPhone`, `customerEmail` and
`addressLine` are `null` on the wire until the booking is `CONFIRMED` or later. A screen cannot
leak what it was never sent.

### Authorisation at the edge, as the wallet does it

The wallet read is the precedent for a provider-scoped read: the handler checks
`role === "admin" || providerRead.isMember(providerId, requesterUserId)` and only then runs the
projection. The list and the stats do the same. The detail read filters on `provider_id` *inside
the query* as well, the way `findForCustomer` does, so the answer to "not yours" and "no such
booking" is the same `null`.

`bookingAccept` and `bookingDecline` need no handler check beyond "signed in": the commands
already refuse a caller who is not a member of the booking's provider, and refuse any state other
than `AWAITING_PROVIDER`. The handler passes `requesterUserId` from the session and nothing from
the client that names a person.

### Decline carries a reason token, chosen from a short list

`DeclineBookingInput.reason` is optional and defaults to `declined_without_reason`. The screen
offers four: `not_available`, `cannot_perform`, `outside_area`, `other`. Tokens, not free text —
the customer's inbox row and the timeline render them in the customer's language, and a free-text
reason would be untranslatable and, on a marketplace, occasionally abusive. "Other" says nothing
more than the default and exists so a provider is never forced to lie with a reason that is not
theirs.

### The timeline is `booking_change` plus the booking's own timestamps

`booking_change` records the transitions the aggregate chose to record, with a reason. The
booking row records `createdAt`, `confirmedAt`, `declinedAt`, `cancelledAt`, `completedAt`,
`expiredAt`. The timeline is the union: every change row, plus `createdAt` as the first entry
and `expiresAt`/`respondBy` as a *future* entry while the booking is waiting. Each entry:

```
{ at: ISO, reason: token, actor: "customer" | "provider" | "system" }
```

`actor` is derived, not stored: `changedByUserId` null → `system`; equal to the booking's
`customerId` → `customer`; anything else → `provider`. The client translates `reason`; a token it
does not know renders as the generic "Estado alterado" rather than failing, because the aggregate
will grow tokens faster than eight locale files are edited.

### Notifications: the booking context raises them through a port, as messaging does

The communication context owns a `RaiseNotificationInternalPort` and is handed the notification
context's `RaiseNotificationInternalCommand` at bootstrap — an outbound port on the caller's side,
the concrete command injected, no import across `app/` trees. The booking context gets the same
port and the same wiring. The commands raise:

| When | Audience | Type |
|---|---|---|
| `SubmitBookingCommand` succeeds | provider | `PROVIDER_BOOKING_RECEIVED` |
| `AcceptBookingCommand` succeeds | customer | `BOOKING_ACCEPTED` **(new enum value)** |
| `DeclineBookingCommand` succeeds | customer | `BOOKING_DECLINED` |
| the charge lands (`markPaid`) | customer | `BOOKING_CONFIRMED` |
| the charge lands (`markPaid`) | provider | `PROVIDER_BOOKING_CONFIRMED` **(new enum value)** |
| the payment window lapses | provider | `PROVIDER_BOOKING_CANCELLED_BY_CUSTOMER`, payload `reason: customer_did_not_pay` |

`BOOKING_ACCEPTED` is new because under confirm-first acceptance and confirmation are different
moments with different asks: "the provider said yes — the payment prompt is on its way to your
phone" is not "your booking is confirmed". `PROVIDER_BOOKING_CONFIRMED` is new because the
provider who accepted must learn the money arrived before they set out.

Payloads carry ids and the facts the template needs (`bookingId`, `serviceName`, `startsAt`,
`timezone`, `customerFirstName` or `providerName`, `priceMinor`, `currency`), never a phone or
an address — an email is a copy that outlives the reveal rule.

Raised **after** the write commits and **inside** the command, not from an event subscriber:
there is no subscriber infrastructure in this codebase, and messaging's `notifyUnread` is the
precedent for a command that raises directly. A failure to raise is logged and does not roll the
booking back — a request that was accepted and not announced is recoverable; one that was
un-accepted because an email adapter hiccuped is not.

### The dashboard is one aggregate query plus what the zone already fetches

**`bookingStatsForProvider`** returns, in one round trip:

```
{
  awaitingResponse: number,          // AWAITING_PROVIDER, any date
  awaitingPayment: number,           // PENDING_PAYMENT
  upcomingToday: number,             // CONFIRMED, startsAt within today (provider's zone)
  upcomingWeek: number,              // CONFIRMED, startsAt within the next 7 days
  completedLast30: number,
  declinedLast30: number,
  revenueLast30Minor: number,        // Σ (priceMinor − commissionMinor) over COMPLETED, last 30 days
  pipelineMinor: number,             // Σ (priceMinor − commissionMinor) over CONFIRMED with startsAt ≥ now
  currency: string,
  perDay: { date: "YYYY-MM-DD", requests: number, confirmed: number }[]   // last 30 days, inclusive
}
```

Revenue is **the provider's share**, never the listed price: the commission comes out of the
payout (`project_payment_model`), and a dashboard that showed the gross would show money the
provider does not receive. "Pipeline" is the same share over what is confirmed and still ahead.
Both are sums of columns the booking row already holds (`price_minor`, `commission_minor`); the
wallet ledger is not consulted, because nothing writes to it yet.

Everything else on the dashboard is already available: services by status from `serviceMine`
(counted client-side, as the services page does), unread messages summed from
`communicationProviderThreads`' first page, the rating from the public `reviewByProvider`
summary, and the recent-bookings table from `bookingForProvider` with `limit: 8`.

### The chart is drawn, not imported

Thirty days of two counts is a bar chart with sixty bars. Inline SVG, sized by the numbers,
themed by the tokens, no dependency. A charting library would be the largest package in the web
app for one figure. The `dataviz` skill governs the drawing when the plan reaches it.

### "Reservas" enters the sidebar first, with a badge

`nav.work` becomes: Reservas, Visão geral, Serviços, Mensagens, Disponibilidade, Actividade. The
badge is `awaitingResponse` from the stats query, which the shell caches; it is the one number a
provider must not miss, and the bell already shows a count for everything else.

## The screens

### Reservas — the list

```
Reservas                                                   [ Pesquisar cliente ou serviço ]
[ Pedidos (3) ] [ Próximas ] [ Histórico ]                     Profissional: [ Todos ▾ ]

CLIENTE              SERVIÇO · PROFISSIONAL       QUANDO                 PREÇO      ESTADO
Ana                  Corte de cabelo · Célia      qui, 4/09 · 11:00      800 MZN    ● Por responder · 1h42
Bruno                Limpeza profunda · Qualquer  sáb, 6/09 · 09:00      2 500 MZN  ● Confirmada
…
                                                                  A mostrar 8 de 23  [ Mais ]
```

- **Three tabs, by what the provider has to do.** *Pedidos* is `AWAITING_PROVIDER`, newest
  first, each row carrying how long is left to answer. *Próximas* is `PENDING_PAYMENT` and
  `CONFIRMED` with `startsAt` ahead, soonest first. *Histórico* is everything else, most recent
  first. A tab, not a status filter with ten values: the provider's question is "what needs me",
  and ten statuses are the system's vocabulary, not theirs.
- **Search** matches the customer's first name and the service name, server-side (`q`). The
  member filter narrows to one professional; an individual provider has no member filter.
- **Rows are the `CollectionCard` shape** — a table from `md`, stacked cards below — because the
  services and members pages already use it and a third table primitive would be a third one to
  keep in step. The status chip is the kit's `Badge`, with the tone map below.
- **Empty states name the tab:** "Nenhum pedido por responder" is good news and reads as such;
  "Ainda sem reservas" on Histórico links to the services page.

Status → chip tone:

| Statuses | Tone | Label (pt) |
|---|---|---|
| `AWAITING_PROVIDER` | warning | Por responder |
| `PENDING_PAYMENT` | info | À espera de pagamento |
| `CONFIRMED` | success | Confirmada |
| `MARKED_DONE`, `COMPLETED` | neutral | Concluída |
| `DECLINED` | danger | Recusada |
| `CANCELLED`, `EXPIRED` | neutral | Cancelada / Expirada |
| `DRAFT`, `DISPUTED` | never listed / danger | — / Em disputa |

`DRAFT` is a customer's private draft and is never a row on the provider's side: the slot is
held, but nobody has asked them anything yet.

### A reserva — the detail

```
← Reservas

Ana                     ● Por responder      #A1B2C3D4        [ Recusar ]  [ Aceitar ]
Corte de cabelo · Padrão · Célia
Responder até hoje, 16:42 (1h42)

┌ Marcação ──────────────────────────────┐   ┌ Dinheiro ────────────────────┐
│ Quando      qui, 4 de setembro, 11:00   │   │ Preço            800,00 MZN  │
│ Duração     45 min                      │   │ Comissão (10%)   −80,00 MZN  │
│ Onde        Em sua casa · Polana, Maputo│   │ A receber        720,00 MZN  │
│ Com         Célia                       │   └──────────────────────────────┘
└─────────────────────────────────────────┘   ┌ Linha temporal ──────────────┐
┌ Cliente ───────────────────────────────┐   │ ● Pedido enviado  hoje 14:42 │
│ Ana                                     │   │ ○ Responder até   hoje 16:42 │
│ Contacto e morada exacta depois de a    │   └──────────────────────────────┘
│ reserva estar confirmada e paga.        │   ┌ Detalhes técnicos ▸ ─────────┐
└─────────────────────────────────────────┘   └──────────────────────────────┘
┌ Nota do cliente ───────────────────────┐
│ Portão azul, terceiro andar.            │
└─────────────────────────────────────────┘
```

- **The header is the decision.** Name, status, a short reference (the first eight characters of
  the id, uppercased — enough to say over the phone, not a second id), the two actions while the
  booking is `AWAITING_PROVIDER`, and the deadline. After the decision the actions leave and the
  header keeps the record.
- **Accept** is one press with no dialog: the command is idempotent against state, and the page
  says what happens next ("Enviámos o pedido de pagamento ao cliente"). **Decline** opens a small
  dialog with the four reasons, because a decline is the one action here the customer feels.
- **Cliente** shows the first name always, and the phone, email and street line only from
  `CONFIRMED`, with one sentence saying why until then. The sentence is the product decision made
  visible, so a provider does not read the absence as a bug.
- **Dinheiro** is the provider's arithmetic: listed price, commission at the workspace's rate,
  what they receive. This is the one screen where the commission is shown as a line — the customer
  never sees it (`confirm-page.test.tsx` pins that), the provider must.
- **Linha temporal** is the `booking_change` union above, drawn as the settings page draws a rail:
  a dot per hop, the future hop hollow.
- **Detalhes técnicos** is collapsed: booking id, service option id, member id, payment reference
  when there is one. For support conversations, not for the provider's day.
- The layout is `settings-shell.tsx`'s `Section` and a two-column grid from `lg`, the same frames
  step 2 of checkout and the settings page already use.

### Visão geral — the dashboard

```
Boa tarde, Estúdio Mavalane                                      [ Ver reservas → ]

┌ Por responder ─┐ ┌ Próximos 7 dias ┐ ┌ Receita (30 dias) ┐ ┌ Avaliação ─────┐
│ 3               │ │ 5               │ │ 12 400 MZN        │ │ 4,7 ★ (28)     │
│ Responder →     │ │ 2 hoje          │ │ + 6 300 confirmados│ │ Ver avaliações │
└─────────────────┘ └─────────────────┘ └───────────────────┘ └────────────────┘

┌ Pedidos e confirmações, últimos 30 dias ──────────────────────────────────────┐
│ ▂▃▁▅▂▇▃▂ … (two series, drawn)                                                │
└───────────────────────────────────────────────────────────────────────────────┘

┌ Reservas recentes ───────────────────────────────────────────── Ver todas → ┐
│ (the list's row shape, 8 rows, no tabs)                                      │
└──────────────────────────────────────────────────────────────────────────────┘

┌ Serviços ──────────────┐ ┌ Mensagens ────────────┐
│ 4 publicados · 1 rasc. │ │ 2 por ler             │
└────────────────────────┘ └───────────────────────┘
```

- **The first card is the only one with a verb**, because it is the only number that is a task.
  The rest are readings.
- **Revenue is the provider's share** (above). The second line is the pipeline.
- **The greeting is the page header the shell already draws** (`usePageHeader`), with the
  hardcoded English subtitle replaced by a translated one. No "PROVIDER DASHBOARD" eyebrow — the
  reference has one; this app's rule against decorated eyebrows stands.
- The doazores donuts (published / confirmed / onboarding) are not reproduced: two of the three
  are already cards above, and a ring around a single number is a ring.

## The data model

### `providerBookingReadModel` (the list row)

```
id, status, createdAt,
serviceId, serviceName, optionName, durationMinutes, locationType,
providerMemberId, memberFirstName,           // null when "anyone" was booked
customerFirstName,                           // never null; "Cliente" when the profile has none
startsAt, endsAt, timezone,
addressDistrict, addressCity,                // the coarse location, always
priceMinor, commissionBps, commissionMinor, currency,
respondBy                                    // non-null only while AWAITING_PROVIDER
```

### `providerBookingDetailReadModel` (one booking)

Everything above, plus:

```
addressLabel, addressLine, addressDirections,   // addressLine null before CONFIRMED
customerPhone, customerEmail,                   // null before CONFIRMED
description,                                    // the customer's note
paymentRef,                                     // null until a charge exists
expiresAt,
timeline: { at, reason, actor }[]
```

### `providerBookingStatsReadModel`

As in the dashboard decision above.

### Enum additions (`packages/shared`)

`NotificationType.BookingAccepted = "BOOKING_ACCEPTED"`,
`NotificationType.ProviderBookingConfirmed = "PROVIDER_BOOKING_CONFIRMED"`.

A `BOOKING_DECLINE_REASONS` constant: `not_available | cannot_perform | outside_area | other`.

## The GraphQL surface

All under the session endpoint. Wire names follow the kit's flattening.

| Field | Input | Output |
|---|---|---|
| `bookingForProvider` | `{ providerId, tab: "requests" \| "upcoming" \| "history", q?, memberId?, limit? (≤50), offset? }` | `{ items: providerBookingReadModel[], total, nextOffset }` |
| `bookingByIdForProvider` | `{ providerId, bookingId }` | `providerBookingDetailReadModel \| null` |
| `bookingStatsForProvider` | `{ providerId }` | `providerBookingStatsReadModel` |
| `bookingAccept` | `{ bookingId }` | `{ bookingId, status, paymentWindowEndsAt }` |
| `bookingDecline` | `{ bookingId, reason? }` | `{ bookingId, status }` |

`providerId` is explicit on the reads, as it is on the wallet's: a person may belong to several
workspaces, and the shell knows which one is active. `total` is returned because the table shows
"a mostrar 8 de 23"; `nextOffset` because the wallet's page-plus-one is the pagination precedent.

## Ports and wiring

- `read/booking`: the port gains `listForProvider(providerId, filter, limit, offset)`,
  `countForProvider(providerId, filter)`, `findForProvider(bookingId, providerId)`,
  `timelineFor(bookingId)`, `statsForProvider(providerId, now)`. Three new projections beside
  the two existing ones. The repository joins `profile` (customer first name, phone) and `user`
  (email) on `customer_id`, `provider_member` → `profile` on `provider_member_id`, and
  `booking_change` for the timeline. The reveal rule is applied in `to-provider-booking-dto.ts`,
  a sibling of `to-booking-dto.ts`.
- `write/booking`: two new mutations in the schema, two `.handle` calls that pass
  `requesterUserId` from the session to the existing commands.
- `bounded-contexts/booking`: an outbound `RaiseNotificationInternalPort` (a copy of
  communication's, not an import — tiers do not import each other's `app/`), injected at
  bootstrap; `SubmitBookingCommand`, `AcceptBookingCommand`, `DeclineBookingCommand`, the charge
  landing and the payment-window sweep call it as in the table above.
- `bounded-contexts/notification`: templates for `PROVIDER_BOOKING_RECEIVED`, `BOOKING_ACCEPTED`,
  `BOOKING_DECLINED`, `BOOKING_CONFIRMED`, `PROVIDER_BOOKING_CONFIRMED` in the registry — the
  registry's own rule decides whether a type without a template may still produce an in-app row;
  the plan checks this before assuming.
- Web, `features/provider/bookings/{data,domain,viewmodel,ui}`: repository (`bookingForProvider`,
  `bookingByIdForProvider`, `bookingStatsForProvider`, the two mutations), a `domain/status.ts`
  with the tab → statuses and status → tone maps, viewmodel hooks, and three pages. Routes
  `provider/$slug/bookings.index.tsx` and `bookings.$bookingId.tsx`. The overview page is
  rewritten in place.
- `provider.json` × 8: a `bookings.*` block (tabs, columns, statuses, actions, decline reasons,
  timeline reasons, empty states, reveal sentence) and an `overview.*` block. The parity test
  covers it.

## Business rules

- **BR-P1** A provider member sees every booking whose `provider_id` is their workspace, except
  `DRAFT`. An administrator sees the same through the same fields.
- **BR-P2** Contact details and the exact street line are `null` on the wire until the booking is
  `CONFIRMED`, `MARKED_DONE`, `COMPLETED` or `DISPUTED`.
- **BR-P3** `bookingAccept` and `bookingDecline` succeed only from `AWAITING_PROVIDER`; any other
  state is the command's existing `BOOKING_INVALID_TRANSITION`, which the page renders as "este
  pedido já foi respondido" and refetches.
- **BR-P4** The response deadline shown is the booking's own `expiresAt` while
  `AWAITING_PROVIDER` — the same clock the sweep expires it on. The page never computes its own.
- **BR-P5** Revenue figures are `priceMinor − commissionMinor`, summed over `COMPLETED` for the
  trailing 30 days by `completedAt`; the pipeline over `CONFIRMED` with `startsAt ≥ now`.
- **BR-P6** A notification that fails to raise does not fail the write. It is logged with the
  booking id.
- **BR-P7** The list's `q` matches the customer's first name and the service name, case- and
  accent-insensitively; `memberId` filters on `provider_member_id`, and "anyone" bookings match
  no member filter.

## Explicitly out of scope

- **Marking done, completing, disputing.** No transition exists; own spec.
- **Reschedule and cancel by the provider.** The state machine draws both; neither has a command.
- **The customer's "Minhas reservas" page**, still a placeholder. `bookingMine` already serves
  it; it is a customer-zone task.
- **The shell's search box and ⌘K**, decorative today. A cross-entity search is its own design.
- **Refunds, card, cash** — per the payment spec.
- **Activity feed for the provider** (follow-up #55) and the wallet ledger, which nothing writes.

## Open questions this spec does not settle

1. **The reveal moment.** This spec says `CONFIRMED`. If the owner wants the phone visible at
   `PENDING_PAYMENT` (so a provider can nudge a customer who has not paid), that is one line in
   the DTO mapper and one sentence on the screen — but it reopens the door the decision closes.
   Decide before the plan.
2. **Email for which types.** In-app rows for all six. Email for `PROVIDER_BOOKING_RECEIVED`
   (the provider may not be in the app) and `BOOKING_ACCEPTED` (the customer must pay) at least;
   the rest can wait for the notification-preferences work.
3. **Where the charge-landed notifications are raised.** `markPaid` runs inside the charge sweep,
   not a user command. Raising from there follows the same port; the plan confirms the sweep has
   the port in scope.

## Testing

- **Projections:** fixtures with a customer profile, a member, and change rows; assert the reveal
  rule per status, the tab → status sets, the search matching, the stats sums (a `COMPLETED`
  booking outside 30 days, a `CONFIRMED` one in the past, a commission of zero).
- **Handlers:** the wallet's authorisation tests copied for the three reads — anonymous, a
  member of another workspace, an admin.
- **Commands:** accept and decline are already covered; add the notification raise (called with
  the right audience and type; a throwing raiser does not fail the command).
- **Web:** list page (tabs, search, empty states, the countdown), detail page (accept path,
  decline dialog, the reveal sentence, the money arithmetic, the timeline order), dashboard (every
  card from a stats fixture, the chart's bar count and heights). Repositories mocked at the seam,
  as the checkout suites do.
- **Locale parity** for the new blocks across all eight files.

## Phasing

1. **Reservas** — backend reads, mutations, notification relay, the list and detail pages, the
   sidebar entry. Shippable on its own; from this point a request can be answered in the app.
2. **Visão geral** — the stats query and the dashboard rewrite.
3. **Polish** — wallet and activity, once their data exists.

Each phase gets its own implementation plan.
