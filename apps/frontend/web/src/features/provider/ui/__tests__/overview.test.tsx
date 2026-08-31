import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ProviderDetail, ProviderSummary } from "@/features/provider/domain/types";
import { OverviewPage } from "../overview";

/**
 * The workspace's landing screen -- where `/provider` redirects the moment a
 * provider signs in, every session, not once during setup. The Terms promise
 * a provider sees their rate "before they list a service"; this is the page
 * that has to keep that promise, so what is under test is that the rate
 * actually reaches the screen, formatted, rather than staying a number only
 * `provider.byId`'s response carries.
 */

const PROVIDER: ProviderSummary = {
  id: "p1",
  name: "Bela Vista Studio",
  slug: "bela-vista",
  type: "organization",
  status: "active",
  role: "owner",
};

// Not 10% -- the dev database holds 1200, and a component that ignored the
// prop and rendered the schema's own default would still show 10% here.
const DETAIL: ProviderDetail = {
  id: PROVIDER.id,
  name: PROVIDER.name,
  slug: PROVIDER.slug,
  type: "organization",
  status: "active",
  commissionBps: 1200,
};

function renderOverview(detail: ProviderDetail | undefined = DETAIL) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(["providers", "mine"], [PROVIDER]);
  if (detail) qc.setQueryData(["providers", PROVIDER.id], detail);

  const rootRoute = createRootRoute();
  const slugRoute = createRoute({ getParentRoute: () => rootRoute, path: "/provider/$slug" });
  const overviewRoute = createRoute({
    getParentRoute: () => slugRoute,
    path: "/overview",
    component: OverviewPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([slugRoute.addChildren([overviewRoute])]),
    history: createMemoryHistory({ initialEntries: ["/provider/bela-vista/overview"] }),
  });

  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("OverviewPage", () => {
  it("shows the provider's own commission rate as a percentage, formatted from basis points", async () => {
    renderOverview();

    // 1200 basis points -> 12%, through Intl.NumberFormat's own percent
    // style. A hardcoded "10%" or a raw "1200" would both fail this.
    expect(await screen.findByText("12%")).toBeInTheDocument();
    expect(screen.getByText("Platform's share")).toBeInTheDocument();
    expect(screen.queryByText("10%")).not.toBeInTheDocument();
  });
});
