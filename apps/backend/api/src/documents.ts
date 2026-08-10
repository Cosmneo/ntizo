import type { Hono } from "hono";
import {
  MAX_DOCUMENT_BYTES,
  PROVIDER_DOCUMENT_TYPES,
  isAcceptedDocumentMime,
  type ProviderDocumentType,
} from "@ntizo/shared";
import { getAuth } from "@ntizo/backend/modules/better-auth";
import type { AppBindings } from "./types";

/**
 * Identity-document upload and read.
 *
 * Its own mount rather than a GraphQL field: a multipart body is not something
 * GraphQL carries well, and the read leg has to stream bytes back rather than
 * return JSON.
 *
 * The posture is the opposite of the reference project's media bucket. That one
 * has a public `r2.dev` base URL and serves photographs straight from it; these
 * are ID cards and tax certificates. There is no public base URL, the bucket is
 * never fronted by a CDN, and the only way to see a document is to ask this
 * Worker while holding a session that is allowed to.
 */

/** `provider/<id>/<type>/<millis>` — grouped so a provider's papers delete together. */
function storageKey(providerId: string, type: ProviderDocumentType, now: number): string {
  return `provider/${providerId}/${type}/${now}`;
}

function isKnownType(value: string): value is ProviderDocumentType {
  return (PROVIDER_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function mountDocuments(app: Hono<{ Bindings: AppBindings }>) {
  /**
   * Upload one document.
   *
   * Every check the browser already made is made again here. `accept` on a file
   * input is a hint to the file dialog and the size check runs in code the
   * caller controls — neither survives a request built by hand, so neither is
   * enforcement.
   */
  app.post("/api/documents/:providerId/:type", async (c) => {
    // Session first, infrastructure second. The other order answered an
    // anonymous caller with the state of our storage — nothing catastrophic,
    // but a stranger learning anything about the deployment from an
    // unauthenticated request is a habit worth not having. Found by probing
    // the running endpoint, not by reading this file.
    const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "UNAUTHENTICATED" }, 401);

    const bucket = c.env.DOCUMENTS_BUCKET;
    if (!bucket) {
      // Said out loud rather than swallowed. A 500 with no explanation would
      // look like a broken upload to the provider and like nothing at all in
      // the logs.
      return c.json({ error: "DOCUMENT_STORAGE_UNCONFIGURED" }, 503);
    }

    const type = c.req.param("type");
    if (!isKnownType(type)) return c.json({ error: "UNKNOWN_DOCUMENT_TYPE" }, 400);

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "NO_FILE" }, 400);

    if (!isAcceptedDocumentMime(file.type)) {
      return c.json({ error: "UNACCEPTED_TYPE" }, 415);
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      return c.json({ error: "TOO_LARGE" }, 413);
    }

    const providerId = c.req.param("providerId");
    const key = storageKey(providerId, type, Date.now());

    // The buffer, not `file.stream()`: the DOM stream a `File` hands back is
    // not the `ReadableStream` the Workers runtime types accept. Buffering is
    // safe here only because the size is capped a few lines above — 10 MB in a
    // 128 MB isolate.
    await bucket.put(key, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: file.type,
        // Never cached anywhere but the browser that asked, and not for long.
        // A shared cache holding an ID card is the whole problem in one header.
        cacheControl: "private, max-age=0, no-store",
      },
      customMetadata: {
        uploadedByUserId: session.user.id,
        originalName: file.name.slice(0, 200),
      },
    });

    // The key, never a URL. There is no URL that works without this Worker.
    return c.json({ key, size: file.size, contentType: file.type }, 201);
  });

  /**
   * Read one back.
   *
   * Authentication is checked here and authorisation is NOT yet: who may read
   * whose documents is a decision that belongs with the admin review queue,
   * which does not exist. Until it does this route refuses everyone, because
   * the failure mode of guessing is handing an ID card to the wrong person.
   */
  app.get("/api/documents/*", async (c) => {
    const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "UNAUTHENTICATED" }, 401);
    return c.json({ error: "DOCUMENT_READ_NOT_IMPLEMENTED" }, 501);
  });
}
