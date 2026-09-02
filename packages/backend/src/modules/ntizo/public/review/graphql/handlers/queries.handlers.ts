import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { reviewPublicSchema } from "../schema/queries";
import type { ReadProviderReviewsQuery } from "../../../../bounded-contexts/review/app/use-cases/read-provider-reviews.query";
import type { ReadFeaturedReviewsQuery } from "../../../../bounded-contexts/review/app/use-cases/read-featured-reviews.query";

export interface ReviewPublicModule {
  readonly readProviderReviews: ReadProviderReviewsQuery;
  readonly readFeaturedReviews: ReadFeaturedReviewsQuery;
}

/**
 * No `requireUser`, which is the whole point of this tier: the query takes no
 * requester, the mount supplies an empty context, and there is nothing to
 * check. Hidden reviews are excluded by the repository rather than by anything
 * here, so a caller cannot page past the exclusion.
 */
export function createReviewPublicHandlers(mod: ReviewPublicModule) {
  return graphqlRoutes(reviewPublicSchema)
    .handleWithUseCase("review.byProvider", {
      argsMapper: (args) => args.input,
      useCase: mod.readProviderReviews,
      responseMapper: (output) => output,
    })
    .handleWithUseCase("review.featured", {
      argsMapper: (args) => args.input,
      useCase: mod.readFeaturedReviews,
      responseMapper: (output) => output,
    })
    .build();
}
