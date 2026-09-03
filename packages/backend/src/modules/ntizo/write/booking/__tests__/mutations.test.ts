import { describe, expect, it } from "bun:test";
import type { z } from "zod";
import { acceptBooking, bookingWriteSchema, createBooking, declineBooking, submitBooking } from "../graphql/schema/mutations";

// The kit's `SchemaAdapter` exposes `.validate()`, not `.parse()` — the raw
// zod schema sits behind `_schema`, same accessor `read/booking`'s,
// `read/activity`'s, `read/communication`'s and `read/notification`'s
// equivalent tests use.
const declineBookingInput = (declineBooking.input as unknown as { _schema: z.ZodTypeAny })._schema;

const VALID_CREATE_INPUT = {
  serviceOptionId: "opt-1",
  providerMemberId: "member-1",
  startsAt: "2026-09-04T12:30:00.000Z",
  locale: "pt-MZ",
};

const VALID_SUBMIT_INPUT = {
  bookingId: "bk-1",
  address: {
    label: "Casa",
    line: "Av. Julius Nyerere 812",
    city: "Maputo",
    district: "Sommerschield",
    directions: null,
    lat: null,
    lng: null,
  },
  description: "Sem energia na cozinha",
};

/**
 * The edge refusing obvious nonsense cheaply — `Booking.create` still owns
 * the rule, this only owns catching it before a round trip to the aggregate.
 * No `durationMinutes` case here: there is no such field to send, which is
 * the whole reason a customer cannot book a two-minute house clean by
 * editing a payload — see the schema's own doc comment.
 */
describe("booking.create input", () => {
  it("accepts a well-formed booking request", () => {
    const result = createBooking.input!.validate(VALID_CREATE_INPUT);
    expect(result.success).toBe(true);
  });

  it("rejects a startsAt that is not a date", () => {
    const result = createBooking.input!.validate({ ...VALID_CREATE_INPUT, startsAt: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("has no customerId field — the customer comes from the session, not the client", () => {
    const result = createBooking.input!.validate({
      ...VALID_CREATE_INPUT,
      customerId: "someone-else",
    });
    // Not stripped silently: the input schema has no such key at all, so a
    // client attempting this either sees the field ignored (extra keys are
    // dropped by a plain z.object) or, if this ever becomes `.strict()`,
    // refused outright. Either way `customerId` never reaches the command
    // through this input.
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).customerId).toBeUndefined();
    }
  });

  it("has no address and no description field — both belong to booking.submit", () => {
    // This is what makes the whole flow reachable: step 1 creates a draft
    // that holds the slot before the customer has given an address. Removed
    // rather than made optional — an optional field nothing ever sets is a
    // field somebody eventually sets wrongly — so a client sending either
    // gets it dropped here and never reaches `CreateBookingInput`, which has
    // no such property to receive it.
    const result = createBooking.input!.validate({
      ...VALID_CREATE_INPUT,
      address: { label: "Casa", line: "Av. Julius Nyerere 812", city: "Maputo" },
      description: "Sem energia na cozinha",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as Record<string, unknown>;
      expect(data.address).toBeUndefined();
      expect(data.description).toBeUndefined();
    }
  });
});

/**
 * Step 2's two fields — the address and the optional note about what needs
 * doing — arriving together on the hop that sends the request. Same division
 * of labour as `booking.create`'s input: this refuses obvious nonsense before
 * a round trip, and `Booking.submit` is where the rule is defined —
 * `SubmitBookingCommand` keeps no second copy of it deliberately.
 */
describe("booking.submit input", () => {
  it("accepts a well-formed submission", () => {
    const result = submitBooking.input!.validate(VALID_SUBMIT_INPUT);
    expect(result.success).toBe(true);
  });

  it("rejects a missing address", () => {
    const { address: _address, ...withoutAddress } = VALID_SUBMIT_INPUT;
    const result = submitBooking.input!.validate(withoutAddress);
    expect(result.success).toBe(false);
  });

  /**
   * Each required component refused on its own, not one example standing in
   * for all three: a schema that had lost the bound on `city` alone would
   * still pass a test that only ever omitted `label`.
   *
   * This is also what keeps `Booking.requireNonBlank` — which calls `.trim()`
   * on its argument — from ever meeting an `undefined` and throwing a raw
   * `TypeError` instead of `BookingFieldBlankError`. The kit validates every
   * input against this schema before the handler runs, so a payload missing a
   * component is refused at the boundary and never reaches the aggregate.
   */
  for (const missing of ["label", "line", "city"] as const) {
    it(`rejects an address with no ${missing}`, () => {
      const { [missing]: _dropped, ...rest } = VALID_SUBMIT_INPUT.address;
      const result = submitBooking.input!.validate({ ...VALID_SUBMIT_INPUT, address: rest });
      expect(result.success).toBe(false);
    });

    it(`rejects a blank ${missing}`, () => {
      const result = submitBooking.input!.validate({
        ...VALID_SUBMIT_INPUT,
        address: { ...VALID_SUBMIT_INPUT.address, [missing]: "   " },
      });
      expect(result.success).toBe(false);
    });
  }

  it("rejects a missing bookingId", () => {
    const { bookingId: _bookingId, ...withoutId } = VALID_SUBMIT_INPUT;
    const result = submitBooking.input!.validate(withoutId);
    expect(result.success).toBe(false);
  });

  it("accepts a null description — the customer need not explain the job", () => {
    const result = submitBooking.input!.validate({ ...VALID_SUBMIT_INPUT, description: null });
    expect(result.success).toBe(true);
  });

  /**
   * **An omitted optional key is not the same input as an explicit null, and
   * Zod treats them differently.** `.nullable()` on its own accepts `null`
   * and rejects `undefined`; GraphQL lets a document leave a nullable input
   * field out entirely, so a client that simply does not send `district`
   * would have had its whole mutation refused. `.optional()` beside
   * `.nullable()` is what makes the omission mean what it reads as.
   *
   * Every optional field on its own, not one example standing in for the
   * set: dropping `.optional()` from a single one of them has to turn this
   * red. Three clients are about to be written against this surface.
   */
  it("accepts a submission that omits every optional key", () => {
    const result = submitBooking.input!.validate({
      bookingId: "bk-1",
      address: { label: "Casa", line: "Av. Julius Nyerere 812", city: "Maputo" },
    });
    expect(result.success).toBe(true);
  });

  for (const omitted of ["district", "directions", "lat", "lng"] as const) {
    it(`accepts an address that omits ${omitted}`, () => {
      const { [omitted]: _dropped, ...rest } = VALID_SUBMIT_INPUT.address;
      const result = submitBooking.input!.validate({ ...VALID_SUBMIT_INPUT, address: rest });
      expect(result.success).toBe(true);
    });
  }

  it("accepts a submission that omits description", () => {
    const { description: _description, ...withoutDescription } = VALID_SUBMIT_INPUT;
    const result = submitBooking.input!.validate(withoutDescription);
    expect(result.success).toBe(true);
  });

  it("accepts an empty description — the aggregate is what normalises it to null", () => {
    // `.max(1000)` with no `.min(1)`, so `""` is a payload the wire takes.
    // That is deliberate — an empty note is the same fact as no note — and it
    // is why `Booking.submit` has a blank-to-null branch with its own tests
    // rather than relying on this schema to make one unreachable.
    const result = submitBooking.input!.validate({ ...VALID_SUBMIT_INPUT, description: "" });
    expect(result.success).toBe(true);
  });

  it("has no customerId field — the customer comes from the session, not the client", () => {
    // Without this, `booking.submit` would be the mutation that sends
    // somebody else's draft to a provider, starting their response clock on a
    // request the customer never made. The command's own authorisation check
    // is the other half; this is the half that removes the temptation.
    const result = submitBooking.input!.validate({
      ...VALID_SUBMIT_INPUT,
      customerId: "someone-else",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).customerId).toBeUndefined();
    }
  });
});

/**
 * The provider's yes and no. Both take only the booking id the person comes
 * from `requireUser(ctx)`, never from this input, for the same reason
 * `booking.create` and `booking.submit` have no `customerId` field — see
 * those schemas' own doc comments.
 */
describe("accept and decline", () => {
  it("are mounted beside create and submit", () => {
    expect(Object.keys(bookingWriteSchema.fields.booking).sort()).toEqual([
      "accept",
      "create",
      "decline",
      "submit",
    ]);
  });

  it("take only the booking id — the person comes from the session", () => {
    const shapeKeys = (field: { input: unknown }): string[] => {
      const adapter = field.input as { _schema?: { shape?: Record<string, unknown> } };
      return Object.keys(adapter._schema?.shape ?? {}).sort();
    };

    expect(shapeKeys(acceptBooking)).toEqual(["bookingId"]);
    expect(shapeKeys(declineBooking)).toEqual(["bookingId", "reason"]);
  });

  it("refuses a free-text reason", () => {
    expect(() => declineBookingInput.parse({ bookingId: "b", reason: "I am busy" })).toThrow();
    expect(declineBookingInput.parse({ bookingId: "b", reason: "outside_area" })).toMatchObject({
      reason: "outside_area",
    });
  });
});
