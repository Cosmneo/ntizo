/**
 * The most recent message's body, per thread, for an inbox row's preview
 * text — plus whether that same message carries an attachment.
 *
 * A read-tier port of its own, for the same reason `ProviderNameReaderPort`
 * beside this file is one: the write tier's `MessageRepositoryPort` has no
 * batched "last message per thread" — it has `listForThread`, one thread at a
 * time, which is the wrong shape for a page of twenty rows. Batched here, one
 * query for the whole page, so an inbox costs a constant number of round
 * trips regardless of how many rows are on it.
 */
export interface ThreadPreviewReaderPort {
  /**
   * Thread id → `{ body, hasAttachment }` for its latest message. A thread
   * absent from the map has no messages yet — the same "absent means
   * nothing to say" convention `countUnreadForViewer` uses for zero.
   *
   * `hasAttachment` is what lets the projection tell "no messages yet" apart
   * from "the latest message is a caption-less photo" — both would
   * otherwise present as an empty `body`, since `Message.compose` allows one
   * when an attachment rides along. See `threadSummaryReadModel`'s own doc
   * comment on `lastMessageHasAttachment` for the row this disambiguates.
   */
  findLastMessageBodies(threadIds: string[]): Promise<Map<string, { body: string; hasAttachment: boolean }>>;
}
