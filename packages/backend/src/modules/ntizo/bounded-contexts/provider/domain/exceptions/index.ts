import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from "@cosmneo/onion-lasagna";

/**
 * Provider BC domain exceptions.
 *
 * Each extends a kit error type so `getGraphQLErrorCode` recognises it and the
 * GraphQL layer stops masking it to INTERNAL_ERROR. The `code` strings are a
 * PUBLIC CONTRACT — the web client branches on them. Renaming one is a
 * breaking change to the frontend.
 */

export class ProviderNotFoundError extends NotFoundError {
  constructor(id: string) {
    super({ message: `Provider not found: ${id}`, code: "PROVIDER_NOT_FOUND" });
    this.name = "ProviderNotFoundError";
  }
}

export class NotProviderOwnerError extends ForbiddenError {
  constructor(providerId: string, userId: string) {
    super({ message: `User ${userId} is not the owner of provider ${providerId}`, code: "NOT_PROVIDER_OWNER" });
    this.name = "NotProviderOwnerError";
  }
}

export class InsufficientProviderPermissionsError extends ForbiddenError {
  constructor(providerId: string, userId: string) {
    super({ message: `User ${userId} lacks the required role on provider ${providerId}`, code: "INSUFFICIENT_PROVIDER_PERMISSIONS" });
    this.name = "InsufficientProviderPermissionsError";
  }
}

export class InviteExpiredError extends UnprocessableError {
  constructor(token: string) {
    super({ message: `Invite token expired: ${token}`, code: "INVITE_EXPIRED" });
    this.name = "InviteExpiredError";
  }
}

export class InviteAlreadyUsedError extends ConflictError {
  constructor(token: string) {
    super({ message: `Invite token already used or revoked: ${token}`, code: "INVITE_ALREADY_USED" });
    this.name = "InviteAlreadyUsedError";
  }
}

export class InviteNotFoundError extends NotFoundError {
  constructor(token: string) {
    super({ message: `Invite not found: ${token}`, code: "INVITE_NOT_FOUND" });
    this.name = "InviteNotFoundError";
  }
}

export class MemberAlreadyExistsError extends ConflictError {
  constructor(providerId: string, userId: string) {
    super({ message: `User ${userId} is already a member of provider ${providerId}`, code: "MEMBER_ALREADY_EXISTS" });
    this.name = "MemberAlreadyExistsError";
  }
}

export class MemberNotFoundError extends NotFoundError {
  constructor(providerId: string, userId: string) {
    super({ message: `User ${userId} is not a member of provider ${providerId}`, code: "MEMBER_NOT_FOUND" });
    this.name = "MemberNotFoundError";
  }
}

export class IndividualProviderCannotHaveMembersError extends UnprocessableError {
  constructor(providerId: string) {
    super({
      message: `Provider ${providerId} is of type "individual" and cannot have additional members`,
      code: "INDIVIDUAL_PROVIDER_CANNOT_HAVE_MEMBERS",
    });
    this.name = "IndividualProviderCannotHaveMembersError";
  }
}

/**
 * A status change the lifecycle does not allow.
 *
 * Thrown by `Provider.decide` rather than checked at the edge: the admin screen
 * only offers legal moves, and the screen is not the thing that has to be
 * right. Two of the refusals matter — rejecting a business that already traded,
 * and suspending an application that never did — because both read the same to
 * whoever clicks and mean different things to the business afterwards.
 */
export class InvalidProviderStatusTransitionError extends UnprocessableError {
  constructor(from: string, to: string) {
    super({
      message: `A provider cannot go from ${from} to ${to}`,
      code: "INVALID_PROVIDER_STATUS_TRANSITION",
    });
    this.name = "InvalidProviderStatusTransitionError";
  }
}

/**
 * Where a business is paid, refused.
 *
 * `UnprocessableError`, not a bare `Error`. A bare one surfaces as
 * "An unexpected error occurred" with an INTERNAL_ERROR code, which tells
 * somebody who picked the wrong payment method that the server broke — and
 * files a rejected input in the monitoring as if it were a fault.
 */
export class InvalidPayoutDestinationError extends UnprocessableError {
  constructor(reason: string, code: "PAYOUT_INCOMPLETE" | "PAYOUT_METHOD_NOT_CAPABLE") {
    super({ message: reason, code });
    this.name = "InvalidPayoutDestinationError";
  }
}

/**
 * Refused by `Provider.update` when the caller's timezone is not one
 * `Intl.DateTimeFormat` recognises.
 *
 * Same `code` as the scheduling BC's own `TimezoneInvalidError` — both name
 * the one thing the availability screen's timezone field can get wrong — but
 * declared separately here rather than imported across bounded contexts: the
 * provider BC owns the `provider.timezone` column and the write path that
 * sets it, and scheduling only ever reads it back.
 */
export class TimezoneInvalidError extends UnprocessableError {
  constructor(public readonly timezone: string) {
    super({
      message: `"${timezone}" is not a usable timezone`,
      code: "TIMEZONE_INVALID",
    });
    this.name = "TimezoneInvalidError";
  }
}
