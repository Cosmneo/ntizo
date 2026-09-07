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
import type { ProviderPublicDTO } from "@ntizo/shared";
import { VerifiedProviders, LANDING_PROVIDERS } from "../verified-providers";

function provider(over: Partial<ProviderPublicDTO> = {}): ProviderPublicDTO {
  return {
    id: "p-1",
    name: "Oficina do Zeca",
    slug: "oficina-do-zeca",
    type: "individual",
    description: null,
    city: "Maputo",
    district: "Malhazine",
    country: "MZ",
    logoUrl: null,
    photoUrls: [],
    verified: true,
    ratingAverage: 4.8,
    reviewCount: 12,
    categories: [{ code: "electrical", name: "Electrical" }],
    serviceCount: 3,
    fromAmountMinor: 45000,
    fromCurrency: "MZN",
    services: [],
    ...over,
  };
}

function popularKey() {
  return [
    "public",
    "providers",
    "popular",
    i18n.resolvedLanguage ?? i18n.language,
    LANDING_PROVIDERS,
  ];
}

async function renderProviders(items?: ProviderPublicDTO[]) {
  const rootRoute = createRootRoute();
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <VerifiedProviders /> }),
      ...["/providers", "/providers/$slug"].map(stub),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (items) qc.setQueryData(popularKey(), { items, total: items.length });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("VerifiedProviders", () => {
  it("draws the business, its trade, its score and its cheapest price", async () => {
    await renderProviders([provider()]);
    expect(await screen.findByText("Oficina do Zeca")).toBeInTheDocument();
    expect(screen.getByText("Electrical")).toBeInTheDocument();
    expect(screen.getByText("4.8")).toBeInTheDocument();
    expect(screen.getByText(/450/)).toBeInTheDocument();
  });

  it("links to that business", async () => {
    await renderProviders([provider()]);
    expect(
      (await screen.findByRole("link", { name: /Oficina do Zeca/ })).getAttribute("href"),
    ).toBe("/providers/oficina-do-zeca");
  });

  // Null, not zero. A 0,0 beside a business nobody has rated tells every
  // visitor it is the worst on the platform.
  it("says so rather than printing a zero when nobody has rated a business", async () => {
    await renderProviders([provider({ ratingAverage: null, reviewCount: 0 })]);
    expect(await screen.findByText("No reviews yet")).toBeInTheDocument();
    expect(screen.queryByText("0.0")).toBeNull();
  });

  it("omits the price line for a business that publishes nothing priced", async () => {
    await renderProviders([provider({ fromAmountMinor: null, fromCurrency: null })]);
    await screen.findByText("Oficina do Zeca");
    // Asserted on the currency, not on a "from" label: this card prints no
    // such label, so a query for one passes whether or not a price rendered.
    expect(screen.queryByText(/MZN/)).toBeNull();
  });

  it("does not appear when nobody is verified yet", async () => {
    await renderProviders([]);
    expect(screen.queryByRole("heading", { name: "Verified providers" })).toBeNull();
  });
});
