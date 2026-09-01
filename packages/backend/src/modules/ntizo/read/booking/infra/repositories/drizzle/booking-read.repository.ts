import { and, desc, eq } from "drizzle-orm";
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
      .select(SELECTED_COLUMNS)
      .from(booking)
      .where(eq(booking.customerId, customerId))
      // Newest booking first, ties (two bookings made in the same instant)
      // broken by id so the order is total and stable across calls — the
      // same pairing `DrizzleActivityRepository.listForActor` orders by.
      .orderBy(desc(booking.createdAt), desc(booking.id));

    return rows.map(withTypedStatus);
  }

  async findForCustomer(bookingId: string, customerId: string): Promise<BookingListRow | null> {
    const rows = await getDb()
      .select(SELECTED_COLUMNS)
      .from(booking)
      // Both halves in the `WHERE`, never an id lookup followed by an
      // ownership `if` — see `BookingReadRepositoryPort.findForCustomer` for
      // why that is the point of this method. A booking belonging to
      // somebody else is not fetched and then rejected; it is not fetched.
      .where(and(eq(booking.id, bookingId), eq(booking.customerId, customerId)))
      .limit(1);

    const row = rows[0];
    return row ? withTypedStatus(row) : null;
  }
}

/**
 * Exactly the columns `BookingListRow` carries — never `select()` with no
 * argument, which would widen silently every time the table gains one.
 *
 * Declared once and shared by both queries so the two can never disagree
 * about what a row is: a column added to the read model and wired into only
 * one of them would give the same booking different content depending on
 * whether the customer reached it through the list or through its own page.
 */
const SELECTED_COLUMNS = {
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
};

/**
 * `status` is `text`, kept honest by the `booking_status_known` CHECK
 * constraint rather than a Postgres enum — see `booking.schema.ts`. That
 * constraint is what makes this cast safe: a row reaching here already had
 * its status validated against `BOOKING_STATUSES` by Postgres, at write
 * time. The same reasoning `DrizzleBookingRepository`'s `toAggregate` relies
 * on for the identical cast.
 */
function withTypedStatus(row: Omit<BookingListRow, "status"> & { status: string }): BookingListRow {
  return { ...row, status: row.status as BookingListRow["status"] };
}
