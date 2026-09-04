import { describe, expect, it } from "bun:test";
import {
  BookingCreated,
  BookingSubmitted,
  BookingPaid,
  BookingExpired,
  BookingAccepted,
  BookingDeclined,
  BookingCancelled,
  BookingKeptOpen,
  BookingMarkedDone,
  BookingCompleted,
  type BookingCancelledReason,
  type BookingExpiredCause,
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

describe("BookingSubmitted", () => {
  it("publishes as booking.submitted with the booking id as aggregate id", () => {
    // `satisfies` pins this literal to the constructor's payload type
    // without widening it — see `BookingAccepted`'s test above for why that
    // matters for an event crossing into Notification: a field silently
    // dropped here would still pass `tsc`, and would only surface as a
    // provider never told a request needs an answer.
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      providerMemberId: "m2",
      serviceId: "s1",
      startsAt: new Date("2026-09-04T12:30:00.000Z"),
      endsAt: new Date("2026-09-04T13:30:00.000Z"),
      priceMinor: 120000,
      currency: "MZN",
      respondBy: new Date("2026-09-04T14:30:00.000Z"),
    } satisfies ConstructorParameters<typeof BookingSubmitted>[0];

    const event = new BookingSubmitted(payload);

    expect(event.eventName).toBe("booking.submitted");
    expect(event.aggregateId).toBe("b1");
  });

  it("round-trips the payload", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      providerMemberId: "m2",
      serviceId: "s1",
      startsAt: new Date("2026-09-04T12:30:00.000Z"),
      endsAt: new Date("2026-09-04T13:30:00.000Z"),
      priceMinor: 120000,
      currency: "MZN",
      respondBy: new Date("2026-09-04T14:30:00.000Z"),
    } satisfies ConstructorParameters<typeof BookingSubmitted>[0];

    const event = new BookingSubmitted(payload);

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
      cause: "provider_response",
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
      cause: "provider_response",
    } satisfies ConstructorParameters<typeof BookingExpired>[0];

    const event = new BookingExpired(payload);

    expect(event.payload).toEqual(payload);
  });

  // The whole reason `cause` exists: the three ways a booking reaches
  // EXPIRED do not share an audience — an abandoned DRAFT tells nobody, a
  // provider who never answered tells the customer — and the resulting row
  // is identical in every case, so Notification can only tell them apart
  // from this field.
  //
  // A `Record` keyed by the union rather than a list of strings, so it is a
  // gate and not a restatement: a member added to `BookingExpiredCause` is
  // a type error here until somebody says who it tells. That is exactly the
  // question a `payment_window` member could not answer — the payment
  // window's audience is the *provider*, and it does not produce this event
  // at all (it produces `BookingCancelled` with `customer_did_not_pay`; see
  // the design's failure section). Each key also pins the literal, so a
  // rename fails here even though it would still satisfy the type.
  //
  // Renamed from `BookingExpiredClock`: two of the three are clocks and the
  // third is not. A draft superseded because the customer started a new one
  // did not run out of anything, and reporting it as `checkout_hold` would
  // make this event say something false about why a slot came free.
  const AUDIENCE: Record<BookingExpiredCause, "nobody" | "the customer"> = {
    checkout_hold: "nobody",
    provider_response: "the customer",
    // The customer did this deliberately, three seconds ago, by picking a
    // different time. Telling them about it would be telling them what they
    // just did.
    superseded: "nobody",
  };

  it.each(Object.keys(AUDIENCE) as BookingExpiredCause[])(
    "carries %s, the one fact separating otherwise identical expiries",
    (cause) => {
      const payload = {
        bookingId: "b1",
        customerId: "u9",
        providerMemberId: "m1",
        startsAt: new Date("2026-09-04T12:30:00.000Z"),
        cause,
      } satisfies ConstructorParameters<typeof BookingExpired>[0];

      const event = new BookingExpired(payload);

      expect(event.payload.cause).toBe(cause);
    },
  );
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
      reason: "customer_did_not_pay",
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
      reason: "customer_did_not_pay",
    } satisfies ConstructorParameters<typeof BookingCancelled>[0];

    const event = new BookingCancelled(payload);

    expect(event.payload).toEqual(payload);
  });

  it("accepts customer_did_not_pay as a valid reason", () => {
    // `BookingCancelledReason` narrowed to one member (see that type's own
    // doc comment: the other two never had a producer and were trimmed,
    // not merely left undocumented) — this pins the literal itself rather
    // than only its type, so a rename of the string value would fail here
    // even though it would still satisfy the type.
    const reason: BookingCancelledReason = "customer_did_not_pay";
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      providerMemberId: "m9",
      startsAt: new Date("2026-09-05T08:00:00.000Z"),
      reason,
    } satisfies ConstructorParameters<typeof BookingCancelled>[0];

    const event = new BookingCancelled(payload);

    expect(event.payload.reason).toBe("customer_did_not_pay");
  });
});

describe("BookingKeptOpen", () => {
  it("publishes as booking.kept_open with the booking id as aggregate id", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      askAgainAt: new Date("2026-09-11T09:00:00.000Z"),
    } satisfies ConstructorParameters<typeof BookingKeptOpen>[0];

    const event = new BookingKeptOpen(payload);

    // The underscore is deliberate and pinned here rather than left to a
    // reader's eye: `outbox_event.event_type` is a plain varchar with no
    // check constraint, so a name typed wrong reaches the database happily
    // and surfaces only as a consumer that never fires.
    expect(event.eventName).toBe("booking.kept_open");
    expect(event.aggregateId).toBe("b1");
  });

  it("round-trips the payload", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      askAgainAt: new Date("2026-09-11T09:00:00.000Z"),
    } satisfies ConstructorParameters<typeof BookingKeptOpen>[0];

    const event = new BookingKeptOpen(payload);

    expect(event.payload).toEqual(payload);
  });
});

describe("BookingMarkedDone", () => {
  it("publishes as booking.marked_done with the booking id as aggregate id", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      feedbackBy: new Date("2026-09-07T09:00:00.000Z"),
    } satisfies ConstructorParameters<typeof BookingMarkedDone>[0];

    const event = new BookingMarkedDone(payload);

    expect(event.eventName).toBe("booking.marked_done");
    expect(event.aggregateId).toBe("b1");
  });

  it("round-trips the payload", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      feedbackBy: new Date("2026-09-07T09:00:00.000Z"),
    } satisfies ConstructorParameters<typeof BookingMarkedDone>[0];

    const event = new BookingMarkedDone(payload);

    expect(event.payload).toEqual(payload);
  });

  it("carries the deadline the customer's window closes on, not the row's column name", () => {
    // `feedbackBy`, not `expiresAt` — the same distinction `BookingSubmitted`
    // draws with `respondBy`. A consumer telling the customer how long they
    // have reads this key; renaming it to match the column would break them
    // silently, since the value is identical.
    const event = new BookingMarkedDone({
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      feedbackBy: new Date("2026-09-07T09:00:00.000Z"),
    });

    expect(event.payload.feedbackBy).toEqual(new Date("2026-09-07T09:00:00.000Z"));
  });
});

describe("BookingCompleted", () => {
  it("publishes as booking.completed with the booking id as aggregate id", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      priceMinor: 150000,
      commissionMinor: 15000,
      currency: "MZN",
    } satisfies ConstructorParameters<typeof BookingCompleted>[0];

    const event = new BookingCompleted(payload);

    expect(event.eventName).toBe("booking.completed");
    expect(event.aggregateId).toBe("b1");
  });

  it("round-trips the payload", () => {
    const payload = {
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      priceMinor: 150000,
      commissionMinor: 15000,
      currency: "MZN",
    } satisfies ConstructorParameters<typeof BookingCompleted>[0];

    const event = new BookingCompleted(payload);

    expect(event.payload).toEqual(payload);
  });

  // The three fields this event exists to carry, pinned individually rather
  // than only through the round-trip above. Completion is what makes a payout
  // owed, and the commission comes *out of* that payout — a consumer handed a
  // zeroed price, a zeroed commission or the wrong currency pays the wrong
  // provider the wrong amount, and nothing downstream of here can tell.
  it("carries the money the payout will be computed from", () => {
    const event = new BookingCompleted({
      bookingId: "b1",
      customerId: "u1",
      providerId: "p1",
      priceMinor: 150000,
      commissionMinor: 15000,
      currency: "MZN",
    });

    expect(event.payload.priceMinor).toBe(150000);
    expect(event.payload.commissionMinor).toBe(15000);
    expect(event.payload.currency).toBe("MZN");
  });
});
