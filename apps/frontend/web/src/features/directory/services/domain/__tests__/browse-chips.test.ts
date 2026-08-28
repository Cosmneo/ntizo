import { describe, expect, it } from "vitest";
import { browseFilterChips } from "../browse-chips";

describe("browseFilterChips", () => {
  it("shows nothing when nothing is narrowing the list", () => {
    expect(browseFilterChips({})).toEqual([]);
  });

  it("does not offer the category as a chip", () => {
    // The rail is on screen above the results at every width, so a chip for
    // it is a second control for something the reader can already see and
    // clear — and on a phone it would be the only one that duplicates.
    expect(browseFilterChips({ category: "plumbing" })).toEqual([]);
  });

  it("offers one chip per narrowing", () => {
    const chips = browseFilterChips({ locationType: "at_customer", paymentMode: "fixed" });
    expect(chips.map((c) => c.key)).toEqual(["locationType", "paymentMode"]);
  });

  it("removes exactly one filter and keeps the others", () => {
    // The bug this prevents: a remove link built by hand drops every
    // parameter the component that built it did not know about.
    const chips = browseFilterChips({
      locationType: "at_customer",
      paymentMode: "fixed",
      q: "corte",
      sort: "newest",
    });
    const removeLocation = chips.find((c) => c.key === "locationType")!.next;
    expect(removeLocation).toEqual({ paymentMode: "fixed", q: "corte", sort: "newest" });
  });

  it("sends the reader back to the first page when a filter comes off", () => {
    // Page 4 of a wider result set is not page 4 of the narrower one, and
    // keeping the offset lands them mid-list with no idea why.
    const chips = browseFilterChips({ locationType: "at_customer", offset: 72 });
    expect(chips[0]!.next.offset).toBeUndefined();
  });

  it("treats a price range as one chip however many bounds are set", () => {
    // Two chips for one range invites the reader to remove half a range.
    expect(browseFilterChips({ minPrice: 500, maxPrice: 5000 }).map((c) => c.key)).toEqual(["price"]);
    expect(browseFilterChips({ minPrice: 500 }).map((c) => c.key)).toEqual(["price"]);
    expect(browseFilterChips({ maxPrice: 5000 }).map((c) => c.key)).toEqual(["price"]);
  });

  it("removes both bounds when the price chip is removed", () => {
    const chip = browseFilterChips({ minPrice: 500, maxPrice: 5000 })[0]!;
    expect(chip.next.minPrice).toBeUndefined();
    expect(chip.next.maxPrice).toBeUndefined();
  });

  it("counts a minimum of zero as a range somebody set", () => {
    // "Free and up" is a bound, and `if (min)` steps straight over it.
    expect(browseFilterChips({ minPrice: 0 }).map((c) => c.key)).toEqual(["price"]);
  });

  it("labels the range with both bounds when both are set, and one when one is", () => {
    expect(browseFilterChips({ minPrice: 500, maxPrice: 5000 })[0]!.label).toEqual({
      key: "chipPriceRange",
      values: { min: 500, max: 5000 },
    });
    expect(browseFilterChips({ minPrice: 500 })[0]!.label).toEqual({
      key: "chipPriceMin",
      values: { min: 500 },
    });
    expect(browseFilterChips({ maxPrice: 5000 })[0]!.label).toEqual({
      key: "chipPriceMax",
      values: { max: 5000 },
    });
  });

  it("shows the search term as its own chip", () => {
    // Somebody who typed a word and then filtered has two narrowings, and
    // only one of them is visible in the sidebar.
    expect(browseFilterChips({ q: "corte" })[0]).toMatchObject({
      key: "q",
      label: { key: "chipSearch", values: { term: "corte" } },
    });
  });

  it("does not offer the sort as a chip", () => {
    // An order is not a narrowing: removing it does not widen the result set,
    // and a chip that changes nothing about what is shown is a lie.
    expect(browseFilterChips({ sort: "newest" })).toEqual([]);
  });
});
