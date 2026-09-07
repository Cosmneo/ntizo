import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { localeSchema } from "@ntizo/shared";
import { favouriteListPageReadModel, favouriteListReadModel } from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * Which of the listings on screen the caller has saved.
 *
 * **Takes the ids on screen** rather than returning everything ever saved, and
 * the direction is the design, not an optimisation: a reader with two thousand
 * favourites must not ship two thousand ids to draw twenty-four hearts. The
 * page already knows what it is rendering, so it asks about that.
 *
 * `.max(48)` is the server's existing page cap — `MAX_SERVICE_PAGE`, the most
 * cards a browse page can hold — so a caller cannot ask about more listings
 * than a page can show. Bounded rather than open for the same reason
 * `favouriteSetLists`'s `listIds` is: an unbounded array in a query argument
 * is a way to hand the database an arbitrarily long `IN` list.
 *
 * The target type literals are repeated here rather than imported from the
 * bounded context's `FAVOURITE_TARGETS` — the same trade `write/favourite`'s
 * mutations make, so a schema file never imports a domain module.
 */
export const markMyFavourites = defineQuery({
  input: zodSchema(
    z.object({
      targetType: z.enum(["service", "provider"]),
      targetIds: z.array(z.string().min(1).max(64)).max(48),
    }),
  ),
  output: zodSchema(z.array(z.string())),
  docs: { summary: "Which of these listings you have saved", tags: ["Favourite"] },
});

/**
 * Which of the caller's lists hold one listing — the tick marks in the dialog.
 *
 * Separate from `marked` above because the two are asked at completely
 * different rates: the marks once per page of cards, this once per dialog
 * open. One field doing both would send the dialog's payload to every page
 * that never opens one.
 */
export const listsForTarget = defineQuery({
  input: zodSchema(
    z.object({
      targetType: z.enum(["service", "provider"]),
      targetId: z.string().min(1).max(64),
    }),
  ),
  output: zodSchema(z.array(z.string())),
  docs: { summary: "Which of your lists hold this listing", tags: ["Favourite"] },
});

/**
 * Every list the caller owns, with a count and a cover mosaic on each.
 *
 * Takes no user id — it resolves from the session, so there is nothing to
 * tamper with. Takes no `locale` either, and that absence is deliberate: this
 * answer carries no prose. The default list's `name` is null on purpose so the
 * client can translate it, every other name is one the person typed
 * themselves, and `coverUrls` are images. A locale argument here would be a
 * control with no observable effect and one more cache key to get wrong.
 */
export const listMyLists = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(z.array(favouriteListReadModel)),
  docs: { summary: "Your lists, with counts and covers", tags: ["Favourite"] },
});

/**
 * One page of one of the caller's own lists.
 *
 * `locale` **is** taken here, unlike `mine` above, because these rows carry
 * prose: a service's name, its description and its category, all resolved
 * server-side.
 *
 * `limit`/`cursor` are `.optional()` rather than `.default()`: a zod default
 * does not reach the GraphQL schema — the argument still emits as required and
 * every caller would have to send one. The real default (24) and the clamp
 * (50) live in `ListListEntriesProjection`. The same ruling `listMyActivity`
 * records, applied rather than rediscovered.
 *
 * The list id is an argument, and it is a claim rather than proof — the
 * projection checks the caller owns it before reading a single entry. See its
 * doc comment; the repository methods behind it check no owner at all.
 */
export const listEntries = defineQuery({
  input: zodSchema(
    z.object({
      id: z.string().min(1).max(64),
      limit: z.number().int().min(1).max(50).optional(),
      cursor: z.string().optional(),
      locale: localeSchema.optional(),
    }),
  ),
  output: zodSchema(favouriteListPageReadModel),
  docs: { summary: "One page of one of your lists", tags: ["Favourite"] },
});

/**
 * Nested two ways, matching `write/favourite`'s split: `favourite` holds the
 * questions about a listing, and `favouriteList` holds the ones about a list.
 * The field kit flattens each nested key to a single wire name —
 * `{ favourite: { marked } }` emits as `favouriteMarked`, never
 * `favourite.marked` — so the four fields above land on the wire as
 * `favouriteMarked`, `favouriteListsFor`, `favouriteListMine` and
 * `favouriteListById`. Task 8 mounts these under `buildPrivateGraphQLFields`;
 * Task 9's frontend calls them by those flattened names.
 */
export const favouriteReadSchema = defineGraphQLSchema(
  {
    favourite: { marked: markMyFavourites, listsFor: listsForTarget },
    favouriteList: { mine: listMyLists, byId: listEntries },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
