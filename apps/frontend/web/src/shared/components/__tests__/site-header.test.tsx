import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SiteHeader } from "../site-header";

/**
 * The header on its own, the way `checkout-header.test.tsx` renders the
 * checkout's — a memory router with one route, no navigation to drive.
 *
 * A `QueryClient` is required regardless of what the test is about:
 * `HeaderActions` reads the session through `useCurrentUser`, and left
 * unseeded that query settles on nobody signed in, which is the branch these
 * tests want (`signedOutAction` renders, matching the landing page's own
 * harness for the same header).
 */
async function renderHeader(props: Parameters<typeof SiteHeader>[0] = {}) {
  const root = createRootRoute({ component: () => <SiteHeader {...props} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("SiteHeader", () => {
  it("swaps the centre pill for the search and moves the destinations to text links", async () => {
    await renderHeader({ search: <div role="search">search goes here</div> });

    // The nav pill's own landmark link is gone, "Explore" included.
    expect(screen.queryByRole("link", { name: /explore/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^services$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^providers$/i })).toBeInTheDocument();
    expect(screen.getByRole("search")).toHaveTextContent("search goes here");
  });

  /**
   * jsdom has no layout, so the phone header is asserted through the classes
   * that produce it: the destinations only appear from `lg`, and the search
   * takes the whole of a second grid row until `md`. Measured in a browser
   * before this, the three-in-a-row header left the search column 0px wide.
   */
  it("gives the phone its own search row and hides the destinations until lg", async () => {
    await renderHeader({ search: <div role="search">search goes here</div> });

    for (const name of [/^services$/i, /^providers$/i]) {
      const link = screen.getByRole("link", { name });
      expect(link.className).toContain("hidden");
      expect(link.className).toContain("lg:inline");
    }

    const slot = screen.getByRole("search").parentElement;
    expect(slot?.className).toContain("col-span-3");
    expect(slot?.className).toContain("row-start-2");
    expect(slot?.className).toContain("md:col-span-1");
  });

  /**
   * The active destination is the one case the search variant's right column
   * never rendered in a test: `current` reaches those links too, and the
   * responsive class has to survive the active branch as much as the resting
   * one.
   */
  it("lights the active destination in the search variant and keeps it responsive", async () => {
    await renderHeader({
      current: "providers",
      search: <div role="search">search goes here</div>,
    });

    const active = screen.getByRole("link", { name: /^providers$/i });
    expect(active.className).toContain("font-bold");
    expect(active.className).toContain("text-[var(--color-headline)]");
    expect(active.className).toContain("hidden");
    expect(active.className).toContain("lg:inline");

    const resting = screen.getByRole("link", { name: /^services$/i });
    expect(resting.className).not.toContain("font-bold");
    expect(resting.className).toContain("text-[var(--color-muted-foreground)]");
  });

  it("keeps the three-destination nav pill when no search is given", async () => {
    await renderHeader();

    expect(screen.getByRole("link", { name: /explore/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^services$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^providers$/i })).toBeInTheDocument();
  });
});
