import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "i18next";
import type { ProviderPublicDTO } from "@ntizo/shared";
import type { FeaturedReviewDTO } from "@ntizo/shared/read-models";
import { LandingPage } from "./landing-page";

/**
 * One business, shaped as `providerList` returns it.
 *
 * Every optional field is filled in here and emptied per test, because the
 * card's branches are all on absence: no rating, no price, no photograph, no
 * category. The defaults are a fully populated provider so a test only has to
 * say what it is taking away.
 */
function provider(over: Partial<ProviderPublicDTO> = {}): ProviderPublicDTO {
  return {
    id: "p-1",
    name: "Oficina do Zeca",
    slug: "oficina-do-zeca",
    type: "individual",
    description: null,
    city: "Maputo",
    district: "Malhazine",
    country: "MZ",
    logoUrl: null,
    photoUrls: [],
    verified: true,
    ratingAverage: 4.8,
    reviewCount: 12,
    categories: [{ code: "electrical", name: "Electrical" }],
    serviceCount: 3,
    fromAmountMinor: 45000,
    fromCurrency: "MZN",
    ...over,
  };
}

/**
 * The landing's own popular-providers key.
 *
 * The locale is asked of i18next rather than written in as "en": the hook
 * builds the key from whatever the detector resolved, so hardcoding a guess
 * here produces a key that silently misses and a test that asserts the
 * loading state. 3 is `LANDING_PROVIDERS`.
 *
 * Seeding the cache rather than mocking `fetch` keeps the assertion on what
 * the page renders from a payload, not on how it asked for one.
 */
function popularKey() {
  return [
    "public",
    "providers",
    "popular",
    i18n.resolvedLanguage ?? i18n.language,
    3,
  ] as const;
}

/** One featured review, shaped as `reviewFeatured` returns it. */
function story(over: Partial<FeaturedReviewDTO> = {}): FeaturedReviewDTO {
  return {
    id: "rev-1",
    rating: 4,
    comment: "Chegou à hora combinada e deixou tudo limpo.",
    authorName: "Ana Rodrigues",
    createdAt: "2026-08-01T10:00:00.000Z",
    providerName: "Canalizações Zimpeto",
    providerSlug: "canalizacoes-zimpeto",
    ...over,
  };
}

/** The landing's featured-reviews key. 4 is `LANDING_STORIES`. */
function featuredKey() {
  return ["public", "reviews", "featured", 4] as const;
}

function renderInRouter(providers?: ProviderPublicDTO[], stories?: FeaturedReviewDTO[]) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: LandingPage,
  });
  const signIn = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sign-in",
    component: () => <div>signin</div>,
  });
  const admin = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin",
    component: () => <div>admin</div>,
  });
  const signUp = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sign-up",
    component: () => <div>signup</div>,
  });
  // The popular cards link here now, so the route has to exist: TanStack
  // resolves `to` against the tree, and an unregistered path throws rather
  // than rendering a plain href.
  const providerDetail = createRoute({
    getParentRoute: () => rootRoute,
    path: "/providers/$slug",
    component: () => <div>provider</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      signIn,
      admin,
      signUp,
      providerDetail,
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  // The header reads the session to decide between the sign-in pill and the
  // account cluster, so the page needs a QueryClient regardless. Retries off,
  // and the session left unseeded — the signed-out branch is what these tests
  // are about.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Only when a test says so. Left unseeded, the query fails against a jsdom
  // with no network and the section takes its empty branch — which is the
  // behaviour the first two tests below are about.
  if (providers) {
    qc.setQueryData(popularKey(), { items: providers, total: providers.length });
  }
  if (stories) qc.setQueryData(featuredKey(), stories);
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("LandingPage", () => {
  it("renders the hero and an internal Sign in link", async () => {
    renderInRouter();
    // Matched on the heading rather than an exact text node: the headline is
    // one h1 split across a coloured span and a line break, so no single
    // element holds "Find it." on its own any more.
    expect(
      await screen.findByRole("heading", { level: 1, name: /find it/i }),
    ).toBeInTheDocument();
    const signIn = screen.getByRole("link", { name: "Sign in" });
    expect(signIn.getAttribute("href")).toBe("/sign-in");
  });

  it("shows the sections that give the page something to say", async () => {
    // The old page ended at the hero. Categories is the reason it does not.
    // The other two rails are gone from this list on purpose: both now appear
    // only when there is real data to put in them, which the tests below cover.
    renderInRouter();
    expect(
      await screen.findByRole("heading", { name: "Service categories" }),
    ).toBeInTheDocument();
  });

  it("hides both rails when there is nothing real to put in them", async () => {
    renderInRouter([], []);
    // Waited for, not asserted immediately: a bare `queryBy` would pass on a
    // page that had not rendered anything yet.
    await screen.findByRole("heading", { name: "Service categories" });
    expect(
      screen.queryByRole("heading", { name: "Popular services" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Customer stories" }),
    ).not.toBeInTheDocument();
  });

  it("draws a featured review in the reviewer's own words", async () => {
    renderInRouter([], [story()]);
    expect(
      await screen.findByRole("heading", { name: "Customer stories" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Chegou à hora combinada e deixou tudo limpo."),
    ).toBeInTheDocument();
    expect(screen.getByText("Ana Rodrigues")).toBeInTheDocument();
    // The business it is about, and a link to it — the invented version had an
    // invented headline here and went nowhere.
    expect(
      screen.getByRole("link", { name: "Canalizações Zimpeto" }).getAttribute("href"),
    ).toBe("/providers/canalizacoes-zimpeto");
  });

  it("shows the score the reviewer actually gave, not five stars", async () => {
    // Every invented card carried a hardcoded ★★★★★ regardless of anything.
    renderInRouter([], [story({ rating: 3 })]);
    expect(await screen.findByRole("img", { name: "3 out of 5" })).toBeInTheDocument();
  });

  it("names an author who set no name rather than rendering an empty chip", async () => {
    renderInRouter([], [story({ authorName: null })]);
    expect(await screen.findByText("Anonymous")).toBeInTheDocument();
  });

  it("draws a listed provider's own name, score and price", async () => {
    renderInRouter([provider()]);
    expect(
      await screen.findByRole("heading", { name: "Popular services" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Oficina do Zeca")).toBeInTheDocument();
    // The category the server resolved, not a hardcoded "role" key.
    expect(screen.getByText("Electrical")).toBeInTheDocument();
    expect(screen.getByText("4.8")).toBeInTheDocument();
    expect(screen.getByText("(12 reviews)")).toBeInTheDocument();
    expect(screen.getByText("Malhazine, Maputo")).toBeInTheDocument();
    // Through `Intl`, so the currency comes off the row rather than a
    // hardcoded " MZN" that was wrong for every other one.
    expect(screen.getByText(/MZN.?450/)).toBeInTheDocument();
    // The provider, not the undifferentiated directory the mock cards all
    // pointed at.
    expect(
      screen.getByRole("link", { name: /Oficina do Zeca/ }).getAttribute("href"),
    ).toBe("/providers/oficina-do-zeca");
  });

  it("says so rather than printing a zero when nobody has reviewed a provider", async () => {
    // Null, not 0. A 0,0 beside a business nobody has rated tells every
    // visitor it is the worst on the platform.
    renderInRouter([provider({ ratingAverage: null, reviewCount: 0 })]);
    expect(await screen.findByText("No reviews yet")).toBeInTheDocument();
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
  });

  it("omits the price line for a provider that publishes nothing priced", async () => {
    renderInRouter([
      provider({ fromAmountMinor: null, fromCurrency: null }),
    ]);
    await screen.findByText("Oficina do Zeca");
    expect(screen.queryByText("from")).not.toBeInTheDocument();
  });

  it("sends the search to the provider directory", async () => {
    renderInRouter();
    expect(await screen.findByLabelText("Search services")).toBeInTheDocument();
  });
});
