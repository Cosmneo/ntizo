import {
  BOOKING_CHARGE_ATTEMPT_LIMIT,
  BOOKING_CHARGE_RETRY_MINUTES,
} from "./charge-accepted-bookings.internal.command";
import { BOOKING_CHARGE_MIN_WINDOW_MS } from "./charge-booking.command";
import {
  BookingChargeAttemptsSpentError,
  BookingChargeUnavailableError,
  BookingNoCustomerPhoneError,
  BookingNotFoundError,
  BookingPaymentWindowClosedError,
  BookingTransitionError,
  NotBookingCustomerError,
} from "../../domain/exceptions";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { CustomerPhoneReaderPort } from "../ports/outbound/customer-phone.reader.port";
import type { PaymentChargePort } from "../ports/outbound/payment-charge.port";
import type { ChargeBookingInternalPort } from "../ports/inbound/charge-booking.internal.command.port";

const MS_PER_MINUTE = 60_000;

export interface RequestBookingChargeInput {
  bookingId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
}

/**
 * What one press of "Pagar" actually did.
 *
 * `"scheduled"` — a prompt was handed to the gateway path and is on its way.
 * `"already_sent"` — one was pushed within the cooldown and is, as far as
 * anything here can know, still live on the customer's handset; this press
 * deliberately pushed nothing over it.
 *
 * **A result rather than a thrown error, and rather than nothing at all.**
 * `"already_sent"` is not a refusal — the customer asked to be charged and a
 * charge is genuinely in flight — so surfacing it as an error would have the
 * page apologise for doing exactly what was asked. Returning `void`, as this
 * command did before the cooldown was honoured, is the other wrong answer: the
 * dialog would say "Enviámos um pedido M-Pesa" a second time, which reads as a
 * second prompt to a customer holding a handset showing one. The page words
 * the two differently; see `payDialogAlreadySent`.
 */
export type RequestBookingChargeOutcome = "scheduled" | "already_sent";

/**
 * The customer presses "Pagar" and asks to be charged now, instead of
 * waiting for the per-minute sweep to reach this booking on its own.
 *
 * **Everything here is a cheap read, and nothing here blocks.** Ownership,
 * the status, the charge ledger (the attempt count and when the last one was
 * claimed), the processor's readiness, the payment window and the phone
 * number are reads of a row this command's own `findById` already loaded, one
 * further single-row read (`chargeStateOf` — see that port method's own
 * comment for why those two columns could not simply travel on the
 * aggregate), and one synchronous, I/O-free question to the payment adapter.
 * Every one of them is a refusal the customer can act on: sign in as
 * yourself, wait for the provider, stop retrying, come back in a moment, or
 * give us a number. The gateway call behind them all is the one slow thing —
 * a C2B blocks for up to 110 seconds — and it is not waited for; see
 * `ChargeBookingInternalPort` and `DeferredBookingCharge` for how it runs
 * after this method has already returned.
 *
 * **The order is the point of this command, not an implementation detail.**
 * Ownership first, because nothing past it is this caller's business to
 * learn. Status second, because a booking not `PENDING_PAYMENT` has nothing
 * here to check. Then the attempt bound and the cooldown, read together off
 * one row; then the processor's readiness; then the payment window — all
 * read-only tests against a claim nobody is about to make yet, cheaper to
 * fail on than a network call, and all true regardless of who is asking.
 * **The phone number is checked last, and it is checked before anything
 * claims an attempt.** `ChargeBookingCommand` treats a missing number as an
 * ordinary charge failure and spends an attempt on it — the right answer for
 * a sweep that has nobody to ask, and the wrong one for a customer who is
 * looking at the screen right now and could simply be told. Without this
 * command, that customer's three attempts burn in silence and their provider
 * is eventually told they did not pay, which is false; `ChargeBookingCommand`'s
 * own doc comment says the real fix "belongs to a screen that does not exist
 * yet". This is that screen's other half, and refusing here, ahead of
 * `ChargeBookingInternalPort.execute`, is the entire reason it exists rather
 * than being a client-side shortcut into the sweep.
 *
 * **The press respects the cooldown; it does not bypass it.** This is a
 * reversal of an earlier decision, and the reversal is the whole of C3.
 * `BOOKING_CHARGE_RETRY_MINUTES` was read as protecting only an *unattended*
 * sweep from stacking a second prompt on a live one, so `notAttemptedSince`
 * used to be handed down as this call's own instant — a predicate every row
 * satisfies, which made the claim's compare-and-swap vacuous. A customer who
 * closed the dialog (its own copy invites them to: "Pode fechá-la sem
 * perigo") and pressed "Pagar" again ten seconds later therefore claimed
 * attempt two, built a *fresh* reference — deliberately, so the processor
 * would not reject it as a duplicate — and pushed a second prompt over a
 * first that may still have been live. `ChargeBookingCommand`'s `ambiguous`
 * branch already refuses precisely that outcome, in this codebase's own
 * words: "A second prompt over a live first one is a customer who can accept
 * both… we would rather miss a charge than take one twice; a double debit is
 * unrecoverable, because there is no refund path." The handset does not care
 * which of the two prompts a cron or a click produced.
 *
 * So the boundary the sweep computes is computed here, from the same
 * constant, and used twice: once above, to answer the customer honestly with
 * `"already_sent"` rather than a second prompt, and once below, as the
 * `notAttemptedSince` the claim itself re-asserts. Two presses that both slip
 * past the read — a genuine double-click, milliseconds apart — still produce
 * one prompt, because `recordChargeAttempt` is a compare-and-swap and the
 * loser takes no attempt. `BOOKING_CHARGE_ATTEMPT_LIMIT` still holds on top
 * of it: a customer cannot out-request the same three tries the sweep is
 * bound by, and `BookingChargeAttemptsSpentError` is what stops a fourth.
 *
 * **Readiness is asked here, not only inside the charge.**
 * `ChargeBookingCommand` consults `paymentCharge.readiness()` before spending
 * an attempt, for the reason its own comment gives — "twelve minutes of
 * misconfiguration permanently killed every booking accepted in that window"
 * — but by then this command has already answered "scheduled" and the page
 * has already told the customer a prompt is on its way to their handset.
 * Nothing was sent; they wait out the poll and are told the deadline passed.
 * The check is synchronous and does no I/O (`PaymentChargePort.readiness`),
 * so running it in the fast half costs nothing and turns that lie into a
 * refusal the customer can read.
 *
 * **The payment-window guard is re-tested, not trusted from here.**
 * `ChargeBookingCommand.execute`, by way of `BookingRepositoryPort.recordChargeAttempt`,
 * re-asserts the identical `BOOKING_CHARGE_MIN_WINDOW_MS` floor at the moment
 * it actually claims the attempt — this command's own check only refuses
 * early, with a reason, rather than letting an obviously-doomed request start
 * a gateway call that would lose the race to the deadline sweep anyway.
 */
export class RequestBookingChargeCommand {
  constructor(
    private readonly repo: BookingRepositoryPort,
    private readonly customerPhone: CustomerPhoneReaderPort,
    private readonly paymentCharge: PaymentChargePort,
    private readonly charge: ChargeBookingInternalPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: RequestBookingChargeInput): Promise<RequestBookingChargeOutcome> {
    const at = this.now();

    const booking = await this.repo.findById(input.bookingId);
    if (!booking) {
      throw new BookingNotFoundError(input.bookingId);
    }

    // Ownership, before anything else runs — see this class's own doc
    // comment for why this check outranks every other refusal below.
    if (booking.customerId !== input.requesterUserId) {
      throw new NotBookingCustomerError();
    }

    // A literal rather than the `BookingStatus` const, matching
    // `ChargeBookingCommand` and `SubmitBookingCommand`: that const lives in
    // `shared/infrastructure/database/booking/enums.ts`, and no use case in
    // this bounded context reaches into `infrastructure/`. `booking.status`
    // is that same union, so a status that stopped existing would be a
    // compile error here, not a comparison that silently stops matching.
    if (booking.status !== "PENDING_PAYMENT") {
      throw new BookingTransitionError(booking.status, "CONFIRMED");
    }

    // The one boundary, computed once from the sweep's own constant and used
    // twice — see this class's doc comment.
    const notAttemptedSince = new Date(
      at.getTime() - BOOKING_CHARGE_RETRY_MINUTES * MS_PER_MINUTE,
    );

    const ledger = await this.repo.chargeStateOf(input.bookingId);
    if (ledger.attempts >= BOOKING_CHARGE_ATTEMPT_LIMIT) {
      throw new BookingChargeAttemptsSpentError(input.bookingId);
    }

    // Not a refusal: a prompt this customer asked for is already on its way.
    // Answered before the window and the phone are read, because both of
    // those describe a charge that would be *started* now, and no charge is
    // going to be started now.
    if (ledger.lastAttemptAt !== null && ledger.lastAttemptAt > notAttemptedSince) {
      return "already_sent";
    }

    // Cheapest of all, and the one refusal that is categorically not the
    // customer's doing — see this class's doc comment.
    const readiness = this.paymentCharge.readiness();
    if (!readiness.ready) {
      console.error("[booking] a customer asked to pay, but the processor is not configured", {
        bookingId: input.bookingId,
        code: readiness.code,
        description: readiness.description,
      });
      throw new BookingChargeUnavailableError(input.bookingId);
    }

    // The same floor `recordChargeAttempt` re-asserts at the write — see
    // `BOOKING_CHARGE_MIN_WINDOW_MS`'s own comment for the failure this
    // avoids starting: a call still blocking when the deadline sweep passes
    // gets this booking cancelled and its provider told the customer did not
    // pay, and then lands anyway with the money already moved.
    if (!booking.expiresAt || booking.expiresAt.getTime() - at.getTime() < BOOKING_CHARGE_MIN_WINDOW_MS) {
      throw new BookingPaymentWindowClosedError(input.bookingId);
    }

    // Last, and deliberately so — see this class's doc comment. Nothing
    // above this line claims an attempt; this is the last chance to refuse
    // before one is.
    const phone = await this.customerPhone.findPhoneNumber(booking.customerId);
    if (!phone) {
      throw new BookingNoCustomerPhoneError(input.bookingId);
    }

    // Not awaited for anything beyond scheduling — `ChargeBookingInternalPort.execute`
    // resolves once the call has started, not once it has answered. Failures
    // past this point have nobody left to tell; `DeferredBookingCharge` owns
    // logging them, the same way `DeferredNotificationDelivery` owns logging
    // a deferred email's failure.
    await this.charge.execute({
      bookingId: input.bookingId,
      maxAttempts: BOOKING_CHARGE_ATTEMPT_LIMIT,
      notAttemptedSince,
    });

    return "scheduled";
  }
}
