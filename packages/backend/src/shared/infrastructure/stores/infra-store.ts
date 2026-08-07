import { AsyncLocalStorage } from "node:async_hooks";
import type { Stage } from "../config/stage-properties";

export interface InfraEnvBindings {
  STAGE: Stage;
  LOG_LEVEL: string;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
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

interface InfraStoreData {
  env: InfraEnvBindings;
  dbConnection?: DbConnection;
  hyperdrive?: HyperdriveBinding;
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
    return this.storage.run({ env }, fn);
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
   * Hyperdrive's pooled string when the binding exists (deployed stages),
   * else the direct DATABASE_URL (local `wrangler dev`).
   */
  getConnectionString(): string {
    const store = this.require();
    return store.hyperdrive?.connectionString ?? store.env.DATABASE_URL;
  }
}

export const infraStore = new InfraStore();
