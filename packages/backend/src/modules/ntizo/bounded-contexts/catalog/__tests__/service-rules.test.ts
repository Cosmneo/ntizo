import { describe, expect, it } from "bun:test";
import {
  assertOptionShape,
  canPublish,
  promoteNextDefault,
  withSingleDefault,
} from "../domain/service-rules";

const fixed = (over: Partial<Parameters<typeof assertOptionShape>[0]> = {}) => ({
  pricingMode: "fixed" as const,
  amountMinor: 30000,
  durationMinutes: 30,
  minMinutes: null,
  stepMinutes: null,
  ...over,
});

const hourly = (over = {}) => ({
  pricingMode: "hourly" as const,
  amountMinor: 25000,
  durationMinutes: null,
  minMinutes: 120,
  stepMinutes: 60,
  ...over,
});

// `toThrow(/regex/)` matches against `error.message` only — the kit's
// UseCaseError keeps `code` as a separate property, not folded into the
// human-readable message. `OptionDurationError` in particular is the same
// class for both OPTION_DURATION_REQUIRED and OPTION_DURATION_NOT_ALLOWED,
// so the code — not the class, not the message text — is the only thing
// that tells the two refusals apart. Assert on the public contract itself.
const codeOf = (fn: () => void): unknown => {
  try {
    fn();
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return undefined;
};

describe("assertOptionShape", () => {
  it("accepts a well-formed fixed option and a well-formed hourly one", () => {
    expect(() => assertOptionShape(fixed())).not.toThrow();
    expect(() => assertOptionShape(hourly())).not.toThrow();
  });

  it("refuses a fixed option with no duration", () => {
    expect(codeOf(() => assertOptionShape(fixed({ durationMinutes: null })))).toBe(
      "OPTION_DURATION_REQUIRED",
    );
  });

  it("refuses an hourly option carrying a duration", () => {
    // The calendar decides the block from the mode. A duration on an hourly
    // option is a number nobody reads and slice 2 would read it anyway.
    expect(codeOf(() => assertOptionShape(hourly({ durationMinutes: 60 })))).toBe(
      "OPTION_DURATION_NOT_ALLOWED",
    );
  });

  it("refuses an hourly option with no minimum", () => {
    expect(codeOf(() => assertOptionShape(hourly({ minMinutes: null })))).toBe(
      "OPTION_DURATION_REQUIRED",
    );
  });

  it("refuses a price of zero or less", () => {
    expect(codeOf(() => assertOptionShape(fixed({ amountMinor: 0 })))).toBe(
      "OPTION_PRICE_INVALID",
    );
    expect(codeOf(() => assertOptionShape(fixed({ amountMinor: -1 })))).toBe(
      "OPTION_PRICE_INVALID",
    );
  });

  it("refuses a fixed option carrying a minimum or a step", () => {
    // The mirror of the hourly case above: a fixed option's duration IS the
    // block, so a minimum or step left over from switching pricing modes is
    // a value slice 2 would misread as "this is actually hourly-shaped."
    expect(codeOf(() => assertOptionShape(fixed({ minMinutes: 30 })))).toBe(
      "OPTION_DURATION_NOT_ALLOWED",
    );
    expect(codeOf(() => assertOptionShape(fixed({ stepMinutes: 15 })))).toBe(
      "OPTION_DURATION_NOT_ALLOWED",
    );
  });
});

describe("withSingleDefault", () => {
  it("makes the first option the default", () => {
    // `isDefault: false as boolean` — a single-element array literal here lets
    // tsc infer T's `isDefault` as the literal `false` instead of `boolean`,
    // which then fails to compare against `[true]` below. Widen it on purpose.
    const out = withSingleDefault([{ id: "a", isDefault: false as boolean, sortOrder: 0 }]);
    expect(out.map((o) => o.isDefault)).toEqual([true]);
  });

  it("keeps exactly one when several claim it", () => {
    // Two defaults is the state a partial unique index refuses; this is the
    // same rule where a person can read it.
    const out = withSingleDefault([
      { id: "a", isDefault: true, sortOrder: 0 },
      { id: "b", isDefault: true, sortOrder: 1 },
    ]);
    expect(out.filter((o) => o.isDefault).map((o) => o.id)).toEqual(["a"]);
  });

  it("breaks a tie by sortOrder, not by array position", () => {
    // Array position and sortOrder deliberately disagree here — "b" comes
    // first in the array but "a" has the lower sortOrder. A test where they
    // agree (as above) would still pass with the .sort() call deleted.
    const out = withSingleDefault([
      { id: "b", isDefault: true, sortOrder: 1 },
      { id: "a", isDefault: true, sortOrder: 0 },
    ]);
    expect(out.map((o) => o.id)).toEqual(["a", "b"]);
    expect(out.filter((o) => o.isDefault).map((o) => o.id)).toEqual(["a"]);
  });

  it("leaves an empty list empty rather than inventing a default", () => {
    expect(withSingleDefault([])).toEqual([]);
  });
});

describe("promoteNextDefault", () => {
  it("promotes the next by sortOrder when the default is removed", () => {
    const out = promoteNextDefault(
      [
        { id: "a", isDefault: true, sortOrder: 0 },
        { id: "b", isDefault: false, sortOrder: 1 },
        { id: "c", isDefault: false, sortOrder: 2 },
      ],
      "a",
    );
    expect(out.find((o) => o.isDefault)?.id).toBe("b");
    expect(out.map((o) => o.id)).toEqual(["b", "c"]);
  });

  it("does nothing to the default when a non-default is removed", () => {
    const out = promoteNextDefault(
      [
        { id: "a", isDefault: true, sortOrder: 0 },
        { id: "b", isDefault: false, sortOrder: 1 },
      ],
      "b",
    );
    expect(out.find((o) => o.isDefault)?.id).toBe("a");
  });
});

describe("canPublish", () => {
  it("refuses a service with no category", () => {
    expect(
      codeOf(() =>
        canPublish({
          bookingMode: "priced",
          categoryId: null,
          hasSourceName: true,
          optionCount: 1,
          memberCount: 1,
        }),
      ),
    ).toBe("SERVICE_CATEGORY_REQUIRED");
  });

  it("refuses a priced service with no options", () => {
    expect(
      codeOf(() =>
        canPublish({
          bookingMode: "priced",
          categoryId: "cat",
          hasSourceName: true,
          optionCount: 0,
          // A real performer, so this exercises the option check rather
          // than the member check that now runs before it.
          memberCount: 1,
        }),
      ),
    ).toBe("SERVICE_NEEDS_OPTION");
  });

  it("refuses a quote service that somehow has options", () => {
    expect(
      codeOf(() =>
        canPublish({
          bookingMode: "quote",
          categoryId: "cat",
          hasSourceName: true,
          optionCount: 1,
          memberCount: 1,
        }),
      ),
    ).toBe("SERVICE_QUOTE_HAS_OPTIONS");
  });

  it("refuses a service with no name in the locale it was written in", () => {
    expect(
      codeOf(() =>
        canPublish({
          bookingMode: "priced",
          categoryId: "cat",
          hasSourceName: false,
          optionCount: 1,
          memberCount: 1,
        }),
      ),
    ).toBe("SERVICE_NAME_REQUIRED");
  });

  it("accepts a priced service with a category, a name and one option", () => {
    expect(() =>
      canPublish({
        bookingMode: "priced",
        categoryId: "cat",
        hasSourceName: true,
        optionCount: 1,
        memberCount: 1,
      }),
    ).not.toThrow();
  });

  it("accepts a quote service with no options at all", () => {
    expect(() =>
      canPublish({
        bookingMode: "quote",
        categoryId: "cat",
        hasSourceName: true,
        optionCount: 0,
        memberCount: 1,
      }),
    ).not.toThrow();
  });
});
