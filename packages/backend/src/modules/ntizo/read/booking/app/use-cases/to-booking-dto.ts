import type { BookingDTO } from "@ntizo/shared/read-models";
import { mediaUrl } from "../../../../shared/infrastructure/media/media-url";
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
 * `startsAt`/`endsAt`/`expiresAt`/`paidAt`/`createdAt` as `z.string()`, and a
 * row is whatever `SELECT` returned.
 *
 * So does the key-to-URL one, for the matching reason: the row carries
 * `service.image_keys` and `provider.logo_key` because that is what the
 * columns hold, and which bucket serves them is `mediaUrl`'s decision — one
 * a repository has no business making and a caller has no business
 * repeating. `ListMyServicesProjection` puts the same seam in the same
 * place.
 */
export function toBookingDTO(row: BookingListRow): BookingDTO {
  return {
    id: row.id,
    status: row.status,
    serviceId: row.serviceId,
    serviceOptionId: row.serviceOptionId,
    providerId: row.providerId,
    serviceName: row.serviceName,
    providerName: row.providerName,
    providerSlug: row.providerSlug,
    providerVerified: row.providerVerified,
    providerRatingAverage: row.providerRatingAverage,
    // **The first key that resolves, not the first key.** `mediaUrl` answers
    // null where nothing serves the bucket, so taking `[0]` and mapping it
    // would drop a service to a grey tile because of one unservable image
    // while three perfectly good ones sat behind it. Same rule
    // `ListMyServicesProjection` states for the whole array — it filters
    // after mapping, for the same reason — narrowed to the one this reader
    // publishes.
    serviceImageUrl: (row.serviceImageKeys ?? []).map(mediaUrl).find((u) => u !== null) ?? null,
    providerLogoUrl: mediaUrl(row.providerLogoKey),
    optionName: row.optionName,
    durationMinutes: row.durationMinutes,
    locationType: row.locationType,
    priceMinor: row.priceMinor,
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
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
