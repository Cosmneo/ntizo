import { describe, expect, it } from "vitest";
import { browseSearch } from "@/features/directory/services/domain/browse-search";

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
});
