import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/shared/hooks/use-session";
import { favouriteQueries } from "@/features/favourites/data/favourites.repository";
import type { FavouriteList } from "@/features/favourites/domain/types";
import { favouritesErrorCode } from "@/features/favourites/viewmodel/favourites-error";

/**
 * The reader's own lists, with a count and a cover mosaic on each — what the
 * dialog ticks and what the index page draws.
 *
 * A plain `useQuery` for the same reason `useFavouriteMarks` is one: the field
 * refuses an anonymous caller, so `enabled: Boolean(session)` keeps a
 * signed-out visitor from firing a request whose only outcome is a refusal.
 * Suspending is doubly wrong here — the dialog this feeds opens over a page
 * that has already rendered.
 *
 * **The server's order is kept exactly.** `listMyLists` puts the default list
 * first on purpose: it is where the heart saves, so the dialog's pre-ticked
 * row belongs at the top rather than somewhere down the scroll. Re-sorting
 * here — even alphabetically, even "helpfully" — would undo a decision the
 * read side documents.
 *
 * Names are not resolved here. A null `name` on the default list is the
 * server's deliberate contract, and `listDisplayName` in `domain/list-name.ts`
 * is the single place it turns into words.
 */
export function useMyLists() {
  const { data: session } = useSession();

  const query = useQuery({
    ...favouriteQueries.myLists(),
    enabled: Boolean(session),
  });

  const lists: FavouriteList[] = query.data ?? [];

  return {
    lists,
    /**
     * `isLoading`, which is `isPending && isFetching` — and deliberately
     * neither of the two on its own.
     *
     * Not `isPending`: a disabled query stays pending forever, so a signed-out
     * reader would see a spinner over a list that is not being fetched.
     *
     * Not `isFetching` either, which was the first answer here and is wrong
     * for the opposite reason. `isFetching` is true during a *background
     * refetch* of data already in hand, and every save's `onSettled`
     * invalidates the whole `["favourites"]` prefix — so ticking one list in
     * the dialog put a spinner over the very rows the reader is ticking,
     * which are on screen and correct throughout. `isLoading` is true only
     * for the first fetch, the one moment there is nothing to draw.
     * `useActiveProvider` reads it for this same reason.
     */
    loading: query.isLoading,
    /** `undefined` when there is nothing wrong. See `favouritesErrorCode`. */
    errorCode: favouritesErrorCode(query.error),
  };
}
