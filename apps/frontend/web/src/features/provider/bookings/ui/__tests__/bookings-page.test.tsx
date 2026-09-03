import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLayoutEffect } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useSearch,
} from "@tanstack/react-router";
import type {
  ProviderBookingDTO,
  ProviderBookingPageDTO,
} from "@ntizo/shared/read-models";
import i18n from "@/shared/lib/i18n";
import { PROVIDER_TABS, type ProviderTab } from "../../domain/status";
import { BookingsPage } from "../bookings-page";

/**
 * The network is the seam, and it is the only one.
 *
 * `sessionGraphql` rather than the repository or the hook: everything between
 * the page and the wire is this feature's own — the query key, the `enabled`
 * guard, the trimmed `q`, the paging input — and a mocked hook handed a
 * ready-made page would assert none of it. `vi.mock` names a module rather
 * than importing one, so no `ui -> data` edge is created and the boundaries
 * policy is untouched.
 *
 * The workspace is stood in for because `useActiveProvider` reads the session's
 * provider list over the same wire, and a page that has to wait for it before
 * it asks for anything would make every assertion below about two requests
 * instead of one.
 */
const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));

vi.mock("@/shared/lib/graphql/session-graphql", () => ({
  sessionGraphql: fakes.graphql,
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
 * The same validator the real route carries, duplicated rather than imported.
 *
 * `src/routes/**` is the `routes` element and a `ui` file may not import one,
 * test files included. Duplicating six lines is the price of the rule; what
 * matters is that the harness rejects the same values the address bar does,
 * or "the tab is in the URL" would be a claim about this file's leniency.
 */
function validateSearch(search: Record<string, unknown>): {
  tab?: ProviderTab;
  member?: string;
} {
  const tab = search["tab"];
  const member = search["member"];
  return {
    tab:
      typeof tab === "string" && (PROVIDER_TABS as readonly string[]).includes(tab)
        ? (tab as ProviderTab)
        : undefined,
    member: typeof member === "string" && member !== "" ? member : undefined,
  };
}

/**
 * A deadline 90 minutes and half a minute out, built when the fixture is.
 *
 * `timeLeftWording` floors the gap to whole minutes, so a deadline exactly 90
 * minutes ahead reads "1h29" the instant a millisecond passes between
 * building the row and rendering it. The extra half minute is the margin that
 * makes "1h30" the answer for any run that takes less than thirty seconds.
 */
function inNinetyMinutes(): string {
  return new Date(Date.now() + 90 * 60_000 + 30_000).toISOString();
}

function bookingFixture(over: Partial<ProviderBookingDTO> = {}): ProviderBookingDTO {
  return {
    id: "bk-1",
    status: "AWAITING_PROVIDER",
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
    respondBy: inNinetyMinutes(),
    ...over,
  };
}

/**
 * Two requests, deliberately not interchangeable: the second names a
 * different service and a deadline hours away, so every assertion below
 * belongs to one row rather than to whichever row happened to render first.
 */
function pageFixture(): ProviderBookingPageDTO {
  return {
    items: [
      bookingFixture(),
      bookingFixture({
        id: "bk-2",
        customerFirstName: "Bruno",
        serviceName: "Manicure",
        respondBy: new Date(Date.now() + 5 * 60 * 60_000).toISOString(),
      }),
    ],
    total: 2,
    nextOffset: null,
    members: [{ id: "mem-1", firstName: "Célia" }],
  };
}

const EMPTY_PAGE: ProviderBookingPageDTO = {
  items: [],
  total: 0,
  nextOffset: null,
  members: [],
};

/**
 * What the server answers with. A function when the test is about *what was
 * asked for* — the pager's whole behaviour is that the second request returns
 * different rows from the first, and the tab's is that two tabs answer
 * differently; a mock that answers identically whatever it is handed cannot
 * fail on anything that turns on the difference.
 */
type Answer =
  | ProviderBookingPageDTO
  | ((input: { tab: ProviderTab; offset: number }) => ProviderBookingPageDTO);

function renderBookings(at: string, answer: Answer = pageFixture()) {
  fakes.graphql.mockReset();
  fakes.graphql.mockImplementation(
    (_query: string, variables: { input: { tab: ProviderTab; offset: number } }) =>
      Promise.resolve({
        bookingForProvider:
          typeof answer === "function" ? answer(variables.input) : answer,
      }),
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  /**
   * Every commit's DOM, as the browser would have painted it.
   *
   * The defect this exists for is one frame long: passive effects run *after*
   * the paint, so a filter reset that lived in one draws the previous filter's
   * rows once before correcting itself. `act()` flushes those effects before
   * it returns, so nothing an assertion can reach afterwards tells the two
   * apart — the frame has to be recorded as it happens. A *layout* effect runs
   * once the commit's DOM mutations are applied and before the browser paints,
   * which is exactly that moment; subscribing to the router's own state is
   * what re-renders this recorder in the same commit as the page it watches.
   */
  const frames: { tab: string; rows: string[] }[] = [];
  const rootRoute = createRootRoute();
  const listRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/provider/$slug/bookings",
    validateSearch,
    // The recorder wraps the page rather than sitting at the root, and it
    // subscribes to `useSearch` — the very thing the page reads its tab from.
    // The router publishes a new `location` one commit before a match's search
    // reaches the components under it, so a recorder subscribed to the
    // location renders one commit too early and never sees the frame that
    // matters. Being the page's parent on the same subscription puts it in
    // exactly the commit the page changes tab in.
    component: function Recorded() {
      useSearch({ strict: false });
      useLayoutEffect(() => {
        frames.push({
          tab:
            document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ??
            "",
          rows: Array.from(document.querySelectorAll("table a")).map(
            (a) => a.textContent ?? "",
          ),
        });
      });
      return <BookingsPage />;
    },
  });
  // Registered so "opens a row" is asserted against the router's own resolved
  // location rather than a mocked `navigate`, which passes even when the
  // `to`/`params` shape is wrong. The page itself is Task 11's.
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/provider/$slug/bookings/$bookingId",
    component: () => <p>booking page</p>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([listRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: [at] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { router, frames };
}

/**
 * One row of the table, by the customer it belongs to.
 *
 * jsdom applies no CSS, so `CollectionCard`'s two layouts — the table from
 * `md` and the stacked cards below it — are both in the document and every
 * value on a row is present twice. Naming the table's row picks one of them,
 * and asserts that the service, the status and the countdown are on the *same*
 * row rather than merely somewhere on the page.
 */
async function row(customer: string) {
  const table = await screen.findByRole("table");
  const cell = await within(table).findByText(customer);
  return within(cell.closest("tr")!);
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

describe("BookingsPage", () => {
  it("lists the requests with the customer, the service, the time and a countdown", async () => {
    renderBookings("/provider/estudio/bookings");

    const ana = await row("Ana");
    expect(ana.getByText("Corte de cabelo · Célia")).toBeInTheDocument();
    expect(ana.getByText("Por responder")).toBeInTheDocument();
    expect(ana.getByText(/1h30/)).toBeInTheDocument();
  });

  it("switches tab through the URL, so a tab survives a refresh", async () => {
    const { router } = renderBookings("/provider/estudio/bookings");
    await row("Ana");

    await userEvent.click(screen.getByRole("tab", { name: /histórico/i }));

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ tab: "history" }),
    );
  });

  it("names the empty tab", async () => {
    renderBookings("/provider/estudio/bookings?tab=requests", EMPTY_PAGE);

    const table = await screen.findByRole("table");
    expect(
      await within(table).findByText("Nenhum pedido por responder"),
    ).toBeInTheDocument();
  });

  it("adds the next page under the ones already shown", async () => {
    const members = [{ id: "mem-1", firstName: "Célia" }];
    const first: ProviderBookingPageDTO = {
      items: [
        bookingFixture(),
        bookingFixture({ id: "bk-2", customerFirstName: "Bruno", serviceName: "Manicure" }),
      ],
      total: 3,
      nextOffset: 20,
      members,
    };
    const second: ProviderBookingPageDTO = {
      items: [
        bookingFixture({ id: "bk-3", customerFirstName: "Carla", serviceName: "Tranças" }),
      ],
      total: 3,
      nextOffset: null,
      members,
    };
    renderBookings("/provider/estudio/bookings", ({ offset }) =>
      offset === 0 ? first : second,
    );
    await row("Ana");

    await userEvent.click(screen.getByRole("button", { name: "Mais" }));

    // The third row arrives *and* the first two are still there — a pager
    // that replaced the page would pass the first half of this on its own.
    const table = within(await screen.findByRole("table"));
    expect(await table.findByText("Carla")).toBeInTheDocument();
    expect(table.getByText("Ana")).toBeInTheDocument();
    expect(table.getByText("Bruno")).toBeInTheDocument();
    expect(screen.getByText("A mostrar 3 de 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mais" })).not.toBeInTheDocument();
  });

  it("never paints the previous tab's rows under the new tab", async () => {
    const members = [{ id: "mem-1", firstName: "Célia" }];
    const byTab = ({ tab }: { tab: ProviderTab }): ProviderBookingPageDTO =>
      tab === "history"
        ? {
            items: [
              bookingFixture({
                id: "bk-9",
                customerFirstName: "Dina",
                serviceName: "Massagem",
                status: "COMPLETED",
                respondBy: null,
              }),
            ],
            total: 1,
            nextOffset: null,
            members,
          }
        : { items: [bookingFixture()], total: 1, nextOffset: null, members };

    const { frames } = renderBookings("/provider/estudio/bookings", byTab);
    // Both tabs are visited first, so the second visit to "Histórico" is
    // answered from cache — which is the whole of the defect. An uncached tab
    // has no data on the render the tab changes in, so it could not have shown
    // the previous one's rows even with the reset an effect late.
    await row("Ana");
    await userEvent.click(screen.getByRole("tab", { name: "Histórico" }));
    await row("Dina");
    await userEvent.click(screen.getByRole("tab", { name: "Pedidos" }));
    await row("Ana");

    const before = frames.length;
    await userEvent.click(screen.getByRole("tab", { name: "Histórico" }));

    await row("Dina");
    const table = within(await screen.findByRole("table"));
    expect(table.queryByText("Ana")).not.toBeInTheDocument();
    // …and not in any frame in between either. This is the assertion that
    // fails when the reset lives in an effect: the commit the tab change makes
    // still holds "Pedidos" rows, and only the commit after it does not.
    expect(
      frames.slice(before).filter((f) => f.tab === "Histórico" && f.rows.includes("Ana")),
    ).toEqual([]);
  });

  it("opens a row on its own page", async () => {
    const { router } = renderBookings("/provider/estudio/bookings");

    await userEvent.click((await row("Ana")).getByRole("link", { name: "Ana" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/provider/estudio/bookings/bk-1"),
    );
  });
});
