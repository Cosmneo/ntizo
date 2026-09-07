import { describe, expect, it, vi } from "vitest";
import { landingServiceQueries } from "../service.repository";

vi.mock("@/shared/lib/graphql/public-graphql", () => ({
  publicGraphql: vi.fn(async () => ({ serviceAll: { items: [], nextOffset: null, total: 0 } })),
}));
const { publicGraphql } = await import("@/shared/lib/graphql/public-graphql");

describe("landingServiceQueries.popular", () => {
  it("keys on the locale and the size, so two callers never share a payload", () => {
    expect(landingServiceQueries.popular("pt-MZ", 8).queryKey).toEqual([
      "public",
      "services",
      "popular",
      "pt-MZ",
      8,
    ]);
  });

  it("asks for the provider's own arrangement, which is what Sugeridos means", async () => {
    const options = landingServiceQueries.popular("pt-MZ", 8);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (options.queryFn as any)({});
    const [, variables] = vi.mocked(publicGraphql).mock.calls[0]!;
    // No `sort`. Absent is the provider's arrangement; "newest" and "price"
    // each throw it away, and neither is what a home page means by popular.
    expect(variables).toEqual({ input: { locale: "pt-MZ", limit: 8, offset: 0 } });
  });

  it("asks for the fields the tile draws", async () => {
    const options = landingServiceQueries.popular("pt-MZ", 8);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (options.queryFn as any)({});
    const [query] = vi.mocked(publicGraphql).mock.calls[0]!;
    // The one field whose absence shipped /providers/undefined for a release.
    expect(query).toContain("providerSlug");
    expect(query).toContain("defaultOption");
  });
});
