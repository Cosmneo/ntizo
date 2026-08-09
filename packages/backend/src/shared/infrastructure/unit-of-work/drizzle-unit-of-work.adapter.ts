import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { ensureTransaction } from "../database/tx-context";

/**
 * Unit of Work backed by a Drizzle/postgres.js transaction threaded through
 * AsyncLocalStorage. Any repository reading or writing via `getDb()` joins the
 * transaction opened here automatically — that is the whole reason `getDb()`
 * resolves the active transaction rather than the request client.
 *
 * Delegates to `ensureTransaction` rather than `runInTransaction` directly:
 * a use case's `atomicExecute` call commonly wraps repositories that call
 * `ensureTransaction` themselves, and on the app's `{ max: 1 }` connection
 * pool a second `runInTransaction` would not error, it would deadlock
 * waiting for the connection slot the outer transaction is already holding.
 */
export class DrizzleUnitOfWork implements UnitOfWorkPort {
  atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    return ensureTransaction(work);
  }
}
