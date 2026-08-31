import { describe, expect, it, vi } from "vitest";
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
import type { ServiceDetailOptionDTO } from "@ntizo/shared/read-models";
import { RailPriceSummary } from "../rail-price-summary";

const FIXED: ServiceDetailOptionDTO = {
  id: "opt-1",
  name: "Diagnóstico e reparação",
  amountMinor: 120000,
  currency: "MZN",
  durationMinutes: 60,
  minMinutes: null,
  stepMinutes: null,
  pricingMode: "fixed",
  isDefault: true,
};

function renderRail(
  option: ServiceDetailOptionDTO,
  { onCheck = () => {}, verified = true }: { onCheck?: () => void; verified?: boolean } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <RailPriceSummary
        option={option}
        locale="en-US"
        providerId="p1"
        providerVerified={verified}
        onCheckAvailability={onCheck}
      />
    ),
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

/**
 * Every first assertion is a `findBy*`: `createRouter`'s initial match
 * resolves a tick after `render()` returns, the same async seam
 * `provider-detail-page.test.tsx` and `service-detail-page.test.tsx` work
 * around the same way. The router is not optional scaffolding here —
 * `MessageProviderButton` reads the current pathname and navigates with it —
 * so there is no synchronous render of this card to assert against. Once one
 * element is found the tree is settled and the rest of a test can query
 * synchronously.
 */
describe("RailPriceSummary", () => {
  it("charges exactly the price the provider set, with nothing added", async () => {
    // 120000 minor units is 1200.00 — the provider's own price, unmarked up.
    // The 2026-08-30 decision means this is what the customer pays, so there
    // is no separate fee line to assert: the headline total *is* the price.
    renderRail(FIXED);
    expect(await screen.findByTestId("booking-total")).toHaveTextContent(/1[.,\s]?200/);
    expect(screen.queryByText(/Ntizo commission/)).not.toBeInTheDocument();
  });

  it("says the bookings are not open yet", async () => {
    renderRail(FIXED);
    expect(await screen.findByText("Bookings aren't open on Ntizo yet.")).toBeInTheDocument();
  });

  it("offers no control that implies a reservation was made", async () => {
    renderRail(FIXED);
    // The two controls the card does offer, awaited first, so the absence
    // below is asserted against a rendered card rather than an empty tree.
    expect(await screen.findByRole("button", { name: "See availability" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^book$/i })).not.toBeInTheDocument();
  });

  it("opens the calendar when asked", async () => {
    const onCheck = vi.fn();
    renderRail(FIXED, { onCheck });
    await userEvent.click(await screen.findByRole("button", { name: "See availability" }));
    expect(onCheck).toHaveBeenCalledOnce();
  });

  it("labels an hourly option by its minimum, not by a duration it does not have", async () => {
    renderRail({
      ...FIXED,
      pricingMode: "hourly",
      durationMinutes: null,
      minMinutes: 240,
      stepMinutes: 60,
    });
    expect(await screen.findByText("240 min minimum")).toBeInTheDocument();
  });

  it("makes no verification claim for an unverified provider", async () => {
    renderRail(FIXED, { verified: false });
    // The unconditional bullet, awaited first: without it this would pass
    // just as well against a card that rendered no trust list at all.
    expect(await screen.findByText(/already includes the service fee/i)).toBeInTheDocument();
    expect(screen.queryByText(/verified by Ntizo/i)).not.toBeInTheDocument();
  });

  it("always says the fee is already in the total", async () => {
    renderRail(FIXED);
    expect(await screen.findByText(/already includes the service fee/i)).toBeInTheDocument();
  });
});
