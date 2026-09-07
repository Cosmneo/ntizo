import { infiniteQueryOptions } from "@tanstack/react-query";
import type { ActivityType } from "@ntizo/shared";
import type { ActivityPageDTO, PlatformActivityPageDTO } from "@ntizo/shared/read-models";
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
 * Everybody's history, for administration — `activityAll` on the wire, by
 * the same flattening. Guarded by the field's own `requireAdmin`; the route
 * guard in front of the page is a convenience, the resolver is the boundary.
 */
const ALL = `
  query PlatformActivity($input: ActivityAllInput!) {
    activityAll(input: $input) {
      items { id type payload occurredAt actorUserId actorName actorEmail }
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

export interface PlatformActivitySearch {
  type?: ActivityType;
  /** Over the payload's text, on the server. Trimmed and non-empty, or absent. */
  search?: string;
}

export const activityQueries = {
  /**
   * The platform's feed. The whole search is the key — a type is a different
   * result set from the whole, not the same one filtered — and `undefined`
   * never reaches the wire, for the reason `adminSupportQueries.all` gives.
   */
  all: (search: PlatformActivitySearch) =>
    infiniteQueryOptions({
      queryKey: ["activity", "all", search] as const,
      queryFn: ({ pageParam }) =>
        sessionGraphql<{ activityAll: PlatformActivityPageDTO }>(ALL, {
          input: {
            limit: ACTIVITY_PAGE_SIZE,
            cursor: pageParam,
            ...(search.type ? { type: search.type } : {}),
            ...(search.search ? { search: search.search } : {}),
          },
        }).then((d) => d.activityAll),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),

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
