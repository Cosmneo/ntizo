import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import type { DirectorySearch } from "@/features/directory/domain/directory-search";

/**
 * The same lightweight router stub `notification-bell-link.test.tsx` and
 * `service-row.test.tsx` use: every `<Link>` this component builds throws
 * outside a router, and there is nothing else here that needs one — `current`
 * is a plain prop, not a route search this harness has to parse.
 */
vi.mock("@/features/directory/viewmodel/use-directory", () => ({
  useProviderCities: () => [
    { city: "Maputo", count: 7 },
    { city: "Beira", count: 2 },
  ],
}));

const { MobileProviderFilters, ProviderFilters } = await import("../provider-filters");

async function renderIn(node: ReactNode) {
  const root = createRootRoute({ component: () => <>{node}</> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(<RouterProvider router={router} />);
}

const renderFilters = (current: DirectorySearch) => renderIn(<ProviderFilters current={current} />);

const renderMobile = (current: DirectorySearch, total = 0) =>
  renderIn(<MobileProviderFilters current={current} total={total} />);

describe("ProviderFilters", () => {
  it("shows an applied filter's option as its pill's label, and its × removes just that filter", async () => {
    const { container } = await renderFilters({
      providerType: "individual",
      minRating: 4,
      q: "mavalane",
    });
    // The "who provides it" pill fills with the chosen option, in place of
    // its own name — both on the closed pill's own summary and, unreached
    // before the reader opens it, on the option row now marked chosen inside.
    const summaries = [...container.querySelectorAll("summary")].map((s) => s.textContent);
    expect(summaries).toContain("A person");
    expect(summaries).not.toContain("Who provides it");

    const remove = screen.getByRole("link", { name: "Remove Who provides it" });
    const href = remove.getAttribute("href")!;
    expect(href).not.toContain("providerType");
    expect(href).toContain("minRating=4");

    // The clear-all is on because a facet is narrowing the list, and it
    // keeps `q` — the typed term is the header search pill's to clear, not
    // this bar's, so "Clear all" here must not also wipe it.
    const clearAll = screen.getByRole("link", { name: "Clear all" });
    expect(clearAll.getAttribute("href")).toContain("q=mavalane");
  });

  it("fills no pill and offers no clear-all when nothing is applied", async () => {
    const { container } = await renderFilters({});
    // No group's name has been replaced by a chosen option.
    const summaries = [...container.querySelectorAll("summary")].map((s) => s.textContent);
    expect(summaries).toContain("Rating");
    expect(summaries).toContain("Who provides it");
    expect(summaries).toContain("Verification");
    // No filter is on, so no pill carries a remove link and there is nothing
    // to clear all of.
    expect(screen.queryByRole("link", { name: /^Remove /i })).toBeNull();
    expect(screen.queryByText("Clear all")).toBeNull();
  });

  it("offers no clear-all for a typed term alone, because the bar does not narrow on it", async () => {
    await renderFilters({ q: "mavalane" });
    expect(screen.queryByRole("link", { name: "Clear all" })).toBeNull();
  });
});

describe("MobileProviderFilters", () => {
  it("counts the filters it can take off, and not the term the pill owns", async () => {
    // The count sits on a control whose sheet has no box for the term: a
    // number that included `q` would put a "2" over a sheet offering one
    // thing the reader can act on, which is the bug the old badge had with
    // `city`. See R18 — the term is the header search pill's to clear.
    await renderMobile({ q: "mavalane", city: "Maputo" });
    expect(screen.getByRole("button", { name: /^Filters/ })).toHaveTextContent("Filters · 1");
  });

  it("says nothing at all when nothing is narrowing the list", async () => {
    await renderMobile({});
    const control = screen.getByRole("button", { name: /^Filters/ });
    expect(control).toHaveTextContent("Filters");
    expect(control.textContent).not.toContain("·");
  });

  it("states the outcome on the sheet's button rather than saying 'Apply'", async () => {
    // A button that says "Apply" makes a reader tap it to find out what they
    // did; one that counts tells them before they commit, so they can loosen
    // a filter instead of narrowing to nothing.
    await renderMobile({ providerType: "individual" }, 38);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));

    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(within(sheet).getByRole("button", { name: "Show 38 results" })).toBeInTheDocument();
    // And the sheet offers the same rows the pills do, with the chosen one
    // already marked — one definition, two placements.
    expect(within(sheet).getByRole("link", { name: "A person" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
