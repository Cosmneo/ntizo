import { parsePhoneNumberFromString } from "libphonenumber-js";
import { InvalidPhoneNumberError } from "../exceptions";

/**
 * A phone number, in the one form the platform stores.
 *
 * The better-auth module has `normalizeSignUpPhoneNumber`, which parses the
 * same way and throws better-auth's `APIError`. It is not reused here: a
 * domain value object that imports an auth framework's HTTP error type cannot
 * be tested or reasoned about without that framework. The duplication is one
 * call; the coupling avoided is larger.
 *
 * Parsed with no default country, so a bare national number is refused. There
 * is no country to default to — the platform is not Mozambique-only, and
 * guessing one would silently turn a Portuguese number into a Mozambican one.
 */
export function normalizePhoneNumber(raw: string): string {
  const parsed = parsePhoneNumberFromString(raw);
  if (!parsed?.isValid()) throw new InvalidPhoneNumberError();
  // `.number` is the E.164 form — punctuation and spacing gone.
  return parsed.number;
}
