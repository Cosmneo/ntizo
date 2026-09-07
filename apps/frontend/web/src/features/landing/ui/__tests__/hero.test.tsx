import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

  /**
   * The home page's header opens no door for a provider, and that is the
   * decision, not an omission.
   *
   * The link lived here for a day. At ~148px it pushed the right-hand cluster
   * past its track's equal share, and the middle track gave way — so the
   * search bar sat 148px left of the window's middle on this page while every
   * other page stayed centred, which is the failed-centring look the user had
   * twice rejected. He asked for it removed.
   *
   * The provider still has two doors on this page: the footer's Company
   * column (`footer.test.tsx`) and the navy band, which exists for nothing
   * else.
   */
  it("leaves the provider's door to the footer and the band", async () => {
    await renderHero();

    const inHeader = within(screen.getByRole("banner"))
      .queryAllByRole("link")
      .filter((link) => link.getAttribute("href") === "/become-provider");
    expect(inHeader).toHaveLength(0);
  });

  // The collage stands in for photographs nobody has uploaded. A grey box
  // reads as a page that failed to load; the media fallback reads as a
  // designed state, and it is what every other empty surface on the
  // platform draws.
  it("draws the brand rather than a grey box while there are no photographs", async () => {
    await renderHero();
    expect(screen.getAllByTestId("media-fallback")).toHaveLength(3);
  });

  /**
   * And it draws none of that on a phone.
   *
   * Stacked under the claim it is 360px of empty tiles between the headline
   * and the first real thing on the page — half a screen of nothing to scroll
   * past to reach the categories, because Ntizo owns no photographs yet. At
   * `lg` it sits beside the text and costs no vertical room at all.
   *
   * jsdom does no layout, so the class is the assertion. It stays in the
   * document either way: this is a `display` decision, not a render one.
   */
  it("keeps the collage off the phone, where it is 360px of nothing", async () => {
    await renderHero();
    const collage = document.querySelector('[aria-hidden="true"].grid-rows-2')!;

    expect(collage.className).toContain("hidden");
    expect(collage.className).toContain("lg:grid");
    // Never a bare `grid`, which would beat `hidden` and draw it anyway.
    expect(collage.className.split(/\s+/)).not.toContain("grid");
  });
});
