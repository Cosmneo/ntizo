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

  /**
   * The search reaches the catalogue from the header, not from the hero.
   * It used to be both: a field in the bar and a wider one under the
   * subtitle, which is two boxes asking the same question in one screenful.
   * The hero kept the big one only while the header had none.
   */
  it("leaves the search to the header rather than repeating it", async () => {
    await renderHero();

    const box = screen.getByRole("searchbox");
    expect(box).toHaveAccessibleName("Search services");
    expect(screen.getByRole("banner")).toContainElement(box);
  });

  // The provider's door is the footer's — `footer.test.tsx` holds it to that.
  // It was in the header, in the same block as the account controls, where it
  // stacked above them instead of sitting beside them.
  it("leaves the provider's door to the footer", async () => {
    await renderHero();
    expect(screen.queryByRole("link", { name: "Become a Provider" })).toBeNull();
  });

  // The collage stands in for photographs nobody has uploaded. A grey box
  // reads as a page that failed to load; the media fallback reads as a
  // designed state, and it is what every other empty surface on the
  // platform draws.
  it("draws the brand rather than a grey box while there are no photographs", async () => {
    await renderHero();
    expect(screen.getAllByTestId("media-fallback")).toHaveLength(3);
  });
});
