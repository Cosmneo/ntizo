import type { BookingDTO } from "@ntizo/shared/read-models";
import type { BookingReadRepositoryPort } from "../ports/outbound/booking-read.repository.port";

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
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      serviceName: r.serviceName,
      providerName: r.providerName,
      providerSlug: r.providerSlug,
      optionName: r.optionName,
      durationMinutes: r.durationMinutes,
      priceMinor: r.priceMinor,
      commissionBps: r.commissionBps,
      commissionMinor: r.commissionMinor,
      currency: r.currency,
      // The wire carries an ISO string, never a `Date` — `bookingReadModel`
      // declares `startsAt`/`endsAt`/`expiresAt`/`createdAt` as `z.string()`,
      // and the conversion belongs at this boundary, the same seam
      // `ListActivityProjection` stringifies `occurredAt` at.
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      addressLabel: r.addressLabel,
      addressLine: r.addressLine,
      addressCity: r.addressCity,
      addressDistrict: r.addressDistrict,
      addressDirections: r.addressDirections,
      description: r.description,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
