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
import type { AddressDTO } from "@ntizo/shared";
import type { ServiceDetailDTO } from "@ntizo/shared/read-models";
import i18n from "@/shared/lib/i18n";
import { RequestQuotePage } from "../request-page";

/**
 * The network is the seam for the two session-scoped reads/writes this page
 * makes — the address book and the quote request itself — the same boundary
 * every other page suite draws. `sessionGraphql` alone: `useServiceDetail`
 * reaches `publicGraphql` instead, and a `ui` test may not import the `data`
 * layer that would let it fake that transport directly (`boundaries/dependencies`
 * forbids it) — so the service comes in through the viewmodel seam below,
 * exactly as `service-detail-page.test.tsx` and `book.$serviceId.test.tsx`
 * both do it.
 */
const fakes = vi.hoisted(() => ({ graphql: vi.fn() }));

// Keeps the real module's other exports — `GraphqlError` included — so
// `error instanceof GraphqlError` still holds inside the page.
vi.mock("@/shared/lib/graphql/session-graphql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/graphql/session-graphql")>()),
  sessionGraphql: fakes.graphql,
}));

const state: { service: ServiceDetailDTO | null } = { service: null };

vi.mock("@/features/directory/services/viewmodel/use-service-detail", () => ({
  useServiceDetail: () => state.service,
}));

const { GraphqlError } = await import("@/shared/lib/graphql/session-graphql");

function serviceFixture(over: Partial<ServiceDetailDTO> = {}): ServiceDetailDTO {
  return {
    id: "s1",
    providerId: "prov-1",
    providerName: "Frio & Clima Maputo",
    providerSlug: "frio-clima-maputo",
    providerType: "organization",
    providerLogoUrl: null,
    providerVerified: true,
    providerRatingAverage: 4.8,
    providerCity: "Maputo",
    providerDistrict: null,
    categoryCode: "hvac",
    categoryName: "Ar condicionado",
    name: "Instalação de ar condicionado",
    description: null,
    locationType: "at_provider",
    bookingMode: "quote",
    imageUrls: [],
    options: [],
    quoteForm: {
      responseHours: 24,
      askDeadline: false,
      askPhotos: false,
      askLocation: false,
      intro: null,
    },
    performers: [],
    isFallback: false,
    ...over,
  };
}

/**
 * What every request the page can make gets back. Dispatched on the
 * operation name in the document string, the same idiom `bookings-page.test.tsx`
 * uses for its own single mocked transport.
 */
function setupGraphql(
  opts: { addresses?: AddressDTO[]; requestError?: string } = {},
) {
  fakes.graphql.mockReset();
  fakes.graphql.mockImplementation(async (query: string) => {
    if (query.includes("UserMyAddresses")) {
      return { userMyAddresses: opts.addresses ?? [] };
    }
    if (query.includes("UserAddAddress")) {
      return { userAddAddress: { id: "addr-new" } };
    }
    if (query.includes("QuoteRequest")) {
      if (opts.requestError) {
        throw new GraphqlError(400, [
          { message: "refused", extensions: { originalCode: opts.requestError } },
        ]);
      }
      return { quoteRequest: { quoteId: "q1", respondBy: "2026-09-09T00:00:00.000Z" } };
    }
    throw new Error(`request-page.test.tsx: no fixture for operation in ${query}`);
  });
}

/**
 * `await router.load()` before `render()`, matching `bookings-page.test.tsx`'s
 * own harness. `/services/$id` and `/quotes/$quoteId` are registered as stubs
 * so the page's own `Link` (Cancelar) and its post-submit `navigate` both
 * resolve against routes the router actually knows about.
 */
async function renderRequest(
  over: {
    quoteForm?: ServiceDetailDTO["quoteForm"];
    locationType?: string;
    requestError?: string;
    addresses?: AddressDTO[];
  } = {},
) {
  state.service = serviceFixture({
    ...(over.quoteForm !== undefined ? { quoteForm: over.quoteForm } : {}),
    ...(over.locationType !== undefined ? { locationType: over.locationType } : {}),
  });
  setupGraphql({ addresses: over.addresses, requestError: over.requestError });

  const rootRoute = createRootRoute();
  const quoteRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/quote/$serviceId",
    component: () => <RequestQuotePage serviceId={state.service!.id} />,
  });
  const quoteDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/quotes/$quoteId",
    component: () => <p>quote detail</p>,
  });
  const serviceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/services/$id",
    component: () => <p>service page</p>,
  });

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([quoteRoute, quoteDetailRoute, serviceRoute]),
    history: createMemoryHistory({ initialEntries: ["/quote/s1"] }),
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

describe("RequestQuotePage", () => {
  it("shows the provider's intro in the provider's own voice, when there is one", async () => {
    await renderRequest({
      quoteForm: {
        responseHours: 48,
        askDeadline: true,
        askPhotos: true,
        askLocation: true,
        intro: "Diga-nos quantos aparelhos.",
      },
    });
    expect(await screen.findByText("Diga-nos quantos aparelhos.")).toBeInTheDocument();
    expect(screen.getByText("Frio & Clima Maputo:")).toBeInTheDocument();
  });

  it("hides the deadline, the photos and the address the provider did not ask for", async () => {
    await renderRequest({
      quoteForm: {
        responseHours: 24,
        askDeadline: false,
        askPhotos: false,
        askLocation: false,
        intro: null,
      },
    });
    expect(screen.queryByLabelText(/Até quando precisa/)).not.toBeInTheDocument();
    expect(screen.queryByText("Fotos")).not.toBeInTheDocument();
    expect(screen.queryByText("Onde é o trabalho")).not.toBeInTheDocument();
  });

  it("asks for the address anyway when the job happens at the customer's, whatever the form says", async () => {
    await renderRequest({
      locationType: "at_customer",
      quoteForm: {
        responseHours: 24,
        askDeadline: false,
        askPhotos: false,
        askLocation: false,
        intro: null,
      },
    });
    expect(await screen.findByText("Onde é o trabalho")).toBeInTheDocument();
  });

  it("asks for the address anyway when the job is flexible, whatever the form says", async () => {
    await renderRequest({
      locationType: "flexible",
      quoteForm: {
        responseHours: 24,
        askDeadline: false,
        askPhotos: false,
        askLocation: false,
        intro: null,
      },
    });
    expect(await screen.findByText("Onde é o trabalho")).toBeInTheDocument();
  });

  it("asks for the address when the provider never configured a quote form, mirroring the backend's own default", async () => {
    await renderRequest({ locationType: "at_provider", quoteForm: null });
    expect(await screen.findByText("Onde é o trabalho")).toBeInTheDocument();
  });

  it("refuses an empty description before it sends anything", async () => {
    await renderRequest();
    await userEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    expect(await screen.findByText("Escreva o que precisa antes de enviar.")).toBeInTheDocument();
    expect(fakes.graphql).not.toHaveBeenCalledWith(
      expect.stringContaining("QuoteRequest"),
      expect.anything(),
    );
  });

  it("refuses a description carrying a phone number, and says why", async () => {
    await renderRequest();
    await userEvent.type(screen.getByLabelText("O que precisa"), "Liguem para 84 123 4567");
    await userEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Tire o número de telefone/);
  });

  it("sends the request and lands on the quote it created", async () => {
    const { router } = await renderRequest();
    await userEvent.type(
      screen.getByLabelText("O que precisa"),
      "Dois aparelhos split de 12 000 BTU",
    );
    await userEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/quotes/q1"));
  });

  it("says so when the customer already has an open quote for this service", async () => {
    await renderRequest({ requestError: "QUOTE_ALREADY_OPEN" });
    await userEvent.type(screen.getByLabelText("O que precisa"), "Outra vez");
    await userEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Já tem um orçamento em aberto para este serviço.",
    );
  });

  it("says which field is missing when the backend still refuses for want of an address, rather than the generic try-again", async () => {
    await renderRequest({ requestError: "QUOTE_ADDRESS_REQUIRED" });
    await userEvent.type(screen.getByLabelText("O que precisa"), "Preciso de um orçamento");
    await userEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escolha onde é o trabalho.");
  });
});
