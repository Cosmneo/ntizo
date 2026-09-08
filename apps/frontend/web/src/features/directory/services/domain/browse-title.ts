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
 * **Whole translated sentences, never fragments joined at runtime.** A language
 * that orders the place before the trade cannot be served by concatenation, and
 * one that inflects the trade cannot be served at all — which is why the
 * category's name is interpolated as a **noun phrase and never inflected**.
 * "Canalizadores" would need an agent noun per category per language and
 * `category` stores none; "Canalização, pronta a reservar" would need that
 * name's grammatical gender, which is equally absent.
 *
 * The category name is resolved by the caller and may be null while the
 * category query is still in flight. Null falls back to the next-simplest title
 * rather than interpolating nothing: a heading reading "undefined services" for
 * one frame is worse than the generic one, and worse again if a crawler catches
 * it. `resultsScope` reads this function's own `values` for the same reason, so
 * the summary under the heading falls back with it.
 */
export function browseTitle(
  search: { category?: string | undefined; city?: string | undefined; q?: string | undefined },
  categoryName: string | null,
): TitleParts {
  // Trimmed, both of them: `?city=` and `?q=` reach here as empty strings
  // through a URL somebody typed, and an empty place or an empty term composed
  // into the sentence reads as a bug.
  const city = search.city?.trim() || undefined;
  const term = search.q?.trim() || undefined;
  const category = search.category ? (categoryName ?? undefined) : undefined;

  if (term && city) return { key: "titleServicesTermCity", values: { term, city } };
  if (term) return { key: "titleServicesTerm", values: { term } };
  if (category && city) return { key: "titleServicesCategoryCity", values: { category, city } };
  if (category) return { key: "titleServicesCategory", values: { category } };
  if (city) return { key: "titleServicesCity", values: { city } };
  return { key: "titleServices", values: {} };
}
