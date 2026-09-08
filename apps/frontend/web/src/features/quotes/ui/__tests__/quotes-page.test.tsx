import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { CUSTOMER_QUOTE_TABS, type CustomerQuoteTab } from "@ntizo/shared";
import i18n from "@/shared/lib/i18n";
import type { CustomerQuoteDTO, CustomerQuotePageDTO, QuoteProposalDTO } from "../../viewmodel/use-my-quotes";
import { QuotesPage } from "../quotes-page";

/**
 * The network is the seam, and it is the only one — see the identical note on
 * `bookings-page.test.tsx`.
 */
const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));

vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>()),
  sessionGraphql: fakes.graphql,
}));

/**
 * The same validator the real route carries, duplicated rather than
 * imported — `src/routes/**` is the routes element and a `ui` test may not
 * import one. See `bookings-page.test.tsx`'s identical note.
 */
function validateSearch(search: Record<string, unknown>): { tab?: CustomerQuoteTab } {
  const tab = search["tab"];
  return (CUSTOMER_QUOTE_TABS as readonly string[]).includes(tab as string)
    ? { tab: tab as CustomerQuoteTab }
    : {};
}

function proposalFixture(over: Partial<QuoteProposalDTO> = {}): QuoteProposalDTO {
  return {
    id: "prop-1",
    priceMinor: 980_000,
    currency: "MZN",
    startsAt: "2026-09-10T09:00:00.000Z",
    endsAt: "2026-09-10T11:00:00.000Z",
    durationMinutes: 120,
    providerMemberId: "mem-1",
    memberFirstName: "Amélia",
    note: null,
    validUntil: "2026-09-09T20:00:00.000Z",
    createdAt: "2026-09-06T10:00:00.000Z",
    supersededAt: null,
    supersededCause: null,
    attachments: [],
    ...over,
  };
}

function quoteFixture(over: Partial<CustomerQuoteDTO> = {}): CustomerQuoteDTO {
  return {
    id: "q-1",
    status: "REQUESTED",
    serviceId: "svc-1",
    serviceName: "Canalização",
    providerId: "prv-1",
    timezone: "Africa/Maputo",
    threadId: "th-1",
    expiresAt: "2026-09-08T10:00:00.000Z",
    expiredCause: null,
    closedReason: null,
    bookingId: null,
    requestedAt: "2026-09-05T08:00:00.000Z",
    proposal: null,
    providerName: "Amélia Sitoe",
    providerSlug: "amelia-sitoe",
    providerVerified: true,
    ...over,
  };
}

const proposedQuote = quoteFixture({
  id: "q-proposed",
  status: "PROPOSED",
  serviceName: "Instalação de ar condicionado",
  proposal: proposalFixture(),
});

const requestedQuote = quoteFixture({
  id: "q-requested",
  status: "REQUESTED",
  serviceName: "Pintura de apartamento T2",
  proposal: null,
});

const acceptedQuote = quoteFixture({
  id: "q-accepted",
  status: "ACCEPTED",
  serviceName: "Montagem de cozinha",
  bookingId: "bk-9",
  proposal: proposalFixture({ id: "prop-9" }),
});

const expiredQuote = quoteFixture({
  id: "q-expired",
  status: "EXPIRED",
  serviceName: "Jardinagem · limpeza de quintal",
  expiredCause: "provider_did_not_respond",
  proposal: null,
});

function pageWith(
  item: CustomerQuoteDTO,
  over: Partial<CustomerQuotePageDTO> = {},
): CustomerQuotePageDTO {
  return {
    items: [item],
    counts: { open: 1, history: 0 },
    hasMore: false,
    ...over,
  };
}

/** What the server answers with, for every request this render makes. */
function setPage(page: CustomerQuotePageDTO) {
  fakes.graphql.mockReset();
  fakes.graphql.mockResolvedValue({ quoteMine: page });
}

/**
 * `await router.load()` before `render()`: this router commits its first
 * match through an async transition — see `bookings-page.test.tsx`'s
 * identical note.
 *
 * A `/services` stub sits alongside `/quotes` so the empty state's own `Link`
 * resolves against a route the router actually knows about.
 */
async function renderQuotes(page: CustomerQuotePageDTO) {
  setPage(page);
  const rootRoute = createRootRoute();
  const quotesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/quotes",
    validateSearch,
    component: QuotesPage,
  });
  const servicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/services",
    component: () => <p>services</p>,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree: rootRoute.addChildren([quotesRoute, servicesRoute]),
    history: createMemoryHistory({ initialEntries: ["/quotes"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

/**
 * One row of the table, by the service it belongs to.
 *
 * jsdom applies no CSS, so `CollectionCard`'s two layouts — the table from
 * `md` and the stacked cards below it — are both in the document and every
 * value on a row is present twice. Naming the table's row picks one of the
 * two. See `bookings-page.test.tsx`'s identical helper.
 */
async function row(serviceName: string) {
  const table = await screen.findByRole("table");
  const cell = await within(table).findByText(serviceName, { exact: false });
  return within(cell.closest("tr")!);
}

/** The same row on the other screen — see `bookings-page.test.tsx`'s identical helper. */
async function card(serviceName: string) {
  const list = await screen.findByRole("list");
  const found = await within(list).findByText(serviceName, { exact: false });
  return within(found.closest("li")!);
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("QuotesPage", () => {
  it("reads a proposal row as price, when, and whose move it is", async () => {
    await renderQuotes(pageWith(proposedQuote));
    const r = await row("Instalação de ar condicionado");
    expect(r.getByText("Proposta recebida")).toBeInTheDocument();
    expect(r.getByText(/a sua decisão/)).toBeInTheDocument();
    // `formatMoney(980_000, "MZN", "pt-MZ")` — printed once with `node -e`
    // against this exact call and copied here, per the report.
    expect(r.getByText("9800,00 MTn")).toBeInTheDocument();
  });

  it("says there is no price yet rather than showing a zero", async () => {
    await renderQuotes(pageWith(requestedQuote));
    const r = await row("Pintura de apartamento T2");
    expect(r.getByText("sem preço ainda")).toBeInTheDocument();
  });

  it("points an accepted quote at its booking instead of repeating the price story", async () => {
    await renderQuotes(pageWith(acceptedQuote));
    const r = await row("Montagem de cozinha");
    expect(r.getByText("passou a reserva")).toBeInTheDocument();
  });

  it("says who dropped an expired quote", async () => {
    await renderQuotes(pageWith(expiredQuote));
    const r = await row("Jardinagem · limpeza de quintal");
    expect(r.getByText(/o prestador não respondeu/)).toBeInTheDocument();
  });

  it("counts both tabs on the tabs themselves", async () => {
    await renderQuotes(pageWith(proposedQuote, { counts: { open: 2, history: 4 } }));
    // `findByRole` stops at the first match, which exists before the count
    // has arrived (the tab's name is bare "Em aberto" on the loading
    // render) — the assertion has to wait for the count itself, not just
    // for the tab to exist. See `bookings-page.test.tsx`'s identical note.
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Em aberto/ })).toHaveTextContent("2"),
    );
    expect(screen.getByRole("tab", { name: /Histórico/ })).toHaveTextContent("4");
  });

  it("moves the tab into the URL, so a reload keeps it", async () => {
    const { router } = await renderQuotes(pageWith(proposedQuote));
    await userEvent.click(screen.getByRole("tab", { name: /Histórico/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: "history" }));
  });

  it("asks for the next page only while the server says there is one", async () => {
    await renderQuotes(pageWith(proposedQuote, { hasMore: false }));
    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: "Mais" })).not.toBeInTheDocument();
  });

  it("says the load failed rather than claiming there are no quotes", async () => {
    fakes.graphql.mockReset();
    fakes.graphql.mockRejectedValue(new Error("network down"));
    const rootRoute = createRootRoute();
    const quotesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/quotes",
      validateSearch,
      component: QuotesPage,
    });
    const servicesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/services",
      component: () => <p>services</p>,
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createRouter({
      routeTree: rootRoute.addChildren([quotesRoute, servicesRoute]),
      history: createMemoryHistory({ initialEntries: ["/quotes"] }),
    });
    await router.load();
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os seus orçamentos.",
    );
  });

  it("invites a customer with nothing yet to go and find a quotable service", async () => {
    await renderQuotes({ items: [], counts: { open: 0, history: 0 }, hasMore: false });
    // Scoped to the table: `CollectionCard` draws its empty state once for
    // the table and once for the phone card, exactly as a real row would —
    // see `bookings-page.test.tsx`'s identical note.
    const table = within(await screen.findByRole("table"));
    expect(await table.findByText("Ainda não pediu orçamentos")).toBeInTheDocument();
    expect(
      table.getByRole("link", { name: "Ver serviços sob orçamento" }),
    ).toHaveAttribute("href", expect.stringContaining("/services"));
  });

  // The phone card arranges the same facts the table cells carry, rather
  // than labelling them — see `bookings-page.test.tsx`'s identical case for
  // why `hideOnCard` exists at all.
  it("arranges the status and the price on the card without labelling either", async () => {
    await renderQuotes(pageWith(proposedQuote));
    const c = await card("Instalação de ar condicionado");
    expect(c.getByText("Proposta recebida")).toBeInTheDocument();
    expect(c.getByText("9800,00 MTn")).toBeInTheDocument();
    expect(c.queryByText("Estado")).not.toBeInTheDocument();
    expect(c.queryByText("Preço")).not.toBeInTheDocument();
  });
});
