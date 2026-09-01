import { describe, expect, it } from "bun:test";
import {
  BookingCreated,
  BookingPaid,
  BookingExpired,
  BookingAccepted,
  BookingDeclined,
  BookingCancelled,
  type BookingCancelledReason,
} from "../domain/events";

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

describe("BookingAccepted", () => {
  it("publishes as booking.accepted with the booking id as aggregate id", () => {
    // `satisfies ConstructorParameters<typeof BookingAccepted>[0]` is load-bearing
    // here, not decoration: a bare `const` reused for construction and for the
    // `toEqual` assertion below is exactly the shape TypeScript's excess-property
    // check does not cover (that check only fires on a fresh object literal
    // passed directly as an argument), so a field this test typo'd or added
    // that the class never declared would ride along silently through both
    // `tsc` and this assertion. This event is the one Payment reads to decide
    // how much to charge whom — a field silently dropped here is a bug that
    // surfaces as a wrong charge, not a compiler error.
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      priceMinor: 120000,
      currency: "MZN",
    } satisfies ConstructorParameters<typeof BookingAccepted>[0];

    const event = new BookingAccepted(payload);

    expect(event.eventName).toBe("booking.accepted");
    expect(event.aggregateId).toBe("b1");
  });

  it("round-trips the payload", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      priceMinor: 120000,
      currency: "MZN",
    } satisfies ConstructorParameters<typeof BookingAccepted>[0];

    const event = new BookingAccepted(payload);

    expect(event.payload).toEqual(payload);
  });
});

describe("BookingDeclined", () => {
  it("publishes as booking.declined with the booking id as aggregate id", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u9",
      providerMemberId: "m1",
      startsAt: new Date("2026-09-04T12:30:00.000Z"),
      reason: "Não tenho disponibilidade nesse horário",
    } satisfies ConstructorParameters<typeof BookingDeclined>[0];

    const event = new BookingDeclined(payload);

    expect(event.eventName).toBe("booking.declined");
    expect(event.aggregateId).toBe("b1");
  });

  it("round-trips the payload", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u9",
      providerMemberId: "m1",
      startsAt: new Date("2026-09-04T12:30:00.000Z"),
      reason: "Não tenho disponibilidade nesse horário",
    } satisfies ConstructorParameters<typeof BookingDeclined>[0];

    const event = new BookingDeclined(payload);

    expect(event.payload).toEqual(payload);
  });

  it("round-trips a null reason — the provider is not required to give one", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u9",
      providerMemberId: "m1",
      startsAt: new Date("2026-09-04T12:30:00.000Z"),
      reason: null,
    } satisfies ConstructorParameters<typeof BookingDeclined>[0];

    const event = new BookingDeclined(payload);

    expect(event.payload.reason).toBeNull();
  });
});

describe("BookingCancelled", () => {
  it("publishes as booking.cancelled with the booking id as aggregate id", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      providerMemberId: "m9",
      startsAt: new Date("2026-09-05T08:00:00.000Z"),
      reason: "payment_not_received",
    } satisfies ConstructorParameters<typeof BookingCancelled>[0];

    const event = new BookingCancelled(payload);

    expect(event.eventName).toBe("booking.cancelled");
    expect(event.aggregateId).toBe("b1");
  });

  it("round-trips the payload", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      providerMemberId: "m9",
      startsAt: new Date("2026-09-05T08:00:00.000Z"),
      reason: "payment_not_received",
    } satisfies ConstructorParameters<typeof BookingCancelled>[0];

    const event = new BookingCancelled(payload);

    expect(event.payload).toEqual(payload);
  });

  // Table-driven over the closed union rather than one hard-coded literal:
  // `BookingCancelledReason` is a compile-time guarantee, but a test that
  // only ever constructs the event with "payment_not_received" would not
  // notice a typo in either of the other two members — they would still
  // satisfy `string`, just not the value anything ever checks.
  const reasons: BookingCancelledReason[] = [
    "payment_not_received",
    "customer_cancelled",
    "provider_cancelled",
  ];

  it.each(reasons)("accepts %s as a valid reason", (reason) => {
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      providerMemberId: "m9",
      startsAt: new Date("2026-09-05T08:00:00.000Z"),
      reason,
    } satisfies ConstructorParameters<typeof BookingCancelled>[0];

    const event = new BookingCancelled(payload);

    expect(event.payload.reason).toBe(reason);
  });
});
