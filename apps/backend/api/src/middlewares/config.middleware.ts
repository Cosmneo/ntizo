import type { MiddlewareHandler } from "hono";
import { infraStore } from "@ntizo/backend/shared/infra";
import type { Stage } from "@ntizo/backend/shared/infra/config";

/**
 * Populates the process-wide infraStore from environment variables.
 * Must run before any handler that touches the DB or better-auth.
 */
export const configMiddleware: MiddlewareHandler = async (_c, next) => {
  infraStore.setEnv({
    STAGE: (process.env.STAGE as Stage) ?? "local",
    LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
    RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
    EMAIL_FROM: process.env.EMAIL_FROM ?? "Ntizo <noreply@ntizo.com>",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
    MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID ?? "",
    MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET ?? "",
  });
  await next();
};
