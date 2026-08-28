import type { Hono } from "hono";
import { hasContact } from "@ntizo/shared/text";
import {
  MAX_ATTACHMENT_BYTES,
  sniffContentType,
  type AttachmentRepositoryPort,
} from "@ntizo/backend/modules/ntizo/bounded-contexts/communication";
import { getAuth } from "@ntizo/backend/modules/better-auth";
import type { AppBindings } from "./types";

/**
 * A file sent inside a conversation — upload, and the read-back a stranger
 * must never be able to reach.
 *
 * Its own mount, the same reason `documents.ts` and `media.ts` are: a
 * multipart body is not something GraphQL carries well, and the download leg
 * has to stream bytes back rather than return JSON.
 *
 * The posture matches `documents.ts`, not `media.ts`. This file always came
 * from a stranger — the other party in the conversation, from the reader's
 * point of view — so there is no public URL, no CDN, and every read goes
 * through this Worker while holding a session `AttachmentRepositoryPort`
 * says may see it.
 *
 * Two legs only. There is no row written here: `insertMany` runs inside
 * `SendMessageCommand`'s transaction (Task 8's GraphQL mutation), once the
 * message this file belongs to actually exists. This route's job ends at
 * "the bytes are safely in the bucket, and here is what to send back with
 * the message" — the same reason `NewAttachment` carries no `id`.
 */
export interface AttachmentDeps {
  /** `bootstrapCommunication(...).adapters.attachmentRepository` — see that bootstrap's doc comment for why it is handed over directly rather than through a use case. */
  readonly attachmentRepository: AttachmentRepositoryPort;
}

/**
 * Strips what turns a stored file name into a header-injection payload: the
 * quote that would otherwise end the `filename="..."` value early, and every
 * control character — CR and LF included. Nothing upstream of this function
 * guarantees a clean name: `NewAttachment.fileName` is whatever the caller
 * who built the descriptor sent along with `sendMessage`, not necessarily the
 * same string this route's own upload leg produced, and the download leg has
 * to be safe on its own.
 */
function safeFilenameForHeader(fileName: string): string {
  // eslint-disable-next-line no-control-regex -- deliberately matching CR/LF and other control bytes, not a typo.
  return fileName.replace(/["\r\n\x00-\x1f\x7f]/g, "");
}

export function mountAttachments(app: Hono<{ Bindings: AppBindings }>, deps: AttachmentDeps) {
  /**
   * Upload one file, ahead of the message it will ride with.
   *
   * Every check the browser already made is made again here — `accept` on a
   * file input, and the client's own `hasContact` pass over the message body,
   * are both hints in code the caller controls. A curl bypasses either in one
   * request.
   */
  app.post("/api/communication/attachments", async (c) => {
    // Session first, infrastructure second — same order `documents.ts` and
    // `media.ts` use, and for the same reason: an anonymous caller should not
    // learn anything about this deployment's storage.
    const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "UNAUTHENTICATED" }, 401);

    const bucket = c.env.ATTACHMENTS_BUCKET;
    if (!bucket) return c.json({ error: "ATTACHMENT_STORAGE_UNCONFIGURED" }, 503);

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "NO_FILE" }, 400);

    // `file.size` is already known from the parsed multipart part — refusing
    // on it costs nothing and happens before a single byte of an oversized
    // upload is read into an `ArrayBuffer`.
    if (file.size > MAX_ATTACHMENT_BYTES) return c.json({ error: "TOO_LARGE" }, 413);

    // The exact same detector the browser runs over the message body, run
    // here over the file's NAME. A client-side check on the body is one curl
    // away from irrelevant, and a file name is the obvious way around a rule
    // that only ever looked at the body.
    if (hasContact(file.name)) return c.json({ error: "CONTACT_IN_FILE_NAME" }, 422);

    const bytes = new Uint8Array(await file.arrayBuffer());
    // Checked again against what was actually read, not only the size the
    // multipart part declared.
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) return c.json({ error: "TOO_LARGE" }, 413);

    // The bytes decide, never `file.type` — that is a value the uploader
    // chose. See `sniffContentType`'s own doc comment for why trusting it
    // back is the exact bypass this function exists to close.
    const contentType = sniffContentType(bytes);
    if (!contentType) return c.json({ error: "UNACCEPTED_TYPE" }, 415);

    const fileName = file.name.slice(0, 200);
    const key = `attachment/${session.user.id}/${Date.now()}-${crypto.randomUUID()}`;

    // The bytes land in the bucket BEFORE anything is returned. The reverse —
    // a row (or a descriptor a caller could trust) before the bytes exist —
    // leaves a message that can point at a file that was never written; this
    // order leaves, at worst, a sweepable orphan nobody using the product can
    // ever see.
    await bucket.put(key, bytes, {
      httpMetadata: {
        contentType,
        // Never cached anywhere but the browser that asked, and not for
        // long — same posture as `documents.ts`, for the same reason: this
        // came from a stranger and was never meant to be public.
        cacheControl: "private, max-age=0, no-store",
      },
      customMetadata: {
        uploadedByUserId: session.user.id,
        originalName: fileName,
      },
    });

    // Shaped exactly like `NewAttachment`, deliberately: the caller holds
    // onto this and sends it back verbatim as one element of `sendMessage`'s
    // `attachments` input. No `id` — none exists until that call writes the
    // row.
    return c.json({ storageKey: key, fileName, contentType, sizeBytes: bytes.byteLength }, 201);
  });

  /**
   * Read one file back, by attachment id.
   *
   * Permission and existence answer together: `findVisible` returns null
   * both when the id belongs to nobody the caller may see and when the id
   * simply does not exist, so this cannot be used to learn which attachment
   * ids are real. See `AttachmentRepositoryPort.findVisible`'s doc comment.
   *
   * `attachment`, never `inline`. `documents.ts` serves `inline` because its
   * reader is an administrator looking at an identity card on our own
   * domain; every file behind this route arrived from a stranger, and
   * `inline` would let it render — and, for an HTML or SVG-adjacent type,
   * execute — on this origin instead of only ever being saved to disk.
   */
  app.get("/api/communication/attachments/:id", async (c) => {
    const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "UNAUTHENTICATED" }, 401);

    const row = await deps.attachmentRepository.findVisible(c.req.param("id"), session.user.id);
    if (!row) return c.json({ error: "FORBIDDEN" }, 403);

    const bucket = c.env.ATTACHMENTS_BUCKET;
    if (!bucket) return c.json({ error: "ATTACHMENT_STORAGE_UNCONFIGURED" }, 503);

    const object = await bucket.get(row.storageKey);
    // The row passed the visibility check above; a missing object here is
    // the bucket and the table disagreeing, not a permission question.
    if (!object) return c.json({ error: "NOT_FOUND" }, 404);

    return new Response(object.body as unknown as BodyInit, {
      headers: {
        "content-type": row.contentType,
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${safeFilenameForHeader(row.fileName)}"`,
      },
    });
  });
}
