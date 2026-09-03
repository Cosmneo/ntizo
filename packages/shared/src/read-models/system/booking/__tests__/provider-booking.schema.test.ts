import { describe, expect, it } from "vitest";
import {
  BOOKING_DECLINE_REASONS,
  providerBookingDetailReadModel,
  providerBookingReadModel,
} from "../provider-booking.schema";
import { NotificationType, bucketForNotificationType } from "../../../../enums";

const row = {
  id: "bk-1",
  status: "AWAITING_PROVIDER",
  createdAt: "2026-09-04T09:00:00.000Z",
  serviceId: "svc-1",
  serviceOptionId: "opt-1",
  serviceName: "Corte de cabelo",
  optionName: "Padrão",
  durationMinutes: 45,
  locationType: "at_customer",
  providerMemberId: null,
  memberFirstName: null,
  customerFirstName: "Ana",
  startsAt: "2026-09-05T09:00:00.000Z",
  endsAt: "2026-09-05T09:45:00.000Z",
  timezone: "Africa/Maputo",
  addressDistrict: "Polana",
  addressCity: "Maputo",
  priceMinor: 80000,
  commissionBps: 1000,
  commissionMinor: 8000,
  currency: "MZN",
  respondBy: "2026-09-04T11:00:00.000Z",
};

describe("providerBookingReadModel", () => {
  it("accepts a list row", () => {
    expect(providerBookingReadModel.parse(row)).toEqual(row);
  });

  it("refuses DRAFT — never a row on the provider's side", () => {
    expect(() => providerBookingReadModel.parse({ ...row, status: "DRAFT" })).toThrow();
  });

  it("the detail carries the revealable fields as nullable and a timeline", () => {
    const detail = providerBookingDetailReadModel.parse({
      ...row,
      addressLabel: null,
      addressLine: null,
      addressDirections: null,
      customerPhone: null,
      customerEmail: null,
      description: "Portão azul",
      paymentRef: null,
      expiresAt: "2026-09-04T11:00:00.000Z",
      timeline: [
        { at: "2026-09-04T09:00:00.000Z", reason: "submitted_by_customer", actor: "customer", pending: false },
        { at: "2026-09-04T11:00:00.000Z", reason: "respond_by", actor: "system", pending: true },
      ],
    });
    expect(detail.timeline).toHaveLength(2);
  });
});

describe("decline reasons and notification types", () => {
  it("names the four reasons a provider may give", () => {
    expect(BOOKING_DECLINE_REASONS).toEqual(["not_available", "cannot_perform", "outside_area", "other"]);
  });

  it("the two new notification types are transactional", () => {
    expect(bucketForNotificationType(NotificationType.BookingAccepted)).toBeNull();
    expect(bucketForNotificationType(NotificationType.ProviderBookingConfirmed)).toBeNull();
  });
});
