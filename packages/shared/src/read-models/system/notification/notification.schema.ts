import { z } from "zod";

/**
 * One item as an inbox draws it.
 *
 * **`payload` is deliberately unconstrained.** Every notification type carries
 * different facts — a provider name here, a role and an inviter there — and
 * pinning a union of thirty shapes into the read model would mean editing this
 * file for every new type, in a package both the backend and the frontend
 * depend on. The cell that renders a type is what knows that type's fields, and
 * it is where a wrong assumption should fail.
 *
 * `read` is resolved per reader by the projection, so the same workspace item
 * is `true` for the member who opened it and `false` for their colleague.
 *
 * `createdAt` is an ISO string rather than a Date: this crosses GraphQL, and a
 * Date would be serialised to a string anyway — with the type quietly lying
 * about it on the way.
 */
export const notificationReadModel = z.object({
  id: z.string().min(1),
  /** A `NotificationType` value. Not the enum: an unknown type must render as unknown, not 500. */
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  read: z.boolean(),
});

/**
 * A page of an inbox, and how many there are in total.
 *
 * `total` is not `items.length` — that is how many fit on this page. The same
 * distinction `providerList` settled on, for the same reason.
 */
export const inboxPageReadModel = z.object({
  items: z.array(notificationReadModel),
  total: z.number().int(),
});

/** Just the badge's number. Its own query so the bell never fetches a page it will not draw. */
export const unreadCountReadModel = z.object({
  count: z.number().int(),
});

export type NotificationDTO = z.infer<typeof notificationReadModel>;
export type InboxPageDTO = z.infer<typeof inboxPageReadModel>;
export type UnreadCountDTO = z.infer<typeof unreadCountReadModel>;
