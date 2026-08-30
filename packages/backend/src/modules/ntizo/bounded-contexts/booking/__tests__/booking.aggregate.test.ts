import { describe, expect, it } from "bun:test";
import { Booking } from "../domain/aggregates/booking.aggregate";
import {
  BookingDateInvalidError,
  BookingDurationInvalidError,
  BookingFieldBlankError,
  BookingPriceInvalidError,
  BookingTransitionError,
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

describe("Booking.create — blank-string guards", () => {
  // Every non-nullable string in BookingProps. A NOT NULL Postgres column
  // accepts "" as readily as a real value, and the CHECK constraints Task 2
  // added cover the money and the status — nothing catches a blank one of
  // these downstream, so `create` has to.
  const REQUIRED_STRING_FIELDS = [
    "customerId",
    "providerId",
    "serviceId",
    "serviceOptionId",
    "providerMemberId",
    "currency",
    "serviceName",
    "providerName",
    "providerSlug",
    "optionName",
    "addressLabel",
    "addressLine",
    "addressCity",
  ] as const;

  it("refuses a blank value — empty or whitespace-only — for every required string", () => {
    for (const field of REQUIRED_STRING_FIELDS) {
      expect(() => Booking.create(validInput({ [field]: "" }))).toThrow(BookingFieldBlankError);
      expect(() => Booking.create(validInput({ [field]: "   " }))).toThrow(BookingFieldBlankError);
    }
  });

  it("stores a required string exactly as given, not a trimmed copy of it", () => {
    // The blank check trims to decide; it must not trim to store. Rewriting a
    // snapshot value is a different job than refusing a bad one.
    const booking = Booking.create(validInput({ serviceName: "  Avaria eléctrica  " }));
    expect(booking.serviceName).toBe("  Avaria eléctrica  ");
  });

  it("refuses a blank address component when one is present, but keeps accepting its absence", () => {
    // null still means "there is none" — only a present-but-empty string is
    // the caller's bug.
    expect(() => Booking.create(validInput({ addressDistrict: "   " }))).toThrow(
      BookingFieldBlankError,
    );
    expect(() => Booking.create(validInput({ addressDirections: "   " }))).toThrow(
      BookingFieldBlankError,
    );
    expect(Booking.create(validInput({ addressDistrict: null })).addressDistrict).toBeNull();
  });
});

describe("Booking.create — dates", () => {
  it("refuses a start that does not name a real instant", () => {
    // new Date("garbage") type-checks as a Date; only its timestamp gives it
    // away as unusable.
    expect(() => Booking.create(validInput({ startsAt: new Date("garbage") }))).toThrow(
      BookingDateInvalidError,
    );
  });

  it("refuses an expiry that does not name a real instant", () => {
    expect(() => Booking.create(validInput({ expiresAt: new Date("garbage") }))).toThrow(
      BookingDateInvalidError,
    );
  });
});

describe("Booking.create — commission boundaries", () => {
  it("accepts a commission rate of zero, the platform's smallest allowed cut", () => {
    const booking = Booking.create(validInput({ commissionBps: 0 }));
    expect(booking.commissionMinor).toBe(0);
  });

  it("accepts a commission rate of ten thousand basis points, the whole price", () => {
    const booking = Booking.create(validInput({ commissionBps: 10_000 }));
    expect(booking.commissionMinor).toBe(booking.priceMinor);
  });

  it("refuses a commission rate below zero", () => {
    expect(() => Booking.create(validInput({ commissionBps: -1 }))).toThrow(
      CommissionOutOfRangeError,
    );
  });
});

describe("Booking.markPaid", () => {
  it("moves a pending booking to awaiting the provider", () => {
    const paid = Booking.create(validInput()).markPaid("mpesa-123", new Date());
    expect(paid.status).toBe("AWAITING_PROVIDER");
    expect(paid.paymentRef).toBe("mpesa-123");
  });

  it("clears the payment deadline, rather than leaving a date that no longer applies", () => {
    const paid = Booking.create(validInput()).markPaid("mpesa-123", new Date());
    expect(paid.expiresAt).toBeNull();
  });

  it("is idempotent: paying an already-paid booking changes nothing", () => {
    // A webhook that arrives twice must not book twice. The command layer
    // guards this too, but the aggregate is the last place it can be got
    // wrong quietly.
    const first = Booking.create(validInput()).markPaid("mpesa-123", new Date());
    const second = first.markPaid("mpesa-123", new Date());
    expect(second.status).toBe("AWAITING_PROVIDER");
    expect(second.paymentRef).toBe("mpesa-123");
    expect(second.paidAt).toEqual(first.paidAt);
  });

  it("refuses to pay a booking that already expired", () => {
    const expired = Booking.create(validInput()).expire(new Date());
    expect(() => expired.markPaid("mpesa-123", new Date())).toThrow(BookingTransitionError);
  });
});

describe("Booking.expire", () => {
  it("moves a pending booking to expired and clears the deadline", () => {
    const expired = Booking.create(validInput()).expire(new Date());
    expect(expired.status).toBe("EXPIRED");
    expect(expired.expiresAt).toBeNull();
  });

  it("is a no-op on a booking that has already moved on", () => {
    // The delayed job fires whether or not the payment landed first. If the
    // status has moved, expiry has nothing to say — and throwing here would
    // turn an ordinary race into an error somebody has to read.
    const paid = Booking.create(validInput()).markPaid("mpesa-123", new Date());
    expect(paid.expire(new Date()).status).toBe("AWAITING_PROVIDER");
  });
});
