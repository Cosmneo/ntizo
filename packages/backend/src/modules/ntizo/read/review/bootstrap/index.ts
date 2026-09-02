import { DrizzleReviewRepository } from "../../../bounded-contexts/review/infrastructure/repositories/drizzle/review.repository";
import { ListReviewsForAdminQuery } from "../../../bounded-contexts/review/app/use-cases/list-reviews-for-admin.query";
import type { ReviewReadModule } from "../graphql/handlers/queries.handlers";

/**
 * Its own adapter rather than `bootstrapReview()`'s, matching how every other
 * tier here builds: that bootstrap also constructs the write commands and the
 * outbox, and a read mount has no business owning either.
 */
export function bootstrapReviewRead(): {
  adapters: { reviewRepository: DrizzleReviewRepository };
  useCases: ReviewReadModule;
} {
  const reviewRepository = new DrizzleReviewRepository();
  return {
    adapters: { reviewRepository },
    useCases: { listReviewsForAdmin: new ListReviewsForAdminQuery(reviewRepository) },
  };
}

export type ReviewReadBootstrap = ReturnType<typeof bootstrapReviewRead>;
