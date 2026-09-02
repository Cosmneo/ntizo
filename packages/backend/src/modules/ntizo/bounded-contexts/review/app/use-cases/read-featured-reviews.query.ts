import type {
  FeaturedReviewRow,
  ReviewRepositoryPort,
} from "../ports/outbound/review.repository.port";

/**
 * The most the home page will ever draw.
 *
 * Four, because that is the rail. A cap here as well as in the caller's input
 * so that a client asking for two hundred testimonials gets four — this is an
 * anonymous endpoint, and "how many" is a number a stranger sends.
 */
export const MAX_FEATURED = 4;

/**
 * The reviews an administrator chose to put on the home page.
 *
 * Anonymous-readable, so nothing here takes a requester — the same posture as
 * `ReadProviderReviewsQuery`, and for the same reason: this is content a
 * crawler must be able to fetch.
 *
 * Deliberately not "the best reviews": nothing here sorts by rating or picks
 * on the platform's behalf. A home page testimonial is an editorial decision
 * about a named business, and the platform choosing them automatically is how
 * a five-star review with one word in it ends up as the first thing a visitor
 * reads. The order is the order an administrator featured them in.
 *
 * Returns an empty array where nobody has featured anything, and the section
 * that reads it is expected to disappear rather than render a heading over
 * nothing.
 */
export class ReadFeaturedReviewsQuery {
  constructor(private readonly repo: ReviewRepositoryPort) {}

  async execute(input: { limit?: number } = {}): Promise<FeaturedReviewRow[]> {
    const limit = Math.min(Math.max(input.limit ?? MAX_FEATURED, 1), MAX_FEATURED);
    return this.repo.listFeatured(limit);
  }
}
