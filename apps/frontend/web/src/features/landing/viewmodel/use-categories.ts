import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { categoryQueries } from "../data/category.repository";
import { useLocale } from "./use-locale";

/**
 * How many categories the browse pages' category filter asks for.
 *
 * The whole set, not a page of it: the filter searches what it holds, so a
 * category left behind by the request is one a reader can type the name of and
 * be told does not exist. 48 is `categoryAll`'s own ceiling on `limit`, which
 * makes this the largest set one request can answer — past it the filter has
 * to move to the paginated `useAllCategories`, and the search with it.
 */
export const CATEGORY_FILTER_LIMIT = 48;

/** The few the home page shows above "see all". */
export function useCategoryPreview(limit: number) {
  return useQuery(categoryQueries.preview(useLocale(), limit));
}

/** Every category, loaded as the page is scrolled. */
export function useAllCategories() {
  return useInfiniteQuery(categoryQueries.all(useLocale()));
}
