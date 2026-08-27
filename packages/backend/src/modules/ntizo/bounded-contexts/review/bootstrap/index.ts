import { DrizzleReviewRepository } from "../infrastructure/repositories/drizzle/review.repository";
import { OpenReviewEligibilityAdapter } from "../infrastructure/repositories/drizzle/open-eligibility.adapter";
import { RemoveReviewCommand, SubmitReviewCommand } from "../app/use-cases/submit-review.command";
import { ReadProviderReviewsQuery } from "../app/use-cases/read-provider-reviews.query";
import { DrizzleUnitOfWork } from "../../../../../shared/infrastructure/unit-of-work";
import { OutboxAdapter } from "../../../../../shared/infrastructure/outbox/outbox.adapter";
import { DrizzleOutboxEventRepository } from "../../../../../shared/infrastructure/outbox/drizzle/outbox-event.repository";

export function bootstrapReview() {
  const reviewRepository = new DrizzleReviewRepository();
  // The one line to change when Booking lands — see the adapter's own comment.
  const eligibility = new OpenReviewEligibilityAdapter();
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());
  return {
    adapters: { reviewRepository, eligibility, unitOfWork, outboxPort },
    useCases: {
      submitReview: new SubmitReviewCommand(reviewRepository, eligibility, unitOfWork, outboxPort),
      removeReview: new RemoveReviewCommand(reviewRepository),
      readProviderReviews: new ReadProviderReviewsQuery(reviewRepository),
    },
  };
}

export type ReviewBootstrap = ReturnType<typeof bootstrapReview>;
