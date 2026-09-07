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
   * One header for every public page, the browse pages included. The three
   * destinations sit in the right-hand cluster beside the account controls;
   * the centre is the search, which every public page now carries in the bar
   * rather than in a band of its own beneath it.
   */
  it("draws the three destinations beside the account controls", async () => {
    await renderHeader();

    expect(screen.getByRole("link", { name: /explore/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^services$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^providers$/i })).toBeInTheDocument();
  });

  it("lights the current destination and leaves the other two resting", async () => {
    await renderHeader({ current: "providers" });

    const active = screen.getByRole("link", { name: /^providers$/i });
    expect(active.className).toContain("font-semibold");
    expect(active.className).toContain("text-[var(--color-headline)]");

    const resting = screen.getByRole("link", { name: /^services$/i });
    expect(resting.className).not.toContain("text-[var(--color-headline)]");
    expect(resting.className).toContain("text-[var(--color-muted-foreground)]");
  });

  /**
   * The site's one blue is the search's button and the sign-in, and the
   * destinations are not a third claim on it. They were a pill group with the
   * lit one filled blue until 7 September 2026; weight and navy say the same
   * thing without competing with the button beside them.
   */
  it("spends no blue and draws no capsule on the destinations", async () => {
    await renderHeader({ current: "services" });

    for (const name of [/explore/i, /^services$/i, /^providers$/i]) {
      const link = screen.getByRole("link", { name });
      expect(link.className).not.toContain("bg-[var(--color-primary)]");
      expect(link.className).not.toContain("rounded-full");
    }
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
        "text-[var(--color-headline)]",
      );
    }
  });

  /**
   * The search is the header's, not a page's. Every public surface wears the
   * same bar in the same place, so a reader who wants a different service
   * never has to find their way back to a page that happens to have a field.
   *
   * The default is the landing hero's: it asks for a service and a submit
   * starts a fresh search, because a page with no list under it has no
   * narrowing to keep.
   */
  it("carries the site's search, asking for a service by default", async () => {
    await renderHeader();

    expect(screen.getByRole("searchbox")).toHaveAccessibleName("Search services");
  });

  /**
   * A list page hands over its own bar so a typed term keeps the category,
   * the filters, the city and the sort it already had — the same four props
   * `ServiceSearch` has always required together, passed through rather than
   * re-declared here.
   */
  it("wears the page's own search when the page has a list to narrow", async () => {
    await renderHeader({
      current: "providers",
      search: {
        to: "/providers",
        placeholder: "Search by name",
        label: "Search providers",
        search: (q) => (q ? { q } : {}),
        initialValue: "mavalane",
      },
    });

    const box = screen.getByRole("searchbox");
    expect(box).toHaveAccessibleName("Search providers");
    expect(box).toHaveValue("mavalane");
  });

  // One field, not one per breakpoint. The bar moves to its own row on a
  // phone by grid placement; rendering a second copy would put two searchboxes
  // and two identical labels in the document for every page that has one.
  it("draws the search once, however narrow the window", async () => {
    await renderHeader();
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
  });

  /**
   * The provider's door is the footer's, and the right-hand cluster is full:
   * the nav pill moved into it. The link `providerCta` used to add sat in the
   * same block as `HeaderActions` and stacked above it rather than beside it,
   * which is the break this header was rebuilt to fix.
   */
  it("leaves the provider's door to the footer", async () => {
    await renderHeader();
    expect(screen.queryByRole("link", { name: "Become a Provider" })).toBeNull();
  });
});
