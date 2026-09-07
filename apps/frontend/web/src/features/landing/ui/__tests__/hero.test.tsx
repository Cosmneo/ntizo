import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Hero } from "../hero";

async function renderHero() {
  const rootRoute = createRootRoute();
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <Hero /> }),
      ...["/sign-in", "/services", "/providers", "/become-provider"].map(stub),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("Hero", () => {
  it("leads with the offer rather than a slogan", async () => {
    await renderHero();
    expect(
      await screen.findByRole("heading", { level: 1, name: /at the price you see/i }),
    ).toBeInTheDocument();
  });

  it("makes three promises the platform can keep today", async () => {
    await renderHero();
    expect(screen.getByText("Fixed price before you book")).toBeInTheDocument();
    expect(screen.getByText("Verified providers")).toBeInTheDocument();
    expect(screen.getByText("Pay with M-Pesa")).toBeInTheDocument();
  });

  it("carries the search that reaches the catalogue", async () => {
    await renderHero();
    expect(screen.getByLabelText("Search services")).toBeInTheDocument();
  });

  it("offers the provider their own door", async () => {
    await renderHero();
    expect(
      screen.getByRole("link", { name: "Become a Provider" }).getAttribute("href"),
    ).toBe("/become-provider");
  });

  // The collage stands in for photographs nobody has uploaded. A grey box
  // reads as a page that failed to load; the brand tile reads as a designed
  // state, and it is what every other empty surface on the platform draws.
  it("draws the brand rather than a grey box while there are no photographs", async () => {
    await renderHero();
    expect(screen.getAllByTestId("brand-tile")).toHaveLength(3);
  });
});
