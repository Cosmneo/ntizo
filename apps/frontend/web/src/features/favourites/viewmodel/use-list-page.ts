import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "@/shared/hooks/use-session";
import { favouriteQueries } from "@/features/favourites/data/favourites.repository";
import type { FavouriteEntry, FavouriteList } from "@/features/favourites/domain/types";
import { favouritesErrorCode } from "@/features/favourites/viewmodel/favourites-error";

/**
 * The entries in one list, flattened to a page and a "get more" call.
 *
 * The only legal route from `ui/` to this feature's `data/` layer — the
 * boundaries lint forbids `ui` importing `data` directly, the same shape
 * `useMyActivity` and `useMyLists` already follow.
 *
 * `listId` is optional because the page cannot know it on the first render:
 * which list to open comes out of `useMyLists`, which is itself a request. A
 * disabled query is the honest state for that gap — `enabled` covers both it
 * and the signed-out reader, whose only outcome would be a refusal.
 *
 * `entries` is every page fetched so far, flattened in order. Cursor
 * pagination only ever appends, so nothing here re-sorts.
 *
 * **`loading` is `isPending`, which a disabled query never leaves.** That is
 * deliberate and the page must read it that way: before there is a list id
 * there is nothing being fetched *and* nothing to draw, and both are "not
 * ready", not "empty". Telling those two apart is the whole of why the plan
 * has a test named "does not claim the list is empty while it is still
 * loading" — an empty state shown over a pending read tells somebody their
 * favourites are gone.
 */
export function useFavouriteListPage(listId: string | undefined, locale: string) {
  const { data: session } = useSession();

  const query = useInfiniteQuery({
    // The empty string is never fetched with: `enabled` is false without a
    // real id, so this only ever supplies the key's shape.
    ...favouriteQueries.listPage(listId ?? "", locale),
    enabled: Boolean(session) && Boolean(listId),
  });

  const entries: FavouriteEntry[] = query.data?.pages.flatMap((page) => page.items) ?? [];

  /**
   * The list's own header, off the first page.
   *
   * Off the *first* rather than the last: every page repeats it, and a later
   * page's copy is the fresher one — but reading the last page would make the
   * heading flicker between counts as pages arrive, for a number that changes
   * only when somebody saves. The first page is stable for as long as the
   * query is.
   */
  const list: FavouriteList | undefined = query.data?.pages[0]?.list;

  return {
    list,
    entries,
    loading: query.isPending,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    /** `undefined` when there is nothing wrong. See `favouritesErrorCode`. */
    errorCode: favouritesErrorCode(query.error),
  };
}
