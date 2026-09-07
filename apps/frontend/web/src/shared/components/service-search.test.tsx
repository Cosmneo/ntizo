import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { ServiceSearch } from "./service-search";

/**
 * The bar on the home page, with both of its destinations reachable.
 *
 * `/providers` is a route here as well as `/services` because the bar now
 * carries a `to`: a navigation to a route the test router does not know
 * lands nowhere, and the assertion on the pathname would pass against a
 * component that never moved.
 *
 * Every route here keeps whatever search object it is handed. The real routes
 * validate; what is under test is the object the bar navigates with, so a
 * stub that dropped everything but `q` would hide exactly the bug these tests
 * exist for — a builder's other parameters going missing on the way out.
 *
 * `at` is where the bar is rendered from, so a test can put parameters in the
 * URL the bar is leaving and see whether they travel.
 */
async function renderSearch(
  props: Parameters<typeof ServiceSearch>[0] = {},
  { at = "/" }: { at?: string } = {},
) {
  const keep = (s: Record<string, unknown>): Record<string, unknown> => s;
  const root = createRootRoute();
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    validateSearch: keep,
    component: () => <ServiceSearch {...props} />,
  });
  const services = createRoute({
    getParentRoute: () => root,
    path: "/services",
    validateSearch: keep,
    component: () => <div>results</div>,
  });
  const providers = createRoute({
    getParentRoute: () => root,
    path: "/providers",
    validateSearch: keep,
    component: () => <div>businesses</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, services, providers]),
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

/**
 * What a list page hands the bar: its destination, its wording and its URL
 * builder, which the props require as a set. A test about one of them still
 * names the rest — which is the point of requiring them, since each one
 * missing has been a shipped bug.
 */
const providersBar = {
  to: "/providers",
  placeholder: "Nome do negócio",
  label: "Search providers",
  search: (q: string | undefined) => (q ? { q } : {}),
} as const;

describe("ServiceSearch", () => {
  it("sends the term to the directory as a URL parameter", async () => {
    const user = userEvent.setup();
    const router = await renderSearch();

    await user.type(screen.getByLabelText("Search services"), "canalizacao");
    await user.click(screen.getByRole("button", { name: "Search" }));

    // The services browse, not the provider directory. The field asks for a
    // service and the button says so; landing on a list of businesses instead
    // is what made this box feel broken.
    //
    // In the URL, not in component state: a results page you cannot link to
    // or reload is not a results page.
    expect(router.state.location.pathname).toBe("/services");
    expect(router.state.location.search).toEqual({ q: "canalizacao" });
  });

  it("drops surrounding whitespace rather than searching for it", async () => {
    const user = userEvent.setup();
    const router = await renderSearch();

    await user.type(screen.getByLabelText("Search services"), "   agua   ");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(router.state.location.search).toEqual({ q: "agua" });
  });

  it("navigates with no parameter at all when the field is empty", async () => {
    const user = userEvent.setup();
    const router = await renderSearch();

    await user.click(screen.getByRole("button", { name: "Search" }));

    // `?q=` empty would be a search for nothing; omitting it is the full list.
    expect(router.state.location.pathname).toBe("/services");
    expect(router.state.location.search).toEqual({});
  });

  it("goes to /providers with the term when told to", async () => {
    // The same bar on `/providers`, asking a different question: there the
    // reader is naming a business, not a job, so the term has to reach the
    // list of businesses rather than bouncing them to the services one.
    const user = userEvent.setup();
    const router = await renderSearch(providersBar);

    await user.type(screen.getByRole("searchbox"), "Cossa");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(router.state.location.pathname).toBe("/providers");
    expect(router.state.location.search).toEqual({ q: "Cossa" });
  });

  it("keeps going to /services by default", async () => {
    // The home page's hero passes no `to` at all — the one caller that does
    // not — so the default has to stay the services browse. Asking for
    // "corte de cabelo" and landing on a list of businesses instead is the
    // behaviour this default was written to end.
    const user = userEvent.setup();
    const router = await renderSearch();

    await user.type(screen.getByRole("searchbox"), "Cossa");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(router.state.location.pathname).toBe("/services");
    expect(router.state.location.search).toEqual({ q: "Cossa" });
  });

  it("builds the URL with the builder it is given, rather than the term alone", async () => {
    // The list pages' case. Every other control on those pages changes one
    // part of the URL and keeps the rest; the bar has to do the same, or a
    // reader who narrowed to one category in one city and then types a word
    // is silently handed the whole platform back.
    const user = userEvent.setup();
    const router = await renderSearch({
      to: "/services",
      placeholder: "Procurar serviços…",
      label: "Search services",
      search: (q) => ({ category: "hair", city: "Maputo", ...(q ? { q } : {}) }),
    });

    await user.type(screen.getByRole("searchbox"), "barba");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(router.state.location.pathname).toBe("/services");
    expect(router.state.location.search).toEqual({
      category: "hair",
      city: "Maputo",
      q: "barba",
    });
  });

  it("tells the builder an empty box is `undefined`, not an empty term", async () => {
    // So that clearing the box clears the term. An empty string would be
    // written out as `q=`, which is a search for nothing pinned to the URL
    // rather than the narrowing the reader still has.
    const user = userEvent.setup();
    const seen: (string | undefined)[] = [];
    const router = await renderSearch({
      to: "/services",
      placeholder: "Procurar serviços…",
      label: "Search services",
      search: (q) => {
        seen.push(q);
        return { category: "hair", ...(q ? { q } : {}) };
      },
    });

    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(seen).toEqual([undefined]);
    expect(router.state.location.search).toEqual({ category: "hair" });
  });

  it("starts a fresh search when it has no builder", async () => {
    // The home page's hero, which is the default: there is no list underneath
    // it to keep a narrowing from, so the term is the whole URL — and the
    // parameters of the page it is leaving are not carried along.
    const user = userEvent.setup();
    const router = await renderSearch({}, { at: "/?city=Maputo" });

    await user.type(screen.getByRole("searchbox"), "canalizacao");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(router.state.location.pathname).toBe("/services");
    expect(router.state.location.search).toEqual({ q: "canalizacao" });
  });

  it("shows the placeholder it is given", async () => {
    // "Procurar serviços…" over a list of businesses is the field telling the
    // reader to type the wrong thing.
    await renderSearch(providersBar);
    expect(screen.getByRole("searchbox")).toHaveAttribute("placeholder", "Nome do negócio");
  });

  it("uses the label it is given", async () => {
    // The placeholder is not the accessible name — a screen reader on
    // `/providers` heard "Search services" over a list of businesses, which
    // is the one thing about the field that never reached the eye.
    await renderSearch(providersBar);
    expect(screen.getByRole("searchbox")).toHaveAccessibleName("Search providers");
  });

  it("falls back to the services label when given none", async () => {
    await renderSearch();
    expect(screen.getByRole("searchbox")).toHaveAccessibleName("Search services");
  });

  it("shows the current term when rendered on the results page", async () => {
    await renderSearch({ initialValue: "jardinagem" });
    expect(screen.getByLabelText("Search services")).toHaveValue("jardinagem");
  });

  it("submits on Enter, not only by clicking the button", async () => {
    const user = userEvent.setup();
    const router = await renderSearch();

    await user.type(screen.getByLabelText("Search services"), "pintura{Enter}");

    expect(router.state.location.search).toEqual({ q: "pintura" });
  });

  it("searches on a real submit rather than a hand-rolled key handler", async () => {
    // Enter inside a text field reaching the submit button is a browser
    // behaviour; reimplementing it is how a search box becomes the one
    // control on a page of links that does nothing before JavaScript runs.
    // This is what the case above rides on, pinned directly — the page tests
    // used to assert it, and it belongs to the shell, which is here.
    await renderSearch();
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("type", "submit");
  });

  /**
   * The button is a circled magnifier on a phone and the word from `sm` up.
   * The word is still in the DOM at every width, `sr-only` rather than
   * dropped, because a button whose only content is a decorative glyph has no
   * accessible name — and the obvious way to shrink this control is to delete
   * the text, which is what this pins against.
   *
   * jsdom applies no stylesheet, so the *rendered* width is not testable
   * here; what is testable is that the name survives however it is drawn.
   */
  it("keeps the button's name at every width, however narrow it is drawn", async () => {
    await renderSearch();

    const button = screen.getByRole("button", { name: "Search" });
    expect(button).toHaveAccessibleName("Search");
    // The glyph must not be a second, wordless name for the same control.
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("ServiceSearch, on a coloured background", () => {
  // The home hero paints the whole block `text-white`, and a form control
  // inherits `color` from its container (Tailwind's preflight says so). On
  // 3 September 2026 that made the typed text and the caret white on the
  // field's white background: the owner typed and saw nothing. jsdom does not
  // run the stylesheet, so this pins the class that carries the field's own
  // colour rather than the computed colour it produces.
  it("carries its own text colour rather than inheriting the hero's white", async () => {
    await renderSearch();
    expect(screen.getByLabelText("Search services")).toHaveClass(
      "text-[var(--color-foreground)]",
    );
  });
});
