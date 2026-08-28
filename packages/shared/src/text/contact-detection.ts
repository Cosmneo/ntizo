export type ContactMatch = { kind: "phone" | "email" | "link"; value: string };

/**
 * Nine digits beginning with 8, optionally +258, tolerating one space or dash
 * between the usual groups. Anchored on a word boundary so a longer digit run —
 * an order number, a price — does not match a window inside it.
 *
 * Two branches rather than one optional `+258` prefix: when the country code
 * is typed with no separator ("+258841234567"), the "8" that ends "258" and
 * the "8" that starts the subscriber number are both word characters, so
 * there is no `\b` between them. A single pattern with a leading `\b` right
 * before `8[2-7]` can never match that run. Anchoring each branch on its own
 * unambiguous edge (the literal "+258" on one side, a real word boundary on
 * the other) matches both forms without weakening either.
 */
const PHONE = /\+258[\s-]?8[2-7][\s-]?\d{3}[\s-]?\d{4}\b|\b8[2-7][\s-]?\d{3}[\s-]?\d{4}\b/g;
const EMAIL = /\b[^\s@]+@[^\s@.]+\.[^\s@]+\b/g;
const LINK = /\b(?:wa\.me|t\.me|api\.whatsapp\.com)\/\S+/gi;

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
