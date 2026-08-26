import { describe, expect, it } from "vitest";
import { resolveLocale } from "../resolve-locale";
import { DEFAULT_LOCALE } from "../index";

describe("resolveLocale", () => {
  it("takes an exact match", () => {
    expect(resolveLocale("pt-MZ")).toBe("pt-MZ");
    expect(resolveLocale("de-DE")).toBe("de-DE");
  });

  it("is case-insensitive, because browsers are inconsistent about it", () => {
    expect(resolveLocale("PT-mz")).toBe("pt-MZ");
  });

  it("prefers an exact match further down over a language-only one on top", () => {
    // The two passes exist for exactly this shape: the bare "pt" outranks
    // "pt-PT" by quality, so folding the passes together matches "pt" against
    // whichever Portuguese we happened to list first — pt-MZ — and hands a
    // Portuguese reader Mozambican copy they never asked for.
    //
    // Note the ordering: an exact match that comes FIRST proves nothing here,
    // because both versions return it. The exact match has to lose on quality
    // for the second pass to be the thing that saves it.
    expect(resolveLocale("pt;q=0.9,pt-PT;q=0.8")).toBe("pt-PT");
  });

  it("falls back to the language when the region is unknown", () => {
    // pt-BR is not one of ours; Portuguese still is.
    expect(resolveLocale("pt-BR,pt;q=0.9")).toBe("pt-MZ");
  });

  it("honours quality ordering rather than header order", () => {
    expect(resolveLocale("en-US;q=0.2,fr-FR;q=0.9")).toBe("fr-FR");
  });

  it("ignores an entry the sender explicitly refused", () => {
    // q=0 means "not acceptable", so it must not win by being first.
    expect(resolveLocale("de-DE;q=0,fr-FR;q=0.5")).toBe("fr-FR");
  });

  it("treats a malformed quality as unacceptable, not as best", () => {
    // Number.parseFloat("abc") is NaN. Scoring it 1 would let a broken entry
    // outrank a well-formed one.
    expect(resolveLocale("de-DE;q=abc,fr-FR;q=0.5")).toBe("fr-FR");
  });

  it("falls back to the platform default, never to English-by-accident", () => {
    // The bug this whole function exists for: a profile with no language
    // became en-US, while packages/shared declared the default to be pt-MZ.
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("zz-ZZ")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("*")).toBe(DEFAULT_LOCALE);
  });
});
