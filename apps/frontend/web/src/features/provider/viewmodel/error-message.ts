import type { TFunction } from "i18next";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import { GENERIC_PROVIDER_ERROR_KEY, providerErrorKey } from "../domain/errors";

/**
 * Turns any thrown value into user-facing copy.
 *
 * `GraphqlError.code` is the fine-grained domain code (already preferred
 * over the coarse kit code by `sessionGraphql`). Codes with dedicated copy
 * (see `domain/errors.ts`) resolve through `t` against provider.json's
 * "errors" namespace — pass `{ ns: "provider" }` explicitly so this works
 * from callers whose default namespace isn't "provider" (e.g. the auth
 * feature's accept-invite page).
 *
 * Anything else — an unmapped code, a missing code, or a non-GraphqlError
 * throw — renders the generic string, NEVER `error.message`. The backend
 * lifted response masking for coded domain errors (Task 1), so
 * `error.message` can carry raw internals (invite tokens, provider UUIDs);
 * only codes with an explicit, reviewed translation may reach the UI. The
 * real message still goes to the console so it isn't lost for debugging.
 *
 * Lives in `viewmodel/`, not `domain/`: narrowing on `GraphqlError` (a
 * transport type from `shared/lib/graphql`) and calling `t` (i18n) both
 * point the wrong way for a pure domain module — `domain/` must not know
 * about transport or React/i18next.
 */
export function providerErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof GraphqlError) {
    const key = providerErrorKey(error.code);
    if (key) return t(key, { ns: "provider" });
  }
  if (error instanceof Error) {
    console.error(
      "[provider] unmapped error, showing generic copy:",
      error.message,
    );
  } else {
    console.error(
      "[provider] unmapped non-Error throw, showing generic copy:",
      error,
    );
  }
  return t(GENERIC_PROVIDER_ERROR_KEY, { ns: "provider" });
}
