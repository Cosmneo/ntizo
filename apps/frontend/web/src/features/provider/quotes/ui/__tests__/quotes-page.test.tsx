import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { PROVIDER_QUOTE_TABS, type ProviderQuoteTab } from "@ntizo/shared";
import i18n from "@/shared/lib/i18n";
import { PageHeaderContext, type PageHeaderState } from "@/shared/lib/page-header";
import type { ProviderQuoteDTO, ProviderQuotePageDTO } from "../../viewmodel/use-provider-quotes";
import { ProviderQuotesPage } from "../quotes-page";

/**
 * The network is the seam, and it is the only one — see the identical note on
 * `bookings-page.test.tsx`.
 *
 * The workspace is stood in for because `useActiveProvider` reads the
 * session's provider list over the same wire, and a page that has to wait
 * for it before it asks for anything would make every assertion below about
 * two requests instead of one — see `bookings-page.test.tsx`'s identical note.
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
 * The same validator the real route carries, duplicated rather than
 * imported — `src/routes/**` is the routes element and a `ui` test may not
 * import one. See `bookings-page.test.tsx`'s identical note.
 */
function validateSearch(search: Record<string, unknown>): { tab?: ProviderQuoteTab } {
  const tab = search["tab"];
  return (PROVIDER_QUOTE_TABS as readonly string[]).includes(tab as string)
    ? { tab: tab as ProviderQuoteTab }
    : {};
}

const HOUR = 3_600_000;
const MINUTE = 60_000;

/**
 * A point in time `hours` away from the moment the fixture is built, 30
 * minutes into its own hour bucket so `coarseDuration`'s floor stays put for
 * as long as a test run takes — the same margin `bookings-page.test.tsx`'s
 * `inNinetyMinutes()` keeps, scaled up because this plan's clocks run in
 * hours, not minutes.
 */
function inHours(hours: number): string {
  return new Date(Date.now() + hours * HOUR + 30 * MINUTE).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * HOUR - 30 * MINUTE).toISOString();
}

function proposalFixture(
  over: Partial<NonNullable<ProviderQuoteDTO["proposal"]>> = {},
): NonNullable<ProviderQuoteDTO["proposal"]> {
  return {
    id: "prop-1",
    priceMinor: 540_000,
    currency: "MZN",
    startsAt: "2026-09-10T09:00:00.000Z",
    endsAt: "2026-09-10T11:00:00.000Z",
    durationMinutes: 120,
    providerMemberId: "mem-1",
    memberFirstName: "Amélia",
    note: null,
    validUntil: inHours(40),
    createdAt: "2026-09-06T10:00:00.000Z",
    supersededAt: null,
    supersededCause: null,
    attachments: [],
    ...over,
  };
}

function quoteFixture(over: Partial<ProviderQuoteDTO> = {}): ProviderQuoteDTO {
  return {
    id: "q-1",
    status: "REQUESTED",
    serviceId: "svc-1",
    serviceName: "Canalização",
    providerId: "prov-1",
    timezone: "Africa/Maputo",
    threadId: "th-1",
    expiresAt: null,
    expiredCause: null,
    closedReason: null,
    bookingId: null,
    requestedAt: "2026-09-05T08:00:00.000Z",
    proposal: null,
    customerFirstName: "Cliente",
    addressDistrict: null,
    addressCity: null,
    neededBy: null,
    descriptionSnippet: "Preciso de ajuda com um serviço.",
    attachmentCount: 0,
    ...over,
  };
}

const toAnswerQuote = quoteFixture({
  id: "q-toanswer",
  status: "REQUESTED",
  serviceName: "Instalação de ar condicionado",
  customerFirstName: "Salif F.",
  addressDistrict: "Bairro Central",
  addressCity: "Maputo",
  requestedAt: hoursAgo(26),
  expiresAt: inHours(22),
  descriptionSnippet: "Preciso de instalar um ar condicionado na sala.",
});

const waitingQuote = quoteFixture({
  id: "q-waiting",
  status: "PROPOSED",
  serviceName: "Instalação de ar condicionado",
  customerFirstName: "Salif F.",
  addressDistrict: "Bairro Central",
  addressCity: "Maputo",
  requestedAt: hoursAgo(50),
  expiresAt: inHours(40),
  proposal: proposalFixture(),
});

function pageWith(
  item: ProviderQuoteDTO,
  over: Partial<ProviderQuotePageDTO> = {},
): ProviderQuotePageDTO {
  return {
    items: [item],
    counts: { toAnswer: 1, waiting: 0, history: 0 },
    hasMore: false,
    ...over,
  };
}

/**
 * What the server answers for every request this render makes. A function
 * when the test is about *which tab was asked for* — the header's own
 * urgency figure has to come from the "toAnswer" tab's own request
 * regardless of which tab is on screen, and a mock that answers identically
 * whatever it is asked cannot fail on a page that conflates the two.
 */
type Answer =
  | ProviderQuotePageDTO
  | ((input: { tab: ProviderQuoteTab; offset: number }) => ProviderQuotePageDTO);

function setAnswers(answer: Answer) {
  fakes.graphql.mockReset();
  fakes.graphql.mockImplementation(
    (query: string, variables: { input: { tab: ProviderQuoteTab; offset: number } }) => {
      if (query.includes("QuoteForProvider")) {
        const page = typeof answer === "function" ? answer(variables.input) : answer;
        return Promise.resolve({ quoteForProvider: page });
      }
      if (query.includes("ProviderById")) {
        // The workspace's own rate, for the price cell's "recebe" line —
        // `console-strip.tsx` already loads this on every console screen, so
        // the page reads it from the same query rather than fetching it twice.
        return Promise.resolve({ providerById: { commissionBps: 1000 } });
      }
      throw new Error(`unexpected query: ${query}`);
    },
  );
}

/**
 * Stands in for `ConsoleShell`'s own header context, exactly as
 * `page-header.test.tsx`'s own `Shell` does: state in `useState`, the value
 * assembled inline. The subtitle is rendered into a probe so the header's
 * own text — not just its presence — is assertable, since `usePageHeader`
 * quietly no-ops with no provider ancestor.
 */
function HeaderShell({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<PageHeaderState>({ title: "" });
  return (
    <PageHeaderContext.Provider value={{ header, setHeader, action: null, setAction: () => {} }}>
      <span data-testid="subtitle">{header.subtitle ?? ""}</span>
      {children}
    </PageHeaderContext.Provider>
  );
}

/**
 * `await router.load()` before `render()`: this router commits its first
 * match through an async transition — see `bookings-page.test.tsx`'s
 * identical note.
 *
 * A `/provider/$slug/quotes/$quoteId` stub sits alongside the list route so
 * the row's own `Link` resolves against a route the test router actually
 * knows about, exactly as `bookings-page.test.tsx` registers the booking
 * detail route beside its list.
 */
async function renderQueue(answer: Answer, opts: { tab?: ProviderQuoteTab } = {}) {
  setAnswers(answer);
  const rootRoute = createRootRoute();
  const quotesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/provider/$slug/quotes",
    validateSearch,
    component: ProviderQuotesPage,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/provider/$slug/quotes/$quoteId",
    component: () => <p>quote detail</p>,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const at = opts.tab
    ? `/provider/estudio/quotes?tab=${opts.tab}`
    : "/provider/estudio/quotes";
  const router = createRouter({
    routeTree: rootRoute.addChildren([quotesRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <HeaderShell>
        <RouterProvider router={router} />
      </HeaderShell>
    </QueryClientProvider>,
  );
  return { router };
}

/**
 * One row of the table, by the service it belongs to.
 *
 * jsdom applies no CSS, so `CollectionCard`'s two layouts — the table from
 * `md` and the stacked cards below it — are both in the document. Naming the
 * table's row picks one of the two. See `bookings-page.test.tsx`'s identical
 * helper.
 */
async function row(serviceName: string) {
  const table = await screen.findByRole("table");
  const cell = await within(table).findByText(serviceName, { exact: false });
  return cell.closest("tr")!;
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("ProviderQuotesPage", () => {
  it("leads a row with the customer's first name and the service, not an id", async () => {
    await renderQueue(pageWith(toAnswerQuote));
    const r = await row("Instalação de ar condicionado");
    expect(within(r).getByText("Salif F.")).toBeInTheDocument();
  });

  it("shows where the job is as bairro and city, and nothing finer", async () => {
    await renderQueue(pageWith(toAnswerQuote));
    const r = await row("Instalação de ar condicionado");
    expect(within(r).getByText(/Bairro Central, Maputo/)).toBeInTheDocument();
    expect(within(r).queryByText(/Av\. Julius Nyerere/)).not.toBeInTheDocument();
  });

  it("counts the photos rather than loading them into a list row", async () => {
    await renderQueue(pageWith({ ...toAnswerQuote, attachmentCount: 3 }));
    expect(within(await row("Instalação de ar condicionado")).getByText("3 fotos")).toBeInTheDocument();
  });

  it("says how long is left to answer, and how long ago it was asked", async () => {
    await renderQueue(pageWith(toAnswerQuote));
    const r = await row("Instalação de ar condicionado");
    expect(within(r).getByText(/faltam 22 h/)).toBeInTheDocument();
    expect(within(r).getByText(/pedido há 26 h/)).toBeInTheDocument();
  });

  it("shows what the provider takes home under a sent proposal's price", async () => {
    await renderQueue(pageWith(waitingQuote), { tab: "waiting" });
    const r = await row("Instalação de ar condicionado");
    // `formatMoney(540_000, "MZN", "pt-MZ")` and `formatMoney(486_000, "MZN",
    // "pt-MZ")` — printed once with `node -e` against this exact call and
    // copied here, per the report: ICU suppresses the thousands separator at
    // exactly four digits and localises the symbol to "MTn" in pt-MZ, so the
    // real output is "5400,00 MTn"/"4860,00 MTn", not "5.400,00 MZN"/
    // "4.860,00 MZN".
    expect(within(r).getByText("5400,00 MTn")).toBeInTheDocument();
    expect(within(r).getByText("recebe 4860,00 MTn")).toBeInTheDocument();
  });

  it("counts all three tabs on the tabs themselves", async () => {
    await renderQueue(pageWith(toAnswerQuote, { counts: { toAnswer: 3, waiting: 2, history: 11 } }));
    // `findByRole` stops at the first match, which exists before the count
    // has arrived (the tab's name is bare "Por responder" on the loading
    // render) — the assertion has to wait for the count itself, not just for
    // the tab to exist. See `quotes-page.test.tsx`'s (the customer's)
    // identical note.
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Por responder/ })).toHaveTextContent("3"),
    );
    expect(screen.getByRole("tab", { name: /Histórico/ })).toHaveTextContent("11");
  });

  // The three cases below cover the header's own blurb — `usePageHeader`'s
  // title/subtitle, read back through `HeaderShell`'s probe. Every expected
  // string is computed through the real `i18n` instance's own interpolation
  // rather than hand-typed, per the report's own rule for money strings —
  // the same discipline applies to any translated sentence this test derives
  // rather than hardcodes.
  const qt = i18n.getFixedT("pt-MZ", "quotes");

  it("states how many are owed an answer and how soon the most urgent one is due", async () => {
    const soon = { ...toAnswerQuote, expiresAt: inHours(4) };
    await renderQueue(pageWith(soon, { counts: { toAnswer: 3, waiting: 0, history: 0 } }));
    const expected = qt("provider.blurb", { count: 3, left: qt("unit.h", { count: 4 }) });
    await waitFor(() => expect(screen.getByTestId("subtitle")).toHaveTextContent(expected));
  });

  it("says nothing is owed when the toAnswer count is zero", async () => {
    await renderQueue({ items: [], counts: { toAnswer: 0, waiting: 1, history: 2 }, hasMore: false });
    await waitFor(() =>
      expect(screen.getByTestId("subtitle")).toHaveTextContent(qt("provider.blurbNone")),
    );
  });

  it("keeps the blurb's figure honest about the toAnswer queue while a different tab is on screen", async () => {
    // The visible "waiting" tab's own soonest deadline (40h, from
    // `waitingQuote`'s proposal) is deliberately far from the "toAnswer"
    // tab's (4h) — if the page ever read the active tab's own items for this
    // figure instead of the dedicated "toAnswer" peek, this test would see
    // 40h, or 5's count mismatched against 40h's span, rather than the pair
    // below.
    const soonToAnswer = { ...toAnswerQuote, expiresAt: inHours(4) };
    const byTab = (input: { tab: ProviderQuoteTab }): ProviderQuotePageDTO =>
      input.tab === "toAnswer"
        ? pageWith(soonToAnswer, { counts: { toAnswer: 5, waiting: 1, history: 0 } })
        : pageWith(waitingQuote, { counts: { toAnswer: 5, waiting: 1, history: 0 } });
    await renderQueue(byTab, { tab: "waiting" });
    const expected = qt("provider.blurb", { count: 5, left: qt("unit.h", { count: 4 }) });
    await waitFor(() => expect(screen.getByTestId("subtitle")).toHaveTextContent(expected));
  });
});
