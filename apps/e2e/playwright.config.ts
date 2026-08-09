import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { writeApiEnvFile } from "./lib/api-env-file";
import { resolveNode22 } from "./lib/resolve-node22";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const API_ROOT = path.join(REPO_ROOT, "apps/backend/api");
const WEB_ROOT = path.join(REPO_ROOT, "apps/frontend/web");

const API_PORT = 8788;
const WEB_PORT = 3000;
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;

// Generated fresh on every config load; never reads or writes
// apps/backend/api/.dev.vars, which keeps the developer's real (dev-Neon-DB
// pointing) config file untouched.
//
// Mechanism (verified against wrangler 4.112.0's own source,
// node_modules/wrangler/wrangler-dist/cli.js `getVarsForDev`): passing
// `--env-file` makes wrangler skip loading `.dev.vars` entirely — it does
// NOT merge the two. On its own that would leave the Worker with no
// DATABASE_URL/BETTER_AUTH_SECRET at all (config.middleware.ts's fallbacks
// would kick in instead). `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=true` is
// the flag that then makes wrangler actually read secrets from the file(s)
// named by `--env-file`, the same way it would otherwise read `.dev.vars`.
const apiEnvFile = writeApiEnvFile();

// wrangler requires Node >= 22 and refuses to run under Bun (see
// lib/resolve-node22.ts for how both were confirmed empirically) — `bun run
// e2e` executes this config file itself under Bun, so the API's webServer
// command below must launch wrangler with an explicit real Node binary.
const node22 = resolveNode22();
const wranglerEntry = path.join(API_ROOT, "node_modules/wrangler/bin/wrangler.js");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Two entries, so Playwright owns spawning AND teardown of both real apps
  // end to end — no reuseExistingServer: a harness that might silently
  // adopt (and then never tear down) an already-running server defeats the
  // "leaves no processes behind" requirement this task exists to prove.
  webServer: [
    {
      name: "api",
      command: `"${node22}" "${wranglerEntry}" dev --port ${API_PORT} --env-file="${apiEnvFile}"`,
      cwd: API_ROOT,
      // There is no /api/health route — a 404 there would look like
      // "server up" to a human but Playwright's webServer.url check only
      // accepts 2xx/3xx, so it would hang until timeout. `/` is a real
      // route (apps/backend/api/src/api.ts) returning 200 with
      // {"status":"ok"} and needs no DB/auth, so it's a true readiness
      // signal.
      url: `${API_URL}/`,
      // wrangler's cold start is ~8s (Phase 3B brief); 60s leaves generous margin.
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "true",
      },
    },
    {
      name: "web",
      command: "bun run dev",
      cwd: WEB_ROOT,
      // vite's own "/" — the real landing page (200, HTML). Its dev server
      // proxies /api and /graphql to API_URL (apps/frontend/web/vite.config.ts,
      // DEV_WORKER_ORIGIN default), so no extra wiring is needed here to
      // reach the API entry above.
      url: `${WEB_URL}/`,
      timeout: 30_000,
      reuseExistingServer: false,
    },
  ],
});
