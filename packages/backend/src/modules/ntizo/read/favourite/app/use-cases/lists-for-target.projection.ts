import type { FavouriteTarget } from "../../../../bounded-contexts/favourite/domain/favourite-target";
import type { FavouriteRepositoryPort } from "../../../../bounded-contexts/favourite/app/ports/outbound/favourite.repository.port";

/**
 * Which of the caller's own lists hold one listing — the tick marks in the
 * save dialog.
 *
 * The counterpart to `MarkFavouritesProjection`: that one answers "is this
 * saved at all" for a whole page of cards, this one answers "where exactly" for
 * the single card whose dialog is open. Two fields rather than one that does
 * both, because the two are asked at completely different rates — the marks
 * once per page, this once per dialog open — and a field that returned every
 * list membership for twenty-four cards would send the dialog's payload to a
 * page that never opens one.
 *
 * Scoped by `requesterUserId`, which the handler stamps from the session:
 * `listsFor` filters on the owner, so a stranger's list id can never appear in
 * the answer and be ticked in the caller's dialog.
 */
export class ListsForTargetProjection {
  constructor(private readonly favourites: FavouriteRepositoryPort) {}

  execute(input: {
    requesterUserId: string;
    targetType: FavouriteTarget;
    targetId: string;
  }): Promise<string[]> {
    return this.favourites.listsFor({
      userId: input.requesterUserId,
      targetType: input.targetType,
      targetId: input.targetId,
    });
  }
}
