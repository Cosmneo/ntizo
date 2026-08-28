import { API_BASE_URL } from "@/shared/lib/api/auth-client";

/**
 * What `POST /api/communication/attachments` answers with — shaped exactly
 * like `AttachmentDescriptor` on the wire, plus the two fields the server
 * read back from storage rather than trusted from the upload: `contentType`
 * (the sniffed type, never `file.type`) and `sizeBytes` (the bytes actually
 * read, never `file.size`). A caller sending this back to `communicationSend`
 * uses only `storageKey` and `fileName` — see `AttachmentDescriptor`'s own
 * doc comment in `domain/types.ts`.
 */
export interface UploadedAttachment {
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * Carries the server's own code so a caller can say something specific — the
 * upload route answers one of `TOO_LARGE` (413), `UNACCEPTED_TYPE` (415),
 * `CONTACT_IN_FILE_NAME` (422), `ATTACHMENT_STORAGE_UNCONFIGURED` (503),
 * `NO_FILE` (400) or `UNAUTHENTICATED` (401). See `apps/backend/api/src/attachments.ts`.
 */
export class AttachmentUploadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AttachmentUploadError";
  }
}

/**
 * Sends one file, ahead of the message it will ride with.
 *
 * Its own mount rather than GraphQL, same reason `document.repository.ts`
 * gives: a multipart body is not something GraphQL carries well. Follows
 * that file's own shape closely — `FormData`, `fetch` with
 * `credentials: "include"`, and the same tolerant JSON parse, because a
 * proxy error page or a truncated response is not JSON and must not surface
 * as a raw `SyntaxError` to a caller expecting an `AttachmentUploadError`.
 */
export async function uploadAttachment(file: File): Promise<UploadedAttachment> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/communication/attachments`, {
    method: "POST",
    credentials: "include",
    body: form,
  });

  const text = await response.text();
  let body: (UploadedAttachment & { error?: string }) | undefined;
  if (text) {
    try {
      body = JSON.parse(text) as UploadedAttachment & { error?: string };
    } catch {
      // A proxy error page or a truncated response is not JSON. Fall through
      // to the status-based error rather than throwing a raw SyntaxError.
    }
  }

  if (!response.ok) throw new AttachmentUploadError(body?.error ?? `HTTP_${response.status}`);
  if (!body) throw new AttachmentUploadError("MALFORMED_RESPONSE");
  return body;
}

/**
 * Carries the server's own code for a failed read-back — `UNAUTHENTICATED`
 * (401, no session), `FORBIDDEN` (403, `findVisible` returned nothing — the
 * same answer for "not yours" and "does not exist", see that port's own doc
 * comment), `NOT_FOUND` (404, the bucket and the table disagree) or
 * `ATTACHMENT_STORAGE_UNCONFIGURED` (503).
 */
export class AttachmentDownloadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AttachmentDownloadError";
  }
}

/**
 * Reads one file's bytes back, by attachment id.
 *
 * `credentials: "include"` for the same reason every session-authed fetch in
 * this app carries it: the route reads the caller from the session cookie,
 * not from anything this function sends. Deliberately a plain `fetch`, not
 * wired into any render path automatically — a caller decides when to call
 * this, which is what makes "an attachment's bytes are fetched only once
 * somebody opens it" true. See `AttachmentList`'s own doc comment.
 *
 * A failure response is JSON (`{ error: "..." }`), the same shape the upload
 * route uses; a success response is raw bytes, so the JSON parse only ever
 * runs on the failure branch.
 */
export async function fetchAttachmentBlob(id: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/communication/attachments/${id}`, {
    credentials: "include",
  });

  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) code = body.error;
    } catch {
      // Not JSON — keep the status-based code rather than throwing a raw
      // SyntaxError, same tolerance `uploadAttachment` gives the upload leg.
    }
    throw new AttachmentDownloadError(code);
  }

  return await response.blob();
}
