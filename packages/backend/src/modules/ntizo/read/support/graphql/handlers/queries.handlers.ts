import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { SupportReadBootstrap } from "../../bootstrap";
import { supportReadSchema } from "../schema/queries";

export interface SupportReadModule {
  readonly supportRead: SupportReadBootstrap;
}

/**
 * Both the id and the role: the context defaults a caller with no session
 * to `customer`, so a role check alone would read a value chosen for the
 * absence of a user rather than asserted about one. Copied, not shared —
 * the same six lines `read/review` and `write/review` carry.
 */
function requireAdmin(ctx: GraphQLHandlerContext): void {
  const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId || role !== "admin") {
    throw new ForbiddenError({
      message: "Only administrators may read support requests",
      code: "ADMIN_ONLY",
    });
  }
}

export function createSupportReadHandlers(mod: SupportReadModule) {
  const uc = mod.supportRead.useCases;

  return graphqlRoutes(supportReadSchema)
    .handle("support.requests", async (args, ctx) => {
      requireAdmin(ctx);
      return uc.listSupportRequests.execute(args.input);
    })
    .handle("support.request", async (args, ctx) => {
      requireAdmin(ctx);
      return uc.getSupportRequest.execute(args.input);
    })
    .handle("support.requestMessages", async (args, ctx) => {
      requireAdmin(ctx);
      return uc.listSupportRequestMessages.execute(args.input);
    })
    .handle("support.openCount", async (_args, ctx) => {
      requireAdmin(ctx);
      return uc.countOpenSupportRequests.execute();
    })
    .build();
}
