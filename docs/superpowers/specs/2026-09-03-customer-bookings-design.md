# The Customer's Bookings — Design

**Status:** approved in brainstorming, 2026-09-03. Awaiting the owner's review of this document before a plan is written.

**Mockups:** `2026-09-03-customer-bookings.mockup.html`, next to this file, and published at
<https://claude.ai/code/artifact/020dea66-c614-4365-bef8-cebf350e41ae>. The Portuguese in it is the approved pt-MZ copy
and is the source the locale files are written from.

## What this is

`/bookings` is a URL, a link in the user menu, and a static card that says "Ainda não há reservas". Nothing on it
queries anything. A customer who books a service is shown a confirmation panel at the end of checkout and then has no
way, ever again, to find out what became of the request: not whether the provider answered, not whether the payment
went through, not when the appointment is.

This spec turns that placeholder into the page the rest of the product already assumes exists: a list of the customer's
own bookings in three tabs, a detail page that tells the story of one booking, and the two actions a customer needs
before a booking is paid — cancel it, or pay it now.

It is the customer-zone half of the work whose provider half shipped on 2026-09-03
(`2026-09-02-provider-bookings-and-dashboard-design.md`), which named this page in its own out-of-scope list:
"**The customer's 'Minhas reservas' page**, still a placeholder. `bookingMine` already serves it; it is a customer-zone
task."

## What exists, and what does not

**The backend already serves the list and the detail.** `booking.mine` returns the caller's own bookings, newest first,
and `booking.byId` returns one of them. Neither takes a customer id: both resolve it from the session, and
`DrizzleBookingReadRepository` puts it in the `WHERE` clause rather than checking it after the read. They were built
with the booking core (`2026-08-29-booking-core.md`, Task 14) and have never had a caller.

**Checkout deliberately refuses to link here.** `confirm-page.tsx` stays on itself after a successful send, and
`booking-outcome-panel.tsx` says why: "That route is a six-line placeholder… sending somebody there straight after they
successfully committed would have the platform deny the thing they had just done… It becomes the right destination the
day that page reads its own rows, and not before." That day is this spec.

**What does not exist:**

- No way for a customer to cancel. `Booking.cancel()` exists but is reachable only from the sweep, only from
  `PENDING_PAYMENT`, and only with the reason `customer_did_not_pay`.
- No way for a customer to pay or retry. The charge is pushed by the per-minute cron
  (`ChargeAcceptedBookingsInternalCommand`), up to three attempts with a cooldown between them.
- No timeline on the customer's side. The provider's detail has one; `bookingReadModel` carries no per-transition
  timestamps at all, not even `paidAt`.
- No end to the flow. There is no transition into `MARKED_DONE`, `COMPLETED` or `DISPUTED` anywhere in the codebase.
  The state machine stops at `CONFIRMED`.
- No commission fence. `bookingReadModel` carries `commissionBps` and `commissionMinor`, and the only thing keeping
  them off a customer's wire is checkout's hand-written selection set (follow-up #114).

## Decisions taken, and why

### The commission comes out of the customer's read model, rather than being hidden by each caller

The stated platform rule is that the commission is deducted from the provider's payout and never shown to the customer.
Today that rule is enforced by convention: `CheckoutBooking` is `Omit<BookingDTO, "commissionBps" | "commissionMinor">`
and a test reads the query document to prove the fields are not asked for. It went six reviews without that test.

A second customer-facing caller is exactly the moment follow-up #114 anticipated, so the fields leave
`bookingReadModel` itself. After that no client selection set can ask for them, because the type no longer has them.
The provider's `providerBookingReadModel` is a separate mirror with its own commission fields and is untouched: the
provider *should* see the split, because it is their payout.

Checkout's `CheckoutBooking` alias collapses to `BookingDTO`, and its wire test is rewritten to assert the absence at
the model rather than at the query.

### The list has three tabs, mirroring the provider's

The owner chose consistency between the two zones over a customer-specific shape. The buckets:

| Tab | Statuses |
|---|---|
| **A aguardar** | `AWAITING_PROVIDER`, `PENDING_PAYMENT` |
| **Próximas** | `CONFIRMED` with `startsAt` in the future |
| **Histórico** | `DECLINED`, `CANCELLED`, `EXPIRED`, and `CONFIRMED` with `startsAt` in the past |

`PENDING_PAYMENT` sits in the first tab rather than in one of its own. It is a wait like the other, it is where both
buttons live, and a fourth tab holding one row most of the time is a tab that is usually empty.

`MARKED_DONE`, `COMPLETED` and `DISPUTED` map to Histórico when they start being written, so the bucketing does not
have to be revisited by whoever builds them.

### Drafts appear in no tab

A `DRAFT` is a checkout half-finished, not a request the customer made. Showing one would offer to cancel something the
customer does not believe exists. This mirrors `PROVIDER_VISIBLE_STATUSES`, which excludes `DRAFT` for the same reason.

### Cancelling is allowed only before payment

The owner's decision. `Booking.cancel()` gains a second reason, `cancelled_by_customer`, allowed from
`AWAITING_PROVIDER` and `PENDING_PAYMENT`. Neither has moved money, so there is nothing to give back and no deadline
rule to write.

After payment there is no button. Nothing in the platform can return money: there is no refund port, no B2C
disbursement, and the wallet ledger that would record a reversal has no writer. A cancel button on a paid booking would
be a promise the system cannot keep, so the page says what it can do instead and points at support.

Cancelling frees the slot, because `CANCELLED` is not in `SLOT_HOLDING_STATUSES`, and raises
`PROVIDER_BOOKING_CANCELLED_BY_CUSTOMER`, a notification type that already exists and is in-app only today
(follow-up #146 owns its email).

### Paying pushes the prompt and the page follows the status

`booking.pay` claims a charge attempt synchronously — `recordChargeAttempt` is a fast compare-and-swap — and then
pushes the M-Pesa prompt outside the response, so the mutation returns in milliseconds and the customer is told to
confirm on their handset. The page then polls `booking.byId` until the status leaves `PENDING_PAYMENT` or the payment
window closes.

The alternative, holding the request open until M-Pesa answers, was rejected: a C2B call blocks for up to 110 seconds,
and `ChargeBookingCommand` documents at length that the whole design is tolerable only because "the customer is not
waiting on a spinner". Putting one there would make the slowest call in the system the one a person watches.

The per-minute cron stays exactly as it is and is the safety net: a customer-initiated attempt that dies with its
Worker consumed an attempt, which is the same failure the cron's own attempts already have, and the booking still falls
to its payment window in the end.

### The missing phone number is asked for, not discovered by a spent attempt

`profile.phone_number` is nullable and nothing in the shipped product requires it. Today a customer without one has
their three attempts burned in silence and the booking is cancelled as "the customer did not pay" — the provider is
told a falsehood, and the customer is never asked the one question that would have fixed it. `ChargeBookingCommand`
names this and says the real fix "belongs to a screen that does not exist yet". This is that screen.

`booking.pay` refuses with `BOOKING_NO_CUSTOMER_PHONE` **before** claiming an attempt. The page asks for the number,
saves it with the existing `userUpdateMe` mutation, and retries.

### The timeline is the same one the provider reads

`booking_change` rows plus the booking's own timestamps, the source the provider's detail already uses. The customer
sees the same hops, in customer words. Decline reasons are shown: the four tokens (`not_available`, `cannot_perform`,
`outside_area`, `other`) say nothing the customer should be protected from, and "recusada" with no reason invites the
worst reading.

`bookingTimelineEntryReadModel` moves from `provider-booking.schema.ts` to `booking.schema.ts`, because two audiences
now read it and neither owns it.

### The page says where the flow stops

The timeline ends at "pagamento confirmado" and the copy does not imply a later hop. Bookings leave Próximas for
Histórico by date, not by anyone declaring the work done, because no such transition exists. Inventing a "concluída"
chip the backend cannot produce would be the page lying about the system.

## The screens

### As minhas reservas — the list

Route `/bookings`, inside `_customer`, replacing `BookingsPage` in `placeholder-pages.tsx`. Title "As minhas reservas",
lede "Tudo o que pediu, onde está cada pedido e o que falta fazer."

Three tabs with counts, in `?tab=`, defaulting to `waiting`. Rows render through `CollectionCard`, the shared list
component every other list in the app uses: a table on wide screens, stacked cards on narrow.

Each row: the service and its option, the provider with the verified mark, the date with the start time and the
duration under it, the status chip, the price, and the row's action. The action column is empty except in **A
aguardar**: `AWAITING_PROVIDER` offers "Cancelar" as a quiet link, `PENDING_PAYMENT` offers "Pagar" as the primary
button. A countdown sits under the chip whenever a deadline is running: `respondBy` while waiting for the provider,
`expiresAt` while waiting for payment.

Empty state per tab, using `EmptyCard` with a way out: "Explorar serviços".

Pagination mirrors the provider's, twenty rows a page.

### A reserva — the detail

Route `/bookings/$bookingId`, inside `_customer` beside the list. Back link, the service as the page title, the provider as the sub-line with rating and
verified mark, the status chip and the short reference (the first eight characters of the id, upper-cased, as the
provider's page does).

The actions sit in the header, where the decision is made: "Pagar 1 800 MZN" as primary and "Cancelar reserva" as a
quiet destructive outline, both only in the states that allow them.

Left column, three sections: **A marcação** (when, duration, where, directions), **O prestador** (name, rating,
verified, a link into the existing message thread), **A sua nota** (the description the customer wrote, omitted when
there is none).

Right column, two blocks: **O valor** — the total, the line "É o preço anunciado pelo prestador. A Ntizo não acrescenta
nada por cima.", and once paid a "Pago a …" line; and **Como vai isto** — the timeline.

A booking that is not the caller's, or does not exist, renders the same not-found card. The read is already nullable
for exactly this reason and does not distinguish the two.

### Pagar

A dialog, not a page. Two states: "Confirme no seu telemóvel", with the masked number and the amount, which stays open
while the page polls; and "Falta o seu número M-Pesa", with a single field and "Guardar e pagar".

Polling runs every three seconds for as long as the dialog is open and the booking is `PENDING_PAYMENT`, and stops at
the payment deadline. Closing the dialog does not cancel anything: the prompt is already on the handset, and the list
reflects the outcome whenever it is next read.

### Cancelar

A dialog that says what will happen rather than asking for certainty: the slot is freed, the provider is told, nothing
is refunded because nothing was paid, and a new request would have to be made.

## The data model

### `bookingReadModel` (edited, `packages/shared`)

Loses `commissionBps` and `commissionMinor`. Gains `paidAt` (nullable), which the money block and the timeline need and
which is the customer's own fact. Everything else is unchanged.

It gains no second deadline field. There is one `expires_at` column and it means "respond by" while the status is
`AWAITING_PROVIDER` and "pay by" while it is `PENDING_PAYMENT`; it is never cleared, so it means nothing at all in any
other status. `bookingReadModel.expiresAt` already carries it, and the page reads it against the status, exactly as
`to-provider-booking-dto.ts` derives the provider's `respondBy` from the same column.

### `customerBookingPageReadModel` (new)

```
rows:   bookingReadModel[]
total:  number            // rows in the requested tab
counts: { waiting: number; upcoming: number; history: number }
```

The counts are what the tab chips render, so all three are returned on every read rather than left to three requests.

### `customerBookingDetailReadModel` (new)

`bookingReadModel` plus `timeline: bookingTimelineEntryReadModel[]`.

### Enum additions (`packages/shared`)

- `CUSTOMER_BOOKING_TABS = ["waiting", "upcoming", "history"]`
- `CUSTOMER_VISIBLE_STATUSES` — every status except `DRAFT`
- `BOOKING_CANCEL_REASONS` gains `cancelled_by_customer` beside `customer_did_not_pay`

## The GraphQL surface

All four fields are on the private `/graphql` mount, which already resolves an anonymous caller to a null user; each
handler requires a user of its own.

| Field | Shape | Who |
|---|---|---|
| `booking.mine` | `{ tab, limit, offset }` → `customerBookingPageReadModel` | the session's own customer |
| `booking.byId` | `{ bookingId }` → `customerBookingDetailReadModel \| null` | the session's own customer |
| `booking.cancel` | `{ bookingId }` → the booking | the booking's own customer |
| `booking.pay` | `{ bookingId }` → the booking | the booking's own customer |

`booking.mine` changes shape. It has no callers, so nothing breaks. `booking.byId` only gains a field, and checkout does
not select it.

Errors. The **reads** never say whose a booking is: an unrelated caller gets the same `null` a missing booking gets, so
an id cannot be probed for existence. The **writes** must refuse explicitly, and do it with `BookingNotYoursError`
(`BOOKING_NOT_YOURS`), a forbidden error alongside the context's own `NotProviderMemberError` — by the time a write
arrives the caller is claiming a specific booking, and a silent no-op would leave a button that appears to do nothing.
Beyond that, `booking.cancel` refuses a wrong status with `BOOKING_TRANSITION`, and `booking.pay` refuses with
`BOOKING_NO_CUSTOMER_PHONE`, `BOOKING_CHARGE_ATTEMPTS_SPENT` or `BOOKING_PAYMENT_WINDOW_CLOSED`.

## Ports and wiring

- `BookingReadRepositoryPort` gains `listForCustomer(customerId, tab, limit, offset)` and `countsForCustomer(customerId)`.
  `timelineFor(bookingId)` already exists for the provider and is reused unchanged.
- `Booking.cancel()` accepts `cancelled_by_customer` from `AWAITING_PROVIDER` and `PENDING_PAYMENT`; `CANCELLABLE_FROM`
  becomes a map from reason to the statuses that reason may leave.
- `CancelBookingCommand` (new, customer-authorised) loads the booking, refuses unless `customerId` matches, cancels,
  saves, and raises `PROVIDER_BOOKING_CANCELLED_BY_CUSTOMER` through the port the booking context already owns.
- `RequestBookingChargeCommand` (new, customer-authorised) refuses unless `customerId` matches, reads the phone through
  `CustomerPhoneReaderPort` and refuses early when it is null, then claims the attempt and hands the gateway call to
  `ChargeBookingCommand` outside the response.
- The web feature follows the house layout: `features/bookings/{data,domain,viewmodel,ui}`, mirroring
  `features/provider/bookings`.
- A new `bookings` locale namespace in all eight locales, registered in `i18n.ts` and added to `NAMESPACES` in the
  locale parity test. The empty-state strings already in `account.json` move into it.

## Business rules

- A booking is readable only by its own customer, and the filter is inside the query rather than after it.
- Cancel and pay both re-check ownership on the write side; a read that showed a row is not authorisation to act on it.
- Pressing Pagar twice does not charge twice: the attempt claim is a compare-and-swap, and the second press finds no
  attempt to take.
- The three-attempt bound and the cooldown are shared with the cron, not duplicated. A customer cannot spend attempts
  faster than the sweep would.
- The payment window is authoritative. A charge is refused with less than `BOOKING_CHARGE_MIN_WINDOW_MS` left, for the
  reason that constant already documents: a blocking call that outlives the deadline debits a customer whose booking
  the sweep has already cancelled.
- Money is never shown split. The customer sees the total and, once paid, when it was paid.

## Explicitly out of scope

- **Refunds, and cancelling a paid booking.** No refund path exists anywhere in the platform. Its own spec.
- **Marking done, completing, disputing.** No transition exists; the provider spec deferred them for the same reason.
- **Rescheduling**, by either side.
- **The provider's payout and the wallet ledger.** The wallet and its entry table exist and nothing writes to them, so
  the platform can say what it received per booking but not what it owes each provider. This is the next money spec and
  the owner raised it during this brainstorm.
- **The hourly, quote and task-bid paths.** `BOOKING_PATHS` is declared and unwired; only fixed-price packages exist.
- **An admin view of bookings.** None exists today.

## Open questions this spec does not settle

- **What background work on the api Worker survives is known, not measured for this feature.** No probe was deployed
  to the dev stage — the mechanism was already relied on in production before this task. `configMiddleware` registers
  `c.executionCtx.waitUntil` into `infraStore`; `connection.ts` chains the per-request database close behind whatever
  was deferred rather than beside it; `apps/backend/api/src/__tests__/wait-until.test.ts` asserts that ordering under
  a real Hono app, including with no execution context at all (a test, a script); and notification's email delivery
  already ships on this exact seam. The pay mutation schedules `ChargeBookingCommand` through the same seam —
  `DeferredBookingCharge`, with its own test against `infraStore` for real, not a fake of it. If a Worker is evicted
  mid-call, the attempt `recordChargeAttempt` already claimed is not returned: the booking falls to the path an
  unanswered prompt already takes — the per-minute sweep, then the payment window's cancellation — bounded by the
  same three-attempt limit every other charge is.
- **Whether the countdown should keep running client-side** or refresh on read. The provider's list re-reads; this page
  polls while a dialog is open, which is a different rhythm.
- **What the page shows when the window closes while it is open.** The booking becomes `CANCELLED` under the customer's
  eyes; the dialog needs a defined end state rather than an indefinite spinner.

## Testing

- Aggregate: the new reason from both allowed statuses, refused from every other, and the slot released.
- Commands: ownership refused for a stranger, the phone-absent refusal happening before an attempt is claimed, the
  double-press claiming one attempt.
- Read projections: the tab buckets, including a `CONFIRMED` booking crossing from Próximas to Histórico by date, and
  drafts absent from all three.
- The customer-safe model: a test asserting `bookingReadModel` has no commission keys, replacing checkout's query-document
  test, which becomes redundant the moment the fields stop existing.
- Web: the tabs, the action buttons per status, the countdown wording, the money block showing a total and never a split.
- End to end: book, see it in A aguardar, cancel it, see it in Histórico. Paying is not covered end to end because it
  needs the M-Pesa sandbox in the loop.

## Phasing

One phase, in this order so the page is useful before the actions land: the customer-safe read model and the tabbed
list, then the detail with its timeline, then cancel, then pay.
