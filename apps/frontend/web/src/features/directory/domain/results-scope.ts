/**
 * What the count sentence says the results were found in.
 *
 * The summary under both browse headings is two translated pieces — "38
 * services found" and then a whole clause naming what they were found in — so
 * that a language can order, inflect or case the category and the city as its
 * own grammar needs, instead of receiving "in" plus a name in the order
 * English happened to put them.
 *
 * **The clause describes what is filtering, which is not always what the
 * heading says.** A typed term outranks the category in the heading — the h1
 * over a search reads "barba", not "Beleza e cabelo" — but the category is
 * still narrowing the list underneath. Feeding the heading's own values to
 * `resultsScope` therefore printed "0 services found in all categories" over a
 * search inside a category, with that category's chip sitting lit two lines
 * above: a sentence that contradicts the screen around it. `scopeValues`
 * exists to answer the narrower question the clause actually asks.
 *
 * In `domain/` and shared by both pages: pure functions of a search and a
 * resolved category name, naming no route. Each page had its own identical
 * copy of the clause picker, which is how the two summaries came to describe
 * the same four cases differently.
 */
export function resultsScope(values: { category?: string; city?: string }): string {
  if (values.category) return values.city ? "categoryCity" : "category";
  return values.city ? "city" : "all";
}

/**
 * The category and city the list is actually narrowed by, named for the reader.
 *
 * `categoryName` is the resolved name or null, exactly as the pages already
 * hand it to `browseTitle` / `directoryTitle`: null while the category query
 * is in flight, so the clause falls back to the plainer form for that moment
 * rather than naming a category whose name has not arrived. A code is never
 * printed — "em plumbing" is worse than "em todas as categorias".
 *
 * The city is trimmed and dropped when empty, because `?city=` reaches a page
 * as an empty string through a URL somebody typed, and an empty place composed
 * into the sentence reads as a bug.
 */
export function scopeValues(
  search: { category?: string | undefined; city?: string | undefined },
  categoryName: string | null,
): { category?: string; city?: string } {
  const city = search.city?.trim() || undefined;
  const category = search.category ? (categoryName ?? undefined) : undefined;
  return {
    ...(category ? { category } : {}),
    ...(city ? { city } : {}),
  };
}
