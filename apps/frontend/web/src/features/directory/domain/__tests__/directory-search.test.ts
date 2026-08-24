import { describe, expect, it } from "vitest";
import {
  activeDirectoryFilterCount,
  directorySearch,
  type DirectorySearch,
} from "../directory-search";

/**
 * Every control on the directory is a link to the same route with a different
 * search object. Built by hand, each of those only ever remembered the
 * parameters its own component knew about — the band dropped the sidebar's
 * filter, the sidebar dropped the sort. This is the one function that decides
 * it for all of them, so it is tested rather than trusted.
 */
describe("directorySearch", () => {
  const current: DirectorySearch = { q: "canaliza", city: "Maputo", sort: "rating", offset: 40 };

  it("keeps everything it was not asked to change", () => {
    expect(directorySearch(current, { category: "plumbing" })).toEqual({
      q: "canaliza",
      city: "Maputo",
      category: "plumbing",
      sort: "rating",
    });
  });

  it("resets the page on any change but the page itself", () => {
    // Page 3 of one category is usually past the end of another, so a reader
    // who changed a filter would land on an empty page having asked for a full
    // one.
    expect(directorySearch(current, { city: "Matola" }).offset).toBeUndefined();
  });

  it("keeps the page when the page is what changed", () => {
    expect(directorySearch(current, { offset: 60 }).offset).toBe(60);
  });

  it("omits an empty value rather than writing it out", () => {
    // `/providers` and `/providers?q=&offset=0` are one page, and two URLs for
    // one page are two cache entries and two things for a crawler to index.
    const cleared = directorySearch(current, { q: "", city: undefined, sort: undefined });
    expect(cleared).toEqual({});
    expect("q" in cleared).toBe(false);
  });

  it("keeps a price bound of zero", () => {
    // `!= null`, not truthiness: a minimum of 0 is a bound the reader set, and
    // dropping it would quietly widen their search back out.
    expect(directorySearch({}, { minPrice: 0 })).toEqual({ minPrice: 0 });
  });

  it("writes `verified` only when it is on", () => {
    expect(directorySearch({}, { verified: true })).toEqual({ verified: true });
    // `verified=false` and no `verified` at all are the same page.
    expect(directorySearch({ verified: true }, { verified: false })).toEqual({});
  });
});

describe("activeDirectoryFilterCount", () => {
  it("counts a price range once, however many of its bounds are set", () => {
    // Counting the bounds separately shows "2" for a single range.
    expect(activeDirectoryFilterCount({ minPrice: 100 })).toBe(1);
    expect(activeDirectoryFilterCount({ minPrice: 100, maxPrice: 900 })).toBe(1);
  });

  it("does not count the category", () => {
    // On a phone the band is still on screen above the results, so counting it
    // would badge something the reader can already see and clear.
    expect(activeDirectoryFilterCount({ category: "plumbing" })).toBe(0);
  });

  it("counts each of the others once", () => {
    expect(
      activeDirectoryFilterCount({
        q: "x",
        city: "Maputo",
        providerType: "individual",
        minRating: 4,
        verified: true,
        maxPrice: 900,
      }),
    ).toBe(6);
  });

  it("is zero for an untouched page", () => {
    expect(activeDirectoryFilterCount({})).toBe(0);
    // A sort is an ordering, not a narrowing — badging it would tell a reader
    // they had filtered something when they had not.
    expect(activeDirectoryFilterCount({ sort: "rating", offset: 20 })).toBe(0);
  });
});
