import { ListNotYoursError } from "../../domain/exceptions";
import type { FavouriteListRepositoryPort } from "../ports/outbound/favourite-list.repository.port";
import type { FavouriteRepositoryPort } from "../ports/outbound/favourite.repository.port";
import type { SetListsInput, SetListsOutput, SetListsPort } from "../ports/inbound/set-lists.command.port";

/**
 * The dialog's checkbox grid, submitted whole: "these are the lists this
 * listing should be in now."
 *
 * Replaces an add/remove pair on purpose. The dialog already knows the full
 * desired state the moment somebody clicks "save" — a pair of endpoints
 * would make the client diff that state against whatever it last fetched to
 * decide what to add and what to remove, and a stale fetch (another tab
 * having already changed something) is exactly where that diff sends an
 * `add` for a list the listing is already in, or a `remove` for one it was
 * never in to begin with. `setLists` needs no diff: the desired state *is*
 * the input, and the repository computes what changed in one transaction —
 * see `FavouriteRepositoryPort.setLists`'s own doc comment.
 *
 * Two steps, in order:
 *
 * 1. **Ownership**, checked before anything is written. `ownedBy` answers
 *    "which of these ids are actually `requesterUserId`'s", and if that
 *    answer is shorter than `listIds`, something in there is not theirs.
 *    Refused with `ListNotYoursError` naming the first such id, before
 *    `favourites.setLists` is ever called — a caller who could send
 *    somebody else's list id could otherwise file a listing into a
 *    stranger's list, or empty it out of one, just by guessing or scraping
 *    an id.
 * 2. **`favourites.setLists`**, one call and one transaction that both adds
 *    what is newly ticked and removes what got unticked. Never two calls:
 *    a delete that succeeds followed by an insert that fails would leave the
 *    listing in fewer lists than either the dialog or the person asked for,
 *    with nothing left to say which state is the real one.
 *
 * Returns every list the listing is now in, read back through `listsFor`
 * rather than echoing `input.listIds` — the same reasoning `QuickSaveCommand`
 * gives for not assembling the answer from what the call already knows.
 */
export class SetListsCommand implements SetListsPort {
  constructor(
    private readonly lists: FavouriteListRepositoryPort,
    private readonly favourites: FavouriteRepositoryPort,
  ) {}

  async execute(input: SetListsInput): Promise<SetListsOutput> {
    const owned = new Set(await this.lists.ownedBy({ userId: input.requesterUserId, listIds: input.listIds }));
    // The first id that is not this person's, not merely "some id" — a
    // caller who sent three strangers' lists gets a refusal naming one of
    // them, not a vague failure with nothing to act on.
    const notMine = input.listIds.find((listId) => !owned.has(listId));
    if (notMine !== undefined) {
      throw new ListNotYoursError(notMine);
    }

    await this.favourites.setLists({
      userId: input.requesterUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      listIds: input.listIds,
      now: new Date(),
    });

    const listIds = await this.favourites.listsFor({
      userId: input.requesterUserId,
      targetType: input.targetType,
      targetId: input.targetId,
    });

    return { listIds };
  }
}
