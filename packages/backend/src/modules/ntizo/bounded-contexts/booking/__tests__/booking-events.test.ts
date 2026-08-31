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
    // `satisfies ConstructorParameters<typeof BookingPaid>[0]` pins this
    // object literal to the constructor's payload type without widening it
    // to the constructor parameter type the way a type annotation would —
    // `payload` stays a plain object so it can still be handed to `toEqual`
    // below. Without it, a field this test adds that the class never
    // declared just rides along silently: a bare `const` reused for both
    // construction and assertion is exactly the shape that defeats
    // TypeScript's excess-property check (which only fires on a fresh
    // object literal passed directly as an argument, not on a named
    // variable), so a typo'd or forgotten field here would pass every gate
    // up to `tsc` and then pass that too. Two of these three events cross a
    // bounded-context boundary — a field silently dropped from `BookingPaid`
    // or `BookingExpired` is a bug nobody notices until a customer is never
    // told their booking expired.
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
    } satisfies ConstructorParameters<typeof BookingPaid>[0];

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
    } satisfies ConstructorParameters<typeof BookingPaid>[0];

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
    } satisfies ConstructorParameters<typeof BookingExpired>[0];

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
    } satisfies ConstructorParameters<typeof BookingExpired>[0];

    const event = new BookingExpired(payload);

    expect(event.payload).toEqual(payload);
  });
});
