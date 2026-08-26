import { describe, expect, it } from "bun:test";
import { verifyEmailTemplate } from "../verify-email";
import { resetPasswordTemplate } from "../reset-password";

const LOCALES = ["en-US", "pt-MZ", "pt-PT", "es-ES", "fr-FR", "it-IT", "de-DE", "nl-NL"];
const URL = "https://dev.api.ntizo.co.mz/api/auth/verify-email?token=abc";

describe.each([
  ["verifyEmailTemplate", verifyEmailTemplate],
  ["resetPasswordTemplate", resetPasswordTemplate],
])("%s", (_name, render) => {
  it("has its own copy in all eight locales, not English wearing a label", () => {
    // Both mails shipped English-only while the app spoke eight languages.
    // Comparing every locale's subject against English is what catches a
    // COPY table where somebody added a key and pasted the English string.
    const english = render(URL, "en-US").subject;
    const translated = LOCALES.filter((l) => !l.startsWith("en")).map((l) => render(URL, l).subject);
    for (const subject of translated) expect(subject).not.toBe(english);
    // pt-MZ and pt-PT are allowed to agree; the rest must all differ.
    expect(new Set(translated).size).toBeGreaterThanOrEqual(LOCALES.length - 3);
  });

  it("carries the link in every locale, in both the html and the text part", () => {
    // A translated mail with no link is worse than an English one with a link.
    for (const locale of LOCALES) {
      const out = render(URL, locale);
      expect(out.html, locale).toContain(URL);
      expect(out.text, locale).toContain(URL);
      expect(out.subject.length, locale).toBeGreaterThan(0);
    }
  });

  it("falls back by language before falling back to English", () => {
    // pt-BR is not shipped. Brazilian Portuguese reading Mozambican
    // Portuguese is a far smaller failure than reading English.
    expect(render(URL, "pt-BR").subject).toBe(render(URL, "pt-MZ").subject);
  });

  it("falls back to English for a locale with no language in common", () => {
    expect(render(URL, "zz-ZZ").subject).toBe(render(URL, "en-US").subject);
  });

  it("defaults to English when told nothing", () => {
    expect(render(URL).subject).toBe(render(URL, "en-US").subject);
  });
});
