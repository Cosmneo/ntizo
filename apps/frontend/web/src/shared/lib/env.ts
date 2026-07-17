const ENV_DEFAULTS = {
  VITE_AUTH_API_URL: "http://localhost:8788",
} as const;

type EnvVar = keyof typeof ENV_DEFAULTS;

function readEnv(key: EnvVar): string {
  const value = import.meta.env[key];
  return value && value.length > 0 ? value : ENV_DEFAULTS[key];
}

/** better-auth backend origin (used only in deployed builds; dev proxies /api). */
export const AUTH_API_URL: string = readEnv("VITE_AUTH_API_URL");

const requiredEnvVars: EnvVar[] = ["VITE_AUTH_API_URL"];

/** Throw if a required env var is missing in a deployed (non-dev) build. */
export function validateEnv(): void {
  if (import.meta.env.DEV) return;
  const missing = requiredEnvVars.filter((key) => {
    const value = import.meta.env[key];
    return !value || value.length === 0;
  });
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables:\n${missing.join("\n")}`);
  }
}
