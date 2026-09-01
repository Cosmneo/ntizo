import type { BookingDTO } from "@ntizo/shared/read-models";

/**
 * The two facts a checkout page needs off a booking to know what became of
 * it. Deliberately not the whole DTO: these predicates are about a lifecycle,
 * and a signature naming exactly what it reads cannot quietly start reading
 * something else.
 */
type Outcome = Pick<BookingDTO, "status" | "addressLabel">;

/**
 * The statuses on which nothing is being held and nothing is being awaited.
 *
 * **A lapsed draft is a row, not a `null`.** The sweep marks it `EXPIRED` and
 * it goes on belonging to its customer, so `booking.byId` answers with it;
 * `CreateBookingCommand` marks a superseded draft the same way when the
 * customer starts a second checkout in another tab. Reading only `null` as
 * "expired" would leave the commonest case — the thirty minutes ran out —
 * rendering a form under a countdown that is already at zero.
 *
 * **This set is not on its own an answer**, which is why nothing exports it.
 * Both members are reachable from more than one place in the flow and mean
 * different things depending on which, so callers ask one of the two
 * predicates below instead.
 */
const RELEASED_STATUSES: ReadonlySet<BookingDTO["status"]> = new Set([
  "EXPIRED",
  "CANCELLED",
]);

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
 * The checkout hold ran out before the customer ever sent the request — the
 * one outcome whose honest answer is "back to step 1, keep the service".
 *
 * **`EXPIRED` means two different things, and this is the narrower one.**
 * `BookingStatus.Expired` is documented as "a `DRAFT` whose checkout hold
 * passed, **or** an `AWAITING_PROVIDER` whose response window did", and
 * `SweepBookingCommand` writes it for both. Steps 1 and 2 only ever meet the
 * first; step 3 is the only page on the far side of `submit`, so it is the
 * only one that can meet the second — and sending *that* customer back to
 * step 1 tells them to pick a new time without ever telling them their
 * provider did not answer.
 *
 * `CANCELLED` cannot be this case at all: its own doc restricts it to a
 * `PENDING_PAYMENT` booking whose payment window closed, which is two hops
 * past `DRAFT`. It stays in the set above because a set that omitted it would
 * read as an oversight; the address check is what excludes it.
 */
export function holdLapsedUnsent(booking: Outcome): boolean {
  return RELEASED_STATUSES.has(booking.status) && neverSent(booking);
}

/**
 * The request was sent and the provider's window closed with no answer.
 *
 * **Not an edge case this phase.** `accept` and `decline` belong to the
 * provider inbox's own spec and are not mounted, so a lapsed response window
 * is the expected end state of very nearly every request sent — and before
 * the sweep runs the same booking reads `AWAITING_PROVIDER`, so what the
 * customer is told must not flip on a background job they cannot see.
 */
export function requestWentUnanswered(booking: Outcome): boolean {
  return booking.status === "EXPIRED" && !neverSent(booking);
}
