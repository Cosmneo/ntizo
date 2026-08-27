/**
 * The most recent message's body, per thread, for an inbox row's preview
 * text.
 *
 * A read-tier port of its own, for the same reason `ProviderNameReaderPort`
 * beside this file is one: the write tier's `MessageRepositoryPort` has no
 * batched "last message per thread" — it has `listForThread`, one thread at a
 * time, which is the wrong shape for a page of twenty rows. Batched here, one
 * query for the whole page, so an inbox costs a constant number of round
 * trips regardless of how many rows are on it.
 */
export interface ThreadPreviewReaderPort {
  /** Thread id → its latest message's body. A thread absent from the map has no messages yet. */
  findLastMessageBodies(threadIds: string[]): Promise<Map<string, string>>;
}
