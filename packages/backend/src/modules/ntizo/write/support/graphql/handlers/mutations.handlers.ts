import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { CommunicationBootstrap } from "../../../../bounded-contexts/communication/bootstrap";
import { supportWriteSchema } from "../schema/mutations";

/** The same bootstrap the participant mutations use — only its admin commands are reached from here. */
export interface SupportWriteModule {
  readonly communication: CommunicationBootstrap;
}

/** Both the id and the role — see `read/support`'s twin for why the role alone is not enough. Returns the admin's id: it is the message's sender. */
function requireAdmin(ctx: GraphQLHandlerContext): string {
  const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId || role !== "admin") {
    throw new ForbiddenError({
      message: "Only administrators may act on support requests",
      code: "ADMIN_ONLY",
    });
  }
  return requesterUserId;
}

export function createSupportWriteHandlers(mod: SupportWriteModule) {
  const uc = mod.communication.useCases;

  return graphqlRoutes(supportWriteSchema)
    .handle("support.reply", async (args, ctx) =>
      uc.replyToSupportRequest.execute({
        threadId: args.input.threadId,
        adminUserId: requireAdmin(ctx),
        body: args.input.body,
        attachments: args.input.attachments,
      }),
    )
    .handle("support.resolve", async (args, ctx) =>
      uc.resolveSupportRequest.execute({ threadId: args.input.threadId, adminUserId: requireAdmin(ctx) }),
    )
    .handle("support.markRead", async (args, ctx) => {
      requireAdmin(ctx);
      return uc.markSupportRequestRead.execute({ threadId: args.input.threadId });
    })
    .build();
}
