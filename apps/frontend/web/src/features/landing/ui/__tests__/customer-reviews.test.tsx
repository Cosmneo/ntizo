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
import type { FeaturedReviewDTO } from "@ntizo/shared/read-models";
import { CustomerReviews, LANDING_STORIES } from "../customer-reviews";

function story(over: Partial<FeaturedReviewDTO> = {}): FeaturedReviewDTO {
  return {
    id: "rev-1",
    rating: 4,
    comment: "Chegou à hora combinada e deixou tudo limpo.",
    authorName: "Ana Rodrigues",
    createdAt: "2026-08-01T10:00:00.000Z",
    providerName: "Canalizações Zimpeto",
    providerSlug: "canalizacoes-zimpeto",
    ...over,
  };
}

async function renderReviews(items?: FeaturedReviewDTO[]) {
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <CustomerReviews /> }),
      createRoute({ getParentRoute: () => rootRoute, path: "/providers/$slug", component: () => <p>provider</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (items) qc.setQueryData(["public", "reviews", "featured", LANDING_STORIES], items);
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("CustomerReviews", () => {
  it("quotes the reviewer in their own words", async () => {
    await renderReviews([story()]);
    expect(
      await screen.findByText("Chegou à hora combinada e deixou tudo limpo."),
    ).toBeInTheDocument();
    expect(screen.getByText("Ana Rodrigues")).toBeInTheDocument();
  });

  it("shows the score the reviewer gave, not five stars", async () => {
    await renderReviews([story({ rating: 3 })]);
    expect(await screen.findByRole("img", { name: "3 out of 5" })).toBeInTheDocument();
  });

  it("names an author who set no name rather than rendering an empty chip", async () => {
    await renderReviews([story({ authorName: null })]);
    expect(await screen.findByText("Anonymous")).toBeInTheDocument();
  });

  it("leads to the business the review is about", async () => {
    await renderReviews([story()]);
    expect(
      (await screen.findByRole("link", { name: /Canalizações Zimpeto/ })).getAttribute("href"),
    ).toBe("/providers/canalizacoes-zimpeto");
  });

  /**
   * The flaw this section exists to fix: reviews are different lengths, so a
   * naive column puts three footers at three different heights and the row
   * reads as unfinished. Asserted on the declared style rather than a measured
   * position — jsdom does no layout, so a geometric check would pass on
   * anything.
   */
  it("pins the footer to the bottom whatever the quote runs to", async () => {
    await renderReviews([story(), story({ id: "rev-2", comment: "Bom." })]);
    const footers = await screen.findAllByTestId("review-footer");
    expect(footers).toHaveLength(2);
    for (const f of footers) expect(f.style.marginTop).toBe("auto");
  });

  it("does not appear when an administrator has featured nothing", async () => {
    await renderReviews([]);
    expect(screen.queryByRole("heading", { name: "What customers say" })).toBeNull();
  });
});
