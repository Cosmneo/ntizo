import {
  ConflictError,
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
