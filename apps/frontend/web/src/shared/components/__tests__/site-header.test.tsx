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

  it("keeps the three-destination nav pill when no search is given", async () => {
    await renderHeader();

    expect(screen.getByRole("link", { name: /explore/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^services$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^providers$/i })).toBeInTheDocument();
  });
});
