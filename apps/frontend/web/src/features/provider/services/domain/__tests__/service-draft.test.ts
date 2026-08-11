import { describe, expect, it } from "vitest";
import { canSubmit, emptyDraft, optionErrors } from "../service-draft";

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
