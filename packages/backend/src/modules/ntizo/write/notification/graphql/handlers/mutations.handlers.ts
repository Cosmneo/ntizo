import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { NotificationBootstrap } from "../../../../bounded-contexts/notification/bootstrap";
import { notificationWriteSchema } from "../schema/mutations";

export interface NotificationWriteModule {
  readonly notification: NotificationBootstrap;
}

function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({ message: "Sign in first", code: "UNAUTHENTICATED" });
  }
  return requesterUserId;
}

/**
 * `markRead` and `markProviderRead` call the same command.
 *
 * Not an oversight: entitlement for a single item is resolved inside the
 * repository's statement, which accepts both a personally-addressed item and
 * one belonging to a workspace the caller is a member of. The two fields exist
 * because the *client* knows which inbox it is in and the audit should say so,
 * not because the server needs to be told.
 */
export function createNotificationWriteHandlers(mod: NotificationWriteModule) {
  const uc = mod.notification.useCases;

  return graphqlRoutes(notificationWriteSchema)
    .handle("notification.markRead", async (args, ctx) =>
      uc.markNotificationRead.execute({
        requesterUserId: requireUser(ctx),
        notificationId: args.input.notificationId,
      }),
    )
    .handle("notification.markAllRead", async (_args, ctx) =>
      uc.markAllNotificationsRead.execute({ requesterUserId: requireUser(ctx) }),
    )
    .handle("notification.markProviderRead", async (args, ctx) =>
      uc.markNotificationRead.execute({
        requesterUserId: requireUser(ctx),
        notificationId: args.input.notificationId,
      }),
    )
    .handle("notification.markAllProviderRead", async (args, ctx) =>
      uc.markAllNotificationsRead.execute({
        requesterUserId: requireUser(ctx),
        providerId: args.input.providerId,
      }),
    )
    .build();
}
