import { z } from "zod";

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
 */
export const messageReadModel = z.object({
  id: z.string(),
  threadId: z.string(),
  senderUserId: z.string(),
  body: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

/** One page of one conversation, newest first — see `threadPageReadModel` for why `nextCursor` is opaque. */
export const messagePageReadModel = z.object({
  items: z.array(messageReadModel),
  nextCursor: z.string().nullable(),
});

export type MessageDTO = z.infer<typeof messageReadModel>;
export type MessagePageDTO = z.infer<typeof messagePageReadModel>;
