import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from "@cosmneo/onion-lasagna";

/**
 * The catalog's refusals.
 *
 * Each extends a kit error type so `getGraphQLErrorCode` recognises it and the
 * GraphQL layer stops masking it to INTERNAL_ERROR. Subclassing plain `Error`
 * with a `code` property is not enough — it compiles, it reads correctly, and
 * every one of these reached the browser as "An unexpected error occurred",
 * telling somebody who left a box empty that the server had broken.
 *
 * The `code` strings are a PUBLIC CONTRACT: the admin form branches on them to
 * decide which field to put the message under. Renaming one breaks that.
 */

export class CategoryCodeTakenError extends ConflictError {
  constructor(public readonly categoryCode: string) {
    super({
      message: `A category with the code "${categoryCode}" already exists`,
      code: "CATEGORY_CODE_TAKEN",
    });
    this.name = "CategoryCodeTakenError";
  }
}

export class CategoryNameRequiredError extends UnprocessableError {
  constructor() {
    super({
      message: "A category needs a name in the platform's default language",
      code: "CATEGORY_DEFAULT_NAME_REQUIRED",
    });
    this.name = "CategoryNameRequiredError";
  }
}

export class CategoryNotFoundError extends NotFoundError {
  constructor(public readonly categoryId: string) {
    super({
      message: `No category with id "${categoryId}"`,
      code: "CATEGORY_NOT_FOUND",
    });
    this.name = "CategoryNotFoundError";
  }
}

export class CategoryOrderInvalidError extends UnprocessableError {
  constructor(reason: string) {
    super({
      message: `The requested category order is not usable: ${reason}`,
      code: "CATEGORY_ORDER_INVALID",
    });
    this.name = "CategoryOrderInvalidError";
  }
}

export class ServiceNotFoundError extends NotFoundError {
  constructor(public readonly serviceId: string) {
    super({ message: `No service with id "${serviceId}"`, code: "SERVICE_NOT_FOUND" });
    this.name = "ServiceNotFoundError";
  }
}

export class ServiceNeedsOptionError extends UnprocessableError {
  constructor() {
    super({
      message: "A priced service needs at least one option before it can be published",
      code: "SERVICE_NEEDS_OPTION",
    });
    this.name = "ServiceNeedsOptionError";
  }
}

/**
 * Nobody performs it.
 *
 * Thrown from two places on purpose: `canPublish` refuses to *publish* a
 * service with no performer, and `SetServiceMembersCommand` separately
 * refuses to *clear* the last performer of one already published — an edit
 * the person making it can simply not make. A member leaving the workspace
 * is the other way a service can end up with nobody, and that path is not
 * refusable (people leave); it unpublishes instead of throwing this.
 */
export class ServiceNeedsMemberError extends UnprocessableError {
  constructor() {
    super({
      message: "A service needs at least one performer before it can be published",
      code: "SERVICE_NEEDS_MEMBER",
    });
    this.name = "ServiceNeedsMemberError";
  }
}

export class QuoteServiceHasOptionsError extends ConflictError {
  constructor() {
    super({
      message: "A quote service cannot have options — its price is not knowable in advance",
      code: "SERVICE_QUOTE_HAS_OPTIONS",
    });
    this.name = "QuoteServiceHasOptionsError";
  }
}

/** The mirror of {@link QuoteServiceHasOptionsError}: the same rule, guarded from the other side. */
export class QuoteFormNotAllowedError extends ConflictError {
  constructor() {
    super({
      message: "A priced service cannot have a quote form — its price is already set through its options",
      code: "SERVICE_QUOTE_FORM_NOT_ALLOWED",
    });
    this.name = "QuoteFormNotAllowedError";
  }
}

export class ServiceNameRequiredError extends UnprocessableError {
  constructor() {
    super({
      message: "A service needs a name in the language it was written in",
      code: "SERVICE_NAME_REQUIRED",
    });
    this.name = "ServiceNameRequiredError";
  }
}

export class ServiceCategoryRequiredError extends UnprocessableError {
  constructor() {
    super({ message: "A service needs a category", code: "SERVICE_CATEGORY_REQUIRED" });
    this.name = "ServiceCategoryRequiredError";
  }
}

export class OptionDurationError extends UnprocessableError {
  constructor(code: "OPTION_DURATION_REQUIRED" | "OPTION_DURATION_NOT_ALLOWED", reason: string) {
    super({ message: reason, code });
    this.name = "OptionDurationError";
  }
}

export class OptionPriceInvalidError extends UnprocessableError {
  constructor() {
    super({ message: "A price must be greater than zero", code: "OPTION_PRICE_INVALID" });
    this.name = "OptionPriceInvalidError";
  }
}

export class OptionOrderInvalidError extends UnprocessableError {
  constructor(reason: string) {
    super({
      message: `The requested option order is not usable: ${reason}`,
      code: "OPTION_ORDER_INVALID",
    });
    this.name = "OptionOrderInvalidError";
  }
}

export class LastOptionError extends ConflictError {
  constructor() {
    super({
      message: "A published service cannot be left with no options",
      code: "OPTION_LAST_ONE",
    });
    this.name = "LastOptionError";
  }
}

export class NotProviderMemberError extends ForbiddenError {
  constructor() {
    super({
      message: "This workspace is not one you belong to",
      code: "NOT_PROVIDER_MEMBER",
    });
    this.name = "NotProviderMemberError";
  }
}

/**
 * Distinct from {@link NotProviderMemberError}: this one is a member — they
 * can create, price and translate services — but publishing, unpublishing
 * and archiving are reserved for the workspace's owner or an admin.
 */
export class NotProviderOwnerOrAdminError extends ForbiddenError {
  constructor() {
    super({
      message: "Only the workspace's owner or an admin can publish, unpublish, or archive a service",
      code: "NOT_PROVIDER_OWNER_OR_ADMIN",
    });
    this.name = "NotProviderOwnerOrAdminError";
  }
}

/**
 * The workspace itself is not live, so nothing it sells can be either.
 *
 * A different refusal from every other one on this path, and the reason it
 * exists: the rest of `canPublish` asks whether the *service* is ready, and
 * this asks whether the *business* is. A workspace still awaiting review, or
 * suspended, is filtered out of the storefront by `conditionsFor`
 * (`service-read.repository.ts`) — `provider.status = 'active'` is in the
 * browse's WHERE and re-checked in `ListServicesProjection`. Without this
 * guard the two halves disagreed silently: the provider dashboard reported a
 * published service and the browse never showed it, with nothing anywhere
 * saying why.
 *
 * `ForbiddenError`, not `UnprocessableError`: nothing about the service is
 * wrong, and there is no field the form could put this under. It is a
 * permission the workspace has not been granted yet.
 */
export class ProviderNotActiveError extends ForbiddenError {
  constructor(public readonly providerId: string) {
    super({
      message:
        "This workspace is not active yet, so its services cannot go live. It appears in the browse once the platform approves it.",
      code: "PROVIDER_NOT_ACTIVE",
    });
    this.name = "ProviderNotActiveError";
  }
}

/**
 * Same `code` as the scheduling BC's own `MemberNotInProviderError` — both
 * name the one thing "this member id is not on this provider's roster"
 * means — but declared separately here rather than imported across bounded
 * contexts: catalog asks this question when deciding who may perform a
 * service, and scheduling asks the identical question when deciding whose
 * calendar an edit targets. Same shape as {@link TimezoneInvalidError} in
 * the provider BC: two contexts independently need the same refusal, so
 * each owns its own class rather than one importing the other's domain
 * layer. Do not "fix" this back into an import.
 */
export class MemberNotInProviderError extends NotFoundError {
  constructor(public readonly memberId: string) {
    super({
      message: `No member with id "${memberId}" in this provider`,
      code: "MEMBER_NOT_IN_PROVIDER",
    });
    this.name = "MemberNotInProviderError";
  }
}
