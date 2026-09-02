import { queryOptions } from "@tanstack/react-query";
import type { FeaturedReviewDTO } from "@ntizo/shared/read-models";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";

const FEATURED = `
  query LandingFeaturedReviews($input: ReviewFeaturedInput!) {
    reviewFeatured(input: $input) {
      id rating comment authorName createdAt providerName providerSlug
    }
  }`;

export const landingReviewQueries = {
  /**
   * The reviews an administrator chose to put on the home page.
   *
   * No locale in the key, unlike the categories and the providers: a review is
   * what one customer wrote, in the language they wrote it. Nothing here is
   * translated and nothing should be — a testimonial rendered into another
   * language is no longer a quotation.
   */
  featured: (limit: number) =>
    queryOptions({
      queryKey: ["public", "reviews", "featured", limit] as const,
      queryFn: async (): Promise<FeaturedReviewDTO[]> => {
        const d = await publicGraphql<{ reviewFeatured: FeaturedReviewDTO[] }>(FEATURED, {
          input: { limit },
        });
        return d.reviewFeatured;
      },
    }),
};
