import { DrizzleReviewRepository } from "../../bounded-contexts/review/infrastructure/repositories/drizzle/review.repository";
import { ReadProviderReviewsQuery } from "../../bounded-contexts/review/app/use-cases/read-provider-reviews.query";
import { ReadFeaturedReviewsQuery } from "../../bounded-contexts/review/app/use-cases/read-featured-reviews.query";
import type { ReviewPublicModule } from "./graphql/handlers/queries.handlers";

/**
 * The one adapter this tier uses, built here rather than reached for through
 * `bootstrapReview()` — that bootstrap also constructs the session-authed
 * commands, and the anonymous mount has no business owning them. The same
 * reasoning, and the same shape, as `bootstrapSchedulingPublic`.
 */
export function bootstrapReviewPublic(): {
  adapters: { reviewRepository: DrizzleReviewRepository };
  useCases: ReviewPublicModule;
} {
  const reviewRepository = new DrizzleReviewRepository();
  return {
    adapters: { reviewRepository },
    useCases: {
      readProviderReviews: new ReadProviderReviewsQuery(reviewRepository),
      readFeaturedReviews: new ReadFeaturedReviewsQuery(reviewRepository),
    },
  };
}

export type ReviewPublicBootstrap = ReturnType<typeof bootstrapReviewPublic>;
