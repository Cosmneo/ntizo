/**
 * Maps a better-auth error code to a translation key under auth.json's
 * "errors" namespace.
 *
 * Every code here was observed against the running dev API rather than read
 * off a types file — a mapping written from guesses compiles, never matches,
 * and leaves the generic copy showing forever with nothing failing.
 *
 * Pure: no transport, no i18n, no React. Narrowing a caught value and calling
 * `t(...)` both belong outside `domain/` — see `viewmodel/auth-error.ts`.
 */
const CODE_I18N_KEYS: Partial<Record<string, string>> = {
  // Returned for BOTH a wrong password and an address with no account, which
  // is deliberate on better-auth's side: one answer for both is what stops a
  // sign-in form from being an account-existence oracle. The copy has to stay
  // equally vague or it hands back what the code refuses to say.
  INVALID_EMAIL_OR_PASSWORD: "errors.invalidCredentials",

  // In practice this is the unique index on `phone_number` — proved against
  // dev: three fresh numbers created accounts, any repeat failed, whatever the
  // country. better-auth reports it as a generic creation failure, so the copy
  // points at the number without asserting that it is registered.
  FAILED_TO_CREATE_USER: "errors.couldNotCreateAccount",
  USER_ALREADY_EXISTS: "errors.couldNotCreateAccount",
  PHONE_NUMBER_EXIST: "errors.phoneAlreadyUsed",

  PASSWORD_TOO_SHORT: "errors.passwordTooShort",
  PASSWORD_TOO_LONG: "errors.passwordTooLong",

  // The raw message for this one is "[body.email] Invalid email address" — a
  // field path from the server's validator. It reads as a stack trace to
  // anyone who is not us, which is the whole reason nothing here renders
  // `error.message`.
  VALIDATION_ERROR: "errors.checkTheFields",

  INVALID_TOKEN: "errors.linkNoLongerValid",
  TOKEN_EXPIRED: "errors.linkNoLongerValid",

  OTP_NOT_FOUND: "errors.codeNotValid",
  INVALID_OTP: "errors.codeNotValid",
  OTP_EXPIRED: "errors.codeExpired",

  INVALID_PHONE_NUMBER: "errors.invalidPhone",
};

/** Shown when a code has no dedicated copy, or when nothing usable was thrown. */
export const GENERIC_AUTH_ERROR_KEY = "errors.generic";

/** Shown when the request never reached the server. */
export const NETWORK_AUTH_ERROR_KEY = "errors.network";

/**
 * Pure lookup: better-auth error code -> key under auth.json's "errors".
 * `undefined` when there is no dedicated copy, so the caller shows the
 * generic string rather than inventing one.
 */
export function authErrorKey(code: string | undefined): string | undefined {
  return code ? CODE_I18N_KEYS[code] : undefined;
}
