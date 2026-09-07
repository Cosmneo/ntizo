import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { PageHeaderContext, type PageHeaderState } from "@/shared/lib/page-header";
import { parseAdminQueueSearch } from "@/features/admin/bookings/domain/queue-search";
import { parseProvidersSearch } from "@/features/admin/providers/domain/providers-search";
import { DashboardPage } from "../dashboard";

/**
 * Five queries, one seam: the wire. Each answers by the operation name in the
 * document it is handed, as the provider Overview's test does. The signed-in
 * user is stood in for at the hook — the greeting needs a first name, and
 * that is all it needs.
 */
const fakes = vi.hoisted(() => ({ session: vi.fn() }));

vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>()),
  sessionGraphql: fakes.session,
}));

vi.mock("@/features/user/viewmodel/use-current-user", () => ({
  useCurrentUser: () => ({ data: { firstName: "Salif", name: "Salif Faustino" }, isLoading: false }),
}));

const TODAY = new Date();
const iso = (back: number) => new Date(TODAY.getTime() - back * 86_400_000).toISOString().slice(0, 10);

const STATS = {
  disputed: 2,
  confirmedLast30: 12,
  completedLast30: 9,
  grossLast30Minor: 124_000_000,
  commissionLast30Minor: 12_400_000,
  newProvidersLast30: 3,
  currency: "MZN",
  perDay: Array.from({ length: 30 }, (_, i) => ({
    date: iso(29 - i),
    requests: i === 29 ? 4 : i % 7 === 0 ? 1 : 0,
    confirmed: i === 29 ? 2 : 0,
  })),
};

const COUNTS = { pending: 4, active: 40, rejected: 1, suspended: 0, archived: 2 };

function application(id: string, name: string, status = "pending") {
  return {
    id, name, slug: id, type: "individual", status, description: null,
    city: "Maputo", country: "MZ", commissionBps: 1000, ownerEmail: `${id}@ntizo.test`,
    createdAt: "2026-09-05T08:00:00.000Z",
  };
}

function Shell({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<PageHeaderState>({ title: "" });
  const [action, setAction] = useState<ReactNode>(null);
  return (
    <PageHeaderContext.Provider value={{ header, setHeader, action, setAction }}>
      <header>
        <h1>{header.title}</h1>
        <p>{header.subtitle ?? ""}</p>
        <div>{action}</div>
      </header>
      {children}
    </PageHeaderContext.Provider>
  );
}

function renderDashboard({
  stats = STATS,
  statsFails = false,
  counts = COUNTS,
  supportOpen = 1,
  contactOpen = 3,
  applications = [application("p1", "Estúdio Mavalane"), application("p2", "Salão Beira", "active")],
}: {
  stats?: typeof STATS;
  statsFails?: boolean;
  counts?: typeof COUNTS;
  supportOpen?: number;
  contactOpen?: number;
  applications?: ReturnType<typeof application>[];
} = {}) {
  fakes.session.mockReset();
  fakes.session.mockImplementation(async (query: string) => {
    if (query.includes("BookingStatsForAdmin")) {
      if (statsFails) throw new Error("the numbers are unreachable");
      return { bookingStatsForAdmin: stats };
    }
    if (query.includes("ProviderCountByStatusForAdmin")) return { providerCountByStatusForAdmin: counts };
    if (query.includes("SupportOpenCount")) return { supportOpenCount: { count: supportOpen } };
    if (query.includes("ContactRequestAllForAdmin")) {
      return { contactRequestAllForAdmin: { items: [], total: contactOpen, openCount: contactOpen } };
    }
    if (query.includes("ProviderAllForAdmin")) return { providerAllForAdmin: applications };
    return {};
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const routes = [
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/admin/dashboard",
      component: () => (
        <Shell>
          <DashboardPage />
        </Shell>
      ),
    }),
    createRoute({ getParentRoute: () => rootRoute, path: "/admin/bookings", validateSearch: parseAdminQueueSearch, component: () => <p>bookings</p> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/admin/providers/", validateSearch: parseProvidersSearch, component: () => <p>providers</p> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/admin/providers/$providerId", component: () => <p>provider</p> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/admin/support/", component: () => <p>support</p> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/admin/contact", component: () => <p>contact</p> }),
  ];
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/admin/dashboard"] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** The one render where the stats are committed: `12` is `confirmedLast30` and appears nowhere else. */
async function waitForStats() {
  await screen.findByText("12");
}

describe("DashboardPage", () => {
  it("greets the administrator by first name and says what the page is", async () => {
    renderDashboard();
    expect(
      await screen.findByRole("heading", { name: /^(Good morning|Good afternoon|Good evening), Salif$/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("What needs you, how the last 30 days went, and who applied.")).toBeInTheDocument();
  });

  it("opens with the three most-owed things, each linking into its queue already narrowed", async () => {
    renderDashboard();
    expect(await screen.findByText("Disputes to decide")).toBeInTheDocument();
    expect(screen.getByText("Providers awaiting review")).toBeInTheDocument();
    expect(screen.getByText("Open support requests")).toBeInTheDocument();
    // Four sources, three cards: contact is fourth in priority and stays off.
    expect(screen.queryByText("Contact messages open")).toBeNull();

    expect(screen.getByRole("link", { name: "Decide" })).toHaveAttribute("href", "/admin/bookings?tab=disputed");
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute("href", "/admin/providers?status=pending");
    expect(screen.getByRole("link", { name: "Answer" })).toHaveAttribute("href", "/admin/support");
  });

  it("lets contact in when something above it is quiet", async () => {
    renderDashboard({ stats: { ...STATS, disputed: 0 } });
    expect(await screen.findByText("Contact messages open")).toBeInTheDocument();
    expect(screen.queryByText("Disputes to decide")).toBeNull();
  });

  it("opens straight onto the numbers on a quiet day", async () => {
    renderDashboard({ stats: { ...STATS, disputed: 0 }, counts: { ...COUNTS, pending: 0 }, supportOpen: 0, contactOpen: 0 });
    await waitForStats();
    for (const label of ["Disputes to decide", "Providers awaiting review", "Open support requests", "Contact messages open"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.getByText("Bookings (30 days)")).toBeInTheDocument();
  });

  it("shows the thirty days: bookings, the gross, the commission, the new providers", async () => {
    renderDashboard();
    await waitForStats();
    expect(screen.getByText("9 completed")).toBeInTheDocument();
    // 124 000 000 minor units — the gross, what customers paid.
    expect(screen.getByText(/1,240,000/)).toBeInTheDocument();
    expect(screen.getByText("What customers paid for completed work.")).toBeInTheDocument();
    // 12 400 000 minor units — the platform's cut.
    expect(screen.getByText(/124,000\.00/)).toBeInTheDocument();
    expect(screen.getByText("New providers (30 days)")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("says why the gross is zero when nothing has been completed", async () => {
    renderDashboard({ stats: { ...STATS, completedLast30: 0, grossLast30Minor: 0, commissionLast30Minor: 0 } });
    expect(await screen.findByText("Nothing completed in the last 30 days yet.")).toBeInTheDocument();
    expect(screen.queryByText("What customers paid for completed work.")).toBeNull();
  });

  it("draws the platform's thirty days and a table for everyone else", async () => {
    renderDashboard();
    await waitForStats();
    const table = screen.getByRole("table", { name: /requests and confirmations/i });
    expect(within(table).getAllByRole("row")).toHaveLength(31);
  });

  it("lists the newest applications and links to all of them", async () => {
    renderDashboard();
    expect(await screen.findByText("Latest applications")).toBeInTheDocument();
    // `findAllByRole`, not `findByRole`: `CollectionCard` draws every row
    // twice — a desktop table and a mobile card, see its own docstring — so
    // the row's name is present twice in the tree; the table's copy is first.
    const [applicationLink] = await screen.findAllByRole("link", { name: "Estúdio Mavalane" });
    expect(applicationLink).toHaveAttribute("href", "/admin/providers/p1");
    expect(screen.getByRole("link", { name: "See all providers" })).toHaveAttribute("href", "/admin/providers");
    const call = fakes.session.mock.calls.find((c) => String(c[0]).includes("ProviderAllForAdmin"));
    expect(call?.[1]).toMatchObject({ input: { limit: 5 } });
  });

  it("says so when the numbers cannot be read, and offers to ask again", async () => {
    renderDashboard({ statsFails: true });
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load the numbers/i);
    const asked = () => fakes.session.mock.calls.filter((c) => String(c[0]).includes("BookingStatsForAdmin")).length;
    const before = asked();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(asked()).toBeGreaterThan(before);
  });
});
