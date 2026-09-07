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

/**
 * The page draws two sort triggers — the heading's, which is `hidden lg:…`,
 * and the phone capsule's — so that a reader gets exactly one at any width.
 * They are the same control with the same options; a test that acts on the
 * first is acting on the sort.
 */
const sortTrigger = () => screen.getAllByRole("button", { name: /^Sort:/ })[0]!;

describe("ServicesBrowsePage", () => {
  it("states how many matched, not how many fit on this page", async () => {
    // The bug this whole chain of tasks started from: `items.length` is the
    // page size talking, and it told somebody with 40 matches that they had 24.
    renderPage("/services", { items: [service()], nextOffset: 24, total: 40 });
    expect(await screen.findByText("40 services found")).toBeInTheDocument();
    expect(screen.getByText("in all categories")).toBeInTheDocument();
  });

  it("counts the total even when the page in hand is three tiles long", async () => {
    // The same rule from the other side: what is drawn and what is counted are
    // different numbers, and the count is the server's.
    renderPage("/services", {
      items: [service({ id: "a" }), service({ id: "b" }), service({ id: "c" })],
      nextOffset: 24,
      total: 40,
    });
    expect(await screen.findByText("40 services found")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Corte de cabelo" })).toHaveLength(3);
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
    // Asked of the summary paragraph specifically: the scope clause reads
    // "in Maputo" and so does nothing else on the page, but a bare text query
    // could not tell them apart if it ever did.
    expect(screen.getByText("1 service found").closest("p")).toHaveTextContent("in Maputo");
  });

  it("heads the page with what was typed, which outranks the category", async () => {
    // The term is what the reader asked for; the category they are in is
    // already stated by the chip lit in the strip above. Ranking the category
    // first meant the heading answered a question nobody had asked.
    renderPage("/services?q=corte&city=Maputo&category=hair", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("corte in Maputo");
  });

  it("draws no button on a result at all — the tile is the link", async () => {
    // A blue "Book" repeated twenty-four times down a page competes with every
    // price on it and with the one button that matters, in the search bar.
    renderPage("/services", { items: [service()], nextOffset: null, total: 1 });
    await screen.findByRole("link", { name: "Corte de cabelo" });
    expect(screen.queryByRole("link", { name: /book/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /book/i })).toBeNull();
  });

  it("separates the phone's rows with a hairline the list draws, not the tile", async () => {
    // `divide-y` draws between children and never above the first, which is
    // the mockup's `.m-row:first-child{border-top:0}` for free — so unlike
    // `/providers`, no tile has to be told it is first. From `sm` the grid's
    // own white space separates them again and the hairline goes.
    const { container } = renderPage("/services", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    await screen.findByRole("link", { name: "Corte de cabelo" });
    const list = container.querySelector("article")!.closest("ul")!;
    expect(list.className).toContain("divide-y");
    expect(list.className).toContain("sm:divide-y-0");
    expect(list.className).toContain("grid-cols-1");
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
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(sortTrigger());

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
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(sortTrigger());
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
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(sortTrigger());
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Suggested" }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
  });

  it("shows what is narrowing the list on the pills themselves, each with the link that removes just it", async () => {
    // The chip row under the results bar is gone: an applied filter fills its
    // own pill and grows the × that takes it off, because two places showing
    // the same state was one place too many.
    const { container } = renderPage("/services?city=Maputo&paymentMode=hourly", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    await screen.findByRole("heading", { level: 1 });
    const summaries = [...container.querySelectorAll("summary")].map((s) => s.textContent);
    expect(summaries).toContain("Per hour");
    expect(summaries).toContain("Maputo");

    // Removing one keeps the other. A link built by hand at the call site only
    // ever remembers the parameters that call site knows about.
    const removals = screen
      .getAllByRole("link", { name: /^Remove / })
      .map((a) => a.getAttribute("href"));
    expect(removals).toContain("/services?paymentMode=hourly");
    expect(removals).toContain("/services?city=Maputo");
  });

  it("the search bar sits under the header and submits to this page", async () => {
    // The site's own bar — the landing hero's `ServiceSearch` — under the
    // header rather than inside it, and what it writes is this page's own
    // `?q=`. The page used to draw a search pill of its own in the header,
    // which is the inconsistency this replaced.
    const { router } = renderPage("/services", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    fireEvent.change(await screen.findByRole("searchbox"), { target: { value: "corte" } });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/services");
      expect(router.state.location.search).toEqual({ q: "corte" });
    });
  });

  it("the search bar shows the current term", async () => {
    // A results page whose search box is empty tells the reader they searched
    // for nothing, and a second search from it starts from scratch.
    renderPage("/services?q=barba", { items: [service()], nextOffset: null, total: 1 });
    expect(await screen.findByRole("searchbox")).toHaveValue("barba");
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

  it("marks no filter link as the current page just for removing a filter", async () => {
    // The same subset trap, now in three places. A filter's *active* option
    // links back to `/services` — an empty search, which is a subset of every
    // one — so the pill's row, the phone's quick chip and the sheet's row all
    // announced it as where you are.
    renderPage("/services?locationType=at_customer", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    // Two while the sheet is shut: the pill's option row and the phone's quick
    // chip, which offers this same narrowing in one tap. `SheetContent`
    // returns null until it is opened.
    const closed = await screen.findAllByRole("link", { name: "At your place" });
    expect(closed).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));

    // Three now, and all three must be clean.
    const options = screen.getAllByRole("link", { name: "At your place" });
    expect(options).toHaveLength(3);
    for (const option of options) expect(option).not.toHaveAttribute("aria-current");

    // The clear-all is the same trap wearing a different label, and the worst
    // case of it: its search is the *empty* one, a subset of every search
    // there is, so unguarded it announces "you are already here" on the one
    // link that changes the page most. Two copies — the pill bar's and the
    // sheet's — and both carry `EXACT_MATCH`.
    const clears = screen.getAllByRole("link", { name: "Clear all" });
    expect(clears).toHaveLength(2);
    for (const clear of clears) expect(clear).not.toHaveAttribute("aria-current");
  });

  it("sits the phone's floating controls above the bottom nav, not under it", async () => {
    // The one defect of the previous redesign that made a control dead rather
    // than ugly: `MobileNav` is `fixed bottom-0 z-40 md:hidden` and the bar was
    // `bottom-0 z-30`, so below `md` the nav painted over it completely — the
    // count, the sheet and every filter in it, unreachable on a phone, with
    // the whole suite green.
    renderPage("/services", { items: [service()], nextOffset: null, total: 1 });
    await screen.findByRole("heading", { level: 1 });
    const controls = screen.getByTestId("floating-controls");
    expect(controls.className).toContain("safe-area-inset-bottom");
    // The one that bites: a bare `bottom-0` is the capsule back under the nav.
    expect(controls.className.split(/\s+/)).not.toContain("bottom-0");
    // Both halves ride in it, so the phone gets one sort and not two.
    expect(within(controls).getByRole("button", { name: /^Filters/ })).toBeInTheDocument();
    expect(within(controls).getByRole("button", { name: /^Sort:/ })).toBeInTheDocument();
  });

  it("counts on the phone's control only what its sheet can take off, and offers a way to take them all off", async () => {
    // The count once included a city the sheet had no group for, so it read 2
    // over a sheet showing one control the reader could act on. It leaves the
    // typed term out for the same reason: the term is the header pill's, and
    // this sheet has no box for it.
    renderPage("/services?q=corte&city=Maputo&locationType=at_customer", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    const control = await screen.findByRole("button", { name: /^Filters/ });
    expect(control).toHaveTextContent("Filters · 2");

    fireEvent.click(control);
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(within(sheet).getByRole("link", { name: /Maputo/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(sheet).getByRole("link", { name: "At your place" })).toBeInTheDocument();
    // Clearing takes off what the sheet showed as on and keeps what it never
    // offered — the term survives.
    expect(within(sheet).getByRole("link", { name: "Clear all" })).toHaveAttribute(
      "href",
      "/services?q=corte",
    );
    // And the button says what it will do, rather than "Apply".
    expect(within(sheet).getByRole("button", { name: "Show 1 result" })).toBeInTheDocument();
  });

  it("does not close the filter sheet the moment somebody taps the price box", async () => {
    // The wrapper closed on any click inside it, including the one that puts
    // the cursor in "Min" — so the one filter in there that has to be typed
    // could not be typed at all.
    renderPage("/services", { items: [service()], nextOffset: null, total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: /^Filters/ }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    fireEvent.click(within(sheet).getByRole("textbox", { name: "Min" }));
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
  });

  it("warns, on the city group, that every city’s count includes the remote services", async () => {
    // `?city=…` matches "this city OR remote" — a remote service has no
    // geography to be excluded by — so the count beside a city is the city’s
    // own services plus every online listing on the platform. Without the
    // sentence, "Beira 12" over a town with one business reads as a wrong
    // number rather than as an honest one about a wider link.
    renderPage("/services", { items: [service()], nextOffset: null, total: 1 });
    const hint = await screen.findByText("Remote services appear under every city.");
    // On the city pill and not merely somewhere on the page: this is the one
    // group whose label overclaims, and the language group carries a hint of
    // its own beside it.
    const group = hint.closest("details");
    expect(group).not.toBeNull();
    expect(group).toHaveTextContent("City");
    expect(within(group!).getByRole("link", { name: /Beira/ })).toBeInTheDocument();
  });

  it("offers three one-tap narrowings on a phone, each of which taps off again", async () => {
    // The pills are a toolbar and a toolbar does not fit a thumb, so the phone
    // gets the two or three narrowings people actually use. A chip already on
    // links back to the same search without it.
    const { container } = renderPage("/services?paymentMode=fixed", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    await screen.findByRole("heading", { level: 1 });
    const chips = within(container).getByRole("list", { name: "Quick filters" });
    const fixed = within(chips).getByRole("link", { name: "Fixed price" });
    expect(fixed).toHaveAttribute("aria-pressed", "true");
    expect(fixed).toHaveAttribute("href", "/services");
    expect(within(chips).getByRole("link", { name: "At your place" })).toHaveAttribute(
      "href",
      "/services?locationType=at_customer&paymentMode=fixed",
    );
    // The ceiling is money, so the chip says it as money — the same formatter
    // and locale the tiles print their prices with, not a bare 1000 the reader
    // has to guess a currency for. Matched by pattern because `Intl` separates
    // the currency from the amount with a no-break space, which is correct and
    // is not the character anybody types into a test.
    expect(within(chips).getByRole("link", { name: /^Up to MZN\s1,000$/ })).toHaveAttribute(
      "href",
      "/services?paymentMode=fixed&maxPrice=1000",
    );
  });

  it("does not offer three ways to narrow a platform with nothing on it", async () => {
    // Chips under "No services published yet" are work that cannot help. They
    // stay on an empty *search*, where they are one tap out of it.
    renderPage("/services", { items: [], nextOffset: null, total: 0 });
    await screen.findByText("No services published yet");
    expect(screen.queryByRole("list", { name: "Quick filters" })).toBeNull();

    renderPage("/services?city=Maputo", { items: [], nextOffset: null, total: 0 });
    expect(
      await screen.findByRole("list", { name: "Quick filters" }),
    ).toBeInTheDocument();
  });

  it("offers the same orders at both widths, out of one list", async () => {
    // Two triggers, one list: adding a fourth order to a copy in the page and
    // not to the copy in the floating control would leave the phone quietly
    // offering three.
    const { router } = renderPage("/services", {
      items: [service()],
      nextOffset: null,
      total: 1,
    });
    await screen.findByRole("heading", { level: 1 });
    const triggers = screen.getAllByRole("button", { name: /^Sort:/ });
    expect(triggers).toHaveLength(2);

    const ordersIn = (trigger: HTMLElement) => {
      fireEvent.click(trigger);
      const names = screen.getAllByRole("menuitemradio").map((row) => row.textContent);
      // Shut again, so the next menu opened is the only one in the document.
      fireEvent.click(trigger);
      return names;
    };
    const heading = ordersIn(triggers[0]!);
    expect(heading).toEqual(["Suggested", "Newest", "Price"]);
    expect(ordersIn(triggers[1]!)).toEqual(heading);

    // And the phone's copy writes the URL the same way — through
    // `browseSearch`, so every other filter survives the reorder.
    fireEvent.click(triggers[1]!);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Price" }));
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ sort: "price" });
    });
  });

  it("offers no numbered pages when everything matched fits on one", async () => {
    // A pager reading "page 1 of 1" makes an eight-result search look truncated.
    renderPage("/services", { items: [service()], nextOffset: null, total: 1 });
    await screen.findByRole("link", { name: "Corte de cabelo" });
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
