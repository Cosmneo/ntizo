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
    providerVerified: false,
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

  it("offers three orders in the dropdown, with only the one in force checked", async () => {
    renderPage("/services?sort=newest", { items: [service()], nextOffset: null, total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: "Sort" }));

    expect(screen.getByRole("menuitemradio", { name: "Suggested" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemradio", { name: "Newest" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Price" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("writes the chosen order to the URL and resets to the first page", async () => {
    const { router } = renderPage("/services?sort=newest&offset=48", {
      items: [service()],
      nextOffset: null,
      total: 96,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Sort" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Price" }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ sort: "price" });
    });
  });

  it("writes the default order as an absent parameter, never sort=default", async () => {
    // `/services` and `/services?sort=default` would otherwise be one page at
    // two URLs — two cache entries, and two things for a crawler to index.
    const { router } = renderPage("/services?sort=newest", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Sort" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Suggested" }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
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
    // `CitySelect` renders the list in its own popover, a sibling of the
    // combobox rather than a child of it — `<option>` inside `<select>` no
    // longer applies, so the options are found at the document root.
    expect(screen.getByRole("combobox", { name: "City" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Maputo" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Beira" })).toBeInTheDocument();
  });

  it("swaps in the styled combobox, open on the one click that revealed it", async () => {
    // The defect a screenshot caught: a raw `<select>` carries none of the
    // card's styling into its own popup and reads as a control from a
    // different application — and needs a second click besides, because
    // focusing a native select does not open its popup. `CitySelect` opens on
    // its own focus handler, so focusing it as it mounts makes the swap-in
    // itself the one click.
    renderPage("/services", { items: [service()], nextOffset: null, total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: /City/ }));
    expect(screen.getByRole("combobox", { name: "City" }).tagName).toBe("INPUT");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
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

  it("does not run a search while the reader is still typing or arrowing through cities", async () => {
    // Typing and highlighting are `CitySelect`'s own business, not a search
    // trigger — only picking a city or submitting the form is. A native
    // select could not make that distinction: it fired `change` on every
    // arrow key on Windows and Firefox, which would have run a search per
    // city passed.
    const { router } = renderPage("/services", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    fireEvent.click(await screen.findByRole("button", { name: /City/ }));
    const box = screen.getByRole("combobox", { name: "City" });
    fireEvent.change(box, { target: { value: "Maputo" } });
    fireEvent.keyDown(box, { key: "ArrowDown" });
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

  it("marks only the category actually in force as the current page", async () => {
    // TanStack matches a link's search as a *subset* of the current one, so
    // "All" — whose search is empty — was announced as the page you are on the
    // moment anything was set. `EXACT_MATCH` makes it an equality test. The
    // sort's own active state is not this trap's business any more: it is a
    // menu row's `aria-checked`, decided by comparing the URL to a value this
    // page already holds, not a `<Link>` guessing from a subset match.
    renderPage("/services?sort=newest&category=hair", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    expect(await screen.findByRole("link", { name: /All/ })).not.toHaveAttribute("aria-current");
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
    // The sidebar's is the only copy in the document until the bar is opened:
    // `SheetContent` returns null while closed, so a test that leaves it shut
    // is checking one link while its comment claims two.
    const closed = await screen.findAllByRole("link", { name: "At your place" });
    expect(closed).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));

    // Two now: the sidebar's, and the phone sheet's — both must be clean.
    const options = screen.getAllByRole("link", { name: "At your place" });
    expect(options).toHaveLength(2);
    for (const option of options) expect(option).not.toHaveAttribute("aria-current");

    // The clear-all is the same trap wearing a different label, and the worst
    // case of it: its search is the *empty* one, a subset of every search
    // there is, so unguarded it announces "you are already here" on the one
    // link that changes the page most. Three copies — the chip row's, the
    // sidebar's and the sheet's — and all three carry `EXACT_MATCH`.
    const clears = screen.getAllByRole("link", { name: "Clear all" });
    expect(clears).toHaveLength(3);
    for (const clear of clears) expect(clear).not.toHaveAttribute("aria-current");
  });

  it("collapses the search card to one row on a phone, and opens both fields in a sheet", async () => {
    // Two fields and a button in 360px is a control nobody completes. The card
    // hides itself below `md` and this takes the width — so the row and the
    // card are never both on screen, which is why each carries its own half of
    // the breakpoint.
    renderPage("/services", { items: [service()], nextOffset: null, total: 1 });
    const row = await screen.findByRole("button", { name: /What do you need done\?.*Anywhere/ });
    expect(row.className).toContain("md:hidden");
    expect(screen.getByRole("search").className).toContain("hidden");

    fireEvent.click(row);
    const sheet = screen.getByRole("dialog", { name: "What are you looking for?" });
    expect(within(sheet).getByRole("searchbox", { name: "Service" })).toBeInTheDocument();
    expect(within(sheet).getByRole("combobox", { name: "City" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Show results" })).toBeInTheDocument();
  });

  it("carries both of the sheet's fields into the URL, and closes behind itself", async () => {
    // The same `apply` the card uses, for the same reason: two copies of it is
    // how one of the two starts dropping a parameter the other keeps. And a
    // sheet left open over the results it just changed hides the answer.
    const { router } = renderPage("/services", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    fireEvent.click(await screen.findByRole("button", { name: /What do you need done\?.*Anywhere/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Service" }), {
      target: { value: "corte" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "City" }), {
      target: { value: "Beira" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Show results" }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ q: "corte", city: "Beira" });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sits the phone filter bar above the bottom nav, and back down at md", async () => {
    // The one defect of this redesign that made a control dead rather than
    // ugly: `MobileNav` is `fixed bottom-0 z-40 md:hidden` and the bar was
    // `bottom-0 z-30`, so below `md` the nav painted over it completely — the
    // badge, the sheet and every filter in it, unreachable on a phone, with
    // the whole suite green. The offset is `3.5rem` because that is the
    // `pb-14` the root reserves for the nav, plus the safe-area inset the nav
    // itself carries; at `md` the nav is gone and the bar goes back down.
    renderPage("/services", { items: [service()], nextOffset: null, total: 1 });
    const bar = (await screen.findByRole("button", { name: /Filters/ })).parentElement!;
    const classes = bar.className.split(/\s+/);
    expect(classes).toContain("bottom-[calc(3.5rem+env(safe-area-inset-bottom))]");
    expect(classes).toContain("md:bottom-0");
    // The one that bites: a bare `bottom-0` is the bar back under the nav.
    expect(classes).not.toContain("bottom-0");
  });

  it("offers every filter its badge counts, and a way to take them all off", async () => {
    // The badge counted `city` while the sheet had no city group at all, so it
    // read 2 over a sheet showing one control the reader could act on. The
    // sheet renders the sidebar's own groups now, and carries the clear-all
    // beside its title rather than floating under it.
    renderPage("/services?city=Maputo&locationType=at_customer", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    const bar = await screen.findByRole("button", { name: /Filters/ });
    expect(bar).toHaveTextContent("2");

    fireEvent.click(bar);
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(within(sheet).getByRole("link", { name: /Maputo/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByRole("link", { name: "At your place" })).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "Clear all" })).toHaveAttribute(
      "href",
      "/services",
    );
  });

  it("does not close the filter sheet the moment somebody taps the price box", async () => {
    // The wrapper closed on any click inside it, including the one that puts
    // the cursor in "Min" — so the one filter in there that has to be typed
    // could not be typed at all.
    renderPage("/services", { items: [service()], nextOffset: null, total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: /Filters/ }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    fireEvent.click(within(sheet).getByRole("textbox", { name: "Min" }));
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
  });

  it("warns, on the city group, that every city\u2019s count includes the remote services", async () => {
    // `?city=\u2026` matches "this city OR remote" \u2014 a remote service has no
    // geography to be excluded by \u2014 so the count beside a city is the city\u2019s
    // own services plus every online listing on the platform. Without the
    // sentence, "Beira 12" over a town with one business reads as a wrong
    // number rather than as an honest one about a wider link.
    renderPage("/services", { items: [service()], nextOffset: null, total: 1 });
    const hint = await screen.findByText("Remote services appear under every city.");
    // On the city group and not merely somewhere on the page: this is the one
    // group whose label overclaims, and the language group already carries a
    // hint of its own two groups below.
    const group = hint.closest("details");
    expect(group).not.toBeNull();
    expect(group).toHaveTextContent("City");
    expect(within(group!).getByRole("link", { name: /Beira/ })).toBeInTheDocument();
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
