import { NotFoundError, UnprocessableError } from "@cosmneo/onion-lasagna";

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

/**
 * Refused because the message carries nothing at all: no text, no
 * attachment. Named `MessageEmptyError` rather than `MessageBodyEmptyError`
 * — the rule stopped being about text the moment an attachment could stand
 * in for a body. A photograph with no caption is a message; an empty box
 * is not.
 */
export class MessageEmptyError extends UnprocessableError {
  constructor() {
    super({
      message: "A message needs something in it.",
      code: "MESSAGE_EMPTY",
    });
    this.name = "MessageEmptyError";
  }
}

/**
 * Refused because the message body carries a phone number, email address, or
 * direct-contact link — `hasContact` (`@ntizo/shared/text`) is the same
 * detector the composer runs on every keystroke for immediate feedback and
 * the upload route already ran on a file's NAME (Task 5); this is what makes
 * it the gate, not merely a hint, on the one path that mattered and had
 * none: the message body itself. See `SendMessageCommand.execute` — a
 * `curl` posting a body straight past a browser reaches this check before
 * anything is written, exactly the bypass the spec's own reasoning for
 * putting the detector in `packages/shared` names.
 */
export class MessageContainsContactError extends UnprocessableError {
  constructor() {
    super({
      message: "Contact details aren't allowed in messages.",
      code: "MESSAGE_CONTAINS_CONTACT",
    });
    this.name = "MessageContainsContactError";
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
 * Refused because a message carries more attachments than `MAX_ATTACHMENTS`
 * allows.
 *
 * `max` is a constructor argument, not an import of `MAX_ATTACHMENTS` from
 * `message.aggregate.ts` — that file imports this one to throw it, so
 * importing back would be a cycle. The thrower already knows the limit;
 * this just carries it into the message.
 */
export class TooManyAttachmentsError extends UnprocessableError {
  constructor(
    public readonly count: number,
    public readonly max: number,
  ) {
    super({
      message: `A message may carry at most ${max} attachments; this one has ${count}.`,
      code: "TOO_MANY_ATTACHMENTS",
    });
    this.name = "TooManyAttachmentsError";
  }
}

/**
 * Refused because an attachment descriptor `sendMessage` was given does not
 * point at a file this sender may attach — collapsing five different
 * reasons into one answer, deliberately:
 *
 * 1. `storageKey` does not start with this sender's own
 *    `attachment/<senderUserId>/` prefix.
 * 2. No object exists at that key at all.
 * 3. The object's `customMetadata.uploadedByUserId` names somebody else.
 * 4. The object's stored `contentType` is not one `ACCEPTED_ATTACHMENT_TYPES`
 *    lists — unreachable in production (`sniffContentType` never stamps
 *    anything else), but the boundary that makes that list actually
 *    constrain rather than merely document.
 * 5. The object carries no `customMetadata.originalName` — every object the
 *    real upload route writes has one; its absence means this object did
 *    not come through that route.
 *
 * Same reason `ThreadNotVisibleError` collapses "not yours" and "doesn't
 * exist": telling these apart would tell a caller probing storage keys
 * which ones are real and who owns them.
 */
export class AttachmentNotAvailableError extends UnprocessableError {
  constructor() {
    super({
      message: "One of these files is not available to attach.",
      code: "ATTACHMENT_NOT_AVAILABLE",
    });
    this.name = "AttachmentNotAvailableError";
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

/** Refused because the subject is empty after trimming, or longer than `SUPPORT_SUBJECT_MAX`. */
export class SupportSubjectInvalidError extends UnprocessableError {
  constructor(
    public readonly length: number,
    public readonly max: number,
  ) {
    super({
      message:
        length === 0
          ? "A support request needs a subject."
          : `A subject may be at most ${max} characters; this one is ${length}.`,
      code: "SUPPORT_SUBJECT_INVALID",
    });
    this.name = "SupportSubjectInvalidError";
  }
}

/** Refused because the caller asked to speak for a provider they are not a member of — or named no provider at all. */
export class SupportNotAMemberError extends UnprocessableError {
  constructor() {
    super({
      message: "You can only open a request on behalf of a provider you belong to.",
      code: "SUPPORT_NOT_A_MEMBER",
    });
    this.name = "SupportNotAMemberError";
  }
}

/** Refused because the booking named is not the requester's — same answer as "no such booking", on purpose. */
export class SupportBookingNotYoursError extends UnprocessableError {
  constructor() {
    super({
      message: "That booking is not yours to ask about.",
      code: "SUPPORT_BOOKING_NOT_YOURS",
    });
    this.name = "SupportBookingNotYoursError";
  }
}

/**
 * The admin side's refusal: the id names no support request. Deliberately
 * also the answer for an id that names an *inquiry* thread — the admin
 * slices are scoped to `type = 'support'`, and an admin must not learn from
 * the difference that a private conversation exists at that id.
 */
export class SupportRequestNotFoundError extends NotFoundError {
  constructor() {
    super({
      message: "No such support request.",
      code: "SUPPORT_REQUEST_NOT_FOUND",
    });
    this.name = "SupportRequestNotFoundError";
  }
}

export class SupportAlreadyResolvedError extends UnprocessableError {
  constructor() {
    super({
      message: "This request is already resolved.",
      code: "SUPPORT_ALREADY_RESOLVED",
    });
    this.name = "SupportAlreadyResolvedError";
  }
}

/** A domain guard: `reopen` only makes sense on a resolved request. Never reaches the wire — `SendMessageCommand` checks the status first. */
export class SupportRequestNotResolvedError extends UnprocessableError {
  constructor() {
    super({
      message: "This request is not resolved, so it cannot be reopened.",
      code: "SUPPORT_NOT_RESOLVED",
    });
    this.name = "SupportRequestNotResolvedError";
  }
}

export class SupportTooManyOpenError extends UnprocessableError {
  constructor(public readonly max: number) {
    super({
      message: `You already have ${max} open requests. Wait for an answer, or reply on one of them.`,
      code: "SUPPORT_TOO_MANY_OPEN",
    });
    this.name = "SupportTooManyOpenError";
  }
}
