import { DrizzleBookingReadRepository } from "../infra/repositories/drizzle/booking-read.repository";
import { GetMyBookingProjection } from "../app/use-cases/get-my-booking.projection";
import { ListMyBookingsProjection } from "../app/use-cases/list-my-bookings.projection";
import { ListProviderBookingsProjection } from "../app/use-cases/list-provider-bookings.projection";
import { GetProviderBookingProjection } from "../app/use-cases/get-provider-booking.projection";
import { DrizzleProviderReadRepository } from "../../provider/infra/repositories/drizzle/provider-read.repository";

/**
 * A reader of its own, not a reuse of `DrizzleBookingRepository` — the
 * opposite ruling from `read/activity`'s and `read/notification`'s
 * bootstraps, and deliberately so.
 *
 * Those two reuse the write side's repository because the read model there
 * is the same rows in the same shape as the write side's — a second class
 * running identical SQL would just be two places to fix one bug. That does
 * not hold here: `DrizzleBookingRepository` rebuilds a full `Booking` through
 * `Booking.restore` on every row, which re-runs every blank/date/range guard
 * `create` runs plus both consistency checks (`endsAt` against
 * `startsAt`+`durationMinutes`, `commissionMinor` against `priceMinor`+
 * `commissionBps`). That work is exactly right immediately before a command
 * changes a booking — it is what makes reconstitution trustworthy — and pure
 * cost against a list nobody here is about to mutate. Worse, running it over
 * every row on this page means one snapshot that fails a consistency check
 * throws and takes the whole page down.
 *
 * `read/catalog`'s `DrizzleServiceReadRepository` is this reader's
 * precedent instead: select exactly the columns the DTO carries, and let a
 * bad row be a bad row rather than a failed request.
 */
export function bootstrapBookingRead() {
  const repo = new DrizzleBookingReadRepository();

  return {
    adapters: { repo },
    useCases: {
      listMine: new ListMyBookingsProjection(repo),
      // Checkout's steps 2 and 3 are pages about one booking, not a list.
      // The same repository, because both read the same columns off the same
      // table for the same customer — only the `WHERE` differs.
      getMine: new GetMyBookingProjection(repo),
      listForProvider: new ListProviderBookingsProjection(repo),
      getForProvider: new GetProviderBookingProjection(repo),
      /** Only `isMember` is used, and only to answer "may this person look" — the wallet's arrangement. */
      providerRead: new DrizzleProviderReadRepository(),
    },
  };
}

export type BookingReadBootstrap = ReturnType<typeof bootstrapBookingRead>;
