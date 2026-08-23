import { queryOptions } from "@tanstack/react-query";
import type { InboxPageDTO, UnreadCountDTO } from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

export const INBOX_PAGE_SIZE = 20;

const FIELDS = `items { id type payload createdAt read } total`;

/**
 * Field and input-type names, flat rather than nested.
 *
 * The schema builder (`generateFieldId` in `@cosmneo/onion-lasagna/graphql/field`)
 * turns a `notification: { mine: ... }` field-group into the wire name
 * `notificationMine` — camelCasing the joined path rather than emitting a
 * `notification { mine }` selection. Confirmed by introspecting the running
 * API (`__schema { queryType { fields { name } } }`) rather than trusted from
 * the source: `notificationMine`, `notificationMineUnreadCount`,
 * `notificationForProvider`, `notificationProviderUnreadCount`.
 *
 * `mineUnreadCount`'s input schema is `z.object({})` — no properties. The same
 * schema builder falls back to the `JSON` scalar for an empty input object
 * (a GraphQL input object type must declare at least one field), so that
 * query passes a literal `{}` rather than declaring a `$input` variable of a
 * named type that does not exist. Also confirmed by introspection.
 */
const MINE = `
  query MyNotifications($input: NotificationMineInput!) {
    notificationMine(input: $input) { ${FIELDS} }
  }`;

const MINE_COUNT = `
  query MyUnreadCount {
    notificationMineUnreadCount(input: {}) { count }
  }`;

const FOR_PROVIDER = `
  query ProviderNotifications($input: NotificationForProviderInput!) {
    notificationForProvider(input: $input) { ${FIELDS} }
  }`;

const PROVIDER_COUNT = `
  query ProviderUnreadCount($input: NotificationProviderUnreadCountInput!) {
    notificationProviderUnreadCount(input: $input) { count }
  }`;

/**
 * How often the badge asks again.
 *
 * Thirty seconds is a compromise with an argument behind it: a notification is
 * not urgent enough to justify a socket on a platform that has no Durable
 * Objects and no queue bindings, and a badge that is half a minute stale is a
 * badge that is right. `refetchIntervalInBackground` is deliberately left off —
 * a tab nobody is looking at should not poll.
 */
const BADGE_POLL_MS = 30_000;

export const notificationQueries = {
  mine: (offset = 0) =>
    queryOptions({
      queryKey: ["notifications", "mine", offset] as const,
      queryFn: () =>
        sessionGraphql<{ notificationMine: InboxPageDTO }>(MINE, {
          input: { limit: INBOX_PAGE_SIZE, offset },
        }).then((d) => d.notificationMine),
    }),

  mineUnreadCount: () =>
    queryOptions({
      queryKey: ["notifications", "mine", "unread"] as const,
      queryFn: () =>
        sessionGraphql<{ notificationMineUnreadCount: UnreadCountDTO }>(
          MINE_COUNT,
          {},
        ).then((d) => d.notificationMineUnreadCount.count),
      refetchInterval: BADGE_POLL_MS,
    }),

  forProvider: (providerId: string, offset = 0) =>
    queryOptions({
      queryKey: ["notifications", "provider", providerId, offset] as const,
      queryFn: () =>
        sessionGraphql<{ notificationForProvider: InboxPageDTO }>(FOR_PROVIDER, {
          input: { providerId, limit: INBOX_PAGE_SIZE, offset },
        }).then((d) => d.notificationForProvider),
      // Without this the provider shell fires a query with an empty id while the
      // workspace is still resolving — the same guard `walletQueries` needs.
      enabled: providerId.length > 0,
    }),

  providerUnreadCount: (providerId: string) =>
    queryOptions({
      queryKey: ["notifications", "provider", providerId, "unread"] as const,
      queryFn: () =>
        sessionGraphql<{ notificationProviderUnreadCount: UnreadCountDTO }>(
          PROVIDER_COUNT,
          { input: { providerId } },
        ).then((d) => d.notificationProviderUnreadCount.count),
      refetchInterval: BADGE_POLL_MS,
      enabled: providerId.length > 0,
    }),
};
