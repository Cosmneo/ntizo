import { describe, expect, it } from "vitest";

/**
 * Loaded by glob so a ninth locale is covered without editing this file —
 * the same reason i18n-parity does it. Parity checks that the KEYS match
 * across locales; nothing there notices that a locale's value is the English
 * sentence pasted in, which is the mistake that actually happens.
 */
const modules = import.meta.glob<Record<string, unknown>>("../../locales/*/legal.json", {
  eager: true,
  import: "default",
});

interface Section { heading: string; body: string[] }
interface Doc { title: string; updated: string; intro: string; sections: Section[] }

const byLocale = Object.entries(modules).map(([path, data]) => ({
  locale: path.match(/locales\/([^/]+)\//)![1]!,
  data: data as unknown as { privacy: Doc; terms: Doc },
}));

const DOCS = ["privacy", "terms"] as const;

describe("legal documents", () => {
  it("ships both documents in every locale the app has", () => {
    expect(byLocale.length).toBeGreaterThanOrEqual(8);
    for (const { locale, data } of byLocale)
      for (const doc of DOCS) {
        expect(data[doc], `${locale}.${doc}`).toBeDefined();
        expect(data[doc].sections.length, `${locale}.${doc}`).toBeGreaterThan(4);
      }
  });

  it("is actually translated, not English wearing a locale name", () => {
    // pt-MZ and pt-PT are deliberately identical — same language, same company,
    // same Mozambican law — so Portuguese is compared as one.
    const en = byLocale.find((l) => l.locale === "en-US")!;
    for (const { locale, data } of byLocale) {
      if (locale.startsWith("en")) continue;
      for (const doc of DOCS) {
        expect(data[doc].title, `${locale}.${doc}.title`).not.toBe(en.data[doc].title);
        expect(data[doc].intro, `${locale}.${doc}.intro`).not.toBe(en.data[doc].intro);
      }
    }
  });

  it("says the same things in every language", () => {
    // A legal document that has an extra clause in one language is two
    // documents. Section counts must match across locales.
    for (const doc of DOCS) {
      const counts = new Set(byLocale.map((l) => l.data[doc].sections.length));
      expect(counts.size, `${doc} section counts: ${[...counts]}`).toBe(1);
    }
  });

  it("never leaves a section without words", () => {
    for (const { locale, data } of byLocale)
      for (const doc of DOCS)
        for (const [i, s] of data[doc].sections.entries()) {
          expect(s.heading.trim().length, `${locale}.${doc}[${i}].heading`).toBeGreaterThan(0);
          expect(s.body.length, `${locale}.${doc}[${i}].body`).toBeGreaterThan(0);
          for (const p of s.body) expect(p.trim().length).toBeGreaterThan(20);
        }
  });

  it("states the service fee the become-provider page already promises", () => {
    // The public pitch says 10% paid by the customer, provider keeps their
    // price. Terms that said something else would be the version that counts.
    for (const { locale, data } of byLocale) {
      const text = JSON.stringify(data.terms).toLowerCase();
      expect(text, `${locale} terms should name the fee`).toMatch(/10\s*%/);
    }
  });
});
