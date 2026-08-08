import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDestinationForSession } from "../post-login";
import * as userViewModel from "@/features/user/viewmodel/use-current-user";
import * as providersViewModel from "../use-providers";

afterEach(() => vi.restoreAllMocks());

describe("resolveDestinationForSession", () => {
  it("degrades to the default destination when fetchCurrentUser rejects, rather than blocking the redirect", async () => {
    // The deliberate choice documented on resolveDestinationForSession: a
    // real backend failure right after sign-in should not strand the user
    // on an error instead of a redirect. fetchCurrentUser() itself no
    // longer swallows errors (see use-current-user.ts), so this call site
    // must be the one to catch it.
    vi.spyOn(userViewModel, "fetchCurrentUser").mockRejectedValue(
      new Error("database unavailable"),
    );
    vi.spyOn(providersViewModel, "countMyProviders").mockResolvedValue(0);

    await expect(resolveDestinationForSession(null)).resolves.toBe("/");
  });

  it("still routes admins/providers to their zone on the happy path", async () => {
    vi.spyOn(userViewModel, "fetchCurrentUser").mockResolvedValue({
      id: "u1",
      role: "admin",
    } as never);
    vi.spyOn(providersViewModel, "countMyProviders").mockResolvedValue(0);

    await expect(resolveDestinationForSession(null)).resolves.toBe("/admin");
  });
});
