import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { ServiceQuoteNotice } from "../service-quote-notice";

/**
 * Rendered inside a router and a `QueryClientProvider`, the same harness
 * `rail-price-summary.test.tsx` builds for the identical reason: the button
 * this notice renders is now the real `MessageProviderButton`, which reads
 * the current pathname and calls `useStartThread` (a `useMutation`) — neither
 * exists without both providers in the tree, even before anything is
 * clicked.
 */
function renderNotice(providerId = "p1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <ServiceQuoteNotice providerId={providerId} />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("ServiceQuoteNotice", () => {
  it("explains that the price is not knowable until the provider has seen the job", async () => {
    renderNotice();
    // The first assertion is a `findBy*`: `createRouter`'s initial match
    // resolves a tick after `render()` returns, the same async seam
    // `rail-price-summary.test.tsx` works around the same way. The exact
    // English copy of `availabilityQuoteNotice` — reused rather than
    // duplicated, so this test also pins that the reuse stays wired.
    expect(
      await screen.findByText(
        "This service is priced by quote. Contact the provider to get a price before it can be scheduled.",
      ),
    ).toBeInTheDocument();
  });

  it("offers a working way to contact the provider — the only action a quote service's page has", async () => {
    // A quote service can be neither booked nor scheduled, so this button is
    // not one option among several: it is what closes follow-up #69, where
    // this same slot rendered the identical control disabled behind a
    // sentence claiming messaging was not open on the platform.
    renderNotice();
    const button = await screen.findByRole("button", { name: "Send message" });
    expect(button).toBeEnabled();
  });
});
