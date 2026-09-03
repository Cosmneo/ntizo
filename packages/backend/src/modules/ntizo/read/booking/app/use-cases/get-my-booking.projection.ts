import type { CustomerBookingDetailDTO } from "@ntizo/shared/read-models";
import type { BookingReadRepositoryPort } from "../ports/outbound/booking-read.repository.port";
import { timelineOf } from "./booking-timeline";
import { toBookingDTO } from "./to-booking-dto";

/**
 * One of the caller's own bookings, by id.
 *
 * Checkout's steps 2 and 3 are pages about a booking that already exists —
 * the draft step 1 created to hold the slot — and they need to load it to
 * render the service, the price and the countdown. `booking.mine` answers
 * with a list; nothing about a list is what those pages want.
 *
 * `customerId` is stamped by the GraphQL handler from the session, exactly as
 * `ListMyBookingsProjection`'s is, and is handed to the repository as *part
 * of the query* rather than checked against the row afterward — see
 * `BookingReadRepositoryPort.findForCustomer` for why that distinction is the
 * point of this use case rather than an implementation detail of it.
 *
 * `null` for a booking that does not exist and for one belonging to somebody
 * else alike, and it is not this layer's job to tell them apart: the
 * repository already declines to.
 *
 * It gained `timeline` on 2026-09-03, assembled by `timelineOf` — the same
 * function the provider's own detail page reads through, lifted out of
 * `to-provider-booking-dto.ts` so the two sides of one booking read one
 * history rather than two copies that could start disagreeing. The second
 * read, `timelineFor`, only runs once the first confirms the booking is the
 * caller's: there is no history to fetch for a booking that is not theirs.
 */
export class GetMyBookingProjection {
  constructor(private readonly repo: BookingReadRepositoryPort) {}

  async execute(input: {
    bookingId: string;
    customerId: string;
    now: Date;
  }): Promise<CustomerBookingDetailDTO | null> {
    const row = await this.repo.findForCustomer(input.bookingId, input.customerId);
    if (!row) {
      // No timeline read for a booking that is not the caller's. The history
      // of somebody else's booking is not a thing to fetch and then discard.
      return null;
    }

    const changes = await this.repo.timelineFor(row.id);
    return {
      ...toBookingDTO(row),
      timeline: timelineOf(
        // `BookingListRow` carries no `customerId` — it never needed one,
        // being read through a `WHERE` on exactly this value. The caller is
        // the customer by construction, so pass it back in.
        { createdAt: row.createdAt, customerId: input.customerId, status: row.status, expiresAt: row.expiresAt },
        changes,
        input.now,
      ),
    };
  }
}
