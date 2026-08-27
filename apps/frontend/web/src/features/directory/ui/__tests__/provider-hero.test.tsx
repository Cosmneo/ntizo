import { afterEach, describe, expect, it, vi } from "vitest";
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
import type { ProviderPublicDTO } from "@ntizo/shared";
import * as client from "@/shared/lib/graphql/session-graphql";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import { ProviderHero } from "../provider-hero";

/**
 * The way into the Communication context from a provider's public page.
 *
 * Without this button, `/messages` and `communicationStartThread` are both
 * fully built and reachable by nobody — the same shape of failure as a
 * handler that is written, tested and never mounted. This test renders the
 * real `ProviderHero` (not a stub of it) through a real router and a real
 * `useStartThread()`, mocking only the network boundary
 * (`sessionGraphql`) — so removing the button, or leaving it unwired,
 * reds this test rather than something adjacent to it.
 */

afterEach(() => vi.restoreAllMocks());

function provider(over: Partial<ProviderPublicDTO> = {}): ProviderPublicDTO {
  return {
    id: "prov-1",
    name: "Studio Beleza",
    slug: "studio-beleza",
    type: "organization",
    description: null,
    city: "Maputo",
    district: null,
    country: "Mozambique",
    logoUrl: null,
    photoUrls: [],
    verified: false,
    ratingAverage: null,
    reviewCount: 0,
    categories: [],
    serviceCount: 1,
    fromAmountMinor: null,
    fromCurrency: null,
    ...over,
  };
}

function renderHero() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <ProviderHero provider={provider()} />,
  });
  // Both destinations the button can send someone to, so navigation is
  // asserted against the router's own resolved location rather than a
  // mocked `navigate` call — the latter would pass even if the `to`/`search`
  // shape was wrong in a way the mock did not care about.
  const messagesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/messages",
    validateSearch: (search: Record<string, unknown>) =>
      search as { thread?: string },
    component: () => <p>messages page</p>,
  });
  const signInRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sign-in",
    validateSearch: (search: Record<string, unknown>) => search as { next?: string },
    component: () => <p>sign in page</p>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, messagesRoute, signInRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
}

describe("ProviderHero's message button", () => {
  // `findByRole` (not `getByRole`) everywhere below: `createRouter`'s
  // initial match resolves a tick after `render()` returns, the same async
  // seam `service-detail-page.test.tsx` already works around the same way.

  it("is present on the page at all", async () => {
    renderHero();
    expect(await screen.findByRole("button", { name: /message/i })).toBeInTheDocument();
  });

  it("starts a thread and navigates to it on click", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ communicationStartThread: { id: "t42" } } as never);
    const user = userEvent.setup();

    const router = renderHero();
    await user.click(await screen.findByRole("button", { name: /message/i }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/messages"));
    expect(router.state.location.search).toEqual({ thread: "t42" });

    const [, variables] = spy.mock.calls[0]!;
    expect(variables).toEqual({ input: { providerId: "prov-1" } });
  });

  it("sends a signed-out visitor to sign in, carrying the way back", async () => {
    vi.spyOn(client, "sessionGraphql").mockRejectedValue(
      new GraphqlError(200, [
        {
          message: "Sign in to send a message",
          extensions: { code: "FORBIDDEN", originalCode: "UNAUTHENTICATED" },
        },
      ]),
    );
    const user = userEvent.setup();

    const router = renderHero();
    await user.click(await screen.findByRole("button", { name: /message/i }));

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

    const router = renderHero();
    await user.click(await screen.findByRole("button", { name: /message/i }));

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

    const router = renderHero();
    await user.click(await screen.findByRole("button", { name: /message/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't start that conversation. Please try again.",
    );
    expect(router.state.location.pathname).toBe("/");
  });
});
