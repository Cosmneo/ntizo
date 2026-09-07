import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from "@cosmneo/onion-lasagna";

export class QuoteNotFoundError extends NotFoundError {
  constructor(public readonly quoteId: string) {
    super({ message: `No quote was found with id "${quoteId}"`, code: "QUOTE_NOT_FOUND" });
    this.name = "QuoteNotFoundError";
  }
}

export class QuoteNotYoursError extends ForbiddenError {
  constructor() {
    super({ message: "This quote is not yours", code: "QUOTE_NOT_YOURS" });
    this.name = "QuoteNotYoursError";
  }
}

export class NotProviderMemberError extends ForbiddenError {
  constructor() {
    super({ message: "This workspace is not one you belong to", code: "NOT_PROVIDER_MEMBER" });
    this.name = "NotProviderMemberError";
  }
}

export class QuoteTransitionError extends UnprocessableError {
  constructor(public readonly from: string, public readonly to: string) {
    super({ message: `A quote cannot go from ${from} to ${to}`, code: "QUOTE_TRANSITION" });
    this.name = "QuoteTransitionError";
  }
}

/** Refused because a restored row disagrees with a fact derived from its own other fields. Modelled on `BookingSnapshotInconsistentError`. */
export class QuoteSnapshotInconsistentError extends UnprocessableError {
  constructor(public readonly field: string, public readonly stored: unknown, public readonly expected: unknown) {
    super({
      message: `A quote's stored "${field}" is ${String(stored)}, but its other fields say it should be ${String(expected)}`,
      code: "QUOTE_SNAPSHOT_INCONSISTENT",
    });
    this.name = "QuoteSnapshotInconsistentError";
  }
}

export class QuoteNotOpenError extends UnprocessableError {
  constructor() {
    super({ message: "This quote is closed", code: "QUOTE_NOT_OPEN" });
    this.name = "QuoteNotOpenError";
  }
}

export type NotQuotableReason = "not_found" | "not_published" | "not_quote_mode" | "provider_not_active";

export class QuoteServiceNotQuotableError extends UnprocessableError {
  constructor(public readonly reason: NotQuotableReason) {
    super({ message: `This service cannot be quoted: ${reason}`, code: "QUOTE_SERVICE_NOT_QUOTABLE" });
    this.name = "QuoteServiceNotQuotableError";
  }
}

export class QuoteAlreadyOpenError extends ConflictError {
  constructor() {
    super({ message: "You already have an open quote for this service", code: "QUOTE_ALREADY_OPEN" });
    this.name = "QuoteAlreadyOpenError";
  }
}

export class QuoteProposalLapsedError extends UnprocessableError {
  constructor(public readonly validUntil: Date) {
    super({ message: `The proposal expired at ${validUntil.toISOString()}`, code: "QUOTE_PROPOSAL_LAPSED" });
    this.name = "QuoteProposalLapsedError";
  }
}

export class QuoteNoLiveProposalError extends UnprocessableError {
  constructor() {
    super({ message: "This quote has no proposal to act on", code: "QUOTE_NO_LIVE_PROPOSAL" });
    this.name = "QuoteNoLiveProposalError";
  }
}

/** The calendar refused the slot when the booking was inserted; the whole acceptance rolled back. */
export class QuoteSlotTakenError extends ConflictError {
  constructor() {
    super({ message: "That time is no longer free on the provider's calendar", code: "QUOTE_SLOT_TAKEN" });
    this.name = "QuoteSlotTakenError";
  }
}

/** The provider proposed a time they have already sold. */
export class QuoteSlotOverlapError extends ConflictError {
  constructor() {
    super({ message: "A booking already occupies that time for this member", code: "QUOTE_SLOT_OVERLAP" });
    this.name = "QuoteSlotOverlapError";
  }
}

export class QuotePriceInvalidError extends UnprocessableError {
  constructor(public readonly priceMinor: number) {
    super({ message: `${priceMinor} is not a positive whole number of minor units`, code: "QUOTE_PRICE_INVALID" });
    this.name = "QuotePriceInvalidError";
  }
}

export class QuotePriceBelowMinimumError extends UnprocessableError {
  constructor(public readonly priceMinor: number, public readonly minimumMinor: number) {
    super({ message: `${priceMinor} is below the platform minimum of ${minimumMinor}`, code: "QUOTE_PRICE_BELOW_MINIMUM" });
    this.name = "QuotePriceBelowMinimumError";
  }
}

export class QuoteNoCustomerPhoneError extends UnprocessableError {
  constructor() {
    super({ message: "Add a phone number before accepting", code: "QUOTE_NO_CUSTOMER_PHONE" });
    this.name = "QuoteNoCustomerPhoneError";
  }
}

export class QuoteAddressRequiredError extends UnprocessableError {
  constructor() {
    super({ message: "This quote needs an address", code: "QUOTE_ADDRESS_REQUIRED" });
    this.name = "QuoteAddressRequiredError";
  }
}

export class QuoteMemberCannotPerformError extends UnprocessableError {
  constructor(public readonly providerMemberId: string) {
    super({ message: `Member ${providerMemberId} does not perform this service`, code: "QUOTE_MEMBER_CANNOT_PERFORM" });
    this.name = "QuoteMemberCannotPerformError";
  }
}

export class QuoteStartsInPastError extends UnprocessableError {
  constructor(public readonly startsAt: Date) {
    super({ message: `${startsAt.toISOString()} is in the past`, code: "QUOTE_STARTS_IN_PAST" });
    this.name = "QuoteStartsInPastError";
  }
}

export class QuoteDurationInvalidError extends UnprocessableError {
  constructor(public readonly durationMinutes: number) {
    super({ message: `${durationMinutes} is not a positive whole number of minutes`, code: "QUOTE_DURATION_INVALID" });
    this.name = "QuoteDurationInvalidError";
  }
}

export class QuoteFieldBlankError extends UnprocessableError {
  constructor(public readonly field: string) {
    super({ message: `${field} must not be blank`, code: "QUOTE_FIELD_BLANK" });
    this.name = "QuoteFieldBlankError";
  }
}

export class QuoteDateInvalidError extends UnprocessableError {
  constructor(public readonly field: string) {
    super({ message: `${field} is not a valid date`, code: "QUOTE_DATE_INVALID" });
    this.name = "QuoteDateInvalidError";
  }
}

/** Same code messages use, so the web's existing handling of it applies unchanged. */
export class QuoteContainsContactError extends UnprocessableError {
  constructor() {
    super({ message: "Phone numbers, emails and contact links stay off the platform until the booking is paid", code: "MESSAGE_CONTAINS_CONTACT" });
    this.name = "QuoteContainsContactError";
  }
}

export class QuoteTooManyAttachmentsError extends UnprocessableError {
  constructor(public readonly count: number, public readonly max: number) {
    super({ message: `${count} attachments; the limit is ${max}`, code: "TOO_MANY_ATTACHMENTS" });
    this.name = "QuoteTooManyAttachmentsError";
  }
}

export class QuoteAttachmentNotAvailableError extends UnprocessableError {
  constructor() {
    super({ message: "That file is not available to attach", code: "ATTACHMENT_NOT_AVAILABLE" });
    this.name = "QuoteAttachmentNotAvailableError";
  }
}
