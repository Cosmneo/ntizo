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
import { ProviderRow } from "../provider-row";

/**
 * The row rendered inside a router stub, because every claim it makes is
 * about a `<Link>` — where the title goes — and a `<Link>` outside a router
 * throws rather than rendering an `<a>`.
 *
 * No `QueryClient` and no viewmodel mock: this row is handed a
 * `ProviderPublicDTO` and asks nothing of anybody. The same harness
 * `provider-listing-card.test.tsx` used, which is the point — the row
 * replaces the card and its test should read as the card's test did.
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

function renderRow(dto: ProviderPublicDTO, locale = "en-US") {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <ul>
        <ProviderRow provider={dto} locale={locale} />
      </ul>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("ProviderRow", () => {
  it("shows what the business sells, with prices, without opening it", async () => {
    renderRow(
      provider({
        services: [
          { name: "Corte com barba", amountMinor: 80_000, currency: "MZN", pricingMode: "fixed" },
          { name: "Barba", amountMinor: 45_000, currency: "MZN", pricingMode: "fixed" },
        ],
      }),
    );
    await screen.findByRole("link", { name: /Estúdio Mavalane/ });
    expect(screen.getByText("Corte com barba")).toBeInTheDocument();
    // `formatHeadlinePrice(80_000, "MZN", "en-US")` renders "MZN 800" — the
    // currency leads in this locale, not the amount. Scoped to the chip
    // itself: the fixture's own `fromAmountMinor` is also 80_000, so the
    // side rail's "from" price prints the identical string.
    const chip = screen.getByText("Corte com barba").closest("li");
    expect(chip).toHaveTextContent("MZN 800");
  });

  it("counts the rest against serviceCount, not against what it was sent", async () => {
    renderRow(
      provider({
        serviceCount: 6,
        services: [
          { name: "A", amountMinor: 1000, currency: "MZN", pricingMode: "fixed" },
          { name: "B", amountMinor: 2000, currency: "MZN", pricingMode: "fixed" },
          { name: "C", amountMinor: 3000, currency: "MZN", pricingMode: "fixed" },
        ],
      }),
    );
    await screen.findByRole("link", { name: /Estúdio Mavalane/ });
    expect(screen.getByText("3 more")).toBeInTheDocument();
    // Headline navy, not `--color-primary`: blue is spent once per page, on
    // the header's search button, and twenty rows of "+3 more" is twenty
    // blues.
    expect(screen.getByText("3 more").className).not.toContain("--color-primary");
    expect(screen.getByText("3 more").className).toContain("--color-headline");
  });

  it("says nothing about the rest when there is no rest", async () => {
    renderRow(
      provider({
        serviceCount: 2,
        services: [
          { name: "A", amountMinor: 1000, currency: "MZN", pricingMode: "fixed" },
          { name: "B", amountMinor: 2000, currency: "MZN", pricingMode: "fixed" },
        ],
      }),
    );
    await screen.findByRole("link", { name: /Estúdio Mavalane/ });
    expect(screen.queryByText(/more/)).toBeNull();
  });

  it("says how many it sells when it only quotes, not how many more", async () => {
    // A quote-priced service has no amount and the DTO skips it rather than
    // sending it with none, so `services` can be empty while `serviceCount`
    // is not — a business that quotes everything it sells. "2 more" with
    // nothing before it would read as an error; this says "2 services"
    // instead, the same way the side rail already does.
    renderRow(
      provider({ services: [], serviceCount: 2, fromAmountMinor: null, fromCurrency: null }),
    );
    await screen.findByRole("link", { name: /Estúdio Mavalane/ });
    const count = screen.getByText("2 services");
    expect(count).toBeInTheDocument();
    expect(count.className).not.toContain("--color-primary");
    expect(screen.queryByText(/more/)).toBeNull();
  });

  it("says nothing about services it does not have", async () => {
    const { container } = renderRow(
      provider({ services: [], serviceCount: 0, fromAmountMinor: null, fromCurrency: null }),
    );
    await screen.findByRole("link", { name: /Estúdio Mavalane/ });
    // No services list at all — not an empty one, and not a "0 services"
    // line either.
    expect(container.querySelector("ul.flex")).toBeNull();
  });

  it("writes the kind and the place as one sentence", async () => {
    renderRow(
      provider({
        type: "individual",
        district: "Sommerschield",
        city: "Maputo",
        categories: [{ code: "electrical", name: "Electrical" }],
      }),
    );
    await screen.findByRole("link", { name: /Estúdio Mavalane/ });
    expect(screen.getByTestId("row-kind")).toHaveTextContent(
      "Electrical in Sommerschield, Maputo",
    );
  });

  it("says only the category when the business gave no place at all", async () => {
    // `district` and `city` are both nullable, and the sentence has nowhere to
    // stop without them: "Electrical in " with the preposition dangling.
    renderRow(
      provider({
        district: null,
        city: null,
        categories: [{ code: "electrical", name: "Electrical" }],
      }),
    );
    await screen.findByRole("link", { name: /Estúdio Mavalane/ });
    expect(screen.getByTestId("row-kind")).toHaveTextContent("Electrical");
    expect(screen.getByTestId("row-kind").textContent).not.toMatch(/\bin\b/);
  });

  it("centres the logo on the site's placeholder when there is no cover photo", async () => {
    const { container } = renderRow(
      provider({ photoUrls: [], logoUrl: "https://cdn/logo.png" }),
    );
    await screen.findByRole("link", { name: /Estúdio Mavalane/ });
    expect(screen.getByTestId("media-fallback")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn/logo.png");
  });

  it("is exactly one link, and the chevron is not a second one", async () => {
    renderRow(provider());
    await screen.findByRole("link", { name: /Estúdio Mavalane/ });
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  /**
   * The phone card, asserted through the classes that build it — jsdom has no
   * layout and no media queries, so the breakpoint itself cannot be measured
   * here. Stacked at 390px the row was ~660px tall, about one and a third
   * results a screen; the mockup's `.m-pcard` drops the blurb and the
   * chevron, widens the photograph to 16:9 and reads the price on one line.
   */
  it("drops the blurb and the chevron on a phone, and widens the photograph", async () => {
    const { container } = renderRow(
      provider({ description: "Cortes, barba e coloração desde 2014." }),
    );
    await screen.findByRole("link", { name: /Estúdio Mavalane/ });

    const blurb = screen.getByText("Cortes, barba e coloração desde 2014.");
    expect(blurb.className).toContain("hidden");
    // `md:line-clamp-2` is what shows it again, and it has to be the only
    // display in that media query or the clamp stops clamping.
    expect(blurb.className).toContain("md:line-clamp-2");
    expect(blurb.className).not.toContain("md:block");

    const chevron = container.querySelector("span[aria-hidden='true'].rounded-full")!;
    expect(chevron.className).toContain("hidden");
    expect(chevron.className).toContain("md:grid");

    const media = container.querySelector("div.relative.overflow-hidden")!;
    expect(media.className).toContain("aspect-[16/9]");
    expect(media.className).toContain("md:aspect-[4/3]");
  });

  it("says a person's profile is a profile, not a business", async () => {
    renderRow(provider({ type: "individual" }));
    const row = await screen.findByRole("link", { name: /Estúdio Mavalane/ });
    // Inside the link, as the tail of its accessible name: loose in the side
    // column it was a sentence a screen reader met after the price with
    // nothing to attach it to.
    expect(row).toContainElement(screen.getByText("View profile"));
    expect(row).toHaveAccessibleName("Estúdio Mavalane View profile");
  });
});
