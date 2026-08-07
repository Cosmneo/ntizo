import { cors } from "hono/cors";
import { getTrustedOrigins } from "@ntizo/backend/shared/infra/config";
import { infraStore } from "@ntizo/backend/shared/infra";

/**
 * Resolves an Origin header against the current stage's trusted-origin
 * allowlist. Exported so the GraphQL mount (`../graphql/cors`) can enforce
 * the exact same allowlist as REST without a second, independently
 * maintained origin list that the two tiers could drift apart on.
 */
export function resolveTrustedOrigin(origin: string): string {
  try {
    const allowed = getTrustedOrigins(infraStore.getEnv().STAGE);
    return allowed.includes(origin) ? origin : "";
  } catch {
    return "";
  }
}

export const authCors = cors({
  origin: (origin) => resolveTrustedOrigin(origin),
  credentials: true,
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});
