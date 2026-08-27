import type { MiddlewareHandler } from "hono";
import { infraStore } from "@ntizo/backend/shared/infra";
import { closeDbBehindDeferredWork } from "@ntizo/backend/shared/infra/database";
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
      EMAIL_FROM: env.EMAIL_FROM ?? "Ntizo <noreply@ntizo.co.mz>",
      // Falls back to the local app rather than to "": an invitation email
      // carrying a link to nowhere is worse than one that only works in dev.
      APP_URL: env.APP_URL ?? "http://localhost:3000",
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID ?? "",
      GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET ?? "",
    },
    async () => {
      // Carried so signup can create the profile in the language the person is
      // actually reading. Nothing else knows it: by the time the user bounded
      // context runs, the request is gone.
      infraStore.setAcceptLanguage(c.req.header("accept-language"));
      // Same reason, same moment: a Google sign-up arrives through an OAuth
      // callback that carries neither, so this covers the e-mail path only
      // and the profile form covers the rest.
      infraStore.setTimezone(c.req.header("x-timezone"));
      infraStore.setHyperdrive(
        (c.env as unknown as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE,
      );
      // The platform's own `waitUntil`, carried into the store along the path
      // env already takes, so work that must outlive the response — email
      // delivery — can be scheduled by code that knows nothing about Hono.
      //
      // Read inside a try because `c.executionCtx` THROWS when there is no
      // execution context (a test, a script, `app.request()`) rather than
      // returning undefined, so `?.` would not help. Same shape as the close
      // below, which has always done this.
      try {
        infraStore.setWaitUntil(c.executionCtx.waitUntil.bind(c.executionCtx));
      } catch {
        // Nothing to register. Deferred work still runs and is still waited
        // for by `settleDeferredWork`; only the platform is unaware of it.
      }
      try {
        return await next();
      } finally {
        // Workers run nothing after the response unless scheduled — and the
        // deferred work scheduled above still needs this request's `{ max: 1 }`
        // postgres pool for recipients, suppressions and delivery rows. So the
        // close is chained BEHIND it, not scheduled beside it — see
        // `closeDbBehindDeferredWork`'s own doc comment for the full argument,
        // and for why this is a shared call rather than a hand-copied block.
        closeDbBehindDeferredWork((promise) => c.executionCtx.waitUntil(promise));
      }
    },
  );
};
