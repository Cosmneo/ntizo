import { AsyncLocalStorage } from "node:async_hooks";
import { Db, type DrizzleDb } from "./connection";

type AfterCommitCallback = () => void | Promise<void>;

/**
 * Runs every after-commit callback, isolating failures.
 *
 * The transaction has already committed by the time these run, so a callback
 * throwing must NOT propagate (that would report a durable success as a
 * failure) nor abort its siblings (one failed side-effect must not skip the
 * rest). Each failure is logged and swallowed.
 */
async function drainAfterCommit(
  callbacks: readonly AfterCommitCallback[],
): Promise<void> {
  for (const callback of callbacks) {
    try {
      await callback();
    } catch (error) {
      console.error("[tx-context] after-commit callback failed", error);
    }
  }
}

interface TransactionContext {
  db: DrizzleDb;
  afterCommit: AfterCommitCallback[];
}

const transactionContext = new AsyncLocalStorage<TransactionContext>();

/**
 * Returns the active database handle: the Drizzle transaction bound by an
 * enclosing `runInTransaction`/`ensureTransaction` if one is active, otherwise
 * the request-scoped client.
 */
export function getActiveDb(): DrizzleDb {
  return transactionContext.getStore()?.db ?? Db.getDbConnection().drizzleDbClient;
}

export function hasActiveTransaction(): boolean {
  return transactionContext.getStore() !== undefined;
}

/**
 * Defers an external side-effect until the surrounding transaction commits.
 * Without an active transaction, the callback runs immediately.
 */
export async function runAfterCommit(
  callback: AfterCommitCallback,
): Promise<void> {
  const store = transactionContext.getStore();
  if (!store) {
    await callback();
    return;
  }
  store.afterCommit.push(callback);
}

/**
 * Opens a new Drizzle transaction and runs `work` with the transaction handle
 * bound to AsyncLocalStorage so nested `getActiveDb()` calls pick it up.
 *
 * Throws when a transaction is already active — it must not be called
 * reentrantly. It always opens on the request client, never on
 * `getActiveDb()`; nested on the `{ max: 1 }` per-request pool, the inner
 * `db.transaction()` finds no free connection and queues silently behind the
 * outer transaction's own queue, which is itself waiting on it — a permanent
 * hang with no error and no timeout, not a savepoint. Use `ensureTransaction`
 * for reentrant call sites (e.g. repository `save` methods).
 *
 * A fire-and-forget promise started inside `work` (e.g. `void (async () =>
 * ...)()`) keeps this transaction's AsyncLocalStorage binding after `work`
 * returns and the transaction settles, so its `getActiveDb()` still resolves
 * to the (by then committed or rolled back) tx handle instead of a fresh
 * connection — inherent to AsyncLocalStorage, not specific to this module.
 * Always `await` work that must run inside — or after — the transaction.
 */
export async function runInTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (transactionContext.getStore()) {
    throw new Error(
      "[tx-context] runInTransaction called inside an active transaction — use ensureTransaction()",
    );
  }
  const db = Db.getDbConnection().drizzleDbClient;
  const afterCommit: AfterCommitCallback[] = [];
  const result = await db.transaction(async (tx) => {
    // `tx` is a PgTransaction, structurally close to but not assignable to
    // DrizzleDb (it lacks `$client`); it supports the same query surface
    // every repository actually uses, so the cast is safe.
    return transactionContext.run({ db: tx as unknown as DrizzleDb, afterCommit }, work);
  });
  await drainAfterCommit(afterCommit);
  return result;
}

/**
 * Reentrant transaction wrapper: joins an existing transaction when one is
 * already active, otherwise opens a new one. Use this in repository `save`
 * methods so they compose with a use-case-level UoW.
 */
export function ensureTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (transactionContext.getStore()) {
    return work();
  }
  return runInTransaction(work);
}

/**
 * Test-only seam for unit tests that need transaction-context semantics
 * without opening a real database transaction.
 */
export async function __runWithTransactionContextForTests<T>(
  db: DrizzleDb,
  work: () => Promise<T>,
  options: { commit?: boolean } = {},
): Promise<T> {
  const afterCommit: AfterCommitCallback[] = [];
  const result = await transactionContext.run({ db, afterCommit }, work);
  if (options.commit !== false) {
    await drainAfterCommit(afterCommit);
  }
  return result;
}
