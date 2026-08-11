import { describe, expect, it } from "bun:test";
import { DEFAULT_LOCALE } from "@ntizo/shared";
import {
  CATEGORY_CODE_MAX,
  isValidCategoryCode,
  normaliseCategoryCode,
} from "../domain/category-code";
import {
  missingDefaultTranslation,
  resolveTranslation,
  usableTranslations,
} from "../domain/translations";

describe("normaliseCategoryCode", () => {
  it("keeps the letters that carried an accent", () => {
    // Stripping the marks without this leaves "canalizao" — the c and the a
    // vanish with the cedilla and the tilde, and the code stops being a word.
    expect(normaliseCategoryCode("Canalização")).toBe("canalizacao");
    expect(normaliseCategoryCode("Eletricidade e Água")).toBe(
      "eletricidade-e-agua",
    );
  });

  it("collapses anything that is not a letter or digit into one hyphen", () => {
    expect(normaliseCategoryCode("  Limpeza / Doméstica  ")).toBe(
      "limpeza-domestica",
    );
    expect(normaliseCategoryCode("A---B")).toBe("a-b");
  });

  it("never begins or ends with a hyphen, including after truncation", () => {
    const long = "a".repeat(CATEGORY_CODE_MAX - 1) + " b";
    const code = normaliseCategoryCode(long);
    expect(code.length).toBeLessThanOrEqual(CATEGORY_CODE_MAX);
    expect(code.startsWith("-")).toBe(false);
    expect(code.endsWith("-")).toBe(false);
  });

  it("is idempotent, which is what isValidCategoryCode checks", () => {
    for (const input of ["Canalização", "  Limpeza / Doméstica  ", "A---B"]) {
      const once = normaliseCategoryCode(input);
      expect(normaliseCategoryCode(once)).toBe(once);
      expect(isValidCategoryCode(once)).toBe(true);
    }
    expect(isValidCategoryCode("Canalização")).toBe(false);
    expect(isValidCategoryCode("")).toBe(false);
  });
});

describe("resolveTranslation", () => {
  const rows = [
    { locale: DEFAULT_LOCALE, name: "Canalização", description: "Canos" },
    { locale: "en-US", name: "Plumbing", description: null },
  ];

  it("prefers the language asked for", () => {
    expect(resolveTranslation(rows, "en-US")).toEqual({
      name: "Plumbing",
      description: null,
      isFallback: false,
    });
  });

  it("falls back to the default rather than showing nothing", () => {
    // The decision this whole design rests on: a category with no French is
    // still browsable in French.
    expect(resolveTranslation(rows, "fr-FR")).toEqual({
      name: "Canalização",
      description: "Canos",
      isFallback: true,
    });
  });

  it("says when it fell back, so a caller can tell the two apart", () => {
    expect(resolveTranslation(rows, DEFAULT_LOCALE)?.isFallback).toBe(false);
    expect(resolveTranslation(rows, "de-DE")?.isFallback).toBe(true);
  });

  it("returns null when even the default is missing", () => {
    // Not a blank string: the caller has to decide to drop the row, and a "" is
    // a decision made silently in its favour.
    expect(resolveTranslation([{ locale: "en-US", name: "X", description: null }], "fr-FR")).toBeNull();
    expect(resolveTranslation([], "en-US")).toBeNull();
  });
});

describe("missingDefaultTranslation", () => {
  it("accepts a set that names the default locale", () => {
    expect(
      missingDefaultTranslation([{ locale: DEFAULT_LOCALE, name: "Canalização" }]),
    ).toBe(false);
  });

  it("rejects a set with every other language but not the default", () => {
    expect(
      missingDefaultTranslation([
        { locale: "en-US", name: "Plumbing" },
        { locale: "fr-FR", name: "Plomberie" },
      ]),
    ).toBe(true);
  });

  it("treats a whitespace-only default as absent", () => {
    // Otherwise the form saves a category whose fallback is a space, and every
    // untranslated language renders an empty tile.
    expect(
      missingDefaultTranslation([{ locale: DEFAULT_LOCALE, name: "   " }]),
    ).toBe(true);
  });
});

describe("usableTranslations", () => {
  it("drops the boxes the administrator left empty", () => {
    const rows = [
      { locale: DEFAULT_LOCALE, name: "Canalização" },
      { locale: "en-US", name: "" },
      { locale: "fr-FR", name: "   " },
    ];
    expect(usableTranslations(rows).map((r) => r.locale)).toEqual([
      DEFAULT_LOCALE,
    ]);
  });
});
