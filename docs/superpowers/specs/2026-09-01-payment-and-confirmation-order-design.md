# Payment, and the Order It Happens In — Design

**Status:** draft for review, 2026-09-01.

**Supersedes** the ordering decided in `2026-08-28-booking-design.md` ("pay first, provider confirms after") and the state machine that follows from it — which is built, tested and deployed to dev. The rest of that spec stands: the snapshot, `booking_change`, the seats, the exclusion constraint, review eligibility, and the commission.

## Why this reverses a shipped decision

The approved mockup for step 3 says, in its own words:

> **Nada é cobrado agora. Só paga depois de o prestador confirmar a hora.**
> 1. Envia o pedido — o prestador tem 2 horas para confirmar a hora.
> 2. Valor cativo — cobramos no momento da confirmação, mas retemos o dinheiro.
> 3. Serviço concluído — confirma que ficou feito e o prestador recebe.

That is the opposite order to what was built. The owner chose the mockup on 2026-08-31.

The trade being accepted, stated plainly so nobody rediscovers it: **pay-first made a failed charge harmless, because nobody had committed anything yet.** Confirm-first moves that risk onto the provider, who blocks their calendar and then may not get paid. This spec exists mostly to say what happens in that case, because the mockup does not show it.

## Three clocks, not one

The mockup shows a countdown — *"Hora reservada 29:40"* — on all three steps. So the slot is held from the moment the customer starts, not from the moment they finish. That is the only way two customers cannot complete checkout for the same slot.

| Clock | Length | Runs from | What it protects |
|---|---|---|---|
| **Checkout hold** | ~30 min | the customer picks a slot | the customer, from losing the slot mid-form |
| **Provider window** | 2 h | the request is sent | the customer, from a provider who never answers |
| **Payment window** | existing setting | the provider accepts | the provider, from a slot held by somebody who will not pay |

All three are `platform_settings` columns, LIVE, following `payment_window_minutes`. The existing one keeps its name and its meaning — how long a customer has to pay — and only moves position in the flow.

## The state machine

```
DRAFT ─────────── customer confirms ──▶ AWAITING_PROVIDER
  slot held, 30 min                       slot held, provider has 2 h
   └── abandoned ──▶ EXPIRED                ├── declines ──▶ DECLINED
       slot released                        ├── 2 h passes ─▶ EXPIRED
                                            └── accepts ───▶ PENDING_PAYMENT
                                                              slot held, charge pushed
PENDING_PAYMENT ── paid ──▶ CONFIRMED
   ├── charge fails / customer does not respond ──▶ stays PENDING_PAYMENT, retryable
   └── payment window passes ─────────────────────▶ CANCELLED, slot released,
                                                    provider told it fell through

CONFIRMED ── provider marks done ──▶ MARKED_DONE ── window ──▶ COMPLETED
   ├── cancel ──▶ CANCELLED
   └── reschedule ▶ CONFIRMED
MARKED_DONE ── customer disputes ──▶ DISPUTED
```

`DRAFT` is new, and it is what the countdown counts. It joins `SLOT_HOLDING_STATUSES` — which the exclusion constraint, the seat assignment and the availability engine all read from one list, so adding it there is the whole change on that side. **The test asserting the constraint's predicate matches that constant in both directions is what will catch a forgotten migration.**

`PENDING_PAYMENT` survives with its name and meaning intact — "we are waiting for money" — and moves to after the provider's yes.

## The failure the mockup does not show

The provider accepts at 14:00. We push an M-Pesa prompt to the customer's handset. The customer is in a meeting, on the bus, out of battery, or types the PIN wrong. **The provider has already blocked four hours of their Saturday.**

**The booking stays `PENDING_PAYMENT` and the slot stays held for the payment window.** The customer can retry from the booking — the app shows "Pagar agora", which pushes a fresh prompt. The provider sees the booking as *awaiting the customer's payment*, not as confirmed.

When the window passes, the booking is `CANCELLED`, the slot is released, and **the provider is told why**: the customer did not pay. Not "cancelled" with no reason — a provider who blocked their calendar and got nothing is owed an explanation, and this is the one moment where the platform's own choice of ordering cost them something.

Two things this rules out. The booking never sits `CONFIRMED` and unpaid — a provider must never work on the strength of money that never arrived. And a failed charge never silently releases the slot on the first decline: a mistyped PIN is not a cancellation.

## What M-Pesa actually does, and what that forces

Vodacom Moçambique's C2B pushes a prompt to the handset and **blocks until the customer answers or it times out** (`developer.mpesa.vm.co.mz`; success is `INS-0`). The predecessor platform, `ntizo-v1`, calls it synchronously and treats the response as final — and its callback handler is dead code that parses Safaricom Kenya's `Body.stkCallback` shape and looks up a field nothing ever writes. **We are not copying that.**

Two consequences:

- **A Worker cannot hold a request open for a C2B round trip.** The charge is initiated by the provider's acceptance, not by a customer's click, so there is nobody waiting on a spinner anyway. It belongs in the same cron sweep that already runs every minute, or in a queue — this spec does not settle which, and that is the one open question below.
- **The customer's phone number matters.** The prompt goes to a handset, not to an account. The mockup shows it: *"Recebe um pedido de pagamento no 84 ••• 4021"*. Phone verification is already lazy-at-first-payment in the project's own decisions; this is that moment.

## Idempotency, which is already half built

`markPaid` already absorbs a duplicate carrying the same payment reference at any status, and throws on a different one — a second, genuinely distinct transaction against one booking means the customer was debited twice and is owed money back. That logic is correct and does not move.

What changes is where it sits: it now transitions `PENDING_PAYMENT → CONFIRMED` rather than `PENDING_PAYMENT → AWAITING_PROVIDER`.

## Scope

**In:** the state machine above, the two new settings, the `DRAFT` state and its hold, M-Pesa C2B initiation and its result handling, retry, and the cancellation-with-a-reason when payment never lands.

**Out, deliberately:**
- **Card and cash.** The mockup shows both. Card needs a second processor with deferred capture; cash needs a design in which the platform holds nothing, covers no dispute, and still collects its commission — or knowingly does not. Each is its own spec.
- **Refunds.** `DECLINED` and `CANCELLED` after a successful charge both owe money back. `ntizo-v1` has a `reversal` call against the same API and the automatic-refund decision was already taken. It is a Payment-context concern and this spec does not model the wallet.
- **The cancellation policy.** The mockup promises *"cancelamento gratuito até 6 horas antes"*. Nothing models it. It decides whether a refund is owed, so it belongs with refunds.
- **Materials quoted separately** and **travel included**, both shown in the mockup's price panel. Neither exists in the catalogue. If they are features rather than reassurance copy, they are Catalog's.

## Open question this spec does not settle

**Where the charge runs.** The cron sweep already wakes every minute, already holds an `infraStore` scope, and already sweeps two things; adding a third is cheap and needs no new deployment surface. A Cloudflare Queue is the alternative and buys retries with backoff, which a charge plausibly wants. The sweep is the smaller step and the one this codebase has precedent for. **Recommendation: the sweep, with the retry count on the booking so a permanent failure is visible rather than infinite.** Decide before the plan.

## What this costs in already-shipped work

Honest accounting, because the answer is "less than it looks":

- `Booking.markPaid`'s target status changes. One line, plus its tests.
- `create-booking.command` creates `DRAFT` rather than `PENDING_PAYMENT`.
- The expiry sweep splits into three questions against three clocks. `findDueForExpiry` becomes three queries or one with a status-aware predicate.
- `SLOT_HOLDING_STATUSES` gains `DRAFT`, which flows automatically into the constraint's predicate, the seat assignment and the availability engine — **because they all read the one list.** That was the point of insisting on it.
- Two new `platform_settings` columns and a migration.

Untouched: the snapshot, `booking_change`, seats, the exclusion constraint, the advisory lock, review eligibility, the commission, and every read model. The ordering reversal does not reach them.
