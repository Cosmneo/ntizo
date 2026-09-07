import { FavouriteList } from "../../domain/aggregates/favourite-list.aggregate";
import { ListNameTakenError } from "../../domain/exceptions";
import type { FavouriteListRepositoryPort } from "../ports/outbound/favourite-list.repository.port";
import type { CreateListInput, CreateListOutput, CreateListPort } from "../ports/inbound/create-list.command.port";

/**
 * A second list, a third, however many a person wants beyond the one
 * `ensureDefault` hands out lazily on their first save.
 *
 * The name-taken check here is a read against this person's own lists,
 * case-insensitive, and it exists for the message: "you already have a list
 * called that" reads better than a raw constraint violation reaching the
 * person as a broken save button. It is not what actually stops the
 * collision under concurrency — `favourite_list_user_name_uq` is, and
 * `DrizzleFavouriteListRepository.save` translates a violation of it into
 * this same `ListNameTakenError`, so two tabs naming a list "Casa nova" at
 * the same instant both still get a clean refusal instead of one of them
 * getting a raw 500. See `ListNameTakenError`'s own doc comment: the check
 * here is for the message, the index is for the truth.
 *
 * `FavouriteList.create`, never `createDefault`. `ensureDefault` is the only
 * path allowed to mint a default list — it does so with its own
 * `INSERT … ON CONFLICT DO NOTHING` against the one-default partial unique
 * index. Routing a second default through here would race that index
 * outside the one call built to survive the race, and `FavouriteList.create`
 * always produces `isDefault: false` regardless, so there is nothing this
 * command could do to make a second one even by accident.
 */
export class CreateListCommand implements CreateListPort {
  constructor(private readonly lists: FavouriteListRepositoryPort) {}

  async execute(input: CreateListInput): Promise<CreateListOutput> {
    const mine = await this.lists.listForUser(input.requesterUserId);
    const wanted = input.name.trim().toLowerCase();
    const taken = mine.some((list) => (list.name ?? "").trim().toLowerCase() === wanted);
    if (taken) {
      throw new ListNameTakenError(input.name);
    }

    const list = FavouriteList.create({
      userId: input.requesterUserId,
      name: input.name,
      createdAt: new Date(),
    });

    const id = await this.lists.save(list);
    return { id };
  }
}
