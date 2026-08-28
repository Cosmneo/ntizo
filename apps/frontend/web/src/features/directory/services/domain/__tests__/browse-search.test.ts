import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  browseSearch,
} from "@/features/directory/services/domain/browse-search";

/**
 * What survives when a reader changes one thing about the browse.
 *
 * Worth its own tests because the alternative — every link rebuilding the
 * search object by hand — is how the band came to drop the sidebar's filter
 * and the sidebar came to drop the sort: each link only remembered the
 * parameters its own component knew about. A reader who searched, filtered
 * and then clicked a category silently lost two of the three.
 */
describe("browseSearch", () => {
  it("keeps every other narrowing when one changes", () => {
    expect(
      browseSearch(
        { category: "hair", locationType: "remote", q: "corte", sort: "newest" },
        { category: "beauty" },
      ),
    ).toEqual({ category: "beauty", locationType: "remote", q: "corte", sort: "newest" });
  });

  it("drops a narrowing set to undefined, so a link can clear one", () => {
    // How clicking the active filter turns it off, without the sidebar
    // needing a separate "clear" control.
    expect(
      browseSearch({ category: "hair", locationType: "remote" }, { locationType: undefined }),
    ).toEqual({ category: "hair" });
  });

  it("returns to the first page whenever a narrowing changes", () => {
    // Page 4 of "hair" is not page 4 of "beauty" — it is usually past the end
    // of it, and the reader lands on an empty page having asked for a full one.
    expect(browseSearch({ category: "hair", offset: 72 }, { category: "beauty" })).toEqual({
      category: "beauty",
    });
  });

  it("keeps the page when the page is what changed", () => {
    expect(browseSearch({ category: "hair", q: "corte" }, { offset: 24 })).toEqual({
      category: "hair",
      q: "corte",
      offset: 24,
    });
  });

  it("omits an offset of zero rather than writing it into the URL", () => {
    // `/services` and `/services?offset=0` are the same page, and two URLs for
    // one page is two cache entries and two things for a crawler to index.
    expect(browseSearch({ category: "hair", offset: 24 }, { offset: 0 })).toEqual({
      category: "hair",
    });
  });

  it("drops a blank search rather than carrying an empty parameter", () => {
    expect(browseSearch({ category: "hair", q: "corte" }, { q: "" })).toEqual({
      category: "hair",
    });
  });

  it("changes nothing it was not asked to change", () => {
    const current = { category: "hair", locationType: "remote", q: "corte" } as const;
    expect(browseSearch(current, {})).toEqual(current);
  });

  it("carries the payment mode and provider type past a change to something else", () => {
    // The reason this function exists. Each control builds the whole search
    // object, so one that does not know about a filter drops it — the sort
    // link would silently clear "per hour" the moment somebody used it.
    const current = {
      category: "hair",
      paymentMode: "hourly",
      providerType: "organization",
    } as const;
    expect(browseSearch(current, { sort: "newest" })).toEqual({
      category: "hair",
      paymentMode: "hourly",
      providerType: "organization",
      sort: "newest",
    });
  });

  it("clears the payment mode when it is set back to undefined", () => {
    // How the sidebar's chips come off: clicking the active one clears it.
    expect(
      browseSearch(
        { category: "hair", paymentMode: "quote" },
        { paymentMode: undefined },
      ),
    ).toEqual({ category: "hair" });
  });

  it("returns to the first page when a new filter narrows the list", () => {
    expect(
      browseSearch({ offset: 48 }, { providerType: "individual" }),
    ).toEqual({ providerType: "individual" });
  });

  it("carries the city past a change to the category", () => {
    // A city chip and a category link are two different controls on the same
    // page — one should not clear the other.
    expect(browseSearch({ city: "Maputo", category: "hair" }, { category: "beauty" })).toEqual({
      city: "Maputo",
      category: "beauty",
    });
  });
});

/**
 * The number on the phone's filter button, and the twin of
 * `activeDirectoryFilterCount`.
 *
 * A badge is a promise that opening the sheet shows you what it counted. It
 * broke that promise once already — the count grew a `city` while the sheet
 * had no city group at all — so what it counts is tested rather than trusted.
 */
describe("activeFilterCount", () => {
  it("counts a price range once, however many of its bounds are set", () => {
    // Counting the bounds separately shows "2" for a single range.
    expect(activeFilterCount({ minPrice: 100 })).toBe(1);
    expect(activeFilterCount({ minPrice: 100, maxPrice: 900 })).toBe(1);
  });

  it("does not count the category", () => {
    // On a phone the rail is still on screen above the results, so counting it
    // would badge something the reader can already see and clear.
    expect(activeFilterCount({ category: "plumbing" })).toBe(0);
  });

  it("counts each of the others once", () => {
    expect(
      activeFilterCount({
        q: "x",
        city: "Maputo",
        locationType: "remote",
        paymentMode: "hourly",
        providerType: "individual",
        language: "pt-MZ",
        maxPrice: 900,
      }),
    ).toBe(7);
  });

  it("is zero for an untouched page", () => {
    expect(activeFilterCount({})).toBe(0);
    // A sort is an ordering, not a narrowing — badging it would tell a reader
    // they had filtered something when they had not.
    expect(activeFilterCount({ sort: "newest", offset: 24 })).toBe(0);
  });
});
