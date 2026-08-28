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
 * One file riding with a message, as a conversation view draws it.
 *
 * No `storageKey` — same reason `messageAttachmentReadModel` on the backend
 * omits it: a client downloads by `id`, through
 * `/api/communication/attachments/:id`, which re-checks visibility itself
 * rather than trusting a bucket key nobody here has verified this viewer may
 * reach. `contentType` and `sizeBytes` are what a display needs to choose a
 * thumbnail versus a file card and to show a size — both read back from
 * storage server-side, never from anything a client claimed (see
 * `AttachmentDescriptor`'s own doc comment for the other half of that
 * split: what a client is trusted to say on the way *up*).
 */
export interface MessageAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
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
  /** Always present — `[]` for a message with none, never omitted. See `messageReadModel`'s own doc comment for why the projection guarantees this rather than a display having to. */
  attachments: readonly MessageAttachment[];
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

/**
 * What a client may say about one already-uploaded file when it sends a
 * message — the same shape `SendMessageCommand`'s `AttachmentDescriptor`
 * accepts on the wire (`communicationSend`'s `attachments` input), and
 * nothing more. Deliberately absent: `contentType`, `sizeBytes`. Both are
 * read back from the object storage holds, on the server, from
 * `AttachmentStoragePort.head` — never taken from the wire. A client that
 * uploaded a genuine JPEG and then claimed a different type here would undo
 * the exact guarantee `sniffContentType` (Task 3) and the upload route
 * (Task 5) exist to provide, so the server ignores anything sent under
 * either key. Do not add them back "for completeness" — see
 * `mutations.ts`'s own doc comment on the backend for the same warning.
 */
export interface AttachmentDescriptor {
  storageKey: string;
  fileName: string;
}

/**
 * The most attachments one message may carry. Mirrors, not imports,
 * `MAX_ATTACHMENTS` in
 * `packages/backend/.../communication/domain/aggregates/message.aggregate.ts`
 * — this app has no dependency on `@ntizo/backend` (a server-only package:
 * database drivers, Node-only infrastructure) and adding one just to reach a
 * single constant would drag that whole graph into a browser bundle. Same
 * trade `MESSAGE_BODY_MAX_LENGTH` above already makes for `MESSAGE_BODY_MAX`.
 * A picker built on this must stop someone at this count, not let them
 * attach a sixth file only to have `communicationSend` refuse it as
 * `TOO_MANY_ATTACHMENTS`.
 */
export const MAX_ATTACHMENTS = 5;

/**
 * 10 MB. Mirrors, not imports, `MAX_ATTACHMENT_BYTES` in
 * `packages/backend/.../communication/domain/attachment.ts` — same reason
 * `MAX_ATTACHMENTS` above mirrors rather than imports. A picker built on
 * this must refuse an oversized file before spending a single byte of
 * upload on one the server was always going to answer `413` to.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * What the upload route will ever accept, sniffed from the file's own bytes
 * server-side — mirrors, not imports, `ACCEPTED_ATTACHMENT_TYPES` in
 * `packages/backend/.../communication/domain/attachment.ts`, for the same
 * reason `MAX_ATTACHMENTS` above does. Exists for exactly one consumer:
 * `AttachmentPicker`'s file input `accept` attribute — a hint to the file
 * dialog, not enforcement; the server decides from bytes, never from this
 * list or from `file.type`, which the picker's caller chose.
 */
export const ACCEPTED_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
