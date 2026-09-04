import { DrizzleReviewRepository } from "../infrastructure/repositories/drizzle/review.repository";
import { BookingReviewEligibilityAdapter } from "../infrastructure/repositories/drizzle/booking-review-eligibility.adapter";
import { RemoveReviewCommand, SubmitReviewCommand } from "../app/use-cases/submit-review.command";
import { ReadProviderReviewsQuery } from "../app/use-cases/read-provider-reviews.query";
import { ReadFeaturedReviewsQuery } from "../app/use-cases/read-featured-reviews.query";
import { ListReviewsForAdminQuery } from "../app/use-cases/list-reviews-for-admin.query";
import { SetReviewFeaturedCommand } from "../app/use-cases/set-review-featured.command";
import type { CompleteBookingPort } from "../app/ports/outbound/complete-booking.port";
import { DrizzleUnitOfWork } from "../../../../../shared/infrastructure/unit-of-work";
import { OutboxAdapter } from "../../../../../shared/infrastructure/outbox/outbox.adapter";
import { DrizzleOutboxEventRepository } from "../../../../../shared/infrastructure/outbox/drizzle/outbox-event.repository";

export interface ReviewBootstrapDeps {
  /**
   * How a new review closes the job it was written about — the booking
   * context's `CompleteBookingCommand`, mapped at the composition root (see
   * `apps/backend/api/src/booking-completion.adapter.ts`, which is where the
   * `completed_by_review` reason is decided).
   *
   * An adapter rather than the command itself, unlike the way
   * `raiseNotification` is passed into the booking and communication
   * contexts: the two shapes are not the same, and deliberately not — see
   * `CompleteBookingPort`'s own doc comment for what differs and why this
   * side must not be the one to decide it.
   *
   * Required rather than optional, the same call `bootstrapBooking` makes
   * about its own two dependencies and for the same reason: an optional one
   * would let a composition root construct a review context whose reviews
   * silently close nothing, leaving every reviewed booking to sit out its
   * window and be closed hours later by the sweep. That is a bug nobody
   * would see until they went looking at timestamps.
   */
  completeBooking: CompleteBookingPort;
}

export function bootstrapReview(deps: ReviewBootstrapDeps) {
  const reviewRepository = new DrizzleReviewRepository();
  const eligibility = new BookingReviewEligibilityAdapter();
  const unitOfWork = new DrizzleUnitOfWork();
  const outboxPort = new OutboxAdapter(new DrizzleOutboxEventRepository());
  return {
    adapters: { reviewRepository, eligibility, unitOfWork, outboxPort },
    useCases: {
      submitReview: new SubmitReviewCommand(
        reviewRepository,
        eligibility,
        unitOfWork,
        outboxPort,
        deps.completeBooking,
      ),
      removeReview: new RemoveReviewCommand(reviewRepository),
      readProviderReviews: new ReadProviderReviewsQuery(reviewRepository),
      readFeaturedReviews: new ReadFeaturedReviewsQuery(reviewRepository),
      listReviewsForAdmin: new ListReviewsForAdminQuery(reviewRepository),
      setReviewFeatured: new SetReviewFeaturedCommand(reviewRepository),
    },
  };
}

export type ReviewBootstrap = ReturnType<typeof bootstrapReview>;
