import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import type { BrowseSearch } from "@/features/directory/services/domain/browse-search";

/**
 * The same lightweight router stub `notification-bell-link.test.tsx` and
 * `service-row.test.tsx` use: every `<Link>` this component builds throws
 * outside a router, and there is nothing else here that needs one — `current`
 * is a plain prop, not a route search this harness has to parse.
 */
vi.mock("@/features/directory/services/viewmodel/use-browse-services", () => ({
  useServiceCities: () => [
    { city: "Maputo", count: 7 },
    { city: "Beira", count: 2 },
  ],
}));

const { ServiceFilters } = await import("../service-filters");

async function renderFilters(current: BrowseSearch) {
  const root = createRootRoute({ component: () => <ServiceFilters current={current} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(<RouterProvider router={router} />);
}

describe("ServiceFilters", () => {
  it("shows an applied filter's option as its pill's label, and its × removes just that filter", async () => {
    const { container } = await renderFilters({
      locationType: "at_customer",
      paymentMode: "hourly",
    });
    // The payment pill fills with the chosen option, in place of its own
    // name — both on the closed pill's own summary and, unreached before the
    // reader opens it, on the option row now marked chosen inside.
    const summaries = [...container.querySelectorAll("summary")];
    expect(summaries.map((s) => s.textContent)).toContain("Per hour");
    expect(summaries.map((s) => s.textContent)).not.toContain("How you pay");

    const remove = screen.getByRole("link", { name: "Remove How you pay" });
    const href = remove.getAttribute("href")!;
    expect(href).not.toContain("paymentMode");
    expect(href).toContain("locationType=at_customer");
  });

  it("fills no pill and offers no clear-all when nothing is applied", async () => {
    const { container } = await renderFilters({});
    // No group's name has been replaced by a chosen option.
    const summaries = [...container.querySelectorAll("summary")].map((s) => s.textContent);
    expect(summaries).toContain("Where it happens");
    expect(summaries).toContain("How you pay");
    // No filter is on, so no pill carries a remove link and there is nothing
    // to clear all of.
    expect(screen.queryByRole("link", { name: /^Remove /i })).toBeNull();
    expect(screen.queryByText("Clear all")).toBeNull();
  });
});
