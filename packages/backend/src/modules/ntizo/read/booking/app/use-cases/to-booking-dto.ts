import type { BookingDTO } from "@ntizo/shared/read-models";
import type { BookingListRow } from "../ports/outbound/booking-read.repository.port";

/**
 * One row as `bookingReadModel` carries it.
 *
 * Shared by `ListMyBookingsProjection` and `GetMyBookingProjection` rather
 * than written out twice: it is a twenty-field mapping over the same row
 * type, and a second copy is a second place for a field to be forgotten when
 * the read model grows — the reader would then quietly disagree with itself
 * depending on whether the customer reached the booking through the list or
 * through its own page.
 *
 * The `Date`-to-ISO-string conversion belongs at this seam, not in the
 * repository and not on the wire: `bookingReadModel` declares
 * `startsAt`/`endsAt`/`expiresAt`/`createdAt` as `z.string()`, and a row is
 * whatever `SELECT` returned.
 */
export function toBookingDTO(row: BookingListRow): BookingDTO {
  return {
    id: row.id,
    status: row.status,
    serviceId: row.serviceId,
    serviceOptionId: row.serviceOptionId,
    serviceName: row.serviceName,
    providerName: row.providerName,
    providerSlug: row.providerSlug,
    optionName: row.optionName,
    durationMinutes: row.durationMinutes,
    priceMinor: row.priceMinor,
    commissionBps: row.commissionBps,
    commissionMinor: row.commissionMinor,
    currency: row.currency,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timezone: row.timezone,
    addressLabel: row.addressLabel,
    addressLine: row.addressLine,
    addressCity: row.addressCity,
    addressDistrict: row.addressDistrict,
    addressDirections: row.addressDirections,
    description: row.description,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
