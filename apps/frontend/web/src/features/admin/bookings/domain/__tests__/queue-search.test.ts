import { describe, expect, it } from "vitest";
import { parseAdminQueueSearch } from "../queue-search";

/**
 * The rule `routes/admin/bookings.tsx` passes as its `validateSearch`, tested
 * as the route's own and not as a copy of it.
 *
 * It was written out inline in the route with a duplicate in the page's test
 * harness, and the duplicate is what every assertion exercised: deleting the
 * whole rule from the real route left the entire suite green. One
 * implementation in `domain`, which a route and a test may both import, is
 * what makes it testable.
 */
describe("parseAdminQueueSearch: tab", () => {
  it("keeps the three the queue has", () => {
    expect(parseAdminQueueSearch({ tab: "unclosed" }).tab).toBe("unclosed");
    expect(parseAdminQueueSearch({ tab: "in_window" }).tab).toBe("in_window");
    expect(parseAdminQueueSearch({ tab: "disputed" }).tab).toBe("disputed");
  });

  it("drops anything else, so a typed URL cannot reach the wire", () => {
    // The backend enum-validates the same list; this is the client's half of
    // that contract, and what keeps `?tab=bogus` from becoming a request.
    expect(parseAdminQueueSearch({ tab: "bogus" }).tab).toBeUndefined();
    expect(parseAdminQueueSearch({ tab: "DISPUTED" }).tab).toBeUndefined();
    expect(parseAdminQueueSearch({ tab: "" }).tab).toBeUndefined();
    expect(parseAdminQueueSearch({ tab: 1 }).tab).toBeUndefined();
    expect(parseAdminQueueSearch({}).tab).toBeUndefined();
  });
});

describe("parseAdminQueueSearch: offset", () => {
  it("keeps a positive whole number", () => {
    expect(parseAdminQueueSearch({ offset: 20 }).offset).toBe(20);
    // The address bar hands strings, not numbers.
    expect(parseAdminQueueSearch({ offset: "40" }).offset).toBe(40);
  });

  it("treats zero as no offset, so the first page has one address", () => {
    expect(parseAdminQueueSearch({ offset: 0 }).offset).toBeUndefined();
    expect(parseAdminQueueSearch({ offset: "0" }).offset).toBeUndefined();
  });

  it("drops anything that is not a page of rows", () => {
    expect(parseAdminQueueSearch({ offset: -5 }).offset).toBeUndefined();
    expect(parseAdminQueueSearch({ offset: 1.5 }).offset).toBeUndefined();
    expect(parseAdminQueueSearch({ offset: "twenty" }).offset).toBeUndefined();
    expect(parseAdminQueueSearch({ offset: Infinity }).offset).toBeUndefined();
    expect(parseAdminQueueSearch({ offset: Number.MAX_SAFE_INTEGER + 2 }).offset).toBeUndefined();
    expect(parseAdminQueueSearch({}).offset).toBeUndefined();
  });
});
