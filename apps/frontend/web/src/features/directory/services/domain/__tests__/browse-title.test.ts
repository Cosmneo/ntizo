import { describe, expect, it } from "vitest";
import { browseTitle } from "../browse-title";

describe("browseTitle", () => {
  it("names the page plainly when nothing is narrowing it", () => {
    expect(browseTitle({}, null)).toEqual({ key: "titleServices", values: {} });
  });

  it("names the trade when a category is chosen", () => {
    // A category-filtered page ranks under its own name, and a reader who
    // clicked "Plumbing" should see the word they clicked.
    expect(browseTitle({ category: "plumbing" }, "Plumbing")).toEqual({
      key: "titleServicesCategory",
      values: { category: "Plumbing" },
    });
  });

  it("names the place when a city is chosen", () => {
    expect(browseTitle({ city: "Maputo" }, null)).toEqual({
      key: "titleServicesCity",
      values: { city: "Maputo" },
    });
  });

  it("names both when both are chosen", () => {
    expect(browseTitle({ category: "plumbing", city: "Maputo" }, "Plumbing")).toEqual({
      key: "titleServicesCategoryCity",
      values: { category: "Plumbing", city: "Maputo" },
    });
  });

  it("falls back to the plain title when the category has not resolved yet", () => {
    // The category list is a separate query and may arrive a beat later. A
    // title reading "undefined services" for that beat is worse than the
    // generic one, and worse still if a crawler catches it.
    expect(browseTitle({ category: "plumbing" }, null)).toEqual({
      key: "titleServices",
      values: {},
    });
  });

  it("keeps the city even when the category has not resolved", () => {
    expect(browseTitle({ category: "plumbing", city: "Maputo" }, null)).toEqual({
      key: "titleServicesCity",
      values: { city: "Maputo" },
    });
  });

  it("ignores a blank city rather than composing an empty place", () => {
    // `?city=` reaches here as "" through a URL somebody typed.
    expect(browseTitle({ city: "  " }, null)).toEqual({ key: "titleServices", values: {} });
  });
});
