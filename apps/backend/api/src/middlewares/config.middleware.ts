import type { MiddlewareHandler } from "hono";
import { infraStore } from "@ntizo/backend/shared/infra";
import { Db } from "@ntizo/backend/shared/infra/database";
import type { Stage } from "@ntizo/backend/shared/infra/config";
import type { AppBindings } from "../types";

/**
 * Establishes the request-scoped infra context and guarantees the per-request
 * postgres pool is released. Must wrap every handler that touches the DB.
 */
export const configMiddleware: MiddlewareHandler<{ Bindings: AppBindings }> = async (
  c,
  next,
) => {
  const env = c.env;
  await infraStore.runAsync(
    {
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
    },
    async () => {
      infraStore.setHyperdrive(
        (c.env as unknown as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE,
      );
      try {
        return await next();
      } finally {
        // Workers run nothing after the response unless scheduled.
        try {
          c.executionCtx.waitUntil(Db.closeDbConnection());
        } catch {
          void Db.closeDbConnection();
        }
      }
    },
  );
};
