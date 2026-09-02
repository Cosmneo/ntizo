import type { ReviewRepositoryPort } from "../ports/outbound/review.repository.port";
import {
  ReviewToFeatureNotFoundError,
  TooManyFeaturedReviewsError,
} from "../../domain/exceptions";
import { MAX_FEATURED } from "./read-featured-reviews.query";

/**
 * Puts one review on the home page, or takes it off.
 *
 * Authorisation is the edge's job — the GraphQL handler refuses anyone who is
 * not an administrator before this runs — which is the same split every other
 * admin command in this codebase uses.
 *
 * **The cap is checked here, not in the database.** A partial unique index
 * cannot express "at most four rows", and a CHECK cannot count siblings, so
 * the rule has to live somewhere that can. Two administrators featuring a
 * fifth review at the same moment can both pass this read and both write —
 * the outcome is five marked rows, of which the home page draws four, which
 * is the same thing that happens without the check at all. It is a guard
 * against the ordinary mistake, not a serialisable invariant, and worth being
 * honest about rather than dressing up.
 *
 * Unfeaturing is never capped: taking something off a full shelf is exactly
 * what somebody who hit the cap needs to do next.
 */
export class SetReviewFeaturedCommand {
  constructor(private readonly repo: ReviewRepositoryPort) {}

  async execute(input: { reviewId: string; featured: boolean }): Promise<{ featured: boolean }> {
    if (input.featured) {
      const { featuredCount } = await this.repo.listForAdmin({
        limit: 1,
        offset: 0,
        featuredOnly: true,
      });
      // `>=`, not `>`. At exactly four the shelf is already full, and the
      // request under consideration would be the fifth.
      if (featuredCount >= MAX_FEATURED) throw new TooManyFeaturedReviewsError(MAX_FEATURED);
    }

    const changed = await this.repo.setFeatured(input.reviewId, input.featured);
    if (!changed) throw new ReviewToFeatureNotFoundError(input.reviewId);

    return { featured: input.featured };
  }
}
