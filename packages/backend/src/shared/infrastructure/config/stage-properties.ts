// Stage properties and trusted-origins resolution for Ntizo.
// Simplified from flowzao's stage-properties.

export type Stage = "local" | "dev" | "qa" | "prod";

export interface StageProperties {
  stage: Stage;
  baseUrl: string;
  adminUrl: string;
  providerUrl: string;
  landingUrl: string;
}

const STAGE_MAP: Record<Stage, StageProperties> = {
  local: {
    stage: "local",
    baseUrl: "http://localhost:8788",
    adminUrl: "http://localhost:3002",
    providerUrl: "http://localhost:3001",
    landingUrl: "http://localhost:3000",
  },
  dev: {
    stage: "dev",
    baseUrl: "https://dev.api.ntizo.com",
    adminUrl: "https://dev.admin.ntizo.com",
    providerUrl: "https://dev.provider.ntizo.com",
    landingUrl: "https://dev.ntizo.com",
  },
  qa: {
    stage: "qa",
    baseUrl: "https://qa.api.ntizo.com",
    adminUrl: "https://qa.admin.ntizo.com",
    providerUrl: "https://qa.provider.ntizo.com",
    landingUrl: "https://qa.ntizo.com",
  },
  prod: {
    stage: "prod",
    baseUrl: "https://api.ntizo.com",
    adminUrl: "https://admin.ntizo.com",
    providerUrl: "https://provider.ntizo.com",
    landingUrl: "https://ntizo.com",
  },
};

export function getStageProperties(stage: Stage): StageProperties {
  return STAGE_MAP[stage] ?? STAGE_MAP.local;
}

export function getTrustedOrigins(stage: Stage): string[] {
  const p = getStageProperties(stage);
  // adminUrl/providerUrl are pre-consolidation subdomains (admin.ntizo.com,
  // provider.ntizo.com and their dev/qa variants) for apps that no longer
  // exist — the single web app now serves ntizo.com / dev.ntizo.com /
  // qa.ntizo.com only. This list gates REST CORS, GraphQL CORS, and
  // better-auth's trustedOrigins, and combined with crossSubDomainCookies
  // (domain: "ntizo.com"), trusting those hosts would let any origin at
  // those (now-unclaimed) names receive the session cookie. The
  // StageProperties fields themselves are left in place; only trust is
  // withdrawn here.
  return [p.baseUrl, p.landingUrl];
}
