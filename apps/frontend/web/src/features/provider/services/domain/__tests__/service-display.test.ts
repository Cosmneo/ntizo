import { describe, expect, it } from "vitest";
import { formatOptionPrice, ownerName, translatedCount } from "../types";

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
