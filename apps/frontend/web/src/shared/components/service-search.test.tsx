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
  const providers = createRoute({
    getParentRoute: () => root,
    path: "/providers",
    validateSearch: (s: Record<string, unknown>): { q?: string } =>
      typeof s["q"] === "string" && s["q"] ? { q: s["q"] } : {},
    component: () => <div>results</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, providers]),
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

    // In the URL, not in component state: a results page you cannot link to
    // or reload is not a results page.
    expect(router.state.location.pathname).toBe("/providers");
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
    expect(router.state.location.pathname).toBe("/providers");
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
