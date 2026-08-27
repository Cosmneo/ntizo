import { UnprocessableError } from "@cosmneo/onion-lasagna";

/**
 * The communication context's refusals.
 *
 * Each extends a kit error type so `getGraphQLErrorCode` recognises it and the
 * GraphQL layer stops masking it to `INTERNAL_ERROR` — the same reason
 * `activity/domain/exceptions.ts` and `review/domain/exceptions.ts` give.
 * Subclassing plain `Error` with a bolted-on `code` property compiles, reads
 * correctly, and still reaches the browser as "An unexpected error occurred".
 * Do not "simplify" this back to `Error`.
 *
 * The `code` strings are a PUBLIC CONTRACT a client can branch on. Renaming
 * one is a breaking change to callers, not a refactor.
 */

export class MessageBodyEmptyError extends UnprocessableError {
  constructor() {
    super({
      message: "A message needs something in it.",
      code: "MESSAGE_BODY_EMPTY",
    });
    this.name = "MessageBodyEmptyError";
  }
}

export class MessageBodyTooLongError extends UnprocessableError {
  // `max` is a constructor argument, not an import of `MESSAGE_BODY_MAX`
  // from `message.aggregate.ts` — that file imports this one to throw it,
  // so importing back would be a cycle. The thrower already knows the
  // limit; this just carries it into the message.
  constructor(
    public readonly length: number,
    public readonly max: number,
  ) {
    super({
      message: `A message may be at most ${max} characters; this one is ${length}.`,
      code: "MESSAGE_BODY_TOO_LONG",
    });
    this.name = "MessageBodyTooLongError";
  }
}

/**
 * Refused because the caller cannot see this thread — or because no such
 * thread exists.
 *
 * Deliberately the same answer for both: telling "not yours" apart from
 * "doesn't exist" tells a caller probing thread ids which ones are real.
 */
export class ThreadNotVisibleError extends UnprocessableError {
  constructor() {
    super({
      message: "No such conversation.",
      code: "THREAD_NOT_VISIBLE",
    });
    this.name = "ThreadNotVisibleError";
  }
}

export class ProviderNotContactableError extends UnprocessableError {
  constructor() {
    super({
      message: "This provider cannot be messaged.",
      code: "PROVIDER_NOT_CONTACTABLE",
    });
    this.name = "ProviderNotContactableError";
  }
}

/**
 * Refused because the requested conversation type is not one `THREAD_TYPES`
 * (Task 1's enum) lists.
 *
 * Not in the brief's Step 3 list — the brief's Interfaces block promises
 * `Thread.open` but its Step 1 test only covers `Message`; this is the
 * exception `Thread.open`'s mirror test needs. See `thread.aggregate.ts`.
 */
export class ThreadTypeInvalidError extends UnprocessableError {
  constructor(public readonly type: string) {
    super({
      message: `"${type}" is not a supported conversation type.`,
      code: "THREAD_TYPE_INVALID",
    });
    this.name = "ThreadTypeInvalidError";
  }
}

/**
 * A cursor `listForCustomer`, `listForProvider`, or `listForThread` could not
 * decode.
 *
 * Same shape and same reason as `activity/domain/exceptions.ts`'s
 * `CursorInvalidError`: `UnprocessableError`, not `NotFoundError` — nothing is
 * missing, the value the caller sent is simply not one this repository can
 * use. A distinct class (and a distinct `code`) per context rather than a
 * shared one, so a client branching on `code` never has to guess which
 * bounded context refused it.
 */
export class CursorInvalidError extends UnprocessableError {
  constructor(public readonly cursor: string) {
    super({
      message: `The requested cursor is not usable: "${cursor}"`,
      code: "COMMUNICATION_CURSOR_INVALID",
    });
    this.name = "CursorInvalidError";
  }
}
