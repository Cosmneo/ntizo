import { NotFoundError, UnprocessableError } from "@cosmneo/onion-lasagna";

/**
 * The contact context's refusals.
 *
 * Each extends a kit error so `getGraphQLErrorCode` recognises it and the
 * GraphQL layer does not mask it to INTERNAL_ERROR — the same trap the review
 * context documents. The `code` strings are a PUBLIC CONTRACT: the form
 * branches on `CONTACT_RATE_LIMITED` to say something different.
 */

export class ContactNameInvalidError extends UnprocessableError {
  constructor(public readonly length: number) {
    super({
      message: `A name must be between 2 and 80 characters — got ${length}`,
      code: "CONTACT_NAME_INVALID",
    });
    this.name = "ContactNameInvalidError";
  }
}

export class ContactMessageInvalidError extends UnprocessableError {
  constructor(public readonly length: number) {
    super({
      message: `A message must be between 10 and 2000 characters — got ${length}`,
      code: "CONTACT_MESSAGE_INVALID",
    });
    this.name = "ContactMessageInvalidError";
  }
}

export class ContactEmailRequiredError extends UnprocessableError {
  constructor() {
    super({
      message: "An email address is needed so we can reply",
      code: "CONTACT_EMAIL_REQUIRED",
    });
    this.name = "ContactEmailRequiredError";
  }
}

export class ContactEmailInvalidError extends UnprocessableError {
  constructor() {
    super({ message: "That does not look like an email address", code: "CONTACT_EMAIL_INVALID" });
    this.name = "ContactEmailInvalidError";
  }
}

export class ContactTopicInvalidError extends UnprocessableError {
  constructor(public readonly kind: string, public readonly topic: string) {
    super({
      message: `"${topic}" is not a topic of the ${kind} form`,
      code: "CONTACT_TOPIC_INVALID",
    });
    this.name = "ContactTopicInvalidError";
  }
}

/**
 * Refused because this address has sent too much too recently.
 *
 * An `UnprocessableError` rather than a `ForbiddenError`: nothing about who
 * the caller is decides it, only how often they have written. The form shows
 * its own sentence for this code and keeps what was typed.
 */
export class ContactRateLimitedError extends UnprocessableError {
  constructor(public readonly max: number, public readonly windowMinutes: number) {
    super({
      message: `At most ${max} messages every ${windowMinutes} minutes from one address — try again later, or write to us by email`,
      code: "CONTACT_RATE_LIMITED",
    });
    this.name = "ContactRateLimitedError";
  }
}

export class ContactRequestNotFoundError extends NotFoundError {
  constructor(public readonly requestId: string) {
    super({ message: `No contact request with id "${requestId}"`, code: "CONTACT_REQUEST_NOT_FOUND" });
    this.name = "ContactRequestNotFoundError";
  }
}
