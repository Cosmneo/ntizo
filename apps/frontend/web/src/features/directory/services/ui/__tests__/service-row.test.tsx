import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { ServiceRow } from "../service-row";
import type { ServiceDTO } from "../../domain/types";

/**
 * The row rendered inside a router stub, the same harness
 * `service-listing-card.test.tsx` and `provider-hero.test.tsx` build: every
 * claim this row makes about its own `<Link to="/services/$id">` throws
 * outside a router, and there is nothing else this component needs from one
 * (no `QueryClient`, no viewmodel mock — `ServiceRow` is handed a `ServiceDTO`
 * and asks nothing of anybody).
 */
const base: ServiceDTO = {
  id: "s1",
  providerId: "p1",
  providerName: "Hélder Cossa",
  providerSlug: "helder",
  providerType: "individual",
  providerVerified: true,
  providerRatingAverage: 4.8,
  providerReviewCount: 4,
  categoryCode: "electricity",
  categoryName: "Electricidade",
  name: "Avaria eléctrica urgente",
  description: "Deslocação e diagnóstico.",
  locationType: "at_customer",
  bookingMode: "priced",
  imageUrls: [],
  defaultOption: {
    amountMinor: 120000,
    currency: "MZN",
    durationMinutes: 60,
    minMinutes: null,
    stepMinutes: null,
    pricingMode: "fixed",
  },
  fromAmountMinor: 120000,
  optionCount: 1,
  isFallback: false,
};

function renderRow(
  service: ServiceDTO,
  providerImageUrl: string | null = null,
  onSelect: (service: ServiceDTO) => void = () => {},
) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <ul>
        <ServiceRow
          service={service}
          providerImageUrl={providerImageUrl}
          locale="pt-MZ"
          onSelect={onSelect}
        />
      </ul>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("ServiceRow", () => {
  it("shows the name, the description and the price", async () => {
    renderRow(base);
    expect(await screen.findByText("Avaria eléctrica urgente")).toBeInTheDocument();
    expect(screen.getByText("Deslocação e diagnóstico.")).toBeInTheDocument();
    // `formatAmount(120000, "MZN", "pt-MZ")` prints "1200,00 MTn" — no
    // thousands separator below five digits in this locale's CLDR data (see
    // `service-listing-card.test.tsx`'s own note on `useGrouping`), so the
    // brief's `/1[\s.,]?200/` matches the "1200" substring directly, with its
    // optional separator group matching nothing. Verified against the real
    // `Intl.NumberFormat` output rather than trusted blind.
    expect(screen.getByText(/1[\s.,]?200/)).toBeInTheDocument();
  });

  it("offers the calendar for a priced service", async () => {
    const onSelect = vi.fn();
    renderRow(base, null, onSelect);
    await userEvent.click(await screen.findByRole("button", { name: "See availability" }));
    expect(onSelect).toHaveBeenCalledWith(base);
  });

  it("says a quote service is on request, and does not offer a calendar", async () => {
    // A quote service has no fixed duration and no price, so there is no slot
    // to check — the same reason ServiceQuoteNotice replaces the availability
    // button on the service page.
    const quote: ServiceDTO = {
      ...base,
      bookingMode: "quote",
      defaultOption: null,
      fromAmountMinor: null,
      optionCount: 0,
    };
    renderRow(quote);
    expect(await screen.findByText("On request")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "See availability" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request a quote" })).toBeInTheDocument();
  });

  it("falls back to the provider's photo when the service has none", async () => {
    renderRow(base, "https://cdn.test/logo.jpg");
    expect(await screen.findByRole("img")).toHaveAttribute("src", "https://cdn.test/logo.jpg");
  });

  it("renders without any photo at all", async () => {
    renderRow(base);
    expect(await screen.findByText("Avaria eléctrica urgente")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("links the name to the service's own page", async () => {
    renderRow(base);
    expect(
      await screen.findByRole("link", { name: "Avaria eléctrica urgente" }),
    ).toHaveAttribute("href", expect.stringContaining("/services/s1"));
  });
});
