import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { Review } from "../../domain/aggregates/review.aggregate";
import { ReviewCreated } from "../../domain/events";
import {
  CannotReviewOwnBusinessError,
  ProviderNotReviewableError,
  ReviewNotEarnedError,
  ReviewNotFoundError,
} from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { ReviewEligibilityPort } from "../ports/outbound/review-eligibility.port";
import type { ReviewRepositoryPort } from "../ports/outbound/review.repository.port";

/**
 * Leaving, or changing, one's verdict on a business.
 *
 * One entry point for both, because to the person doing it there is only one
 * action — "this is what I think" — and a separate `update` would make the
 * client decide which to call by first asking whether they had reviewed before.
 * The database's `review_one_per_author_per_provider` is what makes that safe
 * under two concurrent submissions; this command is what makes it *legible*.
 *
 * The order of the refusals is deliberate: existence first, so a caller
 * probing ids learns nothing about who works where; then the own-business rule,
 * which is the one that actually protects the average; then eligibility —
 * whether this caller has a `COMPLETED` booking with this provider, answered
 * by whatever `ReviewEligibilityPort` is bound at bootstrap
 * (`BookingReviewEligibilityAdapter`). Validation of the score itself lives in
 * the aggregate, and runs last because it is the only one whose message is
 * about what the caller typed rather than about who they are.
 */
export class SubmitReviewCommand {
  constructor(
    private readonly repo: ReviewRepositoryPort,
    private readonly eligibility: ReviewEligibilityPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(input: {
    requesterUserId: string;
    providerId: string;
    rating: number;
    comment: string | null;
  }): Promise<{ reviewId: string }> {
    const reviewableProvider = await this.repo.isReviewableProvider(input.providerId);
    if (!reviewableProvider) {
      throw new ProviderNotReviewableError(input.providerId);
    }
    if (await this.repo.worksAtProvider(input.providerId, input.requesterUserId)) {
      throw new CannotReviewOwnBusinessError();
    }

    const existing = await this.repo.findByAuthor(input.providerId, input.requesterUserId);

    // Only a first review has to be earned. Someone who already reviewed keeps
    // the right to correct what they said — taking it away would freeze a bad
    // score in place the day the eligibility rule changes under them.
    let bookingId: string | null = existing?.bookingId ?? null;
    if (!existing) {
      const verdict = await this.eligibility.check(input.providerId, input.requesterUserId);
      if (!verdict.allowed) throw new ReviewNotEarnedError();
      bookingId = verdict.bookingId;
    }

    const review = existing
      ? existing.revise({ rating: input.rating, comment: input.comment })
      : Review.create({
          providerId: input.providerId,
          authorUserId: input.requesterUserId,
          bookingId,
          rating: input.rating,
          comment: input.comment,
        });

    const { id: reviewId } = await this.unitOfWork.atomicExecute(async () => {
      const upserted = await this.repo.upsert(review);

      // Whether this publishes ReviewCreated is decided by what THIS write
      // did (`upserted.inserted`, Postgres' own xmax), not by whether
      // `existing` was found — that read ran outside this transaction, and
      // `review.repository.ts`'s own docblock already names the race a
      // read-then-branch would reopen: two submissions can both read
      // "nothing here" and both take this path, but only the one that
      // actually inserted should announce a review that did not exist
      // before. Returning `upserted` from this callback, rather than
      // assigning to a `let` above it, is what makes "publish only after the
      // write resolved" a type error to get backwards, not just a comment.
      if (upserted.inserted) {
        await this.outboxPort.publish(
          [
            new ReviewCreated({
              reviewId: upserted.id,
              providerId: input.providerId,
              providerName: reviewableProvider.name,
              rating: input.rating,
              actorUserId: input.requesterUserId,
            }),
          ],
          "review",
        );
      }

      return upserted;
    });

    return { reviewId };
  }
}

/**
 * Taking one's own review back.
 *
 * A delete, not a hide: `hidden` is what an administrator does to a review that
 * breaks the rules, and it stays in the table because a moderation decision has
 * to be auditable. An author withdrawing their own words is not moderation, and
 * leaving the row behind would mean "delete" did not.
 */
export class RemoveReviewCommand {
  constructor(private readonly repo: ReviewRepositoryPort) {}

  async execute(input: { requesterUserId: string; providerId: string }): Promise<{ ok: true }> {
    // Reported rather than silently confirmed, the same rule `ManageClosures`
    // follows: a click that removes nothing must not read as "worked".
    const deleted = await this.repo.removeOwn(input.providerId, input.requesterUserId);
    if (!deleted) throw new ReviewNotFoundError();
    return { ok: true };
  }
}
