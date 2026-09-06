export interface TitleParts {
  key: string;
  values: { category?: string; city?: string; term?: string };
}

/**
 * The `h1`, which is now the page's only heading — the hero that used to carry
 * a title is gone.
 *
 * **The term outranks the category.** A reader who typed "corte de cabelo"
 * should see those words at the top of their results; the category they are in
 * is already stated, underlined, by the strip above. Ranking the category first
 * meant the heading answered a question nobody had asked.
 */
export function directoryTitle(
  search: { category?: string | undefined; city?: string | undefined; q?: string | undefined },
  categoryName: string | null,
): TitleParts {
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
