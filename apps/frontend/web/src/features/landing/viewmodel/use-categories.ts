import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { categoryQueries } from "../data/category.repository";
import { useLocale } from "./use-locale";

/** The few the home page shows above "see all". */
export function useCategoryPreview(limit: number) {
  return useQuery(categoryQueries.preview(useLocale(), limit));
}

/** Every category, loaded as the page is scrolled. */
export function useAllCategories() {
  return useInfiniteQuery(categoryQueries.all(useLocale()));
}
