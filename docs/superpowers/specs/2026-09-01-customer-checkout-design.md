# Customer Checkout, in Three Pages — Design

**Status:** draft for review, 2026-09-01.

**Depends on** `2026-09-01-payment-and-confirmation-order-design.md`, which is built and deployed.
This spec is the first half of making that work reachable; the provider's inbox is the second half
and has its own spec.

## What this is

The original request: *"quando a pessoa clica em 'Ver disponibilidade', em vez de abrirmos o
pop-up modal, criamos novas páginas."* Three of them — date and time, details, payment — from
approved mockups.

**The reversal changed what these pages are.** When the mockups were drawn, the customer paid on
step 3 and was finished. Under confirm-first, step 3 takes no money: it sends a request, and the
customer waits for a provider. So the third page is not a payment page. It is the page where a
customer reads what they are asking for, says where the payment prompt should go, and sends it.

The mockup's own copy already says this, which is why it survives the change intact:

> **Nada é cobrado agora. Só paga depois de o prestador confirmar a hora.**

## The conflict this spec had to resolve first

The payment spec says, in its own words: *"the slot is held from the moment the customer starts,
not from the moment they finish. That is the only way two customers cannot complete checkout for
the same slot."* The countdown runs across all three steps.

`DRAFT` is what holds a slot. But `booking.create` requires a complete address —
`address_label`, `address_line` and `address_city` are `NOT NULL`, and `Booking.create` refuses
blanks in all three — and the customer does not supply an address until step 2.

Both cannot be true. **Decision: the hold starts at step 1, and a `DRAFT` may have no address.**
The three columns become nullable, and `submit` is where an address becomes required — which is
the hop where a booking stops being the customer's private draft and becomes a request somebody
must answer.

The rejected alternative was creating the booking at the end of step 2. It costs nothing in
backend work, and it gives up the property `DRAFT` was invented for: two customers could both
reach the end of step 2 for one slot and the second would find out only then.

## Where the state lives

**One write at the start, one at the end, nothing in between.**

Step 1 writes: `booking.create` produces the `DRAFT`, which holds the slot and starts the
`checkout_hold_minutes` clock the countdown reads. Steps 2 and 3 write nothing — the address, the
description and the phone number live in client state and travel together on `submit`.

This is why no `booking.update` mutation exists in this design. An intermediate write would mean a
row that is neither a draft the customer abandoned nor a request anybody sent, and a second place
for the address to disagree with itself.

The cost is honest and stated: a refresh on step 2 loses the typed address. The slot is not lost —
the draft still holds it, and the customer resumes at step 2 with the form empty.

## One open draft per customer

`CreateBookingCommand` expires the customer's existing `DRAFT` before creating the new one, in the
same transaction.

Without this rule, abandoning step 2 three times leaves three slots held for thirty minutes each,
by an ordinary customer changing their mind rather than by anyone attacking anything. That is
follow-up #108's calendar-hold problem arriving by accident.

This is not a rate limit and does not pretend to be one. A scripted caller can still create,
abandon and re-create in a loop; #108 stays open and belongs with mounting the mutations behind a
throttle.

## The three pages

```
/book/$serviceId              choose when      → creates the DRAFT, redirects
/booking/$bookingId/details   address + notes
/booking/$bookingId/confirm   phone + summary  → submit
```

The id in each position always means one thing. Step 1 has no booking yet; steps 2 and 3 have
nothing else.

**Step 1 — Data e hora.** The `AvailabilitySheet` modal is deleted. Its three children —
`DateStrip`, `MemberPicker`, `TimeGrid` — are already separate files and become this page's body
unchanged. The provider and service pages link here instead of opening a sheet.

Choosing a slot and confirming calls `booking.create`. Authentication is required to hold a slot,
so an anonymous visitor is sent to log in and returned here.

**Their choice survives in the URL, not in memory.** The chosen member and start are search
parameters on this route, so the round trip through sign-in — which leaves the app — brings the
customer back to the slot they picked rather than to an empty grid. It also means a slot can be
linked to and shared, and that a refresh mid-choice loses nothing.

**Step 2 — Detalhes.** The customer picks from their saved addresses — the address book, its read
model and its projection all exist — or adds one inline. Plus the optional description the booking
already carries.

**Step 3 — Confirmar.** The slot, the address, the phone number the M-Pesa prompt will go to, and
the price.

**The price shown is the price the customer pays, and the commission is not on this page at all.**
The commission comes out of the provider's payout, decided 2026-08-30; showing a customer a
breakdown of money that never leaves their side would invent a fee they are not charged. The
provider sees the split on their own side, which the commission-visibility work already built.

Sending calls `submit`.

The countdown appears on all three, driven by the draft's `expiresAt`. That field carries whichever
clock the booking's status stands on; on a `DRAFT` it is the checkout hold.

## The phone number, and why it is required here

The mockup promises *"Recebe um pedido de pagamento no 84 ••• 4021"*. `profile.phone_number` is
nullable and nothing requires it today.

That gap has a cost already recorded: a customer with no phone is charged into the void, spends all
three retry attempts, and the payment window then cancels the booking telling the provider the
customer did not pay. Requiring the number here closes it by construction rather than by handling
it later.

**Two mutations, in order, not one.** Step 3 calls the User context's existing profile update with
the phone, then `booking.submit`. Setting a phone number is not Booking's job, and a booking
command reaching across to write a profile would need a writer port that exists for no other
reason.

`submit` then **refuses a booking whose customer has no phone number**, reading through the
`CustomerPhoneReaderPort` the charge sweep already uses. That refusal is what makes the requirement
real: a UI convention can be skipped by anything that calls the mutation directly.

A half-failure leaves a saved phone and an unsent draft. Both are recoverable and neither is wrong.

## What `submit` becomes

`Booking.submit(at, respondBy)` gains the address:

- A `DRAFT` may carry no address. Any status past `DRAFT` must carry a complete one.
- `submit` refuses a booking with no address, and refuses an incomplete one.
- `Booking.create`'s blank-string guards must distinguish two things that are not the same:
  **`null` means not yet supplied and is allowed on a draft; `""` means a bug and is refused
  everywhere.** Collapsing them would let a blank address reach a submitted booking.

## Failure, and what each one shows

| What happened | Where | What the customer sees |
|---|---|---|
| Somebody else took the slot between choosing and confirming | step 1 | the grid refreshes with that time gone, and says so |
| The draft's thirty minutes ran out mid-flow | steps 2, 3 | the slot was released; back to step 1 with the service kept |
| Not signed in | step 1 | sign in, return here, choice intact |
| No saved addresses | step 2 | the add-address form, not an empty list |
| Phone number refused | step 3 | the same normaliser the charge uses, so a number accepted here is one M-Pesa will take |

The phone normaliser is `msisdn.ts`, already built and already refusing a nine-digit number with
the wrong prefix. Validating with a second, laxer rule in the browser would let a customer past a
check the charge will fail on later.

## Testing

The pages get the treatment the rest of this frontend has: the view models tested against fakes,
the domain helpers tested directly, and the pieces reused from the sheet keeping the tests they
already have.

Two behaviours are worth naming because they are easy to write so they cannot fail:

- **The one-open-draft rule.** The test needs a customer who already holds a draft on a *different*
  slot, and must assert the first is expired and its slot released — not merely that the second was
  created.
- **`submit`'s address refusal.** The fixture must carry a draft with a null address and assert the
  refusal, and separately a draft with a blank one. A test using only a complete address cannot
  fail if the check is dropped.

## Scope

**In:** the three pages, the address nullability and its invariant, the one-open-draft rule,
`booking.submit` mounted, the phone requirement and its refusal, a `booking.byId` query for the
customer's own booking, and deleting the sheet.

**Out, and each for its own reason:**

- **The provider's inbox** — its own spec, next. Until it exists, a submitted request can only be
  accepted by hand.
- **`accept` and `decline` mounted**, and the notification relay. Both belong with the inbox: a
  mutation nobody can call and a notification nobody can act on are the same kind of unfinished.
- **Card and cash.** M-Pesa only this phase, decided 2026-08-31. Step 3 shows one method, not a
  chooser with two disabled options.
- **Rate limiting** — follow-up #108. The one-draft rule handles the ordinary customer; a throttle
  is a platform concern and belongs with mounting the write surface behind one.
- **A minimum lead time** — follow-up #103. Deadlines are already capped at the slot's start, so
  nothing can be charged for a service whose time has passed; refusing to *offer* such a slot is
  Scheduling's.

## What this costs in already-shipped work

- Three columns become nullable, and one migration.
- `Booking.create` accepts a null address; `submit` requires one.
- `CreateBookingCommand` expires a prior draft.
- `AvailabilitySheet` is deleted; its three children are kept and reused.
- `booking.mine` already returns drafts. A `booking.byId` for the owner is new.

Untouched: the snapshot, the commission, seats, the exclusion constraint, the three clocks, the
sweeps, and the charge.
