import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/shared/hooks/use-session";
import { favouriteQueries } from "@/features/favourites/data/favourites.repository";
import type { FavouriteTargetType } from "@/features/favourites/domain/types";
import { favouritesErrorCode } from "@/features/favourites/viewmodel/favourites-error";

/**
 * Which of the reader's lists hold one listing — the dialog's tick marks,
 * for the one press that cannot know them already.
 *
 * **Usually not asked at all.** `favouriteQuickSave` answers with the whole
 * membership precisely so a dialog opened straight after a tap already knows
 * its ticks; the heart hands them over and this hook stays disabled. What is
 * left is the press on an already-filled heart, which saved nothing and so
 * learned nothing — and guessing `[]` there is the one thing a filled heart
 * cannot mean. So the dialog asks.
 *
 * `enabled` therefore takes the caller's own answer as well as the session's:
 * a plain `useQuery` like `useFavouriteMarks`, for the same reason — the
 * field refuses an anonymous caller, and suspending is doubly wrong for a
 * dialog that opens over a page which has already rendered.
 */
export function useListsFor(
  targetType: FavouriteTargetType,
  targetId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const { data: session } = useSession();

  const query = useQuery({
    ...favouriteQueries.listsFor(targetType, targetId),
    enabled: enabled && Boolean(session),
  });

  return {
    /**
     * `undefined` until the answer lands, and deliberately not `[]`: the
     * dialog draws ticks from it, and an empty array would tick nothing
     * while the real membership was still in flight — which reads as "this
     * is in no list" about a listing whose heart is filled.
     */
    listIds: query.data,
    /** `isLoading`, so a disabled query is never reported as loading. See `useMyLists`. */
    loading: query.isLoading,
    /** `undefined` when there is nothing wrong. See `favouritesErrorCode`. */
    errorCode: favouritesErrorCode(query.error),
  };
}
