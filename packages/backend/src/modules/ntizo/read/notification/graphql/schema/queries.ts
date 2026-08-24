import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { inboxPageReadModel, unreadCountReadModel } from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * Paging arguments, `optional()` rather than `.default()`.
 *
 * A zod default does not reach the GraphQL schema — the field still emits as
 * `Int!` and every caller has to send it. The real default and the clamp live
 * in the projection. This is follow-up #20's lesson, applied rather than
 * rediscovered.
 */
const paging = {
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
};

/**
 * The caller's own inbox. Takes no user id — it resolves from the session, so
 * there is nothing to tamper with.
 */
export const listMyNotifications = defineQuery({
  input: zodSchema(z.object(paging)),
  output: zodSchema(inboxPageReadModel),
  docs: { summary: "Your own notifications", tags: ["Notification"] },
});

export const countMyUnreadNotifications = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(unreadCountReadModel),
  docs: { summary: "How many of your notifications are unread", tags: ["Notification"] },
});

export const listProviderNotifications = defineQuery({
  input: zodSchema(z.object({ providerId: z.string().min(1), ...paging })),
  output: zodSchema(inboxPageReadModel),
  docs: { summary: "A workspace's notifications", tags: ["Notification"] },
});

export const countProviderUnreadNotifications = defineQuery({
  input: zodSchema(z.object({ providerId: z.string().min(1) })),
  output: zodSchema(unreadCountReadModel),
  docs: { summary: "How many of a workspace's notifications you have not read", tags: ["Notification"] },
});

export const notificationReadSchema = defineGraphQLSchema(
  {
    notification: {
      mine: listMyNotifications,
      mineUnreadCount: countMyUnreadNotifications,
      forProvider: listProviderNotifications,
      providerUnreadCount: countProviderUnreadNotifications,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
