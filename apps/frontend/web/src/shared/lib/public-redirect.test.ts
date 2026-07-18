import { describe, expect, it } from "vitest";
import { shouldBypassPublicRedirect } from "@/shared/lib/public-redirect";

describe("shouldBypassPublicRedirect", () => {
  it("bypasses accept-invite so authed invitees can accept", () => {
    expect(shouldBypassPublicRedirect("/accept-invite/abc123")).toBe(true);
  });
  it("does not bypass sign-in / sign-up", () => {
    expect(shouldBypassPublicRedirect("/sign-in")).toBe(false);
    expect(shouldBypassPublicRedirect("/sign-up")).toBe(false);
  });
});
