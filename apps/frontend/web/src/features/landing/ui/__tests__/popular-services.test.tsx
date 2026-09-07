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
import i18n from "i18next";
import type { ServiceDTO } from "@ntizo/shared/read-models";
import { PopularServices, LANDING_SERVICES } from "../popular-services";

/**
 * Annotated as `ServiceDTO`, not cast to it: a cast suppresses both the
 * excess- and missing-property checks, so a fixture that drifts from the real
 * schema keeps compiling under its own stale shape instead of TypeScript
 * catching it. That is exactly how an invalid `providerType` reached this
 * file unnoticed the first time this fixture was written.
 */
function service(over: Partial<ServiceDTO> = {}): ServiceDTO {
  return {
    id: "s-1",
    providerId: "p-1",
    providerSlug: "estudio-mavalane",
    providerName: "Estúdio Mavalane",
    providerType: "organization",
    providerVerified: true,
    providerRatingAverage: 4.7,
    providerReviewCount: 6,
    categoryCode: "beauty",
    categoryName: "Beauty",
    name: "Corte de cabelo",
    description: null,
    locationType: "at_provider",
    bookingMode: "instant",
    imageUrls: [],
    isFallback: false,
    fromAmountMinor: null,
    optionCount: 1,
    defaultOption: {
      amountMinor: 80000,
      currency: "MZN",
      durationMinutes: 45,
      minMinutes: null,
      stepMinutes: null,
      pricingMode: "fixed",
    },
    ...over,
  };
}

function popularKey() {
  return [
    "public",
    "services",
    "popular",
    i18n.resolvedLanguage ?? i18n.language,
    LANDING_SERVICES,
  ];
}

async function renderServices(items?: ServiceDTO[]) {
  const rootRoute = createRootRoute();
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <PopularServices /> }),
      ...["/services", "/services/$id", "/providers/$slug"].map(stub),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (items) qc.setQueryData(popularKey(), { items, nextOffset: null, total: items.length });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("PopularServices", () => {
  it("puts a price on the home page, which is the whole point", async () => {
    await renderServices([service()]);
    expect(await screen.findByText("Corte de cabelo")).toBeInTheDocument();
    expect(screen.getByText(/800/)).toBeInTheDocument();
  });

  it("sends a tile to that service, not to a directory", async () => {
    await renderServices([service()]);
    expect(
      (await screen.findByRole("link", { name: "Corte de cabelo" })).getAttribute("href"),
    ).toBe("/services/s-1");
  });

  // A heading over an empty grid tells a visitor the platform sells nothing,
  // which is worse than the section not being there. It returns on its own
  // the day a provider publishes.
  it("does not appear at all when there is nothing published", async () => {
    await renderServices([]);
    expect(screen.queryByRole("heading", { name: "Popular services" })).toBeNull();
  });

  it("leads to the whole catalogue", async () => {
    await renderServices([service()]);
    expect(
      (await screen.findByRole("link", { name: "See all services" })).getAttribute("href"),
    ).toBe("/services");
  });
});
