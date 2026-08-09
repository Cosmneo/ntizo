import type { NtizoGraphqlContext } from "../../../../graphql/context";
import type { ExecutionContext } from "../../../../shared/infrastructure/execution-context";

/**
 * Rebuilds the ExecutionContext the BC use-cases expect from the slim GraphQL
 * context. Throws for anonymous callers rather than fabricating an identity.
 *
 * `platformRole` comes from `ctx.role`, which the composition root resolves
 * from `ntizo_user.user.role` — the column the user BC owns. Do not take it
 * from the better-auth session: that is a second, unsynchronised copy.
 */
export function toExecutionContext(ctx: NtizoGraphqlContext): ExecutionContext {
  if (!ctx.requesterUserId) {
    throw new Error("[write/user] unauthenticated");
  }
  return {
    requester: {
      type: "authenticated",
      user: {
        userId: ctx.requesterUserId,
        email: ctx.email ?? "",
        firstName: ctx.firstName ?? "",
        lastName: ctx.lastName ?? "",
        platformRole: ctx.role,
      },
    },
    metadata: {
      requestId: ctx.requestId ?? "",
      ipAddress: ctx.ipAddress ?? undefined,
      userAgent: ctx.userAgent ?? undefined,
      receivedAt: new Date(),
    },
  };
}
