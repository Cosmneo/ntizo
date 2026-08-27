import { describe, expect, it } from "bun:test";
import { getGraphQLErrorCode } from "@cosmneo/onion-lasagna";
import { CursorInvalidError } from "../../../bounded-contexts/activity/domain/exceptions";

/**
 * `CursorInvalidError`'s own file and Task 2's repository test both claim
 * this error reaches a caller as something other than a generic 500 — but
 * neither actually enforces it. `activity.repository.test.ts`'s
 * `rejects.toThrow(CursorInvalidError)` is `instanceof`-based, so it stays
 * green even if the class stopped extending `UnprocessableError`. What a
 * client actually sees is the string `getGraphQLErrorCode` produces, and
 * that is what this asserts.
 *
 * Lives here, in `read/activity`, rather than beside the exception's own
 * domain tests: Task 7's GraphQL field is what makes a caller-supplied
 * `cursor` reach `listForActor` at all — before this task, nothing fed an
 * external value into the string this error wraps.
 */
describe("CursorInvalidError, at the boundary that makes it client-facing", () => {
  it("is not masked to INTERNAL_ERROR by the kit — it maps to UNPROCESSABLE", () => {
    const error = new CursorInvalidError("not-a-real-cursor");
    expect(getGraphQLErrorCode(error)).toBe("UNPROCESSABLE");
  });
});
