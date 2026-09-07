import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

const { MobileServiceFilters, ServiceFilters } = await import("../service-filters");

async function renderIn(node: ReactNode) {
  const root = createRootRoute({ component: () => <>{node}</> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(<RouterProvider router={router} />);
}

const renderFilters = (current: BrowseSearch) => renderIn(<ServiceFilters current={current} />);

const renderMobile = (current: BrowseSearch, total = 0) =>
  renderIn(<MobileServiceFilters current={current} total={total} />);

describe("ServiceFilters", () => {
  it("shows an applied filter's option as its pill's label, and its × removes just that filter", async () => {
    const { container } = await renderFilters({
      locationType: "at_customer",
      paymentMode: "hourly",
      q: "corte",
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

    // The clear-all is on because a facet is narrowing the list, and it
    // keeps `q` — the typed term is the header search pill's to clear, not
    // this bar's, so "Clear all" here must not also wipe it.
    const clearAll = screen.getByRole("link", { name: "Clear all" });
    expect(clearAll.getAttribute("href")).toContain("q=corte");
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

  it("offers no clear-all for a typed term alone, because the bar does not narrow on it", async () => {
    await renderFilters({ q: "corte" });
    expect(screen.queryByRole("link", { name: "Clear all" })).toBeNull();
  });

  it("says which language the language pill means, as the sheet already did", async () => {
    // "Listing language" reads two ways and the wrong one — the language the
    // provider speaks — is the one a reader actually wants. The sheet has
    // said which since it was built; the pill said nothing, so one filter
    // meant two things at two widths.
    const { container } = await renderFilters({});
    const hint = screen.getAllByText(
      "Which languages this listing is written in — not what the provider speaks.",
    )[0]!;
    expect(container.contains(hint)).toBe(true);
    const group = hint.closest("details");
    expect(group).toHaveTextContent("Listing language");
  });

  it("wears navy on the price form's OK, not the kit's default blue", async () => {
    // `--color-primary` is spent on the header's search button and nothing
    // else on this page; the kit's default `Button` variant is that blue, and
    // this submit is drawn twice — in the pill's popover and in the sheet.
    await renderFilters({});
    const ok = screen.getByRole("button", { name: "OK" });
    expect(ok.className).toContain("--color-navy-surface");
    expect(ok.className).not.toContain("--color-primary");
  });
});

describe("MobileServiceFilters", () => {
  it("counts the filters it can take off, and not the term the pill owns", async () => {
    // The count sits on a control whose sheet has no box for the term: a
    // number that included `q` would put a "2" over a sheet offering one
    // thing the reader can act on, which is the bug the old badge had with
    // `city`. See R18 — the term is the header search pill's to clear.
    await renderMobile({ q: "corte", city: "Maputo" });
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
    await renderMobile({ locationType: "at_customer" }, 38);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));

    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(within(sheet).getByRole("button", { name: "Show 38 results" })).toBeInTheDocument();
    // And the sheet offers the same rows the pills do, with the chosen one
    // already marked — one definition, two placements.
    expect(within(sheet).getByRole("link", { name: "At your place" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
