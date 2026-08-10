import { describe, expect, it } from "bun:test";
import { normalizeSignUpPhoneNumber } from "../phone-number";

describe("normalizeSignUpPhoneNumber", () => {
  it("returns undefined when no number was supplied", () => {
    expect(normalizeSignUpPhoneNumber(undefined)).toBeUndefined();
    expect(normalizeSignUpPhoneNumber(null)).toBeUndefined();
    expect(normalizeSignUpPhoneNumber("")).toBeUndefined();
  });

  it("keeps a well-formed E.164 number as it is", () => {
    expect(normalizeSignUpPhoneNumber("+258849876543")).toBe("+258849876543");
  });

  it("strips punctuation so one phone cannot become two rows", () => {
    // The unique index compares strings. Were these stored verbatim, the
    // same phone would back two accounts and neither would look wrong.
    expect(normalizeSignUpPhoneNumber("+258 84 987 6543")).toBe("+258849876543");
    expect(normalizeSignUpPhoneNumber("+258-84-987-6543")).toBe("+258849876543");
    expect(normalizeSignUpPhoneNumber("(+258) 849876543")).toBe("+258849876543");
  });

  it("rejects a national number with no country code", () => {
    // This is the case the plugin's own validator never sees: at signup the
    // field arrives as a plain additional field, and the API stored it
    // happily until this check existed.
    expect(() => normalizeSignUpPhoneNumber("849876543")).toThrow();
  });

  it("rejects a number that is not real for its country", () => {
    expect(() => normalizeSignUpPhoneNumber("+258123")).toThrow();
    expect(() => normalizeSignUpPhoneNumber("+2588498765430000")).toThrow();
  });

  it("rejects values that are not strings", () => {
    expect(() => normalizeSignUpPhoneNumber(258849876543)).toThrow();
    expect(() => normalizeSignUpPhoneNumber({ number: "+258849876543" })).toThrow();
  });

  it("reports a 400 the client can act on, not a server error", () => {
    try {
      normalizeSignUpPhoneNumber("nonsense");
      throw new Error("expected a rejection");
    } catch (error) {
      const e = error as { status?: string | number; body?: { code?: string } };
      expect(e.status).toBe("BAD_REQUEST");
      expect(e.body?.code).toBe("INVALID_PHONE_NUMBER");
    }
  });
});
