import type { Hono } from "hono";
import type { QuoteAttachmentRepositoryPort } from "@ntizo/backend/modules/ntizo/bounded-contexts/quote";
import { getAuth } from "@ntizo/backend/modules/better-auth";
import { isPlatformAdmin } from "./admin-access";
import type { AppBindings } from "./types";

export interface QuoteAttachmentDeps {
  readonly quoteAttachmentRepository: QuoteAttachmentRepositoryPort;
}

/**
 * Strips what turns a stored file name into a header-injection payload: the
 * quote that would otherwise end the `filename="..."` value early, the
 * backslash that could escape it instead, and every control character — CR
 * and LF included. Mirrors `attachments.ts`'s function of the same name,
 * because nothing upstream of this route guarantees a clean name either —
 * `fileName` on a quote attachment is whatever the uploader's file name was,
 * truncated by the messaging route's upload leg but never otherwise
 * sanitised.
 */
function safeFilenameForHeader(fileName: string): string {
  // eslint-disable-next-line no-control-regex -- deliberately matching CR/LF and other control bytes.
  return fileName.replace(/["\\\r\n\x00-\x1f\x7f]/g, "");
}

/**
 * UUID-shaped — any version, not just v4. `quote_attachment.id` is a `uuid`
 * column; an id that is not this shape reaches Postgres as a cast error,
 * which is a 500 on a route whose whole design is that every failure
 * answers the same 403. Checked here, before the repository is ever called,
 * so a malformed id is refused the same way an id that is merely not this
 * caller's is.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A quote's files, served the way a document is and never the way media is:
 * permission and existence are answered together, so a stranger guessing ids
 * learns nothing from the difference between 403 and 404; and
 * `content-disposition: attachment`, never `inline`, because the file came
 * from a stranger and is opened by the other side of a deal — forcing a
 * download takes away its ability to execute on our origin.
 *
 * **Upload goes through the messaging route, not a new one.** The key
 * convention (`attachment/<userId>/…`), the byte-sniffed content type and the
 * size limit are all already enforced there, and a second uploader would be a
 * second place for those three rules to drift.
 */
export function mountQuoteAttachments(app: Hono<{ Bindings: AppBindings }>, deps: QuoteAttachmentDeps) {
  app.get("/api/quote/attachments/:id", async (c) => {
    // Session first, infrastructure second — same order every other
    // download route in this app uses, so an anonymous caller learns
    // nothing about this deployment's storage.
    const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "UNAUTHENTICATED" }, 401);

    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "FORBIDDEN" }, 403);

    // `findVisible` admits the quote's customer or a member of its provider
    // — the closed pair. Only for an administrator does a refusal there fall
    // through to `findAny`: an admin is not a party to the deal, but the
    // platform must still be able to open a file on a quote it is
    // adjudicating (a dispute, a support request). Never a bypass on
    // `findVisible` itself — that would let an admin read any quote's files
    // by id with no administrative reason on record.
    let row = await deps.quoteAttachmentRepository.findVisible(id, session.user.id);
    if (!row && (await isPlatformAdmin(session.user.id))) {
      row = await deps.quoteAttachmentRepository.findAny(id);
    }
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
