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

/**
 * Both the id and the role: the context defaults a caller with no session
 * to `customer`, so a role check alone would read a value chosen for the
 * absence of a user rather than asserted about one. Copied, not shared —
 * the same six lines `read/support` and `read/booking` carry.
 */
function requireAdmin(ctx: GraphQLHandlerContext): void {
  const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId || role !== "admin") {
    throw new ForbiddenError({
      message: "Only administrators may read the platform's activity",
      code: "ADMIN_ONLY",
    });
  }
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
    .handle("activity.all", async (args, ctx) => {
      // First line, deliberately: the read below spans every account, so
      // nothing may run before the caller is known to be an administrator.
      requireAdmin(ctx);
      return uc.listAll.execute({
        limit: args.input.limit,
        cursor: args.input.cursor,
        type: args.input.type,
        search: args.input.search,
      });
    })
    .build();
}
