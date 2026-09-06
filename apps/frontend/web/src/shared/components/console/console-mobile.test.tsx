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

// Two threads with something unread → the Messages tab wears a "2".
vi.mock("@/features/messaging/viewmodel/use-provider-threads", () => ({
  useProviderThreads: () => ({
    threads: [{ unreadCount: 3 }, { unreadCount: 0 }, { unreadCount: 1 }],
    loading: false, hasMore: false, loadMore: () => {}, errorCode: null,
  }),
}));
vi.mock("@/features/provider/bookings/viewmodel/use-provider-bookings", () => ({
  useAwaitingCount: () => 0,
}));

const { ConsoleShell } = await import("./console-shell");
const { ConsoleActionBar } = await import("./console-action-bar");

/**
 * jsdom applies no CSS, so the tab bar and the sidebar are both in the DOM
 * at every width. These tests are about behaviour — what the bar holds, how
 * the sheet opens and closes, who owns the bottom edge — and never about
 * which of the two is visible. The e2e `@mobile` project covers that.
 */

const PROVIDER: ProviderSummary = {
  id: "p1", name: "Bela Vista Studio", slug: "bela-vista",
  type: "organization", status: "active", role: "owner",
};
const DETAIL: ProviderDetail = { ...PROVIDER, commissionBps: 1200 };
const USER: CurrentUserDTO = {
  id: "u1", email: "ana@example.com", role: "organization_owner", status: "active",
  createdAt: "2024-01-01T00:00:00.000Z", name: "Ana", firstName: "Ana", lastName: "M",
  displayName: "Ana", avatarUrl: null, avatarKey: null, phoneNumber: null, bio: null,
  language: "en-US", timezone: "Africa/Maputo", dateOfBirth: null, gender: null,
};

function DecidePage() {
  return (
    <ConsoleActionBar lead="One decision">
      <button type="button">Accept</button>
    </ConsoleActionBar>
  );
}

function renderAt(initialPath: string, providers: ProviderSummary[] = [PROVIDER]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["providers", "mine"], providers);
  qc.setQueryData(["providers", PROVIDER.id], DETAIL);
  qc.setQueryData(["user", "me"], USER);
  qc.setQueryData(["notifications", "provider", PROVIDER.id, "unread"], 0);

  const rootRoute = createRootRoute();
  const slugRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/provider/$slug",
    component: () => <ConsoleShell zone="workspace"><Outlet /></ConsoleShell>,
  });
  const overview = createRoute({ getParentRoute: () => slugRoute, path: "/overview", component: () => <div>Overview page</div> });
  const services = createRoute({ getParentRoute: () => slugRoute, path: "/services", component: () => <div>Services page</div> });
  const settings = createRoute({ getParentRoute: () => slugRoute, path: "/settings", component: () => <div>Settings page</div> });
  const decide = createRoute({ getParentRoute: () => slugRoute, path: "/decide", component: DecidePage });
  const router = createRouter({
    routeTree: rootRoute.addChildren([slugRoute.addChildren([overview, services, settings, decide])]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>);
}

const bar = () => screen.getByRole("navigation", { name: "Main navigation" });

afterEach(() => vi.restoreAllMocks());

describe("the tab bar", () => {
  it("carries the three primary items and Menu, with a count on Messages", async () => {
    renderAt("/provider/bela-vista/services");
    await screen.findByText("Services page");
    const tabs = within(bar());
    expect(tabs.getByRole("link", { name: /messages/i })).toHaveAttribute("href", "/provider/bela-vista/messages");
    expect(tabs.getByRole("link", { name: /calendar/i })).toBeInTheDocument();
    expect(tabs.getByRole("link", { name: /bookings/i })).toBeInTheDocument();
    expect(tabs.getByRole("button", { name: /menu/i })).toHaveAttribute("aria-expanded", "false");
    expect(tabs.getByRole("link", { name: /messages/i })).toHaveTextContent("2");
  });

  it("stands down while a screen owns the bottom edge", async () => {
    renderAt("/provider/bela-vista/decide");
    await screen.findByRole("button", { name: "Accept" });
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).not.toBeInTheDocument();
  });

  it("renders no sidebar at all below md — the bar and the sheet are the navigation", async () => {
    const original = window.matchMedia;
    window.matchMedia = (query: string) =>
      ({
        matches: query === "(max-width: 767px)", media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {},
        addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
    try {
      renderAt("/provider/bela-vista/services");
      await screen.findByText("Services page");
      expect(document.querySelector('[data-slot="sidebar"]')).toBeNull();
      expect(bar()).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("the menu sheet", () => {
  it("opens from the Menu tab with the whole menu, focuses its first item, and closes on Escape back to the tab", async () => {
    renderAt("/provider/bela-vista/services");
    await screen.findByText("Services page");
    const menu = within(bar()).getByRole("button", { name: /menu/i });

    // No focus before the click, as a Safari tap: the tab must take it itself
    // for the sheet to hand it back on close.
    fireEvent.click(menu);
    const sheet = await screen.findByRole("dialog", { name: /menu/i });
    expect(menu).toHaveAttribute("aria-expanded", "true");
    // The label span, not the whole anchor: the sheet carries the same badges
    // the sidebar does, so a link's text is "Messages" plus its count.
    const links = within(sheet).getAllByRole("link").map((a) => a.querySelector("span")?.textContent?.trim());
    expect(within(sheet).getByRole("link", { name: /messages/i })).toHaveTextContent("2");
    expect(links).toEqual(["Overview", "Bookings", "Messages", "Availability", "Services", "Members", "Wallet", "Activity", "Settings"]);
    expect(document.activeElement).toBe(within(sheet).getByRole("link", { name: "Overview" }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /menu/i })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(menu);
  });

  it("closes when a destination is picked", async () => {
    renderAt("/provider/bela-vista/services");
    await screen.findByText("Services page");
    fireEvent.click(within(bar()).getByRole("button", { name: /menu/i }));
    const sheet = await screen.findByRole("dialog", { name: /menu/i });

    fireEvent.click(within(sheet).getByRole("link", { name: "Settings" }));
    expect(await screen.findByText("Settings page")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /menu/i })).not.toBeInTheDocument();
  });

  it("closes on the backdrop", async () => {
    renderAt("/provider/bela-vista/services");
    await screen.findByText("Services page");
    fireEvent.click(within(bar()).getByRole("button", { name: /menu/i }));
    await screen.findByRole("dialog", { name: /menu/i });
    fireEvent.click(document.querySelector(".fixed.inset-0") as HTMLElement);
    expect(screen.queryByRole("dialog", { name: /menu/i })).not.toBeInTheDocument();
  });

  it("closes when the current page is picked again — a tap is an answer even when nothing moves", async () => {
    renderAt("/provider/bela-vista/services");
    await screen.findByText("Services page");
    fireEvent.click(within(bar()).getByRole("button", { name: /menu/i }));
    const sheet = await screen.findByRole("dialog", { name: /menu/i });
    fireEvent.click(within(sheet).getByRole("link", { name: /services/i }));
    expect(screen.queryByRole("dialog", { name: /menu/i })).not.toBeInTheDocument();
    expect(screen.getByText("Services page")).toBeInTheDocument();
  });

  it("lets a member of two workspaces switch from the sheet's head, and closes on the switch", async () => {
    const OTHER: ProviderSummary = { ...PROVIDER, id: "p2", name: "Outra Casa", slug: "outra-casa" };
    renderAt("/provider/bela-vista/services", [PROVIDER, OTHER]);
    await screen.findByText("Services page");
    fireEvent.click(within(bar()).getByRole("button", { name: /menu/i }));
    const sheet = await screen.findByRole("dialog", { name: /menu/i });
    expect(within(sheet).getByRole("button", { name: /bela vista studio/i })).toHaveAttribute("aria-current", "true");
    expect(within(sheet).getByRole("button", { name: /outra casa/i })).not.toHaveAttribute("aria-current");
    fireEvent.click(within(sheet).getByRole("button", { name: /outra casa/i }));
    expect(await screen.findByText("Overview page")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /menu/i })).not.toBeInTheDocument();
  });
});
