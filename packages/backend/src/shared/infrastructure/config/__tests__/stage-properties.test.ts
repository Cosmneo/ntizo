import { describe, expect, it } from "bun:test";
import { getStageProperties, getTrustedOrigins, type Stage } from "../stage-properties";

/**
 * getTrustedOrigins gates REST CORS, GraphQL CORS, and better-auth's
 * trustedOrigins. adminUrl/providerUrl point at pre-consolidation
 * subdomains for apps that were deleted, and still on the old ntizo.com
 * domain, which is parked at a registrar; combined with crossSubDomainCookies
 * (`cookieDomain`), trusting those hosts would hand the session cookie to any
 * origin claiming those names. This is a regression test for that.
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
      "https://api.ntizo.co.mz",
      "https://ntizo.co.mz",
    ]);
  });

  it("does not contain the admin or provider hosts for prod", () => {
    const origins = getTrustedOrigins("prod");
    expect(origins).not.toContain("https://admin.ntizo.com");
    expect(origins).not.toContain("https://provider.ntizo.com");
  });

  it("gives every deployed stage a cookie domain, and never the public suffix", () => {
    // `ntizo.co.mz` has a two-label public suffix. Deriving the cookie domain
    // by taking the last two labels yields `co.mz`, which no site may set a
    // cookie on — the browser drops it and the session disappears with
    // nothing logged. This pins that we state it rather than compute it.
    for (const stage of ["dev", "qa", "prod"] as Stage[]) {
      const { cookieDomain } = getStageProperties(stage);
      expect(cookieDomain).toBe("ntizo.co.mz");
    }
    expect(getStageProperties("local").cookieDomain).toBeNull();
  });

  it("keeps every trusted origin inside the cookie domain", () => {
    // An origin trusted for CORS but outside the cookie's domain gets a
    // session cookie the browser will not store — sign-in appears to work
    // and does not persist. Local is exempt: it has no cookie domain.
    for (const stage of ["dev", "qa", "prod"] as Stage[]) {
      const { cookieDomain } = getStageProperties(stage);
      for (const origin of getTrustedOrigins(stage)) {
        expect(new URL(origin).hostname.endsWith(cookieDomain!)).toBe(true);
      }
    }
  });
});
