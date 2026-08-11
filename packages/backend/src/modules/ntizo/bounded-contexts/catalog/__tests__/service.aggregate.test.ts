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

  it("keeps sortOrder unique after a remove and a re-add", () => {
    // options.length is not a stable source for the next slot once
    // something has been removed — the array shrinks, but a surviving
    // option can still hold a sortOrder higher than the new length.
    const s = newService();
    s.addOption(fixedOption);
    s.addOption({ ...fixedOption, id: "opt-2", name: "Cabelo e barba", durationMinutes: 50 });
    s.removeOption("opt-1");
    s.addOption({ ...fixedOption, id: "opt-3", name: "Barba", durationMinutes: 20 });
    const sortOrders = s.toJSON().options.map((o) => o.sortOrder);
    expect(new Set(sortOrders).size).toBe(sortOrders.length);
  });
});

describe("updateOption", () => {
  it("lands a valid update", () => {
    const s = newService();
    s.addOption(fixedOption);
    s.updateOption("opt-1", { amountMinor: 45000 });
    expect(s.toJSON().options[0]!.amountMinor).toBe(45000);
  });

  it("refuses an update that would make the shape illegal", () => {
    const s = newService();
    s.addOption(fixedOption);
    // A fixed option has no minimum or step — its duration is the block.
    expect(codeOf(() => s.updateOption("opt-1", { minMinutes: 30 }))).toBe(
      "OPTION_DURATION_NOT_ALLOWED",
    );
    // Switching to hourly while the old fixed duration is still on the
    // option is the same illegal shape from the other side.
    expect(codeOf(() => s.updateOption("opt-1", { pricingMode: "hourly" }))).toBe(
      "OPTION_DURATION_NOT_ALLOWED",
    );
  });

  it("moves the default off the first when a second is made default", () => {
    const s = newService();
    s.addOption(fixedOption);
    s.addOption({ ...fixedOption, id: "opt-2", name: "Cabelo e barba", durationMinutes: 50 });
    s.updateOption("opt-2", { isDefault: true });
    const options = s.toJSON().options;
    expect(options.find((o) => o.id === "opt-1")!.isDefault).toBe(false);
    expect(options.find((o) => o.id === "opt-2")!.isDefault).toBe(true);
  });
});

describe("reorderOptions", () => {
  it("applies the given order", () => {
    const s = newService();
    s.addOption(fixedOption);
    s.addOption({ ...fixedOption, id: "opt-2", name: "Cabelo e barba", durationMinutes: 50 });
    s.reorderOptions(["opt-2", "opt-1"]);
    expect(s.toJSON().options.map((o) => o.id)).toEqual(["opt-2", "opt-1"]);
  });

  it("keeps an option the caller did not mention, at the end", () => {
    const s = newService();
    s.addOption(fixedOption);
    s.addOption({ ...fixedOption, id: "opt-2", name: "Cabelo e barba", durationMinutes: 50 });
    s.addOption({ ...fixedOption, id: "opt-3", name: "Barba", durationMinutes: 20 });
    // opt-3 is deliberately left out of the list — a stale caller must not
    // be able to delete it by omission.
    s.reorderOptions(["opt-2", "opt-1"]);
    expect(s.toJSON().options.map((o) => o.id)).toEqual(["opt-2", "opt-1", "opt-3"]);
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

  it("refuses to publish with only whitespace in the source name", () => {
    // A row exists — it just has nothing in it. Checking presence alone
    // would let this through.
    const s = newService();
    s.addOption(fixedOption);
    s.setTranslation("pt-MZ", "   ", null);
    expect(codeOf(() => s.publish())).toBe("SERVICE_NAME_REQUIRED");
  });
});

describe("setQuoteForm", () => {
  const form = {
    responseHours: 24,
    askDeadline: false,
    askPhotos: false,
    askLocation: false,
    intro: "Diga-me o que precisa.",
  };

  it("refuses a priced service — the mirror of a quote service refusing an option", () => {
    const s = newService();
    expect(codeOf(() => s.setQuoteForm(form))).toBe("SERVICE_QUOTE_FORM_NOT_ALLOWED");
  });

  it("accepts it on a quote service", () => {
    const s = newService({ bookingMode: "quote" });
    s.setQuoteForm(form);
    expect(s.toJSON().quoteForm).toEqual(form);
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
