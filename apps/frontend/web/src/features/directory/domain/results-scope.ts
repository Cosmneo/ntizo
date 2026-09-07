/**
 * Which `resultsScope` clause the count sentence ends with.
 *
 * The summary under both browse headings is two translated pieces — "38
 * services found" and then a whole clause naming what they were found in — so
 * that a language can order, inflect or case the category and the city as its
 * own grammar needs, instead of receiving "in" plus a name in the order
 * English happened to put them. This picks the clause.
 *
 * **Given the title's resolved values, not the raw search.** `browseTitle` and
 * `directoryTitle` fall back to the plainer form while the category query is
 * still in flight, and reading the search directly would leave the heading
 * saying "Services" while the line under it named a category whose name had
 * not arrived. Taking their `values` makes the two disagree impossible.
 *
 * In `domain/` and shared by both pages: it is a pure function of
 * `TitleParts.values`, it names no route, and each page had its own identical
 * copy — which is how the two summaries come to describe the same four cases
 * differently.
 */
export function resultsScope(values: { category?: string; city?: string }): string {
  if (values.category) return values.city ? "categoryCity" : "category";
  return values.city ? "city" : "all";
}
