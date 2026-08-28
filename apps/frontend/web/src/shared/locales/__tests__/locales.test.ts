import { describe, expect, it } from "vitest";
import deDE from "../de-DE/directory.json";
import enUS from "../en-US/directory.json";
import esES from "../es-ES/directory.json";
import frFR from "../fr-FR/directory.json";
import itIT from "../it-IT/directory.json";
import nlNL from "../nl-NL/directory.json";
import ptMZ from "../pt-MZ/directory.json";
import ptPT from "../pt-PT/directory.json";

const LOCALES = {
  "de-DE": deDE, "en-US": enUS, "es-ES": esES, "fr-FR": frFR,
  "it-IT": itIT, "nl-NL": nlNL, "pt-MZ": ptMZ, "pt-PT": ptPT,
};

/**
 * A key present in one language and missing in another does not fail loudly —
 * i18next falls back to the key name, so a Portuguese page quietly renders
 * `factMemberSince`. This is the only test that catches that.
 */
describe("directory namespace", () => {
  const reference = Object.keys(ptMZ).sort();

  for (const [locale, bundle] of Object.entries(LOCALES)) {
    it(`${locale} declares exactly the same keys as pt-MZ`, () => {
      expect(Object.keys(bundle).sort()).toEqual(reference);
    });

    it(`${locale} leaves no value empty`, () => {
      for (const [key, value] of Object.entries(bundle)) {
        if (typeof value === "string") expect(value.trim(), key).not.toBe("");
      }
    });
  }
});
