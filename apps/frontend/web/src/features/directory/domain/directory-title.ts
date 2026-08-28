export interface TitleParts {
  /** A key in the `directory` namespace. */
  key: string;
  values: { category?: string; city?: string };
}

/**
 * The `h1` for the directory, composed from what is narrowing the list.
 *
 * Same reasoning as `browseTitle` in the services domain — four whole
 * translated sentences, the category interpolated as an uninflected noun
 * phrase, and a null category name (still in flight) falling back to the
 * plain title rather than a heading with "undefined" in it. See
 * `features/directory/services/domain/browse-title.ts` for the full
 * argument; this is its sibling, not a shared helper, because the two key
 * sets differ and a shared function would just take the key prefix as a
 * parameter — the same four `if`s with an extra argument.
 */
export function directoryTitle(
  search: { category?: string | undefined; city?: string | undefined },
  categoryName: string | null,
): TitleParts {
  // Trimmed: `?city=` reaches here as an empty string through a URL somebody
  // typed, and an empty place composed into the sentence reads as a bug.
  const city = search.city?.trim() || undefined;
  const category = search.category ? (categoryName ?? undefined) : undefined;

  if (category && city) {
    return { key: "titleProvidersCategoryCity", values: { category, city } };
  }
  if (category) return { key: "titleProvidersCategory", values: { category } };
  if (city) return { key: "titleProvidersCity", values: { city } };
  return { key: "titleProviders", values: {} };
}
