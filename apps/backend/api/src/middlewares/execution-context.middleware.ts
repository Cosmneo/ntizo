import type { MiddlewareHandler } from "hono";
import { getAuth } from "@ntizo/backend/modules/better-auth";
import type {
  ExecutionContext,
  Requester,
} from "@ntizo/backend/modules/ntizo/shared/infrastructure/execution-context";
import type { UserRole } from "@ntizo/shared";

declare module "hono" {
  interface ContextVariableMap {
    executionContext: ExecutionContext;
  }
}

/**
 * Builds an ExecutionContext for every request from the better-auth session
 * (if any) plus request metadata, and attaches it to Hono's context under
 * `c.var.executionContext`. Handlers and use cases read from there instead of
 * re-resolving the session themselves.
 */
export const executionContextMiddleware: MiddlewareHandler = async (c, next) => {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  let requester: Requester;
  if (session?.user) {
    const u = session.user as typeof session.user & {
      firstName?: string;
      lastName?: string;
      role?: string;
    };
    requester = {
      type: "authenticated",
      user: {
        userId: u.id,
        email: u.email,
        firstName: u.firstName ?? "",
        lastName: u.lastName ?? "",
        platformRole: (u.role ?? "customer") as UserRole,
      },
    };
  } else {
    requester = { type: "anonymous" };
  }

  c.set("executionContext", {
    requester,
    metadata: {
      requestId: c.req.header("x-request-id") ?? crypto.randomUUID(),
      ipAddress:
        c.req.header("cf-connecting-ip") ??
        c.req.header("x-forwarded-for") ??
        undefined,
      userAgent: c.req.header("user-agent") ?? undefined,
      receivedAt: new Date(),
    },
  });

  await next();
};
