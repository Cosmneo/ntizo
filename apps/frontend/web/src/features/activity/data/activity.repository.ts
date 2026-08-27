import { infiniteQueryOptions } from "@tanstack/react-query";
import type { ActivityPageDTO } from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

/**
 * Field name confirmed by introspecting a running server
 * (`__schema { queryType { fields { name } } }`), not trusted from source:
 * the field kit (`generateFieldId` in `@cosmneo/onion-lasagna/graphql/field`)
 * flattens a nested schema key, so the backend's `{ activity: { mine } }`
 * emits on the wire as `activityMine`, never `activity.mine`. An earlier
 * phase of this project (notifications) lost a round to exactly this — see
 * `features/notifications/data/notifications.repository.ts`.
 *
 * Takes no user id: the server resolves the caller from the session, so
 * there is nothing here to tamper with.
 */
const MINE = `
  query MyActivity($input: ActivityMineInput!) {
    activityMine(input: $input) {
      items { id type payload occurredAt }
      nextCursor
    }
  }`;

/**
 * The server errors past 50 rather than capping — `limit: z.number().max(50)`
 * reaches the emitted GraphQL schema (unlike `.default()`), so anything over
 * 50 comes back `VALIDATION_ERROR` instead of a silently truncated page.
 * Stay inside 1..50.
 */
export const ACTIVITY_PAGE_SIZE = 20;

export const activityQueries = {
  mine: () =>
    infiniteQueryOptions({
      queryKey: ["activity", "mine"] as const,
      queryFn: ({ pageParam }) =>
        sessionGraphql<{ activityMine: ActivityPageDTO }>(MINE, {
          input: { limit: ACTIVITY_PAGE_SIZE, cursor: pageParam },
        }).then((d) => d.activityMine),
      initialPageParam: undefined as string | undefined,
      // `nextCursor` is null when there is no more; `hasNextPage` reads
      // `undefined` as "no more", not `null` — mapping the two is required,
      // not cosmetic, the same way `walletQueries.forProvider` maps its
      // `nextOffset`.
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
};
