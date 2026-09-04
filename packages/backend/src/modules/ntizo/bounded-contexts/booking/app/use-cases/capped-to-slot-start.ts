/**
 * Hold a deadline to the slot it protects: never later than `startsAt`.
 *
 * **A deadline may never outlive the thing it protects.** The design's first
 * three clocks — the checkout hold (`create`), the provider's response window
 * (`submit`), the payment window (`accept`) — are stamped onto the same
 * `expires_at` column by whichever hop enters the status, and their defaults
 * sum to 165 minutes. Those three are the whole of this helper's business:
 * the two clocks a booking gains once the work is over (`markPaid`'s park on
 * `endsAt`, and `markDone`'s feedback window, pushed by `reminded` and
 * `keepOpen`) all fall *after* the slot by construction, so capping them to
 * `startsAt` would be the opposite of this rule — and none of them calls
 * here. The only lead-time rule anywhere is
 * `SlotValidityReaderPort`'s `startsAt > now` at creation, which says nothing
 * about how much notice a booking needs. Without this cap: a customer books a
 * 14:00 slot at 13:30, submits at 13:45 against a window that runs to 15:45,
 * the provider accepts at 15:30 — ninety minutes after the service was due to
 * start — and the charge sweep pushes an M-Pesa prompt for work whose time has
 * passed. Under pay-first the money moved within fifteen minutes of checkout
 * and that gap could not open; the reversal is what stretched it to nearly
 * three hours.
 *
 * **A booking for a slot starting soon therefore gets short clocks, and may
 * expire almost at once. That is honest, not a bug.** A slot genuinely cannot
 * be held past its own start, and a countdown promising otherwise would be
 * promising a customer time that does not exist. Do not "fix" it by removing
 * the cap. The real remedy is a **minimum lead time** — a slot cannot be
 * offered with less notice than the clocks need — which is a Scheduling
 * decision about what `startsForDay` puts on the grid, not something a
 * Booking command can decide on its own.
 *
 * Applied in the commands, not in `Booking`: the aggregate takes each deadline
 * as an input by design, because `domain/` reaches for no configuration and
 * all three window lengths are `platform_settings` columns. The commands are
 * where a window length and a slot start are both already in hand.
 *
 * Always returns a fresh `Date` when it caps, never `startsAt` itself — the
 * capped value goes on to sit beside `startsAt` on the same booking, and two
 * props aliasing one `Date` is one mutation away from being one prop.
 */
export function cappedToSlotStart(deadline: Date, startsAt: Date): Date {
  return deadline.getTime() <= startsAt.getTime() ? deadline : new Date(startsAt.getTime());
}
