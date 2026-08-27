import { z } from "zod";

/**
 * One row of somebody's inbox — a customer's list of the providers they have
 * messaged, or a provider's list of the customers who have messaged them.
 * Same shape for both: the projection that builds either page enriches a
 * `Thread` aggregate the identical way.
 *
 * `providerName` and `lastMessagePreview` get `.catch("")`: both are filled
 * in by a batched lookup the projection runs *beside* the thread page — a
 * provider's current name, a thread's latest message body — rather than a
 * column `thread` itself carries. A lookup that comes back empty for one row
 * (a provider deactivated between the query and the response, a thread
 * with no messages yet) must degrade that one row, not fail the whole page
 * the way a bare `z.string()` would — the same reason
 * `activityEntryReadModel.payload` carries one.
 */
export const threadSummaryReadModel = z.object({
  id: z.string(),
  providerId: z.string(),
  providerName: z.string().catch(""),
  lastMessageAt: z.string(),
  lastMessagePreview: z.string().catch(""),
  unreadCount: z.number().int().min(0),
});

/**
 * A page of somebody's inbox.
 *
 * `nextCursor` is opaque, same as `activityPageReadModel`'s and
 * `<...>MessagePage`'s below: a client that parsed it would depend on the
 * repository's ordering columns, and changing them would then be a breaking
 * change to every caller.
 */
export const threadPageReadModel = z.object({
  items: z.array(threadSummaryReadModel),
  nextCursor: z.string().nullable(),
});

export type ThreadSummaryDTO = z.infer<typeof threadSummaryReadModel>;
export type ThreadPageDTO = z.infer<typeof threadPageReadModel>;
