import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { CustomerPhoneReaderPort } from "../ports/outbound/customer-phone.reader.port";
import type { PaymentChargePort } from "../ports/outbound/payment-charge.port";
import type { MarkBookingPaidCommand } from "./mark-booking-paid.command";

export interface ChargeBookingInput {
  bookingId: string;
  /**
   * The attempt bound and the cooldown boundary this booking was *selected*
   * under, carried down so the claim below re-asserts the very same
   * predicate rather than a freshly-computed approximation of it. See
   * `BookingRepositoryPort.recordChargeAttempt`.
   *
   * Passed in rather than read from the constants next door on purpose: the
   * cooldown boundary is derived from the wave's own `now`, and a second
   * `new Date()` here would be a slightly different instant with no reason
   * to be.
   */
  maxAttempts: number;
  notAttemptedSince: Date;
}

/**
 * How many characters of the booking id go into a payment reference.
 *
 * M-Pesa's reference fields take at most twenty alphanumeric characters and a
 * booking id is a 36-character UUID, so something has to give. Sixteen hex
 * characters is sixty-odd bits — far more than enough to identify one booking
 * among this platform's, and it leaves room for the attempt number without
 * reaching the limit.
 */
const REFERENCE_ID_CHARS = 16;

/**
 * This attempt's reference: the booking, and which try this is.
 *
 * Two properties matter and neither is cosmetic. It must be **different on
 * every attempt**, because a processor that sees the same reference twice
 * refuses the second as a duplicate — which would make the retry the whole
 * design depends on fail for the wrong reason. And it must be
 * **reconstructible from the row**, because the one thing this design cannot
 * do today is find out what became of an attempt whose answer never came
 * back: a charge that succeeded a millisecond before the Worker was evicted
 * leaves a debited customer and a `PENDING_PAYMENT` booking, and the only way
 * to reconcile that later is to ask the processor about attempt N by name.
 * `charge_attempts` is on the row, so attempt N's reference can always be
 * rebuilt. (The asking itself — M-Pesa's `queryTransactionStatus` — is not
 * built here; see this file's own report.)
 *
 * Exported for its test: the alphanumeric-and-under-twenty contract is the
 * kind of thing that stays true until somebody changes a constant.
 */
export function chargeReference(bookingId: string, attempt: number): string {
  const compact = bookingId.replace(/-/g, "").slice(0, REFERENCE_ID_CHARS).toUpperCase();
  return `${compact}${String(attempt).padStart(2, "0")}`;
}

/**
 * Push a payment prompt at the customer for one accepted booking, and record
 * what came back.
 *
 * **This command is internal.** Nobody asks for it: the trigger is the
 * provider's acceptance, and by the time it runs the customer is not waiting
 * on a spinner — which is the whole reason a charge that blocks for a minute
 * is tolerable at all. It carries no authorisation check for the same reason
 * `MarkBookingPaidCommand` and `SweepBookingCommand` carry none: there is no
 * requesting user, only a sweep acting on a promise the provider already made.
 *
 * **Nothing here runs inside a transaction, deliberately.** A C2B call blocks
 * until the customer answers or ~60 seconds pass. Holding a Postgres
 * transaction open across that would pin this Worker's single connection —
 * the sweep's pool is `{ max: 1 }` — and hold a row lock on the booking for a
 * minute at a time, against a payment window measured in minutes. So the work
 * is three separate, individually-committed steps: count the attempt, call
 * the processor, then record the outcome. The middle step is the only slow
 * one and it touches no database at all.
 *
 * **The attempt is claimed before the call, not counted after it.** See
 * `BookingRepositoryPort.recordChargeAttempt` for both halves of that:
 * recording afterwards means a Worker evicted mid-call never consumes an
 * attempt, and a booking whose charge always dies that way is retried for
 * ever; and the write is a compare-and-swap rather than a counter, because
 * two waves of this sweep overlap by construction and the loser must charge
 * nobody. `null` back is handled exactly the way a losing `save` is handled
 * elsewhere in this context — return, silently, having written and announced
 * nothing.
 *
 * **A customer with no phone number is an ordinary failure.**
 * `profile.phone_number` is nullable and nothing in the shipped product
 * requires it, so this is reachable, and the design's answer is deliberately
 * *not* a new status, a new reason, or an early give-up: the attempt is
 * consumed like any other, and once the bound is spent the booking falls to
 * its payment window, which cancels it and tells the provider — the same
 * path, reached without a special case. It is logged distinctly so the
 * diagnosis is one line rather than an inference, because the real fix
 * (requiring a number before the customer can submit) belongs to a screen
 * that does not exist yet.
 *
 * **The success path goes through `MarkBookingPaidCommand`** rather than
 * transitioning the booking here. That command already owns the compare-and-
 * swap against the deadline sweep, the duplicate-reference idempotency, and
 * the `BookingPaid` publish; a second implementation of any of those is a
 * second place for them to be wrong. Same shape as
 * `SweepDueBookingsInternalCommand` driving `SweepBookingCommand`.
 */
export class ChargeBookingCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly customerPhone: CustomerPhoneReaderPort,
    private readonly paymentCharge: PaymentChargePort,
    private readonly markBookingPaid: MarkBookingPaidCommand,
    /**
     * The instant this attempt is stamped with — injected, matching
     * `ChargeAcceptedBookingsInternalCommand` and
     * `SweepDueBookingsInternalCommand`, which both take a clock for the
     * same reason.
     *
     * **Deliberately not the wave's `now`.** The wave's instant is when it
     * *selected* candidates; this is when the prompt is actually pushed, and
     * those differ by however long the wave has spent on the bookings ahead
     * of this one — up to `BOOKING_CHARGE_LIMIT` blocking calls, which is
     * minutes. `last_charge_attempt_at` answers "when was this customer last
     * prompted", so the later instant is the correct one: stamping the
     * wave's start would understate the elapsed time and let the next wave
     * re-prompt sooner than the cooldown intends.
     *
     * The *predicate* instants are the opposite case and come from the wave
     * (`input.notAttemptedSince`), so selection and claim test the identical
     * boundary. One clock for what is written, one for what is compared, and
     * the two are different questions.
     */
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ChargeBookingInput): Promise<void> {
    const booking = await this.repo.findById(input.bookingId);
    if (!booking) {
      // Nothing to charge and nothing to blame it on. The sweep that named
      // this booking read it moments ago, so a row that has gone is worth a
      // line rather than a throw that would count as a failed charge — see
      // `ChargeAcceptedBookingsInternalCommand`, which counts throws.
      console.error("[booking] a charge named a booking that no longer exists", {
        bookingId: input.bookingId,
      });
      return;
    }

    // A literal rather than the `BookingStatus` const, matching
    // `SweepBookingCommand`'s own switch: that const lives in
    // `shared/infrastructure/database/booking/enums.ts`, and no use case in
    // this bounded context reaches into `infrastructure/`. It is not a loose
    // string either — `booking.status` is that same union, so a status that
    // stopped existing is a compile error here rather than a comparison that
    // silently stops matching.
    if (booking.status !== "PENDING_PAYMENT") {
      // The ordinary race, answered the way `SweepBookingCommand` answers its
      // own: the sweep selected this row on a predicate it read before this
      // call, and the booking moved on — a payment landed, the window closed,
      // the provider's acceptance was overtaken. Silently, with nothing
      // written, because nothing here is anybody's fault.
      return;
    }

    // Committed before the call below, and both references are built from
    // what it returns. See this class's doc comment for both.
    const attempt = await this.repo.recordChargeAttempt({
      bookingId: input.bookingId,
      at: this.now(),
      maxAttempts: input.maxAttempts,
      notAttemptedSince: input.notAttemptedSince,
    });
    if (attempt === null) {
      // Another wave holds this booking — it claimed the attempt while this
      // one was blocked on an earlier booking's minute-long call, or the row
      // moved on, or the bound went with it. The same outcome a losing
      // compare-and-swap produces anywhere else here: nothing charged,
      // nothing written, nothing thrown, and no log line, because nothing
      // went wrong.
      return;
    }

    const phone = await this.customerPhone.findPhoneNumber(booking.customerId);
    if (phone === null) {
      // Distinct from every other failure line in this file on purpose: this
      // one has a known, named fix that is nobody's bug — the checkout form
      // does not ask for a number yet.
      console.error("[booking] cannot charge: the customer has no phone number on their profile", {
        bookingId: input.bookingId,
        attempt,
      });
      return;
    }

    const result = await this.paymentCharge.charge({
      bookingId: input.bookingId,
      phone,
      amountMinor: booking.priceMinor,
      currency: booking.currency,
      reference: chargeReference(input.bookingId, attempt),
    });

    if (result.outcome === "failed") {
      // console.error, not the logger: getRequestScopedLogger() throws when
      // no scope is set and a cron invocation sets none — the same reason
      // `SweepDueBookingsInternalCommand` and `notify-unread.internal.command.ts`
      // do this. The processor's own code and words, not a summary of them:
      // this line is the only record of why a charge did not land.
      console.error("[booking] a charge did not land", {
        bookingId: input.bookingId,
        attempt,
        code: result.code,
        description: result.description,
      });
      return;
    }

    // **Logged before it is recorded, because recording it can fail.**
    //
    // The money has moved by this line. `MarkBookingPaidCommand` has two
    // silent exits on the way to writing it down — a losing compare-and-swap
    // against the deadline sweep, and a `BookingTransitionError` whose
    // message carries statuses rather than the receipt — and either leaves a
    // debited customer with the processor's reference held nowhere but in a
    // local variable that is about to go out of scope.
    //
    // That is reachable, not theoretical: the deadline sweep runs first in
    // the same invocation and cancels bookings whose window has closed, so a
    // charge that returns late enough can land on a booking already called
    // off. `BOOKING_CHARGE_MIN_WINDOW_MS` is what makes that unlikely; this
    // line is what makes it recoverable when it happens anyway.
    //
    // console.error for the reason the rest of this file gives — no request
    // scope exists for `getRequestScopedLogger()` — and on the error channel
    // deliberately, so no log level can filter away a receipt.
    console.error("[booking] a charge landed", {
      bookingId: input.bookingId,
      attempt,
      paymentRef: result.paymentRef,
    });

    await this.markBookingPaid.execute({
      bookingId: input.bookingId,
      paymentRef: result.paymentRef,
    });
  }
}
