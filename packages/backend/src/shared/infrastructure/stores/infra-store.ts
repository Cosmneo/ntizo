import { AsyncLocalStorage } from "node:async_hooks";
import type { Stage } from "../config/stage-properties";

export interface InfraEnvBindings {
  STAGE: Stage;
  LOG_LEVEL: string;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  /**
   * Where the web app lives, for links inside emails.
   *
   * Needed because the API and the app are different origins and a mail body
   * cannot use a relative path. Its absence is why the invitation email shipped
   * a bare token and no link at all.
   */
  APP_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
}

/** A Cloudflare Hyperdrive binding — only the field we consume. */
export interface HyperdriveBinding {
  readonly connectionString: string;
}

export interface DbConnection {
  drizzleDbClient: unknown;
  postgresDbClient: unknown;
}

/**
 * Cloudflare's `ExecutionContext.waitUntil`, reduced to the one call we make.
 *
 * Typed here rather than imported from `@cloudflare/workers-types` because
 * this package must build without the Workers type package — the app layer
 * binds the real thing.
 */
export type WaitUntilFn = (promise: Promise<unknown>) => void;

interface InfraStoreData {
  env: InfraEnvBindings;
  dbConnection?: DbConnection;
  hyperdrive?: HyperdriveBinding;
  waitUntil?: WaitUntilFn;
  /**
   * Every promise handed to `waitUntil` on this request.
   *
   * Kept so the per-request postgres pool can be closed *behind* deferred work
   * instead of beside it — see `settleDeferredWork`.
   */
  deferred: Promise<unknown>[];
}

/**
 * Request-scoped infrastructure store.
 *
 * Backed by AsyncLocalStorage because Cloudflare Workers share module scope
 * across every request an isolate handles. An isolate-wide singleton would let
 * concurrent requests overwrite each other's env, and — worse — share a
 * postgres socket, which Workers reject with "Cannot perform I/O on behalf of a
 * different request".
 */
class InfraStore {
  private readonly storage = new AsyncLocalStorage<InfraStoreData>();

  async runAsync<T>(env: InfraEnvBindings, fn: () => Promise<T>): Promise<T> {
    return this.storage.run({ env, deferred: [] }, fn);
  }

  private require(): InfraStoreData {
    const store = this.storage.getStore();
    if (!store) {
      throw new Error(
        "[infra-store] not initialized. Ensure configMiddleware wraps the request before reading infra state.",
      );
    }
    return store;
  }

  getEnv(): InfraEnvBindings {
    return this.require().env;
  }

  isInContext(): boolean {
    return this.storage.getStore() !== undefined;
  }

  getDbConnection(): DbConnection | undefined {
    return this.storage.getStore()?.dbConnection;
  }

  setDbConnection(connection: DbConnection): void {
    this.require().dbConnection = connection;
  }

  setHyperdrive(binding: HyperdriveBinding | undefined): void {
    if (binding) this.require().hyperdrive = binding;
  }

  /**
   * Registers the platform's `waitUntil` for this request.
   *
   * Called by `configMiddleware` with `c.executionCtx.waitUntil` bound to its
   * context. Absent outside a Worker — a test, a script, `app.request()` —
   * which `waitUntil` below is written to survive.
   */
  setWaitUntil(waitUntil: WaitUntilFn | undefined): void {
    if (waitUntil) this.require().waitUntil = waitUntil;
  }

  /**
   * Hands a promise to the platform to finish after the response is sent.
   *
   * Cloudflare gives every request an `ExecutionContext` whose `waitUntil`
   * keeps the isolate alive for work the client is not waiting on. Rendering
   * and posting an email is hundreds of milliseconds; a provider approval must
   * not pay for it.
   *
   * With nothing registered — a test, a script, any non-Worker caller — the
   * promise is still recorded and still runs; there is simply no platform to
   * tell about it. Nothing here can make a `void` function wait, so the
   * waiting lives in `settleDeferredWork`, which both branches of
   * `configMiddleware` go through.
   */
  waitUntil(promise: Promise<unknown>): void {
    // Swallowed here as well as at the call site. A rejection escaping into
    // `ctx.waitUntil` — or into nothing at all, outside a Worker — surfaces as
    // an unhandled rejection with nothing left to say about where it came
    // from. Callers that can say something log it themselves before handing
    // the promise over; this is the backstop for the ones that cannot.
    const settled = promise.catch(() => undefined);
    const store = this.storage.getStore();
    if (!store) return;
    store.deferred.push(settled);
    store.waitUntil?.(settled);
  }

  /**
   * Resolves once everything handed to `waitUntil` on this request has settled.
   *
   * This is what lets `configMiddleware` close the per-request postgres pool
   * *behind* deferred work rather than beside it. Cloudflare does not order
   * `waitUntil` tasks against each other, so scheduling `closeDbConnection()`
   * as its own task races the email delivery that still needs recipients,
   * suppressions and delivery rows off that same `{ max: 1 }` connection —
   * and races it non-deterministically, which means `wrangler dev` forgives it
   * locally while production fails now and then.
   *
   * Drains rather than snapshots: deferred work inherits this
   * AsyncLocalStorage scope, so it can schedule more of its own, and a single
   * `allSettled` would close the connection out from under whatever it
   * scheduled.
   */
  async settleDeferredWork(): Promise<void> {
    const store = this.storage.getStore();
    if (!store) return;
    while (store.deferred.length > 0) {
      await Promise.allSettled(store.deferred.splice(0));
    }
  }

  /**
   * Hyperdrive's pooled string when the binding exists (deployed stages),
   * else the direct DATABASE_URL (local `wrangler dev`).
   */
  getConnectionString(): string {
    const store = this.require();
    return store.hyperdrive?.connectionString ?? store.env.DATABASE_URL;
  }
}

export const infraStore = new InfraStore();
