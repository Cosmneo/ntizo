import { UnprocessableError } from "@cosmneo/onion-lasagna";

/**
 * The activity context's refusals.
 *
 * Extends a kit error type so `getGraphQLErrorCode` recognises it and the
 * GraphQL layer stops masking it to `INTERNAL_ERROR`. Subclassing plain
 * `Error` with a bolted-on `code` property is not enough — it compiles, it
 * reads correctly, and this is the exact mistake `catalog/domain/exceptions.ts`
 * documents reaching the browser as "An unexpected error occurred". Do not
 * "simplify" this back to `Error`.
 */

/**
 * A cursor `listForActor` could not decode.
 *
 * `UnprocessableError`, not `NotFoundError` or `ConflictError`: nothing is
 * missing and nothing conflicts, the value the caller sent is simply not one
 * this repository can use — the same shape of refusal as catalog's
 * `CategoryOrderInvalidError` ("the requested order is not usable").
 *
 * Task 7 hands GraphQL cursor input straight into `listForActor`, so this is
 * client-facing: a mangled cursor must read to the caller as "your cursor is
 * bad", not as a generic 500.
 */
export class CursorInvalidError extends UnprocessableError {
  constructor(public readonly cursor: string) {
    super({
      message: `The requested cursor is not usable: "${cursor}"`,
      code: "ACTIVITY_CURSOR_INVALID",
    });
    this.name = "CursorInvalidError";
  }
}
