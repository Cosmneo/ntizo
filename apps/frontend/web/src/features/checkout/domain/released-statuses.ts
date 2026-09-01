import type { BookingDTO } from "@ntizo/shared/read-models";

/**
 * The statuses on which the slot is no longer being held for this customer.
 *
 * **A lapsed draft is a row, not a `null`.** The sweep marks it `EXPIRED` and
 * it goes on belonging to its customer, so `booking.byId` answers with it;
 * `CreateBookingCommand` marks a superseded draft the same way when the
 * customer starts a second checkout in another tab. Reading only `null` as
 * "expired" would leave the commonest case — the thirty minutes ran out —
 * rendering a form under a countdown that is already at zero.
 *
 * Shared by steps 2 and 3 rather than written out in each, because the two
 * pages have to agree: a status one of them treats as live and the other as
 * released is a customer bounced back to step 1 from one page and left
 * filling in the next.
 */
export const RELEASED_STATUSES: ReadonlySet<BookingDTO["status"]> = new Set([
  "EXPIRED",
  "CANCELLED",
]);
