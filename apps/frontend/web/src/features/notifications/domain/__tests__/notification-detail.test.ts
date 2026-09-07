import { describe, expect, it } from "vitest";
import type { NotificationDTO } from "@ntizo/shared/read-models";
import { detailFor } from "@/features/notifications/domain/notification-detail";
import { formatMoney } from "@/features/wallet/domain/money";

function item(type: string, payload: Record<string, unknown>): NotificationDTO {
  return { id: "n1", type, payload, createdAt: "2026-09-07T08:00:00.000Z", read: false };
}

const BOOKING = {
  bookingId: "bk-1",
  serviceName: "Limpeza profunda",
  providerName: "Clean & Fresh Maputo",
  startsAt: "2026-09-09T07:00:00.000Z",
  priceMinor: 250_000,
  currency: "MZN",
};

describe("detailFor", () => {
  it("names the service, the provider and the date of a customer's booking", () => {
    const line = detailFor(item("BOOKING_CONFIRMED", BOOKING), "en-US");
    expect(line).toMatch(/^Limpeza profunda · Clean & Fresh Maputo · /);
    // The date part is whatever Intl says for the locale; what matters is
    // that it is the booking's day, not the notification's.
    expect(line).toMatch(/Sep/);
    expect(line).toMatch(/\b9\b/);
  });

  it("adds the price only to the row that asks for payment", () => {
    const accepted = detailFor(item("BOOKING_ACCEPTED", BOOKING), "en-US");
    expect(accepted?.endsWith(` · ${formatMoney(250_000, "MZN", "en-US")}`)).toBe(true);

    const confirmed = detailFor(item("BOOKING_CONFIRMED", BOOKING), "en-US");
    expect(confirmed).not.toContain(formatMoney(250_000, "MZN", "en-US"));
  });

  it("names the customer on a workspace's booking, and skips them when the payload has no name", () => {
    // The workspace's copies carry the customer's name and never the
    // provider's own — `SubmitBookingCommand` and `MarkBookingPaidCommand`
    // both send `customerFirstName` and no `providerName`.
    const { providerName: _omitted, ...workspacePayload } = BOOKING;
    const named = detailFor(
      item("PROVIDER_BOOKING_RECEIVED", { ...workspacePayload, customerFirstName: "Amélia" }),
      "en-US",
    );
    expect(named).toMatch(/^Limpeza profunda · Amélia · /);

    // `MarkBookingPaidCommand` sends `customerFirstName: null` on purpose.
    const anonymous = detailFor(
      item("PROVIDER_BOOKING_CONFIRMED", { ...workspacePayload, customerFirstName: null }),
      "en-US",
    );
    expect(anonymous).toMatch(/^Limpeza profunda · /);
    expect(anonymous).not.toContain("null");
    expect(anonymous).not.toContain("· ·");
  });

  it("names whichever party the payload carries, since the same type reaches both sides", () => {
    // `SweepBookingCommand` tells administrators about an auto-close with the
    // provider's name — the one who stopped answering — and no customer key;
    // the provider's own copies of BOOKING_DISPUTED carry no `providerName`.
    // One type cannot be pinned to one key, so the line reads what is there.
    const admin = detailFor(
      item("ADMIN_BOOKING_AUTO_CLOSED", { bookingId: "bk-1", serviceName: "Limpeza", providerName: "Clean & Fresh" }),
      "en-US",
    );
    expect(admin).toBe("Limpeza · Clean & Fresh");

    const providerSide = detailFor(
      item("BOOKING_DISPUTED", { bookingId: "bk-1", serviceName: "Limpeza", threadId: "th-1" }),
      "en-US",
    );
    expect(providerSide).toBe("Limpeza");
  });

  it("leaves out a start time it cannot read rather than printing Invalid Date", () => {
    const line = detailFor(item("BOOKING_CONFIRMED", { ...BOOKING, startsAt: "soon" }), "en-US");
    expect(line).toBe("Limpeza profunda · Clean & Fresh Maputo");
  });

  it("has nothing to add for a type whose sentence already says everything", () => {
    expect(detailFor(item("NEW_MESSAGE", { threadId: "th-1" }), "en-US")).toBeNull();
    expect(detailFor(item("WELCOME", {}), "en-US")).toBeNull();
  });

  it("has nothing to add for a booking whose payload carries no facts", () => {
    expect(detailFor(item("BOOKING_CONFIRMED", {}), "en-US")).toBeNull();
  });
});
