import { describe, expect, it } from "vitest";
import {
  canSubmit,
  draftFrom,
  emptyDraft,
  moved,
  optionDraftFrom,
  optionErrors,
  parseAmountMinor,
  serviceDraftErrors,
  serviceLifecycle,
  toOptionInput,
  type ServiceDraft,
} from "../service-draft";
import type { ProviderService, ServiceOption } from "../types";

/** A draft with the three required fields already filled in — the base every submittability test in this file starts from. */
function submittableDraft(overrides: Partial<ServiceDraft> = {}): ServiceDraft {
  return {
    ...emptyDraft(),
    categoryId: "c",
    name: "Corte",
    locationType: "at_provider",
    ...overrides,
  };
}

describe("canSubmit", () => {
  it("needs a category, a name and a location", () => {
    expect(canSubmit(emptyDraft())).toBe(false);
    expect(
      canSubmit({ ...emptyDraft(), categoryId: "c", name: "Corte", locationType: "at_provider" }),
    ).toBe(true);
  });
});

describe("emptyDraft", () => {
  it("a new draft starts with the creating member ticked", () => {
    // Mirrors what `CreateServiceCommand` does server-side anyway — whoever
    // creates the service is already its performer the moment it exists, so
    // the form should not open showing nobody selected.
    expect(emptyDraft("member-1").memberIds).toEqual(["member-1"]);
  });

  it("starts with nobody ticked when the creating member isn't known yet", () => {
    // the service editor backfills this once `availability.config` resolves;
    // the draft itself must not invent a member id it was never given.
    expect(emptyDraft().memberIds).toEqual([]);
  });
});

describe("serviceDraftErrors", () => {
  it("a service for an individual provider needs no explicit performer", () => {
    const draft = submittableDraft({ memberIds: [] });
    // Published or not — an individual provider has one member and nothing
    // to choose between, so the performer check never engages for them.
    expect(
      serviceDraftErrors(draft, { individualProvider: true, published: true }),
    ).not.toHaveProperty("memberIds");
    expect(canSubmit(draft, { individualProvider: true, published: true })).toBe(true);
  });

  it("a draft (unpublished) organization service needs no performer either", () => {
    const draft = submittableDraft({ memberIds: [] });
    expect(
      serviceDraftErrors(draft, { individualProvider: false, published: false }),
    ).not.toHaveProperty("memberIds");
  });

  it("a published service cannot be saved with nobody performing it", () => {
    // The form refuses before the request, and the server refuses too — this
    // asserts the client half.
    const draft = submittableDraft({ memberIds: [] });
    const ctx = { individualProvider: false, published: true };
    expect(serviceDraftErrors(draft, ctx)).toHaveProperty("memberIds");
    expect(canSubmit(draft, ctx)).toBe(false);
  });

  it("a published organization service with at least one performer is fine", () => {
    const draft = submittableDraft({ memberIds: ["member-1"] });
    const ctx = { individualProvider: false, published: true };
    expect(serviceDraftErrors(draft, ctx)).not.toHaveProperty("memberIds");
    expect(canSubmit(draft, ctx)).toBe(true);
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
    bufferMinutes: 10,
    slotIntervalMinutes: 15,
    memberIds: ["member-1", "member-2"],
  };

  it("seeds the draft from the source locale's own translation, not the reader's", () => {
    // Editing happens in the language the service was written in, regardless
    // of which language the provider's own console happens to be in.
    // `bufferMinutes`/`slotIntervalMinutes` still travel on `ProviderService`
    // (the server keeps them until Task 10) but are not read into the draft —
    // the rule that owns the buffer and the grid now lives on availability.
    expect(draftFrom(service)).toEqual({
      categoryId: "cat-1",
      sourceLocale: "pt-MZ",
      name: "Corte de cabelo",
      description: "Um corte simples.",
      locationType: "at_provider",
      bookingMode: "priced",
      memberIds: ["member-1", "member-2"],
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
    // 30050 minor units is 300,50 — the trailing zero has to survive, or the
    // edit field shows a number the provider never typed.
    expect(optionDraftFrom(option, "pt-MZ")).toEqual({
      name: "Padrão",
      pricingMode: "fixed",
      amount: "300,50",
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
    // Always two decimal places, even for a whole number — the same
    // convention `formatOptionPrice` uses, so a round amount doesn't read as
    // a special case with fewer digits than a non-round one.
    expect(optionDraftFrom(option, "pt-MZ")).toEqual({
      name: "Urgente",
      pricingMode: "hourly",
      amount: "150,00",
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

describe("moved", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("moves a row down by delta", () => {
    expect(moved(rows, "a", 1).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("moves a row up by delta", () => {
    expect(moved(rows, "c", -1).map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("clamps at the top — moving the first row up is a no-op, not a wrap to the bottom", () => {
    expect(moved(rows, "a", -1).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("clamps at the bottom — moving the last row down is a no-op, not a wrap to the top", () => {
    expect(moved(rows, "c", 1).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("moves by more than one place at once, for a keyboard or menu jump", () => {
    expect(moved(rows, "a", 2).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("returns an unchanged copy, not the same reference, when the id isn't found", () => {
    const out = moved(rows, "nope", 1);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(out).not.toBe(rows);
  });
});
