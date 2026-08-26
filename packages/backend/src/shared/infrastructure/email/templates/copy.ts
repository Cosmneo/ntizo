/**
 * Picks the copy for a locale, falling back to English.
 *
 * Two fallbacks, in order: an exact match, then the language without its
 * region — so a `pt-BR` we do not ship still reads Portuguese rather than
 * English. Only then English. A Mozambican reader getting Brazilian
 * Portuguese is a much smaller failure than getting a language they may not
 * read at all.
 *
 * Lives in shared rather than in the notification context, which is where it
 * was written: better-auth's own verification and reset mails need the same
 * behaviour and cannot import from a bounded context. The notification
 * context re-exports this one, so there is a single implementation.
 */
export function pickCopy<T>(byLocale: Record<string, T>, locale: string): T {
  const exact = byLocale[locale];
  if (exact) return exact;

  const language = locale.split("-")[0];
  const sameLanguage = Object.entries(byLocale).find(([k]) => k.split("-")[0] === language);
  if (sameLanguage) return sameLanguage[1];

  return byLocale["en-US"]!;
}
