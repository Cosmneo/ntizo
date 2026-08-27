import { infraStore } from "@ntizo/backend/shared/infra";
import { closeDbBehindDeferredWork } from "@ntizo/backend/shared/infra/database";
import type { Stage } from "@ntizo/backend/shared/infra/config";
import { bootstrapNotification } from "@ntizo/backend/modules/ntizo/bounded-contexts/notification";
import { bootstrapCommunication } from "@ntizo/backend/modules/ntizo/bounded-contexts/communication";
import type { AppBindings } from "./types";

/**
 * How many due messages one sweep may claim.
 *
 * The cron runs every minute (see `wrangler.jsonc`) against a two-minute
 * notify window, so under any plausible load one wave clears the queue
 * before the next wave starts. This is a generous ceiling against a runaway
 * backlog, not a throttle a normal run is expected to hit.
 */
export const SWEEP_LIMIT = 200;

/**
 * The worker that wakes up to check for unread messages.
 *
 * Nothing calls `NotifyUnreadInternalCommand` unless something schedules it —
 * this is that something. Without it, every message is composed, stored, and
 * nobody is ever told: `notifyDueAt` sits in the table forever and the sweep
 * that would turn it into a bell-plus-email notification never runs.
 *
 * **A `scheduled` handler is not an HTTP request.** `configMiddleware`
 * establishes the request-scoped `infraStore` AsyncLocalStorage context for
 * every fetch — it is the only place in this codebase that does. Deep inside
 * the sweep, `DeferredNotificationDelivery.execute()` calls
 * `infraStore.waitUntil(...)` and template rendering reads
 * `infraStore.getEnv()` for `APP_URL`; both throw ("not initialized... Ensure
 * configMiddleware wraps the request") outside that scope. Worse, the raise
 * and `markNotified` happen *before* the deferred email delivery is awaited,
 * so an unwrapped call would still mark every message notified while its
 * email throws inside `DeferredNotificationDelivery`'s own `.catch` and
 * vanishes — permanent, silent email loss with every test green. So this
 * function builds the same request-scoped store the fetch path builds
 * (`infraStore.runAsync`) before touching anything that reads it.
 *
 * The per-request `{ max: 1 }` postgres pool this scope opens has the same
 * problem `configMiddleware` solves for a request: the sweep defers email
 * delivery past its own return, and Cloudflare does not order `waitUntil`
 * tasks against each other, so the close must be chained *behind* the
 * deferred work rather than scheduled beside it. Shares
 * `closeDbBehindDeferredWork` with `configMiddleware` rather than
 * hand-copying that chain a second time — see that function's own doc
 * comment for the full argument.
 */
export async function scheduled(
  controller: ScheduledController,
  env: AppBindings,
  ctx: ExecutionContext,
): Promise<void> {
  await infraStore.runAsync(
    {
      STAGE: (env.STAGE as Stage) ?? "local",
      LOG_LEVEL: env.LOG_LEVEL ?? "info",
      DATABASE_URL: env.DATABASE_URL ?? "",
      BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
      RESEND_API_KEY: env.RESEND_API_KEY ?? "",
      EMAIL_FROM: env.EMAIL_FROM ?? "Ntizo <noreply@ntizo.co.mz>",
      // Same fallback configMiddleware uses: a notification email carrying a
      // link to nowhere is worse than one that only works in dev.
      APP_URL: env.APP_URL ?? "http://localhost:3000",
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID ?? "",
      GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET ?? "",
    },
    async () => {
      infraStore.setHyperdrive(
        (env as unknown as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE,
      );
      // No accept-language / timezone to carry: those come off a request
      // header and a cron invocation has no request. Registered before the
      // sweep runs, same as configMiddleware registers it before `next()`,
      // so deferred work started inside the sweep can hand the platform its
      // own promise.
      infraStore.setWaitUntil(ctx.waitUntil.bind(ctx));

      try {
        const notification = bootstrapNotification();
        const communication = bootstrapCommunication({
          raiseNotification: notification.useCases.internal.raiseNotification,
        });

        const { notified, failed } = await communication.useCases.internal.notifyUnread.execute({
          limit: SWEEP_LIMIT,
        });

        if (failed > 0) {
          // console.error, not the logger: getRequestScopedLogger() throws
          // when no scope is set and a cron invocation sets none — same
          // reason notify-unread.internal.command.ts does this itself.
          console.error(
            `[scheduled] notify-unread sweep: ${notified} notified, ${failed} failed`,
          );
        }
      } finally {
        // Workers run nothing after this function returns unless scheduled —
        // and the deferred work scheduled above still needs this run's
        // `{ max: 1 }` postgres pool for recipients, suppressions and
        // delivery rows. See `closeDbBehindDeferredWork`'s doc comment.
        closeDbBehindDeferredWork((promise) => ctx.waitUntil(promise));
      }
    },
  );
}
