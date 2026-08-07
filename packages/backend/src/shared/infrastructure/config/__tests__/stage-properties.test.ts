import { describe, expect, it } from "bun:test";
import { getTrustedOrigins, type Stage } from "../stage-properties";

/**
 * getTrustedOrigins gates REST CORS, GraphQL CORS, and better-auth's
 * trustedOrigins. adminUrl/providerUrl point at pre-consolidation
 * subdomains (admin.ntizo.com, provider.ntizo.com, and dev/qa variants) for
 * apps that were deleted; combined with crossSubDomainCookies
 * (domain: "ntizo.com"), trusting those hosts would hand the session cookie
 * to any origin claiming those names. This is a regression test for that.
 */

const STAGES: Stage[] = ["local", "dev", "qa", "prod"];

describe("getTrustedOrigins", () => {
  for (const stage of STAGES) {
    it(`excludes admin/provider subdomain hosts for stage "${stage}"`, () => {
      const origins = getTrustedOrigins(stage);
      for (const origin of origins) {
        expect(origin).not.toMatch(/\badmin\./);
        expect(origin).not.toMatch(/\bprovider\./);
      }
    });
  }

  it('returns exactly [baseUrl, landingUrl] for "prod"', () => {
    expect(getTrustedOrigins("prod")).toEqual([
      "https://api.ntizo.com",
      "https://ntizo.com",
    ]);
  });

  it("does not contain admin.ntizo.com or provider.ntizo.com for prod", () => {
    const origins = getTrustedOrigins("prod");
    expect(origins).not.toContain("https://admin.ntizo.com");
    expect(origins).not.toContain("https://provider.ntizo.com");
  });
});
