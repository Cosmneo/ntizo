import type {
  ReviewRepositoryPort,
  ReviewRow,
  ReviewSummary,
} from "../ports/outbound/review.repository.port";

export interface ProviderReviewsDTO {
  readonly summary: ReviewSummary;
  /**
   * Mutable, not `readonly`. The GraphQL layer validates this against
   * `providerReviewsReadModel`, whose zod-inferred array type is mutable, and a
   * `readonly` array is not assignable to one — the response mapper would have
   * to copy the array purely to satisfy a modifier nothing here relies on.
   */
  readonly reviews: ReviewRow[];
}

/** The most a caller can pull in one page, however large a number they send. */
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

/**
 * A business's published reviews, and what they add up to.
 *
 * Summary and page in one answer because a page of reviews without its average
 * is a list nobody can weigh — ten one-star reviews mean something very
 * different under a 4.8 than under a 1.2 — and fetching them separately means
 * the two can disagree by a write that landed between the round trips.
 *
 * The summary is over *every* published review, not over the page: an average
 * of the ten reviews currently on screen is a different number that looks like
 * the same one.
 *
 * Anonymous-readable, so nothing here takes a requester. Hidden reviews are
 * excluded by the repository rather than filtered here, so a caller cannot
 * page past the exclusion.
 */
export class ReadProviderReviewsQuery {
  constructor(private readonly repo: ReviewRepositoryPort) {}

  async execute(input: {
    providerId: string;
    limit?: number;
    offset?: number;
  }): Promise<ProviderReviewsDTO> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(input.offset ?? 0, 0);

    const [summary, reviews] = await Promise.all([
      this.repo.summary(input.providerId),
      this.repo.listPublished(input.providerId, limit, offset),
    ]);

    return { summary, reviews };
  }
}
