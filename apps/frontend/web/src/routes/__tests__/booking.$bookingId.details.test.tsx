import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { AddressDTO, CurrentUserDTO } from "@ntizo/shared";
import type { BookingDTO } from "@ntizo/shared/read-models";
import i18n from "@/shared/lib/i18n";

/**
 * The route itself — the session guard, the remount key, and the fact that it
 * takes nothing from the URL but the booking id — driven through the real
 * `Route` rather than a stand-in.
 *
 * **A stand-in cannot fail for the route**, which is the lesson
 * `book.$serviceId.test.tsx` was written to record: nothing in `src/` imports
 * this module except the generated tree, so `beforeLoad` could be deleted and
 * the page suite would stay green while step 2 rendered for a signed-out
 * visitor.
 *
 * It lives under `src/routes/` because `boundaries/dependencies` forbids `ui`
 * importing `routes`, so this is the only layer that can hold both halves.
 */
const fakes = vi.hoisted(() => ({
  booking: null as unknown,
  addresses: [] as AddressDTO[],
  user: null as unknown,
  session: null as { user: { id: string } } | null,
}));

vi.mock("@/features/checkout/data/checkout.repository", () => ({
  bookingQueries: {
    byId: (bookingId: string) => ({
      queryKey: ["booking", bookingId],
      // The id it answers with is the id it was asked for, because that is
      // what the server does: `findForCustomer` filters on the id *inside*
      // the query. A fake that always answered "bk-1" would let a page
      // reading `booking.id` look correct while addressing another booking's
      // stored details.
      queryFn: async () =>
        fakes.booking ? { ...(fakes.booking as object), id: bookingId } : null,
    }),
  },
  createBooking: vi.fn(),
}));

vi.mock("@/features/account/data/address.repository", () => ({
  addressQueries: {
    mine: () => ({ queryKey: ["user", "addresses"], queryFn: async () => fakes.addresses }),
  },
  addAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn(),
}));

vi.mock("@/features/account/data/cities.repository", () => ({
  cityQueries: {
    search: () => ({ queryKey: ["public", "cities"], queryFn: async () => [] }),
  },
}));

// The page reads the profile for the customer's name and for the number its
// phone field opens on; unmocked, that is a real request off a socket.
vi.mock("@/features/user/data/user.repository", () => ({
  userQueries: {
    me: () => ({ queryKey: ["user", "me"], queryFn: async () => fakes.user }),
  },
  updateMyProfile: vi.fn(),
}));

vi.mock("@/shared/lib/api/auth-client", () => ({
  API_BASE_URL: "http://localhost",
  authClient: { getSession: async () => ({ data: fakes.session }) },
}));

const { Route: DetailsRoute } = await import("../booking.$bookingId.details");

const NOW = "2026-09-04T12:00:00.000Z";

/**
 * Typed as a whole `BookingDTO` rather than cast through `unknown` — the same
 * tightening follow-up #116 asks for in the page suites, and for the same
 * reason: a fixture the compiler does not check is one that goes on
 * describing a booking the API stopped returning. This one had already
 * drifted — no `timezone`, no `providerRatingAverage` — and the page renders
 * both, so the drift would have shown up as `NaN` in the trust line.
 */
function bookingFixture(status: BookingDTO["status"]): BookingDTO {
  return {
    id: "bk-1",
    status,
    serviceId: "svc-1",
    serviceOptionId: "opt-2",
    serviceName: "Corte de cabelo",
    providerName: "Studio X",
    providerSlug: "studio-x",
    providerVerified: true,
    providerRatingAverage: 4.2,
    optionName: "Corte e barba",
    durationMinutes: 90,
    priceMinor: 90000,
    commissionBps: 1000,
    commissionMinor: 9000,
    currency: "MZN",
    startsAt: "2026-09-04T13:00:00.000Z",
    endsAt: "2026-09-04T14:30:00.000Z",
    timezone: "Africa/Maputo",
    addressLabel: null,
    addressLine: null,
    addressCity: null,
    addressDistrict: null,
    addressDirections: null,
    description: null,
    expiresAt: "2026-09-04T12:30:00.000Z",
    createdAt: NOW,
  };
}

/**
 * A router carrying the **real** route, parented exactly the way
 * `routeTree.gen.ts` parents it. The cast mirrors the generated file's own:
 * a file route's parent is supplied at generation time, and a test that wants
 * the real route has to supply it the same way.
 */
/** The signed-in customer, whole, so a field added to `user.me` breaks here too. */
const USER: CurrentUserDTO = {
  id: "cust-1",
  email: "cliente@ntizo.test",
  role: "customer",
  status: "active",
  createdAt: NOW,
  name: "Ana Cossa",
  firstName: "Ana",
  lastName: "Cossa",
  displayName: "Ana",
  avatarUrl: null,
  avatarKey: null,
  phoneNumber: null,
  bio: null,
  language: "pt-MZ",
  timezone: "Africa/Maputo",
  dateOfBirth: null,
  gender: null,
};

function renderRoute(
  at: string,
  {
    signedIn = true,
    status = "EXPIRED",
  }: { signedIn?: boolean; status?: BookingDTO["status"] } = {},
) {
  fakes.session = signedIn ? { user: { id: "cust-1" } } : null;
  fakes.addresses = [];
  fakes.user = USER;
  // Lapsed by default, so the cases about *where this route sends somebody it
  // cannot keep on the page* do not also depend on the form rendering.
  fakes.booking = bookingFixture(status);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const rootRoute = createRootRoute();
  (DetailsRoute as unknown as { update: (options: unknown) => void }).update({
    id: "/booking/$bookingId/details",
    path: "/booking/$bookingId/details",
    getParentRoute: () => rootRoute,
  });

  const stub = (path: string) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      validateSearch: (search: Record<string, unknown>) => search,
      component: () => <p>{path}</p>,
    });

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      DetailsRoute as never,
      stub("/"),
      stub("/sign-in"),
      stub("/services"),
      stub("/bookings"),
      stub("/book/$serviceId"),
      stub("/booking/$bookingId/confirm"),
    ]),
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [at] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );

  return { router };
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
  vi.setSystemTime(new Date(NOW));
  sessionStorage.clear();
});

afterEach(async () => {
  vi.useRealTimers();
  await i18n.changeLanguage("en-US");
});

describe("the /booking/$bookingId/details route", () => {
  it("sends a lapsed draft back to step 1 on the booking's own service", async () => {
    // The route's end-to-end job: mount the page for this booking id, and let
    // it read where to send a customer whose hold is gone. The URL names only
    // the booking, so `svc-1` here can have come from nowhere but the row.
    const { router } = renderRoute("/booking/bk-1/details");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/book/svc-1");
      expect(router.state.location.search).toMatchObject({
        expired: true,
        optionId: "opt-2",
      });
    });
  });

  it("takes nothing from the URL but the booking id", async () => {
    // The reason the search parameters were removed. A shared or bookmarked
    // link carrying its own `serviceId` used to be a second source for a fact
    // the booking already knows, and nothing compared the two — so a stale
    // link could send a customer to a service their booking was not for.
    // Now the booking wins because it is the only voice.
    const { router } = renderRoute("/booking/bk-1/details?serviceId=svc-999&optionId=opt-999");

    await waitFor(() => expect(router.state.location.pathname).toBe("/book/svc-1"));
    expect(router.state.location.search).toMatchObject({ optionId: "opt-2" });
  });

  it("sends an anonymous visitor to sign in, and back here afterwards", async () => {
    // The whole href, so returning from sign-in lands on this booking rather
    // than on the home page.
    const { router } = renderRoute("/booking/bk-1/details", { signedIn: false });

    await waitFor(() => expect(router.state.location.pathname).toBe("/sign-in"));
    expect(router.state.location.search).toMatchObject({
      next: "/booking/bk-1/details",
    });
  });

  it("starts a different booking over rather than carrying the last one's details", async () => {
    // The route keys the page by `bookingId`, and the page restores what the
    // customer typed from a store keyed by that same id. Without the key the
    // router reuses one match across a param change and React reconciles the
    // same component instance — so one booking's address and note would
    // survive onto another's page, which is precisely what keying the store
    // by booking exists to prevent.
    sessionStorage.setItem(
      "ntizo.checkout.bk-1",
      JSON.stringify({
        addressId: "addr-1",
        description: "Portão azul",
        phoneNumber: "841234567",
      }),
    );
    const { router } = renderRoute("/booking/bk-1/details", { status: "DRAFT" });

    expect(await screen.findByLabelText(/o que precisa de ser feito/i)).toHaveValue(
      "Portão azul",
    );

    await router.navigate({
      to: "/booking/$bookingId/details",
      params: { bookingId: "bk-2" },
    });

    // bk-2 has nothing stored, so the note starts empty rather than carrying
    // bk-1's.
    await waitFor(() =>
      expect(screen.getByLabelText(/o que precisa de ser feito/i)).toHaveValue(""),
    );
  });
});
