import postgres from "postgres";

/**
 * The dev Postgres (Neon) suspends when idle and has been measured taking
 * ~24s to accept a connection after waking up. Every file in this directory
 * pays that cost on whichever query happens to run first, so both numbers
 * below live here once rather than as 8 independently-drifting copies:
 *
 * - `connect_timeout` (given to `postgres()`) needs headroom past 24s or
 *   postgres.js gives up on a connection that was only ever slow, not dead.
 *   Its own implicit default (30s) left just 6s of margin — not "comfortably
 *   above" a measurement with any variance in it.
 * - Bun's per-file default timeout (5s) governs `beforeAll`/`afterAll`/`test`
 *   independently of `connect_timeout` entirely, and it is the one that was
 *   actually firing: `connect_timeout`'s 30s was never reached because Bun
 *   killed the hook at 5s first, mid-connect, which is what a bare
 *   `(fail) (unnamed)` timeout at ~5000ms/10000ms is — a `beforeAll` (or a
 *   `test` that connects lazily on its first query) losing that race, not a
 *   query behaving incorrectly. Set below `connect_timeout` so a real outage
 *   still fails via postgres.js's own clean rejection instead of Bun tearing
 *   the hook down mid-await and leaving `afterAll` to clean up after a
 *   connection nothing ever finished opening.
 */
export const DEV_DB_COLD_START_TIMEOUT_MS = 45_000;

/** Seconds, not ms — `postgres()`'s own unit. Kept under `DEV_DB_COLD_START_TIMEOUT_MS` for the reason above. */
const CONNECT_TIMEOUT_SECONDS = 35;

/**
 * Opens the real connection these integration tests assert against, or
 * explains why one can't be opened.
 *
 * `{ max: 1 }`: one file, one suite, one connection — these run against the
 * shared dev database directly, not through the app's request-scoped pool
 * (`connection.ts`), which is tuned for a Worker failing fast on a request
 * it can retry, not for a test suite that would rather wait than report a
 * cold start as a bug.
 */
export function openDevDbConnection(): postgres.Sql {
  const url = process.env["DEV_DB_URL"];
  if (!url) {
    throw new Error(
      "DEV_DB_URL is not set. These tests assert against the real dev database " +
        "— set it (see packages/backend/.env) and try again.",
    );
  }
  return postgres(url, { max: 1, connect_timeout: CONNECT_TIMEOUT_SECONDS });
}

/**
 * Runs teardown steps independently so one failure — an id a partially-run
 * `beforeAll` never assigned, a row already gone, a blip on the connection —
 * doesn't strand every step after it. Fixture rows surviving because their
 * own cleanup gave up partway is the exact failure this exists to close off;
 * see `catalog-city-facets.test.ts`'s history for what that looked like in
 * the product's city filter.
 */
export async function bestEffortCleanup(steps: ReadonlyArray<() => Promise<unknown>>): Promise<void> {
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      console.error("[dev-db test cleanup] a teardown step failed; continuing", error);
    }
  }
}
