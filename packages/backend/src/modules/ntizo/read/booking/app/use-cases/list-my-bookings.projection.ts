import type { CustomerBookingPageDTO } from "@ntizo/shared/read-models";
import type { CustomerBookingTab } from "@ntizo/shared";
import type { BookingReadRepositoryPort } from "../ports/outbound/booking-read.repository.port";
import { toBookingDTO } from "./to-booking-dto";

export interface ListMyBookingsInput {
  /** Stamped by the handler from the session, never read from `args`. */
  customerId: string;
  tab: CustomerBookingTab;
  limit: number;
  offset: number;
  /** Injected: what counts as "upcoming" is a question about a clock. */
  now: Date;
}

/**
 * One tab of a customer's own bookings, with the counts the chips render.
 *
 * Takes no reader-supplied customer id. `customerId` is stamped by the
 * GraphQL handler from the session — BR7 gives a customer the right to read
 * their own bookings and nobody else's, and a query that took the id as an
 * argument would be the endpoint that reads anybody's.
 *
 * Three reads, not one: the page, its total, and the three counts. The counts
 * are their own grouped query rather than three totals, so the chips cannot
 * disagree with each other about the same instant.
 */
export class ListMyBookingsProjection {
  constructor(private readonly repo: BookingReadRepositoryPort) {}

  async execute(input: ListMyBookingsInput): Promise<CustomerBookingPageDTO> {
    const filter = { tab: input.tab, now: input.now };
    const [rows, total, counts] = await Promise.all([
      this.repo.listForCustomer(input.customerId, filter, input.limit, input.offset),
      this.repo.countForCustomer(input.customerId, filter),
      this.repo.countsForCustomer(input.customerId, input.now),
    ]);

    const nextOffset = input.offset + rows.length;
    return {
      items: rows.map(toBookingDTO),
      total,
      // Null rather than an offset past the end: a pager handed a number it
      // cannot fill offers a page that is not there.
      nextOffset: nextOffset < total ? nextOffset : null,
      counts,
    };
  }
}
