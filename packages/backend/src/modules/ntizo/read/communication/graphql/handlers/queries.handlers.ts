import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { CommunicationReadBootstrap } from "../../bootstrap";
import { communicationReadSchema } from "../schema/queries";

export interface CommunicationReadModule {
  readonly communicationRead: CommunicationReadBootstrap;
}

/**
 * Every conversation belongs to somebody, so every field here refuses an
 * anonymous caller before anything else runs. Copied rather than imported
 * from `read/activity`'s or `read/notification`'s equivalent — tiers do not
 * import each other here, and six lines is not worth a shared helper.
 */
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({
      message: "Sign in to see your messages",
      code: "UNAUTHENTICATED",
    });
  }
  return requesterUserId;
}

export function createCommunicationReadHandlers(mod: CommunicationReadModule) {
  const uc = mod.communicationRead.useCases;

  return graphqlRoutes(communicationReadSchema)
    .handle("communication.myThreads", async (args, ctx) =>
      uc.listMyThreads.execute({
        requesterUserId: requireUser(ctx),
        limit: args.input.limit,
        cursor: args.input.cursor,
        type: args.input.type,
      }),
    )
    .handle("communication.providerThreads", async (args, ctx) =>
      uc.listProviderThreads.execute({
        requesterUserId: requireUser(ctx),
        providerId: args.input.providerId,
        limit: args.input.limit,
        cursor: args.input.cursor,
        type: args.input.type,
      }),
    )
    .handle("communication.threadMessages", async (args, ctx) =>
      uc.listThreadMessages.execute({
        requesterUserId: requireUser(ctx),
        threadId: args.input.threadId,
        limit: args.input.limit,
        cursor: args.input.cursor,
      }),
    )
    .build();
}
