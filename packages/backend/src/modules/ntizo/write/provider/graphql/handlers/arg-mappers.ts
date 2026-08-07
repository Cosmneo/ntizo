import type { NtizoGraphqlContext } from "../../../../graphql/context";
import type { ExecutionContext } from "../../../../shared/infrastructure/execution-context";

/**
 * Rebuilds the ExecutionContext the existing BC use-cases expect from the slim
 * GraphQL context. Throws for anonymous callers rather than fabricating an
 * identity — the same posture as `requireAuthenticated`.
 */
export function toExecutionContext(ctx: NtizoGraphqlContext): ExecutionContext {
  if (!ctx.requesterUserId) {
    throw new Error("[write/provider] unauthenticated");
  }
  return {
    requester: {
      type: "authenticated",
      user: {
        userId: ctx.requesterUserId,
        email: ctx.email ?? "",
        firstName: ctx.firstName ?? "",
        lastName: ctx.lastName ?? "",
        platformRole: "customer",
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
