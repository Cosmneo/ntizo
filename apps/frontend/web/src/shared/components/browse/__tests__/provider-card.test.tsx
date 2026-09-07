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
import { ProviderCard } from "../provider-card";

/**
 * The card rendered inside a router stub, because every claim it makes is
 * about a `<Link>` — where the title goes — and a `<Link>` outside a router
 * throws rather than rendering an `<a>`.
 *
 * The fuller sweep of this card's behaviour — the rating's "New" label, the
 * price line's absence when nothing is priced, and every photo/logo/fallback
 * combination — is already exercised through `VerifiedProviders`, which
 * draws this same component; see `verified-providers.test.tsx`. This suite
 * only adds what that page cannot show: the card rendered directly, and the
 * two things a `ProviderRow` used to say that this card does not.
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
    services: [],
    ...over,
  };
}

function renderCard(dto: ProviderPublicDTO, locale = "en-US") {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <ul>
        <li>
          <ProviderCard provider={dto} locale={locale} />
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

describe("ProviderCard", () => {
  it("is exactly one link", async () => {
    renderCard(provider());
    await screen.findByRole("link", { name: /Estúdio Mavalane/ });
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("names the destination only by the business's own name, with no second sentence appended", async () => {
    // `ProviderRow` closed its link with a screen-reader-only "View
    // business" / "View profile" suffix on its accessible name. The card
    // carries no such suffix — a real drop from the row, named here rather
    // than left to be discovered.
    renderCard(provider());
    const link = await screen.findByRole("link", { name: "Estúdio Mavalane" });
    expect(link).toHaveAccessibleName("Estúdio Mavalane");
  });

  it("says nothing about a trade it was not given, rather than naming the provider's kind", async () => {
    // `ProviderRow` fell back to `filterProviderKindOption.${type}` — "A
    // person" / "An establishment" — when a business listed no category.
    // This card only ever prints a category it was actually given: with
    // none, the eyebrow line is silent rather than inventing one.
    renderCard(provider({ categories: [], district: null, city: null }));
    await screen.findByRole("link", { name: /Estúdio Mavalane/ });
    expect(screen.queryByText(/person|establishment/i)).toBeNull();
  });

  it("says how many services it sells", async () => {
    renderCard(provider({ serviceCount: 6 }));
    await screen.findByRole("link", { name: /Estúdio Mavalane/ });
    expect(screen.getByText("6 services")).toBeInTheDocument();
  });
});
