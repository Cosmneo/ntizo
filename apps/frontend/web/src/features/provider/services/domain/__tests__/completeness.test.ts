import { describe, expect, test } from "vitest";
import { publishBlocker, requiredProgress, sectionStates, type CompletenessInput } from "../completeness";

const COMPLETE: CompletenessInput = {
  categoryId: "cat-1",
  sourceName: "Corte de cabelo",
  bookingMode: "priced",
  optionCount: 1,
  memberIds: ["m1"],
  individualProvider: false,
};

const by = (input: CompletenessInput, id: string) => sectionStates(input).find((s) => s.id === id)!;

describe("sectionStates", () => {
  test("a complete priced service has nothing blocking it", () => {
    expect(publishBlocker(COMPLETE)).toBeNull();
    expect(sectionStates(COMPLETE).every((s) => s.complete)).toBe(true);
  });

  test("no category leaves the essentials incomplete and names the server's code", () => {
    const s = by({ ...COMPLETE, categoryId: null }, "basics");
    expect(s.complete).toBe(false);
    expect(s.blockingCode).toBe("SERVICE_CATEGORY_REQUIRED");
  });

  test("an empty source name leaves the essentials incomplete", () => {
    expect(by({ ...COMPLETE, sourceName: "" }, "basics").blockingCode).toBe("SERVICE_NAME_REQUIRED");
  });

  test("whitespace is not a name", () => {
    expect(by({ ...COMPLETE, sourceName: "   " }, "basics").blockingCode).toBe("SERVICE_NAME_REQUIRED");
  });

  test("a priced service with no options leaves pricing incomplete", () => {
    expect(by({ ...COMPLETE, optionCount: 0 }, "pricing").blockingCode).toBe("SERVICE_NEEDS_OPTION");
  });

  test("a quote service with options is a problem, not merely incomplete", () => {
    expect(by({ ...COMPLETE, bookingMode: "quote", optionCount: 2 }, "pricing").blockingCode)
      .toBe("SERVICE_QUOTE_HAS_OPTIONS");
  });

  test("a quote service with no options is complete", () => {
    expect(by({ ...COMPLETE, bookingMode: "quote", optionCount: 0 }, "pricing").complete).toBe(true);
  });

  test("nobody performing it leaves performers incomplete", () => {
    expect(by({ ...COMPLETE, memberIds: [] }, "performers").blockingCode).toBe("SERVICE_NEEDS_MEMBER");
  });

  // The server checks the category first. A client that reported the option
  // problem here would send somebody to the wrong section.
  test("the category is reported before the missing option, as the server does", () => {
    expect(publishBlocker({ ...COMPLETE, categoryId: null, optionCount: 0 }))
      .toBe("SERVICE_CATEGORY_REQUIRED");
  });

  test("the name is reported before the missing performer", () => {
    expect(publishBlocker({ ...COMPLETE, sourceName: "", memberIds: [] }))
      .toBe("SERVICE_NAME_REQUIRED");
  });

  test("an individual provider has no performers section at all", () => {
    const states = sectionStates({ ...COMPLETE, individualProvider: true, memberIds: [] });
    expect(states.find((s) => s.id === "performers")).toBeUndefined();
  });

  test("and is not blocked by the performer rule the server seeds for them", () => {
    expect(publishBlocker({ ...COMPLETE, individualProvider: true, memberIds: [] })).toBeNull();
  });

  test("timing, languages and media are never required", () => {
    for (const id of ["timing", "languages", "media"] as const) {
      expect(by(COMPLETE, id).required).toBe(false);
    }
  });
});

describe("requiredProgress", () => {
  test("an organization counts three required sections", () => {
    expect(requiredProgress(sectionStates(COMPLETE))).toEqual({ done: 3, total: 3 });
  });

  test("an individual counts two", () => {
    expect(requiredProgress(sectionStates({ ...COMPLETE, individualProvider: true })))
      .toEqual({ done: 2, total: 2 });
  });

  test("optional sections never enter the count", () => {
    const states = sectionStates({ ...COMPLETE, categoryId: null });
    expect(requiredProgress(states)).toEqual({ done: 2, total: 3 });
  });
});
