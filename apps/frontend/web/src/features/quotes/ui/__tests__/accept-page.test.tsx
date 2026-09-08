import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { AddressDTO, CurrentUserDTO } from "@ntizo/shared";
import i18n from "@/shared/lib/i18n";
import { formatMoney } from "@/features/wallet/domain/money";
import type { CustomerQuoteDetailDTO, QuoteProposalDTO } from "@/features/quotes/viewmodel/use-my-quotes";
import { AcceptQuotePage } from "../accept-page";

/**
 * The network is the seam, exactly as `quote-page.test.tsx` and
 * `request-page.test.tsx` both draw it — `sessionGraphql` faked, dispatched
 * on the operation name in the document string.
 *
 * `calls` records only the two writes this page can make, by their friendly
 * name rather than the wire's `UserUpdateMe` — the one fact the "never both
 * at once" test cares about is the *order* the two mutations fire in, and a
 * name a reader recognises says that more plainly than the GraphQL document's
 * own name for the profile write.
 */
const fakes = vi.hoisted(() => ({ graphql: vi.fn(), calls: [] as string[] }));

vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>()),
  sessionGraphql: fakes.graphql,
}));

const { GraphqlError } = await import("@/shared/lib/graphql/session-graphql");

function operationNames(): string[] {
  return fakes.calls;
}

function proposalFixture(over: Partial<QuoteProposalDTO> = {}): QuoteProposalDTO {
  return {
    id: "prop-1",
    priceMinor: 980_000,
    currency: "MZN",
    // A Saturday, deliberately: `slotWording`'s `date` capitalises only the
    // sentence's own first letter (see its own doc comment), so a fixture
    // has to actually land on the weekday the test names rather than one
    // typed for its calendar look.
    startsAt: "2025-09-20T06:30:00.000Z",
    endsAt: "2025-09-20T10:30:00.000Z",
    durationMinutes: 240,
    providerMemberId: "member-1",
    memberFirstName: "Carlos",
    note: "Inclui tubagem até 3 m por aparelho, suportes e teste.",
    validUntil: "2026-09-14T14:40:00.000Z",
    createdAt: "2026-09-04T14:40:00.000Z",
    supersededAt: null,
    supersededCause: null,
    attachments: [],
    ...over,
  };
}

const proposal = proposalFixture();

function detailFixture(over: Partial<CustomerQuoteDetailDTO> = {}): CustomerQuoteDetailDTO {
  return {
    id: "q1",
    status: "PROPOSED",
    serviceId: "s1",
    serviceName: "Instalação de ar condicionado",
    providerId: "prov-1",
    timezone: "Africa/Maputo",
    threadId: "thread-1",
    expiresAt: "2026-09-14T14:40:00.000Z",
    expiredCause: null,
    closedReason: null,
    bookingId: null,
    requestedAt: "2026-09-03T08:12:00.000Z",
    proposal,
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
    proposals: [proposal],
    closedNote: null,
    closingAttachments: [],
    ...over,
  };
}

const proposedDetail = detailFixture();

/**
 * A phone already on file, Vodacom and valid — the default for every test
 * that does not care about the phone itself. Only the refusal test overrides
 * it to `null`: everywhere else, a customer who typed nothing must still be
 * able to submit on the number their profile already carries.
 */
function userFixture(over: Partial<CurrentUserDTO> = {}): CurrentUserDTO {
  return {
    id: "cust-1",
    email: "cliente@ntizo.test",
    role: "customer",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    name: "Ana Cossa",
    firstName: "Ana",
    lastName: "Cossa",
    displayName: "Ana",
    avatarUrl: null,
    avatarKey: null,
    phoneNumber: "+258841234021",
    bio: null,
    language: "pt-MZ",
    timezone: "Africa/Maputo",
    dateOfBirth: null,
    gender: null,
    ...over,
  };
}

async function renderAccept(
  detail: CustomerQuoteDetailDTO | null,
  opts: {
    user?: Partial<CurrentUserDTO>;
    addresses?: AddressDTO[];
    acceptError?: string;
  } = {},
) {
  fakes.calls.length = 0;
  fakes.graphql.mockReset();
  fakes.graphql.mockImplementation(async (query: string) => {
    if (query.includes("QuoteById")) return { quoteById: detail };
    if (query.includes("UserMe")) return { userMe: userFixture(opts.user) };
    if (query.includes("UserMyAddresses")) return { userMyAddresses: opts.addresses ?? [] };
    if (query.includes("UserAddAddress")) return { userAddAddress: { id: "addr-new" } };
    if (query.includes("UserUpdateMe")) {
      fakes.calls.push("UpdateMyProfile");
      return { userUpdateMe: { ok: true } };
    }
    if (query.includes("QuoteAccept")) {
      fakes.calls.push("QuoteAccept");
      if (opts.acceptError) {
        throw new GraphqlError(400, [
          { message: "refused", extensions: { originalCode: opts.acceptError } },
        ]);
      }
      return { quoteAccept: { bookingId: "bk-1", payBy: "2026-09-07T15:00:00.000Z" } };
    }
    throw new Error(`accept-page.test.tsx: no fixture for operation in ${query}`);
  });

  const rootRoute = createRootRoute();
  const acceptRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/quotes/$quoteId/accept",
    component: () => <AcceptQuotePage quoteId="q1" />,
  });
  const quoteDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/quotes/$quoteId",
    component: () => <p>quote detail</p>,
  });
  const bookingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/bookings/$bookingId",
    component: () => <p>booking</p>,
  });

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([acceptRoute, quoteDetailRoute, bookingRoute]),
    history: createMemoryHistory({ initialEntries: ["/quotes/q1/accept"] }),
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

describe("AcceptQuotePage", () => {
  it("summarises exactly what is being agreed, and nothing else", async () => {
    await renderAccept(proposedDetail);
    expect(await screen.findByText("Instalação de ar condicionado")).toBeInTheDocument();
    // Derived from the real formatter, not hand-written: `formatMoney(980000,
    // "MZN", "pt-MZ")` renders "9800,00 MTn" — pt-MZ drops the thousands
    // separator at four digits, localises the symbol to "MTn", and joins the
    // two with a non-breaking space. Testing Library's default normalizer
    // collapses that (and any other run of whitespace) in the *node's* text
    // before comparing, but never touches the matcher string itself — so the
    // matcher has to be normalized the same way, or the two never meet.
    expect(
      screen.getByText(
        formatMoney(proposal.priceMinor, proposal.currency, "pt-MZ").replace(/\s+/g, " "),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sábado, 20 de setembro/)).toBeInTheDocument();
  });

  it("prefills the phone from the profile rather than asking again", async () => {
    await renderAccept(proposedDetail, { user: { phoneNumber: "+258841234021" } });
    // The field PhoneInput labels is the national number alone — no "+258",
    // no grouping spaces — exactly what `details-page.test.tsx` verifies for
    // the same externally-supplied value.
    expect(await screen.findByLabelText("Número M-Pesa")).toHaveValue("841234021");
  });

  it("refuses a non-Vodacom number with the reason, before any write", async () => {
    await renderAccept(proposedDetail, { user: { phoneNumber: null } });
    // `82` is a real Mozambican prefix and not Vodacom's — the same value
    // `details-page.test.tsx` types for the identical refusal, entered as
    // bare national digits under the field's default MZ country.
    await userEvent.type(await screen.findByLabelText("Número M-Pesa"), "821234567");
    await userEvent.click(screen.getByRole("button", { name: /Aceitar e pagar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "O M-Pesa só funciona em números Vodacom (84 ou 85).",
    );
    expect(fakes.graphql).not.toHaveBeenCalledWith(
      expect.stringContaining("QuoteAccept"),
      expect.anything(),
    );
    // A genuine phone refusal marks the field itself invalid, not only the
    // sentence beside it — the half a screen reader needs when it lands on
    // the field again by tab.
    expect(screen.getByLabelText("Número M-Pesa")).toHaveAttribute("aria-invalid", "true");
  });

  it("saves the phone before it accepts, never both at once", async () => {
    await renderAccept(proposedDetail, { user: { phoneNumber: "+258841234021" } });
    await userEvent.click(await screen.findByRole("button", { name: /Aceitar e pagar/ }));
    await waitFor(() => expect(operationNames()).toEqual(["UpdateMyProfile", "QuoteAccept"]));
  });

  it("asks for an address when the request never carried one", async () => {
    await renderAccept({ ...proposedDetail, address: null });
    expect(await screen.findByText("Onde é o trabalho")).toBeInTheDocument();
  });

  it("replaces the button with an explanation when the slot went while they were deciding", async () => {
    await renderAccept(proposedDetail, { acceptError: "QUOTE_SLOT_TAKEN" });
    await userEvent.click(await screen.findByRole("button", { name: /Aceitar e pagar/ }));
    expect(await screen.findByText("Essa hora deixou de estar livre")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aceitar e pagar/ })).not.toBeInTheDocument();
  });

  it("says a lapsed proposal has lapsed, and does not offer to retry it", async () => {
    await renderAccept(proposedDetail, { acceptError: "QUOTE_PROPOSAL_LAPSED" });
    await userEvent.click(await screen.findByRole("button", { name: /Aceitar e pagar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esta proposta caducou. Peça uma nova ao prestador.",
    );
    // The refusal is announced, but the number the customer typed was never
    // the problem — a lapsed proposal has nothing to do with the phone
    // field, and marking it invalid would send a screen-reader user to fix
    // the one thing that is fine.
    expect(screen.getByLabelText("Número M-Pesa")).not.toHaveAttribute("aria-invalid", "true");
  });
});
