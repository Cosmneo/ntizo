import type { ProviderBookingDTO, ProviderBookingDetailDTO } from "@ntizo/shared/read-models";
import type {
  ProviderBookingRow,
  ProviderTimelineRow,
} from "../ports/outbound/booking-read.repository.port";
import { timelineOf } from "./booking-timeline";

/**
 * The statuses at which the provider may see who the customer is and exactly
 * where the job is. All four are on the far side of payment: the commission
 * comes out of the provider's payout, and a phone number handed over before
 * any money has moved is the cheapest possible "decline here, call me". The
 * rule lives here, in the mapper, so no screen can leak what it was never
 * sent.
 */
export const REVEALED_STATUSES: ReadonlySet<string> = new Set([
  "CONFIRMED",
  "MARKED_DONE",
  "COMPLETED",
  "DISPUTED",
]);

/** What a customer with no first name on their profile is called. Not translated: the read model promises a non-empty string, and the launch market reads Portuguese. */
const NAMELESS_CUSTOMER = "Cliente";

export function toProviderBookingDTO(row: ProviderBookingRow): ProviderBookingDTO {
  return {
    id: row.id,
    status: row.status as ProviderBookingDTO["status"],
    createdAt: row.createdAt.toISOString(),
    serviceId: row.serviceId,
    serviceOptionId: row.serviceOptionId,
    serviceName: row.serviceName,
    optionName: row.optionName,
    durationMinutes: row.durationMinutes,
    locationType: row.locationType,
    providerMemberId: row.providerMemberId,
    memberFirstName: row.memberFirstName,
    customerFirstName: row.customerFirstName ?? NAMELESS_CUSTOMER,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timezone: row.timezone,
    addressDistrict: row.addressDistrict,
    addressCity: row.addressCity,
    priceMinor: row.priceMinor,
    commissionBps: row.commissionBps,
    commissionMinor: row.commissionMinor,
    currency: row.currency,
    // `expiresAt` is never cleared — see `bookingReadModel.expiresAt` — so
    // it only means "respond by" while the status says so.
    respondBy: row.status === "AWAITING_PROVIDER" && row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

export function toProviderBookingDetailDTO(
  row: ProviderBookingRow,
  changes: readonly ProviderTimelineRow[],
  now: Date,
): ProviderBookingDetailDTO {
  const revealed = REVEALED_STATUSES.has(row.status);
  return {
    ...toProviderBookingDTO(row),
    addressLabel: row.addressLabel,
    addressLine: revealed ? row.addressLine : null,
    addressDirections: revealed ? row.addressDirections : null,
    customerPhone: revealed ? row.customerPhone : null,
    customerEmail: revealed ? row.customerEmail : null,
    description: row.description,
    paymentRef: row.paymentRef,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    timeline: timelineOf(row, changes, now),
  };
}
