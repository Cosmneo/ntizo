/**
 * What storage independently knows about a file already uploaded — the
 * facts Task 5's upload route stamped on the R2 object itself, not
 * anything a caller claims.
 *
 * `contentType` is the SNIFFED type `sniffContentType` decided from the
 * bytes (`httpMetadata.contentType`), and `sizeBytes` is the object's own
 * size — neither is ever taken from a caller's descriptor. See
 * `apps/backend/api/src/attachments.ts` for exactly what the upload route
 * writes.
 */
export interface StoredAttachmentMetadata {
  readonly contentType: string;
  readonly sizeBytes: number;
  /**
   * `customMetadata.uploadedByUserId`, verbatim — an independent record of
   * who uploaded this object, kept apart from whatever prefix the storage
   * key happens to carry. Null when the object exists but was never stamped
   * with one; `SendMessageCommand` treats that exactly like "not this
   * sender's file", the same refusal a missing object gets.
   */
  readonly uploadedByUserId: string | null;
}

/**
 * Reads back what storage knows about one already-uploaded file — never
 * writes, never deletes; uploading is Task 5's route, not this port.
 *
 * `SendMessageCommand` is the only caller, and the only reason this port
 * exists: the client's `sendMessage` input carries just a storage key and a
 * file name (see that command's own doc comment for why `contentType` and
 * `sizeBytes` are never taken from the wire), and this is where the real
 * values — and proof the object exists at all — come from instead.
 *
 * An outbound port rather than a direct R2 call from here: `packages/backend`
 * must build without the Workers type package, and the real binding lives in
 * `apps/backend/api` — see `apps/backend/api/src/attachment-storage.adapter.ts`.
 * Injected through `CommunicationBootstrapDeps` the same way
 * `RaiseNotificationInternalPort` already is.
 */
export interface AttachmentStoragePort {
  /**
   * Null when no object exists at `storageKey` — a caller-forged key, an
   * upload that never completed, or a key that simply belongs to a
   * different bucket entirely. `SendMessageCommand` refuses all three the
   * same way, on purpose: telling them apart would tell a caller probing
   * storage keys which ones are real.
   */
  head(storageKey: string): Promise<StoredAttachmentMetadata | null>;
}
