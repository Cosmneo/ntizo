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
  return [p.baseUrl, p.adminUrl, p.providerUrl, p.landingUrl];
}
