import { describe, expect, it } from "vitest";
import { initialsOf, placeholderHue } from "../placeholder-tile";

describe("placeholderHue", () => {
  it("gives the same trade the same colour everywhere it appears", () => {
    // A category that looked different on /services than on /providers would
    // read as two categories.
    expect(placeholderHue("plumbing")).toBe(placeholderHue("plumbing"));
  });

  it("gives different trades different colours", () => {
    // The whole point: a column of placeholders should read as a varied
    // catalogue, not as a column of identical grey rectangles.
    const hues = ["plumbing", "electrical", "cleaning", "hair", "music"].map(placeholderHue);
    expect(new Set(hues).size).toBe(hues.length);
  });

  it("stays inside a hue wheel", () => {
    for (const seed of ["", "a", "plumbing", "a-very-long-category-code-indeed"]) {
      const h = placeholderHue(seed);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
      expect(Number.isInteger(h)).toBe(true);
    }
  });

  it("answers for an empty seed rather than throwing", () => {
    // A service whose category code failed to resolve still has to render.
    expect(() => placeholderHue("")).not.toThrow();
  });
});

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Estúdio Mavalane")).toBe("EM");
  });

  it("takes one letter from a single-word name", () => {
    expect(initialsOf("Ntizo")).toBe("N");
  });

  it("ignores the words past the second", () => {
    expect(initialsOf("Casa Limpa Lda")).toBe("CL");
  });

  it("survives a name that starts with an emoji", () => {
    // `name[0]` cuts a surrogate pair in half and renders a replacement box.
    expect(initialsOf("🌟 Salão")).toBe("🌟S");
  });

  it("survives an accented letter written as two code points", () => {
    // "Á" as A + U+0301 combining acute. Splitting by code unit yields a bare
    // combining mark, which renders as a dotted circle. Compared in NFC so the
    // assertion is about the letter surviving, not about which normalisation
    // this file happens to be saved in.
    expect(initialsOf("Água Limpa").normalize("NFC")).toBe("ÁL");
  });

  it("answers for a blank name rather than rendering nothing", () => {
    expect(initialsOf("   ")).toBe("?");
  });
});
