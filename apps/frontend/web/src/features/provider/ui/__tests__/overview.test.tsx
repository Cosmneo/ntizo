import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ProviderBookingDTO } from "@ntizo/shared/read-models";
import i18n from "@/shared/lib/i18n";
import { PageHeaderContext, type PageHeaderState } from "@/shared/lib/page-header";
import { PROVIDER_TABS, type ProviderTab } from "../../bookings/domain/status";
import { OverviewPage } from "../overview";

/**
 * Five queries, one seam: the wire.
 *
 * The page reads bookings, stats, services and threads over `sessionGraphql`
 * and the workspace's public rating over `publicGraphql`, so both transports
 * are stood in for and each answers by the operation name in the query it is
 * handed. Mocking the hooks instead would assert nothing about the query
 * keys, the `enabled` guards or the shapes the repositories unwrap — and
 * `vi.mock` names a module rather than importing one, so no `ui -> data` edge
 * is created and the boundaries policy is untouched.
 *
 * `importOriginal` on the session transport rather than a bare factory:
 * `messagingErrorCode` — which `useProviderThreads` calls on every render —
 * does `instanceof GraphqlError`, and a mock missing that export throws the
 * moment it is read.
 *
 * The workspace is stood in for because `useActiveProvider` reads the
 * session's provider list over the same wire; a page that had to wait for it
 * would make every assertion here about two round trips instead of one.
 */
const fakes = vi.hoisted(() => ({ session: vi.fn(), publik: vi.fn() }));

vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>()),
  sessionGraphql: fakes.session,
}));

vi.mock("@/shared/lib/graphql/public-graphql", () => ({
  publicGraphql: fakes.publik,
}));

vi.mock("@/features/provider/viewmodel/use-active-provider", () => ({
  useActiveProvider: () => ({
    providers: [],
    activeProvider: {
      id: "prov-1",
      slug: "estudio",
      name: "Estúdio Mavalane",
      type: "organization",
      status: "active",
      role: "owner",
    },
    setActive: () => {},
    loading: false,
    error: null,
    refresh: () => {},
  }),
}));

/**
 * The same validator the real bookings route carries, duplicated rather than
 * imported: `src/routes/**` is the `routes` element and a `ui` file may not
 * import one, test files included. What matters is that the harness accepts
 * the same `?tab=` the address bar does, or "the card links to the requests"
 * would be a claim about this file's leniency.
 */
function validateSearch(search: Record<string, unknown>): { tab?: ProviderTab } {
  const tab = search["tab"];
  return {
    tab:
      typeof tab === "string" && (PROVIDER_TABS as readonly string[]).includes(tab)
        ? (tab as ProviderTab)
        : undefined,
  };
}

const TODAY = new Date();
const iso = (back: number) =>
  new Date(TODAY.getTime() - back * 86_400_000).toISOString().slice(0, 10);

/**
 * Thirty days, oldest first, as the read model promises — a quiet month with
 * one request every seventh day and a busy last day. Deliberately not flat:
 * a fixture where every day is the same cannot fail on a chart that draws
 * the wrong day, and the tooltip test below hovers two of them by index.
 */
const STATS = {
  awaitingResponse: 3,
  awaitingPayment: 1,
  upcomingToday: 2,
  upcomingWeek: 5,
  completedLast30: 9,
  declinedLast30: 1,
  revenueLast30Minor: 1_240_000,
  pipelineMinor: 630_000,
  currency: "MZN",
  perDay: Array.from({ length: 30 }, (_, i) => ({
    date: iso(29 - i),
    requests: i === 29 ? 4 : i % 7 === 0 ? 1 : 0,
    confirmed: i === 29 ? 2 : 0,
  })),
};

/**
 * A recent booking. `CONFIRMED`, not `AWAITING_PROVIDER`, and that is not
 * arbitrary: the awaiting badge reads "Por responder" — the same words as the
 * first card's label — and a row carrying it would make every assertion about
 * that card ambiguous between the number and a row's status pill.
 */
function bookingFixture(over: Partial<ProviderBookingDTO> = {}): ProviderBookingDTO {
  return {
    id: "bk-1",
    status: "CONFIRMED",
    createdAt: "2026-09-02T08:00:00.000Z",
    serviceId: "svc-1",
    serviceOptionId: "opt-1",
    serviceName: "Corte de cabelo",
    optionName: "Corte",
    durationMinutes: 60,
    locationType: "at_provider",
    providerMemberId: "mem-1",
    memberFirstName: "Célia",
    customerFirstName: "Ana",
    startsAt: "2026-09-05T09:00:00.000Z",
    endsAt: "2026-09-05T10:00:00.000Z",
    timezone: "Africa/Maputo",
    addressDistrict: null,
    addressCity: "Maputo",
    priceMinor: 80000,
    commissionBps: 1000,
    commissionMinor: 8000,
    currency: "MZN",
    respondBy: null,
    ...over,
  };
}

/** Only `status` is read by the dashboard; the rest is what the wire actually sends. */
function serviceFixture(id: string, status: "published" | "draft") {
  return {
    id,
    categoryId: "cat-1",
    categoryCode: "hair",
    sourceLocale: "pt-MZ",
    locationType: "at_provider",
    bookingMode: "instant",
    status,
    imageUrls: [],
    imageKeys: [],
    translations: [{ locale: "pt-MZ", name: `Serviço ${id}`, description: null }],
    options: [],
    memberIds: [],
  };
}

/** Two conversations, two unread between them — the number the card shows. */
const THREADS = [
  {
    id: "t1",
    providerId: "prov-1",
    providerName: "Estúdio Mavalane",
    customerName: "Ana",
    lastMessageAt: "2026-09-02T09:00:00.000Z",
    lastMessagePreview: "Bom dia, tem vaga sexta?",
    lastMessageHasAttachment: false,
    unreadCount: 2,
  },
  {
    id: "t2",
    providerId: "prov-1",
    providerName: "Estúdio Mavalane",
    customerName: "Bruno",
    lastMessageAt: "2026-09-01T09:00:00.000Z",
    lastMessagePreview: "Obrigado!",
    lastMessageHasAttachment: false,
    unreadCount: 0,
  },
];

const REVIEWS = {
  summary: {
    average: 4.8,
    count: 12,
    histogram: { one: 0, two: 0, three: 1, four: 2, five: 9 },
  },
  reviews: [],
};

/**
 * Mirrors how `ProviderShell` supplies the header context — two `useState`
 * and a value assembled inline — so the greeting and the page's own action
 * are asserted where a reader actually meets them rather than where the page
 * happens to declare them.
 */
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

function renderOverview({ statsFails = false }: { statsFails?: boolean } = {}) {
  fakes.session.mockReset();
  fakes.publik.mockReset();
  fakes.session.mockImplementation(async (query: string) => {
    if (query.includes("BookingStatsForProvider")) {
      if (statsFails) throw new Error("the numbers are unreachable");
      return { bookingStatsForProvider: STATS };
    }
    if (query.includes("BookingForProvider")) {
      return {
        bookingForProvider: {
          items: [
            bookingFixture(),
            bookingFixture({
              id: "bk-2",
              customerFirstName: "Bruno",
              serviceName: "Manicure",
            }),
          ],
          total: 2,
          nextOffset: null,
          members: [{ id: "mem-1", firstName: "Célia" }],
        },
      };
    }
    if (query.includes("ServiceMine")) {
      return {
        serviceMine: [
          serviceFixture("svc-1", "published"),
          serviceFixture("svc-2", "published"),
          serviceFixture("svc-3", "draft"),
        ],
      };
    }
    if (query.includes("ProviderThreads")) {
      return { communicationProviderThreads: { items: THREADS, nextCursor: null } };
    }
    return {};
  });
  fakes.publik.mockImplementation(async (query: string) => {
    if (query.includes("ProviderReviews")) return { reviewByProvider: REVIEWS };
    return {};
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const rootRoute = createRootRoute();
  const overviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/provider/$slug/overview",
    component: () => (
      <Shell>
        <OverviewPage />
      </Shell>
    ),
  });
  /**
   * Every destination the page links to is registered, so an `href` is the
   * router's own answer rather than a string this file wrote down. A `to`
   * with no matching route would resolve to something that looks plausible
   * and navigates nowhere.
   */
  const routes = [
    overviewRoute,
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/provider/$slug/bookings",
      validateSearch,
      component: () => <p>bookings</p>,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/provider/$slug/bookings/$bookingId",
      component: () => <p>booking</p>,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/provider/$slug/services",
      component: () => <p>services</p>,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/provider/$slug/messages",
      component: () => <p>messages</p>,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/providers/$slug",
      component: () => <p>public page</p>,
    }),
  ];

  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/provider/estudio/overview"] }),
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** The chart's own `section`, found through the accessible copy of its data. */
function chart() {
  return screen
    .getByRole("table", { name: /pedidos e confirmações/i })
    .closest("section")!;
}

/**
 * The locale is pinned, not inherited: every assertion here reads Portuguese
 * copy and the suite's default resolves to English (`test/setup.ts` says so).
 */
beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("OverviewPage", () => {
  it("greets the workspace by name and offers the way into the bookings", async () => {
    renderOverview();

    expect(
      await screen.findByRole("heading", {
        name: /^(Bom dia|Boa tarde|Boa noite), Estúdio Mavalane$/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver reservas" })).toHaveAttribute(
      "href",
      "/provider/estudio/bookings",
    );
  });

  it("leads with the number that is a task, and links it to the requests", async () => {
    renderOverview();

    expect(await screen.findByText("Por responder")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Responder" })).toHaveAttribute(
      "href",
      expect.stringContaining("/provider/estudio/bookings"),
    );
  });

  it("gives no verb to the readings that are not tasks", async () => {
    renderOverview();
    await screen.findByText("Por responder");

    // A card's label and its action are siblings inside the card's body, so
    // the label's parent *is* the card.
    const card = (label: string) => within(screen.getByText(label).parentElement!);
    // The week and the revenue are readings, not work. An action on either
    // would make three calls to action out of one, and the card that is
    // actually a task would stop being the one that stands out.
    expect(card("Próximos 7 dias").queryByRole("link")).toBeNull();
    expect(card("Receita (30 dias)").queryByRole("link")).toBeNull();
    expect(card("Por responder").getByRole("link")).toHaveTextContent("Responder");
  });

  it("shows the week with today inside it", async () => {
    renderOverview();

    expect(await screen.findByText("Próximos 7 dias")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2 hoje")).toBeInTheDocument();
  });

  it("shows the provider's share, not the listed price", async () => {
    renderOverview();

    // 1 240 000 minor units, already net of commission.
    expect(await screen.findByText(/12[\s .]?400/)).toBeInTheDocument();
    expect(screen.getByText(/6[\s .]?300/)).toBeInTheDocument(); // the pipeline line
    // …and the card says which of the two figures it is, or the provider has
    // no way to tell the payout from the listed price.
    expect(screen.getByText("Já descontada a comissão.")).toBeInTheDocument();
  });

  it("shows the public rating and links to where it is written", async () => {
    renderOverview();

    expect(await screen.findByText("Avaliação")).toBeInTheDocument();
    expect(screen.getByText("4,8")).toBeInTheDocument();
    expect(screen.getByText("12 avaliações")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver avaliações" })).toHaveAttribute(
      "href",
      "/providers/estudio",
    );
  });

  it("draws a bar for every day that has something and a table for everyone else", async () => {
    renderOverview();
    await screen.findByText("Por responder");

    // The sr-only table is the accessible copy: thirty rows, one per day.
    const table = screen.getByRole("table", { name: /pedidos e confirmações/i });
    expect(within(table).getAllByRole("row")).toHaveLength(31); // 30 days + the header
  });

  /**
   * Controller ruling R8. A tooltip pinned with a flat `translateX(-50%)`
   * hangs half its width past the card on the first day and the last. The
   * shift is now the hovered day's own position across the plot, expressed as
   * a percentage of the tooltip's *own* width — which is exactly the quantity
   * that keeps its left edge at `centre × (card − tooltip)`, never negative,
   * for any label no wider than the card and at any viewport.
   */
  it("never lets the first day's tooltip hang off the card, and still centres the middle", async () => {
    renderOverview();
    await screen.findByText("Por responder");
    const days = chart().querySelectorAll("svg rect");
    expect(days).toHaveLength(30);

    // `mouseOver`, not `mouseEnter`: React synthesises `onMouseEnter` from
    // the bubbling `mouseover`, and a dispatched native `mouseenter` reaches
    // no listener at all.
    fireEvent.mouseOver(days[0]!);
    const first = await screen.findByText(/1 pedidos, 0 confirmadas/);
    // Anchored 1.67% into the plot and pulled back by 1.67% of its own width:
    // the two cancel to a left edge inside the card rather than half a label
    // outside it.
    expect(Number.parseFloat(first.style.left)).toBeCloseTo(1.67, 2);
    expect(first.style.transform).toBe("translateX(-1.67%)");

    fireEvent.mouseOver(days[15]!);
    const middle = await screen.findByText(/0 pedidos, 0 confirmadas/);
    // The middle of the window keeps the centring it always had.
    expect(Number.parseFloat(middle.style.left)).toBeCloseTo(51.67, 2);
    expect(middle.style.transform).toBe("translateX(-51.67%)");
  });

  it("lists the recent bookings and links to all of them", async () => {
    renderOverview();

    expect(await screen.findByText("Reservas recentes")).toBeInTheDocument();
    expect(screen.getAllByText("Ana").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Ver todas" })).toBeInTheDocument();
  });

  it("leaves the price off the recent list — the dashboard is not the ledger", async () => {
    renderOverview();
    await screen.findByText("Reservas recentes");

    const table = screen
      .getAllByRole("table")
      .find((t) => within(t).queryByText("Ana") !== null)!;
    expect(within(table).queryByRole("columnheader", { name: "Preço" })).toBeNull();
    expect(within(table).getByRole("columnheader", { name: "Cliente" })).toBeInTheDocument();
  });

  it("counts the services and the unread messages", async () => {
    renderOverview();

    expect(await screen.findByText("2 publicados")).toBeInTheDocument();
    expect(screen.getByText("1 rascunhos")).toBeInTheDocument();
    expect(screen.getByText("2 por ler")).toBeInTheDocument();
  });

  it("says so when the numbers cannot be read, and offers to ask again", async () => {
    renderOverview({ statsFails: true });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /não foi possível carregar/i,
    );

    const asked = () =>
      fakes.session.mock.calls.filter((call) =>
        String(call[0]).includes("BookingStatsForProvider"),
      ).length;
    const before = asked();
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(asked()).toBeGreaterThan(before);
  });
});
