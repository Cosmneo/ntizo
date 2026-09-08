import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
// The browse pages' own field lists, imported rather than retyped. The two
// union members below carry `serviceReadModel` and `providerPublicReadModel`
// unchanged — the read model says so in as many words — so the favourites page
// draws `ServiceCard` and `ProviderCard` from exactly the fields `/services`
// and `/providers` fill them from. A hand-written selection here would be a
// second answer to "what a card needs", and `SERVICE_FIELDS`' own comment
// records what that costs: `providerSlug` went missing from it for one
// release and every card in the browse linked to `/providers/undefined` with
// the whole suite green.
import { PROVIDER_FIELDS } from "@/features/directory/data/directory.repository";
import { SERVICE_FIELDS } from "@/features/directory/services/data/service.repository";
import type { FavouriteList, FavouriteListPage, FavouriteTargetType } from "../domain/types";

/**
 * Field names taken from a **live introspection of a running server**
 * (Task 8's `__schema { queryType { fields { name } } }` run), not inferred
 * from the backend's source.
 *
 * The field kit (`generateFieldId` in `@cosmneo/onion-lasagna/graphql/field`)
 * flattens a nested schema key into a single wire name, so the backend's
 * `{ favourite: { marked } }` emits as `favouriteMarked` — never
 * `favourite.marked`, and never a `favourite { marked }` selection. `activity`
 * and `messaging` each lost a whole review round to exactly that mistake; the
 * names below are confirmed, so do not re-derive them.
 *
 * The nine fields, as the server reports them:
 *
 * | Wire field | Input type |
 * |---|---|
 * | `favouriteMarked` | `FavouriteMarkedInput!` |
 * | `favouriteListsFor` | `FavouriteListsForInput!` |
 * | `favouriteListMine` | **`JSON!`** |
 * | `favouriteListById` | `FavouriteListByIdInput!` |
 * | `favouriteQuickSave` | `FavouriteQuickSaveInput!` |
 * | `favouriteSetLists` | `FavouriteSetListsInput!` |
 * | `favouriteListCreate` | `FavouriteListCreateInput!` |
 * | `favouriteListRename` | `FavouriteListRenameInput!` |
 * | `favouriteListRemove` | `FavouriteListRemoveInput!` |
 *
 * **`favouriteListMine` is the one exception to "every field gets its own
 * named input".** Its input carries nothing but identity — the server reads
 * the caller off the session — so the kit emits the generic `JSON!` scalar
 * and there is *no* `FavouriteListMineInput` type in the schema at all
 * (confirmed by listing every `Favourite*` type the server has). A document
 * declaring one is refused before it reaches a resolver. `providerMine` and
 * `userMe` already use this same shape; see `provider.repository.ts`'s `MINE`.
 *
 * `favouriteMarked` and `favouriteListsFor` answer `[String!]!` — plain lists
 * of ids, **leaves on the wire**. They take no selection set, and adding one
 * is not a harmless no-op: it invalidates the whole document.
 *
 * **`favouriteListById`'s `items` is a GraphQL union, not an object type.**
 * The read model returns `items: [FavouriteListByIdOutput_Items_Item]`, a
 * discriminated union of a service entry and a provider entry, and the kit
 * emits it as a `union` — so a flat selection set on it is rejected at
 * validation, before any resolver runs. It has to be selected with inline
 * fragments, one per member:
 *
 * ```graphql
 * favouriteListById(input: $input) {
 *   items {
 *     ... on FavouriteListByIdOutput_Items_Item_Service { savedAt service { … } }
 *     ... on FavouriteListByIdOutput_Items_Item_Provider { savedAt provider { … } }
 *   }
 * }
 * ```
 *
 * Note there is no field the two members share on the wire: `savedAt` is
 * repeated inside each fragment rather than hoisted out of them, because a
 * union has no fields of its own to hoist onto — only an interface would.
 * The kit supplies `resolveType` from the row's `kind` discriminator, so this
 * works at runtime once the document is shaped this way; the failure mode is
 * purely a validation error on a document that looks reasonable. Verified by
 * building the schema in-process, the same way the table above was. No query
 * in this file selects those fields yet — this is written down for Tasks
 * 10-12, which will.
 *
 * The three fields still unused — `favouriteListById`, `favouriteListRename`,
 * `favouriteListRemove` — belong to the `/favourites` page and land with it
 * (Task 12). `favouriteListsFor` landed with the dialog, in Task 11.
 */
const MARKED = `
  query FavouriteMarked($input: FavouriteMarkedInput!) {
    favouriteMarked(input: $input)
  }`;

const LISTS_FOR = `
  query FavouriteListsFor($input: FavouriteListsForInput!) {
    favouriteListsFor(input: $input)
  }`;

const MY_LISTS = `
  query FavouriteListMine($input: JSON!) {
    favouriteListMine(input: $input) { id name isDefault itemCount coverUrls }
  }`;

/**
 * One page of a list's own entries — the `/favourites` page's whole content.
 *
 * **The inline fragments are mandatory, not a style.** `items` is a GraphQL
 * union, so a flat selection set on it is rejected at validation, before any
 * resolver runs. Confirmed against the running dev server rather than read off
 * the backend source: `FavouriteListByIdOutput_Items_Item` is a `UNION` whose
 * `possibleTypes` are the two names below.
 *
 * **`kind` is selected inside each fragment, and leaving it out is the trap
 * this query sets.** The document validates and the server answers happily
 * without it — but `FavouriteEntryDTO` is a discriminated union on `kind`, so
 * every entry would arrive with `kind: undefined` and the page's switch would
 * match neither branch and draw an empty grid over a list that is full. The
 * union has no fields of its own to hoist onto (only an interface would), so
 * `kind` and `savedAt` are repeated in both fragments rather than pulled out.
 *
 * The input's four fields — `id`, `limit`, `cursor`, `locale` — are the
 * server's, confirmed by introspecting `FavouriteListByIdInput`.
 */
const LIST_BY_ID = `
  query FavouriteListById($input: FavouriteListByIdInput!) {
    favouriteListById(input: $input) {
      list { id name isDefault itemCount coverUrls }
      items {
        ... on FavouriteListByIdOutput_Items_Item_Service {
          kind savedAt
          service {${SERVICE_FIELDS}
          }
        }
        ... on FavouriteListByIdOutput_Items_Item_Provider {
          kind savedAt
          provider { ${PROVIDER_FIELDS} }
        }
      }
      nextCursor
    }
  }`;

const QUICK_SAVE = `
  mutation FavouriteQuickSave($input: FavouriteQuickSaveInput!) {
    favouriteQuickSave(input: $input) { listIds }
  }`;

const SET_LISTS = `
  mutation FavouriteSetLists($input: FavouriteSetListsInput!) {
    favouriteSetLists(input: $input) { listIds }
  }`;

const CREATE_LIST = `
  mutation FavouriteListCreate($input: FavouriteListCreateInput!) {
    favouriteListCreate(input: $input) { id }
  }`;

/**
 * The plain network calls, exported separately from the hooks that wrap them.
 *
 * The split exists for one reason: a test can then assert the **real, unmocked
 * query string** off the spy (`spy.mock.calls[0][0]`) without rendering
 * anything. `communicationSend` went a whole review round with no such test,
 * and a rewrite that nested it as `communication { send(...) }` passed both
 * `vitest` and `tsc` clean. See `__tests__/favourites.repository.test.ts`.
 */

/**
 * Which of these listings the caller has saved, anywhere.
 *
 * Takes the ids on screen rather than everything ever saved, and that
 * direction is the design rather than an optimisation — a reader with two
 * thousand favourites must not ship two thousand ids to draw twenty-four
 * hearts. Capped server-side at `FAVOURITE_MARKS_MAX_IDS`.
 *
 * One bit per card. *Which* lists hold a listing is the dialog's question,
 * and `favouriteListsFor` answers it (Tasks 10-12).
 */
export function fetchFavouriteMarks(
  targetType: FavouriteTargetType,
  targetIds: string[],
): Promise<string[]> {
  return sessionGraphql<{ favouriteMarked: string[] }>(MARKED, {
    input: { targetType, targetIds },
  }).then((d) => d.favouriteMarked);
}

/**
 * Which of the caller's lists hold **one** listing — the dialog's tick marks.
 *
 * A separate field from `favouriteMarked` above, asked at a completely
 * different rate: the marks once per page of twenty-four cards, this once per
 * dialog open, and only when the press that opened it did not already answer.
 * A quick save returns the membership itself (see `quickSaveFavourite`), so
 * this is the *filled*-heart path — the press that saved nothing and
 * therefore knows nothing.
 *
 * A leaf on the wire like `favouriteMarked`: `[String!]!`, no selection set.
 */
export function fetchFavouriteListsFor(
  targetType: FavouriteTargetType,
  targetId: string,
): Promise<string[]> {
  return sessionGraphql<{ favouriteListsFor: string[] }>(LISTS_FOR, {
    input: { targetType, targetId },
  }).then((d) => d.favouriteListsFor);
}

/**
 * Every list the caller owns, with a count and a cover mosaic on each.
 *
 * Default list first — the server orders it that way deliberately (it is
 * where the heart saves, so the dialog's pre-ticked row belongs at the top),
 * and nothing on this side re-sorts it.
 */
export function fetchMyLists(): Promise<FavouriteList[]> {
  return sessionGraphql<{ favouriteListMine: FavouriteList[] }>(MY_LISTS, {
    input: {},
  }).then((d) => d.favouriteListMine);
}

/** How many entries one page of a list asks for — a browse page's own grid. */
export const FAVOURITE_PAGE_SIZE = 24;

/**
 * One page of the entries in a list, with the list's own header riding along.
 *
 * The header is part of the same answer rather than a second query: the page
 * draws the name and the count above the entries it drew, and two round trips
 * is how a header comes to claim eight items over a grid showing seven.
 *
 * `locale` goes to the server because the entries carry category names, which
 * are translated rows — the same argument every other listing read makes for
 * carrying it.
 */
export function fetchFavouriteListPage(
  listId: string,
  locale: string,
  cursor?: string,
): Promise<FavouriteListPage> {
  return sessionGraphql<{ favouriteListById: FavouriteListPage }>(LIST_BY_ID, {
    input: { id: listId, limit: FAVOURITE_PAGE_SIZE, cursor, locale },
  }).then((d) => d.favouriteListById);
}

/**
 * The heart: saves into the default list, creating it on the first tap.
 *
 * Returns every list the listing is now in, so a dialog opened straight
 * afterwards already knows the answer and need not ask again.
 */
export function quickSaveFavourite(
  targetType: FavouriteTargetType,
  targetId: string,
): Promise<string[]> {
  return sessionGraphql<{ favouriteQuickSave: { listIds: string[] } }>(QUICK_SAVE, {
    input: { targetType, targetId },
  }).then((d) => d.favouriteQuickSave.listIds);
}

/**
 * The dialog: states the whole desired membership at once.
 *
 * Not an add/remove pair — a pair would make the client diff two states and
 * send the difference, which is where a stale card sends `add` for something
 * already added, gets a conflict, and the row flickers.
 *
 * **`listIds: []` is meaningful, not empty**: it is how somebody unsaves a
 * listing altogether.
 */
export function setFavouriteLists(
  targetType: FavouriteTargetType,
  targetId: string,
  listIds: string[],
): Promise<string[]> {
  return sessionGraphql<{ favouriteSetLists: { listIds: string[] } }>(SET_LISTS, {
    input: { targetType, targetId, listIds },
  }).then((d) => d.favouriteSetLists.listIds);
}

/** A new, empty list. Returns its id. Names are trimmed and bounded server-side. */
export function createFavouriteList(name: string): Promise<string> {
  return sessionGraphql<{ favouriteListCreate: { id: string } }>(CREATE_LIST, {
    input: { name },
  }).then((d) => d.favouriteListCreate.id);
}

/**
 * The prefix every favourites query key starts with.
 *
 * One prefix, so a write can invalidate the whole feature in one call rather
 * than enumerating keys — a quick save changes both the marks on screen and
 * the counts and covers on every list. Same whole-prefix reasoning
 * `useSendMessage` gives for `["messaging"]`.
 */
export const FAVOURITES_QUERY_KEY = "favourites";

/** The marks sub-prefix, so an optimistic write can find every cached page of hearts. */
export const FAVOURITE_MARKS_QUERY_KEY = "marks";

/**
 * Where the sorted id list sits in a marks key —
 * `[FAVOURITES_QUERY_KEY, FAVOURITE_MARKS_QUERY_KEY, targetType, ids]`.
 *
 * Named here, beside the key it indexes, rather than written as a bare `3`
 * wherever a key is read back: `patchMarks` reads that slot to check a cached
 * page actually asked about the listing it is about to patch, and an index
 * that drifted from the key's shape would silently stop matching — every
 * heart would go back to waiting for the round trip, with every test still
 * green except the ones that watch for exactly that.
 */
export const FAVOURITE_MARKS_KEY_IDS_INDEX = 3;

export const favouriteQueries = {
  /**
   * The hearts for one page of cards.
   *
   * **The ids in the key are sorted**, and a copy is sorted rather than the
   * caller's own array: two different pages of cards are two cache entries,
   * but the *same* page re-sorted by price is one. Without the sort, changing
   * the sort order of a listing would silently buy a second round trip and a
   * second copy of the same answer; sorting in place would reorder the cards
   * on screen as a side effect of asking about them.
   *
   * `enabled` is deliberately **not** set here. Half of it is the caller's
   * business — `ids.length > 0` is knowable from the arguments, but whether
   * there is a session is not something the data layer reads. `useFavouriteMarks`
   * sets both together.
   */
  marks: (targetType: FavouriteTargetType, targetIds: string[]) =>
    queryOptions({
      queryKey: [
        FAVOURITES_QUERY_KEY,
        FAVOURITE_MARKS_QUERY_KEY,
        targetType,
        [...targetIds].sort(),
      ] as const,
      queryFn: () => fetchFavouriteMarks(targetType, targetIds),
    }),

  /**
   * The tick marks for one listing, under the `["favourites"]` prefix like
   * everything else — so a save's whole-prefix invalidation reaches it and a
   * dialog reopened after a tick does not show the membership it had before.
   *
   * Keyed on the target rather than on the ids it answers with: the question
   * is "which lists hold this listing", and the same listing asked about
   * twice is one cache entry however its answer changed in between.
   */
  listsFor: (targetType: FavouriteTargetType, targetId: string) =>
    queryOptions({
      queryKey: [FAVOURITES_QUERY_KEY, "listsFor", targetType, targetId] as const,
      queryFn: () => fetchFavouriteListsFor(targetType, targetId),
    }),

  /** The caller's own lists. No arguments — the server resolves them from the session. */
  myLists: () =>
    queryOptions({
      queryKey: [FAVOURITES_QUERY_KEY, "lists", "mine"] as const,
      queryFn: () => fetchMyLists(),
    }),

  /**
   * The entries in one list, paged by cursor.
   *
   * Under the `["favourites"]` prefix like everything else, so a save's
   * whole-prefix invalidation reaches it: unsaving something from another tab
   * must not leave it sitting on this page.
   *
   * `locale` is in the key. The entries carry translated category names, so
   * one cache entry per language is correct — reusing a Portuguese page for an
   * English reader is exactly the bug `RatingMark` was fixed for.
   *
   * `nextCursor` is null at the end and `hasNextPage` reads `undefined` as
   * "no more", so the two are mapped rather than passed through — the same
   * mapping `activityQueries.mine` documents.
   */
  listPage: (listId: string, locale: string) =>
    infiniteQueryOptions({
      queryKey: [FAVOURITES_QUERY_KEY, "listPage", listId, locale] as const,
      queryFn: ({ pageParam }) => fetchFavouriteListPage(listId, locale, pageParam),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
};
