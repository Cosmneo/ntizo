import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
import type { ProviderQuoteDetailDTO, ProviderQuoteDTO } from "../../viewmodel/use-provider-quotes";
import { ProviderQuotePage } from "../quote-page";

/**
 * The network is the seam, exactly as `quotes-page.test.tsx` and the
 * customer's own `quote-page.test.tsx` both draw it — `sessionGraphql` faked,
 * dispatched on the operation name in the document string.
 */
const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));

vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>()),
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

function proposalFixture(
  over: Partial<NonNullable<ProviderQuoteDTO["proposal"]>> = {},
): NonNullable<ProviderQuoteDTO["proposal"]> {
  return {
    id: "prop-1",
    priceMinor: 980_000,
    currency: "MZN",
    startsAt: "2026-09-20T06:30:00.000Z",
    endsAt: "2026-09-20T10:30:00.000Z",
    durationMinutes: 240,
    providerMemberId: "m1",
    memberFirstName: "Carlos",
    note: null,
    validUntil: "2026-09-09T00:00:00.000Z",
    createdAt: "2026-09-05T10:00:00.000Z",
    supersededAt: null,
    supersededCause: null,
    attachments: [],
    ...over,
  };
}

/**
 * A request the workspace has not priced yet: the description in full (long
 * enough that a test can tell it apart from the 160-character snippet the
 * list would have shown), one performer (so the proposal form's member
 * field preselects itself), and nothing that would let this page reveal a
 * street line, a phone or an email — there is no field here to carry any of
 * the three, which is `ProviderQuoteDetailDTO`'s own reveal rule.
 */
function detailFixture(over: Partial<ProviderQuoteDetailDTO> = {}): ProviderQuoteDetailDTO {
  return {
    id: "q1",
    status: "REQUESTED",
    serviceId: "svc-1",
    serviceName: "Instalação de ar condicionado",
    providerId: "prov-1",
    timezone: "Africa/Maputo",
    threadId: "thread-1",
    expiresAt: "2026-09-09T00:00:00.000Z",
    expiredCause: null,
    closedReason: null,
    bookingId: null,
    requestedAt: "2026-09-05T08:00:00.000Z",
    proposal: null,
    customerFirstName: "Ana",
    addressDistrict: "Bairro Central",
    addressCity: "Maputo",
    neededBy: null,
    descriptionSnippet:
      "Preciso de instalar dois aparelhos de ar condicionado split de 12 000 BTU, um na sala e",
    attachmentCount: 0,
    description:
      "Preciso de instalar dois aparelhos de ar condicionado split de 12 000 BTU, um na sala e outro no quarto, incluindo a tubagem entre a unidade interior e a exterior e o teste de fugas de gás.",
    customerCompletedBookings: 3,
    requestAttachments: [],
    proposals: [],
    closedNote: null,
    closingAttachments: [],
    commissionBps: 1000,
    performers: [{ id: "m1", firstName: "Carlos" }],
    ...over,
  };
}

const toAnswerDetail = detailFixture();

/**
 * `current` is mutable rather than a fixed answer: a successful `propose`
 * moves the fixture from `REQUESTED`/no-proposal to `PROPOSED`/a live one,
 * the same way the real backend does, so the page's own refetch (queued by
 * `useAnswerQuote`'s `onSettled`) has something true to read back.
 */
async function renderProviderQuote(
  initial: ProviderQuoteDetailDTO,
  opts: { proposeValidUntil?: string | null; declineApplied?: boolean } = {},
) {
  fakes.graphql.mockReset();
  let current = initial;

  fakes.graphql.mockImplementation(async (query: string, variables: Record<string, unknown>) => {
    if (query.includes("QuoteByIdForProvider")) return { quoteByIdForProvider: current };
    if (query.includes("QuotePropose")) {
      const validUntil =
        opts.proposeValidUntil !== undefined ? opts.proposeValidUntil : "2026-09-09T00:00:00.000Z";
      if (validUntil !== null) {
        const input = variables["input"] as {
          priceMinor: number;
          startsAt: string;
          durationMinutes: number;
          providerMemberId: string;
          note?: string;
        };
        current = {
          ...current,
          status: "PROPOSED",
          proposal: proposalFixture({
            priceMinor: input.priceMinor,
            startsAt: input.startsAt,
            durationMinutes: input.durationMinutes,
            providerMemberId: input.providerMemberId,
            memberFirstName: current.performers.find((p) => p.id === input.providerMemberId)
              ?.firstName ?? "Carlos",
            note: input.note ?? null,
            validUntil,
          }),
        };
      }
      return { quotePropose: { quoteId: current.id, validUntil } };
    }
    if (query.includes("QuoteDecline")) {
      return { quoteDecline: { quoteId: current.id, applied: opts.declineApplied ?? true } };
    }
    throw new Error(`quote-page.test.tsx (provider): no fixture for operation in ${query}`);
  });

  const rootRoute = createRootRoute();
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/provider/$slug/quotes/$quoteId",
    component: () => <ProviderQuotePage quoteId={initial.id} />,
  });
  const listRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/provider/$slug/quotes",
    component: () => <p>lista</p>,
  });
  const messagesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/messages",
    component: () => <p>mensagens</p>,
  });

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([detailRoute, listRoute, messagesRoute]),
    history: createMemoryHistory({ initialEntries: [`/provider/estudio/quotes/${initial.id}`] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

/** Fills every field the proposal form's own validation asks for, then sends it. */
async function fillAndSend() {
  await userEvent.type(await screen.findByLabelText("Preço para o cliente"), "9800");
  fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-09-20" } });
  fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "08:30" } });
  await userEvent.type(screen.getByLabelText("Duração"), "2");
  await userEvent.click(screen.getByRole("button", { name: "Enviar proposta" }));
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("ProviderQuotePage", () => {
  it("shows the whole description, not the snippet the list shows", async () => {
    await renderProviderQuote(toAnswerDetail);

    expect(await screen.findByText(toAnswerDetail.description)).toBeInTheDocument();
  });

  it("never shows a street line, a phone or an email before the booking is confirmed", async () => {
    await renderProviderQuote(toAnswerDetail);

    expect(await screen.findByRole("heading", { name: "Ana" })).toBeInTheDocument();
    expect(screen.queryByText(/Av\. Julius Nyerere/)).not.toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
    // Only the two the reveal rule allows.
    expect(screen.getByText("Bairro Central, Maputo")).toBeInTheDocument();
  });

  it("swaps the form for the proposal once one is sent, and offers to revise it", async () => {
    await renderProviderQuote(toAnswerDetail);

    await fillAndSend();

    // The split's own "recebe" line, gone; the proposal's own price, in its
    // place — the same `formatMoney(980_000, "MZN", "pt-MZ")` string the
    // form's own test file derives from the real formatter.
    expect(await screen.findByText("9800,00 MTn")).toBeInTheDocument();
    expect(screen.queryByLabelText("Preço para o cliente")).not.toBeInTheDocument();
    // "Proposta enviada", not the neutral "A sua proposta" — this page is
    // the one that just sent it.
    expect(screen.getByRole("heading", { name: "Proposta enviada" })).toBeInTheDocument();
    const revise = await screen.findByRole("button", { name: "Rever proposta" });

    await userEvent.click(revise);

    expect(await screen.findByLabelText("Preço para o cliente")).toBeInTheDocument();
  });

  it("says it reloaded rather than claiming the proposal was sent, when the race is lost", async () => {
    await renderProviderQuote(toAnswerDetail, { proposeValidUntil: null });

    await fillAndSend();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este pedido mudou entretanto. Voltámos a carregá-lo.",
    );
    // Still the form, not the proposal display — nothing was actually sent.
    expect(screen.getByLabelText("Preço para o cliente")).toBeInTheDocument();
  });
});
