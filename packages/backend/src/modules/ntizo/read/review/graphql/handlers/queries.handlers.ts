import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import { reviewReadSchema } from "../schema/queries";
import type { ListReviewsForAdminQuery } from "../../../../bounded-contexts/review/app/use-cases/list-reviews-for-admin.query";

export interface ReviewReadModule {
  readonly listReviewsForAdmin: ListReviewsForAdminQuery;
}

export function createReviewReadHandlers(mod: ReviewReadModule) {
  return graphqlRoutes(reviewReadSchema)
    .handleWithUseCase("review.allForAdmin", {
      // Both the id and the role: the context defaults a caller with no session
      // to `customer`, so a role check alone would be reading a value chosen
      // for the absence of a user rather than asserted about one.
      argsMapper: (args, ctx) => {
        const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
        if (!requesterUserId || role !== "admin") {
          throw new ForbiddenError({
            message: "Only administrators may list every review",
            code: "ADMIN_ONLY",
          });
        }
        return args.input;
      },
      useCase: mod.listReviewsForAdmin,
      responseMapper: (output) => output,
    })
    .build();
}
