import { Db } from "../../../../shared/infrastructure/database/connection";

/**
 * The per-request drizzle client. Signature unchanged, so all existing
 * repositories keep working — but the handle is now scoped to the current
 * request instead of the isolate.
 */
export function getDb() {
  return Db.getDbConnection().drizzleDbClient;
}

/** Legacy lazy proxy. Resolves per property access, so it picks up the
 *  current request's connection. Do not use in new code — call getDb(). */
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_t, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
