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

  it("offers five orders in the dropdown, with only the one in force checked", async () => {
    // A dropdown, not five links — the clearest sign the two browse pages had
    // drifted apart, and now the shape both share again.
    renderPage("/providers?sort=rating", { items: [provider()], total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: "Sort" }));

    expect(screen.getByRole("menuitemradio", { name: "Suggested" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemradio", { name: "Best rated" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Most reviewed" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemradio", { name: "Price" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemradio", { name: "Name (A–Z)" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("writes the chosen order to the URL and resets to the first page", async () => {
    const { router } = renderPage("/providers?sort=rating&offset=40", {
      items: [provider()],
      total: 96,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Sort" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Price" }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ sort: "price" });
    });
  });

  it("writes the default order as an absent parameter, never sort=relevance", async () => {
    // `/providers` and `/providers?sort=relevance` would otherwise be one page
    // at two URLs — two cache entries, and two things for a crawler to index.
    const { router } = renderPage("/providers?sort=rating", {
      items: [provider()],
      total: 1,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Sort" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Suggested" }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
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
    renderPage("/providers", { items: [provider()], total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: /City/ }));
    expect(screen.getByRole("combobox", { name: "City" }).tagName).toBe("INPUT");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
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

  it("does not run a search while the reader is still typing or arrowing through cities", async () => {
    // Typing and highlighting are `CitySelect`'s own business, not a search
    // trigger — only picking a city or submitting the form is. A native
    // select could not make that distinction: it fired `change` on every
    // arrow key on Windows and Firefox, which would have run a search per
    // city passed.
    const { router } = renderPage("/providers", { items: [provider()], total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: /City/ }));
    const box = screen.getByRole("combobox", { name: "City" });
    fireEvent.change(box, { target: { value: "Maputo" } });
    fireEvent.keyDown(box, { key: "ArrowDown" });
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

  it("marks only the category actually in force as the current page", async () => {
    // TanStack matches a link's search as a *subset* of the current one, so
    // "All" — whose search is empty — was announced as the page you are on the
    // moment anything else was set. `EXACT_MATCH` makes it an equality test.
    // The sort's own active state is not this trap's business any more: it is
    // a menu row's `aria-checked`, decided by comparing the URL to a value
    // this page already holds, not a `<Link>` guessing from a subset match.
    renderPage("/providers?sort=rating&category=hair", { items: [provider()], total: 1 });
    expect(await screen.findByRole("link", { name: /All/ })).not.toHaveAttribute("aria-current");
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
    renderPage("/providers", { items: [provider()], total: 1 });
    const row = await screen.findByRole("button", { name: /Business or professional name.*Anywhere/ });
    expect(row.className).toContain("md:hidden");
    expect(screen.getByRole("search").className).toContain("hidden");

    fireEvent.click(row);
    const sheet = screen.getByRole("dialog", { name: "What are you looking for?" });
    expect(within(sheet).getByRole("searchbox", { name: "Provider" })).toBeInTheDocument();
    expect(within(sheet).getByRole("combobox", { name: "City" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Show results" })).toBeInTheDocument();
  });

  it("carries both of the sheet's fields into the URL, and closes behind itself", async () => {
    // The same `apply` the card uses, for the same reason: two copies of it is
    // how one of the two starts dropping a parameter the other keeps. And a
    // sheet left open over the results it just changed hides the answer.
    const { router } = renderPage("/providers", { items: [provider()], total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: /Business or professional name.*Anywhere/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Provider" }), {
      target: { value: "mavalane" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "City" }), {
      target: { value: "Beira" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Show results" }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ q: "mavalane", city: "Beira" });
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
    renderPage("/providers", { items: [provider()], total: 1 });
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
    renderPage("/providers?city=Maputo&providerType=individual", {
      items: [provider()],
      total: 1,
    });
    const bar = await screen.findByRole("button", { name: /Filters/ });
    expect(bar).toHaveTextContent("2");

    fireEvent.click(bar);
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(within(sheet).getByRole("link", { name: /Maputo/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByRole("link", { name: "A person" })).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "Clear all" })).toHaveAttribute(
      "href",
      "/providers",
    );
  });

  it("does not close the filter sheet the moment somebody taps the price box", async () => {
    // The wrapper closed on any click inside it, including the one that puts
    // the cursor in "Min" — so the one filter in there that has to be typed
    // could not be typed at all.
    renderPage("/providers", { items: [provider()], total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: /Filters/ }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    fireEvent.click(within(sheet).getByRole("textbox", { name: "Min" }));
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
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
