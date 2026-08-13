import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * One mutation for both leaving and changing a verdict.
 *
 * A separate `updateReview` would make every client ask "have I reviewed this
 * before?" to know which to call, and get it wrong under a race. The database's
 * one-per-author uniqueness is what makes the single entry point correct; see
 * `SubmitReviewCommand`.
 *
 * The bounds here mirror the aggregate's rather than replacing them: this is
 * the edge refusing obvious nonsense cheaply, and `Review.create` is where the
 * rule is *defined*. A rating of 4.5 is refused twice, in both places, on
 * purpose.
 */
export const submitReview = defineMutation({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      rating: z.number().int().min(1).max(5),
      // Nullable, not merely optional: a score with no words is a complete
      // review, and only `null` can say "I chose to write nothing".
      comment: z.string().trim().max(1000).nullable(),
    }),
  ),
  output: zodSchema(z.object({ reviewId: z.string().min(1) })),
  docs: { summary: "Leave or change your review of a business", tags: ["Review"] },
});

export const removeReview = defineMutation({
  input: zodSchema(z.object({ providerId: z.string().min(1) })),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Take your own review back", tags: ["Review"] },
});

export const reviewWriteSchema = defineGraphQLSchema(
  { review: { submit: submitReview, remove: removeReview } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
