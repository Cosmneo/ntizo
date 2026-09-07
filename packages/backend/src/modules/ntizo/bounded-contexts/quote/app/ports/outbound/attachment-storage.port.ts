/**
 * What storage independently knows about a file already uploaded — the
 * facts the upload route stamped on the R2 object itself, not anything a
 * caller claims. See the Communication context's own copy of this port,
 * `communication/app/ports/outbound/attachment-storage.port.ts`, for exactly
 * what the upload route writes and why each field is trusted from storage
 * rather than the wire.
 */
export interface StoredAttachmentMetadata {
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly uploadedByUserId: string | null;
  readonly originalName: string | null;
}

/**
 * Reads back what storage knows about one already-uploaded file — never
 * writes, never deletes; uploading is the route's job, not this port.
 *
 * **Deliberately structurally identical to Communication's own
 * `AttachmentStoragePort`, declared again here rather than imported**, for
 * the reason `raise-notification.port.ts` gives: no `app/` tree imports
 * another context's `app/` tree. The two interfaces agreeing in shape is
 * what lets the composition root fill both with the same R2 adapter, with no
 * translating adapter in between — an accident of both contexts needing the
 * same fact about the same kind of object, not a coupling either is allowed
 * to assume.
 */
export interface AttachmentStoragePort {
  /**
   * Null when no object exists at `storageKey` — a caller-forged key, an
   * upload that never completed, or a key that simply belongs to a
   * different bucket entirely. Callers refuse all three the same way, on
   * purpose: telling them apart would tell a caller probing storage keys
   * which ones are real.
   */
  head(storageKey: string): Promise<StoredAttachmentMetadata | null>;
}
