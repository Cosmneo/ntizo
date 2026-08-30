import { describe, expect, it } from "bun:test";
import { createBooking } from "../graphql/schema/mutations";

const VALID_INPUT = {
  serviceOptionId: "opt-1",
  providerMemberId: "member-1",
  startsAt: "2026-09-04T12:30:00.000Z",
  locale: "pt-MZ",
  address: {
    label: "Casa",
    line: "Av. Julius Nyerere 812",
    city: "Maputo",
    district: "Sommerschield",
    directions: null,
    lat: null,
    lng: null,
  },
  description: null,
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
    const result = createBooking.input!.validate(VALID_INPUT);
    expect(result.success).toBe(true);
  });

  it("rejects a missing address", () => {
    const { address: _address, ...withoutAddress } = VALID_INPUT;
    const result = createBooking.input!.validate(withoutAddress);
    expect(result.success).toBe(false);
  });

  it("rejects a startsAt that is not a date", () => {
    const result = createBooking.input!.validate({ ...VALID_INPUT, startsAt: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("has no customerId field — the customer comes from the session, not the client", () => {
    const result = createBooking.input!.validate({ ...VALID_INPUT, customerId: "someone-else" });
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
});
