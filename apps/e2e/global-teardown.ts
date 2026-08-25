import { closeDb } from "./fixtures/db";
import { removeApiEnvFile } from "./lib/api-env-file";

/**
 * Runs once after the test run, regardless of pass/fail. Closes the
 * fixtures' shared DB connection (a no-op if no test ever queried) and
 * removes the generated env file — tidy, though not required for the
 * "no leaked processes" guarantee, which Playwright's webServer teardown
 * (process-group kill) already provides independently of this file.
 *
 * One close, because there is now one client (fixtures/db.ts). This used to
 * close auth's and silently leave provider's open.
 */
export default async function globalTeardown(): Promise<void> {
  await closeDb();
  removeApiEnvFile();
}
