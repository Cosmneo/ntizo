import { useTranslation } from "react-i18next";

/**
 * The locale the reader is in.
 *
 * From i18next rather than a prop, so anything keyed on it follows a language
 * change the same way every other string on the page does.
 *
 * Its own file because two of the landing's queries now key on it — the
 * categories and the popular providers — and a second private copy would be a
 * second place for the `resolvedLanguage ?? language` fallback to drift.
 */
export function useLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage ?? i18n.language;
}
