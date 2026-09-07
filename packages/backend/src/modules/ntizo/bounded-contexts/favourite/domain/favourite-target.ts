/**
 * Every kind of thing a person can save to a list.
 *
 * A closed list, not a free string. `Favourite.file` refuses anything else
 * with {@link UnknownFavouriteTargetError} — a row with `targetType`
 * `"booking"` would be unreadable by every projection and sit in a list
 * forever as a gap nothing renders.
 *
 * `favourite.schema.ts` names this constant in its own doc comment before it
 * exists; this file is what resolves that forward reference.
 */
export const FAVOURITE_TARGETS = ["service", "provider"] as const;

export type FavouriteTarget = (typeof FAVOURITE_TARGETS)[number];

export function isFavouriteTarget(value: string): value is FavouriteTarget {
  return (FAVOURITE_TARGETS as readonly string[]).includes(value);
}
