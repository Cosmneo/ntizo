import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ServiceDTO } from "@ntizo/shared/read-models";
import { ServiceTile } from "../service-tile";

/**
 * The tile rendered inside a router stub, because every claim it makes is
 * about a `<Link>` — where the title goes — and a `<Link>` outside a router
 * throws rather than rendering an `<a>`.
 *
 * No `QueryClient` and no viewmodel mock: this tile is handed a `ServiceDTO`
 * and asks nothing of anybody. The harness is the one
 * `service-listing-card.test.tsx` used, minus the seam it does not need,
 * rendering inside an `<li>` the way a browse grid actually hosts a tile.
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

function renderTile(dto: ServiceDTO, locale = "en-US") {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <ul>
        <li>
          <ServiceTile service={dto} locale={locale} />
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

describe("ServiceTile", () => {
  // Every test awaits `findByRole("listitem")` first: `RouterProvider`
  // resolves its route asynchronously even with no loader, so a bare
  // synchronous `render` leaves the container empty and every query beneath
  // it fails.
  it("prints the price in full and the duration beside it", async () => {
    renderTile(service());
    await screen.findByRole("listitem");
    // `formatHeadlinePrice(80_000, "MZN", "en-US")` prints "MZN 800", not
    // "800 MZN": `en-US` has no short symbol for MZN, so `Intl` falls back to
    // the ISO code and, in that locale, places it before the number — the
    // same order `service-listing-card.test.tsx` asserted for this same
    // formatter. Verified against the real `Intl.NumberFormat` output rather
    // than trusted blind.
    expect(screen.getByText("MZN 800")).toBeInTheDocument();
    expect(screen.getByText("45 min")).toBeInTheDocument();
  });

  it("puts the rating on the provider's line, labelled as the provider's", async () => {
    renderTile(service());
    await screen.findByRole("listitem");
    // The score is the provider's average across everything they sell. Beside
    // the service's name it would claim a per-service rating that does not
    // exist in this product.
    const byline = screen.getByTestId("tile-byline");
    expect(byline).toHaveTextContent("Estúdio Mavalane");
    expect(within(byline).getByLabelText(/out of 5/i)).toBeInTheDocument();
  });

  it("answers a quote with words", async () => {
    renderTile(service({ bookingMode: "quote", defaultOption: null }));
    await screen.findByRole("listitem");
    expect(screen.getByText("Price to agree")).toBeInTheDocument();
    expect(screen.queryByText(/0 MZN/)).toBeNull();
  });

  it("offers a quote hint beside the words", async () => {
    // `priceQuoteHint` is the meta line beside `priceToAgree`'s amount — a
    // reader who sees "Price to agree" alone has no next step; the hint
    // ("Ask for a quote") is the one this branch of `servicePriceLine`
    // carries and nothing exercised it until now.
    renderTile(service({ bookingMode: "quote", defaultOption: null }));
    await screen.findByRole("listitem");
    expect(screen.getByText("Price to agree")).toBeInTheDocument();
    expect(screen.getByText("Ask for a quote")).toBeInTheDocument();
  });

  it("says how many options there are, and prices from the cheapest", async () => {
    // `servicePriceCell`'s "from" branch — more than one active option — was
    // wired through (`line.amount.from`, `priceOptionCount`) but nothing
    // rendered it until now.
    renderTile(service({ optionCount: 3, fromAmountMinor: 250_000 }));
    await screen.findByRole("listitem");
    expect(screen.getByText("from")).toBeInTheDocument();
    expect(screen.getByText("3 options")).toBeInTheDocument();
  });

  it("says the price is unavailable for a priced service with no active option", async () => {
    // `canPublish` refuses to publish a `priced` service with zero options at
    // publish time, but a provider can deactivate the last option afterwards
    // — see `servicePriceCell`'s own doc comment. That state reaches this
    // tile as `defaultOption: null` on a `priced` service, and it must not
    // read as a free or a zero-priced job.
    renderTile(service({ defaultOption: null }));
    await screen.findByRole("listitem");
    expect(screen.getByText("Price unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/0 MZN/)).toBeNull();
  });

  it("draws the unit inside an hourly amount", async () => {
    renderTile(
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
    // Same "MZN" ordering as the fixed-price test above: "MZN 500", not
    // "500 MZN".
    expect(screen.getByText(/MZN.?500/)).toHaveTextContent("/h");
  });

  it("says New where the rating would be, for a provider nobody has reviewed", async () => {
    renderTile(service({ providerRatingAverage: null, providerReviewCount: 0 }));
    await screen.findByRole("listitem");
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("is exactly one link", async () => {
    renderTile(service());
    await screen.findByRole("listitem");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("falls back to the site's placeholder when the service has no photograph", async () => {
    renderTile(service({ imageUrls: [] }));
    await screen.findByRole("listitem");
    expect(screen.getByTestId("media-fallback")).toBeInTheDocument();
  });

  /**
   * The phone row's title may take two lines; above `sm` the tile truncates it
   * to one. `sm:line-clamp-none` has to travel with the truncate, because
   * `truncate` alone leaves the clamp's `display:-webkit-box` in place. The
   * meta beside the price wraps as whole phrases, never mid-phrase.
   */
  it("clamps the title on a phone, truncates it above sm, and keeps the meta whole", async () => {
    renderTile(service());
    await screen.findByRole("listitem");
    const title = screen.getByRole("heading", { level: 3 });
    expect(title.className).toContain("line-clamp-2");
    expect(title.className).toContain("sm:line-clamp-none");
    expect(title.className).toContain("sm:truncate");
    expect(screen.getByText("45 min").className).toContain("whitespace-nowrap");
    expect(screen.getByText("At their place").className).toContain("whitespace-nowrap");
  });

  it("wraps the price line rather than clipping its last item", async () => {
    // Measured at 390px: the phone row's text column is 212px, and the price,
    // the duration and the place do not fit across it. Without `flex-wrap`
    // the line ran off the column and the last item was cut in half; with it
    // the line breaks between items, each of which stays whole on its own.
    renderTile(service());
    await screen.findByRole("listitem");
    const priceLine = screen.getByText("45 min").parentElement!;
    expect(priceLine.className).toContain("flex-wrap");
  });

});
