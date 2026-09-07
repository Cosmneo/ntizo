import { describe, expect, it } from "vitest";
import { resultsScope } from "../results-scope";

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
