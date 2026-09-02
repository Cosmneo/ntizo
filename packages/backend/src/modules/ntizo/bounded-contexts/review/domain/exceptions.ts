import { ForbiddenError, NotFoundError, UnprocessableError } from "@cosmneo/onion-lasagna";

/**
 * The review context's refusals.
 *
 * Each extends a kit error type so `getGraphQLErrorCode` recognises it and the
 * GraphQL layer stops masking it to INTERNAL_ERROR — the same reason the
 * scheduling context's own exceptions do, and the same trap: subclassing plain
 * `Error` with a `code` compiles, reads correctly, and reaches the browser as
 * "An unexpected error occurred".
 *
 * The `code` strings are a PUBLIC CONTRACT: the frontend branches on them to
 * decide what to say and where. Renaming one breaks that.
 */

export class RatingOutOfRangeError extends UnprocessableError {
  constructor(public readonly rating: number) {
    super({
      message: `A rating must be a whole number from 1 to 5 — got ${rating}`,
      code: "RATING_OUT_OF_RANGE",
    });
    this.name = "RatingOutOfRangeError";
  }
}

export class ReviewCommentTooLongError extends UnprocessableError {
  constructor(public readonly length: number) {
    super({
      message: `A review can be at most 1000 characters — got ${length}`,
      code: "REVIEW_COMMENT_TOO_LONG",
    });
    this.name = "ReviewCommentTooLongError";
  }
}

export class ReviewNotFoundError extends NotFoundError {
  constructor() {
    super({ message: "You have not reviewed this business", code: "REVIEW_NOT_FOUND" });
    this.name = "ReviewNotFoundError";
  }
}

/**
 * Refused because the review an administrator tried to feature is not there.
 *
 * Its own error rather than reusing `ReviewNotFoundError`, whose message —
 * "You have not reviewed this business" — is addressed to a customer about
 * their own review and would be nonsense on an administration screen.
 */
export class ReviewToFeatureNotFoundError extends NotFoundError {
  constructor(public readonly reviewId: string) {
    super({
      message: `No review with id "${reviewId}"`,
      code: "REVIEW_TO_FEATURE_NOT_FOUND",
    });
    this.name = "ReviewToFeatureNotFoundError";
  }
}

/**
 * Refused because the home page is full.
 *
 * The rail draws four. Without this, an administrator can mark forty reviews
 * and the four that actually appear are decided by a timestamp they cannot
 * see — which looks, from the screen, like the toggle not working. Better to
 * say the shelf is full and let them take something off it.
 */
export class TooManyFeaturedReviewsError extends UnprocessableError {
  constructor(public readonly max: number) {
    super({
      message: `Only ${max} reviews can be shown on the home page at once — unfeature one first`,
      code: "TOO_MANY_FEATURED_REVIEWS",
    });
    this.name = "TooManyFeaturedReviewsError";
  }
}

export class ProviderNotReviewableError extends NotFoundError {
  constructor(public readonly providerId: string) {
    super({
      message: `No business with id "${providerId}" is open for reviews`,
      code: "PROVIDER_NOT_REVIEWABLE",
    });
    this.name = "ProviderNotReviewableError";
  }
}

/**
 * Refused because the reviewer works there.
 *
 * The cheapest way to fake a five-star average is to award it to yourself, and
 * on a marketplace where a member can also hold a customer account nothing else
 * stops it. Checked against `provider_member`, so it covers the owner, the
 * admins and the staff alike.
 */
export class CannotReviewOwnBusinessError extends ForbiddenError {
  constructor() {
    super({
      message: "You cannot review a business you work for",
      code: "CANNOT_REVIEW_OWN_BUSINESS",
    });
    this.name = "CannotReviewOwnBusinessError";
  }
}

/**
 * Refused because this person has not been served yet.
 *
 * Thrown by `SubmitReviewCommand` when whatever `ReviewEligibilityPort` is
 * bound at bootstrap answers `allowed: false` — today,
 * `BookingReviewEligibilityAdapter` refusing a first-time reviewer with no
 * `COMPLETED` booking against this provider. The branch existed on the command
 * before the check did, so turning the rule on was an adapter swap rather than
 * a change to the use case.
 */
export class ReviewNotEarnedError extends ForbiddenError {
  constructor() {
    super({
      message: "Only a customer who has completed a booking can review this business",
      code: "REVIEW_NOT_EARNED",
    });
    this.name = "ReviewNotEarnedError";
  }
}
