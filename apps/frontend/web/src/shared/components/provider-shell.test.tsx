import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import type { ProviderDetail, ProviderSummary } from "@/features/provider/domain/types";
import type { CurrentUserDTO } from "@/features/user/domain/current-user";
import { ProviderShell } from "./provider-shell";

/**
 * What Task 2's review found: `OverviewPage` alone satisfied the Terms'
 * "before they list a service" only for the path everybody happens to
 * take. `provider/route.tsx`'s guard checks for a session across the whole
 * `/provider/**` subtree; nothing forces traffic through `/provider/` and
 * its Overview redirect first. A bookmark or an already-open tab pointed
 * straight at `/provider/$slug/services/new` reached the wizard with
 * Overview, and the rate, never rendered.
 *
 * The rate now lives in `ProviderShell` itself, which every one of those
 * routes renders through regardless of which door was used to arrive — so
 * what this file proves is the property the review named, not the widget:
 * the same two assertions hold whichever leaf route is active.
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

const CURRENT_USER: CurrentUserDTO = {
  id: "u1",
  email: "ana@example.com",
  role: "organization_owner",
  status: "active",
  createdAt: "2024-01-01T00:00:00.000Z",
  name: "Ana",
  firstName: "Ana",
  lastName: "M",
  displayName: "Ana",
  avatarUrl: null,
  avatarKey: null,
  phoneNumber: null,
  bio: null,
  language: "en-US",
  timezone: "Africa/Maputo",
  dateOfBirth: null,
  gender: null,
};

function renderShell(initialPath: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(["providers", "mine"], [PROVIDER]);
  qc.setQueryData(["providers", PROVIDER.id], DETAIL);
  qc.setQueryData(["user", "me"], CURRENT_USER);
  qc.setQueryData(["notifications", "provider", PROVIDER.id, "unread"], 0);

  const rootRoute = createRootRoute();
  // The layout route: the real app's `routes/provider/$slug/route.tsx`
  // resolves nothing itself and its parent (`routes/provider/route.tsx`) is
  // the one that mounts `ProviderShell` around an `Outlet` -- collapsed to
  // one route here since the guard those two levels split apart isn't what
  // this file is testing.
  const slugRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/provider/$slug",
    component: () => (
      <ProviderShell>
        <Outlet />
      </ProviderShell>
    ),
  });
  const overviewRoute = createRoute({
    getParentRoute: () => slugRoute,
    path: "/overview",
    component: () => <div>Overview page</div>,
  });
  // Stands in for the service wizard -- a real deep link a bookmark or an
  // admin-shared URL would carry, and the exact path the review traced as
  // reachable without ever passing through `/overview`.
  const newServiceRoute = createRoute({
    getParentRoute: () => slugRoute,
    path: "/services/new",
    component: () => <div>New service page</div>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      slugRoute.addChildren([overviewRoute, newServiceRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("ProviderShell", () => {
  it("shows the workspace's commission rate on a bookmarked deep link that never passes through Overview", async () => {
    renderShell("/provider/bela-vista/services/new");

    expect(await screen.findByText("New service page")).toBeInTheDocument();
    // 1200 basis points -> 12%, through Intl.NumberFormat's own percent
    // style. A hardcoded "10%" or a raw "1200" would both fail this.
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.getByText("Platform's share")).toBeInTheDocument();
  });

  it("shows the same rate on Overview too -- one place to keep true, not two", async () => {
    renderShell("/provider/bela-vista/overview");

    expect(await screen.findByText("Overview page")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
  });
});
