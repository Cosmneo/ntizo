# Booking — Design

**Goal:** Turn "See availability" from a modal that shows times into a booking a
customer can actually make. This spec covers the **Booking bounded context**
only — the aggregate, its state machine, the immutable snapshot, and the
append-only change history. It does not move money, hold slots, or notify
anyone; it emits the events that make those happen.

## This is one of four

The customer flow in the approved mockups — date and time, details, payment —
needs four things that do not exist. They are separate specs because they are
separate systems, and because writing them as one document would be fiction
about three of them at once.

| | Why it cannot be folded in |
|---|---|
| **1. Booking** (this spec) | The aggregate, the states, the snapshot, the history. |
| **2. Payment** | The customer pays at step 3. No payment, no third step. Mozambique's rails are M-Pesa and e-Mola, which have no Stripe Connect equivalent. |
| **3. Provider bookings** | A list, a detail page and the actions. The chosen model depends on a person answering, and today there is nowhere for them to answer. |
| **4. The three customer screens** | The easy part, and the last. |

**Nothing reaches a customer until all four land.** That is what "pay first"
costs, and it was weighed and accepted. A disabled "Continue" on step 3 is
exactly the kind of lying control the detail-pages redesign spent its whole
effort removing.

## Reference

The Ntizo owner's previous platform, **DoAzores**, has a mature Booking BC
whose design is in Notion ("📋 Booking BC", under Technical Reference). Its
`BookingSnapshot`, its status machine, its `SlotReservationPort` SPI and its
outbox fan-out are all adopted here. Its `rebookChain` — from LASTPUSH-99,
where "cancel + create" was weighed against "mutate in place" and mutate won —
is adopted as `booking_change`.

Where this design departs from DoAzores, it is because the market differs:

- **DoAzores confirms on payment.** Stripe's webhook says paid, the booking is
  confirmed, nobody is asked. Ntizo's provider is a person who must say yes, so
  a paid booking waits for them.
- **DoAzores never holds money.** Stripe Connect does. Ntizo's platform
  receives the customer's payment and holds it until payout — a constraint the
  wallet schema already documents, because M-Pesa and e-Mola offer no
  equivalent.
- **DoAzores sells seats on a departure.** Ntizo sells one person's time at an
  address, so there is no capacity, no participants, and no pricing tiers.

## Decisions taken, and why

Each of these was settled during design rather than left to be discovered.

**Payment comes before the provider's answer.** The customer pays, the platform
holds the money, and the provider then accepts or declines. The alternative —
provider confirms, then a payment link — was rejected: it leaves a confirmed
booking that may never be paid for, and the provider has already given up the
slot.

**A declined or unanswered request refunds automatically.** On a card that is a
reversal; on M-Pesa it is a *payment back out*, a separate transaction with its
own fee and its own failure modes. Refunds that fail go to an admin queue
rather than disappearing. This is the customer's expectation and very likely
the legal position.

**The provider marks the work done; the customer has a window to dispute.**
Silence completes the booking and credits the wallet. Two alternatives were
rejected: completing automatically when the slot time passes pays a provider
who never knocked on the door, and requiring the customer to confirm leaves a
provider unpaid because a satisfied customer simply did not come back to the
app.

**The commission is snapshotted at creation.** `provider.commission_bps` (default
1000, seeded from `platform_settings.default_commission_bps` and editable by an
administrator) is read once and written into the booking. Changing a provider's
rate tomorrow must not alter what a customer already agreed to.

**A change mutates the booking; it does not cancel and recreate it.** The
booking keeps its id and its payment reference, and every hop is appended to
`booking_change`. This is DoAzores' own reversal of its first instinct, and the
reason is the same: the customer should not be told their booking was cancelled
when it was not, and the original sale must remain readable.

## The state machine

```
PENDING_PAYMENT ──── paid ──────▶ AWAITING_PROVIDER
  slot held, expiresAt              platform holds the money
       └── expire ──▶ EXPIRED
                      slot released

AWAITING_PROVIDER ── accept ────▶ CONFIRMED
       ├── decline ─▶ DECLINED  ──▶ refund
       └── timeout ─▶ DECLINED  ──▶ refund

CONFIRMED ── provider marks done ──▶ MARKED_DONE
       ├── cancel ───▶ CANCELLED ──▶ refund per policy
       └── reschedule ▶ CONFIRMED  (new slot held BEFORE the old is released)

MARKED_DONE ── window passes ──▶ COMPLETED ──▶ wallet, less commission
       └── customer disputes ──▶ DISPUTED ──▶ administrator decides
```

`DISPUTED` resolves to `COMPLETED` or to a refund. A refund that fails does not
change the booking's state: the booking is `DECLINED` or `CANCELLED`, and
whether the money got home is Payment's fact to hold, in Payment's own queue.
A booking whose state depended on a payout's success would be a booking that
changes state for reasons the customer cannot see.

### Two clocks, not one

`PENDING_PAYMENT` and `AWAITING_PROVIDER` both hold the slot, and they are
measured in different units for different reasons.

The first is minutes — the mockup shows thirty — and its cost is somebody
typing a card number. The second must be hours, because it is a person deciding.

**The consequence is that one unanswered request blocks a Saturday afternoon
for everybody else, for as long as the provider window lasts.** That is a real
cost to name now rather than discover when the first provider complains they
lost work to a request they never saw. This spec does not set the window; it
requires that the window be a configured value with a stated reason, and that
the two clocks are never conflated into one.

## The data model

`ntizo_booking.booking` today is a placeholder: `id`, `customer_id`, `status`,
`created_at`. It is replaced.

**`booking`** — what is alive and changes. The current slot and staff member,
the status and one timestamp per transition, `expires_at`, `payment_ref`, the
customer's description of the job.

**The snapshot, embedded in the same row** — what was true when the customer
bought, immutable afterwards: service name, provider name, option name and
duration, the price, **the commission rate**, the cancellation policy.

**The address is snapshotted too, not referenced.** Step 2 lets a customer pick
"Casa — Av. Julius Nyerere 812" from `ntizo_user.address`. If they edit that
saved address six months later, the booking must still say where the provider
actually went. A foreign key would rewrite history — the same reasoning as the
price, applied to a fact people forget is mutable.

**`booking_change`** — append-only, one row per hop: previous slot, previous
total, who changed it, when, and why. The original sale is never overwritten,
only superseded. This is what answers "but I booked it for 14:30" six weeks
later.

Photographs attached to the job description go to the attachments bucket the
messaging context already uses. No new storage.

## Ports and events

**Outbound (SPI):**

- `SlotHoldPort` → Scheduling: `hold(slot, until)`, `release(hold)`,
  `transfer(oldHold, newSlot)`. `transfer` exists as one operation rather than
  release-then-hold because a reschedule that releases first can lose the slot
  on a busy afternoon — the hazard DoAzores names explicitly.
- `ServicePricingReader` → Catalog: the option's price and duration at booking
  time.
- `ProviderCommissionReader` → Provider: `commission_bps` for the snapshot.
- `DelayedJobQueue`: schedule the payment expiry and the provider timeout.

**Events, through the existing outbox:** `BookingCreated`, `BookingPaid`,
`BookingAccepted`, `BookingDeclined`, `BookingExpired`, `BookingRescheduled`,
`BookingCancelled`, `BookingMarkedDone`, `BookingDisputed`, `BookingCompleted`.

**Consumed:** `PaymentSucceeded` moves `PENDING_PAYMENT` → `AWAITING_PROVIDER`
and is the only thing that can; `PaymentFailed` leaves the booking where it is,
still holding its slot until the payment clock runs out. Both are idempotent —
a webhook that arrives twice must not book twice.

That direction is worth stating plainly, because the diagram hides it: Booking
does not know it was paid. Payment tells it. The arrow labelled "paid" is an
event crossing a context boundary, not a method somebody calls.

Payment consumes `BookingDeclined`, `BookingCancelled` and `BookingCompleted`.
Notification consumes nearly all of them. Review opens its window on
`BookingCompleted`.

## Business rules

- **BR1** — The service must be published and the option active at creation;
  the snapshot is taken from live data at that moment.
- **BR2** — The slot must be free for the chosen staff member, and held
  atomically with the booking's creation.
- **BR3** — `commissionMinor = round(priceMinor × commissionBps / 10000)`;
  `providerPayoutMinor = priceMinor − commissionMinor`.
- **BR4** — The snapshot is immutable after creation. A reschedule writes a new
  `booking_change` row; it never edits the snapshot.
- **BR5** — Expiry and provider timeout are both idempotent: if the status has
  moved on, they are a no-op.
- **BR6** — A reschedule holds the new slot before releasing the old one.
- **BR7** — Only the booking's own customer, its provider, or an administrator
  may read it.
- **BR8** — A booking cannot be created for a `quote` service: there is no
  price to snapshot and no duration to hold a slot against.

## Explicitly out of scope

Charging, refunding, crediting the wallet, and any knowledge of M-Pesa or a
processor (Payment). Generating and releasing slot holds (Scheduling, reached
through a port). Notifying anybody (Notification). The provider's list, detail
page and actions (spec 3). The three customer screens (spec 4).

## Open questions this spec does not settle

**The rail is M-Pesa for the first phase** (decided 2026-08-29), and
`~/Desktop/Salif/Projects/ntizo-v1` — the platform's own Laravel predecessor —
has a working integration against Vodacom Mozambique
(`developer.mpesa.vm.co.mz`, success code `INS-0`).

**Reversal exists.** `app/Services/Payment/MpesaService.php` implements `c2b`,
`b2c` and `reversal`, so the automatic-refund decision holds on evidence rather
than on assumption. v1 also already built the shape this spec arrived at
independently — `PaymentIntentService`, `EscrowService`, `WalletService` — and
its phone normalisation to `258XXXXXXXXX` is a solved detail worth copying
rather than rediscovering. One deliberate divergence: v1's
`EscrowService::release` defaults to `'customer_confirmation'`, the model
rejected here in favour of provider-marks-done with a dispute window.

**The hazard v1 did not have, and this one does.** The C2B call is
**synchronous and blocking**: it returns `INS-0` only once the customer has
approved the USSD prompt, so the HTTP request waits on a human for anything up
to a minute or more. Laravel on an ordinary server merely finds that ugly.
Ntizo runs on Cloudflare Workers, which have wall-time and subrequest limits,
and a request parked on somebody's thumb is not something a Worker can be
relied on to survive.

**The asynchronous path that would solve it is dead code in v1, so it cannot be
copied — it has to be built.** `PaymentIntentService::handleCallback` parses
`Body.stkCallback` with `CheckoutRequestID` and `CallbackMetadata`, which is
Safaricom Kenya's STK Push shape, not Vodacom Mozambique's. It then looks up
`payment_intents.mpesa_checkout_request_id`, whose only writer —
`PaymentIntent::markAsProcessing()` — is never called anywhere in the codebase.
The route is registered and the column is migrated, and the lookup can never
match. It has never fired.

**So the first thing spec 2 must establish is not whether M-Pesa can refund —
it can — but how a Worker initiates a payment without holding a request open
while a customer decides.** Everything else in that spec depends on the answer,
and v1 has no answer to lend.

**M-Pesa changes what `PENDING_PAYMENT` is waiting for.** The thirty minutes in
the mockup were drawn for a card — the time it takes to type sixteen digits.
M-Pesa is a push: the customer gets a USSD prompt and either approves it or
does not. Ignoring it is the ordinary outcome, not an edge case, so
`PaymentFailed` is a common event rather than a rare one, and the realistic
window is minutes.

This matters beyond the timer. A slot held for thirty minutes per abandoned
prompt, on a rail where abandonment is normal, is a busy Saturday spent held by
people who never paid. Card-shaped assumptions about this window are the thing
to be most careful of.

**The two windows have no values.** How long a customer has to approve the
prompt, and how long a provider has to answer. The second is the expensive one
— see "Two clocks".

**The cancellation penalty is undefined.** A provider cancelling a confirmed
booking, and a customer doing the same, are different acts with different
consequences, and neither has a rule yet.

## A defect this uncovered, worth fixing regardless

`NTIZO_COMMISSION_RATE = 0.1` is hardcoded in
`apps/frontend/web/src/features/directory/services/domain/booking-total.ts` and
rendered to customers on the live service page. It ignores
`provider.commission_bps` entirely, so any provider whose rate an administrator
has changed shows the wrong fee today. Booking needs the real rate for its
snapshot in any case.

## Testing

- **Domain:** every transition in the machine, and every transition that must
  be refused. Idempotency of expiry and timeout. The commission arithmetic at
  the rounding boundary.
- **Snapshot immutability:** a reschedule leaves the snapshot byte-identical
  and appends a `booking_change` row.
- **The reschedule hazard:** the new hold exists before the old is released,
  asserted on the port call order rather than on the outcome.
- **Integration, against the real database:** the booking and its hold are
  written in one transaction, and a failure on either leaves neither. This
  repository's unit tests use fakes and execute no SQL — a lesson learned the
  hard way when a `provider.bySlug` aggregate that every unit test passed took
  both detail pages down on dev.
