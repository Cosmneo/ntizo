# Marketplace transactions — direction and decisions

**This is not a spec.** It records decisions taken in conversation that constrain
several future specs, so they survive the gap between deciding and building.
Each phase below gets its own spec and its own plan.

## Where the code actually is today

| | |
|---|---|
| A service is `priced` or `quote` | `SERVICE_BOOKING_MODES` — both shipped |
| `service_quote_form` | Exists and is configured — response hours, ask deadline / photos / location, intro. **Nothing reads it.** |
| `booking` | Three columns: `customerId`, `status`, `createdAt`. A stub. |
| Pricing, payment | **No tables at all.** |
| `wallet` / `wallet_entry` | A real append-only provider ledger, with entry types `booking_earning`, `earning_released`, `cash_settlement`, `payout` |
| Commission | 10%, customer side; provider receives the full price. `booking-total.ts` already computes `package + commission = total`. |
| Messaging | Phase 1 shipped. Attachments explicitly out of scope. |

The provider's half of escrow is already designed: an earning lands pending,
is released to available, and is later paid out. What does not exist is the
platform's own half.

## Three entrances, one spine

Everything discussed has three ways to begin and one way to end.

1. **Priced service** — the customer books at the listed price.
2. **Quote** — the customer asks *one* provider, who answers with a price. The
   `service_quote_form` already configures what gets asked.
3. **Job post** — the customer describes a need and *several* providers respond.

All three converge on the same object: **an agreement** — this provider, this
customer, this work, this price, this date. After that point nothing differs by
entrance. That is why this is one system with three doors, not three features.

## A customer-set price is not a bid

The job post splits in two, and the two are different objects rather than
variants of one:

- **The customer sets the price.** There is nothing to compare. It is an open
  offer a provider takes or leaves, and the customer's decision is about *who*,
  not *how much*.
- **The customer sets no price.** Providers propose, and the customer weighs
  price against timing against reputation.

Two screens, two decisions. Modelling them as one object will hurt.

## Build order, and why

**1. Attachments in messages.** Small, independent, useful immediately, and
prerequisite infrastructure for both later paths — `askPhotos` already sits in
the quote form waiting. R2 is already in use for documents and media.

**2. The simplest complete loop.** Book a `priced` service, pay, hold, complete,
release. This forces bookings *and* payments together, but against the easiest
case: no negotiation, no bidding, price already known. Every mechanism the
negotiated paths need gets exercised where it is easiest to tell whether it is
right.

**3. The quote path.** One customer, one provider, one proposal. Reuses all of
step 2 and adds one thing: the price is agreed rather than listed.

**4. Job posts and responses.** Last, because only here do the two hardest
product problems appear — how many providers may respond, and who gets
notified. Solving them on a spine that already works is far easier than
inventing both at once.

Proposals were **not** put first, deliberately. Designing them before a payment
model exists means designing them around an imagined one, and the real one —
holding, refunds, disputes, M-Pesa fees, reconciliation — will demand fields and
states that the imagined one did not.

## Keeping the deal on the platform

The strongest protection is structural, not a rule.

**Accepting a proposal is the same act as paying.** Not "accept, then arrange
payment" — accepting requires paying, the money is held, and that is what
creates the booking. There is deliberately no moment where a deal is closed and
the money is still undecided.

Then, in order of value:

- **Mask contact details until there is a paid booking** — no phone numbers,
  emails or M-Pesa numbers in messages before that point.
- **Attachments are a bypass and must ship with detection.** A photo of a
  business card, a PDF with a number in the footer. Deciding this when
  attachments are built, not after.
- **Warn rather than silently block.** Pattern matches produce false positives
  on legitimate text — an address contains numbers.
- **On-platform payment must be as easy as off-platform.** In Mozambique,
  sending M-Pesa to a number is one line of chat. If paying through the platform
  costs more steps than that, no policy compensates.

Three things accepted as true:

- Leakage never reaches zero. The goal is that it stays small and that large
  deals stay inside.
- **The commission sits on the side with the incentive to leave.** At 10%
  customer-side, the customer saves by going around and is usually the one who
  suggests it; the provider is financially indifferent and loses only reputation
  and payment security. The provider is therefore the natural ally, and needs
  reasons to insist.
- Providers with little work are the biggest early leak. That improves on its
  own once there is enough demand to make reputation worth protecting.

## Escrow decisions

**Release has a deadline.** A review accelerates release; it does not authorise
it. Without an automatic release after some period without dispute, a satisfied
customer who simply never reviews leaves the provider unpaid for ever, and
support ends up releasing money by hand.

**Disputes need an owner.** The moment third-party money is held, somebody must
decide "the work was not done" against "yes it was". That is admin work and it
is not optional.

## The platform's ledger

`wallet_entry` is the *provider's* book. It records what a provider earns. It
cannot answer what the platform transacted, because it never sees the gross or
the commission.

**Four numbers per movement, none derivable from the others:**

```
gross          what the customer paid, commission included
commission     what the platform kept
provider       what the provider is owed
processor fee  what M-Pesa charged
```

That fourth is the one usually forgotten. M-Pesa charges per transaction. If the
platform absorbs it, the real margin is 10% minus that fee, which on a cheap
service can consume the commission entirely. If the customer pays it, the gross
is not what the pricing page said. Either way it must be recorded, or the
reports are confidently wrong.

**Rules, inherited from `wallet_entry`'s existing design because it got them right:**

- Append-only. Nothing is updated or deleted.
- A refund is a new entry moving the other way, never an edit.
- Minor units as integers, never floats.
- The amount an entry is *about* stays separate from the signed movements, so a
  job settled in cash can be recorded honestly: earned, but not withdrawable.

**Never store a total.** A stored `total_gmv` drifts the first time a transaction
half-fails, cannot be rebuilt, and cannot answer a question nobody anticipated —
by category, by city, by provider, by month.

**The admin view is a query** over a date range: gross transacted, commission
kept, paid to providers, held and unreleased, processor fees. The `/admin` zone
already has the pattern.

**Reconciliation is what proves it.** What the ledger says is held must match
what is actually in the M-Pesa account. Without that check there is a handsome
report nobody can vouch for — and in a system holding other people's money,
"we are not sure" ends badly.

This is not a report bolted on later. It is a property of how money is recorded
from the first movement, and it belongs to step 2.

## Deliberately not decided yet

- How long until automatic release, and what pauses the clock
- Who adjudicates a dispute, and with what powers
- Whether the customer or the platform absorbs the processor fee
- How many providers may answer one job post, and how they are chosen
- Whether providers pay for leads
- Multi-currency, beyond storing the currency on every entry from the start
