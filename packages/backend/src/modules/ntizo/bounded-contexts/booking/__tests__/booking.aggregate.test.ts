import { describe, expect, it } from "bun:test";
import { Booking } from "../domain/aggregates/booking.aggregate";
import {
  BookingDurationInvalidError,
  BookingPriceInvalidError,
  CommissionOutOfRangeError,
} from "../domain/exceptions";

const WHEN = new Date("2026-09-04T12:30:00.000Z");

function validInput(over: Partial<Parameters<typeof Booking.create>[0]> = {}) {
  return {
    customerId: "u1",
    providerId: "p1",
    serviceId: "s1",
    serviceOptionId: "o1",
    providerMemberId: "m1",
    startsAt: WHEN,
    durationMinutes: 60,
    priceMinor: 120000,
    commissionBps: 1000,
    currency: "MZN",
    serviceName: "Avaria eléctrica urgente",
    providerName: "Hélder Cossa",
    providerSlug: "helder-cossa-electricidade",
    optionName: "Diagnóstico e reparação",
    addressLabel: "Casa",
    addressLine: "Av. Julius Nyerere 812",
    addressCity: "Maputo",
    addressDistrict: "Sommerschield",
    addressDirections: null,
    addressLat: null,
    addressLng: null,
    description: null,
    expiresAt: new Date("2026-09-01T10:15:00.000Z"),
    ...over,
  };
}

describe("Booking.create", () => {
  it("starts life waiting to be paid", () => {
    expect(Booking.create(validInput()).status).toBe("PENDING_PAYMENT");
  });

  it("derives the end from the start and the duration", () => {
    const booking = Booking.create(validInput({ durationMinutes: 240 }));
    expect(booking.endsAt.toISOString()).toBe("2026-09-04T16:30:00.000Z");
  });

  it("computes the commission from the rate it was given", () => {
    // 1200.00 MZN at 10% is 120.00. The rate is snapshotted alongside, so the
    // arithmetic stays checkable after somebody changes the provider's rate.
    const booking = Booking.create(validInput());
    expect(booking.commissionMinor).toBe(12000);
    expect(booking.commissionBps).toBe(1000);
  });

  it("rounds the ordinary case, where rounding and truncation happen to agree", () => {
    // 333 minor at 10% is 33.3, which rounds down to 33 — the same answer
    // truncation gives for this particular input. This pins the everyday
    // shape of the arithmetic; it is the next test, not this one, that would
    // notice a regression to Math.trunc.
    const booking = Booking.create(validInput({ priceMinor: 333 }));
    expect(booking.commissionMinor).toBe(33);
  });

  it("rounds up past the half, where truncation would quietly shortchange the provider", () => {
    // 337 minor at 10% is 33.7 — chosen because it is the smallest kind of
    // value where rounding and truncation disagree: rounding gives 34,
    // truncation gives 33. Switch the implementation to Math.trunc and this
    // is the assertion that fails; the 333 case above would not notice.
    // Truncation would favour the platform by one minor unit on this booking,
    // and by the same kind of amount on every booking after it — a
    // difference too small for any one customer to notice from the outside.
    const booking = Booking.create(validInput({ priceMinor: 337 }));
    expect(booking.commissionMinor).toBe(34);
  });

  it("refuses a price below zero", () => {
    expect(() => Booking.create(validInput({ priceMinor: -1 }))).toThrow(BookingPriceInvalidError);
  });

  it("refuses a commission outside basis points", () => {
    expect(() => Booking.create(validInput({ commissionBps: 10_001 }))).toThrow(
      CommissionOutOfRangeError,
    );
  });

  it("refuses a duration that is not a positive whole number of minutes", () => {
    expect(() => Booking.create(validInput({ durationMinutes: 0 }))).toThrow(
      BookingDurationInvalidError,
    );
    expect(() => Booking.create(validInput({ durationMinutes: 1.5 }))).toThrow(
      BookingDurationInvalidError,
    );
  });

  it("trims a blank description to null rather than storing whitespace", () => {
    expect(Booking.create(validInput({ description: "   " })).description).toBeNull();
  });

  it("keeps the payout as the price less the commission", () => {
    const booking = Booking.create(validInput());
    expect(booking.providerPayoutMinor).toBe(booking.priceMinor - booking.commissionMinor);
  });
});
