import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
import { usePageHeader } from "@/shared/lib/page-header";
import { ConsoleShell } from "./console-shell";

/**
 * Ported from `provider-shell.test.tsx`, whose two assertions this keeps
 * word for word: the rate must be on every path, not only the one that
 * happens to pass through Overview. Added: the platform zone renders through
 * the same component with the same header and no strip; a page with no
 * action gets no button; a workspace that is not live is told so on a deep
 * link, which is the whole reason the sentence moved here from Overview.
 */

const PROVIDER: ProviderSummary = {
  id: "p1", name: "Bela Vista Studio", slug: "bela-vista",
  type: "organization", status: "active", role: "owner",
};
// Not 10% — a component that ignored the prop and rendered the schema's own
// default would still show 10% here.
const DETAIL: ProviderDetail = {
  id: PROVIDER.id, name: PROVIDER.name, slug: PROVIDER.slug,
  type: "organization", status: "active", commissionBps: 1200,
};
const USER: CurrentUserDTO = {
  id: "u1", email: "ana@example.com", role: "organization_owner", status: "active",
  createdAt: "2024-01-01T00:00:00.000Z", name: "Ana", firstName: "Ana", lastName: "M",
  displayName: "Ana", avatarUrl: null, avatarKey: null, phoneNumber: null, bio: null,
  language: "en-US", timezone: "Africa/Maputo", dateOfBirth: null, gender: null,
};
const ADMIN: CurrentUserDTO = { ...USER, id: "u2", email: "root@example.com", role: "admin", name: "Root" };

function SettingsPage() {
  usePageHeader("Workspace settings", "Bela Vista Studio");
  return <div>Settings page</div>;
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

function renderWorkspace(initialPath: string, provider: ProviderSummary | null = PROVIDER) {
  const qc = client();
  qc.setQueryData(["providers", "mine"], provider ? [provider] : []);
  qc.setQueryData(["providers", PROVIDER.id], DETAIL);
  qc.setQueryData(["user", "me"], USER);
  qc.setQueryData(["notifications", "provider", PROVIDER.id, "unread"], 0);

  const rootRoute = createRootRoute();
  const slugRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/provider/$slug",
    component: () => (
      <ConsoleShell zone="workspace">
        <Outlet />
      </ConsoleShell>
    ),
  });
  const overview = createRoute({ getParentRoute: () => slugRoute, path: "/overview", component: () => <div>Overview page</div> });
  const newService = createRoute({ getParentRoute: () => slugRoute, path: "/services/new", component: () => <div>New service page</div> });
  const settings = createRoute({ getParentRoute: () => slugRoute, path: "/settings", component: SettingsPage });
  const router = createRouter({
    routeTree: rootRoute.addChildren([slugRoute.addChildren([overview, newService, settings])]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>);
}

function renderPlatform(initialPath: string) {
  const qc = client();
  qc.setQueryData(["user", "me"], ADMIN);
  qc.setQueryData(["notifications", "mine", "unread"], 0);

  const rootRoute = createRootRoute();
  const adminRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin",
    component: () => (
      <ConsoleShell zone="platform">
        <Outlet />
      </ConsoleShell>
    ),
  });
  const dashboard = createRoute({ getParentRoute: () => adminRoute, path: "/dashboard", component: () => <div>Dashboard page</div> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([adminRoute.addChildren([dashboard])]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>);
}

const sidebar = () => within(document.querySelector('[data-slot="sidebar"]') as HTMLElement);

afterEach(() => vi.restoreAllMocks());

describe("ConsoleShell · workspace", () => {
  it("shows the workspace's commission rate on a bookmarked deep link that never passes through Overview", async () => {
    renderWorkspace("/provider/bela-vista/services/new");
    expect(await screen.findByText("New service page")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.getByText("Platform's share")).toBeInTheDocument();
  });

  it("shows the same rate on Overview too — one place to keep true, not two", async () => {
    renderWorkspace("/provider/bela-vista/overview");
    expect(await screen.findByText("Overview page")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
  });

  it("tells a workspace that is not live so, on the same deep link — the sentence is in the shell, not on Overview", async () => {
    renderWorkspace("/provider/bela-vista/services/new", { ...PROVIDER, status: "pending" });
    expect(await screen.findByText("New service page")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("This business is awaiting approval");
    expect(screen.queryByText("Platform's share")).not.toBeInTheDocument();
  });

  it("draws no strip at all when there is no workspace yet", async () => {
    renderWorkspace("/provider/bela-vista/overview", null);
    expect(await screen.findByText("Overview page")).toBeInTheDocument();
    expect(screen.queryByText("Platform's share")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("puts the page's title in the header, and no button where the page set no action", async () => {
    renderWorkspace("/provider/bela-vista/settings");
    expect(await screen.findByText("Settings page")).toBeInTheDocument();
    // Awaited, not read synchronously: the title reaches the header through
    // `usePageHeader`'s effect, one commit after the page body is on screen.
    expect(await screen.findByText("Workspace settings")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new service/i })).not.toBeInTheDocument();
  });

  it("lists home, then Work, then Manage, with the slug filled in", async () => {
    renderWorkspace("/provider/bela-vista/overview");
    await screen.findByText("Overview page");
    const links = sidebar().getAllByRole("link").map((a) => a.textContent?.trim());
    expect(links).toEqual(["Overview", "Messages", "Availability", "Services", "Members", "Wallet", "Activity", "Settings"]);
    expect(sidebar().getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/provider/bela-vista/messages");
    expect(sidebar().queryByRole("link", { name: "Notifications" })).not.toBeInTheDocument();
    expect(sidebar().getByRole("link", { name: "Overview" })).toHaveAttribute("data-active", "true");
  });

  it("keeps the bell — a phone's only route to the inbox — at 44px, linked to the workspace inbox", async () => {
    renderWorkspace("/provider/bela-vista/overview");
    await screen.findByText("Overview page");
    const bell = screen.getByRole("link", { name: "Notifications" });
    expect(bell).toHaveAttribute("href", "/provider/bela-vista/notifications");
    expect(bell).toHaveClass("h-11", "w-11", "md:h-9", "md:w-9");
  });

  it("clears the header when a page that set a title gives way to one that sets none", async () => {
    renderWorkspace("/provider/bela-vista/settings");
    await screen.findByText("Settings page");
    expect(screen.getByText("Workspace settings")).toBeInTheDocument();
    fireEvent.click(sidebar().getByRole("link", { name: "Overview" }));
    await screen.findByText("Overview page");
    expect(screen.queryByText("Workspace settings")).not.toBeInTheDocument();
  });
});

describe("ConsoleShell · platform", () => {
  it("renders the platform's menu through the same shell, with no workspace strip", async () => {
    renderPlatform("/admin/dashboard");
    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
    const links = sidebar().getAllByRole("link").map((a) => a.textContent?.trim());
    expect(links).toEqual(["Dashboard", "Providers", "Reviews", "Users", "Activity", "Categories"]);
    expect(sidebar().getByText("Admin")).toBeInTheDocument();
    expect(screen.queryByText("Platform's share")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
