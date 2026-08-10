import { APIError } from "better-auth/api";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Validates a phone number arriving on signup and returns it in E.164.
 *
 * Lives here rather than inline in the auth config so it can be tested
 * without standing up better-auth. The gap it closes is easy to reintroduce
 * and invisible from the outside: the phone-number plugin's own
 * `phoneNumberValidator` does NOT run during signup — there the field is
 * written as an ordinary additional field — so before this existed the API
 * accepted any string at all.
 *
 * @returns the number in E.164, or `undefined` when none was supplied.
 * @throws {APIError} 400 when a value was supplied but is not a real number.
 */
export function normalizeSignUpPhoneNumber(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;

  const parsed = typeof raw === "string" ? parsePhoneNumberFromString(raw) : undefined;
  if (!parsed?.isValid()) {
    throw new APIError("BAD_REQUEST", {
      message: "Invalid phone number. Use the international format, e.g. +258841234567.",
      code: "INVALID_PHONE_NUMBER",
    });
  }

  // `.number` is the E.164 form, so punctuation and spacing are stripped.
  // Storing the raw input instead would let "+258 84 987 6543" and
  // "+258849876543" coexist as two rows for one phone — the unique index
  // compares strings and cannot see that they are the same number.
  return parsed.number;
}
