import { NotFoundError } from "@cosmneo/onion-lasagna";

/**
 * User BC domain exceptions.
 *
 * Each extends a kit error type so `getGraphQLErrorCode` recognises it and the
 * GraphQL layer surfaces a real code instead of masking it to INTERNAL_ERROR.
 * The `code` strings are a PUBLIC CONTRACT — the web client branches on them.
 * Renaming one is a breaking change to the frontend.
 */

export class ProfileNotFoundError extends NotFoundError {
  constructor(userId: string) {
    super({ message: `Profile not found for user: ${userId}`, code: "PROFILE_NOT_FOUND" });
    this.name = "ProfileNotFoundError";
  }
}
