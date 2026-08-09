import { closeAuthDb } from "./fixtures/auth";
import { removeApiEnvFile } from "./lib/api-env-file";

/**
 * Runs once after the test run, regardless of pass/fail. Closes the
 * fixtures' own DB connection (a no-op if no test ever opened one) and
 * removes the generated env file — tidy, though not required for the
 * "no leaked processes" guarantee, which Playwright's webServer teardown
 * (process-group kill) already provides independently of this file.
 */
export default async function globalTeardown(): Promise<void> {
  await closeAuthDb();
  removeApiEnvFile();
}
