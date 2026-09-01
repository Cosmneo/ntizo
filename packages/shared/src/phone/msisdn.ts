/**
 * The Vodacom Moçambique mobile prefixes M-Pesa can actually debit.
 *
 * M-Pesa is Vodacom's wallet: an `86`/`87` (Movitel) or `82`/`83` (Tmcel)
 * number is a perfectly valid Mozambican mobile that simply cannot hold one.
 * Refusing those here rather than sending them costs a customer nothing —
 * the API answers `INS-2051 MSISDN invalid.` for them anyway — and buys a
 * failure we can name in our own logs instead of one we have to look up.
 *
 * Kept as a named list rather than a `/^8[45]/` regex because it is a fact
 * about a carrier's numbering plan, not a shape: if Vodacom is allocated
 * another prefix, this is the line that changes, and it should be obvious
 * that it is a list of prefixes and not a coincidence of digits.
 */
const VODACOM_PREFIXES = ["84", "85"] as const;

/** Moçambique's country calling code, and the only one M-Pesa serves. */
const COUNTRY_CODE = "258";

/** A national Mozambican mobile number is nine digits: two of prefix, seven of subscriber. */
const NATIONAL_DIGITS = 9;

/**
 * Turns whatever a customer typed, or whatever `profile.phone_number` holds,
 * into the `258XXXXXXXXX` M-Pesa requires — or refuses it.
 *
 * Accepts the three forms a Mozambican number actually arrives in:
 * `84xxxxxxx` (national), `25884xxxxxxx` (country code, no plus) and
 * `+258 84 xxx xxxx` (E.164, which is the form `profile.phone_number` stores,
 * spacing and punctuation included). Separators — spaces, dashes, dots,
 * parentheses — are stripped before anything is decided, because a stored
 * number is only ever as tidy as whoever typed it.
 *
 * **It refuses a nine-digit number whose prefix is wrong, and that is the
 * whole point of this function.** The predecessor platform's normaliser
 * (`ntizo-v1`, `MpesaService::formatPhoneNumber`) ends with
 * `if (strlen($phone) === 9) { $phone = '258' . $phone; }` — so `123456789`
 * becomes `258123456789`, passes its own length-and-country check, and is
 * pushed at the API as if it were a handset. Everything after that point is
 * a charge that cannot succeed, attributed to a number that never existed.
 * Length is not validity; the prefix is.
 *
 * Returns `null` rather than throwing. Every caller here is already deciding
 * between "we charged" and "we could not", and a customer whose stored
 * number is unusable is an ordinary instance of the second — not an
 * exceptional condition, and not one worth a `try` at every call site. See
 * `MpesaPaymentCharge.charge`, which turns this `null` into a named charge
 * failure alongside every other reason a charge does not land.
 *
 * @param raw a phone number in any of the forms above
 * @returns the number as `258XXXXXXXXX`, or `null` if it is not one M-Pesa can reach
 */
export function toMpesaMsisdn(raw: string): string | null {
  const compact = raw.replace(/[\s().-]/g, "");

  // Only two shapes reach the prefix test: a bare national number, or one
  // already carrying the country code with or without a leading `+`. A
  // leading `0` is deliberately not stripped the way the predecessor strips
  // it — Moçambique has no national trunk prefix, so `084…` is ten digits of
  // something that is not a Mozambican number, and quietly rewriting it into
  // one is the same class of mistake as accepting any nine digits.
  const withoutPlus = compact.startsWith("+") ? compact.slice(1) : compact;
  const national = withoutPlus.startsWith(COUNTRY_CODE)
    ? withoutPlus.slice(COUNTRY_CODE.length)
    : withoutPlus;

  if (national.length !== NATIONAL_DIGITS) return null;
  // After the separator strip and the two prefixes above, anything that is
  // not a digit — a letter, a stray `+` in the middle — is not a number.
  if (!/^\d+$/.test(national)) return null;
  if (!VODACOM_PREFIXES.some((prefix) => national.startsWith(prefix))) return null;

  return `${COUNTRY_CODE}${national}`;
}
