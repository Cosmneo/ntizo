import { GraphqlError } from "@/shared/lib/graphql/session-graphql";

/**
 * The code a messaging hook's caller should branch on — never `.message`,
 * never the bare coarse `code` a `GraphqlError` carries.
 *
 * Every failure this feature's hooks need to tell apart resolves to one of
 * three shapes, and they need *different* fields of `GraphqlError` to reach
 * the right one:
 *
 * - **Not signed in.** `requireUser` throws a `ForbiddenError` with
 *   `code: "UNAUTHENTICATED"`, but the kit's `getGraphQLErrorCode` maps
 *   every `ForbiddenError` to the coarse wire code `"FORBIDDEN"`
 *   *regardless of what was constructed* — confirmed reading the kit's
 *   compiled source (Task 7/8's reports). The constructed value survives
 *   only as `extensions.originalCode`. Reading `GraphqlError.kitCode`
 *   (or the raw wire `code`) here would collapse "sign in" and a genuine
 *   refusal into the same string. `GraphqlError.code` already prefers
 *   `originalCode`, so it reads through this one correctly:
 *   `messagingErrorCode(...) === "UNAUTHENTICATED"`.
 * - **A genuine refusal.** `ThreadNotVisibleError` and
 *   `ProviderNotContactableError` both extend the kit's `UnprocessableError`
 *   and both construct it with an **explicit** domain code —
 *   `"THREAD_NOT_VISIBLE"` / `"PROVIDER_NOT_CONTACTABLE"` (see
 *   `communication/domain/exceptions.ts`). The kit's `mapErrorToGraphQLError`
 *   emits `originalCode: error.code` **unconditionally** for any
 *   `CodedError` — confirmed reading the compiled source
 *   (`dist/graphql/shared/index.cjs`), there is no branch that omits it —
 *   so the wire always carries both the coarse `code: "UNPROCESSABLE"` and
 *   the specific `originalCode`. An earlier version of this comment (and
 *   this function's test) claimed `originalCode` could be absent here and
 *   that `.code` would fall back to the coarse `"UNPROCESSABLE"` — that was
 *   never true; a review round caught it by mutation before it shipped.
 *   `GraphqlError.code` still reads through correctly (it already prefers
 *   `originalCode`), so this function returns the *specific* domain code —
 *   `"THREAD_NOT_VISIBLE"` or `"PROVIDER_NOT_CONTACTABLE"` — which is more
 *   useful than the coarse one anyway: a caller can render "no such
 *   conversation" for one and "this provider cannot be messaged" for the
 *   other, different sentences the coarse code alone couldn't tell apart.
 * - **A rejected `send` body.** The kit's own schema-level validation
 *   (an empty or >4000-character body, a `limit` outside 1..50) always
 *   carries the coarse `code: "VALIDATION_ERROR"` with
 *   `originalCode: "OBJECT_VALIDATION_ERROR"` — confirmed on the wire by
 *   *both* `communicationSend`'s body bound and `communicationMyThreads`'s
 *   `limit` bound in Task 7's and Task 8's live-server introspection.
 *   `OBJECT_VALIDATION_ERROR` is the kit's own internal validation-error
 *   subtype, not a domain-supplied string the way `ThreadNotVisibleError`'s
 *   is — there is nothing case-specific to recover by preferring it.
 *   Preferring `originalCode` here (i.e. just returning `GraphqlError.code`)
 *   would hand a caller `"OBJECT_VALIDATION_ERROR"` instead of the stable
 *   `"VALIDATION_ERROR"` string the rest of this codebase (and any caller
 *   checking `=== "VALIDATION_ERROR"`) expects, so this one case is the
 *   exception: read the *coarse* code.
 *
 * `undefined` when there is no error, or the error is not a `GraphqlError`
 * at all (a network failure, a thrown non-Error) — nothing for a caller to
 * branch on beyond "something went wrong".
 */
export function messagingErrorCode(error: unknown): string | undefined {
  if (!(error instanceof GraphqlError)) return undefined;
  if (error.kitCode === "VALIDATION_ERROR") return error.kitCode;
  return error.code;
}
