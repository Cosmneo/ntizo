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
 * Flatten an object to dotted paths, collecting all leaf values (strings and
 * leaf objects). A nested key is exactly as invisible to a renderer as a
 * top-level one: i18next resolves both the same way. Missing a sub-key like
 * `filterWhereOption.at_customer` in one locale and not another goes unnoticed
 * at runtime unless a test flattens and compares the whole path set.
 */
function flattenToDottedPaths(
  obj: unknown,
  prefix = ""
): Map<string, unknown> {
  const paths = new Map<string, unknown>();

  if (typeof obj !== "object" || obj === null) {
    if (prefix) paths.set(prefix, obj);
    return paths;
  }

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      // Recurse into nested objects
      const nested = flattenToDottedPaths(value, path);
      for (const [nestedPath, nestedValue] of nested) {
        paths.set(nestedPath, nestedValue);
      }
    } else {
      // Leaf value (string, number, boolean, null, or array)
      paths.set(path, value);
    }
  }

  return paths;
}

/**
 * A key present in one language and missing in another does not fail loudly —
 * i18next falls back to the key name, so a Portuguese page quietly renders
 * `factMemberSince`. This test catches that at any depth, including nested
 * keys like `filterWhereOption.at_customer`.
 */
describe("directory namespace", () => {
  const referencePaths = Array.from(flattenToDottedPaths(ptMZ).keys()).sort();

  for (const [locale, bundle] of Object.entries(LOCALES)) {
    it(`${locale} declares exactly the same dotted paths as pt-MZ`, () => {
      const localePaths = Array.from(flattenToDottedPaths(bundle).keys()).sort();
      expect(localePaths).toEqual(referencePaths);
    });

    it(`${locale} leaves no leaf string empty`, () => {
      const paths = flattenToDottedPaths(bundle);
      for (const [path, value] of paths) {
        if (typeof value === "string") {
          expect(value.trim(), `${locale}/${path}`).not.toBe("");
        }
      }
    });
  }
});
