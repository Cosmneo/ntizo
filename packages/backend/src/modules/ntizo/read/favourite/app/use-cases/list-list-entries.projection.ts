import { DEFAULT_LOCALE } from "@ntizo/shared";
import {
  FAVOURITE_COVER_TILES,
  type FavouriteEntryDTO,
  type FavouriteListPageDTO,
} from "@ntizo/shared/read-models";
import { ListNotYoursError } from "../../../../bounded-contexts/favourite/domain/exceptions";
import type { FavouriteListRepositoryPort } from "../../../../bounded-contexts/favourite/app/ports/outbound/favourite-list.repository.port";
import type { FavouriteRepositoryPort } from "../../../../bounded-contexts/favourite/app/ports/outbound/favourite.repository.port";
import type { ServiceCardReaderPort } from "../ports/outbound/service-card-reader.port";
import type { ProviderCardReaderPort } from "../ports/outbound/provider-card-reader.port";
import { coverUrlFor, resolveTargets, type FavouriteTargetRef } from "./resolve-targets";

/**
 * The default page, and the ceiling.
 *
 * Both live here rather than as zod `.default()` on the field: a zod default
 * does not survive into the GraphQL schema — the argument still emits as
 * `Int` and every caller would have to send one. `limit` is caller-controlled
 * and an unbounded one is a way to ask for the whole table. The same ruling
 * `ListActivityProjection` states, applied rather than rediscovered.
 */
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;

/**
 * One page of one of the caller's own lists, with the list's header above it.
 *
 * The ownership check is the first thing this class does, and the order is the
 * whole point. `entriesIn`, `countsFor` and `coverTargetsFor` all take a list
 * id **on trust and check no owner** — their port doc comments say so in as
 * many words — and this is the method that reaches them straight from GraphQL
 * input. `entriesIn({ listId: args.listId })` with nothing in front of it
 * reads out a stranger's saved listings to anybody who guesses or scrapes a
 * list id. The identity has to come from the session; a list id in the request
 * is a claim, not proof, and none of those three methods can tell the
 * difference.
 *
 * `listForUser` rather than `ownedBy` does that job here because this page
 * needs the list's name and `isDefault` for its header anyway, and one scoped
 * read answers both questions. A list id that is not in the caller's own rows
 * is refused before a single entry is read.
 *
 * **Known cost, deliberately left.** That read returns *every* one of the
 * caller's lists on every page request of a single list, so deep paging
 * re-fetches all of them each time. It is one query returning N small rows, not
 * a fan-out — unlike `ListMyListsProjection`'s covers, nothing here multiplies
 * into concurrent queries, so a caller cannot amplify it into a pool problem by
 * making lists. Collapsing it to O(1) needs a `findOwned({ id, userId })` on
 * `FavouriteListRepositoryPort` that returns the one row or null, which would
 * answer the ownership question and the header question in a single targeted
 * read — a better shape than either `ownedBy` plus a second lookup or this. It
 * is left because that method, its Drizzle implementation and its DB-backed
 * test belong to the repositories rather than to this slice.
 */
export class ListListEntriesProjection {
  constructor(
    private readonly lists: FavouriteListRepositoryPort,
    private readonly favourites: FavouriteRepositoryPort,
    private readonly services: ServiceCardReaderPort,
    private readonly providers: ProviderCardReaderPort,
  ) {}

  async execute(input: {
    requesterUserId: string;
    listId: string;
    limit?: number | undefined;
    cursor?: string | null | undefined;
    locale?: string | undefined;
  }): Promise<FavouriteListPageDTO> {
    // First, before anything is read. See the class doc comment.
    const mine = await this.lists.listForUser(input.requesterUserId);
    const list = mine.find((l) => l.id === input.listId);
    if (!list) {
      // `ListNotYoursError` for a list that exists and is somebody else's *and*
      // for one that exists for nobody: telling the two apart is telling a
      // caller which ids are real, one guess at a time.
      throw new ListNotYoursError(input.listId);
    }

    // Clamped here, not in the schema: see DEFAULT_LIMIT's comment above.
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

    const [counts, covers, page] = await Promise.all([
      this.favourites.countsFor([input.listId]),
      this.favourites.coverTargetsFor({ listIds: [input.listId], perList: FAVOURITE_COVER_TILES }),
      // The cursor goes through unparsed. It is opaque, and a caller that
      // constructed one would be depending on the ordering columns.
      this.favourites.entriesIn({ listId: input.listId, limit, cursor: input.cursor ?? null }),
    ]);

    const coverRefs: FavouriteTargetRef[] = covers.get(input.listId) ?? [];
    const pageRefs: FavouriteTargetRef[] = page.items.map((f) => ({
      targetType: f.targetType,
      targetId: f.targetId,
    }));

    // The page's own targets and the header's cover targets resolved together,
    // in the same one-call-per-kind pass. On the first page they are largely
    // the same ids — the cover tiles *are* the four most recent entries — and
    // asking for them separately would be two more queries for ids already in
    // hand. `resolveTargets` deduplicates, so the overlap costs nothing.
    const resolved = await resolveTargets(
      [...pageRefs, ...coverRefs],
      { services: this.services, providers: this.providers },
      input.locale ?? DEFAULT_LOCALE,
    );

    // Mapped back in the repository's order — newest saved first — dropping
    // anything that did not resolve. A discriminated union rather than two
    // nullable fields, so a row is a service or a provider and the type never
    // admits a third possibility.
    const items: FavouriteEntryDTO[] = [];
    for (const favourite of page.items) {
      const savedAt = favourite.createdAt.toISOString();
      if (favourite.targetType === "service") {
        const service = resolved.services.get(favourite.targetId);
        if (service) items.push({ kind: "service", savedAt, service });
        continue;
      }
      const provider = resolved.providers.get(favourite.targetId);
      if (provider) items.push({ kind: "provider", savedAt, provider });
    }

    return {
      list: {
        id: input.listId,
        name: list.name,
        isDefault: list.isDefault,
        itemCount: counts.get(input.listId) ?? 0,
        coverUrls: coverRefs
          .map((ref) => coverUrlFor(ref, resolved))
          .filter((url): url is string => url !== null)
          .slice(0, FAVOURITE_COVER_TILES),
      },
      items,
      // Straight from the repository, and deliberately **not** recomputed from
      // `items`. The cursor marks the last row the repository *returned*, not
      // the last one that survived resolution — a page whose every row pointed
      // at a deleted listing returns nothing and still moves forward.
      // Recomputing it from the survivors would park the reader on the dropped
      // row's position and fetch it forever.
      nextCursor: page.nextCursor,
    };
  }
}
