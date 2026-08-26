import { useInfiniteQuery } from "@tanstack/react-query";
import { activityQueries } from "@/features/activity/data/activity.repository";
import type { ActivityEntry } from "@/features/activity/domain/types";

/**
 * The caller's own history, flattened to one page and a "get more" call.
 *
 * The only legal route from `ui/` to this feature's `data/` layer — the
 * boundaries lint forbids `ui` importing `data` directly, the same shape
 * `useInbox`/`useWallet` already follow.
 *
 * `entries` is every page fetched so far, flattened in order — cursor
 * pagination only ever appends, so no re-sort is needed the way an
 * offset-based page might. `loading` is the *first* fetch only
 * (`isPending`); a "load more" in flight does not blank the list that is
 * already on screen.
 */
export function useMyActivity() {
  const query = useInfiniteQuery(activityQueries.mine());

  const entries: ActivityEntry[] =
    query.data?.pages.flatMap((page) => page.items) ?? [];

  return {
    entries,
    loading: query.isPending,
    hasMore: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
  };
}
