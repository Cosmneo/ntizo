import { BaseDomainEvent } from "@cosmneo/onion-lasagna";

/**
 * Somebody reviewed a provider.
 *
 * The Review context's first domain event — it had no event-recording
 * machinery at all, which is why a customer's history had nothing in it but a
 * registration. There are 41 reviews in the dev database and, before this,
 * not one event for any of them.
 *
 * Raised only for a genuinely new review, matching its name: editing an
 * existing one goes through `Review.revise()` and does not raise this again
 * — the row it changes already told its own "you reviewed X" story once, and
 * a fresh event on every edit would repeat it rather than correct it.
 *
 * It carries the provider's name because the activity row that reacts to it
 * says "You reviewed X". A handler that looked the name up later would tie a
 * history entry written once to a provider that can be renamed afterwards,
 * and the entry would then quietly change what it said about the past.
 *
 * Unlike every other event in this outbox, `SubmitReviewCommand` constructs
 * this directly rather than pulling it off the aggregate's own event list —
 * `Review` has none. It cannot: `review.id` is assigned by Postgres'
 * `defaultRandom()` and is only known once `upsert` returns, so the
 * aggregate is never in a position to raise an event carrying an id it does
 * not yet have.
 */
export class ReviewCreated extends BaseDomainEvent<{
  reviewId: string;
  providerId: string;
  providerName: string;
  rating: number;
  actorUserId: string;
}> {
  constructor(payload: {
    reviewId: string;
    providerId: string;
    providerName: string;
    rating: number;
    actorUserId: string;
  }) {
    super("review.created", payload.reviewId, payload);
  }
}
