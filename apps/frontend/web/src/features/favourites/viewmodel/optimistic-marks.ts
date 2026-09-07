import type { QueryClient, QueryKey } from "@tanstack/react-query";
import {
  FAVOURITE_MARKS_KEY_IDS_INDEX,
  FAVOURITE_MARKS_QUERY_KEY,
  FAVOURITES_QUERY_KEY,
} from "@/features/favourites/data/favourites.repository";
import type { FavouriteTargetType } from "@/features/favourites/domain/types";

/**
 * What the marks cache held before an optimistic write touched it — enough to
 * put every entry back exactly as it was.
 *
 * Only the entries actually changed are recorded. Restoring one that was never
 * touched would rewrite it with an identical value and re-render every card
 * reading it, for nothing.
 */
export type MarksSnapshot = [QueryKey, string[]][];

/** Every cached page of hearts for one target type. */
function marksPrefix(targetType: FavouriteTargetType) {
  return [FAVOURITES_QUERY_KEY, FAVOURITE_MARKS_QUERY_KEY, targetType];
}

/**
 * Fill or empty one listing's heart in **every** page of cards that asked
 * about it, before the server has answered.
 *
 * A heart that waits for a round trip on a patchy connection feels broken and
 * the reader taps it again — which is a second save, or a save and an unsave.
 *
 * Why every page rather than one: the same listing can sit in more than one
 * cached answer at once — a browse page, a search result, a provider's own
 * service list — and a heart filled in one of them and not the others is the
 * same lie in a different place. `getQueriesData` with the prefix finds them
 * all.
 *
 * **And only the pages that asked.** A marks answer means "of the ids I asked
 * about, these are saved", so adding an id to an entry that never asked about
 * it would put a fact in a cache slot that does not describe it — the next
 * render of that page would show a heart on a card whose id the server was
 * never consulted about. The key's own sorted id list is checked first, which
 * is why the loop reads the key rather than using `setQueriesData` (whose
 * updater is handed the data with no key to check it against).
 */
export function patchMarks(
  qc: QueryClient,
  targetType: FavouriteTargetType,
  targetId: string,
  saved: boolean,
): MarksSnapshot {
  const changed: MarksSnapshot = [];

  for (const [key, data] of qc.getQueriesData<string[]>({
    queryKey: marksPrefix(targetType),
  })) {
    if (!data) continue;

    const askedAbout = key[FAVOURITE_MARKS_KEY_IDS_INDEX];
    if (!Array.isArray(askedAbout) || !askedAbout.includes(targetId)) continue;

    const alreadyRight = data.includes(targetId) === saved;
    if (alreadyRight) continue;

    changed.push([key, data]);
    qc.setQueryData<string[]>(
      key,
      saved ? [...data, targetId] : data.filter((id) => id !== targetId),
    );
  }

  return changed;
}

/**
 * Put back what `patchMarks` changed.
 *
 * An optimistic update that never reverts is a lie the reader carries until
 * they reload — they believe a listing is saved, close the tab, and find it
 * gone the next day with nothing to explain it. The invalidation that follows
 * a settled mutation would usually correct this on its own, but "usually" is
 * doing too much work: the refetch it triggers can fail for the same reason
 * the write did (an expired session, a dropped connection), and then nothing
 * else is coming.
 */
export function restoreMarks(qc: QueryClient, snapshot: MarksSnapshot | undefined): void {
  for (const [key, data] of snapshot ?? []) {
    qc.setQueryData(key, data);
  }
}

/**
 * Stop any marks fetch already in flight, so its answer — asked before this
 * write existed — cannot land on top of the optimistic value.
 */
export function cancelMarks(
  qc: QueryClient,
  targetType: FavouriteTargetType,
): Promise<void> {
  return qc.cancelQueries({ queryKey: marksPrefix(targetType) });
}
