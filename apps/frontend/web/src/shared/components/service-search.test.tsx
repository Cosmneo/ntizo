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

async function renderSearch(initialValue = "") {
  const root = createRootRoute();
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <ServiceSearch initialValue={initialValue} />,
  });
  const services = createRoute({
    getParentRoute: () => root,
    path: "/services",
    validateSearch: (s: Record<string, unknown>): { q?: string } =>
      typeof s["q"] === "string" && s["q"] ? { q: s["q"] } : {},
    component: () => <div>results</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, services]),
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

  it("shows the current term when rendered on the results page", async () => {
    await renderSearch("jardinagem");
    expect(screen.getByLabelText("Search services")).toHaveValue("jardinagem");
  });

  it("submits on Enter, not only by clicking the button", async () => {
    const user = userEvent.setup();
    const router = await renderSearch();

    await user.type(screen.getByLabelText("Search services"), "pintura{Enter}");

    expect(router.state.location.search).toEqual({ q: "pintura" });
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
