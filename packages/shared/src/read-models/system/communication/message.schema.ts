import { z } from "zod";

/**
 * One file sent with a message, as the wire sees it — `storageKey` is
 * deliberately absent: a client downloads by `id`, through
 * `/api/communication/attachments/:id`, which re-checks visibility itself
 * rather than trusting a bucket key nobody has verified this viewer may
 * reach.
 */
export const messageAttachmentReadModel = z.object({
  id: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().min(0),
});

/**
 * One message, as a conversation view draws it.
 *
 * `body` carries no `.catch()`, unlike the two enriched fields on
 * `threadSummaryReadModel`: it is the message row's own column, validated by
 * `Message.compose` on the way in (see `MESSAGE_BODY_MAX`), not a value
 * resolved by a separate lookup that can come back empty. A row already in
 * `ntizo_communication.message` has a body; there is nothing here to degrade.
 *
 * `readAt` and `createdAt` are ISO strings rather than `Date`: this crosses
 * GraphQL, and a `Date` would be serialised to a string on the way anyway —
 * with the type quietly lying about it in the meantime.
 *
 * `attachments` is resolved batched, one `listForMessages` call for the
 * whole page a projection is building — never one call per message, the
 * same rule `countUnreadForViewer` and `providerName`/`customerName`
 * follow. A message with no attachments always gets `[]` here even though
 * `AttachmentRepositoryPort.listForMessages`'s map leaves it absent rather
 * than present with an empty array — that degrade-to-empty step is the
 * projection's job, not this schema's.
 */
export const messageReadModel = z.object({
  id: z.string(),
  threadId: z.string(),
  senderUserId: z.string(),
  /** Which side wrote it. The frontend aligns by this, and labels `platform` "Suporte Ntizo". */
  senderSide: z.enum(["customer", "provider", "platform"]),
  body: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
  attachments: z.array(messageAttachmentReadModel),
});

/** One page of one conversation, newest first — see `threadPageReadModel` for why `nextCursor` is opaque. */
export const messagePageReadModel = z.object({
  items: z.array(messageReadModel),
  nextCursor: z.string().nullable(),
});

export type MessageAttachmentDTO = z.infer<typeof messageAttachmentReadModel>;
export type MessageDTO = z.infer<typeof messageReadModel>;
export type MessagePageDTO = z.infer<typeof messagePageReadModel>;
