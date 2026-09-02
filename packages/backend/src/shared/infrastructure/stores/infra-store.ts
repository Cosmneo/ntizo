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
  /**
   * Vodacom Moçambique's M-Pesa gateway, read by `MpesaPaymentCharge` when
   * the cron charges an accepted booking.
   *
   * **Optional, unlike everything above, and that is not laziness.** A local
   * `wrangler dev`, a script, and every test that builds this shape genuinely
   * run with none of them, and the code path that reads them says so: a stage
   * missing the two secrets produces a named charge failure
   * (`NTIZO-MPESA-NOT-CONFIGURED`) rather than an exception, so the sweep
   * keeps running and the booking falls to its payment window like any other
   * unpaid one. Making them required would force every existing
   * `infraStore.runAsync` caller to supply values it has no use for.
   *
   * They live here rather than only on the Worker's own bindings — the shape
   * `RESEND_WEBHOOK_SECRET` uses — because unlike that secret these are read
   * from inside `packages/backend`, by an adapter in the Booking context.
   * A binding only the app layer reads belongs on `AppBindings`; one this
   * package reads has to be here.
   *
   * `MPESA_ENVIRONMENT`, `MPESA_ORIGIN` and `MPESA_SERVICE_PROVIDER_CODE` are
   * plain configuration and live in `wrangler.jsonc` as `vars`, in the open,
   * where anybody reading the repository can see how a stage is pointed at
   * the sandbox. Only the two below are secrets.
   */
  MPESA_API_KEY?: string;
  /** Base64 DER (SPKI), one line, exactly as the developer portal issues it. */
  MPESA_PUBLIC_KEY?: string;
  /** `development` for the sandbox host, anything else for production. */
  MPESA_ENVIRONMENT?: string;
  /** The `Origin` header the gateway insists on — `developer.mpesa.vm.co.mz`. */
  MPESA_ORIGIN?: string;
  /** The merchant shortcode being paid. `171717` in the sandbox. */
  MPESA_SERVICE_PROVIDER_CODE?: string;
  /**
   * Where a contact or feedback form's message is forwarded.
   *
   * Optional for the same reason the M-Pesa pair is: a local run, a script
   * and every test that builds this shape genuinely have none, and the
   * adapter that reads it says so (it logs and keeps the row) rather than
   * throwing. Configuration, not a secret, so it lives in `wrangler.jsonc`.
   */
  CONTACT_INBOX_EMAIL?: string;
}

/**
 * How many generations of deferred work `settleDeferredWork` will drain.
 *
 * Deferred work can schedule more deferred work, so draining is a loop rather
 * than one `allSettled`. Real nesting is one or two deep — the loop's bound
 * exists for the pathological case, not the normal one. See
 * `settleDeferredWork`.
 */
const MAX_DEFERRED_WAVES = 50;

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
   * The requester's `Accept-Language`, verbatim.
   *
   * Kept raw rather than resolved so the one place that needs a Locale does
   * the resolving — this store carries request context, it does not decide
   * what the context means.
   */
  acceptLanguage?: string;
  /**
   * The requester's IANA timezone, from `X-Timezone`.
   *
   * Sign-up is the only moment this is knowable — the request carries it and
   * nothing downstream has one — so it travels with the language, for the
   * same reason and by the same route.
   */
  timezone?: string;
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

  /** Records the request's `Accept-Language`. Absent outside a request. */
  setAcceptLanguage(value: string | null | undefined): void {
    if (value) this.require().acceptLanguage = value;
  }

  /**
   * The request's `Accept-Language`, or null.
   *
   * Deliberately does NOT throw outside a request scope, unlike `getEnv`: a
   * caller with no language should fall back to the default, not fail.
   */
  getAcceptLanguage(): string | null {
    return this.storage.getStore()?.acceptLanguage ?? null;
  }

  /** Records the request's `X-Timezone`. Absent outside a request. */
  setTimezone(value: string | null | undefined): void {
    if (value) this.require().timezone = value;
  }

  /**
   * The request's timezone, or null.
   *
   * Does NOT throw outside a request scope, matching `getAcceptLanguage`: a
   * caller with no timezone should fall back to the default, not fail.
   */
  getTimezone(): string | null {
    return this.storage.getStore()?.timezone ?? null;
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
   *
   * Capped at `MAX_DEFERRED_WAVES` generations. Legitimate nesting is one or
   * two deep and nothing in the codebase reschedules at all, so the cap is not
   * a throttle — it is the bound on an otherwise unbounded loop sitting in a
   * request's `finally`. Work that reschedules behind a timer or IO yields
   * between waves and would be fine either way; work that reschedules on an
   * already-resolved promise never yields, so it starves the isolate's timer
   * and IO queues and nothing else in that isolate progresses again. Giving up
   * closes the connection under whatever is still running, which is bad — and
   * strictly less bad than an isolate that never runs anything again. The log
   * line exists because abandoning work silently would leave the symptom
   * looking like the delivery bug this whole task was about.
   */
  async settleDeferredWork(): Promise<void> {
    const store = this.storage.getStore();
    if (!store) return;
    for (let wave = 0; wave < MAX_DEFERRED_WAVES; wave += 1) {
      if (store.deferred.length === 0) return;
      await Promise.allSettled(store.deferred.splice(0));
    }
    if (store.deferred.length === 0) return;
    // console.error, not the logger: getRequestScopedLogger() throws when no
    // scope is set and nothing in this repo ever sets one — the same reason
    // tx-context.ts:21 uses it.
    console.error(
      `[infra-store] deferred work is still rescheduling after ${MAX_DEFERRED_WAVES} waves. ` +
        `Abandoning ${store.deferred.length} promise(s) and releasing the request. ` +
        "Something handed to waitUntil is scheduling more work every time it settles.",
    );
    store.deferred.length = 0;
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
