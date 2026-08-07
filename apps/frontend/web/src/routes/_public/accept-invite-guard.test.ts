import { describe, expect, it } from "vitest";

// The guard's decision is: no session -> redirect to /sign-in?next=<path>.
// Extract that decision into a pure helper so it is unit-testable.
import { resolveAcceptInviteGuard } from "./accept-invite-guard";

describe("resolveAcceptInviteGuard", () => {
  it("redirects unauthenticated visitors to sign-in with next", () => {
    expect(
      resolveAcceptInviteGuard(null, "/accept-invite/SECRET-TOKEN-abc123"),
    ).toEqual({
      redirectTo: "/sign-in",
      search: { next: "/accept-invite/SECRET-TOKEN-abc123" },
    });
  });
  it("allows authenticated users through", () => {
    expect(
      resolveAcceptInviteGuard({ user: {} }, "/accept-invite/SECRET-TOKEN-abc123"),
    ).toBeNull();
  });
});
