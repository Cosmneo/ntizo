import { describe, expect, it, mock } from "bun:test";
import * as betterAuth from "@ntizo/backend/modules/better-auth";

/**
 * Why this test exists.
 *
 * Two test files here swap the better-auth session with `mock.module`:
 * `media-avatar.test.ts` and `graphql/__tests__/context-factory.test.ts`.
 * `mock.module` replaces the module for the rest of the test PROCESS, not just
 * for the file that called it — so a factory returning only `getAuth` deletes
 * every other export, and the next file to import `registerSmsService`,
 * `registerEmailService` or `registerSignUpHook` dies at load with
 * "Export named ... not found in module".
 *
 * Which file that is depends on the order bun walks the directory, which is
 * the filesystem's order and differs between macOS and Linux. That is how this
 * shipped: the suite passed on a developer's machine and failed in CI, taking
 * `event-handler-registration.test.ts` and `webhook-mount.test.ts` down with
 * it — two files that had nothing to do with the change.
 *
 * The fix is one spread in each factory. This test is here so that removing it
 * fails on purpose, here, instead of failing somewhere unrelated on another
 * operating system.
 */
describe("mocking better-auth's session must not delete its other exports", () => {
  it("keeps the register* exports reachable after a session swap", async () => {
    mock.module("@ntizo/backend/modules/better-auth", () => ({
      ...betterAuth,
      getAuth: () => ({ api: { getSession: async () => null } }),
    }));

    const reloaded = await import("@ntizo/backend/modules/better-auth");

    // The api bootstrap calls all three. Without them it cannot start, and the
    // failure surfaces as a syntax error in an innocent file.
    expect(typeof reloaded.registerSmsService).toBe("function");
    expect(typeof reloaded.registerEmailService).toBe("function");
    expect(typeof reloaded.registerSignUpHook).toBe("function");
  });
});
