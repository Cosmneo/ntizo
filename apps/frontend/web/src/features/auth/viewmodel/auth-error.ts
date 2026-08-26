import type { TFunction } from "i18next";
import {
  authErrorKey,
  GENERIC_AUTH_ERROR_KEY,
  NETWORK_AUTH_ERROR_KEY,
} from "../domain/errors";

/** The shape better-auth's client resolves with when a call fails. */
interface AuthClientError {
  code?: string;
  message?: string;
  status?: number;
}

/**
 * Turns anything an auth call produces into copy a person can act on.
 *
 * **Never renders the server's own message.** Those are English, written for
 * us, and some carry internals — the validation failure comes back as
 * "[body.email] Invalid email address", which to anyone else reads as the app
 * breaking rather than as a typo in their email. Only codes with a reviewed
 * translation reach the screen; everything else gets the generic line, and the
 * real message goes to the console so it is still there to debug with.
 *
 * A 429 is answered from `status` rather than a code, because rate limiting is
 * applied by the transport before any handler runs and there is no code to
 * read.
 */
export function authErrorMessage(t: TFunction, error: unknown): string {
  const err = (error ?? {}) as AuthClientError;

  if (err.status === 429) return t("errors.tooManyAttempts", { ns: "auth" });

  const key = authErrorKey(err.code);
  if (key) return t(key, { ns: "auth" });

  // A rejected promise rather than a resolved `{ error }` means the request
  // never got an answer — offline, DNS, a dropped connection. Telling someone
  // to check their connection is useful; telling them "Failed to fetch" is not.
  if (error instanceof TypeError) {
    console.error("[auth] network failure:", error.message);
    return t(NETWORK_AUTH_ERROR_KEY, { ns: "auth" });
  }

  console.error(
    "[auth] unmapped error, showing generic copy:",
    err.code ?? "(no code)",
    err.message ?? error,
  );
  return t(GENERIC_AUTH_ERROR_KEY, { ns: "auth" });
}
