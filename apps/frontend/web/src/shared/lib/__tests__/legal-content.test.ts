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

  it("never promises the fee model retracted on 2026-08-30", () => {
    // The same shape repeats for the three surfaces that made this promise
    // beside the Terms -- landing.json, become-provider.json, admin.json --
    // in retracted-fee-promise.test.ts. A contract gets its own file rather
    // than sharing one with marketing copy, but the check is identical.
    //
    // This used to assert the terms NAME the rate ("10%"), which is backwards:
    // the rate is per provider and administrator-set, so a test pinning a
    // specific percentage into the contract is itself a bug waiting to fire
    // the day an administrator changes it. An absence check has no rate to
    // go stale — it only fails the way that actually matters, which is
    // someone restoring the old promise (a hardcoded "0%"/"10%", "never
    // deducted", "the price they set is the price they receive") into the
    // one document where that promise is a contract. Written out per locale,
    // in that locale's own words, rather than searching every language for
    // the English phrasing.
    const BANNED: Record<string, string[]> = {
      "en-US": [
        "0%",
        "10%",
        "added on top of that price",
        "never deducted",
        "the price they set is the price they receive",
        "zero commission",
      ],
      "pt-MZ": [
        "0%",
        "10%",
        "acresce uma taxa",
        "nunca é descontada",
        "o preço que ele define é o que recebe",
        "comissão zero",
        "zero de comissão",
      ],
      "pt-PT": [
        "0%",
        "10%",
        "acresce uma taxa",
        "nunca é descontada",
        "o preço que ele define é o que recebe",
        "comissão zero",
        "zero de comissão",
      ],
      "es-ES": [
        "0%",
        "10%",
        "se añade una tarifa",
        "nunca se descuenta",
        "el precio que fija es el que recibe",
        "comisión cero",
        "cero comisión",
      ],
      "fr-FR": [
        "0 %",
        "10 %",
        "s’y ajoutent des frais",
        "jamais prélevés",
        "le prix qu’il fixe est celui qu’il reçoit",
        "commission nulle",
        "zéro commission",
      ],
      "de-DE": [
        "0 %",
        "10 %",
        "darauf kommt eine servicegebühr",
        "nie abgezogen",
        "der preis, den er festlegt, ist der, den er erhält",
        "nullprovision",
        "keine provision",
      ],
      "it-IT": [
        "0%",
        "10%",
        "si aggiunge una commissione",
        "non viene mai trattenuta",
        "il prezzo che fissa è quello che riceve",
        "commissione zero",
        "zero commissioni",
      ],
      "nl-NL": [
        "0%",
        "10%",
        "daar bovenop komen servicekosten",
        "nooit ingehouden",
        "de prijs die hij bepaalt is de prijs die hij ontvangt",
        "nulcommissie",
        "geen commissie",
      ],
    };

    for (const { locale, data } of byLocale) {
      const banned = BANNED[locale];
      expect(banned, `no banned-phrase list recorded for locale ${locale}`).toBeDefined();
      const text = JSON.stringify(data.terms).toLowerCase();
      for (const phrase of banned!)
        expect(text, `${locale} terms still say "${phrase}"`).not.toContain(phrase.toLowerCase());
    }
  });
});
