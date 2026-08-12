import {
  graphqlRoutes,
  type GraphQLHandlerContext,
} from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { SchedulingBootstrap } from "../../../../bounded-contexts/scheduling/bootstrap";
import { availabilityReadSchema } from "../schema/queries";

export interface SchedulingReadModule {
  readonly scheduling: SchedulingBootstrap;
}

/**
 * Refuses an anonymous caller; the workspace-membership question stays in
 * `ReadAvailabilityConfigQuery` itself (it throws `NotProviderMemberError`
 * for a provider the requester does not belong to), because it is a query
 * and the kit's argsMapper is synchronous. Copied rather than imported from
 * the write tier's handlers file — tiers do not import each other here, and
 * a shared helper is not worth introducing for six lines.
 */
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({ message: "Sign in to see availability", code: "UNAUTHENTICATED" });
  }
  return requesterUserId;
}

export function createSchedulingReadHandlers(mod: SchedulingReadModule) {
  const uc = mod.scheduling.useCases;

  return graphqlRoutes(availabilityReadSchema)
    .handle("availability.config", async (args, ctx) =>
      uc.readAvailabilityConfig.execute({
        requesterUserId: requireUser(ctx),
        providerId: args.input.providerId,
      }),
    )
    .build();
}
