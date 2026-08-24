import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * Four mutations, not one with nullable arguments.
 *
 * Marking one item read and marking an inbox read are different intentions,
 * and a single `markRead(id?, providerId?, all?)` makes every audit of who
 * dismissed what unreadable — you cannot tell from the field name what
 * happened. The same four doazores exposes.
 */
export const markNotificationRead = defineMutation({
  input: zodSchema(z.object({ notificationId: z.string().min(1) })),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Mark one of your notifications read", tags: ["Notification"] },
});

export const markAllNotificationsRead = defineMutation({
  input: zodSchema(z.object({})),
  output: zodSchema(z.object({ marked: z.number().int() })),
  docs: { summary: "Mark your whole inbox read", tags: ["Notification"] },
});

export const markProviderNotificationRead = defineMutation({
  input: zodSchema(z.object({ notificationId: z.string().min(1) })),
  output: zodSchema(z.object({ ok: z.literal(true) })),
  docs: { summary: "Mark one workspace notification read", tags: ["Notification"] },
});

/**
 * `providerId` is required here and absent from `markAllNotificationsRead`.
 * That is what distinguishes the two inboxes; there is no "all of everything".
 */
export const markAllProviderNotificationsRead = defineMutation({
  input: zodSchema(z.object({ providerId: z.string().min(1) })),
  output: zodSchema(z.object({ marked: z.number().int() })),
  docs: { summary: "Mark a workspace's inbox read, for you", tags: ["Notification"] },
});

export const notificationWriteSchema = defineGraphQLSchema(
  {
    notification: {
      markRead: markNotificationRead,
      markAllRead: markAllNotificationsRead,
      markProviderRead: markProviderNotificationRead,
      markAllProviderRead: markAllProviderNotificationsRead,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
