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
import type { ServiceDTO, ServicePageDTO } from "@ntizo/shared/read-models";
import type { BrowseNarrowing } from "@/features/directory/services/viewmodel/use-browse-services";

/**
 * The page's wiring, not its shells.
 *
 * Each shell is tested where it lives; what can only go wrong here is what the
 * page hands them — the count it states, the narrowing it forwards, and which
 * of the two empty sentences it chooses. All three have been wrong before.
 *
 * The viewmodel hooks are the seam, never a seeded `QueryClient`: the
 * `boundaries/dependencies` rule forbids a `ui/` file from importing `data/`,
 * test files included, and rightly — a ui component knows its hooks, not where
 * they store things. Same harness as `service-detail-page.test.tsx`.
 */
const state: {
  page: ServicePageDTO;
  narrowing: BrowseNarrowing | null;
} = {
  page: { items: [], nextOffset: null, total: 0 },
  narrowing: null,
};

vi.mock("@/features/directory/services/viewmodel/use-browse-services", () => ({
  useBrowseServices: (narrowing: BrowseNarrowing) => {
    state.narrowing = narrowing;
    return state.page;
  },
  useServiceCities: () => [
    { city: "Maputo", count: 7 },
    { city: "Beira", count: 2 },
  ],
}));

vi.mock("@/features/landing/viewmodel/use-categories", () => ({
  useCategoryPreview: () => ({
    data: { items: [{ id: "c1", code: "hair", name: "Hair & beauty", icon: "Scissors" }] },
  }),
}));

const { ServicesBrowsePage } = await import("../services-browse-page");

function service(over: Partial<ServiceDTO> = {}): ServiceDTO {
  return {
    id: "svc-1",
    providerId: "prov-1",
    providerName: "Estúdio Mavalane",
    providerSlug: "estudio-mavalane",
    providerType: "organization",
    providerRatingAverage: null,
    providerReviewCount: 0,
    categoryCode: "hair",
    categoryName: "Hair & beauty",
    name: "Corte de cabelo",
    description: null,
    locationType: "at_provider",
    bookingMode: "priced",
    imageUrls: [],
    defaultOption: {
      amountMinor: 80_000,
      currency: "MZN",
      durationMinutes: 45,
      minMinutes: null,
      stepMinutes: null,
      pricingMode: "fixed",
    },
    fromAmountMinor: 80_000,
    optionCount: 1,
    isFallback: false,
    ...over,
  };
}

function renderPage(url: string, page: ServicePageDTO) {
  state.page = page;
  state.narrowing = null;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const rootRoute = createRootRoute();
  const servicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/services",
    // The real route validates; this stub only has to hand the component the
    // same object shape so the links it builds can be read back off the DOM.
    validateSearch: (search: Record<string, unknown>) => search,
    component: ServicesBrowsePage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([servicesRoute]),
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

describe("ServicesBrowsePage", () => {
  it("states how many matched, not how many fit on this page", async () => {
    // The bug this whole chain of tasks started from: `items.length` is the
    // page size talking, and it told somebody with 40 matches that they had 24.
    renderPage("/services", { items: [service()], nextOffset: 24, total: 40 });
    expect(await screen.findByText("40 services found")).toBeInTheDocument();
    expect(screen.getByText("in all categories")).toBeInTheDocument();
  });

  it("forwards the city to the query, so the filter actually filters", async () => {
    // `city` was plumbed through the route, the search model, the hook and the
    // query key, and then not passed — a filter that changed the URL, the
    // heading and the chips while returning the same unfiltered list.
    renderPage("/services?city=Maputo", { items: [service()], nextOffset: null, total: 1 });
    await screen.findByRole("heading", { level: 1 });
    expect(state.narrowing?.city).toBe("Maputo");
  });

  it("names the place in the heading and in the summary's scope", async () => {
    renderPage("/services?city=Maputo", { items: [service()], nextOffset: null, total: 1 });
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Services ready to book in Maputo",
    );
    // Asked of the summary paragraph specifically: the city chip beside it
    // reads "in Maputo" too, and a bare text query cannot tell them apart.
    expect(screen.getByText("1 service found").closest("p")).toHaveTextContent("in Maputo");
  });

  it("does not tell somebody who filtered that the platform is empty", async () => {
    // Two different sentences because they are two different situations, and
    // `city` has to be in `isNarrowed` for the right one to be chosen.
    renderPage("/services?city=Maputo", { items: [], nextOffset: null, total: 0 });
    expect(
      await screen.findByText("Nothing matches what you are looking for."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No services published yet")).not.toBeInTheDocument();
  });

  it("says the platform is empty only when nobody narrowed anything", async () => {
    renderPage("/services", { items: [], nextOffset: null, total: 0 });
    expect(await screen.findByText("No services published yet")).toBeInTheDocument();
  });

  it("writes the default order as an absent parameter, never sort=default", async () => {
    // `/services` and `/services?sort=default` would otherwise be one page at
    // two URLs — two cache entries, and two things for a crawler to index.
    renderPage("/services?sort=newest", { items: [service()], nextOffset: null, total: 1 });
    expect(await screen.findByRole("link", { name: "Suggested" })).toHaveAttribute(
      "href",
      "/services",
    );
    expect(screen.getByRole("link", { name: "Newest" })).toHaveAttribute(
      "href",
      "/services?sort=newest",
    );
    expect(screen.getByRole("link", { name: "Price" })).toHaveAttribute(
      "href",
      "/services?sort=price",
    );
  });

  it("shows what is narrowing the list, each with the link that removes just it", async () => {
    renderPage("/services?city=Maputo&paymentMode=hourly", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    const chips = await screen.findByRole("list", { name: "Active filters" });
    expect(chips).toHaveTextContent("in Maputo");
    expect(chips).toHaveTextContent("Per hour");
    // Removing one keeps the other. A chip built by hand at the call site only
    // ever remembers the parameters that call site knows about.
    const removals = screen
      .getAllByRole("link", { name: "Remove filter" })
      .map((a) => a.getAttribute("href"));
    expect(removals).toContain("/services?paymentMode=hourly");
    expect(removals).toContain("/services?city=Maputo");
  });

  it("shows what was searched in the hero, and opens a real box to change it", async () => {
    // The field is a button at rest because it *opens* something; what it
    // opens is itself. A text box that does nothing until you click it anyway
    // is a text box lying about being one.
    renderPage("/services?q=corte", { items: [service()], nextOffset: null, total: 1 });
    const field = await screen.findByRole("button", { name: /Service.*corte/ });
    fireEvent.click(field);
    expect(screen.getByRole("searchbox", { name: "Service" })).toHaveValue("corte");
  });

  it("offers the cities the server counted rather than a box to guess one into", async () => {
    // A typed place matching none of them is a search that silently returns
    // nothing, with no way for the reader to see why.
    renderPage("/services", { items: [service()], nextOffset: null, total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: /City/ }));
    const picker = screen.getByRole("combobox", { name: "City" });
    expect(within(picker).getByRole("option", { name: "Maputo" })).toBeInTheDocument();
    expect(within(picker).getByRole("option", { name: "Beira" })).toBeInTheDocument();
  });

  it("carries a typed term through a change to the other field", async () => {
    // The card composed its URL from what the URL already said, so a term that
    // had not been submitted first was dropped the moment the city changed:
    // type "corte", pick Beira, get `?city=Beira` and no word at all.
    const { router } = renderPage("/services", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });

    fireEvent.click(await screen.findByRole("button", { name: /Service/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Service" }), {
      target: { value: "corte" },
    });
    fireEvent.click(screen.getByRole("button", { name: /City/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "City" }), {
      target: { value: "Beira" },
    });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ q: "corte", city: "Beira" });
    });
  });

  it("searches on a real submit, not on a hand-rolled key handler", async () => {
    // Enter inside a text field reaching the submit button is a browser
    // behaviour. Reimplementing it is how the card ended up the only control
    // on a page of links that did nothing before JavaScript ran.
    renderPage("/services", { items: [service()], nextOffset: null, total: 1 });
    const form = await screen.findByRole("search");
    expect(within(form).getByRole("button", { name: /Search/ })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("does not run a search while the reader is still arrowing through cities", async () => {
    // A native select fires `change` on every arrow key on Windows and
    // Firefox. Navigating from it would have run a search per city passed.
    const { router } = renderPage("/services", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    fireEvent.click(await screen.findByRole("button", { name: /City/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "City" }), {
      target: { value: "Maputo" },
    });
    expect(router.state.location.search).toEqual({});
  });

  it("closes an open field on Escape and hands focus back to its button", async () => {
    // The control the reader is standing on stops existing. Without this,
    // focus lands on <body> and a keyboard user is at the top of the document.
    renderPage("/services", { items: [service()], nextOffset: null, total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: /Service/ }));
    const box = screen.getByRole("searchbox", { name: "Service" });
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("searchbox", { name: "Service" })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /Service/ }));
    });
  });

  it("marks only the order and the category actually in force as the current page", async () => {
    // TanStack matches a link's search as a *subset* of the current one, so
    // "Suggested" and "All" — whose search is empty — were both announced as
    // the page you are on the moment anything was set. `EXACT_MATCH` makes it
    // an equality test.
    renderPage("/services?sort=newest&category=hair", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    expect(await screen.findByRole("link", { name: "Suggested" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: /All/ })).not.toHaveAttribute("aria-current");
    // And the site header's own /services link, which genuinely *is* this
    // page, still says so — the fix must not silence a true one.
    expect(screen.getByRole("link", { name: "Services" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks no facet or filter link as the current page just for removing a filter", async () => {
    // The same subset trap, in the two panels. A facet's *active* option links
    // back to `/services` — an empty search, which is a subset of every one —
    // so both the sidebar and the phone sheet announced it as where you are.
    renderPage("/services?locationType=at_customer", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    const options = await screen.findAllByRole("link", { name: "At your place" });
    // Two: the sidebar's, and the phone sheet's — both must be clean.
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) expect(option).not.toHaveAttribute("aria-current");
  });

  it("offers no numbered pages when everything matched fits on one", async () => {
    // A pager reading "page 1 of 1" makes an eight-result search look truncated.
    renderPage("/services", { items: [service()], nextOffset: null, total: 1 });
    await screen.findByRole("listitem");
    expect(screen.queryByRole("navigation", { name: "Pages" })).not.toBeInTheDocument();
  });

  it("numbers the pages off the total the server reported", async () => {
    renderPage("/services?offset=24", { items: [service()], nextOffset: 48, total: 96 });
    const pager = await screen.findByRole("navigation", { name: "Pages" });
    expect(pager).toHaveTextContent("4");
    // Scoped to the pager: the site header's own "Services" link is the
    // current page too, and says so with the same attribute.
    expect(within(pager).getByRole("link", { current: "page" })).toHaveTextContent("2");
  });
});
