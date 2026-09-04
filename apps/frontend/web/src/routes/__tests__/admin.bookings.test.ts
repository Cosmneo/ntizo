import { describe, expect, it } from "vitest";
import { parseAdminQueueSearch } from "@/features/admin/bookings/domain/queue-search";
import { Route } from "../admin/bookings";

/**
 * That the queue's URL rule is *mounted*, not merely written.
 *
 * `parseAdminQueueSearch` has its own unit tests, and they would pass whether
 * or not any route ever called it — which is exactly what happened before it
 * was extracted: the rule sat inline in this route, the page's test harness
 * carried a copy, and deleting the route's rule outright left the whole suite
 * green. A rule nothing enforces is the same defect as a page nothing links
 * to.
 *
 * Asserted by identity rather than by behaviour: a route that re-implemented
 * the same checks would satisfy any input/output assertion while quietly
 * becoming a second copy to keep in step, and one copy is the whole point.
 *
 * The real `Route` object, imported from the route file the generator picks
 * up — see `admin.support.$threadId.test.tsx` on why the real object matters.
 */
describe("/admin/bookings", () => {
  it("validates its search with the one rule that has tests", () => {
    expect(Route.options.validateSearch).toBe(parseAdminQueueSearch);
  });

  it("renders the queue", () => {
    expect(Route.options.component).toBeDefined();
  });
});
