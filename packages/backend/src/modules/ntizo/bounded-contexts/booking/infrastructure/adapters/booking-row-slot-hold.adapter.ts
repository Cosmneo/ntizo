import type { SlotHoldPort, SlotWindow } from "../../app/ports/outbound/slot-hold.port";

/**
 * The adapter for `SlotHoldPort` on a Scheduling context that has no hold
 * table. **All three methods are empty, and that is the point, not a gap.**
 *
 * The booking row *is* the hold — a database constraint over that row, not
 * a table of its own, is what makes the hold real. That constraint used to
 * be `booking_member_slot_active_uq`, a partial unique index keyed on
 * `(provider_member_id, starts_at)`; it is now `booking_member_slot_no_overlap`,
 * a partial `EXCLUDE USING gist` constraint over the same four slot-holding
 * statuses (`SLOT_HOLDING_STATUSES`) that also compares `ends_at`, which the
 * index never did (see that constraint's own comment in `booking.schema.ts`).
 * The object changed; the argument for this file being empty did not —
 * whichever one is live stops two customers taking one member's calendar
 * slot at the moment the row is inserted, inside the same transaction
 * `CreateBookingCommand` runs. Scheduling has nothing to hold against: it
 * computes availability from `member_availability`, `date_exception` and
 * `house_closure`, not from a table of open holds.
 *
 * So each method has nothing to add to what `BookingRepositoryPort` already
 * did:
 * - `hold` — the insert that just happened already claimed the slot; the
 *   exclusion constraint enforced it.
 * - `release` — the status change to a non-holding status (`EXPIRED`,
 *   `DECLINED`, `CANCELLED`) already moves this row outside the constraint's
 *   partial predicate; there is no separate hold record to remove.
 * - `transfer` — a reschedule's own `UPDATE` of `startsAt`/`endsAt` inside
 *   one transaction already moves what the constraint enforces; there is
 *   nothing held under the old slot that would otherwise linger.
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
