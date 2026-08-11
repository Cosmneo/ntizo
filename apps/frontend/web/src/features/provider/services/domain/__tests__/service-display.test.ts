import { describe, expect, it } from "vitest";
import { formatOptionPrice, optionSourceName, orderedLocales, ownerName, translatedCount } from "../types";

const svc = {
  sourceLocale: "pt-MZ",
  translations: [
    { locale: "pt-MZ", name: "Corte de cabelo", description: null },
    { locale: "en-US", name: "Haircut", description: null },
  ],
} as never;

describe("ownerName", () => {
  it("prefers the reader's locale", () => {
    expect(ownerName(svc, "en-US")).toBe("Haircut");
  });

  it("falls back to the locale the provider wrote in", () => {
    expect(ownerName(svc, "fr-FR")).toBe("Corte de cabelo");
  });
});

describe("translatedCount", () => {
  it("counts the languages with a name", () => {
    expect(translatedCount(svc)).toBe(2);
  });
});

describe("formatOptionPrice", () => {
  it("reads a fixed option as a price for the job", () => {
    expect(
      formatOptionPrice(
        { pricingMode: "fixed", amountMinor: 30000, currency: "MZN", durationMinutes: 30 } as never,
        "pt-MZ",
      ),
    ).toMatch(/300/);
  });

  it("reads an hourly option as a rate", () => {
    // The two must not read alike: one is what the job costs, the other is
    // what an hour of it costs, and a customer who confuses them is a dispute.
    const out = formatOptionPrice(
      {
        pricingMode: "hourly",
        amountMinor: 25000,
        currency: "MZN",
        durationMinutes: null,
        minMinutes: 120,
      } as never,
      "pt-MZ",
    );
    expect(out).toMatch(/250/);
    expect(out).toMatch(/\//);
  });
});

describe("orderedLocales", () => {
  it("puts the source locale first and keeps the platform order for the rest", () => {
    const out = orderedLocales("fr-FR");
    expect(out[0]).toBe("fr-FR");
    expect(out).toHaveLength(8);
    expect(new Set(out).size).toBe(8);
    // The platform order minus the source, unchanged otherwise — "fr-FR" is
    // not just present, the rest is not shuffled around it.
    expect(out.slice(1)).toEqual(["pt-MZ", "pt-PT", "en-US", "es-ES", "de-DE", "it-IT", "nl-NL"]);
  });

  it("leaves the default order alone when the source is already first", () => {
    expect(orderedLocales("pt-MZ")[0]).toBe("pt-MZ");
  });
});

describe("optionSourceName", () => {
  it("reads the option's name in the locale it was written in", () => {
    const option = {
      translations: [
        { locale: "pt-MZ", name: "Padrão" },
        { locale: "en-US", name: "Standard" },
      ],
    } as never;
    expect(optionSourceName(option, "pt-MZ")).toBe("Padrão");
  });

  it("falls back to whatever translation exists if the source one is somehow missing", () => {
    const option = { translations: [{ locale: "en-US", name: "Standard" }] } as never;
    expect(optionSourceName(option, "pt-MZ")).toBe("Standard");
  });

  it("returns empty when there is nothing to show", () => {
    expect(optionSourceName({ translations: [] } as never, "pt-MZ")).toBe("");
  });
});
