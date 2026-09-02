import { describe, expect, it } from "vitest";
import deDEDirectory from "../de-DE/directory.json";
import enUSDirectory from "../en-US/directory.json";
import esESDirectory from "../es-ES/directory.json";
import frFRDirectory from "../fr-FR/directory.json";
import itITDirectory from "../it-IT/directory.json";
import nlNLDirectory from "../nl-NL/directory.json";
import ptMZDirectory from "../pt-MZ/directory.json";
import ptPTDirectory from "../pt-PT/directory.json";
import deDECheckout from "../de-DE/checkout.json";
import enUSCheckout from "../en-US/checkout.json";
import esESCheckout from "../es-ES/checkout.json";
import frFRCheckout from "../fr-FR/checkout.json";
import itITCheckout from "../it-IT/checkout.json";
import nlNLCheckout from "../nl-NL/checkout.json";
import ptMZCheckout from "../pt-MZ/checkout.json";
import ptPTCheckout from "../pt-PT/checkout.json";
import deDELanding from "../de-DE/landing.json";
import enUSLanding from "../en-US/landing.json";
import esESLanding from "../es-ES/landing.json";
import frFRLanding from "../fr-FR/landing.json";
import itITLanding from "../it-IT/landing.json";
import nlNLLanding from "../nl-NL/landing.json";
import ptMZLanding from "../pt-MZ/landing.json";
import ptPTLanding from "../pt-PT/landing.json";
import deDELegal from "../de-DE/legal.json";
import enUSLegal from "../en-US/legal.json";
import esESLegal from "../es-ES/legal.json";
import frFRLegal from "../fr-FR/legal.json";
import itITLegal from "../it-IT/legal.json";
import nlNLLegal from "../nl-NL/legal.json";
import ptMZLegal from "../pt-MZ/legal.json";
import ptPTLegal from "../pt-PT/legal.json";

/**
 * The namespaces this gate covers, each as its eight bundles keyed by locale.
 *
 * `checkout` joined `directory` when the availability modal became three
 * routed pages. It is here rather than left to the reviewer's eye because
 * this branch has already shipped the exact failure once: four keys
 * translated into otherwise-English files produced a heading that read half
 * in one language and half in the other, and nothing failed.
 */
const NAMESPACES: Record<string, Record<string, unknown>> = {
  directory: {
    "de-DE": deDEDirectory, "en-US": enUSDirectory, "es-ES": esESDirectory, "fr-FR": frFRDirectory,
    "it-IT": itITDirectory, "nl-NL": nlNLDirectory, "pt-MZ": ptMZDirectory, "pt-PT": ptPTDirectory,
  },
  checkout: {
    "de-DE": deDECheckout, "en-US": enUSCheckout, "es-ES": esESCheckout, "fr-FR": frFRCheckout,
    "it-IT": itITCheckout, "nl-NL": nlNLCheckout, "pt-MZ": ptMZCheckout, "pt-PT": ptPTCheckout,
  },
  landing: {
    "de-DE": deDELanding, "en-US": enUSLanding, "es-ES": esESLanding, "fr-FR": frFRLanding,
    "it-IT": itITLanding, "nl-NL": nlNLLanding, "pt-MZ": ptMZLanding, "pt-PT": ptPTLanding,
  },
  legal: {
    "de-DE": deDELegal, "en-US": enUSLegal, "es-ES": esESLegal, "fr-FR": frFRLegal,
    "it-IT": itITLegal, "nl-NL": nlNLLegal, "pt-MZ": ptMZLegal, "pt-PT": ptPTLegal,
  },
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
for (const [namespace, locales] of Object.entries(NAMESPACES)) {
  describe(`${namespace} namespace`, () => {
    // pt-MZ is the reference because it is the launch market's language and
    // the one every string is authored in first.
    const referencePaths = Array.from(flattenToDottedPaths(locales["pt-MZ"]).keys()).sort();

    for (const [locale, bundle] of Object.entries(locales)) {
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
}
