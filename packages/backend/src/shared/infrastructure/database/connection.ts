import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../../modules/better-auth/infrastructure/database/schema";
import { infraStore } from "../stores/infra-store";

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Serverless-friendly connector. Each REQUEST gets its own pool, cached on the
 * AsyncLocalStorage store and released by the config middleware via
 * `executionCtx.waitUntil` — Workers run nothing after the response otherwise,
 * so an unreleased socket leaks for the isolate's lifetime.
 */
export class Db {
  static getDbConnection(): { drizzleDbClient: DrizzleDb; postgresDbClient: postgres.Sql } {
    const existing = infraStore.getDbConnection();
    if (existing) {
      return {
        drizzleDbClient: existing.drizzleDbClient as DrizzleDb,
        postgresDbClient: existing.postgresDbClient as postgres.Sql,
      };
    }

    // Per Cloudflare guidance: keep the per-request pool at 1 and give every
    // socket a bounded lifetime so leaks self-heal if the release hook is
    // skipped because the isolate was evicted.
    const sql = postgres(infraStore.getConnectionString(), {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      max_lifetime: 60 * 5,
      fetch_types: false,
      prepare: false,
    });
    const drizzleClient = drizzle(sql, { schema });

    infraStore.setDbConnection({
      drizzleDbClient: drizzleClient,
      postgresDbClient: sql,
    });
    return { drizzleDbClient: drizzleClient, postgresDbClient: sql };
  }

  /** Best-effort release. No-op when nothing was opened; never throws. */
  static async closeDbConnection(timeoutSeconds = 5): Promise<void> {
    const existing = infraStore.getDbConnection();
    if (!existing) return;
    try {
      await (existing.postgresDbClient as postgres.Sql).end({ timeout: timeoutSeconds });
    } catch {
      // The response is already sent; max_lifetime is the backstop.
    }
  }
}

/**
 * Closes the run's postgres pool behind any deferred work, never beside it.
 *
 * Cloudflare does not order `waitUntil` tasks against each other. Handing
 * `Db.closeDbConnection()` to the platform as its own task races whatever
 * `infraStore.waitUntil` already scheduled — an email delivery still reading
 * recipients, suppressions or delivery rows off this same `{ max: 1 }`
 * connection — and wins often enough to matter, intermittently, in
 * production. Chaining `settleDeferredWork().then(() => closeDbConnection())`
 * turns "wait for deferred work, then close" into ONE task instead of two,
 * which is what actually enforces the order. Two independently-registered
 * `waitUntil` calls do not enforce it, no matter which is written first in
 * the source — that shape is the specific bug this function exists to make
 * impossible to reintroduce by accident.
 *
 * Extracted so both callers — `configMiddleware` (the fetch path) and
 * `scheduled` (the cron path, see `apps/backend/api/src/scheduled.ts`) —
 * share one implementation instead of two hand-copies drifting apart. The
 * duplication was the actual root cause the first time this gap was found:
 * one copy was covered by `wait-until.test.ts`, the other was new code with
 * no test of its own.
 *
 * `registerWaitUntil` receives the already-chained promise and decides how
 * to hand it to the platform; callers wrap it in their own try where their
 * own access to the platform's `waitUntil` might throw (Hono's
 * `c.executionCtx` is a getter that THROWS when there is no execution
 * context — a test, a script, `app.request()` — rather than returning
 * undefined) — this function's own try/catch around calling
 * `registerWaitUntil` is the backstop for exactly that, matching the shape
 * both callers used before extraction.
 */
export function closeDbBehindDeferredWork(
  registerWaitUntil: (promise: Promise<unknown>) => void,
): void {
  const closeBehindDeferredWork = infraStore
    .settleDeferredWork()
    .then(() => Db.closeDbConnection());
  try {
    registerWaitUntil(closeBehindDeferredWork);
  } catch {
    void closeBehindDeferredWork;
  }
}
