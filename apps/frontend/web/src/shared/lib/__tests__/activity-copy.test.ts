import { describe, expect, it } from "vitest";

/**
 * The nine `activityType.*` keys `renderDescription` reads through
 * `activityTypeKey` (see `features/activity/domain/types.ts`), checked
 * directly against the JSON rather than through `i18next` — this is a copy
 * gate, not a wiring gate. `i18n-parity.test.ts` already enforces full key-set
 * and placeholder parity across every namespace and locale; this file adds
 * the two checks that are specific to *this* namespace's meaning: that the
 * non-English locales are actually translated, not English text pasted under
 * a translated key name, and that the nine keys exist at all.
 */
const modules = import.meta.glob<Record<string, unknown>>("../../locales/*/account.json", {
  eager: true, import: "default",
});
const byLocale = Object.entries(modules).map(([p, d]) => ({
  locale: p.match(/locales\/([^/]+)\//)![1]!,
  data: d as { activityType?: Record<string, string> },
}));

const KEYS = [
  "userRegistered", "providerCreated", "providerStatusDecided",
  "providerInviteSent", "providerInviteAccepted", "serviceCreated",
  "servicePublished", "serviceUnpublished", "reviewCreated",
];

describe("activity copy", () => {
  it("has all nine keys in every locale", () => {
    expect(byLocale.length).toBeGreaterThanOrEqual(8);
    for (const { locale, data } of byLocale)
      for (const k of KEYS) expect(data.activityType?.[k], `${locale}.${k}`).toBeTruthy();
  });

  it("is translated, not English under a locale name", () => {
    // All nine keys, not just `userRegistered`: a translator who leaves one
    // key in English (or pastes the English string as a placeholder to come
    // back to later) ships it to real users otherwise — checking only the
    // first key would miss every other one.
    const en = byLocale.find((l) => l.locale === "en-US")!;
    for (const { locale, data } of byLocale) {
      if (locale.startsWith("en")) continue;
      // pt-MZ and pt-PT may agree with each other, never with English.
      for (const k of KEYS) {
        expect(data.activityType![k], `${locale}.${k}`).not.toBe(en.data.activityType![k]);
      }
    }
  });

  it("keeps every interpolation the key promises", () => {
    // A locale that drops {{serviceName}} renders a sentence with a hole in
    // it, and i18next says nothing.
    const en = byLocale.find((l) => l.locale === "en-US")!;
    for (const k of KEYS) {
      const vars = [...en.data.activityType![k]!.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      for (const { locale, data } of byLocale)
        for (const v of vars)
          expect(data.activityType![k], `${locale}.${k} missing {{${v}}}`).toContain(`{{${v}}}`);
    }
  });

  it("gives every action its own sentence within a locale", () => {
    // `differs from English` only ever compares a locale to English, never
    // English to itself — two English keys rendering identically is
    // invisible to it by construction. This is the check that would have
    // caught `providerStatusDecided` and `reviewCreated` both reading
    // "Reviewed {{providerName}}": two unrelated actions (an admin decision,
    // a customer's star rating) sharing one sentence in the one locale that
    // never had to translate the collision away.
    for (const { locale, data } of byLocale) {
      const seenBy = new Map<string, string>();
      for (const k of KEYS) {
        const value = data.activityType![k]!;
        expect(
          seenBy.has(value),
          `${locale}: "${k}" and "${seenBy.get(value)}" both render as "${value}"`,
        ).toBe(false);
        seenBy.set(value, k);
      }
    }
  });
});
