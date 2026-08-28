import {
  graphqlRoutes,
  type GraphQLHandlerContext,
} from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { CommunicationBootstrap } from "../../../../bounded-contexts/communication/bootstrap";
import { communicationWriteSchema } from "../schema/mutations";

export interface CommunicationWriteModule {
  readonly communication: CommunicationBootstrap;
}

/**
 * Refuses an anonymous caller. Everything else — whether the caller may see
 * this thread at all, whether the body is non-empty and short enough — is
 * either the command's job or the schema's, because each is a query and the
 * kit's argsMapper is synchronous.
 *
 * Copied rather than imported from `read/communication`'s equivalent: tiers
 * do not import each other here, and six lines is not worth a shared helper
 * — same call `write/review`'s and `write/notification`'s handlers make.
 */
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({
      message: "Sign in to message a provider",
      code: "UNAUTHENTICATED",
    });
  }
  return requesterUserId;
}

/**
 * Identity always comes from the session, never from the input. None of the
 * three fields below declares a `customerUserId` / `senderUserId` /
 * `viewerUserId` argument on its schema (zod would strip one anyway), and
 * every one of them is stamped here from `requireUser(ctx)` — so a caller
 * cannot send a message, open a thread, or mark one read as anybody but
 * themselves.
 */
export function createCommunicationWriteHandlers(mod: CommunicationWriteModule) {
  const uc = mod.communication.useCases;

  return graphqlRoutes(communicationWriteSchema)
    .handle("communication.startThread", async (args, ctx) =>
      uc.startThread.execute({
        customerUserId: requireUser(ctx),
        providerId: args.input.providerId,
      }),
    )
    .handle("communication.send", async (args, ctx) =>
      uc.sendMessage.execute({
        threadId: args.input.threadId,
        senderUserId: requireUser(ctx),
        body: args.input.body,
        attachments: args.input.attachments,
      }),
    )
    .handle("communication.markRead", async (args, ctx) =>
      uc.markThreadRead.execute({
        threadId: args.input.threadId,
        viewerUserId: requireUser(ctx),
      }),
    )
    .build();
}
