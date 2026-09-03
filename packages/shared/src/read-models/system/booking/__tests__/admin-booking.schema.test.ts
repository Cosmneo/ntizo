import { describe, expect, it } from "vitest";
import { ADMIN_BOOKING_TABS, adminBookingPageReadModel, adminBookingReadModel } from "../admin-booking.schema";
import { NotificationType, bucketForNotificationType } from "../../../../enums";

const row = {
  id: "bk-1",
  status: "CONFIRMED",
  providerId: "prov-1",
  providerName: "Estúdio Mavalane",
  customerFirstName: "Ana",
  serviceName: "Corte de cabelo",
  startsAt: "2026-09-01T09:00:00.000Z",
  endsAt: "2026-09-01T09:45:00.000Z",
  timezone: "Africa/Maputo",
  priceMinor: 80000,
  commissionMinor: 8000,
  currency: "MZN",
  remindedAt: null,
  markedDoneAt: null,
  expiresAt: "2026-09-01T09:45:00.000Z",
  threadId: null,
};

describe("adminBookingReadModel", () => {
  it("accepts a booking waiting to be closed", () => {
    expect(adminBookingReadModel.parse(row)).toEqual(row);
  });

  it("carries the dispute's thread when there is one", () => {
    const disputed = { ...row, status: "DISPUTED", threadId: "th-1" };
    expect(adminBookingReadModel.parse(disputed).threadId).toBe("th-1");
  });

  it("refuses a status this queue never shows", () => {
    expect(() => adminBookingReadModel.parse({ ...row, status: "DRAFT" })).toThrow();
  });

  it("names the three tabs", () => {
    expect(ADMIN_BOOKING_TABS).toEqual(["unclosed", "in_window", "disputed"]);
  });

  it("pages like every other list in this app", () => {
    const page = adminBookingPageReadModel.parse({ items: [row], total: 1, nextOffset: null });
    expect(page.items).toHaveLength(1);
  });
});

describe("the six new notification types", () => {
  it("are transactional, like every other booking notice", () => {
    for (const type of [
      NotificationType.ProviderBookingCloseReminder,
      NotificationType.BookingMarkedDone,
      NotificationType.ProviderBookingAutoClosed,
      NotificationType.AdminBookingAutoClosed,
      NotificationType.BookingDisputed,
      NotificationType.BookingDisputeResolved,
    ]) {
      expect(bucketForNotificationType(type)).toBeNull();
    }
  });
});
