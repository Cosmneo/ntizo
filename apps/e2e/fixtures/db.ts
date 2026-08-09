import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const BACKEND_ROOT = path.join(REPO_ROOT, "packages/backend");
const RESET_SCRIPT = path.join(BACKEND_ROOT, "scripts/reset-test-db.ts");

/**
 * The throwaway e2e database. Every consumer in this harness — this fixture,
 * the API webServer entry (via the generated dotenv file, see
 * lib/api-env-file.ts and playwright.config.ts), and the direct-DB fixtures
 * in fixtures/auth.ts — reads this SAME constant, so they can never end up
 * pointed at different databases by accident.
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
