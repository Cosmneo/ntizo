import {
  graphqlRoutes,
  type GraphQLHandlerContext,
} from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { ReviewBootstrap } from "../../../../bounded-contexts/review/bootstrap";
import { reviewWriteSchema } from "../schema/mutations";

export interface ReviewWriteModule {
  readonly review: ReviewBootstrap;
}

/**
 * Refuses an anonymous caller. Everything else — the business must exist and be
 * trading, you cannot review where you work, a first review must be earned — is
 * the command's job, because each is a query and the kit's argsMapper is
 * synchronous.
 *
 * Copied rather than imported from the scheduling handlers: tiers do not import
 * each other here, and a shared helper is not worth introducing for six lines.
 */
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({ message: "Sign in to leave a review", code: "UNAUTHENTICATED" });
  }
  return requesterUserId;
}

export function createReviewWriteHandlers(mod: ReviewWriteModule) {
  const uc = mod.review.useCases;

  return graphqlRoutes(reviewWriteSchema)
    .handle("review.submit", async (args, ctx) =>
      uc.submitReview.execute({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("review.remove", async (args, ctx) =>
      uc.removeReview.execute({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .build();
}
