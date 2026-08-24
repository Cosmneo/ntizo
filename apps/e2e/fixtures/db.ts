import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const BACKEND_ROOT = path.join(REPO_ROOT, "packages/backend");
const RESET_SCRIPT = path.join(BACKEND_ROOT, "scripts/reset-test-db.ts");

/**
 * The throwaway e2e database. Every consumer in this harness — this fixture,
 * the API webServer entry (via the generated dotenv file, see
 * lib/api-env-file.ts and playwright.config.ts), and the direct-DB fixtures
 * (fixtures/auth.ts, fixtures/provider.ts, via `sql()` below) — reads this
 * SAME constant, so they can never end up pointed at different databases by
 * accident.
 *
 * Defaults to the throwaway docker container from the Phase 3B brief
 * (`docker run ... -p 55432:5432 postgres:16-alpine`); override with
 * E2E_DB_URL for CI or a differently-configured throwaway instance.
 */
export const E2E_DB_URL =
  process.env.E2E_DB_URL ?? "postgres://postgres:postgres@localhost:55432/ntizo_e2e";

/**
 * Drops every schema either migration chain owns and reapplies both chains
 * from zero, by shelling out to packages/backend/scripts/reset-test-db.ts —
 * Task 1/2's deliverable. That script owns its own safety guard (reads only
 * its own E2E_DB_URL env var, refuses neon.tech hosts, exits non-zero rather
 * than silently skipping); this fixture supplies the target and does not
 * touch, weaken, or duplicate that guard.
 */
export function resetDb(): void {
  const result = spawnSync("bun", ["run", RESET_SCRIPT], {
    cwd: BACKEND_ROOT,
    stdio: "inherit",
    env: { ...process.env, E2E_DB_URL },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `[e2e] resetDb: reset-test-db.ts exited with code ${result.status ?? "unknown"}`,
    );
  }
}

/**
 * The harness's ONE connection to that database.
 *
 * It lives here, beside `E2E_DB_URL`, rather than in the fixture that
 * happened to need it first. `fixtures/auth.ts` and `fixtures/provider.ts`
 * each opened their own `postgres(E2E_DB_URL, { max: 1 })` — the same five
 * lines twice — and `closeProviderDb` was an export nothing ever called, so
 * a third copy for a spec that only wants to read a row would have been the
 * point at which the duplication stopped being incidental.
 *
 * `max: 1` is kept from those originals. A Playwright worker is its own
 * process, so this is one connection per worker either way; sharing it inside
 * a worker replaces two serialised pools with one, and nothing here holds a
 * transaction open long enough for that to matter.
 */
let client: postgres.Sql | undefined;

export function sql(): postgres.Sql {
  client ??= postgres(E2E_DB_URL, { max: 1 });
  return client;
}

/** Closes it. Called from global-teardown.ts; a no-op if no test ever queried. */
export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = undefined;
  }
}
