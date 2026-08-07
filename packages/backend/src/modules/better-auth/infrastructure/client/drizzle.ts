import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { infraStore } from "../../../../shared/infrastructure/stores/infra-store";
import * as schema from "../database/schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!_db) {
    const env = infraStore.getEnv();
    const client = postgres(env.DATABASE_URL, { prepare: false });
    _db = drizzle(client, { schema });
  }
  return _db;
}

// Convenience lazy proxy so existing imports `import { db } from ...` still work.
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_t, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
