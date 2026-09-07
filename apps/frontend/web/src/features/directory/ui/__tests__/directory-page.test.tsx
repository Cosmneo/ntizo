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
 * the same page with different copy, a different result shape and a different
 * pager step, and two test files that do not read alike are the first place
 * that stops being true.
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
    services: [],
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

/**
 * The page draws two sort triggers — the heading's, which is `hidden lg:…`,
 * and the phone capsule's — so that a reader gets exactly one at any width.
 * They are the same control with the same options; a test that acts on the
 * first is acting on the sort.
 */
const sortTrigger = () => screen.getAllByRole("button", { name: /^Sort:/ })[0]!;

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

  it("puts the heading under the strip, and names the place in the summary's scope", async () => {
    // The hero is gone: the `h1` is the first thing inside `main`, under the
    // category strip, rather than sitting in a tinted band above it.
    renderPage("/providers?city=Maputo", { items: [provider()], total: 1 });
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Providers in Maputo");
    expect(heading.closest("main")).not.toBeNull();
    // Asked of the summary paragraph specifically: the city pill beside it
    // says "Maputo" too, and a bare text query cannot tell them apart.
    expect(screen.getByText("1 business found").closest("p")).toHaveTextContent("in Maputo");
  });

  it("heads the page with the term when one is typed", async () => {
    // The term is what the reader asked for; the category they are in is
    // already stated, underlined, by the strip above.
    renderPage("/providers?q=estúdio", { items: [provider()], total: 1 });
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("estúdio");
  });

  it("shows what each business sells, with prices, inside the row", async () => {
    // The one thing the page this replaces could not say. Scoped to the chip:
    // the fixture's own `fromAmountMinor` is 80_000 too, so the side rail's
    // "from" price prints the identical string.
    renderPage("/providers", {
      items: [
        provider({
          services: [
            { name: "Corte com barba", amountMinor: 80_000, currency: "MZN", pricingMode: "fixed" },
          ],
        }),
      ],
      total: 1,
    });
    expect(await screen.findByText("Corte com barba")).toBeInTheDocument();
    // `formatHeadlinePrice(80_000, "MZN", "en-US")` renders "MZN 800" — the
    // currency leads in this locale, not the amount.
    expect(screen.getByText("Corte com barba").closest("li")).toHaveTextContent("MZN 800");
  });

  it("draws no button on a row at all — the row is the link", async () => {
    // A blue "View business" repeated twenty times down a page competes with
    // every price on it and with the one button that matters, in the header.
    // The destination is said inside the row's one link, as the tail of its
    // own accessible name, rather than as a second control to step past or —
    // as it was before — a sentence loose in the side column that a screen
    // reader met after the price, belonging to nothing.
    renderPage("/providers", { items: [provider()], total: 1 });
    const row = await screen.findByRole("link", { name: /Estúdio Mavalane/ });
    expect(screen.getAllByRole("link", { name: /Estúdio Mavalane/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /View business/i })).toBeNull();

    const destination = screen.getByText("View business");
    expect(row).toContainElement(destination);
    expect(destination.className).toContain("sr-only");
    expect(row).toHaveAccessibleName("Estúdio Mavalane View business");
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
    await screen.findByRole("heading", { level: 1 });
    // The order in force is part of what the trigger is *called*, with this
    // page's own copy in it — not only part of what it draws.
    expect(sortTrigger()).toHaveAccessibleName("Sort: Best rated");
    fireEvent.click(sortTrigger());

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
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(sortTrigger());
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Price" }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ sort: "price" });
    });
  });

  it("writes the default order as an absent parameter, never sort=relevance", async () => {
    // `/providers` and `/providers?sort=relevance` would otherwise be one page
    // at two URLs — two cache entries, and two things for a crawler to index.
    const { router } = renderPage("/providers?sort=rating", { items: [provider()], total: 1 });
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(sortTrigger());
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Suggested" }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
  });

  it("offers the same orders at both widths, out of one list", async () => {
    // Two triggers, one list: adding a sixth order to a copy in the page and
    // not to the copy in the floating control would leave the phone quietly
    // offering five.
    const { router } = renderPage("/providers", { items: [provider()], total: 1 });
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
    expect(heading).toEqual([
      "Suggested",
      "Best rated",
      "Most reviewed",
      "Price",
      "Name (A–Z)",
    ]);
    expect(ordersIn(triggers[1]!)).toEqual(heading);

    // And the phone's copy writes the URL the same way — through
    // `directorySearch`, so every other filter survives the reorder.
    fireEvent.click(triggers[1]!);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Price" }));
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ sort: "price" });
    });
  });

  it("shows what is narrowing the list on the pills themselves, each with the link that removes just it", async () => {
    // The chip row under the results bar is gone: an applied filter fills its
    // own pill and grows the × that takes it off, because two places showing
    // the same state was one place too many.
    const { container } = renderPage("/providers?city=Maputo&providerType=organization", {
      items: [provider()],
      total: 1,
    });
    await screen.findByRole("heading", { level: 1 });
    const summaries = [...container.querySelectorAll("summary")].map((s) => s.textContent);
    expect(summaries).toContain("An establishment");
    expect(summaries).toContain("Maputo");

    // Removing one keeps the other. A link built by hand at the call site only
    // ever remembers the parameters that call site knows about.
    const removals = screen
      .getAllByRole("link", { name: /^Remove / })
      .map((a) => a.getAttribute("href"));
    expect(removals).toContain("/providers?providerType=organization");
    expect(removals).toContain("/providers?city=Maputo");
  });

  it("shows what was searched in the header's pill, and opens a real box to change it", async () => {
    // The field is a button at rest because it *opens* something; what it
    // opens is itself. A text box that does nothing until you click it anyway
    // is a text box lying about being one.
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
    // pill's styling into its own popup and reads as a control from a
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
    // The pill composed its URL from what the URL already said, so a term that
    // had not been submitted first was dropped the moment the city changed:
    // type a name, pick Beira, get `?city=Beira` and no name at all.
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
    // behaviour. Reimplementing it is how the search ended up the only control
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

  it("marks no filter link as the current page just for removing a filter", async () => {
    // The same subset trap, now in three places. A filter's *active* option
    // links back to `/providers` — an empty search, which is a subset of every
    // one — so the pill's row, the phone's quick chip and the sheet's row all
    // announced it as where you are.
    renderPage("/providers?providerType=individual", { items: [provider()], total: 1 });
    // Two while the sheet is shut: the pill's option row and the phone's quick
    // chip, which offers this same narrowing in one tap. `SheetContent`
    // returns null until it is opened.
    const closed = await screen.findAllByRole("link", { name: "A person" });
    expect(closed).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));

    // Three now, and all three must be clean.
    const options = screen.getAllByRole("link", { name: "A person" });
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

  it("collapses the search pill to one row on a phone, and opens both fields in a sheet", async () => {
    // Two fields and a button in 360px is a control nobody completes. The pill
    // hides itself below `md` and this row takes the width — so the row and
    // the pill are never both on screen, which is why each carries its own
    // half of the breakpoint.
    renderPage("/providers", { items: [provider()], total: 1 });
    const row = await screen.findByRole("button", { name: "Change your search" });
    expect(row.className).toContain("md:hidden");
    expect(screen.getByRole("search").className).toContain("hidden");

    fireEvent.click(row);
    const sheet = screen.getByRole("dialog", { name: "What are you looking for?" });
    expect(within(sheet).getByRole("searchbox", { name: "Provider" })).toBeInTheDocument();
    expect(within(sheet).getByRole("combobox", { name: "City" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Show results" })).toBeInTheDocument();
  });

  it("carries both of the sheet's fields into the URL, and closes behind itself", async () => {
    // The same `apply` the pill uses, for the same reason: two copies of it is
    // how one of the two starts dropping a parameter the other keeps. And a
    // sheet left open over the results it just changed hides the answer.
    const { router } = renderPage("/providers", { items: [provider()], total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: "Change your search" }));
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

  it("sits the phone's floating controls above the bottom nav, not under it", async () => {
    // The one defect of the previous redesign that made a control dead rather
    // than ugly: `MobileNav` is `fixed bottom-0 z-40 md:hidden` and the bar was
    // `bottom-0 z-30`, so below `md` the nav painted over it completely — the
    // count, the sheet and every filter in it, unreachable on a phone, with
    // the whole suite green.
    renderPage("/providers", { items: [provider()], total: 1 });
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
    renderPage("/providers?q=mavalane&city=Maputo&providerType=individual", {
      items: [provider()],
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
    expect(within(sheet).getByRole("link", { name: "A person" })).toBeInTheDocument();
    // Clearing takes off what the sheet showed as on and keeps what it never
    // offered — the term survives.
    expect(within(sheet).getByRole("link", { name: "Clear all" })).toHaveAttribute(
      "href",
      "/providers?q=mavalane",
    );
    // And the button says what it will do, rather than "Apply".
    expect(within(sheet).getByRole("button", { name: "Show 1 result" })).toBeInTheDocument();
  });

  it("does not close the filter sheet the moment somebody taps the price box", async () => {
    // The wrapper closed on any click inside it, including the one that puts
    // the cursor in "Min" — so the one filter in there that has to be typed
    // could not be typed at all.
    renderPage("/providers", { items: [provider()], total: 1 });
    fireEvent.click(await screen.findByRole("button", { name: /^Filters/ }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    fireEvent.click(within(sheet).getByRole("textbox", { name: "Min" }));
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
  });

  it("offers four one-tap narrowings on a phone, each of which taps off again", async () => {
    // The pills are a toolbar and a toolbar does not fit a thumb, so the phone
    // gets the narrowings people actually use. A chip already on links back to
    // the same search without it.
    const { container } = renderPage("/providers?verified=true", {
      items: [provider()],
      total: 1,
    });
    await screen.findByRole("heading", { level: 1 });
    const chips = within(container).getByRole("list", { name: "Quick filters" });
    const verified = within(chips).getByRole("link", { name: "Verified only" });
    expect(verified).toHaveAttribute("aria-pressed", "true");
    expect(verified).toHaveAttribute("href", "/providers");
    // The threshold is a decimal, so it is written the way this reader writes
    // decimals — the same formatter the rating pill's own rows use.
    expect(within(chips).getByRole("link", { name: "4.5 or more" })).toHaveAttribute(
      "href",
      "/providers?minRating=4.5&verified=true",
    );
    expect(within(chips).getByRole("link", { name: "A person" })).toHaveAttribute(
      "href",
      "/providers?providerType=individual&verified=true",
    );
    expect(within(chips).getByRole("link", { name: "An establishment" })).toHaveAttribute(
      "href",
      "/providers?providerType=organization&verified=true",
    );
  });

  it("does not offer four ways to narrow a platform with nothing on it", async () => {
    // Chips under "No providers listed yet" are work that cannot help. They
    // stay on an empty *search*, where they are one tap out of it.
    renderPage("/providers", { items: [], total: 0 });
    await screen.findByText("No providers listed yet");
    expect(screen.queryByRole("list", { name: "Quick filters" })).toBeNull();

    renderPage("/providers?city=Maputo", { items: [], total: 0 });
    expect(await screen.findByRole("list", { name: "Quick filters" })).toBeInTheDocument();
  });

  it("offers no numbered pages when everything matched fits on one", async () => {
    // A pager reading "page 1 of 1" makes an eight-result search look truncated.
    renderPage("/providers", { items: [provider()], total: 1 });
    await screen.findByRole("link", { name: /Estúdio Mavalane/ });
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
