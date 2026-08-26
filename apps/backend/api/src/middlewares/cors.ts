import { cors } from "hono/cors";
import { getTrustedOrigins, type Stage } from "@ntizo/backend/shared/infra/config";
import { infraStore } from "@ntizo/backend/shared/infra";

/**
 * Pure allowlist check: is `origin` one of `stage`'s trusted origins?
 * No request-scope dependency, so this is what the CORS unit tests
 * (`../graphql/__tests__/cors.test.ts`) exercise directly — a change that
 * makes this permissive (e.g. always returning `origin`) fails those tests
 * immediately. Shared by `authCors` below and the GraphQL CORS enforcement
 * (`../graphql/cors`), so REST and GraphQL can never drift onto different
 * allowlists.
 */
export function isOriginTrusted(origin: string, stage: Stage): string {
  const allowed = getTrustedOrigins(stage);
  return allowed.includes(origin) ? origin : "";
}

/**
 * Request-scoped wrapper around `isOriginTrusted` for `authCors`, which
 * (via `hono/cors`) only hands us an origin string, not a stage. Reads
 * STAGE from the AsyncLocalStorage infra store `configMiddleware`
 * populates; returns "" (untrusted) if called outside that scope.
 */
export function resolveTrustedOrigin(origin: string): string {
  try {
    return isOriginTrusted(origin, infraStore.getEnv().STAGE);
  } catch {
    return "";
  }
}

export const authCors = cors({
  origin: (origin) => resolveTrustedOrigin(origin),
  credentials: true,
  // `X-Timezone` must be listed and `Accept-Language` need not be: the latter
  // is a CORS-safelisted request header, a custom `X-` header is not, and a
  // preflight refuses what it is not told about. Local development would
  // never show this — the Vite proxy makes those requests same-origin — so it
  // would have failed first in dev, silently, with the timezone simply never
  // arriving.
  allowHeaders: ["Content-Type", "Authorization", "X-Timezone"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});
