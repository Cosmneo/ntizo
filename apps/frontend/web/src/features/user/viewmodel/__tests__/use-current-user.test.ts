import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { clearSessionQueryCache, fetchCurrentUser } from "../use-current-user";
import { userQueries } from "../../data/user.repository";
import { providerQueries } from "@/features/provider/data/provider.repository";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import * as client from "@/shared/lib/graphql/session-graphql";

afterEach(() => vi.restoreAllMocks());

describe("clearSessionQueryCache", () => {
  it("drops every session-scoped query, not just user.me", () => {
    // Regression coverage for the re-review's M3 finding: the first version
    // of this only removed ["user", "me"], leaving ["providers", "mine"]
    // (which useMyProviders()/useActiveProvider() read) cached across a
    // sign-out -> sign-in cycle. zone-switcher.tsx combines a fresh `me`
    // with a stale providers.length in accessibleZones(), so a plain
    // customer could transiently inherit — or a provider transiently
    // lose — the Provider zone link.
    const qc = new QueryClient();
    const userKey = userQueries.me().queryKey;
    const providersKey = providerQueries.mine().queryKey;

    qc.setQueryData(userKey, { id: "u1", email: "a@b.c" } as never);
    qc.setQueryData(providersKey, [{ id: "p1", name: "Org" }] as never);
    expect(qc.getQueryData(userKey)).toBeDefined();
    expect(qc.getQueryData(providersKey)).toBeDefined();

    clearSessionQueryCache(qc);

    expect(qc.getQueryData(userKey)).toBeUndefined();
    expect(qc.getQueryData(providersKey)).toBeUndefined();
  });
});

describe("fetchCurrentUser", () => {
  it("resolves to null on a genuine sign-out", async () => {
    vi.spyOn(client, "sessionGraphql").mockRejectedValueOnce(
      new GraphqlError(200, [
        {
          message: "Authentication required",
          extensions: { code: "UNAUTHENTICATED", originalCode: "UNAUTHENTICATED" },
        },
      ]),
    );

    await expect(fetchCurrentUser()).resolves.toBeNull();
  });

  it("rejects on a non-auth failure instead of degrading to null", async () => {
    // No blanket catch here anymore — see the doc comment on
    // fetchCurrentUser for why: swallowing every error was what let a
    // transient backend failure look identical to "signed out" to
    // routes/admin/route.tsx's beforeLoad guard.
    vi.spyOn(client, "sessionGraphql").mockRejectedValueOnce(
      new GraphqlError(500, [
        { message: "Database unavailable", extensions: { code: "INTERNAL_ERROR" } },
      ]),
    );

    await expect(fetchCurrentUser()).rejects.toBeInstanceOf(GraphqlError);
  });
});
