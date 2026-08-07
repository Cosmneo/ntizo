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
 * feature's accept-invite page). Anything else falls back to the error's
 * own message.
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
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return t(GENERIC_PROVIDER_ERROR_KEY, { ns: "provider" });
}
