import { DrizzleReviewRepository } from "../infrastructure/repositories/drizzle/review.repository";
import { OpenReviewEligibilityAdapter } from "../infrastructure/repositories/drizzle/open-eligibility.adapter";
import { RemoveReviewCommand, SubmitReviewCommand } from "../app/use-cases/submit-review.command";
import { ReadProviderReviewsQuery } from "../app/use-cases/read-provider-reviews.query";

export function bootstrapReview() {
  const reviewRepository = new DrizzleReviewRepository();
  // The one line to change when Booking lands — see the adapter's own comment.
  const eligibility = new OpenReviewEligibilityAdapter();
  return {
    adapters: { reviewRepository, eligibility },
    useCases: {
      submitReview: new SubmitReviewCommand(reviewRepository, eligibility),
      removeReview: new RemoveReviewCommand(reviewRepository),
      readProviderReviews: new ReadProviderReviewsQuery(reviewRepository),
    },
  };
}

export type ReviewBootstrap = ReturnType<typeof bootstrapReview>;
