import { afterEach, describe, expect, it, vi } from "vitest";
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
import type {
  ProviderPublicDetailDTO,
  ProviderReviewsPublicDTO,
} from "@ntizo/shared/read-models";
import * as client from "@/shared/lib/graphql/session-graphql";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";

/**
 * What the assembled page says, and — more often — what it refuses to say.
 *
 * The viewmodel hooks are the seam, never a seeded `QueryClient`: the
 * `boundaries/dependencies` rule forbids a `ui/` file from importing `data/`,
 * test files included, and rightly — a ui component knows its hooks, not
 * where they store things. The same choice `directory-page.test.tsx` and
 * `service-detail-page.test.tsx` already document.
 *
 * Every first assertion is a `findBy*`: `createRouter`'s initial match
 * resolves a tick after `render()` returns, the same async seam
 * `provider-hero.test.tsx` and `service-detail-page.test.tsx` work around the
 * same way. Once one element is found the tree is settled and the rest of a
 * test can query synchronously.
 */

const state: {
  provider: ProviderPublicDetailDTO | null;
  reviews: ProviderReviewsPublicDTO | undefined;
} = { provider: null, reviews: undefined };

vi.mock("@/features/directory/viewmodel/use-directory", () => ({
  useProviderDetail: () => state.provider,
  useProviderReviews: () => state.reviews,
}));

vi.mock("@/features/directory/services/viewmodel/use-provider-services", () => ({
  useProviderServices: () => ({ data: { items: [] }, isPending: false, isError: false }),
}));

const { ProviderDetailPage } = await import("../provider-detail-page");

afterEach(() => vi.restoreAllMocks());

function provider(over: Partial<ProviderPublicDetailDTO> = {}): ProviderPublicDetailDTO {
  return {
    id: "p1",
    name: "Hélder Cossa",
    slug: "helder-cossa",
    type: "individual",
    description: "Electricista certificado com nove anos de trabalho em Maputo.",
    city: "Maputo",
    district: "Sommerschield",
    country: "MZ",
    logoUrl: null,
    photoUrls: [],
    verified: true,
    ratingAverage: 4.8,
    reviewCount: 4,
    categories: [{ code: "electricity", name: "Electricity" }],
    serviceCount: 3,
    fromAmountMinor: 120000,
    fromCurrency: "MZN",
    memberSince: "2025-03",
    serviceLocationTypes: ["at_customer"],
    weeklyHours: [
      { weekday: 0, intervals: [] },
      ...[1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        intervals: [{ startMinute: 480, endMinute: 1080 }],
      })),
      { weekday: 6, intervals: [{ startMinute: 540, endMinute: 840 }] },
    ],
    ...over,
  };
}

const CLOSED_ALL_WEEK = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, intervals: [] }));

function renderPage(
  value: ProviderPublicDetailDTO | null,
  reviews: ProviderReviewsPublicDTO | undefined = undefined,
) {
  state.provider = value;
  state.reviews = reviews;

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <ProviderDetailPage slug="helder-cossa" />,
  });
  // The breadcrumb links to `/providers`, twice — once bare and once carrying
  // this provider's own category as a filter. Registered here so those links
  // resolve against a real route rather than making the router build an href
  // for a path its tree has never heard of.
  const providersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/providers",
    validateSearch: (search: Record<string, unknown>) => search as { category?: string },
    component: () => <p>providers</p>,
  });
  // Both destinations the rail's message button can send someone to, so
  // navigation is asserted against the router's own resolved location rather
  // than a mocked `navigate` call — the latter would pass even if the
  // `to`/`search` shape was wrong in a way the mock did not care about.
  const messagesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/messages",
    validateSearch: (search: Record<string, unknown>) => search as { thread?: string },
    component: () => <p>messages page</p>,
  });
  const signInRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sign-in",
    validateSearch: (search: Record<string, unknown>) => search as { next?: string },
    component: () => <p>sign in page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, providersRoute, messagesRoute, signInRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
    router,
  };
}

/** The sticky right-hand column, so "from" is asked of the price and not of the page. */
function rail() {
  return screen.getByRole("complementary");
}

/**
 * The facts row's own `<dl>`.
 *
 * Scoped rather than queried globally, and by text rather than by accessible
 * name, for two separate reasons that both have to be worked around at once:
 *
 * - `getByText("Services")` matches two elements — the fact's `<dt>` and the
 *   services section's `<h2>` — and throws.
 * - `getByRole("term", { name: "Services" })` does not fix that, because the
 *   `term` role takes its accessible name from the author only. A `<dt>`
 *   whose text is "Services" has no accessible name at all, so the query
 *   matches nothing.
 *
 * So the row is located by "Category", which is unique on this page, and
 * every other fact is then asked of that `<dl>` — which also keeps
 * `WeeklyHoursCard`'s own `<dl>` of weekdays, in the rail, out of the answer.
 */
function facts(): HTMLElement {
  const dl = screen.getByText("Category").closest("dl");
  if (!dl) throw new Error("The facts row is not a <dl>");
  return dl;
}

/** The facts row's labels, in the order the page prints them. */
function factLabels(): (string | null)[] {
  return within(facts())
    .getAllByRole("term")
    .map((term) => term.textContent);
}

describe("ProviderDetailPage", () => {
  it("names the provider and its trade", async () => {
    renderPage(provider());
    expect(
      await screen.findByRole("heading", { level: 1, name: /Hélder Cossa/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Electricity/).length).toBeGreaterThan(0);
  });

  it("states the four facts", async () => {
    renderPage(provider());
    await screen.findByRole("heading", { level: 1, name: /Hélder Cossa/ });
    expect(factLabels()).toEqual(["Category", "Works", "Services", "On Ntizo since"]);
    expect(within(facts()).getByText("Electricity")).toBeInTheDocument();
    expect(within(facts()).getByText("At your place")).toBeInTheDocument();
    expect(within(facts()).getByText("3")).toBeInTheDocument();
    expect(within(facts()).getByText("March 2025")).toBeInTheDocument();
  });

  it("states a service count of zero rather than dropping the fact", async () => {
    // `DetailFacts` drops a fact whose value is the empty string, which means
    // "we failed to read this". Zero published services is not that — it is a
    // fact, and the honest one for a provider who has published nothing.
    renderPage(provider({ serviceCount: 0 }));
    await screen.findByRole("heading", { level: 1, name: /Hélder Cossa/ });
    expect(factLabels()).toContain("Services");
    expect(within(facts()).getByText("0")).toBeInTheDocument();
  });

  it("names every place a provider works, never collapsing them into one word", async () => {
    // `flexible` is one of the four location types, not a word for "several".
    // A provider who travels *and* receives must read as both.
    renderPage(
      provider({ serviceLocationTypes: ["at_customer", "at_provider", "remote"] }),
    );
    await screen.findByRole("heading", { level: 1, name: /Hélder Cossa/ });
    expect(
      within(facts()).getByText("At your place · At their place · Remotely"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Depends")).not.toBeInTheDocument();
  });

  it("omits the join month when there is none, rather than printing a blank", async () => {
    renderPage(provider({ memberSince: null }));
    await screen.findByRole("heading", { level: 1, name: /Hélder Cossa/ });
    expect(factLabels()).not.toContain("On Ntizo since");
    // The other three survive, so the absence above is one fact dropping out
    // and not the whole row failing to render.
    expect(factLabels()).toEqual(["Category", "Works", "Services"]);
  });

  it("puts the cheapest price and the message button in the rail", async () => {
    renderPage(provider());
    expect(await screen.findByRole("button", { name: "Send message" })).toBeInTheDocument();
    // Scoped to the rail: "from" is three letters, and `priceFrom` prints it
    // again beside every service row on the same page.
    expect(within(rail()).getByText("from")).toBeInTheDocument();
    expect(within(rail()).getByText("The cheapest of 3 published services.")).toBeInTheDocument();
  });

  it("says nothing about a price when the provider publishes nothing priced", async () => {
    // 0 MZN is a number somebody could charge. A provider with no priced
    // service has no "from", and the rail must not invent one.
    renderPage(provider({ fromAmountMinor: null, fromCurrency: null, serviceCount: 0 }));
    expect(await screen.findByRole("button", { name: "Send message" })).toBeInTheDocument();
    expect(within(rail()).queryByText("from")).not.toBeInTheDocument();
  });

  it("claims verification for a verified provider", async () => {
    renderPage(provider({ verified: true }));
    expect(await screen.findByText(/verified by Ntizo/i)).toBeInTheDocument();
  });

  it("makes no verification claim for an unverified one", async () => {
    // `verified` means an administrator accepted a document. A badge that is
    // always lit says nothing, and a sentence that is always printed lies.
    renderPage(provider({ verified: false }));
    await screen.findByRole("heading", { level: 1, name: /Hélder Cossa/ });
    expect(screen.queryByText(/verified by Ntizo/i)).not.toBeInTheDocument();
    // The other bullet is unconditional and stays, so the absence above is
    // the verification sentence going and not the whole list.
    expect(screen.getByText(/Messages stay on Ntizo/i)).toBeInTheDocument();
  });

  it("shows the usual week, collapsed", async () => {
    renderPage(provider());
    expect(await screen.findByText("Availability")).toBeInTheDocument();
    expect(screen.getByText("08:00 – 18:00")).toBeInTheDocument();
    expect(screen.getByText("09:00 – 14:00")).toBeInTheDocument();
  });

  it("says nothing about hours a provider never configured", async () => {
    renderPage(provider({ weeklyHours: CLOSED_ALL_WEEK }));
    await screen.findByRole("heading", { level: 1, name: /Hélder Cossa/ });
    expect(screen.queryByText("Availability")).not.toBeInTheDocument();
  });

  it("puts the description under its own heading rather than dropping it", async () => {
    renderPage(provider());
    expect(await screen.findByRole("heading", { name: "About" })).toBeInTheDocument();
    expect(
      screen.getByText("Electricista certificado com nove anos de trabalho em Maputo."),
    ).toBeInTheDocument();
  });

  it("offers no booking anywhere on the page", async () => {
    renderPage(provider());
    await screen.findByRole("heading", { level: 1, name: /Hélder Cossa/ });
    expect(
      screen.queryByRole("button", { name: /^book$|reservar|pedir marca/i }),
    ).not.toBeInTheDocument();
  });

  it("reads as finished for a provider with no photos, no hours and no reviews", async () => {
    // The common case, not the edge one: most providers have uploaded nothing
    // and configured nothing.
    renderPage(provider({ photoUrls: [], weeklyHours: CLOSED_ALL_WEEK }), undefined);
    expect(
      await screen.findByRole("heading", { level: 1, name: /Hélder Cossa/ }),
    ).toBeInTheDocument();
    // The site header's own logo is an `img`, so this asks about the gallery
    // specifically rather than about images in general.
    expect(screen.queryByAltText("Hélder Cossa")).not.toBeInTheDocument();
    // The rail still carries something to act on, which is what stops the
    // stripped-back page reading as one that failed to load.
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  });

  it("shows the not-found copy for a slug that resolves to nothing", async () => {
    renderPage(null);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Provider not found" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: /Hélder Cossa/ }),
    ).not.toBeInTheDocument();
  });
});

/**
 * The way into the Communication context from a provider's public page,
 * driven through the whole page rather than through the button alone.
 *
 * These four moved here from `provider-hero.test.tsx` when the button moved
 * from the hero into the rail. Without them `/messages` and
 * `communicationStartThread` are both fully built and reachable by nobody —
 * the same shape of failure as a handler that is written, tested and never
 * mounted — and the move itself is exactly the kind of change that breaks a
 * redirect quietly. Only the network boundary (`sessionGraphql`) is mocked;
 * the router, `useStartThread` and the rail are all real.
 */
describe("the rail's message button", () => {
  it("starts a thread and navigates to it on click", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationStartThread: { id: "t42" } } as never);
    const user = userEvent.setup();

    const { router } = renderPage(provider());
    await user.click(await screen.findByRole("button", { name: "Send message" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/messages"));
    expect(router.state.location.search).toEqual({ thread: "t42" });

    // Found by its own query rather than read off `calls[0]`: this page also
    // renders the site header, whose session and unread-count queries go
    // through the same `sessionGraphql` and land in this spy first.
    const call = spy.mock.calls.find(([query]) => String(query).includes("StartThread"));
    expect(call?.[1]).toEqual({ input: { providerId: "p1" } });
  });

  it("sends a signed-out visitor to sign in, carrying the way back", async () => {
    // The assertion on `next` is the one that catches the redirect effect
    // being "tidied up" during a move: adding `pathname` to its dependency
    // array turns the navigation it just performed into its own retrigger,
    // and this reads back "/sign-in" instead of the page it started from.
    vi.spyOn(client, "sessionGraphql").mockRejectedValue(
      new GraphqlError(200, [
        {
          message: "Sign in to send a message",
          extensions: { code: "FORBIDDEN", originalCode: "UNAUTHENTICATED" },
        },
      ]),
    );
    const user = userEvent.setup();

    const { router } = renderPage(provider());
    await user.click(await screen.findByRole("button", { name: "Send message" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/sign-in"));
    expect(router.state.location.search).toEqual({ next: "/" });
  });

  it("shows this provider's own refusal without redirecting anywhere", async () => {
    vi.spyOn(client, "sessionGraphql").mockRejectedValue(
      new GraphqlError(200, [
        {
          message: "This provider cannot be messaged.",
          extensions: { code: "UNPROCESSABLE", originalCode: "PROVIDER_NOT_CONTACTABLE" },
        },
      ]),
    );
    const user = userEvent.setup();

    const { router } = renderPage(provider());
    await user.click(await screen.findByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/can't be messaged/i);
    expect(router.state.location.pathname).toBe("/");
  });

  it("falls back to the generic sentence for a code it does not recognise", async () => {
    // Pinned to the real generic sentence, not to "an alert exists" or "the
    // text isn't PROVIDER_NOT_CONTACTABLE" — both pass just as well against
    // `const knownError = errorCode === "PROVIDER_NOT_CONTACTABLE" ? errorCode
    // : errorCode;`, which deletes the allowlist and lets an unrecognised
    // code flow straight into `t(\`messageProviderError.${errorCode}\`)`, so
    // i18next renders the raw missing key instead of a sentence. Asserting
    // the actual sentence is what reds under that mutation.
    vi.spyOn(client, "sessionGraphql").mockRejectedValue(
      new GraphqlError(200, [
        {
          message: "Something else went wrong.",
          extensions: { code: "UNPROCESSABLE", originalCode: "SOME_FUTURE_CODE" },
        },
      ]),
    );
    const user = userEvent.setup();

    const { router } = renderPage(provider());
    await user.click(await screen.findByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't start that conversation. Please try again.",
    );
    expect(router.state.location.pathname).toBe("/");
  });
});
