import type { FavouriteTarget } from "../../../../bounded-contexts/favourite/domain/favourite-target";
import type { FavouriteRepositoryPort } from "../../../../bounded-contexts/favourite/app/ports/outbound/favourite.repository.port";

/**
 * Which of the listings on this screen the caller has saved — the filled
 * hearts on a page of cards.
 *
 * Takes the ids that are on screen rather than returning everything ever
 * saved, and that direction is the whole design: a reader with two thousand
 * favourites must not ship two thousand ids to draw twenty-four hearts. The
 * page already knows what it is rendering; this answers a question about that
 * page, not about the person's whole history.
 *
 * "Saved anywhere", not "saved in list X". The heart on a card is one bit, and
 * which lists a listing is in is the dialog's question — `listsFor` answers
 * that one.
 */
export class MarkFavouritesProjection {
  constructor(private readonly favourites: FavouriteRepositoryPort) {}

  async execute(input: {
    requesterUserId: string;
    targetType: FavouriteTarget;
    targetIds: string[];
  }): Promise<string[]> {
    // An empty page is answered without touching the database. A query whose
    // answer is already known is a round trip bought for nothing, and it is
    // the shape a signed-in reader hits on every page with no cards on it.
    if (input.targetIds.length === 0) return [];

    const marked = await this.favourites.markedFor({
      userId: input.requesterUserId,
      targetType: input.targetType,
      targetIds: input.targetIds,
    });

    // Deduplicated here even though `markedFor`'s contract already promises
    // it. A listing in three lists is three rows, and the join that answers
    // this is one `DISTINCT` away from returning the id three times — which is
    // three times the payload for one fact, and a client that counts rather
    // than tests membership would read it as three hearts. The port's promise
    // is the first lock; this is the second, and it costs one pass over an
    // array that is already capped at 48.
    return [...new Set(marked)];
  }
}
