import { DEFAULT_LOCALE, type Locale } from "@ntizo/shared";

export interface TranslationRow {
  locale: string;
  name: string;
  description: string | null;
}

export interface ResolvedTranslation {
  name: string;
  description: string | null;
  /** True when this came from the default locale rather than the one asked for. */
  isFallback: boolean;
}

/**
 * The one rule for reading translated content: the reader's language, then the
 * platform's default.
 *
 * Never a blank and never a key. A category that exists but has no French yet
 * still has to be pickable by somebody browsing in French — showing them an
 * empty tile would make the category unreachable rather than untranslated.
 *
 * Returns null only when even the default is missing, which the create command
 * refuses to allow; a caller that gets null is looking at data that predates
 * that rule or was written around it, and should drop the row rather than
 * render an empty one.
 */
export function resolveTranslation(
  rows: readonly TranslationRow[],
  locale: string,
): ResolvedTranslation | null {
  const exact = rows.find((r) => r.locale === locale);
  if (exact) {
    return { name: exact.name, description: exact.description, isFallback: false };
  }
  const base = rows.find((r) => r.locale === DEFAULT_LOCALE);
  if (base) {
    return { name: base.name, description: base.description, isFallback: true };
  }
  return null;
}

/**
 * Whether a set of translations may be saved.
 *
 * The default locale is required and the rest are optional — the decision that
 * an administrator can publish a category before translating it eight times,
 * and that nobody ever sees the gap because of the fallback above. Enforced
 * here rather than by a constraint: "at least one row, and it must be this
 * one" is not something a unique index can say.
 */
export function missingDefaultTranslation(
  rows: readonly { locale: string; name: string }[],
): boolean {
  return !rows.some(
    (r) => r.locale === DEFAULT_LOCALE && r.name.trim().length > 0,
  );
}

/** Drops blank names: an empty box in the form means "not translated yet". */
export function usableTranslations<T extends { name: string }>(
  rows: readonly T[],
): T[] {
  return rows.filter((r) => r.name.trim().length > 0);
}

export type { Locale };
