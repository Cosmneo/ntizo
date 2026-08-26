import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { ActivityReadBootstrap } from "../../bootstrap";
import { activityReadSchema } from "../schema/queries";

export interface ActivityReadModule {
  readonly activityRead: ActivityReadBootstrap;
}

/**
 * Somebody's own history, so the field refuses an anonymous caller before
 * anything else runs. Copied rather than imported from
 * `read/notification`'s equivalent — tiers do not import each other here,
 * and six lines is not worth a shared helper.
 */
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({
      message: "Sign in to see your activity",
      code: "UNAUTHENTICATED",
    });
  }
  return requesterUserId;
}

export function createActivityReadHandlers(mod: ActivityReadModule) {
  const uc = mod.activityRead.useCases;

  return graphqlRoutes(activityReadSchema)
    .handle("activity.mine", async (args, ctx) =>
      uc.listMine.execute({
        requesterUserId: requireUser(ctx),
        limit: args.input.limit,
        cursor: args.input.cursor,
      }),
    )
    .build();
}
