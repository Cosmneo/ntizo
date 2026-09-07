import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelpCenterProvider } from "@/features/help-center/viewmodel/use-help-center";
import { LandingPage } from "./landing-page";

/**
 * The whole page, with every query left unseeded.
 *
 * That is the state dev actually serves: no category has an image, no provider
 * has a photograph, and the featured reviews table is usually empty. A home
 * page that only holds together with data is a home page that is broken on the
 * day it matters most.
 */
async function renderPage() {
  const rootRoute = createRootRoute();
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <LandingPage /> }),
      ...[
        "/sign-in",
        "/sign-up",
        "/services",
        "/services/$id",
        "/providers",
        "/providers/$slug",
        "/become-provider",
        "/about",
        "/contact",
        "/help",
        "/feedback",
        "/careers",
        "/terms",
        "/privacy",
      ].map(stub),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <HelpCenterProvider>
        <RouterProvider router={router} />
      </HelpCenterProvider>
    </QueryClientProvider>,
  );
}

describe("LandingPage", () => {
  it("leads with the offer and a way to search for it", async () => {
    await renderPage();
    expect(
      await screen.findByRole("heading", { level: 1, name: /at the price you see/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Search services")).toBeInTheDocument();
  });

  it("makes the offer to the other reader", async () => {
    await renderPage();
    expect(
      await screen.findByRole("link", { name: "Create a provider account" }),
    ).toBeInTheDocument();
  });

  it("keeps the footer's promises", async () => {
    await renderPage();
    expect(await screen.findByText("M-Pesa")).toBeInTheDocument();
    expect(screen.queryByText("Visa")).toBeNull();
  });

  // The four data-fed sections each hide themselves rather than render a
  // heading over nothing. With no data seeded, none of them should be here.
  //
  // The provider band's call to action has no query behind it, so it is on
  // screen from the very first render. The other four start out `isLoading`
  // (also on screen, with skeletons) and only unmount once their query
  // settles to an error — which for an unseeded query against no server
  // happens fast, but still after at least one macrotask, never within the
  // same microtask turn that renders the band. Asserting their absence needs
  // the same kind of wait `findByRole` gives the link, or the check runs a
  // tick too early and catches them mid-flight.
  it("shows no empty section headings when there is nothing to put in them", async () => {
    await renderPage();
    await screen.findByRole("link", { name: "Create a provider account" });
    // Four assertions that something is absent all pass — vacuously — on a
    // completely blank document, and this tree has no Error Boundary
    // anywhere: if any section threw while rendering, React would unmount
    // the whole page, not just that section, and the four `toBeNull` checks
    // below would then pass against nothing on screen at all. So this block
    // also asserts the page is still actually there: the provider band's
    // call to action again — not data-driven, and further down the tree than
    // anything being asserted absent — alongside the four negatives.
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Create a provider account" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Browse by category" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "Popular services" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "Verified providers" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "What customers say" })).toBeNull();
    });
  });

  // The slogan is gone from the hero, and not moved: the section it used to
  // title, "How it works", was removed from the page outright.
  it("no longer opens with a slogan", async () => {
    await renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText("Find it.")).toBeNull();
  });
});
