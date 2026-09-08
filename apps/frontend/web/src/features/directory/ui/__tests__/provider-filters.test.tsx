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

/**
 * The category filter reads the same list the pages do. Stubbed here for the
 * same reason the cities are: this suite renders the bar on its own, outside
 * the query client the real page provides.
 *
 * Nine of them, which is under `OPTION_SEARCH_THRESHOLD` — the searchable case
 * has its own test that pushes the list past it.
 */
vi.mock("@/features/landing/viewmodel/use-categories", () => ({
  CATEGORY_FILTER_LIMIT: 48,
  useCategoryPreview: () => ({
    data: {
      items: [
        { id: "1", code: "plumbing", name: "Canalização", icon: null, imageUrl: null },
        { id: "2", code: "electrical", name: "Electricidade", icon: null, imageUrl: null },
        { id: "3", code: "cleaning", name: "Limpeza de casa", icon: null, imageUrl: null },
      ],
    },
  }),
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
    // keeps `q` — the typed term is the search bar's to clear, up under the
    // header, not this bar's, so "Clear all" here must not also wipe it.
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

  it("wears navy on the price form's OK, not the kit's default blue", async () => {
    // `--color-primary` is the site's own blue — the header's sign-in and
    // sign-in, and the search bar's button — and nothing in the results wears
    // it; the kit's default `Button` variant is that blue, and this submit is
    // drawn twice, in the price pill's popover and in the sheet.
    await renderFilters({});
    const ok = screen.getByRole("button", { name: "OK" });
    expect(ok.className).toContain("--color-navy-surface");
    expect(ok.className).not.toContain("--color-primary");
  });
  /**
   * The category was a strip of chips above the results until it became the
   * bar's first pill. Three things have to hold for it to be a filter like
   * the five beside it rather than a strip in a new shape.
   */
  it("leads the bar with the category, filled with the name and not the code", async () => {
    const { container } = await renderFilters({ category: "plumbing" });

    const summaries = [...container.querySelectorAll("summary")].map((s) => s.textContent);
    // First, because every other pill divides a set this one already chose.
    expect(summaries[0]).toContain("Canalização");
    // The name the reader picked, never the code the URL carries.
    expect(summaries[0]).not.toContain("plumbing");
  });

  it("takes only the category off with the category pill's ×", async () => {
    await renderFilters({ category: "plumbing", city: "Maputo", minRating: 4 });

    const clear = screen.getByRole("link", { name: "Remove Category" });
    expect(clear).toHaveAttribute("href", expect.stringContaining("city=Maputo"));
    expect(clear).toHaveAttribute("href", expect.stringContaining("minRating=4"));
    expect(clear.getAttribute("href")).not.toContain("category");
  });

  it("offers no × on the category pill when no category is chosen", async () => {
    await renderFilters({ city: "Maputo" });
    expect(screen.queryByRole("link", { name: "Remove Category" })).toBeNull();
  });

  /**
   * Nine categories on the platform today, which is under
   * `OPTION_SEARCH_THRESHOLD` — the panel is a plain list until an
   * administrator adds enough of them to make one worth scanning.
   * `searchable-options.test.tsx` owns the searching itself.
   */
  it("lists the categories plainly while there are few of them", async () => {
    await renderFilters({});

    expect(screen.queryByRole("searchbox", { name: "Search categories" })).toBeNull();
    expect(screen.getByRole("link", { name: "Canalização" })).toBeInTheDocument();
    // And the row that clears the group, marked as the one in force.
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("MobileProviderFilters", () => {
  it("counts the filters it can take off, and not the term the search bar owns", async () => {
    // The count sits on a control whose sheet has no box for the term: a
    // number that included `q` would put a "2" over a sheet offering one
    // thing the reader can act on, which is the bug the old badge had with
    // `city`. See R18 — the term is the search bar's to clear.
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
  it("leads the phone's sheet with the category, now that the strip is gone", async () => {
    // The pills are desktop-only, so the sheet is the phone's only way to a
    // category once the strip above the results went away.
    await renderMobile({}, 12);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));

    const sheet = screen.getByRole("dialog", { name: "Filters" });
    const groups = [...sheet.querySelectorAll("h3")].map((h) => h.textContent);
    expect(groups[0]).toBe("Category");
    expect(within(sheet).getByRole("link", { name: "Electricidade" })).toBeInTheDocument();
  });

  it("counts a chosen category on the phone's own control", async () => {
    // The chips beside the results carry no category — the heading already
    // names it — but the badge counts what the sheet can take off.
    await renderMobile({ category: "plumbing" });
    expect(screen.getByRole("button", { name: /^Filters/ })).toHaveTextContent("Filters · 1");
  });
});
