import type { Hono } from "hono";
import {
  MAX_DOCUMENT_BYTES,
  PROVIDER_DOCUMENT_TYPES,
  isAcceptedDocumentMime,
  type ProviderDocumentType,
} from "@ntizo/shared";
import { getAuth } from "@ntizo/backend/modules/better-auth";
import {
  findDocumentById,
  recordDocumentUpload,
  reviewDocument,
} from "@ntizo/backend/modules/ntizo/documents";
import { canWriteProviderMedia } from "./provider-access";
import { isPlatformAdmin } from "./admin-access";
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
   * Decide about one document.
   *
   * A REST route beside the upload rather than a GraphQL mutation, because it
   * belongs with the two legs it sits between — the upload that created the
   * row and the read that serves the bytes — and splitting the three across
   * two transports would put the same authorisation rule in two places.
   *
   * Registered BEFORE the upload, and that is load-bearing.
   * `/api/documents/:providerId/:type` matches any two segments, so it also
   * matches `/api/documents/<id>/review`; with the upload first, every review
   * was answered by the upload handler's membership check and came back 403
   * with an administrator's session. Found by calling it, not by reading it.
   * Safe in this order because `:type` is a closed enum that will never
   * contain "review", so no real upload can be swallowed by this.
   */
  app.post("/api/documents/:documentId/review", async (c) => {
    const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "UNAUTHENTICATED" }, 401);
    // Administrators only, unlike the read below: a provider may look at their
    // own papers and must never be the one who approves them.
    if (!(await isPlatformAdmin(session.user.id))) {
      return c.json({ error: "FORBIDDEN" }, 403);
    }

    const body = (await c.req.json().catch(() => null)) as {
      accept?: unknown;
      rejectionReason?: unknown;
    } | null;
    if (typeof body?.accept !== "boolean") {
      return c.json({ error: "ACCEPT_REQUIRED" }, 400);
    }
    const reason =
      typeof body.rejectionReason === "string"
        ? body.rejectionReason.trim().slice(0, 500)
        : null;
    // A refusal with no reason is one the provider cannot act on: they are
    // told to send it again with no idea what was wrong with it.
    if (!body.accept && !reason) {
      return c.json({ error: "REASON_REQUIRED" }, 400);
    }

    const result = await reviewDocument({
      documentId: c.req.param("documentId"),
      accept: body.accept,
      reviewerUserId: session.user.id,
      rejectionReason: reason,
    });
    // 409, not 404: the document exists, it just is not in a state anybody can
    // decide about — already reviewed, or superseded by a later upload.
    if (!result.applied) return c.json({ error: "NOT_PENDING" }, 409);
    return c.json(result, 200);
  });

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


    const providerId = c.req.param("providerId");
    if (!(await canWriteProviderMedia(providerId, session.user.id))) {
      // 403, not 404: the caller is authenticated and this says nothing about
      // whether the provider exists.
      return c.json({ error: "FORBIDDEN" }, 403);
    }

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

    // Recorded after the bytes land, never before. A row pointing at a key
    // that does not exist is a broken link in the review queue; an object with
    // no row is an orphan nobody sees — the cheaper of the two failures.
    //
    // This is also where a replacement stops being a replacement: the previous
    // document of this type is superseded rather than overwritten, the new one
    // is inserted `pending` whatever the provider's standing, and if what it
    // replaced had been *accepted* the provider is flagged for re-verification.
    // An approval belongs to the bytes a reviewer looked at and cannot follow
    // the document type onto bytes that arrived afterwards.
    const record = await recordDocumentUpload({
      providerId,
      type,
      storageKey: key,
      fileName: file.name.slice(0, 200),
      contentType: file.type,
      uploadedByUserId: session.user.id,
    });

    // The key, never a URL. There is no URL that works without this Worker.
    return c.json(
      {
        key,
        size: file.size,
        contentType: file.type,
        documentId: record.id,
        status: record.status,
        // Said out loud so the wizard and the settings page can explain what
        // just happened rather than showing a silent status change.
        reopensReview: record.reopensReview,
      },
      201,
    );
  });

  /**
   * Read one back, by document id.
   *
   * This refused everyone until now, on the grounds that who may read whose
   * documents is a decision belonging with the admin review queue and the
   * queue did not exist. It does now, and this is that decision: an
   * administrator, or somebody who belongs to the workspace the document is
   * about. Nobody else, ever — the failure mode is handing an identity card to
   * the wrong person.
   *
   * By id rather than by storage key. A key in a URL is the object's address
   * in the bucket, and a screen that renders one has published it to every
   * browser that loaded the page; an id is meaningless without this route's
   * check standing behind it.
   *
   * `private, no-store`: these must not sit in a shared cache or on disk after
   * the tab closes, which is exactly what the media route's year-long
   * `immutable` would do.
   */
  app.get("/api/documents/:documentId", async (c) => {
    const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "UNAUTHENTICATED" }, 401);

    const doc = await findDocumentById(c.req.param("documentId"));
    // The permission check and the existence check answer together, so a
    // stranger guessing ids cannot learn which ones exist from the difference
    // between a 403 and a 404.
    const allowed =
      doc !== null &&
      ((await isPlatformAdmin(session.user.id)) ||
        (await canWriteProviderMedia(doc.providerId, session.user.id)));
    if (!allowed || !doc) return c.json({ error: "FORBIDDEN" }, 403);

    const bucket = c.env.DOCUMENTS_BUCKET;
    if (!bucket) return c.json({ error: "DOCUMENT_STORAGE_UNCONFIGURED" }, 503);

    const object = await bucket.get(doc.storageKey);
    if (!object) return c.json({ error: "NOT_FOUND" }, 404);

    return new Response(object.body as unknown as BodyInit, {
      headers: {
        "content-type": doc.contentType ?? "application/octet-stream",
        "cache-control": "private, no-store",
        // `inline` so a reviewer sees the document in the tab rather than
        // collecting a folder of downloaded ID cards on their laptop.
        "content-disposition": `inline; filename="${(doc.fileName ?? "document").replace(/"/g, "")}"`,
      },
    });
  });
}
