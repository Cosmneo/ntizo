import { getActiveDb } from "../../../../shared/infrastructure/database/tx-context";

/**
 * The active drizzle handle. Signature unchanged, so all existing
 * repositories keep working — but the handle now resolves to the bound
 * transaction when one is active, otherwise the request-scoped client.
 *
 * Name deliberately kept as `getDb()` rather than renamed to
 * `getActiveDb()`: 32 call sites already funnel through this function, and a
 * missed rename at any one of them would fail silently — it would write
 * outside the transaction instead of raising an error. Changing what the
 * existing name resolves to makes every call site join a transaction
 * automatically with zero edits at the call sites.
 */
export function getDb() {
  return getActiveDb();
}

/** Legacy lazy proxy. Resolves per property access, so it picks up the
 *  current request's connection. Do not use in new code — call getDb(). */
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_t, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
