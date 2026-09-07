import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ServiceDTO } from "@ntizo/shared/read-models";
import { ServiceCard } from "../service-card";

/**
 * The card rendered inside a router stub, because every claim it makes is
 * about a `<Link>` — where the title goes — and a `<Link>` outside a router
 * throws rather than rendering an `<a>`.
 *
 * No `QueryClient` and no viewmodel mock: this card is handed a `ServiceDTO`
 * and asks nothing of anybody. `/services`, `/providers/$slug` and the home
 * page's own rail all render this same component now, so its own suite lives
 * here rather than under any one of them — the same reasoning
 * `service-tile.test.tsx` gave before this card replaced that tile.
 */
function service(over: Partial<ServiceDTO> = {}): ServiceDTO {
  return {
    id: "svc-1",
    providerId: "prov-1",
    providerName: "Estúdio Mavalane",
    providerSlug: "estudio-mavalane",
    providerType: "organization",
    providerRatingAverage: 4.7,
    providerReviewCount: 6,
    categoryCode: "hair",
    categoryName: "Hair & beauty",
    name: "Corte de cabelo",
    description: null,
    locationType: "at_provider",
    bookingMode: "priced",
    imageUrls: [],
    defaultOption: {
      amountMinor: 80_000,
      currency: "MZN",
      durationMinutes: 45,
      minMinutes: null,
      stepMinutes: null,
      pricingMode: "fixed",
    },
    fromAmountMinor: 80_000,
    optionCount: 1,
    isFallback: false,
    providerVerified: false,
    ...over,
  };
}

const option = service().defaultOption!;

function renderCard(dto: ServiceDTO, locale = "en-US") {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <ul>
        <li>
          <ServiceCard service={dto} locale={locale} />
        </li>
      </ul>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("ServiceCard", () => {
  it("prints the price in full and the duration beside it", async () => {
    renderCard(service());
    await screen.findByRole("listitem");
    // `formatHeadlinePrice(80_000, "MZN", "en-US")` prints "MZN 800", not
    // "800 MZN": `en-US` has no short symbol for MZN, so `Intl` falls back to
    // the ISO code and, in that locale, places it before the number.
    expect(screen.getByText("MZN 800")).toBeInTheDocument();
    expect(screen.getByText("45 min")).toBeInTheDocument();
  });

  it("labels the rating as the provider's average, not the service's own", async () => {
    renderCard(service());
    await screen.findByRole("listitem");
    // The score is the provider's average across everything they sell. A
    // bare number beside the service's name would claim a per-service
    // rating this product does not have.
    expect(screen.getByLabelText(/out of 5/i)).toBeInTheDocument();
  });

  it("answers a quote with words", async () => {
    renderCard(service({ bookingMode: "quote", defaultOption: null }));
    await screen.findByRole("listitem");
    expect(screen.getByText("Price to agree")).toBeInTheDocument();
    expect(screen.queryByText(/0 MZN/)).toBeNull();
  });

  it("says how many options there are, and prices from the cheapest", async () => {
    renderCard(service({ optionCount: 3, fromAmountMinor: 250_000 }));
    await screen.findByRole("listitem");
    expect(screen.getByText("from")).toBeInTheDocument();
    expect(screen.getByText("3 options")).toBeInTheDocument();
  });

  it("says the price is unavailable for a priced service with no active option", async () => {
    // `canPublish` refuses to publish a `priced` service with zero options at
    // publish time, but a provider can deactivate the last option afterwards.
    // That state reaches this card as `defaultOption: null` on a `priced`
    // service, and it must not read as a free or a zero-priced job.
    renderCard(service({ defaultOption: null }));
    await screen.findByRole("listitem");
    expect(screen.getByText("Price unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/0 MZN/)).toBeNull();
  });

  it("draws the unit inside an hourly amount", async () => {
    renderCard(
      service({
        defaultOption: {
          ...option,
          amountMinor: 50_000,
          pricingMode: "hourly",
          durationMinutes: null,
          minMinutes: 60,
        },
      }),
    );
    await screen.findByRole("listitem");
    expect(screen.getByText(/MZN.?500/)).toHaveTextContent("/h");
  });

  it("says New where the rating would be, for a provider nobody has reviewed", async () => {
    // Not a zero: a provider nobody has reviewed yet is new, and rendering
    // 0,0 calls it the worst on the platform.
    renderCard(service({ providerRatingAverage: null, providerReviewCount: 0 }));
    await screen.findByRole("listitem");
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("is exactly one link", async () => {
    renderCard(service());
    await screen.findByRole("listitem");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("falls back to the site's placeholder when the service has no photograph", async () => {
    renderCard(service({ imageUrls: [] }));
    await screen.findByRole("listitem");
    expect(screen.getByTestId("media-fallback")).toBeInTheDocument();
  });
});
