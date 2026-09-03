import { describe, expect, it } from "vitest";
import { audienceForPath } from "../help-audience";

describe("audienceForPath", () => {
  it("is the provider's inside a provider workspace, and names the slug", () => {
    expect(audienceForPath("/provider/salao-x/services")).toEqual({
      audience: "provider",
      providerSlug: "salao-x",
    });
  });

  it("is personal everywhere else", () => {
    expect(audienceForPath("/")).toEqual({ audience: "customer", providerSlug: null });
    expect(audienceForPath("/messages")).toEqual({ audience: "customer", providerSlug: null });
    // The public directory of businesses is a customer page, not the zone.
    expect(audienceForPath("/providers/salao-x")).toEqual({ audience: "customer", providerSlug: null });
  });

  it("is personal on the provider zone's own picker, which names no provider", () => {
    expect(audienceForPath("/provider")).toEqual({ audience: "customer", providerSlug: null });
    expect(audienceForPath("/provider/no-provider")).toEqual({ audience: "customer", providerSlug: null });
  });
});
