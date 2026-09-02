import type { BookingDTO } from "@ntizo/shared/read-models";
import type { BookingReadRepositoryPort } from "../ports/outbound/booking-read.repository.port";
import { toBookingDTO } from "./to-booking-dto";

/**
 * A customer's own bookings, newest first.
 *
 * Takes no reader-supplied customer id. `customerId` is stamped by the
 * GraphQL handler from the session, never read from `args` — BR7 gives a
 * customer the right to read their own bookings and nobody else's, and a
 * query that took the id as an argument would be the endpoint that reads
 * anybody's.
 */
export class ListMyBookingsProjection {
  constructor(private readonly repo: BookingReadRepositoryPort) {}

  async execute(input: { customerId: string }): Promise<BookingDTO[]> {
    const rows = await this.repo.listForCustomer(input.customerId);
    return rows.map(toBookingDTO);
  }
}
