import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { clearSessionQueryCache } from "../use-current-user";
import { userQueries } from "../../data/user.repository";
import { providerQueries } from "@/features/provider/data/provider.repository";

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
