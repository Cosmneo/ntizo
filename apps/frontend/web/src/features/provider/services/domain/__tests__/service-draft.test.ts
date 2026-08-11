import { describe, expect, it } from "vitest";
import {
  canSubmit,
  draftFrom,
  emptyDraft,
  optionDraftFrom,
  optionErrors,
  parseAmountMinor,
  serviceLifecycle,
  toOptionInput,
} from "../service-draft";
import type { ProviderService, ServiceOption } from "../types";

describe("canSubmit", () => {
  it("needs a category, a name and a location", () => {
    expect(canSubmit(emptyDraft())).toBe(false);
    expect(
      canSubmit({ ...emptyDraft(), categoryId: "c", name: "Corte", locationType: "at_provider" }),
    ).toBe(true);
  });
});

describe("optionErrors", () => {
  it("asks a fixed option for a duration", () => {
    expect(
      optionErrors({ pricingMode: "fixed", amount: "300", duration: "", min: "", step: "" }),
    ).toHaveProperty("duration");
  });

  it("asks an hourly option for a minimum and a step, and no duration", () => {
    const errs = optionErrors({ pricingMode: "hourly", amount: "250", duration: "", min: "", step: "" });
    expect(errs).toHaveProperty("min");
    expect(errs).toHaveProperty("step");
    expect(errs).not.toHaveProperty("duration");
  });

  it("refuses a price of zero", () => {
    expect(
      optionErrors({ pricingMode: "fixed", amount: "0", duration: "30", min: "", step: "" }),
    ).toHaveProperty("amount");
  });

  it("accepts a comma as the decimal separator", () => {
    // It is how the number is written here. Refusing it would make the form
    // wrong for the market it launches in.
    expect(
      optionErrors({ pricingMode: "fixed", amount: "300,50", duration: "30", min: "", step: "" }),
    ).toEqual({});
  });
});

describe("serviceLifecycle", () => {
  it("is unsaved, and its booking mode can still change, before any save", () => {
    const l = serviceLifecycle({ serviceId: null, bookingMode: "quote" });
    expect(l.isSaved).toBe(false);
    expect(l.canChangeBookingMode).toBe(true);
    expect(l.showOptionsEditor).toBe(false);
  });

  it("locks the booking mode the moment a serviceId exists — mid-session, not only on reopening for an existing service", () => {
    // The regression this guards against: the sheet deliberately stays open
    // after a same-session create, so `editing` (how the sheet was opened)
    // stays null while `serviceId` (whether it has since been saved) is
    // already set. Reading `editing` here instead of `serviceId` — which is
    // what the form used to do — would leave the lock disengaged in exactly
    // this window, letting a quote service be flipped to priced and handed
    // an option, which the server can only refuse with
    // SERVICE_QUOTE_HAS_OPTIONS after a wasted round trip.
    const l = serviceLifecycle({ serviceId: "svc-1", bookingMode: "quote" });
    expect(l.isSaved).toBe(true);
    expect(l.canChangeBookingMode).toBe(false);
  });

  it("shows the options editor only for a service that is both saved and priced", () => {
    expect(serviceLifecycle({ serviceId: null, bookingMode: "priced" }).showOptionsEditor).toBe(false);
    expect(serviceLifecycle({ serviceId: "svc-1", bookingMode: "quote" }).showOptionsEditor).toBe(false);
    expect(serviceLifecycle({ serviceId: "svc-1", bookingMode: "priced" }).showOptionsEditor).toBe(true);
  });
});

describe("parseAmountMinor", () => {
  it("parses a dot the same as a comma", () => {
    expect(parseAmountMinor("300.50")).toBe(30050);
    expect(parseAmountMinor("300,50")).toBe(30050);
  });

  it("parses a whole number with no decimal part", () => {
    expect(parseAmountMinor("300")).toBe(30000);
  });

  it("is null for an empty or whitespace-only string", () => {
    expect(parseAmountMinor("")).toBeNull();
    expect(parseAmountMinor("   ")).toBeNull();
  });

  it("is null for anything that isn't a plain number", () => {
    expect(parseAmountMinor("abc")).toBeNull();
    expect(parseAmountMinor("-5")).toBeNull();
    expect(parseAmountMinor("5-")).toBeNull();
  });

  it("is null for a thousands separator — refused rather than guessed at", () => {
    // "1.234,56" is a common way to write 1234,56 in this market; once the
    // comma is normalised to a dot it reads as two separators. Silently
    // reinterpreting it as 1,234 (dropping three orders of magnitude) would
    // be worse than refusing it outright.
    expect(parseAmountMinor("1.234,56")).toBeNull();
    expect(parseAmountMinor("1,234.56")).toBeNull();
  });

  it("rounds to the nearest cent rather than truncating", () => {
    expect(parseAmountMinor("0,01")).toBe(1);
  });
});

describe("draftFrom", () => {
  const service: ProviderService = {
    id: "svc-1",
    categoryId: "cat-1",
    categoryCode: "hair",
    sourceLocale: "pt-MZ",
    locationType: "at_provider",
    bookingMode: "priced",
    status: "draft",
    imageUrls: [],
    translations: [
      { locale: "pt-MZ", name: "Corte de cabelo", description: "Um corte simples." },
      { locale: "en-US", name: "Haircut", description: "A simple cut." },
    ],
    options: [],
  };

  it("seeds the draft from the source locale's own translation, not the reader's", () => {
    // Editing happens in the language the service was written in, regardless
    // of which language the provider's own console happens to be in.
    expect(draftFrom(service)).toEqual({
      categoryId: "cat-1",
      sourceLocale: "pt-MZ",
      name: "Corte de cabelo",
      description: "Um corte simples.",
      locationType: "at_provider",
      bookingMode: "priced",
    });
  });

  it("falls back to empty text if the source locale is somehow missing its own translation", () => {
    const draft = draftFrom({ ...service, translations: [] });
    expect(draft.name).toBe("");
    expect(draft.description).toBe("");
  });
});

describe("optionDraftFrom", () => {
  it("seeds a fixed option's draft, formatting the amount with a comma", () => {
    const option: ServiceOption = {
      id: "opt-1",
      pricingMode: "fixed",
      amountMinor: 30050,
      currency: "MZN",
      durationMinutes: 45,
      minMinutes: null,
      stepMinutes: null,
      isDefault: true,
      isActive: true,
      sortOrder: 0,
      translations: [{ locale: "pt-MZ", name: "Padrão" }],
    };
    expect(optionDraftFrom(option, "pt-MZ")).toEqual({
      name: "Padrão",
      pricingMode: "fixed",
      amount: "300,5",
      duration: "45",
      min: "",
      step: "",
    });
  });

  it("seeds an hourly option's draft, with no duration", () => {
    const option: ServiceOption = {
      id: "opt-2",
      pricingMode: "hourly",
      amountMinor: 15000,
      currency: "MZN",
      durationMinutes: null,
      minMinutes: 60,
      stepMinutes: 30,
      isDefault: false,
      isActive: true,
      sortOrder: 1,
      translations: [{ locale: "pt-MZ", name: "Urgente" }],
    };
    expect(optionDraftFrom(option, "pt-MZ")).toEqual({
      name: "Urgente",
      pricingMode: "hourly",
      amount: "150",
      duration: "",
      min: "60",
      step: "30",
    });
  });
});

describe("toOptionInput", () => {
  it("maps a fixed draft, leaving min and step null", () => {
    expect(
      toOptionInput({ name: "Padrão", pricingMode: "fixed", amount: "300,50", duration: "45", min: "", step: "" }),
    ).toEqual({
      name: "Padrão",
      pricingMode: "fixed",
      amountMinor: 30050,
      currency: "MZN",
      durationMinutes: 45,
      minMinutes: null,
      stepMinutes: null,
    });
  });

  it("maps an hourly draft, leaving duration null", () => {
    expect(
      toOptionInput({ name: "Urgente", pricingMode: "hourly", amount: "150", duration: "", min: "60", step: "30" }),
    ).toEqual({
      name: "Urgente",
      pricingMode: "hourly",
      amountMinor: 15000,
      currency: "MZN",
      durationMinutes: null,
      minMinutes: 60,
      stepMinutes: 30,
    });
  });
});
