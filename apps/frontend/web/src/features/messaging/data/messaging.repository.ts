import { infiniteQueryOptions } from "@tanstack/react-query";
import type { ThreadPageDTO, MessagePageDTO } from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type { ThreadType } from "@/features/messaging/domain/types";

/**
 * Field names confirmed by introspecting a running server
 * (`__schema { queryType { fields { name } } }`), not trusted from source:
 * the field kit (`generateFieldId` in `@cosmneo/onion-lasagna/graphql/field`)
 * flattens a nested schema key, so the backend's
 * `{ communication: { myThreads } }` emits on the wire as
 * `communicationMyThreads` — never `communication.myThreads` or a
 * `communication { myThreads }` selection. `activity` and `notifications`
 * both lost a round to exactly this; see
 * `features/activity/data/activity.repository.ts`.
 *
 * Input type names follow the same flattening (`capitalize(fieldId) +
 * "Input"` in the kit's SDL builder, confirmed by reading
 * `dist/graphql/sdl/index.cjs`), so the variable type below is
 * `CommunicationMyThreadsInput!`, not some other spelling.
 *
 * `myThreads` takes no user id: the server resolves the caller from the
 * session. `providerThreads` takes `providerId` because it is *not* the
 * caller's own inbox — membership is checked server-side, not assumed here.
 */
const MY_THREADS = `
  query MyThreads($input: CommunicationMyThreadsInput!) {
    communicationMyThreads(input: $input) {
      items { id type providerId providerName customerName lastMessageAt lastMessagePreview lastMessageHasAttachment unreadCount support { subject status audience bookingId } }
      nextCursor
    }
  }`;

const PROVIDER_THREADS = `
  query ProviderThreads($input: CommunicationProviderThreadsInput!) {
    communicationProviderThreads(input: $input) {
      items { id type providerId providerName customerName lastMessageAt lastMessagePreview lastMessageHasAttachment unreadCount support { subject status audience bookingId } }
      nextCursor
    }
  }`;

/**
 * `attachments { id fileName contentType sizeBytes }` — deliberately no
 * `storageKey`, matching `messageAttachmentReadModel`'s own wire shape: a
 * client downloads by `id`, through `/api/communication/attachments/:id`,
 * which re-checks visibility itself. Task 6 put `attachments` on the read
 * model and on the wire; this selection set is the one place that actually
 * asks a running server for it — a field that reaches the schema but never
 * the query renders nothing, with every backend test still green, because
 * nothing there exercises this file at all.
 */
const THREAD_MESSAGES = `
  query ThreadMessages($input: CommunicationThreadMessagesInput!) {
    communicationThreadMessages(input: $input) {
      items { id threadId senderUserId senderSide body readAt createdAt attachments { id fileName contentType sizeBytes } }
      nextCursor
    }
  }`;

/**
 * The server errors past 50 rather than capping — `limit: z.number().max(50)`
 * reaches the emitted GraphQL schema (unlike `.default()`), so anything over
 * 50 comes back `VALIDATION_ERROR` instead of a silently truncated page.
 * Stay inside 1..50 — the same lesson `ACTIVITY_PAGE_SIZE` and
 * `INBOX_PAGE_SIZE` already paid for.
 */
export const THREADS_PAGE_SIZE = 20;
export const MESSAGES_PAGE_SIZE = 30;

/**
 * How often an open conversation asks again.
 *
 * This project chose polling over a socket specifically to avoid new
 * infrastructure (no Durable Objects, no queue bindings on this platform) —
 * see the sweep/cron this same phase built for unread notices. Polling every
 * list query on an interval would spend exactly the cost that choice was
 * made to avoid, so this constant is wired to `thread` alone, not passed
 * anywhere near `mine`/`forProvider`. Those two refetch on window focus
 * only — the query client's own default (`staleTime`/`retry` aside,
 * `refetchOnWindowFocus` is never overridden), not something declared here.
 */
const THREAD_POLL_MS = 5_000;

export const messagingQueries = {
  /**
   * The caller's own inbox. `type` narrows it — the Help Center's "my
   * requests" passes `"support"`, `/messages` passes nothing and gets both.
   * It rides in the query key too: a filtered list is a different result
   * set, not the same one rendered differently.
   */
  mine: (type?: ThreadType) =>
    infiniteQueryOptions({
      queryKey: ["messaging", "threads", "mine", type ?? "all"] as const,
      queryFn: ({ pageParam }) =>
        sessionGraphql<{ communicationMyThreads: ThreadPageDTO }>(MY_THREADS, {
          input: { limit: THREADS_PAGE_SIZE, cursor: pageParam, ...(type ? { type } : {}) },
        }).then((d) => d.communicationMyThreads),
      initialPageParam: undefined as string | undefined,
      // `nextCursor` is null when there is no more; `hasNextPage` reads
      // `undefined` as "no more", not `null` — mapping the two is required,
      // not cosmetic, same as `activityQueries.mine`.
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),

  /** One provider's inbox — the customers who have messaged them, newest last message first. Same `type` narrowing as `mine`, for the same reason. */
  forProvider: (providerId: string, type?: ThreadType) =>
    infiniteQueryOptions({
      queryKey: ["messaging", "threads", "provider", providerId, type ?? "all"] as const,
      queryFn: ({ pageParam }) =>
        sessionGraphql<{ communicationProviderThreads: ThreadPageDTO }>(
          PROVIDER_THREADS,
          {
            input: {
              providerId,
              limit: THREADS_PAGE_SIZE,
              cursor: pageParam,
              ...(type ? { type } : {}),
            },
          },
        ).then((d) => d.communicationProviderThreads),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      // Without this the provider shell fires a query with an empty id
      // while the workspace is still resolving — the same guard
      // `notificationQueries.forProvider` needs.
      enabled: providerId.length > 0,
    }),

  /**
   * One conversation's messages, newest first.
   *
   * The only query in this feature that polls — see `THREAD_POLL_MS`.
   */
  thread: (threadId: string) =>
    infiniteQueryOptions({
      queryKey: ["messaging", "thread", threadId] as const,
      queryFn: ({ pageParam }) =>
        sessionGraphql<{ communicationThreadMessages: MessagePageDTO }>(
          THREAD_MESSAGES,
          { input: { threadId, limit: MESSAGES_PAGE_SIZE, cursor: pageParam } },
        ).then((d) => d.communicationThreadMessages),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      enabled: threadId.length > 0,
      refetchInterval: THREAD_POLL_MS,
    }),
};
