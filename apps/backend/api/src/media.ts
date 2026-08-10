import type { Hono } from "hono";
import { getAuth } from "@ntizo/backend/modules/better-auth";
import { canWriteProviderMedia } from "./provider-access";
import type { AppBindings } from "./types";

/**
 * Logo and portfolio uploads.
 *
 * The opposite posture to `documents.ts`, and deliberately so. These images
 * exist to be shown to strangers — a logo in a search result, a photograph of
 * finished work on a provider's page — so the bucket is public-read and this
 * route hands back a URL rather than an opaque key. An identity document gets
 * a key and a Worker-mediated read; a portfolio photo gets a link.
 */

/** Photographs only. No PDFs here, and no SVG anywhere. */
const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** 5 MB. A phone photograph at full resolution, with room to spare. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function isImage(mime: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

export function mountMedia(app: Hono<{ Bindings: AppBindings }>) {
  /**
   * Serves an image straight from the bucket.
   *
   * Exists for local development, where `wrangler dev` writes to a simulated
   * R2 on disk that no `r2.dev` URL can reach — so without this every image
   * uploads successfully and then renders as a broken box. `MEDIA_PUBLIC_URL_BASE`
   * points here locally and at the CDN everywhere else, which means this route
   * is never hit in dev, qa or prod.
   *
   * No session check, deliberately: the bucket it reads is the public one, and
   * every object in it is already served anonymously from a CDN URL in every
   * deployed stage. Requiring auth here would be security theatre that only
   * makes local behave unlike production. Documents are the opposite case and
   * live behind their own mount.
   */
  app.get("/api/media/*", async (c) => {
    const bucket = c.env.MEDIA_BUCKET;
    if (!bucket) return c.json({ error: "MEDIA_STORAGE_UNCONFIGURED" }, 503);

    const key = c.req.path.replace(/^\/api\/media\//, "");
    if (!key) return c.json({ error: "NO_KEY" }, 400);

    const object = await bucket.get(key);
    if (!object) return c.json({ error: "NOT_FOUND" }, 404);

    // The `ReadableStream` R2 hands back is the Workers one; `Response` here is
    // typed against the DOM's. Structurally identical at runtime, unrelated to
    // TypeScript — the same mismatch `documents.ts` sidesteps by buffering.
    // Streaming rather than buffering because this serves whole images and
    // there is no size cap on a read.
    return new Response(object.body as unknown as BodyInit, {
      headers: {
        "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
        // Same as what was stored. The key carries a timestamp, so a replaced
        // image is a new key and never a stale cache.
        "cache-control": object.httpMetadata?.cacheControl ?? "public, max-age=31536000, immutable",
      },
    });
  });

  /**
   * `kind` is `logo` or `photo`.
   *
   * One route rather than two: the only thing that differs is where the key
   * sits, and a second handler would duplicate every check for that.
   */
  app.post("/api/media/:providerId/:kind", async (c) => {
    const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "UNAUTHENTICATED" }, 401);


    const providerId = c.req.param("providerId");
    if (!(await canWriteProviderMedia(providerId, session.user.id))) {
      // 403, not 404: the caller is authenticated and this says nothing about
      // whether the provider exists.
      return c.json({ error: "FORBIDDEN" }, 403);
    }

    const bucket = c.env.MEDIA_BUCKET;
    if (!bucket) return c.json({ error: "MEDIA_STORAGE_UNCONFIGURED" }, 503);

    const kind = c.req.param("kind");
    if (kind !== "logo" && kind !== "photo") {
      return c.json({ error: "UNKNOWN_MEDIA_KIND" }, 400);
    }

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "NO_FILE" }, 400);

    // Re-checked here, as in `documents.ts`: `accept` is a hint to the file
    // dialog and the size check runs in code the caller controls.
    if (!isImage(file.type)) return c.json({ error: "UNACCEPTED_TYPE" }, 415);
    if (file.size > MAX_IMAGE_BYTES) return c.json({ error: "TOO_LARGE" }, 413);

    const key = `provider/${providerId}/${kind}/${Date.now()}`;

    await bucket.put(key, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: file.type,
        // A year, immutable: the key carries a timestamp, so a replaced image
        // is a new key and never a stale cache.
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: { uploadedByUserId: session.user.id },
    });

    const base = c.env.MEDIA_PUBLIC_URL_BASE;
    return c.json(
      {
        key,
        // Null rather than a guessed URL when no base is configured — which is
        // the case locally. The caller stores the key either way; a wrong URL
        // would be worse than no URL.
        url: base ? `${base}/${key}` : null,
      },
      201,
    );
  });
}
