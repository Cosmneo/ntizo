import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { booking } from "../../../../../shared/infrastructure/database/booking/schemas";
import type {
  BookingListRow,
  BookingReadRepositoryPort,
} from "../../../app/ports/outbound/booking-read.repository.port";

/**
 * A customer's own bookings, read straight off `booking` — exactly the
 * columns `bookingReadModel` carries, never a full row through
 * `Booking.restore`. See `bootstrapBookingRead`'s doc comment for why this
 * reader exists instead of reusing `DrizzleBookingRepository`.
 */
export class DrizzleBookingReadRepository implements BookingReadRepositoryPort {
  async listForCustomer(customerId: string): Promise<BookingListRow[]> {
    const rows = await getDb()
      .select({
        id: booking.id,
        status: booking.status,
        serviceName: booking.serviceName,
        providerName: booking.providerName,
        providerSlug: booking.providerSlug,
        optionName: booking.optionName,
        durationMinutes: booking.durationMinutes,
        priceMinor: booking.priceMinor,
        commissionBps: booking.commissionBps,
        commissionMinor: booking.commissionMinor,
        currency: booking.currency,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        addressLabel: booking.addressLabel,
        addressLine: booking.addressLine,
        addressCity: booking.addressCity,
        addressDistrict: booking.addressDistrict,
        addressDirections: booking.addressDirections,
        description: booking.description,
        expiresAt: booking.expiresAt,
        createdAt: booking.createdAt,
      })
      .from(booking)
      .where(eq(booking.customerId, customerId))
      // Newest booking first, ties (two bookings made in the same instant)
      // broken by id so the order is total and stable across calls — the
      // same pairing `DrizzleActivityRepository.listForActor` orders by.
      .orderBy(desc(booking.createdAt), desc(booking.id));

    // `status` is `text`, kept honest by the `booking_status_known` CHECK
    // constraint rather than a Postgres enum — see `booking.schema.ts`. That
    // constraint is what makes this cast safe: a row reaching this method
    // already had its status validated against `BOOKING_STATUSES` by
    // Postgres, at write time. The same reasoning `DrizzleBookingRepository`'s
    // `toAggregate` relies on for the identical cast.
    return rows.map((r) => ({ ...r, status: r.status as BookingListRow["status"] }));
  }
}
