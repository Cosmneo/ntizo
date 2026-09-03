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
import {
  type BookingStatus,
  DEADLINE_BEARING_STATUSES,
  SLOT_HOLDING_STATUSES,
} from "../../../shared/infrastructure/database/booking/enums";

const WHEN = new Date("2026-09-04T12:30:00.000Z");

/**
 * `submit`'s new required address, for tests that only care about the
 * status/deadline transition and not about address content — matches
 * `validProps()`'s own default address so a submitted booking's address
 * fields don't visibly change under tests that never asked to check them.
 */
const SUBMIT_ADDRESS = { label: "Casa", line: "Av. Julius Nyerere 812", city: "Maputo" };

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
  it("starts life as a draft, not yet sent to the provider", () => {
    // The reversal this whole plan is named for: `create` used to produce
    // PENDING_PAYMENT directly. It now produces DRAFT, and only `submit`
    // moves the booking on to AWAITING_PROVIDER.
    expect(Booking.create(validInput()).status).toBe("DRAFT");
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
  // Every non-nullable string in BookingProps, plus the three address fields
  // that are nullable but never blank-when-present (see "a draft may have no
  // address" below for their null case). A NOT NULL Postgres column accepts
  // "" as readily as a real value, and the CHECK constraints Task 2 added
  // cover the money and the status — nothing catches a blank one of these
  // downstream, so `create` has to.
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

describe("Booking.create — a draft may have no address", () => {
  // The customer picks a slot on step 1 and gives an address on step 2, so
  // the hold has to exist before the address does. Null is "not supplied
  // yet"; blank is a bug, and the two must not be collapsed.
  it("accepts a draft with no address at all", () => {
    const booking = Booking.create(
      validInput({ addressLabel: null, addressLine: null, addressCity: null }),
    );
    expect(booking.status).toBe("DRAFT");
    expect(booking.addressLabel).toBeNull();
    expect(booking.addressLine).toBeNull();
    expect(booking.addressCity).toBeNull();
  });

  it.each(["addressLabel", "addressLine", "addressCity"] as const)(
    "still refuses a present-but-blank %s",
    (field) => {
      expect(() => Booking.create(validInput({ [field]: "" }))).toThrow(BookingFieldBlankError);
      expect(() => Booking.create(validInput({ [field]: "   " }))).toThrow(BookingFieldBlankError);
    },
  );
});

describe("Booking.submit — the address becomes required here", () => {
  const RESPOND_BY = new Date("2026-09-04T11:00:00.000Z");
  const AT = new Date("2026-09-04T09:00:00.000Z");
  const ADDRESS = {
    label: "Casa",
    line: "Av. Julius Nyerere 812",
    city: "Maputo",
    district: "Sommerschield",
    directions: null,
    lat: null,
    lng: null,
  };

  function draftWithoutAddress() {
    return Booking.restore(
      validProps({
        status: "DRAFT",
        addressLabel: null,
        addressLine: null,
        addressCity: null,
      }),
    );
  }

  it("writes the address onto the booking it returns", () => {
    const submitted = draftWithoutAddress().submit(AT, RESPOND_BY, ADDRESS, null);
    expect(submitted.status).toBe("AWAITING_PROVIDER");
    expect(submitted.addressLabel).toBe("Casa");
    expect(submitted.addressLine).toBe("Av. Julius Nyerere 812");
    expect(submitted.addressCity).toBe("Maputo");
    expect(submitted.addressDistrict).toBe("Sommerschield");
  });

  it.each(["label", "line", "city"] as const)("refuses a blank %s", (field) => {
    expect(() => draftWithoutAddress().submit(AT, RESPOND_BY, { ...ADDRESS, [field]: "  " }, null)).toThrow(
      BookingFieldBlankError,
    );
  });

  it("still replaces expiresAt with respondBy", () => {
    // Guarding the behaviour the address change sits next to: the provider's
    // window has to start here, not keep the checkout hold.
    const submitted = draftWithoutAddress().submit(AT, RESPOND_BY, ADDRESS, null);
    expect(submitted.expiresAt).toEqual(RESPOND_BY);
  });

  // The description arrives on the same hop as the address, off the same
  // page — step 2's optional "what needs doing". `create` normalises a blank
  // one to null rather than refusing it, and these pin that `submit` does
  // the same rather than storing whitespace a provider then reads as a note.
  //
  // Both halves matter, and `""` is reachable: `submitBooking`'s input types
  // the field `.trim().max(1000).nullable().optional()` with no `.min(1)`,
  // so an empty string is a payload the wire accepts. Without these,
  // replacing the trim-and-nullify with a bare `description ?? null` turns
  // nothing red.
  it("writes the description onto the booking it returns, trimmed", () => {
    const submitted = draftWithoutAddress().submit(AT, RESPOND_BY, ADDRESS, "  Sem energia  ");
    expect(submitted.description).toBe("Sem energia");
  });

  it.each(["", "   "])("normalises a blank description (%p) to null", (blank) => {
    expect(draftWithoutAddress().submit(AT, RESPOND_BY, ADDRESS, blank).description).toBeNull();
  });

  it("accepts a null description — the customer need not explain the job", () => {
    expect(draftWithoutAddress().submit(AT, RESPOND_BY, ADDRESS, null).description).toBeNull();
  });

  it("writes the description even when the draft already carried one", () => {
    // The unconditional assignment, stated as behaviour rather than left to
    // the doc comment. `create` passes null today, so no draft reaches here
    // with a description — but this method is what decides what happens the
    // day one does, and "the caller's value wins" is the answer its required
    // parameter exists to make explicit.
    const draft = Booking.restore(
      validProps({
        status: "DRAFT",
        addressLabel: null,
        addressLine: null,
        addressCity: null,
        description: "Escrito antes",
      }),
    );
    expect(draft.submit(AT, RESPOND_BY, ADDRESS, "Escrito no passo 2").description).toBe(
      "Escrito no passo 2",
    );
    expect(draft.submit(AT, RESPOND_BY, ADDRESS, null).description).toBeNull();
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
  // `Booking.restore(validProps())`, not `Booking.create(validInput())`:
  // `create` now produces DRAFT (see "Booking.create — starts life as a
  // draft" above), and `markPaid` only ever transitions from
  // PENDING_PAYMENT. These tests are about `markPaid` itself, not about how
  // a booking gets to PENDING_PAYMENT, so they start from a restored row
  // already at that status — the same fixture shape `Booking.accept` and
  // `Booking.decline`'s own tests use below.
  it("moves a pending booking to confirmed — the money that accept's promise depended on has now arrived", () => {
    const paid = Booking.restore(validProps()).markPaid("mpesa-123", new Date());
    expect(paid.status).toBe("CONFIRMED");
    expect(paid.paymentRef).toBe("mpesa-123");
  });

  it("keeps the payment deadline on the row, rather than erasing the fact a dispute might need", () => {
    // A stale query cannot act on this: `findDueForSweep` filters on
    // `status = 'PENDING_PAYMENT'` before it ever looks at `expiresAt` (see
    // `booking.repository.ts`), so a paid booking is already excluded by
    // status alone. Nulling the deadline bought no protection — it only
    // destroyed the one fact a customer disputing "you gave my slot away"
    // needs: the deadline they were actually given.
    const before = Booking.restore(validProps());
    const paid = before.markPaid("mpesa-123", new Date());
    expect(paid.expiresAt).toEqual(before.expiresAt);
  });

  it("is idempotent: paying an already-paid booking changes nothing", () => {
    // A webhook that arrives twice must not book twice. The command layer
    // guards this too, but the aggregate is the last place it can be got
    // wrong quietly.
    const first = Booking.restore(validProps()).markPaid("mpesa-123", new Date());
    const second = first.markPaid("mpesa-123", new Date());
    expect(second.status).toBe("CONFIRMED");
    expect(second.paymentRef).toBe("mpesa-123");
    expect(second.paidAt).toEqual(first.paidAt);
  });

  it("refuses to pay a booking that already expired", () => {
    // Expired from AWAITING_PROVIDER, not from PENDING_PAYMENT: since the
    // three clocks landed, `expire` no longer moves PENDING_PAYMENT at all
    // — that status is `cancel`'s (see `describe("Booking.cancel")`).
    const expired = Booking.restore(validProps({ status: "AWAITING_PROVIDER" })).expire(new Date());
    expect(expired.status).toBe("EXPIRED");
    expect(() => expired.markPaid("mpesa-123", new Date())).toThrow(BookingTransitionError);
  });

  it("refuses a different reference against an already-paid booking, rather than silently keeping the first", () => {
    // Same reference twice is a retried webhook — absorbed above, silently.
    // A different reference is not a retry: it is a second, genuinely
    // distinct transaction against a booking that was already paid for
    // once, and somebody is owed a refund on one of the two. That is not
    // something this method gets to decide quietly.
    const first = Booking.restore(validProps()).markPaid("mpesa-123", new Date());
    expect(() => first.markPaid("mpesa-456", new Date())).toThrow(PaymentReferenceMismatchError);
  });

  it("names both references in the error, so a duplicate payment can be traced", () => {
    const first = Booking.restore(validProps()).markPaid("mpesa-123", new Date());
    expect(() => first.markPaid("mpesa-456", new Date())).toThrow(/mpesa-123/);
    expect(() => first.markPaid("mpesa-456", new Date())).toThrow(/mpesa-456/);
  });
});

describe("Booking.submit", () => {
  const RESPOND_BY = new Date("2026-09-04T14:30:00.000Z");

  it("moves a draft booking to awaiting the provider", () => {
    const draft = Booking.restore(validProps({ status: "DRAFT", expiresAt: null }));
    const submitted = draft.submit(new Date(), RESPOND_BY, SUBMIT_ADDRESS, null);
    expect(submitted.status).toBe("AWAITING_PROVIDER");
  });

  it("replaces expiresAt with respondBy — the checkout hold is over, the provider's window starts here", () => {
    // The whole reason submit takes respondBy as an input: without this
    // assertion, expiresAt could silently keep create's 30-minute checkout
    // hold instead of the provider's 2-hour response window, and nothing
    // else here would catch it. Asserting the value, not merely that the
    // field is non-null, is the point — a non-null check alone would still
    // pass against the stale hold.
    const draft = Booking.restore(
      validProps({ status: "DRAFT", expiresAt: new Date("2026-09-04T13:00:00.000Z") }),
    );
    const submitted = draft.submit(new Date(), RESPOND_BY, SUBMIT_ADDRESS, null);
    expect(submitted.expiresAt).toEqual(RESPOND_BY);
  });

  it("refuses to submit a booking that already left DRAFT", () => {
    const pending = Booking.restore(validProps({ status: "PENDING_PAYMENT" }));
    expect(() => pending.submit(new Date(), RESPOND_BY, SUBMIT_ADDRESS, null)).toThrow(BookingTransitionError);
  });

  it("refuses an at that does not name a real instant", () => {
    const draft = Booking.restore(validProps({ status: "DRAFT", expiresAt: null }));
    expect(() => draft.submit(new Date("garbage"), RESPOND_BY, SUBMIT_ADDRESS, null)).toThrow(BookingDateInvalidError);
  });

  it("refuses a respondBy that does not name a real instant", () => {
    const draft = Booking.restore(validProps({ status: "DRAFT", expiresAt: null }));
    expect(() => draft.submit(new Date(), new Date("garbage"), SUBMIT_ADDRESS, null)).toThrow(BookingDateInvalidError);
  });
});

describe("Booking.submit — every status", () => {
  // Table-driven for the same reason as markPaid's and expire's: a future
  // status added to BookingStatus should fail this test, not fall through
  // silently. Unlike markPaid and expire, submit has no idempotency story —
  // it is a customer's single deliberate click, guarded against a race by
  // the command's compare-and-swap, not by this method being forgiving — so
  // every one of the nine statuses besides DRAFT itself throws.
  const RESPOND_BY = new Date("2026-09-04T14:30:00.000Z");

  const cases: Array<[BookingStatus, "transitions" | "throws"]> = [
    ["DRAFT", "transitions"],
    ["PENDING_PAYMENT", "throws"],
    ["AWAITING_PROVIDER", "throws"],
    ["CONFIRMED", "throws"],
    ["MARKED_DONE", "throws"],
    ["COMPLETED", "throws"],
    ["DISPUTED", "throws"],
    ["DECLINED", "throws"],
    ["CANCELLED", "throws"],
    ["EXPIRED", "throws"],
  ];

  it.each(cases)("from %s it %s", (status, outcome) => {
    const booking = Booking.restore(validProps({ status, expiresAt: null }));

    if (outcome === "transitions") {
      const result = booking.submit(new Date(), RESPOND_BY, SUBMIT_ADDRESS, null);
      expect(result.status).toBe("AWAITING_PROVIDER");
      expect(result.expiresAt).toEqual(RESPOND_BY);
    } else {
      expect(() => booking.submit(new Date(), RESPOND_BY, SUBMIT_ADDRESS, null)).toThrow(BookingTransitionError);
    }
  });
});

describe("Booking.accept", () => {
  const PAY_BY = new Date("2026-09-04T15:00:00.000Z");

  it("moves an awaiting-provider booking to pending payment — the provider said yes and no money has moved", () => {
    const awaiting = Booking.restore(validProps({ status: "AWAITING_PROVIDER" }));
    const accepted = awaiting.accept(new Date(), PAY_BY);
    expect(accepted.status).toBe("PENDING_PAYMENT");
    // This is the reversal, proven, not just asserted: accepting must not
    // touch paidAt or paymentRef. If it ever does, the booking would be
    // holding a slot on the strength of money that never arrived.
    expect(accepted.paidAt).toBeNull();
    expect(accepted.paymentRef).toBeNull();
  });

  it("stamps confirmedAt with the instant the provider answered", () => {
    const when = new Date("2026-09-04T13:00:00.000Z");
    const awaiting = Booking.restore(validProps({ status: "AWAITING_PROVIDER" }));
    const accepted = awaiting.accept(when, PAY_BY);
    expect(accepted.confirmedAt).toEqual(when);
  });

  it("replaces expiresAt with payBy — the provider's window is over, the payment window starts here", () => {
    // The whole reason accept takes payBy as an input: without this
    // assertion, expiresAt could silently keep the provider's now-stale
    // response deadline and nothing else here would catch it.
    const awaiting = Booking.restore(
      validProps({ status: "AWAITING_PROVIDER", expiresAt: new Date("2026-09-04T14:00:00.000Z") }),
    );
    const accepted = awaiting.accept(new Date(), PAY_BY);
    expect(accepted.expiresAt).toEqual(PAY_BY);
  });

  it("refuses to accept a booking that was never submitted", () => {
    const draft = Booking.restore(validProps({ status: "DRAFT", expiresAt: null }));
    expect(() => draft.accept(new Date(), PAY_BY)).toThrow(BookingTransitionError);
  });

  it("refuses an at that does not name a real instant", () => {
    const awaiting = Booking.restore(validProps({ status: "AWAITING_PROVIDER" }));
    expect(() => awaiting.accept(new Date("garbage"), PAY_BY)).toThrow(BookingDateInvalidError);
  });

  it("refuses a payBy that does not name a real instant", () => {
    const awaiting = Booking.restore(validProps({ status: "AWAITING_PROVIDER" }));
    expect(() => awaiting.accept(new Date(), new Date("garbage"))).toThrow(BookingDateInvalidError);
  });
});

describe("Booking.accept — every status", () => {
  // Same shape as submit's table, same reasoning: no idempotency story here
  // either, so every status but the one origin throws.
  const PAY_BY = new Date("2026-09-04T15:00:00.000Z");

  const cases: Array<[BookingStatus, "transitions" | "throws"]> = [
    ["DRAFT", "throws"],
    ["PENDING_PAYMENT", "throws"],
    ["AWAITING_PROVIDER", "transitions"],
    ["CONFIRMED", "throws"],
    ["MARKED_DONE", "throws"],
    ["COMPLETED", "throws"],
    ["DISPUTED", "throws"],
    ["DECLINED", "throws"],
    ["CANCELLED", "throws"],
    ["EXPIRED", "throws"],
  ];

  it.each(cases)("from %s it %s", (status, outcome) => {
    const booking = Booking.restore(validProps({ status, expiresAt: null }));

    if (outcome === "transitions") {
      const result = booking.accept(new Date(), PAY_BY);
      expect(result.status).toBe("PENDING_PAYMENT");
      expect(result.expiresAt).toEqual(PAY_BY);
    } else {
      expect(() => booking.accept(new Date(), PAY_BY)).toThrow(BookingTransitionError);
    }
  });
});

describe("Booking.decline", () => {
  it("moves an awaiting-provider booking to declined", () => {
    const awaiting = Booking.restore(validProps({ status: "AWAITING_PROVIDER" }));
    const declined = awaiting.decline(new Date());
    expect(declined.status).toBe("DECLINED");
  });

  it("stamps declinedAt with the instant the provider answered", () => {
    const when = new Date("2026-09-04T13:00:00.000Z");
    const awaiting = Booking.restore(validProps({ status: "AWAITING_PROVIDER" }));
    const declined = awaiting.decline(when);
    expect(declined.declinedAt).toEqual(when);
  });

  it("accepts a decline with no reason given", () => {
    const awaiting = Booking.restore(validProps({ status: "AWAITING_PROVIDER" }));
    expect(() => awaiting.decline(new Date())).not.toThrow();
  });

  it("accepts a decline with a reason", () => {
    const awaiting = Booking.restore(validProps({ status: "AWAITING_PROVIDER" }));
    expect(() => awaiting.decline(new Date(), "Fora da minha zona de cobertura")).not.toThrow();
  });

  it("refuses a reason that is present but blank — the same bug requireNonBlank catches elsewhere", () => {
    const awaiting = Booking.restore(validProps({ status: "AWAITING_PROVIDER" }));
    expect(() => awaiting.decline(new Date(), "   ")).toThrow(BookingFieldBlankError);
  });

  it("refuses to decline a booking that was never submitted", () => {
    const draft = Booking.restore(validProps({ status: "DRAFT", expiresAt: null }));
    expect(() => draft.decline(new Date())).toThrow(BookingTransitionError);
  });

  it("refuses an at that does not name a real instant", () => {
    const awaiting = Booking.restore(validProps({ status: "AWAITING_PROVIDER" }));
    expect(() => awaiting.decline(new Date("garbage"))).toThrow(BookingDateInvalidError);
  });
});

describe("Booking.decline — every status", () => {
  // Same shape again: decline shares accept's origin status and the same
  // absence of an idempotency story.
  const cases: Array<[BookingStatus, "transitions" | "throws"]> = [
    ["DRAFT", "throws"],
    ["PENDING_PAYMENT", "throws"],
    ["AWAITING_PROVIDER", "transitions"],
    ["CONFIRMED", "throws"],
    ["MARKED_DONE", "throws"],
    ["COMPLETED", "throws"],
    ["DISPUTED", "throws"],
    ["DECLINED", "throws"],
    ["CANCELLED", "throws"],
    ["EXPIRED", "throws"],
  ];

  it.each(cases)("from %s it %s", (status, outcome) => {
    const booking = Booking.restore(validProps({ status, expiresAt: null }));

    if (outcome === "transitions") {
      const result = booking.decline(new Date());
      expect(result.status).toBe("DECLINED");
    } else {
      expect(() => booking.decline(new Date())).toThrow(BookingTransitionError);
    }
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
  // instead of silently falling through markPaid's default case — ten rows
  // for ten statuses, DRAFT included.
  //
  // Every status but PENDING_PAYMENT and EXPIRED is "no-op" here, not just
  // the three that still hold their slot: the discriminator for a *matching*
  // reference is the reference itself, checked by identity before anything
  // asks about status at all (see `markPaid`'s own doc comment), so it
  // absorbs uniformly whether or not this particular status could
  // realistically carry a stored reference — DRAFT and AWAITING_PROVIDER
  // included, even though neither can actually reach here with one set by a
  // real charge (see `CHARGEABLE_STATUSES`'s own comment). A duplicate
  // webhook carrying the same reference that already paid this booking is
  // absorbed silently whatever the booking has done since — including
  // COMPLETED and DISPUTED, which the pre-Task-5 version of this method got
  // backwards: it threw for exactly those two, on exactly the retry that is
  // *most* likely to arrive late, because a webhook retries on a timer that
  // has no idea the booking finished. EXPIRED is the one status that is
  // genuinely never a duplicate of anything: nothing ever set a paymentRef
  // on the way there, so a matching reference is impossible by construction,
  // and every payment reaching an expired booking is a second, distinct one.
  const PAID_REF = "mpesa-existing";

  const cases: Array<[BookingStatus, "transitions" | "no-op" | "throws"]> = [
    ["DRAFT", "no-op"],
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
    // `alreadyPaid` only ever decides whether this fixture's stored
    // `paymentRef` matches the incoming one — a test device for exercising
    // the identity check uniformly, not a claim that every one of these
    // statuses is realistically reachable carrying a real charge (DRAFT and
    // AWAITING_PROVIDER are not; see `CHARGEABLE_STATUSES`'s own comment).
    // EXPIRED is the one status excluded on purpose: nothing ever sets a
    // paymentRef on the way there, so it is the one genuine "never paid"
    // case this table has to cover.
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
      expect(result.status).toBe("CONFIRMED");
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
  // genuinely distinct transaction. Which exception it throws depends on
  // whether this status is one a charge could actually have reached
  // (`CHARGEABLE_STATUSES`, not `SLOT_HOLDING_STATUSES` — see that
  // constant's own comment for why the two parted ways under the reversal):
  // `PaymentReferenceMismatchError` where a refund is probably owed on one
  // of two payments against a status a charge could have landed at,
  // `BookingTransitionError` where the transition was never legal to begin
  // with — DRAFT and AWAITING_PROVIDER included, because nothing charges
  // the customer until the provider accepts.
  const EXISTING_REF = "mpesa-existing";
  const OTHER_REF = "mpesa-other";

  const cases: Array<[BookingStatus, "PaymentReferenceMismatchError" | "BookingTransitionError"]> = [
    ["DRAFT", "BookingTransitionError"],
    ["AWAITING_PROVIDER", "BookingTransitionError"],
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
  it("expires an abandoned checkout and keeps the deadline it was given", () => {
    const before = Booking.restore(validProps({ status: "DRAFT" }));
    const expired = before.expire(new Date());
    expect(expired.status).toBe("EXPIRED");
    expect(expired.expiresAt).toEqual(before.expiresAt);
  });

  it("expires a request the provider never answered", () => {
    const before = Booking.restore(validProps({ status: "AWAITING_PROVIDER" }));
    expect(before.expire(new Date()).status).toBe("EXPIRED");
  });

  it("leaves a booking waiting on payment alone — that one is cancelled, not expired", () => {
    // The row the whole design exists for. A `PENDING_PAYMENT` booking past
    // its window has a provider who blocked their calendar and got nothing,
    // and `EXPIRED` explains none of that to them. `cancel` is what ends it,
    // carrying the reason. If somebody ever flattens the three clocks into
    // one ending, this is the assertion that goes red first.
    const pending = Booking.restore(validProps({ status: "PENDING_PAYMENT" }));
    expect(pending.expire(new Date())).toBe(pending);
    expect(pending.expire(new Date()).status).toBe("PENDING_PAYMENT");
  });

  it("is a no-op on a booking that has already moved on", () => {
    // The sweep selects on a deadline, not on the booking, and the row can
    // move between that select and this call. If the status has moved,
    // expiry has nothing to say — and throwing here would turn an ordinary
    // race into an error somebody has to read.
    const paid = Booking.restore(validProps()).markPaid("mpesa-123", new Date());
    expect(paid.expire(new Date()).status).toBe("CONFIRMED");
  });
});

describe("Booking.expire — every status", () => {
  // Table-driven for the same reason as markPaid's: a future status added
  // to BookingStatus should fail this test, not fall through silently.
  const PAID_REF = "mpesa-existing";

  /**
   * Statuses a charge could actually have reached, so a fixture in one can
   * realistically carry a reference. Nothing charges the customer before the
   * provider accepts, and `DECLINED`/`EXPIRED`/`CANCELLED` are all endings
   * reached without a payment.
   */
  const COULD_CARRY_A_REFERENCE: readonly BookingStatus[] = [
    "PENDING_PAYMENT",
    "CONFIRMED",
    "MARKED_DONE",
    "COMPLETED",
    "DISPUTED",
  ];

  /** Widened from the `as const` tuple so `includes` accepts any status. */
  const ON_A_CLOCK: readonly BookingStatus[] = DEADLINE_BEARING_STATUSES;

  const cases: Array<[BookingStatus, "transitions" | "no-op"]> = [
    ["DRAFT", "transitions"],
    ["AWAITING_PROVIDER", "transitions"],
    // Not a no-op by accident: `cancel` owns this one. See the test above.
    ["PENDING_PAYMENT", "no-op"],
    ["CONFIRMED", "no-op"],
    ["MARKED_DONE", "no-op"],
    ["COMPLETED", "no-op"],
    ["DISPUTED", "no-op"],
    ["DECLINED", "no-op"],
    ["CANCELLED", "no-op"],
    ["EXPIRED", "no-op"],
  ];

  it.each(cases)("from %s it %s", (status, outcome) => {
    const booking = Booking.restore(
      validProps({
        status,
        paymentRef: COULD_CARRY_A_REFERENCE.includes(status) ? PAID_REF : null,
        expiresAt: ON_A_CLOCK.includes(status) ? new Date("2026-09-01T10:15:00.000Z") : null,
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

describe("Booking.cancel", () => {
  it("cancels a booking whose payment window closed, stamping when", () => {
    const before = Booking.restore(validProps({ status: "PENDING_PAYMENT" }));
    const cancelled = before.cancel(WHEN, "customer_did_not_pay");

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledAt).toEqual(WHEN);
    // The deadline stays on the row for the same reason it survives every
    // other transition: it is the fact a provider asking "how long did you
    // give them?" actually needs.
    expect(cancelled.expiresAt).toEqual(before.expiresAt);
    // Nothing was ever charged, so nothing about the money moved either.
    expect(cancelled.paidAt).toBeNull();
    expect(cancelled.paymentRef).toBeNull();
  });

  it("does not expire it — CANCELLED and EXPIRED are different answers", () => {
    const cancelled = Booking.restore(validProps({ status: "PENDING_PAYMENT" })).cancel(
      WHEN,
      "customer_did_not_pay",
    );
    expect(cancelled.status).not.toBe("EXPIRED");
    expect(cancelled.expiredAt).toBeNull();
  });

  it("is a no-op on a booking that got paid first", () => {
    // The same race `expire` absorbs, from the same caller: the sweep read
    // the row as PENDING_PAYMENT and the customer's PIN landed before this
    // call did. Silence, not an error somebody has to dismiss.
    const paid = Booking.restore(validProps()).markPaid("mpesa-123", new Date());
    expect(paid.cancel(WHEN, "customer_did_not_pay")).toBe(paid);
  });

  it.each<BookingStatus>([
    "DRAFT",
    "AWAITING_PROVIDER",
    "CONFIRMED",
    "MARKED_DONE",
    "COMPLETED",
    "DISPUTED",
    "DECLINED",
    "CANCELLED",
    "EXPIRED",
  ])("customer_did_not_pay cannot cancel from %s", (status) => {
    // The reason is what decides which statuses are cancellable, not a flat
    // "these statuses may be cancelled" list — see `CANCELLABLE_FROM` in the
    // aggregate. `customer_did_not_pay` is only ever true of a booking still
    // waiting on money; a `CONFIRMED` booking cancelled for this reason
    // would be the sweep undoing a completed sale.
    const booking = Booking.restore(validProps({ status }));
    expect(booking.cancel(WHEN, "customer_did_not_pay")).toBe(booking);
  });
});

describe("Booking.cancelByCustomer", () => {
  it("cancels a booking still waiting for the provider", () => {
    const awaiting = Booking.restore(validProps({ status: "AWAITING_PROVIDER" }));
    const cancelled = awaiting.cancelByCustomer(WHEN);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledAt).toEqual(WHEN);
  });

  it("cancels a booking waiting to be paid", () => {
    const pending = Booking.restore(validProps({ status: "PENDING_PAYMENT" }));
    expect(pending.cancelByCustomer(WHEN).status).toBe("CANCELLED");
  });

  // The asymmetry `cancel` documents: the sweep's cancel is a no-op from a
  // status its reason does not govern, because a clock that fired late is
  // nobody's mistake. This one is a person pressing a button, so a wrong
  // status is a bug upstream and says so — the same way submit, accept and
  // decline do.
  it("throws rather than no-oping on a paid booking", () => {
    const confirmed = Booking.restore(validProps({ status: "CONFIRMED" }));
    expect(() => confirmed.cancelByCustomer(WHEN)).toThrow(BookingTransitionError);
  });

  it("throws on a booking already cancelled", () => {
    const cancelled = Booking.restore(validProps({ status: "CANCELLED" }));
    expect(() => cancelled.cancelByCustomer(WHEN)).toThrow(BookingTransitionError);
  });

  it("leaves the sweep's own cancel a no-op", () => {
    const confirmed = Booking.restore(validProps({ status: "CONFIRMED" }));
    expect(confirmed.cancel(WHEN, "customer_did_not_pay")).toBe(confirmed);
  });

  it("refuses an at that does not name a real instant", () => {
    const awaiting = Booking.restore(validProps({ status: "AWAITING_PROVIDER" }));
    expect(() => awaiting.cancelByCustomer(new Date("garbage"))).toThrow(BookingDateInvalidError);
  });
});

describe("Booking.cancelByCustomer — every status", () => {
  // Same shape as submit's, accept's and decline's own per-status tables:
  // this is a customer's single deliberate action with no idempotency
  // story, so every status outside the two waits throws rather than
  // no-ops — a future status added to BookingStatus fails this test, not
  // silently falls through.
  const cases: Array<[BookingStatus, "transitions" | "throws"]> = [
    ["DRAFT", "throws"],
    ["PENDING_PAYMENT", "transitions"],
    ["AWAITING_PROVIDER", "transitions"],
    ["CONFIRMED", "throws"],
    ["MARKED_DONE", "throws"],
    ["COMPLETED", "throws"],
    ["DISPUTED", "throws"],
    ["DECLINED", "throws"],
    ["CANCELLED", "throws"],
    ["EXPIRED", "throws"],
  ];

  it.each(cases)("from %s it %s", (status, outcome) => {
    const booking = Booking.restore(validProps({ status, expiresAt: null }));

    if (outcome === "transitions") {
      const result = booking.cancelByCustomer(WHEN);
      expect(result.status).toBe("CANCELLED");
      expect(result.cancelledAt).toEqual(WHEN);
    } else {
      expect(() => booking.cancelByCustomer(WHEN)).toThrow(BookingTransitionError);
    }
  });
});

describe("every deadline-bearing status has exactly one ending", () => {
  // `DEADLINE_BEARING_STATUSES` is what `findDueForSweep` selects on, and
  // `expire`/`cancel` are the only two things that can end what it selects.
  // A status added to that list without a transition that governs it would
  // be swept every sixty seconds, for ever, and never move — the sweep
  // would count it and nothing would happen. A status governed by *both*
  // would mean two endings racing for one row.
  //
  // Driven off the constant itself rather than a copy of it, so adding a
  // fourth clock fails here rather than passing quietly.
  it.each([...DEADLINE_BEARING_STATUSES])("%s is ended by exactly one of expire/cancel", (status) => {
    const booking = Booking.restore(validProps({ status }));

    const expired = booking.expire(WHEN) !== booking;
    const cancelled = booking.cancel(WHEN, "customer_did_not_pay") !== booking;

    expect([expired, cancelled].filter(Boolean)).toHaveLength(1);
    // And the ending is the one the design's table names, not merely *an*
    // ending: `PENDING_PAYMENT` is the row that must not be an expiry.
    expect(cancelled).toBe(status === "PENDING_PAYMENT");
  });
});

describe("every slot-holding status is classified as chargeable or not", () => {
  // `CHARGEABLE_STATUSES` and `SLOT_HOLDING_STATUSES` are two lists that
  // used to be one, and the reversal split them: a slot can now be held by a
  // booking nothing has ever charged. Their doc comments cross-reference
  // each other, but a comment is not a gate — add a sixth slot-holding
  // status and nothing today asks whether a charge could have reached it,
  // which is precisely how `markPaid` came to promise a refund on a `DRAFT`.
  //
  // This map is the gate. It is keyed by `SLOT_HOLDING_STATUSES` itself, so
  // adding a member there is a type error here until somebody answers the
  // question for it. The answer is then checked against what `markPaid`
  // actually does, so a wrong answer fails too: the map cannot drift away
  // from the behaviour it describes without one of the two going red.
  const CHARGE_COULD_HAVE_LANDED: Record<(typeof SLOT_HOLDING_STATUSES)[number], boolean> = {
    // Nothing charges the customer until the provider accepts, so neither of
    // these can carry a payment reference, however long it holds the
    // calendar.
    DRAFT: false,
    AWAITING_PROVIDER: false,
    // The charge is pushed here, and every status after it is downstream of
    // one that cleared.
    PENDING_PAYMENT: true,
    CONFIRMED: true,
    MARKED_DONE: true,
  };

  const EXISTING_REF = "mpesa-existing";
  const OTHER_REF = "mpesa-other";

  it.each(Object.entries(CHARGE_COULD_HAVE_LANDED))(
    "%s: markPaid's refusal matches its classification",
    (status, chargeable) => {
      // PENDING_PAYMENT transitions rather than refusing — it is the one
      // member of this list `markPaid` moves — so no refusal is observable
      // and there is nothing here to compare.
      if (status === "PENDING_PAYMENT") {
        return;
      }

      const booking = Booking.restore(
        validProps({ status: status as BookingStatus, paymentRef: EXISTING_REF }),
      );

      // Only a *different* reference reaches the classification: a matching
      // one is absorbed by identity before status is consulted at all.
      expect(() => booking.markPaid(OTHER_REF, new Date())).toThrow(
        chargeable ? PaymentReferenceMismatchError : BookingTransitionError,
      );
    },
  );
});
