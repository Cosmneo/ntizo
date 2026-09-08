import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ProviderPublicDTO } from "@ntizo/shared";
import type { ServiceDTO } from "@/features/directory/services/domain/types";
import type { FavouriteEntry, FavouriteList } from "../../domain/types";

/**
 * The page that replaced a hardcoded empty state.
 *
 * The viewmodel hooks are the seam, never a seeded `QueryClient`: the
 * `boundaries/dependencies` rule forbids a `ui/` file from importing `data/`,
 * test files included, and rightly — a ui component knows its hooks, not
 * where they store things. The same choice `provider-detail-page.test.tsx`
 * documents.
 *
 * A real router, because every card here is a `<Link>` and a `<Link>` outside
 * one throws rather than rendering an `<a>` — `provider-card.test.tsx` says
 * the same about the same components.
 */
const state: {
  lists: FavouriteList[];
  listsLoading: boolean;
  entries: FavouriteEntry[];
  loading: boolean;
  hasMore: boolean;
} = { lists: [], listsLoading: false, entries: [], loading: false, hasMore: false };

const loadMore = vi.fn();

vi.mock("@/features/favourites/viewmodel/use-my-lists", () => ({
  useMyLists: () => ({ lists: state.lists, loading: state.listsLoading, errorCode: undefined }),
}));

vi.mock("@/features/favourites/viewmodel/use-list-page", () => ({
  useFavouriteListPage: () => ({
    list: state.lists[0],
    entries: state.entries,
    loading: state.loading,
    hasMore: state.hasMore,
    loadingMore: false,
    loadMore,
    errorCode: undefined,
  }),
}));

const { FavouritesPage } = await import("../favourites-page");

function list(over: Partial<FavouriteList> = {}): FavouriteList {
  return { id: "list-1", name: null, isDefault: true, itemCount: 2, coverUrls: [], ...over };
}

function service(over: Partial<ServiceDTO> = {}): ServiceDTO {
  return {
    id: "svc-1",
    providerId: "prov-1",
    providerName: "Estúdio Mavalane",
    providerSlug: "estudio-mavalane",
    providerType: "organization",
    providerVerified: false,
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
    ...over,
  };
}

function provider(over: Partial<ProviderPublicDTO> = {}): ProviderPublicDTO {
  return {
    id: "prov-1",
    name: "Ana Bila",
    slug: "ana-bila-explicacoes",
    type: "individual",
    description: null,
    city: "Beira",
    district: "Macuti",
    country: "MZ",
    logoUrl: null,
    photoUrls: [],
    verified: false,
    ratingAverage: 4.8,
    reviewCount: 4,
    categories: [{ code: "music", name: "Music lessons" }],
    serviceCount: 1,
    fromAmountMinor: 50_000,
    fromCurrency: "MZN",
    services: [],
    ...over,
  };
}

async function renderPage() {
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <FavouritesPage /> }),
      createRoute({ getParentRoute: () => rootRoute, path: "/services", component: () => <p>services</p> }),
      createRoute({ getParentRoute: () => rootRoute, path: "/services/$id", component: () => <p>service</p> }),
      createRoute({ getParentRoute: () => rootRoute, path: "/providers/$slug", component: () => <p>provider</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  state.lists = [list()];
  state.listsLoading = false;
  state.entries = [];
  state.loading = false;
  state.hasMore = false;
  loadMore.mockClear();
});

describe("FavouritesPage", () => {
  /**
   * The point of the whole page: a saved listing is drawn by the component
   * that drew it where it was saved, not by a copy. Asserted through the
   * links, because the two cards differ in exactly the fact that matters —
   * a service leads to the service, a business to the business.
   */
  it("draws both kinds on the browse pages' own cards", async () => {
    state.entries = [
      { kind: "service", savedAt: "2026-09-01T10:00:00.000Z", service: service() },
      { kind: "provider", savedAt: "2026-09-02T10:00:00.000Z", provider: provider() },
    ];
    await renderPage();

    expect(screen.getByRole("link", { name: "Corte de cabelo" })).toHaveAttribute(
      "href",
      "/services/svc-1",
    );
    expect(screen.getByRole("link", { name: "Ana Bila" })).toHaveAttribute(
      "href",
      "/providers/ana-bila-explicacoes",
    );
  });

  /**
   * The failure this page exists to end. It shipped as a hardcoded empty
   * state that told everybody they had saved nothing; the loading version of
   * the same mistake is telling somebody their favourites are gone while they
   * are still on the wire.
   *
   * Both flags are covered, because they are separately reachable: the lists
   * query answers first, and until it does the entries query has no id and
   * cannot even start.
   */
  it("does not claim the list is empty while it is still loading", async () => {
    state.listsLoading = true;
    await renderPage();
    expect(screen.queryByText("Nothing saved yet")).toBeNull();

    state.listsLoading = false;
    state.loading = true;
    await renderPage();
    expect(screen.queryByText("Nothing saved yet")).toBeNull();
  });

  it("invites the reader somewhere when they have saved nothing at all", async () => {
    await renderPage();

    expect(screen.getByText("Nothing saved yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse services" })).toHaveAttribute(
      "href",
      "/services",
    );
  });

  /**
   * An emptied *named* list is a different sentence, and must not carry the
   * "go and browse" way out: the reader's other lists still have things in
   * them, so sending them to the directory answers a question they did not
   * ask.
   */
  it("says a named list is empty without sending the reader away", async () => {
    state.lists = [list(), list({ id: "list-2", name: "Casa", isDefault: false, itemCount: 0 })];
    await renderPage();
    await userEvent.click(screen.getByRole("radio", { name: /Casa/ }));

    expect(screen.getByText("This list is empty")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Browse services" })).toBeNull();
  });

  /**
   * The chips are the whole reason this is one page rather than the plan's
   * two — and a row of one chip is a control that decides nothing, above a
   * grid it cannot change.
   */
  it("offers the list chips only when there is more than one list", async () => {
    await renderPage();
    expect(screen.queryByRole("radiogroup")).toBeNull();

    state.lists = [list(), list({ id: "list-2", name: "Casa", isDefault: false })];
    await renderPage();
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    // The default list has no stored name; `listDisplayName` translates it
    // rather than leaving a chip with nothing on it.
    expect(screen.getByRole("radio", { name: /Favourites/ })).toBeInTheDocument();
  });

  it("offers more only while there is more, and asks for it when pressed", async () => {
    state.entries = [{ kind: "service", savedAt: "2026-09-01T10:00:00.000Z", service: service() }];
    await renderPage();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();

    state.hasMore = true;
    await renderPage();
    await userEvent.click(screen.getAllByRole("button", { name: "Show more" })[0]!);
    expect(loadMore).toHaveBeenCalled();
  });
});
