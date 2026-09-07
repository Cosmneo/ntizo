import { DefaultListNotRemovableError, ListNotYoursError } from "../../domain/exceptions";
import type { FavouriteListRepositoryPort } from "../ports/outbound/favourite-list.repository.port";
import type { RemoveListInput, RemoveListOutput, RemoveListPort } from "../ports/inbound/remove-list.command.port";

/**
 * Deletes a list, and by cascade — `favourite_list_owner_fk`'s
 * `ON DELETE CASCADE`, see `favourite.schema.ts` — every entry filed into it.
 * This command does not delete those entries itself; the database does, and
 * that is by design (see the port's own doc comment on `remove`).
 *
 * Two refusals, checked in this order and not the other:
 *
 * 1. **Ownership**, via `ownedBy`, checked first. `DefaultListNotRemovableError`
 *    would tell a caller something about a list they do not own — that it
 *    exists at all, and that it happens to be somebody's default — and
 *    `ListNotYoursError`'s whole point (see its own doc comment) is to
 *    refuse without disclosing anything past "not yours". Checking
 *    defaultness first would leak exactly that fact to a stranger before
 *    ownership is ever established, so ownership goes first.
 * 2. **Defaultness**, read off `listForUser` once ownership is confirmed.
 *    Removing the default list would leave a person with nowhere for a
 *    heart-tap to land, so it is refused here, before `remove` is ever
 *    called. The aggregate cannot enforce this itself — it has no idea it is
 *    the last one, which is a fact about the repository's rows, not about
 *    any one instance — and the repository's own `remove` checks only
 *    ownership, not defaultness (see its doc comment), so this command is
 *    the only place the rule can live.
 *
 * `ownedBy` and `listForUser` are two separate reads rather than one: the
 * port has no "fetch one list" method, and `ownedBy` alone cannot answer "is
 * it the default" — only `listForUser`'s full rows carry that. Both happen
 * before `remove`, so a refusal at either step leaves nothing written.
 */
export class RemoveListCommand implements RemoveListPort {
  constructor(private readonly lists: FavouriteListRepositoryPort) {}

  async execute(input: RemoveListInput): Promise<RemoveListOutput> {
    const owned = await this.lists.ownedBy({ userId: input.requesterUserId, listIds: [input.listId] });
    if (!owned.includes(input.listId)) {
      throw new ListNotYoursError(input.listId);
    }

    const mine = await this.lists.listForUser(input.requesterUserId);
    const target = mine.find((list) => list.id === input.listId);
    if (target?.isDefault) {
      throw new DefaultListNotRemovableError(input.listId);
    }

    const removed = await this.lists.remove({ id: input.listId, userId: input.requesterUserId });
    return { removed };
  }
}
