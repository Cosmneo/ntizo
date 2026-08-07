/**
 * Maps a provider-BC domain error code (`GraphqlError.code` — see
 * `bounded-contexts/provider/domain/exceptions`) to a translation key under
 * provider.json's "errors" namespace. Codes with no entry here have no
 * dedicated copy; callers fall back to the error's raw message.
 *
 * Pure: no transport, no i18n, no React. This is the single source of
 * truth for the code -> translation-key mapping. Narrowing a caught error
 * to `GraphqlError` and calling `t(...)` both belong outside `domain/` —
 * see `viewmodel/error-message.ts`.
 */
const CODE_I18N_KEYS: Partial<Record<string, string>> = {
  MEMBER_ALREADY_EXISTS: "errors.memberAlreadyExists",
  INVITE_ALREADY_USED: "errors.inviteAlreadyUsed",
  INVITE_EXPIRED: "errors.inviteExpired",
  INSUFFICIENT_PROVIDER_PERMISSIONS: "errors.insufficientPermissions",
  PROVIDER_NOT_FOUND: "errors.providerNotFound",
  NOT_PROVIDER_OWNER: "errors.notProviderOwner",
  INVITE_NOT_FOUND: "errors.inviteNotFound",
  MEMBER_NOT_FOUND: "errors.memberNotFound",
  INDIVIDUAL_PROVIDER_CANNOT_HAVE_MEMBERS: "errors.individualProviderCannotHaveMembers",
  // Thrown by the read-side detail projection (get-provider-detail.projection.ts),
  // not by bounded-contexts/provider/domain/exceptions — still a reachable,
  // stable code the web client branches on.
  NOT_PROVIDER_MEMBER: "errors.notProviderMember",
};

/** Fallback translation key for codes with no dedicated copy, or non-Error throws. */
export const GENERIC_PROVIDER_ERROR_KEY = "errors.generic";

/**
 * Pure lookup: a provider-BC domain error code -> translation key under
 * provider.json's "errors" namespace. Returns `undefined` when there's no
 * dedicated copy for this code, so callers know to fall back to the raw
 * message instead.
 */
export function providerErrorKey(code: string | undefined): string | undefined {
  return code ? CODE_I18N_KEYS[code] : undefined;
}
