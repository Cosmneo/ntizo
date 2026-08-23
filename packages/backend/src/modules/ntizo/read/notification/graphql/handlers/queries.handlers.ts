import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { NotificationReadBootstrap } from "../../bootstrap";
import { notificationReadSchema } from "../schema/queries";

export interface NotificationReadModule {
  readonly notificationRead: NotificationReadBootstrap;
}

/**
 * Both inboxes are somebody's, so every field here refuses an anonymous caller
 * before anything else runs. Copied rather than imported from the scheduling
 * read tier — tiers do not import each other here, and six lines is not worth a
 * shared helper.
 */
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({
      message: "Sign in to see your notifications",
      code: "UNAUTHENTICATED",
    });
  }
  return requesterUserId;
}

export function createNotificationReadHandlers(mod: NotificationReadModule) {
  const uc = mod.notificationRead.useCases;

  return graphqlRoutes(notificationReadSchema)
    .handle("notification.mine", async (args, ctx) =>
      uc.listMine.execute({
        requesterUserId: requireUser(ctx),
        limit: args.input.limit,
        offset: args.input.offset,
      }),
    )
    .handle("notification.mineUnreadCount", async (_args, ctx) =>
      uc.countUnread.forUser(requireUser(ctx)),
    )
    .handle("notification.forProvider", async (args, ctx) =>
      uc.listForProvider.execute({
        requesterUserId: requireUser(ctx),
        providerId: args.input.providerId,
        limit: args.input.limit,
        offset: args.input.offset,
      }),
    )
    .handle("notification.providerUnreadCount", async (args, ctx) =>
      uc.countUnread.forProvider(requireUser(ctx), args.input.providerId),
    )
    .build();
}
