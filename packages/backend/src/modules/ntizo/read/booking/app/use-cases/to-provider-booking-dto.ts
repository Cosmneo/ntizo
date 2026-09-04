import type {
  BookingTimelineEntryDTO,
  ProviderBookingDTO,
  ProviderBookingDetailDTO,
} from "@ntizo/shared/read-models";
import type {
  ProviderBookingRow,
  ProviderTimelineRow,
} from "../ports/outbound/booking-read.repository.port";

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
    // `expiresAt` carries five different deadlines depending on the status,
    // and only `dispute` ever clears it — see `bookingReadModel.expiresAt` —
    // so it means "respond by" only while the status says so. The status
    // check is what does the work here; the column being non-null is not
    // evidence of anything on its own.
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

/**
 * Creation first, then every recorded hop, then — while a clock is running —
 * the deadline still ahead, drawn hollow. The actor is derived, not stored:
 * a null `changedByUserId` is a machine hop, the customer's own id is the
 * customer, and anyone else is somebody in the workspace.
 */
function timelineOf(
  row: ProviderBookingRow,
  changes: readonly ProviderTimelineRow[],
  now: Date,
): BookingTimelineEntryDTO[] {
  const entries: BookingTimelineEntryDTO[] = [
    { at: row.createdAt.toISOString(), reason: "created_by_customer", actor: "customer", pending: false },
    ...changes.map((c) => ({
      at: c.changedAt.toISOString(),
      reason: c.reason,
      actor: c.changedByUserId === null ? ("system" as const) : c.changedByUserId === row.customerId ? ("customer" as const) : ("provider" as const),
      pending: false,
    })),
  ];
  const clock =
    row.status === "AWAITING_PROVIDER" ? "respond_by" : row.status === "PENDING_PAYMENT" ? "pay_by" : null;
  if (clock && row.expiresAt && row.expiresAt.getTime() > now.getTime()) {
    entries.push({ at: row.expiresAt.toISOString(), reason: clock, actor: "system", pending: true });
  }
  return entries;
}
