import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type {
  ProviderPublicDetailDTO,
  ServiceDetailDTO,
  ServiceDetailOptionDTO,
} from "@ntizo/shared/read-models";

/**
 * The three branches `serviceDetailPanel` decides for the page's right
 * column, exercised through the real page rather than the pure function
 * alone — the defect this fix wave closes lived in the wiring
 * (`service-detail-page.tsx` reading `options.length` itself instead of
 * asking the domain function), not in a function nothing had called yet.
 *
 * The viewmodel hook is the seam, not the query cache — the same choice
 * `user-menu.test.tsx` documents: seeding a real `QueryClient` would mean
 * importing `serviceDetailQueries` from `data/`, which `boundaries/dependencies`
 * forbids a `ui/` file from doing, test files included, and rightly — a ui
 * component knows its hooks, not where they store things.
 *
 * `useProviderDetail` is the page's *second* read: the rail's weekly hours
 * and the rail's verification bullet both come from the provider behind the
 * service, fetched by slug. Its default here is `null`, which is not merely a
 * convenient stub — it is the state a provider deactivated between the two
 * queries leaves this page in, so every test in this file doubles as an
 * assertion that the page survives it.
 */
const state: {
  service: ServiceDetailDTO | null;
  provider: ProviderPublicDetailDTO | null;
} = { service: null, provider: null };

vi.mock("@/features/directory/services/viewmodel/use-service-detail", () => ({
  useServiceDetail: () => state.service,
}));

vi.mock("@/features/directory/viewmodel/use-directory", () => ({
  useProviderDetail: () => state.provider,
  useProviderReviews: () => undefined,
}));

const { ServiceDetailPage } = await import("../service-detail-page");

function detailOption(over: Partial<ServiceDetailOptionDTO> = {}): ServiceDetailOptionDTO {
  return {
    id: "opt-1",
    name: "Corte",
    amountMinor: 50000,
    currency: "MZN",
    durationMinutes: 60,
    minMinutes: null,
    stepMinutes: null,
    pricingMode: "fixed",
    isDefault: true,
    ...over,
  };
}

function detailService(over: Partial<ServiceDetailDTO> = {}): ServiceDetailDTO {
  return {
    id: "svc-1",
    providerId: "prov-1",
    providerName: "Studio X",
    providerSlug: "studio-x",
    providerType: "organization",
    providerLogoUrl: null,
    providerCity: "Maputo",
    providerDistrict: null,
    categoryCode: "hair",
    categoryName: "Hair",
    name: "Corte de cabelo",
    description: null,
    locationType: "at_provider",
    bookingMode: "priced",
    imageUrls: [],
    options: [detailOption()],
    performers: [],
    isFallback: false,
    ...over,
  };
}

/** The business behind the service, as the rail's second query resolves it. */
function detailProvider(over: Partial<ProviderPublicDetailDTO> = {}): ProviderPublicDetailDTO {
  return {
    id: "prov-1",
    name: "Studio X",
    slug: "studio-x",
    type: "organization",
    description: null,
    city: "Maputo",
    district: null,
    country: "MZ",
    logoUrl: null,
    photoUrls: [],
    verified: false,
    ratingAverage: null,
    reviewCount: 0,
    categories: [{ code: "hair", name: "Hair" }],
    serviceCount: 1,
    fromAmountMinor: 50000,
    fromCurrency: "MZN",
    memberSince: "2025-03",
    serviceLocationTypes: ["at_provider"],
    weeklyHours: [
      { weekday: 0, intervals: [] },
      ...[1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        intervals: [{ startMinute: 480, endMinute: 1080 }],
      })),
      { weekday: 6, intervals: [] },
    ],
    ...over,
  };
}

function renderPage(service: ServiceDetailDTO, provider: ProviderPublicDetailDTO | null = null) {
  state.service = service;
  state.provider = provider;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <ServiceDetailPage id={service.id} />,
  });
  // Every destination the page links to, registered so the router resolves a
  // real href rather than building one for a path its tree has never heard of
  // — the breadcrumb's category filter, the eyebrow and the provider card's
  // link to the business, and the two places the rail's message button can
  // send someone. The same set `provider-detail-page.test.tsx` registers for
  // the same reason.
  const servicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/services",
    validateSearch: (search: Record<string, unknown>) => search as { category?: string },
    component: () => <p>services browse</p>,
  });
  const providerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/providers/$slug",
    component: () => <p>provider page</p>,
  });
  const messagesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/messages",
    validateSearch: (search: Record<string, unknown>) => search as { thread?: string },
    component: () => <p>messages page</p>,
  });
  const signInRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sign-in",
    validateSearch: (search: Record<string, unknown>) => search as { next?: string },
    component: () => <p>sign in page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      servicesRoute,
      providerRoute,
      messagesRoute,
      signInRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/**
 * The facts row's own `<dl>`.
 *
 * Located by "Category" — unique on this page — and every other fact then
 * asked of that element, rather than of the screen. Two separate collisions
 * make the obvious queries wrong here, exactly as they do on the provider
 * page:
 *
 * - `getByText("Duration")` matches two elements, the fact's `<dt>` and the
 *   rail's own `packageDuration` row, and throws.
 * - `getByRole("term", { name: "Duration" })` does not fix that, because the
 *   `term` role takes its accessible name from the author only. A `<dt>`
 *   whose text is "Duration" has no accessible name at all, so the query
 *   matches nothing.
 *
 * Scoping also keeps `WeeklyHoursCard`'s `<dl>` of weekdays, in the same
 * rail, out of the answer.
 */
function facts(): HTMLElement {
  const dl = screen.getByText("Category").closest("dl");
  if (!dl) throw new Error("The facts row is not a <dl>");
  return dl;
}

/** The facts row's labels, in the order the page prints them. */
function factLabels(): (string | null)[] {
  return within(facts())
    .getAllByRole("term")
    .map((term) => term.textContent);
}

describe("ServiceDetailPage's right column", () => {
  it("shows a price and a way to act for a priced service with active options", async () => {
    // This replaces an assertion on a "Packages" heading that
    // `PackageChooser` used to render in the rail. `ServiceOptions` renders
    // nothing at all for a single option, so that heading cannot exist any
    // more — but the requirement it protected does: a priced service with
    // active options must still say what it costs and offer something to do
    // about it.
    renderPage(detailService());
    expect(await screen.findByTestId("booking-total")).toHaveTextContent(/500/);
    expect(screen.getByRole("button", { name: "See availability" })).toBeInTheDocument();
    expect(screen.queryByText(/priced by quote/i)).not.toBeInTheDocument();
  });

  it("shows the quote notice for a quote service, with a working way to contact the provider", async () => {
    renderPage(detailService({ bookingMode: "quote", options: [] }));
    expect(await screen.findByText(/priced by quote/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Packages" })).not.toBeInTheDocument();
    // A quote service can be neither booked nor scheduled, so this button is
    // the only action its page offers — see follow-up #69 for why it used to
    // be disabled here.
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("a priced service with no active options is NOT shown as a quote service", async () => {
    // The exact defect this fix wave closes: `canPublish` counts a service's
    // options at publish time, never whether they stay active, and nothing
    // re-runs it when the last one is deactivated — a `priced` service can
    // reach this page with an empty `options` array despite never being a
    // quote service, and the page used to read that as "by quote".
    renderPage(detailService({ bookingMode: "priced", options: [] }));
    expect(
      await screen.findByText("This service doesn't currently have a bookable package. Please check back soon."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/priced by quote/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Packages" })).not.toBeInTheDocument();
  });
});

describe("ServiceDetailPage's body", () => {
  it("shows the options in the body when there is more than one", async () => {
    renderPage(
      detailService({
        options: [
          detailOption(),
          detailOption({ id: "opt-2", name: "Longo", amountMinor: 90000, isDefault: false }),
        ],
      }),
    );
    expect(await screen.findByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("shows no options section for a single-package service", async () => {
    renderPage(detailService());
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("moves the rail's total when a different option is chosen in the body", async () => {
    renderPage(
      detailService({
        options: [
          detailOption({ amountMinor: 50000 }),
          detailOption({ id: "opt-2", name: "Longo", amountMinor: 90000, isDefault: false }),
        ],
      }),
    );
    // The provider's price, unmarked up: 50000 -> 500; 90000 -> 900.
    expect(await screen.findByTestId("booking-total")).toHaveTextContent(/500/);
    await userEvent.click(screen.getByRole("radio", { name: /Longo/ }));
    expect(screen.getByTestId("booking-total")).toHaveTextContent(/900/);
  });

  it("opens on the provider's marked default, not on the cheapest option", async () => {
    // The one guard on that rule. `getService` returns options cheapest-first,
    // so "marked default, else first" is precisely what lets a provider say
    // "start them on the 900 one, not the 500 one" — and every other fixture
    // in this file puts `isDefault` on `options[0]`, where the rule and "just
    // take the first" are indistinguishable. Reduce the page's selection to
    // `service.options[0]` and this is the only test in the suite that reds.
    //
    // Two assertions, because the rule has to reach both halves of the split:
    // the rail's total is what the reader is quoted, the checked radio is what
    // the body shows them they are being quoted for.
    renderPage(
      detailService({
        options: [
          detailOption({ amountMinor: 50000, isDefault: false }),
          detailOption({ id: "opt-2", name: "Longo", amountMinor: 90000, isDefault: true }),
        ],
      }),
    );
    expect(await screen.findByTestId("booking-total")).toHaveTextContent(/900/);
    expect(screen.getByTestId("booking-total")).not.toHaveTextContent(/500/);
    expect(screen.getByRole("radio", { name: /Longo/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Corte/ })).toHaveAttribute("aria-checked", "false");
  });

  it("states the four facts about the service", async () => {
    renderPage(detailService());
    await screen.findByRole("heading", { level: 1 });
    expect(factLabels()).toEqual(["Duration", "Works", "Pricing", "Category"]);
    expect(within(facts()).getByText("60 min")).toBeInTheDocument();
    expect(within(facts()).getByText("At their place")).toBeInTheDocument();
    expect(within(facts()).getByText("Fixed price")).toBeInTheDocument();
    expect(within(facts()).getByText("Hair")).toBeInTheDocument();
  });

  it("offers no booking anywhere on the page", async () => {
    renderPage(detailService());
    await screen.findByRole("heading", { level: 1 });
    expect(
      screen.queryByRole("button", { name: /^book$|reservar|pedir marca/i }),
    ).not.toBeInTheDocument();
    // The two things the rail does offer instead, so the absence above is
    // "no booking control" and not "no controls rendered at all".
    expect(screen.getByRole("button", { name: "See availability" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  });

  it("opens on the service's own photographs", async () => {
    renderPage(detailService({ imageUrls: ["https://cdn.test/1.jpg", "https://cdn.test/2.jpg"] }));
    expect(await screen.findByAltText("Corte de cabelo")).toHaveAttribute(
      "src",
      "https://cdn.test/1.jpg",
    );
  });

  it("names the breadcrumb as a breadcrumb, not as the page it links home to", async () => {
    renderPage(detailService());
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
  });
});

describe("ServiceDetailPage's second read, the provider behind the service", () => {
  it("shows the provider's usual week in the rail", async () => {
    renderPage(detailService(), detailProvider());
    expect(await screen.findByText("Availability")).toBeInTheDocument();
    expect(screen.getByText("08:00 – 18:00")).toBeInTheDocument();
  });

  it("claims verification only when the provider is actually verified", async () => {
    renderPage(detailService(), detailProvider({ verified: true }));
    expect(await screen.findByText(/verified by Ntizo/i)).toBeInTheDocument();
  });

  it("makes no verification claim for an unverified provider", async () => {
    renderPage(detailService(), detailProvider({ verified: false }));
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/verified by Ntizo/i)).not.toBeInTheDocument();
    // The unconditional bullet stays, so the absence above is the
    // verification sentence going and not the whole list.
    expect(screen.getByText(/already includes the service fee/i)).toBeInTheDocument();
  });

  it("still renders when the provider resolves to nothing", async () => {
    // A provider deactivated between the service query and the provider one.
    // The page must survive it: the service is still real, and the only thing
    // that goes is the hours card.
    renderPage(detailService(), null);
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("booking-total")).toBeInTheDocument();
    expect(screen.queryByText("Availability")).not.toBeInTheDocument();
    expect(screen.queryByText(/verified by Ntizo/i)).not.toBeInTheDocument();
  });
});
