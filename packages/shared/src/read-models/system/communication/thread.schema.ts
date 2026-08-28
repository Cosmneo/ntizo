import { z } from "zod";

/**
 * One row of somebody's inbox — a customer's list of the providers they have
 * messaged, or a provider's list of the customers who have messaged them.
 * Same shape for both: the projection that builds either page enriches a
 * `Thread` aggregate the identical way.
 *
 * **Both `providerName` and `customerName` are always on this row — which
 * one is authoritative depends on which inbox is asking, not on this
 * schema.** A customer's own inbox (`ListMyThreadsProjection`) displays
 * `providerName` — the provider they're talking to. A provider's own inbox
 * (`ListProviderThreadsProjection`) displays `customerName` — the customer
 * they're talking to. Neither projection omits the field it doesn't
 * display; both fields are always resolved, on every row, for both call
 * sites, because one shared model is what lets both lists reuse the same
 * enrichment code (`toThreadSummaries`) rather than diverging into two
 * near-duplicate DTOs. A reader who only ever looks at one inbox will see
 * the field they don't use sitting there unused — that is expected, not a
 * bug to chase.
 *
 * `providerName`, `customerName` and `lastMessagePreview` all get
 * `.catch("")`: each is filled in by a batched lookup the projection runs
 * *beside* the thread page — a provider's current name, a customer's
 * current display name, a thread's latest message body — rather than a
 * column `thread` itself carries. A lookup that comes back empty for one row
 * (a provider deactivated between the query and the response, a customer
 * with no profile row yet, a thread with no messages yet) must degrade that
 * one row, not fail the whole page the way a bare `z.string()` would — the
 * same reason `activityEntryReadModel.payload` carries one.
 *
 * `lastMessageHasAttachment` disambiguates two cases that otherwise look
 * identical through `lastMessagePreview` alone: a thread with no messages
 * yet (`lastMessagePreview: ""`, this field `false`) and a thread whose
 * latest message is a caption-less photo (`lastMessagePreview: ""` too —
 * `Message.compose` allows an empty body when an attachment rides along —
 * but this field `true`). Without it, an inbox row for the second case
 * rendered the "no messages yet" placeholder next to a bold unread badge on
 * a thread just sorted to the top. `.catch(false)` for the same
 * degrade-not-fail reason the other three fields get one.
 */
export const threadSummaryReadModel = z.object({
  id: z.string(),
  providerId: z.string(),
  providerName: z.string().catch(""),
  /** The customer's own current display name — see this model's own doc comment on which side reads which field. */
  customerName: z.string().catch(""),
  lastMessageAt: z.string(),
  lastMessagePreview: z.string().catch(""),
  lastMessageHasAttachment: z.boolean().catch(false),
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
