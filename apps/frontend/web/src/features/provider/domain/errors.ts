import type { TFunction } from "i18next";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";

/**
 * Maps a provider-BC domain error code (`GraphqlError.code` — see
 * `bounded-contexts/provider/domain/exceptions`) to a translation key under
 * provider.json's "errors" namespace. Codes with no entry here have no
 * dedicated copy; callers fall back to the error's raw message.
 */
const CODE_I18N_KEYS: Partial<Record<string, string>> = {
  MEMBER_ALREADY_EXISTS: "errors.memberAlreadyExists",
  INVITE_ALREADY_USED: "errors.inviteAlreadyUsed",
  INVITE_EXPIRED: "errors.inviteExpired",
  INSUFFICIENT_PROVIDER_PERMISSIONS: "errors.insufficientPermissions",
};

/**
 * Turns any thrown value into user-facing copy.
 *
 * `GraphqlError.code` is the fine-grained domain code (already preferred
 * over the coarse kit code by `sessionGraphql`). Codes with dedicated copy
 * resolve through `t` against provider.json's "errors" namespace — pass
 * `{ ns: "provider" }` explicitly so this works from callers whose default
 * namespace isn't "provider" (e.g. the auth feature's accept-invite page).
 * Anything else falls back to the error's own message.
 */
export function providerErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof GraphqlError) {
    const key = error.code ? CODE_I18N_KEYS[error.code] : undefined;
    if (key) return t(key, { ns: "provider" });
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return t("errors.generic", { ns: "provider" });
}
