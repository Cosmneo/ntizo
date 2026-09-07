import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import i18n from "i18next";
import type { CategoryDTO } from "@ntizo/shared/read-models";
import { CategoryGrid, LANDING_CATEGORIES } from "../category-grid";

function category(over: Partial<CategoryDTO> = {}): CategoryDTO {
  return {
    id: "c-1",
    code: "plumbing",
    name: "Plumbing",
    description: null,
    imageUrl: "https://cdn.example/plumbing.jpg",
    icon: "Wrench",
    isFallback: false,
    ...over,
  };
}

/** The hook's own key. Seeding the cache beats mocking the transport. */
function previewKey() {
  return ["categories", "preview", i18n.resolvedLanguage ?? i18n.language, LANDING_CATEGORIES];
}

async function renderGrid(items: CategoryDTO[]) {
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <CategoryGrid /> }),
      createRoute({ getParentRoute: () => rootRoute, path: "/services", component: () => <p>services</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(previewKey(), { items, nextOffset: null });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("CategoryGrid", () => {
  it("sends a tile to that category's services", async () => {
    await renderGrid([category()]);
    expect(
      (await screen.findByRole("link", { name: "Plumbing" })).getAttribute("href"),
    ).toBe("/services?category=plumbing");
  });

  it("draws the category's photograph when it has one", async () => {
    await renderGrid([category()]);
    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      "https://cdn.example/plumbing.jpg",
    );
  });

  // The bug on dev today: four categories with no image draw one repeated
  // mark, which reads as a broken grid rather than as a set of choices.
  it("draws the category's own icon rather than one repeated mark", async () => {
    await renderGrid([
      category({ id: "a", code: "plumbing", name: "Plumbing", imageUrl: null, icon: "Wrench" }),
      category({ id: "b", code: "beauty", name: "Beauty", imageUrl: null, icon: "Scissors" }),
    ]);
    expect(await screen.findByTestId("category-icon-Wrench")).toBeInTheDocument();
    expect(screen.getByTestId("category-icon-Scissors")).toBeInTheDocument();
    expect(screen.queryByTestId("media-fallback")).toBeNull();
  });

  it("falls back to one shape for a category whose icon nobody set", async () => {
    await renderGrid([category({ imageUrl: null, icon: null })]);
    expect(await screen.findByTestId("category-icon-fallback")).toBeInTheDocument();
  });

  it("falls back to one shape for a category with an unknown icon name", async () => {
    await renderGrid([category({ imageUrl: null, icon: "NotARealIcon" })]);
    expect(await screen.findByTestId("category-icon-fallback")).toBeInTheDocument();
  });

  // The bug live on dev today: "Mecânico"'s image URL 403s. `imageUrl` being
  // present is not the same as it loading, and a category whose photo fails
  // must land on its own icon — not the browser's broken-image glyph, and not
  // the shared `MediaFallback` mark every other category would also show.
  it("falls back to its own icon when the photograph fails to load", async () => {
    await renderGrid([category({ icon: "Wrench" })]);
    fireEvent.error(screen.getByRole("presentation"));
    expect(await screen.findByTestId("category-icon-Wrench")).toBeInTheDocument();
    expect(screen.queryByTestId("media-fallback")).toBeNull();
    expect(screen.queryByRole("presentation")).toBeNull();
  });
});
