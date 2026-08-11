import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { categoryQueries } from "../data/category.repository";

/**
 * The categories in the reader's language.
 *
 * The locale comes from i18next rather than from a prop so this follows a
 * language change the same way every other string on the page does — the
 * server resolves the name, and the query key carries the locale so switching
 * refetches instead of reusing what was already there.
 */
export function useCategories() {
  const { i18n } = useTranslation();
  return useQuery(categoryQueries.all(i18n.resolvedLanguage ?? i18n.language));
}
