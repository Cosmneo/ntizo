import { describe, expect, it } from "vitest";
import { directoryTitle } from "../directory-title";

describe("directoryTitle", () => {
  it("names the page plainly when nothing is narrowing it", () => {
    expect(directoryTitle({}, null)).toEqual({ key: "titleProviders", values: {} });
  });

  it("names the trade when a category is chosen", () => {
    // A category-filtered page ranks under its own name, and a reader who
    // clicked "Plumbing" should see the word they clicked.
    expect(directoryTitle({ category: "plumbing" }, "Plumbing")).toEqual({
      key: "titleProvidersCategory",
      values: { category: "Plumbing" },
    });
  });

  it("names the place when a city is chosen", () => {
    expect(directoryTitle({ city: "Maputo" }, null)).toEqual({
      key: "titleProvidersCity",
      values: { city: "Maputo" },
    });
  });

  it("names both when both are chosen", () => {
    expect(directoryTitle({ category: "plumbing", city: "Maputo" }, "Plumbing")).toEqual({
      key: "titleProvidersCategoryCity",
      values: { category: "Plumbing", city: "Maputo" },
    });
  });

  it("falls back to the plain title when the category has not resolved yet", () => {
    // The category list is a separate query and may arrive a beat later. A
    // title reading "undefined providers" for that beat is worse than the
    // generic one, and worse still if a crawler catches it.
    expect(directoryTitle({ category: "plumbing" }, null)).toEqual({
      key: "titleProviders",
      values: {},
    });
  });

  it("keeps the city even when the category has not resolved", () => {
    expect(directoryTitle({ category: "plumbing", city: "Maputo" }, null)).toEqual({
      key: "titleProvidersCity",
      values: { city: "Maputo" },
    });
  });

  it("ignores a blank city rather than composing an empty place", () => {
    // `?city=` reaches here as "" through a URL somebody typed.
    expect(directoryTitle({ city: "  " }, null)).toEqual({ key: "titleProviders", values: {} });
  });
});
