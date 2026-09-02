import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { booking } from "../../../../../shared/infrastructure/database/booking/schemas";
import type { BookingReaderPort } from "../../../app/ports/outbound/booking-reader.port";

/** The single place Communication touches Booking's table — see the port. */
export class DrizzleBookingReader implements BookingReaderPort {
  async isOwnedBy(bookingId: string, requester: { userId: string; providerId: string | null }): Promise<boolean> {
    const owner =
      requester.providerId === null
        ? eq(booking.customerId, requester.userId)
        : eq(booking.providerId, requester.providerId);
    const [row] = await getDb()
      .select({ id: booking.id })
      .from(booking)
      .where(and(eq(booking.id, bookingId), owner))
      .limit(1);
    return row !== undefined;
  }
}
