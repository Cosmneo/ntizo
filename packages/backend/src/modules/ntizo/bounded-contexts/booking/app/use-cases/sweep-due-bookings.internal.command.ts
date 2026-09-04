import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { SweepBookingCommand } from "./sweep-booking.command";

export interface SweepDueBookingsInternalInput {
  /** How many due bookings one sweep may claim. The cron caller's budget, not this command's. */
  limit: number;
}

/**
 * The sweep that turns "a clock ran out and nobody moved" into "the slot is
 * free again" — the only caller of `SweepBookingCommand`.
 *
 * One question against five clocks: `findDueForSweep` asks which bookings
 * are past their own deadline, whichever of the design's five windows
 * stamped it, and hands each one to `SweepBookingCommand`, which decides
 * what that particular status's clock running out actually means. **The five
 * do not share an ending, and one firing is not an ending at all** —
 * `DRAFT` and `AWAITING_PROVIDER` expire, `PENDING_PAYMENT` is cancelled,
 * `MARKED_DONE` is completed, and `CONFIRMED` is *asked* on its first firing
 * (status unchanged, clock pushed seven days) and only marked done on the
 * second. See that command's doc comment; this class deliberately knows none
 * of it, which is why its counter is named for how many bookings it settled
 * rather than for any one outcome.
 *
 * Without it, a customer who abandons a half-filled checkout, or a provider
 * who never answers, or a customer who never pays, would each hold that
 * provider member's slot against every other customer for ever, because the
 * exclusion constraint is doing exactly what it was built to do.
 *
 * Mirrors `NotifyUnreadInternalCommand` in Communication — same shape of
 * problem (a cron asks "what's due?", then acts on each row one at a time),
 * same answer, on purpose: this is not the first sweep in this codebase, and
 * it should not invent a second convention for the same job.
 *
 * **One bad row does not stop the sweep.** Each booking is settled inside
 * its own `try`; a failure is counted and logged with its booking id, and
 * the booking is left exactly as `findDueForSweep` found it, so the next
 * sweep picks it up again — the same reasoning `NotifyUnreadInternalCommand`
 * gives for leaving a failed message unmarked.
 *
 * **Idempotency is not this class's job.** `Booking.expire` and
 * `Booking.cancel` (via `SweepBookingCommand`) are both no-ops from a
 * status neither governs, so a booking this sweep claims twice — this run
 * and a concurrent or overlapping one — costs an extra no-op call, never a
 * double ending. Nothing here re-checks status for the same reason
 * `SweepBookingCommand`'s own doc comment gives: that decision belongs to
 * the aggregate, once.
 */
export class SweepDueBookingsInternalCommand {
  constructor(
    private readonly bookings: BookingRepositoryPort,
    private readonly sweepBooking: SweepBookingCommand,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * `swept`, not `expired`: of the five clocks only two end in `EXPIRED`,
   * one ends in `CANCELLED`, one in `COMPLETED`, and one ends in nothing at
   * all on its first firing — a `CONFIRMED` booking is asked, not closed,
   * and keeps its status. This class cannot tell which a given
   * booking got without re-deriving a decision that belongs to
   * `SweepBookingCommand`, and a count named for any one outcome would be
   * wrong for every booking that got another. What this number honestly says
   * is how many due bookings were settled without throwing — including the
   * ones that were only asked a question.
   */
  async execute(
    input: SweepDueBookingsInternalInput,
  ): Promise<{ swept: number; failed: number }> {
    const due = await this.bookings.findDueForSweep(this.now(), input.limit);

    let swept = 0;
    let failed = 0;

    for (const booking of due) {
      try {
        // findDueForSweep only ever returns rows the database already
        // assigned an id to.
        await this.sweepBooking.execute({ bookingId: booking.id as string });
        swept++;
      } catch (error) {
        // A slot leak avoided for every other booking in the wave is worse
        // to give up than the one that failed — left for the next sweep to
        // retry rather than taking the batch down with it.
        //
        // console.error, not the logger: getRequestScopedLogger() throws
        // when no scope is set and a cron invocation sets none — the same
        // reason notify-unread.internal.command.ts does this instead.
        failed++;
        console.error("[booking] could not settle a due booking", {
          bookingId: booking.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { swept, failed };
  }
}
