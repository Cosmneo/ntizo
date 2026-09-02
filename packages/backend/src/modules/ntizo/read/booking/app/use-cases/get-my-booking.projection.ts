import type { BookingDTO } from "@ntizo/shared/read-models";
import type { BookingReadRepositoryPort } from "../ports/outbound/booking-read.repository.port";
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
 */
export class GetMyBookingProjection {
  constructor(private readonly repo: BookingReadRepositoryPort) {}

  async execute(input: { bookingId: string; customerId: string }): Promise<BookingDTO | null> {
    const row = await this.repo.findForCustomer(input.bookingId, input.customerId);
    return row ? toBookingDTO(row) : null;
  }
}
