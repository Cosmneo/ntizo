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
 *
 * `FavouriteList.create` runs **before** the collision scan, not after —
 * the same ordering `RenameListCommand` uses and for the same reason: a
 * blank or over-length name must reach `assertName`'s validation error, not
 * be scored against this person's lists first. Scanning first was a real
 * bug this comment now documents the fix for: `input.name.trim()` on a
 * blank name is `""`, and coercing a nameless default's `null` name to `""`
 * for the comparison made `"" === ""` a match, so a blank name surfaced as
 * `ListNameTakenError` — "you already have a list called '   '", a 409 —
 * instead of the validation error it actually triggered. Two fixes, not
 * one: validating first stops a blank name from ever reaching the scan, and
 * the scan below now skips `null` names outright rather than coercing them —
 * a nameless default is not a list named "".
 */
export class CreateListCommand implements CreateListPort {
  constructor(private readonly lists: FavouriteListRepositoryPort) {}

  async execute(input: CreateListInput): Promise<CreateListOutput> {
    // Validates blank/over-length here, before any read — see this class's
    // own doc comment for why the order matters.
    const list = FavouriteList.create({
      userId: input.requesterUserId,
      name: input.name,
      createdAt: new Date(),
    });
    // `assertName` only ever returns a non-blank string, and `create` is
    // what sets it — `list.name` is typed `string | null` only because
    // `FavouriteListProps.name` is shared with the (genuinely nullable)
    // default-list case.
    const name = list.name!;

    const mine = await this.lists.listForUser(input.requesterUserId);
    const wanted = name.trim().toLowerCase();
    // Lists with a `null` name — the nameless default — are skipped, not
    // coerced to `""`: a nameless default is not a list named "".
    const taken = mine.some((existing) => existing.name !== null && existing.name.trim().toLowerCase() === wanted);
    if (taken) {
      throw new ListNameTakenError(name);
    }

    const id = await this.lists.save(list);
    return { id };
  }
}
