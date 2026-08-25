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
  /**
   * Resend's webhook signing secret (`whsec_…`), set with `wrangler secret
   * put RESEND_WEBHOOK_SECRET` — never a `var`, since anyone holding it can
   * forge a bounce for any address.
   *
   * Optional in the type because a local `wrangler dev` genuinely runs
   * without it, and the route says what happens then rather than assuming:
   * it refuses every event with a 500. It is deliberately not part of
   * `InfraEnvBindings` — nothing in `packages/backend` reads it, only the
   * webhook binding does, and widening the shared env shape would make every
   * caller of `infraStore.runAsync` supply a value it has no use for.
   */
  RESEND_WEBHOOK_SECRET?: string;
};
