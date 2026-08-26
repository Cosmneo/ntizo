import { describe, expect, it } from "bun:test";
import { normalizePhoneNumber } from "../phone-number";
import { InvalidPhoneNumberError } from "../../exceptions";

describe("normalizePhoneNumber", () => {
  it("returns E.164 unchanged when it already is", () => {
    expect(normalizePhoneNumber("+258841234567")).toBe("+258841234567");
  });

  it("strips punctuation and spacing", () => {
    // The unique index compares strings. "+258 84 123 4567" stored verbatim
    // would sit beside "+258841234567" as a second row for one phone.
    expect(normalizePhoneNumber("+258 84 123 4567")).toBe("+258841234567");
  });

  it("refuses a national number with no country code", () => {
    expect(() => normalizePhoneNumber("841234567")).toThrow(InvalidPhoneNumberError);
  });

  it("refuses junk", () => {
    expect(() => normalizePhoneNumber("not a phone")).toThrow(InvalidPhoneNumberError);
  });

  it("does not put the number itself in the error message", () => {
    // Error messages reach logs. A phone number is the person.
    try {
      normalizePhoneNumber("+258000");
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain("258000");
    }
  });
});
