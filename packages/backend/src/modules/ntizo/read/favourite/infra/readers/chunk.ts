/**
 * Splits a batch of ids into runs of at most `size`.
 *
 * The two card readers beside this file both need it, and both for the same
 * reason: the projections they delegate to clamp their own `limit` to a page
 * ceiling — a browse page's ceiling, which is not a bound on how many
 * favourites somebody has. Handing more ids than that ceiling would return the
 * first N and silently report the rest as deleted, which is a listing
 * disappearing from a page rather than an error anybody sees.
 *
 * A run of at most 48 or 50 means "one call per kind" still holds for every
 * page the product can actually produce; only a batch past the ceiling costs a
 * second round trip, and it costs one rather than losing rows.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error("[favourite] chunk size must be at least 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
