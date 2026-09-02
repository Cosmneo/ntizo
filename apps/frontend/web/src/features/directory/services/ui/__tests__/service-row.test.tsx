import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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

function renderRow(service: ServiceDTO, providerImageUrl: string | null = null) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <ul>
        <ServiceRow service={service} providerImageUrl={providerImageUrl} locale="pt-MZ" />
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
    // `formatHeadlinePrice(120000, "MZN", "pt-MZ")` prints "1 200 MTn" — a
    // non-breaking space groups the thousands (`useGrouping: "always"`,
    // needed because `pt-MZ`'s `minimumGroupingDigits: 2` would otherwise
    // leave a four-digit price ungrouped), no decimals. `\s` in a JS regex
    // matches U+00A0, so `/1[\s.,]?200/` matches the grouped form directly.
    // Verified against the real `Intl.NumberFormat` output rather than
    // trusted blind.
    expect(screen.getByText(/1[\s.,]?200/)).toBeInTheDocument();
    // The headline is a price *cell*, not a checkout total — no decimal part,
    // unlike `formatAmount`'s "1200,00" (see `formatHeadlinePrice`'s own doc
    // comment for the headline-vs-total distinction).
    expect(screen.queryByText(/,00/)).not.toBeInTheDocument();
  });

  it("starts checkout for a priced service", async () => {
    // A link to step 1, not a callback that opened a dialog: `/book/<id>` is
    // where a time is chosen and the slot is held, and it is a URL precisely
    // so it survives a new tab, a refresh, and the trip through sign-in.
    renderRow(base);
    expect(await screen.findByRole("link", { name: "See availability" })).toHaveAttribute(
      "href",
      expect.stringContaining("/book/s1"),
    );
  });

  it("prices an hourly service with its /h suffix, and shows the minimum booking rather than a duration", async () => {
    // Traced as correct from `optionDurationMinutes` and `servicePriceAndCta`
    // but, until now, exercised by nothing — and an hourly service is in the
    // approved design for this page, not a hypothetical branch.
    const hourly: ServiceDTO = {
      ...base,
      defaultOption: {
        amountMinor: 120000,
        currency: "MZN",
        durationMinutes: null,
        minMinutes: 240,
        stepMinutes: 60,
        pricingMode: "hourly",
      },
    };
    renderRow(hourly);
    // `optionDurationMinutes` returns `minMinutes` for an hourly option,
    // never `durationMinutes` — the customer chooses how long the job runs,
    // so the meta line states the shortest booking allowed, not a fixed
    // length the provider does not actually set. A regex rather than an
    // exact string: the meta line joins duration, location and pricing mode
    // into one line (`"240 min minimum · At your place"`), so the duration
    // is a substring of a bigger text node, not a node of its own.
    expect(await screen.findByText(/240 min minimum/)).toBeInTheDocument();
    expect(screen.getByText(/\/h/)).toBeInTheDocument();
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
    expect(screen.queryByRole("link", { name: "See availability" })).not.toBeInTheDocument();
    // Its own page, not checkout: `booking.create` takes a `serviceOptionId`
    // and a quote service has none to give it.
    expect(screen.getByRole("link", { name: "Request a quote" })).toHaveAttribute(
      "href",
      expect.stringContaining("/services/s1"),
    );
  });

  it("falls back to the provider's photo when the service has none", async () => {
    // The thumbnail is decorative (`alt=""` —
    // the service's name is already adjacent link text), so it carries no
    // accessible role to query by. The DOM is read directly instead, the
    // same trade-off `service-listing-card.test.tsx` makes for its own
    // decorative thumbnail.
    const { container } = renderRow(base, "https://cdn.test/logo.jpg");
    await screen.findByText("Avaria eléctrica urgente");
    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn.test/logo.jpg");
  });

  it("renders without any photo at all", async () => {
    const { container } = renderRow(base);
    expect(await screen.findByText("Avaria eléctrica urgente")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("links the name to the service's own page", async () => {
    renderRow(base);
    expect(
      await screen.findByRole("link", { name: "Avaria eléctrica urgente" }),
    ).toHaveAttribute("href", expect.stringContaining("/services/s1"));
  });
});
