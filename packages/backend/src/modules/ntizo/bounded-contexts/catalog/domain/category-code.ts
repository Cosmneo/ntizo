/**
 * The stable handle a category is known by, everywhere and in every language.
 *
 * It ends up in URLs and in code, so it is deliberately narrow: lowercase
 * letters, digits and single hyphens. Derived from whatever the administrator
 * typed rather than demanded of them — asking somebody to hand-write a URL
 * segment is asking for `Canalização ` with a trailing space in it.
 */
export const CATEGORY_CODE_MAX = 60;

export function normaliseCategoryCode(input: string): string {
  return (
    input
      .normalize("NFD")
      // Strip the marks NFD just separated out, so "Canalização" becomes
      // "Canalizacao" rather than losing the letters they sat on.
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, CATEGORY_CODE_MAX)
      // A slice can land on a hyphen; trailing punctuation in a URL is noise.
      .replace(/-+$/g, "")
  );
}

export function isValidCategoryCode(code: string): boolean {
  return code.length > 0 && code === normaliseCategoryCode(code);
}
