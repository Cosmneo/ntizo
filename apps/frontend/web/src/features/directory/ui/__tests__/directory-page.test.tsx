import { afterEach, describe, expect, it, vi } from "vitest";
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
import * as client from "@/shared/lib/graphql/session-graphql";
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

/**
 * The session, signed out by default and switched on only by the tests about
 * the hearts.
 *
 * Mocked at `@/shared/hooks/use-session`, the one-line re-export, rather than
 * at `@/shared/lib/api/auth-client`, which also exports the `API_BASE_URL`
 * that `session-graphql.ts` imports. Signed out, `useFavouriteMarks` is
 * disabled and asks nothing, which is what keeps every other test in this
 * file free of a network call it never wanted.
 */
const session = vi.hoisted(() => ({ data: null as { user: { id: string } } | null }));
vi.mock("@/shared/hooks/use-session", () => ({
  useSession: () => ({ data: session.data }),
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

  /**
   * The heading gives a typed term priority over the category, but the
   * category is still filtering — so the clause under it must say so. Reusing
   * the heading's own values printed "in all categories" over a search inside
   * a category whose chip was lit two lines above.
   */
  it("names the category in the summary even when the term owns the heading", async () => {
    renderPage("/providers?category=hair&q=barba", { items: [provider()], total: 1 });
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("barba");
    expect(screen.getByText("1 business found").closest("p")).toHaveTextContent("in Hair & beauty");
    expect(screen.queryByText("in all categories")).not.toBeInTheDocument();
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
    // already stated by the chip lit in the strip above.
    renderPage("/providers?q=estúdio", { items: [provider()], total: 1 });
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("estúdio");
  });

  // `ProviderRow` used to show up to three of a business's services with
  // their prices, and its own description paragraph, in a rail a card has no
  // room for — both dropped with the row itself. See `ProviderCard`'s own
  // doc comment.

  it("draws no button on a card at all — the card is the link", async () => {
    // A blue "View business" repeated twenty times down a page competes with
    // every price on it and with the one button that matters, in the search
    // bar.
    renderPage("/providers", { items: [provider()], total: 1 });
    await screen.findByRole("link", { name: /Estúdio Mavalane/ });
    expect(screen.getAllByRole("link", { name: /Estúdio Mavalane/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /View business/i })).toBeNull();
    // `ProviderRow` closed its link with a screen-reader-only "View business"
    // / "View profile" suffix on its accessible name; the card carries no
    // such suffix, which is a real drop from the row and not merely a
    // rename — see `provider-card.test.tsx`.
    expect(screen.queryByText(/View business|View profile/)).toBeNull();
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

  it("the search bar sits under the header and submits to this page", async () => {
    // The site's own bar — the landing hero's `ServiceSearch`, pointed here —
    // under the header rather than inside it, and what it writes is this
    // page's own `?q=`. The page used to draw a search pill of its own in the
    // header, which is the inconsistency this replaced.
    const { router } = renderPage("/providers", { items: [provider()], total: 1 });
    const form = await screen.findByRole("search");
    // Under the header, which is half of what this case is called: the bar is
    // a band of the page, not a pill the header carries. `FOLLOWING` is "the
    // form comes after the header in document order".
    const header = screen.getByRole("banner");
    expect(header.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "mavalane" } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/providers");
      expect(router.state.location.search).toEqual({ q: "mavalane" });
    });
  });

  it("the search bar says it searches businesses, not services", async () => {
    // Its own accessible name, not the services one it inherits by default:
    // the placeholder tells the eye what to type and says nothing at all to a
    // screen reader, which announced "Search services" over this list.
    renderPage("/providers", { items: [provider()], total: 1 });
    expect(await screen.findByRole("searchbox")).toHaveAccessibleName("Search providers");
  });

  it("the search bar shows the current term", async () => {
    // A results page whose search box is empty tells the reader they searched
    // for nothing, and a second search from it starts from scratch.
    renderPage("/providers?q=mavalane", { items: [provider()], total: 1 });
    expect(await screen.findByRole("searchbox")).toHaveValue("mavalane");
  });

  it("searching from a narrowed list keeps the narrowing", async () => {
    // The bar is a control on this page like any other, so it changes one part
    // of the URL and keeps the rest. Submitting used to write `?q=` and
    // nothing else: a reader who had asked for verified businesses in Maputo
    // typed one name and was handed every business on the platform, with no
    // way to see what they had lost.
    const { router } = renderPage("/providers?verified=true&city=Maputo&offset=20", {
      items: [provider()],
      total: 1,
    });
    fireEvent.change(await screen.findByRole("searchbox"), { target: { value: "mavalane" } });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => {
      // And the page resets, like every other change that is not the page
      // itself: page two of the old term is past the end of the new one.
      expect(router.state.location.search).toEqual({
        verified: true,
        city: "Maputo",
        q: "mavalane",
      });
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
    // one — so the filter pill's row, the phone's quick chip and the sheet's
    // row all announced it as where you are.
    renderPage("/providers?providerType=individual", { items: [provider()], total: 1 });
    // Two while the sheet is shut: the filter pill's option row and the
    // phone's quick chip, which offers this same narrowing in one tap.
    // `SheetContent` returns null until it is opened.
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
    // typed term out for the same reason: the term belongs to the search bar
    // under the header, and this sheet has no box for it.
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

  /**
   * The hearts. The twin of the services page's own block, deliberately: the
   * two pages ask the same question about a different target type, and the
   * type riding along is the thing that must not be got wrong — a service
   * and a business may legitimately share an id.
   */
  describe("the favourite hearts", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      session.data = null;
    });

    /** Answers the documents this page can send, and refuses anything else by name. */
    function fakeServer(marked: string[] = []) {
      return vi.spyOn(client, "sessionGraphql").mockImplementation(async (query) => {
        const text = String(query);
        if (text.includes("favouriteMarked")) return { favouriteMarked: marked } as never;
        // The header's own `useCurrentUser`, which every page renders.
        if (text.includes("userMe")) return { userMe: null } as never;
        if (text.includes("favouriteQuickSave")) {
          return { favouriteQuickSave: { listIds: ["l-default"] } } as never;
        }
        if (text.includes("favouriteListMine")) {
          return {
            favouriteListMine: [
              {
                id: "l-default",
                name: null,
                isDefault: true,
                itemCount: 1,
                coverUrls: [],
              },
            ],
          } as never;
        }
        throw new Error(`the page asked something this fake server does not answer: ${text}`);
      });
    }

    const signIn = () => {
      session.data = { user: { id: "u1" } };
    };

    const marksCalls = (spy: ReturnType<typeof fakeServer>) =>
      spy.mock.calls.filter(([query]) => String(query).includes("favouriteMarked"));

    it("asks once for the whole page, as providers and not as services", async () => {
      signIn();
      const spy = fakeServer();
      renderPage("/providers", {
        items: [provider({ id: "a" }), provider({ id: "b", slug: "b" })],
        total: 2,
      });
      await screen.findAllByRole("button", { name: "Save" });

      expect(marksCalls(spy)).toHaveLength(1);
      expect(marksCalls(spy)[0]![1]).toEqual({
        input: { targetType: "provider", targetIds: ["a", "b"] },
      });
    });

    it("fills only the hearts the answer named", async () => {
      signIn();
      fakeServer(["b"]);
      renderPage("/providers", {
        items: [
          provider({ id: "a", name: "Estúdio Mavalane", slug: "a" }),
          provider({ id: "b", name: "Salão Nyeleti", slug: "b" }),
        ],
        total: 2,
      });

      const saved = await screen.findByRole("button", { name: "Saved" });
      expect(saved.closest("article")).toHaveTextContent("Salão Nyeleti");
      expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(1);
    });

    it("opens the save-to-a-list dialog on the business whose heart was pressed", async () => {
      // The page holds the dialog's state, so the one thing that can only go
      // wrong here is *which* row it opens on.
      signIn();
      fakeServer();
      renderPage("/providers", {
        items: [
          provider({ id: "a", name: "Estúdio Mavalane", slug: "a" }),
          provider({ id: "b", name: "Salão Nyeleti", slug: "b" }),
        ],
        total: 2,
      });

      const hearts = await screen.findAllByRole("button", { name: "Save" });
      fireEvent.click(hearts[1]!);

      const dialog = await screen.findByRole("dialog", { name: "Save to a list" });
      expect(within(dialog).getByText("Salão Nyeleti")).toBeInTheDocument();
      expect(within(dialog).queryByText("Estúdio Mavalane")).not.toBeInTheDocument();
      // Ticked from the save's own answer, with no second round trip.
      expect(await within(dialog).findByRole("checkbox", { name: /Favourites/ })).toBeChecked();
    });

    it("asks nothing at all of a signed-out reader, and still draws the heart", async () => {
      const spy = fakeServer();
      renderPage("/providers", { items: [provider()], total: 1 });

      expect(await screen.findByRole("button", { name: "Save" })).toBeInTheDocument();
      expect(marksCalls(spy)).toHaveLength(0);
    });
  });
});
