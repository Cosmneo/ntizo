import { useQuery } from "@tanstack/react-query";
import { landingReviewQueries } from "../data/review.repository";

/** The real reviews an administrator put on the home page. */
export function useFeaturedReviews(limit: number) {
  return useQuery(landingReviewQueries.featured(limit));
}
