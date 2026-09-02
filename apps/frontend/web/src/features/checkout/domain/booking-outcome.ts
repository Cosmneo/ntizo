import type { BookingDTO } from "@ntizo/shared/read-models";

/**
 * The two facts a checkout page needs off a booking to know what became of
 * it. Deliberately not the whole DTO: this is a question about a lifecycle,
 * and a signature naming exactly what it reads cannot quietly start reading
 * something else.
 */
type Outcome = Pick<BookingDTO, "status" | "addressLabel">;

/**
 * `addressLabel` is null on a `DRAFT` and **only** on a `DRAFT`.
 *
 * The customer holds the slot on step 1 and gives the address on step 2, so a
 * draft that has not reached step 2 has none; `Booking.submit` refuses to
 * leave `DRAFT` without one, so every status past it carries all three
 * components. `BookingProps.addressLabel` says so in the aggregate and
 * `bookingReadModel` repeats it.
 *
 * That invariant is the only thing in the read model that can tell the two
 * halves of `EXPIRED` apart, which is why a question about a clock is
 * answered by reading an address.
 */
function neverSent(booking: Outcome): boolean {
  return booking.addressLabel === null;
}

/**
 * What became of this booking, in the terms a customer standing in checkout
 * needs — which is not the same list as `BookingStatus`.
 *
 * **One function, read by both step 2 and step 3.** They used to branch
 * separately and drifted the way two copies of a rule always do: step 3 knew
 * that an `EXPIRED` request means "nobody answered you" while step 2 answered
 * the identical row with "the provider will answer as soon as they can", one
 * back-press apart. Whatever these pages say about a booking, they now say
 * from the same reading of it.
 *
 * The mapping is not one-to-one with the status column, in both directions:
 *
 * - **`EXPIRED` means two different things**, and they need opposite answers.
 *   `BookingStatus.Expired` is documented as "a `DRAFT` whose checkout hold
 *   passed, **or** an `AWAITING_PROVIDER` whose response window did", and
 *   `SweepBookingCommand` writes it for both. The first is a slot to go back
 *   and re-pick; the second is a request that was really sent and really went
 *   unanswered, and sending *that* customer to step 1 tells them to choose
 *   another time without ever telling them why. `neverSent` is what separates
 *   them.
 * - **`CANCELLED` splits the same way**, and for a different reason. Its own
 *   doc restricts it to a `PENDING_PAYMENT` booking whose payment window
 *   closed — two hops past `DRAFT`, so `neverSent` is false there and the
 *   address check routes it to `paymentLapsed`. It is checked rather than
 *   assumed because a superseded draft is marked by
 *   `CreateBookingCommand` and a hand-cancelled one is a support action, and
 *   either would land here with no address.
 * - **Four statuses collapse into one answer.** `CONFIRMED`, `MARKED_DONE`,
 *   `COMPLETED` and `DISPUTED` are four very different places to be, and
 *   checkout can say exactly one true thing about all of them: the money has
 *   already moved. None of them is reachable without a charge landing, and a
 *   customer who arrives on a checkout page for one of them has nothing left
 *   to fill in.
 *
 * `unanswered` is **not an edge case this phase**: `accept` and
 * `decline` belong to the provider inbox's own spec and are not mounted, so a
 * lapsed response window is the expected end state of very nearly every
 * request sent. Before the sweep runs the same booking reads
 * `AWAITING_PROVIDER`, so what the customer is told must not flip on a
 * background job they cannot see — which is why both statuses have an answer
 * here rather than one of them falling through to a catch-all.
 */
export type CheckoutOutcome =
  /** Still the customer's to finish. The only outcome that renders a form. */
  | "draft"
  /**
   * The hold lapsed before the request was ever sent — the one outcome whose
   * honest answer is "back to step 1, keep the service". Every other outcome
   * below is a page the customer stays on.
   */
  | "released"
  /** Sent; the provider's window is open. */
  | "awaitingProvider"
  /** Sent; the provider's window closed with no answer. */
  | "unanswered"
  /** The provider said no. */
  | "declined"
  /** The provider said yes and the M-Pesa prompt is out. **The customer has something to do.** */
  | "awaitingPayment"
  /** The payment window closed unpaid, and the booking was called off. */
  | "paymentLapsed"
  /** Paid for, and past checkout entirely: confirmed, marked done, completed or disputed. */
  | "paid";

export function checkoutOutcome(booking: Outcome): CheckoutOutcome {
  switch (booking.status) {
    case "DRAFT":
      return "draft";
    case "AWAITING_PROVIDER":
      return "awaitingProvider";
    case "PENDING_PAYMENT":
      return "awaitingPayment";
    case "DECLINED":
      return "declined";
    case "EXPIRED":
      return neverSent(booking) ? "released" : "unanswered";
    case "CANCELLED":
      return neverSent(booking) ? "released" : "paymentLapsed";
    case "CONFIRMED":
    case "MARKED_DONE":
    case "COMPLETED":
    case "DISPUTED":
      return "paid";
  }
}
