import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { featuredReviewReadModel, providerReviewsReadModel } from "@ntizo/shared/read-models";
import { MAX_FEATURED } from "../../../../bounded-contexts/review/app/use-cases/read-featured-reviews.query";

/**
 * PUBLIC (anonymous) review surface. Queries only.
 *
 * No context schema, for the same reason the public provider slice has none:
 * these handlers take no requester, and importing the private context type
 * would be the first step toward quietly reintroducing one. Writing a review
 * needs a session and therefore lives in `write/review`, not here.
 */
export const listProviderReviews = defineQuery({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      // Optional, not `.default()`. A zod default does not survive into
      // GraphQL — the field still emits as `Int!` and every caller has to send
      // it, which is exactly what happened here before this comment existed.
      // The real default and the clamp both live in the query.
      limit: z.number().int().min(1).max(50).optional(),
      offset: z.number().int().min(0).optional(),
    }),
  ),
  output: zodSchema(providerReviewsReadModel),
  docs: { summary: "A business's published reviews, and their summary", tags: ["Public"] },
});

/**
 * The reviews an administrator put on the home page.
 *
 * No provider argument, unlike every other read in this slice: the home page
 * is not about one business, and the selection is the platform's editorial
 * choice rather than a filter a caller applies. Nothing here lets a caller ask
 * for *un*featured reviews across providers — that list is the administration
 * screen's, and it needs a session.
 */
export const listFeaturedReviews = defineQuery({
  input: zodSchema(
    z.object({
      // Optional rather than `.default()`: a zod default does not survive into
      // the GraphQL schema — the field still emits as `Int!` and every caller
      // has to send it. The real default and the clamp live in the query.
      limit: z.number().int().min(1).max(MAX_FEATURED).optional(),
    }),
  ),
  output: zodSchema(z.array(featuredReviewReadModel)),
  docs: { summary: "Reviews featured on the home page", tags: ["Public"] },
});

export const reviewPublicSchema = defineGraphQLSchema({
  review: { byProvider: listProviderReviews, featured: listFeaturedReviews },
});
