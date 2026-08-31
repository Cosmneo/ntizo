import { describe, expect, it } from "bun:test";
import { Booking, type BookingProps } from "../domain/aggregates/booking.aggregate";
import {
  BookingDateInvalidError,
  BookingDurationInvalidError,
  BookingFieldBlankError,
  BookingPriceInvalidError,
  BookingSnapshotInconsistentError,
  BookingTransitionError,
  CommissionOutOfRangeError,
  PaymentReferenceMismatchError,
} from "../domain/exceptions";
import type { BookingStatus } from "../../../shared/infrastructure/database/booking/enums";

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

/**
 * A stored row, already consistent, as `restore` expects to receive one.
 * Unlike `validInput` this is a full `BookingProps`, not `create`'s partial
 * input — `endsAt` and `commissionMinor` are supplied pre-derived, exactly
 * as a row read back from the database would arrive.
 */
function validProps(over: Partial<BookingProps> = {}): BookingProps {
  const startsAt = WHEN;
  const durationMinutes = 60;
  const priceMinor = 120000;
  const commissionBps = 1000;

  return {
    id: "b1",
    customerId: "u1",
    providerId: "p1",
    serviceId: "s1",
    serviceOptionId: "o1",
    providerMemberId: "m1",
    startsAt,
    endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
    durationMinutes,
    status: "PENDING_PAYMENT",
    expiresAt: new Date("2026-09-01T10:15:00.000Z"),
    paidAt: null,
    paymentRef: null,
    confirmedAt: null,
    declinedAt: null,
    cancelledAt: null,
    markedDoneAt: null,
    completedAt: null,
    disputedAt: null,
    expiredAt: null,
    priceMinor,
    commissionBps,
    commissionMinor: Math.round((priceMinor * commissionBps) / 10_000),
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

  it("keeps the payment deadline on the row, rather than erasing the fact a dispute might need", () => {
    // A stale query cannot act on this: `findDueForExpiry` filters on
    // `status = 'PENDING_PAYMENT'` before it ever looks at `expiresAt` (see
    // `booking.repository.ts`), so a paid booking is already excluded by
    // status alone. Nulling the deadline bought no protection — it only
    // destroyed the one fact a customer disputing "you gave my slot away"
    // needs: the deadline they were actually given.
    const before = Booking.create(validInput());
    const paid = before.markPaid("mpesa-123", new Date());
    expect(paid.expiresAt).toEqual(before.expiresAt);
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

  it("refuses a different reference against an already-paid booking, rather than silently keeping the first", () => {
    // Same reference twice is a retried webhook — absorbed above, silently.
    // A different reference is not a retry: it is a second, genuinely
    // distinct transaction against a booking that was already paid for
    // once, and somebody is owed a refund on one of the two. That is not
    // something this method gets to decide quietly.
    const first = Booking.create(validInput()).markPaid("mpesa-123", new Date());
    expect(() => first.markPaid("mpesa-456", new Date())).toThrow(PaymentReferenceMismatchError);
  });

  it("names both references in the error, so a duplicate payment can be traced", () => {
    const first = Booking.create(validInput()).markPaid("mpesa-123", new Date());
    expect(() => first.markPaid("mpesa-456", new Date())).toThrow(/mpesa-123/);
    expect(() => first.markPaid("mpesa-456", new Date())).toThrow(/mpesa-456/);
  });
});

describe("Booking.restore", () => {
  it("reconstitutes a booking from a stored row", () => {
    const restored = Booking.restore(validProps());
    expect(restored.id).toBe("b1");
    expect(restored.status).toBe("PENDING_PAYMENT");
  });

  it("re-runs create's guards — a blank stored field is still refused", () => {
    expect(() => Booking.restore(validProps({ serviceName: "   " }))).toThrow(
      BookingFieldBlankError,
    );
  });

  it("re-runs create's guards — an invalid stored date is still refused", () => {
    expect(() => Booking.restore(validProps({ startsAt: new Date("garbage") }))).toThrow(
      BookingDateInvalidError,
    );
  });

  it("re-runs create's guards — an invalid stored price is still refused", () => {
    expect(() => Booking.restore(validProps({ priceMinor: -1 }))).toThrow(BookingPriceInvalidError);
  });

  it("refuses a stored endsAt that disagrees with startsAt and durationMinutes", () => {
    // A row is a fact someone else wrote — an earlier version of this code,
    // a manual edit. Nothing upstream of restore re-derives endsAt, so
    // restore is the last place that can catch it disagreeing.
    expect(() =>
      Booking.restore(validProps({ endsAt: new Date("2026-09-04T14:00:00.000Z") })),
    ).toThrow(BookingSnapshotInconsistentError);
  });

  it("refuses a stored commissionMinor that disagrees with priceMinor and commissionBps", () => {
    expect(() => Booking.restore(validProps({ commissionMinor: 1 }))).toThrow(
      BookingSnapshotInconsistentError,
    );
  });

  it("does not recompute endsAt or commissionMinor when they already agree", () => {
    // Recomputing here would be silently rewriting a stored snapshot — the
    // one thing this aggregate exists to prevent. restore only ever
    // confirms the stored values agree with the facts they came from; it
    // never derives its own and substitutes them.
    const props = validProps();
    const restored = Booking.restore(props);
    expect(restored.endsAt).toEqual(props.endsAt);
    expect(restored.commissionMinor).toBe(props.commissionMinor);
  });
});

describe("Booking.markPaid — every status", () => {
  // Table-driven so a future addition to BookingStatus fails loudly here
  // instead of silently falling through markPaid's default case.
  //
  // Every status but PENDING_PAYMENT and EXPIRED is "no-op" here, not just
  // the three that still hold their slot: the discriminator is the payment
  // reference, not whether the booking still holds its slot (see
  // `markPaid`'s own doc comment for why that changed). A duplicate webhook
  // carrying the same reference that already paid this booking is absorbed
  // silently whatever the booking has done since — including COMPLETED and
  // DISPUTED, which the pre-Task-5 version of this method got backwards: it
  // threw for exactly those two, on exactly the retry that is *most* likely
  // to arrive late, because a webhook retries on a timer that has no idea
  // the booking finished. EXPIRED is the one status that is genuinely
  // never a duplicate of anything: nothing ever set a paymentRef on the way
  // there, so a matching reference is impossible by construction, and
  // every payment reaching an expired booking is a second, distinct one.
  const PAID_REF = "mpesa-existing";

  const cases: Array<[BookingStatus, "transitions" | "no-op" | "throws"]> = [
    ["PENDING_PAYMENT", "transitions"],
    ["AWAITING_PROVIDER", "no-op"],
    ["CONFIRMED", "no-op"],
    ["MARKED_DONE", "no-op"],
    ["COMPLETED", "no-op"],
    ["DISPUTED", "no-op"],
    ["DECLINED", "no-op"],
    ["CANCELLED", "no-op"],
    ["EXPIRED", "throws"],
  ];

  it.each(cases)("from %s it %s", (status, outcome) => {
    // Every status past PENDING_PAYMENT other than EXPIRED can only be
    // reached by having already been paid — EXPIRED is the one way to
    // leave PENDING_PAYMENT without paying.
    const alreadyPaid = status !== "PENDING_PAYMENT" && status !== "EXPIRED";
    const booking = Booking.restore(
      validProps({
        status,
        paymentRef: alreadyPaid ? PAID_REF : null,
        expiresAt: status === "PENDING_PAYMENT" ? new Date("2026-09-01T10:15:00.000Z") : null,
      }),
    );

    if (outcome === "transitions") {
      const result = booking.markPaid(PAID_REF, new Date());
      expect(result.status).toBe("AWAITING_PROVIDER");
      expect(result.paymentRef).toBe(PAID_REF);
    } else if (outcome === "no-op") {
      const result = booking.markPaid(PAID_REF, new Date());
      expect(result.status).toBe(status);
      // Not merely equal — the same instance, so idempotency isn't just
      // lucky equality of a reconstructed copy.
      expect(result).toBe(booking);
    } else {
      expect(() => booking.markPaid(PAID_REF, new Date())).toThrow(BookingTransitionError);
    }
  });
});

describe("Booking.markPaid — a different reference throws at every status but PENDING_PAYMENT", () => {
  // The companion table to the one above: a *matching* reference is always
  // absorbed past PENDING_PAYMENT, but a *different* one is never a
  // duplicate to shrug off — whatever the status, it names a second,
  // genuinely distinct transaction. Which exception it throws still depends
  // on whether the slot is still held (see `markPaid`'s own doc comment):
  // `PaymentReferenceMismatchError` where a refund is probably owed on one
  // of two payments against a slot still in play, `BookingTransitionError`
  // where the transition was never legal to begin with.
  const EXISTING_REF = "mpesa-existing";
  const OTHER_REF = "mpesa-other";

  const cases: Array<[BookingStatus, "PaymentReferenceMismatchError" | "BookingTransitionError"]> = [
    ["AWAITING_PROVIDER", "PaymentReferenceMismatchError"],
    ["CONFIRMED", "PaymentReferenceMismatchError"],
    ["MARKED_DONE", "PaymentReferenceMismatchError"],
    ["COMPLETED", "BookingTransitionError"],
    ["DISPUTED", "BookingTransitionError"],
    ["DECLINED", "BookingTransitionError"],
    ["CANCELLED", "BookingTransitionError"],
    ["EXPIRED", "BookingTransitionError"],
  ];

  it.each(cases)("from %s it throws %s", (status, errorName) => {
    const alreadyPaid = status !== "EXPIRED";
    const booking = Booking.restore(
      validProps({
        status,
        paymentRef: alreadyPaid ? EXISTING_REF : null,
        expiresAt: null,
      }),
    );

    const ErrorClass =
      errorName === "PaymentReferenceMismatchError" ? PaymentReferenceMismatchError : BookingTransitionError;
    expect(() => booking.markPaid(OTHER_REF, new Date())).toThrow(ErrorClass);
  });
});

describe("Booking.expire", () => {
  it("moves a pending booking to expired and keeps the deadline it was given", () => {
    const before = Booking.create(validInput());
    const expired = before.expire(new Date());
    expect(expired.status).toBe("EXPIRED");
    expect(expired.expiresAt).toEqual(before.expiresAt);
  });

  it("is a no-op on a booking that has already moved on", () => {
    // The delayed job fires whether or not the payment landed first. If the
    // status has moved, expiry has nothing to say — and throwing here would
    // turn an ordinary race into an error somebody has to read.
    const paid = Booking.create(validInput()).markPaid("mpesa-123", new Date());
    expect(paid.expire(new Date()).status).toBe("AWAITING_PROVIDER");
  });
});

describe("Booking.expire — every status", () => {
  // Table-driven for the same reason as markPaid's: a future status added
  // to BookingStatus should fail this test, not fall through silently.
  const PAID_REF = "mpesa-existing";

  const cases: Array<[BookingStatus, "transitions" | "no-op"]> = [
    ["PENDING_PAYMENT", "transitions"],
    ["AWAITING_PROVIDER", "no-op"],
    ["CONFIRMED", "no-op"],
    ["MARKED_DONE", "no-op"],
    ["COMPLETED", "no-op"],
    ["DISPUTED", "no-op"],
    ["DECLINED", "no-op"],
    ["CANCELLED", "no-op"],
    ["EXPIRED", "no-op"],
  ];

  it.each(cases)("from %s it %s", (status, outcome) => {
    const alreadyPaid = status !== "PENDING_PAYMENT" && status !== "EXPIRED";
    const booking = Booking.restore(
      validProps({
        status,
        paymentRef: alreadyPaid ? PAID_REF : null,
        expiresAt: status === "PENDING_PAYMENT" ? new Date("2026-09-01T10:15:00.000Z") : null,
      }),
    );

    const result = booking.expire(new Date());

    if (outcome === "transitions") {
      expect(result.status).toBe("EXPIRED");
      // Kept, not nulled — see `Booking.expire`'s own doc comment and
      // `expiresAt`'s on `BookingProps` for why (Task 5 of the
      // booking-seams repair plan).
      expect(result.expiresAt).toEqual(booking.expiresAt);
    } else {
      expect(result.status).toBe(status);
      expect(result).toBe(booking);
    }
  });
});
