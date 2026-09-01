import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { ChargeBookingCommand } from "./charge-booking.command";

/**
 * How many times one booking may be charged before it is left alone.
 *
 * Small on purpose. Each attempt is a prompt on somebody's handset, and a
 * customer who ignored three of them across a payment window is not a
 * customer the fourth reaches — they are a booking that is going to be
 * cancelled, and the design says so plainly: past this bound the sweep stops
 * attempting and the payment window does the rest, cancelling the booking and
 * telling the provider the customer never paid. **That path is reached with
 * no special case here** — this command simply stops selecting the row, and
 * `SweepBookingCommand` finds it when its deadline passes like any other
 * unpaid booking.
 *
 * The bound is what makes a permanent failure *visible* instead of infinite.
 * A handset that is off, a number that was mistyped, a wallet with no
 * balance: without it, each of those is a prompt every minute until the
 * window closes, and nothing in the row would ever say the platform had
 * stopped expecting a different answer.
 */
export const BOOKING_CHARGE_ATTEMPT_LIMIT = 3;

/**
 * How long to leave a booking alone between attempts.
 *
 * **This number exists because the cron interval is shorter than the call.**
 * A C2B blocks until the customer answers or ~60 seconds pass; the sweep
 * wakes every sixty seconds. Without a cooldown, wave two starts while wave
 * one's prompt is still live on the handset — a second prompt over a
 * pending one, and, if the customer accepts both, two debits for one booking.
 * With it, the three attempts spread across roughly ten minutes of a payment
 * window rather than three consecutive minutes of it.
 *
 * Comfortably longer than the call's own timeout (110 seconds, see
 * `MpesaClient`) so an attempt is always finished before the next is
 * considered, and short enough that all three fit inside a payment window
 * measured in minutes.
 */
export const BOOKING_CHARGE_RETRY_MINUTES = 5;

/**
 * How much payment window a booking must have left before it is worth
 * charging at all.
 *
 * A C2B blocks for up to `C2B_TIMEOUT_MS` (110 s, see `MpesaClient`). Select
 * a booking with thirty seconds left on its window and the call is still
 * blocking when its deadline passes — the next invocation's *deadline* sweep
 * runs first, cancels it, and tells the provider the customer did not pay —
 * and then the charge returns `INS-0`. A debited customer, a cancelled
 * booking, and a provider who has been told the opposite of what happened.
 *
 * So the charge sweep asks for bookings whose deadline is further away than
 * one whole call plus the write that follows it. Bookings inside that last
 * window are not charged; they simply run out and are cancelled, which is the
 * outcome they were heading for anyway.
 *
 * Must exceed `C2B_TIMEOUT_MS`, and a test in
 * `charge-booking.command.test.ts` asserts exactly that rather than trusting
 * this comment — the two numbers live in different layers and nothing else
 * would notice them drifting.
 */
export const BOOKING_CHARGE_MIN_WINDOW_MS = 180_000;

const MS_PER_MINUTE = 60_000;

export interface ChargeAcceptedBookingsInternalInput {
  /** How many bookings one wave may charge. The cron caller's budget, not this command's. */
  limit: number;
}

/**
 * The second question the cron asks: **which accepted bookings still owe a
 * charge?**
 *
 * The deadline sweep (`SweepDueBookingsInternalCommand`) asks what has run
 * out of time. This asks what has been promised and not yet paid for —
 * `PENDING_PAYMENT`, inside its window, under the attempt bound — and pushes
 * a payment prompt at each. The two run in the same cron invocation, in the
 * same `infraStore` scope, each in its own `try`, and their results are
 * disjoint by construction: `findDueForSweep` takes `expires_at <= now`,
 * `findAwaitingCharge` takes `expires_at > now`, so no booking is ever both
 * about to be cancelled for non-payment and about to be asked for payment.
 *
 * **The charge runs in the sweep rather than a queue**, decided 2026-09-01.
 * Nobody is waiting on a request: the trigger is the provider's acceptance,
 * not a customer's click, so there is no spinner a minute-long call would
 * hold. The cron already wakes every minute, already holds a database scope,
 * and already sweeps one thing; adding a second question is cheap and needs
 * no new deployment surface. A Cloudflare Queue would buy backoff for free
 * and is the alternative if this proves wrong — the retry bound and cooldown
 * above are this design paying for that backoff by hand.
 *
 * **One bad booking does not stop the wave.** Each is charged inside its own
 * `try`; a throw is counted and logged with its booking id, and the booking
 * is left as `findAwaitingCharge` found it — except for the attempt already
 * claimed against it, which is the point: a booking that throws every time
 * exhausts its bound and reaches the cancellation like any other, rather than
 * being retried for ever. Same shape and same reasoning as
 * `SweepDueBookingsInternalCommand`, which is where this pattern is argued
 * out in full.
 *
 * **What this query returns is a candidate list, not a claim.** Waves overlap
 * by construction — five bookings at up to two minutes each against a
 * sixty-second cron — so by the time this loop reaches its last booking,
 * another wave has been and gone. The bound and the cooldown are therefore
 * re-asserted at the write, in `recordChargeAttempt`, which is what actually
 * decides who charges whom; the criteria computed below are passed down so
 * both halves test the identical predicate against the identical instant.
 *
 * **Charged one at a time, not in parallel.** The cron's Postgres pool is
 * `{ max: 1 }`, so concurrent charges would interleave transactions on one
 * connection; and each call blocks for up to two minutes, so a wave is
 * budgeted in minutes rather than milliseconds. That is why `scheduled.ts`
 * gives this a far smaller limit than the deadline sweep's — see
 * `BOOKING_CHARGE_LIMIT` there.
 */
export class ChargeAcceptedBookingsInternalCommand {
  constructor(
    private readonly bookings: BookingRepositoryPort,
    private readonly chargeBooking: ChargeBookingCommand,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * `attempted`, not `charged`: what comes back from a processor is the
   * charge's business, not this loop's, and most attempts that do not become
   * money are not failures of this command at all — a customer who lets a
   * prompt time out is the ordinary case. `failed` counts only what threw,
   * which is the number `scheduled.ts` has a reason to shout about.
   *
   * `attempted` counts bookings this wave *handed to* `chargeBooking`, which
   * is not the same as bookings it charged: one whose claim lost to a
   * concurrent wave is counted here and prompted nobody. That is the honest
   * reading of a number this loop can actually know, and the alternative —
   * threading the claim's outcome back up — would be a return value invented
   * for a log line.
   */
  async execute(
    input: ChargeAcceptedBookingsInternalInput,
  ): Promise<{ attempted: number; failed: number }> {
    const now = this.now();
    // Computed once, here, and used twice: to select the candidates and — by
    // being handed to each `chargeBooking.execute` — to claim them. One
    // instant, so the two predicates cannot disagree by however long the
    // wave takes to run.
    const notAttemptedSince = new Date(
      now.getTime() - BOOKING_CHARGE_RETRY_MINUTES * MS_PER_MINUTE,
    );
    const due = await this.bookings.findAwaitingCharge({
      // Not `now`: a booking must have a whole call's worth of window left.
      // See `BOOKING_CHARGE_MIN_WINDOW_MS`.
      deadlineAfter: new Date(now.getTime() + BOOKING_CHARGE_MIN_WINDOW_MS),
      limit: input.limit,
      maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
      notAttemptedSince,
    });

    let attempted = 0;
    let failed = 0;

    for (const booking of due) {
      try {
        // findAwaitingCharge only ever returns rows the database already
        // assigned an id to.
        await this.chargeBooking.execute({
          bookingId: booking.id as string,
          maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
          notAttemptedSince,
        });
        attempted++;
      } catch (error) {
        // Every other booking in this wave is worth more than the one that
        // threw. console.error, not the logger, for the reason
        // `SweepDueBookingsInternalCommand` gives: a cron invocation sets no
        // request scope and `getRequestScopedLogger()` throws without one.
        failed++;
        console.error("[booking] could not charge an accepted booking", {
          bookingId: booking.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { attempted, failed };
  }
}
