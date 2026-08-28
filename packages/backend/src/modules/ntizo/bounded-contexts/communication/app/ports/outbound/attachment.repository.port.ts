import type { AttachmentRow } from "../../../../../shared/infrastructure/database/communication/schemas";

/**
 * A file already uploaded to storage, ready to be recorded beside a
 * message. `SendMessageCommand`'s `attachments` input is a list of these —
 * Task 5's upload route builds one after `sniffContentType` and the bucket
 * write both succeed, so nothing here re-validates content type or size;
 * that already happened before this shape exists.
 */
export interface NewAttachment {
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface AttachmentRepositoryPort {
  /**
   * Writes every attachment for one message. `messageId` is a separate
   * argument rather than a field on each `NewAttachment` — exactly one
   * message id applies to the whole call, the same reason `insert`'s
   * `Message` on `MessageRepositoryPort` carries its own `threadId` instead
   * of taking it a second time: letting each element carry its own would
   * let two elements disagree on which message they belong to.
   *
   * Called with an empty array does nothing — `SendMessageCommand` only
   * calls this when there is at least one attachment.
   */
  insertMany(messageId: string, attachments: NewAttachment[]): Promise<void>;

  /**
   * Every attachment for a page of messages, in one query — never one per
   * message. A message with no attachments is absent from the map rather
   * than present with `[]`; callers read a missing entry as empty, the same
   * convention `MessageRepositoryPort.countUnreadForViewer` uses for zero.
   */
  listForMessages(messageIds: string[]): Promise<Map<string, AttachmentRow[]>>;

  /**
   * The attachment, only if `viewerUserId` may see the thread its message
   * belongs to — the customer on that thread, or a member of its provider.
   * Resolved by joining attachment → message → thread and applying the
   * exact rule `ThreadRepositoryPort.findVisible` applies, *in the query
   * itself*, so a second caller cannot forget it or re-derive it slightly
   * wrong.
   *
   * Null both when the attachment does not exist and when it exists but the
   * viewer may not see it: telling those apart would tell a caller probing
   * attachment ids which ones are real, the same reason
   * `ThreadRepositoryPort.findVisible` gives.
   */
  findVisible(attachmentId: string, viewerUserId: string): Promise<AttachmentRow | null>;
}
