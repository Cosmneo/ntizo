import {
  graphqlRoutes,
  type GraphQLHandlerContext,
} from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { SchedulingBootstrap } from "../../../../bounded-contexts/scheduling/bootstrap";
import { schedulingWriteSchema } from "../schema/mutations";

export interface SchedulingWriteModule {
  readonly scheduling: SchedulingBootstrap;
}

/**
 * Refuses an anonymous caller; the workspace-membership question is the
 * command's job, not the edge's, because it is a query and the kit's
 * argsMapper is synchronous.
 *
 * Copied rather than imported from the catalog's handlers file — tiers do
 * not import each other here, and a shared helper is not worth introducing
 * for six lines.
 */
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({ message: "Sign in to manage availability", code: "UNAUTHENTICATED" });
  }
  return requesterUserId;
}

export function createSchedulingWriteHandlers(mod: SchedulingWriteModule) {
  const uc = mod.scheduling.useCases;

  return graphqlRoutes(schedulingWriteSchema)
    .handle("availability.setWeeklyPattern", async (args, ctx) =>
      uc.setWeeklyPattern.execute({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("availability.addException", async (args, ctx) =>
      uc.manageExceptions.add({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("availability.removeException", async (args, ctx) =>
      uc.manageExceptions.remove({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("availability.addClosure", async (args, ctx) =>
      uc.manageClosures.add({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .handle("availability.removeClosure", async (args, ctx) =>
      uc.manageClosures.remove({ requesterUserId: requireUser(ctx), ...args.input }),
    )
    .build();
}
