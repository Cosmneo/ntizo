import { describe, expect, it } from "vitest";
import { resultsScope, scopeValues } from "../results-scope";

/**
 * Four cases, because there are exactly four clauses in `resultsScope.*` and
 * a wrong one prints a sentence with a hole in it — "38 services found in"
 * with nothing after it, or a city named that nobody asked for.
 */
describe("resultsScope", () => {
  it("names both when both are known", () => {
    expect(resultsScope({ category: "Hair & beauty", city: "Maputo" })).toBe("categoryCity");
  });

  it("names the category alone when there is no city", () => {
    expect(resultsScope({ category: "Hair & beauty" })).toBe("category");
  });

  it("names the city alone when there is no category", () => {
    expect(resultsScope({ city: "Maputo" })).toBe("city");
  });

  it("says the whole platform when neither is set", () => {
    // Which is also the in-flight case: the title falls back to the plainer
    // form while the category name is still being fetched, and this falls
    // back with it rather than naming a category it cannot spell.
    expect(resultsScope({})).toBe("all");
  });
});

/**
 * The clause describes what is filtering, which a typed term does not change.
 * Feeding the heading's values here printed "in all categories" over a search
 * inside a category, with that category's chip lit two lines above it.
 */
describe("scopeValues", () => {
  it("names the category even when a term owns the heading", () => {
    expect(scopeValues({ category: "beauty", q: "cabelo" } as never, "Beleza e cabelo")).toEqual({
      category: "Beleza e cabelo",
    });
  });

  it("names the category and the city together", () => {
    expect(scopeValues({ category: "beauty", city: "Maputo" } as never, "Beleza e cabelo")).toEqual({
      category: "Beleza e cabelo",
      city: "Maputo",
    });
  });

  it("says nothing about a category whose name has not arrived", () => {
    expect(scopeValues({ category: "beauty" } as never, null)).toEqual({});
  });

  it("never prints the code", () => {
    expect(scopeValues({ category: "beauty" } as never, null).category).toBeUndefined();
  });

  it("drops a city that is only whitespace", () => {
    expect(scopeValues({ city: "  " } as never, null)).toEqual({});
  });

  it("is empty for an unnarrowed list", () => {
    expect(scopeValues({} as never, null)).toEqual({});
  });
});
