import { BOOKING_CHARGE_ATTEMPT_LIMIT } from "./charge-accepted-bookings.internal.command";
import { BOOKING_CHARGE_MIN_WINDOW_MS } from "./charge-booking.command";
import {
  BookingChargeAttemptsSpentError,
  BookingNoCustomerPhoneError,
  BookingNotFoundError,
  BookingPaymentWindowClosedError,
  BookingTransitionError,
  NotBookingCustomerError,
} from "../../domain/exceptions";
import type { BookingRepositoryPort } from "../ports/outbound/booking.repository.port";
import type { CustomerPhoneReaderPort } from "../ports/outbound/customer-phone.reader.port";
import type { ChargeBookingInternalPort } from "../ports/inbound/charge-booking.internal.command.port";

export interface RequestBookingChargeInput {
  bookingId: string;
  /** From `requireUser` at the GraphQL layer, never from the client. */
  requesterUserId: string;
}

/**
 * The customer presses "Pagar" and asks to be charged now, instead of
 * waiting for the per-minute sweep to reach this booking on its own.
 *
 * **Everything here is a cheap read, and nothing here blocks.** Ownership,
 * the status, the attempt count, the payment window and the phone number are
 * five reads of a row this command's own `findById` already loaded (one of
 * them, `chargeAttemptsOf`, a second, single-column read — see that port
 * method's own comment for why the count could not simply travel on the
 * aggregate). Every one of the five is a refusal the customer can act on:
 * sign in as yourself, wait for the provider, stop retrying, come back in a
 * moment, or give us a number. The gateway call behind them all is the one
 * slow thing — a C2B blocks for up to 110 seconds — and it is not waited for;
 * see `ChargeBookingInternalPort` and `DeferredBookingCharge` for how it runs
 * after this method has already returned.
 *
 * **The order is the point of this command, not an implementation detail.**
 * Ownership first, because nothing past it is this caller's business to
 * learn. Status second, because a booking not `PENDING_PAYMENT` has nothing
 * here to check. Then the attempt bound and the payment window, in that
 * order, because both are read-only tests against a claim nobody is about to
 * make yet — cheaper to fail on than a network call, and both true regardless
 * of who is asking. **The phone number is checked last, and it is checked
 * before anything claims an attempt.** `ChargeBookingCommand` treats a
 * missing number as an ordinary charge failure and spends an attempt on it —
 * the right answer for a sweep that has nobody to ask, and the wrong one for
 * a customer who is looking at the screen right now and could simply be
 * told. Without this command, that customer's three attempts burn in
 * silence and their provider is eventually told they did not pay, which is
 * false; `ChargeBookingCommand`'s own doc comment says the real fix "belongs
 * to a screen that does not exist yet". This is that screen's other half,
 * and refusing here, ahead of `ChargeBookingInternalPort.execute`, is the
 * entire reason it exists rather than being a client-side shortcut into the
 * sweep.
 *
 * **The attempt bound is not bypassed; the cooldown is.** `BOOKING_CHARGE_ATTEMPT_LIMIT`
 * still holds — a customer mashing "Pagar" cannot out-request the same three
 * tries the sweep is bound by, and `BookingChargeAttemptsSpentError` is what
 * stops a fourth. The cooldown between sweep attempts (`BOOKING_CHARGE_RETRY_MINUTES`)
 * exists only to keep an *unattended* sweep from stacking a second prompt on
 * a live one; a press is not that, so `notAttemptedSince` is handed down as
 * this call's own instant — a predicate every row satisfies — the same way
 * `ChargeBookingInput.notAttemptedSince`'s own comment describes the sweep
 * doing it with the wave's instant instead.
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
    private readonly charge: ChargeBookingInternalPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: RequestBookingChargeInput): Promise<void> {
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

    const attempts = await this.repo.chargeAttemptsOf(input.bookingId);
    if (attempts >= BOOKING_CHARGE_ATTEMPT_LIMIT) {
      throw new BookingChargeAttemptsSpentError(input.bookingId);
    }

    // The same floor `recordChargeAttempt` re-asserts at the write — see
    // `BOOKING_CHARGE_MIN_WINDOW_MS`'s own comment for the failure this
    // avoids starting: a call still blocking when the deadline sweep passes
    // gets this booking cancelled and its provider told the customer did not
    // pay, and then lands anyway with the money already moved.
    if (!booking.expiresAt || booking.expiresAt.getTime() - at.getTime() < BOOKING_CHARGE_MIN_WINDOW_MS) {
      throw new BookingPaymentWindowClosedError(input.bookingId);
    }

    // Last, and deliberately so — see this class's own doc comment. Nothing
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
      notAttemptedSince: at,
    });
  }
}
