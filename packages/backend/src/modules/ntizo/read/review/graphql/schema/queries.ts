import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { reviewAdminPageReadModel } from "@ntizo/shared/read-models";
import { MAX_ADMIN_LIMIT } from "../../../../bounded-contexts/review/app/use-cases/list-reviews-for-admin.query";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * Every review on the platform, for the screen that picks which reach the home
 * page. Guarded by the handler, which refuses anyone who is not an admin.
 *
 * Deliberately separate from `review.byProvider` on the public tier rather than
 * a wider mode of it. That one is anonymous and must only ever return published
 * reviews of one business; this one crosses providers and includes hidden rows,
 * and the two must not be one field with a flag that decides which.
 */
export const listReviewsForAdmin = defineQuery({
  input: zodSchema(
    z.object({
      // Optional, not `.default()` — a zod default does not survive into the
      // emitted schema, so the field would still be `Int!` for every caller.
      limit: z.number().int().min(1).max(MAX_ADMIN_LIMIT).optional(),
      offset: z.number().int().min(0).optional(),
      /** Narrows to what the home page is currently showing. */
      featuredOnly: z.boolean().optional(),
      // Bounded, like every other free-text filter here: the string ends up in
      // a LIKE pattern.
      search: z.string().trim().max(120).optional(),
    }),
  ),
  output: zodSchema(reviewAdminPageReadModel),
  docs: { summary: "Every review, for administration", tags: ["Admin", "Review"] },
});

export const reviewReadSchema = defineGraphQLSchema(
  { review: { allForAdmin: listReviewsForAdmin } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
