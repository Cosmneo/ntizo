// Stage properties and trusted-origins resolution for Ntizo.
// Simplified from flowzao's stage-properties.

export type Stage = "local" | "dev" | "qa" | "prod";

export interface StageProperties {
  stage: Stage;
  baseUrl: string;
  adminUrl: string;
  providerUrl: string;
  landingUrl: string;
  /**
   * Registrable domain for the session cookie, or null in local.
   *
   * Stated per stage rather than derived from `landingUrl`, because deriving
   * it means parsing a public suffix and this domain is exactly where that
   * goes wrong: `ntizo.co.mz`'s last two labels are `co.mz`, a suffix nobody
   * may set a cookie on. A browser would reject it and the session would
   * vanish on every navigation, with nothing in the logs.
   */
  cookieDomain: string | null;
}

const STAGE_MAP: Record<Stage, StageProperties> = {
  local: {
    stage: "local",
    baseUrl: "http://localhost:8788",
    adminUrl: "http://localhost:3002",
    providerUrl: "http://localhost:3001",
    landingUrl: "http://localhost:3000",
    // Local apps all talk to localhost, which shares cookies on the bare host.
    cookieDomain: null,
  },
  dev: {
    stage: "dev",
    baseUrl: "https://dev.api.ntizo.co.mz",
    adminUrl: "https://dev.admin.ntizo.com",
    providerUrl: "https://dev.provider.ntizo.com",
    landingUrl: "https://dev.ntizo.co.mz",
    cookieDomain: "ntizo.co.mz",
  },
  qa: {
    stage: "qa",
    baseUrl: "https://qa.api.ntizo.co.mz",
    adminUrl: "https://qa.admin.ntizo.com",
    providerUrl: "https://qa.provider.ntizo.com",
    landingUrl: "https://qa.ntizo.co.mz",
    cookieDomain: "ntizo.co.mz",
  },
  prod: {
    stage: "prod",
    baseUrl: "https://api.ntizo.co.mz",
    adminUrl: "https://admin.ntizo.com",
    providerUrl: "https://provider.ntizo.com",
    landingUrl: "https://ntizo.co.mz",
    cookieDomain: "ntizo.co.mz",
  },
};

export function getStageProperties(stage: Stage): StageProperties {
  return STAGE_MAP[stage] ?? STAGE_MAP.local;
}

export function getTrustedOrigins(stage: Stage): string[] {
  const p = getStageProperties(stage);
  // adminUrl/providerUrl are pre-consolidation subdomains for apps that no
  // longer exist — the single web app serves ntizo.co.mz / dev.ntizo.co.mz /
  // qa.ntizo.co.mz only. They are also still on the OLD ntizo.com domain,
  // which is parked at a registrar and not on Cloudflare at all; that is
  // harmless precisely because nothing below trusts them. This list gates
  // REST CORS, GraphQL CORS, and better-auth's trustedOrigins, and combined
  // with crossSubDomainCookies (`cookieDomain`), trusting those hosts would
  // let any origin at those unclaimed names receive the session cookie. The
  // StageProperties fields are left in place; only trust is withdrawn here.
  return [p.baseUrl, p.landingUrl];
}
