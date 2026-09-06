import { describe, expect, test } from "vitest";
import { publishBlocker, requiredProgress, sectionStates, type CompletenessInput } from "../completeness";

const COMPLETE: CompletenessInput = {
  categoryId: "cat-1",
  sourceName: "Corte de cabelo",
  bookingMode: "priced",
  optionCount: 1,
  memberIds: ["m1"],
  individualProvider: false,
  workspaceActive: true,
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

  // basicsCode's own internal order: category before name, both missing at
  // once so nothing but that order can decide which code comes back.
  test("the category is reported before the missing name, when both are missing", () => {
    const input = { ...COMPLETE, categoryId: null, sourceName: "" };
    expect(publishBlocker(input)).toBe("SERVICE_CATEGORY_REQUIRED");
    expect(by(input, "basics").blockingCode).toBe("SERVICE_CATEGORY_REQUIRED");
  });

  // The server's own comment on `memberCount === 0` in service-rules.ts is
  // explicit that this one is deliberate: performers before the booking-mode
  // checks, so fixing the category error doesn't just surface the option
  // error next. Both fields wrong at once, priced branch.
  test("the missing performer is reported before the missing option, on a priced organization service", () => {
    expect(publishBlocker({ ...COMPLETE, memberIds: [], optionCount: 0 }))
      .toBe("SERVICE_NEEDS_MEMBER");
  });

  // Same pair, quote branch — the ordering holds regardless of which
  // booking-mode check would otherwise fire.
  test("the missing performer is reported before the quote-has-options problem", () => {
    expect(publishBlocker({ ...COMPLETE, memberIds: [], bookingMode: "quote", optionCount: 2 }))
      .toBe("SERVICE_NEEDS_MEMBER");
  });

  test("an individual provider has no performers section at all", () => {
    const states = sectionStates({ ...COMPLETE, individualProvider: true, memberIds: [] });
    expect(states.find((s) => s.id === "performers")).toBeUndefined();
  });

  test("and is not blocked by the performer rule the server seeds for them", () => {
    expect(publishBlocker({ ...COMPLETE, individualProvider: true, memberIds: [] })).toBeNull();
  });

  test("languages is never required, and reads as already complete", () => {
    const s = by(COMPLETE, "languages");
    expect(s.required).toBe(false);
    expect(s.complete).toBe(true);
    expect(s.blockingCode).toBeNull();
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

describe("publishBlocker — the workspace itself", () => {
  test("a workspace still awaiting approval blocks publishing", () => {
    // `SetServiceStatusCommand` refuses this with PROVIDER_NOT_ACTIVE before
    // it ever calls `canPublish`. Predicting it here is what stops the
    // provider pressing Publish, seeing it succeed, and never appearing in
    // the browse — the storefront filters their workspace out
    // (`conditionsFor`, service-read.repository.ts).
    expect(publishBlocker({ ...COMPLETE, workspaceActive: false })).toBe("PROVIDER_NOT_ACTIVE");
  });

  test("it is reported before anything about the service, as the server does", () => {
    // The server asks `isProviderActive` before `service.publish()`, so a
    // service that is also missing its category still hears about the
    // workspace first. Reporting the category instead would send somebody to
    // fix a form that was never what stood in the way.
    expect(publishBlocker({ ...COMPLETE, workspaceActive: false, categoryId: null }))
      .toBe("PROVIDER_NOT_ACTIVE");
  });

  test("it is not one of the form's sections", () => {
    // Nothing in the wizard can fix it, so it must not appear in the rail as
    // a task with a tick box — the progress count would then be permanently
    // short of its total with no way to close the gap.
    const codes = sectionStates({ ...COMPLETE, workspaceActive: false }).map((s) => s.blockingCode);
    expect(codes).not.toContain("PROVIDER_NOT_ACTIVE");
    expect(requiredProgress(sectionStates({ ...COMPLETE, workspaceActive: false })))
      .toEqual({ done: 3, total: 3 });
  });
});
