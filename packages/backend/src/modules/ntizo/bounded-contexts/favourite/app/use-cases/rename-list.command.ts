import { ListNameTakenError, ListNotYoursError } from "../../domain/exceptions";
import type { FavouriteListRepositoryPort } from "../ports/outbound/favourite-list.repository.port";
import type { RenameListInput, RenameListPort } from "../ports/inbound/rename-list.command.port";

/**
 * Gives a list a new name — the default list included, which then stops
 * being nameless. See `FavouriteList.rename`'s own doc comment: renaming the
 * default is allowed; only *removing* it is not, and that rule lives in
 * `RemoveListCommand`, not here.
 *
 * Ownership first, via `ownedBy`, before any write — the same rule every
 * command that resolves a `listId` follows.
 *
 * `listForUser` is then read once, and answers two questions from that one
 * fetch:
 *
 * - What this list is currently called, so the rename can go through the
 *   aggregate (`target.rename(name)`) for the same blank/over-length
 *   validation `CreateListCommand` gets from `FavouriteList.create` — and so
 *   renaming "Casa nova" to "Casa nova" is recognised as a no-op rather than
 *   a conflict with itself: the collision scan below excludes this very list
 *   by id, not by name, so a name that happens to already be this list's own
 *   name never trips it.
 * - Whether the new name collides with another of this person's lists,
 *   case-insensitively. As with `CreateListCommand`, this check is for the
 *   message; `favourite_list_user_name_uq` is the backstop, and
 *   `DrizzleFavouriteListRepository.rename` translates a violation of it
 *   into this same `ListNameTakenError`.
 */
export class RenameListCommand implements RenameListPort {
  constructor(private readonly lists: FavouriteListRepositoryPort) {}

  async execute(input: RenameListInput): Promise<void> {
    const owned = await this.lists.ownedBy({ userId: input.requesterUserId, listIds: [input.listId] });
    if (!owned.includes(input.listId)) {
      throw new ListNotYoursError(input.listId);
    }

    const mine = await this.lists.listForUser(input.requesterUserId);
    const target = mine.find((list) => list.id === input.listId);
    if (!target) {
      // `ownedBy` just confirmed this id is this person's; a miss here can
      // only be the row disappearing between the two reads. Treated the same
      // as "not theirs" rather than reading a property of undefined.
      throw new ListNotYoursError(input.listId);
    }

    // Validates blank/over-length here, through the aggregate, before the
    // collision scan below ever runs against a name that was never going to
    // be legal.
    const renamed = target.rename(input.name);
    // `assertName` only ever returns a non-blank string, and `rename` is
    // what sets it — `renamed.name` is typed `string | null` only because
    // `FavouriteListProps.name` is shared with the (genuinely nullable)
    // default-list case.
    const newName = renamed.name!;

    const wanted = newName.trim().toLowerCase();
    const taken = mine.some((list) => list.id !== input.listId && (list.name ?? "").trim().toLowerCase() === wanted);
    if (taken) {
      throw new ListNameTakenError(newName);
    }

    await this.lists.rename({ id: input.listId, userId: input.requesterUserId, name: newName });
  }
}
