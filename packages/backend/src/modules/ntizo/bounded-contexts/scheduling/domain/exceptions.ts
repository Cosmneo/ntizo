import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from "@cosmneo/onion-lasagna";

/**
 * The scheduling context's refusals.
 *
 * Each extends a kit error type so `getGraphQLErrorCode` recognises it and the
 * GraphQL layer stops masking it to INTERNAL_ERROR. Subclassing plain `Error`
 * with a `code` property is not enough — it compiles, it reads correctly, and
 * every one of these reached the browser as "An unexpected error occurred",
 * telling somebody who left a box empty that the server had broken.
 *
 * The `code` strings are a PUBLIC CONTRACT: the frontend branches on them to
 * decide which field to put the message under. Renaming one breaks that.
 */

export class AvailabilityRuleInvalidError extends UnprocessableError {
  constructor(reason: string) {
    super({
      message: `That working-hours rule cannot be used: ${reason}`,
      code: "AVAILABILITY_RULE_INVALID",
    });
    this.name = "AvailabilityRuleInvalidError";
  }
}

export class ExceptionShapeInvalidError extends UnprocessableError {
  constructor(reason: string) {
    super({
      message: `That date exception cannot be used: ${reason}`,
      code: "EXCEPTION_SHAPE_INVALID",
    });
    this.name = "ExceptionShapeInvalidError";
  }
}

export class AvailabilityWindowTooWideError extends UnprocessableError {
  constructor(public readonly days: number) {
    super({
      message: `The requested window spans ${days} days — availability can only be requested up to 62 days ahead`,
      code: "AVAILABILITY_WINDOW_TOO_WIDE",
    });
    this.name = "AvailabilityWindowTooWideError";
  }
}

export class TimezoneInvalidError extends UnprocessableError {
  constructor(public readonly timezone: string) {
    super({
      message: `"${timezone}" is not a usable timezone`,
      code: "TIMEZONE_INVALID",
    });
    this.name = "TimezoneInvalidError";
  }
}

export class MemberNotInProviderError extends NotFoundError {
  constructor(public readonly memberId: string) {
    super({
      message: `No member with id "${memberId}" in this provider`,
      code: "MEMBER_NOT_IN_PROVIDER",
    });
    this.name = "MemberNotInProviderError";
  }
}

export class ServiceMemberCannotPerformError extends UnprocessableError {
  constructor(
    public readonly serviceId: string,
    public readonly memberId: string,
  ) {
    super({
      message: `Member "${memberId}" cannot perform service "${serviceId}"`,
      code: "SERVICE_MEMBER_CANNOT_PERFORM",
    });
    this.name = "ServiceMemberCannotPerformError";
  }
}

export class NotSelfOrProviderOwnerOrAdminError extends ForbiddenError {
  constructor() {
    super({
      message: "Only this member, the provider's owner, or an admin can do this",
      code: "NOT_SELF_OR_PROVIDER_OWNER_OR_ADMIN",
    });
    this.name = "NotSelfOrProviderOwnerOrAdminError";
  }
}

export class ExceptionNotFoundError extends NotFoundError {
  constructor(public readonly exceptionId: string) {
    super({
      message: `No exception with id "${exceptionId}"`,
      code: "EXCEPTION_NOT_FOUND",
    });
    this.name = "ExceptionNotFoundError";
  }
}

export class ClosureNotFoundError extends NotFoundError {
  constructor(public readonly closureId: string) {
    super({
      message: `No closure with id "${closureId}"`,
      code: "CLOSURE_NOT_FOUND",
    });
    this.name = "ClosureNotFoundError";
  }
}

export class ClosureRangeInvalidError extends UnprocessableError {
  constructor(reason: string) {
    super({
      message: `That closure range cannot be used: ${reason}`,
      code: "CLOSURE_RANGE_INVALID",
    });
    this.name = "ClosureRangeInvalidError";
  }
}
