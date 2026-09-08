export interface TitleParts {
  /** A key in the `directory` namespace. */
  key: string;
  values: { category?: string; city?: string; term?: string };
}

/**
 * The `h1`, which is now the page's only heading — the hero that used to carry
 * a title is gone.
 *
 * **The term outranks the category.** A reader who typed "corte de cabelo"
 * should see those words at the top of their results; the category they are in
 * is already stated by the filled category pill below. Ranking the category
 * first meant the heading answered a question nobody had asked.
 *
 * Same reasoning as `browseTitle` in the services domain — whole translated
 * sentences rather than fragments joined at runtime, the category interpolated
 * as an uninflected noun phrase, a null category name (still in flight)
 * falling back to the plainer title rather than a heading with "undefined" in
 * it, and both `?city=` and `?q=` trimmed so an empty one composes nothing. See
 * `features/directory/services/domain/browse-title.ts` for the full argument;
 * this is its sibling, not a shared helper, because the two key sets differ and
 * a shared function would just take the key prefix as a parameter — the same
 * six `if`s with an extra argument.
 */
export function directoryTitle(
  search: { category?: string | undefined; city?: string | undefined; q?: string | undefined },
  categoryName: string | null,
): TitleParts {
  // Trimmed, both of them: `?city=` and `?q=` reach here as empty strings
  // through a URL somebody typed, and an empty place or an empty term composed
  // into the sentence reads as a bug.
  const city = search.city?.trim() || undefined;
  const term = search.q?.trim() || undefined;
  const category = search.category ? (categoryName ?? undefined) : undefined;

  if (term && city) return { key: "titleProvidersTermCity", values: { term, city } };
  if (term) return { key: "titleProvidersTerm", values: { term } };
  if (category && city) return { key: "titleProvidersCategoryCity", values: { category, city } };
  if (category) return { key: "titleProvidersCategory", values: { category } };
  if (city) return { key: "titleProvidersCity", values: { city } };
  return { key: "titleProviders", values: {} };
}
