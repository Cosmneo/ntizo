import type { MiddlewareHandler } from "hono";
import { infraStore } from "@ntizo/backend/shared/infra";
import type { Stage } from "@ntizo/backend/shared/infra/config";
import type { AppBindings } from "../types";

/**
 * Populates the process-wide infraStore from Worker bindings.
 * Must run before any handler that touches the DB or better-auth.
 */
export const configMiddleware: MiddlewareHandler<{
  Bindings: AppBindings;
}> = async (c, next) => {
  const env = c.env;
  infraStore.setEnv({
    STAGE: (env.STAGE as Stage) ?? "local",
    LOG_LEVEL: env.LOG_LEVEL ?? "info",
    DATABASE_URL: env.DATABASE_URL ?? "",
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
    RESEND_API_KEY: env.RESEND_API_KEY ?? "",
    EMAIL_FROM: env.EMAIL_FROM ?? "Ntizo <noreply@ntizo.com>",
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID ?? "",
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET ?? "",
    MICROSOFT_CLIENT_ID: env.MICROSOFT_CLIENT_ID ?? "",
    MICROSOFT_CLIENT_SECRET: env.MICROSOFT_CLIENT_SECRET ?? "",
  });
  await next();
};
