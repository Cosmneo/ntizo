import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ProviderPublicDTO } from "@ntizo/shared";
import type { ProviderPageDTO } from "@ntizo/shared/read-models";
import type { DirectorySearch } from "@/features/directory/domain/directory-search";

/**
 * The page's wiring, not its shells.
 *
 * Each shell is tested where it lives; what can only go wrong here is what the
 * page hands them — the count it states, the narrowing it forwards, and which
 * of the two empty sentences it chooses. The twin of
 * `services-browse-page.test.tsx`, deliberately: the two pages are meant to be
 * the same page with different copy, and two test files that do not read alike
 * are the first place that stops being true.
 *
 * The viewmodel hooks are the seam, never a seeded `QueryClient`: the
 * `boundaries/dependencies` rule forbids a `ui/` file from importing `data/`,
 * test files included, and rightly — a ui component knows its hooks, not where
 * they store things.
 */
const state: {
  page: ProviderPageDTO;
  search: DirectorySearch | null;
} = {
  page: { items: [], total: 0 },
  search: null,
};

vi.mock("@/features/directory/viewmodel/use-directory", () => ({
  useDirectory: (search: DirectorySearch) => {
    state.search = search;
    return state.page;
  },
  useProviderCities: () => [
    { city: "Maputo", count: 7 },
    { city: "Beira", count: 2 },
  ],
}));

vi.mock("@/features/landing/viewmodel/use-categories", () => ({
  useCategoryPreview: () => ({
    data: { items: [{ id: "c1", code: "hair", name: "Hair & beauty", icon: "Scissors" }] },
  }),
}));

const { DirectoryPage } = await import("../directory-page");

function provider(over: Partial<ProviderPublicDTO> = {}): ProviderPublicDTO {
  return {
    id: "prov-1",
    name: "Estúdio Mavalane",
    slug: "estudio-mavalane",
    type: "organization",
    description: null,
    city: "Maputo",
    district: "Mavalane",
    country: "MZ",
    logoUrl: null,
    photoUrls: [],
    verified: true,
    ratingAverage: null,
    reviewCount: 0,
    categories: [{ code: "hair", name: "Hair & beauty" }],
    serviceCount: 6,
    fromAmountMinor: 80_000,
    fromCurrency: "MZN",
    ...over,
  };
}

function renderPage(url: string, page: ProviderPageDTO) {
  state.page = page;
  state.search = null;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const rootRoute = createRootRoute();
  const providersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/providers",
    // The real route validates; this stub only has to hand the component the
    // same object shape so the links it builds can be read back off the DOM.
    validateSearch: (search: Record<string, unknown>) => search,
    component: DirectoryPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([providersRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
    // Handed back so a test can read where a submission actually went. The
    // URL is the whole contract of this page; asserting on it is the only way
    // to catch a control that quietly drops a parameter.
    router,
  };
}

describe("DirectoryPage", () => {
  it("states how many matched, not how many fit on this page", async () => {
    // `items.length` is the page size talking, and with a page of 20 it told
    // somebody with 40 matches that they had 20.
    renderPage("/providers", { items: [provider()], total: 40 });
    expect(await screen.findByText("40 businesses found")).toBeInTheDocument();
    expect(screen.getByText("in all categories")).toBeInTheDocument();
  });

  it("forwards the whole search to the query, so the filters actually filter", async () => {
    renderPage("/providers?city=Maputo&providerType=individual", {
      items: [provider()],
      total: 1,
    });
    await screen.findByRole("heading", { level: 1 });
    expect(state.search?.city).toBe("Maputo");
    expect(state.search?.providerType).toBe("individual");
  });

  it("puts the heading in the hero, and names the place in the summary's scope", async () => {
    // The content column no longer holds a heading at all.
    renderPage("/providers?city=Maputo", { items: [provider()], total: 1 });
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Providers in Maputo",
    );
    // Asked of the summary paragraph specifically: the city chip beside it
    // reads "in Maputo" too, and a bare text query cannot tell them apart.
    expect(screen.getByText("1 business found").closest("p")).toHaveTextContent("in Maputo");
  });

  it("does not tell somebody who filtered that the platform is empty", async () => {
    // Two different sentences because they are two different situations.
    renderPage("/providers?city=Maputo", { items: [], total: 0 });
    expect(await screen.findByText("No matches")).toBeInTheDocument();
    expect(screen.queryByText("No providers listed yet")).not.toBeInTheDocument();
  });

  it("says the platform is empty only when nobody narrowed anything", async () => {
    renderPage("/providers", { items: [], total: 0 });
    expect(await screen.findByText("No providers listed yet")).toBeInTheDocument();
  });

  it("offers five orders, and writes the default as an absent parameter", async () => {
    // `/providers` and `/providers?sort=relevance` would otherwise be one page
    // at two URLs — two cache entries, and two things for a crawler to index.
    // Five links rather than the dropdown that was the clearest sign the two
    // browse pages had drifted apart.
    renderPage("/providers?sort=rating", { items: [provider()], total: 1 });
    expect(await screen.findByRole("link", { name: "Suggested" })).toHaveAttribute(
      "href",
      "/providers",
    );
    expect(screen.getByRole("link", { name: "Best rated" })).toHaveAttribute(
      "href",
      "/providers?sort=rating",
    );
    expect(screen.getByRole("link", { name: "Most reviewed" })).toHaveAttribute(
      "href",
      "/providers?sort=reviews",
    );
    expect(screen.getByRole("link", { name: "Price" })).toHaveAttribute(
      "href",
      "/providers?sort=price",
    );
    expect(screen.getByRole("link", { name: "Name (A–Z)" })).toHaveAttribute(
      "href",
      "/providers?sort=name",
    );
  });

  it("shows what is narrowing the list, each with the link that removes just it", async () => {
    renderPage("/providers?city=Maputo&providerType=organization", {
      items: [provider()],
      total: 1,
    });
    const chips = await screen.findByRole("list", { name: "Active filters" });
    expect(chips).toHaveTextContent("in Maputo");
    expect(chips).toHaveTextContent("An establishment");
    // Removing one keeps the other. A chip built by hand at the call site only
    // ever remembers the parameters that call site knows about.
    const removals = screen
      .getAllByRole("link", { name: "Remove filter" })
      .map((a) => a.getAttribute("href"));
    expect(removals).toContain("/providers?providerType=organization");
    expect(removals).toContain("/providers?city=Maputo");
  });

  it("shows what was searched in the hero, and opens a real box to change it", async () => {
    // The field is a button at rest because it *opens* something; what it
    // opens is itself.
    renderPage("/providers?q=mavalane", { items: [provider()], total: 1 });
    const field = await screen.findByRole("button", { name: /Provider.*mavalane/ });
    fireEvent.click(field);
    expect(screen.getByRole("searchbox", { name: "Provider" })).toHaveValue("mavalane");
  });

  it("offers the cities the server counted rather than a box to guess one into", async () => {
    // A typed place matching none of them is a search that silently returns
    // nothing, with no way for the reader to see why.
    renderPage("/providers", { items: [provider()], total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: /City/ }));
    const picker = screen.getByRole("combobox", { name: "City" });
    expect(within(picker).getByRole("option", { name: "Maputo" })).toBeInTheDocument();
    expect(within(picker).getByRole("option", { name: "Beira" })).toBeInTheDocument();
  });

  it("carries a typed term through a change to the other field", async () => {
    // Composing the URL from what the URL already said dropped a term that had
    // not been submitted first: type a name, pick Beira, get `?city=Beira` and
    // no name at all.
    const { router } = renderPage("/providers", { items: [provider()], total: 1 });

    fireEvent.click(await screen.findByRole("button", { name: /Provider/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Provider" }), {
      target: { value: "mavalane" },
    });
    fireEvent.click(screen.getByRole("button", { name: /City/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "City" }), {
      target: { value: "Beira" },
    });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ q: "mavalane", city: "Beira" });
    });
  });

  it("searches on a real submit, not on a hand-rolled key handler", async () => {
    // Enter inside a text field reaching the submit button is a browser
    // behaviour. Reimplementing it is how the card ended up the only control
    // on a page of links that did nothing before JavaScript ran.
    renderPage("/providers", { items: [provider()], total: 1 });
    const form = await screen.findByRole("search");
    expect(within(form).getByRole("button", { name: /Search/ })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("does not run a search while the reader is still arrowing through cities", async () => {
    // A native select fires `change` on every arrow key on Windows and
    // Firefox. Navigating from it would have run a search per city passed.
    const { router } = renderPage("/providers", { items: [provider()], total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: /City/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "City" }), {
      target: { value: "Maputo" },
    });
    expect(router.state.location.search).toEqual({});
  });

  it("closes an open field on Escape and hands focus back to its button", async () => {
    // The control the reader is standing on stops existing. Without this,
    // focus lands on <body> and a keyboard user is at the top of the document.
    renderPage("/providers", { items: [provider()], total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: /Provider/ }));
    const box = screen.getByRole("searchbox", { name: "Provider" });
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("searchbox", { name: "Provider" })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /Provider/ }));
    });
  });

  it("marks only the order and the category actually in force as the current page", async () => {
    // TanStack matches a link's search as a *subset* of the current one, so
    // "Suggested" and "All" — whose search is empty — were both announced as
    // the page you are on the moment anything was set. `EXACT_MATCH` makes it
    // an equality test.
    renderPage("/providers?sort=rating&category=hair", { items: [provider()], total: 1 });
    expect(await screen.findByRole("link", { name: "Suggested" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: /All/ })).not.toHaveAttribute("aria-current");
    // And the site header's own /providers link, which genuinely *is* this
    // page, still says so — the fix must not silence a true one.
    expect(screen.getByRole("link", { name: "Providers" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks no facet link as the current page just for removing a filter", async () => {
    // The same subset trap, in the two panels. A facet's *active* option links
    // back to `/providers` — an empty search, which is a subset of every one —
    // so both the sidebar and the phone sheet announced it as where you are.
    renderPage("/providers?providerType=individual", { items: [provider()], total: 1 });

    // The sidebar's is the only copy in the document until the bar is opened:
    // `SheetContent` returns null while closed, so a test that leaves it shut
    // is checking one link while its comment claims two.
    const closed = await screen.findAllByRole("link", { name: "A person" });
    expect(closed).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));

    // Two now: the sidebar's, and the phone sheet's — both must be clean.
    const options = screen.getAllByRole("link", { name: "A person" });
    expect(options).toHaveLength(2);
    for (const option of options) expect(option).not.toHaveAttribute("aria-current");
  });

  it("offers no numbered pages when everything matched fits on one", async () => {
    // A pager reading "page 1 of 1" makes an eight-result search look truncated.
    renderPage("/providers", { items: [provider()], total: 1 });
    await screen.findByRole("listitem");
    expect(screen.queryByRole("navigation", { name: "Pages" })).not.toBeInTheDocument();
  });

  it("numbers the pages off the total the server reported", async () => {
    // Twenty to a page, and no `nextOffset` on this read model — the pager
    // steps by the page size and stops where the total does.
    renderPage("/providers?offset=20", { items: [provider()], total: 96 });
    const pager = await screen.findByRole("navigation", { name: "Pages" });
    expect(pager).toHaveTextContent("5");
    // Scoped to the pager: the site header's own "Providers" link is the
    // current page too, and says so with the same attribute.
    expect(within(pager).getByRole("link", { current: "page" })).toHaveTextContent("2");
    expect(within(pager).getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/providers?offset=40",
    );
  });
});
