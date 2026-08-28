import type { AcceptedAttachmentType } from "@ntizo/shared/attachments";

// Both re-exported so this context's barrel keeps its shape for callers;
// defined in @ntizo/shared because the browser enforces the same two rules.
export { MAX_ATTACHMENT_BYTES, ACCEPTED_ATTACHMENT_TYPES } from "@ntizo/shared/attachments";

/**
 * What a file may be, and how big it may be, when it rides along with a
 * message.
 *
 * No exception classes live here. `MessageEmptyError` and friends in
 * `./exceptions.ts` exist because a domain aggregate throws them; nothing in
 * this file is called from inside an aggregate's write path. The upload
 * route (Task 5) is the caller, and it answers a bad upload the way
 * `apps/backend/api/src/media.ts` already does — a status code (413 too
 * large, 415 unsupported type, 422 unprocessable) — not a thrown domain
 * error. A domain exception nothing throws is dead surface.
 */



/**
 * What the file actually is, from its leading bytes.
 *
 * This deliberately departs from the pattern `media.ts` uses. `isImage(file.type)`
 * there decides using the content type the *uploader declared* — a value the
 * attacker chooses. An HTML file announced as `application/pdf`, stored, and
 * served back as a PDF is script running on our own origin. So here the
 * bytes decide, never the caller's claim. Do not "fix" this back to trusting
 * a declared/passed-in type — that is the exact bypass this function exists
 * to close, and Step 5 of Task 3's brief proves it: falling back to the
 * caller's declared type when the bytes don't match reds the HTML and SVG
 * tests immediately.
 *
 * Returns null for anything not on `ACCEPTED_ATTACHMENT_TYPES`, SVG
 * included. SVG has no binary magic number — it's XML — so nothing here
 * matches it; that absence of a match *is* the protection, not an oversight.
 * SVG is a legitimate image format that can carry `<script>`, and there is
 * no version of serving one back to another user that is worth it.
 */
export function sniffContentType(bytes: Uint8Array): AcceptedAttachmentType | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);

  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  // WebP is a RIFF container: RIFF at offset 0 alone also matches WAV and
  // other RIFF-based formats, so the WEBP tag at offset 8 must match too.
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}
