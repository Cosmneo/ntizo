import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { ExpireBookingCommand } from "./expire-booking.command";

export interface ExpireDueBookingsInternalInput {
  /** How many due bookings one sweep may claim. The cron caller's budget, not this command's. */
  limit: number;
}

/**
 * The sweep that turns "the payment window closed with nobody paying" into
 * "the slot is free again" — Task 12's caller for `ExpireBookingCommand`.
 *
 * Nothing else in this codebase calls `ExpireBookingCommand`: it exists
 * since Task 9, wired since Task 10, and until this class had no caller. A
 * customer who opens the payment page and walks away would hold that
 * provider member's slot against every other customer for ever, because
 * `booking_member_slot_active_uq` is doing exactly what it was built to do.
 *
 * Mirrors `NotifyUnreadInternalCommand` in Communication — same shape of
 * problem (a cron asks "what's due?", then acts on each row one at a time),
 * same answer, on purpose: this is not the first sweep in this codebase, and
 * it should not invent a second convention for the same job.
 *
 * **One bad row does not stop the sweep.** Each booking is expired inside
 * its own `try`; a failure is counted and logged, and the booking is left
 * exactly as `findDueForExpiry` found it, so the next sweep picks it up
 * again — the same reasoning `NotifyUnreadInternalCommand` gives for leaving
 * a failed message unmarked.
 *
 * **Idempotency is not this class's job.** `Booking.expire` (via
 * `ExpireBookingCommand`) is already a no-op for anything but
 * `PENDING_PAYMENT`, so a booking this sweep claims twice — this run and a
 * concurrent or overlapping one — costs an extra no-op call, never a double
 * expiry. Nothing here re-checks status for the same reason
 * `ExpireBookingCommand`'s own doc comment gives: that decision belongs to
 * the aggregate, once.
 */
export class ExpireDueBookingsInternalCommand {
  constructor(
    private readonly bookings: BookingRepositoryPort,
    private readonly expireBooking: ExpireBookingCommand,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    input: ExpireDueBookingsInternalInput,
  ): Promise<{ expired: number; failed: number }> {
    const due = await this.bookings.findDueForExpiry(this.now(), input.limit);

    let expired = 0;
    let failed = 0;

    for (const booking of due) {
      try {
        // findDueForExpiry only ever returns rows the database already
        // assigned an id to.
        await this.expireBooking.execute({ bookingId: booking.id as string });
        expired++;
      } catch (error) {
        // A slot leak avoided for every other booking in the wave is worse
        // to give up than the one that failed — left for the next sweep to
        // retry rather than taking the batch down with it.
        //
        // console.error, not the logger: getRequestScopedLogger() throws
        // when no scope is set and a cron invocation sets none — the same
        // reason notify-unread.internal.command.ts does this instead.
        failed++;
        console.error("[booking] could not expire a due booking", {
          bookingId: booking.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { expired, failed };
  }
}
