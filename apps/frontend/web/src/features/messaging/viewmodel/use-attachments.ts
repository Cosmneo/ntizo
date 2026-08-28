import { useCallback, useState } from "react";
import { hasContact } from "@ntizo/shared/text";
import {
  AttachmentUploadError,
  uploadAttachment,
} from "@/features/messaging/data/attachment.repository";
import {
  ACCEPTED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  type AttachmentDescriptor,
} from "@/features/messaging/domain/types";

/** Server codes `uploadAttachment` can throw that deserve their own sentence. Anything else falls back to `attachmentError.GENERIC`. */
const KNOWN_UPLOAD_ERRORS = new Set([
  "TOO_LARGE",
  "UNACCEPTED_TYPE",
  "CONTACT_IN_FILE_NAME",
  "ATTACHMENT_STORAGE_UNCONFIGURED",
  "NO_FILE",
  "UNAUTHENTICATED",
]);

/**
 * One file picked for the message being composed, not yet sent.
 *
 * `errorKey` is set the moment a file is picked, before any network call —
 * a bad type, an oversized file, or a name carrying a contact are all
 * checkable locally, the same three checks the upload route repeats
 * server-side (see `attachments.ts`'s own doc comment: "every check the
 * browser already made is made again here"). `uploadAll` also writes into
 * this field, with the server's own code, if a file that passed the local
 * checks is refused anyway — a race where the file changed between pick and
 * submit, or a session that expired in between.
 */
export interface PendingAttachment {
  /** Client-local only — never sent anywhere. Lets a list re-render by identity while a `File` has no id of its own. */
  id: string;
  file: File;
  /** An `attachmentError.*` i18next key, or `null` while this file is clean. */
  errorKey: string | null;
}

function validate(file: File): string | null {
  // The bytes decide server-side (`sniffContentType`) — `file.type` is only
  // ever a hint here, same posture the upload route documents for its own
  // `accept` attribute. Checked first anyway: it is free, and catches the
  // common case (a `.docx` someone tried to attach) before a slower check.
  if (!(ACCEPTED_ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
    return "attachmentError.UNACCEPTED_TYPE";
  }
  if (file.size > MAX_ATTACHMENT_BYTES) return "attachmentError.TOO_LARGE";
  // The exact same detector the composer runs over the message body (see
  // `MessageComposer`), run here over the file's NAME — the obvious way
  // around a rule that only ever looked at the body. The upload route makes
  // the identical check again server-side; this is the early, in-the-moment
  // version of it.
  if (hasContact(file.name)) return "attachmentError.CONTACT_IN_FILE_NAME";
  return null;
}

/**
 * The files a composer is about to send, from pick through upload.
 *
 * Picking is entirely local and synchronous (`add`/`remove`) — nothing hits
 * the network until `uploadAll` runs, which a caller does once, at submit
 * time, not per file as it is picked. That keeps a composer's "sending" state
 * meaning one thing (the whole submit, not some files uploaded and others
 * still picked) and means a file someone changes their mind about
 * (`remove`) before hitting send never touched the network at all.
 *
 * `uploadAll` resolves to `null` — never a partial list — the moment any
 * file fails. A caller must not send a message referencing only the
 * attachments that happened to upload first; the failed file's own
 * `errorKey` is updated in place so the picker can show exactly which one
 * and why, and the caller's job is only to not call `onSend`.
 */
export function useAttachments() {
  const [files, setFiles] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const add = useCallback((file: File) => {
    setFiles((prev) => {
      // The picker itself disables past the cap — this is the second line
      // of defence, the same "every check made again" reasoning the upload
      // route documents, applied one layer further up.
      if (prev.length >= MAX_ATTACHMENTS) return prev;
      return [...prev, { id: crypto.randomUUID(), file, errorKey: validate(file) }];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const reset = useCallback(() => setFiles([]), []);

  /**
   * Uploads every picked file, in pick order, stopping at the first failure.
   *
   * Sequential, not `Promise.all` — `MAX_ATTACHMENTS` is small (5), and a
   * caller mid-upload cancelling by navigating away leaves at most one
   * in-flight request rather than five, which matters more on the mobile
   * connections this product's own field research says its users are on
   * than the latency five sequential round trips costs here.
   */
  const uploadAll = useCallback(async (): Promise<AttachmentDescriptor[] | null> => {
    if (files.some((f) => f.errorKey !== null)) return null;
    if (files.length === 0) return [];

    setUploading(true);
    try {
      const descriptors: AttachmentDescriptor[] = [];
      for (const pending of files) {
        try {
          const uploaded = await uploadAttachment(pending.file);
          // `fileName` is deliberately not forwarded — see
          // `AttachmentDescriptor`'s own doc comment. The upload response
          // still carries it (`uploaded.fileName`), but only for local
          // display; `sendMessage` never needs it back.
          descriptors.push({ storageKey: uploaded.storageKey });
        } catch (err) {
          const code =
            err instanceof AttachmentUploadError && KNOWN_UPLOAD_ERRORS.has(err.code)
              ? err.code
              : "GENERIC";
          const id = pending.id;
          setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, errorKey: `attachmentError.${code}` } : f)),
          );
          return null;
        }
      }
      return descriptors;
    } finally {
      setUploading(false);
    }
  }, [files]);

  return { files, add, remove, reset, uploading, uploadAll };
}
