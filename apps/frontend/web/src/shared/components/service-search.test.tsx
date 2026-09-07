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
 */
async function renderSearch(props: Parameters<typeof ServiceSearch>[0] = {}) {
  const q = (s: Record<string, unknown>): { q?: string } =>
    typeof s["q"] === "string" && s["q"] ? { q: s["q"] } : {};
  const root = createRootRoute();
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <ServiceSearch {...props} />,
  });
  const services = createRoute({
    getParentRoute: () => root,
    path: "/services",
    validateSearch: q,
    component: () => <div>results</div>,
  });
  const providers = createRoute({
    getParentRoute: () => root,
    path: "/providers",
    validateSearch: q,
    component: () => <div>businesses</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, services, providers]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

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
    const router = await renderSearch({ to: "/providers", placeholder: "Nome do negócio" });

    await user.type(screen.getByRole("searchbox"), "Cossa");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(router.state.location.pathname).toBe("/providers");
    expect(router.state.location.search).toEqual({ q: "Cossa" });
  });

  it("keeps going to /services by default", async () => {
    // The home page and `/services` pass no `to` at all, so the default is
    // the behaviour eight callers already depend on.
    const user = userEvent.setup();
    const router = await renderSearch();

    await user.type(screen.getByRole("searchbox"), "Cossa");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(router.state.location.pathname).toBe("/services");
    expect(router.state.location.search).toEqual({ q: "Cossa" });
  });

  it("shows the placeholder it is given", async () => {
    // "Procurar serviços…" over a list of businesses is the field telling the
    // reader to type the wrong thing.
    await renderSearch({ to: "/providers", placeholder: "Nome do negócio" });
    expect(screen.getByRole("searchbox")).toHaveAttribute("placeholder", "Nome do negócio");
  });

  it("uses the label it is given", async () => {
    // The placeholder is not the accessible name — a screen reader on
    // `/providers` heard "Search services" over a list of businesses, which
    // is the one thing about the field that never reached the eye.
    await renderSearch({ to: "/providers", label: "Search providers" });
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
