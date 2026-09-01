import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSyncExternalStore } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ServiceAvailabilityDTO, ServiceDetailDTO } from "@ntizo/shared/read-models";
import i18n from "@/shared/lib/i18n";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";

/**
 * The two viewmodels the page reads are the seam, and the *data* layer is the
 * seam for the one it writes.
 *
 * The reads are mocked at the viewmodel because a `ui/` file knows its hooks
 * and not where they store things — `boundaries/dependencies` forbids `ui`
 * importing `data`, test files included, and the service-detail suite
 * documents the same choice for the same rule. `useServiceDetail` is also a
 * *suspense* query, which has no loading state to render past.
 *
 * The write is mocked one layer lower, at `checkout.repository`, so the real
 * `useCreateBooking` runs: `SLOT_ALREADY_TAKEN` reaching this page as a code
 * at all depends on `GraphqlError.code` preferring `originalCode` over the
 * coarse `CONFLICT`, and a mocked hook handed a ready-made string would
 * assert nothing about that. `vi.mock` names a module rather than importing
 * one, so no `ui -> data` edge is created.
 */
const fakes = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    createBooking: vi.fn(),
    refetch: vi.fn(),
    availability: {} as Record<string, unknown>,
    service: null as ServiceDetailDTO | null,
    // A one-value store, so a test can hand the page what a *refetch* came
    // back with. React Query's own refetch is what this stands in for, and
    // "the grid after the server answered again" is a state the page has to
    // be assertable in — it is where the taken-slot rule actually lands.
    version: 0,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit() {
      this.version += 1;
      listeners.forEach((listener) => listener());
    },
  };
});

vi.mock("@/features/checkout/data/checkout.repository", () => ({
  createBooking: fakes.createBooking,
}));

vi.mock("@/features/directory/availability/viewmodel/use-service-availability", () => ({
  useServiceAvailability: () => {
    useSyncExternalStore(
      fakes.subscribe,
      () => fakes.version,
      () => fakes.version,
    );
    return { ...fakes.availability, refetch: fakes.refetch };
  },
}));

vi.mock("@/features/directory/services/viewmodel/use-service-detail", () => ({
  useServiceDetail: () => fakes.service,
}));

const { ChooseWhenPage } = await import("../choose-when-page");

/** The one moment this whole file is pinned to: Friday 4 September 2026, midday UTC. */
const NOW = "2026-09-04T12:00:00.000Z";
const NINE = "2026-09-04T09:00:00.000Z";
const TEN = "2026-09-04T10:00:00.000Z";
/** 23:00 UTC on the 4th — 01:00 on the 5th in Africa/Maputo. */
const LATE = "2026-09-04T23:00:00.000Z";

function serviceFixture(id: string, over: Partial<ServiceDetailDTO> = {}): ServiceDetailDTO {
  return {
    id,
    providerId: "prov-1",
    providerName: "Studio X",
    providerSlug: "studio-x",
    providerType: "organization",
    providerLogoUrl: null,
    providerCity: "Maputo",
    providerDistrict: null,
    categoryCode: "hair",
    categoryName: "Cabelo",
    name: "Corte de cabelo",
    description: null,
    locationType: "at_provider",
    bookingMode: "priced",
    imageUrls: [],
    // **Two options, deliberately, and the expensive one is not the default.**
    // A single-option fixture cannot tell "books the package the customer
    // chose" apart from "books the only package there is", so it cannot fail
    // if the choice is dropped on the way here — which is exactly the defect
    // `optionId` was added to close.
    options: [
      {
        id: "opt-1",
        name: "Corte",
        amountMinor: 50000,
        currency: "MZN",
        durationMinutes: 60,
        minMinutes: null,
        stepMinutes: null,
        pricingMode: "fixed",
        isDefault: true,
      },
      {
        id: "opt-2",
        name: "Corte e barba",
        amountMinor: 90000,
        currency: "MZN",
        durationMinutes: 90,
        minMinutes: null,
        stepMinutes: null,
        pricingMode: "fixed",
        isDefault: false,
      },
    ],
    performers: [],
    isFallback: false,
    ...over,
  };
}

/**
 * `timezone: "UTC"` so the label a start renders under is the same string its
 * `startsAt` carries — a test that asserts on "09:00" while the grid formats
 * in Africa/Maputo would be asserting on 11:00 and would pass or fail for
 * reasons that have nothing to do with the page.
 */
function availabilityFixture(serviceId: string): ServiceAvailabilityDTO {
  return {
    serviceId,
    timezone: "UTC",
    bookingMode: "priced",
    pricingMode: "fixed",
    memberIds: ["mem-2", "mem-1"],
    days: [
      {
        date: "2026-09-04",
        starts: [
          { minuteOfDay: 540, startsAt: NINE, maxMinutes: null, seatsLeft: 1, memberIds: ["mem-2", "mem-1"] },
          { minuteOfDay: 600, startsAt: TEN, maxMinutes: null, seatsLeft: 1, memberIds: ["mem-2"] },
        ],
      },
    ],
  };
}

/**
 * A service whose day rolls over relative to UTC, offering a slot that lands
 * on the *following* civil date in its own zone.
 *
 * 23:00 UTC on the 4th is 01:00 on the 5th in Maputo. A device on UTC used to
 * put the strip on the 4th, so the day lookup matched nothing and the grid
 * drew no buttons at all — under a confirm that stayed enabled.
 */
function crossZoneAvailability(serviceId: string): ServiceAvailabilityDTO {
  return {
    serviceId,
    timezone: "Africa/Maputo",
    bookingMode: "priced",
    pricingMode: "fixed",
    memberIds: ["mem-1"],
    days: [
      {
        date: "2026-09-05",
        starts: [
          {
            minuteOfDay: 60,
            startsAt: LATE,
            maxMinutes: null,
            seatsLeft: 1,
            memberIds: ["mem-1"],
          },
        ],
      },
    ],
  };
}

/**
 * Two hourly options whose minimum bookings differ, so the length ladder has
 * something to be wrong about.
 */
function hourlyService(id: string): ServiceDetailDTO {
  return serviceFixture(id, {
    options: [
      {
        id: "opt-1",
        name: "Limpeza",
        amountMinor: 20000,
        currency: "MZN",
        durationMinutes: null,
        minMinutes: 60,
        stepMinutes: 60,
        pricingMode: "hourly",
        isDefault: true,
      },
      {
        id: "opt-2",
        name: "Limpeza profunda",
        amountMinor: 20000,
        currency: "MZN",
        durationMinutes: null,
        minMinutes: 240,
        stepMinutes: 60,
        pricingMode: "hourly",
        isDefault: false,
      },
    ],
  });
}

function hourlyAvailability(serviceId: string): ServiceAvailabilityDTO {
  return {
    serviceId,
    timezone: "UTC",
    bookingMode: "priced",
    pricingMode: "hourly",
    memberIds: ["mem-1"],
    days: [
      {
        date: "2026-09-04",
        starts: [
          { minuteOfDay: 540, startsAt: NINE, maxMinutes: 300, seatsLeft: 1, memberIds: ["mem-1"] },
        ],
      },
    ],
  };
}

/** A refusal shaped exactly as the wire delivers one: coarse code outside, domain code inside. */
function refusal(kitCode: string, domainCode: string): GraphqlError {
  return new GraphqlError(200, [
    { message: domainCode, extensions: { code: kitCode, originalCode: domainCode } },
  ]);
}

function renderChooseWhen({
  serviceId,
  session = { userId: "cust-1" },
  createFails,
  at,
  performers,
  service,
  availability,
}: {
  serviceId: string;
  /** `null` is an anonymous visitor — the command refuses one with `UNAUTHENTICATED`. */
  session?: { userId: string } | null;
  createFails?: { code: string };
  /** Where to start, when a test needs the URL to already carry a slot. */
  at?: string;
  /** What `serviceById` publishes about who performs this service. */
  performers?: { id: string; firstName: string; avatarUrl: string | null }[];
  /** An alternative service, for the hourly and cross-zone cases. */
  service?: ServiceDetailDTO;
  /** An alternative calendar, likewise. */
  availability?: ServiceAvailabilityDTO;
}) {
  fakes.service = service ?? serviceFixture(serviceId, performers ? { performers } : {});
  fakes.availability = {
    data: availability ?? availabilityFixture(serviceId),
    isPending: false,
    isError: false,
    error: undefined,
  };
  fakes.refetch.mockClear();
  fakes.createBooking.mockReset();
  if (session === null) {
    fakes.createBooking.mockRejectedValue(refusal("FORBIDDEN", "UNAUTHENTICATED"));
  } else if (createFails) {
    fakes.createBooking.mockRejectedValue(refusal("CONFLICT", createFails.code));
  } else {
    fakes.createBooking.mockResolvedValue({
      bookingId: "bk-1",
      expiresAt: "2026-09-04T12:30:00.000Z",
    });
  }

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const rootRoute = createRootRoute();
  const bookRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/book/$serviceId",
    validateSearch: (search: Record<string, unknown>) =>
      search as { memberId?: string; startsAt?: string; expired?: boolean },
    component: function BookPage() {
      const params = bookRoute.useParams();
      return <ChooseWhenPage serviceId={params.serviceId} />;
    },
  });
  // Every destination reachable from this page, registered so navigation is
  // asserted against the router's own resolved location rather than a mocked
  // `navigate` — the latter passes even when the `to`/`search` shape is wrong
  // in a way the mock does not care about. `/booking/$bookingId/details` is
  // step 2, which this slice does not build; the stub is what makes "and then
  // it moves on" assertable before it exists.
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <p>home</p>,
  });
  const signInRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sign-in",
    validateSearch: (search: Record<string, unknown>) => search as { next?: string },
    component: () => <p>sign in page</p>,
  });
  const servicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/services",
    validateSearch: (search: Record<string, unknown>) => search as { category?: string },
    component: () => <p>services browse</p>,
  });
  const serviceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/services/$id",
    component: () => <p>service page</p>,
  });
  const providerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/providers/$slug",
    component: () => <p>provider page</p>,
  });
  const detailsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/booking/$bookingId/details",
    component: () => <p>details step</p>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      bookRoute,
      signInRoute,
      servicesRoute,
      serviceRoute,
      providerRoute,
      detailsRoute,
    ]),
    history: createMemoryHistory({ initialEntries: [at ?? `/book/${serviceId}`] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return {
    router,
    create: {
      /** The inputs `booking.create` was actually handed. */
      get calls(): Record<string, unknown>[] {
        return fakes.createBooking.mock.calls.map((call) => call[0] as Record<string, unknown>);
      },
      /** Whether the failure sent the page back for the times that are really free. */
      get refetched(): boolean {
        return fakes.refetch.mock.calls.length > 0;
      },
    },
    /**
     * What the refetch came back with: the same calendar minus one start.
     * Stands in for React Query resolving the request `refetch()` fired.
     */
    rerenderWithout: (startsAt: string) => {
      const current = fakes.availability["data"] as ServiceAvailabilityDTO;
      fakes.availability = {
        ...fakes.availability,
        data: {
          ...current,
          days: current.days.map((day) => ({
            ...day,
            starts: day.starts.filter((start) => start.startsAt !== startsAt),
          })),
        },
      };
      act(() => fakes.emit());
    },
  };
}

/**
 * The locale is pinned, not inherited.
 *
 * Every assertion below reads Portuguese copy, and the suite's default
 * resolves to English (`test/setup.ts` says so). A test that passed because
 * the default happened to be `pt-MZ` would fail the day the default changed,
 * for a reason with nothing to do with this page.
 *
 * The clock is pinned for the same class of reason: the page opens on
 * "today" when the URL carries no slot, and the fixture's only day is
 * 2026-09-04. Midday UTC rather than any other hour, so every device timezone
 * from UTC-11 to UTC+11 reads the same civil date off it.
 */
beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
  vi.setSystemTime(new Date(NOW));
});

afterEach(async () => {
  vi.useRealTimers();
  await i18n.changeLanguage("en-US");
});

describe("ChooseWhenPage", () => {
  it("keeps the chosen slot in the URL, not in memory", async () => {
    // The sign-in round trip leaves the app entirely. A choice held in
    // component state does not survive it, and the customer comes back to an
    // empty grid having already decided. This is also what makes a slot
    // linkable and a refresh harmless.
    const { router } = renderChooseWhen({ serviceId: "svc-1" });
    await userEvent.click(await screen.findByRole("button", { name: /09:00/ }));

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        // "Anyone available" was never chosen away from, so the start's own
        // roster resolves it — sorted, so the same click always picks the
        // same person even though the read model promises no order.
        memberId: "mem-1",
        startsAt: "2026-09-04T09:00:00.000Z",
      }),
    );
  });

  it("opens on the slot the URL already carries", async () => {
    // The other half of the rule above: a slot in the URL is a slot already
    // chosen, whether it got there by a link, a refresh, or a return from
    // sign-in.
    renderChooseWhen({
      serviceId: "svc-1",
      at: `/book/svc-1?memberId=mem-1&startsAt=${encodeURIComponent(NINE)}`,
    });

    expect(await screen.findByRole("button", { name: /09:00/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /10:00/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("sends an anonymous visitor to sign in and back to the same slot", async () => {
    const { router } = renderChooseWhen({ serviceId: "svc-1", session: null });
    await userEvent.click(await screen.findByRole("button", { name: /09:00/ }));
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    // `waitFor`, because the refusal travels a promise before the redirect
    // effect that reads it runs — the same await
    // `provider-detail-page.test.tsx` puts around the identical redirect.
    await waitFor(() => expect(router.state.location.pathname).toBe("/sign-in"));
    // `next`, not `redirect`: six call sites across this app already send a
    // way back under that name, and `sign-in.tsx` reads exactly that one.
    // The whole href travels, search parameters included, which is what
    // brings the customer back to the slot rather than to an empty grid.
    expect((router.state.location.search as { next?: string }).next).toContain(
      "startsAt=2026-09-04T09",
    );
  });

  it("shows the slot as gone when somebody else took it", async () => {
    // The command refuses with SLOT_ALREADY_TAKEN. Telling the customer
    // "something went wrong" would leave them clicking the same dead time.
    const { create } = renderChooseWhen({
      serviceId: "svc-1",
      createFails: { code: "SLOT_ALREADY_TAKEN" },
    });
    await userEvent.click(await screen.findByRole("button", { name: /09:00/ }));
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(await screen.findByText(/já foi marcada/i)).toBeInTheDocument();
    expect(create.refetched).toBe(true);
  });

  it("holds the slot with the time and nothing else, then moves on to step 2", async () => {
    // The shape of this call is the design: no address and no description,
    // because the customer has supplied neither and the slot has to be held
    // before they do. `toEqual`, not `toMatchObject` — an extra field here is
    // exactly the regression worth failing on.
    const { router, create } = renderChooseWhen({ serviceId: "svc-1" });
    await userEvent.click(await screen.findByRole("button", { name: /09:00/ }));
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/booking/bk-1/details"),
    );
    // **The booking id is the whole address.** Steps 2 and 3 read the service
    // and the package off `booking.byId`, which carries `serviceId` and
    // `serviceOptionId`, so a copy here would be a second source for one fact
    // — and the one a shared link can get wrong.
    expect(router.state.location.search).toEqual({});
    expect(create.calls).toEqual([
      {
        serviceOptionId: "opt-1",
        providerMemberId: "mem-1",
        startsAt: "2026-09-04T09:00:00.000Z",
        locale: "pt-MZ",
      },
    ]);
  });

  it("holds the package the customer chose, not the service's default", async () => {
    // The defect this closes: the chosen package used to be left on the
    // service page, and this one re-derived "marked default, else the first"
    // — so somebody who read 900 beside "Corte e barba", pressed the button
    // under that price, and confirmed here got a draft for the 500 one. It is
    // silent, it goes either way depending on which package carries the
    // default flag, and the price they agreed to is not the price the booking
    // carries.
    const { create } = renderChooseWhen({
      serviceId: "svc-1",
      at: "/book/svc-1?optionId=opt-2",
    });
    await userEvent.click(await screen.findByRole("button", { name: /09:00/ }));
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    await waitFor(() => expect(create.calls).toHaveLength(1));
    expect(create.calls[0]).toMatchObject({ serviceOptionId: "opt-2" });
  });

  it("quotes the package it is about to hold, so a substitution is never silent", async () => {
    // The other half of the same rule: whatever this page ends up booking,
    // it prints. That is what makes falling back to the default safe for a
    // link that names no option (or names one since deactivated) — the
    // customer sees the package and the price before they confirm, rather
    // than discovering the swap afterwards.
    renderChooseWhen({ serviceId: "svc-1", at: "/book/svc-1?optionId=opt-2" });
    // A regex, because the rail joins the package name and its length into
    // one line ("Corte e barba · 90 min") out of two text nodes.
    expect(await screen.findByText(/Corte e barba/)).toBeInTheDocument();
    expect(screen.getByText(/900/)).toBeInTheDocument();
    expect(screen.queryByText(/500/)).not.toBeInTheDocument();
  });

  it("keeps the chosen package when the customer picks a time", async () => {
    // Every slot rewrite replaces the whole search object, so an `optionId`
    // not carried through `goToSlot` is the same silent downgrade one click
    // later — green on arrival, wrong by the time anybody confirms.
    const { router } = renderChooseWhen({
      serviceId: "svc-1",
      at: "/book/svc-1?optionId=opt-2",
    });
    await userEvent.click(await screen.findByRole("button", { name: /09:00/ }));

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        optionId: "opt-2",
        memberId: "mem-1",
        startsAt: NINE,
      }),
    );
  });

  it("falls back to the default package for a link that names none", async () => {
    // The service row on a provider's page is handed a `ServiceDTO`, whose
    // `defaultOption` carries no id at all, so it genuinely cannot name one.
    // That link must still work.
    const { create } = renderChooseWhen({ serviceId: "svc-1" });
    await userEvent.click(await screen.findByRole("button", { name: /09:00/ }));
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    await waitFor(() => expect(create.calls).toHaveLength(1));
    expect(create.calls[0]).toMatchObject({ serviceOptionId: "opt-1" });
  });

  it("falls back rather than breaking when the named package no longer exists", async () => {
    // A bookmarked link whose option was deactivated since. Booking the
    // default is the recoverable answer, and honest because the rail names
    // what it is booking — see the quoting test above.
    const { create } = renderChooseWhen({
      serviceId: "svc-1",
      at: "/book/svc-1?optionId=opt-gone",
    });
    await userEvent.click(await screen.findByRole("button", { name: /09:00/ }));
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    await waitFor(() => expect(create.calls).toHaveLength(1));
    expect(create.calls[0]).toMatchObject({ serviceOptionId: "opt-1" });
  });

  it("shows a slot whose day rolls over in the service's zone, and lets it be held", async () => {
    // 23:00 UTC is 01:00 the next morning in Maputo. The page used to seed
    // the strip from the *device's* zone, so a customer on UTC arriving by
    // link — or coming back from sign-in, which is the whole reason the slot
    // lives in the URL — landed on the 4th while the service files the slot
    // under the 5th. The grid drew nothing at all, and the confirm sat
    // enabled over it, ready to hold a time the page was not showing.
    renderChooseWhen({
      serviceId: "svc-1",
      availability: crossZoneAvailability("svc-1"),
      at: `/book/svc-1?memberId=mem-1&startsAt=${encodeURIComponent(LATE)}`,
    });

    // Rendered in the service's zone, so 23:00 UTC reads as the 01:00 it is
    // to the provider and the customer standing in front of them.
    expect(await screen.findByRole("button", { name: /01:00/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /continuar/i })).toBeEnabled();
  });

  it("will not hold a time the grid is not showing", async () => {
    // A shared or bookmarked link naming a slot the provider has withdrawn.
    // The URL is the customer's claim about what they want; the grid is the
    // platform's answer about what exists, and the confirm follows the grid.
    renderChooseWhen({
      serviceId: "svc-1",
      at: "/book/svc-1?memberId=mem-1&startsAt=2026-09-04T17%3A00%3A00.000Z",
    });
    await screen.findByRole("button", { name: /09:00/ });
    expect(screen.getByRole("button", { name: /continuar/i })).toBeDisabled();
  });

  it("stops offering the refused time after somebody else takes it", async () => {
    // The second face of the same gap: the refetch drops the taken slot from
    // the grid, but `search.startsAt` still names it, so a confirm keyed off
    // the URL alone stayed live on the very time that had just been refused.
    const { rerenderWithout } = renderChooseWhen({
      serviceId: "svc-1",
      createFails: { code: "SLOT_ALREADY_TAKEN" },
    });
    await userEvent.click(await screen.findByRole("button", { name: /09:00/ }));
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(await screen.findByText(/já foi marcada/i)).toBeInTheDocument();

    // What the refetch comes back with: that start gone.
    rerenderWithout(NINE);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /09:00/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /continuar/i })).toBeDisabled();
  });

  it("builds the length ladder from the chosen package, not the default one", async () => {
    // Carried over from the reasoning that went with `toAvailabilityService`
    // when the sheet was deleted: somebody who chose a package with a
    // four-hour minimum must not be offered one-hour lengths because a
    // different package carries the default flag. Both other fixtures are
    // fixed-price with `minMinutes: null`, so nothing else in this file can
    // fail for it.
    renderChooseWhen({
      serviceId: "svc-1",
      service: hourlyService("svc-1"),
      availability: hourlyAvailability("svc-1"),
      at: "/book/svc-1?optionId=opt-2",
    });
    await userEvent.click(await screen.findByRole("button", { name: /09:00/ }));

    expect(await screen.findByRole("button", { name: "240 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "300 min" })).toBeInTheDocument();
    // The default package's own minimum, which this customer did not choose.
    expect(screen.queryByRole("button", { name: "60 min" })).not.toBeInTheDocument();
  });

  it("will not hold anything until a time has been chosen", async () => {
    renderChooseWhen({ serviceId: "svc-1" });
    expect(await screen.findByRole("button", { name: /continuar/i })).toBeDisabled();
  });

  it("says what happened when a hold ran out on a later step", async () => {
    renderChooseWhen({ serviceId: "svc-1", at: "/book/svc-1?expired=true" });
    expect(await screen.findByText(/a hora foi libertada/i)).toBeInTheDocument();
  });

  it("labels the roster with the service's own performer names, and numbers the rest", async () => {
    // Carried over from the deleted sheet's own test, which pinned this same
    // wiring: `availability.forService` answers "who is free" by id and never
    // by name, so a page that does not hand `MemberPicker` the names
    // `serviceById` publishes silently downgrades every performer to a
    // number. `mem-2` is deliberately left out of the list, because the
    // numbered fallback is a permanent answer for an id nothing can name —
    // not a loading state that a fuller list would eventually replace.
    renderChooseWhen({
      serviceId: "svc-1",
      performers: [{ id: "mem-1", firstName: "Ana", avatarUrl: null }],
    });
    expect(await screen.findByRole("radio", { name: "Ana" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Profissional 2" })).toBeInTheDocument();
  });

  it("never shows the customer a commission", async () => {
    // The commission comes out of the provider's payout, so a breakdown here
    // would invent a fee the customer is not being charged. The price shown
    // is the option's own amount, unaltered.
    renderChooseWhen({ serviceId: "svc-1" });
    await screen.findByRole("button", { name: /09:00/ });
    expect(screen.queryByText(/comiss/i)).not.toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument();
  });
});
