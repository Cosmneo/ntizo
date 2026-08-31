import { describe, expect, it } from "bun:test";
import { BookingCreated, BookingPaid, BookingExpired } from "../domain/events";

describe("BookingCreated", () => {
  it("publishes as booking.created with the booking id as aggregate id", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      serviceId: "s1",
      providerMemberId: "m2",
      startsAt: new Date("2026-09-04T12:30:00.000Z"),
      endsAt: new Date("2026-09-04T13:30:00.000Z"),
      priceMinor: 120000,
      currency: "MZN",
      expiresAt: new Date("2026-09-01T10:15:00.000Z"),
    };

    const event = new BookingCreated(payload);

    expect(event.eventName).toBe("booking.created");
    expect(event.aggregateId).toBe("b1");
  });

  it("round-trips the payload", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      serviceId: "s1",
      providerMemberId: "m2",
      startsAt: new Date("2026-09-04T12:30:00.000Z"),
      endsAt: new Date("2026-09-04T13:30:00.000Z"),
      priceMinor: 120000,
      currency: "MZN",
      expiresAt: new Date("2026-09-01T10:15:00.000Z"),
    };

    const event = new BookingCreated(payload);

    expect(event.payload).toEqual(payload);
  });
});

describe("BookingPaid", () => {
  it("publishes as booking.paid with the booking id as aggregate id", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      providerMemberId: "m9",
      startsAt: new Date("2026-09-05T08:00:00.000Z"),
      endsAt: new Date("2026-09-05T09:00:00.000Z"),
      priceMinor: 120000,
      commissionMinor: 12000,
      currency: "MZN",
      paymentRef: "m-pesa-txn-12345",
    };

    const event = new BookingPaid(payload);

    expect(event.eventName).toBe("booking.paid");
    expect(event.aggregateId).toBe("b1");
  });

  it("round-trips the payload", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      providerMemberId: "m9",
      startsAt: new Date("2026-09-05T08:00:00.000Z"),
      endsAt: new Date("2026-09-05T09:00:00.000Z"),
      priceMinor: 120000,
      commissionMinor: 12000,
      currency: "MZN",
      paymentRef: "m-pesa-txn-12345",
    };

    const event = new BookingPaid(payload);

    expect(event.payload).toEqual(payload);
  });
});

describe("BookingExpired", () => {
  it("publishes as booking.expired with the booking id as aggregate id", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u9",
      providerMemberId: "m1",
      startsAt: new Date("2026-09-04T12:30:00.000Z"),
    };

    const event = new BookingExpired(payload);

    expect(event.eventName).toBe("booking.expired");
    expect(event.aggregateId).toBe("b1");
  });

  it("round-trips the payload", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u9",
      providerMemberId: "m1",
      startsAt: new Date("2026-09-04T12:30:00.000Z"),
    };

    const event = new BookingExpired(payload);

    expect(event.payload).toEqual(payload);
  });
});
