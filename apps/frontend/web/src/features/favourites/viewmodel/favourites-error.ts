import { GraphqlError } from "@/shared/lib/graphql/session-graphql";

/**
 * The code a favourites hook's caller should branch on — never `.message`,
 * never the bare coarse `code` a `GraphqlError` carries.
 *
 * Two shapes matter here, and they need different fields of the underlying
 * error to reach:
 *
 * - **Not signed in.** Every one of the nine fields calls `requireUser` first,
 *   which throws a `ForbiddenError` constructed with `code: "UNAUTHENTICATED"`.
 *   The kit maps every `ForbiddenError` to the coarse wire code `"FORBIDDEN"`
 *   regardless of what was constructed, and the constructed value survives
 *   only as `extensions.originalCode`. `GraphqlError.code` already prefers
 *   `originalCode` (see `session-graphql.ts`), so it reads through correctly
 *   and this returns `"UNAUTHENTICATED"`. Reading the coarse code instead
 *   would collapse "sign in" and a genuine refusal into one string.
 *
 *   In normal use the hooks never produce this: they check the session and
 *   navigate to `/sign-in` before firing. It arrives when a session expired
 *   between the render and the tap — a real case, and one worth telling apart.
 * - **A rejected input.** A list name outside 1..60 characters, more than 48
 *   ids in one marks call, more than 64 list ids in one `setLists` — all
 *   schema-level, all carrying the coarse `code: "VALIDATION_ERROR"` with
 *   `originalCode: "OBJECT_VALIDATION_ERROR"`. The `originalCode` there is the
 *   kit's own internal subtype rather than anything case-specific, so this one
 *   case reads the *coarse* code and hands the caller the stable
 *   `"VALIDATION_ERROR"` string the rest of this codebase checks for. Exactly
 *   the exception `messagingErrorCode` documents and makes, for the same
 *   reason.
 *
 * `undefined` when there is no error, or it is not a `GraphqlError` at all
 * (a network failure, a thrown non-Error) — nothing for a caller to branch on
 * beyond "something went wrong".
 */
export function favouritesErrorCode(error: unknown): string | undefined {
  if (!(error instanceof GraphqlError)) return undefined;
  if (error.kitCode === "VALIDATION_ERROR") return error.kitCode;
  return error.code;
}
