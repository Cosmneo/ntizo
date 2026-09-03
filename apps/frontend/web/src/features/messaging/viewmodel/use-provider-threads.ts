import { useInfiniteQuery } from "@tanstack/react-query";
import { messagingQueries } from "@/features/messaging/data/messaging.repository";
import type { Thread, ThreadType } from "@/features/messaging/domain/types";
import { messagingErrorCode } from "@/features/messaging/viewmodel/messaging-error";

/**
 * A provider's own inbox — the customers who have messaged them, flattened
 * to one list.
 *
 * Task 9 built `messagingQueries.forProvider` but never wrapped it in a
 * hook; every other messaging query already has one (`useThreads`,
 * `useThread`), and a page reaching past this into `data/` directly is
 * exactly what the boundaries lint (`ui` may not import `data`) forbids.
 * Otherwise identical to `useThreads` — same flatten-the-pages shape, same
 * "first fetch only" `loading`, same window-focus-only refetch (no polling;
 * see `messagingQueries.thread`'s own doc comment for the one query that
 * does).
 *
 * `communicationProviderThreads` checks membership server-side
 * (`ListProviderThreadsProjection.execute`) and refuses a caller who is not
 * on `providerId`'s team with `THREAD_NOT_VISIBLE` — deliberately the same
 * answer a thread that does not exist gives. This hook does not try to
 * pre-empt that check client-side (e.g. by trusting whatever `providerId`
 * it is handed); it just surfaces whatever the server decided through
 * `errorCode`, the same shape `useThreads` already exposes.
 *
 * `type`, same as `useThreads`, passes straight through to
 * `messagingQueries.forProvider`.
 */
export function useProviderThreads(providerId: string, type?: ThreadType) {
  const query = useInfiniteQuery(messagingQueries.forProvider(providerId, type));

  const threads: Thread[] = query.data?.pages.flatMap((page) => page.items) ?? [];

  return {
    threads,
    loading: query.isPending,
    hasMore: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
    /** See `useThreads`' identical field — same helper, same codes to branch on. */
    errorCode: messagingErrorCode(query.error),
  };
}
