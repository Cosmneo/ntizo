import { DEFAULT_LOCALE, LOCALES, type Locale } from "./index";

/**
 * Picks the best supported locale from an `Accept-Language` header.
 *
 * Written because a profile created without one silently became English, and
 * a Mozambican who signed up through the Portuguese interface then received
 * every email in a language they had not chosen. The header is the only place
 * that knowledge exists at signup: the browser sends it on every request, and
 * the app overrides it with whatever the language switcher is set to.
 *
 * Region-exact wins over language-only — `pt-PT` prefers pt-PT over pt-MZ —
 * and both beat a lower-quality match. Anything unrecognised falls back to
 * `DEFAULT_LOCALE`, never to English-because-it-was-first.
 */
export function resolveLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      // A missing q is 1.0 by the spec. A malformed one is treated as 0 rather
      // than as 1, so a broken entry cannot outrank a well-formed one.
      const quality = q === undefined ? 1 : Number.parseFloat(q);
      return { tag: (tag ?? "").trim(), quality: Number.isNaN(quality) ? 0 : quality };
    })
    .filter((e) => e.tag.length > 0 && e.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const exact = LOCALES.find((l) => l.toLowerCase() === tag.toLowerCase());
    if (exact) return exact;
  }

  // Second pass, not a fallback inside the first: an exact match further down
  // the header must still beat a language-only match near the top, or a
  // browser sending "pt-PT,pt;q=0.9,pt-MZ;q=0.8" gets whichever pt we listed
  // first instead of the one it actually asked for.
  for (const { tag } of ranked) {
    const language = tag.split("-")[0]?.toLowerCase();
    if (!language) continue;
    const byLanguage = LOCALES.find((l) => l.split("-")[0]!.toLowerCase() === language);
    if (byLanguage) return byLanguage;
  }

  return DEFAULT_LOCALE;
}
