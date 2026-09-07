import { z } from "zod";
import { providerPublicReadModel } from "../../public/provider-public.schema";
import { serviceReadModel } from "../../public/service/service.schema";

/** How many tiles a cover mosaic draws at most. The read model's own cap, named. */
export const FAVOURITE_COVER_TILES = 4;

/**
 * One of somebody's lists, as the dialog and the index page meet it.
 *
 * `name` is null on the default list — the client renders a translated string
 * for it. Resolving it here would need a locale on a query the dialog calls
 * once per open, and would bake the reader's language into a cache entry
 * keyed on nothing else.
 */
export const favouriteListReadModel = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  isDefault: z.boolean(),
  itemCount: z.number().int().min(0),
  /**
   * Up to four images from the list's most recent items, for the cover mosaic.
   *
   * Fewer than four — often zero — is normal and the client draws the gaps.
   * These are the same resolved URLs the listings use, so a list of listings
   * with no photographs comes back empty and the client falls back to a mark,
   * rather than to four broken images.
   */
  coverUrls: z.array(z.string()).max(FAVOURITE_COVER_TILES),
});

/**
 * One saved listing, resolved into what a card needs.
 *
 * A discriminated union rather than two nullable fields: a row is a service or
 * a provider, never both and never neither, and two nullable fields would let
 * the type say otherwise and make every reader check twice.
 *
 * The two branches carry the *same* read models the browse pages carry —
 * `serviceReadModel` and `providerPublicReadModel`, not narrowed copies — so a
 * card rendered from a favourite and the same card rendered from `/services`
 * are the same component reading the same fields. A third, thinner model here
 * would be a second definition of "what a card needs", and the two would
 * drift.
 */
export const favouriteEntryReadModel = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("service"), savedAt: z.string(), service: serviceReadModel }),
  z.object({ kind: z.literal("provider"), savedAt: z.string(), provider: providerPublicReadModel }),
]);

/**
 * One page of a list, with the list's own header.
 *
 * `list` rides along rather than being a second query: the page that draws the
 * entries also draws the name and the count above them, and splitting that
 * into two round trips means the header and the body can disagree about how
 * many items there are.
 *
 * `nextCursor` is opaque. Pass it back to get the next page; null means there
 * is no more. Opaque on purpose — a client that parsed it would depend on the
 * ordering columns, and changing them would then be a breaking change. The
 * same contract `activityPageReadModel.nextCursor` states.
 */
export const favouriteListPageReadModel = z.object({
  list: favouriteListReadModel,
  items: z.array(favouriteEntryReadModel),
  nextCursor: z.string().nullable(),
});

export type FavouriteListDTO = z.infer<typeof favouriteListReadModel>;
export type FavouriteEntryDTO = z.infer<typeof favouriteEntryReadModel>;
export type FavouriteListPageDTO = z.infer<typeof favouriteListPageReadModel>;
