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
