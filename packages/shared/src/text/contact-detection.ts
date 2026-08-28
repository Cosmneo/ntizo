export type ContactMatch = { kind: "phone" | "email" | "link"; value: string };

/**
 * Nine digits beginning with 8, optionally 258 or +258, tolerating one space
 * or dash between the usual groups. Anchored on a word boundary so a longer
 * digit run — an order number, a price — does not match a window inside it.
 *
 * Three branches rather than one pattern with optional prefixes: `\b` only
 * fires at a transition between a word character and a non-word one. When
 * the country code is typed with no separator before the subscriber number
 * ("+258841234567" or "258841234567"), the digit ending the country code and
 * the digit starting the subscriber number are both word characters, so
 * there is no `\b` between them — a leading `\b` placed right before
 * `8[2-7]` can never match that run, regardless of what optional prefix
 * preceded it. Each branch is anchored on its own unambiguous edge instead:
 * the literal "+258" (a `+` can never be part of a digit run, so no boundary
 * check is needed there), a `\b` in front of a literal "258" (needed because
 * "258" is itself just digits and could otherwise match inside a longer,
 * unrelated number), or a `\b` in front of the bare subscriber number.
 */
const PHONE =
  /\+258[\s-]?8[2-7][\s-]?\d{3}[\s-]?\d{4}\b|\b258[\s-]?8[2-7][\s-]?\d{3}[\s-]?\d{4}\b|\b8[2-7][\s-]?\d{3}[\s-]?\d{4}\b/g;
const EMAIL = /\b[^\s@]+@[^\s@.]+\.[^\s@]+\b/g;

/**
 * Direct-contact platforms. The path is optional: a bare mention ("fala
 * comigo por wa.me") is what someone writes when they expect the reader to
 * look the platform up rather than follow a link, and none of these three
 * domains is plausible as an innocent word or abbreviation in running text.
 */
const LINK = /\b(?:wa\.me|t\.me|api\.whatsapp\.com)(?:\/\S+)?/gi;

export function findContacts(text: string): ContactMatch[] {
  const found: ContactMatch[] = [];
  for (const [kind, pattern] of [
    ["link", LINK],
    ["email", EMAIL],
    ["phone", PHONE],
  ] as const) {
    for (const m of text.matchAll(pattern)) found.push({ kind, value: m[0] });
  }
  return found;
}

export function hasContact(text: string): boolean {
  return findContacts(text).length > 0;
}
