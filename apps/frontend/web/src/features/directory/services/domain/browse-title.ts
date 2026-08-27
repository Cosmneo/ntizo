export interface TitleParts {
  /** A key in the `directory` namespace. */
  key: string;
  values: { category?: string; city?: string };
}

/**
 * The `h1` for the services browse, composed from what is narrowing the list.
 *
 * Four whole translated sentences rather than fragments joined at runtime.
 * A language that orders the place before the trade cannot be served by
 * concatenation, and one that inflects the trade cannot be served at all —
 * which is why the category's name is interpolated as a **noun phrase and
 * never inflected**. "Canalizadores" would need an agent noun per category per
 * language and `category` stores none; "Canalização, pronta a reservar" would
 * need that name's grammatical gender, which is equally absent.
 *
 * The category name is resolved by the caller and may be null while the
 * category query is still in flight. Null falls back to the next-simplest
 * title rather than interpolating nothing: a heading reading "undefined
 * services" for one frame is worse than the generic one, and worse again if a
 * crawler catches it.
 */
export function browseTitle(
  search: { category?: string | undefined; city?: string | undefined },
  categoryName: string | null,
): TitleParts {
  // Trimmed: `?city=` reaches here as an empty string through a URL somebody
  // typed, and an empty place composed into the sentence reads as a bug.
  const city = search.city?.trim() || undefined;
  const category = search.category ? (categoryName ?? undefined) : undefined;

  if (category && city) {
    return { key: "titleServicesCategoryCity", values: { category, city } };
  }
  if (category) return { key: "titleServicesCategory", values: { category } };
  if (city) return { key: "titleServicesCity", values: { city } };
  return { key: "titleServices", values: {} };
}
