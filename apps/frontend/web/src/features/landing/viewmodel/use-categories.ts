import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { categoryQueries } from "../data/category.repository";

/**
 * The locale the reader is in.
 *
 * From i18next rather than a prop, so these follow a language change the same
 * way every other string on the page does.
 */
function useLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage ?? i18n.language;
}

/** The few the home page shows above "see all". */
export function useCategoryPreview(limit: number) {
  return useQuery(categoryQueries.preview(useLocale(), limit));
}

/** Every category, loaded as the page is scrolled. */
export function useAllCategories() {
  return useInfiniteQuery(categoryQueries.all(useLocale()));
}
