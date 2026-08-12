import { describe, expect, it } from "vitest";
import {
  defaultOption,
  formatOptionPrice,
  optionSourceName,
  orderedLocales,
  ownerName,
  priceCell,
  translatedCount,
} from "../types";
import type { ProviderService, ServiceOption } from "../types";

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

function option(over: Partial<ServiceOption> = {}): ServiceOption {
  return {
    id: "opt-1",
    pricingMode: "fixed",
    amountMinor: 30000,
    currency: "MZN",
    durationMinutes: 30,
    minMinutes: null,
    stepMinutes: null,
    isDefault: false,
    isActive: true,
    sortOrder: 0,
    translations: [],
    ...over,
  };
}

describe("defaultOption", () => {
  it("picks the option flagged default, among active ones", () => {
    const a = option({ id: "a", isDefault: false });
    const b = option({ id: "b", isDefault: true });
    expect(defaultOption({ options: [a, b] } as never)!.id).toBe("b");
  });

  it("prefers an active option over an inactive one flagged default", () => {
    // Deactivating an option never reassigns `isDefault` — leading with its
    // price would be showing a price nobody can actually book.
    const inactiveDefault = option({ id: "a", isDefault: true, isActive: false });
    const active = option({ id: "b", isDefault: false, isActive: true });
    expect(defaultOption({ options: [inactiveDefault, active] } as never)!.id).toBe("b");
  });

  it("falls back to the first active option when none is flagged default", () => {
    const first = option({ id: "a", isDefault: false });
    const second = option({ id: "b", isDefault: false });
    expect(defaultOption({ options: [first, second] } as never)!.id).toBe("a");
  });

  it("falls back to the inactive pool when every option is inactive", () => {
    // The pool of active options is empty, not the whole list — a service
    // with every option deactivated still has to show something.
    const a = option({ id: "a", isDefault: false, isActive: false });
    const b = option({ id: "b", isDefault: true, isActive: false });
    expect(defaultOption({ options: [a, b] } as never)!.id).toBe("b");
  });

  it("is null for a service with no options at all", () => {
    expect(defaultOption({ options: [] } as never)).toBeNull();
  });
});

describe("priceCell", () => {
  it("is 'quote' for a quote service, even if it somehow carries an option", () => {
    const service = { bookingMode: "quote", options: [option()] } as unknown as ProviderService;
    expect(priceCell(service)).toEqual({ kind: "quote" });
  });

  it("is 'priced' with the default option for a priced service that has one", () => {
    const opt = option({ id: "opt-1", isDefault: true });
    const service = { bookingMode: "priced", options: [opt] } as unknown as ProviderService;
    expect(priceCell(service)).toEqual({ kind: "priced", option: opt });
  });

  it("is 'none' for a priced service with no options yet — not 'quote'", () => {
    // The state the create form deliberately produces between saving a
    // priced service and adding its first option. Reading `bookingMode`
    // rather than `defaultOption() === null` is what keeps this apart from
    // the quote-service case above.
    const service = { bookingMode: "priced", options: [] } as unknown as ProviderService;
    expect(priceCell(service)).toEqual({ kind: "none" });
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
