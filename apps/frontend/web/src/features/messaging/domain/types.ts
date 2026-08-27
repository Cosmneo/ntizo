/**
 * One conversation, as an inbox row.
 *
 * The same shape serves a customer's list of the providers they have
 * messaged and a provider's list of the customers who have messaged them —
 * the read side enriches a `Thread` aggregate identically for both
 * (`ListMyThreadsProjection` / `ListProviderThreadsProjection`), so one
 * frontend type covers both lists rather than two near-duplicates.
 *
 * **Both `providerName` and `customerName` are always present — which one a
 * screen displays depends on whose inbox it is, not on this type.**
 * `CustomerMessagesPage`/`ThreadList`'s default show `providerName` (the
 * provider a customer is talking to); `ProviderMessagesPage` passes
 * `ThreadList` a `nameOf` that reads `customerName` instead (the customer a
 * workspace is talking to) — see that component's own doc comment. Neither
 * field is optional here or on the wire; the backend resolves both for
 * every row regardless of which side asked, for the same reason
 * `threadSummaryReadModel`'s own doc comment gives: one shared enrichment
 * function, not two near-duplicate ones that would drift.
 */
export interface Thread {
  id: string;
  providerId: string;
  /**
   * Filled in by a lookup the backend runs beside the thread page, not a
   * column the thread itself carries. Empty string when that lookup missed
   * for this one row (e.g. the provider was deactivated between the query
   * and the response) — a degraded row, not a failed page.
   */
  providerName: string;
  /** The customer's own current display name. Same degrade-not-fail rule as `providerName` — see this type's own doc comment on which side reads which field. */
  customerName: string;
  /** ISO 8601. Threads list newest-last-message-first, ordered by this. */
  lastMessageAt: string;
  /** Same degrade-not-fail rule as `providerName`: empty when the lookup missed, or the thread has no messages yet. */
  lastMessagePreview: string;
  unreadCount: number;
}

/**
 * One message, as a conversation view draws it.
 *
 * `readAt` is `null` until the recipient marks the thread read — see
 * `useSendMessage`'s and the provider/customer inboxes' `markRead` calls.
 */
export interface Message {
  id: string;
  threadId: string;
  senderUserId: string;
  body: string;
  /** ISO 8601, or null while unread. */
  readAt: string | null;
  /** ISO 8601. Messages list newest-first — the order the wire sends them in; nothing in this feature re-sorts. */
  createdAt: string;
}

/**
 * The server refuses a message body longer than this as `VALIDATION_ERROR`
 * — `communicationSend`'s input schema carries
 * `z.string().trim().min(1).max(4000)`, mirroring (not importing)
 * `Message.compose`'s own `MESSAGE_BODY_MAX`, the same split `review`'s
 * rating bound makes between the edge and the aggregate that owns the rule.
 *
 * A composer built on `useSendMessage` must stop someone at this length, not
 * let them type past it and find out only after they hit send.
 */
export const MESSAGE_BODY_MAX_LENGTH = 4000;
