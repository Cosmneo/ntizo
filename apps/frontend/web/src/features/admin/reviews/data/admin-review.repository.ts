import { queryOptions } from "@tanstack/react-query";
import type { ReviewAdminPageDTO } from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

const ALL = `
  query ReviewAllForAdmin($input: ReviewAllForAdminInput!) {
    reviewAllForAdmin(input: $input) {
      items {
        id providerId providerName providerSlug
        rating comment authorName status featuredAt createdAt
      }
      total
      featuredCount
    }
  }`;

const SET_FEATURED = `
  mutation ReviewSetFeatured($input: ReviewSetFeaturedInput!) {
    reviewSetFeatured(input: $input) { featured }
  }`;

/** How many rows one page of the administration list holds. */
export const ADMIN_REVIEW_PAGE_SIZE = 25;

export interface AdminReviewSearch {
  offset?: number;
  featuredOnly?: boolean;
  search?: string;
}

export const adminReviewQueries = {
  /**
   * One page of reviews.
   *
   * The whole search is the key, not just the offset: "featured only" is a
   * different result set, and sharing a key would serve one under the other.
   */
  all: (search: AdminReviewSearch) =>
    queryOptions({
      queryKey: ["admin", "reviews", search] as const,
      queryFn: async (): Promise<ReviewAdminPageDTO> => {
        const d = await sessionGraphql<{ reviewAllForAdmin: ReviewAdminPageDTO }>(ALL, {
          input: {
            limit: ADMIN_REVIEW_PAGE_SIZE,
            offset: search.offset ?? 0,
            ...(search.featuredOnly ? { featuredOnly: true } : {}),
            ...(search.search ? { search: search.search } : {}),
          },
        });
        return d.reviewAllForAdmin;
      },
    }),
};

export async function setReviewFeatured(reviewId: string, featured: boolean): Promise<void> {
  await sessionGraphql(SET_FEATURED, { input: { reviewId, featured } });
}
