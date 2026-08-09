import { afterEach, describe, expect, it } from "bun:test";
import { GuardRefusalError, guardTargetUrl } from "../reset-test-db";

const ENV_VAR = "E2E_DB_URL";

/**
 * reset-test-db.ts is THE most destructive script in this repo (it drops
 * and recreates schemas), and `guardTargetUrl` is its only safeguard. These
 * tests exercise it directly, not through the script's process-exiting CLI
 * wrapper — see the `GuardRefusalError` / `import.meta.main` split in
 * reset-test-db.ts for why that's possible without spawning a subprocess.
 */
describe("reset-test-db guardTargetUrl", () => {
  const original = process.env[ENV_VAR];

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = original;
  });

  it("refuses when the env var is unset", () => {
    delete process.env[ENV_VAR];
    expect(() => guardTargetUrl()).toThrow(GuardRefusalError);
  });

  it("refuses when the env var is blank", () => {
    process.env[ENV_VAR] = "   ";
    expect(() => guardTargetUrl()).toThrow(GuardRefusalError);
  });

  it("refuses when the env var is not a valid URL", () => {
    process.env[ENV_VAR] = "not a url";
    expect(() => guardTargetUrl()).toThrow(GuardRefusalError);
  });

  it("refuses a neon.tech hostname", () => {
    process.env[ENV_VAR] = "postgres://user:pass@ep-cool-thing.us-east-2.aws.neon.tech/db";
    expect(() => guardTargetUrl()).toThrow(/neon\.tech/);
  });

  it("refuses a neon.tech hostname regardless of case", () => {
    process.env[ENV_VAR] = "postgres://user:pass@EP-COOL-THING.US-EAST-2.AWS.NEON.TECH/db";
    expect(() => guardTargetUrl()).toThrow(/neon\.tech/i);
  });

  // The actual finding this test guards against: an authority-less URL like
  // postgres:///db parses without throwing and gives hostname === "", which
  // passes the neon.tech substring check trivially (it never matches an
  // empty string) while postgres.js resolves the real host from
  // PGHOST/PGHOSTADDR behind this script's back.
  it("refuses a host-less URL (postgres:///db)", () => {
    const url = "postgres:///db";
    expect(new URL(url).hostname).toBe(""); // the premise this guard exists for
    process.env[ENV_VAR] = url;
    expect(() => guardTargetUrl()).toThrow(GuardRefusalError);
  });

  // Adjacent shape, different code path: a URL with credentials/a port but
  // no host (e.g. postgres://u:p@:5432/db) does NOT parse to an empty
  // hostname — `new URL(...)` throws on it (verified directly against both
  // Bun's and Node's URL parser), so this was already refused before the
  // empty-hostname check above existed, via the "not a valid connection
  // URL" branch. Asserted here so a future change to either branch can't
  // silently stop refusing this shape.
  it("refuses a URL with a blank host before the port (postgres://u:p@:5432/db)", () => {
    const url = "postgres://u:p@:5432/db";
    expect(() => new URL(url)).toThrow(); // the premise this test exercises
    process.env[ENV_VAR] = url;
    expect(() => guardTargetUrl()).toThrow(GuardRefusalError);
  });

  it("accepts a normal non-Neon URL and returns it unchanged", () => {
    const url = "postgres://postgres:postgres@localhost:55432/ntizo_e2e";
    process.env[ENV_VAR] = url;
    expect(guardTargetUrl()).toBe(url);
  });
});
