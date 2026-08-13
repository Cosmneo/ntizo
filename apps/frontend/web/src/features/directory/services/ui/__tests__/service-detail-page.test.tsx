import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ServiceDetailDTO, ServiceDetailOptionDTO } from "@ntizo/shared/read-models";

/**
 * The three branches `serviceDetailPanel` decides for the page's right
 * column, exercised through the real page rather than the pure function
 * alone — the defect this fix wave closes lived in the wiring
 * (`service-detail-page.tsx` reading `options.length` itself instead of
 * asking the domain function), not in a function nothing had called yet.
 *
 * The viewmodel hook is the seam, not the query cache — the same choice
 * `user-menu.test.tsx` documents: seeding a real `QueryClient` would mean
 * importing `serviceDetailQueries` from `data/`, which `boundaries/dependencies`
 * forbids a `ui/` file from doing, test files included, and rightly — a ui
 * component knows its hooks, not where they store things.
 */
const state: { service: ServiceDetailDTO | null } = { service: null };
vi.mock("@/features/directory/services/viewmodel/use-service-detail", () => ({
  useServiceDetail: () => state.service,
}));

const { ServiceDetailPage } = await import("../service-detail-page");

function detailOption(over: Partial<ServiceDetailOptionDTO> = {}): ServiceDetailOptionDTO {
  return {
    id: "opt-1",
    name: "Corte",
    amountMinor: 50000,
    currency: "MZN",
    durationMinutes: 60,
    minMinutes: null,
    stepMinutes: null,
    pricingMode: "fixed",
    isDefault: true,
    ...over,
  };
}

function detailService(over: Partial<ServiceDetailDTO> = {}): ServiceDetailDTO {
  return {
    id: "svc-1",
    providerId: "prov-1",
    providerName: "Studio X",
    providerSlug: "studio-x",
    providerType: "organization",
    providerLogoUrl: null,
    providerCity: "Maputo",
    providerDistrict: null,
    categoryCode: "hair",
    categoryName: "Hair",
    name: "Corte de cabelo",
    description: null,
    locationType: "at_provider",
    bookingMode: "priced",
    imageUrls: [],
    options: [detailOption()],
    performers: [],
    isFallback: false,
    ...over,
  };
}

function renderPage(service: ServiceDetailDTO) {
  state.service = service;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <ServiceDetailPage id={service.id} />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("ServiceDetailPage's right column", () => {
  it("shows the package chooser for a priced service with active options", async () => {
    renderPage(detailService());
    expect(await screen.findByRole("heading", { name: "Packages" })).toBeInTheDocument();
    expect(screen.queryByText(/priced by quote/i)).not.toBeInTheDocument();
  });

  it("shows the quote notice for a quote service", async () => {
    renderPage(detailService({ bookingMode: "quote", options: [] }));
    expect(await screen.findByText(/priced by quote/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Packages" })).not.toBeInTheDocument();
  });

  it("a priced service with no active options is NOT shown as a quote service", async () => {
    // The exact defect this fix wave closes: `canPublish` counts a service's
    // options at publish time, never whether they stay active, and nothing
    // re-runs it when the last one is deactivated — a `priced` service can
    // reach this page with an empty `options` array despite never being a
    // quote service, and the page used to read that as "by quote".
    renderPage(detailService({ bookingMode: "priced", options: [] }));
    expect(
      await screen.findByText("This service doesn't currently have a bookable package. Please check back soon."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/priced by quote/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Packages" })).not.toBeInTheDocument();
  });
});
