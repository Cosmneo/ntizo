import type { Favourite } from "../../../domain/aggregates/favourite.aggregate";
import type { FavouriteTarget } from "../../../domain/favourite-target";

export interface FavouriteRepositoryPort {
  /** Files a listing into one list; already there is not an error. */
  add(entity: Favourite): Promise<void>;

  /**
   * Sets exactly which of this user's lists hold this listing, in one
   * transaction.
   *
   * A diff, not a reset: the rows that are already right are left alone, so
   * their `createdAt` — the sort key the list is drawn in — survives the
   * dialog being opened and closed. Half-applied it would leave the listing
   * in lists nobody chose, which is why it is one transaction and not two
   * calls.
   */
  setLists(p: {
    userId: string;
    targetType: FavouriteTarget;
    targetId: string;
    listIds: string[];
    now: Date;
  }): Promise<void>;

  /** Which of this user's lists hold this listing. The tick marks in the dialog. */
  listsFor(p: { userId: string; targetType: FavouriteTarget; targetId: string }): Promise<string[]>;

  /**
   * Which of `targetIds` this person has saved anywhere. The filled hearts on
   * a page of cards.
   *
   * Each id appears at most once, even when it is in three lists: the
   * question is "saved anywhere", and answering it three times is three times
   * the payload for the same fact.
   */
  markedFor(p: { userId: string; targetType: FavouriteTarget; targetIds: string[] }): Promise<string[]>;

  /**
   * How many entries each list holds.
   *
   * **Takes no `userId`, and checks none.** Every id passed here must already
   * have come back from `FavouriteListRepositoryPort.ownedBy` for the
   * signed-in caller; this method counts whatever list it is handed. Pass an
   * id straight off a request and it will happily report how many listings a
   * stranger has saved.
   *
   * Lists with no entries are absent from the map rather than present with
   * zero — a GROUP BY has no row to return for them. Read it as `?? 0`.
   */
  countsFor(listIds: string[]): Promise<Map<string, number>>;

  /**
   * Up to `perList` most recent target ids per list, for the cover mosaics.
   *
   * **Takes no `userId`, and checks none** — the same precondition as
   * {@link countsFor}. Every id must already have come back from
   * `FavouriteListRepositoryPort.ownedBy`. Handed an id off a request,
   * this returns the tiles of somebody else's list, and a cover mosaic is a
   * picture of what that person saved.
   */
  coverTargetsFor(p: {
    listIds: string[];
    perList: number;
  }): Promise<Map<string, { targetType: FavouriteTarget; targetId: string }[]>>;

  /**
   * One page of a list's entries, newest first.
   *
   * **Takes no `userId`, and checks none.** `listId` must already have come
   * back from `FavouriteListRepositoryPort.ownedBy` for the signed-in
   * caller. This is the method most likely to be reached straight from a
   * request — Task 7 hands GraphQL input to it — and
   * `entriesIn({ listId: args.listId })` with no `ownedBy` in front of it
   * reads out a stranger's saved listings to anybody who guesses or scrapes a
   * list id. The identity has to come from the session; a list id in the
   * request is a claim, not proof, and this method cannot tell the
   * difference.
   *
   * Cursor-paged, not offset-paged. A list is appended to at the top, which
   * is exactly where offset breaks: a row saved between two page fetches
   * shifts every offset by one, so the reader sees an entry twice or never.
   *
   * `cursor` is an opaque string this port hands back as `nextCursor` and
   * expects verbatim on the following call — callers must not construct or
   * parse it. A `cursor` that does not decode is **rejected**, not silently
   * treated as absent: the implementation throws `CursorInvalidError` rather
   * than degrading to the first page, because a caller paginating by
   * following `nextCursor` until it sees `null` could otherwise loop forever
   * on a corrupted token without ever finding out. The same contract
   * `ActivityRepositoryPort.listForActor` states.
   */
  entriesIn(p: {
    listId: string;
    limit: number;
    cursor?: string | null;
  }): Promise<{ items: Favourite[]; nextCursor: string | null }>;
}
