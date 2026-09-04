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
import type { CompleteBookingPort } from "../ports/outbound/complete-booking.port";
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
 *
 * **A new review also closes the booking it is about.** The eligibility rule
 * now accepts a `MARKED_DONE` booking — the provider's claim that the job is
 * done, sitting inside the customer's three-day dispute window — and writing
 * a review is that customer answering the claim. See the tail of `execute`
 * for why that hop happens after the transaction and why it cannot fail the
 * review.
 */
export class SubmitReviewCommand {
  constructor(
    private readonly repo: ReviewRepositoryPort,
    private readonly eligibility: ReviewEligibilityPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    /**
     * Last, the position the notification port holds in every booking command
     * for the same reason: it is the dependency that acts once the write is
     * already safe, and reading the argument list top-to-bottom should read
     * in that order.
     */
    private readonly completeBooking: CompleteBookingPort,
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

    // The whole `UpsertedReview`, not just its id: what happens after this
    // transaction depends on `inserted` as much as the publish inside it
    // does.
    const written = await this.unitOfWork.atomicExecute(async () => {
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

    // The customer's review IS the validation the window was waiting for, so
    // a new review closes the booking it is about instead of leaving the
    // customer a second button to press for something they have just
    // answered.
    //
    // **After the transaction, never inside it.** This is a write in another
    // bounded context; making it from inside this one's transaction would
    // hold that transaction open across a foreign call and let a rollback
    // here take back a closure the other side has already announced. Same
    // discipline every booking command keeps for its own notifications
    // (BR-P6).
    //
    // **`written.inserted`, not `existing === null`.** Postgres' own xmax is
    // the only thing that knows whether THIS call wrote a new review; the
    // read above ran before the transaction and two racing submissions can
    // both have seen "nothing here". Only the one that actually inserted
    // should close anything — the same rule the `ReviewCreated` publish
    // follows, and here it also means a revision closes nothing, which is
    // right: changing one's mind is not new evidence that the job happened.
    //
    // **`bookingId` may legitimately be null.** A verdict that allows a
    // review without naming a booking — what the old open adapter answered,
    // and what any future adapter saying yes on some other ground would
    // answer — has no job to close.
    //
    // **Quietly, and this is the deliberate part.** A review that was
    // written, saved, and then thrown away because a booking write raced is
    // strictly worse than a booking that stays open until the sweep closes it
    // hours later: the review is the customer's own words and there is no
    // second copy, while the booking has a timer behind it that produces the
    // same ending anyway. The realistic failure is not even a bug — the
    // sweep's window arm closing this booking a second earlier makes
    // `Booking.complete` refuse from `COMPLETED`, which is the correct
    // outcome arriving by the other door. Logged with the booking id, because
    // the only thing that makes swallowing acceptable is that a window left
    // open can be found afterwards.
    if (written.inserted && bookingId) {
      try {
        await this.completeBooking.execute({
          bookingId,
          requesterUserId: input.requesterUserId,
        });
      } catch (error) {
        console.error(`[review] booking ${bookingId} not completed by its review`, error);
      }
    }

    return { reviewId: written.id };
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
