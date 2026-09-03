import { useInfiniteQuery } from "@tanstack/react-query";
import { messagingQueries } from "@/features/messaging/data/messaging.repository";
import type { Thread, ThreadType } from "@/features/messaging/domain/types";
import { messagingErrorCode } from "@/features/messaging/viewmodel/messaging-error";

/**
 * The caller's own inbox — flattened to one list and a "load more" call.
 *
 * The only legal route from `ui/` to this feature's `data/` layer — the
 * boundaries lint forbids `ui` importing `data` directly, the same shape
 * `useMyActivity`/`useInbox` already follow.
 *
 * `threads` is every page fetched so far, flattened in order — cursor
 * pagination only ever appends, so no re-sort is needed. `loading` is the
 * *first* fetch only (`isPending`); a "load more" in flight does not blank
 * the list already on screen.
 *
 * Refetches on window focus only (the query client's own default). The
 * 5-second poll belongs to `useThread` alone — see that hook's doc comment.
 *
 * `type` passes straight through to `messagingQueries.mine` — see that
 * query's own doc comment for who calls it with `"support"` and who calls
 * it with nothing.
 */
export function useThreads(type?: ThreadType) {
  const query = useInfiniteQuery(messagingQueries.mine(type));

  const threads: Thread[] = query.data?.pages.flatMap((page) => page.items) ?? [];

  return {
    threads,
    loading: query.isPending,
    hasMore: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
    /**
     * `undefined` when there is nothing wrong. `"UNAUTHENTICATED"` when the
     * caller is signed out — see `messagingErrorCode`'s own doc comment for
     * why that requires reading `originalCode`, not the flattened
     * `"FORBIDDEN"` every `ForbiddenError` wears on the wire.
     */
    errorCode: messagingErrorCode(query.error),
  };
}
