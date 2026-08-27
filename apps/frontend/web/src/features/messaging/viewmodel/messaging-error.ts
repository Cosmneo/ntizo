import { GraphqlError } from "@/shared/lib/graphql/session-graphql";

/**
 * The code a messaging hook's caller should branch on — never `.message`,
 * never the bare coarse `code` a `GraphqlError` carries.
 *
 * Every failure this feature's hooks need to tell apart resolves to one of
 * three codes, and they need *different* fields of `GraphqlError` to reach
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
 *   `originalCode`, so it reads through this one correctly.
 * - **A genuine refusal — "no such conversation".** `ThreadNotVisibleError`
 *   and `ProviderNotContactableError` both map to `"UNPROCESSABLE"`, on
 *   purpose the same for a thread that does not exist and one that exists
 *   but is not the caller's — see `ThreadNotVisibleError`'s own doc
 *   comment. `GraphqlError.code` reads this correctly too: with no
 *   `originalCode` supplied, it falls back to the coarse `"UNPROCESSABLE"`.
 * - **A rejected `send` body.** The kit's own schema-level validation
 *   (an empty or >4000-character body, a `limit` outside 1..50) always
 *   carries the coarse `code: "VALIDATION_ERROR"` with
 *   `originalCode: "OBJECT_VALIDATION_ERROR"` — confirmed on the wire by
 *   *both* `communicationSend`'s body bound and `communicationMyThreads`'s
 *   `limit` bound in Task 7's and Task 8's live-server introspection.
 *   `OBJECT_VALIDATION_ERROR` is the kit's own internal validation-error
 *   subtype, not a domain-supplied string the way `ForbiddenError`'s is —
 *   there is nothing case-specific to recover by preferring it. Preferring
 *   `originalCode` here (i.e. just returning `GraphqlError.code`) would
 *   hand a caller `"OBJECT_VALIDATION_ERROR"` instead of the stable
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
