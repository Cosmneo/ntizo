import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminReviewQueries,
  setReviewFeatured,
  type AdminReviewSearch,
} from "../data/admin-review.repository";

export function useAdminReviews(search: AdminReviewSearch) {
  return useQuery(adminReviewQueries.all(search));
}

/**
 * Features a review on the home page, or takes it off.
 *
 * Not optimistic, unlike the category reorder. Two reasons, and the first is
 * the important one: the server refuses a fifth featured review, so an
 * optimistic toggle would show the switch flipping and then flip it back —
 * which reads as the control being broken rather than as the cap being
 * explained. The second is that `featuredCount` is on the same payload, so a
 * hand-rolled optimistic update would have to keep that in step too.
 *
 * Both the admin list and the home page's own query are invalidated: an
 * administrator who features something and then opens the site in the next tab
 * should see it there.
 */
export function useSetReviewFeatured() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, featured }: { reviewId: string; featured: boolean }) =>
      setReviewFeatured(reviewId, featured),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "reviews"] });
      qc.invalidateQueries({ queryKey: ["public", "reviews", "featured"] });
    },
  });
}
