import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
import { widenAsyncTimeout } from "./route-suite-timeout";

// Route suites mount the router, resolve an async `beforeLoad` and settle at
// least one query before anything is assertable, and this one has gone red on
// a loaded full run for that reason alone. See `widenAsyncTimeout`.
widenAsyncTimeout();

/**
 * The route itself — `validateSearch`, the loader and the remount wrapper —
 * driven through the real `Route` object rather than a stand-in.
 *
 * **This file exists because a stand-in cannot fail for the route.** Every
 * other suite that renders this page builds its own permissive passthrough
 * `validateSearch`, and nothing in `src/` imports `routes/book.$serviceId`
 * except the generated tree — so `optionId` could be deleted from the real
 * narrowing and the whole web suite stayed green while production silently
 * reinstated the defect it was added to close: the `Link`'s `?optionId=opt-2`
 * stripped at validation, `chosenOption` falling back, and the customer who
 * pressed the button under 900 holding a draft for 500.
 *
 * It lives under `src/routes/` and not beside the page for a boundaries
 * reason as much as a tidiness one: `boundaries/dependencies` forbids `ui`
 * importing `routes`, and rightly. A `routes` element may import `ui`, so
 * this is the only layer that can hold both halves.
 */

const fakes = vi.hoisted(() => ({
  createBooking: vi.fn(),
  refetch: vi.fn(),
  prefetch: vi.fn(),
  availability: {} as Record<string, unknown>,
  service: null as ServiceDetailDTO | null,
}));

vi.mock("@/features/checkout/data/checkout.repository", () => ({
  createBooking: fakes.createBooking,
}));

vi.mock("@/features/directory/availability/viewmodel/use-service-availability", () => ({
  useServiceAvailability: () => ({ ...fakes.availability, refetch: fakes.refetch }),
}));

vi.mock("@/features/directory/services/viewmodel/use-service-detail", () => ({
  useServiceDetail: () => fakes.service,
  prefetchServiceDetail: fakes.prefetch,
}));

const { Route: BookRoute } = await import("../book.$serviceId");

const NOW = "2026-09-04T12:00:00.000Z";
const NINE = "2026-09-04T09:00:00.000Z";

function serviceFixture(id: string): ServiceDetailDTO {
  return {
    id,
    providerId: "prov-1",
    providerName: "Studio X",
    providerSlug: "studio-x",
    providerType: "organization",
    providerLogoUrl: null,
    providerVerified: true,
    providerRatingAverage: 4.8,
    providerCity: "Maputo",
    providerDistrict: null,
    categoryCode: "hair",
    categoryName: "Cabelo",
    name: `Serviço ${id}`,
    description: null,
    locationType: "at_provider",
    bookingMode: "priced",
    imageUrls: [],
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
  };
}

function availabilityFixture(serviceId: string): ServiceAvailabilityDTO {
  return {
    serviceId,
    timezone: "UTC",
    bookingMode: "priced",
    pricingMode: "fixed",
    memberIds: ["mem-1"],
    days: [
      {
        date: "2026-09-04",
        starts: [
          { minuteOfDay: 540, startsAt: NINE, maxMinutes: null, seatsLeft: 1, memberIds: ["mem-1"] },
        ],
      },
    ],
  };
}

/**
 * A router carrying the **real** route, parented exactly the way
 * `routeTree.gen.ts` parents it — `.update({ id, path, getParentRoute })`.
 * The cast mirrors the generated file's own, which uses `as any` for the
 * same call: a file route's parent is supplied at generation time, and a test
 * that wants the real route has to supply it the same way.
 */
function renderRoute(at: string) {
  fakes.service = serviceFixture("svc-1");
  fakes.availability = {
    data: availabilityFixture("svc-1"),
    isPending: false,
    isError: false,
    error: undefined,
  };
  fakes.refetch.mockClear();
  fakes.prefetch.mockClear();
  fakes.prefetch.mockResolvedValue(fakes.service);
  fakes.createBooking.mockReset();
  fakes.createBooking.mockResolvedValue({
    bookingId: "bk-1",
    expiresAt: "2026-09-04T12:30:00.000Z",
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const rootRoute = createRootRoute();
  (BookRoute as unknown as { update: (options: unknown) => void }).update({
    id: "/book/$serviceId",
    path: "/book/$serviceId",
    getParentRoute: () => rootRoute,
  });

  const stub = (path: string) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <p>{path}</p>,
    });

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      BookRoute as never,
      stub("/"),
      stub("/sign-in"),
      stub("/services"),
      stub("/services/$id"),
      stub("/providers/$slug"),
      stub("/booking/$bookingId/details"),
    ]),
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [at] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );

  return {
    router,
    heldOptionIds: () =>
      fakes.createBooking.mock.calls.map(
        (call) => (call[0] as { serviceOptionId: string }).serviceOptionId,
      ),
  };
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
  vi.setSystemTime(new Date(NOW));
});

afterEach(async () => {
  vi.useRealTimers();
  await i18n.changeLanguage("en-US");
});

describe("the /book/$serviceId route", () => {
  it("lets the chosen package through validation and all the way to the draft", async () => {
    // The one assertion that fails if `optionId` is dropped from the route's
    // own narrowing. Every other suite passes its own permissive
    // `validateSearch`, so this is the only place in the codebase where the
    // real one is load-bearing.
    const { heldOptionIds } = renderRoute("/book/svc-1?optionId=opt-2");

    await userEvent.click(await screen.findByRole("button", { name: /^09:00/ }));
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    await waitFor(() => expect(heldOptionIds()).toEqual(["opt-2"]));
  });

  it("reads `expired` off the URL as a string, since that is how a URL carries it", async () => {
    // The countdown navigates with a real boolean, but the browser hands the
    // value back as text on a reload or a shared link. Honouring only `true`
    // would make the message a thing that survives navigation and vanishes on
    // refresh.
    renderRoute("/book/svc-1?expired=true");
    expect(await screen.findByText(/a hora foi libertada/i)).toBeInTheDocument();
  });

  it("ignores an `expired` that is neither true nor \"true\"", async () => {
    renderRoute("/book/svc-1?expired=banana");
    await screen.findByRole("button", { name: /^09:00/ });
    expect(screen.queryByText(/a hora foi libertada/i)).not.toBeInTheDocument();
  });

  it("carries only its own parameters once the customer touches the page", async () => {
    // A match's search is `{ ...parentSearch, ...validated }` and the root
    // validates nothing, so an unknown key rides along in the URL on arrival
    // — that is the router's shape, not this route's business. What this
    // route does own is what it writes: the first slot rewrite replaces the
    // search wholesale, so the campaign tag is gone and the chosen package is
    // not.
    const { router } = renderRoute("/book/svc-1?optionId=opt-2&utm_source=whatsapp");
    await userEvent.click(await screen.findByRole("button", { name: /^09:00/ }));

    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        optionId: "opt-2",
        memberId: "mem-1",
        startsAt: NINE,
      }),
    );
  });

  it("primes the service through its loader rather than suspending mid-render", async () => {
    renderRoute("/book/svc-1");
    await screen.findByRole("button", { name: /^09:00/ });
    // `useServiceDetail` is a suspense query; without the loader the route
    // ships a fallback where a crawler and a customer both expect the page.
    expect(fakes.prefetch).toHaveBeenCalledWith(expect.anything(), "svc-1");
  });

  it("starts a different service over rather than carrying the last one's week", async () => {
    // The route keys the page by `serviceId`. Without that key the router
    // reuses one match across a param change, React reconciles the same
    // component instance, and the week somebody paged to for one service
    // greets them on another's calendar.
    const { router } = renderRoute("/book/svc-1");
    await screen.findByRole("button", { name: /^09:00/ });

    await userEvent.click(screen.getByRole("button", { name: /pr[óo]xima semana/i }));
    // Named in full, because a day card now announces its free-time count too
    // and a bare "11" would eventually match "11 livres" on somebody else's
    // date.
    const pagedAway = screen.getByRole("button", { name: /11 de setembro/i });
    expect(pagedAway).toHaveAttribute("aria-pressed", "true");

    await router.navigate({ to: "/book/$serviceId", params: { serviceId: "svc-2" } });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /4 de setembro/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });
});
