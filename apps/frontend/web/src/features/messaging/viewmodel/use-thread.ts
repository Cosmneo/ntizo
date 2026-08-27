import { useInfiniteQuery } from "@tanstack/react-query";
import { messagingQueries } from "@/features/messaging/data/messaging.repository";
import type { Message } from "@/features/messaging/domain/types";
import { messagingErrorCode } from "@/features/messaging/viewmodel/messaging-error";

/**
 * One conversation's messages, newest first — the order the wire sends them
 * in (see `messagePageReadModel`'s doc comment on the backend). This hook
 * does not re-sort; a display that wants oldest-first is that display's
 * choice to make, not a second opinion this hook has about an ordering the
 * database already settled — same reasoning `groupByDay`'s doc comment
 * gives for the notifications inbox.
 *
 * The one query in this feature that polls: `messagingQueries.thread`
 * carries `refetchInterval` itself (every 5s while this hook stays
 * mounted), plus the window-focus refetch every query gets by default.
 * `useThreads` does not poll — see its own doc comment.
 */
export function useThread(threadId: string) {
  const query = useInfiniteQuery(messagingQueries.thread(threadId));

  const messages: Message[] =
    query.data?.pages.flatMap((page) => page.items) ?? [];

  return {
    messages,
    loading: query.isPending,
    hasMore: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
    /** See `useThreads`' identical field — same helper, same three codes to branch on. */
    errorCode: messagingErrorCode(query.error),
  };
}
