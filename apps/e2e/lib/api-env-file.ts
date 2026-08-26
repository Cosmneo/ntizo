import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { E2E_DB_URL } from "../fixtures/db";

/**
 * Fixed, deterministic path outside the repo (os.tmpdir()) — regenerated on
 * every config load, never committed, never touches
 * apps/backend/api/.dev.vars.
 */
export const API_ENV_FILE_PATH = path.join(os.tmpdir(), "ntizo-e2e-api.env");

/**
 * Writes the dotenv file the API's wrangler dev process reads via
 * `--env-file` (see playwright.config.ts for the full mechanism, including
 * why `.dev.vars` is never touched or read). Only the keys that actually
 * need to differ from wrangler.jsonc's committed defaults are set here —
 * everything else (RESEND_API_KEY, GOOGLE_*) is left absent so
 * the app's own `?? ""` / `?? "dev-secret-change-me"` fallbacks in
 * config.middleware.ts apply, same as an unconfigured local dev box.
 */
export function writeApiEnvFile(): string {
  const contents = [
    `DATABASE_URL=${E2E_DB_URL}`,
    `BETTER_AUTH_SECRET=ntizo-e2e-harness-secret-not-for-production-use`,
    `BETTER_AUTH_URL=http://localhost:8788`,
    "",
  ].join("\n");
  fs.writeFileSync(API_ENV_FILE_PATH, contents, { mode: 0o600 });
  return API_ENV_FILE_PATH;
}

export function removeApiEnvFile(): void {
  fs.rmSync(API_ENV_FILE_PATH, { force: true });
}
