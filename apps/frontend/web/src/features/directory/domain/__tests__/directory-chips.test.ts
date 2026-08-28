import { describe, expect, it } from "vitest";
import { directoryFilterChips } from "../directory-chips";

describe("directoryFilterChips", () => {
  it("shows nothing when nothing is narrowing the list", () => {
    expect(directoryFilterChips({})).toEqual([]);
  });

  it("does not offer the category as a chip", () => {
    // The rail is on screen above the results at every width, so a chip for
    // it is a second control for something the reader can already see and
    // clear — and on a phone it would be the only one that duplicates.
    expect(directoryFilterChips({ category: "plumbing" })).toEqual([]);
  });

  it("offers one chip per narrowing", () => {
    const chips = directoryFilterChips({ city: "Maputo", providerType: "individual" });
    expect(chips.map((c) => c.key)).toEqual(["city", "providerType"]);
  });

  it("removes exactly one filter and keeps the others", () => {
    // The bug this prevents: a remove link built by hand drops every
    // parameter the component that built it did not know about.
    const chips = directoryFilterChips({
      city: "Maputo",
      providerType: "individual",
      q: "canaliza",
      sort: "rating",
    });
    const removeCity = chips.find((c) => c.key === "city")!.next;
    expect(removeCity).toEqual({ providerType: "individual", q: "canaliza", sort: "rating" });
  });

  it("sends the reader back to the first page when a filter comes off", () => {
    // Page 4 of a wider result set is not page 4 of the narrower one, and
    // keeping the offset lands them mid-list with no idea why.
    const chips = directoryFilterChips({ city: "Maputo", offset: 72 });
    expect(chips[0]!.next.offset).toBeUndefined();
  });

  it("treats a price range as one chip however many bounds are set", () => {
    // Two chips for one range invites the reader to remove half a range.
    expect(directoryFilterChips({ minPrice: 500, maxPrice: 5000 }).map((c) => c.key)).toEqual([
      "price",
    ]);
    expect(directoryFilterChips({ minPrice: 500 }).map((c) => c.key)).toEqual(["price"]);
    expect(directoryFilterChips({ maxPrice: 5000 }).map((c) => c.key)).toEqual(["price"]);
  });

  it("removes both bounds when the price chip is removed", () => {
    const chip = directoryFilterChips({ minPrice: 500, maxPrice: 5000 })[0]!;
    expect(chip.next.minPrice).toBeUndefined();
    expect(chip.next.maxPrice).toBeUndefined();
  });

  it("counts a minimum of zero as a range somebody set", () => {
    // "Free and up" is a bound, and `if (min)` steps straight over it.
    expect(directoryFilterChips({ minPrice: 0 }).map((c) => c.key)).toEqual(["price"]);
  });

  it("labels the range with both bounds when both are set, and one when one is", () => {
    expect(directoryFilterChips({ minPrice: 500, maxPrice: 5000 })[0]!.label).toEqual({
      key: "chipPriceRange",
      values: { min: 500, max: 5000 },
    });
    expect(directoryFilterChips({ minPrice: 500 })[0]!.label).toEqual({
      key: "chipPriceMin",
      values: { min: 500 },
    });
    expect(directoryFilterChips({ maxPrice: 5000 })[0]!.label).toEqual({
      key: "chipPriceMax",
      values: { max: 5000 },
    });
  });

  it("shows the search term as its own chip", () => {
    // Somebody who typed a word and then filtered has two narrowings, and
    // only one of them is visible in the sidebar.
    expect(directoryFilterChips({ q: "canaliza" })[0]).toMatchObject({
      key: "q",
      label: { key: "chipSearch", values: { term: "canaliza" } },
    });
  });

  it("does not offer the sort as a chip", () => {
    // An order is not a narrowing: removing it does not widen the result set,
    // and a chip that changes nothing about what is shown is a lie.
    expect(directoryFilterChips({ sort: "rating" })).toEqual([]);
  });

  it("shows the city as its own chip", () => {
    expect(directoryFilterChips({ city: "Maputo" })[0]).toMatchObject({
      key: "city",
      label: { key: "chipCity", values: { city: "Maputo" } },
    });
  });

  it("shows the verified filter only when it is on", () => {
    // `verified=false` and no `verified` at all are the same page.
    expect(directoryFilterChips({ verified: false }).map((c) => c.key)).toEqual([]);
    expect(directoryFilterChips({ verified: true }).map((c) => c.key)).toEqual(["verified"]);
  });

  it("labels a rating threshold with the score, not the word 'rating'", () => {
    expect(directoryFilterChips({ minRating: 4.5 })[0]!.label).toEqual({
      key: "chipRating",
      values: { score: 4.5 },
    });
  });
});
