import type { R2Bucket } from "@cloudflare/workers-types";
import type { InfraEnvBindings } from "@ntizo/backend/shared/infra";

/**
 * Worker bindings = the infra env vars, plus the bindings wrangler attaches.
 *
 * `DOCUMENTS_BUCKET` is optional because it genuinely can be absent: a local
 * `wrangler dev` without the bucket created still boots, and every route that
 * touches it must say what happens then rather than assume it is there.
 */
export type AppBindings = InfraEnvBindings & {
  DOCUMENTS_BUCKET?: R2Bucket;
};
