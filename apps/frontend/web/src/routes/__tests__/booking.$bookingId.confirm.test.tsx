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
import { widenAsyncTimeout } from "./route-suite-timeout";

// This file was the first route suite to go red on a loaded full run, and its
// per-call `SETTLES_IN` constant is what this replaces — one setting covering
// every wait, including the ones nobody has written yet. See
// `widenAsyncTimeout`.
widenAsyncTimeout();

/**
 * The route itself — the session guard, the remount key, and the fact that it
 * takes nothing from the URL but the booking id — driven through the real
 * `Route` rather than a stand-in.
 *
 * **A stand-in cannot fail for the route**, which is the lesson
 * `book.$serviceId.test.tsx` was written to record and
 * `booking.$bookingId.details.test.tsx` repeats: nothing in `src/` imports
 * this module except the generated tree, so `beforeLoad` could be deleted and
 * the page suite would stay green while step 3 rendered — and offered to send
 * a request — for a signed-out visitor.
 *
 * It lives under `src/routes/` because `boundaries/dependencies` forbids `ui`
 * importing `routes`, so this is the only layer that can hold both halves.
 */

const fakes = vi.hoisted(() => ({
  booking: null as unknown,
  addresses: [] as AddressDTO[],
  user: null as unknown,
  session: null as { user: { id: string } } | null,
  submitBooking: vi.fn(),
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
  submitBooking: fakes.submitBooking,
}));

vi.mock("@/features/account/data/address.repository", () => ({
  addressQueries: {
    mine: () => ({ queryKey: ["user", "addresses"], queryFn: async () => fakes.addresses }),
  },
  addAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn(),
}));

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

const { Route: ConfirmRoute } = await import("../booking.$bookingId.confirm");

const NOW = "2026-09-04T12:00:00.000Z";

/**
 * Typed as a whole `BookingDTO` rather than cast through `unknown` — the same
 * tightening follow-up #116 asks for in the page suites, and for the same
 * reason: a fixture the compiler does not check is one that goes on
 * describing a booking the API stopped returning.
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
    // **`at_provider`, which is deliberately not the branch the rail draws
    // its extra line from.** The rail prints "Deslocação — Incluída" only
    // where the *provider* travels — `at_customer` and `flexible` — so a
    // fixture on one of those could not tell a page that reads the booking
    // apart from one that hardcodes the interesting case, and neither could
    // it fail if the line stopped being conditional. The tests that want the
    // travel line override this to `at_customer`.
    locationType: "at_provider",
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

const ADDRESS: AddressDTO = {
  id: "addr-1",
  label: "Casa",
  country: "MZ",
  city: "Maputo",
  district: "Polana",
  line1: "Av. Julius Nyerere 1234",
  line2: null,
  postalCode: null,
  directions: null,
  latitude: null,
  longitude: null,
  isDefault: true,
};

/**
 * A router carrying the **real** route, parented exactly the way
 * `routeTree.gen.ts` parents it. The cast mirrors the generated file's own:
 * a file route's parent is supplied at generation time, and a test that wants
 * the real route has to supply it the same way.
 */
function renderRoute(
  at: string,
  {
    signedIn = true,
    status = "EXPIRED",
  }: { signedIn?: boolean; status?: BookingDTO["status"] } = {},
) {
  fakes.session = signedIn ? { user: { id: "cust-1" } } : null;
  fakes.addresses = [ADDRESS];
  fakes.user = USER;
  // Lapsed by default, so the cases about *where this route sends somebody it
  // cannot keep on the page* do not also depend on the form rendering.
  fakes.booking = bookingFixture(status);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const rootRoute = createRootRoute();
  (ConfirmRoute as unknown as { update: (options: unknown) => void }).update({
    id: "/booking/$bookingId/confirm",
    path: "/booking/$bookingId/confirm",
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
      ConfirmRoute as never,
      stub("/"),
      stub("/sign-in"),
      stub("/services"),
      stub("/bookings"),
      stub("/book/$serviceId"),
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

describe("the /booking/$bookingId/confirm route", () => {
  it("sends an anonymous visitor to sign in, and back here afterwards", async () => {
    // Sending a request is something a signed-in person does, and `submit`
    // refuses an anonymous caller anyway — so a page that rendered its send
    // button for one would be offering a control that can only fail. `next`
    // carries the whole href, so returning from sign-in lands on this booking
    // rather than on the home page.
    const { router } = renderRoute("/booking/bk-1/confirm", { signedIn: false });

    await waitFor(() => expect(router.state.location.pathname).toBe("/sign-in"));
    expect(router.state.location.search).toMatchObject({
      next: "/booking/bk-1/confirm",
    });
  });

  it("sends a lapsed draft back to step 1 on the booking's own service", async () => {
    // The route's end-to-end job: mount the page for this booking id, and let
    // it read where to send a customer whose hold is gone. The URL names only
    // the booking, so `svc-1` here can have come from nowhere but the row.
    const { router } = renderRoute("/booking/bk-1/confirm");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/book/svc-1");
      expect(router.state.location.search).toMatchObject({
        expired: true,
        optionId: "opt-2",
      });
    });
  });

  it("takes nothing from the URL but the booking id", async () => {
    // A shared or bookmarked link carrying its own `serviceId` would be a
    // second source for a fact the booking already knows, and nothing
    // compares the two — so a stale link could send a customer to a service
    // their booking was not for. The booking wins because it is the only
    // voice.
    const { router } = renderRoute("/booking/bk-1/confirm?serviceId=svc-999&optionId=opt-999");

    await waitFor(() => expect(router.state.location.pathname).toBe("/book/svc-1"));
    expect(router.state.location.search).toMatchObject({ optionId: "opt-2" });
  });

  it("starts a different booking over rather than carrying the last one's details", async () => {
    // The route keys the page by `bookingId`, and the page restores the
    // address and the note from a store keyed by that same id. Without the
    // key the router reuses one match across a param change and React
    // reconciles the same component instance — so one booking's note would
    // survive onto another's confirmation, which is precisely what keying the
    // store by booking exists to prevent.
    // The number rides with them: it is what step 2 collects now, and a store
    // entry without one sends this page straight back there rather than
    // rendering either note.
    sessionStorage.setItem(
      "ntizo.checkout.bk-1",
      JSON.stringify({
        addressId: "addr-1",
        description: "Portão azul",
        phoneNumber: "841234567",
      }),
    );
    sessionStorage.setItem(
      "ntizo.checkout.bk-2",
      JSON.stringify({
        addressId: "addr-1",
        description: "Terceiro andar",
        phoneNumber: "841234567",
      }),
    );
    const { router } = renderRoute("/booking/bk-1/confirm", { status: "DRAFT" });

    expect(await screen.findByText("Portão azul")).toBeInTheDocument();

    await router.navigate({
      to: "/booking/$bookingId/confirm",
      params: { bookingId: "bk-2" },
    });

    await waitFor(() => expect(screen.getByText("Terceiro andar")).toBeInTheDocument());
    expect(screen.queryByText("Portão azul")).not.toBeInTheDocument();
  });
});
