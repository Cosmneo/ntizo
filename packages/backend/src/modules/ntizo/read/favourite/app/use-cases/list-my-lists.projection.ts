import { DEFAULT_LOCALE } from "@ntizo/shared";
import { FAVOURITE_COVER_TILES, type FavouriteListDTO } from "@ntizo/shared/read-models";
import type { FavouriteList } from "../../../../bounded-contexts/favourite/domain/aggregates/favourite-list.aggregate";
import type { FavouriteListRepositoryPort } from "../../../../bounded-contexts/favourite/app/ports/outbound/favourite-list.repository.port";
import type { FavouriteRepositoryPort } from "../../../../bounded-contexts/favourite/app/ports/outbound/favourite.repository.port";
import type { ServiceCardReaderPort } from "../ports/outbound/service-card-reader.port";
import type { ProviderCardReaderPort } from "../ports/outbound/provider-card-reader.port";
import { coverUrlFor, resolveTargets, type FavouriteTargetRef } from "./resolve-targets";

/**
 * The default list first, then everything else in the order it arrived.
 *
 * `listForUser` returns lists **newest first**, and the default list is the
 * oldest a person has — it is created by their very first heart-tap — so the
 * repository hands it back LAST. It is where the heart saves; anywhere else in
 * the order and the dialog's pre-ticked row is somewhere down the scroll.
 *
 * A partition rather than a sort, so the repository's own order survives
 * inside each group: re-sorting the rest would throw away the ordering the
 * index page is read in. Written to tolerate a row set with no default (a
 * person who has never saved has no lists at all) and, defensively, with more
 * than one.
 */
function defaultFirst(lists: readonly FavouriteList[]): FavouriteList[] {
  return [...lists.filter((l) => l.isDefault), ...lists.filter((l) => !l.isDefault)];
}

/**
 * How many lists get a cover mosaic, however many the caller has made.
 *
 * **What this protects against: a signed-in caller scaling this field's
 * database fan-out by creating lists.** Nothing anywhere caps how many lists a
 * person may have — not the aggregate, not the repository, not
 * `CreateListCommand` — so without a bound here `lists × 4` cover targets flow
 * into the card readers, which chunk and `Promise.all` over every run. Two
 * hundred lists would be eight hundred ids, and because each run of the
 * delegated projections is itself several round trips (`ListServicesProjection`
 * fires `listPublished` *and* `countPublished`; `listActive` runs page, count
 * and `categoriesFor`), that is dozens of concurrent queries from one request.
 * One person could exhaust the connection pool for everybody by making lists,
 * which is self-service amplification rather than a theoretical cost.
 *
 * Twelve, and the number is chosen rather than picked: `12 × FAVOURITE_COVER_TILES`
 * is 48, which is exactly `MAX_SERVICE_PAGE`, the largest batch either card
 * reader resolves in a single run. So the worst case this field can produce is
 * **one call per kind**, whatever the caller does.
 *
 * A list past the bound is still returned, still named, and still counted —
 * only its mosaic is absent, and `favouriteListReadModel.coverUrls` already
 * says fewer than four tiles (often zero) is normal and the client draws the
 * gaps. Degrading the decoration on the thirteenth list is a far smaller cost
 * than the alternatives: capping `listForUser` itself would hide lists a person
 * owns from the very dialog they save into, and merely throttling the
 * concurrency would keep the total work unbounded and make the request slow
 * instead of making it cheap.
 */
export const MAX_LISTS_WITH_COVERS = 12;

/**
 * Everybody's own lists, with a count and a cover mosaic on each.
 *
 * Takes no reader-supplied user id. `requesterUserId` is stamped by the
 * GraphQL handler from the session, never taken from `args` — this class has
 * no way to read anybody's lists but its own caller's, and `listForUser` is
 * scoped by that id, so the ids it goes on to count and cover are its own by
 * construction. That matters more than it looks: `countsFor` and
 * `coverTargetsFor` take a list id **on trust and check no owner**, so the
 * only thing standing between them and a stranger's list is that the ids they
 * are handed came out of this scoped read.
 *
 * `locale` is accepted but the GraphQL field deliberately does not expose one
 * — see `listMyLists`' own doc comment. Nothing in this answer is prose: the
 * default list's name is null so the client can translate it, and a cover is
 * an image URL. The parameter stays because the readers below need *some*
 * locale and because a field that one day carries text can pass one without
 * this signature changing; production reaches it as `DEFAULT_LOCALE`.
 */
export class ListMyListsProjection {
  constructor(
    private readonly lists: FavouriteListRepositoryPort,
    private readonly favourites: FavouriteRepositoryPort,
    private readonly services: ServiceCardReaderPort,
    private readonly providers: ProviderCardReaderPort,
  ) {}

  async execute(input: {
    requesterUserId: string;
    locale?: string | undefined;
  }): Promise<FavouriteListDTO[]> {
    const rows = await this.lists.listForUser(input.requesterUserId);

    // Nothing at all for somebody who has never saved. The default list is
    // created on first save, not at sign-up — inventing one here would be a
    // query with a side effect, and the page would show an empty list to
    // somebody who has no lists. It also spares four round trips that could
    // only come back empty.
    if (rows.length === 0) return [];

    const ordered = defaultFirst(rows);
    // Non-null, the same call `ListActivityProjection` makes on its own rows:
    // every list here came back from the repository, and a stored row always
    // has an id — the optional `id` on the aggregate is for one that has not
    // been saved yet, which cannot reach a read.
    const ids = ordered.map((l) => l.id!);
    // Covers are asked for only up to the bound; counts are asked for every
    // list. The asymmetry is the point: a count is one more row in a single
    // `GROUP BY`, while a cover is an id that has to be resolved into a card
    // through another projection. One of those scales with the caller's list
    // count harmlessly and the other does not — see MAX_LISTS_WITH_COVERS.
    const coveredIds = ids.slice(0, MAX_LISTS_WITH_COVERS);

    // One query for the counts and one for the covers, for **every** list —
    // twelve lists must not be twenty-four queries. Concurrent because they
    // are independent.
    const [counts, covers] = await Promise.all([
      this.favourites.countsFor(ids),
      this.favourites.coverTargetsFor({ listIds: coveredIds, perList: FAVOURITE_COVER_TILES }),
    ]);

    // The same rule one level down: every covered list's targets are resolved
    // together, one call per kind for the whole page, never one call per list.
    // Bounded above by `MAX_LISTS_WITH_COVERS * FAVOURITE_COVER_TILES`, so this
    // array cannot grow past a single run of either reader.
    const refs: FavouriteTargetRef[] = coveredIds.flatMap((id) => covers.get(id) ?? []);
    const resolved = await resolveTargets(
      refs,
      { services: this.services, providers: this.providers },
      input.locale ?? DEFAULT_LOCALE,
    );

    return ordered.map((list) => {
      const id = list.id!;
      return {
        id,
        // Carried through as null on the default list. The client renders a
        // translated string for it — resolving it here would bake the
        // reader's language into an answer keyed on nothing else.
        name: list.name,
        isDefault: list.isDefault,
        // `?? 0`, never `counts.size` or an assumption that every id is in the
        // map: a `GROUP BY` has no row to return for a list with no entries,
        // so an empty list is absent rather than present with zero.
        itemCount: counts.get(id) ?? 0,
        // Filtered after mapping, not before: a target that no longer resolves
        // has no tile, and the list simply shows fewer. Sliced as a belt on
        // the read model's own cap, in case a repository ever returns more
        // than the `perList` it was asked for.
        coverUrls: (covers.get(id) ?? [])
          .map((ref) => coverUrlFor(ref, resolved))
          .filter((url): url is string => url !== null)
          .slice(0, FAVOURITE_COVER_TILES),
      };
    });
  }
}
