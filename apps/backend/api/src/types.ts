import type { R2Bucket } from "@cloudflare/workers-types";
import type { InfraEnvBindings } from "@ntizo/backend/shared/infra";

/**
 * Worker bindings = the infra env vars, plus what wrangler attaches.
 *
 * Both buckets are optional because they genuinely can be absent: a local
 * `wrangler dev` without them still boots, and every route that touches one
 * must say what happens then rather than assume.
 */
export type AppBindings = InfraEnvBindings & {
  /** Identity papers. No public URL, ever — reads go through the Worker. */
  DOCUMENTS_BUCKET?: R2Bucket;
  /** Logos and portfolio photos. Public-read: they exist to be shown. */
  MEDIA_BUCKET?: R2Bucket;
  /** Where `MEDIA_BUCKET` is served from, so stored keys can become URLs. */
  MEDIA_PUBLIC_URL_BASE?: string;
};
