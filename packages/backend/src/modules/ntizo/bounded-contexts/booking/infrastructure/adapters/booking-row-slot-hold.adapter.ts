import type { SlotHoldPort, SlotWindow } from "../../app/ports/outbound/slot-hold.port";

/**
 * The adapter for `SlotHoldPort` on a Scheduling context that has no hold
 * table. **All three methods are empty, and that is the point, not a gap.**
 *
 * The booking row *is* the hold. `booking_member_slot_active_uq` — the
 * partial unique index over the four slot-holding statuses
 * (`SLOT_HOLDING_STATUSES`) — is what actually stops two customers taking one
 * member's calendar slot, and it does that at the moment the row is inserted,
 * inside the same transaction `CreateBookingCommand` runs. Scheduling has
 * nothing to hold against: it computes availability from
 * `member_availability`, `date_exception` and `house_closure`, not from a
 * table of open holds.
 *
 * So each method has nothing to add to what `BookingRepositoryPort` already
 * did:
 * - `hold` — the insert that just happened already claimed the slot; the
 *   unique index enforced it.
 * - `release` — the status change to a non-holding status (`EXPIRED`,
 *   `DECLINED`, `CANCELLED`) already stops the index from counting this row;
 *   there is no separate hold record to remove.
 * - `transfer` — a reschedule's own `UPDATE` of `startsAt`/`endsAt` inside
 *   one transaction already moves what the index enforces; there is nothing
 *   held under the old slot that would otherwise linger.
 *
 * **What would make these non-empty:** if Scheduling ever materialises holds
 * as their own rows — for example, to let a slot be held before a booking
 * exists, or to hold time no booking will ever occupy — these three methods
 * are where that write lands. The port exists so that day's change touches
 * this file and not `CreateBookingCommand`, `ExpireBookingCommand`, or the
 * reschedule command Plan 2 adds: they already call `hold`, `release`, and
 * `transfer` as if the write happened, because from their side of the port it
 * always has.
 */
export class BookingRowSlotHold implements SlotHoldPort {
  async hold(_bookingId: string, _slot: SlotWindow): Promise<void> {
    // Nothing to do — see this class's doc comment.
  }

  async release(_bookingId: string): Promise<void> {
    // Nothing to do — see this class's doc comment.
  }

  async transfer(_bookingId: string, _to: SlotWindow): Promise<void> {
    // Nothing to do — see this class's doc comment.
  }
}
