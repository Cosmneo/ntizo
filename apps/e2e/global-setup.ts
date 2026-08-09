import { resetDb } from "./fixtures/db";

/**
 * Runs once before the test run. Rebuilds the throwaway e2e database from
 * zero via Task 1/2's reset-test-db.ts, so every run starts from a
 * known-clean schema rather than whatever a previous run left behind.
 *
 * Safe to run concurrently with the webServer entries starting up: neither
 * the API nor the web dev server touches the database at process-startup
 * time (connections are opened lazily, per-request — see
 * packages/backend/src/shared/infrastructure/database/connection.ts), so
 * there is no ordering requirement between this and webServer readiness.
 */
export default async function globalSetup(): Promise<void> {
  resetDb();
}
