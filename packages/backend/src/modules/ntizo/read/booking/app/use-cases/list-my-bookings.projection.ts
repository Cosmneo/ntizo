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
    // TEMPORARY: Task 2 turned `listForCustomer` into a tabbed, paged query
    // (`CustomerListFilter` + `limit`/`offset`) and this projection has not
    // been rebuilt around tabs yet — that is Task 3's deliverable. The
    // arguments below are a placeholder wide enough to keep the package
    // compiling, not a considered default: a single tab and a limit standing
    // in for "everything", which is no longer literally true now that
    // `listForCustomer` answers one tab at a time.
    const rows = await this.repo.listForCustomer(
      input.customerId,
      { tab: "waiting", now: new Date() },
      1000,
      0,
    );
    return rows.map(toBookingDTO);
  }
}
