import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import i18n from "@/shared/lib/i18n";
import { formatMoney } from "@/features/wallet/domain/money";
import type { CustomerQuoteDetailDTO, QuoteProposalDTO } from "@/features/quotes/viewmodel/use-my-quotes";
import { QuotePage } from "../quote-page";

/**
 * The network is the seam, exactly as `request-page.test.tsx` and
 * `quotes-page.test.tsx` both draw it — `sessionGraphql` faked, dispatched on
 * the operation name in the document string.
 */
const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));

vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>()),
  sessionGraphql: fakes.graphql,
}));

function proposalFixture(over: Partial<QuoteProposalDTO> = {}): QuoteProposalDTO {
  return {
    id: "prop-2",
    priceMinor: 980_000,
    currency: "MZN",
    startsAt: "2026-09-20T06:30:00.000Z",
    endsAt: "2026-09-20T10:30:00.000Z",
    durationMinutes: 240,
    providerMemberId: "member-1",
    memberFirstName: "Carlos",
    note: "Inclui tubagem até 3 m por aparelho, suportes e teste.",
    validUntil: "2026-09-07T14:40:00.000Z",
    createdAt: "2026-09-04T14:40:00.000Z",
    supersededAt: null,
    supersededCause: null,
    attachments: [],
    ...over,
  };
}

function detailFixture(over: Partial<CustomerQuoteDetailDTO> = {}): CustomerQuoteDetailDTO {
  return {
    id: "q1",
    status: "PROPOSED",
    serviceId: "s1",
    serviceName: "Instalação de ar condicionado",
    providerId: "prov-1",
    timezone: "Africa/Maputo",
    threadId: "thread-1",
    expiresAt: "2026-09-07T14:40:00.000Z",
    expiredCause: null,
    closedReason: null,
    bookingId: null,
    requestedAt: "2026-09-03T08:12:00.000Z",
    proposal: null,
    providerName: "Frio & Clima Maputo",
    providerSlug: "frio-clima-maputo",
    providerVerified: true,
    description: "Dois aparelhos split de 12 000 BTU para instalar num T2.",
    neededBy: "2026-09-27",
    address: {
      label: "Casa",
      line: "Av. Julius Nyerere 1234",
      city: "Maputo",
      district: "Bairro Central",
      directions: null,
    },
    requestAttachments: [],
    proposals: [],
    closedNote: null,
    closingAttachments: [],
    ...over,
  };
}

const proposal = proposalFixture();
const proposedDetail = detailFixture({ proposal, proposals: [proposal] });

const supersededProposal = proposalFixture({
  id: "prop-1",
  priceMinor: 1_060_000,
  note: "Revi o tubo, afinal chega com menos.",
  validUntil: "2026-09-05T08:12:00.000Z",
  createdAt: "2026-09-03T09:05:00.000Z",
  supersededAt: "2026-09-04T14:40:00.000Z",
  supersededCause: "revised",
});
const revisedDetail = detailFixture({
  proposal,
  proposals: [proposal, supersededProposal],
});

const requestedDetail = detailFixture({
  status: "REQUESTED",
  proposal: null,
  proposals: [],
  expiresAt: "2026-09-05T08:12:00.000Z",
});

const acceptedDetail = detailFixture({
  status: "ACCEPTED",
  proposal,
  proposals: [proposal],
  bookingId: "b1",
});

async function renderQuote(
  detail: CustomerQuoteDetailDTO | null,
  opts: { rejectApplied?: boolean; withdrawApplied?: boolean } = {},
) {
  fakes.graphql.mockReset();
  fakes.graphql.mockImplementation(async (query: string) => {
    if (query.includes("QuoteById")) return { quoteById: detail };
    if (query.includes("QuoteReject")) {
      return { quoteReject: { quoteId: "q1", applied: opts.rejectApplied ?? true } };
    }
    if (query.includes("QuoteWithdraw")) {
      return { quoteWithdraw: { quoteId: "q1", applied: opts.withdrawApplied ?? true } };
    }
    throw new Error(`quote-page.test.tsx: no fixture for operation in ${query}`);
  });

  const rootRoute = createRootRoute();
  const quoteRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/quotes/$quoteId",
    component: () => <QuotePage quoteId="q1" />,
  });
  const quotesListRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/quotes",
    component: () => <p>quotes list</p>,
  });
  const acceptRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/quotes/$quoteId/accept",
    component: () => <p>accept</p>,
  });
  const bookingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/bookings/$bookingId",
    component: () => <p>booking</p>,
  });
  const providerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/providers/$slug",
    component: () => <p>provider</p>,
  });
  const messagesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/messages",
    component: () => <p>messages</p>,
  });

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      quoteRoute,
      quotesListRoute,
      acceptRoute,
      bookingRoute,
      providerRoute,
      messagesRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ["/quotes/q1"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("QuotePage", () => {
  it("puts the price first, at the size the mockup gives it", async () => {
    await renderQuote(proposedDetail);
    const price = await screen.findByText("9 800");
    expect(price).toBeInTheDocument();
    expect(screen.getByText("MZN")).toBeInTheDocument();
  });

  it("says the amount on the button, because it is the thing being agreed", async () => {
    await renderQuote(proposedDetail);
    const amount = formatMoney(proposal.priceMinor, proposal.currency, "pt-MZ");
    expect(await screen.findByRole("link", { name: `Aceitar e pagar ${amount}` })).toHaveAttribute(
      "href",
      "/quotes/q1/accept",
    );
  });

  it("keeps a superseded proposal as history, with the provider's own words for why", async () => {
    await renderQuote(revisedDetail);
    expect(await screen.findByText(/Proposta anterior/)).toBeInTheDocument();
    expect(screen.getByText("Revi o tubo, afinal chega com menos.")).toBeInTheDocument();
  });

  it("offers withdrawal only before a proposal exists, and never as an invitation", async () => {
    await renderQuote(requestedDetail);
    expect(await screen.findByRole("button", { name: "Retirar o pedido" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recusar" })).not.toBeInTheDocument();
  });

  it("offers refusal only while a proposal is live", async () => {
    await renderQuote(proposedDetail);
    expect(await screen.findByRole("button", { name: "Recusar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retirar o pedido" })).not.toBeInTheDocument();
  });

  it("points an accepted quote at its booking", async () => {
    await renderQuote(acceptedDetail);
    expect(await screen.findByRole("link", { name: "Ver a reserva" })).toHaveAttribute(
      "href",
      "/bookings/b1",
    );
  });

  it("says it reloaded rather than claiming success when a refusal loses the race", async () => {
    await renderQuote(proposedDetail, { rejectApplied: false });
    await userEvent.click(await screen.findByRole("button", { name: "Recusar" }));
    await userEvent.click(await screen.findByRole("radio", { name: "A data não me serve" }));
    await userEvent.click(screen.getByRole("button", { name: "Recusar proposta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Isto mudou entretanto. Voltámos a carregar.",
    );
  });

  it("says a quote it cannot find is gone, rather than showing an empty page", async () => {
    await renderQuote(null);
    expect(await screen.findByText("Este orçamento não existe")).toBeInTheDocument();
  });
});
