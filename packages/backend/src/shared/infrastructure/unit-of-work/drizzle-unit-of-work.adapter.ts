import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { ensureTransaction } from "../database/tx-context";

/**
 * Unit of Work backed by a Drizzle/postgres.js transaction threaded through
 * AsyncLocalStorage. Any repository reading or writing via `getDb()` joins the
 * transaction opened here automatically — that is the whole reason `getDb()`
 * resolves the active transaction rather than the request client. No
 * repository calls `ensureTransaction` (or anything else in `tx-context.ts`)
 * itself; `getDb()`/`getActiveDb()` is the entire integration surface.
 *
 * Delegates to `ensureTransaction` rather than `runInTransaction` directly:
 * a use case's `atomicExecute` call can itself be nested — inside another
 * use case's `atomicExecute`, or inside an outer transaction a saga opened —
 * and `ensureTransaction` joins that already-active transaction instead of
 * opening a second one. On the app's `{ max: 1 }` connection pool, a second
 * `runInTransaction` here would not error, it would deadlock waiting for the
 * connection slot the outer transaction is already holding.
 */
export class DrizzleUnitOfWork implements UnitOfWorkPort {
  atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    return ensureTransaction(work);
  }
}
