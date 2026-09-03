import { describe, expect, it } from "vitest";
import deDE from "../de-DE/company.json";
import enUS from "../en-US/company.json";
import esES from "../es-ES/company.json";
import frFR from "../fr-FR/company.json";
import itIT from "../it-IT/company.json";
import nlNL from "../nl-NL/company.json";
import ptMZ from "../pt-MZ/company.json";
import ptPT from "../pt-PT/company.json";

const LOCALES = { "de-DE": deDE, "en-US": enUS, "es-ES": esES, "fr-FR": frFR, "it-IT": itIT, "nl-NL": nlNL, "pt-MZ": ptMZ, "pt-PT": ptPT };

describe("company namespace", () => {
  for (const [locale, bundle] of Object.entries(LOCALES)) {
    it(`${locale} has three "how we work" principles, none empty`, () => {
      expect(bundle.careers.how).toHaveLength(3);
      for (const p of bundle.careers.how) {
        expect(p.title.trim()).not.toBe("");
        expect(p.body.trim()).not.toBe("");
      }
    });

    it(`${locale} quotes no platform_settings number`, () => {
      // The durations and the rate live in `platform_settings` and change
      // without the page knowing — the spec forbids them in static copy.
      const text = JSON.stringify(bundle);
      expect(text).not.toMatch(/\b2\s?h\b|\b2 horas\b|\b2 hours\b|\b15 min|\b30 min|\b10\s?%/i);
    });

    it(`${locale} keeps the placeholders the components interpolate`, () => {
      expect(bundle.form.errors.rateLimited).toContain("{{email}}");
      expect(bundle.form.errors.generic).toContain("{{email}}");
      expect(bundle.form.success.replyTo).toContain("{{email}}");
      expect(bundle.form.success.reference).toContain("{{reference}}");
      expect(bundle.careers.openingsHint).toContain("{{email}}");
    });
  }
});
