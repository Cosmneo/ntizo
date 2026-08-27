import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { ProviderListingCard } from "../provider-listing-card";

/**
 * The card rendered inside a router stub, because every claim it makes is
 * about a `<Link>` — where the title goes, where the CTA goes — and a `<Link>`
 * outside a router throws rather than rendering an `<a>`.
 *
 * No `QueryClient` and no viewmodel mock: this card is handed a
 * `ProviderPublicDTO` and asks nothing of anybody. The same harness
 * `service-listing-card.test.tsx` uses, which is the point — the two cards are
 * twins and their tests should read as twins too.
 */
function provider(over: Partial<ProviderPublicDTO> = {}): ProviderPublicDTO {
  return {
    id: "prov-1",
    name: "Estúdio Mavalane",
    slug: "estudio-mavalane",
    type: "organization",
    description: null,
    city: "Maputo",
    district: "Mavalane",
    country: "MZ",
    logoUrl: null,
    photoUrls: [],
    verified: true,
    ratingAverage: 4.7,
    reviewCount: 6,
    categories: [{ code: "hair", name: "Hair & beauty" }],
    serviceCount: 6,
    fromAmountMinor: 80_000,
    fromCurrency: "MZN",
    ...over,
  };
}

function renderCard(dto: ProviderPublicDTO) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <ul>
        <ProviderListingCard provider={dto} locale="en-US" categoryIcon={null} />
      </ul>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("ProviderListingCard", () => {
  it("leads with the business's photograph, then its logo, then a generated tile", async () => {
    // Three fallbacks because most businesses have none of the first two, and
    // a provider directory of empty grey boxes reads as a directory of
    // nothing.
    const withPhoto = renderCard(
      provider({ photoUrls: ["https://cdn/photo.jpg"], logoUrl: "https://cdn/logo.png" }),
    );
    await screen.findByRole("listitem");
    expect(withPhoto.container.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn/photo.jpg",
    );
    withPhoto.unmount();

    const withLogo = renderCard(provider({ photoUrls: [], logoUrl: "https://cdn/logo.png" }));
    await screen.findByRole("listitem");
    expect(withLogo.container.querySelector("img")).toHaveAttribute("src", "https://cdn/logo.png");
    withLogo.unmount();

    const withNeither = renderCard(provider({ photoUrls: [], logoUrl: null }));
    await screen.findByRole("listitem");
    expect(withNeither.container.querySelector("img")).toBeNull();
    expect(
      withNeither.container.querySelector("[data-testid='listing-placeholder']"),
    ).not.toBeNull();
  });

  it("draws no stars for a business nobody has reviewed", async () => {
    // `ratingAverage` is null, not 0 — see `providerPublicReadModel`. Zero is a
    // score a person could have given, and drawing it says this is the worst
    // business on the platform.
    const { container } = renderCard(provider({ ratingAverage: null, reviewCount: 0 }));
    await screen.findByRole("listitem");
    expect(container.querySelector("[data-testid='stub-rating']")).toBeNull();
  });

  it("shows the score without an attribution, because it is this business's own", async () => {
    // Unlike a service card, where the score belongs to the provider and must
    // say so.
    renderCard(provider());
    expect(await screen.findByTestId("stub-rating")).toHaveTextContent("4.7");
    expect(screen.queryByText("provider rating")).not.toBeInTheDocument();
  });

  it("links to the business, and calls the action 'View business' rather than 'Book'", async () => {
    // You do not book a business; you open it.
    renderCard(provider());
    expect(await screen.findByRole("link", { name: "View business" })).toHaveAttribute(
      "href",
      "/providers/estudio-mavalane",
    );
    expect(screen.getByRole("link", { name: "Estúdio Mavalane" })).toHaveAttribute(
      "href",
      "/providers/estudio-mavalane",
    );
  });

  it("caps the trades it lists", async () => {
    // A business publishing in eight would push the price off every card in
    // its row.
    const eight = Array.from({ length: 8 }, (_, i) => ({
      code: `c${String(i)}`,
      name: `Trade ${String(i)}`,
    }));
    renderCard(provider({ categories: eight }));
    await screen.findByRole("listitem");
    expect(screen.getAllByTestId("provider-category")).toHaveLength(3);
  });

  it("says how many services it publishes, and omits the chip at zero", async () => {
    // "0 services" beside a business you can still message is a
    // discouragement with no action behind it.
    const some = renderCard(provider({ serviceCount: 6 }));
    expect(await screen.findByText("6 services")).toBeInTheDocument();
    some.unmount();

    renderCard(provider({ serviceCount: 0 }));
    await screen.findByRole("listitem");
    expect(screen.queryByText("0 services")).not.toBeInTheDocument();
  });

  it("omits the description element entirely when the business has written none", async () => {
    // Which is most of them.
    renderCard(provider({ description: null }));
    await screen.findByRole("listitem");
    expect(screen.queryByTestId("listing-description")).not.toBeInTheDocument();
  });

  it("draws no price rail at all for a business that publishes nothing priced", async () => {
    // An empty stub is a dashed line with a hole punched in it and nothing
    // beside it. The CTA is the only thing left in the rail, so it moves into
    // the body and the rail goes.
    renderCard(provider({ fromAmountMinor: null, fromCurrency: null }));
    await screen.findByRole("listitem");
    expect(screen.queryByTestId("price-stub")).not.toBeInTheDocument();
    expect(screen.queryByText("from")).not.toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "View business" });
    expect(cta).toHaveAttribute("href", "/providers/estudio-mavalane");
    expect(screen.getByTestId("listing-action")).toContainElement(cta);
  });

  it("prices the cheapest thing it sells in whole units, in its own currency", async () => {
    // A directory "from" price is already an approximation, and two decimals
    // on it is noise.
    renderCard(provider({ fromAmountMinor: 120_000, fromCurrency: "MZN" }));
    const stub = await screen.findByTestId("price-stub");
    expect(stub).toHaveTextContent("from");
    expect(stub).toHaveTextContent("MZN 1,200");
    expect(stub).not.toHaveTextContent("1,200.00");
    expect(screen.getByTestId("stub-under")).toHaveTextContent("per service");
  });

  it("names the kind of business and where it is, above the name", async () => {
    // The two facts that rule a business out before its name means anything.
    renderCard(provider());
    const meta = await screen.findByTestId("listing-meta");
    expect(meta).toHaveTextContent("OrganizationMavalane, Maputo");
    // The kind, the separator dot, the place.
    expect(meta.children).toHaveLength(3);
  });

  it("draws no place at all for a business that has given none", async () => {
    // An unknown value must render nothing, not an empty separator with a dot
    // hanging off it.
    //
    // Counted, not read. The separator carries no text of its own and an empty
    // place renders an empty span, so `toHaveTextContent("Organization")` is
    // true whether the guard is there or not — a claim of coverage rather than
    // coverage. Verified by removing the guard and watching this fail.
    renderCard(provider({ city: null, district: null }));
    const meta = await screen.findByTestId("listing-meta");
    expect(meta.children).toHaveLength(1);
    expect(meta).toHaveTextContent("Organization");
  });
});
