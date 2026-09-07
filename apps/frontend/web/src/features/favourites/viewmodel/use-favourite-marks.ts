import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/shared/hooks/use-session";
import { favouriteQueries } from "@/features/favourites/data/favourites.repository";
import type { FavouriteTargetType } from "@/features/favourites/domain/types";
import { favouritesErrorCode } from "@/features/favourites/viewmodel/favourites-error";

/**
 * Which of the listings on this page the reader has saved — one question for
 * the whole page, not one per card.
 *
 * **A plain `useQuery`, and deliberately not `useSuspenseQuery` — the one
 * place on these pages that differs.** The hearts are decoration on a page
 * built to be crawled: suspending on them would hold the entire listing back
 * from a crawler that has no session to read them with, trading the thing the
 * page exists for against an ornament that visitor will never see. Every card
 * renders immediately with an empty heart and fills in when the answer lands.
 *
 * `enabled: ids.length > 0 && Boolean(session)`. Both halves buy a round trip
 * back: an empty page's answer is already known (the projection behind this
 * field short-circuits on the same condition server-side), and every one of
 * the nine fields refuses an anonymous caller, so firing this signed out
 * trades a wall of refusals for information the page cannot use.
 *
 * The query key holds the **sorted** ids — see `favouriteQueries.marks`. Every
 * card on a page may call this with the page's whole id list and they will
 * share one cache entry and one network call, which is exactly how the heart
 * costs one request per page instead of one per card.
 *
 * A `Set` rather than an array, built once per answer: `isMarked` is called
 * once per card on every render, and a linear scan of forty-eight ids twenty-
 * four times over is work bought for nothing.
 */
export function useFavouriteMarks(targetType: FavouriteTargetType, ids: string[]) {
  const { data: session } = useSession();

  const query = useQuery({
    ...favouriteQueries.marks(targetType, ids),
    enabled: ids.length > 0 && Boolean(session),
  });

  const marked = useMemo(() => new Set(query.data ?? []), [query.data]);

  return {
    /** The saved ids among the ones asked about. Empty until the answer lands. */
    marked,
    isMarked: (id: string) => marked.has(id),
    /**
     * `isFetching`, not `isPending`: a disabled query stays pending forever,
     * so a card reading `isPending` would show a spinner to every signed-out
     * visitor on a page that is not waiting for anything.
     */
    loading: query.isFetching,
    /** `undefined` when there is nothing wrong. See `favouritesErrorCode`. */
    errorCode: favouritesErrorCode(query.error),
  };
}
