/** What a support row adds to an inbox line. Null on an inquiry. */
export interface ThreadSupport {
  subject: string;
  status: "open" | "resolved";
  audience: "customer" | "provider";
  bookingId: string | null;
}

export type ThreadType = "inquiry" | "support";

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
  type: ThreadType;
  /** Null on a personal support request — there is no provider on it. */
  providerId: string | null;
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
  /**
   * Same degrade-not-fail rule as `providerName`: empty when the lookup
   * missed, the thread has no messages yet, OR the latest message is a
   * caption-less photo — `Message.compose` allows an empty body when an
   * attachment rides along, so this alone cannot tell those apart. See
   * `lastMessageHasAttachment`.
   */
  lastMessagePreview: string;
  /**
   * True when the thread's latest message carries at least one attachment.
   * The one thing that distinguishes "no messages yet" from "a caption-less
   * photo" when `lastMessagePreview` is empty for both — `ThreadList` reads
   * this to show an attachment marker instead of the "no messages yet"
   * placeholder next to what may be a bold, unread row just sorted to the
   * top.
   */
  lastMessageHasAttachment: boolean;
  unreadCount: number;
  support: ThreadSupport | null;
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
  /** Which side wrote it. A support thread aligns and labels by this, never by comparing user ids — an admin's id means nothing to the reader. */
  senderSide: "customer" | "provider" | "platform";
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
 * nothing more. Deliberately absent: `contentType`, `sizeBytes`, `fileName`.
 * All three are read back from the object storage holds, on the server,
 * from `AttachmentStoragePort.head` — never taken from the wire. A client
 * that uploaded a genuine JPEG and then claimed a different type here would
 * undo the exact guarantee `sniffContentType` (Task 3) and the upload route
 * (Task 5) exist to provide, so the server ignores anything sent under any
 * of the three. `fileName` used to ride along here — the whole-branch review
 * found that sending one back defeated the upload route's own `hasContact`
 * check on the name: the route validates `file.name`, but a client could
 * still send back a completely different, unchecked string in THIS call.
 * The upload response (`UploadedAttachment`) still carries `fileName`, for
 * local display before send — this type is only what goes back on the wire.
 * Do not add these back "for completeness" — see `mutations.ts`'s own doc
 * comment on the backend for the same warning.
 */
export interface AttachmentDescriptor {
  storageKey: string;
}

/**
 * The three attachment limits, defined once in `@ntizo/shared/attachments`
 * and re-exported here so this feature's own modules keep importing them
 * from their domain folder.
 *
 * They used to be spelled out here, each with a comment explaining it
 * mirrored a copy in `@ntizo/backend`. That reasoning was right about the
 * constraint — `@ntizo/backend` is server-only, and depending on it to
 * reach a constant would drag database drivers into a browser bundle — but
 * it left two definitions of one rule. `@ntizo/shared` is the way out:
 * browser-safe, already a dependency of both, and already home to
 * `hasContact` for exactly this reason.
 *
 * What they are for here: refusing early, so nobody spends an upload on a
 * file the server was always going to answer 413 or 415 to. Enforcement
 * stays on the server, which decides a file's type from its bytes.
 */
export {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  ACCEPTED_ATTACHMENT_TYPES,
} from "@ntizo/shared/attachments";
