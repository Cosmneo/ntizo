import { Favourite } from "../../domain/aggregates/favourite.aggregate";
import type { FavouriteListRepositoryPort } from "../ports/outbound/favourite-list.repository.port";
import type { FavouriteRepositoryPort } from "../ports/outbound/favourite.repository.port";
import type { QuickSaveInput, QuickSaveOutput, QuickSavePort } from "../ports/inbound/quick-save.command.port";

/**
 * The heart. One tap files the listing into the list every person already
 * has, without asking which one.
 *
 * Three steps, in an order that matters:
 *
 * 1. **`ensureDefault`.** Lazily, not at sign-up: a row for every account
 *    that never saves anything is a table full of nothing. Idempotent under
 *    concurrency — see the port's own doc comment for why that has to be an
 *    `INSERT … ON CONFLICT DO NOTHING`, not a read followed by a decision.
 * 2. **`Favourite.file`**, which validates `targetType` against
 *    {@link FAVOURITE_TARGETS} and throws `UnknownFavouriteTargetError`
 *    before anything is written. It does **not** check that the target
 *    itself exists — see the class doc comment below for why that is
 *    deliberate.
 * 3. **`add`**, which is `ON CONFLICT DO NOTHING`: a double-tap on a slow
 *    connection, or the same card open in two tabs, files the same row twice
 *    and neither call sees an error.
 *
 * Returns every list the listing is now in — read back through `listsFor`
 * rather than assembled from what this call already knows — so a listing
 * already sitting in "Casa nova" shows both lists after a quick-save, and
 * the dialog that opens next needs no second round trip to find out.
 *
 * **Never checks that the target exists.** Doing so would mean this context
 * querying Catalog and Provider directly, which is the boundary the missing
 * foreign key on `favourite.target_id` exists to keep — see
 * `favourite.schema.ts` and `Favourite`'s own doc comment. A favourite
 * pointing at nothing is dropped on read, where those two contexts are
 * already being consulted anyway.
 */
export class QuickSaveCommand implements QuickSavePort {
  constructor(
    private readonly lists: FavouriteListRepositoryPort,
    private readonly favourites: FavouriteRepositoryPort,
  ) {}

  async execute(input: QuickSaveInput): Promise<QuickSaveOutput> {
    const now = new Date();

    const defaultList = await this.lists.ensureDefault(input.requesterUserId, now);

    const favourite = Favourite.file({
      // `ensureDefault` always hands back a list that is already a row —
      // rehydrated from what it inserted or from whichever tab won the race
      // to insert it — so `id` is never absent here even though the aggregate
      // types it optional for the create-before-save case. The same `.id!`
      // `submitContactRequest` reads off its own just-stored aggregate.
      listId: defaultList.id!,
      // Stamped from the caller, never from the input — `QuickSaveInput`
      // carries no field a caller could use to save into somebody else's
      // list.
      userId: input.requesterUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      // No `id` of its own: the row's `gen_random_uuid()` mints one. Supplying
      // one here is what `DrizzleFavouriteRepository.add`'s doc comment warns
      // against — a caller-chosen id would have its own collisions swallowed
      // by the same `ON CONFLICT DO NOTHING` meant only for a re-tapped heart.
      createdAt: now,
    });

    await this.favourites.add(favourite);

    const listIds = await this.favourites.listsFor({
      userId: input.requesterUserId,
      targetType: input.targetType,
      targetId: input.targetId,
    });

    return { listIds };
  }
}
