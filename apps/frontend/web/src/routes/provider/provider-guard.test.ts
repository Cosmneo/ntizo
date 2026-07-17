import { describe, expect, it } from "vitest";

// The guard's decision is: no session -> redirect to /sign-in?next=<path>.
// Extract that decision into a pure helper so it is unit-testable.
import { resolveProviderGuard } from "./provider-guard";

describe("resolveProviderGuard", () => {
  it("redirects unauthenticated users to sign-in with next", () => {
    expect(resolveProviderGuard(null, "/provider/members")).toEqual({
      redirectTo: "/sign-in",
      search: { next: "/provider/members" },
    });
  });
  it("allows authenticated users through", () => {
    expect(resolveProviderGuard({ user: {} }, "/provider/members")).toBeNull();
  });
});
