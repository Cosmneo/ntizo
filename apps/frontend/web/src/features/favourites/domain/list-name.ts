import type { TFunction } from "i18next";

/** The two fields a name is decided from. Structural, so any list-shaped row fits. */
export interface NamedList {
  /** Null on the default list until somebody renames it. */
  name: string | null;
  isDefault: boolean;
}

/**
 * The i18next key the default list's name is translated from.
 *
 * Namespace-qualified rather than bare, because this function is called from
 * two zones that bind different namespaces — a listing card
 * (`useTranslation("directory")`) and the favourites page — and a bare key
 * would resolve against whichever one the caller happened to hold. Exported
 * so the parity gate's readers can find the string this file depends on.
 */
export const DEFAULT_LIST_NAME_KEY = "common:favouritesDefaultList";

/**
 * What to call one of somebody's lists.
 *
 * **The single place the null-name rule lives**, so the dialog, the card and
 * the index page cannot each answer it slightly differently.
 *
 * The server stores `null` for the default list's name on purpose and says so
 * in `favouriteListReadModel`'s own doc comment: resolving it server-side
 * would need a locale on a query the dialog calls once per open, and would
 * bake the reader's language into a cache entry keyed on nothing else. The
 * same row therefore reads "Favoritos" to one person and "Favourites" to
 * another, and this is where that happens.
 *
 * Three rules, in this order:
 *
 * 1. **A stored name always wins**, default list included — once somebody has
 *    renamed their default list, it is called what they called it, in every
 *    language.
 * 2. **A nameless default list is translated.**
 * 3. **A nameless NON-default list gets the empty string, never the default's
 *    name.** Unreachable through the API — `createList` requires a name — but
 *    a defensive read must not label a stranger row "Favourites" and stand it
 *    beside the real one, which is exactly what a single `name ?? t(...)`
 *    would do. The empty string rather than a second translated placeholder:
 *    a caller that wants to draw something in that gap decides what, at the
 *    render site, and this task's copy stays at the one key it genuinely
 *    needs.
 *
 * A name that is present but blank (whitespace only) is treated as no name at
 * all — the server trims before storing, so this can only arrive from a row
 * written before that rule existed, and a heading of one space is worse than
 * either honest answer.
 */
export function listDisplayName(list: NamedList, t: TFunction): string {
  const stored = list.name?.trim() ?? "";
  if (stored.length > 0) return stored;
  return list.isDefault ? t(DEFAULT_LIST_NAME_KEY) : "";
}
