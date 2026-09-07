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
  /**
   * One header for every public page, the browse pages included. The centre
   * column is the three-destination nav pill and nothing else: the search
   * variant that once took its place is gone, and `/services` and
   * `/providers` render the landing hero's own `ServiceSearch` under this
   * header instead.
   */
  it("draws the three-destination nav pill in the centre column", async () => {
    await renderHeader();

    expect(screen.getByRole("link", { name: /explore/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^services$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^providers$/i })).toBeInTheDocument();
  });

  it("lights the current destination and leaves the other two resting", async () => {
    await renderHeader({ current: "providers" });

    const active = screen.getByRole("link", { name: /^providers$/i });
    expect(active.className).toContain("bg-[var(--color-primary)]");
    expect(active.className).toContain("text-white");

    const resting = screen.getByRole("link", { name: /^services$/i });
    expect(resting.className).not.toContain("bg-[var(--color-primary)]");
    expect(resting.className).toContain("text-[var(--color-muted-foreground)]");
  });

  /**
   * `"none"` is the company pages' answer: `endsWith("none")` matches no nav
   * key, so the header does not claim a page outside the three destinations
   * is "Explore".
   */
  it("lights nothing when the page is outside the three destinations", async () => {
    await renderHeader({ current: "none" });

    for (const name of [/explore/i, /^services$/i, /^providers$/i]) {
      expect(screen.getByRole("link", { name }).className).not.toContain(
        "bg-[var(--color-primary)]",
      );
    }
  });

  it("offers the provider a door when asked", async () => {
    await renderHeader({ providerCta: true });
    expect(
      screen.getByRole("link", { name: "Become a Provider" }).getAttribute("href"),
    ).toBe("/become-provider");
  });

  // Seven surfaces import this header and none of them asked for a new link.
  // The prop is the whole point: absent, the header they render is unchanged.
  it("grows no link for the callers that did not ask", async () => {
    await renderHeader();
    expect(screen.queryByRole("link", { name: "Become a Provider" })).toBeNull();
  });
});
