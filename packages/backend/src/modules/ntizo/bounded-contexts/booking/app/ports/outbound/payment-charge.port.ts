export interface PaymentChargeRequest {
  /**
   * Carried for the log line and for whatever reconciliation is written
   * later, not because the processor needs it — M-Pesa has no idea what a
   * booking is. Without it a failed charge is a code and a phone number with
   * nothing to attach them to.
   */
  readonly bookingId: string;
  /**
   * The customer's number as it is stored, punctuation and all. Normalising
   * it is the adapter's job: what "valid" means is a fact about the
   * processor's country and carrier, not about a booking.
   */
  readonly phone: string;
  /**
   * **Integer minor units**, the way money is counted everywhere else in this
   * codebase. Whatever the processor wants instead is the adapter's problem;
   * see `MpesaPaymentCharge`, which converts to major units, and its tests,
   * which are the reason that conversion is not written inline at a call site.
   */
  readonly amountMinor: number;
  /** ISO 4217. An adapter that cannot serve it refuses, rather than assuming its own. */
  readonly currency: string;
  /**
   * Our reference for this attempt — alphanumeric, at most 20 characters,
   * and **different on every attempt against the same booking**.
   *
   * It is what a customer sees on their statement and the only handle we
   * have on an attempt afterwards. `ChargeBookingCommand.chargeReference`
   * builds it from the booking id and the attempt number precisely so it can
   * be *reconstructed* from the row later: a reconciliation query for an
   * attempt whose outcome we never learned needs to be able to name it.
   */
  readonly reference: string;
}

export type PaymentChargeResult =
  | {
      readonly outcome: "paid";
      /**
       * The processor's own id for the money that moved — what
       * `Booking.markPaid` stores and deduplicates on, and what a refund
       * would have to name. Never our `reference`: that is what we called
       * the attempt, not what they called the payment.
       */
      readonly paymentRef: string;
    }
  | {
      /**
       * The processor answered, and the answer was no — a declined PIN, no
       * balance, a number it could not reach. **Safe to attempt again:**
       * nothing was debited and no prompt is left standing.
       */
      readonly outcome: "refused";
      /** The processor's code where there is one, an adapter-local one where there is not. */
      readonly code: string;
      /** The processor's own description. May be empty; never invented. */
      readonly description: string;
    }
  | {
      /**
       * **We do not know what happened, so this booking must never be
       * charged again.**
       *
       * The connection died, or a gateway in front of the processor answered
       * on its behalf while the prompt was still live on the customer's
       * handset, or the money moved and came back unidentifiable. Every
       * attempt carries a fresh reference (see `PaymentChargeRequest.reference`),
       * precisely so a retry is not refused as a duplicate — which means a
       * retry over a live prompt is a customer who can accept twice.
       *
       * **The trade, stated once so nobody optimises it back:** we would
       * rather miss a charge than take one twice. A missed charge cancels a
       * booking the customer can simply make again; a double debit is
       * unrecoverable, because this platform has no refund path and will not
       * have one until the Payment context exists.
       */
      readonly outcome: "ambiguous";
      readonly code: string;
      readonly description: string;
    };

/**
 * Whether this processor is in a state where charging anybody could work at
 * all — asked **before** a customer's retry budget is spent, never after.
 *
 * A stage missing its credentials, or pointed at the live gateway while still
 * carrying a sandbox shortcode, is a deployment fault that has nothing to do
 * with the customer. Discovering it *inside* `charge` meant every booking
 * accepted during the outage burnt an attempt on it, so a misconfiguration
 * lasting twelve minutes permanently killed every one of them — and then told
 * their providers the customer did not pay. Fixing the configuration
 * afterwards rescued nothing.
 *
 * Synchronous, and deliberately: this is a question about configuration, not
 * about the network. An implementation that needed I/O to answer it would be
 * answering a different question.
 */
export type PaymentChargeReadiness =
  | { readonly ready: true }
  | { readonly ready: false; readonly code: string; readonly description: string };

/**
 * Take money from a customer for one booking.
 *
 * **A failure is a result, not an exception.** Every ordinary way a charge
 * does not land — the customer ignored the prompt, mistyped their PIN, has no
 * balance, has no phone number stored at all — is the same fact from the
 * booking's point of view: the money did not arrive and the slot is still
 * unpaid. The caller counts the attempt, logs the code, and leaves the
 * booking `PENDING_PAYMENT` for the next wave or, past the attempt bound, for
 * its payment window to cancel. A thrown exception would have to be caught
 * and turned back into exactly that, one level up, at every call site.
 *
 * **But there are two kinds of failure and they are not interchangeable.**
 * `refused` means the processor said no; `ambiguous` means we cannot tell.
 * Only the first may be attempted again. See the two members below.
 *
 * **Nothing here is synchronous from a customer's point of view.** The charge
 * is triggered by the provider's acceptance, not by a click, so no request is
 * held open on it — which is what makes a port whose implementation blocks
 * for a minute (M-Pesa's C2B does) acceptable at all. See
 * `ChargeAcceptedBookingsInternalCommand` for where that minute is actually
 * spent, and why the wave that spends it is deliberately small.
 */
export interface PaymentChargePort {
  /**
   * Can this processor charge anybody right now? Asked before the attempt is
   * claimed — see `PaymentChargeReadiness` for why the ordering is the whole
   * point.
   *
   * May throw for a misconfiguration that must not be quietly absorbed (a
   * live gateway carrying a test merchant's shortcode, say). A throw is
   * counted as a failure by the wave and shouted about; what it does *not* do
   * is spend a customer's retry budget.
   */
  readiness(): PaymentChargeReadiness;

  charge(request: PaymentChargeRequest): Promise<PaymentChargeResult>;
}
