import { DEFAULT_LOCALE, LOCALES, type Locale } from "@ntizo/shared";

export interface CategoryTranslation {
  locale: Locale;
  name: string;
  description: string | null;
}

export interface AdminCategory {
  id: string;
  code: string;
  imageKey: string | null;
  imageUrl: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  translations: CategoryTranslation[];
  createdAt: string;
}

/**
 * The name to show an administrator in the list.
 *
 * Their own language, then the platform's — the same fallback the customer
 * gets, because a list that showed the raw code would be a list of URLs.
 */
export function adminName(category: AdminCategory, locale: string): string {
  const exact = category.translations.find((t) => t.locale === locale);
  if (exact) return exact.name;
  const base = category.translations.find((t) => t.locale === DEFAULT_LOCALE);
  return base?.name ?? category.code;
}

/**
 * How many of the product's languages this category has a name in.
 *
 * The number the administration list exists to show. A category reads as
 * finished from any single language; "3/8" is the only thing on the row that
 * says otherwise.
 */
export function translatedCount(category: AdminCategory): number {
  return category.translations.filter((t) => t.name.trim().length > 0).length;
}

export const TOTAL_LOCALES = LOCALES.length;

/** The form's shape: every language present, most of them empty. */
export function emptyForm(): {
  code: string;
  icon: string;
  imageKey: string | null;
  imageUrl: string | null;
  isActive: boolean;
  names: Record<Locale, string>;
} {
  return {
    code: "",
    icon: "",
    imageKey: null,
    imageUrl: null,
    isActive: true,
    names: Object.fromEntries(LOCALES.map((l) => [l, ""])) as Record<Locale, string>,
  };
}

export function formFrom(category: AdminCategory): ReturnType<typeof emptyForm> {
  const form = emptyForm();
  form.code = category.code;
  form.icon = category.icon ?? "";
  form.imageKey = category.imageKey;
  form.imageUrl = category.imageUrl;
  form.isActive = category.isActive;
  for (const t of category.translations) form.names[t.locale] = t.name;
  return form;
}

/**
 * Whether the form can be saved.
 *
 * The one rule the server also enforces, checked here so the answer arrives
 * before the round trip rather than as a red message after it.
 */
export function canSave(names: Record<Locale, string>): boolean {
  return names[DEFAULT_LOCALE].trim().length > 0;
}

export { DEFAULT_LOCALE, LOCALES };
export type { Locale };

/**
 * The list with one row moved by `delta` places.
 *
 * Written here rather than in the page so the drag path and the menu path
 * produce the same result from the same code — two implementations of "move
 * this up" is two chances for them to disagree about what the ends do.
 * Clamped: moving the first row up is a no-op, not a wrap to the bottom.
 */
export function moved<T extends { id: string }>(
  rows: readonly T[],
  id: string,
  delta: number,
): T[] {
  const from = rows.findIndex((r) => r.id === id);
  if (from < 0) return [...rows];
  const to = Math.min(Math.max(from + delta, 0), rows.length - 1);
  if (to === from) return [...rows];
  const next = [...rows];
  next.splice(to, 0, next.splice(from, 1)[0]!);
  return next;
}
