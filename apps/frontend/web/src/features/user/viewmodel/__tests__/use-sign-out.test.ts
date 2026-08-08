import { describe, expect, it, vi } from "vitest";
import { signOutAndReset } from "../use-sign-out";

describe("signOutAndReset", () => {
  it("clears the cache and navigates even when the server-side revoke rejects", async () => {
    // Regression coverage: a network-level failure (offline, DNS, connection
    // reset) rejects better-auth's underlying fetch(), which used to
    // propagate straight out of a bare `await authClient.signOut()` in both
    // SidebarUserMenus — skipping the cache clear and the redirect. The
    // user would click "Sign out" and see nothing happen at all.
    const clearSessionQueryCache = vi.fn();
    const navigateToSignIn = vi.fn();
    const revokeServerSession = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await signOutAndReset({
      revokeServerSession,
      clearSessionQueryCache,
      navigateToSignIn,
    });

    expect(clearSessionQueryCache).toHaveBeenCalledOnce();
    expect(navigateToSignIn).toHaveBeenCalledOnce();
    expect(result).toEqual({ serverRevokeFailed: true });
  });

  it("clears the cache and navigates on a normal, successful revoke too", async () => {
    const clearSessionQueryCache = vi.fn();
    const navigateToSignIn = vi.fn();
    const revokeServerSession = vi.fn().mockResolvedValue({ data: null, error: null });

    const result = await signOutAndReset({
      revokeServerSession,
      clearSessionQueryCache,
      navigateToSignIn,
    });

    expect(clearSessionQueryCache).toHaveBeenCalledOnce();
    expect(navigateToSignIn).toHaveBeenCalledOnce();
    expect(result).toEqual({ serverRevokeFailed: false });
  });
});
