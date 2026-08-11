import { describe, expect, it } from "bun:test";
import { Service } from "../domain/aggregates/service.aggregate";

/**
 * The kit's errors carry `code` beside `message`, not inside it — so
 * `toThrow(/CODE/)` matches nothing and passes or fails for the wrong reason.
 * Assert on the code itself.
 */
const codeOf = (fn: () => void): unknown => {
  try {
    fn();
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return undefined;
};

function newService(over: Partial<Parameters<typeof Service.create>[0]> = {}) {
  return Service.create({
    id: "svc-1",
    providerId: "prov-1",
    categoryId: "cat-1",
    sourceLocale: "pt-MZ",
    locationType: "at_provider",
    bookingMode: "priced",
    name: "Corte de cabelo",
    ...over,
  });
}

const fixedOption = {
  id: "opt-1",
  pricingMode: "fixed" as const,
  amountMinor: 30000,
  currency: "MZN",
  durationMinutes: 30,
  minMinutes: null,
  stepMinutes: null,
  name: "Só cabelo",
};

describe("Service.create", () => {
  it("starts as a draft with the name recorded in the source locale", () => {
    const s = newService();
    expect(s.toJSON().status).toBe("draft");
    expect(s.toJSON().translations).toEqual([
      { locale: "pt-MZ", name: "Corte de cabelo", description: null },
    ]);
  });

  it("raises a created event", () => {
    const events = newService().pullEvents();
    expect(events.map((e) => e.eventName)).toEqual(["service.created"]);
  });
});

describe("options", () => {
  it("makes the first option the default", () => {
    const s = newService();
    s.addOption(fixedOption);
    expect(s.toJSON().options[0]!.isDefault).toBe(true);
  });

  it("keeps one default when a second option is added", () => {
    const s = newService();
    s.addOption(fixedOption);
    s.addOption({ ...fixedOption, id: "opt-2", name: "Cabelo e barba", durationMinutes: 50 });
    expect(s.toJSON().options.filter((o) => o.isDefault)).toHaveLength(1);
  });

  it("promotes the next when the default is removed", () => {
    const s = newService();
    s.addOption(fixedOption);
    s.addOption({ ...fixedOption, id: "opt-2", name: "Cabelo e barba", durationMinutes: 50 });
    s.removeOption("opt-1");
    expect(s.toJSON().options.find((o) => o.isDefault)?.id).toBe("opt-2");
  });

  it("refuses to leave a published service with none", () => {
    const s = newService();
    s.addOption(fixedOption);
    s.publish();
    expect(codeOf(() => s.removeOption("opt-1"))).toBe("OPTION_LAST_ONE");
  });

  it("allows a draft to be emptied", () => {
    // A draft is somebody still working. Refusing here would trap them.
    const s = newService();
    s.addOption(fixedOption);
    s.removeOption("opt-1");
    expect(s.toJSON().options).toEqual([]);
  });

  it("refuses an option on a quote service", () => {
    const s = newService({ bookingMode: "quote" });
    expect(codeOf(() => s.addOption(fixedOption))).toBe("SERVICE_QUOTE_HAS_OPTIONS");
  });

  it("refuses an hourly option carrying a duration", () => {
    const s = newService();
    expect(
      codeOf(() =>
        s.addOption({
          ...fixedOption,
          pricingMode: "hourly",
          durationMinutes: 60,
          minMinutes: 120,
          stepMinutes: 60,
        }),
      ),
    ).toBe("OPTION_DURATION_NOT_ALLOWED");
  });
});

describe("publishing", () => {
  it("refuses a priced service with no options", () => {
    expect(codeOf(() => newService().publish())).toBe("SERVICE_NEEDS_OPTION");
  });

  it("publishes a quote service with none", () => {
    const s = newService({ bookingMode: "quote" });
    s.publish();
    expect(s.toJSON().status).toBe("published");
  });

  it("refuses to publish with no name in the source locale", () => {
    const s = newService();
    s.addOption(fixedOption);
    s.removeTranslation("pt-MZ");
    expect(codeOf(() => s.publish())).toBe("SERVICE_NAME_REQUIRED");
  });
});

describe("translations", () => {
  it("adds one without touching the source", () => {
    const s = newService();
    s.setTranslation("en-US", "Haircut", null);
    expect(s.toJSON().translations.map((t) => t.locale).sort()).toEqual(["en-US", "pt-MZ"]);
  });

  it("replaces rather than duplicating the same locale", () => {
    const s = newService();
    s.setTranslation("pt-MZ", "Corte", null);
    expect(s.toJSON().translations).toHaveLength(1);
    expect(s.toJSON().translations[0]!.name).toBe("Corte");
  });
});
