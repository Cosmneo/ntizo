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
import { ServiceListingCard } from "../service-listing-card";

/**
 * The card rendered inside a router stub, because every claim it makes is
 * about a `<Link>` — where the title goes, where the CTA goes — and a `<Link>`
 * outside a router throws rather than rendering an `<a>`.
 *
 * No `QueryClient` and no viewmodel mock: this card is handed a `ServiceDTO`
 * and asks nothing of anybody. The harness is the one
 * `service-detail-page.test.tsx` documents, minus the seam it does not need.
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

function renderCard(dto: ServiceDTO, locale = "en-US") {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <ul>
        <ServiceListingCard service={dto} locale={locale} />
      </ul>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("ServiceListingCard", () => {
  it("draws the brand mark for a service with no photograph", async () => {
    // Most listings on this platform have none. A column of grey rectangles
    // reads as a page that failed to load; the mark reads as deliberate, and
    // is the same thing every other missing picture in the product shows.
    const { container } = renderCard(service({ imageUrls: [] }));
    await screen.findByRole("listitem");
    expect(container.querySelector("[data-testid='media-fallback']")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("does not fall back to the provider's own picture", async () => {
    // On a provider's page a logo is recognisable context. In a mixed browse
    // it puts the same picture on four unrelated cards.
    const { container } = renderCard(service({ imageUrls: ["https://cdn/x.jpg"] }));
    await screen.findByRole("listitem");
    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn/x.jpg");
  });

  it("draws no stars at all for a provider nobody has reviewed", async () => {
    // Null, not 0 — zero is a score a person could have given, and rendering
    // it says this is the worst business on the platform.
    const { container } = renderCard(
      service({ providerRatingAverage: null, providerReviewCount: 0 }),
    );
    await screen.findByRole("listitem");
    expect(container.querySelector("[data-testid='stub-rating']")).toBeNull();
  });

  it("says whose rating it is, because it is not the service's", async () => {
    // Unlabelled, "4.7 (6)" claims this haircut has been reviewed six times.
    // It has not been reviewed at all; its business has.
    renderCard(service());
    expect(await screen.findByText("provider rating")).toBeInTheDocument();
  });

  it("sends the title to the service, never to the provider", async () => {
    // A reader who clicked "Corte de cabelo" wanted that service, not a chance
    // to hunt for it again among everything else the barbershop offers.
    renderCard(service());
    const title = await screen.findByRole("link", { name: "Corte de cabelo" });
    expect(title).toHaveAttribute("href", "/services/svc-1");
    expect(
      screen.queryByRole("link", { name: /estudio-mavalane/ }),
    ).not.toBeInTheDocument();
  });

  it("softens the button and prices a quote service 'to agree'", async () => {
    // A solid brand-blue CTA beside a price of "to agree" promises a checkout
    // that does not exist for this service.
    renderCard(service({ bookingMode: "quote", defaultOption: null, fromAmountMinor: null }));
    expect(await screen.findByText("To agree")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Contact provider" });
    expect(cta.className).not.toContain("bg-[var(--color-primary)]");
    expect(cta).toHaveAttribute("href", "/services/svc-1");
  });

  it("prices a bookable service in its own currency, with its own length", async () => {
    renderCard(service());
    expect(await screen.findByText("Fixed price")).toBeInTheDocument();
    expect(screen.getByTestId("stub-under")).toHaveTextContent("45 min");
    expect(screen.getByRole("link", { name: "Book" })).toBeInTheDocument();
  });

  it("writes the price in whole units, the way the provider card beside it does", async () => {
    // Two cards in the same product, in the same 24px slot, disagreeing about
    // whether this platform writes "800 MZN" or "800.00 MZN" is worse than
    // either choice on its own. `ProviderListingCard` rounds and the approved
    // mockup rounds, so this rounds. The decimals stay where a number is what
    // somebody pays rather than a headline — see `RailPriceSummary`.
    renderCard(service({ defaultOption: { ...service().defaultOption!, amountMinor: 80_000 } }));
    const stub = await screen.findByTestId("price-stub");
    expect(stub).toHaveTextContent("MZN 800");
    expect(stub).not.toHaveTextContent("800.00");
  });

  it("names the provider as the service's author, not as a second title", async () => {
    // "Estúdio Mavalane" alone under "Corte de cabelo" reads as a subtitle of
    // the service. The preposition is a word each language places and inflects
    // for itself, so it is a key rather than a prefix glued on here.
    renderCard(service());
    expect(await screen.findByTestId("listing-subtitle")).toHaveTextContent(
      "by Estúdio Mavalane",
    );
  });

  it("draws no pill at all for a location type this build has never heard of", async () => {
    // A value added to the database after this build shipped translates to an
    // empty string, and an unguarded tag around it is an empty grey pill —
    // which is not the "nothing at all" the fallback promises.
    renderCard(service({ locationType: "in_orbit" }));
    const tags = await screen.findByTestId("listing-tags");
    expect(tags.children).toHaveLength(1);
    expect(tags).toHaveTextContent("Hair & beauty");
  });

  it("names the trade and where the work happens, the two facts that rule a card out", async () => {
    renderCard(service());
    const tags = await screen.findByTestId("listing-tags");
    expect(tags).toHaveTextContent("Hair & beauty");
    expect(tags).toHaveTextContent("At their place");
  });

  it("shows the same verified chip the provider card shows, for the same business", async () => {
    // Two cards in one product showing the same trust signal two different
    // ways is the class of defect this whole branch has been closing.
    renderCard(service({ providerVerified: true }));
    const tags = await screen.findByTestId("listing-tags");
    expect(tags).toHaveTextContent("Verified");
  });

  it("draws no chip at all for a provider with no accepted document", async () => {
    // A chip that is always there is not a signal.
    renderCard(service({ providerVerified: false }));
    const tags = await screen.findByTestId("listing-tags");
    expect(tags).not.toHaveTextContent("Verified");
  });

  it("groups the thousands the way the approved mockup draws them", async () => {
    // `en-US` already groups a four-digit amount by default, so asserting
    // there proves nothing about `useGrouping: "always"` — only a locale
    // whose default omits grouping below five digits can tell the two apart.
    renderCard(
      service({ defaultOption: { ...service().defaultOption!, amountMinor: 120_000 } }),
      "pt-MZ",
    );
    const stub = await screen.findByTestId("price-stub");
    expect(stub).toHaveTextContent("1 200");
  });
});
